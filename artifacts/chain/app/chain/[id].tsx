import React, { useState } from 'react';
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
  Chain,
  getStreak,
  getTodayStr,
  useChains,
} from '@/context/ChainsContext';

function CalendarGrid({ chain }: { chain: Chain }) {
  const colors = useColors();
  const today = getTodayStr();

  // Build 90 days arranged in weeks (Sunday-first)
  const NUM_WEEKS = 13;
  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const todayDate = new Date();
  const todayDow = todayDate.getDay();

  // Find the Sunday of the first week to show
  const firstSunday = new Date(todayDate);
  firstSunday.setDate(todayDate.getDate() - todayDow - (NUM_WEEKS - 1) * 7);

  // Build columns (each column = 1 week)
  const weeks: string[][] = [];
  for (let w = 0; w < NUM_WEEKS; w++) {
    const week: string[] = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(firstSunday);
      dt.setDate(firstSunday.getDate() + w * 7 + d);
      week.push(dt.toISOString().split('T')[0]);
    }
    weeks.push(week);
  }

  return (
    <View>
      {/* Day labels */}
      <View style={styles.calRow}>
        <View style={styles.calLabelCol} />
        {weeks.map((_, wi) => {
          const d = new Date(firstSunday);
          d.setDate(firstSunday.getDate() + wi * 7 + 1); // use Mon for month label
          const isFirstOfMonth = wi === 0 || d.getDate() <= 7;
          return (
            <View key={wi} style={styles.calWeekCol}>
              {isFirstOfMonth ? (
                <Text style={[styles.calMonthLabel, { color: colors.mutedForeground }]}>
                  {d.toLocaleDateString('en-US', { month: 'short' })}
                </Text>
              ) : (
                <View style={styles.calMonthLabel} />
              )}
            </View>
          );
        })}
      </View>

      {dayLabels.map((dl, di) => (
        <View key={di} style={styles.calRow}>
          <Text style={[styles.calDayLabel, { color: colors.mutedForeground }]}>
            {di % 2 === 1 ? dl : ''}
          </Text>
          {weeks.map((week, wi) => {
            const date = week[di];
            const completed = chain.completedDates.includes(date);
            const frozen = chain.frozenDates.includes(date);
            const isToday = date === today;
            const isFuture = date > today;

            return (
              <View key={wi} style={styles.calWeekCol}>
                <View
                  style={[
                    styles.calDot,
                    isFuture
                      ? { backgroundColor: 'transparent' }
                      : completed
                      ? { backgroundColor: chain.color }
                      : frozen
                      ? { backgroundColor: '#4488ff44' }
                      : { backgroundColor: colors.border },
                    isToday && !completed && !frozen && {
                      borderWidth: 1.5,
                      borderColor: chain.color,
                      backgroundColor: 'transparent',
                    },
                  ]}
                />
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export default function ChainDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { chains, deleteChain, toggleToday, useFreeze, isCompletedToday, isFrozenToday, getRemainingFreezeTokens } = useChains();

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
            Chain not found
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
        <View style={styles.actionRow}>
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
        </View>

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
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          LAST 90 DAYS
        </Text>
        <View style={[styles.calendarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.calendarInner}>
              <CalendarGrid chain={chain} />
            </View>
          </ScrollView>
          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: chain.color }]} />
              <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>Done</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#4488ff44' }]} />
              <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>Frozen</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.border }]} />
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
    padding: 16,
  },
  calRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  calLabelCol: {
    width: 16,
  },
  calDayLabel: {
    width: 16,
    fontSize: 9,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  calWeekCol: {
    width: 14,
    alignItems: 'center',
    marginHorizontal: 1,
  },
  calMonthLabel: {
    height: 14,
    fontSize: 8,
    fontFamily: 'Inter_500Medium',
  },
  calDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    paddingBottom: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  startedText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginTop: 4,
  },
});
