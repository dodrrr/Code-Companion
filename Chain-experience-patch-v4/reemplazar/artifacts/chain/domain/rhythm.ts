import { getTodayStr, isDateKey, type Chain, type ChainScheduleRevision } from './chains.ts';
import { focusLogOccurrenceKey, type FocusLogEntry } from './plan.ts';

export type RhythmPeriod = 7 | 28 | 90;
export type RhythmDayStatus = 'done' | 'minimum' | 'frozen' | 'rest' | 'missed' | 'open' | 'unlogged';
export interface RhythmReport {
  periodDays: RhythmPeriod;
  startDate: string;
  endDate: string;
  counts: Record<'done' | 'minimum' | 'frozen' | 'rest' | 'missed' | 'open', number>;
  days: { date: string; status: RhythmDayStatus }[];
  adherence: { unit: 'days' | 'weeks'; numerator: number; denominator: number; rate: number | null };
  comparison: { previousRate: number; changePoints: number } | null;
  weekly: { currentProgress: number; currentTarget: number; closedWeeks: number; metWeeks: number } | null;
  scheduleAssumption: boolean;
  scheduleChanged: boolean;
  checkIns: {
    sampleCount: number;
    missingCount: number;
    retrospectiveCount: number;
    buckets: { key: string; label: string; count: number }[];
    mostCommonLabel: string | null;
  };
  focus: { minutes: number; sessions: number; legacySessions: number };
}

function shift(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function weekday(date: string): number { return new Date(`${date}T12:00:00Z`).getUTCDay(); }
function monday(date: string): string { return shift(date, -((weekday(date) + 6) % 7)); }
function datesBetween(start: string, end: string): string[] {
  const result: string[] = [];
  for (let date = start; date <= end && result.length < 400; date = shift(date, 1)) result.push(date);
  return result;
}
function rate(numerator: number, denominator: number): number | null {
  return denominator ? Math.round(1000 * numerator / denominator) / 10 : null;
}
function signature(rule: Pick<ChainScheduleRevision, 'cadence' | 'weeklyTarget' | 'restDays'>): string {
  return rule.cadence === 'weekly' ? `weekly:${rule.weeklyTarget}` : `daily:${[...rule.restDays].sort().join(',')}`;
}
function schedule(chain: Chain, date: string): { rule: ChainScheduleRevision; known: boolean } {
  const revisions = [...(chain.scheduleHistory ?? [])].sort((a, b) => a.fromDate.localeCompare(b.fromDate));
  const revision = revisions.filter((candidate) => candidate.fromDate <= date).at(-1);
  return { rule: revision ?? { fromDate: chain.createdAt, cadence: chain.cadence, weeklyTarget: chain.weeklyTarget, restDays: chain.restDays }, known: !!revision };
}
function logged(chain: Chain, date: string): boolean {
  return chain.completedDates.includes(date) || chain.minimumDates.includes(date);
}
function closedWeeks(chain: Chain, start: string, end: string, today: string): { start: string; met: boolean }[] {
  const weeks: { start: string; met: boolean }[] = [];
  let first = monday(start);
  if (first < start) first = shift(first, 7);
  for (let week = first; shift(week, 6) <= end && shift(week, 6) < today; week = shift(week, 7)) {
    if (week < chain.createdAt) continue;
    const days = datesBetween(week, shift(week, 6));
    const rule = schedule(chain, week).rule;
    // A changed target/cadence partway through a week has no single fair target.
    if (rule.cadence !== 'weekly' || days.some((date) => signature(schedule(chain, date).rule) !== signature(rule))) continue;
    weeks.push({ start: week, met: days.filter((date) => logged(chain, date)).length >= rule.weeklyTarget });
  }
  return weeks;
}

/** Pure, calendar-key based selector: never derives measured activity from plans. */
export function buildChainRhythm(chain: Chain, {
  periodDays = 28,
  referenceDate = getTodayStr(),
  focusLog = [],
}: { periodDays?: RhythmPeriod; referenceDate?: string; focusLog?: readonly FocusLogEntry[] } = {}): RhythmReport {
  if (![7, 28, 90].includes(periodDays) || !isDateKey(referenceDate)) throw new Error('Invalid Rhythm period');
  const startDate = shift(referenceDate, 1 - periodDays);
  const start = chain.createdAt > startDate ? chain.createdAt : startDate;
  const activeDates = datesBetween(start, referenceDate);
  const counts: RhythmReport['counts'] = { done: 0, minimum: 0, frozen: 0, rest: 0, missed: 0, open: 0 };
  const scheduleAssumption = activeDates.some((date) => !schedule(chain, date).known);
  const scheduleChanged = new Set(activeDates.map((date) => signature(schedule(chain, date).rule))).size > 1;
  const days: RhythmReport['days'] = activeDates.map((date) => {
    const rule = schedule(chain, date).rule;
    let status: RhythmDayStatus;
    // Logged activity remains real even if it was done on a scheduled rest day.
    if (chain.completedDates.includes(date)) status = 'done';
    else if (chain.minimumDates.includes(date)) status = 'minimum';
    else if (chain.frozenDates.includes(date)) status = 'frozen';
    else if (rule.cadence === 'daily' && rule.restDays.includes(weekday(date))) status = 'rest';
    else if (date === referenceDate) status = 'open';
    else status = rule.cadence === 'weekly' ? 'unlogged' : 'missed';
    if (status !== 'unlogged') counts[status] += 1;
    return { date, status };
  });

  const closed = activeDates.filter((date) => date < referenceDate);
  const due = closed.filter((date) => {
    const rule = schedule(chain, date).rule;
    return rule.cadence === 'daily' && !rule.restDays.includes(weekday(date));
  });
  const weeks = closedWeeks(chain, start, referenceDate, referenceDate);
  const numerator = chain.cadence === 'weekly' ? weeks.filter((week) => week.met).length : due.filter((date) => logged(chain, date)).length;
  const denominator = chain.cadence === 'weekly' ? weeks.length : due.length;
  const currentRate = scheduleChanged ? null : rate(numerator, denominator);
  const adherence: RhythmReport['adherence'] = { unit: chain.cadence === 'weekly' ? 'weeks' : 'days', numerator, denominator, rate: currentRate };
  let comparison: RhythmReport['comparison'] = null;
  if (currentRate !== null && !scheduleAssumption && !scheduleChanged) {
    let previousNumerator = 0;
    let previousDenominator = 0;
    let previousDates: string[] = [];
    if (chain.cadence === 'weekly' && weeks.length >= 2) {
      const previousStart = shift(weeks[0].start, -7 * weeks.length);
      const previousEnd = shift(weeks[0].start, -1);
      const priorWeeks = closedWeeks(chain, previousStart, previousEnd, referenceDate);
      if (priorWeeks.length === weeks.length) {
        previousNumerator = priorWeeks.filter((week) => week.met).length;
        previousDenominator = priorWeeks.length;
        previousDates = datesBetween(previousStart, previousEnd);
      }
    } else if (chain.cadence === 'daily' && due.length >= 5 && closed.length >= 5) {
      const previousEnd = shift(closed[0], -1);
      const previousStart = shift(previousEnd, 1 - closed.length);
      if (previousStart >= chain.createdAt) {
        previousDates = datesBetween(previousStart, previousEnd);
        const priorDue = previousDates.filter((date) => !schedule(chain, date).rule.restDays.includes(weekday(date)));
        if (priorDue.length >= 5) {
          previousNumerator = priorDue.filter((date) => logged(chain, date)).length;
          previousDenominator = priorDue.length;
        }
      }
    }
    const comparable = previousDates.length > 0 && previousDates.every((date) => {
      const entry = schedule(chain, date);
      return entry.known && signature(entry.rule) === signature(schedule(chain, referenceDate).rule);
    });
    const previousRate = comparable ? rate(previousNumerator, previousDenominator) : null;
    if (previousRate !== null) comparison = { previousRate, changePoints: Math.round((currentRate - previousRate) * 10) / 10 };
  }

  const buckets = [
    { key: 'morning', label: 'Morning · 6–12', count: 0 },
    { key: 'afternoon', label: 'Afternoon · 12–18', count: 0 },
    { key: 'evening', label: 'Evening · 18–24', count: 0 },
    { key: 'night', label: 'Night · 0–6', count: 0 },
  ];
  let sampleCount = 0;
  let missingCount = 0;
  let retrospectiveCount = 0;
  for (const date of activeDates.filter((value) => logged(chain, value))) {
    const entry = chain.checkIns?.[date];
    if (!entry || !Number.isFinite(Date.parse(entry.recordedAt)) || !Number.isInteger(entry.timezoneOffsetMinutes)
      || Math.abs(entry.timezoneOffsetMinutes) > 840 || entry.status !== (chain.completedDates.includes(date) ? 'done' : 'minimum')) {
      missingCount += 1;
      continue;
    }
    const local = new Date(Date.parse(entry.recordedAt) - entry.timezoneOffsetMinutes * 60_000);
    if (entry.retrospective || local.toISOString().slice(0, 10) !== date) { retrospectiveCount += 1; continue; }
    const hour = local.getUTCHours();
    const key = hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    buckets.find((bucket) => bucket.key === key)!.count += 1;
    sampleCount += 1;
  }
  const max = Math.max(...buckets.map((bucket) => bucket.count));
  const winners = buckets.filter((bucket) => bucket.count === max);
  const mostCommonLabel = sampleCount >= 5 && winners.length === 1 ? winners[0].label : null;

  const seen = new Set<string>();
  const focus: RhythmReport['focus'] = { minutes: 0, sessions: 0, legacySessions: 0 };
  for (const entry of [...focusLog].sort((a, b) => Number(b.source === 'timer') - Number(a.source === 'timer'))) {
    if (entry.chainId !== chain.id || entry.date < start || entry.date > referenceDate
      || !Number.isFinite(entry.minutes) || entry.minutes <= 0) continue;
    const key = focusLogOccurrenceKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    if (entry.source === 'timer') { focus.minutes += entry.minutes; focus.sessions += 1; }
    else focus.legacySessions += 1;
  }
  const currentWeekStart = monday(referenceDate);
  const currentProgress = datesBetween(currentWeekStart > chain.createdAt ? currentWeekStart : chain.createdAt, referenceDate).filter((date) => logged(chain, date)).length;
  return {
    periodDays, startDate, endDate: referenceDate, counts, days, adherence, comparison,
    weekly: chain.cadence === 'weekly' ? { currentProgress, currentTarget: chain.weeklyTarget, closedWeeks: weeks.length, metWeeks: weeks.filter((week) => week.met).length } : null,
    scheduleAssumption, scheduleChanged,
    checkIns: { sampleCount, missingCount, retrospectiveCount, buckets, mostCommonLabel }, focus,
  };
}
