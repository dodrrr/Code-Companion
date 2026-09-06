import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDayStatus, normalizeChain, withChainScheduleRevision } from '../domain/chains.ts';
import { buildChainRhythm } from '../domain/rhythm.ts';
import { decodePlanStorage, decodeFocusLog } from '../domain/plan.ts';
import { createPlanStore, PLAN_STORAGE_KEY } from '../lib/planRepository.ts';
import { readRhythmHistory, LEGACY_FOCUS_LOG_KEY } from '../lib/rhythmRepository.ts';

const today = '2026-09-06';
const instant = '2026-09-06T17:30:00.000Z';
function chain(options = {}) {
  return withChainScheduleRevision(normalizeChain({
    id: 'chain', name: 'Read', color: '#00BF9B', createdAt: '2026-01-01', completedDates: [], minimumDates: [],
    frozenDates: [], restDays: [], cadence: 'daily', weeklyTarget: 3, completionTimes: {}, ...options,
  }), '2026-01-01');
}
function report(value, options = {}) { return buildChainRhythm(value, { periodDays: 7, referenceDate: today, ...options }); }
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  let fail = false;
  return {
    values,
    failNextSave() { fail = true; },
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) {
      if (fail && key === PLAN_STORAGE_KEY) { fail = false; throw new Error('disk full'); }
      values.set(key, value);
    },
    async getAllKeys() { return [...values.keys()]; },
  };
}
function plan(store, options = {}) { return createPlanStore({ storage: store, today: () => today, createId: () => 'generated', ...options }); }
const item = { id: 'focus-task', text: 'Read', planDate: today, timeSlot: '', completed: false, durationMinutes: 25, chainId: 'chain' };

test('check-in metadata keeps the local offset and ignores the device zone when reading', () => {
  const saved = applyDayStatus(chain(), today, 'done', '2026-09-07T00:30:00.000Z', 300).chain;
  assert.equal(saved.checkIns[today].retrospective, false);
  const result = report(saved);
  assert.equal(result.checkIns.sampleCount, 1);
  assert.equal(result.checkIns.buckets.find((bucket) => bucket.key === 'evening').count, 1);
});

test('Minimum upgrade is one check-in and undo removes both the status and metadata', () => {
  const minimum = applyDayStatus(chain(), today, 'minimum', instant, 0).chain;
  const done = applyDayStatus(minimum, today, 'done', '2026-09-06T19:00:00Z', 0).chain;
  assert.equal(report(done).counts.minimum, 0);
  assert.equal(report(done).counts.done, 1);
  assert.equal(report(done).checkIns.sampleCount, 1);
  const undone = applyDayStatus(done, today, 'missed', instant, 0).chain;
  assert.equal(undone.checkIns[today], undefined);
  assert.equal(report(undone).checkIns.sampleCount, 0);
  assert.equal(applyDayStatus(done, today, 'done', instant, 0).changed, false);
});

test('retrospective corrections improve counts but never contaminate check-in hour patterns', () => {
  const saved = applyDayStatus(chain(), '2026-09-05', 'minimum', instant, 0).chain;
  const result = report(saved);
  assert.equal(result.counts.minimum, 1);
  assert.equal(result.checkIns.retrospectiveCount, 1);
  assert.equal(result.checkIns.sampleCount, 0);
  assert.equal(result.checkIns.missingCount, 0);
});

test('legacy timestamps do not become invented local check-in samples', () => {
  const old = normalizeChain({ ...chain(), checkIns: undefined, completedDates: [today], completionTimes: { [today]: instant } });
  assert.equal(old.checkIns, undefined);
  assert.equal(report(old).checkIns.missingCount, 1);
  assert.equal(report(old).checkIns.sampleCount, 0);
});

test('invalid metadata cannot erase a valid completion or create a spurious sample', () => {
  const value = normalizeChain({ ...chain(), completedDates: [today], checkIns: { [today]: { status: 'done', recordedAt: 'broken', timezoneOffsetMinutes: 0, retrospective: false } } });
  assert.deepEqual(value.completedDates, [today]);
  assert.equal(report(value).checkIns.missingCount, 1);
});

test('daily adherence separates activity, Freeze, rest and the unfinished current day', () => {
  const value = chain({ completedDates: ['2026-08-31', '2026-09-05'], minimumDates: ['2026-09-01'], frozenDates: ['2026-09-02'], restDays: [6] });
  const result = report(value);
  assert.deepEqual(result.counts, { done: 2, minimum: 1, frozen: 1, rest: 0, missed: 2, open: 1 });
  assert.deepEqual(result.adherence, { unit: 'days', numerator: 2, denominator: 5, rate: 40 });
  assert.equal(report(applyDayStatus(value, today, 'done', instant, 0).chain).adherence.rate, 40);
});

test('new and not-yet-started Chains have no invented missed days or completion rate', () => {
  assert.equal(report(chain({ createdAt: today })).adherence.rate, null);
  const future = report(chain({ createdAt: '2026-09-10' }));
  assert.equal(future.days.length, 0);
  assert.equal(future.counts.missed, 0);
});

test('weekly adherence counts only full closed weeks and separates a partial starting week', () => {
  const value = chain({ cadence: 'weekly', createdAt: '2026-08-12', completedDates: [
    '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-24', '2026-09-01', '2026-09-02', '2026-09-03',
  ], frozenDates: ['2026-08-25'] });
  const result = report(value, { periodDays: 28 });
  assert.deepEqual(result.adherence, { unit: 'weeks', numerator: 1, denominator: 2, rate: 50 });
  assert.equal(result.weekly.currentProgress, 3);
  assert.equal(result.counts.missed, 0);
  assert.ok(result.days.some((day) => day.status === 'unlogged'));
});

test('weekly current progress never counts a future check-in', () => {
  const value = chain({ cadence: 'weekly', completedDates: ['2026-09-01', '2026-09-06'] });
  assert.equal(report(value, { referenceDate: '2026-09-02' }).weekly.currentProgress, 1);
});

test('changed schedules suppress an unfair overall rate and historical trends', () => {
  let value = chain({ completedDates: ['2026-08-31'] });
  value = withChainScheduleRevision({ ...value, restDays: [1] }, '2026-09-02');
  const result = report(value);
  assert.equal(result.scheduleChanged, true);
  assert.equal(result.adherence.rate, null);
  assert.equal(result.comparison, null);
});

test('unknown historical schedules are labelled and cannot produce a confident trend', () => {
  const value = { ...chain(), scheduleHistory: undefined };
  assert.equal(report(value).scheduleAssumption, true);
  assert.equal(report(value).comparison, null);
});

test('comparable daily windows require five due days in each and use equal calendar lengths', () => {
  const value = chain({ completedDates: ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'] });
  assert.deepEqual(report(value).comparison, { previousRate: 0, changePoints: 100 });
  assert.equal(report(chain({ createdAt: '2026-09-02' })).comparison, null);
  assert.equal(report(chain({ restDays: [0, 1, 2, 3, 4, 5] })).comparison, null);
});

test('hour labels need five valid observations and no tied peak', () => {
  let value = chain();
  for (const date of ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03']) value = applyDayStatus(value, date, 'done', `${date}T10:00:00Z`, 0).chain;
  assert.equal(report(value).checkIns.mostCommonLabel, null);
  value = applyDayStatus(value, '2026-09-04', 'done', '2026-09-04T10:00:00Z', 0).chain;
  assert.match(report(value).checkIns.mostCommonLabel, /Morning/);
});

test('Focus totals use timer measurements only, keep subminute precision and deduplicate occurrences', () => {
  const measured = { itemId: 'x', chainId: 'chain', date: today, minutes: 5 / 60, completedAt: instant, source: 'timer' };
  const legacy = { ...measured, itemId: 'old', minutes: 25, source: undefined };
  const result = report(chain(), { focusLog: [legacy, measured, measured] });
  assert.equal(result.focus.minutes, 5 / 60);
  assert.equal(result.focus.sessions, 1);
  assert.equal(result.focus.legacySessions, 1);
});

test('focus history and task completion commit together, including failure and retry', async () => {
  const saved = storage();
  const store = plan(saved);
  await store.forDate(today).write([item]);
  saved.failNextSave();
  await assert.rejects(store.completeFocus(today, item.id, 12, instant), /disk full/);
  let snapshot = await store.readSnapshot();
  assert.equal(snapshot.days[today][0].completed, false);
  assert.equal(snapshot.focusLog?.length ?? 0, 0);
  await store.completeFocus(today, item.id, 12, instant);
  await store.completeFocus(today, item.id, 999, '2026-09-06T18:00:00Z');
  snapshot = await store.readSnapshot();
  assert.equal(snapshot.days[today][0].completed, true);
  assert.equal(snapshot.focusLog.length, 1);
  assert.equal(snapshot.focusLog[0].minutes, 12);
  assert.equal(snapshot.focusLog[0].completedAt, instant);
});

test('reminder cancellation failure leaves neither a completion nor measured minutes', async () => {
  const store = plan(storage(), { cancelReminder: async () => { throw new Error('cancel failed'); } });
  await store.forDate(today).write([{ ...item, notificationId: 'reminder' }]);
  await assert.rejects(store.completeFocus(today, item.id, 5, instant), /cancel failed/);
  const snapshot = await store.readSnapshot();
  assert.equal(snapshot.days[today][0].completed, false);
  assert.equal(snapshot.focusLog?.length ?? 0, 0);
});

test('undo, task edits, removal and a new copied occurrence preserve measured focus history', async () => {
  const store = plan(storage());
  await store.forDate(today).write([item]);
  await store.completeFocus(today, item.id, 10, instant);
  await store.forDate(today).update((items) => items.map((entry) => ({ ...entry, completed: false, completedAt: undefined, chainId: 'new-chain' })));
  await store.completeFocus(today, item.id, 20, instant);
  await store.forDate(today).write([]);
  await store.forDate('2026-09-07').write([{ ...item, id: 'copy', planDate: '2026-09-07' }]);
  const snapshot = await store.readSnapshot();
  assert.equal(snapshot.focusLog.length, 1);
  assert.equal(snapshot.focusLog[0].chainId, 'chain');
  assert.equal(snapshot.focusLog[0].minutes, 10);
});

test('manually completed tasks cannot be reinterpreted as timed focus', async () => {
  const store = plan(storage());
  await store.forDate(today).write([{ ...item, completed: true, completedAt: instant }]);
  await store.completeFocus(today, item.id, 25, instant);
  assert.equal((await store.readSnapshot()).focusLog?.length ?? 0, 0);
});

test('concurrent Rhythm reads and Plan saves share one queue and cannot lose measured sessions', async () => {
  const saved = storage();
  const store = plan(saved);
  await store.forDate(today).write([item]);
  await Promise.all([store.completeFocus(today, item.id, 3, instant), readRhythmHistory(saved, store.readSnapshot), store.forDate('2026-09-07').write([{ ...item, id: 'next', planDate: '2026-09-07' }])]);
  const snapshot = await store.readSnapshot();
  assert.equal(snapshot.focusLog.length, 1);
  assert.equal(snapshot.days['2026-09-07'].length, 1);
});

test('history reads never materialize a missing recurring occurrence', async () => {
  const saved = storage();
  const store = plan(saved);
  await store.forDate(today).update(() => [{ ...item, repeatDays: [1] }], { editSeriesItemIds: [item.id] });
  const before = saved.values.get(PLAN_STORAGE_KEY);
  await readRhythmHistory(saved, store.readSnapshot);
  assert.equal(saved.values.get(PLAN_STORAGE_KEY), before);
  assert.equal((await store.readSnapshot()).days['2026-09-07'], undefined);
});

test('v1 Plan migrates without losing days or legacy focus bytes; future payloads block writes', async () => {
  const legacy = JSON.stringify([{ itemId: 'old', chainId: 'chain', date: today, minutes: 20, completedAt: instant }]);
  const saved = storage({ [PLAN_STORAGE_KEY]: JSON.stringify({ version: 1, data: { migrated: true, days: { [today]: [item] }, repeatRules: {} } }), [LEGACY_FOCUS_LOG_KEY]: legacy });
  const store = plan(saved);
  const history = await readRhythmHistory(saved, store.readSnapshot);
  assert.equal(history[0].source, 'legacy-unknown');
  assert.equal(saved.values.get(LEGACY_FOCUS_LOG_KEY), legacy);
  assert.equal(JSON.parse(saved.values.get(PLAN_STORAGE_KEY)).version, 2);
  const future = JSON.stringify({ version: 10, data: {} });
  saved.values.set(PLAN_STORAGE_KEY + ':backup', future);
  await assert.rejects(store.completeFocus(today, item.id, 10, instant), /newer/);
  assert.equal(saved.values.get(PLAN_STORAGE_KEY + ':backup'), future);
});

test('corrupt aggregate restores its backup while malformed focus children are refused', async () => {
  assert.equal(decodeFocusLog([{ itemId: 'x', chainId: 'c', date: today, minutes: Infinity, completedAt: instant }]), null);
  assert.equal(decodePlanStorage({ migrated: true, days: {}, repeatRules: {}, focusLog: [{ bad: true }] }), null);
  const good = JSON.stringify({ version: 2, data: { migrated: true, days: { [today]: [item] }, repeatRules: {}, focusLog: [] } });
  const saved = storage({ [PLAN_STORAGE_KEY]: '{broken', [PLAN_STORAGE_KEY + ':backup']: good });
  assert.equal((await plan(saved).readSnapshot()).days[today][0].id, item.id);
  assert.equal(saved.values.get(PLAN_STORAGE_KEY + ':backup'), good);
});

test('unreadable or future legacy focus history raises an error without rewriting the log', async () => {
  for (const raw of ['{broken', JSON.stringify({ version: 20, data: [] })]) {
    const saved = storage({ [LEGACY_FOCUS_LOG_KEY]: raw });
    await assert.rejects(readRhythmHistory(saved, plan(saved).readSnapshot), /history/);
    assert.equal(saved.values.get(LEGACY_FOCUS_LOG_KEY), raw);
  }
});

test('new history retains more than 500 measurements without trimming on read or write', async () => {
  const focusLog = Array.from({ length: 501 }, (_, i) => ({ itemId: `old-${i}`, chainId: 'chain', date: today, minutes: 1, completedAt: instant, source: 'timer' }));
  const saved = storage({ [PLAN_STORAGE_KEY]: JSON.stringify({ version: 2, data: { migrated: true, days: { [today]: [item] }, repeatRules: {}, focusLog } }) });
  const store = plan(saved);
  await store.completeFocus(today, item.id, 2, instant);
  assert.equal((await readRhythmHistory(saved, store.readSnapshot)).length, 502);
});

test('Rhythm date ranges are stable across daylight saving boundaries', () => {
  const value = chain({ createdAt: '2026-01-01', completedDates: ['2026-03-28', '2026-03-29', '2026-03-30'] });
  const result = report(value, { referenceDate: '2026-03-31' });
  assert.equal(result.startDate, '2026-03-25');
  assert.equal(result.days.length, 7);
  assert.equal(result.counts.done, 3);
});

test('a saved focus session may finish across midnight, with separate occurrence and recording dates', async () => {
  const store = plan(storage());
  const yesterday = '2026-09-05';
  await store.forDate(yesterday).write([{ ...item, planDate: yesterday }]);
  const savedSession = {
    version: 1, itemId: item.id, planDate: yesterday, targetSeconds: 25 * 60,
    accumulatedSeconds: 0, runningSince: Date.parse('2026-09-05T23:50:00Z'), updatedAt: Date.parse('2026-09-05T23:50:00Z'),
  };
  await store.completeFocus(yesterday, item.id, 20, '2026-09-06T00:10:00Z', savedSession);
  await store.completeFocus(yesterday, item.id, 20, '2026-09-06T00:10:00Z', savedSession);
  const snapshot = await store.readSnapshot();
  assert.equal(snapshot.days[yesterday][0].completed, true);
  assert.equal(snapshot.focusLog.length, 1);
  assert.equal(snapshot.focusLog[0].planDate, yesterday);
  assert.equal(snapshot.focusLog[0].date, today);
  assert.equal(snapshot.focusLog[0].minutes, 20);
});

test('a prior-day task cannot claim focus without a matching saved session or beyond its timer', async () => {
  const store = plan(storage());
  const yesterday = '2026-09-05';
  await store.forDate(yesterday).write([{ ...item, planDate: yesterday }]);
  await assert.rejects(store.completeFocus(yesterday, item.id, 10, instant), /Invalid/);
  const savedSession = { version: 1, itemId: item.id, planDate: yesterday, targetSeconds: 25 * 60, accumulatedSeconds: 120, updatedAt: Date.parse(instant) };
  await assert.rejects(store.completeFocus(yesterday, item.id, 10, instant, savedSession), /Invalid/);
  await assert.rejects(store.completeFocus('2026-09-04', item.id, 1, instant, { ...savedSession, planDate: '2026-09-04' }), /Invalid/);
  assert.equal((await store.readSnapshot()).focusLog?.length ?? 0, 0);
});
