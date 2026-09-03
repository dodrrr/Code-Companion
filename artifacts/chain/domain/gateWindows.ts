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
  /** Manual session state. `manualDate` is retained for legacy data and anchors the session start day. */
  manualActive?: boolean;
  manualDate?: string;
  manualActivatedAt?: number;
  manualEndedAt?: number;
  /** Snapshot used to add multiple on-demand sessions on the same local day without double-counting. */
  manualSessionBaselineByDate?: Record<string, number>;
  /** The local start date of a scheduled occurrence that has been skipped. */
  skippedOccurrenceDate?: string;
  /** When enabled, the shortcut should also turn on the user's matching Focus. */
  silenceNotifications?: boolean;
  /** Minutes from on-demand timers the user explicitly started, grouped by local day. */
  protectedMinutesByDate?: Record<string, number>;
};

export type GateWindowHistoryByWindow = Record<string, Record<string, number>>;

export type GateWindowsState = {
  windows: GateWindow[];
  /** Historical on-demand timer minutes keyed by deleted Window id. */
  archivedMinutesByWindow: GateWindowHistoryByWindow;
};

type NamedGateWindow = Pick<GateWindow, 'id' | 'name'>;

export const GATE_WINDOWS_SCHEMA_VERSION = 2;

const clampInteger = (value: unknown, minimum: number, maximum: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, Math.round(value)))
    : fallback;

/** Canonical display form used when comparing or saving a Window name. */
export function normalizeGateWindowName(name: string) {
  return name.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

/** A locale-stable approximation of Unicode default case folding for name keys. */
export function gateWindowNameKey(name: string) {
  return normalizeGateWindowName(name)
    .toLocaleLowerCase('en-US')
    // Lowercasing alone does not fold these common multi/contextual forms.
    .replace(/\u00df/gu, 'ss')
    .replace(/\u03c2/gu, '\u03c3')
    .normalize('NFKC');
}

export function isGateWindowNameTaken(
  name: string,
  windows: readonly NamedGateWindow[],
  excludedWindowId?: string,
) {
  const key = gateWindowNameKey(name);
  if (!key) return false;
  return windows.some((window) => (
    window.id !== excludedWindowId && gateWindowNameKey(window.name) === key
  ));
}

/** Return the base name, or its first free human-friendly suffix starting at 2. */
export function nextAvailableGateWindowName(
  baseName: string,
  windows: readonly NamedGateWindow[],
  excludedWindowId?: string,
) {
  const base = normalizeGateWindowName(baseName);
  if (!base || !isGateWindowNameTaken(base, windows, excludedWindowId)) return base;

  for (let suffix = 2; suffix < Number.MAX_SAFE_INTEGER; suffix += 1) {
    const candidate = `${base} ${suffix}`;
    if (!isGateWindowNameTaken(candidate, windows, excludedWindowId)) return candidate;
  }
  return base;
}

export function isValidGateDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function normalizeMinutesByDate(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value).reduce<Record<string, number>>((result, [date, minutes]) => {
    if (isValidGateDateKey(date) && typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0) {
      result[date] = Math.round(minutes);
    }
    return result;
  }, {});
}

export function normalizeGateWindow(value: unknown): GateWindow | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const window = value as Partial<GateWindow>;
  if (typeof window.id !== 'string' || !window.id.trim() || typeof window.name !== 'string') return undefined;
  const duration = window.onDemandDurationMinutes;
  const mode = window.mode === 'onDemand' ? 'onDemand' : 'scheduled';
  const validManualDate = typeof window.manualDate === 'string' && isValidGateDateKey(window.manualDate)
    ? window.manualDate
    : undefined;
  const legacySkipDate = mode === 'scheduled' && window.manualActive === false ? validManualDate : undefined;
  const explicitSkipDate = typeof window.skippedOccurrenceDate === 'string'
    && isValidGateDateKey(window.skippedOccurrenceDate)
    ? window.skippedOccurrenceDate
    : undefined;
  return {
    id: window.id.trim(),
    // Keep inherited display data intact; canonicalize only explicit editor saves.
    name: window.name.trim() || 'Protection window',
    startHour: clampInteger(window.startHour, 0, 23, 9),
    startMinute: clampInteger(window.startMinute, 0, 59, 0),
    endHour: clampInteger(window.endHour, 0, 23, 11),
    endMinute: clampInteger(window.endMinute, 0, 59, 0),
    days: Array.isArray(window.days)
      ? [...new Set(window.days.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6))]
      : [],
    appIds: Array.isArray(window.appIds)
      ? [...new Set(window.appIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
      : [],
    mode,
    onDemandDurationMinutes: mode === 'onDemand'
      ? duration === null ? null : clampInteger(duration, 5, 360, 60)
      : undefined,
    manualActive: mode === 'onDemand' && typeof window.manualActive === 'boolean' ? window.manualActive : undefined,
    manualDate: mode === 'onDemand' ? validManualDate : undefined,
    manualActivatedAt: mode === 'onDemand'
      && typeof window.manualActivatedAt === 'number'
      && Number.isFinite(window.manualActivatedAt)
      && window.manualActivatedAt >= 0
      ? window.manualActivatedAt
      : undefined,
    manualEndedAt: mode === 'onDemand'
      && typeof window.manualEndedAt === 'number'
      && Number.isFinite(window.manualEndedAt)
      && window.manualEndedAt >= 0
      ? window.manualEndedAt
      : undefined,
    manualSessionBaselineByDate: mode === 'onDemand'
      ? normalizeMinutesByDate(window.manualSessionBaselineByDate)
      : undefined,
    skippedOccurrenceDate: mode === 'scheduled' ? explicitSkipDate ?? legacySkipDate : undefined,
    silenceNotifications: window.silenceNotifications === true,
    protectedMinutesByDate: normalizeMinutesByDate(window.protectedMinutesByDate),
  };
}

function normalizeArchive(value: unknown): GateWindowHistoryByWindow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value).reduce<GateWindowHistoryByWindow>((result, [windowId, minutes]) => {
    if (!windowId.trim()) return result;
    const normalized = normalizeMinutesByDate(minutes);
    if (Object.keys(normalized).length) result[windowId.trim()] = normalized;
    return result;
  }, {});
}

/** Decode both the legacy Window array and the versioned state payload. */
export function decodeGateWindowsState(value: unknown): GateWindowsState | null {
  if (Array.isArray(value)) {
    const windows = value.map(normalizeGateWindow).filter((entry): entry is GateWindow => Boolean(entry));
    if (value.length > 0 && windows.length === 0) return null;
    return {
      windows,
      archivedMinutesByWindow: {},
    };
  }
  if (!value || typeof value !== 'object') return null;
  const state = value as Partial<GateWindowsState>;
  if (!Array.isArray(state.windows)) return null;
  const windows = state.windows
    .map(normalizeGateWindow)
    .filter((entry): entry is GateWindow => Boolean(entry));
  if (state.windows.length > 0 && windows.length === 0) return null;
  return {
    windows,
    archivedMinutesByWindow: normalizeArchive(state.archivedMinutesByWindow),
  };
}

export const emptyGateWindowsState = (): GateWindowsState => ({ windows: [], archivedMinutesByWindow: {} });

function mergeMinutesByDate(left: Record<string, number>, right: Record<string, number>) {
  const merged = { ...left };
  for (const [date, minutes] of Object.entries(right)) {
    merged[date] = Math.max(merged[date] ?? 0, minutes);
  }
  return merged;
}

/** Archive observations from removed Windows without mutating the current collection. */
export function transitionGateWindowsState(previous: GateWindowsState, nextWindows: GateWindow[]): GateWindowsState {
  const normalizedWindows = nextWindows
    .map(normalizeGateWindow)
    .filter((entry): entry is GateWindow => Boolean(entry));
  const nextIds = new Set(normalizedWindows.map((window) => window.id));
  const archivedMinutesByWindow = { ...previous.archivedMinutesByWindow };

  for (const window of previous.windows) {
    if (nextIds.has(window.id)) continue;
    const observed = window.protectedMinutesByDate ?? {};
    if (!Object.keys(observed).length) continue;
    archivedMinutesByWindow[window.id] = mergeMinutesByDate(
      archivedMinutesByWindow[window.id] ?? {},
      observed,
    );
  }

  return { windows: normalizedWindows, archivedMinutesByWindow };
}

export function formatGateHour(hour: number, minute = 0) {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export const formatGateWindowMinutes = (minutes: number) => minutes >= 60
  ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`
  : `${minutes}m`;

const GATE_WINDOW_DAY_OPTIONS = [
  { value: 1, shortLabel: 'Mon' },
  { value: 2, shortLabel: 'Tue' },
  { value: 3, shortLabel: 'Wed' },
  { value: 4, shortLabel: 'Thu' },
  { value: 5, shortLabel: 'Fri' },
  { value: 6, shortLabel: 'Sat' },
  { value: 0, shortLabel: 'Sun' },
] as const;

export function gateWindowDescriptor(window: GateWindow) {
  if (window.mode === 'onDemand') {
    return window.onDemandDurationMinutes === null
      ? 'On demand · Open-ended'
      : `On demand · ${formatGateWindowMinutes(window.onDemandDurationMinutes ?? 60)}`;
  }

  const selectedDays = new Set(window.days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6));
  const everyDay = GATE_WINDOW_DAY_OPTIONS.every(({ value }) => selectedDays.has(value));
  const weekdays = selectedDays.size === 5
    && GATE_WINDOW_DAY_OPTIONS.slice(0, 5).every(({ value }) => selectedDays.has(value));
  const repeat = everyDay
    ? 'Every day'
    : weekdays
      ? 'Weekdays'
      : GATE_WINDOW_DAY_OPTIONS
        .filter(({ value }) => selectedDays.has(value))
        .map(({ shortLabel }) => shortLabel)
        .join(', ') || 'No days';
  return `${repeat} · ${formatGateHour(window.startHour, window.startMinute)}–${formatGateHour(window.endHour, window.endMinute)}`;
}

/**
 * Disambiguate only inherited duplicates that would otherwise render identically.
 * The stored name is never changed and collection order defines the stable ordinal.
 */
export function gateWindowDisplayName(window: GateWindow, windows: readonly GateWindow[]) {
  const key = gateWindowNameKey(window.name);
  const descriptor = gateWindowDescriptor(window);
  const matching = windows.filter((candidate) => (
    gateWindowNameKey(candidate.name) === key && gateWindowDescriptor(candidate) === descriptor
  ));
  if (matching.length < 2) return window.name;

  let index = matching.indexOf(window);
  if (index < 0) index = matching.findIndex((candidate) => candidate.id === window.id);
  return index < 0 ? window.name : `${window.name} · Window ${index + 1}`;
}

export function gateWindowSchedule(window: GateWindow) {
  if (window.mode === 'onDemand') {
    return window.onDemandDurationMinutes === null
      ? 'On demand · Until you finish'
      : `On demand · ${formatGateWindowMinutes(window.onDemandDurationMinutes ?? 60)}`;
  }
  return `${formatGateHour(window.startHour, window.startMinute)}–${formatGateHour(window.endHour, window.endMinute)}`;
}

export const gateDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const previousLocalDate = (date: Date) => {
  const previous = new Date(date);
  previous.setDate(previous.getDate() - 1);
  return previous;
};

const localDayStart = (date: Date) => new Date(
  date.getFullYear(),
  date.getMonth(),
  date.getDate(),
).getTime();

export const gateWindowDurationMinutes = (window: GateWindow) => {
  const start = window.startHour * 60 + window.startMinute;
  const end = window.endHour * 60 + window.endMinute;
  if (start === end) return 0;
  return end > start ? end - start : (24 * 60 - start) + end;
};

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

const inactiveStatus = (overrides: Partial<GateWindowStatus> = {}): GateWindowStatus => ({
  active: false,
  manual: false,
  scheduledToday: false,
  skippedToday: false,
  completedToday: false,
  remainingMinutes: 0,
  remainingSeconds: 0,
  elapsedSeconds: 0,
  unbounded: false,
  protectedMinutesToday: 0,
  ...overrides,
});

function intervalMinutesOnDay(startMs: number, endMs: number, date: Date) {
  const dayStart = localDayStart(date);
  const nextDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
  const overlap = Math.max(0, Math.min(endMs, nextDay) - Math.max(startMs, dayStart));
  return Math.floor(overlap / 60_000);
}

function getOnDemandStatus(window: GateWindow, date: Date): GateWindowStatus {
  const dayKey = gateDateKey(date);
  const now = date.getTime();
  const activatedAt = window.manualActivatedAt;
  const unbounded = window.onDemandDurationMinutes === null;
  const duration = window.onDemandDurationMinutes ?? 60;
  const durationSeconds = duration * 60;
  const recordedToday = window.protectedMinutesByDate?.[dayKey] ?? 0;

  if (typeof activatedAt !== 'number') {
    return inactiveStatus({
      manual: true,
      unbounded,
      completedToday: typeof window.manualEndedAt === 'number' && gateDateKey(new Date(window.manualEndedAt)) === dayKey,
      protectedMinutesToday: recordedToday,
    });
  }

  const naturalEnd = activatedAt + durationSeconds * 1_000;
  const explicitEnd = typeof window.manualEndedAt === 'number' ? window.manualEndedAt : undefined;
  const effectiveEnd = explicitEnd === undefined
    ? unbounded ? now : Math.min(now, naturalEnd)
    : unbounded ? explicitEnd : Math.min(explicitEnd, naturalEnd);
  const sessionEnd = Math.max(activatedAt, effectiveEnd);
  const elapsedSeconds = Math.max(0, Math.floor((Math.min(now, sessionEnd) - activatedAt) / 1_000));
  const active = window.manualActive === true
    && now >= activatedAt
    && explicitEnd === undefined
    && (unbounded || now < naturalEnd);
  const remainingSeconds = active && !unbounded
    ? Math.max(1, durationSeconds - Math.max(0, Math.floor((now - activatedAt) / 1_000)))
    : 0;
  const calculatedToday = intervalMinutesOnDay(activatedAt, sessionEnd, date);
  const baselineToday = window.manualSessionBaselineByDate?.[dayKey];
  const protectedMinutesToday = baselineToday === undefined
    ? Math.max(recordedToday, calculatedToday)
    : Math.max(recordedToday, baselineToday + calculatedToday);
  const completionTime = explicitEnd === undefined
    ? !unbounded && now >= naturalEnd ? naturalEnd : undefined
    : unbounded ? explicitEnd : Math.min(explicitEnd, naturalEnd);

  return {
    active,
    manual: true,
    scheduledToday: false,
    skippedToday: false,
    completedToday: typeof completionTime === 'number' && gateDateKey(new Date(completionTime)) === dayKey,
    remainingMinutes: remainingSeconds ? Math.ceil(remainingSeconds / 60) : 0,
    remainingSeconds,
    elapsedSeconds: active
      ? Math.max(0, Math.floor((now - activatedAt) / 1_000))
      : elapsedSeconds,
    unbounded,
    protectedMinutesToday,
  };
}

export function getGateWindowStatus(window: GateWindow, date = new Date()): GateWindowStatus {
  if (window.mode === 'onDemand') return getOnDemandStatus(window, date);

  const nowMinutes = date.getHours() * 60 + date.getMinutes();
  const nowSeconds = date.getHours() * 3_600 + date.getMinutes() * 60 + date.getSeconds();
  const start = window.startHour * 60 + window.startMinute;
  const end = window.endHour * 60 + window.endMinute;
  const crossesMidnight = end <= start && end !== start;
  const previousDay = (date.getDay() + 6) % 7;
  const startsToday = window.days.includes(date.getDay());
  const continuesFromYesterday = crossesMidnight && window.days.includes(previousDay) && nowMinutes < end;
  const scheduledToday = startsToday || continuesFromYesterday;
  const occurrenceDate = continuesFromYesterday ? previousLocalDate(date) : date;
  const occurrenceKey = gateDateKey(occurrenceDate);
  const legacySkipDate = window.manualActive === false ? window.manualDate : undefined;
  const skippedOccurrence = window.skippedOccurrenceDate ?? legacySkipDate;
  const skippedToday = skippedOccurrence === occurrenceKey;

  if (skippedToday) {
    return inactiveStatus({ scheduledToday, skippedToday: true });
  }

  const duration = gateWindowDurationMinutes(window);
  const durationSeconds = duration * 60;
  const startSeconds = start * 60;
  const activeFromToday = startsToday && nowMinutes >= start && (!crossesMidnight ? nowMinutes < end : true);
  const active = activeFromToday || continuesFromYesterday;
  const previousOccurrenceSkipped = crossesMidnight
    && skippedOccurrence === gateDateKey(previousLocalDate(date));
  const completedToday = !crossesMidnight
    ? startsToday && nowMinutes >= end
    : !previousOccurrenceSkipped && window.days.includes(previousDay) && nowMinutes >= end && nowMinutes < start;
  const elapsedSeconds = active
    ? continuesFromYesterday
      ? Math.max(0, (24 * 60 - start) * 60 + nowSeconds)
      : Math.max(0, nowSeconds - startSeconds)
    : 0;
  const remainingSeconds = active ? Math.max(1, durationSeconds - elapsedSeconds) : 0;
  return {
    active,
    manual: false,
    scheduledToday,
    skippedToday: false,
    completedToday,
    remainingMinutes: remainingSeconds ? Math.ceil(remainingSeconds / 60) : 0,
    remainingSeconds,
    elapsedSeconds,
    unbounded: false,
    // A schedule passing is not proof that native protection ran. Scheduled
    // Windows therefore expose timing state without creating a protection log.
    protectedMinutesToday: 0,
  };
}

function scheduledOccurrenceKey(window: GateWindow, date: Date) {
  const start = window.startHour * 60 + window.startMinute;
  const end = window.endHour * 60 + window.endMinute;
  const nowMinutes = date.getHours() * 60 + date.getMinutes();
  const crossesMidnight = end <= start && end !== start;
  const previousDay = (date.getDay() + 6) % 7;
  const continuesFromYesterday = crossesMidnight && window.days.includes(previousDay) && nowMinutes < end;
  return gateDateKey(continuesFromYesterday ? previousLocalDate(date) : date);
}

/** Whether the current or next same-day occurrence can still be skipped/restored. */
export function canToggleGateWindowSkip(window: GateWindow, date = new Date()) {
  if (window.mode === 'onDemand') return false;
  const start = window.startHour * 60 + window.startMinute;
  const end = window.endHour * 60 + window.endMinute;
  if (start === end) return false;
  const nowMinutes = date.getHours() * 60 + date.getMinutes();
  const crossesMidnight = end < start;
  if (!crossesMidnight) return window.days.includes(date.getDay()) && nowMinutes < end;

  const previousDay = (date.getDay() + 6) % 7;
  const continuingPreviousOccurrence = window.days.includes(previousDay) && nowMinutes < end;
  return continuingPreviousOccurrence || window.days.includes(date.getDay());
}

export function toggleGateWindowSkipToday(window: GateWindow, date = new Date()): GateWindow {
  const occurrenceKey = scheduledOccurrenceKey(window, date);
  const currentSkip = window.skippedOccurrenceDate
    ?? (window.manualActive === false ? window.manualDate : undefined);
  if (currentSkip === occurrenceKey) {
    return {
      ...window,
      skippedOccurrenceDate: undefined,
      manualActive: undefined,
      manualDate: undefined,
      manualActivatedAt: undefined,
    };
  }
  return {
    ...window,
    skippedOccurrenceDate: occurrenceKey,
    manualActive: false,
    manualDate: occurrenceKey,
    manualActivatedAt: undefined,
  };
}

export function startGateWindowOnDemand(window: GateWindow, date = new Date()): GateWindow {
  return {
    ...window,
    manualActive: true,
    manualDate: gateDateKey(date),
    manualActivatedAt: date.getTime(),
    manualEndedAt: undefined,
    manualSessionBaselineByDate: { ...window.protectedMinutesByDate },
  };
}

function sessionMinutesByLocalDate(startMs: number, endMs: number) {
  const result: Record<string, number> = {};
  if (endMs <= startMs) return result;
  const cursor = new Date(startMs);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() < endMs) {
    const key = gateDateKey(cursor);
    const minutes = intervalMinutesOnDay(startMs, endMs, cursor);
    if (minutes > 0) result[key] = minutes;
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function materializeOnDemandSessionMinutes(window: GateWindow, observedAt: Date) {
  const activatedAt = window.manualActivatedAt;
  const explicitEnd = window.manualEndedAt;
  const existing = { ...window.protectedMinutesByDate };
  if (
    typeof activatedAt !== 'number'
    || observedAt.getTime() <= activatedAt
    || (window.manualActive !== true && typeof explicitEnd !== 'number')
  ) {
    return existing;
  }

  const observedEnd = typeof explicitEnd === 'number' ? explicitEnd : observedAt.getTime();
  const naturalEnd = window.onDemandDurationMinutes === null
    ? observedEnd
    : activatedAt + (window.onDemandDurationMinutes ?? 60) * 60_000;
  const effectiveEnd = Math.max(activatedAt, Math.min(observedEnd, naturalEnd));
  const sessionMinutes = sessionMinutesByLocalDate(activatedAt, effectiveEnd);

  for (const [dateKey, minutes] of Object.entries(sessionMinutes)) {
    const baseline = window.manualSessionBaselineByDate?.[dateKey];
    const total = baseline === undefined
      ? Math.max(existing[dateKey] ?? 0, minutes)
      : baseline + minutes;
    existing[dateKey] = Math.max(existing[dateKey] ?? 0, total);
  }
  return existing;
}

export function endGateWindowOnDemand(window: GateWindow, date = new Date()): GateWindow {
  const activatedAt = window.manualActivatedAt;
  const endedAt = date.getTime();
  if (typeof activatedAt !== 'number') {
    return { ...window, manualActive: false, manualEndedAt: endedAt, manualSessionBaselineByDate: undefined };
  }

  const protectedMinutesByDate = materializeOnDemandSessionMinutes(
    { ...window, manualActive: false, manualEndedAt: endedAt },
    date,
  );

  return {
    ...window,
    manualActive: false,
    manualEndedAt: endedAt,
    manualSessionBaselineByDate: undefined,
    protectedMinutesByDate,
  };
}

/** Persist only on-demand timers explicitly started inside Chain. */
export function syncGateWindowProgress(windows: GateWindow[], date = new Date()) {
  let changed = false;
  const next = windows.map((window) => {
    if (window.mode === 'onDemand') {
      const protectedMinutesByDate = materializeOnDemandSessionMinutes(window, date);
      const existing = window.protectedMinutesByDate ?? {};
      const keys = new Set([...Object.keys(existing), ...Object.keys(protectedMinutesByDate)]);
      if ([...keys].every((key) => existing[key] === protectedMinutesByDate[key])) return window;
      changed = true;
      return { ...window, protectedMinutesByDate };
    }

    return window;
  });
  return changed ? next : windows;
}

function minutesInRange(minutesByDate: Record<string, number>, start: string, end: string) {
  return Object.entries(minutesByDate).reduce(
    (sum, [key, minutes]) => key >= start && key <= end ? sum + minutes : sum,
    0,
  );
}

export function getGateWindowDayMinutesFromState(
  windows: GateWindow[],
  archivedMinutesByWindow: GateWindowHistoryByWindow,
  date = new Date(),
) {
  const dateKey = gateDateKey(date);
  const current = windows.reduce(
    (total, window) => total + (window.protectedMinutesByDate?.[dateKey] ?? 0),
    0,
  );
  const archived = Object.values(archivedMinutesByWindow).reduce(
    (total, minutes) => total + (minutes[dateKey] ?? 0),
    0,
  );
  return current + archived;
}

export function getGateWindowWeekMinutesFromState(
  windows: GateWindow[],
  archivedMinutesByWindow: GateWindowHistoryByWindow,
  date = new Date(),
) {
  const monday = new Date(date);
  const offset = (date.getDay() + 6) % 7;
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - offset);
  const start = gateDateKey(monday);
  const end = gateDateKey(date);
  const activeMinutes = windows.reduce(
    (total, window) => total + minutesInRange(window.protectedMinutesByDate ?? {}, start, end),
    0,
  );
  const archivedMinutes = Object.values(archivedMinutesByWindow).reduce(
    (total, minutes) => total + minutesInRange(minutes, start, end),
    0,
  );
  return activeMinutes + archivedMinutes;
}

export type IdentifiedGateWindow = { id: string };

/** Remove one saved window without mutating the collection used by the UI. */
export function removeGateWindow<T extends IdentifiedGateWindow>(windows: T[], windowId: string) {
  return windows.filter((window) => window.id !== windowId);
}
