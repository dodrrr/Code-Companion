import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { usePlan } from '@/context/PlanContext';
import {
  configurePlanNotificationActions,
  PLAN_TASK_DONE_ACTION,
  PLAN_TASK_SNOOZE_ACTION,
  schedulePlanSnooze,
} from '@/lib/planNotifications';

type PlanNotificationData = { planItemId?: string; planDate?: string };

export function PlanNotificationResponseHandler() {
  const { completeItemForDate, showDate, updateReminderForDate } = usePlan();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void configurePlanNotificationActions();

    let handledResponseId: string | undefined;
    const handleResponse = async (response: Notifications.NotificationResponse) => {
      if (response.notification.request.identifier === handledResponseId) return;
      handledResponseId = response.notification.request.identifier;
      const data = response.notification.request.content.data as PlanNotificationData;
      if (!data.planItemId || !data.planDate) return;

      const action = response.actionIdentifier;
      if (action === PLAN_TASK_DONE_ACTION) {
        await completeItemForDate(data.planItemId, data.planDate);
      }
      if (action === PLAN_TASK_SNOOZE_ACTION) {
        const items = await showDate(data.planDate);
        const item = items.find((entry) => entry.id === data.planItemId);
        if (item && !item.completed) {
          const snooze = await schedulePlanSnooze(item);
          if (snooze.status === 'scheduled') await updateReminderForDate(item.id, item.planDate, 15, snooze.notificationId);
        }
      }
      router.push({ pathname: '/(tabs)/plan', params: { taskId: data.planItemId, planDate: data.planDate } });
      await Notifications.clearLastNotificationResponseAsync();
    };

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => { void handleResponse(response); });
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) void handleResponse(response);
    });
    return () => subscription.remove();
  }, [completeItemForDate, showDate, updateReminderForDate]);

  return null;
}
