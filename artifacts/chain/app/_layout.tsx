import React, { useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChainsProvider } from '@/context/ChainsContext';
import { PlanProvider } from '@/context/PlanContext';
import { PlanNotificationResponseHandler } from '@/components/PlanNotificationResponseHandler';
import { reportDiagnostic } from '@/lib/diagnostics';

void SplashScreen.preventAutoHideAsync().catch((error) => {
  reportDiagnostic({ area: 'native', operation: 'splash.preventAutoHide', severity: 'warning', error });
});

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        animation: 'simple_push',
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false, animation: 'none' }} />
      <Stack.Screen
        name="chain/new"
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
          gestureDirection: 'vertical',
        }}
      />
      <Stack.Screen
        name="chain/[id]"
        options={{
          headerShown: false,
          presentation: 'card',
          animation: 'simple_push',
          gestureEnabled: true,
          gestureDirection: 'horizontal',
          // Chain details should behave like a native iOS drill-down. Keeping
          // this explicit avoids the route falling back to an edge-only
          // gesture when inherited Stack options change.
          fullScreenGestureEnabled: true,
          animationMatchesGesture: true,
          fullScreenGestureShadowEnabled: true,
        }}
      />
      <Stack.Screen name="pause-gate-demo" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="gate-windows" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="focus/[id]" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="settings" options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom', gestureDirection: 'vertical' }} />
      <Stack.Screen name="paywall" options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom', gestureDirection: 'vertical' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const didBootstrap = useRef(false);

  useEffect(() => {
    if ((!fontsLoaded && !fontError) || didBootstrap.current) return;
    didBootstrap.current = true;

    const hideSplashAfterNavigationSettles = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void SplashScreen.hideAsync().catch((error) => {
            reportDiagnostic({ area: 'native', operation: 'splash.hide', severity: 'warning', error });
          });
        });
      });
    };

    void AsyncStorage.getItem('@chain_onboarded')
      .then((value) => {
        if (!value) router.replace('/onboarding');
        hideSplashAfterNavigationSettles();
      })
      .catch((error) => {
        reportDiagnostic({ area: 'storage', operation: 'onboarding.readState', severity: 'warning', error });
        // A failed read should not silently bypass first-run context. Onboarding
        // remains safe because it never mutates the user's existing product data.
        router.replace('/onboarding');
        hideSplashAfterNavigationSettles();
      });
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ChainsProvider>
            <PlanProvider>
              <PlanNotificationResponseHandler />
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProvider>
                  <RootLayoutNav />
                </KeyboardProvider>
              </GestureHandlerRootView>
            </PlanProvider>
          </ChainsProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
