import React, { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { getGateSaves24h, recordGateSave } from '@/lib/gateStats';

const COUNTDOWN_SECONDS = 12;

export default function PauseGateDemoScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    appName = 'Instagram',
    appId = 'instagram',
    appIcon = 'logo-instagram',
    appColor = '#E1306C',
    chainName = 'Write Daily',
    streak = '14',
    chainColor = '#FF6B35',
    gateMode = 'every_open',
    dailyLimit = '30',
  } = useLocalSearchParams<{
    appName: string;
    appId: string;
    appIcon: string;
    appColor: string;
    chainName: string;
    streak: string;
    chainColor: string;
    gateMode: string;
    dailyLimit: string;
  }>();

  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [ready, setReady] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  // One full breath: 4s in, 2s hold, 6s out. The pause lasts exactly one cycle.
  const breathScale = useSharedValue(1);
  const breathOpacity = useSharedValue(0.5);
  const pauseFill = useSharedValue(0);

  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathScale.value }],
    opacity: breathOpacity.value,
  }));

  const pauseFillStyle = useAnimatedStyle(() => ({
    width: `${pauseFill.value * 100}%`,
  }));

  useEffect(() => {
    breathScale.value = withRepeat(
      withSequence(
        withTiming(1.22, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.22, { duration: 2000, easing: Easing.linear }),
        withTiming(0.92, { duration: 6000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
    breathOpacity.value = withRepeat(
      withSequence(
        withTiming(0.92, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.92, { duration: 2000, easing: Easing.linear }),
        withTiming(0.34, { duration: 6000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
  }, []);

  // The primary action becomes available over the same calm pause as the rings.
  // It gives the user a clear visual endpoint instead of a suddenly-enabled button.
  useEffect(() => {
    pauseFill.value = 0;
    pauseFill.value = withTiming(1, {
      duration: COUNTDOWN_SECONDS * 1000,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [pauseFill]);

  useEffect(() => {
    void getGateSaves24h().then((events) => setSavedCount(events.filter((event) => event.appId === appId).length));
  }, [appId]);

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setReady(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const breathPhase = countdown > 8 ? 'Breathe in' : countdown > 6 ? 'Hold' : 'Let it go';

  async function handleNotNow() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await recordGateSave(appId);
    router.back();
  }

  function handleOpenAnyway() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }

  return (
    <View style={[styles.root, { backgroundColor: '#050505' }]}>
      {/* Close (X) for demo purposes */}
      <Pressable
        onPress={() => router.back()}
        style={[styles.closeBtn, { top: topPad + 8 }]}
      >
        <Ionicons name="close" size={22} color="#444" />
      </Pressable>

      <View style={[styles.inner, { paddingTop: topPad + 60, paddingBottom: botPad + 32 }]}>
        {/* App being blocked */}
        <View style={styles.appBlock}>
          <View style={[styles.appIconWrap, { backgroundColor: appColor + '22' }]}>
            <Ionicons name={appIcon as keyof typeof Ionicons.glyphMap} size={32} color={appColor} />
          </View>
          <Text style={[styles.appName, { color: '#888' }]}>
            Opening {appName}…
          </Text>
          <Text style={styles.ruleLabel}>{gateMode === 'daily_limit' ? `${dailyLimit} min daily limit reached` : 'Pause on every opening'}</Text>
        </View>

        {/* Breathing circle */}
        <View style={styles.breathWrap}>
          {/* Outer glow rings */}
          <Animated.View
            style={[
              styles.breathRing3,
              { borderColor: chainColor + '15' },
              breathStyle,
            ]}
          />
          <Animated.View
            style={[
              styles.breathRing2,
              { borderColor: chainColor + '30' },
              breathStyle,
            ]}
          />
          <Animated.View
            style={[
              styles.breathRing1,
              { backgroundColor: chainColor + '18', borderColor: chainColor + '50' },
              breathStyle,
            ]}
          >
            <Ionicons name="link" size={36} color={chainColor} />
          </Animated.View>
        </View>

        {/* Chain reminder */}
        <View style={styles.messageBlock}>
          <Text style={[styles.chainLine, { color: chainColor }]}>
            Day {streak} of {chainName}
          </Text>
          <Text style={styles.questionLine}>
            Is this worth breaking it?
          </Text>
          <Text style={[styles.breathInstruction, { color: chainColor }]}>{breathPhase}</Text>
          <Text style={styles.saveCount}>{savedCount ? `You’ve stepped back ${savedCount} time${savedCount === 1 ? '' : 's'} in the last 24h.` : 'Choose the pause, not the scroll.'}</Text>
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <Pressable
            onPress={handleNotNow}
            disabled={!ready}
            style={({ pressed }) => [
              styles.notNowBtn,
              { borderColor: chainColor + '72', opacity: pressed && ready ? 0.88 : 1 },
            ]}
          >
            <Animated.View
              pointerEvents="none"
              style={[styles.notNowFill, { backgroundColor: chainColor }, pauseFillStyle]}
            />
            <Text style={styles.notNowText}>Not now</Text>
          </Pressable>

          <Pressable
            onPress={handleOpenAnyway}
            disabled={!ready}
            style={({ pressed }) => [styles.openAnywayBtn, { opacity: ready ? (pressed ? 0.7 : 1) : 0.32 }]}
          >
            <Text style={styles.openAnywayText}>Open anyway</Text>
          </Pressable>
        </View>

        {/* Demo label */}
        <View style={[styles.demoTag, { backgroundColor: '#ffffff0a', borderColor: '#ffffff15' }]}>
          <Text style={styles.demoText}>Preview mode — this is what your gate looks like</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  closeBtn: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
  },
  appBlock: {
    alignItems: 'center',
    gap: 10,
  },
  appIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  ruleLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', color: '#555' },
  breathWrap: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breathRing3: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1,
  },
  breathRing2: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1.5,
  },
  breathRing1: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBlock: {
    alignItems: 'center',
    gap: 8,
  },
  chainLine: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  questionLine: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    textAlign: 'center',
  },
  breathInstruction: { fontSize: 17, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  saveCount: { fontSize: 12, fontFamily: 'Inter_500Medium', color: '#777', textAlign: 'center', marginTop: 5 },
  actions: {
    width: '100%',
    gap: 12,
  },
  notNowBtn: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#090909',
    borderWidth: 1,
  },
  notNowFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 31,
  },
  notNowText: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  openAnywayBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  openAnywayText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#444',
  },
  demoTag: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  demoText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#555',
  },
});
