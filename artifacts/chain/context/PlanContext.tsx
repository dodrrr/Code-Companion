import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
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
}

type PlanItemOptions = Pick<PlanItem, 'text' | 'timeSlot' | 'chainId' | 'color' | 'reminderMinutes'>;

interface PlanContextValue {
  items: PlanItem[];
  activeDate: string;
  isToday: boolean;
  showToday: () => void;
  showTomorrow: () => void;
  addItem: (options: PlanItemOptions) => PlanItem;
  updateItem: (id: string, options: PlanItemOptions) => PlanItem | undefined;
  updateReminderMetadata: (id: string, reminderMinutes?: number, notificationId?: string) => void;
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

  useEffect(() => {
    let cancelled = false;
    async function refreshPlan(date = getPlanTodayKey()) {
      const nextItems = normalizeItems(await AsyncStorage.getItem(KEY_PREFIX + date), date);
      if (!cancelled) {
        setActiveDate(date);
        setItems(nextItems);
      }
    }
    void refreshPlan();
    return () => { cancelled = true; };
  }, []);

  const isToday = activeDate === getPlanTodayKey();

  function showToday() {
    const date = getPlanTodayKey();
    void AsyncStorage.getItem(KEY_PREFIX + date).then((raw) => {
      setActiveDate(date);
      setItems(normalizeItems(raw, date));
    });
  }

  function showTomorrow() {
    const date = getPlanTomorrowKey();
    void AsyncStorage.getItem(KEY_PREFIX + date).then((raw) => {
      setActiveDate(date);
      setItems(normalizeItems(raw, date));
    });
  }

  function persist(next: PlanItem[]) {
    setItems(next);
    void AsyncStorage.setItem(KEY_PREFIX + activeDate, JSON.stringify(next));
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
    };
    persist([...items, item]);
    return item;
  }

  function updateItem(id: string, options: PlanItemOptions) {
    const existing = items.find((item) => item.id === id);
    if (!existing) return undefined;
    const updated: PlanItem = { ...existing, ...options, text: options.text.trim(), notificationId: undefined };
    persist(items.map((item) => item.id === id ? updated : item));
    return updated;
  }

  function updateReminderMetadata(id: string, reminderMinutes?: number, notificationId?: string) {
    setItems((previous) => {
      const next = previous.map((item) => item.id === id ? { ...item, reminderMinutes, notificationId } : item);
      void AsyncStorage.setItem(KEY_PREFIX + activeDate, JSON.stringify(next));
      return next;
    });
  }

  function removeItem(id: string) {
    persist(items.filter((item) => item.id !== id));
  }

  function toggleItem(id: string) {
    persist(items.map((item) => item.id === id ? { ...item, completed: !item.completed } : item));
  }

  const value = useMemo(() => ({ items, activeDate, isToday, showToday, showTomorrow, addItem, updateItem, updateReminderMetadata, removeItem, toggleItem }), [items, activeDate, isToday]);
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used within PlanProvider');
  return ctx;
}
