import { decodeGateEventStore, emptyGateEventStore, migrateLegacyGateEvents, retainGateEvents, type GateChoice, type GateEvent, type GateEventStore } from '../domain/gateStats.ts';
import { createVersionedRepository, type KeyValueStorage } from './versionedRepository.ts';

export const GATE_EVENTS_KEY = '@chain_gate_events_v4';
export const LEGACY_GATE_EVENTS_KEY = '@chain_gate_save_events';

export function createGateEventsRepository(storage: KeyValueStorage, now = Date.now) {
  const repository = createVersionedRepository({ storage, key: GATE_EVENTS_KEY, version: 1, decode: decodeGateEventStore, empty: emptyGateEventStore });
  let queue: Promise<void> = Promise.resolve();
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.catch(() => undefined).then(operation);
    queue = result.then(() => undefined, () => undefined);
    return result;
  }
  async function load(): Promise<GateEventStore> {
    const result = await repository.readWithMetadata();
    if (result.source === 'unsupported' || result.source === 'invalid') throw new Error(`Gate history is ${result.source}; it was not overwritten.`);
    if (result.value.legacyImported) return result.value;
    const raw = await storage.getItem(LEGACY_GATE_EVENTS_KEY);
    let legacy: GateEvent[] = [];
    if (raw !== null) {
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { throw new Error('Previous Gate history could not be read; it was not overwritten.'); }
      const decoded = migrateLegacyGateEvents(parsed);
      if (decoded === null) throw new Error('Previous Gate history has an unsupported format; it was not overwritten.');
      legacy = decoded;
    }
    const next = { legacyImported: true, events: [...legacy, ...result.value.events] };
    await repository.write(next);
    // Keep the old key byte-for-byte. Old "saved" markers are not verified use.
    return next;
  }
  async function append(event: GateEvent): Promise<void> {
    const current = await load();
    const existing = current.events.find((item) => item.id === event.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(event)) throw new Error('Conflicting Gate event ID.');
      return;
    }
    if (event.at > now() + 60_000) throw new Error('Gate event time is in the future.');
    const candidate = { ...current, events: [...current.events, event] };
    if (!decodeGateEventStore(candidate)) throw new Error('Invalid Gate event sequence.');
    await repository.write({ ...candidate, events: retainGateEvents(candidate.events, now()) });
  }
  return {
    read: () => enqueue(load),
    beginPreview: (attemptId: string, appId: string, at: number, windowId?: string) => enqueue(() => append({ id: `${attemptId}:shown`, kind: 'attempt', attemptId, at, appId, source: 'preview', ...(windowId ? { windowId } : {}) })),
    decidePreview: (attemptId: string, choice: GateChoice, at: number) => enqueue(async () => {
      const current = await load();
      const existing = current.events.find((event) => event.kind === 'decision' && event.attemptId === attemptId);
      if (existing?.kind === 'decision') {
        if (existing.choice !== choice) throw new Error('This Gate already has a decision.');
        return;
      }
      await append({ id: `${attemptId}:decision`, kind: 'decision', attemptId, at, choice, source: 'preview' });
    }),
  };
}
