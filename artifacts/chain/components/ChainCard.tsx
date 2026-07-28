import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
import { Chain, getStreak, getTodayStr, isRestDay, useChains } from '@/context/ChainsContext';
import WeekStrip from './WeekStrip';
import MilestoneModal from './MilestoneModal';

interface Props {
  chain: Chain;
}

const MILESTONES = new Set([7, 30, 100]);

// Extracted component so useAnimatedStyle is never called inside a .map()
export default function ChainCard({ chain }: Props) {
  const colors = useColors();
  const { toggleToday, isCompletedToday } = useChains();
  const done   = isCompletedToday(chain);
  const streak = getStreak(chain);
  const restingToday = isRestDay(chain, getTodayStr());

  const cardScale  = useSharedValue(1);
  const checkScale = useSharedValue(1);

  // Milestone celebration
  const [celebratingMilestone, setCelebratingMilestone] = useState<number | null>(null);
  const prevDoneRef = useRef(done);

  useEffect(() => {
    if (!prevDoneRef.current && done && MILESTONES.has(streak)) {
      setCelebratingMilestone(streak);
    }
    prevDoneRef.current = done;
  }, [done, streak]);

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
              <Text
                style={[styles.name, { color: colors.foreground }]}
                numberOfLines={1}
              >
                {chain.name}
              </Text>
              <View style={styles.rightSide}>
                <View style={styles.streakBlock}>
                  <Text style={[styles.streakNum, { color: chain.color }]}>
                    {streak}
                  </Text>
                  <Text style={[styles.streakLabel, { color: colors.mutedForeground }]}>
                    {streak === 1 ? 'day' : 'days'}
                  </Text>
                </View>
                <Pressable onPress={handleCheck} disabled={restingToday} hitSlop={14}>
                  <Animated.View style={checkStyle}>
                    <View
                      style={[
                        styles.checkBtn,
                        {
                          backgroundColor: done ? chain.color : restingToday ? colors.secondary : 'transparent',
                          borderColor:     done ? chain.color : restingToday ? colors.mutedForeground + '55' : colors.border,
                        },
                      ]}
                    >
                      {done ? <Ionicons name="checkmark" size={18} color="#fff" /> : restingToday ? <Ionicons name="moon-outline" size={17} color={colors.mutedForeground} /> : null}
                    </View>
                  </Animated.View>
                </Pressable>
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
    flex: 1,
    marginRight: 12,
  },
  rightSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  streakBlock: {
    alignItems: 'flex-end',
    gap: 0,
  },
  streakNum: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    lineHeight: 28,
  },
  streakLabel: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  checkBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
