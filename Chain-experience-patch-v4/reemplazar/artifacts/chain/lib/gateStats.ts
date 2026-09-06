import AsyncStorage from '@react-native-async-storage/async-storage';
import { createGateEventsRepository } from './gateEventsRepository';
import { summarizeGateEvents, type GateChoice, type GatePeriod } from '../domain/gateStats';

const repository = createGateEventsRepository(AsyncStorage);
export type { GateSummary, GatePeriod } from '../domain/gateStats';

export const createGateAttemptId = () => `preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
export const beginGatePreview = (attemptId: string, appId: string, at: number) => repository.beginPreview(attemptId, appId, at);
export const recordGatePreviewDecision = (attemptId: string, choice: GateChoice, at = Date.now()) => repository.decidePreview(attemptId, choice, at);
export async function getGateInsights(period: GatePeriod) {
  return summarizeGateEvents((await repository.read()).events, period);
}

// Compatibility: real outcomes are unavailable. Previews and legacy markers
// cannot become verified saves merely by reading this API.
export type GateSaveEvent = { appId: string; at: number; windowId?: string; outcome?: 'saved' | 'opened'; source?: 'native' | 'preview' };
export async function getGateSaves24h(): Promise<GateSaveEvent[]> { await repository.read(); return []; }
export async function getGateAttempts24h(): Promise<GateSaveEvent[]> { await repository.read(); return []; }

/** Legacy demo entry points; always preview provenance. */
export async function recordGateSave(appId: string): Promise<GateSaveEvent[]> {
  const attemptId = createGateAttemptId();
  const at = Date.now();
  await beginGatePreview(attemptId, appId, at);
  await recordGatePreviewDecision(attemptId, 'leave', at);
  return [];
}
export async function recordGateOpenAnyway(appId: string): Promise<void> {
  const attemptId = createGateAttemptId();
  const at = Date.now();
  await beginGatePreview(attemptId, appId, at);
  await recordGatePreviewDecision(attemptId, 'continue', at);
}
