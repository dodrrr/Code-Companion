import React, { useEffect, useRef, useState } from 'react';
import {
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
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { EXTRA_CHAIN_COLORS } from '@/constants/colors';
import { Chain, getTodayStr, isRestDay, useChains } from '@/context/ChainsContext';
import { PlanItem, usePlan } from '@/context/PlanContext';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { cancelPlanReminder, getPlanNotificationPermission, requestPlanNotificationPermission, scheduleMorningBriefing, schedulePlanEndAlert, schedulePlanReminder } from '@/lib/planNotifications';

const QUICK_TIMES = ['7 AM', '9 AM', '12 PM', '3 PM', '6 PM', '8 PM'];
const HOURS = Array.from({ length: 18 }, (_, index) => index + 6);
const MINUTES = ['00', '05', '10', '15', '20', '30', '40', '45', '50', '55'];
const REMINDER_OPTIONS = [5, 15, 30, 60];
const DURATION_OPTIONS = [30, 60, 90, 120, 180, 240];
const UNLINKED_TASK_COLOR = '#8FA2B3';
const TASK_ACCENTS = ['#8FA2B3', ...EXTRA_CHAIN_COLORS];
const MORNING_BRIEFING_KEY = '@chain_morning_briefing';

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

export default function PlanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { chains, setDayStatus } = useChains();
  const { items, activeDate, isToday, isActiveDayClosed, tomorrowItemCount, showToday, showTomorrow, showDate, closeToday, reopenToday, addItem, updateItem, updateReminderMetadata, updateEndAlertMetadata, updateReminderForDate, moveItemToTomorrow, copyItemToTomorrow, removeItem, toggleItem } = usePlan();
  const { taskId, planDate } = useLocalSearchParams<{ taskId?: string; planDate?: string }>();
  const [inputText, setInputText] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedChainId, setSelectedChainId] = useState<string | undefined>();
  const [selectedTaskColor, setSelectedTaskColor] = useState<string | undefined>();
  const [selectedReminder, setSelectedReminder] = useState<number | undefined>();
  const [selectedRepeatDays, setSelectedRepeatDays] = useState<number[]>([]);
  const [selectedDuration, setSelectedDuration] = useState<number | undefined>();
  const [endAlert, setEndAlert] = useState(false);
  const [isPriority, setIsPriority] = useState(false);
  const [reminderNotice, setReminderNotice] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [briefingHour, setBriefingHour] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<PlanItem | null>(null);
  const [showCompletion, setShowCompletion] = useState(false);
  const [showReminderPermission, setShowReminderPermission] = useState(false);
  const [showDayReview, setShowDayReview] = useState(false);
  const [chainCompletion, setChainCompletion] = useState<{ item: PlanItem; chain: Chain; finishesAgenda: boolean } | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | undefined>();
  const [newlyAddedItemId, setNewlyAddedItemId] = useState<string | undefined>();
  const [taskMenuItem, setTaskMenuItem] = useState<PlanItem | null>(null);
  const [pickerHour, setPickerHour] = useState(9);
  const [pickerMinute, setPickerMinute] = useState('00');
  const inputRef = useRef<TextInput>(null);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 84 : insets.bottom;
  const today = getTodayStr();
  const completedCount = items.filter((item) => item.completed).length;
  const protectedChains = chains.filter((chain) => isRestDay(chain, today) || chain.completedDates.includes(today)).length;
  const progressFill = items.length ? completedCount / items.length : 0;
  const selectedChain = chains.find((chain) => chain.id === selectedChainId);
  const priorityItem = items.find((item) => item.isPriority);
  const orderedItems = [...items].sort((a, b) => timeSortValue(a.timeSlot) - timeSortValue(b.timeSlot));
  const hasPendingItems = items.some((item) => !item.completed);
  const plannedFocusMinutes = items.reduce((total, item) => total + (item.durationMinutes || 0), 0);
  const reminderCount = items.filter((item) => item.reminderMinutes || item.endAlert).length;
  const canEditActivePlan = !isToday || !isActiveDayClosed;

  useEffect(() => { void AsyncStorage.getItem(MORNING_BRIEFING_KEY).then((raw) => { try { const value = raw ? JSON.parse(raw) : null; if (typeof value?.hour === 'number') setBriefingHour(value.hour); } catch {} }); }, []);

  async function setMorningBriefing(hour: number) {
    if (await getPlanNotificationPermission() === 'undetermined') await requestPlanNotificationPermission();
    const result = await scheduleMorningBriefing(hour);
    if (result.status === 'scheduled') { await AsyncStorage.setItem(MORNING_BRIEFING_KEY, JSON.stringify({ hour, notificationId: result.notificationId })); setBriefingHour(hour); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
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
    setEndAlert(false);
    setIsPriority(false);
    setReminderNotice('');
    setShowInput(false);
    setShowAdvancedOptions(false);
    setEditingItem(null);
  }

  function savePlanItem(scheduleReminder: boolean) {
    if (!inputText.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const options = {
      text: inputText,
      timeSlot: selectedTime,
      chainId: selectedChain?.id,
      color: selectedChain?.color ?? selectedTaskColor,
      reminderMinutes: selectedTime ? selectedReminder : undefined,
      isPriority,
      repeatDays: selectedRepeatDays,
      durationMinutes: selectedDuration,
      endAlert: selectedDuration ? endAlert : false,
    };
    const isEditing = Boolean(editingItem);
    const item = isEditing ? updateItem(editingItem!.id, options) : addItem(options);
    if (!item) return;
    if (editingItem?.notificationId) void cancelPlanReminder(editingItem.notificationId);
    if (editingItem?.endNotificationId) void cancelPlanReminder(editingItem.endNotificationId);
    if (scheduleReminder && selectedTime && selectedReminder) {
      void schedulePlanReminder(item, selectedReminder).then((result) => {
        if (result.status === 'scheduled') updateReminderMetadata(item.id, selectedReminder, result.notificationId);
        if (result.status === 'denied') setReminderNotice('Notifications are off. You can enable them in iPhone Settings.');
      });
    }
    if (scheduleReminder && selectedTime && selectedDuration && endAlert) {
      void schedulePlanEndAlert(item).then((result) => {
        if (result.status === 'scheduled') updateEndAlertMetadata(item.id, true, result.notificationId);
        if (result.status === 'denied') setReminderNotice('Notifications are off. You can enable them in iPhone Settings.');
      });
    }
    resetComposer();
    if (!isEditing) {
      setNewlyAddedItemId(item.id);
      setTimeout(() => setNewlyAddedItemId((current) => current === item.id ? undefined : current), 900);
    }
  }

  async function handleAdd() {
    if (!inputText.trim()) return;
    if (selectedTime && (selectedReminder || (selectedDuration && endAlert))) {
      const permission = await getPlanNotificationPermission();
      if (permission === 'undetermined') {
        setShowReminderPermission(true);
        return;
      }
      if (permission !== 'granted') {
        setReminderNotice('Notifications are off. You can enable them in iPhone Settings.');
        savePlanItem(false);
        return;
      }
    }
    savePlanItem(Boolean(selectedTime && (selectedReminder || (selectedDuration && endAlert))));
  }

  async function enableRemindersAndSave() {
    setShowReminderPermission(false);
    const permission = await requestPlanNotificationPermission();
    if (permission === 'granted') {
      savePlanItem(true);
      return;
    }
    setReminderNotice('No reminder was added. You can enable notifications later in iPhone Settings.');
    savePlanItem(false);
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
    setEndAlert(item.endAlert === true);
    setShowInput(true);
    setShowAdvancedOptions(Boolean(item.repeatDays?.length || item.durationMinutes || item.reminderMinutes || (!item.chainId && item.color)));
  }

  function handleToggle(item: PlanItem) {
    // Tomorrow is for planning. Tasks only become actionable once their day starts.
    if (!isToday || isActiveDayClosed) return;
    const isLastTask = !item.completed && items.length > 0 && completedCount + 1 === items.length;
    Haptics.impactAsync(isLastTask ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    toggleItem(item.id);
    const linkedChain = item.chainId ? chains.find((chain) => chain.id === item.chainId) : undefined;
    const needsChainConfirmation = !item.completed && isToday && linkedChain && !linkedChain.completedDates.includes(today);
    if (needsChainConfirmation && linkedChain) {
      setChainCompletion({ item, chain: linkedChain, finishesAgenda: isLastTask });
    } else if (isLastTask) {
      setShowCompletion(true);
    }
  }

  async function moveToTomorrow(item: PlanItem) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void cancelPlanReminder(item.notificationId);
    await moveItemToTomorrow(item.id);
  }

  function letGo(item: PlanItem) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void cancelPlanReminder(item.notificationId);
    removeItem(item.id);
  }

  async function copyToTomorrow(item: PlanItem) {
    setTaskMenuItem(null);
    const copied = await copyItemToTomorrow(item.id);
    if (!copied) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (copied.timeSlot && copied.reminderMinutes) {
      const result = await schedulePlanReminder(copied, copied.reminderMinutes);
      if (result.status === 'scheduled') {
        await updateReminderForDate(copied.id, copied.planDate, copied.reminderMinutes, result.notificationId);
      }
    }
    if (copied.timeSlot && copied.durationMinutes && copied.endAlert) {
      const result = await schedulePlanEndAlert(copied);
      if (result.status === 'scheduled') updateEndAlertMetadata(copied.id, true, result.notificationId);
    }
  }

  function completeLinkedChain() {
    if (!chainCompletion) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const remainingChainsAreDone = chains
      .filter((chain) => chain.id !== chainCompletion.chain.id)
      .every((chain) => isRestDay(chain, today) || chain.completedDates.includes(today));
    const shouldCelebrate = chainCompletion.finishesAgenda && remainingChainsAreDone;
    setDayStatus(chainCompletion.chain.id, today, 'done');
    setChainCompletion(null);
    if (shouldCelebrate) setShowCompletion(true);
  }

  function chooseCustomTime() {
    setSelectedTime(formatTime(pickerHour, pickerMinute));
    setShowTimePicker(false);
    Haptics.selectionAsync();
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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={[styles.headerEyebrow, { color: colors.primary }]}>{isToday ? 'ONE THING AT A TIME' : 'MAKE TOMORROW LIGHTER'}</Text>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{isToday ? "Today's Plan" : "Tonight's Plan"}</Text>
        <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{getPlanLabel(activeDate)}</Text>
      </View>

      <KeyboardAwareScrollViewCompat
        bottomOffset={24}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: botPad + 100 }]}
      >
        {isToday && <><Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TODAY'S CHAINS</Text>
        {chains.length === 0 ? (
          <View style={[styles.emptySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="link-outline" size={22} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Add a chain first to bring its color into your plan.</Text>
          </View>
        ) : (
          <View style={[styles.reflectCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {chains.map((chain, index) => {
              const done = chain.completedDates.includes(today);
              return <ChainReflection key={chain.id} chain={chain} done={done} resting={isRestDay(chain, today)} isLast={index === chains.length - 1} />;
            })}
          </View>
        )}</>}

        {!isToday && items.length > 0 && (
          <View style={[styles.tomorrowSet, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '55' }]}>
            <View style={[styles.tomorrowSetIcon, { backgroundColor: colors.primary + '22' }]}><Ionicons name="moon" size={20} color={colors.primary} /></View>
            <View style={styles.tomorrowSetCopy}><Text style={[styles.tomorrowSetTitle, { color: colors.foreground }]}>Tomorrow is set</Text><Text style={[styles.tomorrowSetBody, { color: colors.mutedForeground }]}>{items.length} tasks{plannedFocusMinutes ? ` · ${formatDurationLabel(plannedFocusMinutes)} of focus` : ''}{reminderCount ? ` · ${reminderCount === 1 ? 'reminder' : 'reminders'} ready` : ''} · {priorityItem ? `One thing: ${priorityItem.text}` : 'Choose one thing that matters most.'}</Text></View>
          </View>
        )}

        {isToday && <View style={[styles.briefingCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.briefingIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name="sunny-outline" size={18} color={colors.primary} /></View><View style={styles.briefingCopy}><Text style={[styles.briefingTitle, { color: colors.foreground }]}>Morning briefing</Text><Text style={[styles.briefingBody, { color: colors.mutedForeground }]}>{briefingHour === null ? 'A gentle nudge to open your day.' : `Daily at ${briefingHour % 12 || 12} ${briefingHour >= 12 ? 'PM' : 'AM'}`}</Text></View><View style={styles.briefingChoices}>{[7, 8, 9].map((hour) => <Pressable key={hour} onPress={() => { void setMorningBriefing(hour); }} style={[styles.briefingHour, { backgroundColor: briefingHour === hour ? colors.primary : colors.background, borderColor: briefingHour === hour ? colors.primary : colors.border }]}><Text style={[styles.briefingHourText, { color: briefingHour === hour ? '#fff' : colors.mutedForeground }]}>{hour}</Text></Pressable>)}</View></View>}

        <View style={styles.focusHeading}>
          <View>
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
            <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>{completedCount === items.length ? 'Ready' : `${completedCount}/${items.length} complete`}</Text>
          </View>
        )}

        {orderedItems.map((item, index) => (
          <PlanItemRow
            key={item.id}
            item={item}
            chainName={chains.find((chain) => chain.id === item.chainId)?.name}
            highlighted={item.id === highlightedItemId}
            newlyAdded={item.id === newlyAddedItemId}
            isLast={index === orderedItems.length - 1}
            locked={!canEditActivePlan}
            completionLocked={!isToday || isActiveDayClosed}
            onToggle={() => handleToggle(item)}
            onRemove={() => { void cancelPlanReminder(item.notificationId); removeItem(item.id); }}
            onEdit={() => startEditing(item)}
            onMore={() => setTaskMenuItem(item)}
          />
        ))}

        {items.length === 0 && (
          <View style={[styles.emptyFocus, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.moonCircle, { backgroundColor: colors.primary + '18' }]}><Ionicons name="moon" size={22} color={colors.primary} /></View>
            <Text style={[styles.emptyFocusTitle, { color: colors.foreground }]}>{isToday ? 'Your day is clear.' : 'A calm start begins tonight.'}</Text>
            <Text style={[styles.emptyFocusBody, { color: colors.mutedForeground }]}>{isToday ? 'There are no unfinished tasks waiting for you.' : 'Choose what deserves space tomorrow, then let the plan hold the rest.'}</Text>
          </View>
        )}

        {(!isToday || isActiveDayClosed || !hasPendingItems) && <Pressable
          onPress={isToday ? continueToTomorrow : showToday}
          style={({ pressed }) => [modeStyles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
        >
          <View style={[modeStyles.icon, { backgroundColor: colors.primary + '18' }]}><Ionicons name={isToday ? 'arrow-forward' : 'arrow-back'} size={17} color={colors.primary} /></View>
          <View style={modeStyles.copy}><Text style={[modeStyles.title, { color: colors.foreground }]}>{isToday ? (tomorrowItemCount > 0 ? `Tomorrow ready · ${tomorrowItemCount} task${tomorrowItemCount === 1 ? '' : 's'}` : 'Prepare tomorrow') : 'Back to today'}</Text><Text style={[modeStyles.subtitle, { color: colors.mutedForeground }]}>{isToday ? (tomorrowItemCount > 0 ? 'Review it or make space for one more thing.' : 'Set up tomorrow in a minute.') : 'Return to your active agenda.'}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>}

        {isToday && !isActiveDayClosed && hasPendingItems && (
          <Pressable onPress={() => setShowDayReview(true)} style={({ pressed }) => [styles.reviewTrigger, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}>
            <View style={[styles.reviewIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name="moon-outline" size={18} color={colors.primary} /></View>
            <View style={styles.reviewCopy}><Text style={[styles.reviewTitle, { color: colors.foreground }]}>Nightly reset</Text><Text style={[styles.reviewSubtitle, { color: colors.mutedForeground }]}>Close today, then prepare tomorrow.</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
          </Pressable>
        )}

        {canEditActivePlan ? <View style={[styles.addCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
                  setSelectedTime={(time: string) => { setSelectedTime(time); Keyboard.dismiss(); }}
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
                  endAlert={endAlert}
                  setEndAlert={setEndAlert}
                  showAdvancedOptions={showAdvancedOptions}
                  setShowAdvancedOptions={setShowAdvancedOptions}
                />
                {!!reminderNotice && <Text style={[styles.reminderNotice, { color: colors.mutedForeground }]}>{reminderNotice}</Text>}
                <View style={styles.addActions}>
                  <Pressable onPress={resetComposer} style={styles.cancelBtn}><Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text></Pressable>
                  <Pressable onPress={handleAdd} style={({ pressed }) => [styles.addConfirmBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}>
                    <Text style={styles.addConfirmText}>{editingItem ? 'Save changes' : 'Add to plan'}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Pressable onPress={() => setShowInput(true)} style={styles.addTrigger}>
                <View style={[styles.addIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name="add" size={20} color={colors.primary} /></View>
                <View style={styles.addCopy}><Text style={[styles.addTriggerText, { color: colors.foreground }]}>Add task</Text><Text style={[styles.addTriggerSub, { color: colors.mutedForeground }]}>{isToday ? 'Add it to today' : 'Set a time or link a chain'}</Text></View>
                <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
              </Pressable>
            )}
          </View> : <Pressable onPress={() => { void reopenToday(); Haptics.selectionAsync(); }} style={({ pressed }) => [modeStyles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}>
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
      <CompletionMoment visible={showCompletion} onClose={() => setShowCompletion(false)} onPrepareTomorrow={() => { setShowCompletion(false); void closeToday().then(showTomorrow); }} />
      <ReminderPermissionMoment visible={showReminderPermission} minutes={selectedReminder} onSkip={() => { setShowReminderPermission(false); savePlanItem(false); }} onAllow={() => { void enableRemindersAndSave(); }} />
      <DayReviewMoment visible={showDayReview} completedCount={completedCount} totalCount={items.length} protectedChains={protectedChains} chainCount={chains.length} pendingItems={items.filter((item) => !item.completed)} onMove={(item) => { void moveToTomorrow(item); }} onLetGo={letGo} onClose={() => setShowDayReview(false)} onPrepareTomorrow={finishDayAndPrepareTomorrow} />
      <ChainCompletionMoment visible={!!chainCompletion} item={chainCompletion?.item} chain={chainCompletion?.chain} onConfirm={completeLinkedChain} onClose={() => setChainCompletion(null)} />
      <TaskMenuMoment
        item={taskMenuItem}
        showCopy={isToday}
        showFocus={isToday && !isActiveDayClosed && !!taskMenuItem?.durationMinutes && !taskMenuItem.completed}
        onClose={() => setTaskMenuItem(null)}
        onFocus={() => { if (taskMenuItem) router.push({ pathname: '/focus/[id]', params: { id: taskMenuItem.id } }); setTaskMenuItem(null); }}
        onCopy={() => { if (taskMenuItem) void copyToTomorrow(taskMenuItem); }}
        onEdit={() => { if (taskMenuItem) startEditing(taskMenuItem); setTaskMenuItem(null); }}
        onDelete={() => { if (taskMenuItem) { void cancelPlanReminder(taskMenuItem.notificationId); removeItem(taskMenuItem.id); } setTaskMenuItem(null); }}
      />
    </View>
  );
}

function ChainReflection({ chain, done, resting, isLast }: { chain: Chain; done: boolean; resting: boolean; isLast: boolean }) {
  const colors = useColors();
  return <View>
    <View style={styles.reflectRow}>
      <View style={[styles.reflectDot, { backgroundColor: chain.color }]} />
      <Text style={[styles.reflectName, { color: colors.foreground }]} numberOfLines={1}>{chain.name}</Text>
      {done ? <View style={[styles.doneBadge, { backgroundColor: chain.color + '20' }]}><Ionicons name="checkmark" size={12} color={chain.color} /><Text style={[styles.doneBadgeText, { color: chain.color }]}>done today</Text></View> : resting ? <View style={[styles.doneBadge, { backgroundColor: colors.mutedForeground + '18' }]}><Ionicons name="moon-outline" size={12} color={colors.mutedForeground} /><Text style={[styles.doneBadgeText, { color: colors.mutedForeground }]}>rest day</Text></View> : <Text style={[styles.pendingText, { color: colors.mutedForeground }]}>pending</Text>}
    </View>
    {!isLast && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
  </View>;
}

function ComposerMeta({ colors, chains, selectedChainId, setSelectedChainId, selectedTaskColor, setSelectedTaskColor, selectedTime, setSelectedTime, openTimePicker, selectedReminder, setSelectedReminder, allowPriority, priorityForToday, isPriority, setIsPriority, repeatDays, setRepeatDays, selectedDuration, setSelectedDuration, endAlert, setEndAlert, showAdvancedOptions, setShowAdvancedOptions }: any) {
  return <View style={styles.composerMeta}>
    <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>TIME</Text>
    <FlatList data={QUICK_TIMES} horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} keyExtractor={(time) => time} contentContainerStyle={styles.timeSlots} renderItem={({ item: time }) => <Pressable onPress={() => setSelectedTime(time === selectedTime ? '' : time)} style={[styles.timeChip, { backgroundColor: time === selectedTime ? colors.primary : colors.background, borderColor: time === selectedTime ? colors.primary : colors.border }]}><Text style={[styles.timeChipText, { color: time === selectedTime ? '#fff' : colors.mutedForeground }]}>{time}</Text></Pressable>} ListFooterComponent={<Pressable onPress={openTimePicker} style={[styles.timeChip, { backgroundColor: selectedTime && !QUICK_TIMES.includes(selectedTime) ? colors.primary : colors.background, borderColor: selectedTime && !QUICK_TIMES.includes(selectedTime) ? colors.primary : colors.border }]}><Ionicons name="time-outline" size={14} color={selectedTime && !QUICK_TIMES.includes(selectedTime) ? '#fff' : colors.mutedForeground} /><Text style={[styles.timeChipText, { color: selectedTime && !QUICK_TIMES.includes(selectedTime) ? '#fff' : colors.mutedForeground }]}>{selectedTime && !QUICK_TIMES.includes(selectedTime) ? selectedTime : 'Custom'}</Text></Pressable>} />
    <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>ADD TO A CHAIN · OPTIONAL</Text>
    <Text style={[styles.chainHelper, { color: colors.mutedForeground }]}>Only link tasks that move that chain forward. Unlinked tasks stay neutral.</Text>
    <FlatList data={[{ id: '', name: 'No chain', color: colors.mutedForeground }, ...chains]} horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} keyExtractor={(chain) => chain.id} contentContainerStyle={styles.chainChoices} renderItem={({ item: chain }) => { const selected = (chain.id || undefined) === selectedChainId; return <Pressable onPress={() => setSelectedChainId(chain.id || undefined)} style={[styles.chainChip, { borderColor: selected ? chain.color : colors.border, backgroundColor: selected ? chain.color + '1F' : colors.background }]}><View style={[styles.chainChipDot, { backgroundColor: chain.color }]} /><Text style={[styles.chainChipText, { color: selected ? colors.foreground : colors.mutedForeground }]}>{chain.name}</Text></Pressable>; }} />
    {showAdvancedOptions && !selectedChainId && <><Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>TASK ACCENT · OPTIONAL</Text><FlatList data={[undefined, ...TASK_ACCENTS]} horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} keyExtractor={(color, index) => color ?? `neutral-${index}`} contentContainerStyle={styles.chainChoices} renderItem={({ item: color }) => { const selected = color === selectedTaskColor; return <Pressable onPress={() => setSelectedTaskColor(selected ? undefined : color)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32, paddingHorizontal: 9, borderRadius: 16, borderWidth: 1, borderColor: selected ? (color ?? colors.mutedForeground) : colors.border, backgroundColor: selected ? (color ?? colors.mutedForeground) + '1C' : colors.background }}>{color ? <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: color }} /> : <><Ionicons name="remove-outline" size={14} color={colors.mutedForeground} /><Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_500Medium' }}>Neutral</Text></>}</Pressable>; }} /></>}
    {allowPriority && <><Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>{priorityForToday ? 'TODAY\'S ONE THING · OPTIONAL' : 'TOMORROW\'S ONE THING · OPTIONAL'}</Text><Pressable onPress={() => setIsPriority(!isPriority)} style={[styles.priorityPick, { borderColor: isPriority ? colors.primary : colors.border, backgroundColor: isPriority ? colors.primary + '1A' : colors.background }]}><View style={[styles.priorityIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name="sparkles-outline" size={15} color={colors.primary} /></View><View style={styles.priorityCopy}><Text style={[styles.priorityTitle, { color: colors.foreground }]}>Make this your one thing</Text><Text style={[styles.priorityBody, { color: colors.mutedForeground }]}>The task that matters most {priorityForToday ? 'today' : 'tomorrow'}.</Text></View>{isPriority && <Ionicons name="checkmark-circle" size={19} color={colors.primary} />}</Pressable></>}
    <Pressable onPress={() => setShowAdvancedOptions(!showAdvancedOptions)} style={[styles.advancedToggle, { borderColor: colors.border }]}><Text style={[styles.advancedToggleText, { color: colors.mutedForeground }]}>{showAdvancedOptions ? 'Fewer options' : 'More options'}</Text><Ionicons name={showAdvancedOptions ? 'chevron-up' : 'chevron-down'} size={14} color={colors.mutedForeground} /></Pressable>
    {showAdvancedOptions && <><Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>REPEAT · OPTIONAL</Text>
    <Text style={[styles.chainHelper, { color: colors.mutedForeground }]}>It will appear automatically on these days when you prepare tomorrow.</Text>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 }}>{[{ label: 'M', value: 1 }, { label: 'T', value: 2 }, { label: 'W', value: 3 }, { label: 'T', value: 4 }, { label: 'F', value: 5 }, { label: 'S', value: 6 }, { label: 'S', value: 0 }].map(({ label, value }) => { const selected = repeatDays.includes(value); return <Pressable key={value} onPress={() => setRepeatDays(selected ? repeatDays.filter((day: number) => day !== value) : [...repeatDays, value])} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.primary : colors.background, borderColor: selected ? colors.primary : colors.border }}><Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: selected ? '#fff' : colors.mutedForeground }}>{label}</Text></Pressable>; })}</View>
    {!!selectedTime && <><Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>FOCUS BLOCK · OPTIONAL</Text><FlatList data={DURATION_OPTIONS} horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} keyExtractor={(minutes) => String(minutes)} contentContainerStyle={styles.chainChoices} renderItem={({ item: minutes }) => { const selected = selectedDuration === minutes; return <Pressable onPress={() => { setSelectedDuration(selected ? undefined : minutes); if (selected) setEndAlert(false); }} style={[styles.chainChip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary + '1F' : colors.background }]}><Ionicons name="hourglass-outline" size={13} color={selected ? colors.primary : colors.mutedForeground} /><Text style={[styles.chainChipText, { color: selected ? colors.foreground : colors.mutedForeground }]}>{formatDurationLabel(minutes)}</Text></Pressable>; }} />{selectedDuration && <Pressable onPress={() => setEndAlert(!endAlert)} style={[styles.priorityPick, { borderColor: endAlert ? colors.primary : colors.border, backgroundColor: endAlert ? colors.primary + '1A' : colors.background }]}><View style={[styles.priorityIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name="alarm-outline" size={15} color={colors.primary} /></View><View style={styles.priorityCopy}><Text style={[styles.priorityTitle, { color: colors.foreground }]}>Alert me when it ends</Text><Text style={[styles.priorityBody, { color: colors.mutedForeground }]}>A notification with sound at the end of your block.</Text></View>{endAlert && <Ionicons name="checkmark-circle" size={19} color={colors.primary} />}</Pressable>}</>}
    {!!selectedTime && <><Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>REMIND ME</Text><FlatList data={REMINDER_OPTIONS} horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} keyExtractor={(minutes) => String(minutes)} contentContainerStyle={styles.chainChoices} renderItem={({ item: minutes }) => { const selected = selectedReminder === minutes; return <Pressable onPress={() => setSelectedReminder(selected ? undefined : minutes)} style={[styles.chainChip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary + '1F' : colors.background }]}><Ionicons name="notifications-outline" size={13} color={selected ? colors.primary : colors.mutedForeground} /><Text style={[styles.chainChipText, { color: selected ? colors.foreground : colors.mutedForeground }]}>{minutes} min before</Text></Pressable>; }} /></>}</>}
  </View>;
}

function PlanItemRow({ item, chainName, highlighted, newlyAdded, isLast, locked, completionLocked, onToggle, onRemove, onEdit, onMore }: { item: PlanItem; chainName?: string; highlighted: boolean; newlyAdded: boolean; isLast: boolean; locked: boolean; completionLocked: boolean; onToggle: () => void; onRemove: () => void; onEdit: () => void; onMore: () => void }) {
  const colors = useColors();
  const accentColor = item.color || UNLINKED_TASK_COLOR;
  const displayAccent = item.isPriority ? colors.primary : accentColor;
  const borderColor = highlighted ? displayAccent : item.isPriority ? colors.primary : item.completed ? displayAccent + '48' : colors.border;
  const backgroundColor = highlighted ? accentColor + '14' : item.isPriority ? colors.primary + '0D' : item.completed ? accentColor + '12' : colors.card;
  const arrival = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!newlyAdded) return;
    arrival.setValue(0);
    Animated.spring(arrival, { toValue: 1, useNativeDriver: true, friction: 8, tension: 90 }).start();
  }, [arrival, newlyAdded]);
  return <Animated.View style={[styles.planItem, { backgroundColor, borderColor, marginBottom: isLast ? 20 : 8, opacity: arrival, transform: [{ translateY: arrival.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }, { scale: arrival.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }] }]}>
    <View style={[styles.planBar, { backgroundColor: item.completed ? displayAccent + 'A8' : displayAccent }]} />
    <Pressable disabled={completionLocked} onPress={onToggle} style={styles.planCheck}><View style={[styles.planCheckCircle, { backgroundColor: item.completed ? displayAccent : 'transparent', borderColor: item.completed ? displayAccent : completionLocked ? colors.mutedForeground : item.isPriority ? colors.primary : colors.border, opacity: completionLocked && !item.completed ? 0.58 : 1 }]}>{item.completed ? <Ionicons name="checkmark" size={13} color="#fff" /> : completionLocked ? <Ionicons name="lock-closed-outline" size={11} color={colors.mutedForeground} /> : null}</View></Pressable>
    <Pressable disabled={locked} onPress={onEdit} style={styles.planTextBlock}>
      <View style={styles.planMeta}>{item.isPriority && <View style={[styles.priorityBadge, { backgroundColor: colors.primary + '1A' }]}><Ionicons name="sparkles" size={10} color={colors.primary} /><Text style={[styles.priorityBadgeText, { color: colors.primary }]}>ONE THING</Text></View>}{completionLocked && !locked && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.mutedForeground + '18' }}><Ionicons name="lock-closed-outline" size={9} color={colors.mutedForeground} /><Text style={{ color: colors.mutedForeground, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.6 }}>TOMORROW</Text></View>}{item.timeSlot ? <Text style={[styles.planTime, { color: displayAccent }]}>{item.timeSlot}{item.durationMinutes ? `  ·  ${formatDurationLabel(item.durationMinutes)}` : ''}{item.reminderMinutes ? `  ·  ${item.reminderMinutes} MIN REMINDER` : ''}</Text> : <Text style={[styles.planTime, { color: item.isPriority ? colors.primary : colors.mutedForeground }]}>{item.durationMinutes ? `${formatDurationLabel(item.durationMinutes)} BLOCK` : 'ANYTIME'}</Text>}{item.endAlert && <Ionicons name="alarm-outline" size={12} color={displayAccent} />}{chainName && <View style={[styles.linkBadge, { backgroundColor: accentColor + '1A' }]}><Ionicons name="link-outline" size={10} color={accentColor} /><Text style={[styles.linkBadgeText, { color: accentColor }]}>{chainName}</Text></View>}</View>
      <Text style={[styles.planText, { color: item.completed ? colors.foreground + 'A6' : colors.foreground, textDecorationLine: item.completed ? 'line-through' : 'none', textDecorationColor: item.completed ? colors.primary : undefined, textDecorationStyle: 'solid' }]} numberOfLines={2}>{item.text}</Text>
    </Pressable>
    {locked ? <Ionicons name="lock-closed-outline" size={16} color={colors.mutedForeground} /> : <Pressable onPress={onMore} hitSlop={12}><Ionicons name="ellipsis-horizontal" size={20} color={colors.mutedForeground} /></Pressable>}
  </Animated.View>;
}

function TaskMenuMoment({ item, showCopy, showFocus, onClose, onFocus, onCopy, onEdit, onDelete }: { item: PlanItem | null; showCopy: boolean; showFocus: boolean; onClose: () => void; onFocus: () => void; onCopy: () => void; onEdit: () => void; onDelete: () => void }) {
  const colors = useColors();
  if (!item) return null;
  const titleStyle = { color: colors.foreground, fontSize: 17, fontFamily: 'Inter_600SemiBold', marginBottom: 16 } as const;
  const actionStyle = { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 15, padding: 14, marginBottom: 8 } as const;
  const actionTextStyle = { fontSize: 14, fontFamily: 'Inter_600SemiBold' } as const;
  return <Modal transparent visible animationType="fade" onRequestClose={onClose}><View style={completionStyles.shade}><View style={[completionStyles.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: 'stretch', padding: 22 }]}><Text style={titleStyle} numberOfLines={1}>{item.text}</Text>{showFocus && <Pressable onPress={onFocus} style={[actionStyle, { backgroundColor: colors.primary }]}><Ionicons name="play" size={16} color="#fff" /><Text style={[actionTextStyle, { color: '#fff' }]}>Start focus · {formatDurationLabel(item.durationMinutes || 0)}</Text></Pressable>}{showCopy && <Pressable onPress={onCopy} style={[actionStyle, { backgroundColor: colors.primary + '18' }]}><Ionicons name="copy-outline" size={18} color={colors.primary} /><Text style={[actionTextStyle, { color: colors.primary }]}>Copy to tomorrow</Text></Pressable>}<Pressable onPress={onEdit} style={[actionStyle, { backgroundColor: colors.background }]}><Ionicons name="create-outline" size={18} color={colors.foreground} /><Text style={[actionTextStyle, { color: colors.foreground }]}>Edit task</Text></Pressable><Pressable onPress={onDelete} style={[actionStyle, { backgroundColor: colors.destructive + '16' }]}><Ionicons name="trash-outline" size={18} color={colors.destructive} /><Text style={[actionTextStyle, { color: colors.destructive }]}>Delete task</Text></Pressable><Pressable onPress={onClose} style={{ alignItems: 'center', paddingTop: 8 }}><Text style={{ color: colors.mutedForeground, fontSize: 14, fontFamily: 'Inter_500Medium' }}>Cancel</Text></Pressable></View></View></Modal>;
}

function CompletionMoment({ visible, onClose, onPrepareTomorrow }: { visible: boolean; onClose: () => void; onPrepareTomorrow: () => void }) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(0.8)).current;
  const iconScale = useRef(new Animated.Value(0.7)).current;
  useEffect(() => {
    if (!visible) return;
    scale.setValue(0.8);
    iconScale.setValue(0.7);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7 }).start();
    Animated.sequence([Animated.spring(iconScale, { toValue: 1.12, useNativeDriver: true, friction: 4 }), Animated.spring(iconScale, { toValue: 1, useNativeDriver: true, friction: 5 })]).start();
  }, [visible, scale, iconScale]);
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}><View style={completionStyles.shade}><Animated.View style={[completionStyles.card, { backgroundColor: colors.card, borderColor: colors.border, transform: [{ scale }] }]}><Animated.View style={[completionStyles.icon, { backgroundColor: colors.primary + '20', transform: [{ scale: iconScale }] }]}><Ionicons name="checkmark" size={30} color={colors.primary} /></Animated.View><Text style={[completionStyles.title, { color: colors.foreground }]}>Day complete</Text><Text style={[completionStyles.body, { color: colors.mutedForeground, textAlign: 'center', lineHeight: 20 }]}>You followed through today. Let that count.</Text><Pressable onPress={onPrepareTomorrow} style={[completionStyles.primaryButton, { backgroundColor: colors.primary }]}><Text style={completionStyles.primaryText}>Prepare tomorrow</Text></Pressable><Pressable onPress={onClose} style={completionStyles.secondaryButton}><Text style={[completionStyles.secondaryText, { color: colors.mutedForeground }]}>Done</Text></Pressable></Animated.View></View></Modal>;
}

function ReminderPermissionMoment({ visible, minutes, onSkip, onAllow }: { visible: boolean; minutes?: number; onSkip: () => void; onAllow: () => void }) {
  const colors = useColors();
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onSkip}><View style={completionStyles.shade}><View style={[completionStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[completionStyles.icon, { backgroundColor: colors.primary + '20' }]}><Ionicons name="notifications-outline" size={28} color={colors.primary} /></View><Text style={[completionStyles.title, { color: colors.foreground }]}>Stay on time</Text><Text style={[completionStyles.body, { color: colors.mutedForeground, textAlign: 'center', lineHeight: 20 }]}>Chain can remind you {minutes} minutes before this task. You can change this anytime in iPhone Settings.</Text><Pressable onPress={onAllow} style={[completionStyles.primaryButton, { backgroundColor: colors.primary }]}><Text style={completionStyles.primaryText}>Allow reminders</Text></Pressable><Pressable onPress={onSkip} style={completionStyles.secondaryButton}><Text style={[completionStyles.secondaryText, { color: colors.mutedForeground }]}>Not now</Text></Pressable></View></View></Modal>;
}

function ChainCompletionMoment({ visible, item, chain, onConfirm, onClose }: { visible: boolean; item?: PlanItem; chain?: Chain; onConfirm: () => void; onClose: () => void }) {
  const colors = useColors();
  if (!item || !chain) return null;
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}><View style={completionStyles.shade}><View style={[completionStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[completionStyles.icon, { backgroundColor: chain.color + '20' }]}><Ionicons name="link-outline" size={28} color={chain.color} /></View><Text style={[completionStyles.title, { color: colors.foreground }]}>One more check</Text><Text style={[completionStyles.body, { color: colors.mutedForeground, textAlign: 'center', lineHeight: 20 }]}><Text style={{ fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>{item.text}</Text> is done. Does that complete <Text style={{ fontFamily: 'Inter_600SemiBold', color: chain.color }}>{chain.name}</Text> for today?</Text><Pressable onPress={onConfirm} style={[completionStyles.primaryButton, { backgroundColor: chain.color }]}><Text style={completionStyles.primaryText}>Mark chain done</Text></Pressable><Pressable onPress={onClose} style={completionStyles.secondaryButton}><Text style={[completionStyles.secondaryText, { color: colors.mutedForeground }]}>Not yet</Text></Pressable></View></View></Modal>;
}

function DayReviewMoment({ visible, completedCount, totalCount, protectedChains, chainCount, pendingItems, onMove, onLetGo, onClose, onPrepareTomorrow }: { visible: boolean; completedCount: number; totalCount: number; protectedChains: number; chainCount: number; pendingItems: PlanItem[]; onMove: (item: PlanItem) => void; onLetGo: (item: PlanItem) => void; onClose: () => void; onPrepareTomorrow: () => void }) {
  const colors = useColors();
  return <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}><View style={styles.modalShade}><Pressable style={StyleSheet.absoluteFill} onPress={onClose} /><View style={[styles.reviewModal, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.reviewModalIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name="moon" size={21} color={colors.primary} /></View><Text style={[styles.reviewModalTitle, { color: colors.foreground }]}>Close today gently</Text><Text style={[styles.reviewModalBody, { color: colors.mutedForeground }]}>{completedCount}/{totalCount} tasks complete · {protectedChains}/{chainCount} chains protected.</Text>{pendingItems.length === 0 ? <Text style={[styles.reviewAllClear, { color: colors.primary }]}>Everything is already complete.</Text> : <ScrollView style={styles.reviewList} showsVerticalScrollIndicator={false}>{pendingItems.map((item) => <View key={item.id} style={[styles.reviewRow, { borderColor: colors.border }]}><View style={[styles.reviewDot, { backgroundColor: item.color || UNLINKED_TASK_COLOR }]} /><View style={styles.reviewItemCopy}><Text style={[styles.reviewItemText, { color: colors.foreground }]} numberOfLines={1}>{item.text}</Text><Text style={[styles.reviewItemTime, { color: colors.mutedForeground }]}>{item.timeSlot || 'Anytime'}</Text></View><Pressable onPress={() => onMove(item)} style={[styles.reviewMove, { backgroundColor: colors.primary + '18' }]}><Text style={[styles.reviewMoveText, { color: colors.primary }]}>Move</Text></Pressable><Pressable onPress={() => onLetGo(item)} hitSlop={8} style={styles.reviewLetGo}><Ionicons name="close" size={18} color={colors.mutedForeground} /></Pressable></View>)}</ScrollView>}<Pressable onPress={onPrepareTomorrow} style={[styles.reviewDone, { backgroundColor: colors.primary }]}><Text style={styles.reviewDoneText}>Prepare tomorrow</Text></Pressable><Pressable onPress={onClose} style={styles.reviewLater}><Text style={[styles.reviewLaterText, { color: colors.mutedForeground }]}>Not now</Text></Pressable></View></View></Modal>;
}

function timeSortValue(timeSlot: string) {
  const match = /^(\d{1,2})(?::(\d{2}))?\s(AM|PM)$/.exec(timeSlot);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hour = Number(match[1]);
  if (match[3] === 'PM' && hour !== 12) hour += 12;
  if (match[3] === 'AM' && hour === 12) hour = 0;
  return hour * 60 + Number(match[2] || 0);
}

function TimePickerModal({ visible, hour, minute, setHour, setMinute, onClose, onConfirm }: any) {
  const colors = useColors();
  return <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
    <View style={styles.modalShade}><Pressable style={StyleSheet.absoluteFill} onPress={onClose} /><View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.modalHeader}><Text style={[styles.modalTitle, { color: colors.foreground }]}>Choose a time</Text><Pressable onPress={onClose} hitSlop={12}><Ionicons name="close" size={22} color={colors.mutedForeground} /></Pressable></View>
      <Text style={[styles.timePreview, { color: colors.primary }]}>{formatTime(hour, minute)}</Text>
      <View style={styles.pickerColumns}><View style={styles.pickerColumn}><Text style={[styles.pickerLabel, { color: colors.mutedForeground }]}>HOUR</Text><FlatList data={HOURS} keyExtractor={(value) => String(value)} style={styles.pickerList} renderItem={({ item }) => <Pressable onPress={() => setHour(item)} style={[styles.pickerValue, { backgroundColor: item === hour ? colors.primary + '24' : 'transparent' }]}><Text style={[styles.pickerValueText, { color: item === hour ? colors.primary : colors.foreground }]}>{item % 12 || 12} {item >= 12 ? 'PM' : 'AM'}</Text></Pressable>} /></View><View style={styles.pickerColumn}><Text style={[styles.pickerLabel, { color: colors.mutedForeground }]}>MINUTE</Text><FlatList data={MINUTES} keyExtractor={(value) => value} style={styles.pickerList} renderItem={({ item }) => <Pressable onPress={() => setMinute(item)} style={[styles.pickerValue, { backgroundColor: item === minute ? colors.primary + '24' : 'transparent' }]}><Text style={[styles.pickerValueText, { color: item === minute ? colors.primary : colors.foreground }]}>{item}</Text></Pressable>} /></View></View>
      <Pressable onPress={onConfirm} style={[styles.modalConfirm, { backgroundColor: colors.primary }]}><Text style={styles.modalConfirmText}>Use this time</Text></Pressable>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  briefingCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 17, borderWidth: 1, padding: 12, marginTop: 14 },
  briefingIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  briefingCopy: { flex: 1 },
  briefingTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  briefingBody: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2 },
  briefingChoices: { flexDirection: 'row', gap: 5 },
  briefingHour: { width: 29, height: 29, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  briefingHourText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  advancedToggle: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, marginVertical: 2 },
  advancedToggleText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  root: { flex: 1 }, header: { paddingHorizontal: 20, paddingBottom: 18 }, headerEyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.3, marginBottom: 6 }, headerTitle: { fontSize: 32, fontFamily: 'Inter_700Bold', letterSpacing: -0.8 }, headerSub: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 3 }, scroll: { paddingHorizontal: 20 }, sectionLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, marginBottom: 8 }, emptySection: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: 18, borderWidth: 1 }, emptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1, lineHeight: 19 }, reflectCard: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' }, reflectRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 10 }, reflectDot: { width: 8, height: 8, borderRadius: 4 }, reflectName: { flex: 1, fontSize: 15, fontFamily: 'Inter_500Medium' }, doneBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 }, doneBadgeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' }, pendingText: { fontSize: 12, fontFamily: 'Inter_400Regular' }, divider: { height: 1, marginLeft: 16 }, focusHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 10 }, focusCaption: { fontSize: 16, fontFamily: 'Inter_600SemiBold' }, countPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1 }, itemCount: { fontSize: 12, fontFamily: 'Inter_600SemiBold' }, progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }, progressTrack: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 3 }, progressLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', minWidth: 68, textAlign: 'right' }, emptyFocus: { alignItems: 'center', paddingHorizontal: 28, paddingVertical: 26, borderRadius: 20, borderWidth: 1, marginBottom: 12, gap: 8 }, moonCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 2 }, emptyFocusTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold', textAlign: 'center' }, emptyFocusBody: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 21 }, planItem: { flexDirection: 'row', alignItems: 'center', borderRadius: 17, borderWidth: 1, paddingRight: 14, paddingVertical: 14, marginBottom: 8, gap: 12, overflow: 'hidden' }, planBar: { width: 4, alignSelf: 'stretch' }, planCheck: { padding: 2 }, planCheckCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' }, planTextBlock: { flex: 1, gap: 3 }, planMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 }, planTime: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 }, linkBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 }, linkBadgeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' }, priorityBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 }, priorityBadgeText: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.6 }, planText: { fontSize: 15, fontFamily: 'Inter_500Medium' }, addCard: { borderRadius: 19, borderWidth: 1, marginTop: 4, overflow: 'hidden' }, addTrigger: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15 }, addIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, addCopy: { flex: 1 }, addTriggerText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' }, addTriggerSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 }, input: { fontSize: 16, fontFamily: 'Inter_400Regular', padding: 16, paddingBottom: 10 }, composerMeta: { gap: 7, paddingBottom: 4 }, metaLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1, paddingHorizontal: 16, marginTop: 2 }, chainHelper: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 15, paddingHorizontal: 16, marginTop: -2 }, timeSlots: { paddingHorizontal: 16, gap: 7, paddingBottom: 8 }, timeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 18, borderWidth: 1 }, timeChipText: { fontSize: 12, fontFamily: 'Inter_500Medium' }, chainChoices: { paddingHorizontal: 16, gap: 7, paddingBottom: 8 }, chainChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 17, borderWidth: 1 }, chainChipDot: { width: 7, height: 7, borderRadius: 4 }, chainChipText: { fontSize: 12, fontFamily: 'Inter_500Medium' }, priorityPick: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, padding: 10, marginHorizontal: 16, marginBottom: 3 }, priorityIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, priorityCopy: { flex: 1 }, priorityTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' }, priorityBody: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 }, addActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 14, paddingBottom: 14, paddingTop: 4 }, cancelBtn: { padding: 8 }, cancelText: { fontSize: 14, fontFamily: 'Inter_500Medium' }, addConfirmBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 }, addConfirmText: { color: '#fff', fontSize: 14, fontFamily: 'Inter_600SemiBold' }, modalShade: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000088' }, modalCard: { borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, padding: 20, paddingBottom: 30, maxHeight: '78%' }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, modalTitle: { fontSize: 20, fontFamily: 'Inter_700Bold' }, timePreview: { fontSize: 34, fontFamily: 'Inter_700Bold', textAlign: 'center', marginVertical: 18 }, pickerColumns: { flexDirection: 'row', gap: 12, height: 220 }, pickerColumn: { flex: 1 }, pickerLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1, textAlign: 'center', marginBottom: 7 }, pickerList: { flex: 1 }, pickerValue: { borderRadius: 12, paddingVertical: 9, alignItems: 'center', marginBottom: 4 }, pickerValueText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' }, modalConfirm: { borderRadius: 18, alignItems: 'center', paddingVertical: 14, marginTop: 18 }, modalConfirmText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_700Bold' }, reminderNotice: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 16, paddingHorizontal: 16, paddingBottom: 3 }, reviewTrigger: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 19, borderWidth: 1, padding: 15, marginTop: 4, marginBottom: 8 }, reviewIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, reviewCopy: { flex: 1 }, reviewTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' }, reviewSubtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 }, reviewModal: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 22, paddingBottom: 30, maxHeight: '78%' }, reviewModalIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 13 }, reviewModalTitle: { fontSize: 24, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 }, reviewModalBody: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20, marginTop: 6, marginBottom: 16 }, reviewList: { maxHeight: 260 }, reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 11, borderTopWidth: 1 }, reviewDot: { width: 7, height: 7, borderRadius: 4 }, reviewItemCopy: { flex: 1 }, reviewItemText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' }, reviewItemTime: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 }, reviewMove: { borderRadius: 11, paddingHorizontal: 10, paddingVertical: 7 }, reviewMoveText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' }, reviewLetGo: { padding: 5 }, reviewDone: { alignItems: 'center', borderRadius: 18, paddingVertical: 14, marginTop: 16 }, reviewDoneText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_700Bold' }, reviewAllClear: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginVertical: 14 }, reviewLater: { alignItems: 'center', paddingTop: 13, paddingBottom: 2 }, reviewLaterText: { fontSize: 14, fontFamily: 'Inter_500Medium' }, tomorrowSet: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 19, borderWidth: 1, padding: 14, marginTop: 14 }, tomorrowSetIcon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, tomorrowSetCopy: { flex: 1 }, tomorrowSetTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' }, tomorrowSetBody: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 3 },
});

const completionStyles = StyleSheet.create({
  shade: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00000088', padding: 28 },
  card: { width: '100%', maxWidth: 340, alignItems: 'center', borderWidth: 1, borderRadius: 26, padding: 30 },
  icon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 25, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
  body: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 6 },
  primaryButton: { alignSelf: 'stretch', alignItems: 'center', borderRadius: 18, paddingVertical: 13, marginTop: 22 },
  primaryText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_700Bold' },
  secondaryButton: { paddingTop: 14, paddingBottom: 2 },
  secondaryText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
});

const modeStyles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 19, padding: 15, marginTop: 4, marginBottom: 8, gap: 12 },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  title: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  subtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
});
