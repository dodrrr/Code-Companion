import AsyncStorage from '@react-native-async-storage/async-storage';
import { createPlanStore } from './planRepository.ts';
import { cancelPlanReminder } from './planNotifications';
import { readRhythmHistory } from './rhythmRepository.ts';

/** Shared queue: Plan writes and Rhythm reads observe one durable snapshot. */
export const planDataStore = createPlanStore({
  storage: AsyncStorage,
  createId: () => `${Date.now()}${Math.random().toString(36).substring(2, 9)}`,
  cancelReminder: cancelPlanReminder,
});

export const readRhythmFocusLog = () => readRhythmHistory(AsyncStorage, planDataStore.readSnapshot);
