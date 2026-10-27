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
  const slot = Math.max(0, width - 8) / state.routes.length;
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onMoveShouldSetPanResponderCapture: (_, gesture) => Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
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
        <BlurView pointerEvents="none" intensity={45} tint="systemUltraThinMaterialDark" style={StyleSheet.absoluteFill} />
        <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.025)', 'rgba(255,255,255,0.005)']} style={StyleSheet.absoluteFill} />
        {slot > 0 && <Animated.View pointerEvents="none" style={[styles.selection, { width: slot + 2, transform: [{ translateX: Animated.multiply(position, slot) }] }]} />}
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : options.title ?? route.name;
          const color = focused ? options.tabBarActiveTintColor ?? '#ffffff' : '#E8E8ED';
          return <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} aria-selected={focused}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) { playFeedback('selection'); navigation.navigate(route.name, route.params); }
            }} style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.65 : 1 }]}>
            {options.tabBarIcon?.({ focused, color, size: 26 })}
            <Text numberOfLines={1} style={[styles.label, focused && styles.activeLabel, { color }]}>{label}</Text>
          </Pressable>;
        })}
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', alignItems: 'center' },
  shadow: { width: 276, maxWidth: '100%', borderRadius: 32, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  capsule: { flexDirection: 'row', height: 62, borderRadius: 32, overflow: 'hidden', padding: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(17,17,21,0.80)' },
  selection: { position: 'absolute', top: 3, bottom: 3, left: 3, borderRadius: 29, backgroundColor: 'rgba(59,59,63,0.76)' },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 0, borderRadius: 29 },
  label: { fontSize: 11, lineHeight: 15, fontFamily: 'Inter_500Medium' },
  activeLabel: { fontSize: 14, lineHeight: 17, fontFamily: 'Inter_600SemiBold' },
});
