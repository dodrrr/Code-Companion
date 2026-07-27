# Chain mobile app

## Product identity

Chain is a focused habit app built around:

`Plan tonight -> protect the chain -> do not break the chain -> reflect/replan`.

The current core is **Today**, **Gate**, and **Plan**. The immediate product
goal is a dependable Today + Gate MVP; Plan is a later fast-follow release.

## Visual direction (non-negotiable)

- Native-feeling iOS-first React Native, dark by default, calm and premium.
- One accent colour per chain. It must stay consistent in the card, streak,
  progress, history/heatmap, Gate, and related Plan task.
- Strong hierarchy: headline 34-40 pt; supporting/body copy 15-17 pt.
- Use `expo-symbols` / SF Symbols where available. Do not mix unrelated icon
  systems in a screen. Every external app icon needs a non-empty fallback.
- Buttons are deliberately designed pills or rounded controls, not generic
  rectangles. Give press feedback with a short scale/opacity response.
- Motion should be purposeful, short spring transitions via Reanimated, and
  respect Reduce Motion. Avoid decorative long animations.
- Keep generous spacing, clear empty/error/loading states, and dark contrast.

## Architecture and data

- Keep app routes in `app/`, reusable UI in `components/`, and state/business
  rules in `context/` or focused hooks. Avoid placing persistence logic in a
  screen component.
- `ChainsContext` is the current source of truth. Preserve existing local data
  when evolving the schema: version/migrate storage instead of silently
  resetting it.
- Dates displayed and stored as daily records must use the user's local date,
  not UTC conversion. Test around midnight/time-zone boundaries.
- After any update, verify change -> close/reopen -> persisted result. A chain
  edit must never modify another chain or discard its history.

## Chain history rules

- Users can change Today or the previous three local calendar days; future days
  are disabled.
- `Done` uses the chain accent and contributes to the streak.
- `Frozen` uses soft blue and preserves the streak without incrementing it.
- `Missed` is outlined and breaks the active streak.
- Keep these rules as pure helpers where possible and add tests before changing
  the streak calculation.

## Gate: technical honesty

- Never present a mock screen as an OS-level blocker. First establish the
  supported on-device behaviour, entitlement/permission requirement, and
  fallback on each platform.
- Gate must work meaningfully in a native development build, not be signed off
  from Expo Go or web. Permission denial must remain usable and explain the
  next action without a loop.
- The eventual flow is: select apps -> pre-permission explanation -> attempt
  to open selected app -> 5-10 second breathing delay -> chain-specific copy
  such as `Day 23 of Write Daily` -> deliberate continue/back action.

## Definition of done for a change

1. Run the focused TypeScript check.
2. Exercise the changed happy path plus empty, loading/error, and denied
   permission states where relevant.
3. Check the UI on a narrow iPhone-sized viewport and do not regress dark mode.
4. State what changed, any platform limitation, and how it was verified.

## What not to do

- Do not add a library, native plugin, or platform permission merely to make a
  visual mock-up look complete. Explain the capability and dependency first.
- Do not broaden the release with paywall, cloud sync, social features, or AI
  scheduling before the Today + Gate MVP is stable.
- Do not hard-code a chain accent in a screen if that value belongs in shared
  state/tokens.
