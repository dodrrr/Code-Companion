export const MAX_FREEZE_CREDITS = 2;
export const COMPLETIONS_PER_FREEZE = 14;

export interface Chain {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  completedDates: string[];
  minimumDates: string[];
  minimumLabel: string;
  frozenDates: string[];
  freezeCredits: number;
  freezeRecoveryProgress: number;
  freezeSystemVersion: number;
  restDays: number[];
  cadence: 'daily' | 'weekly';
  weeklyTarget: number;
  completionTimes: Record<string, string>;
}

export type DayStatus = 'done' | 'minimum' | 'frozen' | 'missed';

export interface DayStatusResult {
  accepted: boolean;
  changed: boolean;
  chain: Chain;
}

export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayStr(): string {
  return toLocalDateString(new Date());
}

export function getLocalDateFromString(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function uniqueDateKeys(values: unknown): string[] {
  return Array.from(new Set(Array.isArray(values) ? values.filter(isDateKey) : []));
}

export function normalizeRestDays(values: unknown): number[] {
  return Array.from(
    new Set(
      Array.isArray(values)
        ? values.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
        : [],
    ),
  );
}

export function normalizeWeeklyTarget(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7 ? value : 3;
}

export function isRestDay(chain: Chain, date: string): boolean {
  if (chain.cadence === 'weekly') return false;
  return (chain.restDays ?? []).includes(getLocalDateFromString(date).getDay());
}

function getWeekStart(value: Date): Date {
  const date = new Date(value);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

export function getWeeklyProgress(chain: Chain, referenceDate = getTodayStr()): number {
  const start = getWeekStart(getLocalDateFromString(referenceDate));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const startKey = toLocalDateString(start);
  const endKey = toLocalDateString(end);
  return new Set([...chain.completedDates, ...chain.minimumDates].filter((date) => date >= startKey && date <= endKey)).size;
}

export function normalizeChain(value: unknown): Chain | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Chain>;
  if (!raw.id || !raw.name || !raw.color || !isDateKey(raw.createdAt)) return null;

  const completedDates = uniqueDateKeys(raw.completedDates);
  const minimumDates = uniqueDateKeys(raw.minimumDates).filter((date) => !completedDates.includes(date));
  const frozenDates = uniqueDateKeys(raw.frozenDates).filter(
    (date) => !completedDates.includes(date) && !minimumDates.includes(date),
  );
  const storedFreezeCredits =
    typeof raw.freezeCredits === 'number' && Number.isInteger(raw.freezeCredits)
      ? Math.max(0, Math.min(MAX_FREEZE_CREDITS, raw.freezeCredits))
      : null;
  const isLegacyFreezeSystem = raw.freezeSystemVersion !== 2;
  const freezeCredits =
    isLegacyFreezeSystem &&
    (storedFreezeCredits === null || (storedFreezeCredits === 1 && frozenDates.length === 0))
      ? MAX_FREEZE_CREDITS
      : storedFreezeCredits ?? MAX_FREEZE_CREDITS;

  return {
    id: raw.id,
    name: raw.name.trim(),
    color: raw.color,
    createdAt: raw.createdAt,
    completedDates,
    minimumDates,
    minimumLabel:
      typeof raw.minimumLabel === 'string' && raw.minimumLabel.trim()
        ? raw.minimumLabel.trim().slice(0, 48)
        : 'A small version',
    frozenDates,
    freezeCredits,
    freezeRecoveryProgress:
      typeof raw.freezeRecoveryProgress === 'number' && Number.isInteger(raw.freezeRecoveryProgress)
        ? Math.max(0, Math.min(COMPLETIONS_PER_FREEZE - 1, raw.freezeRecoveryProgress))
        : 0,
    freezeSystemVersion: 2,
    restDays: normalizeRestDays(raw.restDays),
    cadence: raw.cadence === 'weekly' ? 'weekly' : 'daily',
    weeklyTarget: normalizeWeeklyTarget(raw.weeklyTarget),
    completionTimes:
      raw.completionTimes && typeof raw.completionTimes === 'object'
        ? Object.fromEntries(
            Object.entries(raw.completionTimes).filter(
              ([date, completionTime]) => isDateKey(date) && typeof completionTime === 'string',
            ),
          )
        : {},
  };
}

export function decodeChains(value: unknown): Chain[] | null {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { chains?: unknown }).chains)
      ? (value as { chains: unknown[] }).chains
      : null;
  if (source === null) return null;
  return source.map(normalizeChain).filter((chain): chain is Chain => chain !== null);
}

export function parseChains(raw: string | null): Chain[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'data' in parsed) {
      return decodeChains((parsed as { data?: unknown }).data) ?? [];
    }
    return decodeChains(parsed) ?? [];
  } catch {
    return [];
  }
}

export function getStreak(chain: Chain, referenceDate = getTodayStr()): number {
  if (chain.cadence === 'weekly') {
    let weekStart = getWeekStart(getLocalDateFromString(referenceDate));
    if (getWeeklyProgress(chain, referenceDate) < chain.weeklyTarget) weekStart.setDate(weekStart.getDate() - 7);

    let streak = 0;
    while (streak < 520) {
      const weekKey = toLocalDateString(weekStart);
      if (getWeeklyProgress(chain, weekKey) < chain.weeklyTarget) break;
      streak += 1;
      weekStart.setDate(weekStart.getDate() - 7);
    }
    return streak;
  }

  const completed = new Set([...chain.completedDates, ...chain.minimumDates]);
  const frozen = new Set(chain.frozenDates);
  const coveredDays = new Set([...completed, ...frozen]);
  let streak = 0;
  const date = getLocalDateFromString(referenceDate);

  if (!coveredDays.has(referenceDate)) date.setDate(date.getDate() - 1);

  while (streak < 3650) {
    const dateKey = toLocalDateString(date);
    if (isRestDay(chain, dateKey) || frozen.has(dateKey)) {
      date.setDate(date.getDate() - 1);
    } else if (completed.has(dateKey)) {
      streak += 1;
      date.setDate(date.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export function applyDayStatus(
  chain: Chain,
  date: string,
  status: DayStatus,
  completedAt = new Date().toISOString(),
): DayStatusResult {
  if (!isDateKey(date)) return { accepted: false, changed: false, chain };

  const wasDone = chain.completedDates.includes(date);
  const wasMinimum = chain.minimumDates.includes(date);
  const wasFrozen = chain.frozenDates.includes(date);
  const previousStatus: DayStatus = wasDone ? 'done' : wasMinimum ? 'minimum' : wasFrozen ? 'frozen' : 'missed';
  if (previousStatus === status) return { accepted: true, changed: false, chain };
  if (status === 'frozen' && !wasFrozen && chain.freezeCredits <= 0) {
    return { accepted: false, changed: false, chain };
  }

  const completedDates = chain.completedDates.filter((day) => day !== date);
  const minimumDates = chain.minimumDates.filter((day) => day !== date);
  const frozenDates = chain.frozenDates.filter((day) => day !== date);
  const completionTimes = { ...chain.completionTimes };
  let freezeCredits = chain.freezeCredits;
  let freezeRecoveryProgress = chain.freezeRecoveryProgress;

  if (status === 'done') {
    completedDates.push(date);
    completionTimes[date] = completedAt;
    if (!wasDone && freezeCredits < MAX_FREEZE_CREDITS) {
      freezeRecoveryProgress += 1;
      if (freezeRecoveryProgress >= COMPLETIONS_PER_FREEZE) {
        freezeCredits += 1;
        freezeRecoveryProgress = 0;
      }
    }
  } else if (status === 'minimum') {
    minimumDates.push(date);
    completionTimes[date] = completedAt;
  } else {
    delete completionTimes[date];
  }

  if (status === 'frozen') {
    frozenDates.push(date);
    if (!wasFrozen) {
      freezeCredits = Math.max(0, freezeCredits - 1);
      freezeRecoveryProgress = 0;
    }
  } else if (wasFrozen) {
    freezeCredits = Math.min(MAX_FREEZE_CREDITS, freezeCredits + 1);
    freezeRecoveryProgress = 0;
  }

  return {
    accepted: true,
    changed: true,
    chain: {
      ...chain,
      completedDates,
      minimumDates,
      frozenDates,
      completionTimes,
      freezeCredits,
      freezeRecoveryProgress,
    },
  };
}
