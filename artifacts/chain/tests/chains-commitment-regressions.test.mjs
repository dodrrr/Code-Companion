import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  applyDayStatus,
  getChainCommitmentStatus,
  getNextCompletionStatus,
  getStreak,
  getWeeklyProgress,
  isChainKeptOnDate,
  normalizeChain,
  normalizeRestDayUpdate,
  toLocalDateString,
} from '../domain/chains.ts';
import { getGateTodayProgress } from '../domain/gateRules.ts';

const today = '2026-09-06'; // Sunday

function makeChain(overrides = {}) {
  return {
    id: 'chain-1', name: 'Read', color: '#ff6b3d', createdAt: '2026-08-24',
    completedDates: [], minimumDates: [], minimumLabel: 'One page', frozenDates: [],
    freezeCredits: 2, freezeRecoveryProgress: 0, freezeRecoveryCountedDates: [],
    freezeSystemVersion: 2, restDays: [], cadence: 'daily', weeklyTarget: 3,
    completionTimes: {}, ...overrides,
  };
}

test('a legacy seven-rest-day schedule stays intact and cannot block streak calculation', () => {
  const original = makeChain({ restDays: [0, 1, 2, 3, 4, 5, 6], completedDates: ['2026-09-04'] });
  const normalized = normalizeChain(original);
  assert.deepEqual(normalized.restDays, original.restDays);
  assert.deepEqual(normalized.completedDates, original.completedDates);

  // A killable child makes this regression fail cleanly if an unbounded scan
  // returns, rather than freezing the complete Node test run.
  const moduleUrl = new URL('../domain/chains.ts', import.meta.url).href;
  const result = spawnSync(process.execPath, [
    '--no-warnings', '--experimental-strip-types', '--input-type=module', '-e',
    `import { getStreak } from ${JSON.stringify(moduleUrl)}; console.log(getStreak(${JSON.stringify(normalized)}, '${today}'));`,
  ], { encoding: 'utf8', timeout: 3000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '0');
});

test('new rest schedules must leave an active day without changing legacy normalization', () => {
  assert.equal(normalizeRestDayUpdate([0, 1, 2, 3, 4, 5, 6]), null);
  assert.equal(normalizeRestDayUpdate([0, 1, 2, 3, 4, 5, 6, 6]), null);
  assert.deepEqual(normalizeRestDayUpdate([0, 2, 3, 4, 5, 6]), [0, 2, 3, 4, 5, 6]);
  assert.deepEqual(normalizeRestDayUpdate([0, 0, 6, 99]), [0, 6]);
  assert.deepEqual(normalizeRestDayUpdate([]), []);
});

test('daily streak preserves six rest days and counts only completed active days', () => {
  const chain = makeChain({
    restDays: [0, 2, 3, 4, 5, 6], // Monday only
    completedDates: ['2026-08-24', '2026-08-26', '2026-08-31'],
  });
  const before = structuredClone(chain);
  assert.equal(getStreak(chain, today), 2);
  assert.deepEqual(chain, before);
});

test('daily streak stops at creation and preserves crossing daily Freeze and rest days', () => {
  const chain = makeChain({
    createdAt: '2026-09-01', completedDates: ['2026-08-31', '2026-09-01', '2026-09-03', '2026-09-04'],
    frozenDates: ['2026-09-02'], restDays: [0, 6],
  });
  assert.equal(getStreak(chain, today), 3);
  assert.equal(getStreak(chain, '2026-08-31'), 0);
});

test('the scan limit preserves 3650 completions across six rest days and intervening Freezes', () => {
  // An intentionally long boundary fixture: a frozen active Sunday also
  // requires crossing the six rest days before the next active Sunday.
  const date = new Date(`${today}T12:00:00`);
  const completedDates = [];
  const frozenDates = [];
  for (let week = 0; week < 3700; week += 1) {
    const key = toLocalDateString(date);
    if (week % 74 === 0) frozenDates.push(key);
    else completedDates.push(key);
    date.setDate(date.getDate() - 7);
  }
  const chain = makeChain({
    createdAt: completedDates.at(-1),
    restDays: [1, 2, 3, 4, 5, 6],
    completedDates,
    frozenDates,
  });
  assert.equal(completedDates.length, 3650);
  assert.equal(frozenDates.length, 50);
  assert.equal(getStreak(chain, today), 3650);
});

test('the primary completion action upgrades Minimum to Done and then permits undo', () => {
  const minimum = applyDayStatus(makeChain(), today, 'minimum').chain;
  const before = structuredClone(minimum);
  const completed = applyDayStatus(minimum, today, getNextCompletionStatus(minimum, today), '2026-09-06T10:00:00.000Z');
  assert.equal(completed.accepted, true);
  assert.deepEqual(completed.chain.minimumDates, []);
  assert.deepEqual(completed.chain.completedDates, [today]);
  assert.equal(completed.chain.completionTimes[today], '2026-09-06T10:00:00.000Z');
  assert.deepEqual(minimum, before);
  const undone = applyDayStatus(completed.chain, today, getNextCompletionStatus(completed.chain, today));
  assert.deepEqual(undone.chain.completedDates, []);
  assert.deepEqual(undone.chain.minimumDates, []);
});

test('the primary completion action replaces a daily Freeze and refunds its credit', () => {
  const frozen = applyDayStatus(makeChain(), today, 'frozen').chain;
  const completed = applyDayStatus(frozen, today, getNextCompletionStatus(frozen, today)).chain;
  assert.deepEqual(completed.completedDates, [today]);
  assert.deepEqual(completed.frozenDates, []);
  assert.equal(completed.freezeCredits, 2);
});

test('a new weekly Freeze is rejected without spending credit or replacing progress', () => {
  for (const overrides of [{}, { minimumDates: [today] }, { completedDates: [today] }]) {
    const chain = makeChain({ cadence: 'weekly', ...overrides });
    const before = structuredClone(chain);
    const result = applyDayStatus(chain, today, 'frozen');
    assert.equal(result.accepted, false);
    assert.equal(result.changed, false);
    assert.equal(result.chain, chain);
    assert.deepEqual(chain, before);
  }
});

test('old weekly Freeze history survives normalization and remains correctable and refundable', () => {
  const chain = normalizeChain(makeChain({ cadence: 'weekly', frozenDates: [today], freezeCredits: 1 }));
  assert.deepEqual(chain.frozenDates, [today]);
  assert.equal(chain.freezeCredits, 1);
  assert.equal(applyDayStatus(chain, today, 'frozen').changed, false);
  for (const status of ['missed', 'minimum', 'done']) {
    const corrected = applyDayStatus(chain, today, status);
    assert.equal(corrected.accepted, true);
    assert.deepEqual(corrected.chain.frozenDates, []);
    assert.equal(corrected.chain.freezeCredits, 2);
  }
  assert.deepEqual(chain.frozenDates, [today]);
});

test('a weekly Freeze record alone cannot count as kept or release conditional Gate', () => {
  const chain = makeChain({ cadence: 'weekly', frozenDates: [today], freezeCredits: 1 });
  assert.equal(getChainCommitmentStatus(chain, today).status, 'pending');
  assert.equal(isChainKeptOnDate(chain, today), false);
  assert.equal(getWeeklyProgress(chain, today), 0);
  assert.deepEqual(getGateTodayProgress([chain], today), { total: 1, kept: 0, pending: 1, isKept: false });
});

test('a weekly target met earlier keeps the shared promise without inventing a completion today', () => {
  const chain = makeChain({ cadence: 'weekly', completedDates: ['2026-08-31', '2026-09-02', '2026-09-04'] });
  const before = structuredClone(chain);
  assert.deepEqual(getChainCommitmentStatus(chain, today), {
    status: 'weekly-target-met', isDue: true, isKept: true, weeklyProgress: 3, weeklyTargetMet: true,
  });
  assert.equal(isChainKeptOnDate(chain, today), true);
  assert.equal(chain.completedDates.includes(today), false);
  assert.deepEqual(getGateTodayProgress([chain], today), { total: 1, kept: 1, pending: 0, isKept: true });
  assert.deepEqual(chain, before);
});

test('weekly minimum and done remain daily action states even before the weekly goal is met', () => {
  const done = makeChain({ cadence: 'weekly', completedDates: [today] });
  const minimum = makeChain({ cadence: 'weekly', minimumDates: [today] });
  for (const [chain, status] of [[done, 'done'], [minimum, 'minimum']]) {
    assert.deepEqual(getChainCommitmentStatus(chain, today), {
      status, isDue: true, isKept: true, weeklyProgress: 1, weeklyTargetMet: false,
    });
  }
});

test('shared commitment and Gate agree across pending, rest, future, Freeze and weekly states', () => {
  const chains = [
    makeChain({ id: 'daily-done', completedDates: [today] }),
    makeChain({ id: 'daily-minimum', minimumDates: [today] }),
    makeChain({ id: 'daily-frozen', frozenDates: [today] }),
    makeChain({ id: 'daily-rest', restDays: [0] }),
    makeChain({ id: 'future', createdAt: '2026-09-07' }),
    makeChain({ id: 'weekly-met', cadence: 'weekly', completedDates: ['2026-08-31', '2026-09-02', '2026-09-04'] }),
    makeChain({ id: 'weekly-pending', cadence: 'weekly' }),
    makeChain({ id: 'weekly-old-freeze', cadence: 'weekly', frozenDates: [today] }),
  ];
  const statuses = chains.map(chain => getChainCommitmentStatus(chain, today));
  assert.equal(statuses[3].status, 'rest');
  assert.equal(statuses[3].isKept, true);
  assert.equal(statuses[4].status, 'not-started');
  const due = statuses.filter(status => status.isDue);
  assert.equal(due.length, 6);
  assert.deepEqual(getGateTodayProgress(chains, today), {
    total: due.length, kept: 4, pending: 2, isKept: false,
  });
});
