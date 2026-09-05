import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { decodeMorningBriefingTime, isMorningBriefingNotificationData, type PlanItem } from '@/domain/plan';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type ReminderResult =
  | { status: 'scheduled'; notificationId: string }
  | { status: 'denied' | 'unavailable' | 'past' };

export type PlanNotificationPermission = 'granted' | 'undetermined' | 'denied' | 'unavailable';

export const PLAN_TASK_CATEGORY = 'chain_task_actions';
export const PLAN_TASK_DONE_ACTION = 'chain_task_done';
export const PLAN_TASK_SNOOZE_ACTION = 'chain_task_snooze';
export const PLAN_TASK_OPEN_ACTION = 'chain_task_open';

export async function configurePlanNotificationActions() {
  if (Platform.OS === 'web') return;
  await Notifications.setNotificationCategoryAsync(
    PLAN_TASK_CATEGORY,
    [
      { identifier: PLAN_TASK_DONE_ACTION, buttonTitle: 'Done', options: { opensAppToForeground: true } },
      { identifier: PLAN_TASK_SNOOZE_ACTION, buttonTitle: 'Remind in 15 min', options: { opensAppToForeground: true } },
      { identifier: PLAN_TASK_OPEN_ACTION, buttonTitle: 'Open plan', options: { opensAppToForeground: true } },
    ],
  );
}

export async function getPlanNotificationPermission(): Promise<PlanNotificationPermission> {
  if (Platform.OS === 'web') return 'unavailable';
  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.status === 'granted') return 'granted';
  if (permissions.canAskAgain) return 'undetermined';
  return 'denied';
}

export async function requestPlanNotificationPermission(): Promise<PlanNotificationPermission> {
  if (Platform.OS === 'web') return 'unavailable';
  const permissions = await Notifications.requestPermissionsAsync();
  return permissions.status === 'granted' ? 'granted' : 'denied';
}

function getScheduledDate(timeSlot: string, planDate: string, minutesBefore: number): Date | null {
  const match = /^(\d{1,2})(?::(\d{2}))?\s(AM|PM)$/.exec(timeSlot);
  if (!match) return null;
  const [, hourValue, minuteValue = '00', suffix] = match;
  let hour = Number(hourValue);
  if (suffix === 'PM' && hour !== 12) hour += 12;
  if (suffix === 'AM' && hour === 12) hour = 0;
  const [year, month, day] = planDate.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  date.setHours(hour, Number(minuteValue), 0, 0);
  date.setMinutes(date.getMinutes() - minutesBefore);
  return date;
}

export async function schedulePlanReminder(item: PlanItem, minutesBefore: number): Promise<ReminderResult> {
  if (Platform.OS === 'web') return { status: 'unavailable' };
  const date = getScheduledDate(item.timeSlot, item.planDate, minutesBefore);
  if (!date || date.getTime() <= Date.now()) return { status: 'past' };
  const permission = await getPlanNotificationPermission();
  if (permission !== 'granted') return { status: 'denied' };
  await configurePlanNotificationActions();
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: minutesBefore === 0 ? (item.isPriority ? 'Your one thing starts now' : `Time to begin · ${item.text}`) : (item.isPriority ? 'Your one thing is up next' : `Up next · ${item.text}`),
      body: minutesBefore === 0
        ? item.isPriority
          ? 'This is the space you chose for what matters most.'
          : item.chainId
            ? 'One small step now protects your chain.'
            : 'The time you set aside is here.'
        : item.isPriority
          ? `Starts in ${minutesBefore} min. Protect some space for what matters most.`
          : item.chainId
            ? `Starts in ${minutesBefore} min. One small step protects your chain.`
            : `Starts in ${minutesBefore} min. Leave a little room for it.`,
      sound: 'default',
      categoryIdentifier: PLAN_TASK_CATEGORY,
      data: { planItemId: item.id, planDate: item.planDate },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
  return { status: 'scheduled', notificationId };
}

export async function schedulePlanSnooze(item: PlanItem, minutes = 15): Promise<ReminderResult> {
  if (Platform.OS === 'web') return { status: 'unavailable' };
  const permission = await getPlanNotificationPermission();
  if (permission !== 'granted') return { status: 'denied' };
  await configurePlanNotificationActions();
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: item.text,
      body: 'You gave yourself 15 more minutes. Come back gently.',
      sound: 'default',
      categoryIdentifier: PLAN_TASK_CATEGORY,
      data: { planItemId: item.id, planDate: item.planDate },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: minutes * 60 },
  });
  return { status: 'scheduled', notificationId };
}

export async function cancelPlanReminder(notificationId?: string) {
  if (notificationId && Platform.OS !== 'web') {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
      // Cancellation is semantically complete when native state confirms the
      // request is already absent (for example after a retry or delivery).
      try {
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        if (!scheduled.some((request) => request.identifier === notificationId)) return;
      } catch {
        // Preserve the original cancellation error; it best describes why the
        // caller must not commit an action that depends on cancellation.
      }
      throw error;
    }
  }
}

let morningBriefingQueue: Promise<void> = Promise.resolve();

async function replaceMorningBriefing(hour: number, minute: number): Promise<ReminderResult> {
  if (Platform.OS === 'web') return { status: 'unavailable' };
  if (await getPlanNotificationPermission() !== 'granted') return { status: 'denied' };
  const time = decodeMorningBriefingTime({ hour, minute });
  if (!time) throw new RangeError('Morning briefing time is invalid');

  // Enumerate first: if native notification state cannot be inspected, no new
  // request is created and therefore no untracked briefing can be orphaned.
  const scheduledBefore = await Notifications.getAllScheduledNotificationsAsync();
  const supersededBriefingIds = scheduledBefore
    .filter((request) => isMorningBriefingNotificationData(request.content.data))
    .map((request) => request.identifier);

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Good morning — your day is ready',
      body: 'Open Chain, protect your one thing, then start gently.',
      sound: 'default',
      data: { openPlan: true, morningBriefing: true },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: time.hour, minute: time.minute },
  });

  try {
    // The queue keeps rapid hour changes serialized. If replacing any old
    // briefing fails, remove the newly created one before surfacing failure.
    await Promise.all(
      supersededBriefingIds.map((identifier) => cancelPlanReminder(identifier)),
    );
  } catch (error) {
    try {
      await cancelPlanReminder(notificationId);
    } catch (compensationError) {
      // Both failures are relevant: the caller must know the operation failed,
      // while diagnostics retain the exceptional orphan risk for support/QA.
      throw new Error('Morning briefing replacement and compensation failed', {
        cause: { replacementError: error, compensationError },
      });
    }
    throw error;
  }

  return { status: 'scheduled', notificationId };
}

export function scheduleMorningBriefing(hour: number, minute = 0): Promise<ReminderResult> {
  const operation = morningBriefingQueue
    .catch(() => undefined)
    .then(() => replaceMorningBriefing(hour, minute));
  morningBriefingQueue = operation.then(() => undefined, () => undefined);
  return operation;
}
