import { getChainCommitmentStatus, getTodayStr, isDateKey, type ChainCommitment } from './chains.ts';

export const GATE_RULES_SCHEMA_VERSION = 1;
export const GATE_DAILY_USAGE_OPTIONS = [5, 10, 15, 30, 45, 60, 90, 120] as const;

export type GateTrigger =
  | { kind: 'onOpen' }
  | { kind: 'dailyUsage'; minutes: number };

export type GateRelease = 'always' | 'whenTodayKept';

export interface GateRule {
  trigger: GateTrigger;
  release: GateRelease;
}

export type GateRules = Record<string, GateRule>;

export interface GateTodayProgress {
  total: number;
  kept: number;
  pending: number;
  isKept: boolean;
}

/** Structural subset of Chain needed to evaluate today's release condition. */
export type GateProgressChain = ChainCommitment;

export const DEFAULT_GATE_RULE: GateRule = {
  trigger: { kind: 'onOpen' },
  release: 'always',
};

const DEFAULT_DAILY_USAGE_MINUTES = 30;
const MIN_DAILY_USAGE_MINUTES = 5;
const MAX_DAILY_USAGE_MINUTES = 360;
const DAILY_USAGE_STEP_MINUTES = 5;
const FORBIDDEN_RULE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * DeviceActivity thresholds are expressed in whole minutes. Keeping custom
 * values on a five-minute grid makes a saved rule predictable while still
 * allowing more than the quick-pick options exposed by the UI.
 */
export function normalizeGateUsageMinutes(
  value: unknown,
  fallback = DEFAULT_DAILY_USAGE_MINUTES,
): number {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  const numericFallback = Number.isFinite(fallback) ? fallback : DEFAULT_DAILY_USAGE_MINUTES;
  const candidate = Number.isFinite(numericValue) ? numericValue : numericFallback;
  const rounded = Math.round(candidate / DAILY_USAGE_STEP_MINUTES) * DAILY_USAGE_STEP_MINUTES;
  return Math.max(MIN_DAILY_USAGE_MINUTES, Math.min(MAX_DAILY_USAGE_MINUTES, rounded));
}

function cloneDefaultGateRule(): GateRule {
  return { trigger: { kind: 'onOpen' }, release: 'always' };
}

/**
 * Accepts both the current policy and the unversioned rule previously stored
 * by Gate (`every_open` / `daily_limit`). Unknown payloads are rejected rather
 * than silently turning corrupt data into an enabled protection rule.
 */
export function normalizeGateRule(value: unknown): GateRule | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  let trigger: GateTrigger | null = null;
  if (raw.trigger && typeof raw.trigger === 'object' && !Array.isArray(raw.trigger)) {
    const rawTrigger = raw.trigger as Record<string, unknown>;
    if (rawTrigger.kind === 'onOpen') {
      trigger = { kind: 'onOpen' };
    } else if (rawTrigger.kind === 'dailyUsage') {
      if (typeof rawTrigger.minutes !== 'number' || !Number.isFinite(rawTrigger.minutes)) return null;
      trigger = {
        kind: 'dailyUsage',
        minutes: normalizeGateUsageMinutes(rawTrigger.minutes),
      };
    }
  } else if (raw.mode === 'every_open') {
    trigger = { kind: 'onOpen' };
  } else if (raw.mode === 'daily_limit') {
    if (typeof raw.dailyLimitMinutes !== 'number' || !Number.isFinite(raw.dailyLimitMinutes)) return null;
    trigger = {
      kind: 'dailyUsage',
      minutes: normalizeGateUsageMinutes(raw.dailyLimitMinutes),
    };
  }

  if (trigger === null) return null;
  if ('release' in raw && raw.release !== 'always' && raw.release !== 'whenTodayKept') return null;
  const release: GateRelease = raw.release === 'whenTodayKept' ? 'whenTodayKept' : 'always';
  return { trigger, release };
}

export function decodeGateRules(value: unknown): GateRules | null {
  const source =
    value && typeof value === 'object' && !Array.isArray(value) && 'rules' in value
      ? (value as { rules?: unknown }).rules
      : value;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;

  const entries = Object.entries(source);
  const rules: GateRules = {};
  for (const [rawAppId, candidate] of entries) {
    const appId = rawAppId.trim();
    if (!appId || appId.length > 256 || FORBIDDEN_RULE_KEYS.has(appId)) continue;
    const rule = normalizeGateRule(candidate);
    if (rule !== null) rules[appId] = rule;
  }

  return entries.length > 0 && Object.keys(rules).length === 0 ? null : rules;
}

export function gateTriggerLabel(rule: GateRule): string {
  return rule.trigger.kind === 'onOpen'
    ? 'Every opening'
    : `After ${formatGateUsageMinutes(rule.trigger.minutes)} today`;
}

export function gateReleaseLabel(rule: GateRule): string {
  return rule.release === 'whenTodayKept' ? 'Until today is kept' : 'Always active';
}

export function gateRuleSummary(rule: GateRule): string {
  return `${gateTriggerLabel(rule)} · ${gateReleaseLabel(rule)}`;
}

export function formatGateUsageMinutes(value: number): string {
  const minutes = normalizeGateUsageMinutes(value);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

/**
 * Counts the Chains that form today's promise. Daily rest days are excluded.
 * A weekly Chain already at target cannot keep Gate active unnecessarily.
 * With no eligible Chains the day is considered kept.
 */
export function getGateTodayProgress(
  chains: readonly GateProgressChain[],
  requestedDate = getTodayStr(),
): GateTodayProgress {
  const date = isDateKey(requestedDate) ? requestedDate : getTodayStr();
  let total = 0;
  let kept = 0;

  for (const chain of chains) {
    const commitment = getChainCommitmentStatus(chain, date);
    if (!commitment.isDue) continue;
    total += 1;
    if (commitment.isKept) kept += 1;
  }

  const pending = Math.max(0, total - kept);
  return { total, kept, pending, isKept: pending === 0 };
}

export function isGateRuleActiveToday(rule: GateRule, progress: GateTodayProgress): boolean {
  return rule.release === 'always' || !progress.isKept;
}

export function makeDefaultGateRule(): GateRule {
  return cloneDefaultGateRule();
}
