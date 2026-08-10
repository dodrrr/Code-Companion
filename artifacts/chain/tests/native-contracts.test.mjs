import assert from 'node:assert/strict';
import test from 'node:test';

import { CHAIN_PRODUCTS, normalizeSubscriptionSnapshot, subscriptionLabel } from '../domain/subscriptions.ts';

test('subscription snapshots accept only Chain products and valid dates', () => {
  assert.deepEqual(normalizeSubscriptionSnapshot({
    status: 'trial',
    productId: CHAIN_PRODUCTS.annual,
    expirationDate: '2026-08-17T12:00:00.000Z',
  }), {
    status: 'trial',
    productId: CHAIN_PRODUCTS.annual,
    expirationDate: '2026-08-17T12:00:00.000Z',
  });
  assert.deepEqual(normalizeSubscriptionSnapshot({ status: 'active', productId: 'foreign.product', expirationDate: 'bad' }), { status: 'active', productId: undefined, expirationDate: undefined });
  assert.deepEqual(normalizeSubscriptionSnapshot({ status: 'invented' }), { status: 'unavailable' });
});

test('subscription copy distinguishes expired access from early access', () => {
  assert.equal(subscriptionLabel('expired'), 'Expired');
  assert.equal(subscriptionLabel('trial'), 'Trial active');
  assert.equal(subscriptionLabel('unavailable'), 'Early access · not active');
});
