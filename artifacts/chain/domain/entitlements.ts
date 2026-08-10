import type { SubscriptionStatus } from './subscriptions';

export type ProductEntitlements = {
  plus: boolean;
  maxActiveChains: number;
  pauseGate: boolean;
  unlimitedPlan: boolean;
};

export function entitlementsFor(status: SubscriptionStatus): ProductEntitlements {
  const plus = status === 'trial' || status === 'active';
  return {
    plus,
    maxActiveChains: plus ? Number.POSITIVE_INFINITY : 1,
    pauseGate: plus,
    unlimitedPlan: plus,
  };
}
