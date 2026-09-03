export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

interface VersionedEnvelope<T> {
  version: number;
  data: T;
  writtenAt: string;
}

type RepositoryMigration = (value: unknown) => unknown;

interface RepositoryOptions<T> {
  storage: KeyValueStorage;
  key: string;
  version: number;
  decode: (value: unknown) => T | null;
  empty: () => T;
  /**
   * Optional, step-by-step migrations keyed by their source version.
   * For example, migrations[1] transforms version 1 data into version 2 data.
   * Missing steps are passed through to `decode`, which remains the final
   * schema validator/normalizer for backwards-compatible domains.
   */
  migrations?: Readonly<Partial<Record<number, RepositoryMigration>>>;
}

export interface RepositoryReadResult<T> {
  value: T;
  source: 'primary' | 'backup' | 'empty' | 'invalid' | 'unsupported';
  storedVersion: number | null;
  migrated: boolean;
}

export interface VersionedRepository<T> {
  read(): Promise<T>;
  readWithMetadata(): Promise<RepositoryReadResult<T>>;
  write(value: T): Promise<void>;
  update(mutator: (current: T) => T | Promise<T>): Promise<T>;
}

interface DecodedValue<T> {
  value: T;
  storedVersion: number;
  migrated: boolean;
}

export function createVersionedRepository<T>({
  storage,
  key,
  version,
  decode,
  empty,
  migrations = {},
}: RepositoryOptions<T>): VersionedRepository<T> {
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`Repository version for ${key} must be a positive integer`);
  }

  const backupKey = `${key}:backup`;
  let queue: Promise<void> = Promise.resolve();

  function migrateAndDecode(value: unknown, storedVersion: number): DecodedValue<T> | null {
    if (!Number.isInteger(storedVersion) || storedVersion < 0 || storedVersion > version) return null;

    let candidate = value;
    try {
      for (let sourceVersion = storedVersion; sourceVersion < version; sourceVersion += 1) {
        const migration = migrations[sourceVersion];
        if (migration) candidate = migration(candidate);
      }
    } catch {
      return null;
    }

    const decoded = decode(candidate);
    if (decoded === null) return null;
    return {
      value: decoded,
      storedVersion,
      migrated: storedVersion !== version,
    };
  }

  function decodeRaw(raw: string | null): DecodedValue<T> | null {
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'data' in parsed) {
        const envelope = parsed as { data?: unknown; version?: unknown };
        if (
          'version' in envelope &&
          (typeof envelope.version !== 'number' || !Number.isInteger(envelope.version))
        ) {
          return null;
        }
        const storedVersion =
          typeof envelope.version === 'number' && Number.isInteger(envelope.version)
            ? envelope.version
            : 0;
        return migrateAndDecode(envelope.data, storedVersion);
      }
      return migrateAndDecode(parsed, 0);
    } catch {
      return null;
    }
  }

  function getDeclaredVersion(raw: string | null): number | null {
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !('data' in parsed)) return null;
      const declaredVersion = (parsed as { version?: unknown }).version;
      return typeof declaredVersion === 'number' && Number.isInteger(declaredVersion)
        ? declaredVersion
        : null;
    } catch {
      return null;
    }
  }

  async function performWrite(value: T): Promise<void> {
    const decoded = decode(value);
    if (decoded === null) throw new Error(`Refusing to write invalid data to ${key}`);

    const previous = await storage.getItem(key);
    const previousBackup = await storage.getItem(backupKey);
    if (
      (getDeclaredVersion(previous) ?? 0) > version ||
      (getDeclaredVersion(previousBackup) ?? 0) > version
    ) {
      throw new Error(`Refusing to overwrite unsupported future data in ${key}`);
    }
    if (previous !== null && decodeRaw(previous) !== null) {
      await storage.setItem(backupKey, previous);
    }
    const envelope: VersionedEnvelope<T> = {
      version,
      data: decoded,
      writtenAt: new Date().toISOString(),
    };
    await storage.setItem(key, JSON.stringify(envelope));
  }

  async function readStored(): Promise<RepositoryReadResult<T>> {
    const primaryRaw = await storage.getItem(key);
    const primaryVersion = getDeclaredVersion(primaryRaw);
    const backupRaw = await storage.getItem(backupKey);
    const backupVersion = getDeclaredVersion(backupRaw);
    const futureVersions = [primaryVersion, backupVersion].filter(
      (candidate): candidate is number => candidate !== null && candidate > version,
    );
    if (futureVersions.length > 0) {
      return {
        value: empty(),
        source: 'unsupported',
        storedVersion: Math.max(...futureVersions),
        migrated: false,
      };
    }
    const primary = decodeRaw(primaryRaw);
    if (primary !== null) {
      if (primary.migrated) await performWrite(primary.value);
      return {
        value: primary.value,
        source: 'primary',
        storedVersion: primary.storedVersion,
        migrated: primary.migrated,
      };
    }

    const backup = decodeRaw(backupRaw);
    if (backup !== null) {
      // Repair the primary without ever copying its corrupt/unsupported payload
      // over the last known-good backup.
      await performWrite(backup.value);
      return {
        value: backup.value,
        source: 'backup',
        storedVersion: backup.storedVersion,
        migrated: backup.migrated,
      };
    }

    return {
      value: empty(),
      source: primaryRaw === null && backupRaw === null ? 'empty' : 'invalid',
      storedVersion: null,
      migrated: false,
    };
  }

  function enqueue<R>(operation: () => Promise<R>): Promise<R> {
    const result = queue.catch(() => undefined).then(operation);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function readWithMetadata(): Promise<RepositoryReadResult<T>> {
    return enqueue(readStored);
  }

  async function read(): Promise<T> {
    return (await readWithMetadata()).value;
  }

  function write(value: T): Promise<void> {
    return enqueue(() => performWrite(value));
  }

  function update(mutator: (current: T) => T | Promise<T>): Promise<T> {
    return enqueue(async () => {
      const current = await readStored();
      if (current.source === 'unsupported') {
        throw new Error(`Cannot update unsupported future data in ${key}`);
      }
      const candidate = await mutator(current.value);
      const next = decode(candidate);
      if (next === null) throw new Error(`Refusing to update ${key} with invalid data`);
      await performWrite(next);
      return next;
    });
  }

  return { read, readWithMetadata, write, update };
}
