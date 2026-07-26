import React, { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useChains } from '@/context/ChainsContext';

interface AppEntry {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
}

const APPS: AppEntry[] = [
  { id: 'instagram', name: 'Instagram', icon: 'logo-instagram', iconColor: '#E1306C' },
  { id: 'tiktok', name: 'TikTok', icon: 'musical-notes', iconColor: '#010101' },
  { id: 'twitter', name: 'X / Twitter', icon: 'logo-twitter', iconColor: '#1DA1F2' },
  { id: 'youtube', name: 'YouTube', icon: 'logo-youtube', iconColor: '#FF0000' },
  { id: 'reddit', name: 'Reddit', icon: 'logo-reddit', iconColor: '#FF4500' },
  { id: 'snapchat', name: 'Snapchat', icon: 'camera', iconColor: '#FFFC00' },
  { id: 'facebook', name: 'Facebook', icon: 'logo-facebook', iconColor: '#1877F2' },
  { id: 'linkedin', name: 'LinkedIn', icon: 'logo-linkedin', iconColor: '#0A66C2' },
];

const GATE_KEY = '@chain_gate_apps';

export default function GateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { chains } = useChains();
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 84 : insets.bottom;

  useEffect(() => {
    AsyncStorage.getItem(GATE_KEY).then((raw) => {
      if (raw) setEnabled(JSON.parse(raw));
    });
  }, []);

  function toggle(id: string) {
    const next = { ...enabled, [id]: !enabled[id] };
    setEnabled(next);
    AsyncStorage.setItem(GATE_KEY, JSON.stringify(next));
  }

  function openDemo() {
    const firstChain = chains[0];
    router.push({
      pathname: '/pause-gate-demo',
      params: {
        appName: 'Instagram',
        chainName: firstChain?.name ?? 'Write Daily',
        streak: firstChain ? String(firstChain.completedDates.length) : '14',
        chainColor: firstChain?.color ?? '#FF6B35',
      },
    });
  }

  const enabledCount = Object.values(enabled).filter(Boolean).length;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Pause Gate
          </Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {enabledCount} app{enabledCount !== 1 ? 's' : ''} protected
          </Text>
        </View>
        <Pressable
          onPress={openDemo}
          style={({ pressed }) => [
            styles.previewBtn,
            {
              borderColor: colors.primary,
              backgroundColor: colors.primary + '18',
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Ionicons name="play" size={14} color={colors.primary} />
          <Text style={[styles.previewBtnText, { color: colors.primary }]}>
            Preview
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: botPad + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Info card */}
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
            When you open a protected app, you'll see your streak and a
            5-second pause — giving you a moment to decide if it's worth it.
          </Text>
        </View>

        {/* Apps list */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          PROTECTED APPS
        </Text>

        <View
          style={[
            styles.appsList,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {APPS.map((app, i) => (
            <View key={app.id}>
              <View style={styles.appRow}>
                <View
                  style={[
                    styles.appIcon,
                    { backgroundColor: app.iconColor + '22' },
                  ]}
                >
                  <Ionicons name={app.icon} size={20} color={app.iconColor} />
                </View>
                <Text
                  style={[styles.appName, { color: colors.foreground }]}
                >
                  {app.name}
                </Text>
                <Switch
                  value={!!enabled[app.id]}
                  onValueChange={() => toggle(app.id)}
                  trackColor={{
                    false: colors.border,
                    true: colors.primary + 'aa',
                  }}
                  thumbColor={enabled[app.id] ? colors.primary : colors.mutedForeground}
                  ios_backgroundColor={colors.border}
                />
              </View>
              {i < APPS.length - 1 && (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              )}
            </View>
          ))}
        </View>

        {/* iOS note */}
        <View style={[styles.noteCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.mutedForeground} />
          <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
            For real blocking on iOS, go to{' '}
            <Text style={{ fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>
              Settings → Screen Time → App Limits
            </Text>
            . The Gate experience works best alongside Screen Time for genuine friction.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
  },
  headerSub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  previewBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  scroll: {
    paddingHorizontal: 20,
    gap: 12,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 4,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 21,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.2,
    marginTop: 8,
    marginBottom: 4,
  },
  appsList: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  appIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  divider: {
    height: 1,
    marginLeft: 70,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 4,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },
});
