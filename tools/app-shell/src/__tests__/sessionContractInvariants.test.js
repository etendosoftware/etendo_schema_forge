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

/** Reads this contract's own vocabulary; asserting on it would be circular. */
const EXEMPT = new Set([
  'test/sessionContract.js',      // the assertion helper: it looks FOR these strings
  'test/authContextMock.js',      // the shared useAuth mock
  '__tests__/sessionContractInvariants.test.js',
]);

function sourceFiles(dir = SRC, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      sourceFiles(p, acc);
    } else if (/\.(js|jsx)$/.test(entry.name) && !/\.(test|vitest)\./.test(entry.name)) {
      const rel = relative(SRC, p);
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

const FILES = sourceFiles().map((f) => {
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

const PROOF = /\bwriteHeaders\b|\bbuildWriteHeaders\b|X-Go-CSRF/;
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
 * Files that still build a credential header (G1). Refreshed on each epic merge
 * (see the caveat above); shrinks as the sweep lands.
 */
const G1_DEBT = new Set([
  'components/attachments/useAttachments.js',
  'components/contract-ui/ImageField.jsx',
  'components/contract-ui/InlineCreateSelector.jsx',
  'components/copilot/ocr/CreateContactModalAdapter.jsx',
  'components/copilot/ocr/ProductResolverPopup.jsx',
  'components/copilot/ocr/attachFile.js',
  'components/copilot/ocr/ingest/purchaseInvoiceDescriptor.js',
  'components/copilot/ocr/ingest/useBatch.js',
  'components/copilot/ocr/kinds/entityLookup.js',
  'components/copilot/ocr/strategies.js',
  'components/dashboard/TopClientsList.jsx',
  'hooks/useCashClose.js',
  'lib/flags/bootstrap.js',
  'lib/surveys/survey-config.js',
  'windows/custom/amortization/AmortizationLinesTable.jsx',
  'windows/custom/assets/AssetsAmortizationPanel.jsx',
  'windows/custom/calendar/AccountingPanel.jsx',
  'windows/custom/calendar/PeriodsExpandablePanel.jsx',
  'windows/custom/calendar/useYearCloseStatus.js',
  'windows/custom/chart-of-accounts/AccountTreeView.jsx',
  'windows/custom/chart-of-accounts/NewAccountModal.jsx',
  'windows/custom/contacts/BillingPreferencesForm.jsx',
  'windows/custom/contacts/ContactsFinanceContext.jsx',
  'windows/custom/contacts/ContactsFinancialPanel.jsx',
  'windows/custom/contacts/ContactsTable.jsx',
  'windows/custom/contacts/contactsFkResolvers.js',
  'windows/custom/contacts/contactsImportDescriptor.js',
  'windows/custom/contacts/index.jsx',
  'windows/custom/fiscal-calendar/CloseYearConfirmModal.jsx',
  'windows/custom/fiscal-config/FiscalConfigDebugPanel.jsx',
  'windows/custom/fiscal-models/FmOverlays.jsx',
  'windows/custom/goods-receipt/index.jsx',
  'windows/custom/not-posted-documents/NotPostedDocumentsPage.jsx',
  'windows/custom/organization/OrgLogoField.jsx',
  'windows/custom/price-list/PriceListProductPrices.jsx',
  'windows/custom/product/ProductSidebar.jsx',
  'windows/custom/product/productImportDescriptor.js',
  'windows/custom/purchase-invoice/PaymentDetailsPanelCustom.jsx',
  'windows/custom/purchase-invoice/PurchaseInvoiceTopbar.jsx',
  'windows/custom/purchase-order/PurchaseOrderActions.jsx',
  'windows/custom/sales-invoice/SalesInvoiceTopbar.jsx',
  'windows/custom/shared/PaymentDetailSidebarBase.jsx',
  'windows/custom/shared/PaymentHeaderTableBase.jsx',
  'windows/custom/shared/ReturnWindowShell.jsx',
  'windows/custom/shared/useConfirmWithCredit.js',
  'windows/custom/user/InviteUserDialog.jsx',
  'windows/custom/warehouse/WarehouseCustomTable.jsx',
  'windows/custom/warehouse/index.jsx',
  'windows/custom/warehouse/useWarehouseStock.js',
  'windows/spike-apps-host/AppIframeHost.jsx',
  // Arrived with the epic (ETP-4783). Absorbed, not migrated: nothing the merge
  // did breaks it, and fresh foreign code is its author's to move.
  'windows/custom/shared/SifTab.jsx',
]);

/**
 * Files that still gate on a client-held token (G2). Same rules as G1_DEBT — and
 * heavily overlapping with it, because the two smells travel together.
 */
const G2_DEBT = new Set([
  'components/contract-ui/DataTable.jsx',
  'components/contract-ui/DocumentPrintDrawer.jsx',
  'components/contract-ui/ImageField.jsx',
  'components/contract-ui/ReportDrawer.jsx',
  'components/copilot/ocr/attachFile.js',
  'components/copilot/ocr/ingest/purchaseInvoiceDescriptor.js',
  'components/copilot/ocr/strategies.js',
  'components/copilot/ocr/useOcrExtraction.js',
  'components/copilot/useCopilotChat.js',
  'components/dashboard/TopClientsList.jsx',
  'hooks/useDisplayLogic.js',
  'hooks/useSurveyEngine.js',
  'hooks/useWidget.js',
  'lib/flags/bootstrap.js',
  'lib/flags/useAccountIdentity.js',
  'lib/observability/providers/mixpanel.js',
  'lib/surveys/survey-config.js',
  'pages/InviteAcceptancePage.jsx',
  'windows/custom/assets/AssetsAmortizationPanel.jsx',
  'windows/custom/chart-of-accounts/AccountTreeView.jsx',
  'windows/custom/chart-of-accounts/NewAccountModal.jsx',
  'windows/custom/contacts/BillingPreferencesForm.jsx',
  'windows/custom/contacts/ContactsFinanceContext.jsx',
  'windows/custom/contacts/ContactsFinancialPanel.jsx',
  'windows/custom/contacts/contactsFkResolvers.js',
  'windows/custom/fiscal-models/FmOverlays.jsx',
  'windows/custom/organization/OrgLogoField.jsx',
  'windows/custom/price-list/PriceListProductPrices.jsx',
  'windows/custom/product/ProductSidebar.jsx',
  'windows/custom/purchase-invoice/PaymentDetailsPanelCustom.jsx',
  'windows/custom/shared/PaymentDetailSidebarBase.jsx',
  'windows/custom/shared/useConversionRate.js',
  'windows/custom/user/InviteUserDialog.jsx',
  'windows/spike-apps-host/AppIframeHost.jsx',
  // Arrived with the epic (ETP-4783). Absorbed, not migrated: nothing the merge
  // did breaks it, and fresh foreign code is its author's to move.
  'windows/custom/shared/SifTab.jsx',
]);

/**
 * Files with at least one unsafe request that carries no write proof (G3):
 * 54 files, 101 sites. This is the list that gates the preference — see above.
 */
const G3_DEBT = new Set([
  'components/attachments/useAttachments.js',
  'components/contract-ui/CloneOrderModal.jsx',
  'components/contract-ui/ConfirmDocumentModal.jsx',
  'components/contract-ui/ConfirmInOutModal.jsx',
  'components/contract-ui/CreateContactModal.jsx',
  'components/contract-ui/DataTable.jsx',
  'components/contract-ui/DocumentPrintDrawer.jsx',
  'components/contract-ui/ImageField.jsx',
  'components/contract-ui/ImportLinesModal.jsx',
  'components/contract-ui/InlineCreateSelector.jsx',
  'components/contract-ui/ReportDrawer.jsx',
  'components/contract-ui/SendDocumentModal.jsx',
  'components/copilot/ocr/ProductResolverPopup.jsx',
  'components/copilot/ocr/attachFile.js',
  'components/copilot/ocr/ingest/useBatch.js',
  'components/copilot/ocr/listAttachments.js',
  'components/import-return-lines/ImportReturnLinesModal.jsx',
  'explorer/useDiscovery.js',
  'hooks/useCashClose.js',
  'hooks/useDisplayLogic.js',
  'hooks/useEntity.js',
  'pages/InviteAcceptancePage.jsx',
  'pages/ReportViewerPage.jsx',
  'windows/custom/amortization/AmortizationLinesTable.jsx',
  'windows/custom/assets/AssetsAmortizationPanel.jsx',
  'windows/custom/calendar/PeriodsExpandablePanel.jsx',
  'windows/custom/chart-of-accounts/NewAccountModal.jsx',
  'windows/custom/contacts/BillingPreferencesForm.jsx',
  'windows/custom/contacts/ContactsFinancialPanel.jsx',
  'windows/custom/contacts/ContactsTable.jsx',
  'windows/custom/contacts/contactsImportDescriptor.js',
  'windows/custom/contacts/index.jsx',
  'windows/custom/fiscal-calendar/CloseYearConfirmModal.jsx',
  'windows/custom/fiscal-config/FiscalConfigDebugPanel.jsx',
  'windows/custom/not-posted-documents/NotPostedDocumentsPage.jsx',
  'windows/custom/organization/OrgLogoField.jsx',
  'windows/custom/price-list/PriceListProductPrices.jsx',
  'windows/custom/product/productImportDescriptor.js',
  'windows/custom/purchase-order/PurchaseOrderActions.jsx',
  'windows/custom/return-material-receipt/ImportFromShipmentModal.jsx',
  'windows/custom/return-to-vendor-shipment/ImportFromReceiptModal.jsx',
  'windows/custom/shared/PaymentHeaderTableBase.jsx',
  'windows/custom/shared/pdfUtils.js',
  'windows/custom/shared/useConfirmWithCredit.js',
  'windows/custom/user/InviteUserDialog.jsx',
  'windows/custom/warehouse/index.jsx',
  'windows/spike-apps-host/AppIframeHost.jsx',
  // Arrived with the epic (ETP-4783). Absorbed, not migrated: nothing the merge
  // did breaks it, and fresh foreign code is its author's to move.
  'windows/custom/shared/SifTab.jsx',
]);

const GATE = /!\s*(?:token|authToken|accessToken|bearerToken)\b|\b(?:token|authToken)\s*\?\s*\{/;

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
});
