import React, { useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { getPlanTodayKey, parsePlanTimeSlot, toPlanDateKey } from '@/domain/plan';
import type { PlanItem } from '@/domain/plan';
import { readableAccentColor } from '@/constants/sectionTheme';
import { CONTROL, OPACITY, RADIUS, SPACE, TYPE } from '@/constants/designSystem';
import { GlassSurface } from '@/components/AmbientSurface';

type CalendarView = 'month' | 'year';

interface PlanCalendarProps {
  visible: boolean;
  activeDate: string;
  onClose: () => void;
  onSelect: (date: string) => Promise<void>;
  readYearSummary: (year: number) => Promise<Record<string, PlanItem[]>>;
  chainColors: Record<string, string>;
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTH_NAMES = Array.from({ length: 12 }, (_, month) =>
  new Date(2024, month, 1).toLocaleDateString('en-US', { month: 'long' }),
);

function monthCells(year: number, month: number): (number | null)[] {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= days; day += 1) cells.push(day);
  while (cells.length % 7) cells.push(null);
  return cells;
}

const NEUTRAL_TASK_COLOR = '#8FA2B3';

function taskColor(item: PlanItem, chainColors: Record<string, string>): string {
  return item.color || (item.chainId ? chainColors[item.chainId] : undefined) || NEUTRAL_TASK_COLOR;
}

function TaskDots({ items, chainColors, compact }: { items: PlanItem[]; chainColors: Record<string, string>; compact: boolean }) {
  if (!items.length) return null;
  const limit = compact ? 3 : 4;
  return <View style={compact ? styles.miniDotRow : styles.dotRow}>
    {items.slice(0, limit).map((item, index) => <View key={`${item.id}-${index}`} style={[compact ? styles.miniDot : styles.dot, { backgroundColor: taskColor(item, chainColors) }]} />)}
    {items.length > limit && <Text style={[compact ? styles.miniOverflow : styles.overflow, { color: '#B8B8BE' }]}>+</Text>}
  </View>;
}

function DayPreview({ date, items, chainColors, onOpenDay }: { date: string; items: PlanItem[]; chainColors: Record<string, string>; onOpenDay: () => void }) {
  const colors = useColors();
  const [year, month, day] = date.split('-').map(Number);
  const label = new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const sortTime = (item: PlanItem) => {
    const time = parsePlanTimeSlot(item.timeSlot);
    return time ? time.hour * 60 + time.minute : Number.POSITIVE_INFINITY;
  };
  const sorted = [...items].sort((a, b) => sortTime(a) - sortTime(b));
  return <View style={[styles.preview, { backgroundColor: colors.background, borderColor: colors.border }]}>
    <View style={styles.previewHeader}>
      <Text style={[styles.previewTitle, { color: colors.foreground }]}>{label}</Text>
      <Text style={[styles.previewCount, { color: colors.mutedForeground }]}>{items.length} {items.length === 1 ? 'task' : 'tasks'}</Text>
    </View>
    {items.length ? sorted.map((item, index) => {
      const accent = taskColor(item, chainColors);
      return <View key={`${item.id}-${index}`} style={styles.previewTask}>
        <View style={[styles.previewTaskDot, { backgroundColor: accent }]} />
        <View style={styles.previewTaskCopy}>
          <Text style={[styles.previewTaskText, { color: item.completed ? colors.mutedForeground : colors.foreground, textDecorationLine: item.completed ? 'line-through' : 'none' }]} numberOfLines={2}>{item.text}</Text>
          {!!item.timeSlot && <Text style={[styles.previewTaskTime, { color: readableAccentColor(accent, colors.background) }]}>{item.timeSlot}</Text>}
        </View>
        {item.completed && <Ionicons name="checkmark" size={16} color={colors.mutedForeground} />}
      </View>;
    }) : <Text style={[styles.previewEmpty, { color: colors.mutedForeground }]}>Nothing planned for this day yet.</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel={items.length ? `Open Plan for ${label}` : `Plan ${label}`} onPress={onOpenDay} style={({ pressed }) => [styles.openDay, { backgroundColor: colors.primary, opacity: pressed ? OPACITY.pressed : 1 }]}>
      <Text style={[styles.openDayText, { color: colors.primaryForeground }]}>{items.length ? 'Open day' : 'Plan this day'}</Text>
      <Ionicons name="arrow-forward" size={17} color={colors.primaryForeground} />
    </Pressable>
  </View>;
}

function CalendarMonth({ year, month, compact, activeDate, selectedDate, today, days, chainColors, onSelectDate, onOpenDay }: {
  year: number;
  month: number;
  compact: boolean;
  activeDate: string;
  selectedDate: string | null;
  today: string;
  days: Record<string, PlanItem[]>;
  chainColors: Record<string, string>;
  onSelectDate: (date: string) => void;
  onOpenDay: (date: string) => void;
}) {
  const colors = useColors();
  const cells = monthCells(year, month);
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  return (
    <View>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((label, index) => (
          <Text key={index} style={[compact ? styles.miniWeekday : styles.weekday, { color: colors.mutedForeground }]}>{label}</Text>
        ))}
      </View>
      {weeks.map((week, weekIndex) => <React.Fragment key={weekIndex}>
        <View style={styles.weekRow}>
          {week.map((day, index) => {
            if (day === null) return <View key={`blank-${index}`} style={styles.dayColumn} />;
            const date = toPlanDateKey(new Date(year, month, day));
            const selected = compact ? date === activeDate : date === selectedDate;
            const isToday = date === today;
            const isPast = date < today;
            const items = days[date] ?? [];
            if (compact) return <View key={date} style={styles.dayColumn}>
              <View style={[styles.miniDay, { backgroundColor: selected ? colors.primary + '25' : isToday ? colors.primary + '20' : 'transparent', opacity: isPast ? 0.35 : 1 }]}>
                <Text style={[styles.miniDayText, { color: selected || isToday ? colors.primary : colors.foreground }]}>{day}</Text>
                <TaskDots items={items} chainColors={chainColors} compact />
              </View>
            </View>;
            return <View key={date} style={styles.dayColumn}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${new Date(year, month, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}, ${items.length} planned ${items.length === 1 ? 'task' : 'tasks'}`}
                accessibilityState={{ selected, disabled: isPast }}
                disabled={isPast}
                onPress={() => onSelectDate(date)}
                style={({ pressed }) => [styles.day, { backgroundColor: selected ? colors.primary + '30' : isToday ? colors.primary + '20' : 'transparent', borderColor: selected ? colors.primary : 'transparent', borderWidth: selected ? 1 : 0, opacity: isPast ? 0.35 : pressed ? OPACITY.pressed : 1 }]}
              >
                <Text style={[styles.dayText, { color: selected || isToday ? colors.primary : colors.foreground }]}>{day}</Text>
                <TaskDots items={items} chainColors={chainColors} compact={false} />
              </Pressable>
            </View>;
          })}
        </View>
        {!compact && selectedDate && week.some((day) => day !== null && toPlanDateKey(new Date(year, month, day)) === selectedDate) &&
          <DayPreview date={selectedDate} items={days[selectedDate] ?? []} chainColors={chainColors} onOpenDay={() => onOpenDay(selectedDate)} />}
      </React.Fragment>)}
    </View>
  );
}

export function PlanCalendar({ visible, activeDate, onClose, onSelect, readYearSummary, chainColors }: PlanCalendarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<CalendarView>('month');
  const [year, setYear] = useState(() => Number(activeDate.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(activeDate.slice(5, 7)) - 1);
  const [days, setDays] = useState<Record<string, PlanItem[]>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const today = getPlanTodayKey();
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7)) - 1;

  useEffect(() => {
    if (!visible) return;
    setYear(Number(activeDate.slice(0, 4)));
    setMonth(Number(activeDate.slice(5, 7)) - 1);
    setView('month');
    setSelectedDate(null);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setDays({});
    setLoading(true);
    setLoadFailed(false);
    void readYearSummary(year)
      .then((summary) => { if (!cancelled) setDays(summary); })
      .catch(() => { if (!cancelled) { setDays({}); setLoadFailed(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [visible, year, retry, readYearSummary]);

  function changeMonth(offset: number) {
    const next = new Date(year, month + offset, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
    setSelectedDate(null);
  }

  async function chooseDate(date: string) {
    if (selecting) return;
    setSelecting(true);
    try {
      await onSelect(date);
    } catch {
      Alert.alert('Plan unavailable', 'This date could not be opened. Please try again.');
    } finally {
      setSelecting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 48 : insets.top + SPACE.sm }]}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>MAKE SPACE AHEAD</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Calendar</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close calendar" onPress={onClose} style={[styles.closeButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="close" size={22} color={colors.foreground} />
          </Pressable>
        </View>
        <View style={styles.toolbar}>
          <View style={[styles.segment, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {(['month', 'year'] as const).map((option) => (
              <Pressable key={option} accessibilityRole="button" accessibilityLabel={`${option === 'month' ? 'Month' : 'Year'} view`} accessibilityState={{ selected: view === option }} onPress={() => setView(option)} style={[styles.segmentButton, { backgroundColor: view === option ? colors.primary + '25' : 'transparent' }]}>
                <Text style={[styles.segmentText, { color: view === option ? colors.primary : colors.mutedForeground }]}>{option === 'month' ? 'Month' : 'Year'}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Go to current month" onPress={() => { setYear(currentYear); setMonth(currentMonth); setSelectedDate(null); setView('month'); }} style={styles.todayButton}>
            <Text style={[styles.todayText, { color: colors.primary }]}>Today</Text>
          </Pressable>
        </View>
        <View style={styles.periodBar}>
          <Text style={[styles.periodTitle, { color: colors.foreground }]}>{view === 'month' ? `${MONTH_NAMES[month]} ${year}` : year}</Text>
          <View style={styles.periodActions}>
            <Pressable accessibilityRole="button" accessibilityLabel={view === 'month' ? 'Previous month' : 'Previous year'} accessibilityState={{ disabled: view === 'month' ? year === currentYear && month <= currentMonth : year <= currentYear }} disabled={view === 'month' ? year === currentYear && month <= currentMonth : year <= currentYear} onPress={() => view === 'month' ? changeMonth(-1) : setYear((value) => value - 1)} style={styles.periodButton}>
              <Ionicons name="chevron-back" size={20} color={view === 'month' ? year === currentYear && month <= currentMonth ? colors.mutedForeground : colors.foreground : year <= currentYear ? colors.mutedForeground : colors.foreground} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={view === 'month' ? 'Next month' : 'Next year'} onPress={() => view === 'month' ? changeMonth(1) : setYear((value) => value + 1)} style={styles.periodButton}>
              <Ionicons name="chevron-forward" size={20} color={colors.foreground} />
            </Pressable>
          </View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, SPACE.lg) + SPACE.xl }]}>
          {loadFailed && <Pressable accessibilityRole="button" accessibilityLabel="Retry calendar loading" onPress={() => setRetry((value) => value + 1)} style={[styles.notice, { borderColor: colors.border }]}><Text style={[styles.noticeText, { color: colors.foreground }]}>Couldn’t show planned days. Tap to retry.</Text></Pressable>}
          {view === 'month' ? (
            <View style={[styles.monthCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <GlassSurface pointerEvents="none" style={StyleSheet.absoluteFill} />
              <CalendarMonth year={year} month={month} compact={false} activeDate={activeDate} selectedDate={selectedDate} today={today} days={days} chainColors={chainColors} onSelectDate={(date) => setSelectedDate((current) => current === date ? null : date)} onOpenDay={(date) => { void chooseDate(date); }} />
            </View>
          ) : (
            <View style={styles.yearGrid}>
              {MONTH_NAMES.map((name, index) => (
                <View key={name} style={[styles.miniCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Open ${name} ${year}`} onPress={() => { setMonth(index); setSelectedDate(null); setView('month'); }} style={styles.miniHeading}>
                    <Text style={[styles.miniTitle, { color: colors.foreground }]}>{name}</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
                  </Pressable>
                  <CalendarMonth year={year} month={index} compact activeDate={activeDate} selectedDate={null} today={today} days={days} chainColors={chainColors} onSelectDate={setSelectedDate} onOpenDay={(date) => { void chooseDate(date); }} />
                </View>
              ))}
            </View>
          )}
          <Text style={[styles.helper, { color: colors.mutedForeground }]}>{loading ? 'Loading planned days…' : 'Tap a day to see its tasks. Dots show their colors.'}</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: CONTROL.screenHorizontal, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: SPACE.lg },
  eyebrow: { ...TYPE.eyebrow, marginBottom: SPACE.xs },
  title: { ...TYPE.display },
  closeButton: { width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: CONTROL.screenHorizontal, marginBottom: SPACE.lg },
  segment: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.control, padding: SPACE.xxs },
  segmentButton: { minWidth: 75, minHeight: 36, borderRadius: RADIUS.compact, alignItems: 'center', justifyContent: 'center' },
  segmentText: { ...TYPE.metadata },
  todayButton: { minHeight: CONTROL.minimumTarget, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  todayText: { ...TYPE.bodyStrong },
  periodBar: { paddingHorizontal: CONTROL.screenHorizontal, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.md },
  periodTitle: { ...TYPE.sectionTitle, fontSize: 21 },
  periodActions: { flexDirection: 'row', gap: SPACE.xs },
  periodButton: { width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: CONTROL.screenHorizontal },
  monthCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.card, padding: SPACE.sm, overflow: 'hidden' },
  weekRow: { flexDirection: 'row', marginBottom: SPACE.xs },
  weekday: { flex: 1, textAlign: 'center', ...TYPE.metadata },
  miniWeekday: { flex: 1, textAlign: 'center', fontSize: 9, fontFamily: 'Inter_500Medium' },
  dayColumn: { width: '14.2857%', alignItems: 'center' },
  day: { width: '100%', maxWidth: CONTROL.minimumTarget, height: 52, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center', marginVertical: SPACE.xxs },
  dayText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: SPACE.xxs },
  dot: { width: 5, height: 5, borderRadius: 3 },
  overflow: { fontSize: 8, lineHeight: 8, fontFamily: 'Inter_600SemiBold' },
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: SPACE.sm },
  miniCard: { width: '48.5%', borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.control, paddingHorizontal: SPACE.xxs, paddingVertical: SPACE.xs },
  miniHeading: { minHeight: CONTROL.minimumTarget, paddingHorizontal: SPACE.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  miniTitle: { ...TYPE.metadata },
  miniDay: { width: '100%', maxWidth: 20, height: 25, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  miniDayText: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  miniDotRow: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  miniDot: { width: 3, height: 3, borderRadius: 2 },
  miniOverflow: { fontSize: 6, lineHeight: 6, fontFamily: 'Inter_600SemiBold' },
  preview: { borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.control, padding: SPACE.md, marginVertical: SPACE.xs, gap: SPACE.sm },
  previewHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: SPACE.xs },
  previewTitle: { ...TYPE.sectionTitle, flex: 1 },
  previewCount: { ...TYPE.metadata },
  previewTask: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: 32 },
  previewTaskDot: { width: 9, height: 9, borderRadius: 5 },
  previewTaskCopy: { flex: 1, gap: SPACE.hairline },
  previewTaskText: { ...TYPE.bodyStrong },
  previewTaskTime: { ...TYPE.caption },
  previewEmpty: { ...TYPE.body },
  openDay: { minHeight: CONTROL.minimumTarget, borderRadius: RADIUS.control, paddingHorizontal: SPACE.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACE.xxs },
  openDayText: { ...TYPE.bodyStrong },
  helper: { ...TYPE.caption, textAlign: 'center', marginTop: SPACE.lg },
  notice: { padding: SPACE.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.control, marginBottom: SPACE.sm },
  noticeText: { ...TYPE.caption },
});
