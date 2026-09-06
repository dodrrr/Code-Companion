import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getPlanTodayKey,
  getPlanTomorrowKey,
  normalizeClosedDates,
  type FocusLogEntry,
  type PlanItem,
  type PlanItemOptions,
} from '@/domain/plan';
import { planDataStore as planStore } from '@/lib/rhythmStorage';
import { reportDiagnostic } from '@/lib/diagnostics';
import { readFocusSession, removeFocusSession } from '@/lib/focusSession';

export type { FocusLogEntry, PlanItem, PlanItemOptions } from '@/domain/plan';
export { getPlanTodayKey, getPlanTomorrowKey } from '@/domain/plan';

export type PlanPersistenceResult =
  | { status: 'persisted' }
  | { status: 'failed'; error: unknown };

/**
 * Keeps the existing immediate item return used by the composer while giving
 * callers an explicit, non-throwing way to wait for durable local storage.
 * `persistence` is deliberately non-enumerable at runtime, so it can never be
 * copied into the persisted Plan domain model by an object spread.
 */
export type PendingPlanItem = PlanItem & {
  readonly persistence: Promise<PlanPersistenceResult>;
};

interface PlanContextValue {
  items: PlanItem[];
  isLoading: boolean;
  loadError: string | null;
  retryLoad: () => void;
  activeDate: string;
  isToday: boolean;
  isActiveDayClosed: boolean;
  tomorrowItemCount: number;
  readItemsForDate: (date: string) => Promise<PlanItem[]>;
  showToday: () => void;
  showTomorrow: () => Promise<PlanItem[]>;
  showDate: (date: string) => Promise<PlanItem[]>;
  closeToday: () => Promise<void>;
  reopenToday: () => Promise<void>;
  addItem: (options: PlanItemOptions) => PendingPlanItem;
  updateItem: (id: string, options: PlanItemOptions) => PendingPlanItem | undefined;
  updateReminderMetadata: (id: string, reminderMinutes?: number, notificationId?: string) => Promise<boolean>;
  completeItemForDate: (id: string, date: string) => Promise<PlanItem | undefined>;
  completeFocusItem: (id: string, actualMinutes: number, date?: string) => Promise<PlanItem | undefined>;
  updateReminderForDate: (id: string, date: string, reminderMinutes?: number, notificationId?: string) => Promise<boolean>;
  moveItemToTomorrow: (id: string) => Promise<PlanItem | undefined>;
  copyItemToTomorrow: (id: string) => Promise<PlanItem | undefined>;
  removeItem: (id: string) => Promise<PlanPersistenceResult>;
  toggleItem: (id: string) => Promise<PlanPersistenceResult>;
}

const CLOSED_DATES_KEY = '@chain_plan_closed_dates';
export const FOCUS_LOG_KEY = '@chain_focus_log';

const getPlanRepository = planStore.forDate;

const readPlan = (date: string) => getPlanRepository(date).read();
type PlanMutation = (current: PlanItem[]) => PlanItem[];

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<PlanItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const retryLoad = useCallback(() => {
    setIsLoading(true);
    setLoadAttempt((attempt) => attempt + 1);
  }, []);
  const [activeDate, setActiveDate] = useState(getPlanTodayKey());
  const [tomorrowItemCount, setTomorrowItemCount] = useState(0);
  const [closedDateKeys, setClosedDateKeys] = useState<string[]>([]);
  const lastTodayKey = useRef(getPlanTodayKey());
  const itemsRef = useRef<PlanItem[]>([]);
  const activeDateRef = useRef(activeDate);
  const visibleRevisionRef = useRef(0);
  const navigationRequestRef = useRef(0);

  const readItemsForDate = useCallback(async (date: string): Promise<PlanItem[]> => {
    try {
      return await readPlan(date);
    } catch (error) {
      reportDiagnostic({ area: 'storage', operation: 'plan.readDateSnapshot', severity: 'warning', error });
      return [];
    }
  }, []);

  function replaceVisiblePlan(date: string, nextItems: PlanItem[]) {
    visibleRevisionRef.current += 1;
    activeDateRef.current = date;
    itemsRef.current = nextItems;
    setActiveDate(date);
    setItems(nextItems);
    setLoadError(null);
    setIsLoading(false);
  }

  function applyVisibleMutation(date: string, mutator: PlanMutation) {
    if (activeDateRef.current !== date) return;
    visibleRevisionRef.current += 1;
    const next = mutator(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
    if (date === getPlanTomorrowKey()) setTomorrowItemCount(next.length);
  }

  function persistMutation(date: string, mutator: PlanMutation, operationName = 'plan.persist', editSeriesItemIds?: string[]) {
    const visibleBefore = activeDateRef.current === date ? itemsRef.current : undefined;
    applyVisibleMutation(date, mutator);
    const optimisticRevision = visibleRevisionRef.current;
    const operation = getPlanRepository(date).update(mutator, { editSeriesItemIds });
    void operation
      .then((persisted) => {
        if (activeDateRef.current !== date || visibleRevisionRef.current !== optimisticRevision) return;
        visibleRevisionRef.current += 1;
        itemsRef.current = persisted;
        setItems(persisted);
        if (date === getPlanTomorrowKey()) setTomorrowItemCount(persisted.length);
      })
      .catch((error) => {
        reportDiagnostic({ area: 'storage', operation: operationName, severity: 'error', error });
        if (
          visibleBefore &&
          activeDateRef.current === date &&
          visibleRevisionRef.current === optimisticRevision
        ) {
          // No later visible mutation depends on this optimistic snapshot, so
          // restoring it is safe and makes a failed write visible to the UI.
          visibleRevisionRef.current += 1;
          itemsRef.current = visibleBefore;
          setItems(visibleBefore);
          if (date === getPlanTomorrowKey()) setTomorrowItemCount(visibleBefore.length);
        }
        // A single-snapshot rollback is insufficient when two queued optimistic
        // mutations both fail. Read the repository after its queue settles and
        // reconcile only if no newer visible action has happened meanwhile.
        const reconciliationRevision = visibleRevisionRef.current;
        void readPlan(date)
          .then((persisted) => {
            if (
              activeDateRef.current !== date ||
              visibleRevisionRef.current !== reconciliationRevision
            ) return;
            visibleRevisionRef.current += 1;
            itemsRef.current = persisted;
            setItems(persisted);
            if (date === getPlanTomorrowKey()) setTomorrowItemCount(persisted.length);
          })
          .catch((reconciliationError) => {
            setLoadError('Your saved plan could not be loaded. Retry before making changes.');
            reportDiagnostic({
              area: 'storage',
              operation: `${operationName}.reconcile`,
              severity: 'warning',
              error: reconciliationError,
            });
          });
      });
    return operation;
  }

  function persistenceResult(operation: Promise<PlanItem[]>): Promise<PlanPersistenceResult> {
    return operation.then<PlanPersistenceResult, PlanPersistenceResult>(
      () => ({ status: 'persisted' }),
      (error: unknown) => ({ status: 'failed', error }),
    );
  }

  function attachPersistence(item: PlanItem, operation: Promise<PlanItem[]>): PendingPlanItem {
    const pending = { ...item } as PendingPlanItem;
    Object.defineProperty(pending, 'persistence', {
      configurable: false,
      enumerable: false,
      value: persistenceResult(operation),
      writable: false,
    });
    return pending;
  }

  function reconcileVisibleMutation(
    date: string,
    persisted: PlanItem[],
    mutator: PlanMutation,
    revisionAtStart: number,
  ) {
    if (activeDateRef.current !== date) return;
    if (visibleRevisionRef.current === revisionAtStart) {
      visibleRevisionRef.current += 1;
      itemsRef.current = persisted;
      setItems(persisted);
      if (date === getPlanTomorrowKey()) setTomorrowItemCount(persisted.length);
      return;
    }
    // A local optimistic mutation happened while storage was resolving. Rebase
    // this semantic change over the latest visible state instead of replacing
    // it with an older full-array snapshot.
    applyVisibleMutation(date, mutator);
  }

  useEffect(() => {
    let cancelled = false;
    let dayTimer: ReturnType<typeof setTimeout>;
    async function refreshPlan(date = getPlanTodayKey()): Promise<boolean> {
      const requestId = ++navigationRequestRef.current;
      try {
        while (!cancelled && requestId === navigationRequestRef.current) {
          const revisionAtStart = visibleRevisionRef.current;
          const [raw, tomorrowRaw, closedRaw] = await Promise.all([
            readPlan(date),
            readPlan(getPlanTomorrowKey()),
            AsyncStorage.getItem(CLOSED_DATES_KEY),
          ]);
          if (cancelled || requestId !== navigationRequestRef.current) return false;
          if (revisionAtStart !== visibleRevisionRef.current) continue;
          replaceVisiblePlan(date, raw);
          setTomorrowItemCount(tomorrowRaw.length);
          setClosedDateKeys(normalizeClosedDates(closedRaw));
          setLoadError(null);
          setIsLoading(false);
          return true;
        }
      } catch (error) {
        if (!cancelled && requestId === navigationRequestRef.current) {
          setLoadError('Your saved plan could not be loaded. Retry before making changes.');
          setIsLoading(false);
        }
        reportDiagnostic({ area: 'storage', operation: 'plan.hydrate', severity: 'error', error });
      }
      return false;
    }
    void refreshPlan();

    const refreshAfterDayChange = () => {
      const today = getPlanTodayKey();
      if (today === lastTodayKey.current) return;
      void refreshPlan(today).then((applied) => {
        if (applied) lastTodayKey.current = today;
      });
    };

    const scheduleDayRollover = () => {
      const now = new Date();
      const nextDay = new Date(now);
      nextDay.setHours(24, 0, 1, 0);
      dayTimer = setTimeout(() => {
        refreshAfterDayChange();
        scheduleDayRollover();
      }, nextDay.getTime() - now.getTime());
    };

    scheduleDayRollover();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshAfterDayChange();
    });

    return () => {
      cancelled = true;
      clearTimeout(dayTimer);
      appStateSubscription.remove();
    };
  }, [loadAttempt]);

  const isToday = activeDate === getPlanTodayKey();
  const isActiveDayClosed = isToday && closedDateKeys.includes(activeDate);

  function showToday() {
    const date = getPlanTodayKey();
    const requestId = ++navigationRequestRef.current;
    void (async () => {
      // Keep the requested navigation alive if a visible mutation finishes
      // while this read is pending. A fresh read avoids replacing optimistic
      // UI with an older snapshot without making the user's tap disappear.
      while (requestId === navigationRequestRef.current) {
        const revisionAtStart = visibleRevisionRef.current;
        const [raw, tomorrowRaw] = await Promise.all([
          readPlan(date),
          readPlan(getPlanTomorrowKey()),
        ]);
        if (requestId !== navigationRequestRef.current) return;
        if (revisionAtStart !== visibleRevisionRef.current) continue;
        replaceVisiblePlan(date, raw);
        setTomorrowItemCount(tomorrowRaw.length);
        return;
      }
    })().catch((error) => reportDiagnostic({ area: 'storage', operation: 'plan.showToday', severity: 'error', error }));
  }

  async function showTomorrow(): Promise<PlanItem[]> {
    const date = getPlanTomorrowKey();
    const requestId = ++navigationRequestRef.current;
    let latest: PlanItem[] = [];
    while (requestId === navigationRequestRef.current) {
      const revisionAtStart = visibleRevisionRef.current;
      latest = await readPlan(date);
      if (requestId !== navigationRequestRef.current) return latest;
      if (revisionAtStart !== visibleRevisionRef.current) {
        continue;
      }
      replaceVisiblePlan(date, latest);
      setTomorrowItemCount(latest.length);
      return latest;
    }
    return latest;
  }

  async function showDate(date: string): Promise<PlanItem[]> {
    const requestId = ++navigationRequestRef.current;
    let nextItems: PlanItem[] = [];
    while (requestId === navigationRequestRef.current) {
      const revisionAtStart = visibleRevisionRef.current;
      nextItems = await readPlan(date);
      if (requestId !== navigationRequestRef.current) return nextItems;
      if (revisionAtStart !== visibleRevisionRef.current) continue;
      replaceVisiblePlan(date, nextItems);
      if (date === getPlanTomorrowKey()) setTomorrowItemCount(nextItems.length);
      return nextItems;
    }
    return nextItems;
  }

  async function closeToday() {
    const today = getPlanTodayKey();
    const next = closedDateKeys.includes(today) ? closedDateKeys : [...closedDateKeys, today];
    await AsyncStorage.setItem(CLOSED_DATES_KEY, JSON.stringify(next));
    setClosedDateKeys(next);
  }

  async function reopenToday() {
    const today = getPlanTodayKey();
    const next = closedDateKeys.filter((date) => date !== today);
    await AsyncStorage.setItem(CLOSED_DATES_KEY, JSON.stringify(next));
    setClosedDateKeys(next);
  }

  function addItem(options: PlanItemOptions) {
    const date = activeDateRef.current;
    const item: PlanItem = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      text: options.text.trim(),
      timeSlot: options.timeSlot,
      completed: false,
      planDate: date,
      chainId: options.chainId,
      color: options.color,
      reminderMinutes: options.reminderMinutes,
      isPriority: options.isPriority === true,
      repeatDays: options.repeatDays?.length ? options.repeatDays : undefined,
      durationMinutes: options.durationMinutes,
      gateWindowId: options.gateWindowId,
    };
    const mutation: PlanMutation = (current) => [
      ...current.map((entry) => options.isPriority ? { ...entry, isPriority: false } : entry),
      item,
    ];
    return attachPersistence(item, persistMutation(date, mutation, 'plan.addItem', [item.id]));
  }

  function updateItem(id: string, options: PlanItemOptions) {
    const date = activeDateRef.current;
    const existing = itemsRef.current.find((item) => item.id === id);
    if (!existing) return undefined;
    const normalizedOptions = {
      ...options,
      text: options.text.trim(),
      notificationId: undefined,
      repeatDays: options.repeatDays?.length ? options.repeatDays : undefined,
    };
    const mutation: PlanMutation = (current) => current.map((item) => (
      item.id === id
        ? { ...item, ...normalizedOptions }
        : options.isPriority ? { ...item, isPriority: false } : item
    ));
    const updated: PlanItem = { ...existing, ...normalizedOptions };
    return attachPersistence(updated, persistMutation(date, mutation, 'plan.updateItem', [id]));
  }

  async function updateReminderMetadata(id: string, reminderMinutes?: number, notificationId?: string): Promise<boolean> {
    const item = itemsRef.current.find((entry) => entry.id === id);
    if (!item) return false;
    const date = item.planDate;
    const revisionAtStart = visibleRevisionRef.current;
    let found = false;
    const mutation: PlanMutation = (current) => current.map((entry) => (
      entry.id === id ? { ...entry, reminderMinutes, notificationId } : entry
    ));
    const next = await getPlanRepository(date).update((current) => {
      found = current.some((entry) => entry.id === id);
      return found ? mutation(current) : current;
    });
    if (found) reconcileVisibleMutation(date, next, mutation, revisionAtStart);
    return found;
  }

  async function completeItemForDate(id: string, date: string): Promise<PlanItem | undefined> {
    // A scheduled notification must never complete a task before its actual day.
    if (date > getPlanTodayKey()) return undefined;
    const revisionAtStart = visibleRevisionRef.current;
    let completed: PlanItem | undefined;
    let completionMutation: PlanMutation = (current) => current;
    const next = await getPlanRepository(date).update((current) => {
      const item = current.find((entry) => entry.id === id);
      if (!item) return current;
      const completedAt = item.completedAt ?? new Date().toISOString();
      completed = {
        ...item,
        completed: true,
        completedAt,
        reminderMinutes: undefined,
        notificationId: undefined,
      };
      completionMutation = (visible) => visible.map((entry) => (
        entry.id === id
          ? {
              ...entry,
              completed: true,
              completedAt,
              reminderMinutes: undefined,
              notificationId: undefined,
            }
          : entry
      ));
      return completionMutation(current);
    });
    if (!completed) return undefined;
    reconcileVisibleMutation(date, next, completionMutation, revisionAtStart);
    void removeFocusSession(id).catch((error) => reportDiagnostic({ area: 'storage', operation: 'focusSession.discardAfterManualCompletion', severity: 'warning', error }));
    return completed;
  }

  async function completeFocusItem(id: string, actualMinutes: number, requestedDate?: string): Promise<PlanItem | undefined> {
    const date = requestedDate ?? activeDateRef.current;
    if (date > getPlanTodayKey() || closedDateKeys.includes(date)) return undefined;
    const revisionAtStart = visibleRevisionRef.current;
    const savedSession = date < getPlanTodayKey() ? await readFocusSession(id) : undefined;
    const next = await planStore.completeFocus(date, id, actualMinutes, new Date().toISOString(), savedSession);
    const completed = next.find((item) => item.id === id && item.completed);
    if (!completed) return undefined;
    const completionMutation: PlanMutation = (current) => current.map((item) => item.id === id ? {
      ...item, completed: true, completedAt: completed.completedAt,
      reminderMinutes: undefined, notificationId: undefined,
    } : item);
    reconcileVisibleMutation(date, next, completionMutation, revisionAtStart);
    return completed;
  }

  async function updateReminderForDate(id: string, date: string, reminderMinutes?: number, notificationId?: string): Promise<boolean> {
    const revisionAtStart = visibleRevisionRef.current;
    let found = false;
    const mutation: PlanMutation = (current) => current.map((entry) => (
      entry.id === id ? { ...entry, reminderMinutes, notificationId } : entry
    ));
    const next = await getPlanRepository(date).update((current) => {
      found = current.some((entry) => entry.id === id);
      return found ? mutation(current) : current;
    });
    if (found) reconcileVisibleMutation(date, next, mutation, revisionAtStart);
    return found;
  }

  async function moveItemToTomorrow(id: string): Promise<PlanItem | undefined> {
    const item = itemsRef.current.find((entry) => entry.id === id);
    if (!item || item.completed) return undefined;
    const sourceDate = activeDateRef.current;
    const tomorrow = getPlanTomorrowKey();
    const moved: PlanItem = {
      ...item,
      id: `${Date.now()}${Math.random().toString(36).substring(2, 8)}`,
      completed: false,
      planDate: tomorrow,
      reminderMinutes: undefined,
      notificationId: undefined,
      completedAt: undefined,
    };
    const nextTomorrow = await getPlanRepository(tomorrow).update((current) => [
      ...current.filter((entry) => !(moved.repeatSourceId && entry.repeatSourceId === moved.repeatSourceId && entry.repeatGenerated && !entry.completed)),
      { ...moved, repeatGenerated: false },
    ]);
    if (activeDateRef.current === tomorrow) {
      applyVisibleMutation(tomorrow, (current) => (
        current.some((entry) => entry.id === moved.id) ? current : [...current, moved]
      ));
    }
    // This operation uses two serialized saves. Updating the destination
    // first guarantees the task cannot disappear from both days.
    // If the source update fails, a recoverable duplicate may remain.
    const remaining = await getPlanRepository(sourceDate).update((current) => (
      current.filter((entry) => entry.id !== id)
    ));
    if (activeDateRef.current === sourceDate) {
      applyVisibleMutation(sourceDate, (current) => current.filter((entry) => entry.id !== id));
    }
    setTomorrowItemCount(sourceDate === tomorrow ? remaining.length : nextTomorrow.length);
    void removeFocusSession(id).catch((error) => reportDiagnostic({ area: 'storage', operation: 'focusSession.discardAfterMove', severity: 'warning', error }));
    return moved;
  }

  async function copyItemToTomorrow(id: string): Promise<PlanItem | undefined> {
    const item = itemsRef.current.find((entry) => entry.id === id);
    if (!item) return undefined;
    const tomorrow = getPlanTomorrowKey();
    const copied: PlanItem = {
      ...item,
      id: `${Date.now()}${Math.random().toString(36).substring(2, 8)}`,
      completed: false,
      planDate: tomorrow,
      reminderMinutes: undefined,
      notificationId: undefined,
      completedAt: undefined,
      isPriority: false,
    };
    const nextTomorrow = await getPlanRepository(tomorrow).update((current) => [
      ...current.filter((entry) => !(copied.repeatSourceId && entry.repeatSourceId === copied.repeatSourceId && entry.repeatGenerated && !entry.completed)),
      { ...copied, repeatGenerated: false },
    ]);
    if (activeDateRef.current === tomorrow) {
      applyVisibleMutation(tomorrow, (current) => (
        current.some((entry) => entry.id === copied.id) ? current : [...current, copied]
      ));
    }
    setTomorrowItemCount(nextTomorrow.length);
    return copied;
  }

  async function removeItem(id: string): Promise<PlanPersistenceResult> {
    const item = itemsRef.current.find((entry) => entry.id === id);
    if (!item) return { status: 'persisted' };
    const result = await persistenceResult(
      persistMutation(item.planDate, (current) => current.filter((entry) => entry.id !== id), 'plan.removeItem'),
    );
    if (result.status === 'persisted') {
      await removeFocusSession(id).catch((error) => reportDiagnostic({ area: 'storage', operation: 'focusSession.discardAfterTaskRemoval', severity: 'warning', error }));
    }
    return result;
  }

  async function toggleItem(id: string): Promise<PlanPersistenceResult> {
    if (activeDateRef.current !== getPlanTodayKey() || closedDateKeys.includes(activeDateRef.current)) {
      return { status: 'persisted' };
    }
    const target = itemsRef.current.find((item) => item.id === id);
    if (!target) return { status: 'persisted' };
    const completing = Boolean(target && !target.completed);
    const completedAt = completing ? new Date().toISOString() : undefined;
    const mutation: PlanMutation = (current) => current.map((item) => (
      item.id === id
        ? {
            ...item,
            completed: completing,
            completedAt,
            reminderMinutes: completing ? undefined : item.reminderMinutes,
            notificationId: completing ? undefined : item.notificationId,
          }
        : item
    ));
    const result = await persistenceResult(persistMutation(target.planDate, mutation, 'plan.toggleItem'));
    if (completing && result.status === 'persisted') {
      await removeFocusSession(id).catch((error) => reportDiagnostic({ area: 'storage', operation: 'focusSession.discardAfterManualCompletion', severity: 'warning', error }));
    }
    return result;
  }

  const value = useMemo(() => ({ items, isLoading, loadError, retryLoad, activeDate, isToday, isActiveDayClosed, tomorrowItemCount, readItemsForDate, showToday, showTomorrow, showDate, closeToday, reopenToday, addItem, updateItem, updateReminderMetadata, completeItemForDate, completeFocusItem, updateReminderForDate, moveItemToTomorrow, copyItemToTomorrow, removeItem, toggleItem }), [items, isLoading, loadError, retryLoad, activeDate, isToday, isActiveDayClosed, tomorrowItemCount, closedDateKeys, readItemsForDate]);
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used within PlanProvider');
  return ctx;
}
