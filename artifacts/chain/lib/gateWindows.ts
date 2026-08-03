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
  /** `null` means an open-ended session that ends when the user finishes it. */
  onDemandDurationMinutes?: number | null;
  /** A same-day manual override. It lets a saved window be used outside its schedule. */
  manualActive?: boolean;
  manualDate?: string;
  manualActivatedAt?: number;
  manualEndedAt?: number;
  /** When enabled, the shortcut should also turn on the user's matching Focus. */
  silenceNotifications?: boolean;
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
    onDemandDurationMinutes: window.onDemandDurationMinutes === null ? null : typeof window.onDemandDurationMinutes === 'number' ? Math.max(5, Math.min(360, Math.round(window.onDemandDurationMinutes))) : 60,
    manualActive: typeof window.manualActive === 'boolean' ? window.manualActive : undefined,
    manualDate: typeof window.manualDate === 'string' ? window.manualDate : undefined,
    manualActivatedAt: typeof window.manualActivatedAt === 'number' ? window.manualActivatedAt : undefined,
    manualEndedAt: typeof window.manualEndedAt === 'number' ? window.manualEndedAt : undefined,
    silenceNotifications: window.silenceNotifications === true,
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
  if (window.mode === 'onDemand') return window.onDemandDurationMinutes === null ? 'On demand · Until you finish' : `On demand · ${formatGateWindowMinutes(window.onDemandDurationMinutes ?? 60)}`;
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
  remainingSeconds: number;
  elapsedSeconds: number;
  unbounded: boolean;
  protectedMinutesToday: number;
};

export function getGateWindowStatus(window: GateWindow, date = new Date()): GateWindowStatus {
  const onDemand = window.mode === 'onDemand';
  const unbounded = onDemand && window.onDemandDurationMinutes === null;
  const duration = onDemand ? window.onDemandDurationMinutes ?? 60 : gateWindowDurationMinutes(window);
  const durationSeconds = duration * 60;
  const dayKey = gateDateKey(date);
  const nowSeconds = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
  const nowMinutes = date.getHours() * 60 + date.getMinutes();
  const start = window.startHour * 60 + window.startMinute;
  const end = window.endHour * 60 + window.endMinute;
  const scheduledToday = !onDemand && window.days.includes(date.getDay());
  const hasManualOverride = window.manualDate === dayKey;

  if (onDemand && !hasManualOverride) return { active: false, manual: false, scheduledToday: false, skippedToday: false, completedToday: false, remainingMinutes: 0, remainingSeconds: 0, elapsedSeconds: 0, unbounded, protectedMinutesToday: 0 };

  if (hasManualOverride) {
    if (!window.manualActive) return { active: false, manual: onDemand, scheduledToday, skippedToday: !onDemand, completedToday: onDemand && Boolean(window.manualEndedAt), remainingMinutes: 0, remainingSeconds: 0, elapsedSeconds: 0, unbounded, protectedMinutesToday: 0 };
    const activatedAt = window.manualActivatedAt ?? date.getTime();
    const elapsedSeconds = Math.max(0, Math.floor((date.getTime() - activatedAt) / 1000));
    const protectedMinutesToday = unbounded ? Math.floor(elapsedSeconds / 60) : Math.min(duration, Math.floor(elapsedSeconds / 60));
    const active = unbounded || elapsedSeconds < durationSeconds;
    const remainingSeconds = active && !unbounded ? Math.max(1, durationSeconds - elapsedSeconds) : 0;
    return { active, manual: true, scheduledToday, skippedToday: false, completedToday: !active && duration > 0, remainingMinutes: remainingSeconds ? Math.ceil(remainingSeconds / 60) : 0, remainingSeconds, elapsedSeconds, unbounded, protectedMinutesToday };
  }

  const startSeconds = start * 60;
  const endSeconds = end * 60;
  const active = scheduledToday && nowSeconds >= startSeconds && nowSeconds < endSeconds;
  const completedToday = scheduledToday && nowMinutes >= end;
  const protectedMinutesToday = !scheduledToday || nowMinutes < start ? 0 : completedToday ? duration : Math.max(0, nowMinutes - start);
  const remainingSeconds = active ? Math.max(1, endSeconds - nowSeconds) : 0;
  return { active, manual: false, scheduledToday, skippedToday: false, completedToday, remainingMinutes: remainingSeconds ? Math.ceil(remainingSeconds / 60) : 0, remainingSeconds, elapsedSeconds: active ? Math.max(0, nowSeconds - startSeconds) : 0, unbounded: false, protectedMinutesToday };
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
  return { ...window, manualActive: true, manualDate: gateDateKey(date), manualActivatedAt: date.getTime(), manualEndedAt: undefined };
}

export function endGateWindowOnDemand(window: GateWindow, date = new Date()): GateWindow {
  const dateKey = gateDateKey(date);
  const status = getGateWindowStatus(window, date);
  const protectedMinutes = Math.max(window.protectedMinutesByDate?.[dateKey] ?? 0, status.protectedMinutesToday);
  return { ...window, manualActive: false, manualDate: dateKey, manualEndedAt: date.getTime(), protectedMinutesByDate: { ...window.protectedMinutesByDate, [dateKey]: protectedMinutes } };
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
