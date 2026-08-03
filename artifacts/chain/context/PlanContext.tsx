import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PlanItem {
  id: string;
  text: string;
  timeSlot: string;
  completed: boolean;
  planDate: string;
  chainId?: string;
  color?: string;
  reminderMinutes?: number;
  notificationId?: string;
  isPriority?: boolean;
  repeatDays?: number[];
  repeatSourceId?: string;
  durationMinutes?: number;
  completedAt?: string;
}

type PlanItemOptions = Pick<PlanItem, 'text' | 'timeSlot' | 'chainId' | 'color' | 'reminderMinutes' | 'isPriority' | 'repeatDays' | 'durationMinutes'>;

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

export interface FocusLogEntry { itemId: string; chainId: string; date: string; minutes: number; completedAt: string; }

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getPlanTodayKey() {
  return toDateKey(new Date());
}

export function getPlanTomorrowKey() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return toDateKey(date);
}

function normalizeItems(raw: string | null, fallbackDate: string): PlanItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value): PlanItem[] => {
      if (!value || typeof value !== 'object') return [];
      const item = value as Partial<PlanItem>;
      if (typeof item.id !== 'string' || typeof item.text !== 'string') return [];
      return [{
        id: item.id,
        text: item.text.trim(),
        timeSlot: typeof item.timeSlot === 'string' ? item.timeSlot : '',
        completed: item.completed === true,
        planDate: typeof item.planDate === 'string' ? item.planDate : fallbackDate,
        chainId: typeof item.chainId === 'string' ? item.chainId : undefined,
        color: typeof item.color === 'string' ? item.color : undefined,
        reminderMinutes: typeof item.reminderMinutes === 'number' ? item.reminderMinutes : undefined,
        notificationId: typeof item.notificationId === 'string' ? item.notificationId : undefined,
        isPriority: item.isPriority === true,
        repeatDays: Array.isArray(item.repeatDays) ? item.repeatDays.filter((day): day is number => typeof day === 'number' && day >= 0 && day <= 6) : undefined,
        repeatSourceId: typeof item.repeatSourceId === 'string' ? item.repeatSourceId : undefined,
        durationMinutes: typeof item.durationMinutes === 'number' && item.durationMinutes > 0 ? item.durationMinutes : undefined,
        completedAt: typeof item.completedAt === 'string' ? item.completedAt : undefined,
      }];
    });
  } catch {
    return [];
  }
}

function normalizeClosedDates(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

function normalizeFocusLog(raw: string | null): FocusLogEntry[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((entry): entry is FocusLogEntry => Boolean(entry && typeof entry.itemId === 'string' && typeof entry.chainId === 'string' && typeof entry.date === 'string' && typeof entry.minutes === 'number' && typeof entry.completedAt === 'string')) : [];
  } catch { return []; }
}

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<PlanItem[]>([]);
  const [activeDate, setActiveDate] = useState(getPlanTodayKey());
  const [tomorrowItemCount, setTomorrowItemCount] = useState(0);
  const [closedDateKeys, setClosedDateKeys] = useState<string[]>([]);
  const lastTodayKey = useRef(getPlanTodayKey());

  useEffect(() => {
    let cancelled = false;
    let dayTimer: ReturnType<typeof setTimeout>;
    async function refreshPlan(date = getPlanTodayKey()) {
      const [raw, tomorrowRaw, closedRaw] = await Promise.all([
        AsyncStorage.getItem(KEY_PREFIX + date),
        AsyncStorage.getItem(KEY_PREFIX + getPlanTomorrowKey()),
        AsyncStorage.getItem(CLOSED_DATES_KEY),
      ]);
      const nextItems = normalizeItems(raw, date);
      if (!cancelled) {
        setActiveDate(date);
        setItems(nextItems);
        setTomorrowItemCount(normalizeItems(tomorrowRaw, getPlanTomorrowKey()).length);
        setClosedDateKeys(normalizeClosedDates(closedRaw));
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
      AsyncStorage.getItem(KEY_PREFIX + date),
      AsyncStorage.getItem(KEY_PREFIX + getPlanTomorrowKey()),
    ]).then(([raw, tomorrowRaw]) => {
      setActiveDate(date);
      setItems(normalizeItems(raw, date));
      setTomorrowItemCount(normalizeItems(tomorrowRaw, getPlanTomorrowKey()).length);
    });
  }

  async function showTomorrow(): Promise<PlanItem[]> {
    const date = getPlanTomorrowKey();
    const [raw, todayRaw] = await Promise.all([
      AsyncStorage.getItem(KEY_PREFIX + date),
      AsyncStorage.getItem(KEY_PREFIX + getPlanTodayKey()),
    ]);
    const nextItems = normalizeItems(raw, date);
    const todayItems = normalizeItems(todayRaw, getPlanTodayKey());
    const tomorrowDay = new Date(`${date}T12:00:00`).getDay();
    const repeated = todayItems
      .filter((item) => item.repeatDays?.includes(tomorrowDay) && !nextItems.some((next) => next.repeatSourceId === (item.repeatSourceId || item.id)))
      .map((item) => ({ ...item, id: `${Date.now()}${Math.random().toString(36).substring(2, 8)}`, completed: false, completedAt: undefined, planDate: date, notificationId: undefined, isPriority: false, repeatSourceId: item.repeatSourceId || item.id }));
    const resolved = [...nextItems, ...repeated];
    if (repeated.length) await AsyncStorage.setItem(KEY_PREFIX + date, JSON.stringify(resolved));
    setActiveDate(date);
    setItems(resolved);
    setTomorrowItemCount(resolved.length);
    return resolved;
  }

  function showDate(date: string): Promise<PlanItem[]> {
    return AsyncStorage.getItem(KEY_PREFIX + date).then((raw) => {
      const nextItems = normalizeItems(raw, date);
      setActiveDate(date);
      setItems(nextItems);
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
    setItems(next);
    void AsyncStorage.setItem(KEY_PREFIX + activeDate, JSON.stringify(next));
    if (activeDate === getPlanTomorrowKey()) setTomorrowItemCount(next.length);
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
    };
    persist([...items.map((entry) => options.isPriority ? { ...entry, isPriority: false } : entry), item]);
    return item;
  }

  function updateItem(id: string, options: PlanItemOptions) {
    const existing = items.find((item) => item.id === id);
    if (!existing) return undefined;
    const updated: PlanItem = { ...existing, ...options, text: options.text.trim(), notificationId: undefined, repeatDays: options.repeatDays?.length ? options.repeatDays : undefined };
    persist(items.map((item) => item.id === id ? updated : options.isPriority ? { ...item, isPriority: false } : item));
    return updated;
  }

  function updateReminderMetadata(id: string, reminderMinutes?: number, notificationId?: string) {
    setItems((previous) => {
      const next = previous.map((item) => item.id === id ? { ...item, reminderMinutes, notificationId } : item);
      void AsyncStorage.setItem(KEY_PREFIX + activeDate, JSON.stringify(next));
      return next;
    });
  }

  async function completeItemForDate(id: string, date: string): Promise<PlanItem | undefined> {
    // A scheduled notification must never complete a task before its actual day.
    if (date > getPlanTodayKey()) return undefined;
    const raw = await AsyncStorage.getItem(KEY_PREFIX + date);
    const current = normalizeItems(raw, date);
    const item = current.find((entry) => entry.id === id);
    if (!item) return undefined;
    const completedAt = new Date().toISOString();
    const next = current.map((entry) => entry.id === id ? { ...entry, completed: true, completedAt } : entry);
    await AsyncStorage.setItem(KEY_PREFIX + date, JSON.stringify(next));
    if (date === activeDate) setItems(next);
    const completed = { ...item, completed: true, completedAt };
    recordFocus(completed, completedAt);
    return completed;
  }

  async function completeFocusItem(id: string, actualMinutes: number): Promise<PlanItem | undefined> {
    if (activeDate !== getPlanTodayKey() || closedDateKeys.includes(activeDate)) return undefined;
    const item = items.find((entry) => entry.id === id);
    if (!item) return undefined;
    const completedAt = new Date().toISOString();
    const completed = { ...item, completed: true, completedAt };
    persist(items.map((entry) => entry.id === id ? completed : entry));
    recordFocus(completed, completedAt, actualMinutes);
    return completed;
  }

  async function updateReminderForDate(id: string, date: string, reminderMinutes?: number, notificationId?: string) {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + date);
    const current = normalizeItems(raw, date);
    const next = current.map((entry) => entry.id === id ? { ...entry, reminderMinutes, notificationId } : entry);
    await AsyncStorage.setItem(KEY_PREFIX + date, JSON.stringify(next));
    if (date === activeDate) setItems(next);
  }

  async function moveItemToTomorrow(id: string): Promise<PlanItem | undefined> {
    const item = items.find((entry) => entry.id === id);
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
    const remaining = items.filter((entry) => entry.id !== id);
    const tomorrowRaw = await AsyncStorage.getItem(KEY_PREFIX + tomorrow);
    const nextTomorrow = [...normalizeItems(tomorrowRaw, tomorrow), moved];
    await Promise.all([
      AsyncStorage.setItem(KEY_PREFIX + activeDate, JSON.stringify(remaining)),
      AsyncStorage.setItem(KEY_PREFIX + tomorrow, JSON.stringify(nextTomorrow)),
    ]);
    setItems(remaining);
    setTomorrowItemCount(nextTomorrow.length);
    return moved;
  }

  async function copyItemToTomorrow(id: string): Promise<PlanItem | undefined> {
    const item = items.find((entry) => entry.id === id);
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
    const tomorrowRaw = await AsyncStorage.getItem(KEY_PREFIX + tomorrow);
    const nextTomorrow = [...normalizeItems(tomorrowRaw, tomorrow), copied];
    await AsyncStorage.setItem(KEY_PREFIX + tomorrow, JSON.stringify(nextTomorrow));
    setTomorrowItemCount(nextTomorrow.length);
    return copied;
  }

  function removeItem(id: string) {
    persist(items.filter((item) => item.id !== id));
  }

  function toggleItem(id: string) {
    if (activeDate !== getPlanTodayKey() || closedDateKeys.includes(activeDate)) return;
    const target = items.find((item) => item.id === id);
    const completing = Boolean(target && !target.completed);
    const completedAt = completing ? new Date().toISOString() : undefined;
    const next = items.map((item) => item.id === id ? { ...item, completed: !item.completed, completedAt } : item);
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
