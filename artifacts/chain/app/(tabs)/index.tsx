import React, { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Chain, getStreak, getTodayStr, isRestDay, toLocalDateString, useChains } from '@/context/ChainsContext';
import { usePlan } from '@/context/PlanContext';
import ChainCard from '@/components/ChainCard';
import { AmbientScreen, GlassSurface } from '@/components/AmbientSurface';
import { getDailyQuote } from '@/constants/quotes';

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const quote = getDailyQuote();

export default function TodayScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { chains, isReady, setDayStatus, isProtectedToday, isFrozenToday } = useChains();
  const { items } = usePlan();
  const [localDay, setLocalDay] = useState(getTodayStr());
  const [currentTime, setCurrentTime] = useState(() => new Date());

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

  useEffect(() => {
    const refresh = () => setCurrentTime(new Date());
    const interval = setInterval(refresh, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, []);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 84 : insets.bottom;
  const focusTask = items.find((item) => item.isPriority && !item.completed);
  const focusChain = chains.find((chain) => chain.id === focusTask?.chainId && !isProtectedToday(chain) && !isFrozenToday(chain)) || chains.find((chain) => !isProtectedToday(chain) && !isFrozenToday(chain) && !isRestDay(chain, localDay));
  const frozenChains = chains.filter((chain) => isFrozenToday(chain));
  // A weekly target is a weekly minimum, not a reason to hide today's win.
  // Logging it today protects today's chain even if the weekly target is still in progress.
  const allProtected = chains.length > 0 && chains.every((chain) => isRestDay(chain, localDay) || isProtectedToday(chain) || isFrozenToday(chain));
  const protectedCount = chains.filter((chain) => isRestDay(chain, localDay) || isProtectedToday(chain) || isFrozenToday(chain)).length;
  const completedChains = chains.filter((chain) => isProtectedToday(chain)).length;
  const nowHour = currentTime.getHours();
  const hoursLeft = Math.max(1, 24 - nowHour);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = toLocalDateString(yesterday);
  const recoveryChain = chains.find((chain) => chain.createdAt < localDay && !isRestDay(chain, yesterdayKey) && !chain.completedDates.includes(yesterdayKey) && !chain.minimumDates.includes(yesterdayKey) && !chain.frozenDates.includes(yesterdayKey) && !isProtectedToday(chain) && !isFrozenToday(chain));

  const renderChain = useCallback(
    ({ item }: { item: Chain }) => <ChainCard chain={item} />,
    [localDay],
  );

  const ListHeader = (
    <>
      {/* Daily quote */}
      <View style={styles.quoteWrap}>
        <Text style={[styles.quoteText, { color: colors.mutedForeground }]}>
          "{quote.text}"
        </Text>
        <Text style={[styles.quoteAuthor, { color: colors.mutedForeground + 'aa' }]}>
          — {quote.author}
        </Text>
      </View>
      {recoveryChain && <Pressable onPress={() => setDayStatus(recoveryChain.id, localDay, 'minimum')} style={({ pressed }) => [styles.recoveryCard, { backgroundColor: 'transparent', borderColor: recoveryChain.color + '55', opacity: pressed ? 0.8 : 1, overflow: 'hidden' }]}><GlassSurface pointerEvents="none" accentColor={recoveryChain.color} style={StyleSheet.absoluteFill} /><Ionicons name="refresh-outline" size={18} color={recoveryChain.color} /><View style={{ flex: 1 }}><Text style={[styles.focusEyebrow, { color: recoveryChain.color }]}>START AGAIN TODAY</Text><Text style={[styles.focusTitle, { color: colors.foreground }]}>One miss does not end {recoveryChain.name}.</Text><Text style={[styles.focusBody, { color: colors.mutedForeground }]}>Protect it with {recoveryChain.minimumLabel}.</Text></View></Pressable>}
      {allProtected && frozenChains.length > 0 ? <View style={[styles.protectedCard, { backgroundColor: 'transparent', borderColor: '#5B8CFF88', overflow: 'hidden' }]}><GlassSurface pointerEvents="none" accentColor="#5B8CFF" style={StyleSheet.absoluteFill} /><View style={[styles.protectedIcon, { backgroundColor: '#5B8CFF24' }]}><Ionicons name="shield-checkmark-outline" size={21} color="#5B8CFF" /></View><View style={{ flex: 1 }}><Text style={[styles.focusEyebrow, { color: '#5B8CFF' }]}>TODAY IS PROTECTED</Text><Text style={[styles.focusTitle, { color: colors.foreground }]}>Your day is covered.</Text><Text style={[styles.focusBody, { color: colors.mutedForeground }]}>{completedChains} completed · {frozenChains.length} safely frozen.</Text></View></View> : allProtected ? <View style={[styles.protectedCard, { backgroundColor: 'transparent', borderColor: colors.primary + '58', overflow: 'hidden' }]}><GlassSurface pointerEvents="none" accentColor={colors.primary} style={StyleSheet.absoluteFill} /><View style={[styles.protectedIcon, { backgroundColor: colors.primary + '22' }]}><Ionicons name="shield-checkmark-outline" size={21} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.focusEyebrow, { color: colors.primary }]}>ALL PROTECTED</Text><Text style={[styles.focusTitle, { color: colors.foreground }]}>Today’s work is done.</Text><Text style={[styles.focusBody, { color: colors.mutedForeground }]}>{protectedCount} chain{protectedCount === 1 ? '' : 's'} kept · Let that count.</Text></View></View> : focusChain && <><Pressable onPress={() => router.push({ pathname: '/chain/[id]', params: { id: focusChain.id } })} style={({ pressed }) => [styles.focusCard, { backgroundColor: 'transparent', borderColor: focusChain.color + '55', opacity: pressed ? 0.8 : 1, overflow: 'hidden' }]}>
        <GlassSurface pointerEvents="none" accentColor={focusChain.color} style={StyleSheet.absoluteFill} />
        <View style={[styles.focusIcon, { backgroundColor: focusChain.color + '22' }]}><Ionicons name="flame-outline" size={19} color={focusChain.color} /></View>
        <View style={{ flex: 1 }}><Text style={[styles.focusEyebrow, { color: focusChain.color }]}>CHAIN AT RISK · {hoursLeft}H LEFT</Text><Text style={[styles.focusTitle, { color: colors.foreground }]} numberOfLines={1}>{focusTask?.text || `Protect ${focusChain.name}`}</Text><Text style={[styles.focusBody, { color: colors.mutedForeground }]}>Protect your {getStreak(focusChain)}-{focusChain.cadence === 'weekly' ? 'week' : 'day'} {focusChain.name} chain.</Text></View>
        <Ionicons name="chevron-forward" size={18} color={focusChain.color} />
      </Pressable><Pressable onPress={() => { setDayStatus(focusChain.id, localDay, 'minimum'); }} style={({ pressed }) => [styles.rescue, { borderColor: focusChain.color + '55', opacity: pressed ? 0.7 : 1 }]}><Ionicons name="leaf-outline" size={15} color={focusChain.color} /><Text style={[styles.rescueText, { color: focusChain.color }]}>Rescue mode · {focusChain.minimumLabel}</Text></Pressable></>}
    </>
  );

  return (
    <AmbientScreen tone="today" style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
            {getGreeting()}
          </Text>
          <Text style={[styles.dateStr, { color: colors.foreground }]}>
            {formatDate()}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push('/settings')} style={[styles.settingsBtn, { borderColor: colors.border }]} hitSlop={8}>
            <Ionicons name="settings-outline" size={19} color={colors.mutedForeground} />
          </Pressable>
          {chains.length < 5 && <Pressable
            onPress={() => router.push('/chain/new')}
            style={({ pressed }) => [styles.addBtn, { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
          ><Ionicons name="add" size={24} color="#fff" /></Pressable>}
        </View>
      </View>

      {/* Chain list or empty state */}
      {!isReady ? (
        <View style={styles.loading}>
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading your chains…</Text>
        </View>
      ) : chains.length === 0 ? (
        <View style={styles.empty}>
          <View
            style={[
              styles.emptyIconWrap,
              { backgroundColor: colors.primary + '18' },
            ]}
          >
            <Ionicons name="link" size={40} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            Start your first chain
          </Text>
          <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
            Pick one habit. Show up daily.{'\n'}Don't break the chain.
          </Text>
          <Pressable
            onPress={() => router.push('/chain/new')}
            style={({ pressed }) => [
              styles.emptyBtn,
              {
                backgroundColor: colors.primary,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              },
            ]}
          >
            <Text style={styles.emptyBtnText}>Add your first chain</Text>
          </Pressable>
          {/* Quote in empty state */}
          <View style={styles.emptyQuote}>
            <Text style={[styles.quoteText, { color: colors.mutedForeground, textAlign: 'center' }]}>
              "{quote.text}"
            </Text>
            <Text style={[styles.quoteAuthor, { color: colors.mutedForeground + '99', textAlign: 'center' }]}>
              — {quote.author}
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={chains}
          extraData={localDay}
          keyExtractor={(c) => c.id}
          renderItem={renderChain}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: botPad + 80 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </AmbientScreen>
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
    paddingBottom: 16,
  },
  headerLeft: {
    gap: 3,
  },
  greeting: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  dateStr: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  settingsBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  list: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  quoteWrap: {
    marginBottom: 20,
    gap: 4,
  },
  quoteText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  quoteAuthor: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.3,
  },
  focusCard: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 18, borderWidth: 1, padding: 13, marginBottom: 16 },
  focusIcon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  focusEyebrow: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  focusTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  focusBody: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  protectedCard: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 18, borderWidth: 1, padding: 13, marginBottom: 16 },
  protectedIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rescue: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderRadius: 15, paddingVertical: 10, marginTop: -7, marginBottom: 16 },
  rescueText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  recoveryCard: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 18, borderWidth: 1, padding: 13, marginBottom: 10 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 14,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 23,
  },
  emptyBtn: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 32,
  },
  emptyBtnText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  emptyQuote: {
    marginTop: 24,
    gap: 6,
    paddingHorizontal: 8,
  },
});
