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
import { useReducedMotion } from 'react-native-reanimated';
import { AmbientScreen, GlassSurface } from '@/components/AmbientSurface';
import { useColors } from '@/hooks/useColors';
import { getStreak, useChains } from '@/context/ChainsContext';
import { getGateWindows } from '@/lib/gateWindows';
import { GateWindowsContent } from '@/app/gate-windows';
import { reportDiagnostic } from '@/lib/diagnostics';
import type { Chain } from '@/domain/chains';
import { readableAccentColor } from '@/constants/sectionTheme';
import { CONTROL, OPACITY, RADIUS, SCRIM, SPACE, TYPE } from '@/constants/designSystem';
import { playFeedback } from '@/lib/feedback';

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

const PREVIEW_APPS_KEY = '@chain_gate_preview_apps';
const LEGACY_GATE_APPS_KEY = '@chain_gate_apps';
const GATE_CHAIN_KEY = '@chain_gate_preview_chain';
const PENDING_PREVIEW_APP_KEY = '@chain_gate_pending_preview_app';
const PENDING_CHAIN_PICKER_KEY = '@chain_gate_pending_chain_picker';
const TUTORIAL_KEY = '@chain_gate_tutorial_seen';

type AppPickerIntent = 'add' | 'try';

function decodePreviewApps(raw: string | null): Record<string, boolean> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const allowedIds = new Set(APPS.map((app) => app.id));
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([id, enabled]) => allowedIds.has(id) && enabled === true,
      ),
    );
  } catch (error) {
    reportDiagnostic({ area: 'gate', operation: 'previewApps.decode', severity: 'warning', error });
    return {};
  }
}

// ─── Tutorial modal ──────────────────────────────────────────────────────────

function TutorialModal({ onDone, reducedMotion }: { onDone: () => void; reducedMotion: boolean }) {
  const colors = useColors();
  const accentText = readableAccentColor(colors.primary, colors.cardSolid);

  return (
    <Modal transparent animationType={reducedMotion ? 'none' : 'fade'} statusBarTranslucent onRequestClose={onDone}>
      <View style={tStyles.backdrop} accessibilityViewIsModal>
        <ScrollView
          style={[tStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          contentContainerStyle={tStyles.cardContent}
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <View style={[tStyles.iconWrap, { backgroundColor: colors.primary + '1A' }]}>
            <Ionicons name="pause-outline" size={32} color={accentText} />
          </View>
          <Text style={[tStyles.eyebrow, { color: accentText }]}>PAUSE GATE</Text>
          <Text style={[tStyles.title, { color: colors.foreground }]}>Create space for a choice.</Text>
          <Text style={[tStyles.body, { color: colors.mutedForeground }]}>Choose an app and the Chain worth protecting. Gate will bring that intention back before you decide. Native app controls connect later.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close Gate introduction"
            onPress={onDone}
            style={({ pressed }) => [tStyles.nextBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[tStyles.nextText, { color: colors.primaryForeground }]}>Continue</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function ChainPickerModal({
  chains,
  selectedId,
  onPick,
  onCreate,
  onClose,
  reducedMotion,
}: {
  chains: Chain[];
  selectedId: string | null;
  onPick: (chain: Chain) => void;
  onCreate: () => void;
  onClose: () => void;
  reducedMotion: boolean;
}) {
  const colors = useColors();
  return (
    <Modal transparent animationType={reducedMotion ? 'none' : 'fade'} statusBarTranslucent onRequestClose={onClose}>
      <View style={ruleStyles.backdrop} accessibilityViewIsModal>
        <View style={[ruleStyles.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: 'stretch' }]}>
          <Text style={[ruleStyles.title, { color: colors.foreground, textAlign: 'left', marginBottom: 6 }]}>What are you protecting?</Text>
          <Text style={[ruleStyles.note, { color: colors.mutedForeground, textAlign: 'left', marginTop: 0, marginBottom: 14 }]}>Pause Gate will bring this commitment back into view before you decide.</Text>
          {chains.length ? (
            <ScrollView style={ruleStyles.pickerScroll} contentContainerStyle={ruleStyles.pickerContent} showsVerticalScrollIndicator={false}>
              {chains.map((chain) => {
                const selected = chain.id === selectedId;
                const displayColor = readableAccentColor(chain.color, colors.background, 5);
                return (
                  <Pressable
                    key={chain.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Protect ${chain.name} with Pause Gate`}
                    accessibilityState={{ selected }}
                    onPress={() => onPick(chain)}
                    style={[styles.chainPickerRow, { backgroundColor: selected ? chain.color + '16' : colors.background, borderColor: selected ? chain.color : colors.border }]}
                  >
                    <View style={[styles.chainPickerDot, { backgroundColor: chain.color }]} />
                    <Text style={[styles.appName, { color: colors.foreground, flex: 1 }]}>{chain.name}</Text>
                    <Ionicons name={selected ? 'checkmark-circle' : 'chevron-forward'} size={20} color={selected ? displayColor : colors.mutedForeground} />
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <View style={[styles.chainPickerEmpty, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.chainPickerEmptyTitle, { color: colors.foreground }]}>Create one commitment first.</Text>
              <Text style={[styles.chainPickerEmptyBody, { color: colors.mutedForeground }]}>Gate works best when it can remind you what deserves your attention.</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Create a Chain" onPress={onCreate} style={[styles.chainPickerCreate, { backgroundColor: colors.primary }]}>
                <Text style={[styles.chainPickerCreateText, { color: colors.primaryForeground }]}>Create Chain</Text>
              </Pressable>
            </View>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel="Close Chain picker" onPress={onClose} style={ruleStyles.cancel}>
            <Text style={[ruleStyles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function AppPickerModal({
  apps,
  intent,
  onPick,
  onClose,
  reducedMotion,
}: {
  apps: AppEntry[];
  intent: AppPickerIntent;
  onPick: (app: AppEntry) => void;
  onClose: () => void;
  reducedMotion: boolean;
}) {
  const colors = useColors();
  const isTrying = intent === 'try';
  return (
    <Modal transparent animationType={reducedMotion ? 'none' : 'slide'} statusBarTranslucent onRequestClose={onClose}>
      <View style={ruleStyles.backdrop} accessibilityViewIsModal>
        <View style={[ruleStyles.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: 'stretch' }]}>
          <Text style={[ruleStyles.title, { color: colors.foreground, textAlign: 'left', marginBottom: 6 }]}>{isTrying ? 'Choose an app' : 'Add an app'}</Text>
          <Text style={[ruleStyles.note, { color: colors.mutedForeground, textAlign: 'left', marginTop: 0, marginBottom: 14 }]}>{isTrying ? 'Choose an app, then connect it to the Chain you want to protect.' : 'Choose a visual sample. Native app selection and blocking connect later.'}</Text>
          <ScrollView style={ruleStyles.pickerScroll} contentContainerStyle={ruleStyles.pickerContent} showsVerticalScrollIndicator={false}>
            {apps.map((app) => (
              <Pressable
                key={app.id}
                accessibilityRole="button"
                accessibilityLabel={isTrying ? `Try Pause Gate with ${app.name}` : `Add ${app.name} to Gate`}
                onPress={() => onPick(app)}
                style={[styles.pickerRow, { backgroundColor: colors.background, borderColor: colors.border }]}
              >
                <View style={[styles.appIcon, { backgroundColor: app.iconColor + '22' }]}>
                  {app.iconText ? <Text style={[styles.appIconText, { color: app.iconColor }]}>{app.iconText}</Text> : <Ionicons name={app.icon} size={20} color={app.iconColor} />}
                </View>
                <Text style={[styles.appName, { color: colors.foreground, flex: 1 }]}>{app.name}</Text>
                <Ionicons name={isTrying ? 'arrow-forward-circle-outline' : 'add-circle-outline'} size={21} color={colors.primary} />
              </Pressable>
            ))}
          </ScrollView>
          <Pressable accessibilityRole="button" accessibilityLabel="Close app picker" onPress={onClose} style={ruleStyles.cancel}>
            <Text style={[ruleStyles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function GateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: pageWidth, fontScale } = useWindowDimensions();
  const { chains } = useChains();
  const reducedMotion = useReducedMotion();
  const [enabled,         setEnabled]         = useState<Record<string, boolean>>({});
  const [showAppPicker,   setShowAppPicker]   = useState(false);
  const [appPickerIntent, setAppPickerIntent] = useState<AppPickerIntent>('add');
  const [showChainPicker, setShowChainPicker] = useState(false);
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
  const [pendingPreviewApp, setPendingPreviewApp] = useState<AppEntry | null>(null);
  const [resumeChainPicker, setResumeChainPicker] = useState(false);
  const [showTutorial,    setShowTutorial]     = useState(false);
  const [tutorialChecked, setTutorialChecked]  = useState(false);
  const [windowCount, setWindowCount] = useState(0);
  const [activePage, setActivePage] = useState(0);
  const [screenFocused, setScreenFocused] = useState(false);
  const [pauseSegmentWidth, setPauseSegmentWidth] = useState(0);
  const [windowsSegmentWidth, setWindowsSegmentWidth] = useState(0);
  const pagerRef = useRef<ScrollView>(null);
  const pageProgress = useRef(new Animated.Value(0)).current;
  const pagerWidthRef = useRef(pageWidth);
  const chainSelectionInFlight = useRef(false);
  const navigatingToChainCreationRef = useRef(false);
  const enabledRef = useRef<Record<string, boolean>>({});
  const pendingPreviewAppRef = useRef<AppEntry | null>(null);
  const previewStorageQueueRef = useRef<Promise<void>>(Promise.resolve());

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 0 : insets.bottom;
  const useSingleColumn = pageWidth < 370 || fontScale >= 1.3;
  const gridContentWidth = Math.max(0, pageWidth - CONTROL.screenHorizontal * 2);
  const appTileWidth = useSingleColumn
    ? gridContentWidth
    : (gridContentWidth - SPACE.sm) / 2;

  const queuePreviewStorage = useCallback((operation: string, write: () => Promise<void>) => {
    const queued = previewStorageQueueRef.current
      .catch(() => undefined)
      .then(write);
    previewStorageQueueRef.current = queued.catch((error) => {
      reportDiagnostic({ area: 'gate', operation, severity: 'error', error });
    });
    return queued;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function hydratePreview() {
      try {
        const [previewRaw, legacyRaw, previewChainId, pendingAppId, pendingChainPicker, tutorialSeen] = await Promise.all([
          AsyncStorage.getItem(PREVIEW_APPS_KEY),
          AsyncStorage.getItem(LEGACY_GATE_APPS_KEY),
          AsyncStorage.getItem(GATE_CHAIN_KEY),
          AsyncStorage.getItem(PENDING_PREVIEW_APP_KEY),
          AsyncStorage.getItem(PENDING_CHAIN_PICKER_KEY),
          AsyncStorage.getItem(TUTORIAL_KEY),
        ]);
        if (cancelled) return;
        const decodedApps = decodePreviewApps(previewRaw ?? legacyRaw);
        enabledRef.current = decodedApps;
        setEnabled(decodedApps);
        setSelectedChainId(previewChainId?.trim() || null);
        const pendingApp = APPS.find((app) => app.id === pendingAppId?.trim()) ?? null;
        pendingPreviewAppRef.current = pendingApp;
        setPendingPreviewApp(pendingApp);
        setResumeChainPicker(pendingChainPicker === '1');
        if (!tutorialSeen) setShowTutorial(true);

        // Migrate only after the new key has been written successfully. If
        // removal fails, retaining the legacy value is harmless and recoverable.
        if (previewRaw === null && legacyRaw !== null) {
          await queuePreviewStorage('previewApps.migrate', async () => {
            await AsyncStorage.setItem(PREVIEW_APPS_KEY, JSON.stringify(decodedApps));
            await AsyncStorage.removeItem(LEGACY_GATE_APPS_KEY);
          });
        }
        if (pendingAppId && !pendingApp) {
          await queuePreviewStorage(
            'pendingPreview.removeInvalid',
            () => AsyncStorage.removeItem(PENDING_PREVIEW_APP_KEY),
          );
        }
      } catch (error) {
        reportDiagnostic({ area: 'gate', operation: 'preview.hydrate', severity: 'error', error });
      } finally {
        if (!cancelled) setTutorialChecked(true);
      }
    }
    void hydratePreview();
    return () => { cancelled = true; };
  }, [queuePreviewStorage]);

  const refreshWindows = useCallback(() => { void getGateWindows().then((windows) => setWindowCount(windows.length)); }, []);
  useFocusEffect(useCallback(() => {
    navigatingToChainCreationRef.current = false;
    setScreenFocused(true);
    refreshWindows();
    return () => setScreenFocused(false);
  }, [refreshWindows]));

  // A Try flow can briefly leave Gate to create its first Chain. Keeping the
  // selected sample app lets the user resume at the Chain picker on return.
  useEffect(() => {
    if (navigatingToChainCreationRef.current || !screenFocused || !tutorialChecked || showTutorial || (!pendingPreviewApp && !resumeChainPicker)) return;
    setShowChainPicker(true);
  }, [pendingPreviewApp, resumeChainPicker, screenFocused, showTutorial, tutorialChecked]);

  useEffect(() => {
    if (pagerWidthRef.current === pageWidth) return;
    pagerWidthRef.current = pageWidth;
    pagerRef.current?.scrollTo({ x: activePage * pageWidth, animated: false });
  }, [activePage, pageWidth]);

  function dismissTutorial() {
    void AsyncStorage.setItem(TUTORIAL_KEY, '1').catch((error) => {
      reportDiagnostic({ area: 'gate', operation: 'tutorial.persist', severity: 'warning', error });
    });
    setShowTutorial(false);
  }

  function persistPreviewApps(next: Record<string, boolean>) {
    const snapshot = JSON.stringify(next);
    void queuePreviewStorage(
      'previewApps.persist',
      () => AsyncStorage.setItem(PREVIEW_APPS_KEY, snapshot),
    );
  }

  function updatePreviewApps(update: (current: Record<string, boolean>) => Record<string, boolean>) {
    const next = update(enabledRef.current);
    enabledRef.current = next;
    setEnabled(next);
    persistPreviewApps(next);
  }

  function addPreviewApp(app: AppEntry) {
    updatePreviewApps((current) => ({ ...current, [app.id]: true }));
    setShowAppPicker(false);
    playFeedback('selection');
  }

  function rememberPendingPreviewApp(app: AppEntry | null) {
    pendingPreviewAppRef.current = app;
    setPendingPreviewApp(app);
    return queuePreviewStorage(
      app ? 'pendingPreview.persist' : 'pendingPreview.clear',
      () => app
        ? AsyncStorage.setItem(PENDING_PREVIEW_APP_KEY, app.id)
        : AsyncStorage.removeItem(PENDING_PREVIEW_APP_KEY),
    );
  }

  function rememberChainPickerResume(shouldResume: boolean) {
    setResumeChainPicker(shouldResume);
    return queuePreviewStorage(
      shouldResume ? 'pendingChainPicker.persist' : 'pendingChainPicker.clear',
      () => shouldResume
        ? AsyncStorage.setItem(PENDING_CHAIN_PICKER_KEY, '1')
        : AsyncStorage.removeItem(PENDING_CHAIN_PICKER_KEY),
    );
  }

  function launchDemo(previewApp: AppEntry, chain: Chain) {
    router.push({
      pathname: '/pause-gate-demo',
      params: {
        appName:    previewApp.name,
        appIcon:    previewApp.icon,
        appColor:   previewApp.iconColor,
        chainName:  chain.name,
        streak:     String(getStreak(chain)),
        chainColor: chain.color,
        cadence:    chain.cadence,
        weeklyTarget: String(chain.weeklyTarget),
      },
    });
  }

  function continueDemoFlow(previewApp: AppEntry) {
    const selectedChain = chains.find((chain) => chain.id === selectedChainId);
    if (!selectedChain) {
      void rememberPendingPreviewApp(previewApp);
      setShowChainPicker(true);
      return;
    }
    launchDemo(previewApp, selectedChain);
  }

  function openDemo(app?: AppEntry) {
    const previewApp = app ?? APPS.find((entry) => enabled[entry.id]);
    if (!previewApp) {
      setAppPickerIntent('try');
      setShowAppPicker(true);
      return;
    }
    continueDemoFlow(previewApp);
  }

  function handleAppPickerPick(app: AppEntry) {
    const intent = appPickerIntent;
    addPreviewApp(app);
    if (intent === 'try') continueDemoFlow(app);
  }

  async function choosePreviewChain(chain: Chain) {
    if (chainSelectionInFlight.current) return;
    chainSelectionInFlight.current = true;
    try {
      await AsyncStorage.setItem(GATE_CHAIN_KEY, chain.id);
      setSelectedChainId(chain.id);
      setShowChainPicker(false);
      const previewApp = pendingPreviewAppRef.current;
      void rememberChainPickerResume(false);
      if (previewApp) {
        void rememberPendingPreviewApp(null);
        launchDemo(previewApp, chain);
      }
      playFeedback('selection');
    } catch (error) {
      reportDiagnostic({ area: 'gate', operation: 'previewChain.persist', severity: 'error', error });
      Alert.alert('Chain couldn’t save', 'Try choosing your commitment again.');
    } finally {
      chainSelectionInFlight.current = false;
    }
  }

  const previewApps = APPS.filter((app) => enabled[app.id]);
  const availableApps = APPS.filter((app) => !enabled[app.id]);
  const selectedChain = chains.find((chain) => chain.id === selectedChainId);
  const selectedChainAccent = selectedChain
    ? readableAccentColor(selectedChain.color, colors.cardSolid, 5)
    : readableAccentColor(colors.primary, colors.cardSolid);
  const gateTextAccent = readableAccentColor(colors.primary, colors.cardSolid);
  const showPage = (page: 0 | 1) => {
    setActivePage(page);
    pagerRef.current?.scrollTo({ x: page * pageWidth, animated: !reducedMotion });
  };

  function removeFromPreview(app: AppEntry) {
    Alert.alert('Remove app?', `${app.name} will no longer appear in Pause Gate.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          updatePreviewApps((current) => {
            const next = { ...current };
            delete next[app.id];
            return next;
          });
          if (pendingPreviewAppRef.current?.id === app.id) void rememberPendingPreviewApp(null);
          playFeedback('light');
        },
      },
    ]);
  }

  function openAppActions(app: AppEntry) {
    Alert.alert(app.name, 'Manage this app in Pause Gate.', [
      {
        text: 'Change intention',
        onPress: () => {
          if (pendingPreviewAppRef.current) void rememberPendingPreviewApp(null);
          setShowChainPicker(true);
        },
      },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeFromPreview(app),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function createChainForPendingPreview() {
    navigatingToChainCreationRef.current = true;
    setShowChainPicker(false);
    const pendingApp = pendingPreviewAppRef.current;
    try {
      if (pendingApp) {
        await rememberPendingPreviewApp(pendingApp);
      }
      await rememberChainPickerResume(true);
    } catch {
      // The queued write is already diagnosed. State remains in memory, so
      // returning normally from New Chain can still resume this flow.
    }
    router.push('/chain/new');
  }

  function cancelChainPicker() {
    setShowChainPicker(false);
    if (pendingPreviewAppRef.current) void rememberPendingPreviewApp(null);
    void rememberChainPickerResume(false);
  }

  return (
    <AmbientScreen tone="gate" style={styles.root}>
      {/* Tutorial modal */}
      {tutorialChecked && showTutorial && <TutorialModal onDone={dismissTutorial} reducedMotion={reducedMotion} />}
      {showAppPicker && <AppPickerModal apps={availableApps} intent={appPickerIntent} onPick={handleAppPickerPick} onClose={() => setShowAppPicker(false)} reducedMotion={reducedMotion} />}
      {showChainPicker && <ChainPickerModal chains={chains} selectedId={selectedChain?.id ?? null} onPick={(chain) => { void choosePreviewChain(chain); }} onCreate={() => { void createChainForPendingPreview(); }} onClose={cancelChainPicker} reducedMotion={reducedMotion} />}

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={styles.switcherColumn}>
          <View style={[styles.gateSwitcher, { backgroundColor: 'transparent', borderColor: colors.border }]}>
            <GlassSurface pointerEvents="none" elevated style={StyleSheet.absoluteFill} />
            {pauseSegmentWidth > 0 && windowsSegmentWidth > 0 && <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[styles.gateSwitcherPill, { width: pageProgress.interpolate({ inputRange: [0, 1], outputRange: [pauseSegmentWidth, windowsSegmentWidth] }), backgroundColor: colors.primary + '28', borderColor: colors.primary + '45', transform: reducedMotion ? [{ translateX: activePage === 0 ? 0 : pauseSegmentWidth + 3 }] : [{ translateX: pageProgress.interpolate({ inputRange: [0, 1], outputRange: [0, pauseSegmentWidth + 3] }) }, { scaleX: pageProgress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.025, 1] }) }] }]} />}
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: activePage === 0 }} accessibilityLabel="Pause Gate" onLayout={(event) => setPauseSegmentWidth(event.nativeEvent.layout.width)} onPress={() => showPage(0)} style={({ pressed }) => [styles.gateSegment, { opacity: pressed ? OPACITY.pressed : 1 }]}><Text style={[styles.headerTitle, { color: activePage === 0 ? colors.foreground : colors.mutedForeground }]}>Pause Gate</Text></Pressable>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: activePage === 1 }} accessibilityLabel="Gate Windows" onLayout={(event) => setWindowsSegmentWidth(event.nativeEvent.layout.width)} onPress={() => showPage(1)} style={({ pressed }) => [styles.gateSegment, { opacity: pressed ? OPACITY.pressed : 1 }]}><Text style={[styles.headerTitle, { color: activePage === 1 ? colors.foreground : colors.mutedForeground }]}>Windows</Text></Pressable>
          </View>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {activePage === 0 ? 'Tap an app to pause before the impulse.' : windowCount ? `${windowCount} window${windowCount === 1 ? '' : 's'} saved` : 'Set aside focused time before you need it.'}
          </Text>
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
      <View accessibilityElementsHidden={activePage !== 0} importantForAccessibility={activePage === 0 ? 'auto' : 'no-hide-descendants'} style={{ width: pageWidth, height: '100%' }}><ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: botPad + CONTROL.tabContentInset }]} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" accessibilityLabel={selectedChain ? `Pause Gate is protecting ${selectedChain.name}. Change commitment` : 'Choose the Chain Pause Gate should protect'} onPress={() => { if (pendingPreviewAppRef.current) void rememberPendingPreviewApp(null); setShowChainPicker(true); }} style={({ pressed }) => [styles.intentionCard, { backgroundColor: 'transparent', borderColor: selectedChain ? selectedChain.color + '66' : colors.border, opacity: pressed ? OPACITY.pressed : 1 }]}>
          <GlassSurface pointerEvents="none" style={StyleSheet.absoluteFill} />
          <View style={[styles.intentionIcon, { backgroundColor: (selectedChain?.color ?? colors.primary) + '1A' }]}><Ionicons name="link-outline" size={18} color={selectedChainAccent} /></View>
          <View style={{ flex: 1 }}><Text style={[styles.intentionEyebrow, { color: selectedChainAccent }]}>PROTECTED INTENTION</Text><Text numberOfLines={1} ellipsizeMode="tail" style={[styles.intentionTitle, { color: colors.foreground }]}>{selectedChain?.name ?? 'Choose a Chain'}</Text></View>
          <Ionicons name="chevron-forward" size={17} color={colors.mutedForeground} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="About Gate preview mode" onPress={() => setShowTutorial(true)} style={({ pressed }) => [styles.previewNote, { opacity: pressed ? OPACITY.secondaryPressed : 1 }]}>
          <Ionicons name="information-circle-outline" size={16} color={gateTextAccent} />
          <Text numberOfLines={useSingleColumn ? 2 : 1} style={[styles.previewNoteText, { color: colors.mutedForeground }]}>Preview mode · No apps are blocked or monitored.</Text>
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>YOUR APPS</Text>
          {previewApps.length > 0 && <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>{previewApps.length}</Text>}
        </View>

        <View style={styles.appsGrid}>
          {previewApps.map((app) => (
            <View key={app.id} style={{ width: appTileWidth }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Pause before opening ${app.name}`}
                accessibilityHint={selectedChain ? `Reconnect with ${selectedChain.name}` : 'Choose an intention, then experience Pause Gate'}
                onPress={() => openDemo(app)}
                style={({ pressed }) => [
                  styles.appTile,
                  useSingleColumn && styles.appTileWide,
                  {
                    backgroundColor: colors.cardSolid,
                    borderColor: app.iconColor + '38',
                    opacity: pressed ? OPACITY.pressed : 1,
                    transform: [{ scale: pressed && !reducedMotion ? 0.98 : 1 }],
                  },
                ]}
              >
                <View pointerEvents="none" style={[styles.tileTint, { backgroundColor: app.iconColor + '0D' }]} />
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.appTileIcon, { backgroundColor: app.iconColor + '20' }]}>
                  {app.iconText ? (
                    <Text style={[styles.appIconText, { color: app.iconColor }]}>{app.iconText}</Text>
                  ) : (
                    <Ionicons name={app.icon} size={23} color={app.iconColor} />
                  )}
                </View>
                <View style={styles.appTileCopy}>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.appTileName, { color: colors.foreground }]}>{app.name}</Text>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.appTileRule, { color: colors.mutedForeground }]}>{selectedChain ? `Pause · ${selectedChain.name}` : 'Choose an intention'}</Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`More options for ${app.name}`}
                accessibilityHint="Change the protected intention or remove this app"
                hitSlop={4}
                onPress={() => openAppActions(app)}
                style={({ pressed }) => [styles.tileMenuButton, { backgroundColor: colors.foreground + (pressed ? '18' : '0B') }]}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ))}

          {availableApps.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add an app to Pause Gate"
              onPress={() => { setAppPickerIntent('add'); setShowAppPicker(true); }}
              style={({ pressed }) => [
                styles.addAppTile,
                useSingleColumn && styles.appTileWide,
                {
                  width: appTileWidth,
                  backgroundColor: colors.cardSolid,
                  borderColor: colors.primary + '35',
                  opacity: pressed ? OPACITY.pressed : 1,
                  transform: [{ scale: pressed && !reducedMotion ? 0.98 : 1 }],
                },
              ]}
            >
              <View pointerEvents="none" style={[styles.tileTint, { backgroundColor: colors.primary + '0C' }]} />
              <View style={[styles.addAppIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name="add" size={22} color={gateTextAccent} /></View>
              <View style={styles.appTileCopy}>
                <Text style={[styles.appTileName, { color: colors.foreground }]}>Add app</Text>
                <Text numberOfLines={1} style={[styles.appTileRule, { color: colors.mutedForeground }]}>Choose a visual sample</Text>
              </View>
            </Pressable>
          )}
        </View>

      </ScrollView></View>
      <View accessibilityElementsHidden={activePage !== 1} importantForAccessibility={activePage === 1 ? 'auto' : 'no-hide-descendants'} style={{ width: pageWidth, height: '100%' }}><GateWindowsContent embedded live={screenFocused && activePage === 1} onWindowsChange={setWindowCount} /></View>
      </ScrollView>
    </AmbientScreen>
  );
}

// ─── Tutorial styles ──────────────────────────────────────────────────────────

const tStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: SCRIM,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.xl,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '88%',
    borderRadius: RADIUS.modal,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardContent: {
    padding: SPACE.xl,
    alignItems: 'center',
    gap: SPACE.sm,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.card,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  eyebrow: TYPE.eyebrow,
  title: { ...TYPE.modalTitle, textAlign: 'center' },
  body: { ...TYPE.body, fontSize: 15, lineHeight: 23, textAlign: 'center' },
  nextBtn: {
    width: '100%',
    minHeight: CONTROL.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.button,
    borderCurve: 'continuous',
    marginTop: SPACE.xxs,
  },
  nextText: TYPE.bodyStrong,
});

// ─── Screen styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    alignItems: 'flex-start',
    paddingHorizontal: CONTROL.screenHorizontal,
    paddingBottom: SPACE.lg,
  },
  headerTitle: { ...TYPE.sectionTitle, flexShrink: 1, textAlign: 'center' },
  switcherColumn: { alignSelf: 'stretch' },
  gateSwitcher: { flexDirection: 'row', alignItems: 'stretch', alignSelf: 'stretch', padding: SPACE.xxs, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.card, borderCurve: 'continuous', gap: 3, position: 'relative', overflow: 'hidden' },
  gateSwitcherPill: { position: 'absolute', left: SPACE.xxs, top: SPACE.xxs, bottom: SPACE.xxs, borderRadius: RADIUS.button, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth },
  gateSegment: { flex: 1, minHeight: CONTROL.minimumTarget, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.button, paddingHorizontal: SPACE.xxs, paddingVertical: 7, zIndex: 1 },
  headerSub: {
    ...TYPE.caption,
    marginTop: SPACE.hairline,
  },
  intentionCard: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.card, borderCurve: 'continuous', paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, overflow: 'hidden' },
  intentionIcon: { width: 40, height: 40, borderRadius: RADIUS.compact, alignItems: 'center', justifyContent: 'center' },
  intentionEyebrow: TYPE.eyebrow,
  intentionTitle: { ...TYPE.cardTitle, marginTop: SPACE.hairline },
  previewNote: { minHeight: CONTROL.minimumTarget, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, paddingHorizontal: SPACE.xs },
  previewNoteText: { ...TYPE.caption, flex: 1 },
  scroll: {
    paddingHorizontal: CONTROL.screenHorizontal,
    gap: SPACE.sm,
  },
  sectionHeader: { minHeight: CONTROL.minimumTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.xxs, marginTop: SPACE.xxs },
  sectionLabel: TYPE.eyebrow,
  sectionCount: TYPE.metadata,
  appsGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: SPACE.sm },
  appTile: { minHeight: 152, justifyContent: 'space-between', borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.card, borderCurve: 'continuous', padding: SPACE.md, overflow: 'hidden' },
  appTileWide: { minHeight: 112 },
  tileTint: { position: 'absolute', width: 118, height: 118, borderRadius: RADIUS.capsule, top: -46, right: -38 },
  appTileIcon: { width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, borderRadius: RADIUS.compact, alignItems: 'center', justifyContent: 'center' },
  appTileCopy: { justifyContent: 'flex-end', paddingRight: SPACE.xxs },
  appTileName: TYPE.cardTitle,
  appTileRule: { ...TYPE.caption, marginTop: SPACE.hairline },
  tileMenuButton: { position: 'absolute', top: SPACE.xs, right: SPACE.xs, width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, borderRadius: RADIUS.capsule, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  addAppTile: { minHeight: 152, justifyContent: 'space-between', borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.card, borderCurve: 'continuous', padding: SPACE.md, overflow: 'hidden' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.control, borderCurve: 'continuous', padding: SPACE.sm, marginBottom: SPACE.xs },
  chainPickerRow: { minHeight: CONTROL.buttonHeight, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.control, borderCurve: 'continuous', paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xs, marginBottom: SPACE.xs },
  chainPickerDot: { width: 12, height: 12, borderRadius: RADIUS.capsule },
  chainPickerEmpty: { alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.button, borderCurve: 'continuous', padding: SPACE.lg },
  chainPickerEmptyTitle: { ...TYPE.cardTitle, textAlign: 'center' },
  chainPickerEmptyBody: { ...TYPE.caption, textAlign: 'center', marginTop: SPACE.xxs },
  chainPickerCreate: { minHeight: CONTROL.minimumTarget, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.control, borderCurve: 'continuous', paddingHorizontal: SPACE.lg, marginTop: SPACE.sm },
  chainPickerCreateText: TYPE.bodyStrong,
  appIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.compact,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIconText: TYPE.metadata,
  appName: TYPE.cardTitle,
  addAppIcon: { width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, borderRadius: RADIUS.compact, alignItems: 'center', justifyContent: 'center' },
});

const ruleStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: SCRIM, justifyContent: 'center', padding: SPACE.xl },
  card: { width: '100%', maxWidth: 460, maxHeight: '90%', alignSelf: 'center', borderRadius: RADIUS.modal, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, padding: SPACE.xl, alignItems: 'center' },
  title: { ...TYPE.modalTitle, textAlign: 'center', marginBottom: SPACE.lg },
  note: { ...TYPE.caption, textAlign: 'center', marginTop: SPACE.md, marginBottom: SPACE.md },
  pickerScroll: { flexShrink: 1 },
  pickerContent: { paddingBottom: 2 },
  cancel: { minHeight: CONTROL.minimumTarget, paddingTop: SPACE.sm, alignItems: 'center', justifyContent: 'center' },
  cancelText: { ...TYPE.body, fontFamily: 'Inter_500Medium' },
});
