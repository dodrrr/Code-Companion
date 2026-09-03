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
