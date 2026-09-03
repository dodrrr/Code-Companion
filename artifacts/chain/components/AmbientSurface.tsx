import React from 'react';
import { Platform, StyleSheet, View, ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import {
  AMBIENT_ACCENTS,
  AMBIENT_COMPANIONS,
  AmbientTone,
} from '@/constants/sectionTheme';

function alpha(hex: string, value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${value}` : hex;
}

function mixHex(base: string, tint: string, amount: number) {
  const parse = (value: string) => {
    const match = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(value);
    return match ? match.slice(1).map((channel) => Number.parseInt(channel, 16)) : null;
  };
  const baseChannels = parse(base);
  const tintChannels = parse(tint);
  if (!baseChannels || !tintChannels) return base;
  const channel = (index: number) => Math.round(baseChannels[index] + (tintChannels[index] - baseChannels[index]) * amount)
    .toString(16)
    .padStart(2, '0');
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

function rgba(hex: string, opacity: number) {
  const match = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  if (!match) return hex;
  const [red, green, blue] = match.slice(1).map((channel) => Number.parseInt(channel, 16));
  return `rgba(${red},${green},${blue},${opacity})`;
}

/**
 * The shared dark canvas for Chain. The colour deliberately stays below the
 * content: it adds atmosphere without turning the app into a neon dashboard.
 */
export function AmbientScreen({ tone = 'neutral', color: colorOverride, children, style, ...props }: ViewProps & { tone?: AmbientTone; color?: string }) {
  const color = colorOverride ?? AMBIENT_ACCENTS[tone];
  const [secondary] = AMBIENT_COMPANIONS[tone];
  return (
    <View {...props} style={[styles.screen, style]}>
      <LinearGradient
        pointerEvents="none"
        colors={['#050609', '#08090D', '#040405']}
        locations={[0, 0.48, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={[styles.wash, styles.topWash]}>
        <LinearGradient
          colors={[alpha(color, '00'), alpha(color, '17'), alpha(secondary, '0D'), alpha(color, '00')]}
          locations={[0, 0.34, 0.68, 1]}
          start={{ x: 0.12, y: 0.12 }}
          end={{ x: 0.9, y: 0.88 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <View pointerEvents="none" style={[styles.wash, styles.bottomWash]}>
        <LinearGradient
          colors={[alpha(secondary, '00'), alpha(secondary, '0E'), alpha(color, '07'), alpha(secondary, '00')]}
          locations={[0, 0.4, 0.68, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>
      {children}
    </View>
  );
}

/** A restrained glass surface for high-level cards, sheets and section groups. */
export function GlassSurface({
  children,
  style,
  accentColor,
  elevated = false,
  intensity,
  ...props
}: ViewProps & {
  /** @deprecated Kept for call-site compatibility. This material intentionally adds no extra blur. */
  intensity?: number;
  accentColor?: string;
  elevated?: boolean;
}) {
  // Do not forward the legacy blur control to the native View.
  void intensity;
  const useNativeGlass = elevated && Platform.OS === 'ios' && isGlassEffectAPIAvailable();
  const baseColor = elevated ? '#17171A' : '#121214';
  const materialColor = accentColor ? mixHex(baseColor, accentColor, 0.045) : baseColor;
  const fallbackColor = rgba(materialColor, elevated ? 0.9 : 0.94);
  return (
    <View
      {...props}
      style={[
        styles.glass,
        !useNativeGlass && { backgroundColor: fallbackColor },
        style,
      ]}
    >
      {useNativeGlass ? (
        <GlassView
          pointerEvents="none"
          glassEffectStyle="regular"
          colorScheme="dark"
          tintColor={materialColor}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050506', overflow: 'hidden' },
  wash: { position: 'absolute', overflow: 'hidden', borderRadius: 9999 },
  topWash: { width: 900, height: 650, top: -465, right: -500, transform: [{ rotate: '-10deg' }], opacity: 0.46 },
  bottomWash: { width: 920, height: 560, bottom: -450, right: -610, transform: [{ rotate: '-16deg' }], opacity: 0.24 },
  glass: {
    overflow: 'hidden',
    borderCurve: 'continuous',
    borderColor: 'rgba(255,255,255,0.075)',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
