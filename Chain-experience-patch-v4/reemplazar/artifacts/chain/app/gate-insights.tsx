import React, { useCallback, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmbientScreen } from '@/components/AmbientSurface';
import { CONTROL, OPACITY, RADIUS, SPACE, TYPE } from '@/constants/designSystem';
import { readableAccentColor } from '@/constants/sectionTheme';
import { useColors } from '@/hooks/useColors';
import { getGateInsights, type GatePeriod, type GateSummary } from '@/lib/gateStats';
import { reportDiagnostic } from '@/lib/diagnostics';

const APP_NAMES: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', twitter: 'X / Twitter', youtube: 'YouTube', reddit: 'Reddit', snapchat: 'Snapchat', facebook: 'Facebook', linkedin: 'LinkedIn', 'sample-app': 'Sample app' };

export default function GateInsightsScreen() {
  const colors = useColors('gate');
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<GatePeriod>(7);
  const [summary, setSummary] = useState<GateSummary | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const accent = readableAccentColor(colors.primary, colors.cardSolid);

  useFocusEffect(useCallback(() => {
    let active = true;
    setSummary(null);
    setError(false);
    const refresh = () => {
      void getGateInsights(period).then((value) => {
        if (active) { setSummary(value); setError(false); }
      }).catch((cause) => {
        reportDiagnostic({ area: 'gate', operation: 'insights.detail.read', severity: 'error', error: cause });
        if (active) { setSummary(null); setError(true); }
      });
    };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { active = false; subscription.remove(); };
  }, [period, retry]));

  const card = { backgroundColor: colors.cardSolid, borderColor: colors.border };
  return (
    <AmbientScreen tone="gate" style={styles.root}>
      <View style={[styles.header, { paddingTop: (Platform.OS === 'web' ? 48 : insets.top) + SPACE.xs }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Gate" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/gate')} style={styles.back}>
          <Ionicons name="chevron-back" size={25} color={colors.foreground} />
        </Pressable>
        <Text accessibilityRole="header" style={[TYPE.sectionTitle, { color: colors.foreground }]}>Gate insights</Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, SPACE.lg) + SPACE.xl }]} showsVerticalScrollIndicator={false}>
        <Text style={[TYPE.screenTitle, { color: colors.foreground }]}>Notice your choices.</Text>
        <Text style={[TYPE.body, { color: colors.mutedForeground }]}>See what you chose after a pause, with a clear distinction between a choice and what happened next.</Text>

        <View style={[styles.periods, card]}>
          {([7, 28, 90] as const).map((days) => <Pressable key={days} accessibilityRole="button" accessibilityState={{ selected: period === days }} accessibilityLabel={`Last ${days} days`} onPress={() => setPeriod(days)} style={({ pressed }) => [styles.period, { backgroundColor: period === days ? colors.primary + '24' : 'transparent', opacity: pressed ? OPACITY.pressed : 1 }]}>
            <Text style={[TYPE.bodyStrong, { color: period === days ? accent : colors.mutedForeground }]}>{days} days</Text>
          </Pressable>)}
        </View>

        <View style={[styles.card, card]}>
          <View style={styles.row}>
            <Ionicons name="eye-off-outline" size={21} color={colors.mutedForeground} />
            <Text style={[TYPE.sectionTitle, { flex: 1, color: colors.foreground }]}>App outcomes</Text>
          </View>
          <Text style={[TYPE.bodyStrong, { color: colors.mutedForeground }]}>Not available in this build</Text>
          <Text style={[TYPE.body, { color: colors.mutedForeground }]}>Chain cannot confirm whether you stayed in or left another app. Preview choices do not count as distractions avoided or time saved.</Text>
        </View>

        {error ? <View style={[styles.card, card]}>
          <Text accessibilityRole="alert" style={[TYPE.sectionTitle, { color: colors.foreground }]}>History couldn’t load</Text>
          <Text style={[TYPE.body, { color: colors.mutedForeground }]}>Your existing records have not been replaced with an empty history.</Text>
          <Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)} style={[styles.retry, { backgroundColor: colors.primary }]}><Text style={[TYPE.bodyStrong, { color: colors.primaryForeground }]}>Try again</Text></Pressable>
        </View> : !summary ? <Text accessibilityLiveRegion="polite" style={[TYPE.body, { color: colors.mutedForeground }]}>Loading recorded choices…</Text> : <>
          <View style={[styles.card, card]}>
            <Text style={[TYPE.eyebrow, { color: accent }]}>PREVIEW EXAMPLES · LAST {period} DAYS</Text>
            {summary.attempts === 0 ? <>
              <Text style={[TYPE.sectionTitle, { color: colors.foreground }]}>No preview choices yet</Text>
              <Text style={[TYPE.body, { color: colors.mutedForeground }]}>Open an app tile in Gate and try the pause. Choosing either option will appear here; closing the preview stays undecided.</Text>
            </> : <>
              <Text style={[TYPE.display, { color: colors.foreground }]}>{summary.leaveRate === null ? '—' : `${Math.round(summary.leaveRate * 100)}%`}</Text>
              <Text style={[TYPE.sectionTitle, { color: colors.foreground }]}>Chose to leave</Text>
              <Text style={[TYPE.body, { color: colors.mutedForeground }]}>{summary.leave} of {summary.knownDecisions} recorded decisions. {summary.pending} undecided {summary.pending === 1 ? 'pause is' : 'pauses are'} excluded from this percentage.</Text>
              {summary.knownDecisions > 0 && <View accessibilityElementsHidden style={[styles.bar, { backgroundColor: colors.border }]}><View style={{ height: '100%', width: `${(summary.leaveRate ?? 0) * 100}%`, backgroundColor: colors.primary }} /></View>}
              <View style={styles.metrics}>
                <Metric label="Pauses shown" value={summary.attempts} />
                <Metric label="Chose to leave" value={summary.leave} />
                <Metric label="Chose to continue" value={summary.continued} />
                <Metric label="Undecided" value={summary.pending} />
              </View>
            </>}
          </View>

          {summary.byApp.length > 0 && <View style={[styles.card, card]}>
            <Text style={[TYPE.sectionTitle, { color: colors.foreground }]}>Your preview choices by app</Text>
            {summary.byApp.map((app) => <View key={app.appId} style={[styles.app, { borderColor: colors.border }]}>
              <Text style={[TYPE.bodyStrong, { color: colors.foreground }]}>{APP_NAMES[app.appId] ?? 'Selected app'}</Text>
              <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>{app.leave} leave · {app.continued} continue · {app.pending} undecided</Text>
            </View>)}
          </View>}

          {summary.unverified > 0 && <View style={[styles.card, card]}>
            <Text style={[TYPE.sectionTitle, { color: colors.foreground }]}>Earlier records kept separately</Text>
            <Text style={[TYPE.body, { color: colors.mutedForeground }]}>{summary.unverified} older {summary.unverified === 1 ? 'record has' : 'records have'} incomplete provenance. These records are excluded from attempts, choices and outcome rates.</Text>
          </View>}
        </>}

        <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>History is stored on this device. Periods cover the previous 7, 28 or 90 days from now. The active history keeps 90 days when a new event is saved. No cloud sync is connected.</Text>
      </ScrollView>
    </AmbientScreen>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  const colors = useColors('gate');
  return <View accessible accessibilityLabel={`${value} ${label.toLowerCase()}`} style={styles.metric}>
    <Text style={[TYPE.modalTitle, { color: colors.foreground }]}>{value}</Text>
    <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>{label}</Text>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.xs, paddingBottom: SPACE.xs },
  back: { width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: CONTROL.screenHorizontal, paddingTop: SPACE.sm, gap: SPACE.md },
  card: { padding: SPACE.lg, borderWidth: 1, borderRadius: RADIUS.card, gap: SPACE.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  periods: { flexDirection: 'row', padding: 4, borderWidth: 1, borderRadius: RADIUS.control },
  period: { flex: 1, minHeight: CONTROL.minimumTarget, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.compact },
  bar: { height: 7, borderRadius: 4, overflow: 'hidden', marginVertical: SPACE.xs },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  metric: { flexGrow: 1, flexBasis: '42%', gap: SPACE.xxs, paddingVertical: SPACE.xs },
  app: { gap: SPACE.xxs, paddingVertical: SPACE.sm, borderTopWidth: 1 },
  retry: { minHeight: CONTROL.minimumTarget, borderRadius: RADIUS.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.lg },
});
