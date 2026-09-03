import React, { useCallback, useRef, useState } from 'react';
import {
  BackHandler,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AmbientScreen } from '@/components/AmbientSurface';
import { AppButton, Surface } from '@/components/ui/AppUI';
import { CONTROL, RADIUS, SPACE, TYPE } from '@/constants/designSystem';
import type { AmbientTone } from '@/constants/sectionTheme';
import { reportDiagnostic } from '@/lib/diagnostics';
import { playFeedback } from '@/lib/feedback';
import { useColors } from '@/hooks/useColors';

const ONBOARDED_KEY = '@chain_onboarded';

interface Slide {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  tone: AmbientTone;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    id: '1',
    icon: 'link',
    iconColor: '#FF6B35',
    tone: 'today',
    title: 'Choose what matters',
    body:
      'Create one commitment worth keeping. Chain helps you show up consistently, with minimum versions and rest days when life changes.',
  },
  {
    id: '2',
    icon: 'shield-checkmark',
    iconColor: '#A970FF',
    tone: 'gate',
    title: 'Create a pause',
    body:
      'Preview the moment of friction that Gate can place before a distraction. Real app protection requires a future native build and Apple’s Screen Time permission.',
  },
  {
    id: '3',
    icon: 'moon',
    iconColor: '#5B8CFF',
    tone: 'plan',
    title: 'Make tomorrow lighter',
    body:
      'Choose what matters before the day gets noisy. A short plan gives your priorities somewhere real to live.',
  },
];

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);
  const flatRef = useRef<FlatList<Slide>>(null);
  const finishingRef = useRef(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => subscription.remove();
    }, []),
  );

  const onViewChange = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<Slide>[] }) => {
      if (viewableItems[0]) setCurrentIndex(viewableItems[0].index ?? 0);
    },
  ).current;

  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  async function handleNext() {
    if (finishingRef.current) return;
    playFeedback('selection');
    if (currentIndex < SLIDES.length - 1) {
      flatRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
      return;
    }

    finishingRef.current = true;
    setIsFinishing(true);
    try {
      await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
    } catch (error) {
      reportDiagnostic({ area: 'storage', operation: 'onboarding.writeState', severity: 'warning', error });
    } finally {
      router.replace('/(tabs)');
    }
  }

  const isLast = currentIndex === SLIDES.length - 1;
  const activeSlide = SLIDES[currentIndex] ?? SLIDES[0];

  return (
    <AmbientScreen tone={activeSlide.tone} style={styles.root}>
      <FlatList
        ref={flatRef}
        data={SLIDES}
        keyExtractor={(slide) => slide.id}
        horizontal
        pagingEnabled
        scrollEnabled={!isFinishing}
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewChange}
        viewabilityConfig={viewConfig}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        renderItem={({ item }) => (
          <ScrollView
            style={{ width }}
            contentContainerStyle={[
              styles.slide,
              { paddingTop: topPad + SPACE.xxxl, paddingBottom: SPACE.xl },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <Surface accentColor={item.iconColor} elevated style={styles.iconWrap}>
              <Ionicons name={item.icon} size={48} color={item.iconColor} />
            </Surface>
            <Text style={[styles.title, { color: colors.foreground }]}>{item.title}</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>{item.body}</Text>
          </ScrollView>
        )}
      />

      <View
        accessible
        accessibilityLabel={`Step ${currentIndex + 1} of ${SLIDES.length}`}
        style={styles.dots}
      >
        {SLIDES.map((slide, index) => (
          <View
            key={slide.id}
            style={[
              styles.dot,
              {
                backgroundColor: index === currentIndex ? activeSlide.iconColor : colors.border,
                width: index === currentIndex ? SPACE.xl : SPACE.xs,
              },
            ]}
          />
        ))}
      </View>

      <View style={[styles.footer, { paddingBottom: botPad + SPACE.xl }]}>
        <AppButton
          label={isFinishing ? 'Opening Chain…' : isLast ? 'Start using Chain' : 'Continue'}
          onPress={handleNext}
          accentColor={activeSlide.iconColor}
          busy={isFinishing}
          style={styles.button}
        />
      </View>
    </AmbientScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  slide: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.xxxl,
    gap: SPACE.xl,
  },
  iconWrap: {
    width: 100,
    height: 100,
    borderRadius: RADIUS.large,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.xs,
  },
  title: { ...TYPE.screenTitle, textAlign: 'center' },
  body: {
    fontSize: 15,
    lineHeight: 23,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    maxWidth: 420,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.xs,
    marginBottom: SPACE.xl,
  },
  dot: { height: SPACE.xs, borderRadius: RADIUS.capsule },
  footer: { paddingHorizontal: SPACE.xl },
  button: { minHeight: CONTROL.prominentButtonHeight },
});
