import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playFeedback } from '@/lib/feedback';

/** Route state belongs to the navigator; only the highlight's position is animated here. */
type BottomTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];
export default function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const position = useRef(new Animated.Value(state.index)).current;
  const slot = Math.max(0, width - 12) / state.routes.length;
  const activeTint = descriptors[state.routes[state.index].key].options.tabBarActiveTintColor;
  const accent = typeof activeTint === 'string' && /^#[0-9a-f]{6}$/i.test(activeTint) ? activeTint : '#ffffff';
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (_, gesture) => {
      if (!reduceMotion && slot > 0) position.setValue(Math.max(0, Math.min(state.routes.length - 1, state.index + gesture.dx / slot)));
    },
    onPanResponderRelease: (_, gesture) => {
      const next = Math.max(0, Math.min(state.routes.length - 1, state.index + Math.round(gesture.dx / Math.max(slot, 1))));
      const route = state.routes[next];
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!event.defaultPrevented && next !== state.index) { playFeedback('selection'); navigation.navigate(route.name, route.params); }
      const destination = event.defaultPrevented ? state.index : next;
      if (reduceMotion) position.setValue(destination);
      else Animated.spring(position, { toValue: destination, damping: 25, stiffness: 250, useNativeDriver: Platform.OS !== 'web' }).start();
    },
    onPanResponderTerminate: () => position.setValue(state.index),
  }), [navigation, position, reduceMotion, slot, state]);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); });
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; listener.remove(); };
  }, []);
  useEffect(() => {
    if (reduceMotion) { position.setValue(state.index); return; }
    const animation = Animated.spring(position, {
      toValue: state.index, damping: 25, stiffness: 250, mass: 1,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [position, reduceMotion, state.index]);

  return <View pointerEvents="box-none" style={[styles.dock, { bottom: Math.max(insets.bottom, 12), left: Math.max(insets.left, 16), right: Math.max(insets.right, 16) }]}>
    <View style={styles.shadow}>
      <View {...pan.panHandlers} onLayout={event => setWidth(event.nativeEvent.layout.width)} style={styles.capsule}>
        <BlurView pointerEvents="none" intensity={65} tint="systemUltraThinMaterialDark" style={StyleSheet.absoluteFill} />
        <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.025)', 'rgba(4,4,8,0.18)']} style={StyleSheet.absoluteFill} />
        {slot > 0 && <Animated.View pointerEvents="none" style={[styles.selection, { width: slot, backgroundColor: accent + '12', borderColor: accent + '35', transform: [{ translateX: Animated.multiply(position, slot) }] }]}>
          <LinearGradient colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.035)']} style={StyleSheet.absoluteFill} />
        </Animated.View>}
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : options.title ?? route.name;
          const color = focused ? options.tabBarActiveTintColor ?? '#ffffff' : '#A7A7B0';
          return <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} aria-selected={focused}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) { playFeedback('selection'); navigation.navigate(route.name, route.params); }
            }} style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.65 : 1 }]}>
            {options.tabBarIcon?.({ focused, color, size: 22 })}
            <Text numberOfLines={1} style={[styles.label, { color }]}>{label}</Text>
          </Pressable>;
        })}
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', alignItems: 'center' },
  shadow: { width: '100%', maxWidth: 460, borderRadius: 34, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.24, shadowRadius: 18, elevation: 8 },
  capsule: { flexDirection: 'row', height: 66, borderRadius: 34, overflow: 'hidden', padding: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', backgroundColor: 'rgba(18,18,23,0.64)' },
  selection: { position: 'absolute', top: 6, bottom: 6, left: 6, borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 28 },
  label: { fontSize: 11, lineHeight: 14, fontFamily: 'Inter_600SemiBold' },
});
