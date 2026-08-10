import { Platform } from 'react-native';
import { isNativeScreenTimeAvailable } from './screenTimeBridge';
import { isNativeStoreAvailable } from './subscriptionBridge';

export type NativeReadiness = {
  runtime: 'ios' | 'android' | 'web';
  screenTime: boolean;
  subscriptions: boolean;
  productionBuild: boolean;
};

export async function getNativeReadiness(): Promise<NativeReadiness> {
  const [screenTime, subscriptions] = await Promise.all([
    isNativeScreenTimeAvailable(),
    isNativeStoreAvailable(),
  ]);
  return {
    runtime: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    screenTime,
    subscriptions,
    productionBuild: !__DEV__,
  };
}
