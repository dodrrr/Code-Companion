import React, { useCallback } from 'react';
import {
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
import { Chain, useChains } from '@/context/ChainsContext';
import ChainCard from '@/components/ChainCard';
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
  const { chains, isReady } = useChains();

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 84 : insets.bottom;

  const renderChain = useCallback(
    ({ item }: { item: Chain }) => <ChainCard chain={item} />,
    [],
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
    </>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
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
        {chains.length < 5 && (
          <Pressable
            onPress={() => router.push('/chain/new')}
            style={({ pressed }) => [
              styles.addBtn,
              {
                backgroundColor: colors.primary,
                transform: [{ scale: pressed ? 0.94 : 1 }],
              },
            ]}
          >
            <Ionicons name="add" size={24} color="#fff" />
          </Pressable>
        )}
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
