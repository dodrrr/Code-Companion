import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Animated, FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { Ionicons as IconSource } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { canToggleGateWindowSkip, endGateWindowOnDemand, formatGateHour, formatGateWindowMinutes, GateWindow, gateDateKey, gateWindowDescriptor, gateWindowDisplayName, gateWindowNameKey, getGateWindowStatus, getGateWindowsSnapshot, isGateWindowNameTaken, nextAvailableGateWindowName, normalizeGateWindowName, removeGateWindow, saveGateWindows, startGateWindowOnDemand, syncGateWindowProgress, toggleGateWindowSkipToday } from '@/lib/gateWindows';
import { getProtectedAppsWeeklyUsage, isNativeScreenTimeAvailable, pickProtectedApps, ProtectedAppUsage } from '@/lib/screenTimeBridge';
import { AmbientScreen, GlassSurface } from '@/components/AmbientSurface';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { CONTROL, MOTION, OPACITY, RADIUS, SCRIM, SPACE, TYPE } from '@/constants/designSystem';
import { CLOCK_MINUTE_OPTIONS, isClockMinuteOption } from '@/constants/time';
import { readableAccentColor } from '@/constants/sectionTheme';
import { playFeedback } from '@/lib/feedback';
import { SevenChoiceSelector } from '@/components/ui/SevenChoiceSelector';

const Ionicons = IconSource as React.ComponentType<any>;

const DAY_OPTIONS = [
  { label: 'M', value: 1, accessibilityLabel: 'Monday' },
  { label: 'T', value: 2, accessibilityLabel: 'Tuesday' },
  { label: 'W', value: 3, accessibilityLabel: 'Wednesday' },
  { label: 'T', value: 4, accessibilityLabel: 'Thursday' },
  { label: 'F', value: 5, accessibilityLabel: 'Friday' },
  { label: 'S', value: 6, accessibilityLabel: 'Saturday' },
  { label: 'S', value: 0, accessibilityLabel: 'Sunday' },
] as const;
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const PRESETS = [{ name: 'Deep work', startHour: 9, endHour: 11, icon: 'laptop-outline' as const }, { name: 'Morning reset', startHour: 7, endHour: 9, icon: 'sunny-outline' as const }, { name: 'Wind down', startHour: 22, endHour: 0, icon: 'moon-outline' as const }];
const ICON_TARGET = { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' } as const;
const MIN_TARGET = { minHeight: 44, justifyContent: 'center' } as const;

function freshWindow(windows: readonly GateWindow[]): GateWindow { return { id: '', name: nextAvailableGateWindowName('Deep work', windows), startHour: 9, startMinute: 0, endHour: 11, endMinute: 0, days: [1, 2, 3, 4, 5], appIds: [], mode: 'scheduled', onDemandDurationMinutes: 60 }; }
const totalMinutes = (hour: number, minute: number) => hour * 60 + minute;

function nextScheduledStart(window: GateWindow, reference: Date) {
  if (window.mode === 'onDemand') return Number.POSITIVE_INFINITY;
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(
      reference.getFullYear(),
      reference.getMonth(),
      reference.getDate() + offset,
      window.startHour,
      window.startMinute,
      0,
      0,
    );
    if (!window.days.includes(candidate.getDay()) || candidate.getTime() <= reference.getTime()) continue;
    if (window.skippedOccurrenceDate === gateDateKey(candidate)) continue;
    return candidate.getTime();
  }
  return Number.POSITIVE_INFINITY;
}

function GateSwitcher({ active }: { active: 'pause' | 'windows' }) {
  const colors = useColors();
  return <View style={[styles.switcher, { borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, overflow: 'hidden', paddingHorizontal: 10 }]}>
    <GlassSurface pointerEvents="none" accentColor={colors.primary} style={StyleSheet.absoluteFill} />
    <Pressable onPress={() => active !== 'pause' && router.replace('/(tabs)/gate')} style={styles.switchTab}><Text style={[styles.switchText, { color: active === 'pause' ? colors.foreground : colors.mutedForeground }]}>Pause Gate</Text></Pressable>
    <View style={[styles.switchDivider, { backgroundColor: colors.border }]} />
    <Pressable disabled={active === 'windows'} style={styles.switchTab}><Text style={[styles.switchText, { color: active === 'windows' ? colors.foreground : colors.mutedForeground }]}>Windows</Text></Pressable>
  </View>;
}

function TimePicker({ visible, hour, minute, onConfirm, onClose }: { visible: boolean; hour: number; minute: number; onConfirm: (hour: number, minute: number) => void; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const accentText = readableAccentColor(colors.primary, colors.cardSolid);
  const [selectedHour, setSelectedHour] = useState(hour);
  const [selectedMinute, setSelectedMinute] = useState(minute);
  const selectedMinuteIsOnGrid = isClockMinuteOption(selectedMinute);
  useEffect(() => { if (visible) { setSelectedHour(hour); setSelectedMinute(minute); } }, [visible, hour, minute]);
  return <Modal transparent visible={visible} animationType={reducedMotion ? 'none' : 'slide'} statusBarTranslucent onRequestClose={onClose}>
    <View style={styles.shade} accessibilityViewIsModal>
      <Pressable accessibilityRole="button" accessibilityLabel="Close time picker" style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.timeSheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: Math.max(30, insets.bottom + 16) }]}>
        <View style={styles.sheetHeader}><Text style={[styles.sheetTitle, { color: colors.foreground }]}>Choose a time</Text><Pressable accessibilityRole="button" accessibilityLabel="Close time picker" onPress={onClose} style={ICON_TARGET}><Ionicons name="close" size={23} color={colors.mutedForeground} /></Pressable></View>
        <Text style={[styles.timePreview, { color: accentText }]}>{formatGateHour(selectedHour, selectedMinute)}</Text>
        <View style={styles.pickerColumns}>
          <View style={styles.pickerColumn}><Text style={[styles.pickerLabel, { color: colors.mutedForeground }]}>HOUR</Text><FlatList data={HOURS} showsVerticalScrollIndicator={false} keyExtractor={(value) => String(value)} style={styles.pickerList} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityState={{ selected: item === selectedHour }} accessibilityLabel={formatGateHour(item, 0)} onPress={() => setSelectedHour(item)} style={[styles.pickerValue, MIN_TARGET, { backgroundColor: item === selectedHour ? colors.primary + '22' : 'transparent' }]}><Text style={[styles.pickerValueText, { color: item === selectedHour ? accentText : colors.foreground }]}>{formatGateHour(item, 0).replace(':00', '')}</Text></Pressable>} /></View>
          <View style={styles.pickerColumn}><Text style={[styles.pickerLabel, { color: colors.mutedForeground }]}>MINUTE</Text><FlatList data={CLOCK_MINUTE_OPTIONS} showsVerticalScrollIndicator={false} keyExtractor={(value) => String(value)} style={styles.pickerList} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityState={{ selected: item === selectedMinute }} accessibilityLabel={`${item} minutes`} onPress={() => setSelectedMinute(item)} style={[styles.pickerValue, MIN_TARGET, { backgroundColor: item === selectedMinute ? colors.primary + '22' : 'transparent' }]}><Text style={[styles.pickerValueText, { color: item === selectedMinute ? accentText : colors.foreground }]}>{String(item).padStart(2, '0')}</Text></Pressable>} /></View>
        </View>
        {!selectedMinuteIsOnGrid && <Text accessibilityLiveRegion="polite" style={[styles.legacyMinuteNote, { color: colors.mutedForeground }]}>{formatGateHour(hour, minute)} remains unchanged. Choose a 5-minute time to change it.</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel={selectedMinuteIsOnGrid ? 'Use selected time' : 'Choose a five-minute value to change this time'} accessibilityState={{ disabled: !selectedMinuteIsOnGrid }} disabled={!selectedMinuteIsOnGrid} onPress={() => onConfirm(selectedHour, selectedMinute)} style={[styles.confirmTime, MIN_TARGET, { backgroundColor: colors.primary, opacity: selectedMinuteIsOnGrid ? 1 : OPACITY.disabled }]}><Text style={[styles.confirmTimeText, { color: colors.primaryForeground }]}>{selectedMinuteIsOnGrid ? 'Use this time' : 'Choose a 5-minute time'}</Text></Pressable>
      </View>
    </View>
  </Modal>;
}

function WindowEditor({ initial, existingWindows, onSave, onDelete, onClose }: { initial?: GateWindow; existingWindows: readonly GateWindow[]; onSave: (window: GateWindow) => Promise<boolean>; onDelete?: () => void; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const accentText = readableAccentColor(colors.primary, colors.cardSolid);
  const [window, setWindow] = useState<GateWindow>(() => initial || freshWindow(existingWindows));
  const [picker, setPicker] = useState<'start' | 'end' | null>(null);
  const [saving, setSaving] = useState(false);
  const create = !initial;
  const scheduled = window.mode !== 'onDemand';
  const normalizedName = normalizeGateWindowName(window.name);
  const nameForSave = initial && window.name === initial.name ? initial.name : normalizedName;
  const canonicalNameChanged = !initial || gateWindowNameKey(window.name) !== gateWindowNameKey(initial.name);
  const duplicateName = Boolean(normalizedName) && canonicalNameChanged
    && isGateWindowNameTaken(window.name, existingWindows, initial?.id);
  const canSave = normalizedName.length > 0 && !duplicateName && (!scheduled || (window.days.length > 0 && totalMinutes(window.endHour, window.endMinute) !== totalMinutes(window.startHour, window.startMinute)));
  const changeMode = (mode: 'scheduled' | 'onDemand') => setWindow((value) => {
    const clean = {
      ...value,
      mode,
      manualActive: undefined,
      manualDate: undefined,
      manualActivatedAt: undefined,
      manualEndedAt: undefined,
      manualSessionBaselineByDate: undefined,
      skippedOccurrenceDate: undefined,
    };
    return mode === 'scheduled'
      ? { ...clean, days: value.days.length ? value.days : [1, 2, 3, 4, 5], onDemandDurationMinutes: undefined }
      : { ...clean, days: [], onDemandDurationMinutes: value.mode === 'onDemand' ? value.onDemandDurationMinutes : 60 };
  });
  const updateTime = (kind: 'start' | 'end', hour: number, minute: number) => { setWindow((value) => kind === 'start' ? { ...value, startHour: hour, startMinute: minute } : { ...value, endHour: hour, endMinute: minute }); setPicker(null); };
  const submit = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await onSave({ ...window, name: nameForSave, id: window.id || `${Date.now()}${Math.random().toString(36).slice(2, 7)}` });
    } catch {
      // The parent presents calm persistence feedback and keeps the editor open.
    } finally {
      setSaving(false);
    }
  };
  const chooseApps = async () => {
    const selected = await pickProtectedApps();
    if (!selected) {
      Alert.alert('Native app picker', 'When Chain is installed as an iOS development build, this button opens Apple’s private app picker. You choose the apps yourself; Chain never scans or lists your installed apps.');
      return;
    }
    setWindow((value) => ({ ...value, appIds: selected.map((app) => app.id) }));
  };
  return <Modal transparent animationType={reducedMotion ? 'none' : 'slide'} statusBarTranslucent onRequestClose={onClose}><View style={styles.shade} accessibilityViewIsModal><View style={[styles.editor, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: Math.max(16, insets.bottom + 8) }]}><KeyboardAwareScrollViewCompat contentContainerStyle={styles.editorScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bottomOffset={insets.bottom + 20}><View style={styles.editorHeader}><View style={{ flex: 1, minWidth: 0, paddingRight: 10 }}><Text style={[styles.editorEyebrow, { color: accentText }]}>{create ? 'NEW WINDOW' : 'EDIT WINDOW'}</Text><Text numberOfLines={2} style={[styles.editorTitle, { color: colors.foreground }]}>{create ? 'Plan a focused part of your day' : 'Tune this window'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close window editor" onPress={onClose} style={ICON_TARGET}><Ionicons name="close" size={24} color={colors.mutedForeground} /></Pressable></View>
    {create && <View style={styles.presets}>{PRESETS.map((preset) => { const availableName = nextAvailableGateWindowName(preset.name, existingWindows); const selected = gateWindowNameKey(window.name) === gateWindowNameKey(availableName); return <Pressable key={preset.name} accessibilityRole="button" accessibilityLabel={`Use ${preset.name} preset`} accessibilityState={{ selected }} onPress={() => setWindow((value) => ({ ...value, name: availableName, startHour: preset.startHour, startMinute: 0, endHour: preset.endHour, endMinute: 0 }))} style={[styles.preset, MIN_TARGET, { backgroundColor: selected ? colors.primary + '1A' : colors.background, borderColor: selected ? colors.primary : colors.border }]}><Ionicons name={preset.icon} size={14} color={selected ? colors.primary : colors.mutedForeground} /><Text style={[styles.presetText, { color: selected ? colors.foreground : colors.mutedForeground }]}>{preset.name}</Text></Pressable>; })}</View>}
    <TextInput accessibilityLabel="Window name" value={window.name} onChangeText={(name) => setWindow((value) => ({ ...value, name }))} placeholder="Name this window" placeholderTextColor={colors.mutedForeground} style={[styles.nameInput, { color: colors.foreground, borderColor: duplicateName ? colors.destructive : colors.border, backgroundColor: colors.background }]} />
    {duplicateName && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.validationText, { color: colors.destructive }]}>Another Window already uses this name. Choose a unique name.</Text>}
    <Text style={[styles.label, { color: colors.mutedForeground }]}>WINDOW TYPE</Text><View style={styles.modeRow}><Pressable accessibilityRole="button" accessibilityState={{ selected: scheduled }} accessibilityLabel="Scheduled window" onPress={() => changeMode('scheduled')} style={[styles.modeChoice, MIN_TARGET, { backgroundColor: scheduled ? colors.primary + '18' : colors.background, borderColor: scheduled ? colors.primary : colors.border }]}><Ionicons name="calendar-outline" size={17} color={scheduled ? colors.primary : colors.mutedForeground} /><View style={{ flex: 1 }}><Text style={[styles.modeTitle, { color: colors.foreground }]}>Scheduled</Text><Text style={[styles.modeBody, { color: colors.mutedForeground }]}>Follows your routine.</Text></View></Pressable><Pressable accessibilityRole="button" accessibilityState={{ selected: !scheduled }} accessibilityLabel="On-demand window" onPress={() => changeMode('onDemand')} style={[styles.modeChoice, MIN_TARGET, { backgroundColor: !scheduled ? colors.primary + '18' : colors.background, borderColor: !scheduled ? colors.primary : colors.border }]}><Ionicons name="play-outline" size={17} color={!scheduled ? colors.primary : colors.mutedForeground} /><View style={{ flex: 1 }}><Text style={[styles.modeTitle, { color: colors.foreground }]}>On demand</Text><Text style={[styles.modeBody, { color: colors.mutedForeground }]}>Start it when ready.</Text></View></Pressable></View>
    {scheduled ? <>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>WHEN</Text>
      <View style={styles.timeRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Start time, ${formatGateHour(window.startHour, window.startMinute)}`} onPress={() => setPicker('start')} style={[styles.timeChoice, { backgroundColor: colors.background, borderColor: colors.border }]}><Text style={[styles.timeLabel, { color: colors.mutedForeground }]}>START</Text><Text style={[styles.timeChoiceText, { color: colors.foreground }]}>{formatGateHour(window.startHour, window.startMinute)}</Text><Ionicons name="chevron-down" size={14} color={colors.primary} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`End time, ${formatGateHour(window.endHour, window.endMinute)}`} onPress={() => setPicker('end')} style={[styles.timeChoice, { backgroundColor: colors.background, borderColor: colors.border }]}><Text style={[styles.timeLabel, { color: colors.mutedForeground }]}>END</Text><Text style={[styles.timeChoiceText, { color: colors.foreground }]}>{formatGateHour(window.endHour, window.endMinute)}</Text><Ionicons name="chevron-down" size={14} color={colors.primary} /></Pressable>
      </View>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>REPEAT</Text>
      <SevenChoiceSelector options={DAY_OPTIONS} selectionMode="multiple" selectedValues={window.days} onSelectionChange={(days) => setWindow((value) => ({ ...value, days }))} accentColor={colors.primary} selectedTextColor={colors.primaryForeground} textColor={colors.mutedForeground} borderColor={colors.border} backgroundColor={colors.background} accessibilityLabel="Repeat days" />
      {!window.days.length && <Text accessibilityRole="alert" style={[styles.validationText, { color: colors.destructive }]}>Choose at least one day.</Text>}
    </> : <>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>SESSION LENGTH</Text>
      <View style={styles.durationRow}>{[30, 60, 90, 120].map((duration) => { const selected = window.onDemandDurationMinutes === duration; return <Pressable key={duration} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${formatGateWindowMinutes(duration)} session`} onPress={() => setWindow((value) => ({ ...value, onDemandDurationMinutes: duration }))} style={[styles.durationChoice, MIN_TARGET, { backgroundColor: selected ? colors.primary : colors.background, borderColor: selected ? colors.primary : colors.border }]}><Text style={[styles.durationText, { color: selected ? colors.primaryForeground : colors.mutedForeground }]}>{formatGateWindowMinutes(duration)}</Text></Pressable>; })}</View>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: window.onDemandDurationMinutes === null }} accessibilityLabel="Until I finish" onPress={() => setWindow((value) => ({ ...value, onDemandDurationMinutes: null }))} style={[styles.openEndedChoice, { backgroundColor: window.onDemandDurationMinutes === null ? colors.primary + '18' : colors.background, borderColor: window.onDemandDurationMinutes === null ? colors.primary : colors.border }]}><Ionicons name="infinite-outline" size={18} color={window.onDemandDurationMinutes === null ? colors.primary : colors.mutedForeground} /><View style={{ flex: 1 }}><Text style={[styles.openEndedTitle, { color: colors.foreground }]}>Until I finish</Text><Text style={[styles.openEndedBody, { color: colors.mutedForeground }]}>No countdown — end the session when your work is done.</Text></View><Ionicons name={window.onDemandDurationMinutes === null ? 'checkmark-circle' : 'chevron-forward'} size={18} color={window.onDemandDurationMinutes === null ? colors.primary : colors.mutedForeground} /></Pressable>
    </>}
    <Text style={[styles.label, { color: colors.mutedForeground }]}>APPS FOR THIS WINDOW</Text><Pressable accessibilityRole="button" accessibilityLabel={window.appIds.length ? `Change ${window.appIds.length} selected apps` : 'Choose apps from your iPhone'} onPress={chooseApps} style={[styles.nativePicker, { backgroundColor: window.appIds.length ? colors.primary + '14' : colors.background, borderColor: window.appIds.length ? colors.primary : colors.border }]}><View style={[styles.nativePickerIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name="apps-outline" size={18} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.openEndedTitle, { color: colors.foreground }]}>{window.appIds.length ? `${window.appIds.length} app${window.appIds.length === 1 ? '' : 's'} selected` : 'Choose apps from your iPhone'}</Text><Text style={[styles.openEndedBody, { color: colors.mutedForeground }]}>{window.appIds.length ? 'Tap to change the apps assigned to this window.' : 'Uses Apple’s private selector in a native build.'}</Text></View><Ionicons name={window.appIds.length ? 'checkmark-circle' : 'chevron-forward'} size={19} color={colors.primary} /></Pressable>
    <Pressable accessibilityRole="switch" accessibilityLabel="Pair this window with an iOS Focus" accessibilityState={{ checked: window.silenceNotifications === true }} onPress={() => setWindow((value) => ({ ...value, silenceNotifications: !value.silenceNotifications }))} style={[styles.focusChoice, { backgroundColor: window.silenceNotifications ? colors.primary + '14' : colors.background, borderColor: window.silenceNotifications ? colors.primary : colors.border }]}><View style={[styles.focusChoiceIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name="notifications-off-outline" size={18} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.openEndedTitle, { color: colors.foreground }]}>Pair an iOS Focus</Text><Text style={[styles.openEndedBody, { color: colors.mutedForeground }]}>Mark this window as paired with a matching Focus or Shortcut.</Text></View><Ionicons name={window.silenceNotifications ? 'checkmark-circle' : 'ellipse-outline'} size={19} color={window.silenceNotifications ? colors.primary : colors.mutedForeground} /></Pressable>
    <Text style={[styles.note, { color: colors.mutedForeground }]}>{scheduled ? 'Use Skip on a saved window to pause only its next occurrence. Its schedule stays unchanged.' : 'This stays saved as a preset. Start it deliberately whenever you want a focused session.'} {window.silenceNotifications ? 'Use the matching iOS Focus or Shortcut to silence notifications.' : 'Native app protection is not connected yet; this window currently runs only inside Chain.'}</Text>
    {!create && onDelete && <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${window.name}`} onPress={onDelete} style={({ pressed }) => [styles.deleteWindow, MIN_TARGET, { backgroundColor: '#FF453A0F', borderColor: '#FF453A55', opacity: pressed ? 0.68 : 1 }]}><Ionicons name="trash-outline" size={17} color="#FF453A" /><View style={{ flex: 1 }}><Text style={styles.deleteWindowTitle}>Delete this window</Text><Text style={[styles.deleteWindowBody, { color: colors.mutedForeground }]}>Remove this window from Gate.</Text></View></Pressable>}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canSave || saving, busy: saving }} disabled={!canSave || saving} onPress={() => { void submit(); }} style={[styles.save, MIN_TARGET, { backgroundColor: colors.primary, opacity: canSave && !saving ? 1 : 0.45 }]}><Text style={[styles.saveText, { color: colors.primaryForeground }]}>{saving ? 'Saving…' : create ? 'Create window' : 'Save changes'}</Text></Pressable></KeyboardAwareScrollViewCompat>
  </View><TimePicker visible={picker !== null} hour={picker === 'end' ? window.endHour : window.startHour} minute={picker === 'end' ? window.endMinute : window.startMinute} onConfirm={(hour, minute) => updateTime(picker || 'start', hour, minute)} onClose={() => setPicker(null)} /></View></Modal>;
}

function ProtectedUsageSheet({ appIds, onClose }: { appIds: string[]; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const accentText = readableAccentColor(colors.primary, colors.cardSolid);
  const [nativeReady, setNativeReady] = useState(false);
  const [usage, setUsage] = useState<ProtectedAppUsage[] | undefined>();
  const appIdsRef = useRef(appIds);
  appIdsRef.current = appIds;
  const selectionKey = appIds.join('\u001f');
  useEffect(() => {
    let active = true;
    const requestedIds = [...appIdsRef.current];
    void isNativeScreenTimeAvailable().then((available) => { if (active) setNativeReady(available); }).catch(() => { if (active) setNativeReady(false); });
    void getProtectedAppsWeeklyUsage(requestedIds).then((result) => { if (active) setUsage(result); }).catch(() => { if (active) setUsage([]); });
    return () => { active = false; };
  }, [selectionKey]);
  const total = usage?.reduce((sum, app) => sum + app.minutes, 0) ?? 0;
  const format = (minutes: number) => minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
  return <Modal transparent animationType={reducedMotion ? 'none' : 'slide'} statusBarTranslucent onRequestClose={onClose}><View style={styles.shade} accessibilityViewIsModal><View style={[styles.usageSheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: Math.max(30, insets.bottom + 16) }]}><View style={styles.sheetHeader}><View style={styles.sheetHeading}><Text style={[styles.editorEyebrow, { color: accentText }]}>WEEKLY SCREEN TIME</Text><Text style={[styles.sheetTitle, { color: colors.foreground }]}>Selected apps</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close weekly Screen Time" onPress={onClose} style={ICON_TARGET}><Ionicons name="close" size={23} color={colors.mutedForeground} /></Pressable></View><ScrollView style={styles.usageScroll} contentContainerStyle={styles.usageScrollContent} showsVerticalScrollIndicator={false}>{nativeReady ? <><Text style={[styles.usageTotal, { color: accentText }]}>{format(total)}</Text><Text style={[styles.usageLead, { color: colors.foreground }]}>used across your selected apps.</Text>{usage?.map((app) => <View key={app.id} style={[styles.usageApp, { borderColor: colors.border }]}><Text style={[styles.usageAppName, { color: colors.foreground }]}>{app.label}</Text><Text style={[styles.usageAppMinutes, { color: accentText }]}>{format(app.minutes)}</Text></View>)}</> : <><View style={[styles.usageIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name="chart-bar-outline" size={25} color={accentText} /></View><Text style={[styles.usageLead, { color: colors.foreground }]}>Screen Time isn’t connected yet.</Text><Text style={[styles.usageBody, { color: colors.mutedForeground }]}>This weekly view is wired for Apple Screen Time. In a native build it will use your private selection and show a short, honest report — not a feed of every app on your phone.</Text><Text style={[styles.usageQuote, { color: accentText }]}>Less time pulled away is time you can put somewhere you care about.</Text></>}</ScrollView><Pressable accessibilityRole="button" accessibilityLabel="Close weekly Screen Time" onPress={onClose} style={[styles.usageDone, MIN_TARGET, { backgroundColor: colors.primary }]}><Text style={[styles.confirmTimeText, { color: colors.primaryForeground }]}>Done</Text></Pressable></View></View></Modal>;
}

export function GateWindowsContent({ embedded = false, live = true, onWindowsChange }: { embedded?: boolean; live?: boolean; onWindowsChange?: (count: number) => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { width: viewportWidth, fontScale } = useWindowDimensions();
  const accentText = readableAccentColor(colors.primary, colors.cardSolid);
  const [windows, setWindows] = useState<GateWindow[]>([]);
  const [editing, setEditing] = useState<GateWindow | undefined>();
  const [creating, setCreating] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [menuWindowId, setMenuWindowId] = useState<string>();
  const [screenTimeReady, setScreenTimeReady] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [toggledWindowId, setToggledWindowId] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [notice, setNotice] = useState<{ message: string; tone: 'error' | 'info' }>();
  const windowsRef = useRef<GateWindow[]>([]);
  const onWindowsChangeRef = useRef(onWindowsChange);
  const userSavingRef = useRef(false);
  const backgroundSaveRef = useRef<Promise<void> | null>(null);
  const loadStateRef = useRef<'loading' | 'ready' | 'failed'>('loading');
  const noticeMessageRef = useRef<string | undefined>(undefined);
  const toggleScale = useRef(new Animated.Value(1)).current;
  onWindowsChangeRef.current = onWindowsChange;

  const applyWindows = (next: GateWindow[], notifyCount = false) => {
    windowsRef.current = next;
    setWindows(next);
    if (notifyCount) onWindowsChangeRef.current?.(next.length);
  };
  const presentNotice = (message: string, tone: 'error' | 'info' = 'error') => {
    setNotice({ message, tone });
    if (noticeMessageRef.current !== message) {
      noticeMessageRef.current = message;
      void AccessibilityInfo.announceForAccessibility(message);
    }
  };
  const clearNotice = () => {
    noticeMessageRef.current = undefined;
    setNotice(undefined);
  };
  const persistenceFailure = () => presentNotice('Chain couldn’t save that change. Your previous windows are still here.');
  const topPad = embedded ? 0 : Platform.OS === 'web' ? 50 : insets.top + 8;

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const snapshot = await getGateWindowsSnapshot();
      if (!mounted) return;
      loadStateRef.current = snapshot.status;
      setLoadState(snapshot.status);
      if (snapshot.status === 'failed') {
        applyWindows(snapshot.windows, true);
        presentNotice('Chain couldn’t safely read your Windows. Editing is paused so stored data cannot be overwritten.');
        return;
      }
      const saved = snapshot.windows;
      const synced = syncGateWindowProgress(saved);
      if (synced !== saved) {
        try {
          await saveGateWindows(synced);
        } catch {
          if (mounted) persistenceFailure();
          if (mounted) applyWindows(saved, true);
          return;
        }
      }
      if (mounted) applyWindows(synced, true);
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    void isNativeScreenTimeAvailable()
      .then((available) => { if (mounted) setScreenTimeReady(available); })
      .catch(() => { if (mounted) setScreenTimeReady(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!live) return;
    const refresh = () => {
      const tick = new Date();
      setNow(tick);
      if (loadStateRef.current !== 'ready' || userSavingRef.current || backgroundSaveRef.current) return;
      const current = windowsRef.current;
      const next = syncGateWindowProgress(current, tick);
      if (next === current) return;
      const pending = saveGateWindows(next);
      backgroundSaveRef.current = pending;
      void pending.then(() => {
        if (windowsRef.current === current) applyWindows(next);
      }).catch(persistenceFailure).finally(() => {
        if (backgroundSaveRef.current === pending) backgroundSaveRef.current = null;
      });
    };
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => clearInterval(timer);
  }, [live]);

  const commitWindows = async (transform: (current: GateWindow[]) => GateWindow[]) => {
    if (loadStateRef.current !== 'ready') {
      presentNotice('Editing stays paused until Chain can safely read your saved Windows.');
      return false;
    }
    if (userSavingRef.current) return false;
    userSavingRef.current = true;
    setSaving(true);
    try {
      if (backgroundSaveRef.current) await backgroundSaveRef.current.catch(() => undefined);
      const current = windowsRef.current;
      const next = transform(current);
      if (next === current) return false;
      await saveGateWindows(next);
      applyWindows(next, true);
      clearNotice();
      return true;
    } catch {
      persistenceFailure();
      return false;
    } finally {
      userSavingRef.current = false;
      setSaving(false);
    }
  };
  const save = async (window: GateWindow) => {
    const currentWindow = windowsRef.current.find((item) => item.id === window.id);
    const isNewOrRenamed = !currentWindow
      || gateWindowNameKey(currentWindow.name) !== gateWindowNameKey(window.name);
    if (isNewOrRenamed && isGateWindowNameTaken(window.name, windowsRef.current, window.id)) {
      presentNotice('Another Window already uses this name. Choose a unique name.');
      return false;
    }
    const saved = await commitWindows((current) => {
      const next = current.some((item) => item.id === window.id)
        ? current.map((item) => item.id === window.id ? window : item)
        : [...current, window];
      return syncGateWindowProgress(next, new Date());
    });
    if (saved) {
      setEditing(undefined);
      setCreating(false);
    }
    return saved;
  };
  const remove = (window: GateWindow) => Alert.alert('Delete window?', `${window.name} will be removed from Gate. This cannot be undone.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { void (async () => {
      const saved = await commitWindows((current) => removeGateWindow(current, window.id));
      if (!saved) return;
      setEditing(undefined);
      setCreating(false);
      playFeedback('success');
    })(); } },
  ]);
  const animateWindow = (window: GateWindow) => {
    playFeedback('light');
    if (reducedMotion) return;
    setToggledWindowId(window.id);
    Animated.sequence([
      Animated.timing(toggleScale, { toValue: 0.985, duration: MOTION.pressIn, useNativeDriver: true }),
      Animated.spring(toggleScale, { toValue: 1, ...MOTION.spring, useNativeDriver: true }),
    ]).start(() => setToggledWindowId(undefined));
  };
  const toggleSkipToday = async (window: GateWindow) => {
    const actionDate = new Date();
    if (!canToggleGateWindowSkip(window, actionDate)) {
      presentNotice('This occurrence is already complete. Its schedule stays unchanged.', 'info');
      return;
    }
    const saved = await commitWindows((current) => current.map((item) => item.id === window.id ? toggleGateWindowSkipToday(item, actionDate) : item));
    if (saved) { setNow(actionDate); animateWindow(window); }
  };
  const startOnDemand = async (window: GateWindow) => {
    const actionDate = new Date();
    const runningWindow = windowsRef.current.find((item) => item.id !== window.id && item.mode === 'onDemand' && getGateWindowStatus(item, actionDate).active);
    if (runningWindow) {
      presentNotice(`End ${runningWindow.name} before starting another on-demand window.`, 'info');
      return;
    }
    const saved = await commitWindows((current) => current.map((item) => item.id === window.id ? startGateWindowOnDemand(item, actionDate) : item));
    if (saved) { setNow(actionDate); animateWindow(window); }
  };
  const endOnDemand = async (window: GateWindow) => {
    const actionDate = new Date();
    const saved = await commitWindows((current) => current.map((item) => item.id === window.id ? endGateWindowOnDemand(item, actionDate) : item));
    if (saved) { setNow(actionDate); animateWindow(window); }
  };
  const statuses = windows.map((window) => ({ window, status: getGateWindowStatus(window, now) }));
  const active = statuses.filter(({ status }) => status.active);
  const formatMinutes = (minutes: number) => minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes}m`;
  const formatCountdown = (seconds: number) => seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m` : seconds >= 60 ? `${Math.ceil(seconds / 60)}m` : `${seconds}s`;
  const selectedAppSignature = Array.from(new Set(windows.flatMap((window) => window.appIds))).sort().join('\u001f');
  const selectedAppIds = useMemo(() => selectedAppSignature ? selectedAppSignature.split('\u001f') : [], [selectedAppSignature]);
  const mutationsBlocked = saving || loadState !== 'ready';
  const nextScheduled = active.length ? undefined : statuses
    .map((entry) => ({ entry, startsAt: nextScheduledStart(entry.window, now) }))
    .filter(({ startsAt }) => Number.isFinite(startsAt))
    .sort((left, right) => left.startsAt - right.startsAt)[0]?.entry;
  const featured = active.length ? active : nextScheduled ? [nextScheduled] : [];
  const featuredIds = new Set(featured.map(({ window }) => window.id));
  const saved = statuses.filter(({ window }) => !featuredIds.has(window.id));
  const compactGrid = viewportWidth < 370 || fontScale > 1.15;
  const tileWidth = compactGrid
    ? '100%' as const
    : Math.max(150, (viewportWidth - CONTROL.screenHorizontal * 2 - SPACE.sm) / 2);
  const menuEntry = menuWindowId ? statuses.find(({ window }) => window.id === menuWindowId) : undefined;

  const describeWindow = ({ window, status }: typeof statuses[number]) => {
    const onDemand = window.mode === 'onDemand';
    if (status.active) {
      return status.unbounded
        ? `On demand · ${formatMinutes(Math.floor(status.elapsedSeconds / 60))} elapsed`
        : `${status.manual ? 'On demand' : 'Active now'} · ${formatCountdown(status.remainingSeconds)} left`;
    }
    if (status.completedToday && onDemand) {
      return `Finished today · ${formatMinutes(window.protectedMinutesByDate?.[gateDateKey(now)] ?? 0)} recorded`;
    }
    if (status.skippedToday) return `Skipped today · ${gateWindowDescriptor(window)}`;
    return gateWindowDescriptor(window);
  };

  const renderWindowCard = (entry: typeof statuses[number], featuredCard: boolean) => {
    const { window, status } = entry;
    const onDemand = window.mode === 'onDemand';
    const displayName = gateWindowDisplayName(window, windows);
    const description = describeWindow(entry);
    const appCount = window.appIds.length
      ? `${window.appIds.length} app${window.appIds.length === 1 ? '' : 's'}`
      : 'No apps yet';
    const stateLabel = status.active ? 'ACTIVE NOW' : featuredCard ? 'UP NEXT' : status.skippedToday ? 'SKIPPED' : '';
    const accessibilityStateLabel = status.active
      ? 'active now'
      : featuredCard
        ? 'up next'
        : status.skippedToday
          ? 'skipped today'
          : status.completedToday
            ? onDemand ? 'finished today' : 'schedule ended today'
            : onDemand
              ? 'on demand'
              : 'scheduled';
    const showStateLabel = stateLabel.length > 0;
    const icon = status.active ? 'timer' : onDemand ? 'play-outline' : status.skippedToday ? 'pause-outline' : 'calendar-outline';
    const stateColor = status.skippedToday || status.completedToday ? colors.mutedForeground : accentText;
    return <Animated.View
      key={window.id}
      style={[
        styles.windowCardWrap,
        { width: featuredCard ? '100%' : tileWidth },
        toggledWindowId === window.id ? { transform: [{ scale: toggleScale }] } : undefined,
      ]}
    >
      <GlassSurface
        elevated={featuredCard}
        accentColor={status.active || featuredCard ? colors.primary : undefined}
        style={[
          styles.windowCard,
          featuredCard ? styles.featuredWindowCard : styles.savedWindowCard,
          {
            backgroundColor: status.active ? colors.primary + '16' : colors.card,
            borderColor: status.active ? colors.primary : featuredCard ? colors.primary + '66' : colors.border,
          },
        ]}
      >
        <View style={styles.windowCardTop}>
          <View style={[styles.windowTileIcon, { backgroundColor: status.active ? colors.primary + '2B' : colors.primary + '18' }]}>
            <Ionicons name={icon} size={20} color={accentText} />
          </View>
          {showStateLabel
            ? <Text numberOfLines={1} style={[styles.windowState, { color: stateColor }]}>{stateLabel}</Text>
            : <View accessible={false} style={styles.windowStateSpacer} />}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`More actions for ${displayName}`}
            accessibilityHint="Opens edit and window controls"
            onPress={() => { playFeedback('selection'); setMenuWindowId(window.id); }}
            style={({ pressed }) => [styles.windowMenuButton, { backgroundColor: pressed ? colors.primary + '1A' : 'transparent' }]}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${displayName}. ${accessibilityStateLabel}. ${description}. ${appCount}`}
          accessibilityHint="Opens the window editor"
          accessibilityState={{ disabled: mutationsBlocked, busy: saving }}
          disabled={mutationsBlocked}
          onPress={() => setEditing(window)}
          style={({ pressed }) => [styles.windowCardDetails, { opacity: mutationsBlocked ? OPACITY.disabled : pressed ? OPACITY.pressed : 1 }]}
        >
          <Text numberOfLines={featuredCard ? 2 : 2} style={[styles.windowTileName, featuredCard && styles.featuredWindowName, { color: colors.foreground }]}>{displayName}</Text>
          <Text numberOfLines={featuredCard ? 2 : 3} style={[styles.windowTileDescriptor, { color: status.skippedToday ? colors.mutedForeground : accentText }]}>{description}</Text>
          <View style={styles.windowTileMeta}>
            <Ionicons name="apps-outline" size={14} color={colors.mutedForeground} />
            <Text numberOfLines={1} style={[styles.windowTileMetaText, { color: colors.mutedForeground }]}>{appCount}</Text>
          </View>
        </Pressable>
      </GlassSurface>
    </Animated.View>;
  };

  return <View style={[styles.root, { backgroundColor: 'transparent', paddingTop: topPad }]}>{(creating || editing) && <WindowEditor initial={editing} existingWindows={windows} onSave={save} onDelete={editing ? () => remove(editing) : undefined} onClose={() => { setCreating(false); setEditing(undefined); }} />}{showUsage && <ProtectedUsageSheet appIds={selectedAppIds} onClose={() => setShowUsage(false)} />}
    {menuEntry && <Modal transparent animationType={reducedMotion ? 'none' : 'slide'} statusBarTranslucent onRequestClose={() => setMenuWindowId(undefined)}>
      <View style={styles.shade} accessibilityViewIsModal>
        <Pressable accessibilityRole="button" accessibilityLabel="Close window actions" style={StyleSheet.absoluteFill} onPress={() => setMenuWindowId(undefined)} />
        <View style={[styles.actionSheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: Math.max(SPACE.md, insets.bottom + SPACE.xs) }]}>
          <View style={styles.actionSheetHeading}>
            <View style={[styles.actionSheetIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name={menuEntry.status.active ? 'timer' : menuEntry.window.mode === 'onDemand' ? 'play-outline' : 'calendar-outline'} size={20} color={accentText} /></View>
            <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={[styles.actionSheetTitle, { color: colors.foreground }]}>{gateWindowDisplayName(menuEntry.window, windows)}</Text><Text numberOfLines={2} style={[styles.actionSheetDescriptor, { color: colors.mutedForeground }]}>{describeWindow(menuEntry)}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close window actions" onPress={() => setMenuWindowId(undefined)} style={ICON_TARGET}><Ionicons name="close" size={22} color={colors.mutedForeground} /></Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${menuEntry.window.name}`} accessibilityState={{ disabled: mutationsBlocked }} disabled={mutationsBlocked} onPress={() => { const target = menuEntry.window; setMenuWindowId(undefined); setEditing(target); }} style={({ pressed }) => [styles.actionRow, { opacity: mutationsBlocked ? OPACITY.disabled : pressed ? OPACITY.pressed : 1 }]}><Ionicons name="pencil-outline" size={20} color={colors.foreground} /><Text style={[styles.actionRowText, { color: colors.foreground }]}>Edit Window</Text><Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} /></Pressable>
          {menuEntry.window.mode === 'onDemand' && <Pressable accessibilityRole="button" accessibilityLabel={menuEntry.status.active ? `End ${menuEntry.window.name}` : `Start ${menuEntry.window.name}`} accessibilityState={{ disabled: mutationsBlocked, busy: saving }} disabled={mutationsBlocked} onPress={() => { const target = menuEntry.window; const shouldEnd = menuEntry.status.active; setMenuWindowId(undefined); void (shouldEnd ? endOnDemand(target) : startOnDemand(target)); }} style={({ pressed }) => [styles.actionRow, { opacity: mutationsBlocked ? OPACITY.disabled : pressed ? OPACITY.pressed : 1 }]}><Ionicons name={menuEntry.status.active ? 'stop-circle-outline' : 'play-circle-outline'} size={20} color={accentText} /><Text style={[styles.actionRowText, { color: colors.foreground }]}>{menuEntry.status.active ? 'End Window' : 'Start Window'}</Text><Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} /></Pressable>}
          {menuEntry.window.mode !== 'onDemand' && canToggleGateWindowSkip(menuEntry.window, now) && <Pressable accessibilityRole="button" accessibilityLabel={menuEntry.status.skippedToday ? `Restore ${menuEntry.window.name}` : `Skip ${menuEntry.window.name} for this occurrence`} accessibilityState={{ disabled: mutationsBlocked, selected: menuEntry.status.skippedToday, busy: saving }} disabled={mutationsBlocked} onPress={() => { const target = menuEntry.window; setMenuWindowId(undefined); void toggleSkipToday(target); }} style={({ pressed }) => [styles.actionRow, { opacity: mutationsBlocked ? OPACITY.disabled : pressed ? OPACITY.pressed : 1 }]}><Ionicons name={menuEntry.status.skippedToday ? 'play-circle-outline' : 'pause-circle-outline'} size={20} color={accentText} /><Text style={[styles.actionRowText, { color: colors.foreground }]}>{menuEntry.status.skippedToday ? 'Restore Occurrence' : 'Skip Occurrence'}</Text><Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} /></Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${menuEntry.window.name}`} accessibilityState={{ disabled: mutationsBlocked }} disabled={mutationsBlocked} onPress={() => { const target = menuEntry.window; setMenuWindowId(undefined); remove(target); }} style={({ pressed }) => [styles.actionRow, { opacity: mutationsBlocked ? OPACITY.disabled : pressed ? OPACITY.pressed : 1 }]}><Ionicons name="trash-outline" size={20} color={colors.destructive} /><Text style={[styles.actionRowText, { color: colors.destructive }]}>Delete Window</Text></Pressable>
        </View>
      </View>
    </Modal>}
    {!embedded && <View style={styles.header}><View style={{ flex: 1 }}><GateSwitcher active="windows" /><Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{loadState === 'failed' ? 'Editing is paused to protect your saved configuration.' : windows.length ? `${windows.length} window${windows.length === 1 ? '' : 's'} saved` : 'Plan focused time before native protection is connected.'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Create a window" accessibilityState={{ disabled: mutationsBlocked, busy: saving }} disabled={mutationsBlocked} onPress={() => setCreating(true)} style={[styles.add, { width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, borderRadius: RADIUS.capsule, backgroundColor: colors.primary, opacity: mutationsBlocked ? OPACITY.disabled : 1 }]}><Ionicons name="add" size={22} color={colors.primaryForeground} /></Pressable></View>}
    <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + (embedded ? CONTROL.tabContentInset : SPACE.xxl) }]} showsVerticalScrollIndicator={false}>
      {notice && <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.inlineNotice, { backgroundColor: (notice.tone === 'error' ? colors.destructive : colors.primary) + '12', borderColor: (notice.tone === 'error' ? colors.destructive : colors.primary) + '66' }]}><Ionicons name={notice.tone === 'error' ? 'alert-circle-outline' : 'information-circle-outline'} size={19} color={notice.tone === 'error' ? colors.destructive : accentText} /><Text style={[styles.inlineNoticeText, { color: colors.foreground }]}>{notice.message}</Text><Pressable accessibilityRole="button" accessibilityLabel="Dismiss message" onPress={clearNotice} style={ICON_TARGET}><Ionicons name="close" size={17} color={colors.mutedForeground} /></Pressable></View>}
      {windows.length ? <>
        {!screenTimeReady && <View style={[styles.nativeNote, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.nativeNoteIcon, { backgroundColor: colors.primary + '16' }]}><Ionicons name="shield-outline" size={17} color={accentText} /></View><Text style={[styles.nativeNoteText, { color: colors.mutedForeground }]}>Native app protection connects later. Windows and timers work inside Chain now.</Text></View>}
        {screenTimeReady && <Pressable accessibilityRole="button" accessibilityLabel="Review weekly Screen Time for selected apps" onPress={() => setShowUsage(true)} style={[styles.screenTimeLink, { backgroundColor: colors.primary + '0D', borderColor: colors.primary + '55' }]}><View style={[styles.screenTimeIcon, { backgroundColor: colors.primary + '1A' }]}><Ionicons name="chart-bar-outline" size={18} color={accentText} /></View><View style={{ flex: 1 }}><Text style={[styles.screenTimeEyebrow, { color: accentText }]}>WEEKLY SCREEN TIME</Text><Text style={[styles.screenTimeTitle, { color: colors.foreground }]}>Review apps selected for Gate</Text><Text style={[styles.screenTimeBody, { color: colors.mutedForeground }]}>{selectedAppIds.length ? `${selectedAppIds.length} selected · private weekly usage.` : 'Choose apps in a window to make this insight personal.'}</Text></View><Ionicons name="chevron-forward" size={17} color={accentText} /></Pressable>}
        {featured.length > 0 && <><Text style={[styles.section, { color: colors.mutedForeground }]}>{active.length ? 'ACTIVE NOW' : 'UP NEXT'}</Text><View style={styles.featuredWindows}>{featured.map((entry) => renderWindowCard(entry, true))}</View></>}
        {saved.length > 0 && <><Text style={[styles.section, { color: colors.mutedForeground }]}>{featured.length ? 'SAVED WINDOWS' : 'YOUR WINDOWS'}</Text><View style={styles.windowGrid}>{saved.map((entry) => renderWindowCard(entry, false))}</View></>}
        <Pressable accessibilityRole="button" accessibilityLabel="Add another window" accessibilityState={{ disabled: mutationsBlocked, busy: saving }} disabled={mutationsBlocked} onPress={() => setCreating(true)} style={({ pressed }) => [styles.addWindow, { borderColor: colors.primary + '66', backgroundColor: colors.primary + '0C', opacity: mutationsBlocked ? OPACITY.disabled : pressed ? OPACITY.pressed : 1 }]}><View style={[styles.addWindowIcon, { backgroundColor: colors.primary + '1A' }]}><Ionicons name="add" size={19} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.addWindowTitle, { color: colors.foreground }]}>Add another window</Text><Text style={[styles.addWindowBody, { color: colors.mutedForeground }]}>Plan another focused part of your day.</Text></View><Ionicons name="chevron-forward" size={17} color={colors.primary} /></Pressable>
      </> : <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.emptyIcon, { backgroundColor: colors.primary + '18' }]}><Ionicons name="calendar-outline" size={25} color={colors.primary} /></View><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{loadState === 'failed' ? 'Your Windows are unavailable right now.' : 'Start with one focused hour.'}</Text><Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>{loadState === 'failed' ? 'Chain has paused editing so it cannot replace saved data with an empty list.' : 'Deep work, mornings, wind-down — choose a small part of your day you want to hold.'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Create a window" accessibilityState={{ disabled: mutationsBlocked, busy: saving }} disabled={mutationsBlocked} onPress={() => setCreating(true)} style={[styles.emptyButton, MIN_TARGET, { backgroundColor: colors.primary, opacity: mutationsBlocked ? OPACITY.disabled : 1 }]}><Text style={[styles.emptyButtonText, { color: colors.primaryForeground }]}>Create a window</Text></Pressable></View>}
    </ScrollView>
  </View>;
}

export default function GateWindowsScreen() { return <AmbientScreen tone="gate"><GateWindowsContent /></AmbientScreen>; }

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingHorizontal: CONTROL.screenHorizontal, paddingBottom: SPACE.lg },
  switcher: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: SPACE.sm },
  switchTab: { minHeight: CONTROL.minimumTarget, justifyContent: 'center' },
  switchText: TYPE.modalTitle,
  switchDivider: { width: StyleSheet.hairlineWidth, height: SPACE.xl },
  headerSub: { ...TYPE.caption, marginTop: SPACE.xxs },
  add: { width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, borderRadius: RADIUS.capsule, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: CONTROL.screenHorizontal, gap: SPACE.sm },
  nativeNote: { minHeight: CONTROL.minimumTarget, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.control, borderCurve: 'continuous', paddingVertical: SPACE.xs, paddingHorizontal: SPACE.sm },
  nativeNoteIcon: { width: 32, height: 32, borderRadius: RADIUS.compact, alignItems: 'center', justifyContent: 'center' },
  nativeNoteText: { ...TYPE.caption, flex: 1, minWidth: 0 },
  screenTimeLink: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderWidth: StyleSheet.hairlineWidth, padding: SPACE.sm, borderRadius: RADIUS.button, borderCurve: 'continuous', marginTop: SPACE.hairline },
  screenTimeIcon: { width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, borderRadius: RADIUS.compact, alignItems: 'center', justifyContent: 'center' },
  screenTimeEyebrow: { ...TYPE.eyebrow, marginBottom: SPACE.hairline },
  screenTimeTitle: TYPE.bodyStrong,
  screenTimeBody: { ...TYPE.caption, marginTop: SPACE.hairline },
  section: { ...TYPE.eyebrow, marginTop: SPACE.xs, marginBottom: SPACE.hairline },
  featuredWindows: { gap: SPACE.sm },
  windowGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, alignItems: 'stretch' },
  windowCardWrap: { flexShrink: 0 },
  windowCard: { flex: 1, borderRadius: RADIUS.card, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  featuredWindowCard: { minHeight: 166 },
  savedWindowCard: { minHeight: 178 },
  windowCardTop: { minHeight: CONTROL.minimumTarget + SPACE.xs, flexDirection: 'row', alignItems: 'center', paddingLeft: SPACE.md, paddingTop: SPACE.sm, paddingRight: SPACE.xs },
  windowTileIcon: { width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
  windowState: { ...TYPE.eyebrow, flex: 1, minWidth: 0, marginLeft: SPACE.xs },
  windowStateSpacer: { flex: 1, minWidth: 0 },
  windowMenuButton: { width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, borderRadius: RADIUS.capsule, alignItems: 'center', justifyContent: 'center' },
  windowCardDetails: { flex: 1, minHeight: 108, justifyContent: 'flex-end', paddingHorizontal: SPACE.md, paddingTop: SPACE.xs, paddingBottom: SPACE.md },
  windowTileName: { ...TYPE.cardTitle, minHeight: 21 },
  featuredWindowName: TYPE.sectionTitle,
  windowTileDescriptor: { ...TYPE.caption, fontFamily: 'Inter_600SemiBold', marginTop: SPACE.xxs },
  windowTileMeta: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xxs, marginTop: SPACE.sm },
  windowTileMetaText: { ...TYPE.caption, flex: 1, minWidth: 0 },
  actionSheet: { maxHeight: '82%', borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: CONTROL.screenHorizontal, paddingTop: SPACE.md },
  actionSheetHeading: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.xs },
  actionSheetIcon: { width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
  actionSheetTitle: TYPE.sectionTitle,
  actionSheetDescriptor: { ...TYPE.caption, marginTop: SPACE.hairline },
  actionRow: { minHeight: CONTROL.prominentButtonHeight, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
  actionRowText: { ...TYPE.bodyStrong, flex: 1, minWidth: 0 },
  addWindow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.button, borderCurve: 'continuous', padding: SPACE.sm, marginTop: SPACE.hairline },
  addWindowIcon: { width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, borderRadius: RADIUS.compact, alignItems: 'center', justifyContent: 'center' },
  addWindowTitle: TYPE.bodyStrong,
  addWindowBody: { ...TYPE.caption, marginTop: SPACE.hairline },
  empty: { alignItems: 'center', borderRadius: RADIUS.card, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, padding: SPACE.xl, marginTop: SPACE.xxs },
  emptyIcon: { width: 52, height: 52, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { ...TYPE.sectionTitle, marginTop: SPACE.md, textAlign: 'center' },
  emptyBody: { ...TYPE.body, textAlign: 'center', marginTop: SPACE.xs },
  emptyButton: { minHeight: CONTROL.buttonHeight, marginTop: SPACE.lg, borderRadius: RADIUS.button, borderCurve: 'continuous', paddingHorizontal: SPACE.md, justifyContent: 'center' },
  emptyButtonText: TYPE.bodyStrong,
  shade: { flex: 1, justifyContent: 'flex-end', backgroundColor: SCRIM },
  editor: { borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, padding: CONTROL.screenHorizontal, paddingBottom: SPACE.md, maxHeight: '91%' },
  editorScroll: { paddingBottom: SPACE.xl },
  editorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  editorEyebrow: { ...TYPE.eyebrow, marginBottom: SPACE.xxs },
  editorTitle: TYPE.modalTitle,
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs, marginTop: SPACE.md },
  preset: { minHeight: CONTROL.minimumTarget, flexGrow: 1, flexBasis: 90, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.xxs, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.compact, paddingHorizontal: SPACE.xs },
  presetText: { ...TYPE.caption, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  nameInput: { minHeight: CONTROL.minimumTarget, borderRadius: RADIUS.control, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, fontSize: 15, fontFamily: 'Inter_500Medium', paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xs, marginTop: SPACE.md },
  label: { ...TYPE.eyebrow, marginTop: SPACE.md, marginBottom: SPACE.xs },
  validationText: { ...TYPE.caption, fontFamily: 'Inter_500Medium', marginTop: SPACE.xs },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs },
  modeChoice: { minHeight: 68, flexGrow: 1, flexBasis: 145, flexDirection: 'row', gap: SPACE.xs, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.control, padding: SPACE.sm },
  modeTitle: TYPE.bodyStrong,
  modeBody: { ...TYPE.caption, marginTop: SPACE.hairline },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  timeChoice: { minHeight: 72, flexGrow: 1, flexBasis: 130, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.control, padding: SPACE.sm },
  timeLabel: { ...TYPE.eyebrow, marginBottom: SPACE.xxs },
  timeChoiceText: { ...TYPE.bodyStrong, marginBottom: SPACE.xxs },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs },
  durationChoice: { minHeight: CONTROL.minimumTarget, flexGrow: 1, flexBasis: 70, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.compact, paddingHorizontal: SPACE.xs },
  durationText: TYPE.bodyStrong,
  openEndedChoice: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.control, padding: SPACE.sm, marginTop: SPACE.xs },
  openEndedTitle: TYPE.bodyStrong,
  openEndedBody: { ...TYPE.caption, marginTop: SPACE.hairline },
  nativePicker: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.control, padding: SPACE.sm },
  nativePickerIcon: { width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, borderRadius: RADIUS.compact, alignItems: 'center', justifyContent: 'center' },
  focusChoice: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.control, padding: SPACE.sm, marginTop: SPACE.sm },
  focusChoiceIcon: { width: CONTROL.minimumTarget, height: CONTROL.minimumTarget, borderRadius: RADIUS.compact, alignItems: 'center', justifyContent: 'center' },
  note: { ...TYPE.caption, marginTop: SPACE.md },
  save: { minHeight: CONTROL.prominentButtonHeight, borderRadius: RADIUS.button, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.md, marginTop: SPACE.md },
  saveText: TYPE.bodyStrong,
  timeSheet: { maxHeight: '90%', borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, padding: CONTROL.screenHorizontal, paddingBottom: SPACE.xxl },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetHeading: { flex: 1, minWidth: 0, paddingRight: SPACE.xs },
  sheetTitle: TYPE.modalTitle,
  timePreview: { fontSize: 26, lineHeight: 32, fontFamily: 'Inter_700Bold', textAlign: 'center', marginTop: SPACE.sm, marginBottom: SPACE.xs },
  pickerColumns: { flexDirection: 'row', gap: SPACE.sm, height: 190 },
  pickerColumn: { flex: 1 },
  pickerLabel: { ...TYPE.eyebrow, textAlign: 'center', marginBottom: SPACE.xxs },
  pickerList: { flex: 1 },
  pickerValue: { minHeight: CONTROL.minimumTarget, alignItems: 'center', borderRadius: RADIUS.compact, marginBottom: SPACE.xxs },
  pickerValueText: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_600SemiBold' },
  legacyMinuteNote: { ...TYPE.caption, textAlign: 'center', marginTop: SPACE.sm },
  confirmTime: { minHeight: CONTROL.prominentButtonHeight, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.button, borderCurve: 'continuous', paddingHorizontal: SPACE.md, marginTop: SPACE.sm },
  confirmTimeText: TYPE.bodyStrong,
  usageSheet: { maxHeight: '90%', borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, padding: CONTROL.screenHorizontal, paddingBottom: SPACE.xxl },
  usageScroll: { flexShrink: 1 },
  usageScrollContent: { paddingBottom: SPACE.xs },
  usageIcon: { width: 52, height: 52, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center', marginTop: SPACE.md },
  usageTotal: { ...TYPE.display, marginTop: SPACE.lg },
  usageLead: { ...TYPE.sectionTitle, marginTop: SPACE.sm },
  usageBody: { ...TYPE.body, marginTop: SPACE.xs },
  usageQuote: { ...TYPE.bodyStrong, marginTop: SPACE.md },
  usageApp: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: SPACE.sm, marginTop: SPACE.sm },
  usageAppName: TYPE.bodyStrong,
  usageAppMinutes: TYPE.bodyStrong,
  usageDone: { minHeight: CONTROL.prominentButtonHeight, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.button, borderCurve: 'continuous', marginTop: SPACE.lg },
  inlineNotice: { minHeight: CONTROL.buttonHeight, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.control, paddingLeft: SPACE.sm },
  inlineNoticeText: { ...TYPE.caption, flex: 1, minWidth: 0, fontFamily: 'Inter_500Medium' },
  deleteWindow: { minHeight: CONTROL.prominentButtonHeight, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.control, paddingHorizontal: SPACE.sm, marginTop: SPACE.md },
  deleteWindowTitle: { ...TYPE.bodyStrong, color: '#FF453A' },
  deleteWindowBody: { ...TYPE.caption, marginTop: SPACE.hairline },
});
