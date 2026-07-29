import React, { useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { CHAIN_COLORS, EXTRA_CHAIN_COLORS } from '@/constants/colors';
import { useChains } from '@/context/ChainsContext';

const SUGGESTIONS = [
  'Write daily', 'Morning run', 'Meditate', 'Read 30 min',
  'No phone after 10pm', 'Cold shower', 'Gym', 'Ship something',
];

export default function NewChainScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addChain } = useChains();

  const [name,          setName]          = useState('');
  const [selectedColor, setSelectedColor] = useState(CHAIN_COLORS[0]);
  const [showMoreColors, setShowMoreColors] = useState(false);
  const [cadence, setCadence] = useState<'daily' | 'weekly'>('daily');
  const [weeklyTarget, setWeeklyTarget] = useState(3);
  const inputRef = useRef<TextInput>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  function handleCreate() {
    if (!name.trim()) {
      inputRef.current?.focus();
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addChain(name, selectedColor, { cadence, weeklyTarget });
    router.back();
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={colors.mutedForeground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>New Chain</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollRoot}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Live preview card */}
        <View
          style={[
            styles.previewCard,
            { backgroundColor: colors.card, borderColor: selectedColor + '88' },
          ]}
        >
          <View style={[styles.previewStripe, { backgroundColor: selectedColor }]} />
          <View style={styles.previewContent}>
            <Text
              style={[
                styles.previewName,
                { color: name ? colors.foreground : colors.mutedForeground },
              ]}
            >
              {name || 'Your chain name'}
            </Text>
            <Text style={[styles.previewMeta, { color: colors.mutedForeground }]}>
              {cadence === 'weekly' ? `${weeklyTarget} days a week · starts this week` : '0 day streak · starts today'}
            </Text>
          </View>
          <View style={[styles.previewCheck, { borderColor: selectedColor }]}>
            <View style={[styles.previewCheckInner, { backgroundColor: selectedColor + '22' }]} />
          </View>
        </View>

        {/* Name input */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>HABIT NAME</Text>
        <View style={[styles.inputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            ref={inputRef}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Write daily, Morning run..."
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground }]}
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={handleCreate}
            autoFocus
          />
        </View>

        {/* Suggestions */}
        <View style={styles.suggestions}>
          {SUGGESTIONS.map((s) => (
            <Pressable
              key={s}
              onPress={() => setName(s)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: name === s ? selectedColor + '22' : colors.card,
                  borderColor:     name === s ? selectedColor : colors.border,
                  opacity:         pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: name === s ? selectedColor : colors.mutedForeground }]}>
                {s}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Color picker */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>RHYTHM</Text>
        <View style={styles.cadenceRow}>
          <Pressable onPress={() => setCadence('daily')} style={[styles.cadenceCard, { backgroundColor: cadence === 'daily' ? selectedColor + '18' : colors.card, borderColor: cadence === 'daily' ? selectedColor : colors.border }]}><Ionicons name="today-outline" size={17} color={cadence === 'daily' ? selectedColor : colors.mutedForeground} /><View style={styles.cadenceCopy}><Text style={[styles.cadenceTitle, { color: colors.foreground }]}>Daily</Text><Text style={[styles.cadenceBody, { color: colors.mutedForeground }]}>Keep a day streak.</Text></View></Pressable>
          <Pressable onPress={() => setCadence('weekly')} style={[styles.cadenceCard, { backgroundColor: cadence === 'weekly' ? selectedColor + '18' : colors.card, borderColor: cadence === 'weekly' ? selectedColor : colors.border }]}><Ionicons name="calendar-outline" size={17} color={cadence === 'weekly' ? selectedColor : colors.mutedForeground} /><View style={styles.cadenceCopy}><Text style={[styles.cadenceTitle, { color: colors.foreground }]}>Weekly goal</Text><Text style={[styles.cadenceBody, { color: colors.mutedForeground }]}>Complete a target each week.</Text></View></Pressable>
        </View>
        {cadence === 'weekly' && <View style={[styles.targetCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View><Text style={[styles.targetTitle, { color: colors.foreground }]}>How many days?</Text><Text style={[styles.targetBody, { color: colors.mutedForeground }]}>Your streak grows when you reach this each week.</Text></View><View style={styles.targetChoices}>{[1, 2, 3, 4, 5, 6, 7].map((target) => <Pressable key={target} onPress={() => { setWeeklyTarget(target); Haptics.selectionAsync(); }} style={[styles.targetPill, { backgroundColor: target === weeklyTarget ? selectedColor : colors.background, borderColor: target === weeklyTarget ? selectedColor : colors.border }]}><Text style={[styles.targetText, { color: target === weeklyTarget ? '#fff' : colors.mutedForeground }]}>{target}</Text></Pressable>)}</View></View>}

        <Text style={[styles.label, { color: colors.mutedForeground }]}>CHAIN COLOR</Text>
        <View style={styles.colorRow}>
          {CHAIN_COLORS.map((c) => {
            const isSelected = selectedColor === c;
            return (
              // Outer ring — visible border when selected
              <View
                key={c}
                style={[
                  styles.swatchRing,
                  isSelected
                    ? { borderColor: c, borderWidth: 2.5 }
                    : { borderColor: 'transparent', borderWidth: 2.5 },
                ]}
              >
                <Pressable
                  onPress={() => {
                    setSelectedColor(c);
                    Haptics.selectionAsync();
                  }}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: c },
                    isSelected && styles.colorSwatchSelected,
                  ]}
                >
                  {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
                </Pressable>
              </View>
            );
          })}
        </View>
        <Pressable onPress={() => setShowMoreColors((open) => !open)} style={styles.moreColors}><Text style={[styles.moreColorsText, { color: colors.mutedForeground }]}>{showMoreColors ? 'Fewer colors' : 'More colors'}</Text><Ionicons name={showMoreColors ? 'chevron-up' : 'chevron-down'} size={14} color={colors.mutedForeground} /></Pressable>
        {showMoreColors && <View style={styles.colorRow}>{EXTRA_CHAIN_COLORS.map((c) => { const isSelected = selectedColor === c; return <View key={c} style={[styles.swatchRing, isSelected ? { borderColor: c, borderWidth: 2.5 } : { borderColor: 'transparent', borderWidth: 2.5 }]}><Pressable onPress={() => { setSelectedColor(c); Haptics.selectionAsync(); }} style={[styles.colorSwatch, { backgroundColor: c }, isSelected && styles.colorSwatchSelected]}>{isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}</Pressable></View>; })}</View>}
      </ScrollView>

      {/* Create button */}
      <View style={[styles.footer, { paddingBottom: botPad + 24 }]}>
        <Pressable
          onPress={handleCreate}
          style={({ pressed }) => [
            styles.createBtn,
            {
              backgroundColor: name.trim() ? selectedColor : colors.border,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
        >
          <Ionicons name="link" size={20} color="#fff" />
          <Text style={styles.createBtnText}>Start this chain</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1 },
  scrollRoot: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
  },
  body: {
    paddingHorizontal: 20,
    gap: 12,
    paddingBottom: 16,
  },
  previewCard: {
    flexDirection: 'row',
    borderRadius: 18,
    borderWidth: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  previewStripe: {
    width: 5,
  },
  previewContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 4,
  },
  previewName: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
  },
  previewMeta: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  previewCheck: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignSelf: 'center',
    marginRight: 16,
    overflow: 'hidden',
  },
  previewCheckInner: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.2,
    marginTop: 4,
  },
  inputWrap: {
    borderRadius: 14,
    borderWidth: 1,
  },
  input: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    padding: 16,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  colorRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  moreColors: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 3, paddingVertical: 3 },
  moreColorsText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  cadenceRow: { flexDirection: 'row', gap: 8 },
  cadenceCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 12, gap: 8 },
  cadenceCopy: { gap: 2 },
  cadenceTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  cadenceBody: { fontSize: 10, fontFamily: 'Inter_400Regular', lineHeight: 14 },
  targetCard: { borderRadius: 16, borderWidth: 1, padding: 12, gap: 10 },
  targetTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  targetBody: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  targetChoices: { flexDirection: 'row', gap: 6, justifyContent: 'space-between' },
  targetPill: { width: 31, height: 31, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  targetText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  swatchRing: {
    borderRadius: 26,
    padding: 3,
  },
  colorSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatchSelected: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 5,
  },
  footer: {
    paddingHorizontal: 20,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 32,
    gap: 10,
  },
  createBtnText: {
    color: '#fff',
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
  },
});
