import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  InteractionManager,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import {
  Chain,
  getTodayStr,
  isRestDay,
  toLocalDateString,
  useChains,
} from '@/context/ChainsContext';
import { type PlanItem, usePlan } from '@/context/PlanContext';
import ChainCard from '@/components/ChainCard';
import { AmbientScreen } from '@/components/AmbientSurface';
import { AppButton, IconButton, Surface } from '@/components/ui/AppUI';
import { CONTROL, RADIUS, SPACE, TYPE } from '@/constants/designSystem';
import { readableAccentColor } from '@/constants/sectionTheme';
import { playFeedback } from '@/lib/feedback';

const GLASS_SURFACE_COLOR = '#121214';

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export default function ChainsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { chains, isReady, setDayStatus, isProtectedToday, isFrozenToday } = useChains();
  const { items, activeDate, readItemsForDate } = usePlan();
  const [localDay, setLocalDay] = useState(getTodayStr());
  const [todayItems, setTodayItems] = useState<PlanItem[]>([]);
  const [savingMinimumId, setSavingMinimumId] = useState<string>();

  useEffect(() => {
    let preloadTimer: ReturnType<typeof setTimeout> | undefined;
    const interaction = InteractionManager.runAfterInteractions(() => {
      preloadTimer = setTimeout(() => {
        router.prefetch('/chain/new');
      }, 80);
    });
    return () => {
      interaction.cancel();
      if (preloadTimer) clearTimeout(preloadTimer);
    };
  }, []);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    void readItemsForDate(localDay).then((snapshot) => {
      if (!cancelled) setTodayItems(snapshot.filter((item) => item.planDate === localDay));
    });
    return () => { cancelled = true; };
  }, [localDay, readItemsForDate]));

  useEffect(() => {
    if (activeDate === localDay) {
      setTodayItems(items.filter((item) => item.planDate === localDay));
    }
  }, [activeDate, items, localDay]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const scheduleNextDay = () => {
      const now = new Date();
      const nextDay = new Date(now);
      nextDay.setHours(24, 0, 1, 0);
      timer = setTimeout(() => {
        setLocalDay(getTodayStr());
        scheduleNextDay();
      }, nextDay.getTime() - now.getTime());
    };
    scheduleNextDay();
    return () => clearTimeout(timer);
  }, []);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomSafe = Platform.OS === 'web' ? 0 : insets.bottom;
  const focusTask = todayItems.find((item) => item.isPriority && !item.completed);
  const dueChains = chains.filter((chain) => !isRestDay(chain, localDay));
  const eligibleChains = dueChains.filter(
    (chain) => !isProtectedToday(chain) && !isFrozenToday(chain),
  );
  const taskChain = focusTask
    ? eligibleChains.find((chain) => chain.id === focusTask.chainId)
    : undefined;
  const focusChain = taskChain ?? eligibleChains[0];
  const frozenChains = dueChains.filter((chain) => isFrozenToday(chain));
  const keptCount = dueChains.filter((chain) => isProtectedToday(chain) && !isFrozenToday(chain)).length;
  const allProtected = chains.length > 0 && eligibleChains.length === 0;
  const allResting = chains.length > 0 && dueChains.length === 0;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = toLocalDateString(yesterday);
  const recoveryChain = eligibleChains.find(
    (chain) => chain.createdAt < localDay
      && !isRestDay(chain, yesterdayKey)
      && !chain.completedDates.includes(yesterdayKey)
      && !chain.minimumDates.includes(yesterdayKey)
      && !chain.frozenDates.includes(yesterdayKey),
  );

  const interventionChain = recoveryChain ?? focusChain;
  const interventionTask = focusTask && interventionChain?.id === focusTask.chainId
    ? focusTask.text
    : undefined;

  const handleAdd = useCallback(() => {
    playFeedback('selection');
    router.push('/chain/new');
  }, []);

  const renderChain = useCallback(
    ({ item }: { item: Chain }) => <ChainCard chain={item} />,
    [],
  );

  const listHeader = (
    <View accessibilityLiveRegion="polite">
      {allProtected ? (
        <ProtectedSummary
          allResting={allResting}
          dueCount={dueChains.length}
          keptCount={keptCount}
          frozenCount={frozenChains.length}
        />
      ) : interventionChain ? (
        <ChainIntervention
          chain={interventionChain}
          taskText={interventionTask}
          recovering={interventionChain.id === recoveryChain?.id}
          minimumBusy={savingMinimumId === interventionChain.id}
          onMinimum={async () => {
            if (savingMinimumId) return;
            setSavingMinimumId(interventionChain.id);
            const result = await setDayStatus(interventionChain.id, localDay, 'minimum');
            setSavingMinimumId(undefined);
            if (result.status !== 'persisted') {
              playFeedback('error');
              Alert.alert('Chain not updated', 'Chain couldn’t save the minimum version. Try again.');
              return;
            }
            playFeedback('light');
          }}
        />
      ) : null}
    </View>
  );

  return (
    <AmbientScreen tone="today" style={styles.root}>
      <View style={[styles.header, { paddingTop: topPad + SPACE.sm }]}>
        <View style={styles.headerCopy}>
          <Text style={[styles.screenTitle, { color: colors.foreground }]}>Chains</Text>
          <Text style={[styles.date, { color: colors.mutedForeground }]}>{formatDate()}</Text>
        </View>
        <View style={styles.headerActions}>
          <IconButton icon="settings-outline" label="Open settings" onPress={() => router.push('/settings')} />
          <IconButton
            icon="add"
            label="Add a new Chain"
            onPress={handleAdd}
            accentColor={colors.primary}
            filled
          />
        </View>
      </View>

      {!isReady ? (
        <View style={styles.loading}>
          <Text style={[TYPE.body, { color: colors.mutedForeground }]}>Loading your chains…</Text>
        </View>
      ) : chains.length === 0 ? (
        <ScrollView
          contentContainerStyle={[
            styles.empty,
            { paddingBottom: bottomSafe + CONTROL.tabContentInset },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '18' }]}>
            <Ionicons name="link" size={34} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Start with one promise.</Text>
          <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>Choose something worth returning to. Chain will help you keep it visible.</Text>
          <View style={styles.emptyAction}>
            <AppButton label="Create your first Chain" icon="add" onPress={handleAdd} />
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={chains}
          extraData={localDay}
          keyExtractor={(chain) => chain.id}
          renderItem={renderChain}
          ListHeaderComponent={listHeader}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: bottomSafe + CONTROL.tabContentInset },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </AmbientScreen>
  );
}

function ChainIntervention({
  chain,
  taskText,
  recovering,
  minimumBusy,
  onMinimum,
}: {
  chain: Chain;
  taskText?: string;
  recovering: boolean;
  minimumBusy: boolean;
  onMinimum: () => void;
}) {
  const colors = useColors();
  const readableAccent = readableAccentColor(chain.color, GLASS_SURFACE_COLOR, 4.8);
  return (
    <Surface accentColor={chain.color} style={styles.intervention}>
      <View style={styles.interventionHeader}>
        <View style={[styles.interventionIcon, { backgroundColor: chain.color + '1C' }]}>
          <Ionicons name={recovering ? 'refresh-outline' : 'link-outline'} size={20} color={readableAccent} />
        </View>
        <View style={styles.interventionCopy}>
          <Text style={[TYPE.eyebrow, { color: readableAccent }]}>{recovering ? 'RETURN TODAY' : taskText ? 'TODAY’S PRIORITY' : 'KEEP TODAY'}</Text>
          <Text style={[TYPE.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
            {recovering ? `One miss does not end ${chain.name}.` : taskText ?? `Keep ${chain.name} moving.`}
          </Text>
          <Text
            ellipsizeMode="tail"
            numberOfLines={2}
            style={[TYPE.caption, { color: colors.mutedForeground, flexShrink: 1 }]}
          >
            {recovering
              ? `${chain.minimumLabel} is enough to return today.`
              : `On a hard day, ${chain.minimumLabel} still keeps the promise.`}
          </Text>
        </View>
      </View>
      <AppButton
        label="Log minimum"
        icon="leaf-outline"
        onPress={onMinimum}
        accentColor={chain.color}
        busy={minimumBusy}
      />
    </Surface>
  );
}

function ProtectedSummary({
  allResting,
  dueCount,
  keptCount,
  frozenCount,
}: {
  allResting: boolean;
  dueCount: number;
  keptCount: number;
  frozenCount: number;
}) {
  const colors = useColors();
  const accent = allResting ? colors.mutedForeground : frozenCount > 0 ? '#5B8CFF' : colors.primary;
  const readableAccent = readableAccentColor(accent, GLASS_SURFACE_COLOR, 4.8);
  const detail = allResting
    ? 'Rest is part of the rhythm.'
    : `${keptCount} kept${frozenCount ? ` · ${frozenCount} safely frozen` : ''} · ${dueCount} due today.`;
  return (
    <Surface accentColor={accent} style={styles.summary}>
      <View style={[styles.interventionIcon, { backgroundColor: accent + '1C' }]}>
        <Ionicons name={allResting ? 'moon-outline' : 'shield-checkmark-outline'} size={20} color={readableAccent} />
      </View>
      <View style={styles.interventionCopy}>
        <Text style={[TYPE.eyebrow, { color: readableAccent }]}>{allResting ? 'REST DAY' : 'TODAY IS KEPT'}</Text>
        <Text style={[TYPE.cardTitle, { color: colors.foreground }]}>{allResting ? 'Nothing is due today.' : 'Your promises are covered.'}</Text>
        <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>{detail}</Text>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: CONTROL.screenHorizontal,
    paddingBottom: SPACE.md,
    gap: SPACE.sm,
  },
  headerCopy: { flex: 1, minWidth: 0, gap: SPACE.hairline },
  screenTitle: { ...TYPE.screenTitle },
  date: { ...TYPE.caption },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, flexShrink: 0 },
  list: { paddingHorizontal: CONTROL.screenHorizontal, paddingTop: SPACE.xxs },
  intervention: { padding: SPACE.md, gap: SPACE.md, marginBottom: SPACE.md },
  interventionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm },
  interventionIcon: {
    width: CONTROL.minimumTarget,
    height: CONTROL.minimumTarget,
    borderRadius: RADIUS.control,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  interventionCopy: { flex: 1, minWidth: 0, gap: SPACE.hairline },
  summary: { flexDirection: 'row', alignItems: 'center', padding: SPACE.md, gap: SPACE.sm, marginBottom: SPACE.md },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingTop: SPACE.xl,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.hero,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.md,
  },
  emptyTitle: { ...TYPE.modalTitle, textAlign: 'center' },
  emptyBody: { ...TYPE.body, textAlign: 'center', marginTop: SPACE.xs, maxWidth: 310 },
  emptyAction: { width: '100%', maxWidth: 310, marginTop: SPACE.xl },
});
