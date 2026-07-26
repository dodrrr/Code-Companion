import React, { useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useChains, getTodayStr, getStreak } from '@/context/ChainsContext';
import { PlanItem, usePlan } from '@/context/PlanContext';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

function getTomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

const TIME_SLOTS = [
  '', '6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM',
  '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM',
  '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM', '10:00 PM',
];

export default function PlanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { chains, isCompletedToday } = useChains();
  const { items, addItem, removeItem, toggleItem } = usePlan();

  const [inputText, setInputText] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [showInput, setShowInput] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 84 : insets.bottom;

  function handleAdd() {
    if (!inputText.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addItem(inputText, selectedTime);
    setInputText('');
    setSelectedTime('');
  }

  function handleToggle(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleItem(id);
  }

  const today = getTodayStr();
  const completedToday = chains.filter((c) => c.completedDates.includes(today));
  const pendingToday = chains.filter((c) => !c.completedDates.includes(today));

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          Tonight's Plan
        </Text>
        <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
          {getTomorrowStr()}
        </Text>
      </View>

      <KeyboardAwareScrollViewCompat
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: botPad + 100 }]}
      >
        {/* Today's reflection */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          TODAY'S CHAINS
        </Text>

        {chains.length === 0 ? (
          <View style={[styles.emptySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No chains yet — add one on the Today tab
            </Text>
          </View>
        ) : (
          <View style={[styles.reflectCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {chains.map((chain, i) => {
              const done = chain.completedDates.includes(today);
              const streak = getStreak(chain);
              return (
                <View key={chain.id}>
                  <View style={styles.reflectRow}>
                    <View style={[styles.reflectDot, { backgroundColor: done ? chain.color : colors.border }]} />
                    <Text style={[styles.reflectName, { color: colors.foreground }]} numberOfLines={1}>
                      {chain.name}
                    </Text>
                    <Text style={[styles.reflectStreak, { color: done ? chain.color : colors.mutedForeground }]}>
                      {done ? `${streak}d` : 'pending'}
                    </Text>
                  </View>
                  {i < chains.length - 1 && (
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Tomorrow's plan */}
        <View style={styles.tomorrowHeader}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            TOMORROW'S FOCUS
          </Text>
          <Text style={[styles.itemCount, { color: colors.mutedForeground }]}>
            {items.length}/5
          </Text>
        </View>

        {items.map((item) => (
          <PlanItemRow
            key={item.id}
            item={item}
            onToggle={() => handleToggle(item.id)}
            onRemove={() => removeItem(item.id)}
          />
        ))}

        {items.length === 0 && (
          <View style={[styles.emptySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Block out 3–5 wins for tomorrow
            </Text>
          </View>
        )}

        {/* Add item section */}
        {items.length < 5 && (
          <View style={[styles.addCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {showInput ? (
              <>
                <TextInput
                  ref={inputRef}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="What needs to happen tomorrow?"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { color: colors.foreground }]}
                  returnKeyType="done"
                  onSubmitEditing={handleAdd}
                  autoFocus
                  multiline={false}
                />
                {/* Time slot quick-picks */}
                <FlatList
                  data={TIME_SLOTS.slice(1, 9)}
                  horizontal
                  keyExtractor={(t) => t}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.timeSlots}
                  renderItem={({ item: t }) => (
                    <Pressable
                      onPress={() => setSelectedTime(t === selectedTime ? '' : t)}
                      style={[
                        styles.timeChip,
                        {
                          backgroundColor:
                            t === selectedTime
                              ? colors.primary
                              : colors.background,
                          borderColor:
                            t === selectedTime ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.timeChipText,
                          {
                            color:
                              t === selectedTime
                                ? '#fff'
                                : colors.mutedForeground,
                          },
                        ]}
                      >
                        {t}
                      </Text>
                    </Pressable>
                  )}
                />
                <View style={styles.addActions}>
                  <Pressable
                    onPress={() => { setShowInput(false); setInputText(''); setSelectedTime(''); }}
                    style={styles.cancelBtn}
                  >
                    <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleAdd}
                    style={({ pressed }) => [
                      styles.addConfirmBtn,
                      { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
                    ]}
                  >
                    <Text style={styles.addConfirmText}>Add</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Pressable
                onPress={() => setShowInput(true)}
                style={styles.addTrigger}
              >
                <Ionicons name="add-circle" size={22} color={colors.primary} />
                <Text style={[styles.addTriggerText, { color: colors.mutedForeground }]}>
                  Add task for tomorrow
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function PlanItemRow({
  item,
  onToggle,
  onRemove,
}: {
  item: PlanItem;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.planItem,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Pressable onPress={onToggle} style={styles.planCheck}>
        <View
          style={[
            styles.planCheckCircle,
            {
              backgroundColor: item.completed ? colors.primary : 'transparent',
              borderColor: item.completed ? colors.primary : colors.border,
            },
          ]}
        >
          {item.completed && <Ionicons name="checkmark" size={13} color="#fff" />}
        </View>
      </Pressable>
      <View style={styles.planTextBlock}>
        {item.timeSlot ? (
          <Text style={[styles.planTime, { color: colors.primary }]}>
            {item.timeSlot}
          </Text>
        ) : null}
        <Text
          style={[
            styles.planText,
            {
              color: item.completed ? colors.mutedForeground : colors.foreground,
              textDecorationLine: item.completed ? 'line-through' : 'none',
            },
          ]}
          numberOfLines={2}
        >
          {item.text}
        </Text>
      </View>
      <Pressable onPress={onRemove} hitSlop={12}>
        <Ionicons name="close" size={18} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 3,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
  },
  headerSub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  scroll: {
    paddingHorizontal: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 4,
  },
  tomorrowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 8,
  },
  itemCount: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  reflectCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 4,
  },
  reflectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  reflectDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  reflectName: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  reflectStreak: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  divider: {
    height: 1,
    marginLeft: 38,
  },
  emptySection: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  planItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
    gap: 12,
  },
  planCheck: {
    padding: 2,
  },
  planCheckCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTextBlock: {
    flex: 1,
    gap: 2,
  },
  planTime: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  planText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  addCard: {
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 4,
    overflow: 'hidden',
  },
  addTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
  },
  addTriggerText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  input: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    padding: 16,
    paddingBottom: 8,
  },
  timeSlots: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  timeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  timeChipText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  addActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  cancelBtn: {
    padding: 8,
  },
  cancelText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  addConfirmBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  addConfirmText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
});
