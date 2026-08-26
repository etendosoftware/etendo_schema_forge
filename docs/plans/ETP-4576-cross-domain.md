# ETP-4576 — cross-domain plan: read the credential scheme, do not declare it

This branch touches many domains on purpose. It is not a feature that leaked
across boundaries: the thing being changed *is* a boundary-crossing decision —
which credential authenticates a request — and it only works if exactly one place
decides it. The core side of the same ticket has its own plan
(`schema_forge_core`, `docs/plans/ETP-4576-cross-domain.md`); this one covers the
host.

## Why it cannot be isolated

Before this, every call site decided for itself: some pasted
`Authorization: Bearer <token>`, some hand-appended `X-Go-CSRF`, some gated on a
token the cookie session never provides — a gate that is permanently false, so
the request is never issued: no error, no failed response, an empty screen.

The scheme therefore cannot be migrated window by window. A single window that
still builds its own header keeps working until the instance flips, and then
fails silently in the one direction nobody tests: reads keep working, because the
browser attaches the session cookie on its own, and only writes come back 403.
That asymmetry is exactly what took the integration suite down mid-cycle, and it
is why the change has to land as one sweep with a repo-wide guard, not as a
per-window migration.

## The decision moved out of the frontend entirely

The first two attempts hard-coded the scheme — `bearer` first, then `cookie` —
and both were wrong in the same way, in opposite directions. Declaring it by hand
is a claim about the *backend* that the frontend has no way to verify.

The app now passes `credentialMode: 'auto'`, and the core resolves it from
evidence: a cookie session issues a CSRF token, a bearer backend does not, so
holding one IS the answer. A bearer instance costs one 401 on boot and then
behaves exactly as it did before.

## Domains touched, and what each one gets

| Scope | Change |
|---|---|
| `platform-change` (`tools/app-shell/src`) | The sweep. Call sites stop building credential headers by hand and go through the shared builders (`jsonHeaders`/`writeHeaders`/`readCredentialHeaders`/`writeCredentialHeaders`), which read the resolved scheme. `App.jsx` declares `auto`. |
| `shared-custom-capability` | Same sweep, in the shared window capabilities (bulk delete, line editors, selectors). These are the call sites that issue unsafe requests, so they are where a missing CSRF proof shows up as a 403. |
| `window:*` | Per-window custom components that built their own headers or threaded a `token` prop. The prop is dropped rather than rewired: the builders own the credential now, so a call site cannot pass the wrong one. |
| `e2e` | The helpers moved off `localStorage['sf_auth_token']`, which is dead — the session lives in memory behind the `__Host-` cookie. `page.request` shares the browser's cookie jar, so reads need no header; the new `sessionWriteHeaders()` reads the CSRF proof from `GET /sws/go/session`, the same endpoint the app restores from. |
| `repo-infra` / `root-global-sensitive` | The core pin (`0.3.40-preview.feature-ETP-4576…fd86f52`) and its lockfiles. That preview is the released core plus this ticket's cookie session; it also carries the epic's ETP-4933 generator, without which `make regen` rewrites committed output. |
| `artifacts/**` | Untouched by hand. Regeneration reproduces the committed tree byte for byte under this pin — verified on amortization, assets, chart-of-accounts and financial-account. |

## Tests

- `tools/app-shell/src/__tests__/sessionContractInvariants.test.js` — four
  repo-wide ratchets with a measured debt list, so the surface can only shrink:
  **G1** (builds a credential header by hand) **0**, **G2** (gates on a
  client-held token) **2**, **G3** (unsafe request without the write proof)
  **12**, **G4** (a backend request carrying no credential at all) **0**.
  The two remaining G2 entries are not debt: Mixpanel's is a project token and
  `InviteAcceptancePage`'s is an invitation token — neither is a session
  credential. The ratchet also scans `artifacts/<window>/custom`, a surface it
  never looked at before; that debt is declared, not hidden (see Rollback).
- A dual-mode suite drives real call sites twice, once per scheme, asserting both
  the header that must be present and the one that must be absent.
- Full suites, run against the published package with no `LOCAL_CORE`:
  node **6526/6527** (1 skipped), vitest **13410/13410**, Playwright `mocked`
  **596/596**.

## Rollback

**The scheme is not pinned by this branch, so there is nothing to roll back to.**
`auto` resolves per instance from what the backend actually issues: an instance
that has not migrated answers login with a bearer token, issues no CSRF, and
therefore keeps behaving exactly as it does today. Shipping this is a no-op for
any such instance — which is precisely what the two hard-coded attempts got
wrong.

If the resolution itself ever has to come out, `CREDENTIAL_MODES.bearer` can be
passed explicitly in `App.jsx` — one line, no deploy of anything else — and the
app returns to the pre-cookie path verbatim.

Two things to know before turning the cookie scheme on for real:

1. **The migration is not finished, and the ratchets say so.** The 38 files under
   `artifacts/<window>/custom` (15 windows) still build their own headers. Under
   a cookie session their unsafe requests answer 403. This is measured debt, not
   an unknown: the ratchet fails if it grows.
2. **The 12 remaining G3 sites are mostly a detector limitation, not debt.** Most
   receive the header bag as a prop, which the static detector cannot resolve;
   they were audited by tracing callers and all pass `writeHeaders()`. Three
   still need a real read: `hooks/useEntity.js`, `explorer/useDiscovery.js`
   (which uses `adminAuthHeaders()`) and `BillingPreferencesForm`.
