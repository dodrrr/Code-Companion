import AsyncStorage from '@react-native-async-storage/async-storage';

export type GateWindow = {
  id: string;
  name: string;
  startHour: number;
  endHour: number;
  days: number[];
  appIds: string[];
};

const GATE_WINDOWS_KEY = '@chain_gate_windows';

function normalize(value: unknown): GateWindow | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const window = value as Partial<GateWindow>;
  if (typeof window.id !== 'string' || typeof window.name !== 'string') return undefined;
  return {
    id: window.id,
    name: window.name.trim() || 'Protection window',
    startHour: typeof window.startHour === 'number' ? Math.max(0, Math.min(23, window.startHour)) : 9,
    endHour: typeof window.endHour === 'number' ? Math.max(0, Math.min(23, window.endHour)) : 11,
    days: Array.isArray(window.days) ? window.days.filter((day): day is number => typeof day === 'number' && day >= 0 && day <= 6) : [],
    appIds: Array.isArray(window.appIds) ? window.appIds.filter((id): id is string => typeof id === 'string') : [],
  };
}

export async function getGateWindows(): Promise<GateWindow[]> {
  try {
    const raw = await AsyncStorage.getItem(GATE_WINDOWS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalize).filter((entry): entry is GateWindow => Boolean(entry)) : [];
  } catch {
    return [];
  }
}

export async function saveGateWindows(windows: GateWindow[]) {
  await AsyncStorage.setItem(GATE_WINDOWS_KEY, JSON.stringify(windows));
}

export function formatGateHour(hour: number) {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12} ${suffix}`;
}

export function gateWindowSchedule(window: GateWindow) {
  return `${formatGateHour(window.startHour)}–${formatGateHour(window.endHour)}`;
}
