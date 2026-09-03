import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmbientScreen } from '@/components/AmbientSurface';
import AnimatedPressable from '@/components/AnimatedPressable';
import { AppButton, IconButton, Surface } from '@/components/ui/AppUI';
import { CONTROL, RADIUS, SPACE, TYPE } from '@/constants/designSystem';
import { readableAccentColor } from '@/constants/sectionTheme';
import { useColors } from '@/hooks/useColors';
import { CHAIN_PRODUCTS, type ChainProductId } from '@/domain/subscriptions';
import { purchaseSubscription, restoreSubscription } from '@/lib/subscriptionBridge';
import { getNativeReadiness } from '@/lib/nativeReadiness';
import { reportDiagnostic } from '@/lib/diagnostics';
import { playFeedback } from '@/lib/feedback';

export default function PaywallScreen() {
  const colors = useColors('today');
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<ChainProductId>(CHAIN_PRODUCTS.annual);
  const [busy, setBusy] = useState(false);
  const [storeKitReady, setStoreKitReady] = useState<boolean | null>(null);
  const accentText = readableAccentColor(colors.primary, colors.cardSolid);
  const planCopy = storeKitReady === true
    ? {
        annualPrice: 'Shown by Apple',
        monthlyPrice: 'Shown by Apple',
        annualDetail: 'Apple provides the localized price',
        monthlyDetail: 'Apple provides the localized price',
      }
    : storeKitReady === false
      ? {
          annualPrice: '€39.99 / year',
          monthlyPrice: '€6.99 / month',
          annualDetail: 'Preview price · best value',
          monthlyDetail: 'Preview price · cancel anytime',
        }
      : {
          annualPrice: 'Checking Apple…',
          monthlyPrice: 'Checking Apple…',
          annualDetail: 'Checking store availability',
          monthlyDetail: 'Checking store availability',
        };
  const purchaseLabel = busy
    ? 'Checking Apple…'
    : storeKitReady === null
      ? 'Checking availability…'
      : storeKitReady
        ? 'Continue with Apple'
        : 'Preview selected plan';
  const legalCopy = storeKitReady === null
    ? 'Checking App Store availability.'
    : storeKitReady
      ? 'Apple will show the final localized price and terms before confirmation.'
      : 'Preview pricing only. No purchase is possible in this preview build.';

  useEffect(() => {
    let cancelled = false;
    void getNativeReadiness()
      .then((readiness) => { if (!cancelled) setStoreKitReady(readiness.subscriptions); })
      .catch((error) => {
        reportDiagnostic({ area: 'native', operation: 'paywall.readiness', severity: 'warning', error });
        if (!cancelled) setStoreKitReady(false);
      });
    return () => { cancelled = true; };
  }, []);

  const purchase = async () => {
    setBusy(true);
    try {
      const snapshot = await purchaseSubscription(selected);
      if (snapshot.status === 'unavailable') {
        Alert.alert('App Store preview', 'Purchases are intentionally disabled until the native StoreKit build. Nothing was charged.');
        return;
      }
      if (snapshot.status === 'active' || snapshot.status === 'trial') {
        playFeedback('success');
        router.back();
        return;
      }
      if (snapshot.status === 'expired') {
        Alert.alert('Subscription not active', 'Apple did not return an active purchase. Nothing was charged.');
        return;
      }
      Alert.alert('Purchase not confirmed', 'Apple did not confirm a purchase. Nothing was charged.');
    } catch (error) {
      reportDiagnostic({ area: 'native', operation: 'paywall.purchase', severity: 'error', error });
      Alert.alert('Apple couldn’t connect', 'Nothing was charged. Try again when the App Store connection is available.');
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    setBusy(true);
    try {
      const snapshot = await restoreSubscription();
      if (snapshot.status === 'active' || snapshot.status === 'trial') {
        playFeedback('success');
        Alert.alert('Purchase restored', 'Chain Plus is active on this device.');
      } else if (snapshot.status === 'unavailable') {
        Alert.alert('Restore unavailable', 'Restore becomes available in the App Store build.');
      } else if (snapshot.status === 'expired') {
        Alert.alert('Subscription expired', 'Apple found a previous subscription, but it is no longer active.');
      } else {
        Alert.alert('Restore not confirmed', 'Apple could not confirm an active purchase. Try again later.');
      }
    } catch (error) {
      reportDiagnostic({ area: 'native', operation: 'paywall.restore', severity: 'error', error });
      Alert.alert('Restore unavailable', 'Chain couldn’t reach Apple. Try again later.');
    } finally {
      setBusy(false);
    }
  };

  return <AmbientScreen tone="neutral" style={styles.root}><ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACE.xs, paddingBottom: Math.max(insets.bottom, SPACE.md) + SPACE.xl }]} showsVerticalScrollIndicator={false}>
    <View style={styles.header}><IconButton icon="close" label="Close Chain Plus" onPress={() => router.back()} /></View>
    <View style={[styles.heroIcon, { backgroundColor: colors.primary + '20' }]}><Ionicons name="link" size={34} color={accentText} /></View>
    <Text style={[styles.eyebrow, { color: accentText }]}>CHAIN PLUS · PREVIEW</Text><Text style={[styles.title, { color: colors.foreground }]}>A deeper layer of Chain.</Text><Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Plus is being prepared for the native build. Nothing on this screen limits your current Chains or claims that app protection is already active.</Text>
    <Surface style={styles.features}>{['Advanced planning and Focus controls', 'Native Gate controls after Apple integration', 'Deeper rhythm insights and weekly reflection'].map((feature) => <View key={feature} style={styles.feature}><Ionicons name="checkmark-circle" size={20} color={accentText} /><Text style={[styles.featureText, { color: colors.foreground }]}>{feature}</Text></View>)}</Surface>
    <View style={styles.plans}><Plan selected={selected === CHAIN_PRODUCTS.annual} title="Annual" price={planCopy.annualPrice} detail={planCopy.annualDetail} onPress={() => { setSelected(CHAIN_PRODUCTS.annual); playFeedback('selection'); }} colors={colors} /><Plan selected={selected === CHAIN_PRODUCTS.monthly} title="Monthly" price={planCopy.monthlyPrice} detail={planCopy.monthlyDetail} onPress={() => { setSelected(CHAIN_PRODUCTS.monthly); playFeedback('selection'); }} colors={colors} /></View>
    <AppButton busy={busy} disabled={storeKitReady === null} label={purchaseLabel} onPress={() => { void purchase(); }} style={styles.cta} />
    <AnimatedPressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void restore()} style={styles.restore}><Text style={[styles.restoreText, { color: colors.mutedForeground }]}>Restore purchases</Text></AnimatedPressable>
    <Text style={[styles.legal, { color: colors.mutedForeground }]}>{legalCopy}</Text>
  </ScrollView></AmbientScreen>;
}

function Plan({ selected, title, price, detail, onPress, colors }: { selected: boolean; title: string; price: string; detail: string; onPress: () => void; colors: ReturnType<typeof useColors> }) {
  const selectedAccent = readableAccentColor(colors.primary, colors.cardSolid);
  return <AnimatedPressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={`${title}, ${price}`} style={[styles.plan, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary + '12' : colors.card }]}><View style={{ flex: 1 }}><Text style={[styles.planTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.planDetail, { color: colors.mutedForeground }]}>{detail}</Text></View><Text style={[styles.planPrice, { color: selected ? selectedAccent : colors.foreground }]}>{price}</Text></AnimatedPressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: CONTROL.screenHorizontal },
  header: { alignItems: 'flex-end', marginBottom: SPACE.lg },
  heroIcon: { width: 72, height: 72, borderRadius: RADIUS.hero, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  eyebrow: { ...TYPE.eyebrow, marginTop: SPACE.lg, textAlign: 'center' },
  title: { ...TYPE.display, marginTop: SPACE.xs, textAlign: 'center' },
  subtitle: { marginTop: SPACE.sm, textAlign: 'center', fontSize: 15, lineHeight: 22, fontFamily: 'Inter_400Regular', paddingHorizontal: SPACE.sm },
  features: { borderRadius: RADIUS.card, padding: 17, marginTop: 28, gap: SPACE.sm },
  feature: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  featureText: TYPE.bodyStrong,
  plans: { gap: SPACE.xs, marginTop: SPACE.lg },
  plan: { minHeight: 76, borderRadius: RADIUS.button, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACE.md, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  planTitle: TYPE.cardTitle,
  planDetail: { ...TYPE.caption, marginTop: SPACE.hairline },
  planPrice: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_700Bold' },
  cta: { minHeight: CONTROL.prominentButtonHeight, marginTop: SPACE.lg },
  restore: { minHeight: CONTROL.minimumTarget, alignItems: 'center', justifyContent: 'center', marginTop: SPACE.xxs },
  restoreText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  legal: { ...TYPE.metadata, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: SPACE.sm },
});
