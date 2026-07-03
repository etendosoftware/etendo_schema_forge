# ETP-4433 Cross-Domain Plan

## Domains changed

| Domain | Files | Reason |
|--------|-------|--------|
| `platform-change` | `tools/app-shell/vite.config.js` | Add `optimizeDeps.include: ['react-day-picker']` so Vite pre-bundles it despite `app-shell-core` being excluded — this is the fix that eliminates the date-fns locale barrel request storm (ETP-4431/ETP-4433) that caused CI E2E timeouts on a cold dev cache |
| `root-global-sensitive` | `package.json`, `package-lock.json` (root) | Bump `@etendosoftware/app-shell-core` devDependency from `0.2.0` to `0.2.1` — mechanically the same version bump as `tools/app-shell/package.json`'s own dependency entry, kept in sync so both the root CLI tooling and the app consume the same fixed release |

Both domains are touched by a single, indivisible change: consuming the newly-released `app-shell-core@0.2.1` (which fixes the calendar.jsx date-fns/locale barrel import — see schema_forge_core PR #21) requires bumping the version everywhere it's declared (root devDependency + tools/app-shell dependency), and the `optimizeDeps.include` addition is the accompanying consumer-side half of the same fix.

## Tests

- Cold Vite dev cache (fresh `npm install`, no `.vite` cache) — confirmed request count for `/dashboard` dropped from 1387 to 462 after this change
- Re-ran the three Playwright specs that were timing out in Jenkins CI (`amortization.mocked.spec.js`, `not-posted-documents.mocked.spec.js`, `goods-shipment-confirm-and-invoice.mocked.spec.js`) against a cold dev server with this fix — all pass in 8-14s (previously ~2.4min timeout)
- Full `tools/app-shell` unit suite: 8209/8209 tests passing (446 files)

## Rollback

Revert this PR. No DB, backend, or NEO Headless changes — purely a frontend build-tooling dependency bump plus a Vite dev-server optimization hint. Safe to revert independently of schema_forge_core's `app-shell-core@0.2.1` release (the app would simply fall back to the slower cold-start behavior, not break).
