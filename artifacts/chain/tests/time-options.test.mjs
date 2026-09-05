import assert from 'node:assert/strict';
import test from 'node:test';

import { CLOCK_MINUTE_OPTIONS, isClockMinuteOption } from '../constants/time.ts';
import { parsePlanTimeSlot } from '../domain/plan.ts';

test('manual clock pickers expose every five-minute step', () => {
  assert.deepEqual(CLOCK_MINUTE_OPTIONS, [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
});

test('the picker grid is separate from exact persisted clock values', () => {
  assert.equal(isClockMinuteOption(0), true);
  assert.equal(isClockMinuteOption(25), true);
  assert.equal(isClockMinuteOption(55), true);
  assert.equal(isClockMinuteOption(37), false);
  assert.equal(isClockMinuteOption(60), false);
});

test('editing a task restores its saved clock time safely', () => {
  assert.deepEqual(parsePlanTimeSlot('8:35 AM'), { hour: 8, minute: 35 });
  assert.deepEqual(parsePlanTimeSlot('12 AM'), { hour: 0, minute: 0 });
  assert.deepEqual(parsePlanTimeSlot('12:05 PM'), { hour: 12, minute: 5 });
  assert.deepEqual(parsePlanTimeSlot('9:37 PM'), { hour: 21, minute: 37 });
  assert.equal(parsePlanTimeSlot('13:00 PM'), null);
  assert.equal(parsePlanTimeSlot('8:60 AM'), null);
});
