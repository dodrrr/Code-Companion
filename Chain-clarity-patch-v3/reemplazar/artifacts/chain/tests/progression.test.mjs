import assert from 'node:assert/strict';
import test from 'node:test';

import { formatStreakCount, getNextProgressionStage, getProgressionStage } from '../constants/progression.ts';

test('streak milestones keep their actual cadence instead of converting to calendar years', () => {
  assert.equal(formatStreakCount(1, 'daily'), '1 day');
  assert.equal(formatStreakCount(7, 'daily'), '7 days');
  assert.equal(formatStreakCount(365, 'daily'), '365 days');
  assert.equal(formatStreakCount(1, 'weekly'), '1 week');
  assert.equal(formatStreakCount(7, 'weekly'), '7 weeks');
  assert.equal(formatStreakCount(365, 'weekly'), '365 weeks');
});

test('shared milestones make no false week, year or automatic habit claims', () => {
  const seven = getProgressionStage(7);
  const thirty = getProgressionStage(30);
  const longStreak = getProgressionStage(365);
  assert.doesNotMatch(`${seven.label} ${seven.copy}`, /full week|seven days/i);
  assert.doesNotMatch(`${thirty.label} ${thirty.copy}`, /real habit|automatic|guaranteed/i);
  assert.doesNotMatch(`${longStreak.label} ${longStreak.copy}`, /\byear\b/i);
});

test('neutral copy preserves existing progression thresholds and stable keys', () => {
  assert.equal(getProgressionStage(0).key, 'starting-line');
  assert.equal(getProgressionStage(29).key, 'part-of-week');
  assert.equal(getProgressionStage(30).key, 'real-habit');
  assert.equal(getNextProgressionStage(29)?.at, 30);
  assert.equal(getNextProgressionStage(365), undefined);
});
