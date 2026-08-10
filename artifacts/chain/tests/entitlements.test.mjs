import assert from 'node:assert/strict';
import test from 'node:test';

import { entitlementsFor } from '../domain/entitlements.ts';

test('trial and active subscriptions unlock the same product surface', () => {
  assert.deepEqual(entitlementsFor('trial'), entitlementsFor('active'));
  assert.equal(entitlementsFor('active').pauseGate, true);
  assert.equal(entitlementsFor('active').maxActiveChains, Number.POSITIVE_INFINITY);
});

test('unavailable, unknown and expired subscriptions remain on the safe free policy', () => {
  for (const status of ['unavailable', 'unknown', 'expired']) {
    const entitlements = entitlementsFor(status);
    assert.equal(entitlements.plus, false);
    assert.equal(entitlements.maxActiveChains, 1);
    assert.equal(entitlements.pauseGate, false);
  }
});
