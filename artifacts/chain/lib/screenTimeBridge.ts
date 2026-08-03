import { NativeModules } from 'react-native';

/**
 * The JS-facing contract for Chain's future Screen Time native module.
 *
 * It deliberately works with opaque identifiers: iOS does not let an app scan
 * a person's installed apps. FamilyActivityPicker lets the person choose what
 * to protect, then the native layer owns the corresponding tokens.
 */
export type ScreenTimeApp = {
  id: string;
  label: string;
};

export type ProtectedAppUsage = ScreenTimeApp & {
  minutes: number;
};

type ChainScreenTimeModule = {
  isAvailable?: () => Promise<boolean>;
  pickApps?: () => Promise<ScreenTimeApp[]>;
  getWeeklyUsage?: (appIds: string[]) => Promise<ProtectedAppUsage[]>;
};

function module(): ChainScreenTimeModule | undefined {
  return NativeModules.ChainScreenTime as ChainScreenTimeModule | undefined;
}

export async function isNativeScreenTimeAvailable(): Promise<boolean> {
  try {
    return Boolean(module()?.isAvailable && await module()!.isAvailable!());
  } catch {
    return false;
  }
}

export async function pickProtectedApps(): Promise<ScreenTimeApp[] | undefined> {
  const bridge = module();
  if (!bridge?.pickApps) return undefined;
  try {
    return await bridge.pickApps();
  } catch {
    return undefined;
  }
}

export async function getProtectedAppsWeeklyUsage(appIds: string[]): Promise<ProtectedAppUsage[] | undefined> {
  const bridge = module();
  if (!bridge?.getWeeklyUsage) return undefined;
  try {
    return await bridge.getWeeklyUsage(appIds);
  } catch {
    return undefined;
  }
}
