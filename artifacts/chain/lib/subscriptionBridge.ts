import { NativeModules } from 'react-native';
import { reportDiagnostic } from './diagnostics';

export type SubscriptionStatus = 'unavailable' | 'unknown' | 'trial' | 'active' | 'expired';

export type SubscriptionSnapshot = {
  status: SubscriptionStatus;
  productId?: string;
  expirationDate?: string;
};

type ChainStoreModule = {
  isAvailable?: () => Promise<boolean>;
  getSubscription?: () => Promise<SubscriptionSnapshot>;
  purchase?: (productId: string) => Promise<SubscriptionSnapshot>;
  restore?: () => Promise<SubscriptionSnapshot>;
  openManagement?: () => Promise<void>;
};

const nativeStore = () => NativeModules.ChainStore as ChainStoreModule | undefined;

function normalizeSnapshot(value?: SubscriptionSnapshot): SubscriptionSnapshot {
  if (!value || !['unknown', 'trial', 'active', 'expired'].includes(value.status)) return { status: 'unavailable' };
  return value;
}

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
    return normalizeSnapshot(await bridge.getSubscription());
  } catch (error) {
    reportDiagnostic({ area: 'native', operation: 'store.subscription', severity: 'error', error });
    return { status: 'unknown' };
  }
}

export async function purchaseSubscription(productId: string): Promise<SubscriptionSnapshot> {
  const bridge = nativeStore();
  if (!bridge?.purchase) return { status: 'unavailable' };
  try {
    return normalizeSnapshot(await bridge.purchase(productId));
  } catch (error) {
    reportDiagnostic({ area: 'native', operation: 'store.purchase', severity: 'error', error });
    return { status: 'unknown' };
  }
}

export async function restoreSubscription(): Promise<SubscriptionSnapshot> {
  const bridge = nativeStore();
  if (!bridge?.restore) return { status: 'unavailable' };
  try {
    return normalizeSnapshot(await bridge.restore());
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
