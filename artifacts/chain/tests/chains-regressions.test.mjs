import assert from 'node:assert/strict';
import test from 'node:test';

import { applyDayStatus, isDateKey, normalizeChain, parseChains } from '../domain/chains.ts';

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
    freezeCredits: 1,
    freezeRecoveryProgress: 0,
    freezeRecoveryCountedDates: [],
    freezeSystemVersion: 2,
    restDays: [],
    cadence: 'daily',
    weeklyTarget: 3,
    completionTimes: {},
    ...overrides,
  };
}

test('alternating one date between done and missed cannot farm freeze recovery', () => {
  let chain = makeChain();

  for (let index = 0; index < 20; index += 1) {
    chain = applyDayStatus(chain, '2026-08-05', 'done').chain;
    chain = applyDayStatus(chain, '2026-08-05', 'missed').chain;
  }

  assert.equal(chain.freezeCredits, 1);
  assert.equal(chain.freezeRecoveryProgress, 1);
  assert.deepEqual(chain.freezeRecoveryCountedDates, ['2026-08-05']);
});

test('a date already counted before normalization cannot be reused for recovery', () => {
  const normalized = normalizeChain(
    makeChain({
      completedDates: ['2026-08-05'],
      freezeRecoveryProgress: 6,
      freezeRecoveryCountedDates: undefined,
    }),
  );
  assert.ok(normalized);

  const removed = applyDayStatus(normalized, '2026-08-05', 'missed').chain;
  const restored = applyDayStatus(removed, '2026-08-05', 'done').chain;

  assert.equal(restored.freezeRecoveryProgress, 6);
  assert.deepEqual(restored.freezeRecoveryCountedDates, ['2026-08-05']);
});

test('normalization rejects malformed required fields without dropping valid sibling records', () => {
  const valid = makeChain({ id: ' valid-id ', name: '  Read  ', color: ' #ff6b3d ' });
  const malformed = [
    makeChain({ id: 42 }),
    makeChain({ name: { value: 'Read' } }),
    makeChain({ name: '   ' }),
    makeChain({ color: false }),
    makeChain({ createdAt: '2026-02-30' }),
  ];

  const parsed = parseChains(JSON.stringify({ chains: [malformed[0], valid, ...malformed.slice(1)] }));

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, 'valid-id');
  assert.equal(parsed[0].name, 'Read');
  assert.equal(parsed[0].color, '#ff6b3d');
});

test('date keys must represent real Gregorian calendar dates', () => {
  assert.equal(isDateKey('2024-02-29'), true);
  assert.equal(isDateKey('2026-02-29'), false);
  assert.equal(isDateKey('2026-04-31'), false);
  assert.equal(isDateKey('2026-13-01'), false);
  assert.equal(isDateKey('0000-01-01'), false);
  assert.equal(isDateKey('2026-08-05'), true);
});

test('invalid dates inside one record are discarded while valid statuses remain', () => {
  const normalized = normalizeChain(
    makeChain({
      completedDates: ['2026-02-30', '2026-02-28', 8],
      minimumDates: ['2026-04-31', '2026-04-30'],
      frozenDates: ['not-a-date', '2026-05-01'],
      completionTimes: {
        '2026-02-30': '2026-02-28T10:00:00.000Z',
        '2026-02-28': '2026-02-28T10:00:00.000Z',
      },
    }),
  );

  assert.ok(normalized);
  assert.deepEqual(normalized.completedDates, ['2026-02-28']);
  assert.deepEqual(normalized.minimumDates, ['2026-04-30']);
  assert.deepEqual(normalized.frozenDates, ['2026-05-01']);
  assert.deepEqual(normalized.completionTimes, {
    '2026-02-28': '2026-02-28T10:00:00.000Z',
  });
});
