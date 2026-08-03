import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { getStreak, useChains } from '@/context/ChainsContext';
import { GateSaveEvent, getGateSaves24h } from '@/lib/gateStats';
import { getGateWindows } from '@/lib/gateWindows';
import { GateWindowsContent } from '@/app/gate-windows';

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
const GATE_RULES_KEY = '@chain_gate_rules';
const TUTORIAL_KEY = '@chain_gate_tutorial_seen';
const DAILY_LIMIT_OPTIONS = [15, 30, 45, 60, 90, 120];

type GateMode = 'every_open' | 'daily_limit';
type GateRule = { mode: GateMode; dailyLimitMinutes: number };

const DEFAULT_RULE: GateRule = { mode: 'every_open', dailyLimitMinutes: 30 };

// ─── Tutorial modal ──────────────────────────────────────────────────────────

const TUTORIAL_STEPS = [
  {
    icon: 'shield-checkmark' as const,
    title: 'Your pause before the scroll',
    body: 'Chain adds a moment of friction before you open apps you have flagged. You see your streak, you see your progress — and you decide if it is worth breaking.',
  },
  {
    icon: 'apps-outline' as const,
    title: 'Choose what deserves friction',
    body: 'Add only the apps where you want a pause. Choose every opening or a daily limit for each one.',
  },
  {
    icon: 'flash-outline' as const,
    title: 'Connect it with Shortcuts',
    body: 'Open Shortcuts → Automation → + → App. Pick an app, choose “Is Opened”, then select “Run Immediately”. Make one automation for each app you protect.',
  },
  {
    icon: 'link-outline' as const,
    title: 'Open Chain on every trigger',
    body: 'In that automation, add the Open URL action and use chain://pause-gate-demo. It opens Chain’s pause; pair it with Screen Time if you also want an iOS system limit.',
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
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
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

function GateRuleModal({ app, initialRule, onSave, onClose }: { app: AppEntry; initialRule: GateRule; onSave: (rule: GateRule) => void; onClose: () => void }) {
  const colors = useColors();
  const [rule, setRule] = useState<GateRule>(initialRule);
  return <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}><View style={ruleStyles.backdrop}><View style={[ruleStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <View style={[ruleStyles.appIcon, { backgroundColor: app.iconColor + '22' }]}>{app.iconText ? <Text style={[styles.appIconText, { color: app.iconColor }]}>{app.iconText}</Text> : <Ionicons name={app.icon} size={21} color={app.iconColor} />}</View>
    <Text style={[ruleStyles.eyebrow, { color: colors.primary }]}>PROTECT {app.name.toUpperCase()}</Text>
    <Text style={[ruleStyles.title, { color: colors.foreground }]}>When should Gate step in?</Text>
    <Pressable onPress={() => setRule((current) => ({ ...current, mode: 'every_open' }))} style={[ruleStyles.mode, { backgroundColor: rule.mode === 'every_open' ? colors.primary + '16' : colors.background, borderColor: rule.mode === 'every_open' ? colors.primary : colors.border }]}><View style={[ruleStyles.modeIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name="shield-outline" size={19} color={colors.primary} /></View><View style={ruleStyles.modeCopy}><Text style={[ruleStyles.modeTitle, { color: colors.foreground }]}>Every opening</Text><Text style={[ruleStyles.modeBody, { color: colors.mutedForeground }]}>Show a pause before every open.</Text></View>{rule.mode === 'every_open' && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}</Pressable>
    <Pressable onPress={() => setRule((current) => ({ ...current, mode: 'daily_limit' }))} style={[ruleStyles.mode, { backgroundColor: rule.mode === 'daily_limit' ? colors.primary + '16' : colors.background, borderColor: rule.mode === 'daily_limit' ? colors.primary : colors.border }]}><View style={[ruleStyles.modeIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name="timer-outline" size={19} color={colors.primary} /></View><View style={ruleStyles.modeCopy}><Text style={[ruleStyles.modeTitle, { color: colors.foreground }]}>Daily limit</Text><Text style={[ruleStyles.modeBody, { color: colors.mutedForeground }]}>Pause once you reach your chosen time.</Text></View>{rule.mode === 'daily_limit' && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}</Pressable>
    {rule.mode === 'daily_limit' && <><Text style={[ruleStyles.limitLabel, { color: colors.mutedForeground }]}>DAILY TIME</Text><View style={ruleStyles.limitRow}>{DAILY_LIMIT_OPTIONS.map((minutes) => <Pressable key={minutes} onPress={() => setRule((current) => ({ ...current, dailyLimitMinutes: minutes }))} style={[ruleStyles.limitPill, { backgroundColor: rule.dailyLimitMinutes === minutes ? colors.primary : colors.background, borderColor: rule.dailyLimitMinutes === minutes ? colors.primary : colors.border }]}><Text style={[ruleStyles.limitText, { color: rule.dailyLimitMinutes === minutes ? '#fff' : colors.mutedForeground }]}>{minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`}</Text></Pressable>)}</View></>}
    <Text style={[ruleStyles.note, { color: colors.mutedForeground }]}>This saves your rule. Set up the Shortcuts automation from the Gate guide to open Chain’s pause when this app opens.</Text>
    <Pressable onPress={() => onSave(rule)} style={[ruleStyles.save, { backgroundColor: colors.primary }]}><Text style={ruleStyles.saveText}>Save protection</Text></Pressable>
    <Pressable onPress={onClose} style={ruleStyles.cancel}><Text style={[ruleStyles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text></Pressable>
  </View></View></Modal>;
}

function AppPickerModal({ apps, onPick, onClose }: { apps: AppEntry[]; onPick: (app: AppEntry) => void; onClose: () => void }) {
  const colors = useColors();
  return <Modal transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}><View style={ruleStyles.backdrop}><View style={[ruleStyles.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: 'stretch' }]}><Text style={[ruleStyles.title, { color: colors.foreground, textAlign: 'left', marginBottom: 6 }]}>Choose an app</Text><Text style={[ruleStyles.note, { color: colors.mutedForeground, textAlign: 'left', marginTop: 0, marginBottom: 14 }]}>Add only the apps where you want a moment of friction.</Text>{apps.map((app) => <Pressable key={app.id} onPress={() => onPick(app)} style={[styles.pickerRow, { backgroundColor: colors.background, borderColor: colors.border }]}><View style={[styles.appIcon, { backgroundColor: app.iconColor + '22' }]}>{app.iconText ? <Text style={[styles.appIconText, { color: app.iconColor }]}>{app.iconText}</Text> : <Ionicons name={app.icon} size={20} color={app.iconColor} />}</View><Text style={[styles.appName, { color: colors.foreground, flex: 1 }]}>{app.name}</Text><Ionicons name="add-circle-outline" size={21} color={colors.primary} /></Pressable>)}<Pressable onPress={onClose} style={ruleStyles.cancel}><Text style={[ruleStyles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text></Pressable></View></View></Modal>;
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function GateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: pageWidth } = useWindowDimensions();
  const { chains } = useChains();
  const [enabled,         setEnabled]         = useState<Record<string, boolean>>({});
  const [rules,           setRules]           = useState<Record<string, GateRule>>({});
  const [configuringApp,  setConfiguringApp]  = useState<AppEntry | null>(null);
  const [showAppPicker,   setShowAppPicker]   = useState(false);
  const [saveEvents,      setSaveEvents]      = useState<GateSaveEvent[]>([]);
  const [showTutorial,    setShowTutorial]     = useState(false);
  const [tutorialChecked, setTutorialChecked]  = useState(false);
  const [windowCount, setWindowCount] = useState(0);
  const [activePage, setActivePage] = useState(0);
  const [pauseSegmentWidth, setPauseSegmentWidth] = useState(0);
  const [windowsSegmentWidth, setWindowsSegmentWidth] = useState(0);
  const pagerRef = useRef<ScrollView>(null);
  const pageProgress = useRef(new Animated.Value(0)).current;

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 84 : insets.bottom;

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(GATE_KEY),
      AsyncStorage.getItem(GATE_RULES_KEY),
      AsyncStorage.getItem(TUTORIAL_KEY),
    ]).then(([gateRaw, rulesRaw, tutorialSeen]) => {
      if (gateRaw) setEnabled(JSON.parse(gateRaw));
      if (rulesRaw) setRules(JSON.parse(rulesRaw));
      if (!tutorialSeen) setShowTutorial(true);
      setTutorialChecked(true);
    });
  }, []);

  const refreshSaveEvents = useCallback(() => { void getGateSaves24h().then(setSaveEvents); }, []);
  const refreshWindows = useCallback(() => { void getGateWindows().then((windows) => setWindowCount(windows.length)); }, []);
  useFocusEffect(useCallback(() => { refreshSaveEvents(); refreshWindows(); }, [refreshSaveEvents, refreshWindows]));

  function dismissTutorial() {
    AsyncStorage.setItem(TUTORIAL_KEY, '1');
    setShowTutorial(false);
  }

  function saveRule(app: AppEntry, rule: GateRule) {
    const nextEnabled = { ...enabled, [app.id]: true };
    const nextRules = { ...rules, [app.id]: rule };
    setEnabled(nextEnabled);
    setRules(nextRules);
    AsyncStorage.setItem(GATE_KEY, JSON.stringify(nextEnabled));
    AsyncStorage.setItem(GATE_RULES_KEY, JSON.stringify(nextRules));
    setConfiguringApp(null);
  }

  function openDemo() {
    const firstProtectedApp = APPS.find((app) => enabled[app.id]);
    if (!firstProtectedApp) {
      setShowAppPicker(true);
      return;
    }
    const firstChain = chains[0];
    router.push({
      pathname: '/pause-gate-demo',
      params: {
        appId:      firstProtectedApp.id,
        appName:    firstProtectedApp.name,
        appIcon:    firstProtectedApp.icon,
        appColor:   firstProtectedApp.iconColor,
        chainName:  firstChain?.name ?? 'Write Daily',
        streak:     firstChain ? String(getStreak(firstChain)) : '14',
        chainColor: firstChain?.color ?? '#FF6B35',
        gateMode: rules[firstProtectedApp.id]?.mode ?? 'every_open',
        dailyLimit: String(rules[firstProtectedApp.id]?.dailyLimitMinutes ?? 30),
      },
    });
  }

  const enabledCount = Object.values(enabled).filter(Boolean).length;
  const protectedApps = APPS.filter((app) => enabled[app.id]);
  const availableApps = APPS.filter((app) => !enabled[app.id]);
  const savesForApp = (id: string) => saveEvents.filter((event) => event.appId === id).length;
  const showPage = (page: 0 | 1) => {
    setActivePage(page);
    pagerRef.current?.scrollTo({ x: page * pageWidth, animated: true });
  };

  function removeProtection(app: AppEntry) {
    Alert.alert('Remove protection?', `${app.name} will no longer appear in your Pause Gate.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { const nextEnabled = { ...enabled }; const nextRules = { ...rules }; delete nextEnabled[app.id]; delete nextRules[app.id]; setEnabled(nextEnabled); setRules(nextRules); void AsyncStorage.setItem(GATE_KEY, JSON.stringify(nextEnabled)); void AsyncStorage.setItem(GATE_RULES_KEY, JSON.stringify(nextRules)); } },
    ]);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Tutorial modal */}
      {tutorialChecked && showTutorial && <TutorialModal onDone={dismissTutorial} />}
      {configuringApp && <GateRuleModal app={configuringApp} initialRule={rules[configuringApp.id] ?? DEFAULT_RULE} onSave={(rule) => saveRule(configuringApp, rule)} onClose={() => setConfiguringApp(null)} />}
      {showAppPicker && <AppPickerModal apps={availableApps} onPick={(app) => { setShowAppPicker(false); setConfiguringApp(app); }} onClose={() => setShowAppPicker(false)} />}

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={{ flex: 1 }}>
          <View style={[styles.gateSwitcher, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {pauseSegmentWidth > 0 && windowsSegmentWidth > 0 && <Animated.View pointerEvents="none" style={[styles.gateSwitcherPill, { width: pageProgress.interpolate({ inputRange: [0, 1], outputRange: [pauseSegmentWidth, windowsSegmentWidth] }), backgroundColor: colors.primary + '28', borderColor: colors.primary + '45', transform: [{ translateX: pageProgress.interpolate({ inputRange: [0, 1], outputRange: [0, pauseSegmentWidth + 3] }) }, { scaleX: pageProgress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.025, 1] }) }] }]} />}
            <Pressable onLayout={(event) => setPauseSegmentWidth(event.nativeEvent.layout.width)} onPress={() => showPage(0)} style={({ pressed }) => [styles.gateSegment, { opacity: pressed ? 0.76 : 1 }]}><Text style={[styles.headerTitle, { color: activePage === 0 ? colors.foreground : colors.mutedForeground }]}>Pause Gate</Text></Pressable>
            <Pressable onLayout={(event) => setWindowsSegmentWidth(event.nativeEvent.layout.width)} onPress={() => showPage(1)} style={({ pressed }) => [styles.gateSegment, { opacity: pressed ? 0.76 : 1 }]}><Text style={[styles.headerTitle, { color: activePage === 1 ? colors.foreground : colors.mutedForeground }]}>Windows</Text></Pressable>
          </View>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {activePage === 0 ? `${enabledCount} app${enabledCount !== 1 ? 's' : ''} protected · ${saveEvents.length} pauses chosen` : windowCount ? `${windowCount} scheduled guardrail${windowCount === 1 ? '' : 's'}` : 'Give important hours their own guardrail.'}
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
        </View>
      </View>

      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(event) => {
          const progress = Math.max(0, Math.min(1, event.nativeEvent.contentOffset.x / pageWidth));
          pageProgress.setValue(progress);
          const nextPage = Math.round(progress);
          if (nextPage !== activePage) setActivePage(nextPage);
        }}
      >
      <View style={{ width: pageWidth, height: '100%' }}><ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: botPad + 32 }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.savesHero, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '55' }]}>
          <View style={[styles.savesIcon, { backgroundColor: colors.primary + '20' }]}><Ionicons name="shield-checkmark" size={22} color={colors.primary} /></View>
          <View style={styles.savesCopy}><Text style={[styles.savesNumber, { color: colors.primary }]}>{saveEvents.length}</Text><Text style={[styles.savesTitle, { color: colors.foreground }]}>times you chose the pause</Text><Text style={[styles.savesBody, { color: colors.mutedForeground }]}>Your wins in the last 24 hours.</Text></View>
        </View>
        <Pressable onPress={openDemo} style={({ pressed }) => [styles.previewWide, { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 }]}><Text style={styles.previewWideText}>Preview your Pause Gate</Text></Pressable>
        <Pressable onPress={() => setShowTutorial(true)} style={({ pressed }) => [styles.previewNote, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.72 : 1 }]}>
          <Ionicons name="flash-outline" size={15} color={colors.primary} />
          <View style={{ flex: 1 }}><Text style={[styles.shortcutTitle, { color: colors.foreground }]}>Set up with Shortcuts</Text><Text style={[styles.previewNoteText, { color: colors.mutedForeground }]}>Open Chain’s pause when a protected app opens. Tap for the 4-step guide.</Text></View>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </Pressable>

        {/* Apps list */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          PROTECTED APPS
        </Text>

        {protectedApps.length > 0 && <View style={[styles.appsList, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {protectedApps.map((app, i) => (
            <View key={app.id}>
              <View style={[styles.appRow, { backgroundColor: app.iconColor + '08' }]}>
                <View style={[styles.appIcon, { backgroundColor: app.iconColor + '22' }]}>
                  {app.iconText ? (
                    <Text style={[styles.appIconText, { color: app.iconColor }]}>{app.iconText}</Text>
                  ) : (
                    <Ionicons name={app.icon} size={20} color={app.iconColor} />
                  )}
                </View>
                <Pressable onPress={() => setConfiguringApp(app)} style={styles.appCopy}><Text style={[styles.appName, { color: colors.foreground }]}>{app.name}</Text><Text style={[styles.appRule, { color: colors.mutedForeground }]}>{rules[app.id]?.mode === 'daily_limit' ? `${rules[app.id]?.dailyLimitMinutes ?? 30} min daily limit` : 'Pause every opening'}</Text></Pressable>
                <View style={[styles.appSaveBadge, { backgroundColor: app.iconColor + '20' }]}><Text style={[styles.appSaveNumber, { color: app.iconColor }]}>{savesForApp(app.id)}</Text><Text style={[styles.appSaveLabel, { color: app.iconColor }]}>SAVED</Text></View>
                <Pressable onPress={() => removeProtection(app)} hitSlop={12}><Ionicons name="ellipsis-horizontal" size={20} color={colors.mutedForeground} /></Pressable>
              </View>
              {i < APPS.length - 1 && (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              )}
            </View>
          ))}
        </View>}

        <Pressable onPress={() => setShowAppPicker(true)} style={({ pressed }) => [styles.addAppCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.78 : 1 }]}>
          <View style={[styles.addAppIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name="add" size={21} color={colors.primary} /></View>
          <View style={{ flex: 1 }}><Text style={[styles.addAppTitle, { color: colors.foreground }]}>Add an app</Text><Text style={[styles.addAppBody, { color: colors.mutedForeground }]}>{protectedApps.length ? 'Choose another place to create friction.' : 'Choose where you want a pause before scrolling.'}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>

        {/* iOS note */}
        <View style={[styles.noteCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.mutedForeground} />
          <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
            For a stricter iOS limit, pair the Shortcut with{' '}
            <Text style={{ fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>
              Settings → Screen Time → App Limits
            </Text>
            . Shortcuts opens Chain’s pause; Screen Time provides the system limit.
          </Text>
        </View>
      </ScrollView></View>
      <View style={{ width: pageWidth, height: '100%' }}><GateWindowsContent embedded onWindowsChange={setWindowCount} /></View>
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
  gateSwitcher: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', padding: 4, borderWidth: 1, borderRadius: 20, gap: 3, position: 'relative', overflow: 'hidden' },
  gateSwitcherPill: { position: 'absolute', left: 4, top: 4, bottom: 4, borderRadius: 15, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  gateSegment: { borderRadius: 15, paddingHorizontal: 12, paddingVertical: 7, zIndex: 1 },
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
  savesHero: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 22, padding: 18 },
  savesIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  savesCopy: { flex: 1 },
  savesNumber: { fontSize: 34, lineHeight: 37, fontFamily: 'Inter_700Bold' },
  savesTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: -1 },
  savesBody: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 3 },
  windowsCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, padding: 14 },
  windowsIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  windowsEyebrow: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.1, marginBottom: 2 },
  windowsTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  windowsBody: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2, lineHeight: 16 },
  previewWide: { alignItems: 'center', justifyContent: 'center', borderRadius: 18, paddingVertical: 15 },
  previewWideText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  previewNote: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10 },
  previewNoteText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  shortcutTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
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
  infoIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  infoCopy: { flex: 1, gap: 4 },
  infoEyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.1 },
  infoText: {
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
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 8 },
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
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  appCopy: { flex: 1 },
  appRule: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  appSaveBadge: { minWidth: 42, alignItems: 'center', borderRadius: 12, paddingHorizontal: 7, paddingVertical: 6 },
  appSaveNumber: { fontSize: 16, lineHeight: 17, fontFamily: 'Inter_700Bold' },
  appSaveLabel: { fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 0.6, marginTop: 1 },
  addAppCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 18, padding: 15 },
  addAppIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  addAppTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  addAppBody: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
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

const ruleStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 22 },
  card: { borderRadius: 26, borderWidth: 1, padding: 22, alignItems: 'center' },
  appIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  eyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, marginBottom: 8 },
  title: { fontSize: 24, lineHeight: 29, fontFamily: 'Inter_700Bold', letterSpacing: -0.5, textAlign: 'center', marginBottom: 18 },
  mode: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderRadius: 17, padding: 13, marginBottom: 9 },
  modeIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modeCopy: { flex: 1 },
  modeTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  modeBody: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2, lineHeight: 16 },
  limitLabel: { alignSelf: 'flex-start', fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginTop: 8, marginBottom: 8 },
  limitRow: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  limitPill: { minWidth: 52, alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingVertical: 9, paddingHorizontal: 10 },
  limitText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  note: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 16, marginBottom: 16 },
  save: { width: '100%', borderRadius: 18, paddingVertical: 14, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_700Bold' },
  cancel: { paddingTop: 13, paddingBottom: 2 },
  cancelText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
});
