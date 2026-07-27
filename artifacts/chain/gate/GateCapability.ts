/**
 * Boundary between Chain's React Native UI and platform-level app protection.
 *
 * The first implementation uses expo-app-blocker in a native development
 * build. Web and Expo Go must report an unavailable capability rather than
 * pretending an operating-system shield is active.
 */
export type GatePlatform = 'ios' | 'android' | 'web';

export type GateAvailability =
  | 'ready'
  | 'requires-native-build'
  | 'requires-authorization'
  | 'unsupported';

export interface GateStatus {
  platform: GatePlatform;
  availability: GateAvailability;
  reason?: string;
}

export interface GateCapability {
  getStatus(): Promise<GateStatus>;
  requestAuthorization(): Promise<GateStatus>;
  openAppSelection(): Promise<void>;
  activateProtection(): Promise<void>;
  deactivateProtection(): Promise<void>;
}

/**
 * This intentionally has no implementation yet. It prevents screens from
 * importing a native blocker directly before the device build is configured.
 */
export const gateReleaseRequirement =
  'A physical-device test must pass before Gate can be described as active.';
