import React from 'react';
import GlassTabBar from '@/components/GlassTabBar';
import { Platform } from 'react-native';
import { SECTION_ACCENTS } from '@/constants/sectionTheme';
import { TabSymbol } from '@/components/ui/TabSymbol';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

function NativeTabLayout() {
  return (
    <NativeTabs
      backgroundColor="rgba(12,12,14,0.76)"
      blurEffect="systemUltraThinMaterialDark"
      shadowColor="rgba(255,255,255,0.10)"
      disableTransparentOnScrollEdge
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'link', selected: 'link' }} selectedColor={SECTION_ACCENTS.today} />
        <NativeTabs.Trigger.Label selectedStyle={{ color: SECTION_ACCENTS.today, fontWeight: '600' }}>Today</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="gate">
        <NativeTabs.Trigger.Icon sf={{ default: 'shield', selected: 'shield.fill' }} selectedColor={SECTION_ACCENTS.gate} />
        <NativeTabs.Trigger.Label selectedStyle={{ color: SECTION_ACCENTS.gate, fontWeight: '600' }}>Gate</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="plan">
        <NativeTabs.Trigger.Icon sf={{ default: 'moon', selected: 'moon.fill' }} selectedColor={SECTION_ACCENTS.plan} />
        <NativeTabs.Trigger.Label selectedStyle={{ color: SECTION_ACCENTS.plan, fontWeight: '600' }}>Plan</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  return (
    <Tabs tabBar={props => <GlassTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarActiveTintColor: SECTION_ACCENTS.today,
          tabBarIcon: ({ color, focused, size }) => <TabSymbol name="link" color={String(color)} focused={focused} size={size} />,
        }}
      />
      <Tabs.Screen
        name="gate"
        options={{
          title: 'Gate',
          tabBarActiveTintColor: SECTION_ACCENTS.gate,
          tabBarIcon: ({ color, focused, size }) => <TabSymbol name="shield" color={String(color)} focused={focused} size={size} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Plan',
          tabBarActiveTintColor: SECTION_ACCENTS.plan,
          tabBarIcon: ({ color, focused, size }) => <TabSymbol name="moon" color={String(color)} focused={focused} size={size} />,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  // NativeTabs is iOS-only; always fall back to ClassicTabLayout on web/Android
  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
