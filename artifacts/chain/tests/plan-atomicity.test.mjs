import assert from 'node:assert/strict';
import test from 'node:test';

import { decodePlanItems, resolvePlanForDate } from '../domain/plan.ts';
import { createVersionedRepository } from '../lib/versionedRepository.ts';

function memoryStorage() {
  const values = new Map();
  return {
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
  };
}

const task = {
  id: 'task-1',
  text: 'Read',
  timeSlot: '8 PM',
  completed: false,
  planDate: '2026-08-30',
};

test('concurrent semantic Plan updates preserve completion and reminder metadata', async () => {
  const repository = createVersionedRepository({
    storage: memoryStorage(),
    key: '@plan',
    version: 2,
    decode: (value) => decodePlanItems(value, task.planDate),
    empty: () => [],
  });
  await repository.write([task]);

  await Promise.all([
    repository.update((current) => current.map((item) => (
      item.id === task.id ? { ...item, completed: true, completedAt: '2026-08-30T20:30:00.000Z' } : item
    ))),
    repository.update((current) => current.map((item) => (
      item.id === task.id ? { ...item, reminderMinutes: 15, notificationId: 'notification-1' } : item
    ))),
  ]);

  const [persisted] = await repository.read();
  assert.equal(persisted.completed, true);
  assert.equal(persisted.reminderMinutes, 15);
  assert.equal(persisted.notificationId, 'notification-1');
});

test('recurring Plan copies do not claim an unscheduled reminder', () => {
  const [repeated] = resolvePlanForDate(
    [],
    [{ ...task, reminderMinutes: 15, notificationId: 'old-notification', repeatDays: [1] }],
    '2026-08-31',
    () => 'repeat-1',
  );

  assert.equal(repeated.reminderMinutes, undefined);
  assert.equal(repeated.notificationId, undefined);
});

test('completion and reminder cleanup are persisted as one Plan mutation', async () => {
  const repository = createVersionedRepository({
    storage: memoryStorage(),
    key: '@plan-completion',
    version: 2,
    decode: (value) => decodePlanItems(value, task.planDate),
    empty: () => [],
  });
  await repository.write([{ ...task, reminderMinutes: 15, notificationId: 'notification-1' }]);

  await repository.update((current) => current.map((item) => (
    item.id === task.id
      ? {
          ...item,
          completed: true,
          completedAt: '2026-08-30T20:30:00.000Z',
          reminderMinutes: undefined,
          notificationId: undefined,
        }
      : item
  )));

  const [persisted] = await repository.read();
  assert.equal(persisted.completed, true);
  assert.equal(persisted.reminderMinutes, undefined);
  assert.equal(persisted.notificationId, undefined);
});

test('a failed reminder cancellation precondition aborts Plan completion', async () => {
  const repository = createVersionedRepository({
    storage: memoryStorage(),
    key: '@plan-cancel-before-completion',
    version: 2,
    decode: (value) => decodePlanItems(value, task.planDate),
    empty: () => [],
  });
  await repository.write([{ ...task, reminderMinutes: 15, notificationId: 'notification-1' }]);

  await assert.rejects(
    repository.update(async (current) => {
      await Promise.reject(new Error('native cancellation failed'));
      return current.map((item) => item.id === task.id ? { ...item, completed: true } : item);
    }),
    /native cancellation failed/,
  );

  const [persisted] = await repository.read();
  assert.equal(persisted.completed, false);
  assert.equal(persisted.reminderMinutes, 15);
  assert.equal(persisted.notificationId, 'notification-1');
});
