import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  decodePlanItems,
  getPlanTodayKey,
  getPlanTomorrowKey,
  normalizeClosedDates,
  normalizeFocusLog,
  resolvePlanForDate,
  type FocusLogEntry,
  type PlanItem,
  type PlanItemOptions,
} from '@/domain/plan';
import { createVersionedRepository, type VersionedRepository } from '@/lib/versionedRepository';
import { reportDiagnostic } from '@/lib/diagnostics';

export type { FocusLogEntry, PlanItem, PlanItemOptions } from '@/domain/plan';
export { getPlanTodayKey, getPlanTomorrowKey } from '@/domain/plan';

interface PlanContextValue {
  items: PlanItem[];
  activeDate: string;
  isToday: boolean;
  isActiveDayClosed: boolean;
  tomorrowItemCount: number;
  showToday: () => void;
  showTomorrow: () => Promise<PlanItem[]>;
  showDate: (date: string) => Promise<PlanItem[]>;
  closeToday: () => Promise<void>;
  reopenToday: () => Promise<void>;
  addItem: (options: PlanItemOptions) => PlanItem;
  updateItem: (id: string, options: PlanItemOptions) => PlanItem | undefined;
  updateReminderMetadata: (id: string, reminderMinutes?: number, notificationId?: string) => void;
  completeItemForDate: (id: string, date: string) => Promise<PlanItem | undefined>;
  completeFocusItem: (id: string, actualMinutes: number) => Promise<PlanItem | undefined>;
  updateReminderForDate: (id: string, date: string, reminderMinutes?: number, notificationId?: string) => Promise<void>;
  moveItemToTomorrow: (id: string) => Promise<PlanItem | undefined>;
  copyItemToTomorrow: (id: string) => Promise<PlanItem | undefined>;
  removeItem: (id: string) => void;
  toggleItem: (id: string) => void;
}

const KEY_PREFIX = '@chain_plan_';
const CLOSED_DATES_KEY = '@chain_plan_closed_dates';
export const FOCUS_LOG_KEY = '@chain_focus_log';

const planRepositories = new Map<string, VersionedRepository<PlanItem[]>>();

function getPlanRepository(date: string) {
  let repository = planRepositories.get(date);
  if (!repository) {
    repository = createVersionedRepository<PlanItem[]>({
      storage: AsyncStorage,
      key: KEY_PREFIX + date,
      version: 2,
      decode: (value) => decodePlanItems(value, date),
      empty: () => [],
    });
    planRepositories.set(date, repository);
  }
  return repository;
}

const readPlan = (date: string) => getPlanRepository(date).read();
const writePlan = (date: string, items: PlanItem[]) => getPlanRepository(date).write(items);

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<PlanItem[]>([]);
  const [activeDate, setActiveDate] = useState(getPlanTodayKey());
  const [tomorrowItemCount, setTomorrowItemCount] = useState(0);
  const [closedDateKeys, setClosedDateKeys] = useState<string[]>([]);
  const lastTodayKey = useRef(getPlanTodayKey());
  const itemsRef = useRef<PlanItem[]>([]);
  const activeDateRef = useRef(activeDate);
  const storageWriteQueue = useRef<Promise<void>>(Promise.resolve());

  function replaceVisiblePlan(date: string, nextItems: PlanItem[]) {
    activeDateRef.current = date;
    itemsRef.current = nextItems;
    setActiveDate(date);
    setItems(nextItems);
  }

  function queuePlanWrite(date: string, nextItems: PlanItem[]) {
    storageWriteQueue.current = storageWriteQueue.current
      .catch(() => undefined)
      .then(() => writePlan(date, nextItems))
      .catch((error) => reportDiagnostic({ area: 'storage', operation: 'plan.persist', severity: 'error', error }));
  }

  useEffect(() => {
    let cancelled = false;
    let dayTimer: ReturnType<typeof setTimeout>;
    async function refreshPlan(date = getPlanTodayKey()) {
      try {
        const [raw, tomorrowRaw, closedRaw] = await Promise.all([
          readPlan(date),
          readPlan(getPlanTomorrowKey()),
          AsyncStorage.getItem(CLOSED_DATES_KEY),
        ]);
        const nextItems = raw;
        if (!cancelled) {
          replaceVisiblePlan(date, nextItems);
          setTomorrowItemCount(tomorrowRaw.length);
          setClosedDateKeys(normalizeClosedDates(closedRaw));
        }
      } catch (error) {
        reportDiagnostic({ area: 'storage', operation: 'plan.hydrate', severity: 'error', error });
      }
    }
    void refreshPlan();

    const refreshAfterDayChange = () => {
      const today = getPlanTodayKey();
      if (today === lastTodayKey.current) return;
      lastTodayKey.current = today;
      void refreshPlan(today);
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
  }, []);

  const isToday = activeDate === getPlanTodayKey();
  const isActiveDayClosed = isToday && closedDateKeys.includes(activeDate);

  function showToday() {
    const date = getPlanTodayKey();
    void Promise.all([
      readPlan(date),
      readPlan(getPlanTomorrowKey()),
    ]).then(([raw, tomorrowRaw]) => {
      replaceVisiblePlan(date, raw);
      setTomorrowItemCount(tomorrowRaw.length);
    }).catch((error) => reportDiagnostic({ area: 'storage', operation: 'plan.showToday', severity: 'error', error }));
  }

  async function showTomorrow(): Promise<PlanItem[]> {
    const date = getPlanTomorrowKey();
    const [raw, todayRaw] = await Promise.all([
      readPlan(date),
      readPlan(getPlanTodayKey()),
    ]);
    const nextItems = raw;
    const todayItems = todayRaw;
    const resolved = resolvePlanForDate(nextItems, todayItems, date, () => `${Date.now()}${Math.random().toString(36).substring(2, 8)}`);
    if (resolved.length !== nextItems.length) await writePlan(date, resolved);
    replaceVisiblePlan(date, resolved);
    setTomorrowItemCount(resolved.length);
    return resolved;
  }

  function showDate(date: string): Promise<PlanItem[]> {
    return readPlan(date).then((nextItems) => {
      replaceVisiblePlan(date, nextItems);
      if (date === getPlanTomorrowKey()) setTomorrowItemCount(nextItems.length);
      return nextItems;
    });
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

  function persist(next: PlanItem[]) {
    const date = activeDateRef.current;
    itemsRef.current = next;
    setItems(next);
    queuePlanWrite(date, next);
    if (date === getPlanTomorrowKey()) setTomorrowItemCount(next.length);
  }

  function recordFocus(item: PlanItem, completedAt: string, actualMinutes = item.durationMinutes) {
    if (!item.chainId || !item.durationMinutes) return;
    void AsyncStorage.getItem(FOCUS_LOG_KEY).then((raw) => {
      const existing = normalizeFocusLog(raw).filter((entry) => entry.itemId !== item.id);
      const next = [...existing, { itemId: item.id, chainId: item.chainId!, date: item.planDate, minutes: Math.max(1, actualMinutes || item.durationMinutes!), completedAt }];
      return AsyncStorage.setItem(FOCUS_LOG_KEY, JSON.stringify(next.slice(-500)));
    });
  }

  function addItem(options: PlanItemOptions) {
    const item: PlanItem = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      text: options.text.trim(),
      timeSlot: options.timeSlot,
      completed: false,
      planDate: activeDate,
      chainId: options.chainId,
      color: options.color,
      reminderMinutes: options.reminderMinutes,
      isPriority: options.isPriority === true,
      repeatDays: options.repeatDays?.length ? options.repeatDays : undefined,
      durationMinutes: options.durationMinutes,
      gateWindowId: options.gateWindowId,
    };
    persist([...itemsRef.current.map((entry) => options.isPriority ? { ...entry, isPriority: false } : entry), item]);
    return item;
  }

  function updateItem(id: string, options: PlanItemOptions) {
    const existing = itemsRef.current.find((item) => item.id === id);
    if (!existing) return undefined;
    const updated: PlanItem = { ...existing, ...options, text: options.text.trim(), notificationId: undefined, repeatDays: options.repeatDays?.length ? options.repeatDays : undefined };
    persist(itemsRef.current.map((item) => item.id === id ? updated : options.isPriority ? { ...item, isPriority: false } : item));
    return updated;
  }

  function updateReminderMetadata(id: string, reminderMinutes?: number, notificationId?: string) {
    setItems((previous) => {
      const next = previous.map((item) => item.id === id ? { ...item, reminderMinutes, notificationId } : item);
      itemsRef.current = next;
      queuePlanWrite(activeDateRef.current, next);
      return next;
    });
  }

  async function completeItemForDate(id: string, date: string): Promise<PlanItem | undefined> {
    // A scheduled notification must never complete a task before its actual day.
    if (date > getPlanTodayKey()) return undefined;
    const current = await readPlan(date);
    const item = current.find((entry) => entry.id === id);
    if (!item) return undefined;
    const completedAt = new Date().toISOString();
    const next = current.map((entry) => entry.id === id ? { ...entry, completed: true, completedAt } : entry);
    await writePlan(date, next);
    if (date === activeDateRef.current) {
      itemsRef.current = next;
      setItems(next);
    }
    const completed = { ...item, completed: true, completedAt };
    recordFocus(completed, completedAt);
    return completed;
  }

  async function completeFocusItem(id: string, actualMinutes: number): Promise<PlanItem | undefined> {
    if (activeDateRef.current !== getPlanTodayKey() || closedDateKeys.includes(activeDateRef.current)) return undefined;
    const item = itemsRef.current.find((entry) => entry.id === id);
    if (!item) return undefined;
    const completedAt = new Date().toISOString();
    const completed = { ...item, completed: true, completedAt };
    persist(itemsRef.current.map((entry) => entry.id === id ? completed : entry));
    recordFocus(completed, completedAt, actualMinutes);
    return completed;
  }

  async function updateReminderForDate(id: string, date: string, reminderMinutes?: number, notificationId?: string) {
    const current = await readPlan(date);
    const next = current.map((entry) => entry.id === id ? { ...entry, reminderMinutes, notificationId } : entry);
    await writePlan(date, next);
    if (date === activeDateRef.current) {
      itemsRef.current = next;
      setItems(next);
    }
  }

  async function moveItemToTomorrow(id: string): Promise<PlanItem | undefined> {
    const item = itemsRef.current.find((entry) => entry.id === id);
    if (!item || item.completed) return undefined;
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
    const remaining = itemsRef.current.filter((entry) => entry.id !== id);
    const tomorrowItems = await readPlan(tomorrow);
    const nextTomorrow = [...tomorrowItems, moved];
    await Promise.all([
      writePlan(activeDateRef.current, remaining),
      writePlan(tomorrow, nextTomorrow),
    ]);
    itemsRef.current = remaining;
    setItems(remaining);
    setTomorrowItemCount(nextTomorrow.length);
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
      notificationId: undefined,
      completedAt: undefined,
      isPriority: false,
    };
    const tomorrowItems = await readPlan(tomorrow);
    const nextTomorrow = [...tomorrowItems, copied];
    await writePlan(tomorrow, nextTomorrow);
    setTomorrowItemCount(nextTomorrow.length);
    return copied;
  }

  function removeItem(id: string) {
    persist(itemsRef.current.filter((item) => item.id !== id));
  }

  function toggleItem(id: string) {
    if (activeDateRef.current !== getPlanTodayKey() || closedDateKeys.includes(activeDateRef.current)) return;
    const target = itemsRef.current.find((item) => item.id === id);
    const completing = Boolean(target && !target.completed);
    const completedAt = completing ? new Date().toISOString() : undefined;
    const next = itemsRef.current.map((item) => item.id === id ? { ...item, completed: !item.completed, completedAt } : item);
    persist(next);
    if (target && completedAt) recordFocus({ ...target, completed: true, completedAt }, completedAt);
  }

  const value = useMemo(() => ({ items, activeDate, isToday, isActiveDayClosed, tomorrowItemCount, showToday, showTomorrow, showDate, closeToday, reopenToday, addItem, updateItem, updateReminderMetadata, completeItemForDate, completeFocusItem, updateReminderForDate, moveItemToTomorrow, copyItemToTomorrow, removeItem, toggleItem }), [items, activeDate, isToday, isActiveDayClosed, tomorrowItemCount, closedDateKeys]);
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used within PlanProvider');
  return ctx;
}
