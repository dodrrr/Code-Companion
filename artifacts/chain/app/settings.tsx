import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

const PROFILE_EMAIL_KEY = '@chain_profile_email';

export default function SettingsScreen() {
  const colors = useColors();
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => { void AsyncStorage.getItem(PROFILE_EMAIL_KEY).then((value) => value && setEmail(value)); }, []);
  const saveEmail = async () => {
    await AsyncStorage.setItem(PROFILE_EMAIL_KEY, email.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
    <View style={styles.header}><Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="chevron-back" size={28} color={colors.foreground} /></Pressable><Text style={[styles.title, { color: colors.foreground }]}>Settings</Text><View style={{ width: 28 }} /></View>
    <Text style={[styles.label, { color: colors.mutedForeground }]}>YOUR ACCOUNT</Text>
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.icon, { backgroundColor: colors.primary + '1A' }]}><Ionicons name="person-outline" size={19} color={colors.primary} /></View>
      <View style={styles.copy}><Text style={[styles.cardTitle, { color: colors.foreground }]}>Email</Text><Text style={[styles.cardBody, { color: colors.mutedForeground }]}>Kept locally until cloud sync arrives.</Text></View>
      <TextInput value={email} onChangeText={setEmail} placeholder="you@email.com" placeholderTextColor={colors.mutedForeground} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={[styles.email, { color: colors.foreground, borderColor: colors.border }]} />
      <Pressable onPress={() => void saveEmail()} style={[styles.save, { backgroundColor: colors.primary }]}><Text style={styles.saveText}>{saved ? 'Saved' : 'Save'}</Text></Pressable>
    </View>
    <Text style={[styles.label, { color: colors.mutedForeground }]}>SUBSCRIPTION</Text>
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.icon, { backgroundColor: colors.primary + '1A' }]}><Ionicons name="sparkles-outline" size={19} color={colors.primary} /></View><View style={styles.copy}><Text style={[styles.cardTitle, { color: colors.foreground }]}>Chain Plus</Text><Text style={[styles.cardBody, { color: colors.mutedForeground }]}>Early access · not active</Text></View><Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
    </View>
    <View style={[styles.priceCard, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '50' }]}><Text style={[styles.priceTitle, { color: colors.foreground }]}>Planned for App Store launch</Text><Text style={[styles.price, { color: colors.primary }]}>€4.99 / month · €34.99 / year</Text><Text style={[styles.priceBody, { color: colors.mutedForeground }]}>7-day trial, then manage your subscription in Apple Settings. Nothing is charged in this preview.</Text><Pressable onPress={() => Alert.alert('Coming with the App Store launch', 'Subscription management will appear here once Chain is available through Apple.') } style={[styles.manage, { borderColor: colors.primary + '75' }]}><Text style={[styles.manageText, { color: colors.primary }]}>Manage subscription</Text></Pressable></View>
    <Text style={[styles.foot, { color: colors.mutedForeground }]}>Chain is built to make space for what matters — not to keep you scrolling.</Text>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 24 : 0 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 32 }, title: { fontSize: 24, fontFamily: 'Inter_700Bold' }, label: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, marginBottom: 9 }, card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 18, padding: 12, marginBottom: 10 }, icon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1 }, cardTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' }, cardBody: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 }, email: { width: 124, fontSize: 12, fontFamily: 'Inter_400Regular', borderBottomWidth: 1, paddingVertical: 5 }, save: { borderRadius: 11, paddingHorizontal: 9, paddingVertical: 7 }, saveText: { color: '#fff', fontSize: 11, fontFamily: 'Inter_700Bold' }, priceCard: { borderWidth: 1, borderRadius: 19, padding: 16, marginTop: 2 }, priceTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' }, price: { fontSize: 17, fontFamily: 'Inter_700Bold', marginTop: 7 }, priceBody: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18, marginTop: 5 }, manage: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 9, marginTop: 15 }, manageText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' }, foot: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18, marginTop: 26, paddingHorizontal: 24 },
});
