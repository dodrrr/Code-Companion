import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import {
  Chain,
  getStreak,
  getTodayStr,
  getWeeklyProgress,
  getChainCommitmentStatus,
  isRestDay,
  useChains,
} from '@/context/ChainsContext';
import { getProgressionStage } from '@/constants/progression';
import { CONTROL, RADIUS, SPACE, TYPE } from '@/constants/designSystem';
import { readableAccentColor, readableTextColor } from '@/constants/sectionTheme';
import { playFeedback } from '@/lib/feedback';
import AnimatedPressable from './AnimatedPressable';
import WeekStrip from './WeekStrip';
import MilestoneModal from './MilestoneModal';
import { Surface } from './ui/AppUI';
import { ChainSymbol } from './ui/ChainSymbol';

interface Props {
  chain: Chain;
}

const MILESTONES = new Set([7, 30, 100]);
const FROZEN_COLOR = '#5B8CFF';
const GLASS_SURFACE_COLOR = '#121214';

export default function ChainCard({ chain }: Props) {
  const colors = useColors();
  const reducedMotion = useReducedMotion();
  const { toggleToday, isCompletedToday } = useChains();
  const today = getTodayStr();
  const commitment = getChainCommitmentStatus(chain, today);
  const done = isCompletedToday(chain);
  const minimum = chain.minimumDates.includes(today);
  const frozen = commitment.status === 'frozen';
  const keptToday = done || minimum;
  const streak = getStreak(chain);
  const stage = getProgressionStage(streak);
  const restingToday = isRestDay(chain, getTodayStr());
  const weeklyProgress = chain.cadence === 'weekly' ? getWeeklyProgress(chain) : 0;
  const compactStreak = streak >= 100;
  const readableAccent = readableAccentColor(chain.color, GLASS_SURFACE_COLOR, 4.8);
  const statusColor = frozen ? FROZEN_COLOR : keptToday ? chain.color : undefined;
  const statusForeground = statusColor ? readableTextColor(statusColor) : colors.mutedForeground;

  const [celebratingMilestone, setCelebratingMilestone] = useState<number | null>(null);
  const [celebratingExtra, setCelebratingExtra] = useState<number | null>(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const mutationBusyRef = useRef(false);
  const prevDoneRef = useRef(keptToday);
  const prevStreakRef = useRef(streak);
  const previousCompletedRef = useRef(done);
  const checkArrival = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (
      !prevDoneRef.current
      && keptToday
      && MILESTONES.has(streak)
      && (chain.cadence !== 'weekly' || streak > prevStreakRef.current)
    ) {
      setCelebratingMilestone(streak);
    }
    prevDoneRef.current = keptToday;
    prevStreakRef.current = streak;
  }, [chain.cadence, keptToday, streak]);

  useEffect(() => {
    if (celebratingExtra === null) return;
    const timer = setTimeout(() => setCelebratingExtra(null), 4000);
    return () => clearTimeout(timer);
  }, [celebratingExtra]);

  useEffect(() => {
    if (chain.cadence !== 'weekly' || weeklyProgress <= chain.weeklyTarget) {
      setCelebratingExtra(null);
    }
  }, [chain.cadence, chain.weeklyTarget, weeklyProgress]);

  useEffect(() => {
    const becameComplete = done && !previousCompletedRef.current;
    previousCompletedRef.current = done;

    if (reducedMotion) {
      checkArrival.setValue(1);
      return;
    }
    if (!becameComplete) return;

    checkArrival.setValue(0);
    const animation = Animated.timing(checkArrival, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [checkArrival, done, reducedMotion]);

  const handleCheck = useCallback(async () => {
    if (restingToday || mutationBusyRef.current) return;
    mutationBusyRef.current = true;
    setMutationBusy(true);
    const result = await toggleToday(chain.id);
    mutationBusyRef.current = false;
    setMutationBusy(false);
    if (result.status !== 'persisted') {
      setCelebratingExtra(null);
      setCelebratingMilestone(null);
      playFeedback('error');
      Alert.alert('Chain not updated', 'Chain couldn’t save that change. Your previous status has been restored.');
      return;
    }
    // Upgrading a minimum keeps the same logged day. Celebrate only a new day,
    // after storage confirms it, without interrupting the next Chain.
    if (chain.cadence === 'weekly' && !keptToday && weeklyProgress >= chain.weeklyTarget) {
      setCelebratingExtra(weeklyProgress + 1 - chain.weeklyTarget);
    } else {
      setCelebratingExtra(null);
    }
    playFeedback(done ? 'selection' : 'light');
  }, [done, chain.id, chain.cadence, chain.weeklyTarget, keptToday, restingToday, toggleToday, weeklyProgress]);

  const handleCardPress = useCallback(() => {
    router.push({ pathname: '/chain/[id]', params: { id: chain.id } });
  }, [chain.id]);

  const statusLabel = restingToday
    ? 'rest day'
    : frozen
      ? 'frozen today'
      : done
        ? 'completed today'
        : minimum
          ? 'minimum version logged today'
          : commitment.weeklyTargetMet
            ? 'weekly goal met, no entry today'
            : 'not yet logged today';

  return (
    <>
      <Surface accentColor={chain.color} style={styles.card}>
        <View style={[styles.stripe, { backgroundColor: chain.color }]} />
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={`${chain.name}, ${chain.cadence === 'weekly' ? `${weeklyProgress} of ${chain.weeklyTarget} days this week, ` : ''}${streak} ${chain.cadence === 'weekly' ? 'week' : 'day'} streak, ${statusLabel}`}
          accessibilityHint="Opens Chain details"
          onPress={handleCardPress}
          containerStyle={styles.detailsTarget}
          style={styles.body}
        >
          <View style={[styles.topRow, chain.cadence === 'weekly' && styles.topRowWeekly]}>
            <View style={styles.nameBlock}>
              <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={2}>
                {chain.name}
              </Text>
              <Text style={[styles.stageLabel, { color: readableAccent }]} numberOfLines={1}>
                {chain.cadence === 'weekly'
                  ? celebratingExtra !== null
                    ? 'ANOTHER DAY KEPT'
                    : `${streak}-WEEK STREAK`
                  : stage.label.toUpperCase()}
              </Text>
            </View>
            <View style={styles.streakBlock}>
              <Text
                style={[
                  styles.streakNum,
                  compactStreak && styles.streakNumCompact,
                  { color: readableAccent },
                ]}
              >
                {chain.cadence === 'weekly' ? `${weeklyProgress}/${chain.weeklyTarget}` : streak}
              </Text>
              <Text style={[styles.streakLabel, { color: colors.mutedForeground }]}>
                {chain.cadence === 'weekly'
                  ? 'this week'
                  : streak === 1 ? 'day' : 'days'}
              </Text>
            </View>
          </View>

          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <WeekStrip chain={chain} />
          </View>
        </AnimatedPressable>
        <View pointerEvents="box-none" style={styles.checkColumn}>
          <AnimatedPressable
            accessibilityRole="checkbox"
            accessibilityLabel={restingToday
              ? `${chain.name} is resting today`
              : frozen
                ? `Replace today's freeze with a completion for ${chain.name}`
                : minimum
                  ? `Complete ${chain.name}, minimum already logged today`
                  : commitment.weeklyTargetMet && !done
                    ? `Log an extra day for ${chain.name}, weekly goal already met`
                    : `${done ? 'Unmark' : 'Mark'} ${chain.name} for today`}
            accessibilityState={{ checked: done ? true : minimum ? 'mixed' : false, disabled: restingToday || mutationBusy, busy: mutationBusy }}
            disabled={restingToday || mutationBusy}
            onPress={handleCheck}
            scaleTo={0.94}
            style={[
              styles.checkButton,
              {
                backgroundColor: statusColor ?? (restingToday ? colors.secondary : 'transparent'),
                borderColor: statusColor ?? (restingToday ? colors.mutedForeground + '55' : colors.border),
              },
            ]}
          >
            {frozen ? (
              <ChainSymbol name="freeze" size={20} color={statusForeground} />
            ) : keptToday ? (
              done ? (
                <Animated.View
                  style={{
                    opacity: checkArrival,
                    transform: [{
                      scale: checkArrival.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }),
                    }],
                  }}
                >
                  <ChainSymbol name="check" size={22} color={statusForeground} />
                </Animated.View>
              ) : (
                <ChainSymbol name="minimum" size={20} color={statusForeground} />
              )
            ) : restingToday ? (
              <ChainSymbol name="rest" size={20} color={colors.mutedForeground} />
            ) : null}
          </AnimatedPressable>
          {chain.cadence === 'weekly' && commitment.weeklyTargetMet ? (
            <Text numberOfLines={1} style={[styles.weeklyProgress, { color: readableAccent }]}>
              {weeklyProgress > chain.weeklyTarget
                ? `+${weeklyProgress - chain.weeklyTarget}`
                : 'Goal met'}
            </Text>
          ) : null}
        </View>
      </Surface>

      {celebratingMilestone !== null ? (
        <MilestoneModal
          streak={celebratingMilestone}
          cadence={chain.cadence}
          chainName={chain.name}
          color={chain.color}
          onDismiss={() => setCelebratingMilestone(null)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: SPACE.sm,
    borderRadius: RADIUS.card,
  },
  stripe: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 3 },
  body: { padding: SPACE.md, paddingLeft: SPACE.md + 3, gap: SPACE.sm },
  topRow: { minHeight: CONTROL.minimumTarget, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingRight: 64 },
  topRowWeekly: { minHeight: 68 },
  detailsTarget: { alignSelf: 'stretch' },
  nameBlock: { flex: 1, minWidth: 0, gap: SPACE.hairline },
  name: { ...TYPE.sectionTitle },
  stageLabel: { ...TYPE.eyebrow },
  streakBlock: { minWidth: 48, alignItems: 'center' },
  streakNum: { fontSize: 25, lineHeight: 28, fontFamily: 'Inter_700Bold', fontVariant: ['tabular-nums'] },
  streakNumCompact: { fontSize: 22, lineHeight: 26 },
  streakLabel: { ...TYPE.metadata, textTransform: 'uppercase', letterSpacing: 0.7 },
  checkColumn: { position: 'absolute', top: SPACE.md, right: SPACE.md, zIndex: 2, elevation: 2, width: 52, alignItems: 'center', gap: SPACE.xxs },
  checkButton: {
    width: CONTROL.minimumTarget,
    height: CONTROL.minimumTarget,
    borderRadius: RADIUS.capsule,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weeklyProgress: { ...TYPE.metadata, minHeight: 15, textAlign: 'center' },
});
