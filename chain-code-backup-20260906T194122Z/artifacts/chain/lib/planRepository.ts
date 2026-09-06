import {
  decodePlanItems,
  decodePlanStorage,
  emptyPlanStorage,
  getPlanTodayKey,
  isPlanDateKey,
  migratePlanRepeatRules,
  resolveRecurringPlanForDate,
  updatePlanRepeatRule,
  type PlanItem,
  type PlanStorageState,
} from '../domain/plan.ts';
import { createVersionedRepository, type KeyValueStorage, type VersionedRepository } from './versionedRepository.ts';

export const PLAN_STORAGE_KEY = '@chain_plan_store';
const LEGACY_PREFIX = '@chain_plan_';

type PlanStorage = KeyValueStorage & { getAllKeys(): Promise<readonly string[]> };
type PlanMutation = (items: PlanItem[]) => PlanItem[] | Promise<PlanItem[]>;
type MutationOptions = { editSeriesItemIds?: string[] };
export interface PlanDateRepository extends VersionedRepository<PlanItem[]> {
  update(mutator: PlanMutation, options?: MutationOptions): Promise<PlanItem[]>;
}

/** One versioned payload makes instance, series and deletion-exception changes atomic. */
export function createPlanStore({ storage, today = getPlanTodayKey, createId, cancelReminder }: {
  storage: PlanStorage;
  today?: () => string;
  createId: () => string;
  cancelReminder?: (id: string) => Promise<void>;
}) {
  const repository = createVersionedRepository<PlanStorageState>({
    storage,
    key: PLAN_STORAGE_KEY,
    version: 1,
    decode: decodePlanStorage,
    empty: emptyPlanStorage,
  });
  let queue: Promise<void> = Promise.resolve();
  const dateRepositories = new Map<string, PlanDateRepository>();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.catch(() => undefined).then(operation);
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async function importLegacyDay(date: string): Promise<PlanItem[]> {
    const [primary, backup] = await Promise.all([
      storage.getItem(LEGACY_PREFIX + date),
      storage.getItem(LEGACY_PREFIX + date + ':backup'),
    ]);
    const parsed = [primary, backup].map((raw): unknown => {
      try { return raw === null ? null : JSON.parse(raw); } catch { return null; }
    });
    for (const value of parsed) {
      if (value && typeof value === 'object' && 'data' in value && 'version' in value
        && typeof value.version === 'number' && value.version > 2) {
        throw new Error(`Plan ${date} was written by a newer app version`);
      }
    }
    for (const value of parsed) {
      if (value === null) continue;
      let data: unknown = value;
      if (typeof value === 'object' && 'data' in value) {
        if ('version' in value && (!Number.isInteger(value.version) || Number(value.version) < 0)) continue;
        data = value.data;
      }
      const items = decodePlanItems(data, date);
      if (items && Array.isArray(data) && items.length === data.length && items.every((item) => item.planDate === date)) return items;
    }
    if (primary === null && backup === null) return [];
    throw new Error(`Plan ${date} and its backup could not be safely read`);
  }

  async function load(): Promise<PlanStorageState> {
    const snapshot = await repository.readWithMetadata();
    if (snapshot.source === 'invalid' || snapshot.source === 'unsupported') {
      throw new Error('Saved Plan data is unreadable or belongs to a newer app version');
    }
    if (snapshot.value.migrated) return snapshot.value;
    const keys = await storage.getAllKeys();
    const dates = [...new Set(keys.flatMap((key) => {
      const match = /^@chain_plan_(\d{4}-\d{2}-\d{2})(?::backup)?$/.exec(key);
      return match && isPlanDateKey(match[1]) ? [match[1]] : [];
    }))];
    const days = Object.fromEntries(await Promise.all(dates.map(async (date) => [date, await importLegacyDay(date)] as const)));
    const migrated = migratePlanRepeatRules(days, today());
    // Legacy keys remain byte-for-byte intact for recovery. This flag and all
    // imported days become durable together, so a retry cannot partially migrate.
    await repository.write(migrated);
    return migrated;
  }

  function materialize(state: PlanStorageState, date: string): PlanStorageState {
    const current = state.days[date] ?? [];
    const next = date < today() ? current : resolveRecurringPlanForDate(current, state.repeatRules, date, createId);
    if (state.days[date] && next === current) return state;
    return { ...state, days: { ...state.days, [date]: next } };
  }

  async function commit(previous: PlanStorageState, next: PlanStorageState): Promise<void> {
    if (previous === next || JSON.stringify(previous) === JSON.stringify(next)) return;
    const remainingNotifications = new Set(Object.values(next.days).flatMap((items) => items.flatMap((item) => item.notificationId ? [item.notificationId] : [])));
    const toCancel = [...new Set(Object.values(previous.days).flatMap((items) => items.flatMap((item) => (
      item.notificationId && !remainingNotifications.has(item.notificationId) ? [item.notificationId] : []
    ))))];
    const cancelled = new Set<string>();
    try {
      for (const id of toCancel) {
        if (!cancelReminder) throw new Error('A saved reminder must be cancelled before changing this occurrence');
        await cancelReminder(id);
        cancelled.add(id);
      }
      await repository.write(next);
    } catch (error) {
      if (cancelled.size) {
        // Keep the old task/series after a failed save, but do not knowingly
        // leave cancelled reminder metadata attached to it. Repair is best effort.
        const repaired = {
          ...previous,
          days: Object.fromEntries(Object.entries(previous.days).map(([date, items]) => [date, items.map((item) => (
            item.notificationId && cancelled.has(item.notificationId)
              ? { ...item, reminderMinutes: undefined, notificationId: undefined }
              : item
          ))])),
        };
        await repository.write(repaired).catch(() => undefined);
      }
      throw error;
    }
  }

  async function readDate(date: string): Promise<PlanItem[]> {
    return enqueue(async () => {
      const previous = await load();
      const next = materialize(previous, date);
      await commit(previous, next);
      return next.days[date];
    });
  }

  async function updateDate(date: string, mutator: PlanMutation, options: MutationOptions = {}): Promise<PlanItem[]> {
    return enqueue(async () => {
      const previous = await load();
      let next = materialize(previous, date);
      const current = next.days[date];
      const result = await mutator(current);
      const normalized = decodePlanItems(result, date);
      if (!normalized || normalized.length !== result.length || normalized.some((item) => item.planDate !== date)) throw new Error('Invalid Plan mutation');
      next = { ...next, days: { ...next.days, [date]: normalized }, repeatRules: { ...next.repeatRules } };
      for (const old of current) {
        if (normalized.some((item) => item.id === old.id)) continue;
        const ruleId = old.repeatSourceId || old.id;
        const rule = next.repeatRules[ruleId];
        if (rule) next.repeatRules[ruleId] = { ...rule, excludedDates: [...new Set([...rule.excludedDates, date])] };
      }
      for (const id of options.editSeriesItemIds ?? []) {
        const item = next.days[date].find((entry) => entry.id === id);
        if (!item) continue;
        const sourceId = item.repeatSourceId || item.id;
        if (!next.repeatRules[sourceId] && !item.repeatDays?.length) continue;
        const associated = { ...item, repeatSourceId: sourceId };
        next.days[date] = next.days[date].map((entry) => entry.id === id ? associated : entry);
        next = updatePlanRepeatRule(next, associated, date);
      }
      await commit(previous, next);
      return next.days[date];
    });
  }

  function forDate(date: string): PlanDateRepository {
    if (!isPlanDateKey(date)) throw new Error('Invalid Plan date');
    let facade = dateRepositories.get(date);
    if (!facade) {
      facade = {
        read: () => readDate(date),
        readWithMetadata: async () => ({ value: await readDate(date), source: 'primary', storedVersion: 1, migrated: false }),
        write: async (items) => { await updateDate(date, () => items); },
        update: (mutator, options) => updateDate(date, mutator, options),
      };
      dateRepositories.set(date, facade);
    }
    return facade;
  }

  return { forDate };
}
