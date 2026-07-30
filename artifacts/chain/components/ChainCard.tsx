import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { Chain, getStreak, getTodayStr, getWeeklyProgress, isRestDay, useChains } from '@/context/ChainsContext';
import { getProgressionStage } from '@/constants/progression';
import WeekStrip from './WeekStrip';
import MilestoneModal from './MilestoneModal';

interface Props {
  chain: Chain;
}

const MILESTONES = new Set([7, 30, 100]);

// Extracted component so useAnimatedStyle is never called inside a .map()
export default function ChainCard({ chain }: Props) {
  const colors = useColors();
  const { toggleToday, isCompletedToday, isProtectedToday, isFrozenToday } = useChains();
  const done   = isCompletedToday(chain);
  const protectedToday = isProtectedToday(chain);
  const frozen = isFrozenToday(chain);
  const streak = getStreak(chain);
  const stage = getProgressionStage(streak);
  const restingToday = isRestDay(chain, getTodayStr());
  const weeklyProgress = chain.cadence === 'weekly' ? getWeeklyProgress(chain) : 0;
  const compactStreak = streak >= 100;

  const cardScale  = useSharedValue(1);
  const checkScale = useSharedValue(1);

  // Milestone celebration
  const [celebratingMilestone, setCelebratingMilestone] = useState<number | null>(null);
  const [celebratingExtra, setCelebratingExtra] = useState<number | null>(null);
  const prevDoneRef = useRef(protectedToday);
  const prevWeeklyProgressRef = useRef(weeklyProgress);

  useEffect(() => {
    if (!prevDoneRef.current && protectedToday && MILESTONES.has(streak)) {
      setCelebratingMilestone(streak);
    }
    prevDoneRef.current = protectedToday;
  }, [protectedToday, streak]);

  useEffect(() => {
    if (chain.cadence === 'weekly' && weeklyProgress > chain.weeklyTarget && weeklyProgress > prevWeeklyProgressRef.current) {
      setCelebratingExtra(weeklyProgress - chain.weeklyTarget);
    }
    prevWeeklyProgressRef.current = weeklyProgress;
  }, [chain.cadence, chain.weeklyTarget, weeklyProgress]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const handleCheck = useCallback(() => {
    if (restingToday) return;
    if (!done) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      checkScale.value = withSequence(
        withSpring(1.35, { damping: 3, stiffness: 500 }),
        withSpring(1, { damping: 8, stiffness: 300 }),
      );
      cardScale.value = withSequence(
        withTiming(0.97, { duration: 60 }),
        withSpring(1, { damping: 6, stiffness: 300 }),
      );
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    toggleToday(chain.id);
  }, [done, chain.id, restingToday, toggleToday, checkScale, cardScale]);

  const handleCardPress = useCallback(() => {
    router.push({ pathname: '/chain/[id]', params: { id: chain.id } });
  }, [chain.id]);

  return (
    <>
      <Pressable
        onPress={handleCardPress}
        style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}
      >
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
            cardStyle,
          ]}
        >
          {/* Color accent stripe */}
          <View style={[styles.stripe, { backgroundColor: chain.color }]} />

          <View style={styles.body}>
            {/* Top row: name + streak + check */}
            <View style={styles.topRow}>
              <View style={styles.nameBlock}>
                <Text
                  style={[styles.name, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {chain.name}
                </Text>
                <Text style={[styles.stageLabel, { color: chain.color }]} numberOfLines={1}>{stage.label.toUpperCase()}</Text>
              </View>
              <View style={styles.rightSide}>
                <View style={styles.streakBlock}>
                  <Text style={[styles.streakNum, compactStreak && styles.streakNumCompact, { color: chain.color }]}>
                    {streak}
                  </Text>
                  <Text style={[styles.streakLabel, { color: colors.mutedForeground }]}>
                    {chain.cadence === 'weekly' ? (streak === 1 ? 'week' : 'weeks') : streak === 1 ? 'day' : 'days'}
                  </Text>
                </View>
                <View style={chain.cadence === 'weekly' && styles.weeklyCheckBlock}>
                  <Pressable onPress={handleCheck} disabled={restingToday} hitSlop={14}>
                    <Animated.View style={checkStyle}>
                      <View
                        style={[
                          styles.checkBtn,
                          {
                            backgroundColor: protectedToday ? chain.color : frozen ? '#5B8CFF' : restingToday ? colors.secondary : 'transparent',
                            borderColor:     protectedToday ? chain.color : frozen ? '#5B8CFF' : restingToday ? colors.mutedForeground + '55' : colors.border,
                          },
                        ]}
                      >
                        {protectedToday ? <Ionicons name={done ? 'checkmark' : 'leaf-outline'} size={18} color="#fff" /> : frozen ? <Ionicons name="snow" size={17} color="#fff" /> : restingToday ? <Ionicons name="moon-outline" size={17} color={colors.mutedForeground} /> : null}
                      </View>
                    </Animated.View>
                  </Pressable>
                  {chain.cadence === 'weekly' && <Text style={[styles.weeklyProgress, { color: chain.color }]}>{weeklyProgress}/{chain.weeklyTarget}{weeklyProgress > chain.weeklyTarget ? ` · +${weeklyProgress - chain.weeklyTarget}` : ''}</Text>}
                </View>
              </View>
            </View>

            {/* 7-day dot strip */}
            <WeekStrip chain={chain} />
          </View>
        </Animated.View>
      </Pressable>

      {celebratingMilestone !== null && (
        <MilestoneModal
          streak={celebratingMilestone}
          chainName={chain.name}
          color={chain.color}
          onDismiss={() => setCelebratingMilestone(null)}
        />
      )}
      <ExtraWorkMoment extra={celebratingExtra} chain={chain} onClose={() => setCelebratingExtra(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  stripe: {
    width: 4,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  nameBlock: { flex: 1, marginRight: 12, gap: 3 },
  stageLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.9 },
  rightSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    flexShrink: 0,
  },
  streakBlock: {
    width: 62,
    alignItems: 'center',
    gap: 0,
  },
  streakNum: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    lineHeight: 28,
  },
  streakNumCompact: {
    fontSize: 23,
    lineHeight: 26,
  },
  streakLabel: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  checkBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weeklyCheckBlock: {
    alignItems: 'center',
    gap: 4,
  },
  weeklyProgress: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.4,
  },
  extraShade: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00000088', padding: 28 },
  extraCard: { width: '100%', maxWidth: 330, alignItems: 'center', borderRadius: 25, borderWidth: 1, padding: 28 },
  extraIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  extraEyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.4 },
  extraTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', letterSpacing: -0.4, marginTop: 6, textAlign: 'center' },
  extraBody: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20, marginTop: 7, textAlign: 'center' },
  extraButton: { alignSelf: 'stretch', alignItems: 'center', borderRadius: 17, paddingVertical: 13, marginTop: 22 },
  extraButtonText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_700Bold' },
});

function ExtraWorkMoment({ extra, chain, onClose }: { extra: number | null; chain: Chain; onClose: () => void }) {
  const colors = useColors();
  if (extra === null) return null;
  return <Modal transparent visible animationType="fade" onRequestClose={onClose}><View style={styles.extraShade}><View style={[styles.extraCard, { backgroundColor: colors.card, borderColor: chain.color + '66' }]}><View style={[styles.extraIcon, { backgroundColor: chain.color + '20' }]}><Ionicons name="sparkles" size={24} color={chain.color} /></View><Text style={[styles.extraEyebrow, { color: chain.color }]}>EXTRA WORK</Text><Text style={[styles.extraTitle, { color: colors.foreground }]}>You went beyond the goal.</Text><Text style={[styles.extraBody, { color: colors.mutedForeground }]}>+{extra} {extra === 1 ? 'extra day' : 'extra days'} for {chain.name} this week.</Text><Pressable onPress={onClose} style={[styles.extraButton, { backgroundColor: chain.color }]}><Text style={styles.extraButtonText}>Keep going</Text></Pressable></View></View></Modal>;
}
