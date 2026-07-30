import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
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
  getStreak,
  getWeeklyProgress,
  getTodayStr,
  isRestDay,
  toLocalDateString,
  useChains,
} from '@/context/ChainsContext';
import { FOCUS_LOG_KEY, FocusLogEntry } from '@/context/PlanContext';
import { getProgressionStage, PROGRESSION_STAGES } from '@/constants/progression';

const FROZEN_COLOR = '#5B8CFF';
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CALENDAR_DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const SCHEDULE_DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

const MINIMUM_PRESETS = ['5 min', 'One page', 'One set'] as const;

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
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
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
  const start = hour % 12 || 12;
  const end = ((hour + 2) % 12) || 12;
  return `${start} ${hour >= 12 ? 'PM' : 'AM'}–${end} ${hour + 2 >= 12 ? 'PM' : 'AM'}`;
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
        <Text key={`${label}-${index}`} style={[styles.monthDayLabel, { color: colors.mutedForeground }]}>{label}</Text>
      ))}
      {cells.map((date, index) => {
        if (!date) return <View key={`empty-${index}`} style={styles.monthCell} />;
        const done = chain.completedDates.includes(date);
        const minimum = chain.minimumDates.includes(date);
        const frozen = chain.frozenDates.includes(date);
        const rest = isRestDay(chain, date);
        const isToday = date === today;
        const isEditable = date >= editableFromKey && date <= today;
        const isFuture = date > today;
        const isBeforeChain = date < chain.createdAt;
        const stateStyle = done
          ? { backgroundColor: accent, borderColor: accent, shadowColor: accent, shadowOpacity: 0.72, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 5 }
          : minimum
            ? { backgroundColor: accent + '50', borderColor: accent, shadowColor: accent, shadowOpacity: 0.36, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 3 }
          : frozen
            ? { backgroundColor: FROZEN_COLOR + '33', borderColor: FROZEN_COLOR }
            : rest
              ? { backgroundColor: colors.secondary, borderColor: colors.border }
            : !isFuture && !isBeforeChain
              ? { backgroundColor: 'transparent', borderColor: 'transparent' }
              : { backgroundColor: 'transparent', borderColor: 'transparent' };

        return (
          <Pressable
            key={date}
            disabled={!isEditable}
            accessibilityLabel={`${date}${done ? ', done' : frozen ? ', frozen' : ', missed'}`}
            onPress={() => onSelectDay(date)}
            style={({ pressed }) => [
              styles.monthCell,
              { opacity: isEditable && pressed ? 0.7 : isFuture || isBeforeChain ? 0.34 : 1 },
            ]}
          >
            <View style={[styles.monthDay, stateStyle, isToday && !done && !minimum && !frozen && { borderColor: chain.color, borderWidth: 2 }]}>
              {frozen ? <Ionicons name="snow" size={12} color={FROZEN_COLOR} /> : minimum ? <Ionicons name="leaf-outline" size={12} color={accent} /> : rest && !done ? <Ionicons name="remove" size={14} color={colors.mutedForeground} /> : <Text style={[styles.monthDayText, { color: done ? '#fff' : date < today ? colors.mutedForeground + 'ee' : colors.foreground }]}>{Number(date.slice(-2))}</Text>}
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
    seedChainRhythm,
    isReady,
  } = useChains();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [showMoreColors, setShowMoreColors] = useState(false);
  const [focusLog, setFocusLog] = useState<FocusLogEntry[]>([]);
  const touchStartX = useRef<number | null>(null);

  const chain = chains.find((c) => c.id === id);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  useEffect(() => {
    if (!chain) {
      setFocusLog([]);
      return;
    }
    void AsyncStorage.getItem(FOCUS_LOG_KEY).then((raw) => {
      try {
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        setFocusLog(Array.isArray(parsed) ? parsed as FocusLogEntry[] : []);
      } catch { setFocusLog([]); }
    });
  }, [chain?.id]);

  if (!chain) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, { top: topPad + 8, left: 16 }]}
        >
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </Pressable>
        <View style={styles.notFound}>
          <Text style={[styles.notFoundText, { color: colors.mutedForeground }]}>
            {isReady ? 'Chain not found' : 'Loading chain…'}
          </Text>
        </View>
      </View>
    );
  }

  const streak = getStreak(chain);
  const done = isCompletedToday(chain);
  const frozen = isFrozenToday(chain);
  const freezeTokens = getRemainingFreezeTokens(chain);
  const totalCompleted = chain.completedDates.length;
  const totalProtected = chain.completedDates.length + chain.minimumDates.length;
  const daysSinceStart = Math.max(1, Math.floor((new Date(`${getTodayStr()}T12:00:00`).getTime() - new Date(`${chain.createdAt}T12:00:00`).getTime()) / 86400000) + 1);
  const consistency = Math.min(100, Math.round((totalProtected / daysSinceStart) * 100));
  const restingToday = isRestDay(chain, getTodayStr());
  const weeklyProgress = chain.cadence === 'weekly' ? getWeeklyProgress(chain) : 0;
  const rhythm = rhythmFrom(chain, focusLog);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekStartKey = toLocalDateString(weekStart);
  const weeklyFocus = focusLog.filter((entry) => entry.chainId === chain.id && entry.date >= weekStartKey);
  const weeklyFocusMinutes = weeklyFocus.reduce((total, entry) => total + entry.minutes, 0);
  const stage = getProgressionStage(streak);
  const milestoneStages = PROGRESSION_STAGES.filter((item) => [7, 30, 100, 365].includes(item.at));
  const nextStage = milestoneStages.find((item) => item.at > streak);
  const stageStart = [...milestoneStages].reverse().find((item) => item.at <= streak)?.at ?? 0;
  const stageProgress = nextStage ? Math.min(1, Math.max(0, (streak - stageStart) / (nextStage.at - stageStart))) : 1;
  const stageUnit = chain.cadence === 'weekly' ? 'week' : 'day';

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
          onPress: () => {
            if (!chain) return;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            deleteChain(chain.id);
            router.replace('/');
          },
        },
      ],
    );
  }

  function handleToggle() {
    if (!chain) return;
    Haptics.impactAsync(
      done ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
    );
    toggleToday(chain.id);
  }

  function handleFreeze() {
    if (!chain || freezeTokens === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    useFreeze(chain.id);
  }

  function handleColorChange(color: string) {
    if (!chain || color === chain.color) return;
    Haptics.selectionAsync();
    updateChainColor(chain.id, color);
  }

  function editMinimum() {
    if (!chain) return;
    if (Platform.OS === 'ios') {
      Alert.prompt('Your minimum version', 'What still counts on a difficult day?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Save', onPress: (value?: string) => updateChainMinimumLabel(chain.id, value || '') }], 'plain-text', chain.minimumLabel);
      return;
    }
    Alert.alert('Your minimum version', `Currently: ${chain.minimumLabel}`);
  }

  function enableGodMode() {
    if (!chain) return;
    seedChainRhythm(chain.id);
    const now = new Date();
    const entries: FocusLogEntry[] = Array.from({ length: 18 }, (_, index) => {
      const date = new Date(now);
      date.setDate(now.getDate() - index - 1);
      date.setHours(8 + (date.getDay() === 3 ? 0 : 1), date.getDay() === 3 ? 42 : 18, 0, 0);
      return { itemId: `god-${chain.id}-${index}`, chainId: chain.id, date: toLocalDateString(date), minutes: date.getDay() === 3 ? 120 : 60, completedAt: date.toISOString() };
    });
    void AsyncStorage.getItem(FOCUS_LOG_KEY).then((raw) => {
      let existing: FocusLogEntry[] = [];
      try { const parsed: unknown = raw ? JSON.parse(raw) : []; existing = Array.isArray(parsed) ? parsed as FocusLogEntry[] : []; } catch { /* use empty log */ }
      const next = [...existing.filter((entry) => !entry.itemId.startsWith(`god-${chain.id}-`)), ...entries];
      void AsyncStorage.setItem(FOCUS_LOG_KEY, JSON.stringify(next));
      setFocusLog(next);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    });
  }

  function toggleRestDay(day: number) {
    if (!chain) return;
    Haptics.selectionAsync();
    updateChainRestDays(chain.id, chain.restDays.includes(day) ? chain.restDays.filter((item) => item !== day) : [...chain.restDays, day]);
  }

  function changeMonth(amount: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1, 12));
  }

  function applyDayStatus(date: string, status: DayStatus) {
    if (!chain) return;
    const updated = setDayStatus(chain.id, date, status);
    if (!updated) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('No freezes left', 'Each month includes up to two freeze days.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function handleSelectDay(date: string) {
    const prettyDate = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
    Alert.alert('Update day', prettyDate, [
      { text: 'Done', onPress: () => applyDayStatus(date, 'done') },
      { text: 'Minimum version', onPress: () => applyDayStatus(date, 'minimum') },
      { text: 'Freeze', onPress: () => applyDayStatus(date, 'frozen') },
      { text: 'Missed', style: 'destructive', onPress: () => applyDayStatus(date, 'missed') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Nav bar */}
      <View style={[styles.navBar, { paddingTop: topPad + 4 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn2}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </Pressable>
        <Pressable onPress={handleDelete} hitSlop={12} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={20} color={colors.destructive} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: botPad + 40 }]}
      >
        {/* Chain name + color bar */}
        <View style={[styles.titleRow]}>
          <View style={[styles.colorDot, { backgroundColor: chain.color }]} />
          <Text style={[styles.chainName, { color: colors.foreground }]}>
            {chain.name}
          </Text>
        </View>

        <View style={styles.accentSection}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>CHAIN ACCENT</Text>
          <View style={styles.colorRow}>
            {[...CHAIN_COLORS, ...(showMoreColors ? EXTRA_CHAIN_COLORS : [])].map((color) => {
              const selected = color === chain.color;
              return (
                <Pressable
                  key={color}
                  accessibilityLabel={`Use ${color} for ${chain.name}`}
                  onPress={() => handleColorChange(color)}
                  style={({ pressed }) => [
                    styles.colorRing,
                    {
                      borderColor: selected ? color : 'transparent',
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <View style={[styles.colorSwatch, { backgroundColor: color }]}>
                    {selected && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </View>
                </Pressable>
              );
            })}
            <Pressable onPress={() => setShowMoreColors((open) => !open)} style={({ pressed }) => [styles.colorRing, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><View style={[styles.colorSwatch, { backgroundColor: colors.card }]}><Ionicons name={showMoreColors ? 'chevron-up' : 'chevron-down'} size={15} color={colors.mutedForeground} /></View></Pressable>
          </View>
        </View>

        <View style={[styles.scheduleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable onPress={() => setScheduleOpen((open) => !open)} style={styles.scheduleHeader}>
            <View style={[styles.scheduleIcon, { backgroundColor: chain.color + '18' }]}><Ionicons name="calendar-outline" size={17} color={chain.color} /></View>
            <View style={styles.scheduleCopy}><Text style={[styles.scheduleTitle, { color: colors.foreground }]}>{chain.cadence === 'weekly' ? 'Weekly goal' : 'Weekly schedule'}</Text><Text style={[styles.scheduleBody, { color: colors.mutedForeground }]}>{chain.cadence === 'weekly' ? `${weeklyProgress}/${chain.weeklyTarget} days this week` : chain.restDays.length ? `${SCHEDULE_DAYS.filter(({ value }) => chain.restDays.includes(value)).map(({ label }) => label).join(', ')} off` : 'Every day counts'}</Text></View>
            <Ionicons name={scheduleOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
          </Pressable>
          {scheduleOpen && (chain.cadence === 'weekly' ? <View style={styles.scheduleExpanded}><Text style={[styles.scheduleHint, { color: colors.mutedForeground }]}>Reach your target in a week to extend your week streak.</Text><View style={styles.weekDays}>{[1, 2, 3, 4, 5, 6, 7].map((target) => { const selected = target === chain.weeklyTarget; return <Pressable key={target} onPress={() => { Haptics.selectionAsync(); updateChainCadence(chain.id, 'weekly', target); }} style={[styles.weekDay, { backgroundColor: selected ? chain.color : colors.background, borderColor: selected ? chain.color : colors.border }]}><Text style={[styles.weekDayText, { color: selected ? '#fff' : colors.mutedForeground }]}>{target}</Text></Pressable>; })}</View></View> : <View style={styles.scheduleExpanded}><Text style={[styles.scheduleHint, { color: colors.mutedForeground }]}>Choose rest days. They never break your streak.</Text><View style={styles.weekDays}>{SCHEDULE_DAYS.map(({ label, value }) => { const isRest = chain.restDays.includes(value); return <Pressable key={label} onPress={() => toggleRestDay(value)} style={[styles.weekDay, { backgroundColor: isRest ? chain.color : colors.background, borderColor: isRest ? chain.color : colors.border }]}><Text style={[styles.weekDayText, { color: isRest ? '#fff' : colors.mutedForeground }]}>{label.slice(0, 1)}</Text></Pressable>; })}</View></View>)}
        </View>

        <View style={[styles.minimumPanel, { backgroundColor: chain.color + '12', borderColor: chain.color + '44' }]}>
          <Pressable onPress={editMinimum} style={({ pressed }) => [styles.minimumCard, { opacity: pressed ? 0.8 : 1 }]}><View style={[styles.scheduleIcon, { backgroundColor: chain.color + '20' }]}><Ionicons name="leaf-outline" size={17} color={chain.color} /></View><View style={styles.scheduleCopy}><Text style={[styles.scheduleTitle, { color: colors.foreground }]}>Minimum version</Text><Text style={[styles.scheduleBody, { color: colors.mutedForeground }]}>{chain.minimumLabel} · tap to edit</Text></View><Ionicons name="chevron-forward" size={17} color={chain.color} /></Pressable>
          <View style={styles.minimumPresetRow}>{MINIMUM_PRESETS.map((preset) => <Pressable key={preset} onPress={() => { Haptics.selectionAsync(); updateChainMinimumLabel(chain.id, preset); }} style={({ pressed }) => [styles.minimumPreset, { backgroundColor: chain.minimumLabel === preset ? chain.color + '28' : colors.card, borderColor: chain.minimumLabel === preset ? chain.color : colors.border, opacity: pressed ? 0.7 : 1 }]}><Text style={[styles.minimumPresetText, { color: chain.minimumLabel === preset ? chain.color : colors.mutedForeground }]}>{preset}</Text></Pressable>)}<Pressable onPress={editMinimum} style={({ pressed }) => [styles.minimumPreset, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><Ionicons name="create-outline" size={12} color={colors.mutedForeground} /><Text style={[styles.minimumPresetText, { color: colors.mutedForeground }]}>Custom</Text></Pressable></View>
        </View>

        {/* Streak hero */}
        <View style={[styles.streakHero, { backgroundColor: chain.color + '14', borderColor: chain.color + '33' }]}>
          <Text style={[styles.streakNumber, { color: chain.color }]}>{streak}</Text>
          <Text style={[styles.streakWord, { color: colors.mutedForeground }]}>
            {chain.cadence === 'weekly' ? 'week streak' : 'day streak'}
          </Text>
          <Text style={[styles.streakSub, { color: colors.mutedForeground }]}>
            {chain.cadence === 'weekly' ? `${weeklyProgress}/${chain.weeklyTarget} days this week` : `${totalCompleted} total completed`}
          </Text>
          <View style={[styles.stagePill, { backgroundColor: chain.color + '22' }]}><Text style={[styles.stageText, { color: chain.color }]}>{stage.label.toUpperCase()} · {stage.copy}</Text></View>
          {nextStage ? <View style={styles.nextStage}><View style={[styles.nextStageTrack, { backgroundColor: chain.color + '22' }]}><View style={[styles.nextStageFill, { backgroundColor: chain.color, width: `${Math.max(5, stageProgress * 100)}%` }]} /></View><Text style={[styles.nextStageText, { color: colors.mutedForeground }]}>{nextStage.at - streak} {stageUnit}{nextStage.at - streak === 1 ? '' : 's'} to {nextStage.label}</Text></View> : <Text style={[styles.nextStageText, { color: chain.color }]}>Your long-term rhythm is built.</Text>}
        </View>

        <View style={[styles.milestoneCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.milestoneTitle, { color: colors.mutedForeground }]}>MILESTONES</Text><View style={styles.milestoneRow}>{PROGRESSION_STAGES.filter((item) => [1, 7, 30, 100, 365].includes(item.at)).map((milestone) => { const unlocked = streak >= milestone.at; return <View key={milestone.key} style={styles.milestoneItem}><View style={[styles.milestoneDot, { backgroundColor: unlocked ? chain.color : colors.background, borderColor: unlocked ? chain.color : colors.border }]}><Ionicons name={unlocked ? 'checkmark' : 'lock-closed'} size={12} color={unlocked ? '#fff' : colors.mutedForeground} /></View><Text style={[styles.milestoneLabel, { color: unlocked ? chain.color : colors.mutedForeground }]}>{milestone.at === 365 ? '1y' : milestone.at}</Text></View>; })}</View></View>

        <View style={[styles.insightsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.insight}><Text style={[styles.insightValue, { color: chain.color }]}>{consistency}%</Text><Text style={[styles.insightLabel, { color: colors.mutedForeground }]}>CONSISTENCY</Text></View>
          <View style={[styles.insightDivider, { backgroundColor: colors.border }]} />
          <View style={styles.insight}><Text style={[styles.insightValue, { color: colors.foreground }]}>{totalProtected}</Text><Text style={[styles.insightLabel, { color: colors.mutedForeground }]}>DAYS KEPT</Text></View>
          <View style={[styles.insightDivider, { backgroundColor: colors.border }]} />
          <View style={styles.insight}><Text style={[styles.insightValue, { color: '#5B8CFF' }]}>{chain.frozenDates.length}</Text><Text style={[styles.insightLabel, { color: colors.mutedForeground }]}>PROTECTED</Text></View>
        </View>

        <View style={[styles.rhythmCard, { backgroundColor: chain.color + '10', borderColor: chain.color + '38' }]}>
          <View style={[styles.rhythmIcon, { backgroundColor: chain.color + '20' }]}><Ionicons name="pulse-outline" size={18} color={chain.color} /></View>
          <View style={styles.rhythmCopy}><Text style={[styles.rhythmEyebrow, { color: chain.color }]}>RHYTHM</Text><Text style={[styles.rhythmTitle, { color: colors.foreground }]}>{rhythm.samples >= 3 ? `You usually protect this around ${readableHour(rhythm.hour)}.` : 'Your rhythm is still forming.'}</Text><Text style={[styles.rhythmBody, { color: colors.mutedForeground }]}>{rhythm.samples >= 3 ? `${DAY_LABELS[rhythm.day ?? 1]} is your strongest day${rhythm.minutes ? ` · ${Math.round(rhythm.minutes / 60 * 10) / 10}h of planned focus logged` : ''}.` : `Complete it a few more times and Chain will spot your best window${rhythm.minutes ? ` · ${Math.round(rhythm.minutes / 60 * 10) / 10}h of focus logged so far` : ''}.`}</Text></View>
        </View>
        <View style={[styles.weekReflection, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.weekReflectionIcon, { backgroundColor: chain.color + '18' }]}><Ionicons name="analytics-outline" size={17} color={chain.color} /></View><View style={styles.rhythmCopy}><Text style={[styles.rhythmEyebrow, { color: chain.color }]}>THIS WEEK</Text><Text style={[styles.weekReflectionTitle, { color: colors.foreground }]}>{weeklyFocusMinutes ? `${Math.floor(weeklyFocusMinutes / 60)}h ${weeklyFocusMinutes % 60}m focused on ${chain.name}` : `${totalProtected} days kept on ${chain.name}.`}</Text><Text style={[styles.rhythmBody, { color: colors.mutedForeground }]}>{weeklyFocus.length ? `${weeklyFocus.length} focus block${weeklyFocus.length === 1 ? '' : 's'} logged · You showed up for yourself.` : stage.key === 'starting-line' ? 'Your reflection becomes meaningful with your next session.' : stage.copy}</Text></View></View>
        <Pressable onPress={enableGodMode} style={({ pressed }) => [styles.godMode, { borderColor: chain.color + '44', opacity: pressed ? 0.7 : 1 }]}><Ionicons name="sparkles-outline" size={13} color={chain.color} /><Text style={[styles.godModeText, { color: chain.color }]}>God mode · simulate 3 weeks of rhythm</Text></Pressable>

        {/* Today's action */}
        {restingToday ? <View style={[styles.restBanner, { backgroundColor: colors.card, borderColor: colors.border }]}><Ionicons name="moon-outline" size={18} color={chain.color} /><View style={{ flex: 1 }}><Text style={[styles.restTitle, { color: colors.foreground }]}>Rest day</Text><Text style={[styles.restBody, { color: colors.mutedForeground }]}>Your streak is safe. Come back tomorrow.</Text></View></View> : <View style={styles.actionRow}>
          <Pressable
            onPress={handleToggle}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: done ? chain.color : colors.card,
                borderColor: done ? chain.color : colors.border,
                flex: 2,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Ionicons
              name={done ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={done ? '#fff' : colors.mutedForeground}
            />
            <Text
              style={[
                styles.actionBtnText,
                { color: done ? '#fff' : colors.mutedForeground },
              ]}
            >
              {done ? 'Logged today' : chain.cadence === 'weekly' ? 'Log today' : 'Mark done today'}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleFreeze}
            disabled={freezeTokens === 0 || done || frozen}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                flex: 1,
                opacity: freezeTokens === 0 || done || frozen ? 0.4 : pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="snow-outline" size={18} color="#4488ff" />
            <Text style={[styles.actionBtnText, { color: colors.mutedForeground }]}>
              Freeze ({freezeTokens})
            </Text>
          </Pressable>
        </View>}

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
        <Text
          style={[styles.sectionLabel, { color: colors.mutedForeground }]}
        >
          MONTHLY HISTORY
        </Text>
        <View style={[styles.calendarStreak, { backgroundColor: chain.color + '18', borderColor: chain.color + '55' }]}>
          <Ionicons name="flame" size={16} color={chain.color} />
          <Text style={[styles.calendarStreakText, { color: chain.color }]}>{streak} {chain.cadence === 'weekly' ? 'week' : 'day'} streak</Text>
          <Text style={[styles.calendarStreakSub, { color: colors.mutedForeground }]}>{totalProtected} days kept</Text>
        </View>
        <View
          style={[
            styles.calendarCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
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
              <Pressable
                onPress={() => changeMonth(-1)}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.monthNavButton,
                  { backgroundColor: colors.secondary, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Ionicons name="chevron-back" size={18} color={colors.foreground} />
              </Pressable>
              <Text style={[styles.monthTitle, { color: colors.foreground }]}>{formatMonth(month)}</Text>
              <Pressable
                onPress={() => changeMonth(1)}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.monthNavButton,
                  { backgroundColor: colors.secondary, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Ionicons name="chevron-forward" size={18} color={colors.foreground} />
              </Pressable>
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
        </View>

        {/* Started date */}
        <Text style={[styles.startedText, { color: colors.mutedForeground }]}>
          Started{' '}
          {new Date(chain.createdAt + 'T12:00:00').toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: {
    position: 'absolute',
    zIndex: 10,
    padding: 8,
  },
  backBtn2: {
    padding: 8,
  },
  deleteBtn: {
    padding: 8,
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  scroll: {
    paddingHorizontal: 20,
    gap: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accentSection: {
    gap: 8,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  colorRing: {
    borderRadius: 22,
    borderWidth: 2,
    padding: 3,
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
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    flex: 1,
  },
  scheduleCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  minimumPanel: { borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginTop: 10 },
  minimumCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 },
  minimumPresetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingHorizontal: 13, paddingBottom: 13 },
  minimumPreset: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6 },
  minimumPresetText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  scheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
  scheduleIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleCopy: { flex: 1 },
  scheduleTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  scheduleBody: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  scheduleExpanded: { borderTopWidth: 1, borderTopColor: '#ffffff12', padding: 14, paddingTop: 12 },
  scheduleHint: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17, marginBottom: 10 },
  weekDays: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDay: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  weekDayText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  streakHero: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 32,
    gap: 4,
  },
  streakNumber: {
    fontSize: 64,
    fontFamily: 'Inter_700Bold',
    lineHeight: 68,
  },
  streakWord: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  streakSub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 4,
  },
  stagePill: { alignSelf: 'center', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, marginTop: 10 },
  stageText: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.4, textAlign: 'center' },
  nextStage: { alignSelf: 'stretch', gap: 6, marginTop: 10 },
  nextStageTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  nextStageFill: { height: '100%', borderRadius: 3 },
  nextStageText: { fontSize: 11, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  milestoneCard: { borderRadius: 18, borderWidth: 1, padding: 14 },
  milestoneTitle: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.1, marginBottom: 12 },
  milestoneRow: { flexDirection: 'row', justifyContent: 'space-between' },
  milestoneItem: { alignItems: 'center', gap: 5, minWidth: 35 },
  milestoneDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  milestoneLabel: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  insightsCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, borderWidth: 1, paddingVertical: 14 },
  insight: { flex: 1, alignItems: 'center', gap: 3 },
  insightValue: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  insightLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  insightDivider: { width: 1, height: 28 },
  rhythmCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderRadius: 18, borderWidth: 1, padding: 14 },
  weekReflection: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderRadius: 18, borderWidth: 1, padding: 14 },
  weekReflectionIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  weekReflectionTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', lineHeight: 18, marginTop: 3 },
  rhythmIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rhythmCopy: { flex: 1 },
  rhythmEyebrow: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.1 },
  rhythmTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', lineHeight: 19, marginTop: 3 },
  rhythmBody: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 16, marginTop: 3 },
  godMode: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 7, marginTop: -5 },
  godModeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  restBanner: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderRadius: 18, padding: 15 },
  restTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  restBody: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  frozenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  frozenText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.2,
    marginTop: 4,
  },
  calendarCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  calendarStreak: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', borderRadius: 14, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 7, marginTop: -2, marginBottom: 10 },
  calendarStreakText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  calendarStreakSub: { fontSize: 11, fontFamily: 'Inter_500Medium', marginLeft: 2 },
  calendarInner: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  monthNavButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  monthDayLabel: {
    width: '14.2857%',
    textAlign: 'center',
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    marginBottom: 10,
  },
  monthCell: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  monthDay: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthDayText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  calendarHint: {
    marginTop: 8,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingBottom: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  startedText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginTop: 4,
  },
});
