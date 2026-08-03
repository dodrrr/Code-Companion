import AsyncStorage from '@react-native-async-storage/async-storage';
import { getGateWindowStatus, getGateWindows } from './gateWindows';

const GATE_SAVE_EVENTS_KEY = '@chain_gate_save_events';
const DAY_MS = 24 * 60 * 60 * 1000;

export type GateSaveEvent = { appId: string; at: number; windowId?: string };

async function readRecentEvents(): Promise<GateSaveEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(GATE_SAVE_EVENTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const cutoff = Date.now() - DAY_MS;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is GateSaveEvent => Boolean(entry) && typeof entry.appId === 'string' && typeof entry.at === 'number' && entry.at >= cutoff)
      : [];
  } catch {
    return [];
  }
}

export async function getGateSaves24h(): Promise<GateSaveEvent[]> {
  const events = await readRecentEvents();
  await AsyncStorage.setItem(GATE_SAVE_EVENTS_KEY, JSON.stringify(events));
  return events;
}

export async function recordGateSave(appId: string): Promise<GateSaveEvent[]> {
  const now = new Date();
  const windows = await getGateWindows();
  const activeWindow = windows.find((window) => window.appIds.includes(appId) && getGateWindowStatus(window, now).active);
  const events = [...await readRecentEvents(), { appId, at: now.getTime(), ...(activeWindow ? { windowId: activeWindow.id } : {}) }];
  await AsyncStorage.setItem(GATE_SAVE_EVENTS_KEY, JSON.stringify(events));
  return events;
}
