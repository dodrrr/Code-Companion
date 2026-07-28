import React, { useEffect } from 'react';
import { Platform } from 'react-native';
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
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChainsProvider } from '@/context/ChainsContext';
import { PlanProvider } from '@/context/PlanContext';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
      <Stack.Screen name="chain/new" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="chain/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="pause-gate-demo" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
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

  useEffect(() => {
    if (!fontsLoaded && !fontError) return;
    SplashScreen.hideAsync();
    // Check if onboarding is needed
    AsyncStorage.getItem('@chain_onboarded').then((v) => {
      if (!v) {
        router.push('/onboarding');
      }
    });
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const openPlanTask = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as { planItemId?: string; planDate?: string };
      if (!data.planItemId || !data.planDate) return;
      router.push({ pathname: '/(tabs)/plan', params: { taskId: data.planItemId, planDate: data.planDate } });
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(openPlanTask);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openPlanTask(response);
    });
    return () => subscription.remove();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ChainsProvider>
            <PlanProvider>
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
