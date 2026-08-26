import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

/**
 * Repo-wide invariants for the cookie-session contract (ETP-4576).
 *
 * Why these exist rather than relying on the unit suites: the failure mode of this
 * migration is silent. A `if (!token) return` does not throw — it makes the request
 * never happen, and the component renders empty. The vitest suites mock the very
 * hooks being migrated, so they stayed green (11166 passing) while 62 Playwright
 * specs were failing on exactly this. Playwright does catch it, but it covers the
 * flows it covers, not every file.
 *
 * ─── THESE ARE RATCHETS, NOT COMPLETION PROOFS ──────────────────────────────
 *
 * They were originally written as `assert.deepEqual(offenders, [])` — "when they
 * pass, the migration is complete by definition". They never passed, because they
 * never RAN: this file lives in `src/__tests__/`, which `npm test`'s glob did not
 * cover (the globs are per-directory and not recursive) and which vitest does not
 * pick up either (its include is `*.vitest.*` / `*.spec.*`). Wiring them in
 * revealed the real scope: 62 files still build a credential header and 46 still
 * gate on a client-held token. ETP-4576 migrated a slice of the app, not the app.
 *
 * So each rule now carries the list of files that still violate it, and asserts
 * two things:
 *   1. no file OUTSIDE the list violates it — new code cannot add to the debt;
 *   2. every file IN the list still violates it — a fixed file must be removed
 *      from the list, so the list can only shrink.
 *
 * That second half is what makes it a ratchet rather than a suppression. When a
 * list reaches zero, delete it and restore the `deepEqual(offenders, [])` form:
 * at that point the rule really is a completion proof.
 *
 * Paths are file-level on purpose. Line numbers would churn on every unrelated
 * edit and make the list a merge-conflict magnet.
 *
 * IMPORTANT — comments are stripped before matching. The migrated code explains
 * itself with prose like "instead of a bearer token", and a naive whole-file regex
 * would match that forever. Only executable code is asserted on.
 */

const SRC = resolve(import.meta.dirname, '..');

/**
 * The second surface (ETP-4576).
 *
 * `SRC` alone was the whole scan, and that was a blind spot rather than a choice:
 * the per-window code under `artifacts/<window>/custom/` is app code — it issues
 * its own fetches and builds its own headers — but it lives outside `app-shell/src`,
 * so every rule below silently skipped it. Extending the walk here found 39 files
 * across 15 windows still hand-building `Bearer ${token}`, which means their
 * actions carry no credential at all once the cookie preference is on.
 *
 * `artifacts/<window>/generated/` is deliberately NOT walked: it is regenerated
 * from `decisions.json`, so a finding there has to be fixed in the generator, and
 * a debt list of generated paths would churn on every regen. Nothing under
 * `generated/` matches these rules today, which is why that exclusion costs
 * nothing at present.
 *
 * Paths from this root are prefixed `artifacts/…` in the debt lists so a reader
 * can tell the two surfaces apart at a glance.
 */
const ARTIFACTS = resolve(import.meta.dirname, '../../../../artifacts');

/** Reads this contract's own vocabulary; asserting on it would be circular. */
const EXEMPT = new Set([
  'test/sessionContract.js',      // the assertion helper: it looks FOR these strings
  'test/authContextMock.js',      // the shared useAuth mock
  '__tests__/sessionContractInvariants.test.js',
]);

function sourceFiles(dir = SRC, acc = [], base = SRC) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      sourceFiles(p, acc, base);
    } else if (/\.(js|jsx)$/.test(entry.name) && !/\.(test|vitest)\./.test(entry.name)) {
      const rel = relative(base, p);
      if (!EXEMPT.has(rel)) acc.push({ rel, path: p });
    }
  }
  return acc;
}

/**
 * Strips comments and string/template literals.
 *
 * Literals go too: a URL or a toast message may legitimately contain the word
 * "token" (`/oauth2/token`, "Tu sesión expiró"), and those are not credentials in
 * a header. What remains is identifiers and operators — where a real gate lives.
 */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\[\s\S]|\$\{[^{}]*\}|[^`\\])*`/g, '`L`')
    .replace(/'(?:\\.|[^'\\])*'/g, "'L'")
    .replace(/"(?:\\.|[^"\\])*"/g, '"L"');
}

/**
 * Only `custom/` under each window, for the reason given on ARTIFACTS above. A
 * missing or unreadable directory is not an error: a checkout that has not run the
 * generator has no artifacts tree, and the SRC rules must still run.
 */
function artifactFiles() {
  const acc = [];
  let windows;
  try {
    windows = readdirSync(ARTIFACTS, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const w of windows) {
    if (!w.isDirectory()) continue;
    const custom = join(ARTIFACTS, w.name, 'custom');
    try {
      readdirSync(custom);
    } catch {
      continue;
    }
    for (const f of sourceFiles(custom, [], custom)) {
      acc.push({ rel: `artifacts/${w.name}/custom/${f.rel}`, path: f.path });
    }
  }
  return acc;
}

const FILES = [...sourceFiles(), ...artifactFiles()].map((f) => {
  const raw = readFileSync(f.path, 'utf8');
  return { ...f, raw, code: code(raw) };
});

/**
 * G3's helpers. They need the raw source, not `code()`'s output: the HTTP method IS
 * a string literal (`method: 'POST'`), and `code()` replaces every literal with 'L'
 * precisely so G1/G2 cannot match prose. So only comments are stripped here.
 */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

// What counts as carrying the write proof. `writeCredentialHeaders` belongs here
// even though its name does not say "write headers": it IS `writeHeaders()` with
// `Content-Type` stripped, which is what a multipart upload or a bodyless DELETE
// needs, and it keeps the `X-Go-CSRF` header. Leaving it out made the detector
// report proof-carrying uploads and deletes as offenders (ETP-4576).
const PROOF = /\bwriteHeaders\b|\bbuildWriteHeaders\b|\bwriteCredentialHeaders\b|X-Go-CSRF/;
const UNSAFE_METHOD = /^(POST|PUT|PATCH|DELETE|VAR)$/i;

/** The argument list of the call starting at `at`, matched by paren balance. */
function callArgs(src, at) {
  let depth = 0;
  const open = src.indexOf('(', at);
  for (let k = open; k < src.length && k < open + 4000; k += 1) {
    if (src[k] === '(') depth += 1;
    else if (src[k] === ')') { depth -= 1; if (depth === 0) return src.slice(at, k + 1); }
  }
  return src.slice(at, at + 1200);
}

/**
 * Unsafe-method fetch sites in one file that carry no write proof.
 *
 * Deliberately LENIENT: when the headers come from an identifier it resolves that
 * identifier's definition in the same file and accepts it if the definition
 * mentions a write builder — including `const authHeaders = writeHeaders;`, a
 * reference with no call parens, which an earlier version of this check missed and
 * reported as a violation. A ratchet that cries wolf gets deleted, so it errs
 * toward under-reporting rather than blocking a correct call site.
 *
 * `VAR` means the method itself is a variable (`fetch(url, { method, ... })`).
 * Those count: a site that can be called with DELETE needs the proof.
 */
function unsafeSitesWithoutProof(raw) {
  const src = stripComments(raw);
  const hits = [];
  const re = /\bfetch\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const seg = callArgs(src, m.index);
    // The CSRF proof is scoped to Etendo's own session. Handing it to a
    // third-party service would leak it, so those POSTs are correct as they are.
    if (THIRD_PARTY_SERVICE.test(seg)) continue;
    const explicit = seg.match(/method\s*:\s*['"`]([A-Za-z]+)['"`]/);
    const method = explicit
      ? explicit[1]
      : (/method\s*,|method\s*:\s*method/.test(seg) ? 'VAR' : 'GET');
    if (!UNSAFE_METHOD.test(method)) continue;
    if (PROOF.test(seg)) continue;
    const named = seg.match(/headers\s*:\s*([A-Za-z_$][\w$]*)/);
    const id = named ? named[1] : (/headers\s*,/.test(seg) ? 'headers' : null);
    if (id) {
      const def = src.match(new RegExp(`(?:const|let|var|function)\\s+${id}\\b[\\s\\S]{0,800}`));
      if (def && PROOF.test(def[0])) continue;
    }
    hits.push(method);
  }
  return hits;
}

/**
 * Files that still build a credential header (G1).
 *
 * ETP-4576 — the `app-shell/src` half of this list reached ZERO: no file there
 * hand-builds an Authorization/Bearer header any more, and every call site asks a
 * builder for one without learning which scheme is active. Do not put an
 * `app-shell/src` path back here; the fix is to use the builder, not to list the
 * file.
 *
 * What remains is the per-window `custom` batch, which this rule only started
 * seeing when the scan grew a second root.
 */
const G1_DEBT = new Set([
  // -- artifacts/<window>/custom (ETP-4576) ----------------------------------
  // Measured, not migrated. Extending the scan to the per-window `custom/` trees
  // (see ARTIFACTS above) surfaced these at once; they were never swept because no
  // rule looked at them. Listing them freezes the count -- new per-window code has
  // to use the builders -- and leaves the migration as its own piece of work.
  'artifacts/amortization/custom/AmortizationConfirmModal.jsx',
  'artifacts/chart-of-accounts/custom/AccountTreeView.jsx',
  'artifacts/chart-of-accounts/custom/NewAccountModal.jsx',
  'artifacts/goods-receipt/custom/GoodsReceiptActions.jsx',
  'artifacts/goods-receipt/custom/GoodsReceiptBottomPanel.jsx',
  'artifacts/goods-shipment/custom/BulkInvoiceFromShipment.jsx',
  'artifacts/goods-shipment/custom/GoodsShipmentActions.jsx',
  'artifacts/goods-shipment/custom/GoodsShipmentBottomPanel.jsx',
  'artifacts/internal-consumption/custom/InternalConsumptionActions.jsx',
  'artifacts/payment-in/custom/ApplyToInvoices.jsx',
  'artifacts/payment-in/custom/NewPaymentModal.jsx',
  'artifacts/payment-in/custom/PaymentActivity.jsx',
  'artifacts/payment-in/custom/PaymentActivityPanel.jsx',
  'artifacts/payment-in/custom/PaymentBottomPanel.jsx',
  'artifacts/payment-in/custom/PaymentSummaryCard.jsx',
  'artifacts/payment-out/custom/PaymentOutBottomPanel.jsx',
  'artifacts/physical-inventory/custom/GenerateLinesModal.jsx',
  'artifacts/physical-inventory/custom/InventoryCreateListModal.jsx',
  'artifacts/physical-inventory/custom/InventoryMenuContent.jsx',
  'artifacts/physical-inventory/custom/InventoryTopbarActions.jsx',
  'artifacts/purchase-invoice/custom/PurchaseInvoiceBottomPanel.jsx',
  'artifacts/purchase-order/custom/BulkPurchaseOrderMoreMenu.jsx',
  'artifacts/purchase-order/custom/PurchaseOrderActions.jsx',
  'artifacts/purchase-order/custom/PurchaseOrderDraftChips.jsx',
  'artifacts/return-material-receipt/custom/ReturnMaterialReceiptBottomPanel.jsx',
  'artifacts/return-to-vendor-shipment/custom/ReturnToVendorShipmentBottomPanel.jsx',
  'artifacts/sales-invoice/custom/InvoiceBottomPanel.jsx',
  'artifacts/sales-invoice/custom/InvoiceTopbarExtra.jsx',
  'artifacts/sales-invoice/custom/PaymentPlanBlock.jsx',
  'artifacts/sales-order/custom/BulkOrderMoreMenu.jsx',
  'artifacts/sales-order/custom/OrderCreateInvoice.jsx',
  'artifacts/sales-order/custom/OrderDraftChips.jsx',
  'artifacts/sales-quotation/custom/CreateRejectReasonModal.jsx',
  'artifacts/sales-quotation/custom/QuotationConfirmModal.jsx',
  'artifacts/sales-quotation/custom/QuotationTopbarActions.jsx',
  'artifacts/sales-quotation/custom/RejectQuotationModal.jsx',
  'artifacts/sales-quotation/custom/SendToEvaluationModal.jsx',
]);

/**
 * Files that still gate on a client-held token (G2). Same rules as G1_DEBT — and
 * heavily overlapping with it, because the two smells travel together.
 *
 * ETP-4576 — the two `app-shell/src` entries are NOT debt and must stay: neither
 * `token` is a session credential. `mixpanel.js` gates on the Mixpanel project
 * token, and `InviteAcceptancePage` on the invitation token from the emailed link,
 * which IS that request's credential. Everything else on this surface was migrated.
 */
const G2_DEBT = new Set([
  // Not debt — see above: neither token is the session credential.
  'lib/observability/providers/mixpanel.js',
  'pages/InviteAcceptancePage.jsx',
  // -- artifacts/<window>/custom (ETP-4576) ----------------------------------
  // Same measured-not-migrated batch as G1's. A `!token` gate here is the silent
  // failure at its most literal: the window's panel renders, and its action simply
  // never fires.
  'artifacts/chart-of-accounts/custom/AccountTreeView.jsx',
  'artifacts/chart-of-accounts/custom/NewAccountModal.jsx',
  'artifacts/payment-in/custom/ApplyToInvoices.jsx',
  'artifacts/payment-in/custom/PaymentActivity.jsx',
  'artifacts/payment-in/custom/PaymentActivityPanel.jsx',
  'artifacts/payment-in/custom/PaymentBottomPanel.jsx',
  'artifacts/payment-in/custom/PaymentSummaryCard.jsx',
  'artifacts/payment-out/custom/PaymentOutBottomPanel.jsx',
]);

/**
 * Files that issue an unsafe request without the write proof (G3).
 *
 * ETP-4576 — most `app-shell/src` entries here take their header bag as a PROP, so
 * the detector cannot resolve it and reports the receiving component. Each was
 * audited by tracing its callers: they all pass `writeHeaders()` now. They stay
 * listed because the rule still cannot prove that from the file alone, and dropping
 * them would stop it watching a real crossing point.
 */
const G3_DEBT = new Set([
  'components/contract-ui/CloneOrderModal.jsx',
  'components/contract-ui/ConfirmDocumentModal.jsx',
  'components/contract-ui/ConfirmInOutModal.jsx',
  'components/contract-ui/CreateContactModal.jsx',
  'components/contract-ui/ImportLinesModal.jsx',
  'components/import-return-lines/ImportReturnLinesModal.jsx',
  'explorer/useDiscovery.js',
  'hooks/useEntity.js',
  'pages/InviteAcceptancePage.jsx',
  'windows/custom/contacts/BillingPreferencesForm.jsx',
  'windows/custom/return-material-receipt/ImportFromShipmentModal.jsx',
  'windows/custom/return-to-vendor-shipment/ImportFromReceiptModal.jsx',
  // -- artifacts/<window>/custom (ETP-4576) ----------------------------------
  // Measured, not migrated. Extending the scan to the per-window `custom/` trees
  // (see ARTIFACTS above) surfaced these at once; they were never swept because no
  // rule looked at them. Listing them freezes the count -- new per-window code has
  // to use the builders -- and leaves the migration as its own piece of work.
  'artifacts/amortization/custom/AmortizationConfirmModal.jsx',
  'artifacts/chart-of-accounts/custom/NewAccountModal.jsx',
  'artifacts/goods-receipt/custom/GoodsReceiptActions.jsx',
  'artifacts/goods-receipt/custom/ImportFromPurchaseOrderModal.jsx',
  'artifacts/goods-receipt/custom/PurchaseReturnWizard.jsx',
  'artifacts/goods-shipment/custom/BulkInvoiceFromShipment.jsx',
  'artifacts/goods-shipment/custom/GoodsShipmentActions.jsx',
  'artifacts/goods-shipment/custom/ReturnWizard.jsx',
  'artifacts/internal-consumption/custom/InternalConsumptionActions.jsx',
  'artifacts/payment-in/custom/ApplyToInvoices.jsx',
  'artifacts/payment-in/custom/NewPaymentModal.jsx',
  'artifacts/payment-in/custom/PaymentActivityPanel.jsx',
  'artifacts/physical-inventory/custom/GenerateLinesModal.jsx',
  'artifacts/physical-inventory/custom/InventoryCreateListModal.jsx',
  'artifacts/physical-inventory/custom/InventoryMenuContent.jsx',
  'artifacts/physical-inventory/custom/InventoryTopbarActions.jsx',
  'artifacts/purchase-invoice/custom/ImportFromGoodsReceiptModal.jsx',
  'artifacts/purchase-invoice/custom/ImportFromGoodsReturnModal.jsx',
  'artifacts/purchase-invoice/custom/ImportFromPurchaseOrderModal.jsx',
  'artifacts/purchase-invoice/custom/ImportFromSourceInvoiceModal.jsx',
  'artifacts/purchase-order/custom/BulkPurchaseOrderMoreMenu.jsx',
  'artifacts/purchase-order/custom/PurchaseOrderActions.jsx',
  'artifacts/sales-invoice/custom/ImportFromOrderModal.jsx',
  'artifacts/sales-invoice/custom/ImportFromReturnShipmentModal.jsx',
  'artifacts/sales-invoice/custom/ImportFromShipmentModal.jsx',
  'artifacts/sales-invoice/custom/ImportFromSourceInvoiceModal.jsx',
  'artifacts/sales-invoice/custom/InvoiceTopbarExtra.jsx',
  'artifacts/sales-order/custom/BulkOrderMoreMenu.jsx',
  'artifacts/sales-order/custom/OrderCreateInvoice.jsx',
  'artifacts/sales-quotation/custom/CreateRejectReasonModal.jsx',
  'artifacts/sales-quotation/custom/QuotationConfirmModal.jsx',
  'artifacts/sales-quotation/custom/RejectQuotationModal.jsx',
  'artifacts/sales-quotation/custom/SendToEvaluationModal.jsx',
]);

const GATE = /!\s*(?:token|authToken|accessToken|bearerToken)\b|\b(?:token|authToken)\s*\?\s*\{/;

/**
 * G4's detector: backend requests that carry NO credential at all.
 *
 * This is the gap G1-G3 leave open, and it is not hypothetical — it is how two
 * live bugs survived the whole sweep. G1 looks for a hand-built Authorization,
 * G2 for a `!token` gate, G3 for an unsafe method missing the write proof. A GET
 * that simply passes no headers matches none of them, so `useCsvExport` and
 * `useDashboardData`'s fetchWidget sat there sending nothing: authenticated by
 * accident under `cookie` (the browser attaches the `__Host-` session on its own)
 * and 401 under `bearer`. Both failed SILENTLY — one returned an empty export,
 * the other swallowed the error and rendered a zeroed dashboard.
 *
 * Lenient by construction, like G3: when the headers come from an identifier this
 * resolves it in-file and accepts anything credential-bearing, and when it CANNOT
 * resolve it (a prop, a hook result) it stays quiet. A hand-built bearer counts as
 * a credential here on purpose — it is wrong, but it is G1's wrong, not G4's.
 */
const CREDENTIAL = /jsonHeaders|writeHeaders|readCredentialHeaders|writeCredentialHeaders|credentialHeaders|buildWriteHeaders|Authorization|X-Go-CSRF/;
const BACKEND_URL = /\/sws\/|apiBase|apiBaseUrl|API_BASE/;

/**
 * Endpoints where sending no credential is the DESIGN, not an oversight:
 *
 *  - `/sws/go/session` GET is the cookie-session restore. Its whole point is that
 *    the `__Host-` cookie is the only credential; a bearer there would defeat it.
 *  - The `company-invitations/*` pair (`resolve`, `register-and-accept`) is reached
 *    from an emailed link by someone who is not signed in and may not even have an
 *    account yet. The invitation token IS the credential there.
 *
 * Matched on the URL rather than the file so an unrelated violation in the same
 * file still gets caught.
 */
const UNAUTHENTICATED_BY_DESIGN = /sws\/go\/session['"`\s)]|company-invitations\//;

/**
 * Services that are NOT the Etendo backend. `X-Go-CSRF` is a proof about an
 * Etendo session; sending it to a foreign origin discloses it for nothing, so a
 * POST here carrying no proof is the correct shape rather than debt to pay.
 *
 *  - `/jsreport/api/report` is the sidecar that turns HTML into a PDF. It takes
 *    the document body and returns bytes; it never touches Etendo data.
 */
const THIRD_PARTY_SERVICE = /\/jsreport\//;

function credentiallessBackendSites(raw) {
  const src = stripComments(raw);
  const hits = [];
  // `\bfetch\s*\(` alone also matches `spec.fetch(...)`, a method on a local
  // object — hence the explicit "not preceded by a dot".
  const re = /(^|[^.\w$])fetch\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const at = m.index + m[1].length;
    const seg = callArgs(src, at);
    if (!BACKEND_URL.test(seg)) continue;
    if (UNAUTHENTICATED_BY_DESIGN.test(seg)) continue;
    if (CREDENTIAL.test(seg)) continue;
    // A headers OBJECT LITERAL can still carry the credential through a spread
    // (`headers: { ...authHeaders(), 'Content-Type': … }`). Resolve the spread
    // before judging: that call site is G1's problem, not G4's.
    const spread = seg.match(/headers\s*:\s*\{[^}]*\.\.\.\s*([A-Za-z_$][\w$]*)/);
    if (spread) {
      const def = src.match(new RegExp(`(?:const|let|var|function)\\s+${spread[1]}\\b[\\s\\S]{0,600}`));
      if (!def || CREDENTIAL.test(def[0])) continue;
    }
    const named = seg.match(/headers\s*:\s*([A-Za-z_$][\w$]*)/)
      || (/\bheaders\b\s*[},]/.test(seg) ? [, 'headers'] : null);
    if (named) {
      const def = src.match(new RegExp(`(?:const|let|var|function)\\s+${named[1]}\\b[\\s\\S]{0,600}`));
      if (!def || CREDENTIAL.test(def[0])) continue;
      const hop = def[0].match(/=\s*([A-Za-z_$][\w$]*)\s*\(\s*\)/);
      if (hop) {
        const viaHop = src.match(new RegExp(`(?:const|let|var|function)\\s+${hop[1]}\\b[\\s\\S]{0,600}`));
        if (!viaHop || CREDENTIAL.test(viaHop[0])) continue;
      }
    }
    hits.push(seg.slice(0, 80));
  }
  return hits;
}

describe('ETP-4576 — cookie-session invariants across app-shell source', () => {
  it('finds source files to scan (guards against a silently empty sweep)', () => {
    assert.ok(FILES.length > 300, `expected the whole tree, scanned ${FILES.length}`);
  });

  /**
   * G1 — no file in this app decides how a request authenticates.
   *
   * Two schemes coexist while the migration lands (bearer today, the cookie
   * session behind a backend preference), and `app-shell-core`'s
   * `sessionCredentials` is the single place that chooses between them. A file
   * here that builds its own Authorization header has hard-coded one of the two,
   * so it is correct under one setting of the preference and broken under the
   * other — which is exactly the failure that took a day to find: turning the
   * cookie session on left every such call site sending `Bearer undefined`.
   *
   * The rule is therefore about ownership, not about which header wins. When the
   * bearer scheme is eventually removed this assertion does not change; it just
   * stops having a second scheme to protect against.
   */
  it('G1: no NEW file builds an Authorization or Bearer header', () => {
    const offenders = FILES
      .filter((f) => /\bAuthorization\b/.test(f.code) || /\bBearer\b/.test(f.code))
      .map((f) => f.rel)
      .sort();
    const added = offenders.filter((f) => !G1_DEBT.has(f));
    assert.deepEqual(added, [], `${added.length} NEW file(s) build a credential header. Use the shared builders (writeHeaders/jsonHeaders) instead:\n  ${added.join('\n  ')}`);
  });

  it('G1: the debt list is still accurate — remove what has been fixed', () => {
    const offenders = new Set(FILES
      .filter((f) => /\bAuthorization\b/.test(f.code) || /\bBearer\b/.test(f.code))
      .map((f) => f.rel));
    const fixed = [...G1_DEBT].filter((f) => !offenders.has(f)).sort();
    assert.deepEqual(fixed, [], `${fixed.length} file(s) no longer build a credential header. Delete them from G1_DEBT so the ratchet holds:\n  ${fixed.join('\n  ')}`);
  });

  /**
   * G2 — the silent killer. Nothing may gate a request on a client-held token.
   *
   * Under the cookie session `useAuth()` exposes no token at all, so the gate is
   * permanently false and the request is never issued — no error, no failed
   * response, just a screen that stays empty. Under bearer the gate is redundant:
   * the header builder already omits the credential when none is held. So the
   * gate is wrong in one scheme and pointless in the other.
   */
  it('G2: no NEW file gates behaviour on a client-held token', () => {
    const offenders = FILES.filter((f) => GATE.test(f.code)).map((f) => f.rel).sort();
    const added = offenders.filter((f) => !G2_DEBT.has(f));
    assert.deepEqual(added, [], `${added.length} NEW file(s) gate on a token. Under the cookie session that gate is permanently false and the request is never issued:\n  ${added.join('\n  ')}`);
  });

  it('G2: the debt list is still accurate — remove what has been fixed', () => {
    const offenders = new Set(FILES.filter((f) => GATE.test(f.code)).map((f) => f.rel));
    const fixed = [...G2_DEBT].filter((f) => !offenders.has(f)).sort();
    assert.deepEqual(fixed, [], `${fixed.length} file(s) no longer gate on a token. Delete them from G2_DEBT:\n  ${fixed.join('\n  ')}`);
  });

  /**
   * G3 — every unsafe request carries the proof the active scheme requires.
   *
   * This is the rule that would have caught today's real bugs, and did not exist:
   * two DELETEs using the read builder, a PATCH with no proof, and two helpers the
   * epic extracted out of DetailView that hand-built a bearer header. G1 does not
   * cover them — a call site can avoid the word "Authorization" and still send no
   * credential at all — and the unit suites mock the builders away.
   *
   * Under the cookie session a missing proof is a 403, not a silent empty screen,
   * so this one fails loudly in production. Which is exactly why it must fail here
   * first.
   *
   * Note on `credentials: 'include'`: deliberately NOT asserted. For same-origin
   * requests fetch already sends cookies by default, so its absence is only a bug
   * cross-origin — which is the dev setup (:3100 → :8080) and any split-origin
   * deploy, but not same-origin production. Worth fixing, not worth a rule that
   * would flag ~200 sites where nothing is broken.
   */
  it('G3: no NEW unsafe request omits the write proof', () => {
    const offenders = FILES
      .filter((f) => unsafeSitesWithoutProof(f.raw).length > 0)
      .map((f) => f.rel)
      .sort();
    const added = offenders.filter((f) => !G3_DEBT.has(f));
    assert.deepEqual(added, [], `${added.length} NEW file(s) issue an unsafe request with no write proof. Use writeHeaders() (or buildWriteHeaders() when the request also needs the locale):\n  ${added.join('\n  ')}`);
  });

  it('G3: the debt list is still accurate — remove what has been fixed', () => {
    const offenders = new Set(FILES
      .filter((f) => unsafeSitesWithoutProof(f.raw).length > 0)
      .map((f) => f.rel));
    const fixed = [...G3_DEBT].filter((f) => !offenders.has(f)).sort();
    assert.deepEqual(fixed, [], `${fixed.length} file(s) now carry the proof everywhere. Delete them from G3_DEBT:\n  ${fixed.join('\n  ')}`);
  });
  /**
   * G4 — every backend request carries a credential.
   *
   * No debt list: the sweep that introduced this rule fixed all three offenders it
   * found (App.jsx's window-access map, useCurrencyPrecision, currencyFormatConfig),
   * so it starts life as a completion proof rather than a ratchet. If it ever needs
   * a list, that is a decision to make deliberately — not a default to fall into.
   */
  it('G4: no backend request goes out without a credential', () => {
    const offenders = FILES
      .filter((f) => credentiallessBackendSites(f.raw).length > 0)
      .map((f) => f.rel)
      .sort();
    assert.deepEqual(offenders, [], `${offenders.length} file(s) call the backend with no credential at all. Under \`bearer\` nothing identifies the caller and the request 401s — usually silently. Pass readCredentialHeaders() (safe methods) or writeHeaders() (unsafe ones):\n  ${offenders.join('\n  ')}`);
  });
});
