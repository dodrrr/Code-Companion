import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  KeyboardAvoidingView,
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
import { useReducedMotion } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import {
  CHAIN_COLORS,
  EXTRA_CHAIN_COLORS,
} from '@/constants/colors';
import {
  Chain,
  DayStatus,
  type ChainMutationResult,
  getStreak,
  getWeeklyProgress,
  getTodayStr,
  isRestDay,
  toLocalDateString,
  useChains,
} from '@/context/ChainsContext';
import { FOCUS_LOG_KEY, type FocusLogEntry } from '@/context/PlanContext';
import { getProgressionStage, PROGRESSION_STAGES } from '@/constants/progression';
import { AmbientScreen } from '@/components/AmbientSurface';
import AnimatedPressable from '@/components/AnimatedPressable';
import { Surface, SectionLabel, SheetHandle } from '@/components/ui/AppUI';
import { ChainSymbol } from '@/components/ui/ChainSymbol';
import { SevenChoiceSelector, type SevenChoiceOption } from '@/components/ui/SevenChoiceSelector';
import { CONTROL, OPACITY, RADIUS, SCRIM, SPACE, TYPE } from '@/constants/designSystem';
import { readableAccentColor, readableTextColor } from '@/constants/sectionTheme';
import { playFeedback } from '@/lib/feedback';
import { normalizeFocusLog } from '@/domain/plan';
import { reportDiagnostic } from '@/lib/diagnostics';

const FROZEN_COLOR = '#5B8CFF';
function weekdayLabel(day: number, format: 'long' | 'short' | 'narrow' = 'long') {
  const date = new Date(2024, 0, 7 + day, 12);
  return date.toLocaleDateString(undefined, { weekday: format });
}

const CALENDAR_DAY_LABELS = [1, 2, 3, 4, 5, 6, 0].map((day) => weekdayLabel(day, 'narrow'));
const SCHEDULE_DAYS = [
  { value: 1, label: weekdayLabel(1, 'short'), narrowLabel: weekdayLabel(1, 'narrow') },
  { value: 2, label: weekdayLabel(2, 'short'), narrowLabel: weekdayLabel(2, 'narrow') },
  { value: 3, label: weekdayLabel(3, 'short'), narrowLabel: weekdayLabel(3, 'narrow') },
  { value: 4, label: weekdayLabel(4, 'short'), narrowLabel: weekdayLabel(4, 'narrow') },
  { value: 5, label: weekdayLabel(5, 'short'), narrowLabel: weekdayLabel(5, 'narrow') },
  { value: 6, label: weekdayLabel(6, 'short'), narrowLabel: weekdayLabel(6, 'narrow') },
  { value: 0, label: weekdayLabel(0, 'short'), narrowLabel: weekdayLabel(0, 'narrow') },
];

const WEEKLY_TARGET_OPTIONS: readonly SevenChoiceOption[] = [1, 2, 3, 4, 5, 6, 7].map((value) => ({
  value,
  label: String(value),
  accessibilityLabel: `${value} ${value === 1 ? 'day' : 'days'} each week`,
}));
const REST_DAY_OPTIONS: readonly SevenChoiceOption[] = SCHEDULE_DAYS.map(({ label, narrowLabel, value }) => ({
  value,
  label: narrowLabel,
  accessibilityLabel: `${label} rest day`,
}));
const COLOR_NAMES: Record<string, string> = {
  '#FF6B35': 'Orange', '#00C896': 'Emerald', '#A855F7': 'Violet', '#F43F5E': 'Rose',
  '#F59E0B': 'Amber', '#3B82F6': 'Blue', '#FBBF24': 'Gold', '#84CC16': 'Lime',
  '#22D3EE': 'Cyan', '#EF4444': 'Red', '#4F46E5': 'Indigo',
};

const BRIGHT_CALENDAR_COLORS: Record<string, string> = {
  '#FF6B35': '#FF8A5C', '#00C896': '#2FE0B2', '#A855F7': '#BF7BFF', '#F43F5E': '#FF6B84',
  '#F59E0B': '#FFC247', '#3B82F6': '#65A7FF', '#FBBF24': '#FFD15A', '#A16207': '#F6BD52',
  '#84CC16': '#A3E635', '#22D3EE': '#67E8F9', '#EF4444': '#FF6B6B', '#4F46E5': '#7C83FF',
};

function calendarAccent(color: string) {
  return BRIGHT_CALENDAR_COLORS[color] || color;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function formatMonth(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function rhythmFrom(chain: Chain, focusLog: FocusLogEntry[]) {
  const stamps = chain.completedDates.map((date) => chain.completionTimes?.[date]).filter((value): value is string => Boolean(value));
  const hourCounts = new Map<number, number>();
  const weekdayCounts = new Map<number, number>();
  stamps.forEach((stamp) => { const date = new Date(stamp); hourCounts.set(date.getHours(), (hourCounts.get(date.getHours()) || 0) + 1); weekdayCounts.set(date.getDay(), (weekdayCounts.get(date.getDay()) || 0) + 1); });
  const top = <T,>(map: Map<T, number>) => Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  const hour = top(hourCounts);
  const day = top(weekdayCounts);
  const sessions = focusLog.filter((entry) => entry.chainId === chain.id);
  const focusDays = new Map<number, number>();
  sessions.forEach((entry) => { const weekday = new Date(`${entry.date}T12:00:00`).getDay(); focusDays.set(weekday, (focusDays.get(weekday) || 0) + entry.minutes); });
  const minutes = sessions.reduce((total, entry) => total + entry.minutes, 0);
  return { hour, day: top(focusDays) ?? day, minutes, samples: stamps.length };
}

function readableHour(hour?: number) {
  if (hour === undefined) return 'still forming';
  const start = new Date(2024, 0, 1, hour, 0);
  const end = new Date(2024, 0, 1, hour + 2, 0);
  const options = { hour: 'numeric' } as const;
  return `${start.toLocaleTimeString(undefined, options)}–${end.toLocaleTimeString(undefined, options)}`;
}

function countDueDays(chain: Chain, throughDate: string) {
  const cursor = new Date(`${chain.createdAt}T12:00:00`);
  const end = new Date(`${throughDate}T12:00:00`);
  let due = 0;
  let scanned = 0;
  while (cursor <= end && scanned < 4000) {
    const date = toLocalDateString(cursor);
    if (!isRestDay(chain, date)) due += 1;
    cursor.setDate(cursor.getDate() + 1);
    scanned += 1;
  }
  return Math.max(1, due);
}

function CalendarGrid({
  chain,
  month,
  onSelectDay,
}: {
  chain: Chain;
  month: Date;
  onSelectDay: (date: string) => void;
}) {
  const colors = useColors();
  const accent = calendarAccent(chain.color);
  const accentText = readableAccentColor(accent, colors.cardSolid);
  const solidAccentText = readableTextColor(accent);
  const today = getTodayStr();
  const editableFrom = new Date();
  editableFrom.setDate(editableFrom.getDate() - 3);
  const editableFromKey = toLocalDateString(editableFrom);
  const monthStart = startOfMonth(month);
  const firstDayOffset = (monthStart.getDay() + 6) % 7;
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstDayOffset + 1;
    if (day < 1 || day > daysInMonth) return null;
    return toLocalDateString(new Date(monthStart.getFullYear(), monthStart.getMonth(), day, 12));
  });

  return (
    <View style={styles.monthGrid}>
      {CALENDAR_DAY_LABELS.map((label, index) => (
        <Text key={`${label}-${index}`} maxFontSizeMultiplier={1.4} style={[styles.monthDayLabel, { color: colors.mutedForeground }]}>{label}</Text>
      ))}
      {cells.map((date, index) => {
        if (!date) return <View key={`empty-${index}`} style={styles.monthCell} />;
        const done = chain.completedDates.includes(date);
        const minimum = chain.minimumDates.includes(date);
        const frozen = chain.frozenDates.includes(date);
        const rest = isRestDay(chain, date);
        const isToday = date === today;
        const isFuture = date > today;
        const isBeforeChain = date < chain.createdAt;
        const isEditable = date >= editableFromKey && date <= today && !isBeforeChain;
        const status = done
          ? 'done'
          : minimum
            ? 'minimum version'
            : frozen
              ? 'frozen'
              : isBeforeChain
                ? 'before this chain started'
                : isFuture
                  ? 'future'
                  : rest
                    ? 'rest day'
                    : isToday
                      ? 'pending'
                      : 'missed';
        const localizedDate = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        });
        const stateStyle = done
          ? { backgroundColor: accent, borderColor: accent }
          : minimum
            ? { backgroundColor: accent + '50', borderColor: accent }
          : frozen
            ? { backgroundColor: FROZEN_COLOR + '33', borderColor: FROZEN_COLOR }
            : status === 'rest day'
              ? { backgroundColor: colors.secondary, borderColor: colors.border }
            : status === 'missed'
              ? { backgroundColor: 'transparent', borderColor: colors.border }
              : status === 'pending'
                ? { backgroundColor: 'transparent', borderColor: chain.color }
              : { backgroundColor: 'transparent', borderColor: 'transparent' };

        return (
          <Pressable
            key={date}
            disabled={!isEditable}
            accessibilityRole="button"
            accessibilityLabel={`${localizedDate}, ${status}`}
            accessibilityHint={isEditable ? 'Opens options to update this day.' : undefined}
            accessibilityState={{ disabled: !isEditable }}
            hitSlop={SPACE.xxs}
            onPress={() => onSelectDay(date)}
            style={({ pressed }) => [
              styles.monthCell,
              { opacity: isEditable && pressed ? 0.7 : isFuture || isBeforeChain ? 0.34 : 1 },
            ]}
          >
            <View style={[styles.monthDay, stateStyle, status === 'pending' && { borderColor: chain.color, borderWidth: 2 }]}>
              {frozen ? <Ionicons name="snow" size={13} color={FROZEN_COLOR} /> : minimum ? <Ionicons name="leaf-outline" size={13} color={accentText} /> : status === 'rest day' ? <Ionicons name="remove" size={15} color={colors.mutedForeground} /> : <Text maxFontSizeMultiplier={1.4} style={[styles.monthDayText, { color: done ? solidAccentText : date < today ? colors.mutedForeground : colors.foreground }]}>{Number(date.slice(-2))}</Text>}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function ChainDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    chains,
    deleteChain,
    updateChainColor,
    updateChainRestDays,
    updateChainCadence,
    updateChainMinimumLabel,
    setDayStatus,
    toggleToday,
    useFreeze,
    isCompletedToday,
    isFrozenToday,
    getRemainingFreezeTokens,
    isReady,
  } = useChains();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [showMoreColors, setShowMoreColors] = useState(false);
  const [minimumEditorOpen, setMinimumEditorOpen] = useState(false);
  const [minimumDraft, setMinimumDraft] = useState('');
  const [minimumSaving, setMinimumSaving] = useState(false);
  const mutationBusyRef = useRef(false);
  const [focusLog, setFocusLog] = useState<FocusLogEntry[]>([]);
  const touchStartX = useRef<number | null>(null);

  const chain = chains.find((c) => c.id === id);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  function handleBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }

  useEffect(() => {
    let cancelled = false;
    if (!chain) {
      setFocusLog([]);
      return;
    }
    void AsyncStorage.getItem(FOCUS_LOG_KEY)
      .then((raw) => { if (!cancelled) setFocusLog(normalizeFocusLog(raw)); })
      .catch((error) => {
        if (!cancelled) setFocusLog([]);
        reportDiagnostic({ area: 'storage', operation: 'chainDetail.focusLog', severity: 'warning', error });
      });
    return () => { cancelled = true; };
  }, [chain?.id]);

  if (!chain) {
    return (
      <AmbientScreen tone="today" style={styles.root}>
        <AnimatedPressable
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          containerStyle={[styles.backBtn, { top: topPad + SPACE.xs, left: SPACE.md }]}
          style={styles.backBtn2}
          scaleTo={0.94}
        >
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </AnimatedPressable>
        <View style={styles.notFound}>
          <Text style={[styles.notFoundText, { color: colors.mutedForeground }]}>
            {isReady ? 'Chain not found' : 'Loading chain…'}
          </Text>
        </View>
      </AmbientScreen>
    );
  }

  const streak = getStreak(chain);
  const done = isCompletedToday(chain);
  const frozen = isFrozenToday(chain);
  const freezeTokens = getRemainingFreezeTokens(chain);
  const freezeRecoveryRemaining = freezeTokens < 2 ? Math.max(0, 14 - chain.freezeRecoveryProgress) : 0;
  const totalCompleted = chain.completedDates.length;
  const totalProtected = chain.completedDates.length + chain.minimumDates.length;
  const dueDaysSinceStart = countDueDays(chain, getTodayStr());
  const consistency = Math.min(100, Math.round((totalProtected / dueDaysSinceStart) * 100));
  const restingToday = isRestDay(chain, getTodayStr());
  const weeklyProgress = chain.cadence === 'weekly' ? getWeeklyProgress(chain) : 0;
  const rhythm = rhythmFrom(chain, focusLog);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekStartKey = toLocalDateString(weekStart);
  const todayKey = getTodayStr();
  const weeklyKeptDays = new Set(
    [...chain.completedDates, ...chain.minimumDates].filter((date) => date >= weekStartKey && date <= todayKey),
  ).size;
  const weeklyFocus = focusLog.filter((entry) => entry.chainId === chain.id && entry.date >= weekStartKey);
  const weeklyFocusMinutes = weeklyFocus.reduce((total, entry) => total + entry.minutes, 0);
  const stage = getProgressionStage(streak);
  const milestoneStages = PROGRESSION_STAGES.filter((item) => [7, 30, 100, 365].includes(item.at));
  const nextStage = milestoneStages.find((item) => item.at > streak);
  const stageStart = [...milestoneStages].reverse().find((item) => item.at <= streak)?.at ?? 0;
  const stageProgress = nextStage ? Math.min(1, Math.max(0, (streak - stageStart) / (nextStage.at - stageStart))) : 1;
  const stageUnit = chain.cadence === 'weekly' ? 'week' : 'day';
  const accentText = readableAccentColor(chain.color, colors.cardSolid);
  const solidAccentText = readableTextColor(chain.color);

  async function commitChainChange(
    action: () => Promise<ChainMutationResult>,
    title = 'Chain not updated',
    message = 'Chain couldn’t save that change. Your previous setting has been restored.',
  ) {
    if (mutationBusyRef.current) return false;
    mutationBusyRef.current = true;
    const result = await action();
    mutationBusyRef.current = false;
    if (result.status === 'persisted') return true;
    playFeedback('error');
    Alert.alert(title, message);
    return false;
  }

  function handleDelete() {
    if (!chain) return;
    Alert.alert(
      'Delete chain?',
      `This will permanently delete "${chain.name}" and its entire history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => { void (async () => {
            if (!chain) return;
            const deleted = await commitChainChange(
              () => deleteChain(chain.id),
              'Chain not deleted',
              'Chain couldn’t delete this commitment. Its history is still here.',
            );
            if (!deleted) return;
            playFeedback('warning');
            router.replace('/');
          })(); },
        },
      ],
    );
  }

  async function handleToggle() {
    if (!chain) return;
    const updated = await commitChainChange(() => toggleToday(chain.id));
    if (!updated) return;
    playFeedback(done ? 'light' : 'success');
  }

  async function handleFreeze() {
    if (!chain || freezeTokens === 0) return;
    const updated = await commitChainChange(() => useFreeze(chain.id));
    if (!updated) return;
    playFeedback('light');
  }

  async function handleColorChange(color: string) {
    if (!chain || color === chain.color) return;
    const updated = await commitChainChange(() => updateChainColor(chain.id, color));
    if (!updated) return;
    playFeedback('selection');
  }

  function editMinimum() {
    if (!chain) return;
    setMinimumDraft(chain.minimumLabel);
    setMinimumEditorOpen(true);
  }

  function closeMinimumEditor() {
    if (minimumSaving) return;
    setMinimumEditorOpen(false);
  }

  async function saveMinimum() {
    if (!chain || minimumSaving || !minimumDraft.trim()) return;
    setMinimumSaving(true);
    const updated = await commitChainChange(() => updateChainMinimumLabel(chain.id, minimumDraft));
    setMinimumSaving(false);
    if (!updated) return;
    setMinimumEditorOpen(false);
    playFeedback('selection');
  }

  async function changeWeeklyTarget(target: number) {
    if (!chain) return;
    const updated = await commitChainChange(() => updateChainCadence(chain.id, 'weekly', target));
    if (!updated) return;
    playFeedback('selection');
  }

  async function changeRestDays(restDays: number[]) {
    if (!chain) return;
    const updated = await commitChainChange(() => updateChainRestDays(chain.id, restDays));
    if (!updated) return;
    playFeedback('selection');
  }

  function changeMonth(amount: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1, 12));
  }

  async function applyDayStatus(date: string, status: DayStatus) {
    if (!chain) return;
    if (mutationBusyRef.current) return;
    mutationBusyRef.current = true;
    const result = await setDayStatus(chain.id, date, status);
    mutationBusyRef.current = false;
    if (result.status !== 'persisted') {
      playFeedback('error');
      Alert.alert(
        result.status === 'rejected' && status === 'frozen' ? 'No freezes left' : 'Day not updated',
        result.status === 'rejected' && status === 'frozen'
          ? 'Each Chain can hold up to two freeze credits.'
          : 'Chain couldn’t save that day. Its previous status has been restored.',
      );
      return;
    }
    playFeedback('light');
  }

  function handleSelectDay(date: string) {
    const prettyDate = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric',
    });
    Alert.alert('Update day', prettyDate, [
      { text: 'Done', onPress: () => { void applyDayStatus(date, 'done'); } },
      { text: 'Minimum version', onPress: () => { void applyDayStatus(date, 'minimum'); } },
      { text: 'Freeze', onPress: () => { void applyDayStatus(date, 'frozen'); } },
      { text: 'Missed', style: 'destructive', onPress: () => { void applyDayStatus(date, 'missed'); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <AmbientScreen color={chain.color} style={styles.root}>
      {/* Nav bar */}
      <View style={[styles.navBar, { paddingTop: topPad + 4 }]}>
        <AnimatedPressable
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backBtn2}
          scaleTo={0.94}
        >
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </AnimatedPressable>
        <AnimatedPressable
          onPress={handleDelete}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${chain.name}`}
          accessibilityHint="Asks for confirmation before permanently deleting this chain."
          style={styles.deleteBtn}
          scaleTo={0.94}
        >
          <Ionicons name="trash-outline" size={20} color={colors.destructive} />
        </AnimatedPressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: botPad + SPACE.xxl }]}
      >
        {/* Chain name + color bar */}
        <View style={[styles.titleRow]}>
          <View style={[styles.colorDot, { backgroundColor: chain.color }]} />
          <Text style={[styles.chainName, { color: colors.foreground }]}>
            {chain.name}
          </Text>
        </View>

        <View style={styles.accentSection}>
          <SectionLabel>CHAIN ACCENT</SectionLabel>
          <View style={styles.colorRow}>
            {[...CHAIN_COLORS, ...(showMoreColors ? EXTRA_CHAIN_COLORS : [])].map((color) => {
              const selected = color === chain.color;
              return (
                <AnimatedPressable
                  key={color}
                  accessibilityRole="radio"
                  accessibilityLabel={`${COLOR_NAMES[color] ?? 'Custom'} chain color`}
                  accessibilityState={{ checked: selected }}
                  onPress={() => handleColorChange(color)}
                  style={[
                    styles.colorRing,
                    {
                      borderColor: selected ? color : 'transparent',
                    },
                  ]}
                  scaleTo={0.92}
                >
                  <View style={[styles.colorSwatch, { backgroundColor: color }]}>
                    {selected && <Ionicons name="checkmark" size={16} color={readableTextColor(color)} />}
                  </View>
                </AnimatedPressable>
              );
            })}
            <AnimatedPressable
              onPress={() => setShowMoreColors((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel={showMoreColors ? 'Show fewer chain colors' : 'Show more chain colors'}
              accessibilityState={{ expanded: showMoreColors }}
              style={[styles.colorRing, { borderColor: colors.border }]}
              scaleTo={0.92}
            >
              <View style={[styles.colorSwatch, { backgroundColor: colors.card }]}>
                <Ionicons name={showMoreColors ? 'chevron-up' : 'chevron-down'} size={15} color={colors.mutedForeground} />
              </View>
            </AnimatedPressable>
          </View>
        </View>

        <Surface style={styles.scheduleCard}>
          <AnimatedPressable
            onPress={() => setScheduleOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel={chain.cadence === 'weekly' ? 'Weekly goal' : 'Weekly schedule'}
            accessibilityState={{ expanded: scheduleOpen }}
            style={styles.scheduleHeader}
          >
            <View style={[styles.scheduleIcon, { backgroundColor: chain.color + '18' }]}>
              <Ionicons name="calendar-outline" size={18} color={accentText} />
            </View>
            <View style={styles.scheduleCopy}>
              <Text style={[styles.scheduleTitle, { color: colors.foreground }]}>
                {chain.cadence === 'weekly' ? 'Weekly goal' : 'Weekly schedule'}
              </Text>
              <Text style={[styles.scheduleBody, { color: colors.mutedForeground }]}>
                {chain.cadence === 'weekly'
                  ? `${weeklyProgress}/${chain.weeklyTarget} days this week`
                  : chain.restDays.length
                    ? `${SCHEDULE_DAYS.filter(({ value }) => chain.restDays.includes(value)).map(({ label }) => label).join(', ')} off`
                    : 'Every day counts'}
              </Text>
            </View>
            <Ionicons name={scheduleOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
          </AnimatedPressable>
          {scheduleOpen && (
            <View style={styles.scheduleExpanded}>
              <Text style={[styles.scheduleHint, { color: colors.mutedForeground }]}>
                {chain.cadence === 'weekly'
                  ? 'Reach your target in a week to extend your week streak.'
                  : 'Choose rest days. They never break your streak.'}
              </Text>
              <View style={styles.scheduleSelector}>
                <SevenChoiceSelector
                  options={chain.cadence === 'weekly' ? WEEKLY_TARGET_OPTIONS : REST_DAY_OPTIONS}
                  selectionMode={chain.cadence === 'weekly' ? 'single' : 'multiple'}
                  selectedValues={chain.cadence === 'weekly' ? [chain.weeklyTarget] : chain.restDays}
                  onSelectionChange={(selectedValues) => {
                    if (chain.cadence === 'weekly') {
                      const target = selectedValues[0];
                      if (target !== undefined) void changeWeeklyTarget(target);
                    } else {
                      void changeRestDays(selectedValues);
                    }
                  }}
                  accentColor={chain.color}
                  selectedTextColor={solidAccentText}
                  textColor={colors.mutedForeground}
                  borderColor={colors.border}
                  backgroundColor={colors.background}
                  accessibilityLabel={chain.cadence === 'weekly' ? 'Weekly target' : 'Rest days'}
                />
              </View>
            </View>
          )}
        </Surface>

        <View style={[styles.minimumPanel, { backgroundColor: chain.color + '12', borderColor: chain.color + '44' }]}>
          <AnimatedPressable
            onPress={editMinimum}
            accessibilityRole="button"
            accessibilityLabel="Edit minimum version"
            accessibilityValue={{ text: chain.minimumLabel }}
            accessibilityHint="Opens the minimum version editor."
            style={styles.minimumCard}
          >
            <View style={[styles.scheduleIcon, { backgroundColor: chain.color + '20' }]}>
              <ChainSymbol name="minimum" size={20} color={accentText} />
            </View>
            <Text style={[styles.minimumTitle, { color: colors.foreground }]}>Minimum version</Text>
            <Text numberOfLines={1} style={[styles.minimumValue, { color: colors.mutedForeground }]}>{chain.minimumLabel}</Text>
            <Ionicons name="chevron-forward" size={17} color={accentText} />
          </AnimatedPressable>
        </View>

        {/* Streak hero */}
        <View style={[styles.streakHero, { backgroundColor: chain.color + '14', borderColor: chain.color + '33' }]}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.streakNumber, { color: accentText }]}>{streak}</Text>
          <Text style={[styles.streakWord, { color: colors.mutedForeground }]}>
            {chain.cadence === 'weekly' ? 'week streak' : 'day streak'}
          </Text>
          <Text style={[styles.streakSub, { color: colors.mutedForeground }]}>
            {chain.cadence === 'weekly' ? `${weeklyProgress}/${chain.weeklyTarget} days this week` : `${totalCompleted} total completed`}
          </Text>
          <View style={[styles.stagePill, { backgroundColor: chain.color + '22' }]}><Text style={[styles.stageText, { color: accentText }]}>{stage.label.toUpperCase()} · {stage.copy}</Text></View>
          {nextStage ? <View style={styles.nextStage}><View style={[styles.nextStageTrack, { backgroundColor: chain.color + '22' }]}><View style={[styles.nextStageFill, { backgroundColor: chain.color, width: `${Math.max(5, stageProgress * 100)}%` }]} /></View><Text style={[styles.nextStageText, { color: colors.mutedForeground }]}>{nextStage.at - streak} {stageUnit}{nextStage.at - streak === 1 ? '' : 's'} to {nextStage.label}</Text></View> : <Text style={[styles.nextStageText, { color: accentText }]}>Your long-term rhythm is built.</Text>}
        </View>

        <Surface style={styles.milestoneCard}>
          <Text style={[styles.milestoneTitle, { color: colors.mutedForeground }]}>MILESTONES</Text>
          <View style={styles.milestoneRow}>
            {PROGRESSION_STAGES.filter((item) => [1, 7, 30, 100, 365].includes(item.at)).map((milestone) => {
              const unlocked = streak >= milestone.at;
              const milestoneLabel = milestone.at === 365 ? '1 year' : `${milestone.at} ${stageUnit}${milestone.at === 1 ? '' : 's'}`;
              return (
                <View
                  key={milestone.key}
                  accessible
                  accessibilityLabel={`${milestoneLabel}, ${unlocked ? 'unlocked' : 'locked'}`}
                  style={styles.milestoneItem}
                >
                  <View style={[styles.milestoneDot, { backgroundColor: unlocked ? chain.color : colors.background, borderColor: unlocked ? chain.color : colors.border }]}>
                    <Ionicons name={unlocked ? 'checkmark' : 'lock-closed'} size={13} color={unlocked ? solidAccentText : colors.mutedForeground} />
                  </View>
                  <Text style={[styles.milestoneLabel, { color: unlocked ? accentText : colors.mutedForeground }]}>
                    {milestone.at === 365 ? '1y' : milestone.at}
                  </Text>
                </View>
              );
            })}
          </View>
        </Surface>

        <Surface style={styles.insightsCard}>
          <View style={styles.insight}><Text style={[styles.insightValue, { color: accentText }]}>{chain.cadence === 'weekly' ? `${weeklyProgress}/${chain.weeklyTarget}` : `${consistency}%`}</Text><Text style={[styles.insightLabel, { color: colors.mutedForeground }]}>{chain.cadence === 'weekly' ? 'THIS WEEK' : 'CONSISTENCY'}</Text></View>
          <View style={[styles.insightDivider, { backgroundColor: colors.border }]} />
          <View style={styles.insight}><Text style={[styles.insightValue, { color: colors.foreground }]}>{totalProtected}</Text><Text style={[styles.insightLabel, { color: colors.mutedForeground }]}>DAYS KEPT</Text></View>
          <View style={[styles.insightDivider, { backgroundColor: colors.border }]} />
          <View style={styles.insight}><Text style={[styles.insightValue, { color: '#5B8CFF' }]}>{chain.frozenDates.length}</Text><Text style={[styles.insightLabel, { color: colors.mutedForeground }]}>PROTECTED</Text></View>
        </Surface>

        <View style={[styles.rhythmCard, { backgroundColor: chain.color + '10', borderColor: chain.color + '38' }]}>
          <View style={[styles.rhythmIcon, { backgroundColor: chain.color + '20' }]}><Ionicons name="pulse-outline" size={18} color={accentText} /></View>
          <View style={styles.rhythmCopy}><Text style={[styles.rhythmEyebrow, { color: accentText }]}>RHYTHM</Text><Text style={[styles.rhythmTitle, { color: colors.foreground }]}>{rhythm.samples >= 3 ? `You usually protect this around ${readableHour(rhythm.hour)}.` : 'Your rhythm is still forming.'}</Text><Text style={[styles.rhythmBody, { color: colors.mutedForeground }]}>{rhythm.samples >= 3 ? `${weekdayLabel(rhythm.day ?? 1)} is your strongest day${rhythm.minutes ? ` · ${Math.round(rhythm.minutes / 60 * 10) / 10}h of planned focus logged` : ''}.` : `Complete it a few more times and Chain will spot your best window${rhythm.minutes ? ` · ${Math.round(rhythm.minutes / 60 * 10) / 10}h of focus logged so far` : ''}.`}</Text></View>
        </View>
        <Surface style={styles.weekReflection}><View style={[styles.weekReflectionIcon, { backgroundColor: chain.color + '18' }]}><Ionicons name="analytics-outline" size={17} color={accentText} /></View><View style={styles.rhythmCopy}><Text style={[styles.rhythmEyebrow, { color: accentText }]}>THIS WEEK</Text><Text style={[styles.weekReflectionTitle, { color: colors.foreground }]}>{weeklyFocusMinutes ? `${Math.floor(weeklyFocusMinutes / 60)}h ${weeklyFocusMinutes % 60}m focused on ${chain.name}` : weeklyKeptDays ? `${weeklyKeptDays} ${chain.cadence === 'weekly' ? 'check-in' : 'day'}${weeklyKeptDays === 1 ? '' : 's'} kept this week.` : `No ${chain.cadence === 'weekly' ? 'check-ins' : 'days'} kept yet this week.`}</Text><Text style={[styles.rhythmBody, { color: colors.mutedForeground }]}>{weeklyFocus.length ? `${weeklyFocus.length} focus block${weeklyFocus.length === 1 ? '' : 's'} logged · You showed up for yourself.` : stage.key === 'starting-line' ? 'Your reflection becomes meaningful with your next session.' : stage.copy}</Text></View></Surface>
        {/* Today's action */}
        {restingToday ? (
          <Surface style={styles.restBanner}>
            <Ionicons name="moon-outline" size={19} color={accentText} />
            <View style={styles.scheduleCopy}>
              <Text style={[styles.restTitle, { color: colors.foreground }]}>Rest day</Text>
              <Text style={[styles.restBody, { color: colors.mutedForeground }]}>Your streak is safe. Come back tomorrow.</Text>
            </View>
          </Surface>
        ) : (
          <View style={styles.actionRow}>
            <AnimatedPressable
              onPress={handleToggle}
              accessibilityRole="button"
              accessibilityLabel={done ? `Remove today's completion for ${chain.name}` : `Mark ${chain.name} done today`}
              accessibilityState={{ selected: done }}
              containerStyle={styles.primaryActionContainer}
              style={[
                styles.actionBtn,
                {
                  backgroundColor: done ? chain.color : colors.card,
                  borderColor: done ? chain.color : colors.border,
                },
              ]}
            >
              <Ionicons
                name={done ? 'checkmark-circle' : 'ellipse-outline'}
                size={21}
                color={done ? solidAccentText : colors.mutedForeground}
              />
              <Text style={[styles.actionBtnText, { color: done ? solidAccentText : colors.foreground }]}>
                {done ? 'Logged today' : chain.cadence === 'weekly' ? 'Log today' : 'Mark done today'}
              </Text>
            </AnimatedPressable>

            <AnimatedPressable
              onPress={handleFreeze}
              disabled={freezeTokens === 0 || done || frozen}
              accessibilityRole="button"
              accessibilityLabel={`Use a freeze, ${freezeTokens} available`}
              accessibilityState={{ disabled: freezeTokens === 0 || done || frozen }}
              containerStyle={styles.secondaryActionContainer}
              style={[
                styles.actionBtn,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: freezeTokens === 0 || done || frozen ? OPACITY.disabled : 1,
                },
              ]}
            >
              <Ionicons name="snow-outline" size={19} color="#5B8CFF" />
              <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Freeze · {freezeTokens}</Text>
            </AnimatedPressable>
          </View>
        )}

        {freezeTokens < 2 && <View style={[styles.safetyNetCard, { backgroundColor: '#4488ff12', borderColor: '#4488ff44' }]}><View style={[styles.safetyNetIcon, { backgroundColor: '#4488ff22' }]}><Ionicons name="snow-outline" size={16} color="#4488ff" /></View><View style={styles.scheduleCopy}><Text style={[styles.safetyNetTitle, { color: '#4488ff' }]}>Safety net · {freezeTokens} available</Text><Text style={[styles.safetyNetBody, { color: colors.mutedForeground }]}>{freezeRecoveryRemaining} real completed day{freezeRecoveryRemaining === 1 ? '' : 's'} to restore one.</Text></View></View>}

        {/* Frozen today indicator */}
        {frozen && !done && (
          <View style={[styles.frozenBanner, { backgroundColor: '#4488ff22', borderColor: '#4488ff44' }]}>
            <Ionicons name="snow" size={14} color="#4488ff" />
            <Text style={[styles.frozenText, { color: '#4488ff' }]}>
              Today is frozen — your streak is protected
            </Text>
          </View>
        )}

        {/* Calendar */}
        <SectionLabel>MONTHLY HISTORY</SectionLabel>
        <View style={[styles.calendarStreak, { backgroundColor: chain.color + '18', borderColor: chain.color + '55' }]}>
          <Ionicons name="flame" size={16} color={accentText} />
          <Text style={[styles.calendarStreakText, { color: accentText }]}>{streak} {chain.cadence === 'weekly' ? 'week' : 'day'} streak</Text>
          <Text style={[styles.calendarStreakSub, { color: colors.mutedForeground }]}>{totalProtected} days kept</Text>
        </View>
        <Surface style={styles.calendarCard}>
          <View
            onTouchStart={(event) => { touchStartX.current = event.nativeEvent.pageX; }}
            onTouchEnd={(event) => {
              if (touchStartX.current === null) return;
              const distance = event.nativeEvent.pageX - touchStartX.current;
              touchStartX.current = null;
              if (Math.abs(distance) > 48) changeMonth(distance > 0 ? -1 : 1);
            }}
            style={styles.calendarInner}
          >
            <View style={styles.monthHeader}>
              <AnimatedPressable
                onPress={() => changeMonth(-1)}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                style={[
                  styles.monthNavButton,
                  { backgroundColor: colors.secondary, borderColor: colors.border },
                ]}
                scaleTo={0.92}
              >
                <Ionicons name="chevron-back" size={18} color={colors.foreground} />
              </AnimatedPressable>
              <Text style={[styles.monthTitle, { color: colors.foreground }]}>{formatMonth(month)}</Text>
              <AnimatedPressable
                onPress={() => changeMonth(1)}
                accessibilityRole="button"
                accessibilityLabel="Next month"
                style={[
                  styles.monthNavButton,
                  { backgroundColor: colors.secondary, borderColor: colors.border },
                ]}
                scaleTo={0.92}
              >
                <Ionicons name="chevron-forward" size={18} color={colors.foreground} />
              </AnimatedPressable>
            </View>
            <CalendarGrid chain={chain} month={month} onSelectDay={handleSelectDay} />
            <Text style={[styles.calendarHint, { color: colors.mutedForeground }]}>Tap today or the previous 3 days to update</Text>
          </View>
          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: chain.color }]} />
              <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>Done</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: chain.color + '38', borderColor: chain.color, borderWidth: 1 }]} />
              <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>Minimum</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: FROZEN_COLOR + '55', borderColor: FROZEN_COLOR, borderWidth: 1 }]} />
              <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>Frozen</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: 'transparent', borderColor: colors.border, borderWidth: 1 }]} />
              <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>Missed</Text>
            </View>
          </View>
        </Surface>

        {/* Started date */}
        <Text style={[styles.startedText, { color: colors.mutedForeground }]}>
          Started{' '}
          {new Date(chain.createdAt + 'T12:00:00').toLocaleDateString(undefined, {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </Text>
      </ScrollView>

      {minimumEditorOpen ? (
        <Modal
          visible
          transparent
          statusBarTranslucent
          animationType={reducedMotion ? 'none' : 'slide'}
          onRequestClose={closeMinimumEditor}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.minimumModal}
          >
            <Pressable
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              disabled={minimumSaving}
              onPress={closeMinimumEditor}
              style={StyleSheet.absoluteFill}
            />
            <View
              accessibilityViewIsModal
              importantForAccessibility="yes"
              onAccessibilityEscape={closeMinimumEditor}
              style={[
                styles.minimumSheet,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <SheetHandle />
              <ScrollView
                bounces={false}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[
                  styles.minimumSheetContent,
                  { paddingBottom: Math.max(insets.bottom, SPACE.md) },
                ]}
              >
                <View style={styles.minimumSheetHeader}>
                  <View style={styles.minimumSheetHeading}>
                    <Text style={[styles.minimumSheetEyebrow, { color: accentText }]}>MINIMUM VERSION</Text>
                    <Text accessibilityRole="header" style={[styles.minimumSheetTitle, { color: colors.foreground }]}>What still counts on a difficult day?</Text>
                  </View>
                  <AnimatedPressable
                    accessibilityRole="button"
                    accessibilityLabel="Close minimum version editor"
                    accessibilityState={{ disabled: minimumSaving }}
                    disabled={minimumSaving}
                    onPress={closeMinimumEditor}
                    scaleTo={0.94}
                    style={[styles.minimumSheetClose, { opacity: minimumSaving ? OPACITY.disabled : 1 }]}
                  >
                    <Ionicons name="close" size={22} color={colors.mutedForeground} />
                  </AnimatedPressable>
                </View>

                <TextInput
                  accessibilityLabel="Minimum version"
                  autoCapitalize="sentences"
                  autoCorrect
                  autoFocus
                  editable={!minimumSaving}
                  maxLength={48}
                  onChangeText={setMinimumDraft}
                  onSubmitEditing={() => { void saveMinimum(); }}
                  returnKeyType="done"
                  selectTextOnFocus
                  value={minimumDraft}
                  style={[
                    styles.minimumInput,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      color: colors.foreground,
                    },
                  ]}
                />
                <Text
                  accessibilityLabel={`${minimumDraft.length} of 48 characters`}
                  style={[styles.minimumCounter, { color: colors.mutedForeground }]}
                >
                  {minimumDraft.length}/48
                </Text>

                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel="Save minimum version"
                  accessibilityState={{ busy: minimumSaving, disabled: minimumSaving || !minimumDraft.trim() }}
                  disabled={minimumSaving || !minimumDraft.trim()}
                  onPress={() => { void saveMinimum(); }}
                  style={[
                    styles.minimumSave,
                    {
                      backgroundColor: chain.color,
                      borderColor: chain.color,
                      opacity: minimumSaving || !minimumDraft.trim() ? OPACITY.disabled : 1,
                    },
                  ]}
                >
                  <Text style={[styles.minimumSaveText, { color: solidAccentText }]}>
                    {minimumSaving ? 'Saving…' : 'Save minimum'}
                  </Text>
                </AnimatedPressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ) : null}
    </AmbientScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.sm,
    paddingBottom: SPACE.xs,
  },
  backBtn: {
    position: 'absolute',
    zIndex: 10,
  },
  backBtn2: {
    width: CONTROL.minimumTarget,
    height: CONTROL.minimumTarget,
    borderRadius: RADIUS.capsule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: CONTROL.minimumTarget,
    height: CONTROL.minimumTarget,
    borderRadius: RADIUS.capsule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundText: {
    ...TYPE.cardTitle,
  },
  scroll: {
    paddingHorizontal: CONTROL.screenHorizontal,
    gap: SPACE.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  accentSection: {
    gap: SPACE.xs,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.xs,
  },
  colorRing: {
    width: CONTROL.minimumTarget,
    height: CONTROL.minimumTarget,
    borderRadius: RADIUS.capsule,
    borderWidth: 2,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  chainName: {
    ...TYPE.modalTitle,
    flex: 1,
  },
  scheduleCard: {
    borderRadius: RADIUS.card,
    overflow: 'hidden',
  },
  minimumPanel: {
    borderRadius: RADIUS.card,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  minimumCard: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
  },
  minimumTitle: { ...TYPE.bodyStrong, flexShrink: 0 },
  minimumValue: { ...TYPE.caption, flex: 1, minWidth: 0, textAlign: 'right' },
  scheduleHeader: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  scheduleIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.compact,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleCopy: { flex: 1 },
  scheduleTitle: { ...TYPE.cardTitle },
  scheduleBody: { ...TYPE.caption, marginTop: SPACE.hairline },
  scheduleExpanded: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ffffff12', padding: SPACE.md, paddingTop: SPACE.sm },
  scheduleHint: { ...TYPE.caption, marginBottom: SPACE.sm },
  scheduleSelector: { marginHorizontal: -SPACE.md },
  minimumModal: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: SCRIM,
  },
  minimumSheet: {
    width: '100%',
    maxHeight: '88%',
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingTop: SPACE.sm,
  },
  minimumSheetContent: { paddingHorizontal: CONTROL.screenHorizontal },
  minimumSheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.md,
  },
  minimumSheetHeading: { flex: 1, minWidth: 0, gap: SPACE.xxs },
  minimumSheetEyebrow: { ...TYPE.eyebrow },
  minimumSheetTitle: { ...TYPE.sectionTitle },
  minimumSheetClose: {
    width: CONTROL.minimumTarget,
    height: CONTROL.minimumTarget,
    borderRadius: RADIUS.capsule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minimumInput: {
    minHeight: CONTROL.buttonHeight,
    borderRadius: RADIUS.control,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: 'Inter_500Medium',
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.sm,
    marginTop: SPACE.md,
  },
  minimumCounter: { ...TYPE.caption, alignSelf: 'flex-end', marginTop: SPACE.xxs },
  minimumSave: {
    minHeight: CONTROL.buttonHeight,
    borderRadius: RADIUS.button,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.md,
    marginTop: SPACE.md,
  },
  minimumSaveText: { ...TYPE.bodyStrong, textAlign: 'center' },
  streakHero: {
    alignItems: 'center',
    borderRadius: RADIUS.hero,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: SPACE.xxl,
    paddingHorizontal: SPACE.lg,
    gap: SPACE.xxs,
  },
  streakNumber: {
    fontSize: 64,
    fontFamily: 'Inter_700Bold',
    lineHeight: 68,
  },
  streakWord: {
    ...TYPE.cardTitle,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  streakSub: {
    ...TYPE.caption,
    marginTop: SPACE.xxs,
  },
  stagePill: { alignSelf: 'center', borderRadius: RADIUS.compact, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xs, marginTop: SPACE.sm },
  stageText: { ...TYPE.eyebrow, letterSpacing: 0.4, textAlign: 'center' },
  nextStage: { alignSelf: 'stretch', gap: SPACE.xs, marginTop: SPACE.sm },
  nextStageTrack: { height: 5, borderRadius: RADIUS.capsule, overflow: 'hidden' },
  nextStageFill: { height: '100%', borderRadius: RADIUS.capsule },
  nextStageText: { ...TYPE.metadata, textAlign: 'center' },
  milestoneCard: { borderRadius: RADIUS.card, padding: SPACE.md },
  milestoneTitle: { ...TYPE.eyebrow, marginBottom: SPACE.sm },
  milestoneRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: SPACE.xs },
  milestoneItem: { alignItems: 'center', gap: SPACE.xxs, minWidth: 40 },
  milestoneDot: { width: 30, height: 30, borderRadius: RADIUS.capsule, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  milestoneLabel: { ...TYPE.metadata },
  insightsCard: { flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.card, paddingVertical: SPACE.md },
  insight: { flex: 1, alignItems: 'center', gap: SPACE.xxs, minWidth: 0 },
  insightValue: { fontSize: 18, lineHeight: 24, fontFamily: 'Inter_700Bold' },
  insightLabel: { ...TYPE.metadata, letterSpacing: 0.5, textAlign: 'center' },
  insightDivider: { width: 1, height: 28 },
  rhythmCard: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm, borderRadius: RADIUS.card, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, padding: SPACE.md },
  weekReflection: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm, borderRadius: RADIUS.card, padding: SPACE.md },
  weekReflectionIcon: { width: 36, height: 36, borderRadius: RADIUS.compact, alignItems: 'center', justifyContent: 'center' },
  weekReflectionTitle: { ...TYPE.bodyStrong, marginTop: SPACE.xxs },
  rhythmIcon: { width: 36, height: 36, borderRadius: RADIUS.compact, alignItems: 'center', justifyContent: 'center' },
  rhythmCopy: { flex: 1, minWidth: 0 },
  rhythmEyebrow: { ...TYPE.eyebrow },
  rhythmTitle: { ...TYPE.bodyStrong, marginTop: SPACE.xxs },
  rhythmBody: { ...TYPE.caption, marginTop: SPACE.xxs },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
  },
  primaryActionContainer: { flexGrow: 2, flexBasis: 190, minWidth: 0 },
  secondaryActionContainer: { flexGrow: 1, flexBasis: 130, minWidth: 0 },
  restBanner: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderRadius: RADIUS.card, padding: SPACE.md },
  restTitle: { ...TYPE.cardTitle },
  restBody: { ...TYPE.caption, marginTop: SPACE.hairline },
  actionBtn: {
    minHeight: CONTROL.prominentButtonHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.xs,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.button,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionBtnText: {
    ...TYPE.bodyStrong,
    textAlign: 'center',
  },
  frozenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    minHeight: CONTROL.minimumTarget,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
    borderRadius: RADIUS.control,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  frozenText: {
    ...TYPE.caption,
  },
  safetyNetCard: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderRadius: RADIUS.control, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, padding: SPACE.sm },
  safetyNetIcon: { width: 36, height: 36, borderRadius: RADIUS.compact, alignItems: 'center', justifyContent: 'center' },
  safetyNetTitle: { ...TYPE.metadata },
  safetyNetBody: { ...TYPE.caption, marginTop: SPACE.hairline },
  calendarCard: {
    borderRadius: RADIUS.card,
    overflow: 'hidden',
  },
  calendarStreak: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACE.xs, alignSelf: 'flex-start', borderRadius: RADIUS.control, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xs, marginTop: -SPACE.hairline, marginBottom: SPACE.sm },
  calendarStreakText: { ...TYPE.metadata },
  calendarStreakSub: { ...TYPE.metadata },
  calendarInner: {
    paddingHorizontal: SPACE.sm,
    paddingTop: SPACE.md,
    paddingBottom: SPACE.sm,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.sm,
  },
  monthNavButton: {
    width: CONTROL.minimumTarget,
    height: CONTROL.minimumTarget,
    borderRadius: RADIUS.capsule,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    ...TYPE.sectionTitle,
    flexShrink: 1,
    textAlign: 'center',
    paddingHorizontal: SPACE.xs,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  monthDayLabel: {
    width: '14.2857%',
    textAlign: 'center',
    ...TYPE.metadata,
    marginBottom: SPACE.xs,
  },
  monthCell: {
    width: '14.2857%',
    height: CONTROL.minimumTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.xxs,
  },
  monthDay: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthDayText: {
    ...TYPE.metadata,
  },
  calendarHint: {
    marginTop: SPACE.xs,
    ...TYPE.caption,
    textAlign: 'center',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.md,
    paddingBottom: SPACE.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 4,
  },
  legendLabel: {
    ...TYPE.caption,
  },
  startedText: {
    ...TYPE.caption,
    textAlign: 'center',
    marginTop: SPACE.xxs,
  },
});
