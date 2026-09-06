export interface PlanItem {
  id: string;
  text: string;
  timeSlot: string;
  completed: boolean;
  planDate: string;
  chainId?: string;
  color?: string;
  reminderMinutes?: number;
  notificationId?: string;
  isPriority?: boolean;
  repeatDays?: number[];
  repeatSourceId?: string;
  /** True only for an occurrence produced from a durable Repeat rule. */
  repeatGenerated?: boolean;
  durationMinutes?: number;
  gateWindowId?: string;
  completedAt?: string;
}

export type PlanItemOptions = Pick<
  PlanItem,
  | 'text'
  | 'timeSlot'
  | 'chainId'
  | 'color'
  | 'reminderMinutes'
  | 'isPriority'
  | 'repeatDays'
  | 'durationMinutes'
  | 'gateWindowId'
>;

export interface FocusLogEntry {
  itemId: string;
  chainId: string;
  date: string;
  minutes: number;
  completedAt: string;
}

export interface MorningBriefingTime {
  hour: number;
  minute: number;
}

export function decodeMorningBriefingTime(value: unknown): MorningBriefingTime | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { hour?: unknown; minute?: unknown };
  const minute = candidate.minute === undefined ? 0 : candidate.minute;
  if (
    !Number.isInteger(candidate.hour)
    || !Number.isInteger(minute)
    || (candidate.hour as number) < 0
    || (candidate.hour as number) > 23
    || (minute as number) < 0
    || (minute as number) > 59
  ) return null;
  return { hour: candidate.hour as number, minute: minute as number };
}

export function parsePlanTimeSlot(value: unknown): { hour: number; minute: number } | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2})(?::(\d{2}))?\s(AM|PM)$/.exec(value);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (match[3] === 'PM' && hour !== 12) hour += 12;
  if (match[3] === 'AM' && hour === 12) hour = 0;
  return { hour, minute };
}

export type PlanNotificationIntent = 'complete' | 'snooze' | 'open' | 'ignore';

export function isMorningBriefingNotificationData(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const value = data as { morningBriefing?: unknown; openPlan?: unknown; planItemId?: unknown };
  return value.morningBriefing === true || (value.openPlan === true && typeof value.planItemId !== 'string');
}

export function getPlanNotificationIntent(action: string, data: unknown): PlanNotificationIntent {
  if (!data || typeof data !== 'object') return 'ignore';
  const value = data as { planItemId?: unknown; planDate?: unknown; openPlan?: unknown };
  if (value.openPlan === true) return 'open';
  if (typeof value.planItemId !== 'string' || typeof value.planDate !== 'string') return 'ignore';
  if (action === 'chain_task_done') return 'complete';
  if (action === 'chain_task_snooze') return 'snooze';
  return 'open';
}

export function resolvePlanForDate(
  existing: PlanItem[],
  source: PlanItem[],
  targetDate: string,
  createId: () => string,
): PlanItem[] {
  const targetDay = new Date(`${targetDate}T12:00:00`).getDay();
  const sources = new Set(existing.map((item) => item.repeatSourceId).filter(Boolean));
  const repeated = source
    .filter((item) => {
      const sourceId = item.repeatSourceId || item.id;
      return item.repeatDays?.includes(targetDay) && !sources.has(sourceId);
    })
    .map((item) => ({
      ...item,
      id: createId(),
      completed: false,
      completedAt: undefined,
      planDate: targetDate,
      reminderMinutes: undefined,
      notificationId: undefined,
      isPriority: false,
      repeatSourceId: item.repeatSourceId || item.id,
    }));
  return [...existing, ...repeated];
}

export function toPlanDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getPlanTodayKey(reference = new Date()): string {
  return toPlanDateKey(reference);
}

export function getPlanTomorrowKey(reference = new Date()): string {
  const date = new Date(reference);
  date.setDate(date.getDate() + 1);
  return toPlanDateKey(date);
}

function normalizeRepeatDays(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const days = Array.from(
    new Set(value.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)),
  );
  return days.length ? days : undefined;
}

export function decodePlanItems(parsed: unknown, fallbackDate: string): PlanItem[] | null {
  if (!Array.isArray(parsed)) return null;
  const normalized = parsed.flatMap((value): PlanItem[] => {
      if (!value || typeof value !== 'object') return [];
      const item = value as Partial<PlanItem>;
      if (typeof item.id !== 'string' || typeof item.text !== 'string' || !item.text.trim()) return [];
      return [
        {
          id: item.id,
          text: item.text.trim(),
          timeSlot: typeof item.timeSlot === 'string' ? item.timeSlot : '',
          completed: item.completed === true,
          planDate: typeof item.planDate === 'string' ? item.planDate : fallbackDate,
          chainId: typeof item.chainId === 'string' ? item.chainId : undefined,
          color: typeof item.color === 'string' ? item.color : undefined,
          reminderMinutes:
            typeof item.reminderMinutes === 'number' && item.reminderMinutes >= 0
              ? item.reminderMinutes
              : undefined,
          notificationId: typeof item.notificationId === 'string' ? item.notificationId : undefined,
          isPriority: item.isPriority === true,
          repeatDays: normalizeRepeatDays(item.repeatDays),
          repeatSourceId: typeof item.repeatSourceId === 'string' ? item.repeatSourceId : undefined,
          repeatGenerated: item.repeatGenerated === true,
          durationMinutes:
            typeof item.durationMinutes === 'number' && item.durationMinutes > 0
              ? item.durationMinutes
              : undefined,
          gateWindowId: typeof item.gateWindowId === 'string' ? item.gateWindowId : undefined,
          completedAt: typeof item.completedAt === 'string' ? item.completedAt : undefined,
        },
      ];
  });
  return parsed.length > 0 && normalized.length === 0 ? null : normalized;
}

export function normalizePlanItems(raw: string | null, fallbackDate: string): PlanItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'data' in parsed) {
      return decodePlanItems((parsed as { data?: unknown }).data, fallbackDate) ?? [];
    }
    return decodePlanItems(parsed, fallbackDate) ?? [];
  } catch {
    return [];
  }
}

export function normalizeClosedDates(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? Array.from(new Set(parsed.filter((value): value is string => typeof value === 'string')))
      : [];
  } catch {
    return [];
  }
}

export function normalizeFocusLog(raw: string | null): FocusLogEntry[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is FocusLogEntry =>
            Boolean(
              entry &&
                typeof entry.itemId === 'string' &&
                typeof entry.chainId === 'string' &&
                typeof entry.date === 'string' &&
                typeof entry.minutes === 'number' &&
                entry.minutes > 0 &&
                typeof entry.completedAt === 'string',
            ),
        )
      : [];
  } catch {
    return [];
  }
}

/** Repeat rules outlive the daily tasks they produce. An empty weekday list stops a series. */
export interface PlanRepeatRevision {
  fromDate: string;
  text: string;
  timeSlot: string;
  repeatDays: number[];
  chainId?: string;
  color?: string;
  durationMinutes?: number;
  gateWindowId?: string;
}

export interface PlanRepeatRule {
  id: string;
  revisions: PlanRepeatRevision[];
  excludedDates: string[];
}

export interface PlanStorageState {
  migrated: boolean;
  days: Record<string, PlanItem[]>;
  repeatRules: Record<string, PlanRepeatRule>;
}

export const emptyPlanStorage = (): PlanStorageState => ({ migrated: false, days: {}, repeatRules: {} });

export function isPlanDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && toPlanDateKey(date) === value;
}

export function planRepeatRevision(item: PlanItem, fromDate = item.planDate): PlanRepeatRevision {
  return {
    fromDate,
    text: item.text,
    timeSlot: item.timeSlot,
    repeatDays: normalizeRepeatDays(item.repeatDays)?.sort((a, b) => a - b) ?? [],
    chainId: item.chainId,
    color: item.color,
    durationMinutes: item.durationMinutes,
    gateWindowId: item.gateWindowId,
  };
}

export function planRepeatRevisionForDate(rule: PlanRepeatRule, date: string): PlanRepeatRevision | undefined {
  return [...rule.revisions].reverse().find((revision) => revision.fromDate <= date);
}

/** Fail closed on malformed aggregate children; do not silently drop a saved day or rule. */
export function decodePlanStorage(value: unknown): PlanStorageState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const state = value as Partial<PlanStorageState>;
  if (typeof state.migrated !== 'boolean' || !state.days || typeof state.days !== 'object' || Array.isArray(state.days)
    || !state.repeatRules || typeof state.repeatRules !== 'object' || Array.isArray(state.repeatRules)) return null;
  const days: Record<string, PlanItem[]> = {};
  for (const [date, raw] of Object.entries(state.days)) {
    if (!isPlanDateKey(date)) return null;
    const items = decodePlanItems(raw, date);
    if (!items || items.length !== raw.length || items.some((item) => item.planDate !== date)) return null;
    days[date] = items;
  }
  const repeatRules: Record<string, PlanRepeatRule> = {};
  for (const [id, raw] of Object.entries(state.repeatRules)) {
    if (!id || !raw || raw.id !== id || !Array.isArray(raw.revisions) || !raw.revisions.length || !Array.isArray(raw.excludedDates)) return null;
    const revisions: PlanRepeatRevision[] = [];
    for (const revision of raw.revisions) {
      if (!revision || !isPlanDateKey(revision.fromDate) || !Array.isArray(revision.repeatDays)) return null;
      if (revision.repeatDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) return null;
      const [item] = decodePlanItems([{ ...revision, id, planDate: revision.fromDate, completed: false }], revision.fromDate) ?? [];
      if (!item) return null;
      revisions.push(planRepeatRevision(item, revision.fromDate));
    }
    if (new Set(revisions.map((revision) => revision.fromDate)).size !== revisions.length) return null;
    if (raw.excludedDates.some((date) => typeof date !== 'string' || !isPlanDateKey(date))) return null;
    repeatRules[id] = {
      id,
      revisions: revisions.sort((a, b) => a.fromDate.localeCompare(b.fromDate)),
      excludedDates: [...new Set(raw.excludedDates)],
    };
  }
  return { migrated: state.migrated, days, repeatRules };
}

/** Adds a missing occurrence once; a deleted occurrence is remembered independently of the day list. */
export function resolveRecurringPlanForDate(
  existing: PlanItem[],
  rules: Record<string, PlanRepeatRule>,
  date: string,
  createId: () => string,
): PlanItem[] {
  if (!isPlanDateKey(date)) throw new Error('Invalid Plan date');
  const day = new Date(`${date}T12:00:00`).getDay();
  const present = new Set(existing.map((item) => item.repeatSourceId || item.id));
  const next = [...existing];
  for (const rule of Object.values(rules)) {
    const revision = planRepeatRevisionForDate(rule, date);
    if (!revision?.repeatDays.includes(day) || rule.excludedDates.includes(date) || present.has(rule.id)) continue;
    const { fromDate: _fromDate, ...template } = revision;
    next.push({
      ...template,
      id: createId(),
      planDate: date,
      completed: false,
      isPriority: false,
      repeatSourceId: rule.id,
      repeatGenerated: true,
      // Reminder fields describe a real scheduled notification, never a copied intention.
      reminderMinutes: undefined,
      notificationId: undefined,
      completedAt: undefined,
    });
    present.add(rule.id);
  }
  return next.length === existing.length ? existing : next;
}

/** Seed only unambiguous current/next-day selections, never infer an active series from old history. */
export function migratePlanRepeatRules(days: Record<string, PlanItem[]>, today: string): PlanStorageState {
  const tomorrow = getPlanTomorrowKey(new Date(`${today}T12:00:00`));
  const candidates = new Map<string, PlanItem[]>();
  for (const item of [...(days[today] ?? []), ...(days[tomorrow] ?? [])]) {
    const id = item.repeatSourceId || item.id;
    candidates.set(id, [...(candidates.get(id) ?? []), item]);
  }
  const repeatRules: Record<string, PlanRepeatRule> = {};
  for (const [id, items] of candidates) {
    const fingerprints = items.map((item) => JSON.stringify({ ...planRepeatRevision(item), fromDate: '' }));
    if (new Set(fingerprints).size !== 1 || !items[0].repeatDays?.length) continue;
    repeatRules[id] = {
      id,
      revisions: [planRepeatRevision(items[0], items.some((item) => item.planDate === today) ? today : tomorrow)],
      excludedDates: [],
    };
  }
  return {
    migrated: true,
    repeatRules,
    days: Object.fromEntries(Object.entries(days).map(([date, items]) => [date, items.map((item) => {
      const id = item.repeatSourceId || item.id;
      return repeatRules[id]
        ? { ...item, repeatSourceId: id, repeatGenerated: item.repeatSourceId ? item.id !== id : false }
        : item;
    })])),
  };
}

/** Explicit edits update this series from this date forward. Completion/reminder mutations never call this. */
export function updatePlanRepeatRule(state: PlanStorageState, item: PlanItem, date: string): PlanStorageState {
  const id = item.repeatSourceId || item.id;
  const previous = state.repeatRules[id];
  if (!previous && !item.repeatDays?.length) return state;
  const revision = planRepeatRevision(item, date);
  const rule: PlanRepeatRule = {
    id,
    revisions: [...(previous?.revisions ?? []).filter((entry) => entry.fromDate < date), revision],
    excludedDates: previous?.excludedDates ?? [],
  };
  const days = { ...state.days };
  for (const [day, entries] of Object.entries(days)) {
    if (day <= date) continue;
    days[day] = entries.flatMap((entry): PlanItem[] => {
      if ((entry.repeatSourceId || entry.id) !== id || entry.completed) return [entry];
      const scheduled = revision.repeatDays.includes(new Date(`${day}T12:00:00`).getDay());
      if (entry.repeatGenerated && !scheduled) return [];
      const reminderChanged = entry.timeSlot !== revision.timeSlot || entry.text !== revision.text || entry.chainId !== revision.chainId;
      const { fromDate: _fromDate, ...template } = revision;
      return [{
        ...entry,
        ...template,
        repeatDays: revision.repeatDays.length ? revision.repeatDays : undefined,
        reminderMinutes: reminderChanged ? undefined : entry.reminderMinutes,
        notificationId: reminderChanged ? undefined : entry.notificationId,
      }];
    });
  }
  return { ...state, days, repeatRules: { ...state.repeatRules, [id]: rule } };
}
