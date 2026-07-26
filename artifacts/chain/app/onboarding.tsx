import React, { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

const { width: W } = Dimensions.get('window');
const ONBOARDED_KEY = '@chain_onboarded';

interface Slide {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    id: '1',
    icon: 'link',
    iconColor: '#FF6B35',
    title: "Don't break the chain",
    body:
      'Pick up to 5 habits that matter. Mark them done each day. Watch the chain grow — one link at a time. Missing a day breaks it.',
  },
  {
    id: '2',
    icon: 'shield-checkmark',
    iconColor: '#A855F7',
    title: 'Protect your time',
    body:
      "The Pause Gate adds a moment of friction before you open a distracting app. You see your streak. You decide if it\u2019s worth breaking.",
  },
  {
    id: '3',
    icon: 'moon',
    iconColor: '#3B82F6',
    title: 'Plan tonight, win tomorrow',
    body:
      'Spend 60 seconds each evening reflecting on today and blocking out 3–5 priorities for tomorrow. The day starts before it starts.',
  },
];

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatRef = useRef<FlatList>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const onViewChange = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems[0]) setCurrentIndex(viewableItems[0].index ?? 0);
    },
  ).current;

  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  async function handleNext() {
    if (currentIndex < SLIDES.length - 1) {
      flatRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
      router.replace('/(tabs)');
    }
  }

  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        ref={flatRef}
        data={SLIDES}
        keyExtractor={(s) => s.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewChange}
        viewabilityConfig={viewConfig}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <View style={[styles.slide, { paddingTop: topPad + 60, width: W }]}>
            <View style={[styles.iconWrap, { backgroundColor: item.iconColor + '20' }]}>
              <Ionicons name={item.icon} size={48} color={item.iconColor} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {item.title}
            </Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              {item.body}
            </Text>
          </View>
        )}
      />

      {/* Progress dots */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor:
                  i === currentIndex ? colors.primary : colors.border,
                width: i === currentIndex ? 24 : 8,
              },
            ]}
          />
        ))}
      </View>

      {/* CTA button */}
      <View style={[styles.footer, { paddingBottom: botPad + 24 }]}>
        <Pressable
          onPress={handleNext}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.btnText}>
            {isLast ? 'Start building your chain' : 'Next'}
          </Text>
          <Ionicons
            name={isLast ? 'arrow-forward' : 'chevron-forward'}
            size={18}
            color="#fff"
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 24,
  },
  iconWrap: {
    width: 100,
    height: 100,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    lineHeight: 34,
  },
  body: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 25,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  footer: {
    paddingHorizontal: 24,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 32,
    gap: 8,
  },
  btnText: {
    color: '#fff',
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
  },
});
