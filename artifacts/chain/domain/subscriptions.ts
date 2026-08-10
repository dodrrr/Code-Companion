export const CHAIN_PRODUCTS = {
  monthly: 'com.dodrrr.chain.plus.monthly',
  annual: 'com.dodrrr.chain.plus.annual',
} as const;

export type ChainProductId = (typeof CHAIN_PRODUCTS)[keyof typeof CHAIN_PRODUCTS];
export type SubscriptionStatus = 'unavailable' | 'unknown' | 'trial' | 'active' | 'expired';

export type SubscriptionSnapshot = {
  status: SubscriptionStatus;
  productId?: ChainProductId;
  expirationDate?: string;
};

const statuses = new Set<SubscriptionStatus>(['unavailable', 'unknown', 'trial', 'active', 'expired']);
const products = new Set<string>(Object.values(CHAIN_PRODUCTS));

export function normalizeSubscriptionSnapshot(value: unknown): SubscriptionSnapshot {
  if (!value || typeof value !== 'object') return { status: 'unavailable' };
  const raw = value as Partial<SubscriptionSnapshot>;
  if (!raw.status || !statuses.has(raw.status)) return { status: 'unavailable' };
  const productId = typeof raw.productId === 'string' && products.has(raw.productId)
    ? raw.productId as ChainProductId
    : undefined;
  const expirationDate = typeof raw.expirationDate === 'string' && !Number.isNaN(Date.parse(raw.expirationDate))
    ? raw.expirationDate
    : undefined;
  return { status: raw.status, productId, expirationDate };
}

export function subscriptionLabel(status: SubscriptionStatus): string {
  if (status === 'active') return 'Active';
  if (status === 'trial') return 'Trial active';
  if (status === 'expired') return 'Expired';
  return 'Early access · not active';
}
