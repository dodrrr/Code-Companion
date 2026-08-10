import { NativeModules } from 'react-native';
import { reportDiagnostic } from './diagnostics';
import {
  normalizeSubscriptionSnapshot,
  type ChainProductId,
  type SubscriptionSnapshot,
  type SubscriptionStatus,
} from '@/domain/subscriptions';

export type { SubscriptionSnapshot, SubscriptionStatus } from '@/domain/subscriptions';

type ChainStoreModule = {
  isAvailable?: () => Promise<boolean>;
  getSubscription?: () => Promise<SubscriptionSnapshot>;
  purchase?: (productId: ChainProductId) => Promise<SubscriptionSnapshot>;
  restore?: () => Promise<SubscriptionSnapshot>;
  openManagement?: () => Promise<void>;
};

const nativeStore = () => NativeModules.ChainStore as ChainStoreModule | undefined;

export async function isNativeStoreAvailable(): Promise<boolean> {
  try {
    return Boolean(nativeStore()?.isAvailable && await nativeStore()!.isAvailable!());
  } catch (error) {
    reportDiagnostic({ area: 'native', operation: 'store.available', severity: 'warning', error });
    return false;
  }
}

export async function getSubscriptionSnapshot(): Promise<SubscriptionSnapshot> {
  const bridge = nativeStore();
  if (!bridge?.getSubscription) return { status: 'unavailable' };
  try {
    return normalizeSubscriptionSnapshot(await bridge.getSubscription());
  } catch (error) {
    reportDiagnostic({ area: 'native', operation: 'store.subscription', severity: 'error', error });
    return { status: 'unknown' };
  }
}

export async function purchaseSubscription(productId: ChainProductId): Promise<SubscriptionSnapshot> {
  const bridge = nativeStore();
  if (!bridge?.purchase) return { status: 'unavailable' };
  try {
    return normalizeSubscriptionSnapshot(await bridge.purchase(productId));
  } catch (error) {
    reportDiagnostic({ area: 'native', operation: 'store.purchase', severity: 'error', error });
    return { status: 'unknown' };
  }
}

export async function restoreSubscription(): Promise<SubscriptionSnapshot> {
  const bridge = nativeStore();
  if (!bridge?.restore) return { status: 'unavailable' };
  try {
    return normalizeSubscriptionSnapshot(await bridge.restore());
  } catch (error) {
    reportDiagnostic({ area: 'native', operation: 'store.restore', severity: 'error', error });
    return { status: 'unknown' };
  }
}

export async function openSubscriptionManagement(): Promise<boolean> {
  const bridge = nativeStore();
  if (!bridge?.openManagement) return false;
  try {
    await bridge.openManagement();
    return true;
  } catch (error) {
    reportDiagnostic({ area: 'native', operation: 'store.manage', severity: 'warning', error });
    return false;
  }
}
