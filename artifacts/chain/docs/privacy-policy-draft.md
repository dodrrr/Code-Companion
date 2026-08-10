# Chain privacy policy — publication draft

Last updated: replace before publication.

Chain is designed to keep personal planning data on the device. Before App Store submission this draft must be reviewed, hosted at a public HTTPS URL and updated to match the final native implementation.

## Data handled by Chain

- Chains, tasks, schedules, completion history and settings are stored locally unless a future sync feature is explicitly enabled.
- A locally entered email is not transmitted in the current build.
- Notification scheduling is performed on-device.
- Screen Time app selections use Apple's private Family Controls tokens. Chain must not log, export or expose those tokens.
- Aggregate usage insights, when enabled in a native build, are used only to show the person their own protected-app patterns.
- Purchase state is supplied by Apple through StoreKit. Payment details are never handled by Chain.

## Diagnostics

The current diagnostic buffer is local, bounded and excludes task text, email addresses, app-selection tokens and purchase receipts. Any future remote diagnostics require a separate disclosure and consent decision.

## User controls

The production policy must explain how to remove local data, revoke Screen Time access, disable notifications, restore purchases and contact support.

## Contact

Replace with the final support email and legal operator identity before publication.
