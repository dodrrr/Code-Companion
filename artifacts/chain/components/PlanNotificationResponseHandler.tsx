import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { usePlan } from '@/context/PlanContext';
import { getPlanNotificationIntent } from '@/domain/plan';
import { reportDiagnostic } from '@/lib/diagnostics';
import {
  cancelPlanReminder,
  configurePlanNotificationActions,
  schedulePlanSnooze,
} from '@/lib/planNotifications';

type PlanNotificationData = { planItemId?: string; planDate?: string; openPlan?: boolean };

export function PlanNotificationResponseHandler() {
  const { completeItemForDate, showDate, updateReminderForDate } = usePlan();
  const actionsRef = useRef({ completeItemForDate, showDate, updateReminderForDate });
  actionsRef.current = { completeItemForDate, showDate, updateReminderForDate };

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void configurePlanNotificationActions();

    let handledResponseId: string | undefined;
    const handleResponse = async (response: Notifications.NotificationResponse) => {
      if (response.notification.request.identifier === handledResponseId) return;
      handledResponseId = response.notification.request.identifier;
      const data = response.notification.request.content.data as PlanNotificationData;
      const intent = getPlanNotificationIntent(response.actionIdentifier, data);
      if (intent === 'ignore') {
        await Notifications.clearLastNotificationResponseAsync();
        return;
      }
      if (intent === 'open' && data.openPlan) {
        router.push('/(tabs)/plan');
        await Notifications.clearLastNotificationResponseAsync();
        return;
      }
      if (!data.planItemId || !data.planDate) {
        await Notifications.clearLastNotificationResponseAsync();
        return;
      }

      if (intent === 'complete') {
        // The notification has already been delivered, so completion only
        // needs to clear its reminder metadata atomically with the task state.
        // `completeItemForDate` persists both before this response is cleared.
        await actionsRef.current.completeItemForDate(data.planItemId, data.planDate);
      }
      if (intent === 'snooze') {
        const items = await actionsRef.current.showDate(data.planDate);
        const item = items.find((entry) => entry.id === data.planItemId);
        if (item && !item.completed) {
          const snooze = await schedulePlanSnooze(item);
          if (snooze.status === 'scheduled') {
            try {
              const attached = await actionsRef.current.updateReminderForDate(item.id, item.planDate, 15, snooze.notificationId);
              if (!attached) await cancelPlanReminder(snooze.notificationId);
            } catch (error) {
              await cancelPlanReminder(snooze.notificationId).catch((cancelError) => {
                reportDiagnostic({ area: 'notifications', operation: 'response.snooze.compensate', severity: 'warning', error: cancelError });
              });
              throw error;
            }
          }
        }
      }
      router.push({ pathname: '/(tabs)/plan', params: { taskId: data.planItemId, planDate: data.planDate } });
      await Notifications.clearLastNotificationResponseAsync();
    };

    const safelyHandle = (response: Notifications.NotificationResponse) => {
      void handleResponse(response).catch((error) => {
        if (handledResponseId === response.notification.request.identifier) {
          // Keep an uncleared response retryable after a transient storage or
          // notification failure instead of suppressing it for this mount.
          handledResponseId = undefined;
        }
        reportDiagnostic({ area: 'notifications', operation: 'response.handle', severity: 'error', error });
      });
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(safelyHandle);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) safelyHandle(response);
    }).catch((error) => reportDiagnostic({ area: 'notifications', operation: 'response.restore', severity: 'error', error }));
    return () => subscription.remove();
  }, []);

  return null;
}
