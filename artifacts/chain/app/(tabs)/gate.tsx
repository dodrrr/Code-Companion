import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
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
import { useChains } from '@/context/ChainsContext';
import { getGateWindows } from '@/lib/gateWindows';
import { GateWindowsContent } from '@/app/gate-windows';
import { reportDiagnostic } from '@/lib/diagnostics';
import {
  DEFAULT_GATE_RULE,
  GATE_DAILY_USAGE_OPTIONS,
  gateReleaseLabel,
  gateRuleSummary,
  gateTriggerLabel,
  getGateTodayProgress,
  makeDefaultGateRule,
  type GateRule,
  type GateRules,
} from '@/domain/gateRules';
import { getGateRules, removeGateRule, saveGateRules, setGateRule } from '@/lib/gateRules';
import { getTodayStr } from '@/domain/chains';
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
const TUTORIAL_KEY = '@chain_gate_tutorial_seen';

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
      <View style={tStyles.backdrop}>
        <View
          accessibilityViewIsModal
          style={[tStyles.frame, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <ScrollView
            style={tStyles.scroll}
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={tStyles.cardContent}
          >
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[tStyles.iconWrap, { backgroundColor: colors.primary + '1A' }]}
            >
              <Ionicons name="pause-outline" size={25} color={accentText} />
            </View>
            <Text style={[tStyles.eyebrow, { color: accentText }]}>PAUSE GATE</Text>
            <Text accessibilityRole="header" style={[tStyles.title, { color: colors.foreground }]}>Create space for a choice.</Text>
            <Text style={[tStyles.body, { color: colors.mutedForeground }]}>Choose when Gate steps in. Preview mode won’t block or monitor apps.</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue"
              accessibilityHint="Closes the introduction and shows Gate."
              onPress={onDone}
              style={({ pressed }) => [tStyles.nextBtn, { backgroundColor: colors.primary, opacity: pressed ? OPACITY.pressed : 1 }]}
            >
              <Text style={[tStyles.nextText, { color: colors.primaryForeground }]}>Continue</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function GateRuleModal({
  app,
  initialRule,
  chainsReady,
  hasChains,
  saving,
  onSave,
  onClose,
  reducedMotion,
}: {
  app: AppEntry;
  initialRule: GateRule;
  chainsReady: boolean;
  hasChains: boolean;
  saving: boolean;
  onSave: (rule: GateRule) => void;
  onClose: () => void;
  reducedMotion: boolean;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const accentText = readableAccentColor(colors.primary, colors.cardSolid);
  const [rule, setRule] = useState<GateRule>(initialRule);

  const chooseTrigger = (kind: GateRule['trigger']['kind']) => {
    setRule((current) => ({
      ...current,
      trigger: kind === 'onOpen'
        ? { kind: 'onOpen' }
        : current.trigger.kind === 'dailyUsage'
          ? current.trigger
          : { kind: 'dailyUsage', minutes: 10 },
    }));
    playFeedback('selection');
  };

  return (
    <Modal transparent animationType={reducedMotion ? 'none' : 'slide'} statusBarTranslucent onRequestClose={() => { if (!saving) onClose(); }}>
      <View style={ruleStyles.sheetBackdrop} accessibilityViewIsModal>
        <Pressable accessibilityRole="button" accessibilityLabel="Close Gate settings" disabled={saving} style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[ruleStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: Math.max(SPACE.lg, insets.bottom + SPACE.sm) }]}>
          <View style={[ruleStyles.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={ruleStyles.sheetHeader}>
            <View style={[styles.appIcon, { backgroundColor: app.iconColor + '20' }]}>
              {app.iconText ? <Text style={[styles.appIconText, { color: app.iconColor }]}>{app.iconText}</Text> : <Ionicons name={app.icon} size={21} color={app.iconColor} />}
            </View>
            <View style={ruleStyles.sheetHeadingCopy}>
              <Text numberOfLines={1} style={[ruleStyles.sheetTitle, { color: colors.foreground }]}>{app.name} Gate</Text>
              <Text style={[ruleStyles.sheetSubtitle, { color: colors.mutedForeground }]}>Choose when the pause should step in.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close Gate settings" disabled={saving} onPress={onClose} style={ruleStyles.closeButton}>
              <Ionicons name="close" size={21} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView style={ruleStyles.editorScroll} contentContainerStyle={ruleStyles.editorContent} showsVerticalScrollIndicator={false}>
            <Text style={[ruleStyles.sectionLabel, { color: colors.mutedForeground }]}>WHEN TO PAUSE</Text>
            <View style={ruleStyles.choiceStack}>
              <RuleChoice
                title="On app open"
                description="Pause before every opening."
                icon="enter-outline"
                selected={rule.trigger.kind === 'onOpen'}
                onPress={() => chooseTrigger('onOpen')}
              />
              <RuleChoice
                title="After daily use"
                description="Pause after today’s accumulated app use."
                icon="time-outline"
                selected={rule.trigger.kind === 'dailyUsage'}
                onPress={() => chooseTrigger('dailyUsage')}
              />
            </View>

            {rule.trigger.kind === 'dailyUsage' && (
              <View style={ruleStyles.minutesBlock}>
                <Text style={[ruleStyles.supportingLabel, { color: colors.mutedForeground }]}>DAILY LIMIT</Text>
                <View style={ruleStyles.minuteGrid}>
                  {GATE_DAILY_USAGE_OPTIONS.map((minutes) => {
                    const selected = rule.trigger.kind === 'dailyUsage' && rule.trigger.minutes === minutes;
                    const label = minutes < 60 ? `${minutes}m` : minutes % 60 === 0 ? `${minutes / 60}h` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
                    return (
                      <Pressable
                        key={minutes}
                        accessibilityRole="button"
                        accessibilityLabel={`${minutes} minutes of use today`}
                        accessibilityState={{ selected }}
                        onPress={() => { setRule((current) => ({ ...current, trigger: { kind: 'dailyUsage', minutes } })); playFeedback('selection'); }}
                        style={({ pressed }) => [ruleStyles.minuteChip, { backgroundColor: selected ? colors.primary + '28' : colors.background, borderColor: selected ? colors.primary + '70' : colors.border, opacity: pressed ? OPACITY.pressed : 1 }]}
                      >
                        <Text style={[ruleStyles.minuteChipText, { color: selected ? accentText : colors.foreground }]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            <Text style={[ruleStyles.sectionLabel, { color: colors.mutedForeground }]}>ACTIVE UNTIL</Text>
            <View style={ruleStyles.choiceStack}>
              <RuleChoice
                title="Always"
                description="Keep this Gate ready every day."
                icon="infinite-outline"
                selected={rule.release === 'always'}
                onPress={() => { setRule((current) => ({ ...current, release: 'always' })); playFeedback('selection'); }}
              />
              <RuleChoice
                title="Today is kept"
                description={!chainsReady ? 'Loading today’s Chains…' : hasChains ? 'Rest after every Chain due today is done, minimum, or safely frozen.' : 'Create a Chain first to use this condition.'}
                icon="checkmark-circle-outline"
                selected={rule.release === 'whenTodayKept'}
                disabled={!chainsReady || !hasChains}
                onPress={() => { setRule((current) => ({ ...current, release: 'whenTodayKept' })); playFeedback('selection'); }}
              />
            </View>
          </ScrollView>

          <View style={ruleStyles.sheetActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save Gate settings"
              accessibilityState={{ busy: saving }}
              disabled={saving}
              onPress={() => onSave(rule)}
              style={({ pressed }) => [ruleStyles.saveButton, { backgroundColor: colors.primary, opacity: saving ? OPACITY.disabled : pressed ? OPACITY.pressed : 1 }]}
            >
              <Text style={[ruleStyles.saveButtonText, { color: colors.primaryForeground }]}>{saving ? 'Saving…' : 'Save Gate'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function RuleChoice({
  title,
  description,
  icon,
  selected,
  disabled = false,
  onPress,
}: {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const accentText = readableAccentColor(colors.primary, colors.cardSolid);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${title}. ${description}`}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [ruleStyles.choice, { backgroundColor: selected ? colors.primary + '18' : colors.background, borderColor: selected ? colors.primary + '62' : colors.border, opacity: disabled ? OPACITY.disabled : pressed ? OPACITY.pressed : 1 }]}
    >
      <View style={[ruleStyles.choiceIcon, { backgroundColor: selected ? colors.primary + '22' : colors.card }]}>
        <Ionicons name={icon} size={19} color={selected ? accentText : colors.mutedForeground} />
      </View>
      <View style={ruleStyles.choiceCopy}>
        <Text style={[ruleStyles.choiceTitle, { color: colors.foreground }]}>{title}</Text>
        <Text style={[ruleStyles.choiceDescription, { color: colors.mutedForeground }]}>{description}</Text>
      </View>
      <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={selected ? accentText : colors.mutedForeground} />
    </Pressable>
  );
}

function AppPickerModal({
  visible,
  apps,
  onPick,
  onClose,
  onDismiss,
  reducedMotion,
}: {
  visible: boolean;
  apps: AppEntry[];
  onPick: (app: AppEntry) => void;
  onClose: () => void;
  onDismiss: () => void;
  reducedMotion: boolean;
}) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType={reducedMotion ? 'none' : 'slide'} statusBarTranslucent onDismiss={onDismiss} onRequestClose={onClose}>
      <View style={ruleStyles.backdrop} accessibilityViewIsModal>
        <View style={[ruleStyles.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: 'stretch' }]}>
          <Text style={[ruleStyles.title, { color: colors.foreground, textAlign: 'left', marginBottom: 6 }]}>Add an app</Text>
          <Text style={[ruleStyles.note, { color: colors.mutedForeground, textAlign: 'left', marginTop: 0, marginBottom: 14 }]}>Choose a visual sample. Native app selection and blocking connect later.</Text>
          <ScrollView style={ruleStyles.pickerScroll} contentContainerStyle={ruleStyles.pickerContent} showsVerticalScrollIndicator={false}>
            {apps.map((app) => (
              <Pressable
                key={app.id}
                accessibilityRole="button"
                accessibilityLabel={`Add ${app.name} to Gate`}
                onPress={() => onPick(app)}
                style={[styles.pickerRow, { backgroundColor: colors.background, borderColor: colors.border }]}
              >
                <View style={[styles.appIcon, { backgroundColor: app.iconColor + '22' }]}>
                  {app.iconText ? <Text style={[styles.appIconText, { color: app.iconColor }]}>{app.iconText}</Text> : <Ionicons name={app.icon} size={20} color={app.iconColor} />}
                </View>
                <Text style={[styles.appName, { color: colors.foreground, flex: 1 }]}>{app.name}</Text>
                <Ionicons name="add-circle-outline" size={21} color={colors.primary} />
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
  const { chains, isReady: chainsReady } = useChains();
  const reducedMotion = useReducedMotion();
  const [enabled,         setEnabled]         = useState<Record<string, boolean>>({});
  const [rules,           setRules]           = useState<GateRules>({});
  const [showAppPicker,   setShowAppPicker]   = useState(false);
  const [pendingRuleApp,  setPendingRuleApp]  = useState<AppEntry | null>(null);
  const [editingRuleApp,  setEditingRuleApp]  = useState<AppEntry | null>(null);
  const [editingNewRule,  setEditingNewRule]  = useState(false);
  const [savingRule,      setSavingRule]      = useState(false);
  const [gateDate,        setGateDate]        = useState(getTodayStr());
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
  const enabledRef = useRef<Record<string, boolean>>({});
  const rulesRef = useRef<GateRules>({});
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
        const rulesPromise = getGateRules()
          .then((storedRules) => ({ storedRules, readSucceeded: true as const }))
          .catch((error) => {
            reportDiagnostic({ area: 'gate', operation: 'rules.read', severity: 'error', error });
            return { storedRules: {} as GateRules, readSucceeded: false as const };
          });
        const [previewRaw, legacyRaw, tutorialSeen, rulesResult] = await Promise.all([
          AsyncStorage.getItem(PREVIEW_APPS_KEY),
          AsyncStorage.getItem(LEGACY_GATE_APPS_KEY),
          AsyncStorage.getItem(TUTORIAL_KEY),
          rulesPromise,
        ]);
        if (cancelled) return;
        const { storedRules } = rulesResult;
        const decodedApps = decodePreviewApps(previewRaw ?? legacyRaw);
        const missingRuleAppIds = Object.keys(decodedApps).filter((appId) => !storedRules[appId]);
        const hydratedRules: GateRules = { ...storedRules };
        for (const appId of missingRuleAppIds) hydratedRules[appId] = makeDefaultGateRule();
        enabledRef.current = decodedApps;
        setEnabled(decodedApps);
        rulesRef.current = hydratedRules;
        setRules(hydratedRules);
        if (!tutorialSeen) setShowTutorial(true);

        if (rulesResult.readSucceeded && missingRuleAppIds.length > 0) {
          void saveGateRules(hydratedRules).catch((error) => {
            reportDiagnostic({ area: 'gate', operation: 'rules.migrateEnabledApps', severity: 'warning', error });
          });
        }

        // Migrate only after the new key has been written successfully. If
        // removal fails, retaining the legacy value is harmless and recoverable.
        if (previewRaw === null && legacyRaw !== null) {
          await queuePreviewStorage('previewApps.migrate', async () => {
            await AsyncStorage.setItem(PREVIEW_APPS_KEY, JSON.stringify(decodedApps));
            await AsyncStorage.removeItem(LEGACY_GATE_APPS_KEY);
          });
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
    setScreenFocused(true);
    refreshWindows();
    return () => setScreenFocused(false);
  }, [refreshWindows]));

  useEffect(() => {
    if (pagerWidthRef.current === pageWidth) return;
    pagerWidthRef.current = pageWidth;
    pagerRef.current?.scrollTo({ x: activePage * pageWidth, animated: false });
  }, [activePage, pageWidth]);

  useEffect(() => {
    let midnightTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshDate = () => setGateDate((current) => {
      const next = getTodayStr();
      return current === next ? current : next;
    });
    const scheduleMidnightRefresh = () => {
      if (midnightTimer) clearTimeout(midnightTimer);
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      midnightTimer = setTimeout(() => {
        refreshDate();
        scheduleMidnightRefresh();
      }, Math.max(1, nextMidnight.getTime() - now.getTime() + 250));
    };
    scheduleMidnightRefresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshDate();
        scheduleMidnightRefresh();
      }
    });
    return () => {
      if (midnightTimer) clearTimeout(midnightTimer);
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'ios' || showAppPicker || !pendingRuleApp) return;
    const timer = setTimeout(() => {
      const app = pendingRuleApp;
      setPendingRuleApp(null);
      openRuleEditor(app, true);
    }, reducedMotion ? 0 : 320);
    return () => clearTimeout(timer);
  }, [pendingRuleApp, reducedMotion, showAppPicker]);

  function dismissTutorial() {
    void AsyncStorage.setItem(TUTORIAL_KEY, '1').catch((error) => {
      reportDiagnostic({ area: 'gate', operation: 'tutorial.persist', severity: 'warning', error });
    });
    setShowTutorial(false);
  }

  function persistPreviewApps(next: Record<string, boolean>) {
    const snapshot = JSON.stringify(next);
    return queuePreviewStorage(
      'previewApps.persist',
      () => AsyncStorage.setItem(PREVIEW_APPS_KEY, snapshot),
    );
  }

  function openRuleEditor(app: AppEntry, isNew: boolean) {
    setShowAppPicker(false);
    setEditingNewRule(isNew);
    setEditingRuleApp(app);
    playFeedback('selection');
  }

  async function saveRuleForApp(rule: GateRule) {
    const app = editingRuleApp;
    if (!app || savingRule) return;
    setSavingRule(true);
    const previousRules = rulesRef.current;
    try {
      const nextRules = await setGateRule(app.id, rule);
      if (editingNewRule) {
        const nextEnabled = { ...enabledRef.current, [app.id]: true };
        try {
          await persistPreviewApps(nextEnabled);
          enabledRef.current = nextEnabled;
          setEnabled(nextEnabled);
        } catch (error) {
          try {
            await saveGateRules(previousRules);
          } catch (rollbackError) {
            reportDiagnostic({ area: 'gate', operation: 'rules.rollbackAdd', severity: 'error', error: rollbackError });
          }
          throw error;
        }
      }
      rulesRef.current = nextRules;
      setRules(nextRules);
      setEditingRuleApp(null);
      setEditingNewRule(false);
      playFeedback('selection');
    } catch (error) {
      reportDiagnostic({ area: 'gate', operation: 'rules.write', severity: 'error', error });
      Alert.alert('Gate couldn’t save', 'Your previous settings are still safe. Try again.');
    } finally {
      setSavingRule(false);
    }
  }

  function launchDemo(previewApp: AppEntry) {
    const rule = rulesRef.current[previewApp.id] ?? DEFAULT_GATE_RULE;
    if (rule.release === 'whenTodayKept' && !chainsReady) {
      Alert.alert('One moment', 'Chain is still loading today’s progress.');
      return;
    }
    const today = getGateTodayProgress(chains, gateDate);
    router.push({
      pathname: '/pause-gate-demo',
      params: {
        appName: previewApp.name,
        appIcon: previewApp.icon,
        appColor: previewApp.iconColor,
        triggerKind: rule.trigger.kind,
        ...(rule.trigger.kind === 'dailyUsage' ? { triggerMinutes: String(rule.trigger.minutes) } : {}),
        releaseMode: rule.release,
        todayKept: String(today.kept),
        todayTotal: String(today.total),
      },
    });
  }

  function handleAppPickerPick(app: AppEntry) {
    setPendingRuleApp(app);
    setShowAppPicker(false);
  }

  function finishAppPickerDismissal() {
    if (!pendingRuleApp) return;
    const app = pendingRuleApp;
    setPendingRuleApp(null);
    openRuleEditor(app, true);
  }

  const previewApps = APPS.filter((app) => enabled[app.id]);
  const availableApps = APPS.filter((app) => !enabled[app.id]);
  const todayProgress = chainsReady
    ? getGateTodayProgress(chains, gateDate)
    : { total: 0, kept: 0, pending: 0, isKept: false };
  const conditionalGateCount = previewApps.filter(
    (app) => (rules[app.id] ?? DEFAULT_GATE_RULE).release === 'whenTodayKept',
  ).length;
  const gateTextAccent = readableAccentColor(colors.primary, colors.cardSolid);
  const showPage = (page: 0 | 1) => {
    setActivePage(page);
    pagerRef.current?.scrollTo({ x: page * pageWidth, animated: !reducedMotion });
  };

  async function commitPreviewRemoval(app: AppEntry) {
    const previousRules = rulesRef.current;
    const nextEnabled = { ...enabledRef.current };
    delete nextEnabled[app.id];
    try {
      const nextRules = await removeGateRule(app.id);
      try {
        await persistPreviewApps(nextEnabled);
      } catch (error) {
        try {
          await saveGateRules(previousRules);
        } catch (rollbackError) {
          reportDiagnostic({ area: 'gate', operation: 'rules.rollbackRemove', severity: 'error', error: rollbackError });
        }
        throw error;
      }
      enabledRef.current = nextEnabled;
      setEnabled(nextEnabled);
      rulesRef.current = nextRules;
      setRules(nextRules);
      playFeedback('light');
    } catch (error) {
      reportDiagnostic({ area: 'gate', operation: 'apps.remove', severity: 'error', error });
      Alert.alert('App couldn’t be removed', 'Your previous settings are still safe. Try again.');
    }
  }

  function removeFromPreview(app: AppEntry) {
    Alert.alert('Remove app?', `${app.name} will no longer appear in Pause Gate.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => { void commitPreviewRemoval(app); },
      },
    ]);
  }

  function openAppActions(app: AppEntry) {
    Alert.alert(app.name, 'Manage this app in Pause Gate.', [
      {
        text: 'Edit Gate',
        onPress: () => openRuleEditor(app, false),
      },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeFromPreview(app),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <AmbientScreen tone="gate" style={styles.root}>
      {/* Tutorial modal */}
      {tutorialChecked && showTutorial && <TutorialModal onDone={dismissTutorial} reducedMotion={reducedMotion} />}
      <AppPickerModal visible={showAppPicker} apps={availableApps} onPick={handleAppPickerPick} onClose={() => setShowAppPicker(false)} onDismiss={finishAppPickerDismissal} reducedMotion={reducedMotion} />
      {editingRuleApp && (
        <GateRuleModal
          key={`${editingRuleApp.id}-${editingNewRule ? 'new' : 'edit'}`}
          app={editingRuleApp}
          initialRule={rules[editingRuleApp.id] ?? DEFAULT_GATE_RULE}
          chainsReady={chainsReady}
          hasChains={chains.length > 0}
          saving={savingRule}
          onSave={(rule) => { void saveRuleForApp(rule); }}
          onClose={() => { if (!savingRule) { setEditingRuleApp(null); setEditingNewRule(false); } }}
          reducedMotion={reducedMotion}
        />
      )}

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
        {conditionalGateCount > 0 && (
          <View
            accessible
            accessibilityLabel={chainsReady ? `${todayProgress.kept} of ${todayProgress.total} Chains kept today. ${conditionalGateCount} conditional ${conditionalGateCount === 1 ? 'Gate' : 'Gates'} ${todayProgress.isKept ? 'resting' : 'active'}.` : 'Loading today’s Chain progress.'}
            style={[styles.todayStatus, { backgroundColor: 'transparent', borderColor: colors.primary + '40' }]}
          >
            <GlassSurface pointerEvents="none" style={StyleSheet.absoluteFill} />
            <View style={[styles.todayStatusIcon, { backgroundColor: colors.primary + '1A' }]}>
              <Ionicons name={!chainsReady ? 'time-outline' : todayProgress.isKept ? 'checkmark' : 'link-outline'} size={17} color={gateTextAccent} />
            </View>
            <View style={styles.todayStatusCopy}>
              <Text style={[styles.todayStatusEyebrow, { color: gateTextAccent }]}>TODAY</Text>
              <Text numberOfLines={1} style={[styles.todayStatusTitle, { color: colors.foreground }]}>
                {!chainsReady ? 'Loading today…' : todayProgress.total === 0 ? 'No Chains due' : `${todayProgress.kept} of ${todayProgress.total} kept`}
              </Text>
            </View>
            <Text numberOfLines={2} style={[styles.todayStatusMeta, { color: colors.mutedForeground }]}>
              {chainsReady && todayProgress.isKept ? 'Conditional Gates rest' : `${conditionalGateCount} conditional ${conditionalGateCount === 1 ? 'Gate' : 'Gates'}`}
            </Text>
          </View>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="About Gate preview mode" onPress={() => setShowTutorial(true)} style={({ pressed }) => [styles.previewNote, { opacity: pressed ? OPACITY.secondaryPressed : 1 }]}>
          <Ionicons name="information-circle-outline" size={16} color={gateTextAccent} />
          <Text numberOfLines={useSingleColumn ? 2 : 1} style={[styles.previewNoteText, { color: colors.mutedForeground }]}>Preview mode · No apps are blocked or monitored.</Text>
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>YOUR APPS</Text>
          {previewApps.length > 0 && <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>{previewApps.length}</Text>}
        </View>

        <View style={styles.appsGrid}>
          {previewApps.map((app) => {
            const rule = rules[app.id] ?? DEFAULT_GATE_RULE;
            const resting = chainsReady && rule.release === 'whenTodayKept' && todayProgress.isKept;
            return (
              <View key={app.id} style={{ width: appTileWidth }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${app.name}. ${gateRuleSummary(rule)}${resting ? '. Resting because today is kept' : ''}`}
                  accessibilityHint="Opens the Pause Gate preview. App use is not monitored yet"
                  accessibilityState={{ busy: rule.release === 'whenTodayKept' && !chainsReady }}
                  onPress={() => launchDemo(app)}
                  style={({ pressed }) => [
                    styles.appTile,
                    useSingleColumn && styles.appTileWide,
                    {
                      backgroundColor: colors.cardSolid,
                      borderColor: colors.primary + '38',
                      opacity: pressed ? OPACITY.pressed : 1,
                      transform: [{ scale: pressed && !reducedMotion ? 0.98 : 1 }],
                    },
                  ]}
                >
                  <View pointerEvents="none" style={[styles.tileTint, { backgroundColor: colors.primary + '12' }]} />
                  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.appTileIcon, { backgroundColor: app.iconColor + '20' }]}>
                    {app.iconText ? (
                      <Text style={[styles.appIconText, { color: app.iconColor }]}>{app.iconText}</Text>
                    ) : (
                      <Ionicons name={app.icon} size={23} color={app.iconColor} />
                    )}
                  </View>
                  <View style={styles.appTileCopy}>
                    <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.appTileName, { color: colors.foreground }]}>{app.name}</Text>
                    <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.appTileRule, { color: resting ? gateTextAccent : colors.mutedForeground }]}>{resting ? 'Resting today' : gateTriggerLabel(rule)}</Text>
                    <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.appTileCondition, { color: colors.mutedForeground }]}>{resting ? 'Today is kept' : gateReleaseLabel(rule)}</Text>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`More options for ${app.name}`}
                  accessibilityHint="Edit when this Gate appears or remove the app"
                  hitSlop={4}
                  onPress={() => openAppActions(app)}
                  style={({ pressed }) => [styles.tileMenuButton, { backgroundColor: colors.primary + (pressed ? '28' : '16') }]}
                >
                  <Ionicons name="ellipsis-horizontal" size={20} color={colors.mutedForeground} />
                </Pressable>
              </View>
            );
          })}

          {availableApps.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add an app to Pause Gate"
              accessibilityState={{ disabled: !tutorialChecked }}
              disabled={!tutorialChecked}
              onPress={() => setShowAppPicker(true)}
              style={({ pressed }) => [
                styles.addAppTile,
                useSingleColumn && styles.appTileWide,
                {
                  width: appTileWidth,
                  backgroundColor: colors.cardSolid,
                  borderColor: colors.primary + '35',
                  opacity: !tutorialChecked ? OPACITY.disabled : pressed ? OPACITY.pressed : 1,
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
  frame: {
    width: '100%',
    maxWidth: 340,
    maxHeight: '82%',
    borderRadius: RADIUS.modal,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  scroll: { flexShrink: 1 },
  cardContent: {
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.xxl,
    alignItems: 'center',
    gap: SPACE.sm,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.button,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.xs,
  },
  eyebrow: TYPE.eyebrow,
  title: { ...TYPE.modalTitle, textAlign: 'center' },
  body: { ...TYPE.body, textAlign: 'center' },
  nextBtn: {
    width: '100%',
    minHeight: CONTROL.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.button,
    borderCurve: 'continuous',
    marginTop: SPACE.md,
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
  todayStatus: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.card, borderCurve: 'continuous', paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, overflow: 'hidden' },
  todayStatusIcon: { width: 38, height: 38, borderRadius: RADIUS.compact, alignItems: 'center', justifyContent: 'center' },
  todayStatusCopy: { flex: 1, minWidth: 0 },
  todayStatusEyebrow: TYPE.eyebrow,
  todayStatusTitle: { ...TYPE.bodyStrong, marginTop: SPACE.hairline },
  todayStatusMeta: { ...TYPE.caption, maxWidth: 116, textAlign: 'right' },
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
  appTileCondition: { ...TYPE.metadata, marginTop: 2 },
  tileMenuButton: { position: 'absolute', top: SPACE.xs, right: SPACE.xs, width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, borderRadius: RADIUS.capsule, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  addAppTile: { minHeight: 152, justifyContent: 'space-between', borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.card, borderCurve: 'continuous', padding: SPACE.md, overflow: 'hidden' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.control, borderCurve: 'continuous', padding: SPACE.sm, marginBottom: SPACE.xs },
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
  sheetBackdrop: { flex: 1, backgroundColor: SCRIM, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxHeight: '92%', borderTopLeftRadius: RADIUS.modal, borderTopRightRadius: RADIUS.modal, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, paddingTop: SPACE.xs, overflow: 'hidden' },
  sheetHandle: { alignSelf: 'center', width: 36, height: 5, borderRadius: RADIUS.capsule, marginBottom: SPACE.sm },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingHorizontal: SPACE.lg, paddingBottom: SPACE.md },
  sheetHeadingCopy: { flex: 1, minWidth: 0 },
  sheetTitle: TYPE.modalTitle,
  sheetSubtitle: { ...TYPE.caption, marginTop: SPACE.hairline },
  closeButton: { width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.capsule },
  editorScroll: { flexShrink: 1 },
  editorContent: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.md },
  sectionLabel: { ...TYPE.eyebrow, marginTop: SPACE.sm, marginBottom: SPACE.xs },
  choiceStack: { gap: SPACE.xs },
  choice: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderRadius: RADIUS.control, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xs },
  choiceIcon: { width: 38, height: 38, borderRadius: RADIUS.compact, alignItems: 'center', justifyContent: 'center' },
  choiceCopy: { flex: 1, minWidth: 0 },
  choiceTitle: TYPE.bodyStrong,
  choiceDescription: { ...TYPE.caption, marginTop: SPACE.hairline },
  minutesBlock: { marginTop: SPACE.sm },
  supportingLabel: { ...TYPE.metadata, marginBottom: SPACE.xs },
  minuteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs },
  minuteChip: { minWidth: 62, minHeight: CONTROL.minimumTarget, flexGrow: 1, flexBasis: '21%', alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.control, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACE.xs },
  minuteChipText: TYPE.bodyStrong,
  sheetActions: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.xs },
  saveButton: { minHeight: CONTROL.buttonHeight, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.button, borderCurve: 'continuous', paddingHorizontal: SPACE.md },
  saveButtonText: TYPE.bodyStrong,
});
