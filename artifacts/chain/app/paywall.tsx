import React, { useState } from 'react';
import { Alert, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AmbientScreen, GlassSurface } from '@/components/AmbientSurface';
import { useColors } from '@/hooks/useColors';
import { CHAIN_PRODUCTS, type ChainProductId } from '@/domain/subscriptions';
import { purchaseSubscription, restoreSubscription } from '@/lib/subscriptionBridge';

export default function PaywallScreen() {
  const colors = useColors('neutral');
  const [selected, setSelected] = useState<ChainProductId>(CHAIN_PRODUCTS.annual);
  const [busy, setBusy] = useState(false);

  const purchase = async () => {
    setBusy(true);
    const snapshot = await purchaseSubscription(selected);
    setBusy(false);
    if (snapshot.status === 'unavailable') {
      Alert.alert('App Store preview', 'Purchases are intentionally disabled until the native StoreKit build. Nothing was charged.');
      return;
    }
    if (snapshot.status === 'active' || snapshot.status === 'trial') router.back();
  };
  const restore = async () => {
    setBusy(true);
    const snapshot = await restoreSubscription();
    setBusy(false);
    Alert.alert(snapshot.status === 'active' || snapshot.status === 'trial' ? 'Purchase restored' : 'Nothing to restore', snapshot.status === 'unavailable' ? 'Restore becomes available in the App Store build.' : 'Your Apple subscription status has been refreshed.');
  };

  return <AmbientScreen tone="neutral" style={styles.root}><SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.header}><Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close"><Ionicons name="close" size={27} color={colors.foreground} /></Pressable></View>
    <View style={[styles.heroIcon, { backgroundColor: colors.primary + '20' }]}><Ionicons name="link" size={34} color={colors.primary} /></View>
    <Text style={[styles.eyebrow, { color: colors.primary }]}>CHAIN PLUS</Text><Text style={[styles.title, { color: colors.foreground }]}>Protect the whole rhythm.</Text><Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Plan without limits, protect distracting apps and keep every chain in one calm system.</Text>
    <GlassSurface style={[styles.features, { borderColor: colors.border }]}>{['Unlimited chains and planning', 'Pause Gate and Protection Windows', 'Rhythm insights and weekly reflection'].map((feature) => <View key={feature} style={styles.feature}><Ionicons name="checkmark-circle" size={20} color={colors.primary} /><Text style={[styles.featureText, { color: colors.foreground }]}>{feature}</Text></View>)}</GlassSurface>
    <View style={styles.plans}><Plan selected={selected === CHAIN_PRODUCTS.annual} title="Annual" price="€34.99 / year" detail="7 days free · best value" onPress={() => setSelected(CHAIN_PRODUCTS.annual)} colors={colors} /><Plan selected={selected === CHAIN_PRODUCTS.monthly} title="Monthly" price="€4.99 / month" detail="Cancel anytime" onPress={() => setSelected(CHAIN_PRODUCTS.monthly)} colors={colors} /></View>
    <Pressable disabled={busy} onPress={() => void purchase()} style={[styles.cta, { backgroundColor: colors.primary, opacity: busy ? 0.65 : 1 }]}><Text style={styles.ctaText}>{busy ? 'Checking Apple…' : 'Start 7-day free trial'}</Text></Pressable>
    <Pressable disabled={busy} onPress={() => void restore()} style={styles.restore}><Text style={[styles.restoreText, { color: colors.mutedForeground }]}>Restore purchases</Text></Pressable>
    <Text style={[styles.legal, { color: colors.mutedForeground }]}>Preview pricing only. No purchase is possible in Expo Go. Apple will show the final localized price and terms before confirmation.</Text>
  </ScrollView></SafeAreaView></AmbientScreen>;
}

function Plan({ selected, title, price, detail, onPress, colors }: { selected: boolean; title: string; price: string; detail: string; onPress: () => void; colors: ReturnType<typeof useColors> }) {
  return <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} style={[styles.plan, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary + '12' : colors.card }]}><View style={{ flex: 1 }}><Text style={[styles.planTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.planDetail, { color: colors.mutedForeground }]}>{detail}</Text></View><Text style={[styles.planPrice, { color: selected ? colors.primary : colors.foreground }]}>{price}</Text></Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, safe: { flex: 1, paddingHorizontal: 22, paddingTop: Platform.OS === 'android' ? 24 : 0 }, content: { paddingBottom: 34 }, header: { alignItems: 'flex-end', marginTop: 8, marginBottom: 24 }, heroIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }, eyebrow: { marginTop: 20, textAlign: 'center', fontSize: 11, letterSpacing: 1.7, fontFamily: 'Inter_700Bold' }, title: { marginTop: 8, textAlign: 'center', fontSize: 34, lineHeight: 39, fontFamily: 'Inter_700Bold' }, subtitle: { marginTop: 12, textAlign: 'center', fontSize: 15, lineHeight: 22, fontFamily: 'Inter_400Regular', paddingHorizontal: 12 }, features: { borderRadius: 22, padding: 17, marginTop: 28, gap: 14 }, feature: { flexDirection: 'row', alignItems: 'center', gap: 11 }, featureText: { fontSize: 14, fontFamily: 'Inter_500Medium' }, plans: { gap: 10, marginTop: 20 }, plan: { minHeight: 70, borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }, planTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' }, planDetail: { fontSize: 11, marginTop: 3, fontFamily: 'Inter_400Regular' }, planPrice: { fontSize: 13, fontFamily: 'Inter_700Bold' }, cta: { height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 20 }, ctaText: { color: '#fff', fontSize: 16, fontFamily: 'Inter_700Bold' }, restore: { paddingVertical: 16, alignItems: 'center' }, restoreText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' }, legal: { fontSize: 10, lineHeight: 15, textAlign: 'center', paddingHorizontal: 14 },
});
