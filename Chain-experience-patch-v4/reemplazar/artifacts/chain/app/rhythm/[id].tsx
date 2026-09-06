import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AmbientScreen } from '@/components/AmbientSurface';
import { AppButton, Surface } from '@/components/ui/AppUI';
import { ChainSymbol, type ChainSymbolName } from '@/components/ui/ChainSymbol';
import { CONTROL, RADIUS, SPACE, TYPE } from '@/constants/designSystem';
import { formatStreakCount, getProgressionStage, PROGRESSION_STAGES } from '@/constants/progression';
import { readableAccentColor, readableTextColor } from '@/constants/sectionTheme';
import { type Chain, getStreak, toLocalDateString, useChains } from '@/context/ChainsContext';
import { type FocusLogEntry } from '@/domain/plan';
import { buildChainRhythm } from '@/domain/rhythm';
import { useColors } from '@/hooks/useColors';
import { useLocalClock } from '@/hooks/useLocalClock';
import { readRhythmFocusLog } from '@/lib/rhythmStorage';

type PeriodDays = 7 | 28 | 90;
type Rhythm = ReturnType<typeof buildChainRhythm>;
const PERIODS: readonly PeriodDays[] = [7, 28, 90];
const MILESTONES = PROGRESSION_STAGES.filter((stage) => [1, 7, 30, 100, 365].includes(stage.at));
const FREEZE_COLOR = '#5B8CFF';

function dateLabel(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function minutesLabel(minutes: number) {
  return minutes > 0 && minutes < 1 ? '<1' : minutes.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function Metric({ value, label, symbol, color }: {
  value: number;
  label: string;
  symbol: ChainSymbolName;
  color: string;
}) {
  const colors = useColors();
  return <View accessible accessibilityLabel={`${value} ${label}`} style={styles.metric}>
    <ChainSymbol name={symbol} size={18} color={color} />
    <Text style={[TYPE.modalTitle, { color: colors.foreground }]}>{value}</Text>
    <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>{label}</Text>
  </View>;
}

function CountBar({ label, value, maximum, color }: {
  label: string;
  value: number;
  maximum: number;
  color: string;
}) {
  const colors = useColors();
  const percentage = maximum > 0 ? Math.min(100, Math.max(0, (value / maximum) * 100)) : 0;
  return <View accessible accessibilityLabel={`${label}, ${value}`} style={styles.barRow}>
    <View style={styles.barHeading}>
      <Text style={[TYPE.body, styles.flexText, { color: colors.foreground }]}>{label}</Text>
      <Text style={[TYPE.bodyStrong, { color: colors.foreground }]}>{value}</Text>
    </View>
    <View style={[styles.barTrack, { backgroundColor: colors.secondary }]}>
      <View style={[styles.barFill, { backgroundColor: color, width: `${percentage}%` }]} />
    </View>
  </View>;
}

function StreakMilestones({ chain, referenceDate }: { chain: Chain; referenceDate: string }) {
  const colors = useColors();
  const accentText = readableAccentColor(chain.color, colors.cardSolid);
  const streak = getStreak(chain, referenceDate);
  const stage = getProgressionStage(streak);
  const next = MILESTONES.find((milestone) => milestone.at > streak);
  const previous = [...MILESTONES].reverse().find((milestone) => milestone.at <= streak)?.at ?? 0;
  const progress = next ? Math.min(1, Math.max(0, (streak - previous) / (next.at - previous))) : 1;
  const nextLabel = next
    ? `${formatStreakCount(next.at - streak, chain.cadence)} to ${next.label}`
    : 'All current milestones reached.';

  return <View style={[styles.dividerBlock, { borderColor: colors.border }]}>
    <Text accessibilityRole="header" style={[TYPE.bodyStrong, { color: colors.foreground }]}>Current streak · {formatStreakCount(streak, chain.cadence)}</Text>
    <Text style={[TYPE.caption, { color: accentText }]}>{stage.label}</Text>
    <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>Milestones follow your current streak across your full history, independent of the selected period.</Text>
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Next streak milestone"
      accessibilityValue={next ? { min: previous, max: next.at, now: streak, text: nextLabel } : { text: nextLabel }}
      style={styles.milestoneProgress}
    >
      <View style={[styles.barTrack, { backgroundColor: chain.color + '20' }]}>
        <View style={[styles.barFill, { width: `${progress * 100}%`, backgroundColor: chain.color }]} />
      </View>
      <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>{nextLabel}</Text>
    </View>
    <Text style={[TYPE.eyebrow, { color: colors.mutedForeground }]}>MILESTONES · {chain.cadence === 'weekly' ? 'WEEKS' : 'DAYS'}</Text>
    <View style={styles.milestoneRow}>
      {MILESTONES.map((milestone) => {
        const reached = streak >= milestone.at;
        return <View
          key={milestone.key}
          accessible
          accessibilityLabel={`${formatStreakCount(milestone.at, chain.cadence)}, ${milestone.label}, ${reached ? 'reached in the current streak' : 'not reached in the current streak'}`}
          style={styles.milestoneItem}
        >
          <View style={[styles.milestoneDot, { backgroundColor: reached ? chain.color : colors.background, borderColor: reached ? chain.color : colors.border }]}>
            {reached
              ? <ChainSymbol name="check" size={14} color={readableTextColor(chain.color)} />
              : <Ionicons name="lock-closed-outline" size={13} color={colors.mutedForeground} />}
          </View>
          <Text style={[TYPE.metadata, { color: reached ? accentText : colors.mutedForeground }]}>{milestone.at}</Text>
        </View>;
      })}
    </View>
  </View>;
}

function Consistency({ rhythm, accent, chain, referenceDate }: { rhythm: Rhythm; accent: string; chain: Chain; referenceDate: string }) {
  const colors = useColors();
  const accentText = readableAccentColor(accent, colors.cardSolid);
  const { adherence, comparison, weekly, counts } = rhythm;
  const unit = adherence.unit === 'weeks' ? 'complete weeks' : 'scheduled days';
  const comparisonText = comparison === null
    ? 'A comparison will appear when both periods have enough history.'
    : comparison.changePoints === 0
      ? 'The same rate as the previous period.'
      : `${Math.abs(comparison.changePoints).toLocaleString('en-US', { maximumFractionDigits: 1 })} percentage points ${comparison.changePoints > 0 ? 'higher' : 'lower'} than the previous period.`;

  return <Surface style={styles.section}>
    <Text accessibilityRole="header" style={[TYPE.sectionTitle, { color: colors.foreground }]}>Consistency</Text>
    <View style={styles.rateRow}>
      <Text style={[TYPE.display, { color: accentText }]}>
        {adherence.rate === null ? '—' : `${Math.round(adherence.rate)}%`}
      </Text>
      <Text style={[TYPE.body, styles.flexText, { color: colors.mutedForeground }]}>
        {rhythm.scheduleChanged
          ? 'Your schedule changed in this period'
          : adherence.denominator === 0
          ? adherence.unit === 'weeks' ? 'No full closed weeks yet' : 'No closed scheduled days yet'
          : `${adherence.numerator} of ${adherence.denominator} ${unit} kept`}
      </Text>
    </View>
    <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>
      {adherence.unit === 'weeks'
        ? 'A week counts when Done and Minimum days reach its target. The current week is still in progress.'
        : 'Done and Minimum count as action. Rest days and today are excluded from this rate. Freeze protects a streak without counting as action.'}
    </Text>
    <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>
      {rhythm.scheduleChanged
        ? 'Your recorded actions remain visible. A single rate would mix different schedules, so it is not shown for this period.'
        : comparisonText}
    </Text>
    {rhythm.scheduleAssumption && <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>Earlier entries have no saved schedule history. Those dates use your current schedule, so the rate is an estimate.</Text>}
    {weekly ? <View style={[styles.inset, { backgroundColor: accent + '12' }]}>
      <Text style={[TYPE.bodyStrong, { color: colors.foreground }]}>This week · {weekly.currentProgress}/{weekly.currentTarget}</Text>
      <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>Days recorded toward this week’s target.</Text>
    </View> : <View style={styles.smallStats}>
      <Text style={[TYPE.caption, styles.flexText, { color: colors.mutedForeground }]}>{countLabel(counts.rest, 'rest day')}</Text>
      <Text style={[TYPE.caption, styles.flexText, { color: colors.mutedForeground }]}>{countLabel(counts.missed, 'missed day')}</Text>
    </View>}
    <StreakMilestones chain={chain} referenceDate={referenceDate} />
  </Surface>;
}

function CheckInTimes({ rhythm, accent }: { rhythm: Rhythm; accent: string }) {
  const colors = useColors();
  const { checkIns } = rhythm;
  const largest = Math.max(1, ...checkIns.buckets.map((bucket) => bucket.count));
  return <Surface style={styles.section}>
    <Text accessibilityRole="header" style={[TYPE.sectionTitle, { color: colors.foreground }]}>Check-in times</Text>
    <Text style={[TYPE.body, { color: colors.mutedForeground }]}>When you recorded an action in Chain. This is not a measurement of when you did the habit.</Text>
    {checkIns.sampleCount === 0 ? <View style={styles.emptyBlock}>
      <Ionicons name="time-outline" size={24} color={colors.mutedForeground} />
      <Text style={[TYPE.bodyStrong, { color: colors.foreground }]}>Your pattern starts here</Text>
      <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>New same-day check-ins will build this view. Older entries stay in your history without an invented time.</Text>
    </View> : <>
      {checkIns.buckets.map((bucket) => <CountBar
        key={bucket.key}
        label={bucket.label}
        value={bucket.count}
        maximum={largest}
        color={accent}
      />)}
      <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>
        Based on {countLabel(checkIns.sampleCount, 'same-day check-in')} with a recorded local time.
      </Text>
      {checkIns.mostCommonLabel ? <Text style={[TYPE.bodyStrong, { color: colors.foreground }]}>
        Most common check-in window: {checkIns.mostCommonLabel.toLowerCase()}.
      </Text> : <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>No clear timing pattern yet.</Text>}
    </>}
    {checkIns.missingCount > 0 || checkIns.retrospectiveCount > 0 ? <View style={[styles.dividerBlock, { borderColor: colors.border }]}>
      {checkIns.missingCount > 0 && <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>{countLabel(checkIns.missingCount, 'entry', 'entries')} without a reliable local check-in time.</Text>}
      {checkIns.retrospectiveCount > 0 && <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>{countLabel(checkIns.retrospectiveCount, 'entry', 'entries')} logged for a previous day.</Text>}
      <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>These entries count toward your recorded actions, but are excluded from the time pattern.</Text>
    </View> : null}
  </Surface>;
}

export default function RhythmScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { chains, isReady } = useChains();
  const chain = chains.find((item) => item.id === id);
  const [periodDays, setPeriodDays] = useState<PeriodDays>(28);
  const now = useLocalClock();
  const referenceDate = toLocalDateString(now);
  const [focusLog, setFocusLog] = useState<FocusLogEntry[]>([]);
  const [focusState, setFocusState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    let request = 0;
    const refresh = async () => {
      const currentRequest = ++request;
      setFocusState('loading');
      try {
        const entries = await readRhythmFocusLog();
        if (active && currentRequest === request) {
          setFocusLog(entries);
          setFocusState('ready');
        }
      } catch {
        if (active && currentRequest === request) setFocusState('error');
      }
    };
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [retry]));

  const rhythm = useMemo(() => chain
    ? buildChainRhythm(chain, { periodDays, referenceDate, focusLog })
    : null, [chain, periodDays, referenceDate, focusLog]);
  const accent = chain?.color ?? colors.primary;
  const accentText = readableAccentColor(accent, colors.cardSolid);
  const back = () => {
    if (router.canGoBack()) router.back();
    else if (chain) router.replace({ pathname: '/chain/[id]', params: { id: chain.id } });
    else router.replace('/(tabs)');
  };

  return <AmbientScreen tone="today" color={accent}>
    <View style={[styles.navigation, { paddingTop: insets.top + SPACE.xxs }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to chain"
        onPress={back}
        style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Ionicons name="chevron-back" size={28} color={colors.foreground} />
        <Text style={[TYPE.bodyStrong, { color: colors.foreground }]}>Chain</Text>
      </Pressable>
    </View>
    {!isReady ? <View accessibilityLiveRegion="polite" style={styles.screenNotice}>
      <ActivityIndicator color={accentText} />
      <Text style={[TYPE.body, { color: colors.mutedForeground }]}>Loading your chain…</Text>
    </View> : !chain || !rhythm ? <View style={styles.screenNotice}>
      <Text accessibilityRole="header" style={[TYPE.sectionTitle, { color: colors.foreground }]}>This chain is unavailable</Text>
      <Text style={[TYPE.body, { color: colors.mutedForeground }]}>Return to Chains to choose another one.</Text>
      <AppButton label="Go to Chains" onPress={() => router.replace('/(tabs)')} />
    </View> : <ScrollView
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, SPACE.lg) + SPACE.xl }]}
    >
      <View style={styles.titleBlock}>
        <Text accessibilityRole="header" style={[TYPE.screenTitle, { color: colors.foreground }]}>Rhythm</Text>
        <Text style={[TYPE.body, { color: accentText }]}>{chain.name}</Text>
        <Text style={[TYPE.body, { color: colors.mutedForeground }]}>A clear view of what you have recorded.</Text>
      </View>

      <View accessibilityRole="tablist" style={[styles.periods, { backgroundColor: colors.cardSolid, borderColor: colors.border }]}>
        {PERIODS.map((period) => <Pressable
          key={period}
          accessibilityRole="tab"
          accessibilityLabel={`Last ${period} days`}
          accessibilityState={{ selected: period === periodDays }}
          onPress={() => setPeriodDays(period)}
          style={({ pressed }) => [styles.period, {
            backgroundColor: period === periodDays ? accent + '20' : 'transparent',
            opacity: pressed ? 0.7 : 1,
          }]}
        >
          <Text style={[TYPE.bodyStrong, { color: period === periodDays ? accentText : colors.mutedForeground }]}>{period} days</Text>
        </Pressable>)}
      </View>

      <Surface accentColor={accent} style={styles.section}>
        <Text accessibilityRole="header" style={[TYPE.sectionTitle, { color: colors.foreground }]}>Your recorded days</Text>
        <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>{dateLabel(rhythm.startDate)} – {dateLabel(rhythm.endDate)}</Text>
        <View style={styles.metrics}>
          <Metric value={rhythm.counts.done} label="Done" symbol="check" color={accentText} />
          <Metric value={rhythm.counts.minimum} label="Minimum" symbol="minimum" color={accentText} />
          <Metric value={rhythm.counts.frozen} label="Frozen" symbol="freeze" color={FREEZE_COLOR} />
        </View>
        <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>One state per day. A full version replaces a minimum; it never counts twice.</Text>
        {chain.cadence === 'weekly' && rhythm.counts.frozen > 0 && <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>Saved Freeze entries remain in your history. They do not count toward a weekly goal.</Text>}
      </Surface>

      <Consistency rhythm={rhythm} accent={accent} chain={chain} referenceDate={referenceDate} />
      <CheckInTimes rhythm={rhythm} accent={accent} />

      <Surface style={styles.section}>
        <Text accessibilityRole="header" style={[TYPE.sectionTitle, { color: colors.foreground }]}>Focus</Text>
        {focusState === 'loading' ? <View accessibilityLiveRegion="polite" style={styles.loadingRow}>
          <ActivityIndicator color={accentText} size="small" />
          <Text style={[TYPE.body, styles.flexText, { color: colors.mutedForeground }]}>Loading saved sessions…</Text>
        </View> : focusState === 'error' ? <View style={styles.emptyBlock}>
          <Text accessibilityRole="alert" style={[TYPE.bodyStrong, { color: colors.foreground }]}>Focus history could not be loaded</Text>
          <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>Your saved history has not been replaced. Try loading it again.</Text>
          <AppButton label="Try again" variant="secondary" onPress={() => setRetry((value) => value + 1)} />
        </View> : <>
          <View style={styles.rateRow}>
            <Text style={[TYPE.display, { color: accentText }]}>{minutesLabel(rhythm.focus.minutes)}</Text>
            <Text style={[TYPE.body, styles.flexText, { color: colors.mutedForeground }]}>{rhythm.focus.minutes > 0 && rhythm.focus.minutes <= 1 ? 'minute logged' : 'minutes logged'}</Text>
          </View>
          <Text style={[TYPE.body, { color: colors.foreground }]}>{countLabel(rhythm.focus.sessions, 'recorded session')} linked to this chain.</Text>
          <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>These are recorded timer sessions, not a measure of productivity or a guarantee of uninterrupted attention.</Text>
          {rhythm.focus.legacySessions > 0 && <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>{countLabel(rhythm.focus.legacySessions, 'older entry', 'older entries')} cannot distinguish a planned duration from timer activity and are excluded from these totals.</Text>}
          {rhythm.focus.sessions === 0 && <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>Use a Focus timer linked to this chain to build this history.</Text>}
          <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>Totals use the history still saved on this device. Earlier versions may not have retained every older session.</Text>
        </>}
      </Surface>
      <Text style={[TYPE.caption, styles.footnote, { color: colors.mutedForeground }]}>Saved on this device. The period follows local calendar dates; check-in times use the local time saved with each new entry.</Text>
    </ScrollView>}
  </AmbientScreen>;
}

const styles = StyleSheet.create({
  navigation: { paddingHorizontal: SPACE.sm, paddingBottom: SPACE.xxs },
  backButton: { minHeight: CONTROL.minimumTarget, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: SPACE.xxs, paddingRight: SPACE.sm },
  content: { paddingHorizontal: CONTROL.screenHorizontal, paddingTop: SPACE.sm, gap: SPACE.md },
  titleBlock: { gap: SPACE.xs, paddingBottom: SPACE.xs },
  periods: { flexDirection: 'row', padding: SPACE.xxs, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.control },
  period: { flex: 1, minHeight: CONTROL.minimumTarget, paddingHorizontal: SPACE.xxs, paddingVertical: SPACE.xs, borderRadius: RADIUS.compact, alignItems: 'center', justifyContent: 'center' },
  section: { padding: SPACE.lg, gap: SPACE.sm },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, paddingVertical: SPACE.xs },
  metric: { minWidth: 72, flexBasis: '28%', flexGrow: 1, gap: SPACE.xxs },
  rateRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACE.sm },
  flexText: { flex: 1, minWidth: 110 },
  inset: { padding: SPACE.sm, borderRadius: RADIUS.compact, gap: SPACE.xxs },
  smallStats: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  barRow: { gap: SPACE.xs },
  barHeading: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  barTrack: { height: 7, borderRadius: RADIUS.capsule, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: RADIUS.capsule },
  dividerBlock: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: SPACE.sm, gap: SPACE.xxs },
  milestoneProgress: { gap: SPACE.xs, paddingVertical: SPACE.xs },
  milestoneRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: SPACE.xs, paddingTop: SPACE.xs },
  milestoneItem: { alignItems: 'center', minWidth: 40, gap: SPACE.xxs },
  milestoneDot: { width: 30, height: 30, borderRadius: RADIUS.capsule, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  emptyBlock: { gap: SPACE.sm, paddingVertical: SPACE.xs },
  loadingRow: { flexDirection: 'row', gap: SPACE.sm, alignItems: 'center', paddingVertical: SPACE.sm },
  screenNotice: { flex: 1, justifyContent: 'center', padding: SPACE.xl, gap: SPACE.md },
  footnote: { paddingHorizontal: SPACE.xxs },
});
