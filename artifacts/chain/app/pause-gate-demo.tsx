import React, { useEffect, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
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

const COUNTDOWN_SECONDS = 5;

export default function PauseGateDemoScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    appName = 'Instagram',
    chainName = 'Write Daily',
    streak = '14',
    chainColor = '#FF6B35',
  } = useLocalSearchParams<{
    appName: string;
    chainName: string;
    streak: string;
    chainColor: string;
  }>();

  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [ready, setReady] = useState(false);
  const progressAnim = useRef(new RNAnimated.Value(0)).current;

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  // Breathing circle animation
  const breathScale = useSharedValue(1);
  const breathOpacity = useSharedValue(0.5);

  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathScale.value }],
    opacity: breathOpacity.value,
  }));

  useEffect(() => {
    breathScale.value = withRepeat(
      withSequence(
        withTiming(1.18, { duration: 2800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.92, { duration: 2800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
    breathOpacity.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 2800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 2800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
  }, []);

  // Countdown timer
  useEffect(() => {
    RNAnimated.timing(progressAnim, {
      toValue: 1,
      duration: COUNTDOWN_SECONDS * 1000,
      useNativeDriver: false,
    }).start();

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

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  function handleNotNow() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
          <View style={[styles.appIconWrap, { backgroundColor: '#E1306C22' }]}>
            <Ionicons name="logo-instagram" size={32} color="#E1306C" />
          </View>
          <Text style={[styles.appName, { color: '#888' }]}>
            Opening {appName}…
          </Text>
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
          <Text style={styles.breathInstruction}>
            Breathe in… breathe out…
          </Text>
        </View>

        {/* Countdown bar */}
        <View style={styles.progressWrap}>
          <View style={[styles.progressTrack, { backgroundColor: '#1a1a1a' }]}>
            <RNAnimated.View
              style={[
                styles.progressFill,
                { backgroundColor: chainColor, width: progressWidth },
              ]}
            />
          </View>
          {!ready && (
            <Text style={styles.countdownText}>
              {countdown}s
            </Text>
          )}
        </View>

        {/* Action buttons */}
        <View style={[styles.actions, { opacity: ready ? 1 : 0.3 }]}>
          <Pressable
            onPress={handleNotNow}
            disabled={!ready}
            style={({ pressed }) => [
              styles.notNowBtn,
              { backgroundColor: '#fff', opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.notNowText}>Not now</Text>
          </Pressable>

          <Pressable
            onPress={handleOpenAnyway}
            disabled={!ready}
            style={({ pressed }) => [styles.openAnywayBtn, { opacity: pressed ? 0.7 : 1 }]}
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
  breathInstruction: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#555',
    marginTop: 4,
  },
  progressWrap: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  progressTrack: {
    width: '100%',
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  countdownText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#555',
  },
  actions: {
    width: '100%',
    gap: 12,
  },
  notNowBtn: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: 32,
    alignItems: 'center',
  },
  notNowText: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: '#000',
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
