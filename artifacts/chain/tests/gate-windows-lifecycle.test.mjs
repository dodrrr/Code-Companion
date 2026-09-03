import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canToggleGateWindowSkip,
  decodeGateWindowsState,
  emptyGateWindowsState,
  endGateWindowOnDemand,
  getGateWindowStatus,
  getGateWindowDayMinutesFromState,
  getGateWindowWeekMinutesFromState,
  startGateWindowOnDemand,
  syncGateWindowProgress,
  toggleGateWindowSkipToday,
  transitionGateWindowsState,
} from '../domain/gateWindows.ts';
import { createVersionedRepository } from '../lib/versionedRepository.ts';

const makeWindow = (overrides = {}) => ({
  id: 'deep-work',
  name: 'Deep Work',
  startHour: 22,
  startMinute: 0,
  endHour: 2,
  endMinute: 0,
  days: [1],
  appIds: ['social'],
  mode: 'scheduled',
  protectedMinutesByDate: {},
  ...overrides,
});

test('an open-ended on-demand Window remains active across local midnight and records both days', () => {
  const startedAt = new Date(2026, 7, 31, 23, 40, 0);
  const afterMidnight = new Date(2026, 8, 1, 0, 10, 0);
  const endedAt = new Date(2026, 8, 1, 0, 25, 0);
  const started = startGateWindowOnDemand(makeWindow({ mode: 'onDemand', onDemandDurationMinutes: null }), startedAt);

  const status = getGateWindowStatus(started, afterMidnight);
  assert.equal(status.active, true);
  assert.equal(status.elapsedSeconds, 30 * 60);
  assert.equal(status.protectedMinutesToday, 10);

  const ended = endGateWindowOnDemand(started, endedAt);
  assert.equal(ended.manualDate, '2026-08-31');
  assert.equal(ended.manualActive, false);
  assert.deepEqual(ended.protectedMinutesByDate, {
    '2026-08-31': 20,
    '2026-09-01': 25,
  });
});

test('a bounded on-demand Window uses its activation timestamp after midnight', () => {
  const startedAt = new Date(2026, 7, 31, 23, 40, 0);
  const started = startGateWindowOnDemand(makeWindow({ mode: 'onDemand', onDemandDurationMinutes: 60 }), startedAt);

  const active = getGateWindowStatus(started, new Date(2026, 8, 1, 0, 10, 0));
  assert.equal(active.active, true);
  assert.equal(active.remainingSeconds, 30 * 60);
  assert.equal(active.protectedMinutesToday, 10);

  const complete = getGateWindowStatus(started, new Date(2026, 8, 1, 0, 41, 0));
  assert.equal(complete.active, false);
  assert.equal(complete.completedToday, true);
  assert.equal(complete.protectedMinutesToday, 40);
});

test('sync reconstructs every local-day segment when a bounded session finishes after midnight', () => {
  const startedAt = new Date(2026, 7, 31, 23, 40, 0);
  const started = startGateWindowOnDemand(makeWindow({ mode: 'onDemand', onDemandDurationMinutes: 60 }), startedAt);
  const [synced] = syncGateWindowProgress([started], new Date(2026, 8, 1, 0, 41, 0));

  assert.deepEqual(synced.protectedMinutesByDate, {
    '2026-08-31': 20,
    '2026-09-01': 40,
  });
});

test('skipping a cross-midnight scheduled Window follows the occurrence start date', () => {
  const mondayNight = new Date(2026, 7, 31, 23, 0, 0);
  const tuesdayMorning = new Date(2026, 8, 1, 1, 0, 0);
  const window = makeWindow();

  const skipped = toggleGateWindowSkipToday(window, mondayNight);
  assert.equal(skipped.skippedOccurrenceDate, '2026-08-31');
  assert.deepEqual(getGateWindowStatus(skipped, tuesdayMorning), {
    active: false,
    manual: false,
    scheduledToday: true,
    skippedToday: true,
    completedToday: false,
    remainingMinutes: 0,
    remainingSeconds: 0,
    elapsedSeconds: 0,
    unbounded: false,
    protectedMinutesToday: 0,
  });

  const restored = toggleGateWindowSkipToday(skipped, tuesdayMorning);
  assert.equal(restored.skippedOccurrenceDate, undefined);
  assert.equal(getGateWindowStatus(restored, tuesdayMorning).active, true);

  const afterSkippedEnd = getGateWindowStatus(skipped, new Date(2026, 8, 1, 3, 0, 0));
  assert.equal(afterSkippedEnd.completedToday, false);
  assert.equal(afterSkippedEnd.protectedMinutesToday, 0);
  assert.equal(canToggleGateWindowSkip(makeWindow({ days: [] }), new Date(2026, 8, 1, 3, 0, 0)), false);
});

test('a completed same-day occurrence cannot be skipped retroactively', () => {
  const window = makeWindow({ startHour: 9, endHour: 11, days: [1] });
  assert.equal(canToggleGateWindowSkip(window, new Date(2026, 7, 31, 8, 30, 0)), true);
  assert.equal(canToggleGateWindowSkip(window, new Date(2026, 7, 31, 11, 0, 0)), false);
  assert.equal(canToggleGateWindowSkip(window, new Date(2026, 7, 31, 18, 0, 0)), false);
});

test('a scheduled preview never records protection before the native bridge exists', () => {
  const window = makeWindow({ startHour: 9, endHour: 11, days: [1] });
  const duringSchedule = new Date(2026, 7, 31, 10, 0, 0);
  const status = getGateWindowStatus(window, duringSchedule);

  assert.equal(status.active, true);
  assert.equal(status.elapsedSeconds, 60 * 60);
  assert.equal(status.protectedMinutesToday, 0);
  assert.equal(syncGateWindowProgress([window], duringSchedule)[0], window);
});

test('legacy Window arrays decode and deleted Window observations move into history', () => {
  const legacy = [makeWindow({
    protectedMinutesByDate: {
      '2026-08-31': 20,
      '2026-09-01': 25,
    },
  })];
  const decoded = decodeGateWindowsState(legacy);
  assert.ok(decoded);
  assert.equal(decoded.windows.length, 1);
  assert.deepEqual(decoded.archivedMinutesByWindow, {});

  const afterDelete = transitionGateWindowsState(decoded, []);
  assert.equal(afterDelete.windows.length, 0);
  assert.deepEqual(afterDelete.archivedMinutesByWindow, {
    'deep-work': {
      '2026-08-31': 20,
      '2026-09-01': 25,
    },
  });
  assert.equal(
    getGateWindowWeekMinutesFromState([], afterDelete.archivedMinutesByWindow, new Date(2026, 8, 2, 12)),
    45,
  );
  assert.equal(
    getGateWindowDayMinutesFromState([], afterDelete.archivedMinutesByWindow, new Date(2026, 8, 1, 12)),
    25,
  );
});

test('normalization rejects invalid records, calendar keys and negative timestamps independently', () => {
  const decoded = decodeGateWindowsState({
    windows: [
      makeWindow({ id: '   ' }),
      makeWindow({
        id: ' valid ',
        manualDate: '2026-02-30',
        skippedOccurrenceDate: 'not-a-date',
        manualActivatedAt: -1,
        manualEndedAt: Number.POSITIVE_INFINITY,
        protectedMinutesByDate: {
          '2026-02-30': 50,
          '2026-02-28': 25,
        },
      }),
    ],
    archivedMinutesByWindow: {
      '': { '2026-02-28': 99 },
      removed: { invalid: 80, '2026-02-28': 15 },
    },
  });

  assert.ok(decoded);
  assert.equal(decoded.windows.length, 1);
  assert.equal(decoded.windows[0].id, 'valid');
  assert.equal(decoded.windows[0].manualDate, undefined);
  assert.equal(decoded.windows[0].skippedOccurrenceDate, undefined);
  assert.equal(decoded.windows[0].manualActivatedAt, undefined);
  assert.equal(decoded.windows[0].manualEndedAt, undefined);
  assert.deepEqual(decoded.windows[0].protectedMinutesByDate, { '2026-02-28': 25 });
  assert.deepEqual(decoded.archivedMinutesByWindow, { removed: { '2026-02-28': 15 } });
});

test('normalization keeps only state that belongs to the selected Window mode', () => {
  const decoded = decodeGateWindowsState([
    makeWindow({
      manualActive: false,
      manualDate: '2026-08-31',
      manualActivatedAt: 100,
      manualEndedAt: 200,
      manualSessionBaselineByDate: { '2026-08-31': 5 },
      onDemandDurationMinutes: 90,
    }),
    makeWindow({
      id: 'on-demand',
      mode: 'onDemand',
      skippedOccurrenceDate: '2026-08-31',
      onDemandDurationMinutes: null,
    }),
  ]);

  assert.ok(decoded);
  const scheduled = decoded.windows[0];
  assert.equal(scheduled.skippedOccurrenceDate, '2026-08-31');
  assert.equal(scheduled.manualActive, undefined);
  assert.equal(scheduled.manualDate, undefined);
  assert.equal(scheduled.manualActivatedAt, undefined);
  assert.equal(scheduled.manualEndedAt, undefined);
  assert.equal(scheduled.manualSessionBaselineByDate, undefined);
  assert.equal(scheduled.onDemandDurationMinutes, undefined);
  assert.equal(decoded.windows[1].skippedOccurrenceDate, undefined);
  assert.equal(decoded.windows[1].onDemandDurationMinutes, null);
});

test('versioned Gate Window state recovers its last valid backup after corruption', async () => {
  class MemoryStorage {
    values = new Map();
    async getItem(key) { return this.values.get(key) ?? null; }
    async setItem(key, value) { this.values.set(key, value); }
  }

  const storage = new MemoryStorage();
  const repository = createVersionedRepository({
    storage,
    key: 'gate-windows',
    version: 2,
    decode: decodeGateWindowsState,
    empty: emptyGateWindowsState,
  });
  const first = { windows: [makeWindow()], archivedMinutesByWindow: {} };
  const second = { windows: [makeWindow({ name: 'Evening Work' })], archivedMinutesByWindow: {} };
  await repository.write(first);
  await repository.write(second);
  storage.values.set('gate-windows', '{corrupt');

  const recovered = await repository.read();
  assert.equal(recovered.windows[0].name, 'Deep Work');
});
