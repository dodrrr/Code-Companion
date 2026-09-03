import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { AmbientScreen, GlassSurface } from '@/components/AmbientSurface';
import { router, useLocalSearchParams } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { EXTRA_CHAIN_COLORS } from '@/constants/colors';
import { readableAccentColor, readableTextColor } from '@/constants/sectionTheme';
import { Chain, getTodayStr, isRestDay, useChains } from '@/context/ChainsContext';
import { PlanItem, usePlan } from '@/context/PlanContext';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { cancelPlanReminder, getPlanNotificationPermission, requestPlanNotificationPermission, scheduleMorningBriefing, schedulePlanReminder } from '@/lib/planNotifications';
import { reportDiagnostic } from '@/lib/diagnostics';
import { CONTROL, MOTION, OPACITY, RADIUS, SCRIM, SPACE, TYPE } from '@/constants/designSystem';
import { playFeedback } from '@/lib/feedback';
import { SevenChoiceSelector } from '@/components/ui/SevenChoiceSelector';

const QUICK_TIMES = ['7 AM', '9 AM', '12 PM', '3 PM', '6 PM', '8 PM'];
const HOURS = Array.from({ length: 18 }, (_, index) => index + 6);
const MINUTES = ['00', '05', '10', '15', '20', '30', '40', '45', '50', '55'];
const REMINDER_OPTIONS = [0, 5, 15, 30, 60];
const DURATION_OPTIONS = [30, 60, 90, 120, 180, 240];
const UNLINKED_TASK_COLOR = '#8FA2B3';
const TASK_ACCENTS = ['#8FA2B3', ...EXTRA_CHAIN_COLORS];
const MORNING_BRIEFING_KEY = '@chain_morning_briefing';
const WEEKDAY_OPTIONS = [
  { label: 'M', value: 1, accessibilityLabel: 'Monday' },
  { label: 'T', value: 2, accessibilityLabel: 'Tuesday' },
  { label: 'W', value: 3, accessibilityLabel: 'Wednesday' },
  { label: 'T', value: 4, accessibilityLabel: 'Thursday' },
  { label: 'F', value: 5, accessibilityLabel: 'Friday' },
  { label: 'S', value: 6, accessibilityLabel: 'Saturday' },
  { label: 'S', value: 0, accessibilityLabel: 'Sunday' },
] as const;

function getPlanLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatTime(hour: number, minute: string): string {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

function formatDurationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes}m`;
}

function formatBriefingTime(hour: number | null) {
  if (hour === null) return 'Off';
  return `${hour % 12 || 12}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
}

export default function PlanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const { chains, setDayStatus, isProtectedToday } = useChains();
  const { items, activeDate, isToday, isActiveDayClosed, tomorrowItemCount, showToday, showTomorrow, showDate, closeToday, reopenToday, addItem, updateItem, updateReminderForDate, moveItemToTomorrow, copyItemToTomorrow, removeItem, toggleItem } = usePlan();
  const { taskId, planDate } = useLocalSearchParams<{ taskId?: string; planDate?: string }>();
  const [inputText, setInputText] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedChainId, setSelectedChainId] = useState<string | undefined>();
  const [selectedTaskColor, setSelectedTaskColor] = useState<string | undefined>();
  const [selectedReminder, setSelectedReminder] = useState<number | undefined>();
  const [selectedRepeatDays, setSelectedRepeatDays] = useState<number[]>([]);
  const [selectedDuration, setSelectedDuration] = useState<number | undefined>();
  const [isPriority, setIsPriority] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [briefingHour, setBriefingHour] = useState<number | null>(null);
  const [briefingNotificationId, setBriefingNotificationId] = useState<string | undefined>();
  const [briefingBusy, setBriefingBusy] = useState(false);
  const [showBriefingPicker, setShowBriefingPicker] = useState(false);
  const [editingItem, setEditingItem] = useState<PlanItem | null>(null);
  const [showCompletion, setShowCompletion] = useState(false);
  const [showReminderPermission, setShowReminderPermission] = useState(false);
  const [showDayReview, setShowDayReview] = useState(false);
  const [chainCompletion, setChainCompletion] = useState<{ item: PlanItem; chain: Chain; finishesAgenda: boolean } | null>(null);
  const [chainCompletionBusy, setChainCompletionBusy] = useState(false);
  const [highlightedItemId, setHighlightedItemId] = useState<string | undefined>();
  const [newlyAddedItemId, setNewlyAddedItemId] = useState<string | undefined>();
  const [reminderSyncingItemIds, setReminderSyncingItemIds] = useState<Set<string>>(() => new Set());
  const [taskMenuItem, setTaskMenuItem] = useState<PlanItem | null>(null);
  const [pickerHour, setPickerHour] = useState(9);
  const [pickerMinute, setPickerMinute] = useState('00');
  const inputRef = useRef<TextInput>(null);
  const briefingBusyRef = useRef(false);
  const reminderActionIdsRef = useRef(new Set<string>());
  const savingPlanItemRef = useRef(false);
  const chainCompletionBusyRef = useRef(false);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 84 : insets.bottom;
  const today = getTodayStr();
  const completedCount = items.filter((item) => item.completed).length;
  const protectedChains = chains.filter((chain) => isRestDay(chain, today) || isProtectedToday(chain)).length;
  const progressFill = items.length ? completedCount / items.length : 0;
  const selectedChain = chains.find((chain) => chain.id === selectedChainId);
  const priorityItem = items.find((item) => item.isPriority);
  const orderedItems = [...items].sort((a, b) => timeSortValue(a.timeSlot) - timeSortValue(b.timeSlot));
  const hasPendingItems = items.some((item) => !item.completed);
  const plannedFocusMinutes = items.reduce((total, item) => total + (item.durationMinutes || 0), 0);
  const reminderCount = items.filter((item) => Boolean(item.timeSlot) && item.reminderMinutes !== undefined).length;
  const canEditActivePlan = !isToday || !isActiveDayClosed;

  useEffect(() => {
    void AsyncStorage.getItem(MORNING_BRIEFING_KEY)
      .then((raw) => {
        try {
          const value = raw ? JSON.parse(raw) : null;
          if (typeof value?.hour === 'number') setBriefingHour(value.hour);
          if (typeof value?.notificationId === 'string') setBriefingNotificationId(value.notificationId);
        } catch (error) {
          reportDiagnostic({ area: 'storage', operation: 'morningBriefing.decode', severity: 'warning', error });
        }
      })
      .catch((error) => reportDiagnostic({ area: 'storage', operation: 'morningBriefing.read', severity: 'warning', error }));
  }, []);

  async function setMorningBriefing(hour: number): Promise<boolean> {
    if (briefingBusyRef.current) return false;
    briefingBusyRef.current = true;
    setBriefingBusy(true);
    try {
      let permission = await getPlanNotificationPermission();
      if (permission === 'undetermined') permission = await requestPlanNotificationPermission();
      if (permission !== 'granted') {
        Alert.alert(
          'Briefing not added',
          permission === 'unavailable'
            ? 'Morning briefings are unavailable on this device.'
            : 'Notifications are off. You can enable them in iPhone Settings.',
        );
        return false;
      }
      const result = await scheduleMorningBriefing(hour);
      if (result.status !== 'scheduled') {
        Alert.alert('Briefing not added', result.status === 'unavailable' ? 'Morning briefings are unavailable here.' : 'Notifications are off.');
        return false;
      }
      try {
        await AsyncStorage.setItem(MORNING_BRIEFING_KEY, JSON.stringify({ hour, notificationId: result.notificationId }));
      } catch (error) {
        reportDiagnostic({ area: 'storage', operation: 'morningBriefing.persist', severity: 'error', error });
        const compensated = await cancelPlanReminder(result.notificationId).then(() => true).catch((cancelError) => {
          reportDiagnostic({ area: 'notifications', operation: 'morningBriefing.compensate', severity: 'error', error: cancelError });
          return false;
        });
        await AsyncStorage.removeItem(MORNING_BRIEFING_KEY).catch((removeError) => {
          reportDiagnostic({ area: 'storage', operation: 'morningBriefing.compensateStorage', severity: 'warning', error: removeError });
        });
        setBriefingHour(null);
        setBriefingNotificationId(undefined);
        Alert.alert(
          compensated ? 'Briefing not saved' : 'Check this briefing',
          compensated
            ? 'Chain couldn’t keep this setting, so the new briefing was turned off. Try again.'
            : 'Chain couldn’t save or cancel this briefing. Check Chain notifications in iPhone Settings.',
        );
        return false;
      }
      setBriefingHour(hour);
      setBriefingNotificationId(result.notificationId);
      playFeedback('success');
      return true;
    } catch (error) {
      reportDiagnostic({ area: 'notifications', operation: 'morningBriefing.schedule', severity: 'error', error });
      Alert.alert('Briefing not added', 'Chain couldn’t schedule it. Try again.');
      return false;
    } finally {
      briefingBusyRef.current = false;
      setBriefingBusy(false);
    }
  }

  async function disableMorningBriefing(): Promise<boolean> {
    if (briefingBusyRef.current || briefingHour === null) return false;
    if (!briefingNotificationId) {
      Alert.alert('Open iPhone Settings', 'Chain can’t identify this older briefing safely. Turn off Chain notifications in iPhone Settings, then set it again here if you want.');
      return false;
    }
    briefingBusyRef.current = true;
    setBriefingBusy(true);
    try {
      await cancelPlanReminder(briefingNotificationId);
      setBriefingHour(null);
      setBriefingNotificationId(undefined);
      try {
        await AsyncStorage.removeItem(MORNING_BRIEFING_KEY);
      } catch (error) {
        reportDiagnostic({ area: 'storage', operation: 'morningBriefing.disable.persist', severity: 'warning', error });
        Alert.alert('Briefing turned off', 'The notification was cancelled, but Chain couldn’t save the setting locally.');
      }
      playFeedback('selection');
      return true;
    } catch (error) {
      reportDiagnostic({ area: 'notifications', operation: 'morningBriefing.disable', severity: 'error', error });
      Alert.alert('Briefing still on', 'Chain couldn’t turn it off. Nothing was changed; try again.');
      return false;
    } finally {
      briefingBusyRef.current = false;
      setBriefingBusy(false);
    }
  }

  useEffect(() => {
    if (!taskId || !planDate) return;
    let cancelled = false;
    void showDate(planDate).then((nextItems) => {
      if (cancelled || !nextItems.some((item) => item.id === taskId)) return;
      setHighlightedItemId(taskId);
      setTimeout(() => !cancelled && setHighlightedItemId(undefined), 5000);
    });
    return () => { cancelled = true; };
  }, [taskId, planDate]);

  function resetComposer() {
    setInputText('');
    setSelectedTime('');
    setSelectedChainId(undefined);
    setSelectedTaskColor(undefined);
    setSelectedReminder(undefined);
    setSelectedRepeatDays([]);
    setSelectedDuration(undefined);
    setIsPriority(false);
    setShowInput(false);
    setShowAdvancedOptions(false);
    setEditingItem(null);
  }

  async function cancelReminderBeforeAction(item: PlanItem, actionLabel: string): Promise<boolean> {
    if (!item.notificationId) return true;
    try {
      await cancelPlanReminder(item.notificationId);
      return true;
    } catch (error) {
      reportDiagnostic({ area: 'notifications', operation: `planReminder.${actionLabel}.cancel`, severity: 'error', error });
      Alert.alert('Reminder still active', `Chain couldn’t cancel this reminder, so the task was not ${actionLabel}. Try again.`);
      return false;
    }
  }

  async function clearCanceledReminderMetadata(item: PlanItem) {
    if (!item.notificationId) return;
    try {
      await updateReminderForDate(item.id, item.planDate, undefined, undefined);
    } catch (error) {
      reportDiagnostic({ area: 'storage', operation: 'planReminder.clearCanceledMetadata', severity: 'warning', error });
    }
  }

  function setReminderSyncing(itemId: string, syncing: boolean) {
    if (syncing) reminderActionIdsRef.current.add(itemId);
    else reminderActionIdsRef.current.delete(itemId);
    setReminderSyncingItemIds((current) => {
      const next = new Set(current);
      if (syncing) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }

  async function savePlanItem(scheduleReminder: boolean): Promise<boolean> {
    if (!inputText.trim() || savingPlanItemRef.current) return false;
    savingPlanItemRef.current = true;
    let syncingItemId: string | undefined;
    try {
    const desiredReminder = selectedTime ? selectedReminder : undefined;
    const previousNotificationId = editingItem?.notificationId;
    if (previousNotificationId) {
      try {
        await cancelPlanReminder(previousNotificationId);
      } catch (error) {
        reportDiagnostic({ area: 'notifications', operation: 'planReminder.replace.cancelPrevious', severity: 'error', error });
        Alert.alert('Changes not saved', 'Chain couldn’t cancel the existing reminder, so no new reminder was created. Try again.');
        return false;
      }
    }
    const options = {
      text: inputText,
      timeSlot: selectedTime,
      chainId: selectedChain?.id,
      color: selectedChain?.color ?? selectedTaskColor,
      // Reminder metadata represents a real scheduled notification, not the
      // user's intent. Attach it only after scheduling succeeds below.
      reminderMinutes: undefined,
      isPriority,
      repeatDays: selectedRepeatDays,
      durationMinutes: selectedDuration,
      // Gate Windows now live exclusively in Gate. Keep a legacy association
      // untouched when editing so hiding the UI never destroys persisted data.
      gateWindowId: editingItem?.gateWindowId,
    };
    const isEditing = Boolean(editingItem);
    const item = isEditing ? updateItem(editingItem!.id, options) : addItem(options);
    if (!item) {
      if (previousNotificationId) Alert.alert('Task changed', 'The old reminder was cancelled, but this task is no longer available to edit.');
      return false;
    }
    const persistence = await item.persistence;
    if (persistence.status === 'failed') {
      reportDiagnostic({ area: 'storage', operation: isEditing ? 'plan.updateItem.await' : 'plan.addItem.await', severity: 'error', error: persistence.error });
      if (previousNotificationId && editingItem) await clearCanceledReminderMetadata(editingItem);
      Alert.alert(
        isEditing ? 'Changes not saved' : 'Task not added',
        previousNotificationId
          ? 'The old reminder was cancelled, but Chain couldn’t save your changes. The task is still in your plan.'
          : 'Chain couldn’t save this task. Your draft is still here — try again.',
      );
      return false;
    }
    playFeedback('light');
    resetComposer();
    if (!isEditing) {
      setNewlyAddedItemId(item.id);
      setTimeout(() => setNewlyAddedItemId((current) => current === item.id ? undefined : current), 900);
    }
    if (!scheduleReminder || desiredReminder === undefined) return true;
    syncingItemId = item.id;
    setReminderSyncing(item.id, true);
    let scheduledNotificationId: string | undefined;
    try {
      const result = await schedulePlanReminder(item, desiredReminder);
      if (result.status === 'scheduled') {
        scheduledNotificationId = result.notificationId;
        const attached = await updateReminderForDate(item.id, item.planDate, desiredReminder, result.notificationId);
        if (attached) return true;
        const compensated = await cancelPlanReminder(result.notificationId).then(() => true).catch((error) => {
          reportDiagnostic({ area: 'notifications', operation: 'planReminder.compensateMissingTask', severity: 'warning', error });
          return false;
        });
        Alert.alert(
          compensated ? 'Reminder not added' : 'Check this reminder',
          compensated
            ? 'The task changed before its reminder could be saved. Your plan is still safe.'
            : 'The task changed and Chain couldn’t cancel its notification. Check Chain notifications in iPhone Settings.',
        );
        return true;
      }
      const message = result.status === 'past'
        ? 'That reminder time has already passed. The task was saved without a reminder.'
        : result.status === 'denied'
          ? 'Notifications are off. The task was saved without a reminder.'
          : 'Reminders are unavailable here. The task was saved without a reminder.';
      Alert.alert('Reminder not added', message);
    } catch (error) {
      reportDiagnostic({ area: 'notifications', operation: 'planReminder.schedule', severity: 'error', error });
      let compensated = true;
      if (scheduledNotificationId) {
        compensated = await cancelPlanReminder(scheduledNotificationId).then(() => true).catch((cancelError) => {
          reportDiagnostic({ area: 'notifications', operation: 'planReminder.compensatePersistFailure', severity: 'warning', error: cancelError });
          return false;
        });
      }
      Alert.alert(
        compensated ? 'Reminder not added' : 'Check this reminder',
        compensated
          ? 'Chain couldn’t schedule it. The task was saved without a reminder.'
          : 'Chain couldn’t save or cancel the notification. Check Chain notifications in iPhone Settings.',
      );
    }
    return true;
    } finally {
      if (syncingItemId) setReminderSyncing(syncingItemId, false);
      savingPlanItemRef.current = false;
    }
  }

  async function handleAdd() {
    if (!inputText.trim()) return;
    if (selectedTime && selectedReminder !== undefined) {
      try {
        const permission = await getPlanNotificationPermission();
        if (permission === 'undetermined') {
          setShowReminderPermission(true);
          return;
        }
        if (permission === 'granted') {
          await savePlanItem(true);
          return;
        }
      } catch (error) {
        reportDiagnostic({ area: 'notifications', operation: 'planReminder.permission.read', severity: 'warning', error });
      }
      const saved = await savePlanItem(false);
      if (saved) Alert.alert('Reminder not added', 'Notifications are off or unavailable. The task was saved without a reminder.');
      return;
    }
    await savePlanItem(false);
  }

  async function enableRemindersAndSave() {
    setShowReminderPermission(false);
    try {
      const permission = await requestPlanNotificationPermission();
      if (permission === 'granted') {
        await savePlanItem(true);
        return;
      }
    } catch (error) {
      reportDiagnostic({ area: 'notifications', operation: 'planReminder.permission.request', severity: 'warning', error });
    }
    const saved = await savePlanItem(false);
    if (saved) Alert.alert('Reminder not added', 'Notifications remain off. The task was saved without a reminder.');
  }

  function startEditing(item: PlanItem) {
    setEditingItem(item);
    setInputText(item.text);
    setSelectedTime(item.timeSlot);
    setSelectedChainId(item.chainId);
    setSelectedTaskColor(item.chainId ? undefined : item.color);
    setSelectedReminder(item.reminderMinutes);
    setIsPriority(item.isPriority === true);
    setSelectedRepeatDays(item.repeatDays || []);
    setSelectedDuration(item.durationMinutes);
    setShowInput(true);
    setShowAdvancedOptions(Boolean(item.repeatDays?.length || item.durationMinutes || item.reminderMinutes !== undefined || (!item.chainId && item.color)));
  }

  async function handleToggle(item: PlanItem) {
    // Tomorrow is for planning. Tasks only become actionable once their day starts.
    if (!isToday || isActiveDayClosed || reminderActionIdsRef.current.has(item.id)) return;
    reminderActionIdsRef.current.add(item.id);
    try {
      const completing = !item.completed;
      if (completing && !(await cancelReminderBeforeAction(item, 'completed'))) return;
      const isLastTask = completing && items.length > 0 && completedCount + 1 === items.length;
      const result = await toggleItem(item.id);
      if (result.status === 'failed') {
        if (completing) await clearCanceledReminderMetadata(item);
        Alert.alert(
          completing ? 'Task not completed' : 'Task not reopened',
          completing && item.notificationId
            ? 'The reminder was cancelled, but Chain couldn’t save completion. Try again.'
            : 'Chain couldn’t save that change. Try again.',
        );
        return;
      }
      playFeedback(isLastTask ? 'success' : 'light');
      const linkedChain = item.chainId ? chains.find((chain) => chain.id === item.chainId) : undefined;
      const needsChainConfirmation = completing && linkedChain && !linkedChain.completedDates.includes(today);
      if (needsChainConfirmation && linkedChain) {
        setChainCompletion({ item, chain: linkedChain, finishesAgenda: isLastTask });
      } else if (isLastTask) {
        setShowCompletion(true);
      }
    } finally {
      reminderActionIdsRef.current.delete(item.id);
    }
  }

  async function moveToTomorrow(item: PlanItem) {
    if (reminderActionIdsRef.current.has(item.id)) return;
    reminderActionIdsRef.current.add(item.id);
    try {
      if (!(await cancelReminderBeforeAction(item, 'moved'))) return;
      await clearCanceledReminderMetadata(item);
      const moved = await moveItemToTomorrow(item.id);
      if (!moved) {
        Alert.alert('Task not moved', 'This task changed before Chain could move it. Review today and try again.');
        return;
      }
      playFeedback('light');
    } catch (error) {
      reportDiagnostic({ area: 'storage', operation: 'plan.moveToTomorrow', severity: 'error', error });
      Alert.alert('Task not moved', 'The reminder was cancelled, but Chain couldn’t move the task. Your task is still safe in today.');
    } finally {
      reminderActionIdsRef.current.delete(item.id);
    }
  }

  async function letGo(item: PlanItem) {
    if (reminderActionIdsRef.current.has(item.id)) return;
    reminderActionIdsRef.current.add(item.id);
    try {
      if (!(await cancelReminderBeforeAction(item, 'removed'))) return;
      const result = await removeItem(item.id);
      if (result.status === 'failed') {
        await clearCanceledReminderMetadata(item);
        Alert.alert('Task not removed', item.notificationId ? 'The reminder was cancelled, but the task remains in your plan.' : 'Chain couldn’t save that change. The task remains in your plan.');
        return;
      }
      playFeedback('light');
    } finally {
      reminderActionIdsRef.current.delete(item.id);
    }
  }

  async function deleteTask(item: PlanItem) {
    if (reminderActionIdsRef.current.has(item.id)) return;
    reminderActionIdsRef.current.add(item.id);
    try {
      if (!(await cancelReminderBeforeAction(item, 'deleted'))) return;
      const result = await removeItem(item.id);
      if (result.status === 'failed') {
        await clearCanceledReminderMetadata(item);
        Alert.alert('Task not deleted', item.notificationId ? 'The reminder was cancelled, but the task remains in your plan.' : 'Chain couldn’t save that change. The task remains in your plan.');
        return;
      }
      setTaskMenuItem(null);
      playFeedback('light');
    } finally {
      reminderActionIdsRef.current.delete(item.id);
    }
  }

  async function copyToTomorrow(item: PlanItem) {
    if (reminderActionIdsRef.current.has(item.id)) return;
    reminderActionIdsRef.current.add(item.id);
    setTaskMenuItem(null);
    try {
      const desiredReminder = item.reminderMinutes;
      const copied = await copyItemToTomorrow(item.id);
      if (!copied) return;
      playFeedback('success');
      if (copied.timeSlot && desiredReminder !== undefined) {
        let scheduledNotificationId: string | undefined;
        try {
          const result = await schedulePlanReminder(copied, desiredReminder);
          if (result.status === 'scheduled') {
            scheduledNotificationId = result.notificationId;
            const attached = await updateReminderForDate(copied.id, copied.planDate, desiredReminder, result.notificationId);
            if (!attached) {
              const compensated = await cancelPlanReminder(result.notificationId).then(() => true).catch((error) => {
                reportDiagnostic({ area: 'notifications', operation: 'planReminder.copy.compensate', severity: 'warning', error });
                return false;
              });
              Alert.alert(
                compensated ? 'Copied without reminder' : 'Check this reminder',
                compensated
                  ? 'The copy changed before its reminder could be saved.'
                  : 'The copy changed and Chain couldn’t cancel its notification. Check Chain notifications in iPhone Settings.',
              );
            }
            return;
          }
          const message = result.status === 'past'
            ? 'Its reminder time has already passed.'
            : result.status === 'denied'
              ? 'Notifications are off.'
              : 'Reminders are unavailable here.';
          Alert.alert('Copied without reminder', message);
        } catch (error) {
          reportDiagnostic({ area: 'notifications', operation: 'planReminder.copy.schedule', severity: 'error', error });
          let compensated = true;
          if (scheduledNotificationId) {
            compensated = await cancelPlanReminder(scheduledNotificationId).then(() => true).catch((cancelError) => {
              reportDiagnostic({ area: 'notifications', operation: 'planReminder.copy.compensatePersistFailure', severity: 'warning', error: cancelError });
              return false;
            });
          }
          Alert.alert(
            compensated ? 'Copied without reminder' : 'Check this reminder',
            compensated ? 'Chain couldn’t schedule the reminder.' : 'Chain couldn’t save or cancel the notification. Check Chain notifications in iPhone Settings.',
          );
        }
      }
    } catch (error) {
      reportDiagnostic({ area: 'storage', operation: 'plan.copyToTomorrow', severity: 'error', error });
      Alert.alert('Task not copied', 'Chain couldn’t copy it to tomorrow. Your original task is safe.');
    } finally {
      reminderActionIdsRef.current.delete(item.id);
    }
  }

  async function completeLinkedChain() {
    if (!chainCompletion || chainCompletionBusyRef.current) return;
    chainCompletionBusyRef.current = true;
    setChainCompletionBusy(true);
    const completion = chainCompletion;
    const remainingChainsAreDone = chains
      .filter((chain) => chain.id !== completion.chain.id)
      .every((chain) => isRestDay(chain, today) || isProtectedToday(chain));
    const shouldCelebrate = completion.finishesAgenda && remainingChainsAreDone;
    const result = await setDayStatus(completion.chain.id, today, 'done');
    chainCompletionBusyRef.current = false;
    setChainCompletionBusy(false);
    if (result.status !== 'persisted') {
      playFeedback('error');
      Alert.alert('Chain not completed', 'The task is complete, but Chain couldn’t save this commitment yet. Try again.');
      return;
    }
    playFeedback('success');
    setChainCompletion(null);
    if (shouldCelebrate) setShowCompletion(true);
  }

  function chooseCustomTime() {
    setSelectedTime(formatTime(pickerHour, pickerMinute));
    setShowTimePicker(false);
    playFeedback('selection');
  }

  function continueToTomorrow() {
    if (!isToday || isActiveDayClosed) {
      showTomorrow();
      return;
    }
    if (hasPendingItems) {
      setShowDayReview(true);
      return;
    }
    void closeToday().then(showTomorrow);
  }

  function finishDayAndPrepareTomorrow() {
    setShowDayReview(false);
    void closeToday().then(showTomorrow);
  }

  function prepareTomorrowWithClosure() {
    setShowCompletion(false);
    void closeToday().then(showTomorrow);
  }

  return (
    <AmbientScreen tone="plan" style={styles.root}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={[styles.headerEyebrow, { color: colors.primary }]}>{isToday ? 'ONE THING AT A TIME' : 'MAKE TOMORROW LIGHTER'}</Text>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{isToday ? "Today's Plan" : "Tonight's Plan"}</Text>
        <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{getPlanLabel(activeDate)}</Text>
      </View>

      <KeyboardAwareScrollViewCompat
        bottomOffset={SPACE.xl}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: botPad + CONTROL.tabContentInset }]}
      >
        {isToday && <><Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TODAY'S CHAINS</Text>
        {chains.length === 0 ? (
          <View style={[styles.emptySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <GlassSurface pointerEvents="none" style={StyleSheet.absoluteFill} />
            <Ionicons name="link-outline" size={22} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Add a chain first to bring its color into your plan.</Text>
          </View>
        ) : (
          <View style={[styles.reflectCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <GlassSurface pointerEvents="none" style={StyleSheet.absoluteFill} />
            {chains.map((chain, index) => {
              const done = chain.completedDates.includes(today);
              const minimum = chain.minimumDates.includes(today);
              const frozen = chain.frozenDates.includes(today);
              return <ChainReflection key={chain.id} chain={chain} done={done} minimum={minimum} frozen={frozen} resting={isRestDay(chain, today)} isLast={index === chains.length - 1} />;
            })}
          </View>
        )}</>}

        {!isToday && items.length > 0 && (
          <View style={[styles.tomorrowSet, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '55' }]}>
            <View style={[styles.tomorrowSetIcon, { backgroundColor: colors.primary + '22' }]}><Ionicons name="moon" size={20} color={colors.primary} /></View>
            <View style={styles.tomorrowSetCopy}><Text style={[styles.tomorrowSetTitle, { color: colors.foreground }]}>Tomorrow is set</Text><Text style={[styles.tomorrowSetBody, { color: colors.mutedForeground }]}>{items.length} tasks{plannedFocusMinutes ? ` · ${formatDurationLabel(plannedFocusMinutes)} of focus` : ''}{reminderCount ? ` · ${reminderCount === 1 ? 'reminder' : 'reminders'} ready` : ''} · {priorityItem ? `One thing: ${priorityItem.text}` : 'Choose one thing that matters most.'}</Text></View>
          </View>
        )}

        <View style={styles.focusHeading}>
          <View style={styles.focusHeadingCopy}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 3 }]}>{isToday ? "TODAY'S AGENDA" : "TOMORROW'S FOCUS"}</Text>
            <Text style={[styles.focusCaption, { color: colors.foreground }]}>{isToday ? 'Move through it gently.' : 'Keep it to what matters.'}</Text>
          </View>
          <View style={[styles.countPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.itemCount, { color: colors.mutedForeground }]}>{items.length} task{items.length === 1 ? '' : 's'}</Text>
          </View>
        </View>

        {items.length > 0 && (
          <View style={styles.progressWrap}>
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${Math.round(progressFill * 100)}%` as any }]} />
            </View>
            <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>{completedCount === items.length ? (isToday ? 'Complete' : 'Ready') : `${completedCount}/${items.length} complete`}</Text>
          </View>
        )}

        {orderedItems.map((item, index) => (
          <PlanItemRow
            key={item.id}
            item={item}
            chainName={chains.find((chain) => chain.id === item.chainId)?.name}
            highlighted={item.id === highlightedItemId}
            newlyAdded={item.id === newlyAddedItemId}
            reminderSyncing={reminderSyncingItemIds.has(item.id)}
            isLast={index === orderedItems.length - 1}
            locked={!canEditActivePlan || reminderSyncingItemIds.has(item.id)}
            completionLocked={!isToday || isActiveDayClosed || reminderSyncingItemIds.has(item.id)}
            onToggle={() => { void handleToggle(item); }}
            onEdit={() => startEditing(item)}
            onMore={() => setTaskMenuItem(item)}
          />
        ))}

        {items.length === 0 && (
          <View style={[styles.emptyFocus, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <GlassSurface pointerEvents="none" style={StyleSheet.absoluteFill} />
            <View style={[styles.moonCircle, { backgroundColor: colors.primary + '18' }]}><Ionicons name="moon" size={22} color={colors.primary} /></View>
            <Text style={[styles.emptyFocusTitle, { color: colors.foreground }]}>{isToday ? 'Your day is clear.' : 'A calm start begins tonight.'}</Text>
            <Text style={[styles.emptyFocusBody, { color: colors.mutedForeground }]}>{isToday ? 'There are no unfinished tasks waiting for you.' : 'Choose what deserves space tomorrow, then let the plan hold the rest.'}</Text>
          </View>
        )}

        {isToday && <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Morning briefing, ${formatBriefingTime(briefingHour)}`}
          accessibilityHint="Opens briefing time options"
          accessibilityState={{ busy: briefingBusy }}
          disabled={briefingBusy}
          onPress={() => setShowBriefingPicker(true)}
          style={({ pressed }) => [styles.briefingRow, { backgroundColor: colors.card, borderColor: colors.border, opacity: briefingBusy ? OPACITY.disabled : pressed ? OPACITY.pressed : 1 }]}
        >
          <GlassSurface pointerEvents="none" style={StyleSheet.absoluteFill} />
          <View style={[styles.briefingIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name="sunny-outline" size={18} color={colors.primary} /></View>
          <View style={styles.briefingCopy}>
            <Text style={[styles.briefingTitle, { color: colors.foreground }]}>Morning briefing</Text>
            <Text
              numberOfLines={fontScale < 1.35 ? 1 : undefined}
              style={[styles.briefingBody, { color: colors.mutedForeground }]}
            >
              Start with clarity.
            </Text>
          </View>
          <Text style={[styles.briefingValue, { color: briefingHour === null ? colors.mutedForeground : colors.primary }]}>{formatBriefingTime(briefingHour)}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>}

        {(!isToday || isActiveDayClosed || !hasPendingItems) && <Pressable
          accessibilityRole="button"
          accessibilityLabel={isToday ? 'Prepare tomorrow' : 'Back to today'}
          onPress={isToday ? continueToTomorrow : showToday}
          style={({ pressed }) => [modeStyles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? OPACITY.pressed : 1 }]}
        >
          <View style={[modeStyles.icon, { backgroundColor: colors.primary + '18' }]}><Ionicons name={isToday ? 'arrow-forward' : 'arrow-back'} size={17} color={colors.primary} /></View>
          <View style={modeStyles.copy}><Text style={[modeStyles.title, { color: colors.foreground }]}>{isToday ? (tomorrowItemCount > 0 ? `Tomorrow ready · ${tomorrowItemCount} task${tomorrowItemCount === 1 ? '' : 's'}` : 'Prepare tomorrow') : 'Back to today'}</Text><Text style={[modeStyles.subtitle, { color: colors.mutedForeground }]}>{isToday ? (tomorrowItemCount > 0 ? 'Review it or make space for one more thing.' : 'Set up tomorrow in a minute.') : 'Return to your active agenda.'}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>}

        {isToday && !isActiveDayClosed && hasPendingItems && (
          <Pressable accessibilityRole="button" accessibilityLabel="Start nightly reset" onPress={() => setShowDayReview(true)} style={({ pressed }) => [styles.reviewTrigger, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? OPACITY.pressed : 1 }]}>
            <View style={[styles.reviewIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name="moon-outline" size={18} color={colors.primary} /></View>
            <View style={styles.reviewCopy}><Text style={[styles.reviewTitle, { color: colors.foreground }]}>Nightly reset</Text><Text style={[styles.reviewSubtitle, { color: colors.mutedForeground }]}>Close today, then prepare tomorrow.</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
          </Pressable>
        )}

        {canEditActivePlan ? <View style={[styles.addCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <GlassSurface pointerEvents="none" style={StyleSheet.absoluteFill} />
            {showInput ? (
              <>
                <TextInput
                  ref={inputRef}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder={isToday ? 'What needs to happen today?' : 'What needs to happen tomorrow?'}
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { color: colors.foreground }]}
                  returnKeyType="done"
                  onSubmitEditing={handleAdd}
                  autoFocus
                />
                <ComposerMeta
                  colors={colors}
                  chains={chains}
                  selectedChainId={selectedChainId}
                  setSelectedChainId={(chainId: string | undefined) => { setSelectedChainId(chainId); Keyboard.dismiss(); }}
                  selectedTaskColor={selectedTaskColor}
                  setSelectedTaskColor={(color: string | undefined) => { setSelectedTaskColor(color); Keyboard.dismiss(); }}
                  selectedTime={selectedTime}
                  setSelectedTime={(time: string) => { setSelectedTime(time); if (!time) setSelectedReminder(undefined); Keyboard.dismiss(); }}
                  openTimePicker={() => { Keyboard.dismiss(); setShowTimePicker(true); }}
                  selectedReminder={selectedReminder}
                  setSelectedReminder={(minutes: number | undefined) => { setSelectedReminder(minutes); Keyboard.dismiss(); }}
                  allowPriority
                  priorityForToday={isToday}
                  isPriority={isPriority}
                  setIsPriority={setIsPriority}
                  repeatDays={selectedRepeatDays}
                  setRepeatDays={setSelectedRepeatDays}
                  selectedDuration={selectedDuration}
                  setSelectedDuration={setSelectedDuration}
                  showAdvancedOptions={showAdvancedOptions}
                  setShowAdvancedOptions={setShowAdvancedOptions}
                />
                <View style={styles.addActions}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Cancel task editing" onPress={resetComposer} style={styles.cancelBtn}><Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text></Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={editingItem ? 'Save task changes' : 'Add task to plan'} accessibilityState={{ disabled: !inputText.trim() }} disabled={!inputText.trim()} onPress={handleAdd} style={({ pressed }) => [styles.addConfirmBtn, { backgroundColor: colors.primary, opacity: !inputText.trim() ? OPACITY.disabled : pressed ? OPACITY.pressed : 1 }]}>
                    <Text style={[styles.addConfirmText, { color: colors.primaryForeground }]}>{editingItem ? 'Save changes' : 'Add to plan'}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel="Add task" onPress={() => setShowInput(true)} style={styles.addTrigger}>
                <View style={[styles.addIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name="add" size={20} color={colors.primary} /></View>
                <View style={styles.addCopy}><Text style={[styles.addTriggerText, { color: colors.foreground }]}>Add task</Text><Text style={[styles.addTriggerSub, { color: colors.mutedForeground }]}>{isToday ? 'Add it to today' : 'Set a time or link a chain'}</Text></View>
                <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
              </Pressable>
            )}
          </View> : <Pressable accessibilityRole="button" accessibilityLabel="Reopen today" onPress={() => { void reopenToday(); playFeedback('selection'); }} style={({ pressed }) => [modeStyles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? OPACITY.pressed : 1 }]}>
            <View style={[modeStyles.icon, { backgroundColor: colors.primary + '18' }]}><Ionicons name="lock-closed-outline" size={18} color={colors.primary} /></View>
            <View style={styles.addCopy}><Text style={[styles.addTriggerText, { color: colors.foreground }]}>Today is closed</Text><Text style={[styles.addTriggerSub, { color: colors.mutedForeground }]}>Reopen today to make a change.</Text></View>
            <Text style={{ color: colors.primary, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Reopen</Text>
          </Pressable>}
      </KeyboardAwareScrollViewCompat>

      <TimePickerModal
        visible={showTimePicker}
        hour={pickerHour}
        minute={pickerMinute}
        setHour={setPickerHour}
        setMinute={setPickerMinute}
        onClose={() => setShowTimePicker(false)}
        onConfirm={chooseCustomTime}
      />
      <MorningBriefingSheet
        visible={showBriefingPicker}
        hour={briefingHour}
        busy={briefingBusy}
        onClose={() => setShowBriefingPicker(false)}
        onSelect={async (hour) => {
          if (await setMorningBriefing(hour)) setShowBriefingPicker(false);
        }}
        onDisable={async () => {
          if (briefingHour === null || await disableMorningBriefing()) setShowBriefingPicker(false);
        }}
      />
      <CompletionMoment visible={showCompletion} onClose={() => setShowCompletion(false)} onPrepareTomorrow={prepareTomorrowWithClosure} />
      <ReminderPermissionMoment visible={showReminderPermission} minutes={selectedReminder} onSkip={() => { setShowReminderPermission(false); void savePlanItem(false); }} onAllow={() => { void enableRemindersAndSave(); }} />
      <DayReviewMoment visible={showDayReview} completedCount={completedCount} totalCount={items.length} protectedChains={protectedChains} chainCount={chains.length} pendingItems={items.filter((item) => !item.completed)} onMove={(item) => { void moveToTomorrow(item); }} onLetGo={(item) => { void letGo(item); }} onClose={() => setShowDayReview(false)} onPrepareTomorrow={finishDayAndPrepareTomorrow} />
      <ChainCompletionMoment visible={!!chainCompletion} item={chainCompletion?.item} chain={chainCompletion?.chain} busy={chainCompletionBusy} onConfirm={() => { void completeLinkedChain(); }} onClose={() => { if (!chainCompletionBusy) setChainCompletion(null); }} />
      <TaskMenuMoment
        item={taskMenuItem}
        showCopy={isToday}
        showFocus={isToday && !isActiveDayClosed && !!taskMenuItem?.durationMinutes && !taskMenuItem.completed}
        onClose={() => setTaskMenuItem(null)}
        onFocus={() => { if (taskMenuItem) router.push({ pathname: '/focus/[id]', params: { id: taskMenuItem.id } }); setTaskMenuItem(null); }}
        onCopy={() => { if (taskMenuItem) void copyToTomorrow(taskMenuItem); }}
        onEdit={() => { if (taskMenuItem) startEditing(taskMenuItem); setTaskMenuItem(null); }}
        onDelete={() => { if (taskMenuItem) void deleteTask(taskMenuItem); }}
      />
    </AmbientScreen>
  );
}

function ChainReflection({ chain, done, minimum, frozen, resting, isLast }: { chain: Chain; done: boolean; minimum: boolean; frozen: boolean; resting: boolean; isLast: boolean }) {
  const colors = useColors();
  const chainTextAccent = readableAccentColor(chain.color, colors.cardSolid);
  return <View>
    <View style={styles.reflectRow}>
      <View style={[styles.reflectDot, { backgroundColor: chain.color }]} />
      <Text style={[styles.reflectName, { color: colors.foreground }]} numberOfLines={1}>{chain.name}</Text>
      {done ? <View style={[styles.doneBadge, { backgroundColor: chain.color + '20' }]}><Ionicons name="checkmark" size={12} color={chainTextAccent} /><Text style={[styles.doneBadgeText, { color: chainTextAccent }]}>done today</Text></View> : minimum ? <View style={[styles.doneBadge, { backgroundColor: chain.color + '14' }]}><Ionicons name="leaf-outline" size={12} color={chainTextAccent} /><Text style={[styles.doneBadgeText, { color: chainTextAccent }]}>minimum kept</Text></View> : frozen ? <View style={[styles.doneBadge, { backgroundColor: '#4488ff20' }]}><Ionicons name="snow" size={12} color="#4488ff" /><Text style={[styles.doneBadgeText, { color: '#4488ff' }]}>frozen today</Text></View> : resting ? <View style={[styles.doneBadge, { backgroundColor: colors.mutedForeground + '18' }]}><Ionicons name="moon-outline" size={12} color={colors.mutedForeground} /><Text style={[styles.doneBadgeText, { color: colors.mutedForeground }]}>rest day</Text></View> : <Text style={[styles.pendingText, { color: colors.mutedForeground }]}>pending</Text>}
    </View>
    {!isLast && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
  </View>;
}

function ComposerMeta({ colors, chains, selectedChainId, setSelectedChainId, selectedTaskColor, setSelectedTaskColor, selectedTime, setSelectedTime, openTimePicker, selectedReminder, setSelectedReminder, allowPriority, priorityForToday, isPriority, setIsPriority, repeatDays, setRepeatDays, selectedDuration, setSelectedDuration, showAdvancedOptions, setShowAdvancedOptions }: any) {
  const timeScrollRef = useRef<ScrollView>(null);
  const detailsCount = Number(Boolean(selectedTaskColor && !selectedChainId))
    + Number(repeatDays.length > 0)
    + Number(Boolean(selectedDuration))
    + Number(Boolean(selectedTime) && selectedReminder !== undefined);

  useEffect(() => {
    const selectedIndex = QUICK_TIMES.indexOf(selectedTime);
    if (selectedIndex < 0) return;
    const frame = requestAnimationFrame(() => {
      timeScrollRef.current?.scrollTo({ x: Math.max(0, (selectedIndex + 1) * 72 - SPACE.md), animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedTime]);

  return <View style={styles.composerMeta}>
    <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>TIME</Text>
    <ScrollView ref={timeScrollRef} horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeSlots}>
      <Pressable accessibilityRole="button" accessibilityLabel={selectedTime && !QUICK_TIMES.includes(selectedTime) ? `Custom time ${selectedTime}` : 'Choose a custom time'} accessibilityState={{ selected: Boolean(selectedTime && !QUICK_TIMES.includes(selectedTime)) }} onPress={openTimePicker} style={[styles.timeChip, { backgroundColor: selectedTime && !QUICK_TIMES.includes(selectedTime) ? colors.primary : colors.background, borderColor: selectedTime && !QUICK_TIMES.includes(selectedTime) ? colors.primary : colors.border }]}><Ionicons name="time-outline" size={14} color={selectedTime && !QUICK_TIMES.includes(selectedTime) ? colors.primaryForeground : colors.mutedForeground} /><Text style={[styles.timeChipText, { color: selectedTime && !QUICK_TIMES.includes(selectedTime) ? colors.primaryForeground : colors.mutedForeground }]}>{selectedTime && !QUICK_TIMES.includes(selectedTime) ? selectedTime : 'Custom'}</Text></Pressable>
      {QUICK_TIMES.map((time) => <Pressable key={time} accessibilityRole="radio" accessibilityLabel={`Task time ${time}`} accessibilityState={{ selected: time === selectedTime }} onPress={() => setSelectedTime(time === selectedTime ? '' : time)} style={[styles.timeChip, { backgroundColor: time === selectedTime ? colors.primary : colors.background, borderColor: time === selectedTime ? colors.primary : colors.border }]}><Text style={[styles.timeChipText, { color: time === selectedTime ? colors.primaryForeground : colors.mutedForeground }]}>{time}</Text></Pressable>)}
    </ScrollView>
    <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>ADD TO A CHAIN · OPTIONAL</Text>
    <Text style={[styles.chainHelper, { color: colors.mutedForeground }]}>Only link tasks that move that chain forward. Unlinked tasks stay neutral.</Text>
    <FlatList data={[{ id: '', name: 'No chain', color: colors.mutedForeground }, ...chains]} horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} keyExtractor={(chain) => chain.id} contentContainerStyle={styles.chainChoices} renderItem={({ item: chain }) => { const selected = (chain.id || undefined) === selectedChainId; return <Pressable accessibilityRole="radio" accessibilityLabel={chain.id ? `Link to ${chain.name}` : 'Do not link a chain'} accessibilityState={{ selected }} onPress={() => setSelectedChainId(chain.id || undefined)} style={[styles.chainChip, { borderColor: selected ? chain.color : colors.border, backgroundColor: selected ? chain.color + '1F' : colors.background }]}><View style={[styles.chainChipDot, { backgroundColor: chain.color }]} /><Text style={[styles.chainChipText, { color: selected ? colors.foreground : colors.mutedForeground }]}>{chain.name}</Text></Pressable>; }} />
    {allowPriority && <><Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>{priorityForToday ? 'TODAY\'S ONE THING · OPTIONAL' : 'TOMORROW\'S ONE THING · OPTIONAL'}</Text><Pressable accessibilityRole="switch" accessibilityLabel="Make this your one thing" accessibilityState={{ checked: isPriority }} onPress={() => setIsPriority(!isPriority)} style={[styles.priorityPick, { borderColor: isPriority ? colors.primary : colors.border, backgroundColor: isPriority ? colors.primary + '1A' : colors.background }]}><View style={[styles.priorityIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name="sparkles-outline" size={15} color={colors.primary} /></View><View style={styles.priorityCopy}><Text style={[styles.priorityTitle, { color: colors.foreground }]}>Make this your one thing</Text><Text style={[styles.priorityBody, { color: colors.mutedForeground }]}>The task that matters most {priorityForToday ? 'today' : 'tomorrow'}.</Text></View>{isPriority && <Ionicons name="checkmark-circle" size={19} color={colors.primary} />}</Pressable></>}
    <Pressable accessibilityRole="button" accessibilityLabel="Task details" accessibilityHint="Opens color, repeat, focus and reminder options" accessibilityState={{ expanded: showAdvancedOptions }} onPress={() => { Keyboard.dismiss(); setShowAdvancedOptions(true); }} style={[styles.detailsToggle, { borderColor: detailsCount ? colors.primary + '70' : colors.border, backgroundColor: detailsCount ? colors.primary + '0A' : colors.background }]}><View style={[styles.priorityIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name="options-outline" size={15} color={colors.primary} /></View><View style={styles.priorityCopy}><Text style={[styles.priorityTitle, { color: colors.foreground }]}>Task details</Text><Text style={[styles.priorityBody, { color: colors.mutedForeground }]}>{detailsCount ? `${detailsCount} ${detailsCount === 1 ? 'detail' : 'details'} set` : 'Color, repeat, focus and reminders.'}</Text></View><Ionicons name="chevron-forward" size={18} color={detailsCount ? colors.primary : colors.mutedForeground} /></Pressable>
    <TaskDetailsSheet
      visible={showAdvancedOptions}
      onClose={() => setShowAdvancedOptions(false)}
      colors={colors}
      selectedChainId={selectedChainId}
      selectedChainName={chains.find((chain: Chain) => chain.id === selectedChainId)?.name}
      selectedTaskColor={selectedTaskColor}
      setSelectedTaskColor={setSelectedTaskColor}
      selectedTime={selectedTime}
      selectedReminder={selectedReminder}
      setSelectedReminder={setSelectedReminder}
      repeatDays={repeatDays}
      setRepeatDays={setRepeatDays}
      selectedDuration={selectedDuration}
      setSelectedDuration={setSelectedDuration}
    />
  </View>;
}

type TaskDetailSection = 'accent' | 'repeat' | 'focus' | 'reminder' | null;

function TaskDetailSectionRow({ icon, title, summary, active, configured, disabled, onPress, colors }: any) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={title}
    accessibilityHint={summary}
    accessibilityState={{ expanded: active, disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.taskDetailRow, { borderColor: colors.border, opacity: disabled ? OPACITY.disabled : pressed ? OPACITY.pressed : 1 }]}
  >
    <View style={[styles.taskDetailIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name={icon} size={17} color={colors.primary} /></View>
    <View style={styles.taskDetailCopy}><Text style={[styles.taskDetailTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.taskDetailSummary, { color: colors.mutedForeground }]} numberOfLines={2}>{summary}</Text></View>
    {configured && !active && <View style={[styles.taskDetailSetDot, { backgroundColor: colors.primary }]} />}
    <Ionicons name={active ? 'chevron-up' : 'chevron-down'} size={18} color={configured || active ? colors.primary : colors.mutedForeground} />
  </Pressable>;
}

function TaskDetailsSheet({ visible, onClose, colors, selectedChainId, selectedChainName, selectedTaskColor, setSelectedTaskColor, selectedTime, selectedReminder, setSelectedReminder, repeatDays, setRepeatDays, selectedDuration, setSelectedDuration }: any) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { height } = useWindowDimensions();
  const [openSection, setOpenSection] = useState<TaskDetailSection>(null);
  const accentLocked = Boolean(selectedChainId);

  useEffect(() => {
    if (!visible) setOpenSection(null);
  }, [visible]);

  const toggleSection = (section: Exclude<TaskDetailSection, null>) => {
    setOpenSection((current) => current === section ? null : section);
  };

  return <Modal transparent visible={visible} animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose}>
    <View style={styles.modalShade}>
      <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={onClose} />
      <View accessibilityViewIsModal style={[styles.taskDetailsSheet, { backgroundColor: colors.card, borderColor: colors.border, maxHeight: height - Math.max(insets.top, SPACE.sm), paddingBottom: Math.max(insets.bottom, SPACE.md) }]}>
        <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
        <View style={styles.taskDetailsHeader}>
          <View style={styles.taskDetailsHeaderCopy}><Text style={[styles.modalTitle, { color: colors.foreground }]}>Task details</Text><Text style={[styles.taskDetailsIntro, { color: colors.mutedForeground }]}>Add only what helps this task happen.</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close task details" onPress={onClose} style={styles.modalClose}><Ionicons name="close" size={22} color={colors.mutedForeground} /></Pressable>
        </View>
        <ScrollView style={styles.taskDetailsScroll} contentContainerStyle={styles.taskDetailsContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TaskDetailSectionRow
            icon="color-palette-outline"
            title="Accent"
            summary={accentLocked ? `Uses ${selectedChainName || 'the linked chain'}’s color.` : selectedTaskColor ? 'Custom color selected.' : 'Neutral task color.'}
            active={openSection === 'accent'}
            configured={Boolean(selectedTaskColor && !accentLocked)}
            disabled={accentLocked}
            onPress={() => toggleSection('accent')}
            colors={colors}
          />
          {openSection === 'accent' && !accentLocked && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.taskDetailChips}>
            {[undefined, ...TASK_ACCENTS].map((color, index) => {
              const selected = color === selectedTaskColor;
              return <Pressable key={color ?? 'neutral'} accessibilityRole="radio" accessibilityLabel={color ? `Accent color ${index}` : 'Neutral accent'} accessibilityState={{ selected }} onPress={() => setSelectedTaskColor(color)} style={[styles.colorChoice, { borderColor: selected ? (color || colors.primary) : colors.border, backgroundColor: selected ? (color || colors.mutedForeground) + '20' : colors.background }]}>{color ? <View style={[styles.colorChoiceDot, { backgroundColor: color }]} /> : <Ionicons name="remove-outline" size={17} color={colors.mutedForeground} />}{!color && <Text style={[styles.colorChoiceText, { color: colors.mutedForeground }]}>Neutral</Text>}</Pressable>;
            })}
          </ScrollView>}

          <TaskDetailSectionRow
            icon="repeat-outline"
            title="Repeat"
            summary={repeatDays.length ? `${repeatDays.length} day${repeatDays.length === 1 ? '' : 's'} selected.` : 'Choose the days this task returns.'}
            active={openSection === 'repeat'}
            configured={repeatDays.length > 0}
            onPress={() => toggleSection('repeat')}
            colors={colors}
          />
          {openSection === 'repeat' && <View style={styles.sevenChoiceWrap}><SevenChoiceSelector options={WEEKDAY_OPTIONS} selectionMode="multiple" selectedValues={repeatDays} onSelectionChange={setRepeatDays} accentColor={colors.primary} selectedTextColor={colors.primaryForeground} textColor={colors.mutedForeground} borderColor={colors.border} backgroundColor={colors.background} accessibilityLabel="Repeat days" /></View>}

          <TaskDetailSectionRow
            icon="hourglass-outline"
            title="Focus"
            summary={selectedDuration ? `${formatDurationLabel(selectedDuration)} reserved.` : 'Reserve intentional time for this task.'}
            active={openSection === 'focus'}
            configured={Boolean(selectedDuration)}
            onPress={() => toggleSection('focus')}
            colors={colors}
          />
          {openSection === 'focus' && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.taskDetailChips}>
            <Pressable accessibilityRole="radio" accessibilityLabel="No focus duration" accessibilityState={{ selected: selectedDuration === undefined }} onPress={() => setSelectedDuration(undefined)} style={[styles.detailChip, { borderColor: selectedDuration === undefined ? colors.primary : colors.border, backgroundColor: selectedDuration === undefined ? colors.primary + '1F' : colors.background }]}><Text style={[styles.detailChipText, { color: selectedDuration === undefined ? colors.primary : colors.mutedForeground }]}>None</Text></Pressable>
            {DURATION_OPTIONS.map((minutes) => { const selected = selectedDuration === minutes; return <Pressable key={minutes} accessibilityRole="radio" accessibilityLabel={`Focus for ${formatDurationLabel(minutes)}`} accessibilityState={{ selected }} onPress={() => setSelectedDuration(minutes)} style={[styles.detailChip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary + '1F' : colors.background }]}><Text style={[styles.detailChipText, { color: selected ? colors.primary : colors.mutedForeground }]}>{formatDurationLabel(minutes)}</Text></Pressable>; })}
          </ScrollView>}

          <TaskDetailSectionRow
            icon="notifications-outline"
            title="Reminder"
            summary={!selectedTime ? 'Choose a task time first.' : selectedReminder !== undefined ? selectedReminder === 0 ? 'At start.' : `${selectedReminder} min before.` : 'Add a gentle nudge.'}
            active={openSection === 'reminder'}
            configured={selectedReminder !== undefined && Boolean(selectedTime)}
            disabled={!selectedTime}
            onPress={() => toggleSection('reminder')}
            colors={colors}
          />
          {openSection === 'reminder' && selectedTime && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.taskDetailChips}>
            <Pressable accessibilityRole="radio" accessibilityLabel="No reminder" accessibilityState={{ selected: selectedReminder === undefined }} onPress={() => setSelectedReminder(undefined)} style={[styles.detailChip, { borderColor: selectedReminder === undefined ? colors.primary : colors.border, backgroundColor: selectedReminder === undefined ? colors.primary + '1F' : colors.background }]}><Text style={[styles.detailChipText, { color: selectedReminder === undefined ? colors.primary : colors.mutedForeground }]}>None</Text></Pressable>
            {REMINDER_OPTIONS.map((minutes) => { const selected = selectedReminder === minutes; return <Pressable key={minutes} accessibilityRole="radio" accessibilityLabel={minutes === 0 ? 'Remind at start' : `Remind ${minutes} minutes before`} accessibilityState={{ selected }} onPress={() => setSelectedReminder(minutes)} style={[styles.detailChip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary + '1F' : colors.background }]}><Text style={[styles.detailChipText, { color: selected ? colors.primary : colors.mutedForeground }]}>{minutes === 0 ? 'At start' : `${minutes} min`}</Text></Pressable>; })}
          </ScrollView>}
        </ScrollView>
        <Pressable accessibilityRole="button" accessibilityLabel="Done editing task details" onPress={onClose} style={[styles.taskDetailsDone, { backgroundColor: colors.primary }]}><Text style={[styles.taskDetailsDoneText, { color: colors.primaryForeground }]}>Done</Text></Pressable>
      </View>
    </View>
  </Modal>;
}

function PlanItemRow({ item, chainName, highlighted, newlyAdded, reminderSyncing, isLast, locked, completionLocked, onToggle, onEdit, onMore }: { item: PlanItem; chainName?: string; highlighted: boolean; newlyAdded: boolean; reminderSyncing: boolean; isLast: boolean; locked: boolean; completionLocked: boolean; onToggle: () => void; onEdit: () => void; onMore: () => void }) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const accentColor = item.color || UNLINKED_TASK_COLOR;
  const displayAccent = item.isPriority ? colors.primary : accentColor;
  const textAccent = readableAccentColor(displayAccent, colors.cardSolid);
  const chainTextAccent = readableAccentColor(accentColor, colors.cardSolid);
  const borderColor = highlighted ? displayAccent : item.isPriority ? colors.primary : item.completed ? displayAccent + '48' : colors.border;
  const backgroundColor = highlighted ? accentColor + '14' : item.isPriority ? colors.primary + '0D' : item.completed ? accentColor + '12' : colors.card;
  const arrival = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!newlyAdded || reduceMotion) {
      arrival.setValue(1);
      return;
    }
    arrival.setValue(0);
    const animation = Animated.timing(arrival, { toValue: 1, duration: MOTION.standard, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [arrival, newlyAdded, reduceMotion]);
  return <Animated.View style={[styles.planItem, { backgroundColor, borderColor, marginBottom: isLast ? 20 : 8, opacity: arrival, transform: [{ translateY: arrival.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }, { scale: arrival.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }] }]}>
    <GlassSurface pointerEvents="none" accentColor={displayAccent} style={StyleSheet.absoluteFill} />
    <View style={[styles.planBar, { backgroundColor: item.completed ? displayAccent + 'A8' : displayAccent }]} />
    <Pressable accessibilityRole="checkbox" accessibilityLabel={reminderSyncing ? `Saving reminder for ${item.text}` : item.completed ? `Mark ${item.text} incomplete` : `Complete ${item.text}`} accessibilityState={{ checked: item.completed, disabled: completionLocked, busy: reminderSyncing }} hitSlop={8} disabled={completionLocked} onPress={onToggle} style={styles.planCheck}><View style={[styles.planCheckCircle, { backgroundColor: item.completed ? displayAccent : completionLocked ? 'transparent' : displayAccent + '14', borderColor: item.completed ? displayAccent : completionLocked ? colors.mutedForeground : displayAccent, opacity: completionLocked && !item.completed ? 0.58 : 1 }]}>{item.completed ? <Ionicons name="checkmark" size={13} color={readableTextColor(displayAccent)} /> : reminderSyncing ? <Ionicons name="hourglass-outline" size={12} color={colors.mutedForeground} /> : completionLocked ? <Ionicons name="lock-closed-outline" size={11} color={colors.mutedForeground} /> : null}</View></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${item.text}`} accessibilityState={{ disabled: locked }} disabled={locked} onPress={onEdit} style={styles.planTextBlock}>
      <View style={styles.planMeta}>{item.isPriority && <View style={[styles.priorityBadge, { backgroundColor: colors.primary + '1A' }]}><Ionicons name="sparkles" size={10} color={colors.primary} /><Text style={[styles.priorityBadgeText, { color: colors.primary }]}>ONE THING</Text></View>}{completionLocked && !locked && <View style={[styles.tomorrowBadge, { backgroundColor: colors.mutedForeground + '18' }]}><Ionicons name="lock-closed-outline" size={11} color={colors.mutedForeground} /><Text style={[styles.tomorrowBadgeText, { color: colors.mutedForeground }]}>TOMORROW</Text></View>}{item.timeSlot ? <Text style={[styles.planTime, { color: textAccent }]}>{item.timeSlot}{item.durationMinutes ? `  ·  ${formatDurationLabel(item.durationMinutes)}` : ''}{item.reminderMinutes !== undefined ? `  ·  ${item.reminderMinutes === 0 ? 'AT START' : `${item.reminderMinutes} MIN REMINDER`}` : ''}</Text> : <Text style={[styles.planTime, { color: item.isPriority ? colors.primary : colors.mutedForeground }]}>{item.durationMinutes ? `${formatDurationLabel(item.durationMinutes)} BLOCK` : 'ANYTIME'}</Text>}{chainName && <View style={[styles.linkBadge, { backgroundColor: accentColor + '1A' }]}><Ionicons name="link-outline" size={10} color={chainTextAccent} /><Text style={[styles.linkBadgeText, { color: chainTextAccent }]}>{chainName}</Text></View>}</View>
      <Text style={[styles.planText, { color: item.completed ? colors.foreground + 'A6' : colors.foreground, textDecorationLine: item.completed ? 'line-through' : 'none', textDecorationColor: item.completed ? colors.primary : undefined, textDecorationStyle: 'solid' }]} numberOfLines={2}>{item.text}</Text>
    </Pressable>
    {locked ? <Ionicons name={reminderSyncing ? 'hourglass-outline' : 'lock-closed-outline'} size={16} color={colors.mutedForeground} /> : <Pressable accessibilityRole="button" accessibilityLabel={`More actions for ${item.text}`} onPress={onMore} style={styles.moreButton}><Ionicons name="ellipsis-horizontal" size={20} color={colors.mutedForeground} /></Pressable>}
  </Animated.View>;
}

function TaskMenuMoment({ item, showCopy, showFocus, onClose, onFocus, onCopy, onEdit, onDelete }: { item: PlanItem | null; showCopy: boolean; showFocus: boolean; onClose: () => void; onFocus: () => void; onCopy: () => void; onEdit: () => void; onDelete: () => void }) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  if (!item) return null;
  const titleStyle = { ...TYPE.sectionTitle, color: colors.foreground, marginBottom: SPACE.md } as const;
  const actionStyle = { minHeight: CONTROL.minimumTarget, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderRadius: RADIUS.control, paddingHorizontal: SPACE.md, marginBottom: SPACE.xs } as const;
  const actionTextStyle = { ...TYPE.bodyStrong } as const;
  return <Modal transparent visible animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onClose}><View style={completionStyles.shade}><View accessibilityViewIsModal style={[completionStyles.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: 'stretch' }]}><Text style={titleStyle} numberOfLines={1}>{item.text}</Text>{showFocus && <Pressable accessibilityRole="button" accessibilityLabel={`Start focus for ${formatDurationLabel(item.durationMinutes || 0)}`} onPress={onFocus} style={[actionStyle, { backgroundColor: colors.primary }]}><Ionicons name="play" size={16} color={colors.primaryForeground} /><Text style={[actionTextStyle, { color: colors.primaryForeground }]}>Start focus · {formatDurationLabel(item.durationMinutes || 0)}</Text></Pressable>}{showCopy && <Pressable accessibilityRole="button" accessibilityLabel="Copy task to tomorrow" onPress={onCopy} style={[actionStyle, { backgroundColor: colors.primary + '18' }]}><Ionicons name="copy-outline" size={18} color={colors.primary} /><Text style={[actionTextStyle, { color: colors.primary }]}>Copy to tomorrow</Text></Pressable>}<Pressable accessibilityRole="button" accessibilityLabel="Edit task" onPress={onEdit} style={[actionStyle, { backgroundColor: colors.background }]}><Ionicons name="create-outline" size={18} color={colors.foreground} /><Text style={[actionTextStyle, { color: colors.foreground }]}>Edit task</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Delete task" onPress={onDelete} style={[actionStyle, { backgroundColor: colors.destructive + '16' }]}><Ionicons name="trash-outline" size={18} color={colors.destructive} /><Text style={[actionTextStyle, { color: colors.destructive }]}>Delete task</Text></Pressable><Pressable accessibilityRole="button" onPress={onClose} style={completionStyles.secondaryButton}><Text style={[completionStyles.secondaryText, { color: colors.mutedForeground }]}>Cancel</Text></Pressable></View></View></Modal>;
}

function CompletionMoment({ visible, onClose, onPrepareTomorrow }: { visible: boolean; onClose: () => void; onPrepareTomorrow: () => void }) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const iconScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!visible) return;
    if (reduceMotion) {
      scale.setValue(1);
      iconScale.setValue(1);
      return;
    }
    scale.setValue(0.97);
    iconScale.setValue(0.96);
    const animation = Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration: MOTION.standard, useNativeDriver: true }),
      Animated.timing(iconScale, { toValue: 1, duration: MOTION.standard, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [visible, scale, iconScale, reduceMotion]);
  return <Modal transparent visible={visible} animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onClose}><View style={completionStyles.shade}><Animated.View accessibilityViewIsModal style={[completionStyles.card, { backgroundColor: colors.card, borderColor: colors.border, transform: [{ scale }] }]}><Animated.View style={[completionStyles.icon, { backgroundColor: colors.primary + '20', transform: [{ scale: iconScale }] }]}><Ionicons name="checkmark" size={30} color={colors.primary} /></Animated.View><Text style={[completionStyles.title, { color: colors.foreground }]}>Day complete</Text><Text style={[completionStyles.body, { color: colors.mutedForeground, textAlign: 'center', lineHeight: 20 }]}>You followed through today. Let that count.</Text><Pressable accessibilityRole="button" onPress={onPrepareTomorrow} style={[completionStyles.primaryButton, { backgroundColor: colors.primary }]}><Text style={[completionStyles.primaryText, { color: colors.primaryForeground }]}>Prepare tomorrow</Text></Pressable><Pressable accessibilityRole="button" onPress={onClose} style={completionStyles.secondaryButton}><Text style={[completionStyles.secondaryText, { color: colors.mutedForeground }]}>Done</Text></Pressable></Animated.View></View></Modal>;
}

function ReminderPermissionMoment({ visible, minutes, onSkip, onAllow }: { visible: boolean; minutes?: number; onSkip: () => void; onAllow: () => void }) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  return <Modal transparent visible={visible} animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onSkip}><View style={completionStyles.shade}><View accessibilityViewIsModal style={[completionStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[completionStyles.icon, { backgroundColor: colors.primary + '20' }]}><Ionicons name="notifications-outline" size={28} color={colors.primary} /></View><Text style={[completionStyles.title, { color: colors.foreground }]}>Stay on time</Text><Text style={[completionStyles.body, { color: colors.mutedForeground, textAlign: 'center', lineHeight: 20 }]}>Chain can remind you {minutes === 0 ? 'when this task starts' : `${minutes} minutes before this task`}. You can change this anytime in iPhone Settings.</Text><Pressable accessibilityRole="button" accessibilityLabel="Allow task reminders" onPress={onAllow} style={[completionStyles.primaryButton, { backgroundColor: colors.primary }]}><Text style={[completionStyles.primaryText, { color: colors.primaryForeground }]}>Allow reminders</Text></Pressable><Pressable accessibilityRole="button" onPress={onSkip} style={completionStyles.secondaryButton}><Text style={[completionStyles.secondaryText, { color: colors.mutedForeground }]}>Not now</Text></Pressable></View></View></Modal>;
}

function ChainCompletionMoment({ visible, item, chain, busy, onConfirm, onClose }: { visible: boolean; item?: PlanItem; chain?: Chain; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  if (!item || !chain) return null;
  const chainTextAccent = readableAccentColor(chain.color, colors.cardSolid);
  return <Modal transparent visible={visible} animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onClose}><View style={completionStyles.shade}><View accessibilityViewIsModal style={[completionStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[completionStyles.icon, { backgroundColor: chain.color + '20' }]}><Ionicons name="link-outline" size={28} color={chainTextAccent} /></View><Text style={[completionStyles.title, { color: colors.foreground }]}>One more check</Text><Text style={[completionStyles.body, { color: colors.mutedForeground, textAlign: 'center', lineHeight: 20 }]}><Text style={{ fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>{item.text}</Text> is done. Does that complete <Text style={{ fontFamily: 'Inter_600SemiBold', color: chainTextAccent }}>{chain.name}</Text> for today?</Text><Pressable accessibilityRole="button" accessibilityLabel={`Mark ${chain.name} done`} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onConfirm} style={[completionStyles.primaryButton, { backgroundColor: chain.color, opacity: busy ? OPACITY.disabled : 1 }]}><Text style={[completionStyles.primaryText, { color: readableTextColor(chain.color) }]}>{busy ? 'Saving…' : 'Mark chain done'}</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onClose} style={[completionStyles.secondaryButton, { opacity: busy ? OPACITY.disabled : 1 }]}><Text style={[completionStyles.secondaryText, { color: colors.mutedForeground }]}>Not yet</Text></Pressable></View></View></Modal>;
}

function DayReviewMoment({ visible, completedCount, totalCount, protectedChains, chainCount, pendingItems, onMove, onLetGo, onClose, onPrepareTomorrow }: { visible: boolean; completedCount: number; totalCount: number; protectedChains: number; chainCount: number; pendingItems: PlanItem[]; onMove: (item: PlanItem) => void; onLetGo: (item: PlanItem) => void; onClose: () => void; onPrepareTomorrow: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  return <Modal transparent visible={visible} animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose}>
    <View style={styles.modalShade}>
      <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={onClose} />
      <View accessibilityViewIsModal style={[styles.reviewModal, { backgroundColor: colors.card, borderColor: colors.border, maxHeight: '86%', minHeight: 0, paddingBottom: Math.max(insets.bottom, SPACE.xxl) }]}>
        <View style={[styles.reviewModalIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name="moon" size={21} color={colors.primary} /></View>
        <Text style={[styles.reviewModalTitle, { color: colors.foreground }]}>Close today gently</Text>
        <Text style={[styles.reviewModalBody, { color: colors.mutedForeground }]}>{completedCount}/{totalCount} tasks complete{chainCount ? ` · ${protectedChains}/${chainCount} chains protected.` : '.'}</Text>
        {pendingItems.length === 0
          ? <Text style={[styles.reviewAllClear, { color: colors.primary }]}>Everything is already complete.</Text>
          : <ScrollView style={[styles.reviewList, { minHeight: 0, flexShrink: 1 }]} showsVerticalScrollIndicator={false}>
            {pendingItems.map((item) => <View key={item.id} style={[styles.reviewRow, { borderColor: colors.border }]}>
              <View style={[styles.reviewDot, { backgroundColor: item.color || UNLINKED_TASK_COLOR }]} />
              <View style={styles.reviewItemCopy}><Text style={[styles.reviewItemText, { color: colors.foreground }]} numberOfLines={1}>{item.text}</Text><Text style={[styles.reviewItemTime, { color: colors.mutedForeground }]}>{item.timeSlot || 'Anytime'}</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Move ${item.text} to tomorrow`} onPress={() => onMove(item)} style={[styles.reviewMove, { backgroundColor: colors.primary + '18' }]}><Text style={[styles.reviewMoveText, { color: colors.primary }]}>Move</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Let go of ${item.text}`} onPress={() => onLetGo(item)} hitSlop={8} style={styles.reviewLetGo}><Ionicons name="close" size={18} color={colors.mutedForeground} /></Pressable>
            </View>)}
          </ScrollView>}
        <Pressable accessibilityRole="button" accessibilityLabel="Close today and prepare tomorrow" onPress={onPrepareTomorrow} style={[styles.reviewDone, { backgroundColor: colors.primary }]}><Text style={[styles.reviewDoneText, { color: colors.primaryForeground }]}>Prepare tomorrow</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.reviewLater}><Text style={[styles.reviewLaterText, { color: colors.mutedForeground }]}>Not now</Text></Pressable>
      </View>
    </View>
  </Modal>;
}

function timeSortValue(timeSlot: string) {
  const match = /^(\d{1,2})(?::(\d{2}))?\s(AM|PM)$/.exec(timeSlot);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hour = Number(match[1]);
  if (match[3] === 'PM' && hour !== 12) hour += 12;
  if (match[3] === 'AM' && hour === 12) hour = 0;
  return hour * 60 + Number(match[2] || 0);
}

function MorningBriefingSheet({ visible, hour, busy, onClose, onSelect, onDisable }: { visible: boolean; hour: number | null; busy: boolean; onClose: () => void; onSelect: (hour: number) => Promise<void>; onDisable: () => Promise<void> }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { height } = useWindowDimensions();
  const dismiss = () => { if (!busy) onClose(); };
  return <Modal transparent visible={visible} animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={dismiss}>
    <View style={styles.modalShade}>
      <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={dismiss} />
      <View accessibilityViewIsModal style={[styles.briefingSheet, { backgroundColor: colors.card, borderColor: colors.border, maxHeight: height - Math.max(insets.top, SPACE.sm), paddingBottom: Math.max(insets.bottom, SPACE.md) }]}>
        <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
        <View style={styles.taskDetailsHeader}>
          <View style={styles.taskDetailsHeaderCopy}><Text style={[styles.modalTitle, { color: colors.foreground }]}>Morning briefing</Text><Text style={[styles.taskDetailsIntro, { color: colors.mutedForeground }]}>A single quiet prompt to open your plan.</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close briefing options" accessibilityState={{ disabled: busy }} disabled={busy} onPress={dismiss} style={styles.modalClose}><Ionicons name="close" size={22} color={colors.mutedForeground} /></Pressable>
        </View>
        <ScrollView style={styles.briefingOptionsScroll} contentContainerStyle={styles.briefingOptionsContent} showsVerticalScrollIndicator={false}>
          <View accessibilityRole="radiogroup" accessibilityLabel="Morning briefing time" style={styles.briefingOptionList}>
            {[7, 8, 9].map((optionHour) => { const selected = hour === optionHour; return <Pressable key={optionHour} accessibilityRole="radio" accessibilityLabel={`${optionHour}:00 AM`} accessibilityState={{ selected, disabled: busy }} disabled={busy} onPress={() => { void onSelect(optionHour); }} style={({ pressed }) => [styles.briefingOption, { backgroundColor: selected ? colors.primary + '16' : colors.background, borderColor: selected ? colors.primary : colors.border, opacity: busy ? OPACITY.disabled : pressed ? OPACITY.pressed : 1 }]}><View style={[styles.briefingOptionIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name="sunny-outline" size={17} color={colors.primary} /></View><Text style={[styles.briefingOptionText, { color: colors.foreground }]}>{optionHour}:00 AM</Text>{selected && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}</Pressable>; })}
            <Pressable accessibilityRole="radio" accessibilityLabel="Turn morning briefing off" accessibilityState={{ selected: hour === null, disabled: busy }} disabled={busy} onPress={() => { void onDisable(); }} style={({ pressed }) => [styles.briefingOption, { backgroundColor: hour === null ? colors.muted : colors.background, borderColor: hour === null ? colors.mutedForeground + '55' : colors.border, opacity: busy ? OPACITY.disabled : pressed ? OPACITY.pressed : 1 }]}><View style={[styles.briefingOptionIcon, { backgroundColor: colors.mutedForeground + '16' }]}><Ionicons name="notifications-off-outline" size={17} color={colors.mutedForeground} /></View><Text style={[styles.briefingOptionText, { color: colors.foreground }]}>Off</Text>{hour === null && <Ionicons name="checkmark-circle" size={20} color={colors.mutedForeground} />}</Pressable>
          </View>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

function TimePickerModal({ visible, hour, minute, setHour, setMinute, onClose, onConfirm }: any) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { height, fontScale } = useWindowDimensions();
  const basePickerHeight = height < 650 ? 160 : Math.min(220, Math.round(height * 0.3));
  const pickerHeight = Math.max(120, Math.round(basePickerHeight / Math.max(1, fontScale * 0.8)));
  return <Modal transparent visible={visible} animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose}>
    <View style={styles.modalShade}><Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={onClose} /><View accessibilityViewIsModal style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, maxHeight: height - Math.max(insets.top, SPACE.sm), paddingBottom: Math.max(insets.bottom, SPACE.xxl) }]}>
      <View style={styles.modalHeader}><Text style={[styles.modalTitle, { color: colors.foreground }]}>Choose a time</Text><Pressable accessibilityRole="button" accessibilityLabel="Close time picker" onPress={onClose} style={styles.modalClose}><Ionicons name="close" size={22} color={colors.mutedForeground} /></Pressable></View>
      <Text style={[styles.timePreview, { color: colors.primary }]}>{formatTime(hour, minute)}</Text>
      <View style={[styles.pickerColumns, { height: pickerHeight }]}><View style={styles.pickerColumn}><Text style={[styles.pickerLabel, { color: colors.mutedForeground }]}>HOUR</Text><FlatList data={HOURS} keyExtractor={(value) => String(value)} style={styles.pickerList} renderItem={({ item }) => <Pressable accessibilityRole="radio" accessibilityLabel={`${item % 12 || 12} ${item >= 12 ? 'PM' : 'AM'}`} accessibilityState={{ selected: item === hour }} onPress={() => setHour(item)} style={[styles.pickerValue, { backgroundColor: item === hour ? colors.primary + '24' : 'transparent' }]}><Text style={[styles.pickerValueText, { color: item === hour ? colors.primary : colors.foreground }]}>{item % 12 || 12} {item >= 12 ? 'PM' : 'AM'}</Text></Pressable>} /></View><View style={styles.pickerColumn}><Text style={[styles.pickerLabel, { color: colors.mutedForeground }]}>MINUTE</Text><FlatList data={MINUTES} keyExtractor={(value) => value} style={styles.pickerList} renderItem={({ item }) => <Pressable accessibilityRole="radio" accessibilityLabel={`${item} minutes`} accessibilityState={{ selected: item === minute }} onPress={() => setMinute(item)} style={[styles.pickerValue, { backgroundColor: item === minute ? colors.primary + '24' : 'transparent' }]}><Text style={[styles.pickerValueText, { color: item === minute ? colors.primary : colors.foreground }]}>{item}</Text></Pressable>} /></View></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Use ${formatTime(hour, minute)}`} onPress={onConfirm} style={[styles.modalConfirm, { backgroundColor: colors.primary }]}><Text style={[styles.modalConfirmText, { color: colors.primaryForeground }]}>Use this time</Text></Pressable>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: CONTROL.screenHorizontal, paddingBottom: SPACE.lg },
  headerEyebrow: { ...TYPE.eyebrow, fontSize: 11, lineHeight: 15, marginBottom: SPACE.xs },
  headerTitle: { ...TYPE.display },
  headerSub: { ...TYPE.body, marginTop: SPACE.xxs },
  scroll: { paddingHorizontal: CONTROL.screenHorizontal },
  sectionLabel: { ...TYPE.eyebrow, fontSize: 11, lineHeight: 15, marginBottom: SPACE.xs },
  briefingRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderRadius: RADIUS.card, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, marginTop: SPACE.xxs, marginBottom: SPACE.xs, overflow: 'hidden' },
  briefingIcon: { width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
  briefingCopy: { flex: 1, minWidth: 0 },
  briefingTitle: { ...TYPE.bodyStrong },
  briefingBody: { ...TYPE.caption, marginTop: SPACE.hairline, flexShrink: 1 },
  briefingValue: { ...TYPE.metadata, flexShrink: 0 },
  briefingSheet: { maxHeight: '86%', borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACE.lg, paddingTop: SPACE.xs },
  briefingOptionsScroll: { flexShrink: 1, minHeight: 0 },
  briefingOptionsContent: { paddingBottom: SPACE.xs },
  briefingOptionList: { gap: SPACE.xs, marginTop: SPACE.md, paddingBottom: SPACE.xs },
  briefingOption: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderRadius: RADIUS.control, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACE.sm },
  briefingOptionIcon: { width: 34, height: 34, borderRadius: RADIUS.compact, alignItems: 'center', justifyContent: 'center' },
  briefingOptionText: { ...TYPE.bodyStrong, flex: 1 },
  advancedToggle: { alignSelf: 'center', minHeight: CONTROL.minimumTarget, flexDirection: 'row', alignItems: 'center', gap: SPACE.xxs, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.control, borderCurve: 'continuous', paddingHorizontal: SPACE.sm, marginVertical: SPACE.hairline },
  advancedToggleText: { ...TYPE.metadata },
  detailsToggle: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.control, borderCurve: 'continuous', paddingHorizontal: SPACE.sm, paddingVertical: SPACE.sm, marginHorizontal: SPACE.md, marginTop: SPACE.xs },
  detailsStack: { gap: SPACE.xs, paddingTop: SPACE.xxs },
  emptySection: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, padding: SPACE.md, borderRadius: RADIUS.card, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  emptyText: { ...TYPE.body, flex: 1 },
  reflectCard: { borderRadius: RADIUS.card, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  reflectRow: { minHeight: CONTROL.buttonHeight, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, gap: SPACE.sm },
  reflectDot: { width: SPACE.xs, height: SPACE.xs, borderRadius: RADIUS.capsule },
  reflectName: { flex: 1, fontSize: 15, lineHeight: 21, fontFamily: 'Inter_500Medium' },
  doneBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xxs, paddingHorizontal: SPACE.xs, paddingVertical: SPACE.xxs, borderRadius: RADIUS.compact },
  doneBadgeText: { ...TYPE.metadata },
  pendingText: { ...TYPE.caption },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: SPACE.md },
  focusHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: SPACE.sm, marginTop: SPACE.xl, marginBottom: SPACE.sm },
  focusHeadingCopy: { flex: 1, minWidth: 0 },
  focusCaption: { ...TYPE.cardTitle },
  countPill: { flexShrink: 0, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xs, borderRadius: RADIUS.compact, borderWidth: StyleSheet.hairlineWidth },
  itemCount: { ...TYPE.caption, fontFamily: 'Inter_600SemiBold' },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.sm },
  progressTrack: { flex: 1, height: 5, borderRadius: RADIUS.capsule, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: RADIUS.capsule },
  progressLabel: { ...TYPE.metadata, minWidth: 68, textAlign: 'right' },
  emptyFocus: { alignItems: 'center', paddingHorizontal: SPACE.xl, paddingVertical: SPACE.xl, borderRadius: RADIUS.card, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, marginBottom: SPACE.sm, gap: SPACE.xs, overflow: 'hidden' },
  moonCircle: { width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, borderRadius: RADIUS.capsule, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.hairline },
  emptyFocusTitle: { ...TYPE.sectionTitle, textAlign: 'center' },
  emptyFocusBody: { ...TYPE.body, textAlign: 'center' },
  planItem: { flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.card, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, paddingRight: SPACE.sm, paddingVertical: SPACE.sm, marginBottom: SPACE.xs, gap: SPACE.xs, overflow: 'hidden' },
  planBar: { width: SPACE.xxs, alignSelf: 'stretch' },
  planCheck: { width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, alignItems: 'center', justifyContent: 'center' },
  planCheckCircle: { width: 26, height: 26, borderRadius: RADIUS.capsule, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  planTextBlock: { flex: 1, gap: SPACE.xxs },
  planMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: SPACE.xs },
  planTime: { ...TYPE.metadata, letterSpacing: 0.7 },
  linkBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xxs, paddingHorizontal: SPACE.xs, paddingVertical: SPACE.xxs, borderRadius: RADIUS.compact },
  linkBadgeText: { ...TYPE.metadata },
  priorityBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xxs, paddingHorizontal: SPACE.xs, paddingVertical: SPACE.xxs, borderRadius: RADIUS.compact },
  priorityBadgeText: { ...TYPE.metadata, letterSpacing: 0.6 },
  tomorrowBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xxs, paddingHorizontal: SPACE.xs, paddingVertical: SPACE.xxs, borderRadius: RADIUS.compact },
  tomorrowBadgeText: { ...TYPE.metadata, letterSpacing: 0.6 },
  planText: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_500Medium' },
  moreButton: { width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, alignItems: 'center', justifyContent: 'center' },
  addCard: { borderRadius: RADIUS.card, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, marginTop: SPACE.xxs, overflow: 'hidden' },
  addTrigger: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, padding: SPACE.md },
  addIcon: { width: 36, height: 36, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
  addCopy: { flex: 1 },
  addTriggerText: { ...TYPE.cardTitle },
  addTriggerSub: { ...TYPE.caption, marginTop: SPACE.hairline },
  input: { fontSize: 16, lineHeight: 22, fontFamily: 'Inter_400Regular', padding: SPACE.md, paddingBottom: SPACE.sm },
  composerMeta: { gap: SPACE.xs, paddingBottom: SPACE.xxs },
  metaLabel: { ...TYPE.eyebrow, fontSize: 11, lineHeight: 15, paddingHorizontal: SPACE.md, marginTop: SPACE.hairline },
  chainHelper: { ...TYPE.metadata, fontFamily: 'Inter_400Regular', paddingHorizontal: SPACE.md, marginTop: -SPACE.hairline },
  timeSlots: { paddingLeft: SPACE.md, paddingRight: SPACE.xl, paddingTop: SPACE.xxs, gap: SPACE.xs, paddingBottom: SPACE.xs },
  timeChip: { minHeight: CONTROL.minimumTarget, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, paddingHorizontal: SPACE.sm, borderRadius: RADIUS.control, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth },
  timeChipText: { ...TYPE.caption, fontFamily: 'Inter_500Medium' },
  chainChoices: { paddingHorizontal: SPACE.md, gap: SPACE.xs, paddingBottom: SPACE.xs },
  chainChip: { minHeight: CONTROL.minimumTarget, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, paddingHorizontal: SPACE.sm, borderRadius: RADIUS.control, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth },
  chainChipDot: { width: SPACE.xs, height: SPACE.xs, borderRadius: RADIUS.capsule },
  chainChipText: { ...TYPE.caption, fontFamily: 'Inter_500Medium' },
  priorityPick: { minHeight: CONTROL.buttonHeight, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.control, borderCurve: 'continuous', padding: SPACE.sm, marginHorizontal: SPACE.md, marginBottom: SPACE.xxs },
  priorityIcon: { width: 32, height: 32, borderRadius: RADIUS.compact, alignItems: 'center', justifyContent: 'center' },
  priorityCopy: { flex: 1 },
  priorityTitle: { ...TYPE.bodyStrong },
  priorityBody: { ...TYPE.metadata, fontFamily: 'Inter_400Regular', marginTop: 1 },
  addActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: SPACE.xs, paddingHorizontal: SPACE.sm, paddingBottom: SPACE.sm, paddingTop: SPACE.xxs },
  cancelBtn: { minHeight: CONTROL.minimumTarget, justifyContent: 'center', paddingHorizontal: SPACE.sm },
  cancelText: { ...TYPE.body, fontFamily: 'Inter_500Medium' },
  addConfirmBtn: { minHeight: CONTROL.minimumTarget, justifyContent: 'center', paddingHorizontal: SPACE.md, borderRadius: RADIUS.button, borderCurve: 'continuous' },
  addConfirmText: { ...TYPE.bodyStrong },
  modalShade: { flex: 1, justifyContent: 'flex-end', backgroundColor: SCRIM },
  modalCard: { borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, padding: SPACE.lg, paddingBottom: SPACE.xxl, maxHeight: '78%' },
  modalHeader: { minHeight: CONTROL.minimumTarget, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalClose: { width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { ...TYPE.modalTitle, fontSize: 20, lineHeight: 26 },
  timePreview: { ...TYPE.display, textAlign: 'center', marginVertical: SPACE.md },
  pickerColumns: { flexDirection: 'row', gap: SPACE.sm, height: 220, minHeight: 120, flexShrink: 1 },
  pickerColumn: { flex: 1 },
  pickerLabel: { ...TYPE.metadata, letterSpacing: 1, textAlign: 'center', marginBottom: SPACE.xs },
  pickerList: { flex: 1 },
  pickerValue: { minHeight: CONTROL.minimumTarget, borderRadius: RADIUS.compact, justifyContent: 'center', alignItems: 'center', marginBottom: SPACE.xxs },
  pickerValueText: { ...TYPE.bodyStrong },
  modalConfirm: { minHeight: CONTROL.buttonHeight, borderRadius: RADIUS.button, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', marginTop: SPACE.md },
  modalConfirmText: { ...TYPE.bodyStrong },
  sheetHandle: { width: 36, height: 5, borderRadius: RADIUS.capsule, alignSelf: 'center', marginBottom: SPACE.xs },
  taskDetailsSheet: { maxHeight: '86%', borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACE.lg, paddingTop: SPACE.xs },
  taskDetailsHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  taskDetailsHeaderCopy: { flex: 1, minWidth: 0 },
  taskDetailsIntro: { ...TYPE.caption, marginTop: SPACE.xxs },
  taskDetailsScroll: { flexShrink: 1, minHeight: 0 },
  taskDetailsContent: { paddingTop: SPACE.xs, paddingBottom: SPACE.md },
  taskDetailRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACE.xxs, paddingVertical: SPACE.sm },
  taskDetailIcon: { width: 36, height: 36, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
  taskDetailCopy: { flex: 1, minWidth: 0 },
  taskDetailTitle: { ...TYPE.bodyStrong },
  taskDetailSummary: { ...TYPE.caption, marginTop: SPACE.xxs },
  taskDetailSetDot: { width: 6, height: 6, borderRadius: RADIUS.capsule },
  taskDetailChips: { gap: SPACE.xs, paddingHorizontal: SPACE.xxs, paddingVertical: SPACE.sm },
  sevenChoiceWrap: { paddingVertical: SPACE.sm },
  detailChip: { minHeight: CONTROL.minimumTarget, justifyContent: 'center', borderRadius: RADIUS.control, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACE.sm },
  detailChipText: { ...TYPE.caption, fontFamily: 'Inter_600SemiBold' },
  colorChoice: { minWidth: CONTROL.minimumTarget, height: CONTROL.minimumTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.xs, borderRadius: RADIUS.control, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACE.sm },
  colorChoiceDot: { width: 20, height: 20, borderRadius: RADIUS.capsule },
  colorChoiceText: { ...TYPE.caption, fontFamily: 'Inter_600SemiBold' },
  taskDetailsDone: { minHeight: CONTROL.buttonHeight, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.button, borderCurve: 'continuous', marginTop: SPACE.xs },
  taskDetailsDoneText: { ...TYPE.bodyStrong },
  reminderNotice: { ...TYPE.metadata, fontFamily: 'Inter_400Regular', paddingHorizontal: SPACE.md, paddingBottom: SPACE.xxs },
  reviewTrigger: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderRadius: RADIUS.card, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, padding: SPACE.md, marginTop: SPACE.xxs, marginBottom: SPACE.xs },
  reviewIcon: { width: 36, height: 36, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
  reviewCopy: { flex: 1 },
  reviewTitle: { ...TYPE.cardTitle },
  reviewSubtitle: { ...TYPE.caption, marginTop: SPACE.hairline },
  reviewModal: { borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, padding: SPACE.lg, paddingBottom: SPACE.xxl, maxHeight: '78%' },
  reviewModalIcon: { width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.sm },
  reviewModalTitle: { ...TYPE.modalTitle },
  reviewModalBody: { ...TYPE.body, marginTop: SPACE.xs, marginBottom: SPACE.md },
  reviewList: { maxHeight: 260 },
  reviewDot: { width: SPACE.xs, height: SPACE.xs, borderRadius: RADIUS.capsule },
  reviewItemCopy: { flex: 1 },
  reviewItemText: { ...TYPE.bodyStrong },
  reviewItemTime: { ...TYPE.metadata, fontFamily: 'Inter_400Regular', marginTop: SPACE.hairline },
  reviewMove: { minHeight: CONTROL.minimumTarget, borderRadius: RADIUS.compact, justifyContent: 'center', paddingHorizontal: SPACE.sm },
  reviewMoveText: { ...TYPE.caption, fontFamily: 'Inter_600SemiBold' },
  reviewLetGo: { width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, alignItems: 'center', justifyContent: 'center' },
  reviewDone: { minHeight: CONTROL.buttonHeight, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.button, borderCurve: 'continuous', marginTop: SPACE.md },
  reviewDoneText: { ...TYPE.bodyStrong },
  reviewAllClear: { ...TYPE.bodyStrong, marginVertical: SPACE.md },
  reviewLater: { minHeight: CONTROL.minimumTarget, alignItems: 'center', justifyContent: 'center', marginTop: SPACE.xxs },
  reviewLaterText: { ...TYPE.body, fontFamily: 'Inter_500Medium' },
  tomorrowSet: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderRadius: RADIUS.card, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, padding: SPACE.md, marginTop: SPACE.md },
  tomorrowSetIcon: { width: 36, height: 36, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
  tomorrowSetCopy: { flex: 1 },
  tomorrowSetTitle: { ...TYPE.cardTitle },
  tomorrowSetBody: { ...TYPE.caption, marginTop: SPACE.xxs },
  reviewRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, borderTopWidth: StyleSheet.hairlineWidth },
});

const completionStyles = StyleSheet.create({
  shade: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: SCRIM, padding: SPACE.xl },
  card: { width: '100%', maxWidth: 340, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.modal, borderCurve: 'continuous', padding: SPACE.xl },
  icon: { width: 64, height: 64, borderRadius: RADIUS.capsule, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.md },
  title: { ...TYPE.modalTitle, textAlign: 'center' },
  body: { ...TYPE.body, marginTop: SPACE.xs },
  primaryButton: { minHeight: CONTROL.buttonHeight, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.button, borderCurve: 'continuous', marginTop: SPACE.xl },
  primaryText: { ...TYPE.bodyStrong },
  secondaryButton: { minHeight: CONTROL.minimumTarget, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.md },
  secondaryText: { ...TYPE.body, fontFamily: 'Inter_500Medium' },
});

const modeStyles = StyleSheet.create({
  card: { minHeight: 64, flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.card, borderCurve: 'continuous', padding: SPACE.md, marginTop: SPACE.xxs, marginBottom: SPACE.xs, gap: SPACE.sm },
  icon: { width: 36, height: 36, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  title: { ...TYPE.cardTitle },
  subtitle: { ...TYPE.caption, marginTop: SPACE.hairline },
});
