import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import {
  Chain,
  getStreak,
  getTodayStr,
  getWeeklyProgress,
  isRestDay,
  useChains,
} from '@/context/ChainsContext';
import { getProgressionStage } from '@/constants/progression';
import { CONTROL, RADIUS, SCRIM, SPACE, TYPE } from '@/constants/designSystem';
import { readableAccentColor, readableTextColor } from '@/constants/sectionTheme';
import { playFeedback } from '@/lib/feedback';
import AnimatedPressable from './AnimatedPressable';
import WeekStrip from './WeekStrip';
import MilestoneModal from './MilestoneModal';
import { AppButton, Surface } from './ui/AppUI';
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
  const { toggleToday, isCompletedToday, isProtectedToday, isFrozenToday } = useChains();
  const done = isCompletedToday(chain);
  const protectedToday = isProtectedToday(chain);
  const frozen = isFrozenToday(chain);
  const keptToday = done || chain.minimumDates.includes(getTodayStr());
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
  const prevWeeklyProgressRef = useRef(weeklyProgress);
  const previousCompletedRef = useRef(done);
  const checkArrival = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!prevDoneRef.current && keptToday && MILESTONES.has(streak)) {
      setCelebratingMilestone(streak);
    }
    prevDoneRef.current = keptToday;
  }, [keptToday, streak]);

  useEffect(() => {
    if (
      chain.cadence === 'weekly'
      && weeklyProgress > chain.weeklyTarget
      && weeklyProgress > prevWeeklyProgressRef.current
    ) {
      setCelebratingExtra(weeklyProgress - chain.weeklyTarget);
    }
    prevWeeklyProgressRef.current = weeklyProgress;
  }, [chain.cadence, chain.weeklyTarget, weeklyProgress]);

  useEffect(() => {
    const becameComplete = done && !previousCompletedRef.current;
    previousCompletedRef.current = done;
    if (!becameComplete) return;

    if (reducedMotion) {
      checkArrival.setValue(1);
      return;
    }

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
      playFeedback('error');
      Alert.alert('Chain not updated', 'Chain couldn’t save that change. Your previous status has been restored.');
      return;
    }
    playFeedback(done ? 'selection' : 'light');
  }, [done, chain.id, restingToday, toggleToday]);

  const handleCardPress = useCallback(() => {
    router.push({ pathname: '/chain/[id]', params: { id: chain.id } });
  }, [chain.id]);

  const statusLabel = restingToday
    ? 'rest day'
    : frozen
      ? 'frozen today'
      : done
        ? 'completed today'
        : protectedToday
          ? 'minimum version logged today'
          : 'not yet logged today';

  return (
    <>
      <Surface accentColor={chain.color} style={styles.card}>
        <View style={[styles.stripe, { backgroundColor: chain.color }]} />
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={`${chain.name}, ${streak} ${chain.cadence === 'weekly' ? 'week' : 'day'} streak, ${statusLabel}`}
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
                {stage.label.toUpperCase()}
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
                {streak}
              </Text>
              <Text style={[styles.streakLabel, { color: colors.mutedForeground }]}>
                {chain.cadence === 'weekly'
                  ? streak === 1 ? 'week' : 'weeks'
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
                : `${keptToday ? 'Unmark' : 'Mark'} ${chain.name} for today`}
            accessibilityState={{ checked: protectedToday, disabled: restingToday || mutationBusy, busy: mutationBusy }}
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
              <Ionicons name="snow" size={18} color={statusForeground} />
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
              <Ionicons name="moon-outline" size={18} color={colors.mutedForeground} />
            ) : null}
          </AnimatedPressable>
          {chain.cadence === 'weekly' ? (
            <Text numberOfLines={1} style={[styles.weeklyProgress, { color: readableAccent }]}>
              {weeklyProgress > chain.weeklyTarget
                ? `+${weeklyProgress - chain.weeklyTarget}`
                : `${weeklyProgress}/${chain.weeklyTarget}`}
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
      <ExtraWorkMoment
        extra={celebratingExtra}
        chain={chain}
        onClose={() => setCelebratingExtra(null)}
      />
    </>
  );
}

function ExtraWorkMoment({
  extra,
  chain,
  onClose,
}: {
  extra: number | null;
  chain: Chain;
  onClose: () => void;
}) {
  const colors = useColors();
  const reducedMotion = useReducedMotion();
  const readableAccent = readableAccentColor(chain.color, GLASS_SURFACE_COLOR, 4.8);
  if (extra === null) return null;
  return (
    <Modal
      transparent
      visible
      statusBarTranslucent
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={onClose}
    >
      <View style={styles.extraShade}>
        <Pressable
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View accessibilityViewIsModal style={styles.extraFrame}>
          <Surface elevated accentColor={chain.color} style={styles.extraCard}>
            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.extraContent}
            >
              <View style={[styles.extraIcon, { backgroundColor: chain.color + '1C' }]}>
                <Ionicons name="add-circle-outline" size={24} color={readableAccent} />
              </View>
              <Text style={[TYPE.eyebrow, { color: readableAccent }]}>BEYOND THE TARGET</Text>
              <Text style={[styles.extraTitle, { color: colors.foreground }]}>Another day kept.</Text>
              <Text style={[styles.extraBody, { color: colors.mutedForeground }]}>
                {extra} {extra === 1 ? 'day' : 'days'} beyond this week’s target for {chain.name}.
              </Text>
              <View style={styles.extraAction}>
                <AppButton label="Continue" onPress={onClose} accentColor={chain.color} />
              </View>
            </ScrollView>
          </Surface>
        </View>
      </View>
    </Modal>
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
  extraShade: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCRIM,
    padding: SPACE.xl,
  },
  extraFrame: { width: '100%', maxWidth: 340, maxHeight: '82%' },
  extraCard: { borderRadius: RADIUS.modal, maxHeight: '100%' },
  extraContent: { alignItems: 'center', padding: SPACE.xl },
  extraIcon: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.md,
  },
  extraTitle: { ...TYPE.modalTitle, textAlign: 'center', marginTop: SPACE.xxs },
  extraBody: { ...TYPE.body, textAlign: 'center', marginTop: SPACE.xs },
  extraAction: { alignSelf: 'stretch', marginTop: SPACE.xl },
});
