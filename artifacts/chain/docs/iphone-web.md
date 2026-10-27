# Chain on iPhone

The production web build keeps the existing three destinations: Chains, Gate and Plan. It uses the same screens, domain rules and AsyncStorage keys as the existing app. On the web, the floating tab bar recreates the glass appearance with Expo BlurView (CSS backdrop blur in Safari), gradient reflections, a translucent capsule and a spring-animated selection. It supports tapping and sliding across the bar, keyboard activation and reduced motion. Native iOS continues using the existing native tab implementation where available. The Git history reviewed contains a three-tab native glass navigation and an opaque web fallback; the floating web version is recreated from that design direction, not recovered as an identical older component.

## Install

1. Open the published HTTPS app address in Safari.
2. Tap Share, then Add to Home Screen, and open Chain from its icon.
3. On the first visit, stay online until its assets finish downloading. Reopen once with airplane mode to confirm offline availability.
4. Use the installed icon consistently for subsequent visits.

The app works locally after this initial download. The computer and Replit development session do not need to remain running. Background JavaScript is not required to count focus time: sessions store timestamps and reconcile elapsed time when reopened. A timer in progress stops accumulating at its configured target; a paused timer remains paused. Notifications and real Screen Time app blocking are unavailable in the web version.

## Data and recovery

Closing the app, reopening it or installing an app update does not clear the data. All existing `@chain_` storage keys are retained. The app requests persistent browser storage where supported. iOS still controls the final storage policy; deleting website/app data, losing the device, or using a different origin/storage container can make local data unavailable.

Settings includes Export backup and Restore backup. Save exports to Files or iCloud Drive. Exports include all Chain storage entries, including history, preferences, active focus sessions and repository recovery copies. Restore replaces Chain's local snapshot after confirmation, preserving unrelated site storage. It validates the backup format and writes a recovery journal before replacing data. Failed or interrupted restores roll back; startup blocks data providers if recovery cannot complete. Files are not uploaded to a server. Multiple simultaneously open instances are not a synchronization mechanism; close other copies before restoring.

Storage in Expo Go, another browser, a Replit embedded preview and the installed web app may be separate. Existing data in a separate container is not automatically transferred. Keep the same production address; changing domain creates a separate storage origin. Export a backup before any move.

## Build and deploy

From the workspace root:

```sh
pnpm --filter @workspace/chain check
pnpm --filter @workspace/chain build:web
pnpm --filter @workspace/chain serve:web
```

The web export is `artifacts/chain/dist`. The post-export step adds installation metadata, a home-screen icon and a versioned offline cache for every bundled local asset. Service worker installation is atomic: failed asset downloads do not activate an incomplete release. An update is activated when the user selects the update button or when the old app closes. Updates replace app assets, not stored user records. HTTPS is required in production. The supplied server supports route fallbacks, JavaScript/font MIME types and service-worker revalidation.

Replit deployment configuration builds and serves this export while keeping the existing Expo development workflow. Test on a physical iPhone after publishing: add and complete a chain, add a Plan task, start/pause a focus session, close the app, reopen offline, test the next local day, and export/restore a backup. Desktop mobile emulation cannot verify Apple's native glass rendering or physical Dynamic Island dimensions. Web headers use the existing safe-area provider and `viewport-fit=cover`, rather than the old preview-only fixed web offsets.
