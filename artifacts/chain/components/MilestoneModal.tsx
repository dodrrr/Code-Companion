import React, { useEffect } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { AppButton, Surface } from '@/components/ui/AppUI';
import { MOTION, RADIUS, SCRIM, SPACE, TYPE } from '@/constants/designSystem';
import { readableAccentColor } from '@/constants/sectionTheme';

const GLASS_SURFACE_COLOR = '#121214';

interface Props {
  streak: number;
  cadence: 'daily' | 'weekly';
  chainName: string;
  color: string;
  onDismiss: () => void;
}

const NUMBER_WORDS: Record<number, string> = {
  7: 'Seven',
  30: 'Thirty',
  100: 'One hundred',
};

const SUPPORTING_COPY: Record<number, string> = {
  7: 'You returned often enough for a pattern to begin.',
  30: 'This promise is finding a steady place in your life.',
  100: 'Consistency has become part of the rhythm.',
};

export default function MilestoneModal({
  streak,
  cadence,
  chainName,
  color,
  onDismiss,
}: Props) {
  const colors = useColors();
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(0);
  const scale = useSharedValue(reducedMotion ? 1 : 0.98);
  const unit = cadence === 'weekly' ? 'week' : 'day';
  const quantity = NUMBER_WORDS[streak] ?? String(streak);
  const headline = `${quantity} ${unit}${streak === 1 ? '' : 's'} kept.`;
  const supportingCopy = SUPPORTING_COPY[streak] ?? 'You showed up again.';
  const readableAccent = readableAccentColor(color, GLASS_SURFACE_COLOR, 4.8);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: reducedMotion ? 80 : MOTION.standard });
    scale.value = withTiming(1, { duration: reducedMotion ? 0 : MOTION.standard });
  }, [opacity, reducedMotion, scale]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Modal transparent animationType="none" statusBarTranslucent onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Pressable
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={onDismiss}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View accessibilityViewIsModal style={[styles.frame, cardStyle]}>
          <Surface elevated accentColor={color} style={styles.card}>
            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.content}
            >
              <View style={[styles.icon, { backgroundColor: color + '1C' }]}>
                <Ionicons name="link-outline" size={25} color={readableAccent} />
              </View>
              <Text style={[TYPE.eyebrow, { color: readableAccent }]}>MILESTONE</Text>
              <Text style={[styles.headline, { color: colors.foreground }]}>{headline}</Text>
              <Text style={[styles.chainName, { color: colors.mutedForeground }]}>{chainName}</Text>
              <Text style={[styles.supportingCopy, { color: colors.mutedForeground }]}>
                {supportingCopy}
              </Text>
              <View style={styles.action}>
                <AppButton label="Continue" onPress={onDismiss} accentColor={color} />
              </View>
            </ScrollView>
          </Surface>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACE.xl,
    backgroundColor: SCRIM,
  },
  frame: { width: '100%', maxWidth: 340, maxHeight: '82%' },
  card: { borderRadius: RADIUS.modal, maxHeight: '100%' },
  content: { alignItems: 'center', paddingHorizontal: SPACE.xl, paddingVertical: SPACE.xxl },
  icon: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.button,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.md,
  },
  headline: { ...TYPE.modalTitle, textAlign: 'center', marginTop: SPACE.xxs },
  chainName: { ...TYPE.bodyStrong, textAlign: 'center', marginTop: SPACE.xxs },
  supportingCopy: { ...TYPE.body, textAlign: 'center', marginTop: SPACE.sm },
  action: { alignSelf: 'stretch', marginTop: SPACE.xl },
});
