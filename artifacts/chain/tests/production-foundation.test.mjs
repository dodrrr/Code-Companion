import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeChains } from '../domain/chains.ts';
import { decodePlanItems, getPlanNotificationIntent, resolvePlanForDate } from '../domain/plan.ts';
import { createVersionedRepository } from '../lib/versionedRepository.ts';

class MemoryStorage {
  values = new Map();
  async getItem(key) { return this.values.get(key) ?? null; }
  async setItem(key, value) { this.values.set(key, value); }
}

test('versioned repositories recover the last valid backup after corruption', async () => {
  const storage = new MemoryStorage();
  const repository = createVersionedRepository({
    storage,
    key: 'chains',
    version: 3,
    decode: decodeChains,
    empty: () => [],
  });
  const first = [{ id: '1', name: 'Read', color: '#f60', createdAt: '2026-08-01' }];
  const second = [{ id: '2', name: 'Run', color: '#0cf', createdAt: '2026-08-02' }];
  await repository.write(first);
  await repository.write(second);
  storage.values.set('chains', '{corrupt');

  const recovered = await repository.read();
  assert.equal(recovered[0].name, 'Read');
});

test('versioned plan repositories migrate legacy arrays without losing start reminders', async () => {
  const storage = new MemoryStorage();
  storage.values.set('plan', JSON.stringify([{ id: '1', text: 'Start', reminderMinutes: 0 }]));
  const repository = createVersionedRepository({
    storage,
    key: 'plan',
    version: 2,
    decode: (value) => decodePlanItems(value, '2026-08-10'),
    empty: () => [],
  });
  const items = await repository.read();
  assert.equal(items[0].reminderMinutes, 0);
  assert.equal(items[0].planDate, '2026-08-10');
});

test('tomorrow rollover adds recurring work once and resets volatile state', () => {
  const source = [{
    id: 'today-1', text: 'Gym', timeSlot: '7 AM', completed: true, completedAt: 'now',
    planDate: '2026-08-09', repeatDays: [1], notificationId: 'old', isPriority: true,
  }];
  const tomorrow = resolvePlanForDate([], source, '2026-08-10', () => 'tomorrow-1');
  const repeated = resolvePlanForDate(tomorrow, source, '2026-08-10', () => 'duplicate');

  assert.equal(tomorrow.length, 1);
  assert.equal(tomorrow[0].completed, false);
  assert.equal(tomorrow[0].notificationId, undefined);
  assert.equal(tomorrow[0].isPriority, false);
  assert.equal(repeated.length, 1);
});

test('notification actions route complete, snooze, open and invalid payloads deterministically', () => {
  const data = { planItemId: 'task', planDate: '2026-08-09' };
  assert.equal(getPlanNotificationIntent('chain_task_done', data), 'complete');
  assert.equal(getPlanNotificationIntent('chain_task_snooze', data), 'snooze');
  assert.equal(getPlanNotificationIntent('chain_task_open', data), 'open');
  assert.equal(getPlanNotificationIntent('chain_task_done', {}), 'ignore');
  assert.equal(getPlanNotificationIntent('default', { openPlan: true }), 'open');
});
