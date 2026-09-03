import React, { type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AnimatedPressable from '@/components/AnimatedPressable';
import { GlassSurface } from '@/components/AmbientSurface';
import { CONTROL, OPACITY, RADIUS, SPACE, TYPE } from '@/constants/designSystem';
import { readableAccentColor, readableTextColor } from '@/constants/sectionTheme';
import { useColors } from '@/hooks/useColors';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function Surface({
  children,
  accentColor,
  elevated = false,
  style,
  ...props
}: ViewProps & { accentColor?: string; elevated?: boolean }) {
  const colors = useColors();
  return <GlassSurface {...props} accentColor={accentColor} elevated={elevated} style={[styles.surface, { borderColor: colors.border }, style]}>{children}</GlassSurface>;
}

export function SectionLabel({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const colors = useColors();
  return <Text style={[TYPE.eyebrow, styles.sectionLabel, { color: colors.mutedForeground }, style]}>{children}</Text>;
}

export function IconButton({
  icon,
  label,
  onPress,
  accentColor,
  filled = false,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  accentColor?: string;
  filled?: boolean;
  disabled?: boolean;
}) {
  const colors = useColors();
  const accent = accentColor ?? colors.primary;
  const foreground = filled ? readableTextColor(accent) : colors.mutedForeground;
  return <AnimatedPressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    scaleTo={0.94}
    style={[
      styles.iconButton,
      {
        backgroundColor: filled ? accent : colors.card,
        borderColor: filled ? accent : colors.border,
        opacity: disabled ? OPACITY.disabled : 1,
      },
    ]}
  >
    <Ionicons name={icon} size={20} color={foreground} />
  </AnimatedPressable>;
}

export function AppButton({
  label,
  onPress,
  icon,
  variant = 'primary',
  accentColor,
  disabled = false,
  busy = false,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  accentColor?: string;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const accent = accentColor ?? (variant === 'danger' ? colors.destructive : colors.primary);
  const solid = variant === 'primary' || variant === 'danger';
  const foreground = solid ? readableTextColor(accent) : variant === 'ghost' ? colors.mutedForeground : colors.foreground;
  const backgroundColor = solid ? accent : variant === 'ghost' ? 'transparent' : colors.card;
  const borderColor = solid ? accent : variant === 'ghost' ? 'transparent' : colors.border;
  const isDisabled = disabled || busy;
  return <AnimatedPressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled: isDisabled, busy }}
    disabled={isDisabled}
    onPress={onPress}
    containerStyle={styles.buttonContainer}
    style={[styles.button, { backgroundColor, borderColor, opacity: isDisabled ? OPACITY.disabled : 1 }, style]}
  >
    {busy ? <ActivityIndicator size="small" color={foreground} /> : icon ? <Ionicons name={icon} size={18} color={foreground} /> : null}
    <Text style={[TYPE.bodyStrong, { color: foreground }]}>{label}</Text>
  </AnimatedPressable>;
}

export function StatusNotice({
  icon,
  eyebrow,
  title,
  body,
  accentColor,
  trailing,
}: {
  icon: IconName;
  eyebrow?: string;
  title: string;
  body?: string;
  accentColor?: string;
  trailing?: ReactNode;
}) {
  const colors = useColors();
  const accent = accentColor ?? colors.primary;
  const readableAccent = readableAccentColor(accent, colors.cardSolid);
  return <Surface accentColor={accent} style={styles.notice}>
    <View style={[styles.noticeIcon, { backgroundColor: accent + '1C' }]}><Ionicons name={icon} size={20} color={readableAccent} /></View>
    <View style={styles.noticeCopy}>
      {eyebrow ? <Text style={[TYPE.eyebrow, { color: readableAccent }]}>{eyebrow}</Text> : null}
      <Text style={[TYPE.cardTitle, { color: colors.foreground }]}>{title}</Text>
      {body ? <Text style={[TYPE.caption, { color: colors.mutedForeground }]}>{body}</Text> : null}
    </View>
    {trailing}
  </Surface>;
}

export function SheetHandle() {
  const colors = useColors();
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.sheetHandle, { backgroundColor: colors.mutedForeground + '55' }]} />;
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: RADIUS.card,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sectionLabel: { marginBottom: SPACE.xs },
  iconButton: {
    width: CONTROL.minimumTarget,
    height: CONTROL.minimumTarget,
    borderRadius: RADIUS.capsule,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContainer: { alignSelf: 'stretch' },
  button: {
    minHeight: CONTROL.buttonHeight,
    borderRadius: RADIUS.button,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACE.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.xs,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACE.md,
    gap: SPACE.sm,
  },
  noticeIcon: {
    width: CONTROL.minimumTarget,
    height: CONTROL.minimumTarget,
    borderRadius: RADIUS.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeCopy: { flex: 1, minWidth: 0, gap: SPACE.hairline },
  sheetHandle: { width: 36, height: 5, borderRadius: RADIUS.capsule, alignSelf: 'center', marginBottom: SPACE.md },
});
