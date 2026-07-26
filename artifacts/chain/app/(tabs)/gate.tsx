import React, { useEffect, useState } from 'react';
import {
  Modal,
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
  iconText?: string; // fallback text label for apps without good icon matches
}

const APPS: AppEntry[] = [
  { id: 'instagram', name: 'Instagram',  icon: 'logo-instagram', iconColor: '#E1306C' },
  { id: 'tiktok',   name: 'TikTok',     icon: 'musical-notes',  iconColor: '#69C9D0', iconText: 'Tk' },
  { id: 'twitter',  name: 'X / Twitter', icon: 'logo-twitter',   iconColor: '#1DA1F2' },
  { id: 'youtube',  name: 'YouTube',     icon: 'logo-youtube',   iconColor: '#FF0000' },
  { id: 'reddit',   name: 'Reddit',      icon: 'logo-reddit',    iconColor: '#FF4500' },
  { id: 'snapchat', name: 'Snapchat',    icon: 'camera',         iconColor: '#FFFC00' },
  { id: 'facebook', name: 'Facebook',    icon: 'logo-facebook',  iconColor: '#1877F2' },
  { id: 'linkedin', name: 'LinkedIn',    icon: 'logo-linkedin',  iconColor: '#0A66C2' },
];

const GATE_KEY     = '@chain_gate_apps';
const TUTORIAL_KEY = '@chain_gate_tutorial_seen';

// ─── Tutorial modal ──────────────────────────────────────────────────────────

const TUTORIAL_STEPS = [
  {
    icon: 'shield-checkmark' as const,
    title: 'Your pause before the scroll',
    body: 'Chain adds a moment of friction before you open apps you have flagged. You see your streak, you see your progress — and you decide if it is worth breaking.',
  },
  {
    icon: 'toggle' as const,
    title: 'Toggle to protect',
    body: 'Flip the switch next to any app to mark it as protected. When you open that app, Chain will surface your streak first.',
  },
  {
    icon: 'phone-portrait-outline' as const,
    title: 'For hard limits, use Screen Time',
    body: 'Chain shows you a reminder — it cannot technically block apps on its own. For genuine blocking, go to Settings → Screen Time → App Limits on iOS. Chain works best alongside it.',
  },
];

function TutorialModal({ onDone }: { onDone: () => void }) {
  const colors = useColors();
  const [step, setStep] = useState(0);
  const isLast = step === TUTORIAL_STEPS.length - 1;
  const s = TUTORIAL_STEPS[step];

  return (
    <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={onDone}>
      <View style={tStyles.backdrop}>
        <View style={[tStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Step icon */}
          <View style={[tStyles.iconWrap, { backgroundColor: colors.primary + '1A' }]}>
            <Ionicons name={s.icon} size={32} color={colors.primary} />
          </View>

          <Text style={[tStyles.title, { color: colors.foreground }]}>{s.title}</Text>
          <Text style={[tStyles.body, { color: colors.mutedForeground }]}>{s.body}</Text>

          {/* Step dots */}
          <View style={tStyles.dots}>
            {TUTORIAL_STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  tStyles.dot,
                  { backgroundColor: i === step ? colors.primary : colors.border },
                ]}
              />
            ))}
          </View>

          {/* Actions */}
          <View style={tStyles.actions}>
            {step > 0 && (
              <Pressable onPress={() => setStep(step - 1)} style={tStyles.backBtn}>
                <Text style={[tStyles.backText, { color: colors.mutedForeground }]}>Back</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => (isLast ? onDone() : setStep(step + 1))}
              style={({ pressed }) => [
                tStyles.nextBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1, flex: step > 0 ? 1 : undefined },
              ]}
            >
              <Text style={tStyles.nextText}>{isLast ? "Got it" : "Next"}</Text>
            </Pressable>
          </View>

          {/* Skip */}
          {!isLast && (
            <Pressable onPress={onDone} style={tStyles.skipBtn}>
              <Text style={[tStyles.skipText, { color: colors.mutedForeground }]}>Skip</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function GateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { chains } = useChains();
  const [enabled,         setEnabled]         = useState<Record<string, boolean>>({});
  const [showTutorial,    setShowTutorial]     = useState(false);
  const [tutorialChecked, setTutorialChecked]  = useState(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 84 : insets.bottom;

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(GATE_KEY),
      AsyncStorage.getItem(TUTORIAL_KEY),
    ]).then(([gateRaw, tutorialSeen]) => {
      if (gateRaw) setEnabled(JSON.parse(gateRaw));
      if (!tutorialSeen) setShowTutorial(true);
      setTutorialChecked(true);
    });
  }, []);

  function dismissTutorial() {
    AsyncStorage.setItem(TUTORIAL_KEY, '1');
    setShowTutorial(false);
  }

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
        appName:    'Instagram',
        chainName:  firstChain?.name ?? 'Write Daily',
        streak:     firstChain ? String(firstChain.completedDates.length) : '14',
        chainColor: firstChain?.color ?? '#FF6B35',
      },
    });
  }

  const enabledCount = Object.values(enabled).filter(Boolean).length;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Tutorial modal */}
      {tutorialChecked && showTutorial && <TutorialModal onDone={dismissTutorial} />}

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
        <View style={styles.headerRight}>
          {/* Re-open tutorial */}
          <Pressable
            onPress={() => setShowTutorial(true)}
            style={({ pressed }) => [styles.helpBtn, { opacity: pressed ? 0.6 : 1, borderColor: colors.border }]}
          >
            <Ionicons name="help-circle-outline" size={20} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            onPress={openDemo}
            style={({ pressed }) => [
              styles.previewBtn,
              {
                borderColor:     colors.primary,
                backgroundColor: colors.primary + '18',
                opacity:         pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="play" size={14} color={colors.primary} />
            <Text style={[styles.previewBtnText, { color: colors.primary }]}>Preview</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: botPad + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Info card */}
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
            When you open a protected app, you will see your streak and a 5-second
            pause — a moment to decide if it is worth it.
          </Text>
        </View>

        {/* Apps list */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          PROTECTED APPS
        </Text>

        <View style={[styles.appsList, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {APPS.map((app, i) => (
            <View key={app.id}>
              <View style={styles.appRow}>
                <View style={[styles.appIcon, { backgroundColor: app.iconColor + '22' }]}>
                  {app.iconText ? (
                    <Text style={[styles.appIconText, { color: app.iconColor }]}>{app.iconText}</Text>
                  ) : (
                    <Ionicons name={app.icon} size={20} color={app.iconColor} />
                  )}
                </View>
                <Text style={[styles.appName, { color: colors.foreground }]}>{app.name}</Text>
                <Switch
                  value={!!enabled[app.id]}
                  onValueChange={() => toggle(app.id)}
                  trackColor={{ false: colors.border, true: colors.primary + 'aa' }}
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
            . Chain works best alongside Screen Time for genuine friction.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Tutorial styles ──────────────────────────────────────────────────────────

const tStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    lineHeight: 23,
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
    marginBottom: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginTop: 4,
  },
  backBtn: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 24,
  },
  backText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  nextBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 24,
  },
  nextText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  skipBtn: {
    paddingVertical: 4,
  },
  skipText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
});

// ─── Screen styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
  },
  headerSub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  helpBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  appIconText: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
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
