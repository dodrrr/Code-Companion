# Phase 2 — Apple readiness

This phase prepares Chain for native Apple services without making Expo Go pretend that those services exist.

## Stable native boundaries

- `screenTimeBridge.ts` owns availability, authorization, private app selection and aggregate usage.
- `subscriptionBridge.ts` owns subscription state, purchase, restore and Apple management.
- Both return explicit `unavailable` states when running in Expo Go.
- Native errors flow into the bounded diagnostic buffer and never contain app-selection tokens or account data.

## Product entitlement policy

The policy lives in `domain/entitlements.ts` so StoreKit transport and product access cannot drift apart. Trial and active subscriptions unlock Plus; unknown, unavailable and expired states fail closed to the free policy. Enforcement remains disabled during early access and must only be enabled with the paywall release.

## Build preparation

`eas.json` defines development, internal preview and production profiles. `pnpm release:doctor` validates structural App Store requirements. It intentionally fails until real privacy and support URLs replace missing configuration.

## Remaining Apple work

1. Enrol in Apple Developer and confirm the final bundle identifier.
2. Request the Family Controls entitlement and document the user benefit for review.
3. Implement `ChainScreenTime` with FamilyControls, ManagedSettings and DeviceActivity.
4. Implement `ChainStore` with StoreKit 2 products and transaction verification.
5. Publish real privacy/support pages and add their URLs to Expo config.
6. Create the EAS project, signing credentials, App Store Connect record and TestFlight group.
7. Run the physical-device release audit from Phase 1 before enabling entitlements or the paywall.
