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
  /** Dates already evaluated for recovery, so a day can never earn progress twice. */
  freezeRecoveryCountedDates?: string[];
  freezeSystemVersion: number;
  restDays: number[];
  cadence: 'daily' | 'weekly';
  weeklyTarget: number;
  completionTimes: Record<string, string>;
}

export type DayStatus = 'done' | 'minimum' | 'frozen' | 'missed';

/** Read-only fields shared by Chains, Plan and Gate when evaluating a promise. */
export interface ChainCommitment {
  createdAt: string;
  cadence: 'daily' | 'weekly';
  weeklyTarget: number;
  restDays: readonly number[];
  completedDates: readonly string[];
  minimumDates: readonly string[];
  frozenDates: readonly string[];
}

export interface ChainCommitmentStatus {
  status: 'not-started' | 'rest' | 'done' | 'minimum' | 'frozen' | 'weekly-target-met' | 'pending';
  /** Eligible for today's summary; daily rest days are not due. */
  isDue: boolean;
  /** The promise is covered, which need not mean an action was logged today. */
  isKept: boolean;
  weeklyProgress: number;
  weeklyTargetMet: boolean;
}

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
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;

  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
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

/** Reject new schedules with no active day without rewriting legacy records. */
export function normalizeRestDayUpdate(values: unknown): number[] | null {
  const days = normalizeRestDays(values);
  return days.length < 7 ? days : null;
}

export function normalizeWeeklyTarget(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7 ? value : 3;
}

export function isRestDay(chain: Pick<ChainCommitment, 'cadence' | 'restDays'>, date: string): boolean {
  if (chain.cadence === 'weekly') return false;
  return (chain.restDays ?? []).includes(getLocalDateFromString(date).getDay());
}

function getWeekStart(value: Date): Date {
  const date = new Date(value);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

export function getWeeklyProgress(
  chain: Pick<ChainCommitment, 'completedDates' | 'minimumDates'>,
  referenceDate = getTodayStr(),
): number {
  const start = getWeekStart(getLocalDateFromString(referenceDate));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const startKey = toLocalDateString(start);
  const endKey = toLocalDateString(end);
  return new Set([...chain.completedDates, ...chain.minimumDates].filter((date) => date >= startKey && date <= endKey)).size;
}

export function getChainCommitmentStatus(
  chain: ChainCommitment,
  requestedDate = getTodayStr(),
): ChainCommitmentStatus {
  const date = isDateKey(requestedDate) ? requestedDate : getTodayStr();
  const weeklyProgress = chain.cadence === 'weekly' ? getWeeklyProgress(chain, date) : 0;
  const weeklyTargetMet = chain.cadence === 'weekly' && weeklyProgress >= chain.weeklyTarget;
  let status: ChainCommitmentStatus['status'];

  if (chain.createdAt > date) status = 'not-started';
  else if (isRestDay(chain, date)) status = 'rest';
  else if (chain.completedDates.includes(date)) status = 'done';
  else if (chain.minimumDates.includes(date)) status = 'minimum';
  else if (weeklyTargetMet) status = 'weekly-target-met';
  else if (chain.cadence === 'daily' && chain.frozenDates.includes(date)) status = 'frozen';
  else status = 'pending';

  return {
    status,
    isDue: status !== 'not-started' && status !== 'rest',
    isKept: status !== 'not-started' && status !== 'pending',
    weeklyProgress,
    weeklyTargetMet,
  };
}

export function isChainKeptOnDate(chain: ChainCommitment, date = getTodayStr()): boolean {
  return getChainCommitmentStatus(chain, date).isKept;
}

/** The primary completion action upgrades a minimum; only Done is undone. */
export function getNextCompletionStatus(
  chain: Pick<ChainCommitment, 'completedDates'>,
  date = getTodayStr(),
): 'done' | 'missed' {
  return chain.completedDates.includes(date) ? 'missed' : 'done';
}

export function normalizeChain(value: unknown): Chain | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Chain>;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const color = typeof raw.color === 'string' ? raw.color.trim() : '';
  if (!id || !name || !color || !isDateKey(raw.createdAt)) return null;

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
  const freezeRecoveryCountedDates = Array.from(
    new Set([...uniqueDateKeys(raw.freezeRecoveryCountedDates), ...completedDates]),
  );

  return {
    id,
    name,
    color,
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
    ...(freezeRecoveryCountedDates.length > 0 ? { freezeRecoveryCountedDates } : {}),
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
  const normalized = source.map(normalizeChain).filter((chain): chain is Chain => chain !== null);
  return source.length > 0 && normalized.length === 0 ? null : normalized;
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
  if (!isDateKey(referenceDate) || referenceDate < chain.createdAt) return 0;
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
  // Old records can contain seven rest days. Preserve them, but never scan
  // indefinitely: by the existing rules completions on rest days do not count.
  if (normalizeRestDays(chain.restDays).length === 7) return 0;
  let streak = 0;
  let scannedDays = 0;
  // Preserve the existing 3,650-completion limit even with six rest days per
  // week, plus every stored Freeze that can bridge another active day.
  const maxScannedDays = (3650 + frozen.size) * 7;
  const date = getLocalDateFromString(referenceDate);

  if (!coveredDays.has(referenceDate)) date.setDate(date.getDate() - 1);

  while (streak < 3650 && scannedDays < maxScannedDays) {
    const dateKey = toLocalDateString(date);
    if (dateKey < chain.createdAt) break;
    scannedDays += 1;
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
  // Existing weekly Freeze dates remain editable/refundable, but a new one
  // must not spend credit for a weekly streak it cannot protect.
  if (status === 'frozen' && chain.cadence !== 'daily') {
    return { accepted: false, changed: false, chain };
  }
  if (status === 'frozen' && !wasFrozen && chain.freezeCredits <= 0) {
    return { accepted: false, changed: false, chain };
  }

  const completedDates = chain.completedDates.filter((day) => day !== date);
  const minimumDates = chain.minimumDates.filter((day) => day !== date);
  const frozenDates = chain.frozenDates.filter((day) => day !== date);
  const completionTimes = { ...chain.completionTimes };
  let freezeCredits = chain.freezeCredits;
  let freezeRecoveryProgress = chain.freezeRecoveryProgress;
  const freezeRecoveryCountedDates = new Set([
    ...(chain.freezeRecoveryCountedDates ?? []),
    ...chain.completedDates,
  ].filter(isDateKey));

  if (status === 'done') {
    completedDates.push(date);
    completionTimes[date] = completedAt;
    const isFirstCountedCompletion = !freezeRecoveryCountedDates.has(date);
    freezeRecoveryCountedDates.add(date);
    if (!wasDone && isFirstCountedCompletion && freezeCredits < MAX_FREEZE_CREDITS) {
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
      freezeRecoveryCountedDates: Array.from(freezeRecoveryCountedDates),
    },
  };
}
