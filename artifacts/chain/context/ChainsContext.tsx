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
  addChain: (name: string, color: string) => void;
  deleteChain: (id: string) => void;
  toggleToday: (id: string) => void;
  useFreeze: (id: string) => void;
  isCompletedToday: (chain: Chain) => boolean;
  isFrozenToday: (chain: Chain) => boolean;
  getRemainingFreezeTokens: (chain: Chain) => number;
}

const STORAGE_KEY = '@chain_v1';

export function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export function getStreak(chain: Chain): number {
  const today = getTodayStr();
  const all = new Set([...chain.completedDates, ...chain.frozenDates]);

  let streak = 0;
  const d = new Date();

  // If today isn't completed/frozen, start counting from yesterday
  if (!all.has(today)) {
    d.setDate(d.getDate() - 1);
  }

  while (streak < 3650) {
    const s = d.toISOString().split('T')[0];
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

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) setChains(JSON.parse(raw));
    });
  }, []);

  function persist(next: Chain[]) {
    setChains(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
        if (c.frozenDates.includes(today)) return c;
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
        addChain,
        deleteChain,
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
