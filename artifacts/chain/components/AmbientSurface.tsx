import React from 'react';
import { Platform, StyleSheet, View, ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';

type AmbientTone = 'today' | 'gate' | 'plan' | 'focus' | 'neutral';

const tones: Record<AmbientTone, string> = {
  today: '#FF6B35',
  gate: '#FF6B35',
  plan: '#FF6B35',
  focus: '#FF6B35',
  neutral: '#FF6B35',
};

const companionTones: Record<AmbientTone, [string, string]> = {
  today: ['#B76A48', '#343037'],
  gate: ['#B76A48', '#343037'],
  plan: ['#B76A48', '#343037'],
  focus: ['#B76A48', '#343037'],
  neutral: ['#B76A48', '#343037'],
};

function alpha(hex: string, value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${value}` : hex;
}

/**
 * The shared dark canvas for Chain. The colour deliberately stays below the
 * content: it adds atmosphere without turning the app into a neon dashboard.
 */
export function AmbientScreen({ tone = 'neutral', color: colorOverride, children, style, ...props }: ViewProps & { tone?: AmbientTone; color?: string }) {
  const color = colorOverride ?? tones[tone];
  const [secondary, tertiary] = companionTones[tone];
  return (
    <View {...props} style={[styles.screen, style]}>
      <LinearGradient
        pointerEvents="none"
        colors={['#050609', '#090A0F', '#050609']}
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
      <View pointerEvents="none" style={[styles.wash, styles.middleWash]}>
        <LinearGradient
          colors={[alpha(tertiary, '00'), alpha(tertiary, '12'), alpha(secondary, '08'), alpha(tertiary, '00')]}
          locations={[0, 0.38, 0.7, 1]}
          start={{ x: 0, y: 0.6 }}
          end={{ x: 1, y: 0.25 }}
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
      {Platform.OS !== 'web' && (
        <BlurView pointerEvents="none" intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(4,4,5,0.30)', 'rgba(6,6,7,0.68)', 'rgba(4,4,5,0.84)']}
        locations={[0, 0.54, 1]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

/** A restrained glass surface for high-level cards, sheets and section groups. */
export function GlassSurface({ children, style, intensity = 42, accentColor, elevated = false, ...props }: ViewProps & { intensity?: number; accentColor?: string; elevated?: boolean }) {
  const useNativeGlass = elevated && Platform.OS === 'ios' && isGlassEffectAPIAvailable();
  return (
    <View {...props} style={[styles.glass, elevated && styles.glassElevated, style]}>
      {useNativeGlass ? (
        <GlassView pointerEvents="none" glassEffectStyle="regular" colorScheme="dark" tintColor="#11141B" style={StyleSheet.absoluteFill} />
      ) : elevated && Platform.OS !== 'web' ? (
        <BlurView pointerEvents="none" intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      ) : null}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.045)', 'rgba(255,255,255,0.008)', 'rgba(0,0,0,0.11)']}
        locations={[0, 0.28, 1]}
        style={StyleSheet.absoluteFill}
      />
      {accentColor ? <View pointerEvents="none" style={[styles.accentVeil, { backgroundColor: alpha(accentColor, '05') }]} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050506', overflow: 'hidden' },
  wash: { position: 'absolute', overflow: 'hidden', borderRadius: 9999 },
  topWash: { width: 900, height: 650, top: -465, right: -500, transform: [{ rotate: '-10deg' }], opacity: 0.46 },
  middleWash: { width: 820, height: 520, top: 340, left: -610, transform: [{ rotate: '19deg' }], opacity: 0.22 },
  bottomWash: { width: 920, height: 560, bottom: -450, right: -610, transform: [{ rotate: '-16deg' }], opacity: 0.24 },
  glass: {
    overflow: 'hidden',
    backgroundColor: 'rgba(18,18,20,0.92)',
    borderColor: 'rgba(255,255,255,0.075)',
    borderWidth: StyleSheet.hairlineWidth,
  },
  glassElevated: {
    backgroundColor: 'rgba(20,20,22,0.78)',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  accentVeil: { ...StyleSheet.absoluteFillObject },
});
