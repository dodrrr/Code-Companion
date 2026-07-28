import React, { useRef, useState } from 'react';
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
} from '@/constants/colors';
import {
  Chain,
  DayStatus,
  getStreak,
  getTodayStr,
  isRestDay,
  toLocalDateString,
  useChains,
} from '@/context/ChainsContext';

const FROZEN_COLOR = '#5B8CFF';
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const SCHEDULE_DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function formatMonth(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
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
  const today = getTodayStr();
  const editableFrom = new Date();
  editableFrom.setDate(editableFrom.getDate() - 3);
  const editableFromKey = toLocalDateString(editableFrom);
  const monthStart = startOfMonth(month);
  const firstDayOffset = monthStart.getDay();
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstDayOffset + 1;
    if (day < 1 || day > daysInMonth) return null;
    return toLocalDateString(new Date(monthStart.getFullYear(), monthStart.getMonth(), day, 12));
  });

  return (
    <View style={styles.monthGrid}>
      {DAY_LABELS.map((label, index) => (
        <Text key={`${label}-${index}`} style={[styles.monthDayLabel, { color: colors.mutedForeground }]}>{label}</Text>
      ))}
      {cells.map((date, index) => {
        if (!date) return <View key={`empty-${index}`} style={styles.monthCell} />;
        const done = chain.completedDates.includes(date);
        const frozen = chain.frozenDates.includes(date);
        const rest = isRestDay(chain, date);
        const isToday = date === today;
        const isEditable = date >= editableFromKey && date <= today;
        const isFuture = date > today;
        const isBeforeChain = date < chain.createdAt;
        const stateStyle = done
          ? { backgroundColor: chain.color, borderColor: chain.color }
          : frozen
            ? { backgroundColor: FROZEN_COLOR + '33', borderColor: FROZEN_COLOR }
            : rest
              ? { backgroundColor: colors.secondary, borderColor: colors.border }
            : !isFuture && !isBeforeChain
              ? { backgroundColor: colors.background, borderColor: colors.mutedForeground + '99' }
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
            <View style={[styles.monthDay, stateStyle, isToday && !done && !frozen && { borderColor: chain.color, borderWidth: 2 }]}>
              {frozen ? <Ionicons name="snow" size={12} color={FROZEN_COLOR} /> : rest && !done ? <Ionicons name="remove" size={14} color={colors.mutedForeground} /> : <Text style={[styles.monthDayText, { color: done ? '#fff' : colors.foreground }]}>{Number(date.slice(-2))}</Text>}
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
  const touchStartX = useRef<number | null>(null);

  const chain = chains.find((c) => c.id === id);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

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
  const restingToday = isRestDay(chain, getTodayStr());

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
            router.back();
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
            {CHAIN_COLORS.map((color) => {
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
          </View>
        </View>

        <View style={[styles.scheduleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable onPress={() => setScheduleOpen((open) => !open)} style={styles.scheduleHeader}>
            <View style={[styles.scheduleIcon, { backgroundColor: chain.color + '18' }]}><Ionicons name="calendar-outline" size={17} color={chain.color} /></View>
            <View style={styles.scheduleCopy}><Text style={[styles.scheduleTitle, { color: colors.foreground }]}>Weekly schedule</Text><Text style={[styles.scheduleBody, { color: colors.mutedForeground }]}>{chain.restDays.length ? `${SCHEDULE_DAYS.filter(({ value }) => chain.restDays.includes(value)).map(({ label }) => label).join(', ')} off` : 'Every day counts'}</Text></View>
            <Ionicons name={scheduleOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
          </Pressable>
          {scheduleOpen && <View style={styles.scheduleExpanded}><Text style={[styles.scheduleHint, { color: colors.mutedForeground }]}>Choose rest days. They never break your streak.</Text><View style={styles.weekDays}>{SCHEDULE_DAYS.map(({ label, value }) => { const isRest = chain.restDays.includes(value); return <Pressable key={label} onPress={() => toggleRestDay(value)} style={[styles.weekDay, { backgroundColor: isRest ? chain.color : colors.background, borderColor: isRest ? chain.color : colors.border }]}><Text style={[styles.weekDayText, { color: isRest ? '#fff' : colors.mutedForeground }]}>{label.slice(0, 1)}</Text></Pressable>; })}</View></View>}
        </View>

        {/* Streak hero */}
        <View style={[styles.streakHero, { backgroundColor: chain.color + '14', borderColor: chain.color + '33' }]}>
          <Text style={[styles.streakNumber, { color: chain.color }]}>{streak}</Text>
          <Text style={[styles.streakWord, { color: colors.mutedForeground }]}>
            {streak === 1 ? 'day streak' : 'day streak'}
          </Text>
          <Text style={[styles.streakSub, { color: colors.mutedForeground }]}>
            {totalCompleted} total completed
          </Text>
        </View>

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
              {done ? 'Done today' : 'Mark done today'}
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
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthDayText: {
    fontSize: 14,
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
