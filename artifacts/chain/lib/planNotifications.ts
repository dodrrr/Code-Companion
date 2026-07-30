import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { PlanItem } from '@/context/PlanContext';

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

export async function configurePlanNotificationActions() {
  if (Platform.OS === 'web') return;
  await Notifications.setNotificationCategoryAsync(
    PLAN_TASK_CATEGORY,
    [
      { identifier: PLAN_TASK_DONE_ACTION, buttonTitle: 'Done', options: { opensAppToForeground: true } },
      { identifier: PLAN_TASK_SNOOZE_ACTION, buttonTitle: 'Remind in 15 min', options: { opensAppToForeground: true } },
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
      title: item.text,
      body: `Starting in ${minutesBefore} minutes.`,
      sound: 'default',
      categoryIdentifier: PLAN_TASK_CATEGORY,
      data: { planItemId: item.id, planDate: item.planDate },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
  return { status: 'scheduled', notificationId };
}

export async function schedulePlanEndAlert(item: PlanItem): Promise<ReminderResult> {
  if (Platform.OS === 'web' || !item.durationMinutes) return { status: 'unavailable' };
  const start = getScheduledDate(item.timeSlot, item.planDate, 0);
  if (!start) return { status: 'past' };
  const date = new Date(start.getTime() + item.durationMinutes * 60_000);
  if (date.getTime() <= Date.now()) return { status: 'past' };
  if (await getPlanNotificationPermission() !== 'granted') return { status: 'denied' };
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: { title: `${item.text} is ending`, body: `Your ${formatDuration(item.durationMinutes)} block is complete.`, sound: 'default', data: { planItemId: item.id, planDate: item.planDate } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
  return { status: 'scheduled', notificationId };
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h${remainder ? ` ${remainder}m` : ''}` : `${minutes} min`;
}

export async function schedulePlanSnooze(item: PlanItem, minutes = 15): Promise<ReminderResult> {
  if (Platform.OS === 'web') return { status: 'unavailable' };
  const permission = await getPlanNotificationPermission();
  if (permission !== 'granted') return { status: 'denied' };
  await configurePlanNotificationActions();
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: item.text,
      body: `A gentle reminder for right now.`,
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
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  }
}

export async function scheduleMorningBriefing(hour: number): Promise<ReminderResult> {
  if (Platform.OS === 'web') return { status: 'unavailable' };
  if (await getPlanNotificationPermission() !== 'granted') return { status: 'denied' };
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: { title: 'Your day is ready', body: 'Open Chain for your plan, focus blocks and one thing.', sound: 'default', data: { openPlan: true } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute: 0 },
  });
  return { status: 'scheduled', notificationId };
}
