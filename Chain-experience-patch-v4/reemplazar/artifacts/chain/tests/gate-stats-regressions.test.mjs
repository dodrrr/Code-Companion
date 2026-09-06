import assert from 'node:assert/strict';
import test from 'node:test';
import { createGateEventsRepository, GATE_EVENTS_KEY, LEGACY_GATE_EVENTS_KEY } from '../lib/gateEventsRepository.ts';
import { decodeGateEventStore, GATE_DAY_MS, summarizeGateEvents } from '../domain/gateStats.ts';

const today = Date.parse('2026-09-06T17:00:00Z');
const envelope = (data, version = 1) => JSON.stringify({ version, data });
function setup(initial = {}) {
  const values = new Map(Object.entries(initial));
  let clock = today;
  let fail = false;
  let writes = 0;
  const storage = {
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) {
      if (fail && key === GATE_EVENTS_KEY) { fail = false; throw new Error('disk full'); }
      writes += 1;
      values.set(key, value);
    },
  };
  const open = () => createGateEventsRepository(storage, () => clock);
  return { values, open, repository: open(), setNow: (value) => { clock = value; }, failNextWrite: () => { fail = true; }, writes: () => writes };
}

test('Gate history persists an attempt and its preview decision across restart', async () => {
  const env = setup();
  await env.repository.beginPreview('first', 'instagram', today - 5000);
  await env.repository.decidePreview('first', 'leave', today);
  const state = await env.open().read();
  const summary = summarizeGateEvents(state.events, 7, today);
  assert.equal(summary.attempts, 1);
  assert.equal(summary.leave, 1);
  assert.equal(summary.leaveRate, 1);
  assert.equal(summary.observedOutcomes, 0);
  assert.equal(summary.outcomeStatus, 'unavailable');
});

test('An opened preview without a decision stays undecided, never saved', async () => {
  const env = setup();
  await env.repository.beginPreview('dismissed', 'youtube', today);
  const summary = summarizeGateEvents((await env.open().read()).events, 7, today);
  assert.equal(summary.pending, 1);
  assert.equal(summary.leave, 0);
  assert.equal(summary.continued, 0);
  assert.equal(summary.leaveRate, null);
});

test('Repeated attempt effects and simultaneous repeated choices are idempotent', async () => {
  const env = setup();
  await Promise.all(Array.from({ length: 8 }, () => env.repository.beginPreview('one', 'instagram', today - 20)));
  await Promise.all(Array.from({ length: 8 }, (_, n) => env.repository.decidePreview('one', 'leave', today - 10 + n)));
  assert.equal((await env.repository.read()).events.length, 2);
});

test('Concurrent distinct previews do not lose one another', async () => {
  const env = setup();
  await Promise.all(Array.from({ length: 20 }, (_, n) => env.repository.beginPreview(`a${n}`, 'instagram', today)));
  await Promise.all(Array.from({ length: 20 }, (_, n) => env.repository.decidePreview(`a${n}`, n % 2 ? 'leave' : 'continue', today)));
  const summary = summarizeGateEvents((await env.repository.read()).events, 7, today);
  assert.equal(summary.attempts, 20);
  assert.equal(summary.leave, 10);
  assert.equal(summary.continued, 10);
});

test('Conflicting IDs and opposite second choices refuse to rewrite history', async () => {
  const env = setup();
  await env.repository.beginPreview('one', 'instagram', today);
  await assert.rejects(env.repository.beginPreview('one', 'youtube', today), /Conflicting/);
  await env.repository.decidePreview('one', 'leave', today);
  await assert.rejects(env.repository.decidePreview('one', 'continue', today), /already has/);
  assert.equal((await env.repository.read()).events.length, 2);
});

test('A decision without a known attempt is rejected', async () => {
  const env = setup();
  await assert.rejects(env.repository.decidePreview('missing', 'leave', today), /Invalid Gate/);
  assert.deepEqual((await env.repository.read()).events, []);
});

test('Native provenance and fabricated observed outcomes are not accepted by preview storage', () => {
  const event = { id: 'a', kind: 'attempt', attemptId: 'a', at: today, appId: 'instagram', source: 'native' };
  assert.equal(decodeGateEventStore({ legacyImported: true, events: [event] }), null);
  assert.equal(decodeGateEventStore({ legacyImported: true, events: [{ ...event, kind: 'observation', outcome: 'saved' }] }), null);
});

test('Old saved, opened and unknown markers remain unverified and untouched', async () => {
  const legacy = JSON.stringify([{ appId: 'instagram', at: today, outcome: 'saved', source: 'native' }, { appId: 'youtube', at: today, outcome: 'opened', source: 'preview' }, { appId: 'reddit', at: today }]);
  const env = setup({ [LEGACY_GATE_EVENTS_KEY]: legacy });
  const state = await env.repository.read();
  assert.equal(env.values.get(LEGACY_GATE_EVENTS_KEY), legacy);
  assert.equal(state.events.length, 3);
  assert.deepEqual(state.events.map((event) => event.source), ['unverified', 'unverified', 'unverified']);
  const summary = summarizeGateEvents(state.events, 90, today);
  assert.equal(summary.unverified, 3);
  assert.equal(summary.attempts, 0);
  assert.equal(summary.leaveRate, null);
  assert.equal((await env.open().read()).events.length, 3);
});

test('Corrupt legacy history is an error rather than a misleading empty success', async () => {
  const env = setup({ [LEGACY_GATE_EVENTS_KEY]: '{broken' });
  await assert.rejects(env.repository.read(), /could not be read/);
  assert.equal(env.values.has(GATE_EVENTS_KEY), false);
  assert.equal(env.values.get(LEGACY_GATE_EVENTS_KEY), '{broken');
});

test('Read does not purge history when events pass the 24h or 90d boundary', async () => {
  const env = setup();
  await env.repository.beginPreview('a', 'instagram', today);
  await env.repository.decidePreview('a', 'leave', today);
  const before = env.values.get(GATE_EVENTS_KEY);
  const writes = env.writes();
  env.setNow(today + 91 * GATE_DAY_MS);
  assert.equal((await env.repository.read()).events.length, 2);
  assert.equal(env.values.get(GATE_EVENTS_KEY), before);
  assert.equal(env.writes(), writes);
});

test('Retention on a new write removes expired attempts and their decision together', async () => {
  const env = setup();
  await env.repository.beginPreview('old', 'instagram', today);
  await env.repository.decidePreview('old', 'leave', today);
  env.setNow(today + 91 * GATE_DAY_MS);
  await env.repository.beginPreview('new', 'youtube', today + 91 * GATE_DAY_MS);
  const state = await env.repository.read();
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].attemptId, 'new');
  assert.ok(decodeGateEventStore(state));
});

test('Storage failure preserves the saved attempt and allows a decision retry', async () => {
  const env = setup();
  await env.repository.beginPreview('a', 'instagram', today);
  env.failNextWrite();
  await assert.rejects(env.repository.decidePreview('a', 'leave', today), /disk full/);
  assert.equal(summarizeGateEvents((await env.repository.read()).events, 7, today).pending, 1);
  await env.repository.decidePreview('a', 'leave', today);
  assert.equal(summarizeGateEvents((await env.open().read()).events, 7, today).leave, 1);
});

test('A valid backup repairs corrupt primary history', async () => {
  const env = setup();
  await env.repository.beginPreview('a', 'instagram', today);
  await env.repository.decidePreview('a', 'leave', today);
  env.values.set(GATE_EVENTS_KEY, '{broken');
  const state = await env.open().read();
  assert.equal(state.events.length, 1); // Last known-good backup: attempt only.
  assert.equal(state.events[0].kind, 'attempt');
  assert.ok(JSON.parse(env.values.get(GATE_EVENTS_KEY)).data);
});

test('Two corrupt copies raise a visible error and are not overwritten', async () => {
  const env = setup({ [GATE_EVENTS_KEY]: '{primary', [`${GATE_EVENTS_KEY}:backup`]: '{backup' });
  await assert.rejects(env.repository.read(), /invalid/);
  await assert.rejects(env.repository.beginPreview('a', 'instagram', today), /invalid/);
  assert.equal(env.values.get(GATE_EVENTS_KEY), '{primary');
});

test('Future primary or backup versions block reads and writes without downgrade', async () => {
  for (const key of [GATE_EVENTS_KEY, `${GATE_EVENTS_KEY}:backup`]) {
    const future = envelope({ future: 'schema' }, 100);
    const env = setup({ [key]: future });
    await assert.rejects(env.repository.read(), /unsupported/);
    await assert.rejects(env.repository.beginPreview('a', 'instagram', today), /unsupported/);
    assert.equal(env.values.get(key), future);
  }
});

test('7/28/90-day summaries use a matching cohort and exclude undecided pauses from rate', async () => {
  const env = setup();
  for (const [key, age] of [['a', 1], ['b', 8], ['c', 40]]) {
    await env.repository.beginPreview(key, 'instagram', today - age * GATE_DAY_MS);
    await env.repository.decidePreview(key, key === 'b' ? 'continue' : 'leave', today - age * GATE_DAY_MS);
  }
  await env.repository.beginPreview('pending', 'youtube', today);
  const events = (await env.repository.read()).events;
  assert.deepEqual([7, 28, 90].map((days) => summarizeGateEvents(events, days, today).attempts), [2, 3, 4]);
  const summary = summarizeGateEvents(events, 28, today);
  assert.equal(summary.leaveRate, 0.5);
  assert.equal(summary.knownDecisions, 2);
  assert.equal(summary.pending, 1);
  assert.equal(summary.byApp[0].attempts, 2);
});

test('Future-dated events and decisions before the attempt cannot contaminate statistics', async () => {
  const env = setup();
  await assert.rejects(env.repository.beginPreview('future', 'instagram', today + GATE_DAY_MS), /future/);
  await env.repository.beginPreview('a', 'instagram', today);
  await assert.rejects(env.repository.decidePreview('a', 'leave', today - 1), /Invalid Gate/);
  assert.equal(summarizeGateEvents((await env.repository.read()).events, 7, today).leaveRate, null);
});
