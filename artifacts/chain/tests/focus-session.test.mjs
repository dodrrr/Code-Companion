import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFocusSession,
  decodeFocusSession,
  getFocusElapsedSeconds,
  pauseFocusSession,
  resumeFocusSession,
} from '../domain/focus.ts';
import { decodeMorningBriefingTime, isMorningBriefingNotificationData } from '../domain/plan.ts';

test('focus elapsed time is derived from timestamps and capped at the target', () => {
  const started = createFocusSession('task-1', '2026-08-30', 60, 1_000);
  assert.equal(getFocusElapsedSeconds(started, 31_900), 30);
  assert.equal(getFocusElapsedSeconds(started, 90_000), 60);
});

test('paused focus sessions exclude time spent paused and resume from their saved total', () => {
  const started = createFocusSession('task-1', '2026-08-30', 120, 1_000);
  const paused = pauseFocusSession(started, 31_000);
  assert.equal(getFocusElapsedSeconds(paused, 91_000), 30);

  const resumed = resumeFocusSession(paused, 91_000);
  assert.equal(getFocusElapsedSeconds(resumed, 106_000), 45);
});

test('focus snapshots reject malformed persisted state', () => {
  assert.equal(decodeFocusSession({ version: 1, itemId: '', targetSeconds: 30 }), null);
  assert.equal(decodeFocusSession({
    version: 1,
    itemId: 'task-1',
    planDate: '2026-08-30',
    targetSeconds: 60,
    accumulatedSeconds: -1,
    updatedAt: 1_000,
  }), null);
});

test('morning briefing cleanup recognizes current and legacy requests without touching task reminders', () => {
  assert.equal(isMorningBriefingNotificationData({ openPlan: true, morningBriefing: true }), true);
  assert.equal(isMorningBriefingNotificationData({ openPlan: true }), true);
  assert.equal(isMorningBriefingNotificationData({ planItemId: 'task-1', planDate: '2026-08-30' }), false);
});

test('morning briefing times migrate legacy hours and preserve custom minutes', () => {
  assert.deepEqual(decodeMorningBriefingTime({ hour: 8 }), { hour: 8, minute: 0 });
  assert.deepEqual(decodeMorningBriefingTime({ hour: 0, minute: 0 }), { hour: 0, minute: 0 });
  assert.deepEqual(decodeMorningBriefingTime({ hour: 6, minute: 35 }), { hour: 6, minute: 35 });
  assert.deepEqual(decodeMorningBriefingTime({ hour: 8, minute: 7 }), { hour: 8, minute: 7 });
  assert.deepEqual(decodeMorningBriefingTime({ hour: 23, minute: 59 }), { hour: 23, minute: 59 });
});

test('morning briefing times reject corrupt or out-of-range values', () => {
  assert.equal(decodeMorningBriefingTime({ hour: Number.NaN, minute: 0 }), null);
  assert.equal(decodeMorningBriefingTime({ hour: -1, minute: 0 }), null);
  assert.equal(decodeMorningBriefingTime({ hour: 24, minute: 0 }), null);
  assert.equal(decodeMorningBriefingTime({ hour: 8, minute: -1 }), null);
  assert.equal(decodeMorningBriefingTime({ hour: 8, minute: 60 }), null);
  assert.equal(decodeMorningBriefingTime({ hour: 8, minute: 7.5 }), null);
});
