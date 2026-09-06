import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlanStore, PLAN_STORAGE_KEY } from '../lib/planRepository.ts';
import { decodePlanStorage } from '../domain/plan.ts';

const monday = '2026-09-07';
const wednesday = '2026-09-09';
const friday = '2026-09-11';
const task = (date = monday, extra = {}) => ({ id: 'read', text: 'Read', timeSlot: '8 PM', completed: false, planDate: date, repeatDays: [1, 3, 5], ...extra });
function setup(initial = {}, cancelReminder = async () => {}) {
  const values = new Map(Object.entries(initial));
  let clock = monday;
  let sequence = 0;
  let failWrite = false;
  const storage = {
    async getItem(key) { return values.get(key) ?? null; },
    async getAllKeys() { return [...values.keys()]; },
    async setItem(key, value) {
      if (failWrite && key === PLAN_STORAGE_KEY) { failWrite = false; throw new Error('disk full'); }
      values.set(key, value);
    },
  };
  const open = () => createPlanStore({ storage, today: () => clock, createId: () => `generated-${++sequence}`, cancelReminder });
  return { values, open, store: open(), setToday: (date) => { clock = date; }, failNextWrite: () => { failWrite = true; } };
}
async function seed(env, item = task()) {
  return env.store.forDate(item.planDate).update(() => [item], { editSeriesItemIds: [item.id] });
}
const envelope = (data, version = 2) => JSON.stringify({ version, data });

test('Repeat survives restart and skipped days without visiting Tomorrow', async () => {
  const env = setup();
  await seed(env);
  env.setToday(wednesday);
  const repo = env.open().forDate(wednesday);
  const [item] = await repo.read();
  assert.equal(item.text, 'Read');
  assert.equal(item.repeatSourceId, 'read');
  assert.equal(item.completed, false);
  assert.equal(item.repeatGenerated, true);
  assert.equal((await repo.read()).length, 1);
  env.setToday(friday);
  assert.equal((await env.open().forDate(friday).read()).length, 1);
});

test('Repeated tasks clear completion, priority and unscheduled reminder metadata', async () => {
  const env = setup();
  await seed(env, task(monday, { completed: true, completedAt: 'saved-time', isPriority: true, notificationId: 'existing', reminderMinutes: 15, chainId: 'chain', durationMinutes: 30, color: '#ff0000' }));
  const [item] = await env.store.forDate(wednesday).read();
  assert.equal(item.completed, false);
  assert.equal(item.completedAt, undefined);
  assert.equal(item.isPriority, false);
  assert.equal(item.notificationId, undefined);
  assert.equal(item.reminderMinutes, undefined);
  assert.equal(item.chainId, 'chain');
  assert.equal(item.durationMinutes, 30);
  assert.equal(item.color, '#ff0000');
});

test('Deleting an occurrence persists an exception but leaves later repeats', async () => {
  const env = setup();
  await seed(env);
  await env.store.forDate(wednesday).update(() => []);
  assert.deepEqual(await env.open().forDate(wednesday).read(), []);
  assert.equal((await env.open().forDate(friday).read()).length, 1);
});

test('Series edits update pending future instances while preserving completed history', async () => {
  const env = setup();
  await seed(env);
  const [wed] = await env.store.forDate(wednesday).read();
  await env.store.forDate(friday).update((items) => items.map((item) => ({ ...item, completed: true, completedAt: 'saved' })));
  await env.store.forDate(wednesday).update((items) => items.map((item) => ({ ...item, text: 'Read chapters', timeSlot: '9 PM' })), { editSeriesItemIds: [wed.id] });
  assert.equal((await env.store.forDate(monday).read())[0].text, 'Read');
  assert.equal((await env.store.forDate(friday).read())[0].text, 'Read');
  assert.equal((await env.store.forDate('2026-09-14').read())[0].text, 'Read chapters');
});

test('Stopping Repeat removes generated future tasks, preserves manually copied tasks and cancels their removed reminders', async () => {
  const cancelled = [];
  const env = setup({}, async (id) => { cancelled.push(id); });
  await seed(env);
  await env.store.forDate(wednesday).update((items) => items.map((item) => ({ ...item, notificationId: 'wed-reminder', reminderMinutes: 15 })));
  await env.store.forDate(friday).update((items) => items.map((item) => ({ ...item, repeatGenerated: false })));
  await env.store.forDate(monday).update((items) => items.map((item) => ({ ...item, repeatDays: [] })), { editSeriesItemIds: ['read'] });
  assert.deepEqual(await env.open().forDate(wednesday).read(), []);
  assert.equal((await env.open().forDate(friday).read()).length, 1);
  assert.deepEqual(await env.open().forDate('2026-09-14').read(), []);
  assert.deepEqual(cancelled, ['wed-reminder']);
});

test('Failure to cancel a reminder aborts the series change', async () => {
  const env = setup({}, async () => { throw new Error('native failure'); });
  await seed(env);
  await env.store.forDate(wednesday).update((items) => items.map((item) => ({ ...item, notificationId: 'wed-reminder' })));
  await assert.rejects(env.store.forDate(monday).update((items) => items.map((item) => ({ ...item, repeatDays: [] })), { editSeriesItemIds: ['read'] }), /native failure/);
  assert.equal((await env.store.forDate(wednesday).read())[0].notificationId, 'wed-reminder');
  assert.equal((await env.store.forDate(friday).read()).length, 1);
});

test('A failed save preserves the rule and repairs metadata for a cancelled reminder', async () => {
  const cancelled = [];
  const env = setup({}, async (id) => { cancelled.push(id); });
  await seed(env);
  await env.store.forDate(wednesday).update((items) => items.map((item) => ({ ...item, notificationId: 'wed-reminder', reminderMinutes: 15 })));
  env.failNextWrite();
  await assert.rejects(env.store.forDate(monday).update((items) => items.map((item) => ({ ...item, repeatDays: [] })), { editSeriesItemIds: ['read'] }), /disk full/);
  const [preserved] = await env.store.forDate(wednesday).read();
  assert.equal(preserved.text, 'Read');
  assert.equal(preserved.notificationId, undefined);
  assert.equal(preserved.reminderMinutes, undefined);
  assert.equal((await env.store.forDate(friday).read()).length, 1);
  assert.deepEqual(cancelled, ['wed-reminder']);
});

test('Concurrent writes across dates do not overwrite each other', async () => {
  const env = setup();
  await seed(env);
  await Promise.all([
    env.store.forDate(wednesday).update((items) => items.map((item) => ({ ...item, completed: true }))),
    env.store.forDate(friday).update((items) => [...items, task(friday, { id: 'extra', repeatDays: undefined })]),
  ]);
  assert.equal((await env.store.forDate(wednesday).read())[0].completed, true);
  assert.equal((await env.store.forDate(friday).read()).length, 2);
});

test('Migration preserves all saved days and original bytes; only current unambiguous rules start', async () => {
  const historical = task('2026-08-01', { id: 'old', notificationId: 'history', completed: true });
  const current = task();
  const initial = { '@chain_plan_2026-08-01': envelope([historical]), [`@chain_plan_${monday}`]: envelope([current]) };
  const env = setup(initial);
  await env.store.forDate(monday).read();
  for (const [key, value] of Object.entries(initial)) assert.equal(env.values.get(key), value);
  assert.equal((await env.store.forDate('2026-08-01').read())[0].notificationId, 'history');
  const state = JSON.parse(env.values.get(PLAN_STORAGE_KEY)).data;
  assert.deepEqual(Object.keys(state.repeatRules), ['read']);
  assert.equal((await env.open().forDate(wednesday).read()).length, 1);
});

test('Conflicting legacy Repeat settings are preserved without guessing a rule', async () => {
  const env = setup({
    [`@chain_plan_${monday}`]: envelope([task()]),
    '@chain_plan_2026-09-08': envelope([task('2026-09-08', { id: 'copied', repeatSourceId: 'read', repeatDays: [2, 4] })]),
  });
  await env.store.forDate(monday).read();
  assert.deepEqual(JSON.parse(env.values.get(PLAN_STORAGE_KEY)).data.repeatRules, {});
  assert.equal((await env.store.forDate('2026-09-08').read())[0].repeatDays.length, 2);
});

test('Corrupt legacy primary uses a valid backup; future versions are never overwritten', async () => {
  const env = setup({ [`@chain_plan_${monday}`]: 'broken', [`@chain_plan_${monday}:backup`]: envelope([task()]) });
  assert.equal((await env.store.forDate(monday).read())[0].text, 'Read');
  assert.equal(env.values.get(`@chain_plan_${monday}`), 'broken');
  const future = setup({ [`@chain_plan_${monday}`]: envelope([task()], 3), [`@chain_plan_${monday}:backup`]: envelope([task()]) });
  await assert.rejects(future.store.forDate(monday).read(), /newer app version/);
  assert.equal(future.values.has(PLAN_STORAGE_KEY), false);
});

test('Unreadable historical data blocks migration without silently losing a day', async () => {
  const env = setup({ '@chain_plan_2026-08-01': '[null]', [`@chain_plan_${monday}`]: envelope([task()]) });
  await assert.rejects(env.store.forDate(monday).read(), /could not be safely read/);
  assert.equal(env.values.has(PLAN_STORAGE_KEY), false);
  assert.equal(env.values.get('@chain_plan_2026-08-01'), '[null]');
});

test('Failed first migration retries safely and never removes legacy records', async () => {
  const raw = envelope([task()]);
  const env = setup({ [`@chain_plan_${monday}`]: raw });
  env.failNextWrite();
  await assert.rejects(env.store.forDate(monday).read(), /disk full/);
  assert.equal(env.values.has(PLAN_STORAGE_KEY), false);
  assert.equal((await env.open().forDate(monday).read()).length, 1);
  assert.equal(env.values.get(`@chain_plan_${monday}`), raw);
});

test('Aggregate corruption recovers backup; an unsupported aggregate is refused', async () => {
  const env = setup();
  await seed(env);
  await env.store.forDate(wednesday).read();
  env.values.set(PLAN_STORAGE_KEY, 'corrupt');
  assert.equal((await env.open().forDate(wednesday).read()).length, 1);
  env.values.set(`${PLAN_STORAGE_KEY}:backup`, envelope({}, 99));
  await assert.rejects(env.open().forDate(friday).read(), /newer app version/);
  assert.equal(JSON.parse(env.values.get(`${PLAN_STORAGE_KEY}:backup`)).version, 99);
});

test('Historical reads do not invent missed tasks and malformed aggregate children fail closed', async () => {
  const env = setup();
  await seed(env);
  env.setToday(friday);
  assert.deepEqual(await env.open().forDate(wednesday).read(), []);
  assert.equal(decodePlanStorage({ migrated: true, days: { [monday]: [null] }, repeatRules: {} }), null);
  assert.throws(() => env.store.forDate('2026-02-30'), /Invalid Plan date/);
});

test('Editing time updates an already materialized pending occurrence and cancels its obsolete reminder', async () => {
  const cancelled = [];
  const env = setup({}, async (id) => { cancelled.push(id); });
  await seed(env);
  await env.store.forDate(wednesday).update((items) => items.map((item) => ({ ...item, notificationId: 'old-time', reminderMinutes: 15 })));
  await env.store.forDate(monday).update((items) => items.map((item) => ({ ...item, timeSlot: '9 PM' })), { editSeriesItemIds: ['read'] });
  const [next] = await env.open().forDate(wednesday).read();
  assert.equal(next.timeSlot, '9 PM');
  assert.equal(next.notificationId, undefined);
  assert.deepEqual(cancelled, ['old-time']);
});

test('A copied occurrence replaces the generated destination without creating a duplicate on reload', async () => {
  const env = setup();
  const [source] = await seed(env);
  const copied = { ...source, id: 'manual-copy', planDate: wednesday, repeatGenerated: false };
  await env.store.forDate(wednesday).update((items) => [
    ...items.filter((item) => !(item.repeatSourceId === copied.repeatSourceId && item.repeatGenerated && !item.completed)),
    copied,
  ]);
  const destination = await env.open().forDate(wednesday).read();
  assert.equal(destination.length, 1);
  assert.equal(destination[0].id, 'manual-copy');
  assert.equal((await env.open().forDate(monday).read()).length, 1);
  assert.equal((await env.open().forDate(friday).read()).length, 1);
});
