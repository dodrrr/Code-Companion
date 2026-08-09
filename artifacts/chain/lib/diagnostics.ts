export type DiagnosticArea = 'storage' | 'notifications' | 'gate' | 'native';
export type DiagnosticSeverity = 'info' | 'warning' | 'error';

export interface DiagnosticEvent {
  timestamp: string;
  area: DiagnosticArea;
  operation: string;
  severity: DiagnosticSeverity;
  errorName?: string;
  errorMessage?: string;
  metadata?: Record<string, string | number | boolean>;
}

type DiagnosticSink = (event: DiagnosticEvent) => void;
const MAX_EVENTS = 100;
const events: DiagnosticEvent[] = [];
let sink: DiagnosticSink | undefined;

export function setDiagnosticSink(next?: DiagnosticSink) {
  sink = next;
}

export function reportDiagnostic(input: Omit<DiagnosticEvent, 'timestamp' | 'errorName' | 'errorMessage'> & { error?: unknown }) {
  const error = input.error instanceof Error ? input.error : undefined;
  const event: DiagnosticEvent = {
    timestamp: new Date().toISOString(),
    area: input.area,
    operation: input.operation,
    severity: input.severity,
    errorName: error?.name,
    errorMessage: error?.message.slice(0, 240),
    metadata: input.metadata,
  };
  events.push(event);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  sink?.(event);
  if (__DEV__ && input.severity === 'error') console.error(`[${input.area}] ${input.operation}`, error ?? 'Unknown error');
}

export const getRecentDiagnostics = () => [...events];
export const clearDiagnostics = () => { events.length = 0; };
