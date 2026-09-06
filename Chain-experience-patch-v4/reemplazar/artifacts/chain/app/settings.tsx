import React, { useEffect, useState, type ComponentProps } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmbientScreen } from '@/components/AmbientSurface';
import AnimatedPressable from '@/components/AnimatedPressable';
import { AppButton, IconButton, SectionLabel, Surface } from '@/components/ui/AppUI';
import { CONTROL, RADIUS, SPACE, TYPE } from '@/constants/designSystem';
import { readableAccentColor } from '@/constants/sectionTheme';
import { useColors } from '@/hooks/useColors';
import { getNativeReadiness, type NativeReadiness } from '@/lib/nativeReadiness';
import {
  getSubscriptionSnapshot,
  openSubscriptionManagement,
  type SubscriptionStatus,
} from '@/lib/subscriptionBridge';
import { subscriptionLabel } from '@/domain/subscriptions';
import { reportDiagnostic } from '@/lib/diagnostics';

type IconName = ComponentProps<typeof Ionicons>['name'];

export default function SettingsScreen() {
  // Settings keeps a neutral canvas while primary product actions retain the
  // master Chain orange.
  const colors = useColors('today');
  const insets = useSafeAreaInsets();
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>('unknown');
  const [readiness, setReadiness] = useState<NativeReadiness>();
  const accentText = readableAccentColor(colors.primary, colors.cardSolid);
  const notificationSettingsCopy = Platform.OS === 'ios'
    ? 'Control Chain reminders in iPhone Settings.'
    : Platform.OS === 'android'
      ? 'Control Chain reminders in your device settings.'
      : 'Notification controls become available in the installed app.';

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getSubscriptionSnapshot(), getNativeReadiness()])
      .then(([subscription, native]) => {
        if (cancelled) return;
        setSubscriptionStatus(subscription.status);
        setReadiness(native);
      })
      .catch((error) => {
        reportDiagnostic({ area: 'native', operation: 'settings.readiness', severity: 'warning', error });
      });
    return () => { cancelled = true; };
  }, []);

  const paid = subscriptionStatus === 'active' || subscriptionStatus === 'trial';

  async function manageSubscription() {
    if (await openSubscriptionManagement()) return;
    Alert.alert(
      'Available with the App Store build',
      'Apple subscription management is not connected in this preview. Nothing can be charged here.',
    );
  }

  async function openNotificationSettings() {
    if (Platform.OS === 'web') {
      Alert.alert('Installed app setting', 'Notification controls become available from the installed app.');
      return;
    }
    try {
      await Linking.openSettings();
    } catch (error) {
      reportDiagnostic({ area: 'native', operation: 'settings.openNotifications', severity: 'warning', error });
      Alert.alert('Settings couldn’t open', 'Open iPhone Settings and choose Chain.');
    }
  }

  function openGate() {
    // Settings is presented above the main tab navigator. Return to that
    // existing navigator before selecting Gate so a second tabs stack is not
    // left underneath the user.
    router.dismissAll();
    requestAnimationFrame(() => router.replace('/(tabs)/gate'));
  }

  return <AmbientScreen tone="neutral" style={styles.root}>
    <View style={[styles.header, { paddingTop: insets.top + SPACE.xs }]}>
      <View style={styles.headerCopy}>
        <Text style={[TYPE.eyebrow, { color: accentText }]}>CHAIN</Text>
        <Text style={[TYPE.screenTitle, { color: colors.foreground }]}>Settings</Text>
      </View>
      <IconButton icon="chevron-back" label="Back from settings" onPress={() => router.back()} />
    </View>

    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, SPACE.md) + SPACE.xl }]}
      showsVerticalScrollIndicator={false}
    >
      <SectionLabel>CHAIN PLUS</SectionLabel>
      <Surface accentColor={colors.primary} style={styles.plusCard}>
        <View style={[styles.heroIcon, { backgroundColor: colors.primary + '1C' }]}>
          <Ionicons name="sparkles-outline" size={21} color={accentText} />
        </View>
        <View style={styles.rowCopy}>
          <Text style={[TYPE.cardTitle, { color: colors.foreground }]}>Chain Plus</Text>
          <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>{subscriptionLabel(subscriptionStatus)} · Pricing remains a preview until StoreKit is connected.</Text>
        </View>
      </Surface>
      {paid
        ? <AppButton label="Manage with Apple" icon="open-outline" variant="secondary" onPress={() => { void manageSubscription(); }} style={styles.sectionAction} />
        : <AppButton label="See the Plus preview" icon="arrow-forward" onPress={() => router.push('/paywall')} style={styles.sectionAction} />}

      <SectionLabel>ATTENTION</SectionLabel>
      <Surface style={styles.group}>
        <SettingsRow
          icon="shield-checkmark-outline"
          title="Gate"
          body={readiness?.screenTime ? 'Apple Screen Time controls are connected.' : 'Preview mode · Native app protection is not connected yet.'}
          onPress={openGate}
          colors={colors}
        />
        <Divider color={colors.border} />
        <SettingsRow
          icon="notifications-outline"
          title="Notifications"
          body={notificationSettingsCopy}
          onPress={() => { void openNotificationSettings(); }}
          colors={colors}
        />
      </Surface>

      <SectionLabel>PRIVACY & DATA</SectionLabel>
      <Surface style={styles.group}>
        <SettingsRow
          icon="phone-portrait-outline"
          title="Stored on this device"
          body="Your chains, plans and preferences stay local. No Chain account is required."
          colors={colors}
        />
        <Divider color={colors.border} />
        <SettingsRow
          icon="eye-off-outline"
          title="Designed for private attention"
          body="Chain does not scan installed apps in this preview. Apple’s private picker will handle selection later."
          colors={colors}
        />
      </Surface>

      {__DEV__ && <>
        <SectionLabel>DEVELOPER READINESS</SectionLabel>
        <Surface style={styles.readinessGroup}>
          <ReadinessRow label="Screen Time bridge" ready={Boolean(readiness?.screenTime)} colors={colors} />
          <Divider color={colors.border} />
          <ReadinessRow label="StoreKit bridge" ready={Boolean(readiness?.subscriptions)} colors={colors} />
          <Divider color={colors.border} />
          <ReadinessRow label="Production runtime" ready={Boolean(readiness?.productionBuild)} colors={colors} />
        </Surface>
      </>}

      <Text style={[TYPE.caption, styles.foot, { color: colors.mutedForeground }]}>
        Chain should protect your attention, including the attention you give Chain itself.
      </Text>
    </ScrollView>
  </AmbientScreen>;
}

function SettingsRow({
  icon,
  title,
  body,
  onPress,
  colors,
}: {
  icon: IconName;
  title: string;
  body: string;
  onPress?: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const accentText = readableAccentColor(colors.primary, colors.cardSolid);
  const content = <>
    <View style={[styles.rowIcon, { backgroundColor: colors.primary + '18' }]}>
      <Ionicons name={icon} size={19} color={accentText} />
    </View>
    <View style={styles.rowCopy}>
      <Text style={[TYPE.cardTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>{body}</Text>
    </View>
    {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} /> : null}
  </>;
  if (!onPress) return <View style={styles.settingsRow}>{content}</View>;
  return <AnimatedPressable
    accessibilityRole="button"
    accessibilityLabel={title}
    accessibilityHint={body}
    onPress={onPress}
    style={styles.settingsRow}
  >{content}</AnimatedPressable>;
}

function Divider({ color }: { color: string }) {
  return <View style={[styles.divider, { backgroundColor: color }]} />;
}

function ReadinessRow({ label, ready, colors }: { label: string; ready: boolean; colors: ReturnType<typeof useColors> }) {
  const accentText = readableAccentColor(colors.primary, colors.cardSolid);
  return <View style={styles.readinessRow}>
    <Ionicons name={ready ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={ready ? accentText : colors.mutedForeground} />
    <Text style={[TYPE.caption, styles.readinessText, { color: colors.foreground }]}>{label}</Text>
    <Text style={[TYPE.metadata, { color: ready ? accentText : colors.mutedForeground }]}>{ready ? 'Ready' : 'Later'}</Text>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    minHeight: 88,
    paddingHorizontal: CONTROL.screenHorizontal,
    paddingBottom: SPACE.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
  },
  headerCopy: { flex: 1, minWidth: 0, gap: SPACE.hairline },
  content: { paddingHorizontal: CONTROL.screenHorizontal },
  plusCard: { padding: SPACE.md, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  heroIcon: { width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
  rowIcon: { width: 40, height: 40, borderRadius: RADIUS.compact, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 0, gap: SPACE.hairline },
  sectionAction: { marginTop: SPACE.xs, marginBottom: SPACE.xl },
  group: { marginBottom: SPACE.xl },
  settingsRow: { minHeight: 70, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 68 },
  readinessGroup: { marginBottom: SPACE.lg },
  readinessRow: { minHeight: CONTROL.minimumTarget, paddingHorizontal: SPACE.md, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  readinessText: { flex: 1 },
  foot: { textAlign: 'center', paddingHorizontal: SPACE.xl, marginTop: SPACE.xs },
});
