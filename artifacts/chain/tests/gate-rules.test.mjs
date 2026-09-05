import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeGateRules,
  gateRuleSummary,
  getGateTodayProgress,
  isGateRuleActiveToday,
  normalizeGateRule,
  normalizeGateUsageMinutes,
} from '../domain/gateRules.ts';
import { createVersionedRepository } from '../lib/versionedRepository.ts';

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

function createMemoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    value(key) {
      return values.get(key) ?? null;
    },
  };
}

test('Gate usage minutes are finite, clamped and kept on a five-minute grid', () => {
  assert.equal(normalizeGateUsageMinutes(1), 5);
  assert.equal(normalizeGateUsageMinutes('12'), 10);
  assert.equal(normalizeGateUsageMinutes(13), 15);
  assert.equal(normalizeGateUsageMinutes(999), 360);
  assert.equal(normalizeGateUsageMinutes(Number.NaN), 30);
});

test('Gate rules normalize current policies and migrate legacy modes', () => {
  assert.deepEqual(
    normalizeGateRule({ trigger: { kind: 'dailyUsage', minutes: 17 }, release: 'whenTodayKept' }),
    { trigger: { kind: 'dailyUsage', minutes: 15 }, release: 'whenTodayKept' },
  );
  assert.deepEqual(normalizeGateRule({ mode: 'every_open', dailyLimitMinutes: 90 }), {
    trigger: { kind: 'onOpen' },
    release: 'always',
  });
  assert.deepEqual(normalizeGateRule({ mode: 'daily_limit', dailyLimitMinutes: 90 }), {
    trigger: { kind: 'dailyUsage', minutes: 90 },
    release: 'always',
  });
  assert.equal(normalizeGateRule({ trigger: { kind: 'dailyUsage' } }), null);
  assert.equal(normalizeGateRule({ trigger: { kind: 'dailyUsage', minutes: Number.NaN } }), null);
  assert.equal(normalizeGateRule({ mode: 'daily_limit' }), null);
  assert.equal(normalizeGateRule({ trigger: { kind: 'onOpen' }, release: 'later' }), null);
  assert.equal(normalizeGateRule({ mode: 'unknown' }), null);
});

test('Gate rule records salvage valid entries but reject wholly corrupt payloads', () => {
  assert.deepEqual(
    decodeGateRules({
      youtube: { mode: 'daily_limit', dailyLimitMinutes: 10 },
      broken: { mode: 'later' },
    }),
    {
      youtube: { trigger: { kind: 'dailyUsage', minutes: 10 }, release: 'always' },
    },
  );
  assert.deepEqual(decodeGateRules({}), {});
  assert.equal(decodeGateRules({ broken: { mode: 'later' } }), null);
  assert.equal(decodeGateRules('{not-an-object'), null);
});

test('Gate rule summaries stay concise across trigger and release variants', () => {
  assert.equal(
    gateRuleSummary({ trigger: { kind: 'onOpen' }, release: 'always' }),
    'Every opening · Always active',
  );
  assert.equal(
    gateRuleSummary({ trigger: { kind: 'dailyUsage', minutes: 90 }, release: 'whenTodayKept' }),
    'After 1h 30m today · Until today is kept',
  );
});

test('today progress excludes daily rest days and accepts done, minimum and frozen states', () => {
  const date = '2026-09-06'; // Sunday
  const progress = getGateTodayProgress([
    makeChain({ id: 'rest', restDays: [0] }),
    makeChain({ id: 'done', completedDates: [date] }),
    makeChain({ id: 'minimum', minimumDates: [date] }),
    makeChain({ id: 'frozen', frozenDates: [date] }),
    makeChain({ id: 'pending' }),
  ], date);

  assert.deepEqual(progress, { total: 4, kept: 3, pending: 1, isKept: false });
});

test('weekly Chains at target never hold Gate and a weekly action can keep today', () => {
  const date = '2026-09-03';
  const progress = getGateTodayProgress([
    makeChain({
      id: 'target-met',
      cadence: 'weekly',
      weeklyTarget: 3,
      completedDates: ['2026-08-31', '2026-09-01', '2026-09-02'],
    }),
    makeChain({
      id: 'acted-today',
      cadence: 'weekly',
      weeklyTarget: 3,
      completedDates: [date],
    }),
    makeChain({ id: 'weekly-pending', cadence: 'weekly', weeklyTarget: 3 }),
  ], date);

  assert.deepEqual(progress, { total: 3, kept: 2, pending: 1, isKept: false });
});

test('Chains created after the evaluated local day cannot hold Gate', () => {
  const progress = getGateTodayProgress([
    makeChain({ id: 'future-daily', createdAt: '2026-09-04' }),
    makeChain({ id: 'future-weekly', createdAt: '2026-09-05', cadence: 'weekly' }),
    makeChain({ id: 'current', createdAt: '2026-09-03', completedDates: ['2026-09-03'] }),
  ], '2026-09-03');

  assert.deepEqual(progress, { total: 1, kept: 1, pending: 0, isKept: true });
});

test('an empty eligible day is kept and releases only conditional Gate rules', () => {
  const progress = getGateTodayProgress([], '2026-09-03');
  assert.deepEqual(progress, { total: 0, kept: 0, pending: 0, isKept: true });
  assert.equal(
    isGateRuleActiveToday({ trigger: { kind: 'onOpen' }, release: 'whenTodayKept' }, progress),
    false,
  );
  assert.equal(
    isGateRuleActiveToday({ trigger: { kind: 'onOpen' }, release: 'always' }, progress),
    true,
  );
});

test('the versioned repository upgrades the previous unversioned Gate rule record', async () => {
  const key = '@chain_gate_rules';
  const storage = createMemoryStorage({
    [key]: JSON.stringify({ youtube: { mode: 'daily_limit', dailyLimitMinutes: 45 } }),
  });
  const repository = createVersionedRepository({
    storage,
    key,
    version: 1,
    decode: decodeGateRules,
    empty: () => ({}),
  });

  const result = await repository.readWithMetadata();
  assert.equal(result.source, 'primary');
  assert.equal(result.migrated, true);
  assert.deepEqual(result.value.youtube, {
    trigger: { kind: 'dailyUsage', minutes: 45 },
    release: 'always',
  });

  const rewritten = JSON.parse(storage.value(key));
  assert.equal(rewritten.version, 1);
  assert.deepEqual(rewritten.data, result.value);
});

test('a corrupt Gate primary recovers the last valid rule backup', async () => {
  const key = '@chain_gate_rules';
  const backup = {
    version: 1,
    data: { youtube: { trigger: { kind: 'dailyUsage', minutes: 15 }, release: 'always' } },
    writtenAt: '2026-09-03T10:00:00.000Z',
  };
  const storage = createMemoryStorage({
    [key]: JSON.stringify({
      version: 1,
      data: { youtube: { trigger: { kind: 'dailyUsage' }, release: 'always' } },
      writtenAt: '2026-09-03T11:00:00.000Z',
    }),
    [`${key}:backup`]: JSON.stringify(backup),
  });
  const repository = createVersionedRepository({
    storage,
    key,
    version: 1,
    decode: decodeGateRules,
    empty: () => ({}),
  });

  const result = await repository.readWithMetadata();
  assert.equal(result.source, 'backup');
  assert.deepEqual(result.value, backup.data);
  assert.deepEqual(JSON.parse(storage.value(key)).data, backup.data);
});
