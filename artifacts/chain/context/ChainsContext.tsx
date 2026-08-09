import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  applyDayStatus,
  decodeChains,
  getTodayStr,
  normalizeRestDays,
  normalizeWeeklyTarget,
  parseChains,
  type Chain,
  type DayStatus,
} from '@/domain/chains';
import { createVersionedRepository } from '@/lib/versionedRepository';
import { reportDiagnostic } from '@/lib/diagnostics';

export type { Chain, DayStatus } from '@/domain/chains';
export { getStreak, getTodayStr, getWeeklyProgress, isRestDay, toLocalDateString } from '@/domain/chains';

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
const chainsRepository = createVersionedRepository<Chain[]>({
  storage: AsyncStorage,
  key: STORAGE_KEY,
  version: 3,
  decode: decodeChains,
  empty: () => [],
});

const ChainsContext = createContext<ChainsContextValue | null>(null);

export function ChainsProvider({ children }: { children: React.ReactNode }) {
  const [chains, setChains] = useState<Chain[]>([]);
  const [isReady, setIsReady] = useState(false);
  const chainsRef = useRef<Chain[]>([]);
  const storageWriteQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const current = await chainsRepository.read();
        const legacy = current.length > 0 ? [] : parseChains(await AsyncStorage.getItem(LEGACY_STORAGE_KEY));
        const next = current.length > 0 ? current : legacy;

        if (legacy.length > 0) {
          await chainsRepository.write(legacy);
        }

        if (!cancelled) {
          chainsRef.current = next;
          setChains(next);
        }
      } catch (error) {
        reportDiagnostic({ area: 'storage', operation: 'chains.hydrate', severity: 'error', error });
      } finally {
        if (!cancelled) setIsReady(true);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  function persist(next: Chain[]) {
    chainsRef.current = next;
    setChains(next);
    storageWriteQueue.current = storageWriteQueue.current
      .catch(() => undefined)
      .then(() => chainsRepository.write(next))
      .catch((error) => {
        reportDiagnostic({ area: 'storage', operation: 'chains.persist', severity: 'error', error });
      });
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
    persist([...chainsRef.current, chain]);
  }

  function deleteChain(id: string) {
    persist(chainsRef.current.filter((c) => c.id !== id));
  }

  function updateChainColor(id: string, color: string) {
    persist(chainsRef.current.map((chain) => (chain.id === id ? { ...chain, color } : chain)));
  }

  function updateChainRestDays(id: string, restDays: number[]) {
    persist(
      chainsRef.current.map((chain) => (chain.id === id ? { ...chain, restDays: normalizeRestDays(restDays) } : chain)),
    );
  }

  function updateChainCadence(id: string, cadence: Chain['cadence'], weeklyTarget?: number) {
    persist(chainsRef.current.map((chain) => chain.id === id ? {
      ...chain,
      cadence,
      weeklyTarget: normalizeWeeklyTarget(weeklyTarget ?? chain.weeklyTarget),
      restDays: cadence === 'weekly' ? [] : chain.restDays,
    } : chain));
  }

  function updateChainMinimumLabel(id: string, label: string) {
    const nextLabel = label.trim().slice(0, 48) || 'A small version';
    persist(chainsRef.current.map((chain) => chain.id === id ? { ...chain, minimumLabel: nextLabel } : chain));
  }

  function setDayStatus(id: string, date: string, status: DayStatus): boolean {
    const current = chainsRef.current;
    const target = current.find((chain) => chain.id === id);
    if (!target) return false;
    const result = applyDayStatus(target, date, status);
    if (!result.accepted) return false;
    if (result.changed) persist(current.map((chain) => (chain.id === id ? result.chain : chain)));
    return result.accepted;
  }

  function toggleToday(id: string) {
    const today = getTodayStr();
    const chain = chainsRef.current.find((item) => item.id === id);
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
