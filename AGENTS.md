# Code Companion workspace

## Default scope

The product app is `artifacts/chain`. Treat it as the default target unless a task
explicitly names `api-server`, `mockup-sandbox`, or a library. Do not rewrite or
delete the other artifacts while working on Chain.

## Commands

- Install from the repository root with `pnpm install --frozen-lockfile`.
- Check the app with `pnpm --filter @workspace/chain typecheck`.
- Run the full workspace typecheck only when a shared package changes.
- Do not edit `pnpm-lock.yaml` unless dependencies intentionally change.

## Product order

The next release is a reliable **Today + Gate** MVP. Plan is fast-follow.

1. Gate capability proof on device (stop/go) and a graceful unsupported or
   permission-denied state.
2. Persistent chain state and colour consistency.
3. Calendar/history and streak rules.
4. Gate selection and delay flow.
5. Visual system and onboarding polish.
6. Manual Plan; AI scheduling and daily splash quotes last.

Read `artifacts/chain/AGENTS.md` before editing the app.
