import React, { useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ChainSymbol } from '@/components/ui/ChainSymbol';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { CHAIN_COLORS, EXTRA_CHAIN_COLORS, CHAIN_COLOR_NAMES } from '@/constants/colors';
import { CONTROL, RADIUS, SPACE, TYPE } from '@/constants/designSystem';
import { readableAccentColor, readableTextColor } from '@/constants/sectionTheme';
import { useChains } from '@/context/ChainsContext';
import { AmbientScreen } from '@/components/AmbientSurface';
import { AppButton, IconButton, Surface } from '@/components/ui/AppUI';
import { SevenChoiceSelector } from '@/components/ui/SevenChoiceSelector';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { playFeedback } from '@/lib/feedback';

const PRIMARY_SUGGESTIONS = [
  'Write daily',
  'Morning run',
  'Meditate',
  'Read 30 min',
  'No phone after 10pm',
  'Gym',
  'Walk 10k steps',
  'Deep work',
];

const MORE_SUGGESTIONS = [
  'Cold shower',
  'Stretch',
  'Drink water',
  'Sleep by 11pm',
  'No sugar today',
  'Cook at home',
  'Journal',
  'Practice gratitude',
  'Learn something',
  'Study 1 hour',
  'Review notes',
  'Practice a language',
  'Build my project',
  'Create something',
  'Post content',
  'Reply to messages',
  'Plan tomorrow',
  'Tidy my space',
  'Call family',
  'Take a real break',
  'Get outside',
];

const WEEKLY_TARGET_OPTIONS = [1, 2, 3, 4, 5, 6, 7].map((target) => ({
  label: String(target),
  value: target,
  accessibilityLabel: `${target} ${target === 1 ? 'day' : 'days'} each week`,
}));

export default function NewChainScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addChain } = useChains();

  const [name,          setName]          = useState('');
  const [selectedColor, setSelectedColor] = useState(CHAIN_COLORS[0]);
  const [showMoreColors, setShowMoreColors] = useState(false);
  const [cadence, setCadence] = useState<'daily' | 'weekly'>('daily');
  const [weeklyTarget, setWeeklyTarget] = useState(3);
  const [showMoreSuggestions, setShowMoreSuggestions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const submittingRef = useRef(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  async function handleCreate() {
    if (submittingRef.current) return;
    if (!name.trim()) {
      inputRef.current?.focus();
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    const result = await addChain(name, selectedColor, { cadence, weeklyTarget });
    if (result.status !== 'persisted') {
      submittingRef.current = false;
      setIsSubmitting(false);
      playFeedback('error');
      Alert.alert('Chain not created', 'Chain couldn’t save this commitment. Your draft is still here — try again.');
      return;
    }
    playFeedback('success');
    router.back();
  }

  return (
    <AmbientScreen tone="today" style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <IconButton icon="close" label="Close new Chain" onPress={() => router.back()} />
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>New Chain</Text>
        <View style={{ width: CONTROL.minimumTarget }} />
      </View>

      <KeyboardAwareScrollViewCompat
        bottomOffset={SPACE.xl}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Live preview card */}
        <Surface
          accentColor={selectedColor}
          style={[
            styles.previewCard,
            { borderColor: selectedColor + '88' },
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
              {cadence === 'weekly' ? `${weeklyTarget} days a week · starts this week` : '0-day streak · starts today'}
            </Text>
          </View>
          <View style={[styles.previewCheck, { borderColor: selectedColor }]}>
            <View style={[styles.previewCheckInner, { backgroundColor: selectedColor + '22' }]} />
          </View>
        </Surface>

        {/* Name input */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>CHAIN NAME</Text>
        <Surface style={styles.inputWrap}>
          <TextInput
            ref={inputRef}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Write daily, Morning run..."
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel="Chain name"
            style={[styles.input, { color: colors.foreground }]}
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />
        </Surface>

        {/* Suggestions */}
        <Text style={[styles.quickStart, { color: colors.mutedForeground }]}>Start with something you can actually keep.</Text>
        <View style={styles.suggestions}>
          {[...PRIMARY_SUGGESTIONS, ...(showMoreSuggestions ? MORE_SUGGESTIONS : [])].map((s) => (
            <Pressable
              key={s}
              accessibilityRole="button"
              accessibilityLabel={s}
              accessibilityState={{ selected: name === s }}
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
              <Text style={[styles.chipText, { color: name === s ? readableAccentColor(selectedColor, colors.cardSolid) : colors.mutedForeground }]}>
                {s}
              </Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showMoreSuggestions ? 'Show fewer chain suggestions' : 'Show more chain suggestions'}
            accessibilityState={{ expanded: showMoreSuggestions }}
            onPress={() => setShowMoreSuggestions((visible) => !visible)}
            style={({ pressed }) => [
              styles.suggestionExpand,
              { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name={showMoreSuggestions ? 'chevron-up' : 'chevron-down'} size={17} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Color picker */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>RHYTHM</Text>
        <View style={styles.cadenceRow}>
          <Pressable accessibilityRole="radio" accessibilityLabel="Daily Chain" accessibilityState={{ checked: cadence === 'daily' }} onPress={() => setCadence('daily')} style={[styles.cadenceCard, { backgroundColor: cadence === 'daily' ? selectedColor + '18' : colors.card, borderColor: cadence === 'daily' ? selectedColor : colors.border }]}><Ionicons name="today-outline" size={18} color={cadence === 'daily' ? readableAccentColor(selectedColor, colors.cardSolid) : colors.mutedForeground} /><View style={styles.cadenceCopy}><Text style={[styles.cadenceTitle, { color: colors.foreground }]}>Daily</Text><Text style={[styles.cadenceBody, { color: colors.mutedForeground }]}>Build a daily streak.</Text></View></Pressable>
          <Pressable accessibilityRole="radio" accessibilityLabel="Weekly goal Chain" accessibilityState={{ checked: cadence === 'weekly' }} onPress={() => setCadence('weekly')} style={[styles.cadenceCard, { backgroundColor: cadence === 'weekly' ? selectedColor + '18' : colors.card, borderColor: cadence === 'weekly' ? selectedColor : colors.border }]}><Ionicons name="calendar-outline" size={18} color={cadence === 'weekly' ? readableAccentColor(selectedColor, colors.cardSolid) : colors.mutedForeground} /><View style={styles.cadenceCopy}><Text style={[styles.cadenceTitle, { color: colors.foreground }]}>Weekly goal</Text><Text style={[styles.cadenceBody, { color: colors.mutedForeground }]}>Complete a target each week.</Text></View></Pressable>
        </View>
        {cadence === 'weekly' && <Surface style={styles.targetCard}><View><Text style={[styles.targetTitle, { color: colors.foreground }]}>How many days?</Text><Text style={[styles.targetBody, { color: colors.mutedForeground }]}>Your streak grows when you reach this each week.</Text></View><SevenChoiceSelector options={WEEKLY_TARGET_OPTIONS} selectionMode="single" selectedValues={[weeklyTarget]} onSelectionChange={([target]) => { if (target) { setWeeklyTarget(target); playFeedback('selection'); } }} accentColor={selectedColor} selectedTextColor={readableTextColor(selectedColor)} textColor={colors.mutedForeground} borderColor={colors.border} backgroundColor={colors.background} accessibilityLabel="Weekly target" /></Surface>}

        <Text style={[styles.label, { color: colors.mutedForeground }]}>CHAIN COLOR</Text>
        <View style={styles.colorRow}>
          {[...CHAIN_COLORS, ...(showMoreColors ? EXTRA_CHAIN_COLORS : [])].map((c) => {
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
                  accessibilityRole="radio"
                  accessibilityLabel={`${CHAIN_COLOR_NAMES[c] || 'Custom'} Chain color`}
                  accessibilityState={{ checked: isSelected }}
                  onPress={() => {
                    setSelectedColor(c);
                    playFeedback('selection');
                  }}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: c },
                    isSelected && styles.colorSwatchSelected,
                  ]}
                >
                  {isSelected && <ChainSymbol name="check" size={17} color={readableTextColor(c)} />}
                </Pressable>
              </View>
            );
          })}
          <View style={[styles.swatchRing, { borderColor: colors.border, borderWidth: 2.5 }]}><Pressable accessibilityRole="button" accessibilityLabel={showMoreColors ? 'Show fewer Chain colors' : 'Show more Chain colors'} accessibilityState={{ expanded: showMoreColors }} onPress={() => setShowMoreColors((open) => !open)} style={[styles.colorSwatch, { backgroundColor: colors.card }]}><Ionicons name={showMoreColors ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} /></Pressable></View>
        </View>
        <View style={[styles.footer, { paddingBottom: botPad + SPACE.xl }]}>
          <AppButton
            label={isSubmitting ? 'Starting Chain…' : 'Start this Chain'}
            icon="link"
            accentColor={selectedColor}
            disabled={!name.trim()}
            busy={isSubmitting}
            onPress={handleCreate}
          />
        </View>
      </KeyboardAwareScrollViewCompat>
    </AmbientScreen>
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
  },
  headerTitle: TYPE.sectionTitle,
  body: {
    paddingHorizontal: CONTROL.screenHorizontal,
    gap: SPACE.sm,
    paddingBottom: SPACE.md,
  },
  previewCard: {
    flexDirection: 'row',
    borderRadius: RADIUS.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: SPACE.xs,
  },
  previewStripe: { width: 3 },
  previewContent: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 17,
    gap: SPACE.xxs,
  },
  previewName: TYPE.sectionTitle,
  previewMeta: TYPE.caption,
  previewCheck: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    alignSelf: 'center',
    marginRight: SPACE.md,
    overflow: 'hidden',
  },
  previewCheckInner: { flex: 1 },
  label: { ...TYPE.eyebrow, marginTop: SPACE.xxs },
  inputWrap: {
    borderRadius: RADIUS.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    padding: SPACE.md,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.xs,
  },
  quickStart: { ...TYPE.caption, marginTop: -SPACE.xs },
  chip: {
    minHeight: CONTROL.minimumTarget,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xs,
    borderRadius: RADIUS.capsule,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  suggestionExpand: {
    width: CONTROL.minimumTarget,
    height: CONTROL.minimumTarget,
    borderRadius: RADIUS.capsule,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_500Medium' },
  colorRow: {
    flexDirection: 'row',
    gap: SPACE.xs,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  cadenceRow: { flexDirection: 'row', gap: SPACE.xs },
  cadenceCard: { minHeight: 88, flex: 1, borderRadius: RADIUS.control, borderWidth: StyleSheet.hairlineWidth, padding: SPACE.sm, gap: SPACE.xs },
  cadenceCopy: { gap: SPACE.hairline },
  cadenceTitle: { fontSize: 14, lineHeight: 19, fontFamily: 'Inter_600SemiBold' },
  cadenceBody: TYPE.caption,
  targetCard: { borderRadius: RADIUS.control, borderWidth: StyleSheet.hairlineWidth, padding: SPACE.sm, gap: SPACE.sm },
  targetTitle: TYPE.bodyStrong,
  targetBody: { ...TYPE.caption, marginTop: SPACE.hairline },
  swatchRing: {
    borderRadius: RADIUS.capsule,
    padding: 3,
  },
  colorSwatch: {
    width: CONTROL.minimumTarget,
    height: CONTROL.minimumTarget,
    borderRadius: RADIUS.capsule,
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
  footer: { paddingTop: SPACE.md },
});
