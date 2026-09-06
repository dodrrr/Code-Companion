export const GATE_RETENTION_DAYS = 90;
export const GATE_DAY_MS = 86_400_000;
export type GatePeriod = 7 | 28 | 90;
export type GateChoice = 'leave' | 'continue';

// Only this app's interactive preview is instrumented. Route parameters and
// AppState cannot promote a preview to a verified cross-app observation.
export type GateEvent =
  | { id: string; kind: 'attempt'; attemptId: string; at: number; appId: string; source: 'preview'; windowId?: string }
  | { id: string; kind: 'decision'; attemptId: string; at: number; choice: GateChoice; source: 'preview' }
  | { id: string; kind: 'legacy'; at: number; appId: string; source: 'unverified'; reportedSource?: 'native' | 'preview'; reportedOutcome?: 'saved' | 'opened'; windowId?: string };

export interface GateEventStore { legacyImported: boolean; events: GateEvent[] }
export const emptyGateEventStore = (): GateEventStore => ({ legacyImported: false, events: [] });
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 240;
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function decodeEvent(value: unknown): GateEvent | null {
  if (!record(value) || !id(value.id) || !timestamp(value.at)) return null;
  if (value.kind === 'attempt' && value.source === 'preview' && id(value.attemptId) && id(value.appId) && (value.windowId === undefined || id(value.windowId))) {
    return { id: value.id, kind: 'attempt', attemptId: value.attemptId, at: value.at, appId: value.appId, source: 'preview', ...(value.windowId ? { windowId: value.windowId as string } : {}) };
  }
  if (value.kind === 'decision' && value.source === 'preview' && id(value.attemptId) && (value.choice === 'leave' || value.choice === 'continue')) {
    return { id: value.id, kind: 'decision', attemptId: value.attemptId, at: value.at, choice: value.choice, source: 'preview' };
  }
  if (value.kind === 'legacy' && value.source === 'unverified' && id(value.appId) && (value.windowId === undefined || id(value.windowId)) && (value.reportedSource === undefined || value.reportedSource === 'native' || value.reportedSource === 'preview') && (value.reportedOutcome === undefined || value.reportedOutcome === 'saved' || value.reportedOutcome === 'opened')) {
    return { id: value.id, kind: 'legacy', at: value.at, appId: value.appId, source: 'unverified', ...(value.reportedSource ? { reportedSource: value.reportedSource } : {}), ...(value.reportedOutcome ? { reportedOutcome: value.reportedOutcome } : {}), ...(value.windowId ? { windowId: value.windowId as string } : {}) };
  }
  return null;
}

export function decodeGateEventStore(value: unknown): GateEventStore | null {
  if (!record(value) || typeof value.legacyImported !== 'boolean' || !Array.isArray(value.events)) return null;
  const events: GateEvent[] = [];
  const eventIds = new Set<string>();
  const attempts = new Map<string, Extract<GateEvent, { kind: 'attempt' }>>();
  for (const candidate of value.events) {
    const event = decodeEvent(candidate);
    if (!event || eventIds.has(event.id)) return null;
    eventIds.add(event.id);
    if (event.kind === 'attempt') {
      if (attempts.has(event.attemptId)) return null;
      attempts.set(event.attemptId, event);
    }
    events.push(event);
  }
  const decided = new Set<string>();
  for (const event of events) {
    if (event.kind !== 'decision') continue;
    const attempt = attempts.get(event.attemptId);
    if (!attempt || event.at < attempt.at || decided.has(event.attemptId)) return null;
    decided.add(event.attemptId);
  }
  return { legacyImported: value.legacyImported, events };
}

export function migrateLegacyGateEvents(value: unknown): GateEvent[] | null {
  if (!Array.isArray(value)) return null;
  const events: GateEvent[] = [];
  for (const [index, item] of value.entries()) {
    if (!record(item) || !id(item.appId) || !timestamp(item.at) || (item.outcome !== undefined && item.outcome !== 'saved' && item.outcome !== 'opened') || (item.source !== undefined && item.source !== 'native' && item.source !== 'preview') || (item.windowId !== undefined && !id(item.windowId))) return null;
    events.push({ id: `legacy-${index}-${item.at}`, kind: 'legacy', at: item.at, appId: item.appId, source: 'unverified', ...(item.source ? { reportedSource: item.source } : {}), ...(item.outcome ? { reportedOutcome: item.outcome } : {}), ...(item.windowId ? { windowId: item.windowId as string } : {}) });
  }
  return events;
}

/** Retention is enforced on new writes. A read never erases old history. */
export function retainGateEvents(events: GateEvent[], now: number): GateEvent[] {
  const cutoff = now - GATE_RETENTION_DAYS * GATE_DAY_MS;
  const retainedAttempts = new Set(events.filter((event) => event.kind === 'attempt' && event.at >= cutoff).map((event) => event.kind === 'attempt' ? event.attemptId : ''));
  return events.filter((event) => event.kind === 'decision' ? retainedAttempts.has(event.attemptId) : event.at >= cutoff);
}

export interface GateSummary {
  attempts: number; leave: number; continued: number; pending: number;
  knownDecisions: number; leaveRate: number | null; unverified: number;
  observedOutcomes: number; outcomeStatus: 'unavailable';
  byApp: { appId: string; attempts: number; leave: number; continued: number; pending: number }[];
}

export function summarizeGateEvents(events: GateEvent[], period: GatePeriod, now = Date.now()): GateSummary {
  const cutoff = now - period * GATE_DAY_MS;
  const attempts = events.filter((event): event is Extract<GateEvent, { kind: 'attempt' }> => event.kind === 'attempt' && event.at >= cutoff && event.at <= now);
  const decisions = new Map(events.filter((event): event is Extract<GateEvent, { kind: 'decision' }> => event.kind === 'decision' && event.at <= now).map((event) => [event.attemptId, event]));
  const byApp = new Map<string, GateSummary['byApp'][number]>();
  let leave = 0;
  let continued = 0;
  for (const attempt of attempts) {
    const app = byApp.get(attempt.appId) ?? { appId: attempt.appId, attempts: 0, leave: 0, continued: 0, pending: 0 };
    app.attempts += 1;
    const choice = decisions.get(attempt.attemptId)?.choice;
    if (choice === 'leave') { leave += 1; app.leave += 1; }
    else if (choice === 'continue') { continued += 1; app.continued += 1; }
    else app.pending += 1;
    byApp.set(attempt.appId, app);
  }
  const knownDecisions = leave + continued;
  return {
    attempts: attempts.length, leave, continued, pending: attempts.length - knownDecisions,
    knownDecisions, leaveRate: knownDecisions ? leave / knownDecisions : null,
    unverified: events.filter((event) => event.kind === 'legacy' && event.at >= cutoff && event.at <= now).length,
    observedOutcomes: 0, outcomeStatus: 'unavailable',
    byApp: [...byApp.values()].sort((a, b) => b.attempts - a.attempts || a.appId.localeCompare(b.appId)),
  };
}
