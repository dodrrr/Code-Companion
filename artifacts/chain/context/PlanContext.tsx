import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PlanItem {
  id: string;
  text: string;
  timeSlot: string;
  completed: boolean;
}

interface PlanContextValue {
  items: PlanItem[];
  addItem: (text: string, timeSlot: string) => void;
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

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<PlanItem[]>([]);
  const dateKey = getTomorrowStr();

  useEffect(() => {
    AsyncStorage.getItem(KEY_PREFIX + dateKey).then((raw) => {
      setItems(raw ? JSON.parse(raw) : []);
    });
  }, [dateKey]);

  function persist(next: PlanItem[]) {
    setItems(next);
    AsyncStorage.setItem(KEY_PREFIX + dateKey, JSON.stringify(next));
  }

  function addItem(text: string, timeSlot: string) {
    persist([
      ...items,
      {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        text: text.trim(),
        timeSlot,
        completed: false,
      },
    ]);
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
    <PlanContext.Provider value={{ items, addItem, removeItem, toggleItem }}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used within PlanProvider');
  return ctx;
}
