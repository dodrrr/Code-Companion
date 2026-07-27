import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PlanItem {
  id: string;
  text: string;
  timeSlot: string;
  completed: boolean;
  chainId?: string;
  color?: string;
  reminderMinutes?: number;
  notificationId?: string;
}

interface PlanContextValue {
  items: PlanItem[];
  addItem: (text: string, timeSlot: string, options?: { chainId?: string; color?: string; reminderMinutes?: number }) => PlanItem;
  updateReminderMetadata: (id: string, reminderMinutes?: number, notificationId?: string) => void;
  removeItem: (id: string) => void;
  toggleItem: (id: string) => void;
}

const KEY_PREFIX = '@chain_plan_';

function getTomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const PlanContext = createContext<PlanContextValue | null>(null);

function normalizeItems(raw: string | null): PlanItem[] {
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

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<PlanItem[]>([]);
  const dateKey = getTomorrowStr();

  useEffect(() => {
    AsyncStorage.getItem(KEY_PREFIX + dateKey).then((raw) => {
      setItems(normalizeItems(raw));
    });
  }, [dateKey]);

  function persist(next: PlanItem[]) {
    setItems(next);
    AsyncStorage.setItem(KEY_PREFIX + dateKey, JSON.stringify(next));
  }

  function addItem(text: string, timeSlot: string, options?: { chainId?: string; color?: string; reminderMinutes?: number }) {
    const item: PlanItem = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        text: text.trim(),
        timeSlot,
        completed: false,
        chainId: options?.chainId,
        color: options?.color,
        reminderMinutes: options?.reminderMinutes,
      };
    persist([...items, item]);
    return item;
  }

  function updateReminderMetadata(id: string, reminderMinutes?: number, notificationId?: string) {
    setItems((previous) => {
      const next = previous.map((item) => (
        item.id === id ? { ...item, reminderMinutes, notificationId } : item
      ));
      void AsyncStorage.setItem(KEY_PREFIX + dateKey, JSON.stringify(next));
      return next;
    });
  }

  function removeItem(id: string) {
    persist(items.filter((i) => i.id !== id));
  }

  function toggleItem(id: string) {
    persist(
      items.map((i) => (i.id === id ? { ...i, completed: !i.completed } : i)),
    );
  }

  return (
    <PlanContext.Provider value={{ items, addItem, updateReminderMetadata, removeItem, toggleItem }}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used within PlanProvider');
  return ctx;
}
