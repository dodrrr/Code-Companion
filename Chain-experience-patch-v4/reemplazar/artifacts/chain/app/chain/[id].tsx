import React, { useCallback, useRef, useState } from 'react';
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
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useLocalClock } from '@/hooks/useLocalClock';
import {
  CHAIN_COLORS,
  EXTRA_CHAIN_COLORS,
  CHAIN_COLOR_NAMES,
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
import { type FocusLogEntry } from '@/context/PlanContext';
import { AmbientScreen } from '@/components/AmbientSurface';
import AnimatedPressable from '@/components/AnimatedPressable';
import { Surface, SectionLabel, SheetHandle } from '@/components/ui/AppUI';
import { ChainSymbol } from '@/components/ui/ChainSymbol';
import { SevenChoiceSelector, type SevenChoiceOption } from '@/components/ui/SevenChoiceSelector';
import { CONTROL, OPACITY, RADIUS, SCRIM, SPACE, TYPE } from '@/constants/designSystem';
import { readableAccentColor, readableTextColor } from '@/constants/sectionTheme';
import { playFeedback } from '@/lib/feedback';
import { readRhythmFocusLog } from '@/lib/rhythmStorage';
import { getChainCommitmentStatus } from '@/domain/chains';
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
type SettingsSection = 'accent' | 'schedule' | 'minimum' | null;

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
              ? chain.cadence === 'weekly' ? 'saved freeze, no weekly credit' : 'frozen'
              : isBeforeChain
                ? 'before this chain started'
                : isFuture
                  ? 'future'
                  : rest
                    ? 'rest day'
                    : isToday
                      ? 'pending'
                      : chain.cadence === 'weekly' ? 'not logged' : 'missed';
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
            : status === 'missed' || status === 'not logged'
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
              {frozen ? <ChainSymbol name="freeze" size={13} color={FROZEN_COLOR} /> : minimum ? <ChainSymbol name="minimum" size={13} color={accentText} /> : status === 'rest day' ? <ChainSymbol name="rest" size={13} color={colors.mutedForeground} /> : <Text maxFontSizeMultiplier={1.4} style={[styles.monthDayText, { color: done ? solidAccentText : date < today ? colors.mutedForeground : colors.foreground }]}>{Number(date.slice(-2))}</Text>}
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
  const { height } = useWindowDimensions();
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [minimumDraft, setMinimumDraft] = useState('');
  const [minimumSaving, setMinimumSaving] = useState(false);
  const mutationBusyRef = useRef(false);
  const [focusLog, setFocusLog] = useState<FocusLogEntry[]>([]);
  const [focusState, setFocusState] = useState<'loading' | 'ready' | 'error'>('loading');
  const now = useLocalClock();
  const localDay = toLocalDateString(now);

  const chain = chains.find((c) => c.id === id);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  function handleBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    if (!chain) {
      setFocusLog([]);
      return;
    }
    setFocusState('loading');
    void readRhythmFocusLog()
      .then((entries) => {
        if (!cancelled) {
          setFocusLog(entries);
          setFocusState('ready');
        }
      })
      .catch((error) => {
        if (!cancelled) setFocusState('error');
        reportDiagnostic({ area: 'storage', operation: 'chainDetail.focusLog', severity: 'warning', error });
      });
    return () => { cancelled = true; };
  }, [chain?.id, localDay]));

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
  const commitment = getChainCommitmentStatus(chain);
  const isWeekly = chain.cadence === 'weekly';
  const done = isCompletedToday(chain);
  const frozen = isFrozenToday(chain);
  const freezeTokens = getRemainingFreezeTokens(chain);
  const freezeRecoveryRemaining = freezeTokens < 2 ? Math.max(0, 14 - chain.freezeRecoveryProgress) : 0;
  const totalProtected = chain.completedDates.length + chain.minimumDates.length;
  const restingToday = commitment.status === 'rest';
  const weeklyProgress = chain.cadence === 'weekly' ? getWeeklyProgress(chain) : 0;
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekStartKey = toLocalDateString(weekStart);
  const todayKey = getTodayStr();
  const weeklyKeptDays = new Set(
    [...chain.completedDates, ...chain.minimumDates].filter((date) => date >= weekStartKey && date <= todayKey),
  ).size;
  const weeklyFocus = focusLog.filter((entry) => entry.chainId === chain.id && entry.date >= weekStartKey && entry.date <= todayKey && entry.source === 'timer');
  const weeklyFocusMinutes = weeklyFocus.reduce((total, entry) => total + entry.minutes, 0);
  const weeklyFocusLabel = weeklyFocusMinutes < 1 ? 'Less than 1 focus minute' : `${Math.floor(weeklyFocusMinutes)} focus minute${Math.floor(weeklyFocusMinutes) === 1 ? '' : 's'}`;
  const accentText = readableAccentColor(chain.color, colors.cardSolid);
  const solidAccentText = readableTextColor(chain.color);

  async function commitChainChange(
    action: () => Promise<ChainMutationResult>,
    title = 'Chain not updated',
    message = 'Chain couldn’t save that change. Your previous setting has been restored.',
  ) {
    if (mutationBusyRef.current) return false;
    mutationBusyRef.current = true;
    setSettingsSaving(true);
    try {
      const result = await action();
      if (result.status === 'persisted') return true;
      playFeedback('error');
      Alert.alert(title, message);
      return false;
    } catch (error) {
      reportDiagnostic({ area: 'storage', operation: 'chainDetail.setting', severity: 'error', error });
      playFeedback('error');
      Alert.alert(title, 'Chain couldn’t confirm that this change was saved. Please try again.');
      return false;
    } finally {
      mutationBusyRef.current = false;
      setSettingsSaving(false);
    }
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
    if (!chain || isWeekly || freezeTokens === 0) return;
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

  function openSettings() {
    if (!chain) return;
    setMinimumDraft(chain.minimumLabel);
    setSettingsSection(null);
    setSettingsOpen(true);
  }

  function finishWithDraft(action: () => void) {
    if (settingsSaving || minimumSaving) return;
    if (chain && minimumDraft.trim() !== chain.minimumLabel) {
      Alert.alert('Discard minimum changes?', 'Your minimum version has not been saved yet.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => { setMinimumDraft(chain.minimumLabel); action(); } },
      ]);
      return;
    }
    action();
  }

  function closeSettings() {
    finishWithDraft(() => setSettingsOpen(false));
  }

  function toggleSettingsSection(section: Exclude<SettingsSection, null>) {
    finishWithDraft(() => setSettingsSection((current) => current === section ? null : section));
  }

  async function saveMinimum() {
    if (!chain || minimumSaving || !minimumDraft.trim()) return;
    setMinimumSaving(true);
    const updated = await commitChainChange(() => updateChainMinimumLabel(chain.id, minimumDraft));
    setMinimumSaving(false);
    if (!updated) return;
    setSettingsSection(null);
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
    if (new Set(restDays).size >= 7) {
      Alert.alert('Keep one active day', 'Choose up to six rest days so this Chain has a day to return to.');
      return;
    }
    const updated = await commitChainChange(() => updateChainRestDays(chain.id, restDays));
    if (!updated) return;
    playFeedback('selection');
  }

  function changeMonth(amount: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1, 12));
  }

  async function applyDayStatus(date: string, status: DayStatus) {
    if (!chain) return;
    if (isWeekly && status === 'frozen') return;
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
    if (!chain) return;
    const prettyDate = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric',
    });
    const note = isWeekly && chain.frozenDates.includes(date)
      ? `${prettyDate}\nThis saved freeze does not count towards your weekly goal. Replacing or clearing it returns its credit, up to the two-credit limit.`
      : prettyDate;
    Alert.alert('Update day', note, [
      { text: 'Done', onPress: () => { void applyDayStatus(date, 'done'); } },
      { text: 'Minimum version', onPress: () => { void applyDayStatus(date, 'minimum'); } },
      ...(!isWeekly ? [{ text: 'Freeze', onPress: () => { void applyDayStatus(date, 'frozen'); } }] : []),
      { text: isWeekly ? 'Clear entry' : 'Missed', style: 'destructive', onPress: () => { void applyDayStatus(date, 'missed'); } },
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
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: botPad + SPACE.xxl }]}
      >
        {/* Chain name + color bar */}
        <View style={[styles.titleRow]}>
          <View style={[styles.colorDot, { backgroundColor: chain.color }]} />
          <Text accessibilityRole="header" style={[styles.chainName, { color: colors.foreground }]}>
            {chain.name}
          </Text>
        </View>

        <SectionLabel>TODAY</SectionLabel>
        {!restingToday && (
          <Text style={[styles.todayStatus, { color: colors.mutedForeground }]}>
            {done ? 'Full version logged. Tap below to undo.'
              : commitment.status === 'minimum' ? `Minimum logged: ${chain.minimumLabel}. You can still do the full version.`
              : frozen ? 'Today is frozen. You can still log the full version.'
              : isWeekly && commitment.weeklyTargetMet ? 'Weekly goal met. Another check-in is optional.'
              : isWeekly ? `${Math.max(0, chain.weeklyTarget - weeklyProgress)} more day${chain.weeklyTarget - weeklyProgress === 1 ? '' : 's'} to reach your weekly goal.`
              : 'Ready for today’s check-in.'}
          </Text>
        )}
        {/* Today's action */}
        {restingToday ? (
          <Surface style={styles.restBanner}>
            <ChainSymbol name="rest" size={19} color={accentText} />
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
              accessibilityLabel={done ? `Remove today's completion for ${chain.name}` : commitment.status === 'minimum' ? `Upgrade today's minimum to a full completion for ${chain.name}` : isWeekly && commitment.weeklyTargetMet ? `Log an optional extra day for ${chain.name}` : `Mark ${chain.name} done today`}
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
              <ChainSymbol
                name={done ? 'check' : commitment.status === 'minimum' ? 'minimum' : 'empty'}
                size={21}
                color={done ? solidAccentText : commitment.status === 'minimum' ? accentText : colors.mutedForeground}
              />
              <Text style={[styles.actionBtnText, { color: done ? solidAccentText : colors.foreground }]}>
                {done ? 'Logged today' : commitment.status === 'minimum' ? 'Mark full version' : isWeekly && commitment.weeklyTargetMet ? 'Log an extra day' : isWeekly ? 'Log today' : 'Mark done today'}
              </Text>
            </AnimatedPressable>

            {!isWeekly && <AnimatedPressable
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
              <ChainSymbol name="freeze" size={19} color="#5B8CFF" />
              <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Freeze · {freezeTokens}</Text>
            </AnimatedPressable>}
          </View>
        )}

        {!restingToday && !done && !frozen && commitment.status !== 'minimum' && !commitment.weeklyTargetMet && (
          <AnimatedPressable
            onPress={() => { void applyDayStatus(todayKey, 'minimum'); }}
            accessibilityRole="button"
            accessibilityLabel={'Log minimum for ' + chain.name + ': ' + chain.minimumLabel}
            accessibilityState={{ disabled: settingsSaving }}
            disabled={settingsSaving}
            style={styles.minimumShortcut}
            scaleTo={0.99}
          >
            <ChainSymbol name="minimum" size={16} color={colors.mutedForeground} />
            <Text style={[styles.minimumShortcutText, { color: colors.mutedForeground }]}>Log minimum · {chain.minimumLabel}</Text>
          </AnimatedPressable>
        )}

        <Surface style={styles.weekReflection}>
          <View style={[styles.weekReflectionIcon, { backgroundColor: chain.color + '18' }]}><Ionicons name="analytics-outline" size={17} color={accentText} /></View>
          <View style={styles.rhythmCopy}>
            <Text style={[styles.rhythmEyebrow, { color: accentText }]}>THIS WEEK</Text>
            <Text style={[styles.weekReflectionTitle, { color: colors.foreground }]}>
              {isWeekly ? `${weeklyProgress}/${chain.weeklyTarget} days logged` : `${weeklyKeptDays} day${weeklyKeptDays === 1 ? '' : 's'} kept`}
            </Text>
            <Text style={[styles.rhythmBody, { color: colors.mutedForeground }]}>
              {focusState === 'loading' ? 'Loading focus history…'
                : focusState === 'error' ? 'Focus history is unavailable. Open Rhythm to retry.'
                : weeklyFocus.length ? `${weeklyFocusLabel} logged across ${weeklyFocus.length} block${weeklyFocus.length === 1 ? '' : 's'}.`
                : 'Full and minimum versions both count.'}
            </Text>
          </View>
        </Surface>

        {/* Calendar */}
        <SectionLabel>MONTHLY HISTORY</SectionLabel>
        <View style={[styles.calendarStreak, { backgroundColor: chain.color + '18', borderColor: chain.color + '55' }]}>
          <Ionicons name="flame" size={16} color={accentText} />
          <Text style={[styles.calendarStreakText, { color: accentText }]}>{streak} {chain.cadence === 'weekly' ? 'week' : 'day'} streak</Text>
          <Text style={[styles.calendarStreakSub, { color: colors.mutedForeground }]}>{totalProtected} days kept</Text>
        </View>
        <Surface style={styles.calendarCard}>
          <View style={styles.calendarInner}>
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
            {(!isWeekly || chain.frozenDates.length > 0) && <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: FROZEN_COLOR + '55', borderColor: FROZEN_COLOR, borderWidth: 1 }]} />
              <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>{isWeekly ? 'Saved freeze' : 'Frozen'}</Text>
            </View>}
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: 'transparent', borderColor: colors.border, borderWidth: 1 }]} />
              <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>{isWeekly ? 'Not logged' : 'Missed'}</Text>
            </View>
          </View>
          {isWeekly && chain.frozenDates.length > 0 && <Text style={[styles.calendarHint, { color: colors.mutedForeground, paddingHorizontal: SPACE.md, paddingBottom: SPACE.md }]}>Saved freezes stay in your history. They do not count towards a weekly goal.</Text>}
        </Surface>

        <Surface style={styles.disclosureCard}>
          <AnimatedPressable onPress={() => router.push({ pathname: '/rhythm/[id]', params: { id: chain.id } })} accessibilityRole="button" accessibilityLabel={'Open Rhythm for ' + chain.name} accessibilityHint="View your recorded patterns, focus history and milestones." style={styles.scheduleHeader}>
            <View style={[styles.scheduleIcon, { backgroundColor: chain.color + '18' }]}><Ionicons name="pulse-outline" size={19} color={accentText} /></View>
            <View style={styles.scheduleCopy}><Text style={[styles.scheduleTitle, { color: colors.foreground }]}>Rhythm</Text><Text style={[styles.scheduleBody, { color: colors.mutedForeground }]}>Your patterns, progress and focus</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
          </AnimatedPressable>
        </Surface>
        <Surface style={styles.disclosureCard}>
          <AnimatedPressable onPress={openSettings} accessibilityRole="button" accessibilityLabel="Chain settings" accessibilityHint="Opens schedule, minimum version and color options." style={styles.scheduleHeader}>
            <View style={[styles.scheduleIcon, { backgroundColor: chain.color + '18' }]}><Ionicons name="settings-outline" size={18} color={accentText} /></View>
            <View style={styles.scheduleCopy}><Text style={[styles.scheduleTitle, { color: colors.foreground }]}>Chain settings</Text><Text style={[styles.scheduleBody, { color: colors.mutedForeground }]}>Schedule, minimum version and color</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
          </AnimatedPressable>
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

      <Modal visible={settingsOpen} transparent statusBarTranslucent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={closeSettings}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.minimumModal}>
          <Pressable accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" disabled={settingsSaving || minimumSaving} onPress={closeSettings} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal importantForAccessibility="yes" onAccessibilityEscape={closeSettings} style={[styles.minimumSheet, { backgroundColor: colors.cardSolid, borderColor: colors.border, maxHeight: height - Math.max(topPad, SPACE.sm) }]}>
            <SheetHandle />
            <View style={[styles.minimumSheetHeader, styles.settingsHeader]}>
              <View style={styles.minimumSheetHeading}><Text accessibilityRole="header" style={[styles.minimumSheetTitle, { color: colors.foreground }]}>Chain settings</Text><Text numberOfLines={2} style={[styles.scheduleBody, { color: colors.mutedForeground }]}>{chain.name}</Text></View>
              <AnimatedPressable accessibilityRole="button" accessibilityLabel="Close chain settings" accessibilityState={{ disabled: settingsSaving || minimumSaving }} disabled={settingsSaving || minimumSaving} onPress={closeSettings} scaleTo={0.94} style={styles.minimumSheetClose}><Ionicons name="close" size={22} color={colors.mutedForeground} /></AnimatedPressable>
            </View>
            <ScrollView style={styles.settingsScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false} contentContainerStyle={styles.settingsContent}>
              <View style={[styles.settingsGroup, { borderColor: colors.border }]}>
                <SettingsRow title="Accent" summary={CHAIN_COLOR_NAMES[chain.color] || 'Custom color'} icon="color-palette-outline" active={settingsSection === 'accent'} disabled={settingsSaving || minimumSaving} color={chain.color} onPress={() => toggleSettingsSection('accent')} />
                {settingsSection === 'accent' && <View style={styles.settingsExpanded}>
                  <View accessibilityRole="radiogroup" accessibilityLabel="Chain accent" style={styles.colorRow}>
                    {[...CHAIN_COLORS, ...EXTRA_CHAIN_COLORS].map((color) => {
                      const selected = color === chain.color;
                      return <AnimatedPressable key={color} accessibilityRole="radio" accessibilityLabel={(CHAIN_COLOR_NAMES[color] || 'Custom') + ' chain color'} accessibilityState={{ checked: selected, disabled: settingsSaving }} disabled={settingsSaving} onPress={() => { void handleColorChange(color); }} style={[styles.colorRing, { borderColor: selected ? color : 'transparent' }]} scaleTo={0.92}><View style={[styles.colorSwatch, { backgroundColor: color }]}>{selected && <ChainSymbol name="check" size={16} color={readableTextColor(color)} />}</View></AnimatedPressable>;
                    })}
                  </View>
                  <Text style={[styles.settingsHint, { color: colors.mutedForeground }]}>A color to recognize this Chain at a glance.</Text>
                </View>}

                <View style={[styles.settingsDivider, { backgroundColor: colors.border }]} />
                <SettingsRow title={isWeekly ? 'Weekly goal' : 'Schedule'} summary={isWeekly ? chain.weeklyTarget + ' days each week' : chain.restDays.length ? SCHEDULE_DAYS.filter(({ value }) => chain.restDays.includes(value)).map(({ label }) => label).join(', ') + ' off' : 'Every day'} icon="calendar-outline" active={settingsSection === 'schedule'} disabled={settingsSaving || minimumSaving} color={chain.color} onPress={() => toggleSettingsSection('schedule')} />
                {settingsSection === 'schedule' && <View style={styles.settingsExpanded}>
                  <Text style={[styles.scheduleHint, { color: colors.mutedForeground }]}>{isWeekly ? 'Choose how many days to check in each week. Full and minimum versions count.' : 'Choose rest days. Keep at least one active day each week.'}</Text>
                  <View pointerEvents={settingsSaving ? 'none' : 'auto'} accessibilityElementsHidden={settingsSaving} style={styles.scheduleSelector}>
                    <SevenChoiceSelector options={isWeekly ? WEEKLY_TARGET_OPTIONS : REST_DAY_OPTIONS} selectionMode={isWeekly ? 'single' : 'multiple'} selectedValues={isWeekly ? [chain.weeklyTarget] : chain.restDays} onSelectionChange={(values) => { if (settingsSaving) return; if (isWeekly) { if (values[0] !== undefined) void changeWeeklyTarget(values[0]); } else void changeRestDays(values); }} accentColor={chain.color} selectedTextColor={solidAccentText} textColor={colors.mutedForeground} borderColor={colors.border} backgroundColor={colors.background} accessibilityLabel={isWeekly ? 'Weekly target' : 'Rest days'} />
                  </View>
                  <Text style={[styles.settingsHint, { color: colors.mutedForeground }]}>Changes save when you select them.</Text>
                </View>}

                <View style={[styles.settingsDivider, { backgroundColor: colors.border }]} />
                <SettingsRow title="Minimum version" summary={chain.minimumLabel} icon="leaf-outline" active={settingsSection === 'minimum'} disabled={settingsSaving || minimumSaving} color={chain.color} onPress={() => toggleSettingsSection('minimum')} />
                {settingsSection === 'minimum' && <View style={styles.settingsExpanded}>
                  <Text style={[styles.scheduleHint, { color: colors.mutedForeground }]}>What small, specific action still counts on a difficult day?</Text>
                  <TextInput accessibilityLabel="Minimum version" autoCapitalize="sentences" autoCorrect editable={!minimumSaving && !settingsSaving} maxLength={48} onChangeText={setMinimumDraft} onSubmitEditing={() => { void saveMinimum(); }} returnKeyType="done" selectTextOnFocus value={minimumDraft} style={[styles.minimumInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
                  <Text accessibilityLabel={minimumDraft.length + ' of 48 characters'} style={[styles.minimumCounter, { color: colors.mutedForeground }]}>{minimumDraft.length}/48</Text>
                  <AnimatedPressable accessibilityRole="button" accessibilityLabel="Save minimum version" accessibilityState={{ busy: minimumSaving, disabled: minimumSaving || settingsSaving || !minimumDraft.trim() }} disabled={minimumSaving || settingsSaving || !minimumDraft.trim()} onPress={() => { void saveMinimum(); }} style={[styles.minimumSave, { backgroundColor: chain.color, borderColor: chain.color, opacity: minimumSaving || settingsSaving || !minimumDraft.trim() ? OPACITY.disabled : 1 }]}><Text style={[styles.minimumSaveText, { color: solidAccentText }]}>{minimumSaving ? 'Saving…' : 'Save minimum'}</Text></AnimatedPressable>
                </View>}
              </View>

              {!isWeekly && freezeTokens < 2 && <View style={[styles.safetyNetCard, { backgroundColor: '#4488ff12', borderColor: '#4488ff44' }]}><View style={[styles.safetyNetIcon, { backgroundColor: '#4488ff22' }]}><ChainSymbol name="freeze" size={16} color="#4488ff" /></View><View style={styles.scheduleCopy}><Text style={[styles.safetyNetTitle, { color: '#4488ff' }]}>Safety net · {freezeTokens} available</Text><Text style={[styles.safetyNetBody, { color: colors.mutedForeground }]}>{freezeRecoveryRemaining} full check-in{freezeRecoveryRemaining === 1 ? '' : 's'} to restore one.</Text></View></View>}
              <AnimatedPressable onPress={handleDelete} disabled={settingsSaving || minimumSaving} accessibilityRole="button" accessibilityLabel={'Delete ' + chain.name} accessibilityState={{ disabled: settingsSaving || minimumSaving }} accessibilityHint="Asks for confirmation before permanently deleting this chain." style={[styles.deleteSetting, { borderColor: colors.border }]} scaleTo={0.98}><Ionicons name="trash-outline" size={20} color={colors.destructive} /><Text style={[styles.actionBtnText, { color: colors.destructive }]}>Delete chain</Text></AnimatedPressable>
            </ScrollView>
            <View style={[styles.settingsFooter, { paddingBottom: Math.max(insets.bottom, SPACE.md) }]}>
              <Text accessibilityLiveRegion="polite" style={[styles.settingsHint, { color: colors.mutedForeground }]}>{settingsSaving ? 'Saving…' : 'Accent and schedule save automatically.'}</Text>
              <AnimatedPressable onPress={closeSettings} accessibilityRole="button" accessibilityLabel="Done editing chain settings" accessibilityState={{ disabled: settingsSaving || minimumSaving }} disabled={settingsSaving || minimumSaving} style={[styles.minimumSave, { backgroundColor: colors.secondary, borderColor: colors.border }]}><Text style={[styles.minimumSaveText, { color: colors.foreground }]}>Done</Text></AnimatedPressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </AmbientScreen>
  );
}

function SettingsRow({ title, summary, icon, active, disabled, color, onPress }: {
  title: string;
  summary: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  active: boolean;
  disabled: boolean;
  color: string;
  onPress: () => void;
}) {
  const colors = useColors();
  const accent = readableAccentColor(color, colors.cardSolid);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={title + ', ' + summary}
      accessibilityState={{ expanded: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.scheduleHeader, { opacity: disabled ? OPACITY.disabled : 1 }]}
      scaleTo={0.99}
    >
      <View style={[styles.scheduleIcon, { backgroundColor: color + '18' }]}><Ionicons name={icon} size={18} color={accent} /></View>
      <View style={styles.scheduleCopy}>
        <Text style={[styles.settingsRowTitle, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.scheduleBody, { color: colors.mutedForeground }]}>{summary}</Text>
      </View>
      <Ionicons name={active ? 'chevron-up' : 'chevron-down'} size={17} color={colors.mutedForeground} />
    </AnimatedPressable>
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
  deleteSetting: { minHeight: CONTROL.buttonHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.xs, borderRadius: RADIUS.button, borderWidth: StyleSheet.hairlineWidth, padding: SPACE.sm },
  disclosureCard: { borderRadius: RADIUS.card, overflow: 'hidden' },
  settingsHeader: { paddingHorizontal: CONTROL.screenHorizontal, paddingTop: SPACE.xs, paddingBottom: SPACE.md },
  settingsScroll: { flexShrink: 1 },
  settingsContent: { paddingHorizontal: CONTROL.screenHorizontal, paddingBottom: SPACE.md, gap: SPACE.md },
  settingsGroup: { borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  settingsExpanded: { paddingHorizontal: SPACE.md, paddingBottom: SPACE.md },
  settingsDivider: { height: StyleSheet.hairlineWidth, marginLeft: SPACE.md },
  settingsFooter: { paddingHorizontal: CONTROL.screenHorizontal, paddingTop: SPACE.xs },
  settingsHint: { ...TYPE.caption, marginTop: SPACE.xs },
  settingsRowTitle: { ...TYPE.bodyStrong },
  todayStatus: { ...TYPE.body, marginTop: -SPACE.xs },
  minimumShortcut: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, minHeight: CONTROL.minimumTarget, paddingHorizontal: SPACE.sm, marginTop: -SPACE.sm },
  minimumShortcutText: { ...TYPE.caption, flex: 1 },
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
  minimumSheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.md,
  },
  minimumSheetHeading: { flex: 1, minWidth: 0, gap: SPACE.xxs },
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
  weekReflection: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm, borderRadius: RADIUS.card, padding: SPACE.md },
  weekReflectionIcon: { width: 36, height: 36, borderRadius: RADIUS.compact, alignItems: 'center', justifyContent: 'center' },
  weekReflectionTitle: { ...TYPE.bodyStrong, marginTop: SPACE.xxs },
  rhythmCopy: { flex: 1, minWidth: 0 },
  rhythmEyebrow: { ...TYPE.eyebrow },
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
    flexShrink: 1,
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
