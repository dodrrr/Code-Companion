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

function getScheduledDate(timeSlot: string, minutesBefore: number): Date | null {
  const match = /^(\d{1,2})(?::(\d{2}))?\s(AM|PM)$/.exec(timeSlot);
  if (!match) return null;
  const [, hourValue, minuteValue = '00', suffix] = match;
  let hour = Number(hourValue);
  if (suffix === 'PM' && hour !== 12) hour += 12;
  if (suffix === 'AM' && hour === 12) hour = 0;
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hour, Number(minuteValue), 0, 0);
  date.setMinutes(date.getMinutes() - minutesBefore);
  return date;
}

export async function schedulePlanReminder(item: PlanItem, minutesBefore: number): Promise<ReminderResult> {
  if (Platform.OS === 'web') return { status: 'unavailable' };
  const date = getScheduledDate(item.timeSlot, minutesBefore);
  if (!date || date.getTime() <= Date.now()) return { status: 'past' };
  const permissions = await Notifications.getPermissionsAsync();
  const status = permissions.status === 'granted'
    ? permissions.status
    : (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return { status: 'denied' };
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
