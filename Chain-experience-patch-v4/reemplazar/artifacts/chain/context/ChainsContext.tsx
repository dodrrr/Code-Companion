import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  applyDayStatus,
  decodeChains,
  getNextCompletionStatus,
  getTodayStr,
  isChainKeptOnDate,
  normalizeRestDayUpdate,
  normalizeWeeklyTarget,
  parseChains,
  withChainScheduleRevision,
  type Chain,
  type DayStatus,
} from '@/domain/chains';
import { createVersionedRepository } from '@/lib/versionedRepository';
import { reportDiagnostic } from '@/lib/diagnostics';

export type { Chain, ChainCommitmentStatus, DayStatus } from '@/domain/chains';
export { getChainCommitmentStatus, getStreak, getTodayStr, getWeeklyProgress, isChainKeptOnDate, isRestDay, toLocalDateString } from '@/domain/chains';

export type ChainMutationResult =
  | { status: 'persisted' }
  | { status: 'rejected' }
  | { status: 'failed'; error: unknown };

interface ChainsContextValue {
  chains: Chain[];
  isReady: boolean;
  addChain: (name: string, color: string, options?: { cadence?: Chain['cadence']; weeklyTarget?: number }) => Promise<ChainMutationResult>;
  deleteChain: (id: string) => Promise<ChainMutationResult>;
  updateChainColor: (id: string, color: string) => Promise<ChainMutationResult>;
  updateChainRestDays: (id: string, restDays: number[]) => Promise<ChainMutationResult>;
  updateChainCadence: (id: string, cadence: Chain['cadence'], weeklyTarget?: number) => Promise<ChainMutationResult>;
  updateChainMinimumLabel: (id: string, label: string) => Promise<ChainMutationResult>;
  setDayStatus: (id: string, date: string, status: DayStatus) => Promise<ChainMutationResult>;
  toggleToday: (id: string) => Promise<ChainMutationResult>;
  useFreeze: (id: string) => Promise<ChainMutationResult>;
  isCompletedToday: (chain: Chain) => boolean;
  isProtectedToday: (chain: Chain) => boolean;
  isFrozenToday: (chain: Chain) => boolean;
  getRemainingFreezeTokens: (chain: Chain) => number;
}

const STORAGE_KEY = '@chain_v2';
const LEGACY_STORAGE_KEY = '@chain_v1';
const LEGACY_MIGRATION_MARKER_KEY = '@chain_v1:migrated-to-chain-v2';
const chainsRepository = createVersionedRepository<Chain[]>({
  storage: AsyncStorage,
  key: STORAGE_KEY,
  version: 4,
  decode: decodeChains,
  empty: () => [],
});

const ChainsContext = createContext<ChainsContextValue | null>(null);

export function ChainsProvider({ children }: { children: React.ReactNode }) {
  const [chains, setChains] = useState<Chain[]>([]);
  const [isReady, setIsReady] = useState(false);
  const chainsRef = useRef<Chain[]>([]);
  const mutationRevisionRef = useRef(0);
  const storageBlockedRef = useRef(true);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const current = await chainsRepository.readWithMetadata();
        let next = current.value;
        const hasCompletedLegacyMigration =
          (await AsyncStorage.getItem(LEGACY_MIGRATION_MARKER_KEY)) !== null;

        if (current.source === 'invalid' || current.source === 'unsupported') {
          reportDiagnostic({
            area: 'storage',
            operation: 'chains.readInvalidRepository',
            severity: 'error',
            error: new Error(
              current.source === 'unsupported'
                ? 'Chains storage was written by a newer app version'
                : 'Chains storage and backup could not be decoded',
            ),
          });
          // Never replace an unreadable archive with the empty display state.
          return;
        }

        // A valid empty v2 envelope is authoritative: it can mean the user
        // deliberately deleted every Chain. Only import v1 when no valid v2
        // primary or backup exists and the migration has never run.
        if (!hasCompletedLegacyMigration && current.source === 'empty') {
          const legacy = parseChains(await AsyncStorage.getItem(LEGACY_STORAGE_KEY));
          if (legacy.length > 0) {
            await chainsRepository.write(legacy);
            next = legacy;
          }
        }

        if (!hasCompletedLegacyMigration) {
          try {
            await AsyncStorage.setItem(LEGACY_MIGRATION_MARKER_KEY, '1');
          } catch (error) {
            reportDiagnostic({
              area: 'storage',
              operation: 'chains.markLegacyMigration',
              severity: 'warning',
              error,
            });
          }
        }

        if (!cancelled) {
          storageBlockedRef.current = false;
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

  async function persist(next: Chain[], operation: string): Promise<ChainMutationResult> {
    if (storageBlockedRef.current) return { status: 'failed', error: new Error('Saved Chains are not ready for changes') };
    const revision = ++mutationRevisionRef.current;
    chainsRef.current = next;
    setChains(next);
    try {
      await chainsRepository.write(next);
      return { status: 'persisted' };
    } catch (error) {
      reportDiagnostic({ area: 'storage', operation, severity: 'error', error });
      if (mutationRevisionRef.current === revision) {
        try {
          const persisted = await chainsRepository.read();
          if (mutationRevisionRef.current === revision) {
            chainsRef.current = persisted;
            setChains(persisted);
          }
        } catch (reconciliationError) {
          reportDiagnostic({ area: 'storage', operation: `${operation}.reconcile`, severity: 'warning', error: reconciliationError });
        }
      }
      return { status: 'failed', error };
    }
  }

  function addChain(name: string, color: string, options?: { cadence?: Chain['cadence']; weeklyTarget?: number }) {
    const chain: Chain = withChainScheduleRevision({
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
      checkIns: {},
    });
    return persist([...chainsRef.current, chain], 'chains.add');
  }

  function deleteChain(id: string) {
    if (!chainsRef.current.some((chain) => chain.id === id)) return Promise.resolve<ChainMutationResult>({ status: 'rejected' });
    return persist(chainsRef.current.filter((c) => c.id !== id), 'chains.delete');
  }

  function updateChainColor(id: string, color: string) {
    if (!chainsRef.current.some((chain) => chain.id === id)) return Promise.resolve<ChainMutationResult>({ status: 'rejected' });
    return persist(chainsRef.current.map((chain) => (chain.id === id ? { ...chain, color } : chain)), 'chains.updateColor');
  }

  function updateChainRestDays(id: string, restDays: number[]) {
    if (!chainsRef.current.some((chain) => chain.id === id)) return Promise.resolve<ChainMutationResult>({ status: 'rejected' });
    const normalizedDays = normalizeRestDayUpdate(restDays);
    if (normalizedDays === null) return Promise.resolve<ChainMutationResult>({ status: 'rejected' });
    return persist(
      chainsRef.current.map((chain) => (chain.id === id ? withChainScheduleRevision({ ...chain, restDays: normalizedDays }) : chain)),
      'chains.updateRestDays',
    );
  }

  function updateChainCadence(id: string, cadence: Chain['cadence'], weeklyTarget?: number) {
    if (!chainsRef.current.some((chain) => chain.id === id)) return Promise.resolve<ChainMutationResult>({ status: 'rejected' });
    return persist(chainsRef.current.map((chain) => chain.id === id ? withChainScheduleRevision({
      ...chain,
      cadence,
      weeklyTarget: normalizeWeeklyTarget(weeklyTarget ?? chain.weeklyTarget),
      restDays: cadence === 'weekly' ? [] : chain.restDays,
    }) : chain), 'chains.updateCadence');
  }

  function updateChainMinimumLabel(id: string, label: string) {
    if (!chainsRef.current.some((chain) => chain.id === id)) return Promise.resolve<ChainMutationResult>({ status: 'rejected' });
    const nextLabel = label.trim().slice(0, 48) || 'A small version';
    return persist(chainsRef.current.map((chain) => chain.id === id ? { ...chain, minimumLabel: nextLabel } : chain), 'chains.updateMinimumLabel');
  }

  async function setDayStatus(id: string, date: string, status: DayStatus): Promise<ChainMutationResult> {
    const current = chainsRef.current;
    const target = current.find((chain) => chain.id === id);
    if (!target) return { status: 'rejected' };
    const result = applyDayStatus(target, date, status);
    if (!result.accepted) return { status: 'rejected' };
    if (!result.changed) return { status: 'persisted' };
    return persist(current.map((chain) => (chain.id === id ? result.chain : chain)), 'chains.setDayStatus');
  }

  function toggleToday(id: string) {
    const today = getTodayStr();
    const chain = chainsRef.current.find((item) => item.id === id);
    if (!chain) return Promise.resolve<ChainMutationResult>({ status: 'rejected' });
    return setDayStatus(id, today, getNextCompletionStatus(chain, today));
  }

  function useFreeze(id: string) {
    const today = getTodayStr();
    return setDayStatus(id, today, 'frozen');
  }

  const isCompletedToday = (c: Chain) =>
    c.completedDates.includes(getTodayStr());
  const isProtectedToday = (c: Chain) => isChainKeptOnDate(c, getTodayStr());
  const isFrozenToday = (c: Chain) => c.cadence === 'daily' && c.frozenDates.includes(getTodayStr());
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
