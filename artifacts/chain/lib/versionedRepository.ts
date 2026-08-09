export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

interface VersionedEnvelope<T> {
  version: number;
  data: T;
  writtenAt: string;
}

interface RepositoryOptions<T> {
  storage: KeyValueStorage;
  key: string;
  version: number;
  decode: (value: unknown) => T | null;
  empty: () => T;
}

export interface VersionedRepository<T> {
  read(): Promise<T>;
  write(value: T): Promise<void>;
}

export function createVersionedRepository<T>({
  storage,
  key,
  version,
  decode,
  empty,
}: RepositoryOptions<T>): VersionedRepository<T> {
  const backupKey = `${key}:backup`;
  let queue = Promise.resolve();

  function decodeRaw(raw: string | null): T | null {
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'data' in parsed) {
        return decode((parsed as { data?: unknown }).data);
      }
      return decode(parsed);
    } catch {
      return null;
    }
  }

  async function read(): Promise<T> {
    const primaryRaw = await storage.getItem(key);
    const primary = decodeRaw(primaryRaw);
    if (primary !== null) return primary;

    const backup = decodeRaw(await storage.getItem(backupKey));
    if (backup !== null) return backup;
    return empty();
  }

  async function performWrite(value: T): Promise<void> {
    const previous = await storage.getItem(key);
    if (decodeRaw(previous) !== null && previous !== null) {
      await storage.setItem(backupKey, previous);
    }
    const envelope: VersionedEnvelope<T> = {
      version,
      data: value,
      writtenAt: new Date().toISOString(),
    };
    await storage.setItem(key, JSON.stringify(envelope));
  }

  function write(value: T): Promise<void> {
    queue = queue.catch(() => undefined).then(() => performWrite(value));
    return queue;
  }

  return { read, write };
}
