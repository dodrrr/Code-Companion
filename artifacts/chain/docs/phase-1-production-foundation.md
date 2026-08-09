# Phase 1 — Production foundation

This phase freezes the current product behavior while making its critical rules safe to evolve.

## Release gate

Every pull request and every push to `main` must pass:

1. TypeScript for shared packages and the Expo app.
2. Native Node tests for domain rules.
3. A frozen-lockfile install in CI.

Run the same gate locally with:

```bash
pnpm run check
```

## Protected contracts

### Chains

- Dates are local `YYYY-MM-DD` calendar keys, never UTC day keys.
- Daily rest days and freezes preserve continuity without increasing the streak.
- Weekly streaks count completed weeks, and an unfinished current week does not erase history.
- A date can have only one status: done, minimum, frozen, or missed.
- Safety-net credits are capped at two and one is restored after 14 real completions.
- Legacy payloads are normalized before entering React state.

### Plan

- Stored tasks are normalized before entering React state.
- A reminder value of `0` means “when the task starts” and is valid.
- Repeat days are unique and restricted to Sunday–Saturday values.
- Empty or malformed tasks never enter the visible plan.
- Date rollover uses the device calendar and timezone.
- Visible writes are serialized so rapid actions cannot overwrite each other.

## Storage evolution rule

Persisted data must only change through an explicit schema version and a tested migration:

1. Read the existing payload.
2. Normalize or migrate it without mutating the source.
3. Keep unknown/corrupt records out of UI state.
4. Write the new payload only after the migration succeeds.
5. Keep the previous reader until the migrated release has been in production.

No feature may rename an AsyncStorage key or change a stored shape without adding a migration test first.

## Implemented production safeguards

- Chains and every daily Plan use versioned envelopes. The previous valid envelope is retained as a backup and restored after corrupt primary storage.
- Storage and notification-response failures emit bounded, structured diagnostics without task text, chain names, email, or other user content.
- Automated tests cover Today → Tomorrow repeat rollover and Done, Snooze, Open notification routing.
- Primary Chain controls expose VoiceOver roles, labels, hints and state; shared press animation respects Reduce Motion.
- Rapid mutations are serialized and React state is backed by refs to prevent stale-state data loss.

## iPhone performance and accessibility audit

The static audit covers the highest-frequency journey: cold launch → Chains → mark complete → Plan → reminder response.

| Area | Current safeguard | Physical release-build gate |
|---|---|---|
| Cold launch | Storage hydration is async, recoverable and cannot block readiness forever | Measure time-to-interactive on oldest supported iPhone |
| Chain creation | Destination is prefetched and shared animation avoids layout-heavy work | Confirm first and subsequent modal opens at 60 fps |
| Long lists | Derived rules live outside render and writes are serialized | Profile 50 Plan tasks and 25 historical Chain entries |
| Motion | Shared press interaction respects Reduce Motion | Verify transitions with Reduce Motion on and off |
| VoiceOver | Primary create, settings, card and completion controls are named and stateful | Complete a full daily loop using VoiceOver only |
| Dynamic Type | Critical titles already constrain lines and scale where necessary | Test default, XL and accessibility text sizes for clipping |
| Touch targets | Critical completion controls use expanded hit slop | Inspect every trailing icon for a 44×44 pt effective target |

Before subscriptions or Screen Time entitlements are enabled, a TestFlight smoke pass must verify cold start, tab switching, editors, notification actions, midnight rollover, offline relaunch, data recovery, VoiceOver, Dynamic Type and Reduce Motion.
