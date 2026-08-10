import { NativeModules } from 'react-native';
import { reportDiagnostic } from './diagnostics';

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

function normalizeApps(value: unknown): ScreenTimeApp[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const unique = new Map<string, ScreenTimeApp>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Partial<ScreenTimeApp>;
    if (typeof raw.id !== 'string' || !raw.id || typeof raw.label !== 'string' || !raw.label.trim()) continue;
    unique.set(raw.id, { id: raw.id, label: raw.label.trim() });
  }
  return [...unique.values()];
}

function normalizeUsage(value: unknown): ProtectedAppUsage[] | undefined {
  const apps = normalizeApps(value);
  if (!apps || !Array.isArray(value)) return undefined;
  const minutesById = new Map<string, number>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Partial<ProtectedAppUsage>;
    if (typeof raw.id === 'string' && typeof raw.minutes === 'number' && Number.isFinite(raw.minutes)) {
      minutesById.set(raw.id, Math.max(0, Math.round(raw.minutes)));
    }
  }
  return apps.map((app) => ({ ...app, minutes: minutesById.get(app.id) ?? 0 }));
}

type ChainScreenTimeModule = {
  isAvailable?: () => Promise<boolean>;
  authorizationStatus?: () => Promise<ScreenTimeAuthorizationStatus>;
  requestAuthorization?: () => Promise<ScreenTimeAuthorizationStatus>;
  pickApps?: () => Promise<ScreenTimeApp[]>;
  getWeeklyUsage?: (appIds: string[]) => Promise<ProtectedAppUsage[]>;
};

export type ScreenTimeAuthorizationStatus = 'notDetermined' | 'denied' | 'approved' | 'unavailable';

function module(): ChainScreenTimeModule | undefined {
  return NativeModules.ChainScreenTime as ChainScreenTimeModule | undefined;
}

export async function isNativeScreenTimeAvailable(): Promise<boolean> {
  try {
    return Boolean(module()?.isAvailable && await module()!.isAvailable!());
  } catch (error) {
    reportDiagnostic({ area: 'native', operation: 'screenTime.available', severity: 'warning', error });
    return false;
  }
}

export async function getScreenTimeAuthorizationStatus(): Promise<ScreenTimeAuthorizationStatus> {
  const bridge = module();
  if (!bridge?.authorizationStatus) return 'unavailable';
  try {
    const status = await bridge.authorizationStatus();
    return ['notDetermined', 'denied', 'approved'].includes(status) ? status : 'unavailable';
  } catch (error) {
    reportDiagnostic({ area: 'native', operation: 'screenTime.authorizationStatus', severity: 'warning', error });
    return 'unavailable';
  }
}

export async function requestScreenTimeAuthorization(): Promise<ScreenTimeAuthorizationStatus> {
  const bridge = module();
  if (!bridge?.requestAuthorization) return 'unavailable';
  try {
    const status = await bridge.requestAuthorization();
    return ['notDetermined', 'denied', 'approved'].includes(status) ? status : 'unavailable';
  } catch (error) {
    reportDiagnostic({ area: 'native', operation: 'screenTime.requestAuthorization', severity: 'error', error });
    return 'unavailable';
  }
}

export async function pickProtectedApps(): Promise<ScreenTimeApp[] | undefined> {
  const bridge = module();
  if (!bridge?.pickApps) return undefined;
  try {
    return normalizeApps(await bridge.pickApps());
  } catch (error) {
    reportDiagnostic({ area: 'native', operation: 'screenTime.pickApps', severity: 'error', error });
    return undefined;
  }
}

export async function getProtectedAppsWeeklyUsage(appIds: string[]): Promise<ProtectedAppUsage[] | undefined> {
  const bridge = module();
  if (!bridge?.getWeeklyUsage) return undefined;
  try {
    return normalizeUsage(await bridge.getWeeklyUsage(Array.from(new Set(appIds.filter(Boolean)))));
  } catch (error) {
    reportDiagnostic({ area: 'native', operation: 'screenTime.weeklyUsage', severity: 'error', error });
    return undefined;
  }
}
