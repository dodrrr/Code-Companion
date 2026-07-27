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
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: item.text,
      body: `Starting in ${minutesBefore} minutes.`,
      sound: 'default',
      data: { planItemId: item.id },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
  return { status: 'scheduled', notificationId };
}

export async function cancelPlanReminder(notificationId?: string) {
  if (notificationId && Platform.OS !== 'web') {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  }
}
