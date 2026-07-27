import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Chain {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  completedDates: string[]; // 'YYYY-MM-DD'
  frozenDates: string[];
}

interface ChainsContextValue {
  chains: Chain[];
  isReady: boolean;
  addChain: (name: string, color: string) => void;
  deleteChain: (id: string) => void;
  updateChainColor: (id: string, color: string) => void;
  toggleToday: (id: string) => void;
  useFreeze: (id: string) => void;
  isCompletedToday: (chain: Chain) => boolean;
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

function normalizeChain(value: unknown): Chain | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Chain>;
  if (!raw.id || !raw.name || !raw.color || !isDateKey(raw.createdAt)) return null;

  const completedDates = uniqueDateKeys(raw.completedDates);
  const frozenDates = uniqueDateKeys(raw.frozenDates).filter(
    (date) => !completedDates.includes(date),
  );

  return {
    id: raw.id,
    name: raw.name.trim(),
    color: raw.color,
    createdAt: raw.createdAt,
    completedDates,
    frozenDates,
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
  const today = getTodayStr();
  const all = new Set([...chain.completedDates, ...chain.frozenDates]);

  let streak = 0;
  const d = getLocalDateFromString(today);

  // If today isn't completed/frozen, start counting from yesterday
  if (!all.has(today)) {
    d.setDate(d.getDate() - 1);
  }

  while (streak < 3650) {
    const s = toLocalDateString(d);
    if (all.has(s)) {
      streak++;
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

  function addChain(name: string, color: string) {
    const chain: Chain = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      name: name.trim(),
      color,
      createdAt: getTodayStr(),
      completedDates: [],
      frozenDates: [],
    };
    persist([...chains, chain]);
  }

  function deleteChain(id: string) {
    persist(chains.filter((c) => c.id !== id));
  }

  function updateChainColor(id: string, color: string) {
    persist(chains.map((chain) => (chain.id === id ? { ...chain, color } : chain)));
  }

  function toggleToday(id: string) {
    const today = getTodayStr();
    persist(
      chains.map((c) => {
        if (c.id !== id) return c;
        const done = c.completedDates.includes(today);
        return {
          ...c,
          completedDates: done
            ? c.completedDates.filter((d) => d !== today)
            : [...c.completedDates, today],
          frozenDates: c.frozenDates.filter((d) => d !== today),
        };
      }),
    );
  }

  function useFreeze(id: string) {
    const today = getTodayStr();
    const monthPrefix = today.slice(0, 7);
    persist(
      chains.map((c) => {
        if (c.id !== id) return c;
        if (c.frozenDates.includes(today) || c.completedDates.includes(today)) return c;
        const usedThisMonth = c.frozenDates.filter((d) =>
          d.startsWith(monthPrefix),
        ).length;
        if (usedThisMonth >= 2) return c;
        return { ...c, frozenDates: [...c.frozenDates, today] };
      }),
    );
  }

  const isCompletedToday = (c: Chain) =>
    c.completedDates.includes(getTodayStr());
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
        toggleToday,
        useFreeze,
        isCompletedToday,
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
