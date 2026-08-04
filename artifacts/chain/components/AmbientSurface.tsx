import React from 'react';
import { Platform, StyleSheet, View, ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';

type AmbientTone = 'today' | 'gate' | 'plan' | 'focus' | 'neutral';

const tones: Record<AmbientTone, string> = {
  today: '#FF6B35',
  gate: '#A855F7',
  plan: '#3B82F6',
  focus: '#84CC16',
  neutral: '#667085',
};

const companionTones: Record<AmbientTone, [string, string]> = {
  today: ['#FF9A3D', '#A92C48'],
  gate: ['#6E52FF', '#CA4DCE'],
  plan: ['#245DFF', '#28B8D8'],
  focus: ['#65B80E', '#1C8A72'],
  neutral: ['#3F4C68', '#272D42'],
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
          colors={[alpha(color, '00'), alpha(color, '3D'), alpha(secondary, '22'), alpha(color, '00')]}
          locations={[0, 0.34, 0.68, 1]}
          start={{ x: 0.12, y: 0.12 }}
          end={{ x: 0.9, y: 0.88 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <View pointerEvents="none" style={[styles.wash, styles.middleWash]}>
        <LinearGradient
          colors={[alpha(tertiary, '00'), alpha(tertiary, '2C'), alpha(secondary, '18'), alpha(tertiary, '00')]}
          locations={[0, 0.38, 0.7, 1]}
          start={{ x: 0, y: 0.6 }}
          end={{ x: 1, y: 0.25 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <View pointerEvents="none" style={[styles.wash, styles.bottomWash]}>
        <LinearGradient
          colors={[alpha(secondary, '00'), alpha(secondary, '26'), alpha(color, '12'), alpha(secondary, '00')]}
          locations={[0, 0.4, 0.68, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>
      {Platform.OS !== 'web' && (
        <BlurView pointerEvents="none" intensity={78} tint="dark" style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(3,4,7,0.26)', 'rgba(5,6,10,0.56)', 'rgba(3,4,7,0.76)']}
        locations={[0, 0.54, 1]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

/** A restrained glass surface for high-level cards, sheets and section groups. */
export function GlassSurface({ children, style, intensity = 42, accentColor, elevated = false, ...props }: ViewProps & { intensity?: number; accentColor?: string; elevated?: boolean }) {
  const useNativeGlass = Platform.OS === 'ios' && isGlassEffectAPIAvailable();
  return (
    <View {...props} style={[styles.glass, elevated && styles.glassElevated, style]}>
      {useNativeGlass ? (
        <GlassView pointerEvents="none" glassEffectStyle="regular" colorScheme="dark" tintColor="#11141B" style={StyleSheet.absoluteFill} />
      ) : Platform.OS !== 'web' ? (
        <BlurView pointerEvents="none" intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      ) : null}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.075)', 'rgba(255,255,255,0.012)', 'rgba(0,0,0,0.16)']}
        locations={[0, 0.28, 1]}
        style={StyleSheet.absoluteFill}
      />
      {accentColor ? <View pointerEvents="none" style={[styles.accentVeil, { backgroundColor: alpha(accentColor, '0D') }]} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050609', overflow: 'hidden' },
  wash: { position: 'absolute', overflow: 'hidden', borderRadius: 9999 },
  topWash: { width: 760, height: 590, top: -390, right: -360, transform: [{ rotate: '-13deg' }], opacity: 0.8 },
  middleWash: { width: 690, height: 410, top: 255, left: -480, transform: [{ rotate: '24deg' }], opacity: 0.46 },
  bottomWash: { width: 820, height: 520, bottom: -390, right: -500, transform: [{ rotate: '-20deg' }], opacity: 0.5 },
  glass: {
    overflow: 'hidden',
    backgroundColor: 'rgba(17,19,25,0.62)',
    borderColor: 'rgba(255,255,255,0.115)',
    borderWidth: StyleSheet.hairlineWidth,
  },
  glassElevated: {
    backgroundColor: 'rgba(19,21,28,0.74)',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  accentVeil: { ...StyleSheet.absoluteFillObject },
});
