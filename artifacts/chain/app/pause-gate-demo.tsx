import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { AmbientScreen } from "@/components/AmbientSurface";
import {
  CONTROL,
  OPACITY,
  RADIUS,
  SPACE,
  TYPE,
} from "@/constants/designSystem";
import { useColors } from "@/hooks/useColors";
import { playFeedback } from "@/lib/feedback";

const PAUSE_DURATION_MS = 8_000;
const BREATH_PHASE_MS = 4_000;
const PAUSE_SECONDS = PAUSE_DURATION_MS / 1_000;
const CONTINUE_EXIT_DELAY_MS = 320;
const ORB_MIN_SCALE = 0.94;
const ORB_MAX_SCALE = 1.04;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

type BreathPhase = "in" | "out" | "complete";
type RouteParam = string | string[] | undefined;

function firstRouteValue(value: RouteParam): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeRouteText(
  value: RouteParam,
  fallback: string,
  maxLength: number,
): string {
  const normalized = firstRouteValue(value)?.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, maxLength) : fallback;
}

function safeRouteColor(value: RouteParam, fallback: string): string {
  const candidate = firstRouteValue(value)?.trim();
  return candidate && HEX_COLOR_PATTERN.test(candidate) ? candidate : fallback;
}

function exitToGate() {
  router.canGoBack() ? router.back() : router.replace("/(tabs)/gate");
}

export default function PauseGateDemoScreen() {
  const colors = useColors("gate");
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const params = useLocalSearchParams<{
    appName?: string | string[];
    appIcon?: string | string[];
    appColor?: string | string[];
    chainName?: string | string[];
  }>();

  const appName = safeRouteText(params.appName, "Selected app", 48);
  const iconCandidate = firstRouteValue(params.appIcon)?.trim();
  const appIcon =
    iconCandidate &&
    Object.prototype.hasOwnProperty.call(Ionicons.glyphMap, iconCandidate)
      ? (iconCandidate as keyof typeof Ionicons.glyphMap)
      : "apps-outline";
  const appColor = safeRouteColor(params.appColor, colors.primary);
  const chainName = safeRouteText(params.chainName, "what matters", 64);

  const deadlineRef = useRef(Date.now() + PAUSE_DURATION_MS);
  const phaseRef = useRef<BreathPhase>("in");
  const readyRef = useRef(false);
  const isExitingRef = useRef(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [countdown, setCountdown] = useState(PAUSE_SECONDS);
  const [phase, setPhase] = useState<BreathPhase>("in");
  const [ready, setReady] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const orbScale = useSharedValue(ORB_MIN_SCALE);
  const pauseFill = useSharedValue(0);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const orbAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: orbScale.value }],
  }));

  const haloAnimatedStyle = useAnimatedStyle(() => {
    const breathProgress = Math.max(
      0,
      Math.min(
        1,
        (orbScale.value - ORB_MIN_SCALE) / (ORB_MAX_SCALE - ORB_MIN_SCALE),
      ),
    );
    return { opacity: 0.48 + breathProgress * 0.34 };
  });

  const pauseFillStyle = useAnimatedStyle(() => ({
    width: (String(pauseFill.value * 100) + "%") as `${number}%`,
  }));

  // Status is always derived from one absolute deadline. Resuming the app
  // cannot extend the pause or restart the breath.
  useEffect(() => {
    let statusTimer: ReturnType<typeof setTimeout> | undefined;
    let mounted = true;

    const remainingFromDeadline = () =>
      Math.max(0, deadlineRef.current - Date.now());

    const syncAnimations = () => {
      const remainingMs = remainingFromDeadline();
      const elapsedMs = PAUSE_DURATION_MS - remainingMs;
      const elapsedProgress = Math.min(
        1,
        Math.max(0, elapsedMs / PAUSE_DURATION_MS),
      );

      cancelAnimation(pauseFill);
      pauseFill.value = elapsedProgress;
      if (!reduceMotion && remainingMs > 0) {
        pauseFill.value = withTiming(1, {
          duration: remainingMs,
          easing: Easing.linear,
        });
      }

      cancelAnimation(orbScale);
      if (reduceMotion || remainingMs === 0) {
        orbScale.value = 1;
      } else if (elapsedMs < BREATH_PHASE_MS) {
        const inhaleProgress = elapsedMs / BREATH_PHASE_MS;
        orbScale.value =
          ORB_MIN_SCALE + (ORB_MAX_SCALE - ORB_MIN_SCALE) * inhaleProgress;
        orbScale.value = withSequence(
          withTiming(ORB_MAX_SCALE, {
            duration: BREATH_PHASE_MS - elapsedMs,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(ORB_MIN_SCALE, {
            duration: BREATH_PHASE_MS,
            easing: Easing.inOut(Easing.ease),
          }),
        );
      } else {
        const exhaleProgress = (elapsedMs - BREATH_PHASE_MS) / BREATH_PHASE_MS;
        orbScale.value =
          ORB_MAX_SCALE - (ORB_MAX_SCALE - ORB_MIN_SCALE) * exhaleProgress;
        orbScale.value = withTiming(ORB_MIN_SCALE, {
          duration: remainingMs,
          easing: Easing.inOut(Easing.ease),
        });
      }
    };

    const syncStatus = () => {
      if (!mounted) return;

      const remainingMs = remainingFromDeadline();
      const nextCountdown = Math.ceil(remainingMs / 1_000);
      const nextPhase: BreathPhase =
        remainingMs === 0
          ? "complete"
          : remainingMs <= BREATH_PHASE_MS
            ? "out"
            : "in";

      setCountdown((current) =>
        current === nextCountdown ? current : nextCountdown,
      );

      if (phaseRef.current !== nextPhase) {
        phaseRef.current = nextPhase;
        setPhase(nextPhase);
      }

      if (remainingMs === 0) {
        cancelAnimation(orbScale);
        cancelAnimation(pauseFill);
        orbScale.value = 1;
        pauseFill.value = 1;
        if (!readyRef.current) {
          readyRef.current = true;
          setReady(true);
          playFeedback("selection");
        }
        return;
      }

      if (reduceMotion) {
        pauseFill.value = (PAUSE_DURATION_MS - remainingMs) / PAUSE_DURATION_MS;
      }

      const timeUntilCountdownChange =
        remainingMs - Math.max(0, (nextCountdown - 1) * 1_000);
      const timeUntilPhaseChange =
        nextPhase === "in" ? remainingMs - BREATH_PHASE_MS : remainingMs;
      statusTimer = setTimeout(
        syncStatus,
        Math.max(1, Math.min(timeUntilCountdownChange, timeUntilPhaseChange)),
      );
    };

    syncAnimations();
    syncStatus();

    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (statusTimer) {
          clearTimeout(statusTimer);
          statusTimer = undefined;
        }
        if (nextState === "active") {
          syncAnimations();
          syncStatus();
        }
      },
    );

    return () => {
      mounted = false;
      if (statusTimer) clearTimeout(statusTimer);
      appStateSubscription.remove();
      cancelAnimation(orbScale);
      cancelAnimation(pauseFill);
    };
  }, [orbScale, pauseFill, reduceMotion]);

  useEffect(() => {
    const announcement =
      phase === "in"
        ? "Breathe in"
        : phase === "out"
          ? "Breathe out"
          : "Pause complete";
    void AccessibilityInfo.announceForAccessibility(announcement);
  }, [phase]);

  useEffect(
    () => () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    },
    [],
  );

  function beginExit(): boolean {
    if (isExitingRef.current) return false;
    isExitingRef.current = true;
    setIsExiting(true);
    return true;
  }

  function handleReturn() {
    if (!beginExit()) return;
    playFeedback("light");
    exitToGate();
  }

  function handleContinue() {
    if (!readyRef.current || !beginExit()) return;
    playFeedback("light");
    exitTimerRef.current = setTimeout(exitToGate, CONTINUE_EXIT_DELAY_MS);
  }

  const phaseLabel =
    phase === "in"
      ? "Breathe in"
      : phase === "out"
        ? "Breathe out"
        : "Pause complete";

  return (
    <AmbientScreen tone="gate" style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: topPad + SPACE.sm,
            paddingBottom: bottomPad + SPACE.xl,
          },
        ]}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
      >
        <View style={styles.frame}>
          <View style={styles.topBar}>
            <Text
              accessibilityRole="header"
              style={[styles.screenTitle, { color: colors.foreground }]}
            >
              Take one breath.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close Gate"
              accessibilityState={{ busy: isExiting }}
              hitSlop={8}
              onPress={handleReturn}
              style={({ pressed }) => [
                styles.closeButton,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: pressed ? OPACITY.pressed : 1,
                },
              ]}
            >
              <Ionicons
                accessibilityElementsHidden
                importantForAccessibility="no"
                name="close"
                size={20}
                color={colors.mutedForeground}
              />
            </Pressable>
          </View>

          <View
            style={[
              styles.pauseContext,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.appRow}>
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  styles.appIcon,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Ionicons name={appIcon} size={26} color={appColor} />
              </View>
              <View style={styles.appCopy}>
                <Text
                  style={[
                    styles.appOverline,
                    { color: colors.mutedForeground },
                  ]}
                >
                  PAUSE BEFORE
                </Text>
                <Text
                  numberOfLines={1}
                  style={[styles.appName, { color: colors.foreground }]}
                >
                  {appName}
                </Text>
              </View>
            </View>

            <View
              accessible
              accessibilityLabel={"Chain: " + chainName}
              style={[
                styles.chainChip,
                {
                  backgroundColor: colors.primary + "18",
                  borderColor: colors.primary + "52",
                },
              ]}
            >
              <Ionicons
                accessibilityElementsHidden
                importantForAccessibility="no"
                name="link-outline"
                size={13}
                color={colors.primary}
              />
              <Text
                numberOfLines={1}
                style={[styles.chainChipText, { color: colors.primary }]}
              >
                {"CHAIN · " + chainName}
              </Text>
            </View>
          </View>

          <View
            accessible
            accessibilityLabel={
              ready
                ? "Pause complete"
                : phaseLabel + ", " + countdown + " seconds"
            }
            style={styles.orbSlot}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.breathField,
                orbAnimatedStyle,
              ]}
            >
              <Animated.View
                style={[
                  styles.haloOuter,
                  {
                    backgroundColor: colors.primary + "08",
                    borderColor: colors.primary + "42",
                  },
                  haloAnimatedStyle,
                ]}
              />
              <View
                style={[
                  styles.haloMiddle,
                  {
                    backgroundColor: colors.primary + "0C",
                    borderColor: colors.primary + "34",
                  },
                ]}
              />
              <View
                style={[
                  styles.haloInner,
                  {
                    backgroundColor: colors.primary + "10",
                    borderColor: colors.primary + "2E",
                  },
                ]}
              />
              <View
                style={[
                  styles.breathCore,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.primary + "52",
                  },
                ]}
              >
                {ready ? (
                  <View style={styles.orbComplete}>
                    <Ionicons
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                      name="checkmark"
                      size={34}
                      color={colors.primary}
                    />
                    <Text
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                      numberOfLines={1}
                      style={[
                        styles.orbPhase,
                        { color: colors.foreground },
                      ]}
                    >
                      Choose
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                      numberOfLines={1}
                      style={[styles.orbPhase, { color: colors.foreground }]}
                    >
                      {phaseLabel}
                    </Text>
                    <View style={styles.countdownRow}>
                      <Text
                        style={[
                          styles.countdownNumber,
                          { color: colors.foreground },
                        ]}
                      >
                        {countdown}
                      </Text>
                      <Text
                        style={[
                          styles.countdownUnit,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        sec
                      </Text>
                    </View>
                  </>
                )}
              </View>
            </Animated.View>
          </View>

          <View style={styles.prompt}>
            <Text
              style={[styles.promptBody, { color: colors.mutedForeground }]}
            >
              Notice the impulse. You can still choose what matters.
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              accessibilityHint="Available throughout the pause"
              accessibilityState={{ busy: isExiting }}
              onPress={handleReturn}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: colors.primary,
                  borderColor: colors.primary,
                  opacity: pressed ? OPACITY.pressed : 1,
                },
              ]}
            >
              <Ionicons
                accessibilityElementsHidden
                importantForAccessibility="no"
                name="arrow-back"
                size={18}
                color={colors.primaryForeground}
              />
              <Text
                style={[
                  styles.primaryButtonText,
                  { color: colors.primaryForeground },
                ]}
              >
                Go back
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                ready
                  ? "Continue"
                  : "Continue, available after the pause"
              }
              accessibilityHint={
                ready
                  ? "Returns to Gate"
                  : "Wait for the eight-second pause to complete"
              }
              accessibilityState={{
                disabled: !ready || isExiting,
                busy: isExiting,
              }}
              disabled={!ready || isExiting}
              onPress={handleContinue}
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  backgroundColor: colors.card,
                  borderColor: ready ? colors.primary + "80" : colors.border,
                  opacity: pressed ? OPACITY.pressed : 1,
                },
              ]}
            >
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.pauseFill,
                  { backgroundColor: colors.primary + "26" },
                  pauseFillStyle,
                ]}
              />
              <Text
                style={[
                  styles.secondaryButtonText,
                  { color: ready ? colors.foreground : colors.mutedForeground },
                ]}
              >
                {isExiting
                  ? "Continuing…"
                  : ready
                    ? "Continue"
                    : "Continue · " + countdown + "s"}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </AmbientScreen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: SPACE.lg,
  },
  frame: {
    width: "100%",
    maxWidth: 520,
    flexGrow: 1,
    gap: SPACE.md,
  },
  topBar: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACE.md,
  },
  screenTitle: {
    ...TYPE.modalTitle,
    flex: 1,
  },
  closeButton: {
    width: CONTROL.minimumTarget,
    height: CONTROL.minimumTarget,
    borderRadius: RADIUS.capsule,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  pauseContext: {
    width: "100%",
    minHeight: 76,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACE.sm,
    padding: SPACE.sm,
    borderRadius: RADIUS.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  appRow: {
    flex: 1,
    minWidth: 174,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
  },
  appIcon: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.control,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  appCopy: {
    flex: 1,
    flexShrink: 1,
    gap: SPACE.hairline,
  },
  appOverline: {
    ...TYPE.eyebrow,
    fontSize: 10,
    lineHeight: 14,
  },
  appName: {
    ...TYPE.sectionTitle,
  },
  chainChip: {
    maxWidth: 190,
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.xxs,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xxs,
    borderRadius: RADIUS.capsule,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chainChipText: {
    ...TYPE.eyebrow,
    fontSize: 10,
    lineHeight: 14,
    flexShrink: 1,
    textAlign: "center",
  },
  orbSlot: {
    height: 236,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  breathField: {
    width: 218,
    height: 218,
    alignItems: "center",
    justifyContent: "center",
  },
  haloOuter: {
    position: "absolute",
    width: 214,
    height: 214,
    borderRadius: 107,
    borderWidth: 1,
  },
  haloMiddle: {
    position: "absolute",
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: StyleSheet.hairlineWidth,
  },
  haloInner: {
    position: "absolute",
    width: 134,
    height: 134,
    borderRadius: 67,
    borderWidth: StyleSheet.hairlineWidth,
  },
  breathCore: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.xxs,
  },
  orbComplete: {
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.xxs,
  },
  orbPhase: {
    ...TYPE.bodyStrong,
    textAlign: "center",
  },
  countdownRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: SPACE.xxs,
  },
  countdownNumber: {
    fontSize: 30,
    lineHeight: 34,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.8,
  },
  countdownUnit: {
    ...TYPE.metadata,
    opacity: 0.78,
  },
  prompt: {
    alignItems: "center",
  },
  promptBody: {
    ...TYPE.body,
    maxWidth: 390,
    textAlign: "center",
  },
  actions: {
    width: "100%",
    gap: SPACE.sm,
    marginTop: "auto",
  },
  primaryButton: {
    width: "100%",
    minHeight: CONTROL.prominentButtonHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.xs,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderRadius: RADIUS.capsule,
    borderWidth: 1,
  },
  primaryButtonText: {
    ...TYPE.sectionTitle,
    textAlign: "center",
  },
  secondaryButton: {
    width: "100%",
    minHeight: CONTROL.prominentButtonHeight,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderRadius: RADIUS.capsule,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pauseFill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
  },
  secondaryButtonText: {
    ...TYPE.bodyStrong,
    textAlign: "center",
  },
});
