import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';

interface Props {
  streak: number;
  chainName: string;
  color: string;
  onDismiss: () => void;
}

interface Config {
  emoji: string;
  headline: string;
  sub: string;
}

const CONFIGS: Record<number, Config> = {
  7:   { emoji: '🔥', headline: '7-day streak!',    sub: "One full week in. You're building something real." },
  30:  { emoji: '⚡', headline: '30 days strong!',   sub: 'A whole month of showing up. This is a habit now.' },
  100: { emoji: '👑', headline: '100-day legend!',   sub: "Triple digits. This chain is part of who you are." },
};

export default function MilestoneModal({ streak, chainName, color, onDismiss }: Props) {
  const colors = useColors();
  const config: Config = CONFIGS[streak] ?? {
    emoji: '🔥',
    headline: `${streak}-day streak!`,
    sub: 'Keep the chain alive.',
  };

  const scale   = useSharedValue(0.5);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 180 });
    scale.value   = withDelay(80, withSpring(1, { damping: 11, stiffness: 220 }));
  }, []);

  const cardAnim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   opacity.value,
  }));

  return (
    <Modal transparent animationType="none" statusBarTranslucent onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Animated.View
          style={[styles.card, { backgroundColor: colors.card, borderColor: color + '55' }, cardAnim]}
        >
          {/* Top accent bar */}
          <View style={[styles.topBar, { backgroundColor: color }]} />

          <View style={styles.body}>
            <Text style={styles.emoji}>{config.emoji}</Text>
            <Text style={[styles.headline, { color }]}>{config.headline}</Text>
            <Text style={[styles.chainLabel, { color: colors.mutedForeground }]}>
              {chainName}
            </Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>{config.sub}</Text>

            <Pressable
              onPress={onDismiss}
              style={({ pressed }) => [
                styles.btn,
                { backgroundColor: color, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={styles.btnText}>Keep it up</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  card: {
    width: '100%',
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
  },
  topBar: {
    height: 5,
  },
  body: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 28,
    gap: 8,
  },
  emoji: {
    fontSize: 56,
    marginBottom: 4,
  },
  headline: {
    fontSize: 30,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  chainLabel: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sub: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  btn: {
    marginTop: 10,
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 32,
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
});
