import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Chain, getTodayStr, useChains } from '@/context/ChainsContext';
import { PlanItem, usePlan } from '@/context/PlanContext';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { cancelPlanReminder, getPlanNotificationPermission, requestPlanNotificationPermission, schedulePlanReminder } from '@/lib/planNotifications';

const QUICK_TIMES = ['7 AM', '9 AM', '12 PM', '3 PM', '6 PM', '8 PM'];
const HOURS = Array.from({ length: 18 }, (_, index) => index + 6);
const MINUTES = ['00', '05', '10', '15', '20', '30', '40', '45', '50', '55'];
const REMINDER_OPTIONS = [5, 15, 30, 60];

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

export default function PlanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { chains } = useChains();
  const { items, activeDate, isToday, tomorrowItemCount, showToday, showTomorrow, addItem, updateItem, updateReminderMetadata, removeItem, toggleItem } = usePlan();
  const [inputText, setInputText] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedChainId, setSelectedChainId] = useState<string | undefined>();
  const [selectedReminder, setSelectedReminder] = useState<number | undefined>();
  const [reminderNotice, setReminderNotice] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [editingItem, setEditingItem] = useState<PlanItem | null>(null);
  const [showCompletion, setShowCompletion] = useState(false);
  const [showReminderPermission, setShowReminderPermission] = useState(false);
  const [pickerHour, setPickerHour] = useState(9);
  const [pickerMinute, setPickerMinute] = useState('00');
  const inputRef = useRef<TextInput>(null);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 84 : insets.bottom;
  const today = getTodayStr();
  const completedCount = items.filter((item) => item.completed).length;
  const progressFill = items.length ? completedCount / items.length : 0;
  const selectedChain = chains.find((chain) => chain.id === selectedChainId);
  const orderedItems = [...items].sort((a, b) => timeSortValue(a.timeSlot) - timeSortValue(b.timeSlot));

  function resetComposer() {
    setInputText('');
    setSelectedTime('');
    setSelectedChainId(undefined);
    setSelectedReminder(undefined);
    setReminderNotice('');
    setShowInput(false);
    setEditingItem(null);
  }

  function savePlanItem(scheduleReminder: boolean) {
    if (!inputText.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const options = {
      text: inputText,
      timeSlot: selectedTime,
      chainId: selectedChain?.id,
      color: selectedChain?.color,
      reminderMinutes: selectedTime ? selectedReminder : undefined,
    };
    const item = editingItem ? updateItem(editingItem.id, options) : addItem(options);
    if (!item) return;
    if (editingItem?.notificationId) void cancelPlanReminder(editingItem.notificationId);
    if (scheduleReminder && selectedTime && selectedReminder) {
      void schedulePlanReminder(item, selectedReminder).then((result) => {
        if (result.status === 'scheduled') updateReminderMetadata(item.id, selectedReminder, result.notificationId);
        if (result.status === 'denied') setReminderNotice('Notifications are off. You can enable them in iPhone Settings.');
      });
    }
    resetComposer();
  }

  async function handleAdd() {
    if (!inputText.trim()) return;
    if (selectedTime && selectedReminder) {
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
    savePlanItem(Boolean(selectedTime && selectedReminder));
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
    setSelectedReminder(item.reminderMinutes);
    setShowInput(true);
  }

  function handleToggle(item: PlanItem) {
    const isLastTask = !item.completed && items.length > 0 && completedCount + 1 === items.length;
    Haptics.impactAsync(isLastTask ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    toggleItem(item.id);
    if (isLastTask) setShowCompletion(true);
  }

  function chooseCustomTime() {
    setSelectedTime(formatTime(pickerHour, pickerMinute));
    setShowTimePicker(false);
    Haptics.selectionAsync();
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
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: botPad + 100 }]}
      >
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{isToday ? "TODAY'S CHAINS" : 'YOUR CHAINS'}</Text>
        {chains.length === 0 ? (
          <View style={[styles.emptySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="link-outline" size={22} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Add a chain first to bring its color into your plan.</Text>
          </View>
        ) : (
          <View style={[styles.reflectCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {chains.map((chain, index) => {
              const done = chain.completedDates.includes(today);
              return <ChainReflection key={chain.id} chain={chain} done={done} isLast={index === chains.length - 1} />;
            })}
          </View>
        )}

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
            onToggle={() => handleToggle(item)}
            onRemove={() => { void cancelPlanReminder(item.notificationId); removeItem(item.id); }}
            onEdit={() => startEditing(item)}
          />
        ))}

        {items.length === 0 && (
          <View style={[styles.emptyFocus, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.moonCircle, { backgroundColor: colors.primary + '18' }]}><Ionicons name="moon" size={22} color={colors.primary} /></View>
            <Text style={[styles.emptyFocusTitle, { color: colors.foreground }]}>{isToday ? 'Your day is clear.' : 'A calm start begins tonight.'}</Text>
            <Text style={[styles.emptyFocusBody, { color: colors.mutedForeground }]}>{isToday ? 'There are no unfinished tasks waiting for you.' : 'Choose what deserves space tomorrow, then let the plan hold the rest.'}</Text>
          </View>
        )}

        <Pressable
          onPress={isToday ? showTomorrow : showToday}
          style={({ pressed }) => [modeStyles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
        >
          <View style={[modeStyles.icon, { backgroundColor: colors.primary + '18' }]}><Ionicons name={isToday ? 'arrow-forward' : 'arrow-back'} size={17} color={colors.primary} /></View>
          <View style={modeStyles.copy}><Text style={[modeStyles.title, { color: colors.foreground }]}>{isToday ? (tomorrowItemCount > 0 ? `Tomorrow ready · ${tomorrowItemCount} task${tomorrowItemCount === 1 ? '' : 's'}` : 'Prepare tomorrow') : 'Back to today'}</Text><Text style={[modeStyles.subtitle, { color: colors.mutedForeground }]}>{isToday ? (tomorrowItemCount > 0 ? 'Review it or make space for one more thing.' : 'Set up tomorrow in a minute.') : 'Return to your active agenda.'}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>

        <View style={[styles.addCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
                  setSelectedChainId={setSelectedChainId}
                  selectedTime={selectedTime}
                  setSelectedTime={setSelectedTime}
                  openTimePicker={() => setShowTimePicker(true)}
                  selectedReminder={selectedReminder}
                  setSelectedReminder={setSelectedReminder}
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
          </View>
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
      <CompletionMoment visible={showCompletion} onClose={() => setShowCompletion(false)} onPrepareTomorrow={() => { setShowCompletion(false); showTomorrow(); }} />
      <ReminderPermissionMoment visible={showReminderPermission} minutes={selectedReminder} onSkip={() => { setShowReminderPermission(false); savePlanItem(false); }} onAllow={() => { void enableRemindersAndSave(); }} />
    </View>
  );
}

function ChainReflection({ chain, done, isLast }: { chain: Chain; done: boolean; isLast: boolean }) {
  const colors = useColors();
  return <View>
    <View style={styles.reflectRow}>
      <View style={[styles.reflectDot, { backgroundColor: chain.color }]} />
      <Text style={[styles.reflectName, { color: colors.foreground }]} numberOfLines={1}>{chain.name}</Text>
      {done ? <View style={[styles.doneBadge, { backgroundColor: chain.color + '20' }]}><Ionicons name="checkmark" size={12} color={chain.color} /><Text style={[styles.doneBadgeText, { color: chain.color }]}>done today</Text></View> : <Text style={[styles.pendingText, { color: colors.mutedForeground }]}>pending</Text>}
    </View>
    {!isLast && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
  </View>;
}

function ComposerMeta({ colors, chains, selectedChainId, setSelectedChainId, selectedTime, setSelectedTime, openTimePicker, selectedReminder, setSelectedReminder }: any) {
  return <View style={styles.composerMeta}>
    <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>TIME</Text>
    <FlatList data={QUICK_TIMES} horizontal showsHorizontalScrollIndicator={false} keyExtractor={(time) => time} contentContainerStyle={styles.timeSlots} renderItem={({ item: time }) => <Pressable onPress={() => setSelectedTime(time === selectedTime ? '' : time)} style={[styles.timeChip, { backgroundColor: time === selectedTime ? colors.primary : colors.background, borderColor: time === selectedTime ? colors.primary : colors.border }]}><Text style={[styles.timeChipText, { color: time === selectedTime ? '#fff' : colors.mutedForeground }]}>{time}</Text></Pressable>} ListFooterComponent={<Pressable onPress={openTimePicker} style={[styles.timeChip, { backgroundColor: selectedTime && !QUICK_TIMES.includes(selectedTime) ? colors.primary : colors.background, borderColor: selectedTime && !QUICK_TIMES.includes(selectedTime) ? colors.primary : colors.border }]}><Ionicons name="time-outline" size={14} color={selectedTime && !QUICK_TIMES.includes(selectedTime) ? '#fff' : colors.mutedForeground} /><Text style={[styles.timeChipText, { color: selectedTime && !QUICK_TIMES.includes(selectedTime) ? '#fff' : colors.mutedForeground }]}>{selectedTime && !QUICK_TIMES.includes(selectedTime) ? selectedTime : 'Custom'}</Text></Pressable>} />
    <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>ADD TO A CHAIN · OPTIONAL</Text>
    <Text style={[styles.chainHelper, { color: colors.mutedForeground }]}>Only link tasks that move that chain forward. Unlinked tasks stay neutral.</Text>
    <FlatList data={[{ id: '', name: 'No chain', color: colors.mutedForeground }, ...chains]} horizontal showsHorizontalScrollIndicator={false} keyExtractor={(chain) => chain.id} contentContainerStyle={styles.chainChoices} renderItem={({ item: chain }) => { const selected = (chain.id || undefined) === selectedChainId; return <Pressable onPress={() => setSelectedChainId(chain.id || undefined)} style={[styles.chainChip, { borderColor: selected ? chain.color : colors.border, backgroundColor: selected ? chain.color + '1F' : colors.background }]}><View style={[styles.chainChipDot, { backgroundColor: chain.color }]} /><Text style={[styles.chainChipText, { color: selected ? colors.foreground : colors.mutedForeground }]}>{chain.name}</Text></Pressable>; }} />
    {!!selectedTime && <><Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>REMIND ME</Text><FlatList data={REMINDER_OPTIONS} horizontal showsHorizontalScrollIndicator={false} keyExtractor={(minutes) => String(minutes)} contentContainerStyle={styles.chainChoices} renderItem={({ item: minutes }) => { const selected = selectedReminder === minutes; return <Pressable onPress={() => setSelectedReminder(selected ? undefined : minutes)} style={[styles.chainChip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary + '1F' : colors.background }]}><Ionicons name="notifications-outline" size={13} color={selected ? colors.primary : colors.mutedForeground} /><Text style={[styles.chainChipText, { color: selected ? colors.foreground : colors.mutedForeground }]}>{minutes} min before</Text></Pressable>; }} /></>}
  </View>;
}

function PlanItemRow({ item, chainName, onToggle, onRemove, onEdit }: { item: PlanItem; chainName?: string; onToggle: () => void; onRemove: () => void; onEdit: () => void }) {
  const colors = useColors();
  const accentColor = item.color || colors.mutedForeground;
  return <View style={[styles.planItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <View style={[styles.planBar, { backgroundColor: item.completed ? colors.border : accentColor }]} />
    <Pressable onPress={onToggle} style={styles.planCheck}><View style={[styles.planCheckCircle, { backgroundColor: item.completed ? accentColor : 'transparent', borderColor: item.completed ? accentColor : colors.border }]}>{item.completed && <Ionicons name="checkmark" size={13} color="#fff" />}</View></Pressable>
    <Pressable onPress={onEdit} style={styles.planTextBlock}>
      <View style={styles.planMeta}>{item.timeSlot ? <Text style={[styles.planTime, { color: accentColor }]}>{item.timeSlot}{item.reminderMinutes ? `  ·  ${item.reminderMinutes} MIN REMINDER` : ''}</Text> : <Text style={[styles.planTime, { color: colors.mutedForeground }]}>ANYTIME</Text>}{chainName && <View style={[styles.linkBadge, { backgroundColor: accentColor + '1A' }]}><Ionicons name="link-outline" size={10} color={accentColor} /><Text style={[styles.linkBadgeText, { color: accentColor }]}>{chainName}</Text></View>}</View>
      <Text style={[styles.planText, { color: item.completed ? colors.mutedForeground : colors.foreground, textDecorationLine: item.completed ? 'line-through' : 'none' }]} numberOfLines={2}>{item.text}</Text>
    </Pressable>
    <Pressable onPress={onRemove} hitSlop={12}><Ionicons name="close" size={18} color={colors.mutedForeground} /></Pressable>
  </View>;
}

function CompletionMoment({ visible, onClose, onPrepareTomorrow }: { visible: boolean; onClose: () => void; onPrepareTomorrow: () => void }) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(0.8)).current;
  useEffect(() => {
    if (!visible) return;
    scale.setValue(0.8);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7 }).start();
  }, [visible, scale, onClose]);
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}><View style={completionStyles.shade}><Animated.View style={[completionStyles.card, { backgroundColor: colors.card, borderColor: colors.border, transform: [{ scale }] }]}><View style={[completionStyles.icon, { backgroundColor: colors.primary + '20' }]}><Ionicons name="checkmark" size={30} color={colors.primary} /></View><Text style={[completionStyles.title, { color: colors.foreground }]}>Day complete</Text><Text style={[completionStyles.body, { color: colors.mutedForeground }]}>Everything you planned is done.</Text><Pressable onPress={onPrepareTomorrow} style={[completionStyles.primaryButton, { backgroundColor: colors.primary }]}><Text style={completionStyles.primaryText}>Prepare tomorrow</Text></Pressable><Pressable onPress={onClose} style={completionStyles.secondaryButton}><Text style={[completionStyles.secondaryText, { color: colors.mutedForeground }]}>Done</Text></Pressable></Animated.View></View></Modal>;
}

function ReminderPermissionMoment({ visible, minutes, onSkip, onAllow }: { visible: boolean; minutes?: number; onSkip: () => void; onAllow: () => void }) {
  const colors = useColors();
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onSkip}><View style={completionStyles.shade}><View style={[completionStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[completionStyles.icon, { backgroundColor: colors.primary + '20' }]}><Ionicons name="notifications-outline" size={28} color={colors.primary} /></View><Text style={[completionStyles.title, { color: colors.foreground }]}>Stay on time</Text><Text style={[completionStyles.body, { color: colors.mutedForeground, textAlign: 'center', lineHeight: 20 }]}>Chain can remind you {minutes} minutes before this task. You can change this anytime in iPhone Settings.</Text><Pressable onPress={onAllow} style={[completionStyles.primaryButton, { backgroundColor: colors.primary }]}><Text style={completionStyles.primaryText}>Allow reminders</Text></Pressable><Pressable onPress={onSkip} style={completionStyles.secondaryButton}><Text style={[completionStyles.secondaryText, { color: colors.mutedForeground }]}>Not now</Text></Pressable></View></View></Modal>;
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
  root: { flex: 1 }, header: { paddingHorizontal: 20, paddingBottom: 18 }, headerEyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.3, marginBottom: 6 }, headerTitle: { fontSize: 32, fontFamily: 'Inter_700Bold', letterSpacing: -0.8 }, headerSub: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 3 }, scroll: { paddingHorizontal: 20 }, sectionLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, marginBottom: 8 }, emptySection: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: 18, borderWidth: 1 }, emptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1, lineHeight: 19 }, reflectCard: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' }, reflectRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 10 }, reflectDot: { width: 8, height: 8, borderRadius: 4 }, reflectName: { flex: 1, fontSize: 15, fontFamily: 'Inter_500Medium' }, doneBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 }, doneBadgeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' }, pendingText: { fontSize: 12, fontFamily: 'Inter_400Regular' }, divider: { height: 1, marginLeft: 16 }, focusHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 10 }, focusCaption: { fontSize: 16, fontFamily: 'Inter_600SemiBold' }, countPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1 }, itemCount: { fontSize: 12, fontFamily: 'Inter_600SemiBold' }, progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }, progressTrack: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 3 }, progressLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', minWidth: 68, textAlign: 'right' }, emptyFocus: { alignItems: 'center', paddingHorizontal: 28, paddingVertical: 26, borderRadius: 20, borderWidth: 1, marginBottom: 12, gap: 8 }, moonCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 2 }, emptyFocusTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold', textAlign: 'center' }, emptyFocusBody: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 21 }, planItem: { flexDirection: 'row', alignItems: 'center', borderRadius: 17, borderWidth: 1, paddingRight: 14, paddingVertical: 14, marginBottom: 8, gap: 12, overflow: 'hidden' }, planBar: { width: 4, alignSelf: 'stretch' }, planCheck: { padding: 2 }, planCheckCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' }, planTextBlock: { flex: 1, gap: 3 }, planMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 }, planTime: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 }, linkBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 }, linkBadgeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' }, planText: { fontSize: 15, fontFamily: 'Inter_500Medium' }, addCard: { borderRadius: 19, borderWidth: 1, marginTop: 4, overflow: 'hidden' }, addTrigger: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15 }, addIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, addCopy: { flex: 1 }, addTriggerText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' }, addTriggerSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 }, input: { fontSize: 16, fontFamily: 'Inter_400Regular', padding: 16, paddingBottom: 10 }, composerMeta: { gap: 7, paddingBottom: 4 }, metaLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1, paddingHorizontal: 16, marginTop: 2 }, chainHelper: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 15, paddingHorizontal: 16, marginTop: -2 }, timeSlots: { paddingHorizontal: 16, gap: 7, paddingBottom: 8 }, timeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 18, borderWidth: 1 }, timeChipText: { fontSize: 12, fontFamily: 'Inter_500Medium' }, chainChoices: { paddingHorizontal: 16, gap: 7, paddingBottom: 8 }, chainChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 17, borderWidth: 1 }, chainChipDot: { width: 7, height: 7, borderRadius: 4 }, chainChipText: { fontSize: 12, fontFamily: 'Inter_500Medium' }, addActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 14, paddingBottom: 14, paddingTop: 4 }, cancelBtn: { padding: 8 }, cancelText: { fontSize: 14, fontFamily: 'Inter_500Medium' }, addConfirmBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 }, addConfirmText: { color: '#fff', fontSize: 14, fontFamily: 'Inter_600SemiBold' }, modalShade: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000088' }, modalCard: { borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, padding: 20, paddingBottom: 30, maxHeight: '78%' }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, modalTitle: { fontSize: 20, fontFamily: 'Inter_700Bold' }, timePreview: { fontSize: 34, fontFamily: 'Inter_700Bold', textAlign: 'center', marginVertical: 18 }, pickerColumns: { flexDirection: 'row', gap: 12, height: 220 }, pickerColumn: { flex: 1 }, pickerLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1, textAlign: 'center', marginBottom: 7 }, pickerList: { flex: 1 }, pickerValue: { borderRadius: 12, paddingVertical: 9, alignItems: 'center', marginBottom: 4 }, pickerValueText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' }, modalConfirm: { borderRadius: 18, alignItems: 'center', paddingVertical: 14, marginTop: 18 }, modalConfirmText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_700Bold' }, reminderNotice: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 16, paddingHorizontal: 16, paddingBottom: 3 },
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
