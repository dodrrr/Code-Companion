import React, { useCallback } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { MOTION } from '@/constants/designSystem';

interface Props extends Omit<PressableProps, 'style'> {
  /** Style applied to the inner Animated.View — use for layout, borders, bg, etc. */
  style?: StyleProp<ViewStyle>;
  /** Layout style for the outer native Pressable. */
  containerStyle?: StyleProp<ViewStyle>;
  /** Scale target on press-in. Default 0.985: subtle and tactile. */
  scaleTo?: number;
  children: React.ReactNode;
}

/**
 * Drop-in Pressable replacement that applies a smooth spring-scale on press.
 * Respects the system Reduce Motion setting — falls back to opacity only.
 */
export default function AnimatedPressable({
  children,
  style,
  containerStyle,
  scaleTo = 0.985,
  onPressIn: externalPressIn,
  onPressOut: externalPressOut,
  ...rest
}: Props) {
  const reducedMotion = useReducedMotion();
  const scale   = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   opacity.value,
  }));

  const handlePressIn = useCallback(
    (e: any) => {
      if (reducedMotion) {
        opacity.value = withTiming(0.7, { duration: 60 });
      } else {
        scale.value = withTiming(scaleTo, { duration: MOTION.pressIn });
      }
      externalPressIn?.(e);
    },
    [reducedMotion, scaleTo, externalPressIn],
  );

  const handlePressOut = useCallback(
    (e: any) => {
      if (reducedMotion) {
        opacity.value = withTiming(1, { duration: MOTION.quick });
      } else {
        scale.value = withSpring(1, MOTION.spring);
      }
      externalPressOut?.(e);
    },
    [reducedMotion, externalPressOut],
  );

  return (
    <Pressable style={containerStyle} onPressIn={handlePressIn} onPressOut={handlePressOut} {...rest}>
      <Animated.View style={[style, animStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
