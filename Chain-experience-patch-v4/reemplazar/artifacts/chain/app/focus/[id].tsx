import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import { type PlanItem, usePlan } from '@/context/PlanContext';
import { AmbientScreen } from '@/components/AmbientSurface';
import {
  createFocusSession,
  getFocusElapsedSeconds,
  pauseFocusSession,
  resumeFocusSession,
  type FocusSessionSnapshot,
} from '@/domain/focus';
import { readFocusSession, removeFocusSession, writeFocusSession } from '@/lib/focusSession';
import { planDataStore } from '@/lib/rhythmStorage';
import { reportDiagnostic } from '@/lib/diagnostics';
import { CONTROL, MOTION, OPACITY, RADIUS, SPACE, TYPE } from '@/constants/designSystem';
import { playFeedback } from '@/lib/feedback';

function clock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secondsLeft = safe % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secondsLeft).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(secondsLeft).padStart(2, '0')}`;
}

function minutesLeft(seconds: number) {
  const totalMinutes = Math.max(1, Math.ceil(seconds / 60));
  if (totalMinutes < 60) return `${totalMinutes} min left`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} hr left` : `${hours} hr ${minutes} min left`;
}

function endTime(session: FocusSessionSnapshot) {
  if (session.runningSince === undefined) return null;
  const remainingAtResume = Math.max(0, session.targetSeconds - session.accumulatedSeconds);
  return new Date(session.runningSince + remainingAtResume * 1000).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

const FocusClock = React.memo(function FocusClock({
  session,
  accentColor,
  completed,
  diameter,
  onComplete,
}: {
  session: FocusSessionSnapshot;
  accentColor: string;
  completed: boolean;
  diameter: number;
  onComplete: () => void;
}) {
  const colors = useColors();
  const [now, setNow] = useState(Date.now);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setNow(Date.now());
  }, [session.accumulatedSeconds, session.runningSince, session.targetSeconds]);

  const elapsed = getFocusElapsedSeconds(session, now);
  const remaining = completed ? 0 : Math.max(0, session.targetSeconds - elapsed);
  const progress = completed ? 1 : Math.min(1, elapsed / session.targetSeconds);

  useEffect(() => {
    if (session.runningSince === undefined || remaining <= 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [remaining <= 0, session.runningSince]);

  useEffect(() => {
    if (remaining !== 0 || session.runningSince === undefined) return;
    onCompleteRef.current();
  }, [remaining, session.runningSince]);

  const paused = session.runningSince === undefined;
  const complete = remaining === 0;
  const headline = complete ? 'Block complete' : paused ? 'Paused' : 'In focus';
  const metadata = complete
    ? 'Ready to finish'
    : paused
      ? minutesLeft(remaining)
      : `Ends at ${endTime(session)}`;
  const radius = (diameter - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const innerDiameter = diameter - 46;

  return <>
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={complete ? 'Focus block complete.' : `${clock(remaining)} remaining. ${headline}. ${metadata}.`}
      style={[styles.dial, { width: diameter, height: diameter }]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.dialHalo,
          {
            width: diameter + 64,
            height: diameter + 64,
            borderRadius: (diameter + 64) / 2,
            backgroundColor: accentColor + (paused && !complete ? '08' : '0D'),
          },
        ]}
      />
      <Svg pointerEvents="none" width={diameter} height={diameter} viewBox={`0 0 ${diameter} ${diameter}`} style={styles.progressSvg}>
        <Circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          stroke={accentColor + '24'}
          strokeWidth={5}
        />
        <Circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          stroke={accentColor}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={[circumference, circumference]}
          strokeDashoffset={circumference * (1 - progress)}
          opacity={paused && !complete ? 0.62 : 1}
          transform={`rotate(-90 ${diameter / 2} ${diameter / 2})`}
        />
      </Svg>
      <View style={[styles.dialCore, { width: innerDiameter, height: innerDiameter, borderRadius: innerDiameter / 2, borderColor: accentColor + '20' }]}>
        {complete ? (
          <View style={[styles.completeGlyph, { backgroundColor: accentColor + '18', borderColor: accentColor + '40' }]}>
            <Ionicons name="checkmark" size={31} color={accentColor} />
          </View>
        ) : (
          <Text adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={[styles.clock, { color: colors.foreground }]}>{clock(remaining)}</Text>
        )}
        <Text style={[styles.remaining, { color: complete ? accentColor : colors.mutedForeground }]}>{complete ? 'complete' : paused ? 'paused' : 'remaining'}</Text>
      </View>
    </View>
    <View accessibilityLiveRegion="polite" style={styles.statusCopy}>
      <Text style={[styles.statusHeadline, { color: colors.foreground }]}>{headline}</Text>
      <View style={styles.statusMetadata}>
        <View style={[styles.statusDot, { backgroundColor: complete || !paused ? accentColor : colors.mutedForeground }]} />
        <Text style={[styles.statusBody, { color: colors.mutedForeground }]}>{metadata}</Text>
      </View>
    </View>
  </>;
});

function PreparingClock({ accentColor, diameter }: { accentColor: string; diameter: number }) {
  const colors = useColors();
  const radius = (diameter - 16) / 2;
  const innerDiameter = diameter - 46;
  return <>
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel="Preparing focus session."
      style={[styles.dial, { width: diameter, height: diameter }]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.dialHalo,
          {
            width: diameter + 64,
            height: diameter + 64,
            borderRadius: (diameter + 64) / 2,
            backgroundColor: accentColor + '08',
          },
        ]}
      />
      <Svg pointerEvents="none" width={diameter} height={diameter} viewBox={`0 0 ${diameter} ${diameter}`} style={styles.progressSvg}>
        <Circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          stroke={accentColor + '24'}
          strokeWidth={5}
        />
      </Svg>
      <View style={[styles.dialCore, { width: innerDiameter, height: innerDiameter, borderRadius: innerDiameter / 2, borderColor: accentColor + '20' }]}>
        <Text style={[styles.clock, { color: colors.foreground }]}>--:--</Text>
        <Text style={[styles.remaining, { color: colors.mutedForeground }]}>preparing</Text>
      </View>
    </View>
    <View accessibilityLiveRegion="polite" style={styles.statusCopy}>
      <Text style={[styles.statusHeadline, { color: colors.foreground }]}>Preparing focus…</Text>
      <View style={styles.statusMetadata}>
        <View style={[styles.statusDot, { backgroundColor: colors.mutedForeground }]} />
        <Text style={[styles.statusBody, { color: colors.mutedForeground }]}>Restoring your session safely</Text>
      </View>
    </View>
  </>;
}

export default function FocusSession() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, completeFocusItem } = usePlan();
  const liveItem = items.find((entry) => entry.id === id);
  const [retainedItem, setRetainedItem] = useState<PlanItem | null>(null);
  // Plan is a shared provider and may navigate to another date in response to
  // a notification. Once Focus starts, retain its task so that unrelated Plan
  // navigation cannot silently unmount a running session.
  const item = liveItem ?? (retainedItem?.id === id ? retainedItem : undefined);
  const plannedTargetSeconds = (item?.durationMinutes || 30) * 60;
  const [session, setSession] = useState<FocusSessionSnapshot | null>(null);
  const [timerCompleted, setTimerCompleted] = useState(false);
  const [itemLookupSettled, setItemLookupSettled] = useState(false);
  const [itemLookupError, setItemLookupError] = useState(false);
  const [sessionUnavailable, setSessionUnavailable] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [sessionSaveError, setSessionSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [holdingVisual, setHoldingVisual] = useState(false);
  const holdProgress = useRef(new Animated.Value(0)).current;
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const holdingRef = useRef(false);
  const completionHandledRef = useRef(false);
  const finishingRef = useRef(false);
  const savingRef = useRef(false);
  const restoringRef = useRef(true);
  const restoreGenerationRef = useRef(0);
  const sessionMatchesItem = Boolean(
    session && item && session.itemId === item.id && session.planDate === item.planDate,
  );
  const paused = !sessionMatchesItem || session?.runningSince === undefined;
  const topPad = Platform.OS === 'web' ? 40 : insets.top + 8;
  const compactLayout = width < 360;
  const dialDiameter = compactLayout ? 210 : 232;

  useEffect(() => {
    if (liveItem) setRetainedItem(liveItem);
  }, [liveItem]);

  useEffect(() => {
    if (item) {
      setItemLookupSettled(true);
      setItemLookupError(false);
      return;
    }
    let cancelled = false;
    setItemLookupSettled(false);
    setItemLookupError(false);
    // A saved timer can belong to yesterday after midnight or a restart.
    // Restore only its exact task occurrence; do not switch the visible Plan day.
    void (async () => {
      const saved = id ? await readFocusSession(id) : null;
      if (!saved || cancelled) return;
      const history = await planDataStore.readSnapshot();
      const savedItems = history.days[saved.planDate] ?? [];
      const savedItem = savedItems.find((entry) => entry.id === id && entry.planDate === saved.planDate);
      if (!cancelled && savedItem) setRetainedItem(savedItem);
    })().catch((error) => {
      if (!cancelled) setItemLookupError(true);
      reportDiagnostic({ area: 'storage', operation: 'focusSession.lookup', severity: 'error', error });
    }).finally(() => { if (!cancelled) setItemLookupSettled(true); });
    return () => { cancelled = true; };
  }, [id, item]);

  useEffect(() => {
    const generation = restoreGenerationRef.current + 1;
    restoreGenerationRef.current = generation;
    restoringRef.current = Boolean(item);
    setRestoring(Boolean(item));
    setSession(null);
    setTimerCompleted(false);
    setSessionUnavailable(false);
    setSessionSaveError(false);
    setSaving(false);
    setFinishing(false);
    setHoldingVisual(false);
    completionHandledRef.current = false;
    savingRef.current = false;
    finishingRef.current = false;
    holdingRef.current = false;
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = undefined;
    }
    holdProgress.stopAnimation();
    holdProgress.setValue(0);
    if (!item) {
      restoringRef.current = false;
      return () => {
        if (restoreGenerationRef.current === generation) restoreGenerationRef.current += 1;
      };
    }
    let cancelled = false;
    const restore = async () => {
      const restored = await readFocusSession(item.id);
      if (cancelled || restoreGenerationRef.current !== generation) return;
      const restoredAt = Date.now();
      const canRestore = restored?.itemId === item.id && restored.planDate === item.planDate;
      if (restored && !canRestore) {
        await removeFocusSession(item.id);
        if (cancelled || restoreGenerationRef.current !== generation) return;
      }
      const next = canRestore
        ? restored
        : createFocusSession(item.id, item.planDate, plannedTargetSeconds, restoredAt);
      if (next !== restored) {
        await writeFocusSession(next);
        if (cancelled || restoreGenerationRef.current !== generation) return;
      }
      const alreadyComplete = getFocusElapsedSeconds(next, restoredAt) >= next.targetSeconds;
      completionHandledRef.current = alreadyComplete && next.runningSince === undefined;
      setTimerCompleted(alreadyComplete);
      setSession(next);
      restoringRef.current = false;
      setRestoring(false);
    };
    void restore().catch((error) => {
      reportDiagnostic({ area: 'storage', operation: 'focusSession.restore', severity: 'error', error });
      if (cancelled || restoreGenerationRef.current !== generation) return;
      restoringRef.current = false;
      setRestoring(false);
      setSessionUnavailable(true);
    });
    return () => {
      cancelled = true;
      if (restoreGenerationRef.current === generation) restoreGenerationRef.current += 1;
    };
  }, [holdProgress, id, item?.id, item?.planDate, plannedTargetSeconds]);

  const persistCompletedSession = useCallback(async (
    completedSession: FocusSessionSnapshot,
    operation: string,
  ) => {
    const generation = restoreGenerationRef.current;
    completionHandledRef.current = true;
    savingRef.current = true;
    setSession(completedSession);
    setTimerCompleted(true);
    setSessionSaveError(false);
    setSaving(true);
    try {
      await writeFocusSession(completedSession);
      if (restoreGenerationRef.current !== generation) return false;
      playFeedback('success');
      return true;
    } catch (error) {
      reportDiagnostic({ area: 'storage', operation, severity: 'error', error });
      if (restoreGenerationRef.current !== generation) return false;
      setSessionSaveError(true);
      playFeedback('error');
      return false;
    } finally {
      if (restoreGenerationRef.current === generation) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  }, []);

  const completeTimer = useCallback(() => {
    if (
      !session || !item || session.itemId !== item.id || session.planDate !== item.planDate ||
      session.runningSince === undefined || completionHandledRef.current || restoringRef.current ||
      savingRef.current || finishingRef.current
    ) return;
    const completedAt = Date.now();
    const completedSession = pauseFocusSession(session, completedAt);
    void persistCompletedSession(completedSession, 'focusSession.complete');
  }, [item, persistCompletedSession, session]);

  async function finish() {
    if (
      !session || !item || session.itemId !== item.id || session.planDate !== item.planDate ||
      restoringRef.current || finishingRef.current || savingRef.current
    ) return;
    const generation = restoreGenerationRef.current;
    const finishingItemId = session.itemId;
    finishingRef.current = true;
    setFinishing(true);
    try {
      const finishedAt = Date.now();
      const actualMinutes = getFocusElapsedSeconds(session, finishedAt) / 60;
      const completed = await completeFocusItem(finishingItemId, actualMinutes, item.planDate);
      if (!completed) {
        if (restoreGenerationRef.current === generation) {
          finishingRef.current = false;
          setFinishing(false);
          Alert.alert('Focus couldn’t finish', 'Your session is still saved. Please try again.');
        }
        return;
      }
      const finalSession: FocusSessionSnapshot = {
        ...pauseFocusSession(session, finishedAt),
        accumulatedSeconds: session.targetSeconds,
        runningSince: undefined,
        updatedAt: finishedAt,
      };
      let finalStateStored = false;
      try {
        await writeFocusSession(finalSession);
        finalStateStored = true;
      } catch (error) {
        reportDiagnostic({ area: 'storage', operation: 'focusSession.finish.tombstone', severity: 'warning', error });
      }
      let removed = false;
      try {
        await removeFocusSession(finishingItemId);
        removed = true;
      } catch (error) {
        reportDiagnostic({ area: 'storage', operation: 'focusSession.remove', severity: 'warning', error });
      }
      if (!finalStateStored && !removed) {
        try {
          await writeFocusSession(finalSession);
          finalStateStored = true;
        } catch (error) {
          reportDiagnostic({ area: 'storage', operation: 'focusSession.finish.tombstoneRetry', severity: 'error', error });
        }
      }
      if (restoreGenerationRef.current !== generation) return;
      setSession(finalSession);
      setTimerCompleted(true);
      setSessionSaveError(!finalStateStored && !removed);
      playFeedback('success');
      router.back();
    } catch (error) {
      reportDiagnostic({ area: 'storage', operation: 'focusSession.finish', severity: 'error', error });
      if (restoreGenerationRef.current === generation) {
        finishingRef.current = false;
        setFinishing(false);
        Alert.alert('Focus couldn’t finish', 'Your session is still saved. Please try again.');
      }
    }
  }

  async function togglePause() {
    if (
      !session || !item || session.itemId !== item.id || session.planDate !== item.planDate ||
      timerCompleted || restoringRef.current || savingRef.current || finishingRef.current
    ) return;
    const generation = restoreGenerationRef.current;
    const changedAt = Date.now();
    const previous = session;
    const next = session.runningSince === undefined
      ? resumeFocusSession(session, changedAt)
      : pauseFocusSession(session, changedAt);
    const reachedTarget = getFocusElapsedSeconds(next, changedAt) >= next.targetSeconds;
    if (reachedTarget) {
      await persistCompletedSession(next, 'focusSession.complete.pause');
      return;
    }
    setSession(next);
    savingRef.current = true;
    setSaving(true);
    try {
      await writeFocusSession(next);
      if (restoreGenerationRef.current !== generation) return;
      playFeedback('light');
    } catch (error) {
      reportDiagnostic({ area: 'storage', operation: 'focusSession.pause', severity: 'error', error });
      if (restoreGenerationRef.current === generation) {
        setSession(previous);
        Alert.alert('Focus couldn’t save', 'The pause change was undone. Your previous session is still safe.');
      }
    } finally {
      if (restoreGenerationRef.current === generation) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  }

  async function closeSession() {
    if (
      !session || !item || session.itemId !== item.id || session.planDate !== item.planDate ||
      restoringRef.current || savingRef.current || finishingRef.current
    ) return;
    const generation = restoreGenerationRef.current;
    if (session.runningSince !== undefined || sessionSaveError) {
      const closedAt = Date.now();
      const previous = session;
      const next = session.runningSince === undefined ? session : pauseFocusSession(session, closedAt);
      setSession(next);
      savingRef.current = true;
      setSaving(true);
      try {
        await writeFocusSession(next);
        if (restoreGenerationRef.current === generation) setSessionSaveError(false);
      } catch (error) {
        reportDiagnostic({ area: 'storage', operation: 'focusSession.close', severity: 'error', error });
        if (restoreGenerationRef.current === generation) {
          setSession(previous);
          setSessionSaveError(timerCompleted || sessionSaveError);
          playFeedback('error');
          Alert.alert('Focus couldn’t close', 'Chain couldn’t save the paused session. Try again before leaving.');
        }
        return;
      } finally {
        if (restoreGenerationRef.current === generation) {
          savingRef.current = false;
          setSaving(false);
        }
      }
    }
    if (restoreGenerationRef.current !== generation) return;
    router.back();
  }

  function completeEndHold() {
    if (!holdingRef.current || finishingRef.current) return;
    holdingRef.current = false;
    setHoldingVisual(false);
    playFeedback('light');
    void finish();
  }

  function beginEndHold() {
    if (timerCompleted || finishingRef.current) return;
    holdingRef.current = true;
    setHoldingVisual(true);
    if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
    holdProgress.stopAnimation();
    holdProgress.setValue(0);
    playFeedback('selection');
    if (reduceMotion) {
      holdTimeoutRef.current = setTimeout(completeEndHold, MOTION.hold);
      return;
    }
    Animated.timing(holdProgress, { toValue: 1, duration: MOTION.hold, useNativeDriver: false }).start(({ finished }) => {
      if (finished) completeEndHold();
    });
  }

  function cancelEndHold() {
    holdingRef.current = false;
    setHoldingVisual(false);
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = undefined;
    }
    holdProgress.stopAnimation();
    if (reduceMotion || finishingRef.current || timerCompleted) {
      holdProgress.setValue(0);
      return;
    }
    Animated.timing(holdProgress, { toValue: 0, duration: MOTION.quick, useNativeDriver: false }).start();
  }

  useEffect(() => () => {
    if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
    holdProgress.stopAnimation();
  }, [holdProgress]);

  if (!item || sessionUnavailable) {
    const unavailable = itemLookupSettled || sessionUnavailable;
    return <AmbientScreen tone="focus" style={[styles.root, { paddingTop: topPad }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => { if (sessionMatchesItem) void closeSession(); else router.back(); }} style={styles.close}><Ionicons name="close" size={24} color={colors.mutedForeground} /></Pressable>
      <View style={styles.unavailable}>
        <View style={[styles.unavailableIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name={unavailable ? 'hourglass-outline' : 'ellipsis-horizontal'} size={24} color={colors.primary} /></View>
        <Text style={[styles.unavailableTitle, { color: colors.foreground }]}>{unavailable ? 'Focus unavailable' : 'Preparing focus…'}</Text>
        {unavailable && <Text style={[styles.unavailableBody, { color: colors.mutedForeground }]}>{itemLookupError ? 'Chain couldn’t load the saved session. Return to Plan and try again.' : sessionUnavailable ? 'Chain couldn’t safely save this session.' : 'This task may have been completed, moved or removed.'}</Text>}
        {unavailable && <Pressable accessibilityRole="button" accessibilityLabel="Back to plan" onPress={() => { if (sessionMatchesItem) void closeSession(); else router.back(); }} style={[styles.unavailableButton, { backgroundColor: colors.primary }]}><Text style={[styles.unavailableButtonText, { color: colors.primaryForeground }]}>Back to plan</Text></Pressable>}
      </View>
    </AmbientScreen>;
  }
  const accentColor = item.color || colors.primary;
  const interactionDisabled = restoring || saving || finishing;
  const sessionControlsDisabled = !sessionMatchesItem || interactionDisabled;
  const pauseDisabled = sessionControlsDisabled || timerCompleted;
  return <AmbientScreen tone="focus" color={item.color || colors.primary} style={[styles.root, { paddingTop: topPad }]}>
    <Pressable disabled={sessionControlsDisabled} accessibilityRole="button" accessibilityLabel="Close focus session" accessibilityHint="Pauses and saves this session." accessibilityState={{ disabled: sessionControlsDisabled }} onPress={() => { void closeSession(); }} style={[styles.close, { opacity: sessionControlsDisabled ? OPACITY.disabled : 1 }]}><Ionicons name="close" size={24} color={colors.mutedForeground} /></Pressable>
    <ScrollView style={styles.scroller} contentContainerStyle={[styles.inner, { paddingBottom: insets.bottom + SPACE.lg }]} showsVerticalScrollIndicator={false}>
      <View style={styles.sessionHeader}>
        <View style={styles.eyebrowRow}>
          <View style={[styles.eyebrowDot, { backgroundColor: accentColor }]} />
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>FOCUS SESSION</Text>
        </View>
        <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.78} style={[styles.task, { color: colors.foreground }]}>{item.text}</Text>
      </View>
      <View style={[styles.focusStage, compactLayout && styles.focusStageCompact]}>
        {sessionMatchesItem && session
          ? <FocusClock session={session} accentColor={accentColor} completed={timerCompleted} diameter={dialDiameter} onComplete={completeTimer} />
          : <PreparingClock accentColor={accentColor} diameter={dialDiameter} />}
        {sessionSaveError && <Text accessibilityLiveRegion="polite" style={[styles.saveError, { color: colors.destructive }]}>Completion isn’t saved yet. Close to retry.</Text>}
      </View>
      <View style={[styles.actionsDock, compactLayout && styles.actionsDockCompact, { backgroundColor: colors.glassStrong, borderColor: colors.glassBorder }]}>
        <Pressable disabled={pauseDisabled} accessibilityRole="button" accessibilityLabel={timerCompleted ? 'Focus session complete' : paused ? 'Resume focus session' : 'Pause focus session'} accessibilityState={{ disabled: pauseDisabled }} onPress={() => { void togglePause(); }} style={({ pressed }) => [styles.pause, compactLayout && styles.actionCompact, { backgroundColor: colors.glassHighlight, opacity: pauseDisabled ? OPACITY.disabled : pressed ? OPACITY.pressed : 1 }]}><Ionicons name={timerCompleted ? 'checkmark' : paused ? 'play' : 'pause'} size={18} color={colors.foreground} /><Text style={[styles.pauseText, { color: colors.foreground }]}>{saving ? 'Saving…' : finishing ? 'Finishing…' : timerCompleted ? 'Complete' : paused ? 'Resume' : 'Pause'}</Text></Pressable>
        <Pressable disabled={sessionControlsDisabled} accessibilityRole="button" accessibilityLabel="End focus session" accessibilityHint={timerCompleted ? 'Completes the task and closes this session.' : 'Hold visually, or use the accessibility activate action, to end early.'} accessibilityState={{ disabled: sessionControlsDisabled }} accessibilityActions={[{ name: 'activate', label: 'End focus session' }]} onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'activate') void finish(); }} onPress={timerCompleted ? finish : undefined} onPressIn={beginEndHold} onPressOut={cancelEndHold} style={({ pressed }) => [styles.finish, compactLayout && styles.actionCompact, { backgroundColor: reduceMotion && holdingVisual ? accentColor + '24' : accentColor + '14', borderColor: accentColor + '52', opacity: sessionControlsDisabled ? OPACITY.disabled : pressed ? OPACITY.pressed : 1 }]}>{!reduceMotion && <Animated.View pointerEvents="none" style={[styles.holdFill, { backgroundColor: accentColor, width: holdProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}><View style={styles.holdScrim} /></Animated.View>}<View pointerEvents="none" style={styles.finishContent}><Ionicons name="checkmark" size={19} color={colors.foreground} /><Text style={[styles.finishText, { color: colors.foreground }]}>{saving ? 'Saving…' : finishing ? 'Finishing…' : timerCompleted ? 'Finish' : reduceMotion && holdingVisual ? 'Keep holding…' : 'Hold to end'}</Text></View></Pressable>
      </View>
    </ScrollView>
  </AmbientScreen>;
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: CONTROL.screenHorizontal },
  close: { alignSelf: 'flex-end', minWidth: CONTROL.minimumTarget, minHeight: CONTROL.minimumTarget, alignItems: 'center', justifyContent: 'center' },
  scroller: { flex: 1, width: '100%' },
  inner: { flexGrow: 1, alignItems: 'center', paddingTop: SPACE.sm },
  sessionHeader: { alignItems: 'center', width: '100%' },
  eyebrowRow: { minHeight: 20, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  eyebrowDot: { width: 6, height: 6, borderRadius: 3 },
  eyebrow: { ...TYPE.eyebrow, fontSize: 11, lineHeight: 15 },
  task: { ...TYPE.screenTitle, fontSize: 28, lineHeight: 34, textAlign: 'center', marginTop: SPACE.xs, maxWidth: 330 },
  focusStage: { flexGrow: 1, minHeight: 354, width: '100%', alignItems: 'center', justifyContent: 'center', paddingVertical: SPACE.xl },
  focusStageCompact: { minHeight: 320, paddingVertical: SPACE.lg },
  dial: { alignItems: 'center', justifyContent: 'center' },
  dialHalo: { position: 'absolute' },
  progressSvg: { position: 'absolute' },
  dialCore: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11,11,13,0.88)', borderWidth: StyleSheet.hairlineWidth },
  clock: { fontSize: 39, lineHeight: 46, fontFamily: 'Inter_700Bold', fontVariant: ['tabular-nums'], letterSpacing: -1.1 },
  remaining: { ...TYPE.metadata, marginTop: SPACE.xxs, letterSpacing: 0.2 },
  completeGlyph: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  statusCopy: { alignItems: 'center', marginTop: SPACE.lg },
  statusHeadline: { ...TYPE.sectionTitle, textAlign: 'center' },
  statusMetadata: { minHeight: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.xs, marginTop: SPACE.xxs },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusBody: { ...TYPE.caption, textAlign: 'center' },
  saveError: { ...TYPE.caption, marginTop: SPACE.sm, textAlign: 'center' },
  actionsDock: { flexDirection: 'row', gap: SPACE.xs, width: '100%', borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.hero, borderCurve: 'continuous', padding: SPACE.xxs },
  actionsDockCompact: { flexDirection: 'column' },
  actionCompact: { flex: undefined, width: '100%' },
  pause: { minHeight: CONTROL.buttonHeight, flex: 0.78, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.xs, borderRadius: RADIUS.button, borderCurve: 'continuous', paddingHorizontal: SPACE.sm },
  pauseText: { ...TYPE.bodyStrong },
  finish: { minHeight: CONTROL.buttonHeight, flex: 1.22, borderRadius: RADIUS.button, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACE.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  holdFill: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
  holdScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.38)' },
  finishContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.xs },
  finishText: { ...TYPE.bodyStrong },
  unavailable: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.lg, paddingBottom: 64 },
  unavailableIcon: { width: 52, height: 52, borderRadius: RADIUS.button, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.md },
  unavailableTitle: { ...TYPE.modalTitle, textAlign: 'center' },
  unavailableBody: { maxWidth: 300, ...TYPE.body, textAlign: 'center', marginTop: SPACE.xs },
  unavailableButton: { minHeight: CONTROL.buttonHeight, minWidth: 160, borderRadius: RADIUS.button, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', marginTop: SPACE.xl, paddingHorizontal: SPACE.xl },
  unavailableButtonText: { ...TYPE.bodyStrong },
});
