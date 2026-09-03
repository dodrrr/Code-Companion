import assert from 'node:assert/strict';
import test from 'node:test';

import { createVersionedRepository } from '../lib/versionedRepository.ts';

class MemoryStorage {
  values = new Map();
  async getItem(key) { return this.values.get(key) ?? null; }
  async setItem(key, value) { this.values.set(key, value); }
}

const decodeCounter = (value) => {
  if (!value || typeof value !== 'object' || typeof value.count !== 'number') return null;
  return {
    count: value.count,
    labels: Array.isArray(value.labels) ? value.labels.filter((label) => typeof label === 'string') : [],
  };
};

test('applies ordered schema migrations and rewrites the primary at the current version', async () => {
  const storage = new MemoryStorage();
  storage.values.set('counter', JSON.stringify({ version: 1, data: { total: 2 }, writtenAt: 'old' }));
  const repository = createVersionedRepository({
    storage,
    key: 'counter',
    version: 3,
    migrations: {
      1: (value) => ({ count: value.total, tags: ['migrated'] }),
      2: (value) => ({ count: value.count, labels: value.tags }),
    },
    decode: decodeCounter,
    empty: () => ({ count: 0, labels: [] }),
  });

  const result = await repository.readWithMetadata();
  const stored = JSON.parse(storage.values.get('counter'));

  assert.deepEqual(result.value, { count: 2, labels: ['migrated'] });
  assert.equal(result.source, 'primary');
  assert.equal(result.storedVersion, 1);
  assert.equal(result.migrated, true);
  assert.equal(stored.version, 3);
  assert.deepEqual(stored.data, { count: 2, labels: ['migrated'] });
});

test('serializes concurrent read-modify-write updates without losing either mutation', async () => {
  const storage = new MemoryStorage();
  const repository = createVersionedRepository({
    storage,
    key: 'counter',
    version: 1,
    decode: decodeCounter,
    empty: () => ({ count: 0, labels: [] }),
  });

  await Promise.all([
    repository.update(async (current) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { ...current, count: current.count + 1, labels: [...current.labels, 'slow'] };
    }),
    repository.update((current) => ({
      ...current,
      count: current.count + 1,
      labels: [...current.labels, 'fast'],
    })),
  ]);

  assert.deepEqual(await repository.read(), { count: 2, labels: ['slow', 'fast'] });
});

test('uses a valid empty primary instead of treating it as absent legacy state', async () => {
  const storage = new MemoryStorage();
  storage.values.set('counter', JSON.stringify({
    version: 1,
    data: { count: 0, labels: [] },
    writtenAt: 'now',
  }));
  const repository = createVersionedRepository({
    storage,
    key: 'counter',
    version: 1,
    decode: decodeCounter,
    empty: () => ({ count: -1, labels: [] }),
  });

  const result = await repository.readWithMetadata();
  assert.equal(result.source, 'primary');
  assert.equal(result.value.count, 0);
});

test('recovers a corrupt primary and never overwrites its valid backup with corruption', async () => {
  const storage = new MemoryStorage();
  const backupRaw = JSON.stringify({
    version: 2,
    data: { count: 4, labels: ['safe'] },
    writtenAt: 'backup',
  });
  storage.values.set('counter', JSON.stringify({
    version: '2',
    data: { count: 999, labels: ['malformed-envelope'] },
    writtenAt: 'corrupt',
  }));
  storage.values.set('counter:backup', backupRaw);
  const repository = createVersionedRepository({
    storage,
    key: 'counter',
    version: 2,
    decode: decodeCounter,
    empty: () => ({ count: 0, labels: [] }),
  });

  const result = await repository.readWithMetadata();
  assert.equal(result.source, 'backup');
  assert.deepEqual(result.value, { count: 4, labels: ['safe'] });
  assert.equal(storage.values.get('counter:backup'), backupRaw);
  assert.deepEqual(JSON.parse(storage.values.get('counter')).data, { count: 4, labels: ['safe'] });
});

test('reports future data as unsupported and refuses to overwrite it', async () => {
  const storage = new MemoryStorage();
  const futureRaw = JSON.stringify({
    version: 99,
    data: { count: 999, labels: ['future'] },
    writtenAt: 'future',
  });
  storage.values.set('counter', futureRaw);
  const repository = createVersionedRepository({
    storage,
    key: 'counter',
    version: 2,
    decode: decodeCounter,
    empty: () => ({ count: 0, labels: [] }),
  });

  storage.values.set('counter:backup', JSON.stringify({
    version: 2,
    data: { count: 4, labels: ['older-backup'] },
    writtenAt: 'backup',
  }));

  const result = await repository.readWithMetadata();
  assert.equal(result.source, 'unsupported');
  assert.equal(result.storedVersion, 99);
  assert.deepEqual(result.value, { count: 0, labels: [] });
  assert.equal(storage.values.get('counter'), futureRaw);
  await assert.rejects(repository.write({ count: 1, labels: [] }), /future data/);
  await assert.rejects(repository.update((current) => ({ ...current, count: 1 })), /future data/);
  assert.equal(storage.values.get('counter'), futureRaw);
});

test('preserves a future backup even when the primary still uses the current schema', async () => {
  const storage = new MemoryStorage();
  const currentRaw = JSON.stringify({
    version: 2,
    data: { count: 4, labels: ['current-primary'] },
    writtenAt: 'current',
  });
  const futureBackupRaw = JSON.stringify({
    version: 3,
    data: { count: 8, labels: ['future-backup'] },
    writtenAt: 'future',
  });
  storage.values.set('counter', currentRaw);
  storage.values.set('counter:backup', futureBackupRaw);
  const repository = createVersionedRepository({
    storage,
    key: 'counter',
    version: 2,
    decode: decodeCounter,
    empty: () => ({ count: 0, labels: [] }),
  });

  const result = await repository.readWithMetadata();
  assert.equal(result.source, 'unsupported');
  assert.equal(result.storedVersion, 3);
  await assert.rejects(repository.write({ count: 5, labels: [] }), /future data/);
  assert.equal(storage.values.get('counter'), currentRaw);
  assert.equal(storage.values.get('counter:backup'), futureBackupRaw);
});

test('an invalid update is rejected before it can replace primary or backup data', async () => {
  const storage = new MemoryStorage();
  const repository = createVersionedRepository({
    storage,
    key: 'counter',
    version: 1,
    decode: decodeCounter,
    empty: () => ({ count: 0, labels: [] }),
  });
  await repository.write({ count: 1, labels: ['first'] });
  await repository.write({ count: 2, labels: ['second'] });
  const primaryBefore = storage.values.get('counter');
  const backupBefore = storage.values.get('counter:backup');

  await assert.rejects(repository.update(() => null), /invalid data/);
  assert.equal(storage.values.get('counter'), primaryBefore);
  assert.equal(storage.values.get('counter:backup'), backupBefore);
});
