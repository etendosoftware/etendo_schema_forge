/**
 * Request headers for this app, re-exported from the platform.
 *
 * ETP-4576 — the builders used to live here and hard-coded one credential
 * scheme. They now come from `app-shell-core`'s `sessionCredentials`, which is
 * the single place that decides between the two schemes that coexist while the
 * migration lands:
 *
 *  - `bearer` — today's shipped behaviour, `Authorization: Bearer <token>`.
 *  - `cookie` — the SEC-10 target: the session is the `__Host-go_session`
 *               cookie, no header carries a credential, and unsafe methods
 *               prove intent with `X-Go-CSRF`.
 *
 * Which one is active comes from a backend preference, so switching is a
 * database change rather than a redeploy — that is what makes it safe to try
 * CSRF and back out of it. Bearer is the default.
 *
 * The point of re-exporting rather than wrapping: a call site asks for
 * `jsonHeaders()` or `writeHeaders()` and never learns which scheme is active.
 * That is why migrating a call site is mechanical — it only has to stop
 * hand-building headers.
 *
 * Kept as a module here (instead of every caller importing the package) because
 * ~170 call sites already import from this path, and it gives the app one place
 * to look when asking "how do requests authenticate?".
 */
// Imported from the `sessionCredentials` leaf, NOT the `./auth` barrel. The
// barrel re-exports `AuthContext.jsx`, so going through it pulls React and a
// `.jsx` file into the graph of every module that only wanted headers. Vite does
// not care; `node --test` has no JSX loader and dies with
// ERR_UNKNOWN_FILE_EXTENSION before running a single assertion — which took out
// two whole unit-test files the first time a util here started asking for
// headers. Keep this pointed at the leaf.
export {
  jsonHeaders,
  writeHeaders,
} from '@etendosoftware/app-shell-core/auth/sessionCredentials.js';

// `credentialOptions` (the `{ credentials: 'include' }` bag) was re-exported here
// too and never adopted — every call site writes the literal. Dropped rather than
// left dangling: it was also the first name Node failed to resolve when these
// modules load outside Vite, which made that error point at the least relevant of
// the three.
