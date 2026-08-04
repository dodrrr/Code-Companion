import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { usePlan } from '@/context/PlanContext';
import { AmbientScreen } from '@/components/AmbientSurface';

function clock(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export default function FocusSession() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, completeFocusItem } = usePlan();
  const item = items.find((entry) => entry.id === id);
  const targetSeconds = (item?.durationMinutes || 30) * 60;
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const holdProgress = useRef(new Animated.Value(0)).current;
  const holdingRef = useRef(false);
  const finishingRef = useRef(false);
  const remaining = Math.max(0, targetSeconds - elapsed);
  const progress = Math.min(1, elapsed / targetSeconds);
  const topPad = Platform.OS === 'web' ? 40 : insets.top + 8;

  useEffect(() => {
    if (paused || remaining <= 0) return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [paused, remaining]);

  useEffect(() => {
    if (remaining !== 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [remaining]);

  const headline = useMemo(() => remaining === 0 ? 'Block complete' : paused ? 'Focus is paused' : 'Stay with it.', [paused, remaining]);

  async function finish() {
    const actualMinutes = Math.max(1, Math.round(elapsed / 60));
    await completeFocusItem(id, actualMinutes);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }

  function beginEndHold() {
    if (remaining === 0 || finishingRef.current) return;
    holdingRef.current = true;
    holdProgress.stopAnimation();
    holdProgress.setValue(0);
    Haptics.selectionAsync();
    Animated.timing(holdProgress, { toValue: 1, duration: 900, useNativeDriver: false }).start(({ finished }) => {
      if (!finished || !holdingRef.current || finishingRef.current) return;
      holdingRef.current = false;
      finishingRef.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      void finish();
    });
  }

  function cancelEndHold() {
    if (remaining === 0 || finishingRef.current) return;
    holdingRef.current = false;
    holdProgress.stopAnimation();
    Animated.timing(holdProgress, { toValue: 0, duration: 160, useNativeDriver: false }).start();
  }

  if (!item) return <AmbientScreen tone="focus" style={styles.root} />;
  return <AmbientScreen tone="focus" color={item.color || colors.primary} style={[styles.root, { paddingTop: topPad }]}>
    <Pressable onPress={() => router.back()} style={styles.close}><Ionicons name="close" size={24} color={colors.mutedForeground} /></Pressable>
    <View style={styles.inner}>
      <Text style={[styles.eyebrow, { color: item.color || colors.primary }]}>FOCUS SESSION</Text>
      <Text style={[styles.task, { color: colors.foreground }]} numberOfLines={2}>{item.text}</Text>
      <View style={[styles.ring, { borderColor: (item.color || colors.primary) + '55' }]}>
        <View style={[styles.ringFill, { backgroundColor: (item.color || colors.primary) + '14', borderColor: item.color || colors.primary, transform: [{ scale: 0.9 + progress * 0.1 }] }]}>
          <Text style={[styles.clock, { color: colors.foreground }]}>{clock(remaining)}</Text>
          <Text style={[styles.remaining, { color: colors.mutedForeground }]}>{remaining === 0 ? 'well held' : 'remaining'}</Text>
        </View>
      </View>
      <View style={styles.copy}><Text style={[styles.headline, { color: colors.foreground }]}>{headline}</Text><Text style={[styles.body, { color: colors.mutedForeground }]}>{remaining === 0 ? 'You gave this block the attention you planned.' : `${Math.max(1, Math.round(elapsed / 60))} min protected so far.`}</Text></View>
      <View style={styles.actions}>
        <Pressable onPress={() => setPaused((value) => !value)} style={[styles.pause, { backgroundColor: colors.card, borderColor: colors.border }]}><Ionicons name={paused ? 'play' : 'pause'} size={18} color={colors.foreground} /><Text style={[styles.pauseText, { color: colors.foreground }]}>{paused ? 'Resume' : 'Pause'}</Text></Pressable>
        <Pressable onPress={remaining === 0 ? finish : undefined} onPressIn={beginEndHold} onPressOut={cancelEndHold} style={[styles.finish, { backgroundColor: colors.card, borderColor: item.color || colors.primary }]}><Animated.View pointerEvents="none" style={[styles.holdFill, { backgroundColor: item.color || colors.primary, width: holdProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} /><View pointerEvents="none" style={styles.finishContent}><Ionicons name="checkmark" size={19} color="#fff" /><Text style={styles.finishText}>{remaining === 0 ? 'Finish' : 'Hold to end'}</Text></View></Pressable>
      </View>
    </View>
  </AmbientScreen>;
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24 }, close: { alignSelf: 'flex-end', padding: 10 }, inner: { flex: 1, alignItems: 'center', paddingTop: 64, paddingBottom: 40 }, eyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.4 }, task: { fontSize: 28, lineHeight: 34, fontFamily: 'Inter_700Bold', textAlign: 'center', marginTop: 10, maxWidth: 330 }, ring: { width: 244, height: 244, borderRadius: 122, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 56 }, ringFill: { width: 194, height: 194, borderRadius: 97, borderWidth: 2, alignItems: 'center', justifyContent: 'center' }, clock: { fontSize: 37, fontFamily: 'Inter_700Bold', letterSpacing: -1 }, remaining: { fontSize: 11, fontFamily: 'Inter_500Medium', marginTop: 4 }, copy: { alignItems: 'center', marginTop: 46 }, headline: { fontSize: 21, fontFamily: 'Inter_700Bold' }, body: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 7 }, actions: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 'auto' }, pause: { flex: 0.78, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderRadius: 19, paddingVertical: 15 }, pauseText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' }, finish: { flex: 1.22, borderRadius: 19, borderWidth: 1.5, paddingVertical: 15, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, holdFill: { position: 'absolute', left: 0, top: 0, bottom: 0 }, finishContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, finishText: { color: '#fff', fontSize: 14, fontFamily: 'Inter_700Bold' },
});
