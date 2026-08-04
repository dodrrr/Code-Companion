import React from 'react';
import { Platform, StyleSheet, View, ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

type AmbientTone = 'today' | 'gate' | 'plan' | 'focus' | 'neutral';

const tones: Record<AmbientTone, string> = {
  today: '#FF6B35',
  gate: '#A855F7',
  plan: '#3B82F6',
  focus: '#84CC16',
  neutral: '#667085',
};

/**
 * The shared dark canvas for Chain. The colour deliberately stays below the
 * content: it adds atmosphere without turning the app into a neon dashboard.
 */
export function AmbientScreen({ tone = 'neutral', color: colorOverride, children, style, ...props }: ViewProps & { tone?: AmbientTone; color?: string }) {
  const color = colorOverride ?? tones[tone];
  return (
    <View {...props} style={[styles.screen, style]}>
      <LinearGradient
        pointerEvents="none"
        colors={['#08090B', '#0C0D11', '#08090B']}
        locations={[0, 0.44, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={[styles.glow, styles.topGlow, { backgroundColor: color }]} />
      <View pointerEvents="none" style={[styles.glow, styles.bottomGlow, { backgroundColor: color }]} />
      {children}
    </View>
  );
}

/** A restrained glass surface for high-level cards, sheets and section groups. */
export function GlassSurface({ children, style, intensity = 24, ...props }: ViewProps & { intensity?: number }) {
  return (
    <View {...props} style={[styles.glass, style]}>
      {Platform.OS !== 'web' && <BlurView pointerEvents="none" intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />}
      <View pointerEvents="none" style={styles.glassSheen} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#08090B', overflow: 'hidden' },
  glow: {
    position: 'absolute', borderRadius: 9999, opacity: 0.075,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 44,
  },
  topGlow: { width: 390, height: 390, top: -205, right: -120 },
  bottomGlow: { width: 330, height: 330, bottom: -215, left: -155, opacity: 0.045 },
  glass: { overflow: 'hidden', backgroundColor: 'rgba(27,29,34,0.76)', borderColor: 'rgba(255,255,255,0.095)', borderWidth: 1 },
  glassSheen: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.012)' },
});
