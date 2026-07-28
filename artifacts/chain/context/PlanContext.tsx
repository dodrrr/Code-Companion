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
}

type PlanItemOptions = Pick<PlanItem, 'text' | 'timeSlot' | 'chainId' | 'color' | 'reminderMinutes' | 'isPriority'>;

interface PlanContextValue {
  items: PlanItem[];
  activeDate: string;
  isToday: boolean;
  tomorrowItemCount: number;
  showToday: () => void;
  showTomorrow: () => void;
  showDate: (date: string) => Promise<PlanItem[]>;
  addItem: (options: PlanItemOptions) => PlanItem;
  updateItem: (id: string, options: PlanItemOptions) => PlanItem | undefined;
  updateReminderMetadata: (id: string, reminderMinutes?: number, notificationId?: string) => void;
  completeItemForDate: (id: string, date: string) => Promise<PlanItem | undefined>;
  updateReminderForDate: (id: string, date: string, reminderMinutes?: number, notificationId?: string) => Promise<void>;
  moveItemToTomorrow: (id: string) => Promise<PlanItem | undefined>;
  removeItem: (id: string) => void;
  toggleItem: (id: string) => void;
}

const KEY_PREFIX = '@chain_plan_';

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
      }];
    });
  } catch {
    return [];
  }
}

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<PlanItem[]>([]);
  const [activeDate, setActiveDate] = useState(getPlanTodayKey());
  const [tomorrowItemCount, setTomorrowItemCount] = useState(0);
  const lastTodayKey = useRef(getPlanTodayKey());

  useEffect(() => {
    let cancelled = false;
    let dayTimer: ReturnType<typeof setTimeout>;
    async function refreshPlan(date = getPlanTodayKey()) {
      const [raw, tomorrowRaw] = await Promise.all([
        AsyncStorage.getItem(KEY_PREFIX + date),
        AsyncStorage.getItem(KEY_PREFIX + getPlanTomorrowKey()),
      ]);
      const nextItems = normalizeItems(raw, date);
      if (!cancelled) {
        setActiveDate(date);
        setItems(nextItems);
        setTomorrowItemCount(normalizeItems(tomorrowRaw, getPlanTomorrowKey()).length);
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

  function showTomorrow() {
    const date = getPlanTomorrowKey();
    void AsyncStorage.getItem(KEY_PREFIX + date).then((raw) => {
      setActiveDate(date);
      const nextItems = normalizeItems(raw, date);
      setItems(nextItems);
      setTomorrowItemCount(nextItems.length);
    });
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

  function persist(next: PlanItem[]) {
    setItems(next);
    void AsyncStorage.setItem(KEY_PREFIX + activeDate, JSON.stringify(next));
    if (activeDate === getPlanTomorrowKey()) setTomorrowItemCount(next.length);
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
    };
    persist([...items.map((entry) => options.isPriority ? { ...entry, isPriority: false } : entry), item]);
    return item;
  }

  function updateItem(id: string, options: PlanItemOptions) {
    const existing = items.find((item) => item.id === id);
    if (!existing) return undefined;
    const updated: PlanItem = { ...existing, ...options, text: options.text.trim(), notificationId: undefined };
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
    const raw = await AsyncStorage.getItem(KEY_PREFIX + date);
    const current = normalizeItems(raw, date);
    const item = current.find((entry) => entry.id === id);
    if (!item) return undefined;
    const next = current.map((entry) => entry.id === id ? { ...entry, completed: true } : entry);
    await AsyncStorage.setItem(KEY_PREFIX + date, JSON.stringify(next));
    if (date === activeDate) setItems(next);
    return { ...item, completed: true };
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

  function removeItem(id: string) {
    persist(items.filter((item) => item.id !== id));
  }

  function toggleItem(id: string) {
    persist(items.map((item) => item.id === id ? { ...item, completed: !item.completed } : item));
  }

  const value = useMemo(() => ({ items, activeDate, isToday, tomorrowItemCount, showToday, showTomorrow, showDate, addItem, updateItem, updateReminderMetadata, completeItemForDate, updateReminderForDate, moveItemToTomorrow, removeItem, toggleItem }), [items, activeDate, isToday, tomorrowItemCount]);
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used within PlanProvider');
  return ctx;
}
