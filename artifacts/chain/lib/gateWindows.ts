import AsyncStorage from '@react-native-async-storage/async-storage';

export type GateWindow = {
  id: string;
  name: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  days: number[];
  appIds: string[];
  mode?: 'scheduled' | 'onDemand';
  onDemandDurationMinutes?: number;
  /** A same-day manual override. It lets a saved window be used outside its schedule. */
  manualActive?: boolean;
  manualDate?: string;
  manualActivatedAt?: number;
  /** Minutes Chain has observed as protected for each local day. */
  protectedMinutesByDate?: Record<string, number>;
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
    startMinute: typeof window.startMinute === 'number' ? Math.max(0, Math.min(59, window.startMinute)) : 0,
    endHour: typeof window.endHour === 'number' ? Math.max(0, Math.min(23, window.endHour)) : 11,
    endMinute: typeof window.endMinute === 'number' ? Math.max(0, Math.min(59, window.endMinute)) : 0,
    days: Array.isArray(window.days) ? window.days.filter((day): day is number => typeof day === 'number' && day >= 0 && day <= 6) : [],
    appIds: Array.isArray(window.appIds) ? window.appIds.filter((id): id is string => typeof id === 'string') : [],
    mode: window.mode === 'onDemand' ? 'onDemand' : 'scheduled',
    onDemandDurationMinutes: typeof window.onDemandDurationMinutes === 'number' ? Math.max(5, Math.min(360, Math.round(window.onDemandDurationMinutes))) : 60,
    manualActive: typeof window.manualActive === 'boolean' ? window.manualActive : undefined,
    manualDate: typeof window.manualDate === 'string' ? window.manualDate : undefined,
    manualActivatedAt: typeof window.manualActivatedAt === 'number' ? window.manualActivatedAt : undefined,
    protectedMinutesByDate: window.protectedMinutesByDate && typeof window.protectedMinutesByDate === 'object'
      ? Object.entries(window.protectedMinutesByDate).reduce<Record<string, number>>((result, [date, minutes]) => {
          if (typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0) result[date] = Math.round(minutes);
          return result;
        }, {})
      : {},
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

export function formatGateHour(hour: number, minute = 0) {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export function gateWindowSchedule(window: GateWindow) {
  if (window.mode === 'onDemand') return `On demand · ${formatGateWindowMinutes(window.onDemandDurationMinutes ?? 60)}`;
  return `${formatGateHour(window.startHour, window.startMinute)}–${formatGateHour(window.endHour, window.endMinute)}`;
}

export const gateDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const gateWindowDurationMinutes = (window: GateWindow) => Math.max(0, (window.endHour * 60 + window.endMinute) - (window.startHour * 60 + window.startMinute));
export const formatGateWindowMinutes = (minutes: number) => minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes}m`;

export type GateWindowStatus = {
  active: boolean;
  manual: boolean;
  scheduledToday: boolean;
  skippedToday: boolean;
  completedToday: boolean;
  remainingMinutes: number;
  protectedMinutesToday: number;
};

export function getGateWindowStatus(window: GateWindow, date = new Date()): GateWindowStatus {
  const onDemand = window.mode === 'onDemand';
  const duration = onDemand ? window.onDemandDurationMinutes ?? 60 : gateWindowDurationMinutes(window);
  const dayKey = gateDateKey(date);
  const nowMinutes = date.getHours() * 60 + date.getMinutes();
  const start = window.startHour * 60 + window.startMinute;
  const end = window.endHour * 60 + window.endMinute;
  const scheduledToday = !onDemand && window.days.includes(date.getDay());
  const hasManualOverride = window.manualDate === dayKey;

  if (onDemand && !hasManualOverride) return { active: false, manual: false, scheduledToday: false, skippedToday: false, completedToday: false, remainingMinutes: 0, protectedMinutesToday: 0 };

  if (hasManualOverride) {
    if (!window.manualActive) return { active: false, manual: onDemand, scheduledToday, skippedToday: !onDemand, completedToday: false, remainingMinutes: 0, protectedMinutesToday: 0 };
    const activatedAt = window.manualActivatedAt ?? date.getTime();
    const elapsed = Math.max(0, Math.floor((date.getTime() - activatedAt) / 60000));
    const protectedMinutesToday = Math.min(duration, elapsed);
    const active = elapsed < duration;
    return { active, manual: true, scheduledToday, skippedToday: false, completedToday: !active && duration > 0, remainingMinutes: active ? Math.max(1, duration - elapsed) : 0, protectedMinutesToday };
  }

  const active = scheduledToday && nowMinutes >= start && nowMinutes < end;
  const completedToday = scheduledToday && nowMinutes >= end;
  const protectedMinutesToday = !scheduledToday || nowMinutes < start ? 0 : completedToday ? duration : Math.max(0, nowMinutes - start);
  return { active, manual: false, scheduledToday, skippedToday: false, completedToday, remainingMinutes: active ? Math.max(1, end - nowMinutes) : 0, protectedMinutesToday };
}

export function toggleGateWindowSkipToday(window: GateWindow, date = new Date()): GateWindow {
  const skipped = window.manualDate === gateDateKey(date) && window.manualActive === false;
  if (skipped) {
    return { ...window, manualActive: undefined, manualDate: undefined, manualActivatedAt: undefined };
  }
  return {
    ...window,
    manualActive: false,
    manualDate: gateDateKey(date),
    manualActivatedAt: undefined,
  };
}

export function startGateWindowOnDemand(window: GateWindow, date = new Date()): GateWindow {
  return { ...window, manualActive: true, manualDate: gateDateKey(date), manualActivatedAt: date.getTime() };
}

/** Persist a conservative local log of scheduled/manual protection while Chain is able to observe it. */
export function syncGateWindowProgress(windows: GateWindow[], date = new Date()) {
  const dateKey = gateDateKey(date);
  let changed = false;
  const next = windows.map((window) => {
    const status = getGateWindowStatus(window, date);
    const existing = window.protectedMinutesByDate?.[dateKey] ?? 0;
    if (status.protectedMinutesToday <= existing) return window;
    changed = true;
    return { ...window, protectedMinutesByDate: { ...window.protectedMinutesByDate, [dateKey]: status.protectedMinutesToday } };
  });
  return changed ? next : windows;
}

export function getGateWindowWeekMinutes(windows: GateWindow[], date = new Date()) {
  const monday = new Date(date);
  const offset = (date.getDay() + 6) % 7;
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - offset);
  const start = gateDateKey(monday);
  const end = gateDateKey(date);
  return windows.reduce((total, window) => total + Object.entries(window.protectedMinutesByDate ?? {}).reduce((sum, [key, minutes]) => key >= start && key <= end ? sum + minutes : sum, 0), 0);
}
