import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Chain {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  completedDates: string[]; // 'YYYY-MM-DD'
  minimumDates: string[]; // deliberately protected with a minimum version
  minimumLabel: string;
  frozenDates: string[];
  freezeCredits: number; // a small safety net, capped at 2
  freezeRecoveryProgress: number; // real completed days since the last freeze use
  freezeSystemVersion: number;
  restDays: number[]; // 0 (Sunday) through 6 (Saturday)
  cadence: 'daily' | 'weekly';
  weeklyTarget: number;
  completionTimes: Record<string, string>; // ISO timestamps, keyed by local date
}

export type DayStatus = 'done' | 'minimum' | 'frozen' | 'missed';

interface ChainsContextValue {
  chains: Chain[];
  isReady: boolean;
  addChain: (name: string, color: string, options?: { cadence?: Chain['cadence']; weeklyTarget?: number }) => void;
  deleteChain: (id: string) => void;
  updateChainColor: (id: string, color: string) => void;
  updateChainRestDays: (id: string, restDays: number[]) => void;
  updateChainCadence: (id: string, cadence: Chain['cadence'], weeklyTarget?: number) => void;
  updateChainMinimumLabel: (id: string, label: string) => void;
  setDayStatus: (id: string, date: string, status: DayStatus) => boolean;
  toggleToday: (id: string) => void;
  useFreeze: (id: string) => void;
  isCompletedToday: (chain: Chain) => boolean;
  isProtectedToday: (chain: Chain) => boolean;
  isFrozenToday: (chain: Chain) => boolean;
  getRemainingFreezeTokens: (chain: Chain) => number;
}

const STORAGE_KEY = '@chain_v2';
const LEGACY_STORAGE_KEY = '@chain_v1';

export function getTodayStr(): string {
  return toLocalDateString(new Date());
}

export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalDateFromString(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function uniqueDateKeys(values: unknown): string[] {
  return Array.from(new Set(Array.isArray(values) ? values.filter(isDateKey) : []));
}

function normalizeRestDays(values: unknown): number[] {
  return Array.from(new Set(Array.isArray(values) ? values.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6) : []));
}

function normalizeWeeklyTarget(value: unknown): number {
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
  return [...chain.completedDates, ...chain.minimumDates].filter((date) => date >= startKey && date <= endKey).length;
}

function normalizeChain(value: unknown): Chain | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Chain>;
  if (!raw.id || !raw.name || !raw.color || !isDateKey(raw.createdAt)) return null;

  const completedDates = uniqueDateKeys(raw.completedDates);
  const minimumDates = uniqueDateKeys(raw.minimumDates).filter((date) => !completedDates.includes(date));
  const frozenDates = uniqueDateKeys(raw.frozenDates).filter(
    (date) => !completedDates.includes(date) && !minimumDates.includes(date),
  );

  // The first Safety net release started legacy chains with one credit. New
  // chains start with two, so upgrade untouched legacy chains once on load.
  const storedFreezeCredits = typeof raw.freezeCredits === 'number' && Number.isInteger(raw.freezeCredits)
    ? Math.max(0, Math.min(2, raw.freezeCredits))
    : null;
  const isLegacyFreezeSystem = raw.freezeSystemVersion !== 2;
  const freezeCredits = isLegacyFreezeSystem && (storedFreezeCredits === null || (storedFreezeCredits === 1 && frozenDates.length === 0))
    ? 2
    : storedFreezeCredits ?? 2;

  return {
    id: raw.id,
    name: raw.name.trim(),
    color: raw.color,
    createdAt: raw.createdAt,
    completedDates,
    minimumDates,
    minimumLabel: typeof raw.minimumLabel === 'string' && raw.minimumLabel.trim() ? raw.minimumLabel.trim().slice(0, 48) : 'A small version',
    frozenDates,
    freezeCredits,
    freezeRecoveryProgress: typeof raw.freezeRecoveryProgress === 'number' && Number.isInteger(raw.freezeRecoveryProgress) ? Math.max(0, Math.min(13, raw.freezeRecoveryProgress)) : 0,
    freezeSystemVersion: 2,
    restDays: normalizeRestDays(raw.restDays),
    cadence: raw.cadence === 'weekly' ? 'weekly' : 'daily',
    weeklyTarget: normalizeWeeklyTarget(raw.weeklyTarget),
    completionTimes: raw.completionTimes && typeof raw.completionTimes === 'object' ? Object.fromEntries(Object.entries(raw.completionTimes).filter(([date, value]) => isDateKey(date) && typeof value === 'string')) : {},
  };
}

function parseChains(raw: string | null): Chain[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const source = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { chains?: unknown }).chains)
        ? (parsed as { chains: unknown[] }).chains
        : [];
    return source.map(normalizeChain).filter((chain): chain is Chain => chain !== null);
  } catch {
    return [];
  }
}

export function getStreak(chain: Chain): number {
  if (chain.cadence === 'weekly') {
    const today = getLocalDateFromString(getTodayStr());
    let weekStart = getWeekStart(today);
    if (getWeeklyProgress(chain) < chain.weeklyTarget) weekStart.setDate(weekStart.getDate() - 7);

    let streak = 0;
    while (streak < 520) {
      const weekKey = toLocalDateString(weekStart);
      if (getWeeklyProgress(chain, weekKey) < chain.weeklyTarget) break;
      streak++;
      weekStart.setDate(weekStart.getDate() - 7);
    }
    return streak;
  }

  const today = getTodayStr();
  const completed = new Set([...chain.completedDates, ...chain.minimumDates]);
  const frozen = new Set(chain.frozenDates);
  const coveredDays = new Set([...completed, ...frozen]);

  let streak = 0;
  const d = getLocalDateFromString(today);

  // If today isn't completed/frozen, start counting from yesterday
  if (!coveredDays.has(today)) {
    d.setDate(d.getDate() - 1);
  }

  while (streak < 3650) {
    const s = toLocalDateString(d);
    if (isRestDay(chain, s)) {
      d.setDate(d.getDate() - 1);
    } else if (completed.has(s)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else if (frozen.has(s)) {
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

const ChainsContext = createContext<ChainsContextValue | null>(null);

export function ChainsProvider({ children }: { children: React.ReactNode }) {
  const [chains, setChains] = useState<Chain[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const current = parseChains(await AsyncStorage.getItem(STORAGE_KEY));
      const legacy = current.length > 0 ? [] : parseChains(await AsyncStorage.getItem(LEGACY_STORAGE_KEY));
      const next = current.length > 0 ? current : legacy;

      if (legacy.length > 0) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, chains: legacy }));
      }

      if (!cancelled) {
        setChains(next);
        setIsReady(true);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  function persist(next: Chain[]) {
    setChains(next);
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, chains: next }));
  }

  function addChain(name: string, color: string, options?: { cadence?: Chain['cadence']; weeklyTarget?: number }) {
    const chain: Chain = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      name: name.trim(),
      color,
      createdAt: getTodayStr(),
      completedDates: [],
      minimumDates: [],
      minimumLabel: 'A small version',
      frozenDates: [],
      freezeCredits: 2,
      freezeRecoveryProgress: 0,
      freezeSystemVersion: 2,
      restDays: [],
      cadence: options?.cadence === 'weekly' ? 'weekly' : 'daily',
      weeklyTarget: normalizeWeeklyTarget(options?.weeklyTarget),
      completionTimes: {},
    };
    persist([...chains, chain]);
  }

  function deleteChain(id: string) {
    persist(chains.filter((c) => c.id !== id));
  }

  function updateChainColor(id: string, color: string) {
    persist(chains.map((chain) => (chain.id === id ? { ...chain, color } : chain)));
  }

  function updateChainRestDays(id: string, restDays: number[]) {
    persist(chains.map((chain) => (chain.id === id ? { ...chain, restDays: normalizeRestDays(restDays) } : chain)));
  }

  function updateChainCadence(id: string, cadence: Chain['cadence'], weeklyTarget?: number) {
    persist(chains.map((chain) => chain.id === id ? {
      ...chain,
      cadence,
      weeklyTarget: normalizeWeeklyTarget(weeklyTarget ?? chain.weeklyTarget),
      restDays: cadence === 'weekly' ? [] : chain.restDays,
    } : chain));
  }

  function updateChainMinimumLabel(id: string, label: string) {
    const nextLabel = label.trim().slice(0, 48) || 'A small version';
    persist(chains.map((chain) => chain.id === id ? { ...chain, minimumLabel: nextLabel } : chain));
  }

  function setDayStatus(id: string, date: string, status: DayStatus): boolean {
    const target = chains.find((chain) => chain.id === id);
    if (!target || !isDateKey(date)) return false;

    if (status === 'frozen' && !target.frozenDates.includes(date) && target.freezeCredits <= 0) return false;

    persist(
      chains.map((chain) => {
        if (chain.id !== id) return chain;
        const completedDates = chain.completedDates.filter((day) => day !== date);
        const minimumDates = chain.minimumDates.filter((day) => day !== date);
        const frozenDates = chain.frozenDates.filter((day) => day !== date);
        const wasFullyCompleted = chain.completedDates.includes(date);
        const wasFrozen = chain.frozenDates.includes(date);
        let freezeCredits = chain.freezeCredits;
        let freezeRecoveryProgress = chain.freezeRecoveryProgress;

        const completionTimes = { ...chain.completionTimes };
        if (status === 'done') {
          completedDates.push(date);
          completionTimes[date] = new Date().toISOString();
          if (!wasFullyCompleted && freezeCredits < 2) {
            freezeRecoveryProgress += 1;
            if (freezeRecoveryProgress >= 14) {
              freezeCredits += 1;
              freezeRecoveryProgress = 0;
            }
          }
        } else if (status === 'minimum') {
          minimumDates.push(date);
          completionTimes[date] = new Date().toISOString();
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
          // Editing a frozen day back to another state gives the safety net back.
          freezeCredits = Math.min(2, freezeCredits + 1);
          freezeRecoveryProgress = 0;
        }

        return { ...chain, completedDates, minimumDates, frozenDates, completionTimes, freezeCredits, freezeRecoveryProgress };
      }),
    );
    return true;
  }

  function toggleToday(id: string) {
    const today = getTodayStr();
    const chain = chains.find((item) => item.id === id);
    if (!chain) return;
    setDayStatus(id, today, (chain.completedDates.includes(today) || chain.minimumDates.includes(today)) ? 'missed' : 'done');
  }

  function useFreeze(id: string) {
    const today = getTodayStr();
    setDayStatus(id, today, 'frozen');
  }

  const isCompletedToday = (c: Chain) =>
    c.completedDates.includes(getTodayStr());
  const isProtectedToday = (c: Chain) =>
    c.completedDates.includes(getTodayStr()) || c.minimumDates.includes(getTodayStr());
  const isFrozenToday = (c: Chain) => c.frozenDates.includes(getTodayStr());
  const getRemainingFreezeTokens = (c: Chain) => c.freezeCredits;

  return (
    <ChainsContext.Provider
      value={{
        chains,
        isReady,
        addChain,
        deleteChain,
        updateChainColor,
        updateChainRestDays,
        updateChainCadence,
        updateChainMinimumLabel,
        setDayStatus,
        toggleToday,
        useFreeze,
        isCompletedToday,
        isProtectedToday,
        isFrozenToday,
        getRemainingFreezeTokens,
      }}
    >
      {children}
    </ChainsContext.Provider>
  );
}

export function useChains() {
  const ctx = useContext(ChainsContext);
  if (!ctx) throw new Error('useChains must be used within ChainsProvider');
  return ctx;
}
