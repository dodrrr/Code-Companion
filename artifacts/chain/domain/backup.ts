export interface LocalStore {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface ChainBackup { app: 'chain'; version: 1; createdAt: string; entries: [string, string][] }
const JOURNAL = 'chain.restore-journal.v1';
const isChainKey = (key: string) => key.startsWith('@chain_');

export function captureBackup(storage: LocalStore): ChainBackup {
  const entries: [string, string][] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key && isChainKey(key)) {
      const value = storage.getItem(key);
      if (value !== null) entries.push([key, value]);
    }
  }
  return { app: 'chain', version: 1, createdAt: new Date().toISOString(), entries };
}

export function parseBackup(raw: string): ChainBackup {
  if (raw.length > 10_000_000) throw new Error('Backup is too large.');
  const value = JSON.parse(raw);
  if (value?.app !== 'chain' || value.version !== 1 || typeof value.createdAt !== 'string' || !Array.isArray(value.entries) || value.entries.length > 10_000) throw new Error('This is not a supported Chain backup.');
  const keys = new Set<string>();
  for (const entry of value.entries) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || !isChainKey(entry[0]) || typeof entry[1] !== 'string' || keys.has(entry[0])) throw new Error('The backup contains invalid entries.');
    keys.add(entry[0]);
  }
  return value;
}

function replaceEntries(storage: LocalStore, backup: ChainBackup) {
  const keys = captureBackup(storage).entries.map(([key]) => key);
  for (const key of keys) storage.removeItem(key);
  for (const [key, value] of backup.entries) storage.setItem(key, value);
}

/** Run before mounting data providers: an interrupted restore rolls back to the original snapshot. */
export function recoverInterruptedRestore(storage: LocalStore) {
  const journal = storage.getItem(JOURNAL);
  if (journal === null) return;
  replaceEntries(storage, parseBackup(journal));
  storage.removeItem(JOURNAL);
}

export function restoreBackup(storage: LocalStore, backup: ChainBackup) {
  const validated = parseBackup(JSON.stringify(backup));
  recoverInterruptedRestore(storage);
  const previous = captureBackup(storage);
  // If there is insufficient room for the recovery journal, fail before touching user data.
  storage.setItem(JOURNAL, JSON.stringify(previous));
  try {
    replaceEntries(storage, validated);
    storage.removeItem(JOURNAL);
  } catch (error) {
    recoverInterruptedRestore(storage);
    throw error;
  }
}
