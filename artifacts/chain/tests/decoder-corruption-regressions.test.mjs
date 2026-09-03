import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeChains } from '../domain/chains.ts';
import { decodeGateWindowsState, emptyGateWindowsState } from '../domain/gateWindows.ts';
import { decodePlanItems } from '../domain/plan.ts';
import { createVersionedRepository } from '../lib/versionedRepository.ts';

class MemoryStorage {
  values = new Map();
  async getItem(key) { return this.values.get(key) ?? null; }
  async setItem(key, value) { this.values.set(key, value); }
}

const chain = (id, name) => ({
  id,
  name,
  color: '#ff6b35',
  createdAt: '2026-08-30',
});

const planItem = (id, text) => ({ id, text, planDate: '2026-08-30' });

const gateWindow = (id, name) => ({
  id,
  name,
  startHour: 9,
  startMinute: 0,
  endHour: 11,
  endMinute: 0,
  days: [1],
  appIds: ['social'],
});

async function recoverFromInvalidPrimary({ key, version, decode, empty, first, second, invalidData }) {
  const storage = new MemoryStorage();
  const repository = createVersionedRepository({ storage, key, version, decode, empty });
  await repository.write(first);
  await repository.write(second);
  storage.values.set(key, JSON.stringify({ version, data: invalidData, writtenAt: 'corrupt' }));
  return repository.read();
}

test('Chains treats an entirely invalid non-empty collection as corruption but keeps valid siblings', async () => {
  const valid = chain('read', 'Read');
  assert.equal(decodeChains([{ id: 42 }, { name: 'missing required fields' }]), null);
  assert.equal(decodeChains([{ id: 42 }, valid])?.length, 1);
  assert.deepEqual(decodeChains([]), []);

  const recovered = await recoverFromInvalidPrimary({
    key: 'chains',
    version: 3,
    decode: decodeChains,
    empty: () => [],
    first: [valid],
    second: [chain('run', 'Run')],
    invalidData: [{ id: 42 }, null],
  });
  assert.equal(recovered[0].id, 'read');
});

test('Plan treats an entirely invalid non-empty collection as corruption but keeps valid siblings', async () => {
  const valid = planItem('physics', 'Physics');
  const decode = (value) => decodePlanItems(value, '2026-08-30');
  assert.equal(decode([{ text: 'missing id' }, { id: 'empty', text: '   ' }]), null);
  assert.equal(decode([{ text: 'missing id' }, valid])?.length, 1);
  assert.deepEqual(decode([]), []);

  const recovered = await recoverFromInvalidPrimary({
    key: 'plan',
    version: 2,
    decode,
    empty: () => [],
    first: [valid],
    second: [planItem('gym', 'Gym')],
    invalidData: [{ id: 'empty', text: '   ' }, false],
  });
  assert.equal(recovered[0].id, 'physics');
});

test('Gate Windows treats an entirely invalid non-empty collection as corruption but keeps valid siblings', async () => {
  const valid = gateWindow('deep-work', 'Deep Work');
  assert.equal(decodeGateWindowsState({ windows: [{ id: '   ' }, null] }), null);
  assert.equal(decodeGateWindowsState({ windows: [{ id: '   ' }, valid] })?.windows.length, 1);
  assert.deepEqual(decodeGateWindowsState([]), emptyGateWindowsState());

  const recovered = await recoverFromInvalidPrimary({
    key: 'gate-windows',
    version: 2,
    decode: decodeGateWindowsState,
    empty: emptyGateWindowsState,
    first: { windows: [valid], archivedMinutesByWindow: {} },
    second: { windows: [gateWindow('study', 'Study')], archivedMinutesByWindow: {} },
    invalidData: { windows: [{ id: '   ' }, null], archivedMinutesByWindow: {} },
  });
  assert.equal(recovered.windows[0].id, 'deep-work');
});
