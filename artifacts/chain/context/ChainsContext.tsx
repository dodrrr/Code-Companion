import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Chain {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  completedDates: string[]; // 'YYYY-MM-DD'
  minimumDates: string[]; // deliberately protected with a minimum version
  frozenDates: string[];
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
  setDayStatus: (id: string, date: string, status: DayStatus) => boolean;
  toggleToday: (id: string) => void;
  useFreeze: (id: string) => void;
  isCompletedToday: (chain: Chain) => boolean;
  isProtectedToday: (chain: Chain) => boolean;
  isFrozenToday: (chain: Chain) => boolean;
  getRemainingFreezeTokens: (chain: Chain) => number;
  seedChainRhythm: (id: string) => void;
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

  return {
    id: raw.id,
    name: raw.name.trim(),
    color: raw.color,
    createdAt: raw.createdAt,
    completedDates,
    minimumDates,
    frozenDates,
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
      frozenDates: [],
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

  function setDayStatus(id: string, date: string, status: DayStatus): boolean {
    const target = chains.find((chain) => chain.id === id);
    if (!target || !isDateKey(date)) return false;

    if (status === 'frozen' && !target.frozenDates.includes(date)) {
      const usedThisMonth = target.frozenDates.filter((day) => day.startsWith(date.slice(0, 7))).length;
      if (usedThisMonth >= 2) return false;
    }

    persist(
      chains.map((chain) => {
        if (chain.id !== id) return chain;
        const completedDates = chain.completedDates.filter((day) => day !== date);
        const minimumDates = chain.minimumDates.filter((day) => day !== date);
        const frozenDates = chain.frozenDates.filter((day) => day !== date);

        const completionTimes = { ...chain.completionTimes };
        if (status === 'done') {
          completedDates.push(date);
          completionTimes[date] = new Date().toISOString();
        } else if (status === 'minimum') {
          minimumDates.push(date);
          completionTimes[date] = new Date().toISOString();
        } else {
          delete completionTimes[date];
        }
        if (status === 'frozen') frozenDates.push(date);

        return { ...chain, completedDates, minimumDates, frozenDates, completionTimes };
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

  function seedChainRhythm(id: string) {
    const today = new Date();
    const completionTimes: Record<string, string> = {};
    const completedDates: string[] = [];
    // A believable morning pattern: 18 sessions, strongest on Wednesdays.
    for (let offset = 1; offset <= 24; offset += 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - offset);
      const weekday = date.getDay();
      if (weekday === 0 || weekday === 6 || (offset % 5 === 0 && weekday !== 3)) continue;
      date.setHours(8 + (weekday === 3 ? 0 : 1), weekday === 3 ? 42 : 18, 0, 0);
      const key = toLocalDateString(date);
      completedDates.push(key);
      completionTimes[key] = date.toISOString();
    }
    persist(chains.map((chain) => chain.id === id ? {
      ...chain,
      completedDates: Array.from(new Set([...chain.completedDates, ...completedDates])).sort(),
      completionTimes: { ...completionTimes, ...chain.completionTimes },
    } : chain));
  }

  const isCompletedToday = (c: Chain) =>
    c.completedDates.includes(getTodayStr());
  const isProtectedToday = (c: Chain) =>
    c.completedDates.includes(getTodayStr()) || c.minimumDates.includes(getTodayStr());
  const isFrozenToday = (c: Chain) => c.frozenDates.includes(getTodayStr());
  const getRemainingFreezeTokens = (c: Chain) => {
    const monthPrefix = getTodayStr().slice(0, 7);
    const used = c.frozenDates.filter((d) => d.startsWith(monthPrefix)).length;
    return Math.max(0, 2 - used);
  };

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
        setDayStatus,
        toggleToday,
        useFreeze,
        isCompletedToday,
        isProtectedToday,
        isFrozenToday,
        getRemainingFreezeTokens,
        seedChainRhythm,
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
