# Gate technical spike — decision record

## Decision

Use `expo-app-blocker` as the initial native integration candidate. It supports
Expo SDK 54, provides an Expo config plugin, and covers the two different
platform models that Chain needs:

- **iOS:** Apple Screen Time (`FamilyControls`, `ManagedSettings`,
  `DeviceActivity`) and a system shield.
- **Android:** app detection plus an overlay/redirect flow.

`expo-dev-client` is installed so Chain can move from Expo Go to a native
development build. The blocker is installed but deliberately not configured in
`app.json` yet: a real Apple Team ID, bundle identifier and App Group must be
chosen first. Placeholder identifiers would create broken provisioning data.

## Product decision for iOS v1

Gate on iOS is a **Chain-branded system shield**, not a full-screen Chain view
that can run a custom 5-10 second breathing animation after TikTok is opened.
Apple owns the shield surface. Chain can control the selected apps, title,
subtitle, button labels, icon, colours and limited actions; it cannot provide a
fully custom React Native experience inside that shield.

The recommended v1 copy is therefore concise and chain-specific, for example:

> Day 23 of Write Daily — Pause before you break the chain.

The breathing/countdown interaction remains a Chain in-app interaction, for
example before enabling a temporary unlock, rather than a promise made about the
iOS shield itself.

## What must exist before the first iPhone test

1. An Apple Developer team and a final development bundle identifier.
2. An App Group shared by the main app and the Screen Time extensions.
3. Four registered App IDs: main app, Device Activity Monitor, Shield Action,
   and Shield Configuration.
4. **Family Controls (Development)** enabled for the device build. This permits
   on-device testing; Apple distribution approval is still required before
   TestFlight or App Store release.
5. The matching `ios.appleTeamId`, entitlements and app-group configuration
   added to `app.json` only after the identifiers exist.

## Test plan — first native build

- Install the development build on the iPhone 15 Pro; Expo Go is not valid.
- Request Screen Time permission from an explanation screen, never on launch.
- Choose TikTok or Instagram through the native picker and persist the selection.
- Activate protection, close Chain, open the selected app, and verify the
  system shield appears with Chain copy.
- Verify an unselected app remains available.
- Deny/revoke permission and confirm Gate stays usable, explains recovery, and
  does not loop.
- Force close/reopen Chain and verify protection/selection remains consistent.

## Explicit non-goals of this spike

- No claim that the current `pause-gate-demo` performs OS-level blocking.
- No production build, TestFlight submission, or App Store entitlement request.
- No Android implementation until the iOS device proof passes.

## Result required to close P0-03

Record one of the following outcomes with a short screen recording:

- **Gate complete:** selected iOS apps are shielded and chain copy is correct.
- **Gate limited:** native shield works, but the custom breathing delay is kept
  inside Chain rather than inside the shield.
- **Gate blocked:** provisioning or entitlement prevents a physical-device
  proof; continue Today/persistence work while the Apple setup is resolved.
