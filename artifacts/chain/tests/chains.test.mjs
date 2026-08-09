import assert from 'node:assert/strict';
import test from 'node:test';

import { applyDayStatus, getStreak, getWeeklyProgress, normalizeChain, parseChains } from '../domain/chains.ts';
import {
  getPlanTomorrowKey,
  normalizeClosedDates,
  normalizeFocusLog,
  normalizePlanItems,
} from '../domain/plan.ts';

function makeChain(overrides = {}) {
  return {
    id: 'chain-1',
    name: 'Read',
    color: '#ff6b3d',
    createdAt: '2026-07-01',
    completedDates: [],
    minimumDates: [],
    minimumLabel: 'One page',
    frozenDates: [],
    freezeCredits: 2,
    freezeRecoveryProgress: 0,
    freezeSystemVersion: 2,
    restDays: [],
    cadence: 'daily',
    weeklyTarget: 3,
    completionTimes: {},
    ...overrides,
  };
}

test('daily streak counts completed days and crosses rest and frozen days safely', () => {
  const chain = makeChain({
    completedDates: ['2026-08-03', '2026-08-04', '2026-08-06', '2026-08-07'],
    frozenDates: ['2026-08-05'],
    restDays: [0, 6],
  });

  assert.equal(getStreak(chain, '2026-08-09'), 4);
});

test('an incomplete current week does not erase the previous weekly streak', () => {
  const chain = makeChain({
    cadence: 'weekly',
    weeklyTarget: 3,
    completedDates: [
      '2026-07-20',
      '2026-07-22',
      '2026-07-24',
      '2026-07-27',
      '2026-07-29',
      '2026-07-31',
      '2026-08-03',
    ],
  });

  assert.equal(getWeeklyProgress(chain, '2026-08-05'), 1);
  assert.equal(getStreak(chain, '2026-08-05'), 2);
});

test('normalization migrates legacy safety nets and removes overlapping statuses', () => {
  const normalized = normalizeChain({
    ...makeChain(),
    completedDates: ['2026-08-01', '2026-08-01'],
    minimumDates: ['2026-08-01', '2026-08-02'],
    frozenDates: ['2026-08-02', '2026-08-03'],
    freezeCredits: 1,
    freezeSystemVersion: 1,
    restDays: [0, 0, 7, -1, 6],
  });

  assert.ok(normalized);
  assert.deepEqual(normalized.completedDates, ['2026-08-01']);
  assert.deepEqual(normalized.minimumDates, ['2026-08-02']);
  assert.deepEqual(normalized.frozenDates, ['2026-08-03']);
  assert.deepEqual(normalized.restDays, [0, 6]);
  assert.equal(normalized.freezeCredits, 1);
  assert.equal(normalized.freezeSystemVersion, 2);
});

test('parsing corrupted or partially invalid storage never crashes hydration', () => {
  assert.deepEqual(parseChains('{not-json'), []);
  assert.deepEqual(parseChains(JSON.stringify({ chains: [{ name: 'missing id' }, makeChain()] })), [makeChain()]);
});

test('freezing spends a credit and editing that date refunds it', () => {
  const frozen = applyDayStatus(makeChain(), '2026-08-05', 'frozen');
  assert.equal(frozen.accepted, true);
  assert.equal(frozen.chain.freezeCredits, 1);
  assert.deepEqual(frozen.chain.frozenDates, ['2026-08-05']);

  const corrected = applyDayStatus(frozen.chain, '2026-08-05', 'done', '2026-08-05T09:00:00.000Z');
  assert.equal(corrected.chain.freezeCredits, 2);
  assert.deepEqual(corrected.chain.frozenDates, []);
  assert.deepEqual(corrected.chain.completedDates, ['2026-08-05']);
});

test('a safety-net credit returns after fourteen real completions', () => {
  let chain = makeChain({ freezeCredits: 1, freezeRecoveryProgress: 13 });
  chain = applyDayStatus(chain, '2026-08-05', 'done').chain;

  assert.equal(chain.freezeCredits, 2);
  assert.equal(chain.freezeRecoveryProgress, 0);
});

test('a freeze is rejected when no safety-net credit remains', () => {
  const chain = makeChain({ freezeCredits: 0 });
  const result = applyDayStatus(chain, '2026-08-05', 'frozen');

  assert.equal(result.accepted, false);
  assert.equal(result.changed, false);
  assert.equal(result.chain, chain);
});

test('plan dates use local calendar rollover instead of UTC rollover', () => {
  assert.equal(getPlanTomorrowKey(new Date(2026, 11, 31, 23, 30)), '2027-01-01');
});

test('plan storage keeps valid fields and rejects empty or malformed tasks', () => {
  const items = normalizePlanItems(
    JSON.stringify([
      { id: 'valid', text: '  Deep work  ', reminderMinutes: 0, repeatDays: [1, 1, 8, 3] },
      { id: 'empty', text: '   ' },
      { text: 'missing id' },
    ]),
    '2026-08-09',
  );

  assert.equal(items.length, 1);
  assert.equal(items[0].text, 'Deep work');
  assert.equal(items[0].planDate, '2026-08-09');
  assert.equal(items[0].reminderMinutes, 0);
  assert.deepEqual(items[0].repeatDays, [1, 3]);
});

test('plan metadata normalization is safe and deduplicated', () => {
  assert.deepEqual(normalizeClosedDates(JSON.stringify(['2026-08-09', '2026-08-09', 3])), ['2026-08-09']);
  assert.deepEqual(normalizeFocusLog('{broken'), []);
  assert.equal(
    normalizeFocusLog(
      JSON.stringify([
        { itemId: '1', chainId: 'c', date: '2026-08-09', minutes: 30, completedAt: 'now' },
        { itemId: '2', chainId: 'c', date: '2026-08-09', minutes: 0, completedAt: 'now' },
      ]),
    ).length,
    1,
  );
});
