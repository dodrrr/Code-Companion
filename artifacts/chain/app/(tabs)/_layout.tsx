import React from 'react';
import { Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function NativeTabLayout() {
  return (
    <NativeTabs
      backgroundColor="rgba(12,12,14,0.76)"
      blurEffect="systemUltraThinMaterialDark"
      shadowColor="rgba(255,255,255,0.10)"
      disableTransparentOnScrollEdge
    >
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'link', selected: 'link' }} selectedColor="#FF6B35" />
        <Label selectedStyle={{ color: '#FF6B35', fontWeight: '600' }}>Chains</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="gate">
        <Icon sf={{ default: 'shield', selected: 'shield.fill' }} selectedColor="#FF6B35" />
        <Label selectedStyle={{ color: '#FF6B35', fontWeight: '600' }}>Gate</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="plan">
        <Icon sf={{ default: 'moon', selected: 'moon.fill' }} selectedColor="#FF6B35" />
        <Label selectedStyle={{ color: '#FF6B35', fontWeight: '600' }}>Plan</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const safeAreaInsets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          paddingBottom: safeAreaInsets.bottom,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <View style={[StyleSheet.absoluteFill, styles.tabGlass]}>
              <BlurView intensity={80} tint={isDark ? 'dark' : 'dark'} style={StyleSheet.absoluteFill} />
              <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.075)', 'rgba(255,255,255,0.018)', 'rgba(0,0,0,0.08)']} style={StyleSheet.absoluteFill} />
            </View>
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.background },
              ]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chains',
          tabBarActiveTintColor: '#FF6B35',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="link" tintColor={color} size={22} />
            ) : (
              <Feather name="link" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="gate"
        options={{
          title: 'Gate',
          tabBarActiveTintColor: '#FF6B35',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="shield.fill" tintColor={color} size={22} />
            ) : (
              <Feather name="shield" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Plan',
          tabBarActiveTintColor: '#FF6B35',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="moon.fill" tintColor={color} size={22} />
            ) : (
              <Feather name="moon" size={22} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabGlass: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.14)' },
});

export default function TabLayout() {
  // NativeTabs is iOS-only; always fall back to ClassicTabLayout on web/Android
  if (Platform.OS !== 'web' && isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
