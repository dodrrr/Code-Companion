import { decodeFocusLog, focusLogOccurrenceKey, type FocusLogEntry, type PlanStorageState } from '../domain/plan.ts';
import type { KeyValueStorage } from './versionedRepository.ts';

export const LEGACY_FOCUS_LOG_KEY = '@chain_focus_log';

/** Preserves legacy bytes and fails visibly rather than silently reporting zero. */
export async function readRhythmHistory(
  storage: KeyValueStorage,
  readSnapshot: () => Promise<PlanStorageState>,
): Promise<FocusLogEntry[]> {
  const [snapshot, primary, backup] = await Promise.all([
    readSnapshot(), storage.getItem(LEGACY_FOCUS_LOG_KEY), storage.getItem(LEGACY_FOCUS_LOG_KEY + ':backup'),
  ]);
  const parsed = [primary, backup].map((raw): unknown => {
    try { return raw === null ? null : JSON.parse(raw); } catch { return null; }
  });
  // No released Chain version wrote an envelope to this legacy key. Do not
  // reinterpret a payload belonging to another/future schema as an empty log.
  if (parsed.some((value) => value && typeof value === 'object' && !Array.isArray(value) && 'data' in value)) {
    throw new Error('Focus history uses an unsupported format');
  }
  let legacy: FocusLogEntry[] = [];
  if (primary !== null || backup !== null) {
    const decoded = parsed.map(decodeFocusLog).find((value) => value !== null);
    if (!decoded) throw new Error('Saved focus history could not be read');
    legacy = decoded.map((entry) => ({ ...entry, source: 'legacy-unknown' as const }));
  }
  const measured = snapshot.focusLog ?? [];
  const keys = new Set(measured.map(focusLogOccurrenceKey));
  return [...legacy.filter((entry) => !keys.has(focusLogOccurrenceKey(entry))), ...measured];
}
