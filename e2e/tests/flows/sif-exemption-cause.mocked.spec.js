import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * SII exemption cause on invoices — SIF tab (mocked).
 *
 * ETP-4751 Block B frontend-observable flow on the invoice SIF tab. This spec is a
 * faithful USER-FLOW test: it drives the real UI actions a user performs (open the
 * detail, click the SIF tab, add invoice lines, open the exemption-cause selector,
 * pick / clear a cause) and observes the real UI reactions. It NEVER injects a
 * backend-only outcome flag into a header GET to fake a result — the exemption-cause
 * WARNING is produced exactly the way the real backend produces it: the invoice
 * LINE-save POST returns `exemptionCauseWarning: true` at the response ROOT
 * (InvoiceLineHandler#augmentResponseWithSignal), which useEntity#applyExemptionCauseSignals
 * mirrors onto the header record, and SifTab's one-shot effect toasts once per flip.
 *
 * Key enabler: DetailView renders inactive custom-tab panels with `display:none`
 * (never unmounts them — DetailView.jsx renderCustomTabPanels), so SifTab's warning
 * effect stays mounted and fires even while the user is on the "lines" tab adding
 * lines. That is what makes the add-line → warning journey observable end to end.
 *
 * Mock mode only. Routes are installed AFTER login() so they win over the generic
 * /sws/** stub (Playwright matches routes in reverse registration order). The fiscal
 * config must resolve to the `sii` profile for the SIF tab to render its SII panel:
 * the sii-config selector returns a record while tbai-config / verifactu-config
 * return empty.
 *
 * TC mapping (see the ETP-4751 test plan):
 *   - TC-11 (editable on draft SII invoice with exempt taxes)     → EDITABLE_ROW
 *   - TC-12 (locked once sent to SII)                             → SENT_ROW
 *   - TC-13 (both sales-invoice AND purchase-invoice)             → SPECS loop
 *   - line-add warning sequence + re-arm (exempt→warn, non-exempt→no-warn, exempt→warn-again)
 *                                                                 → sales-invoice only
 *   - select-then-clear-to-empty (SelectorInput controlled-'' fix) → both specs
 * TC-09 ("unblocks TicketBAI/Verifactu submission") is a live-backend scenario and is
 * intentionally NOT mocked here — it is env-gated/manual (real AEAT submission).
 */

// NOTE: the header GET does NOT carry `exemptionCauseWarning`. That signal is
// transient and only ever arrives on a LINE-save response — baking it into the
// header GET would fake an outcome the user never triggered. The initial detail
// render must therefore be silent (no warning toast on load); the warning is
// driven purely by the add-line POST in the sequence test below.
const EDITABLE_ROW = {
  id: 'inv-editable',
  documentNo: 'INV-EDIT',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  // Backend NeoHandler (enrichHasExemptTaxes) — the invoice carries an exempt line,
  // so the exemption-cause field is EDITABLE (draft + exempt + not-yet-sent).
  hasExemptTaxes: true,
  aeatsiiCauseExemption: null,
  'aeatsiiCauseExemption$_identifier': null,
  aeatsiiIssent: 'N',
};

const SENT_ROW = {
  id: 'inv-sent',
  documentNo: 'INV-SENT',
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completado',
  hasExemptTaxes: true,
  aeatsiiIssent: 'Y',
  aeatsiiCauseExemption: 'E1',
  'aeatsiiCauseExemption$_identifier': 'E1 — Exenta por artículo 20',
};

const ROWS = [EDITABLE_ROW, SENT_ROW];

const CAUSE_OPTIONS = [
  { id: 'cause-1', name: 'E1 — Exenta por artículo 20', _identifier: 'E1 — Exenta por artículo 20' },
  { id: 'cause-2', name: 'E2 — Exenta por artículo 21', _identifier: 'E2 — Exenta por artículo 21' },
];

const SPECS = ['sales-invoice', 'purchase-invoice'];

/**
 * Install all window-specific mocks needed to render the SIF tab in the `sii`
 * fiscal profile with a working exemption-cause selector.
 */
async function installMocks(page, spec) {
  // 1. Fiscal config: sii-config returns a record; tbai/verifactu return empty →
  //    detectProfile() resolves to 'sii'.
  await page.route('**/sws/neo/sii-config/**', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [{ id: 'sii-cfg-1' }] } }),
    });
  });
  for (const emptyCfg of ['tbai-config', 'verifactu-config']) {
    await page.route(`**/sws/neo/${emptyCfg}/**`, (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [] } }),
      });
    });
  }

  // 2. The aeatsiiCauseExemption FK selector endpoint (header form field).
  await page.route(`**/sws/neo/${spec}/header/selectors/aeatsiiCauseExemption{/**,}**`, (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: CAUSE_OPTIONS }),
    });
  });

  // 3. Header list + detail GET. The header GET intentionally omits the transient
  //    exemptionCauseWarning signal (it is not a persisted entity field).
  await page.route(`**/sws/neo/${spec}/header{/**,}**`, async (route) => {
    const req = route.request();
    const url = req.url();
    // Let the selector sub-route above win (it also matches /header/...).
    if (url.includes('/selectors/')) return route.fallback();
    if (req.method() === 'GET' && !/\/header\/[^/?]+/.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: ROWS, totalRows: ROWS.length } }),
      });
    }
    if (req.method() === 'GET') {
      const m = url.match(/\/header\/([^/?]+)/);
      const found = ROWS.find((r) => r.id === m?.[1]) ?? ROWS[0];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [found] } }),
      });
    }
    return route.fallback();
  });
}

/** Opens the invoice detail and switches to the SIF tab. */
async function openSifTab(page, spec, rowId) {
  await page.goto(`/${spec}/${rowId}`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  const sifTab = page.getByTestId('tab-custom:sif');
  await expect(sifTab).toBeVisible({ timeout: 10_000 });
  await sifTab.click();
}

/** Waits until every warning toast has auto-dismissed. Sonner's default duration is
 *  4s and NO custom duration is configured on the app <Toaster/> (see main.jsx), so a
 *  bounded wait for the warning toasts to clear lets the next step observe a genuinely
 *  NEW toast. We deliberately do NOT rip toast nodes out of the DOM by hand — doing so
 *  desyncs Sonner's React tree and crashes the app with an insertBefore NotFoundError
 *  on the next toast render. */
async function waitForNoWarningToast(page, timeout = 8_000) {
  await expect(page.locator('[data-type="warning"]')).toHaveCount(0, { timeout });
}

for (const spec of SPECS) {
  test.describe(`SIF exemption cause — ${spec}`, () => {
    test.beforeEach(async ({ page }) => {
      // The SIF tab only renders (and reports itself visible via onVisibilityChange)
      // when useFiscalConfig resolves a non-unconfigured profile, keyed by the active
      // org id (useAuth().selectedOrg.id). login() seeds a role but no org, so seed a
      // selected org here first — addInitScript is cumulative and runs on every
      // navigation, and login() appends its own init script after this one.
      await page.addInitScript(() => {
        localStorage.setItem(
          'sf_auth_selected_org',
          JSON.stringify({ id: 'e2e-org-1', name: 'E2E Org' }),
        );
      });
      await login(page);
      await installMocks(page, spec);
    });

    test('TC-11 draft + exempt taxes → exemption cause is editable', async ({ page }) => {
      await openSifTab(page, spec, EDITABLE_ROW.id);
      // The editable branch renders a SelectorInput (Radix Select trigger),
      // testid field-aeatsiiCauseExemption. The read-only branch would render a
      // disabled <input id="sif-exemption"> instead.
      const trigger = page.getByTestId('field-aeatsiiCauseExemption');
      await expect(trigger).toBeVisible();
      await expect(trigger).toBeEnabled();
    });

    test('no warning toast on initial load (warning is line-save driven, not header-baked)', async ({ page }) => {
      await openSifTab(page, spec, EDITABLE_ROW.id);
      // The header GET does not carry exemptionCauseWarning, so opening a draft
      // exempt invoice must NOT fire the warning by itself — it is only produced by
      // a qualifying line save. Give the effect a beat, then assert silence.
      await page.waitForTimeout(1_000);
      await expect(page.locator('[data-type="warning"]')).toHaveCount(0);
    });

    test('selecting a cause resolves the missing-cause state (trigger shows the picked cause)', async ({ page }) => {
      // Retitled from the old mislabeled "clears the warning and records the FK pair"
      // test, which only asserted the trigger text. Here we assert the real
      // user-facing outcome: after picking a cause the trigger shows it (E1) and the
      // field is no longer empty — the missing-cause condition is resolved. (A fresh
      // load carries no warning banner to assert-gone; the warning lifecycle is
      // covered end to end by the line-add sequence test below.)
      await openSifTab(page, spec, EDITABLE_ROW.id);
      const trigger = page.getByTestId('field-aeatsiiCauseExemption');
      await expect(trigger).toBeEnabled();
      // Empty before selection: the trigger shows the placeholder, not a cause code.
      await expect(trigger).not.toContainText('E1');
      await trigger.click();
      const option = page.getByTestId('option-aeatsiiCauseExemption-cause-1');
      await expect(option).toBeVisible({ timeout: 10_000 });
      await option.click();
      // After the pick the trigger shows the chosen identifier — the field now holds
      // a cause, so the "should indicate an exemption cause" condition is satisfied.
      await expect(trigger).toContainText('E1');
    });

    test('select then clear to empty → field clears on the FIRST pick (controlled-\'\' fix)', async ({ page }) => {
      // Guards the SelectorInput controlled-'' fix (@radix-ui controlled↔uncontrolled
      // swap swallowing the first clear). Pick E1, then reopen and pick the blank
      // option; the trigger must clear to the placeholder on the FIRST clear click.
      await openSifTab(page, spec, EDITABLE_ROW.id);
      const trigger = page.getByTestId('field-aeatsiiCauseExemption');
      await expect(trigger).toBeEnabled();

      // Pick E1.
      await trigger.click();
      const optionE1 = page.getByTestId('option-aeatsiiCauseExemption-cause-1');
      await expect(optionE1).toBeVisible({ timeout: 10_000 });
      await optionE1.click();
      await expect(trigger).toContainText('E1');

      // Reopen and pick the EMPTY option. field.id is 'sif-exemption', so the blank
      // SelectItem (value="__empty__") carries data-testid SelectItem__sif-exemption.
      await trigger.click();
      const emptyOption = page.getByTestId('SelectItem__sif-exemption').first();
      await expect(emptyOption).toBeVisible({ timeout: 10_000 });
      await emptyOption.click();

      // FIRST-click clear: the trigger must no longer show any cause code. The fix
      // keeps the Select controlled for its whole lifetime so this single pick lands
      // (pre-fix it took two clicks). value + $_identifier both go empty.
      await expect(trigger).not.toContainText('E1');
    });

    test('TC-12 sent to SII → exemption cause is read-only', async ({ page }) => {
      await openSifTab(page, spec, SENT_ROW.id);
      // Read-only branch: a disabled <input id="sif-exemption">, NOT a Select trigger.
      const readOnly = page.locator('#sif-exemption');
      await expect(readOnly).toBeVisible();
      await expect(readOnly).toBeDisabled();
      await expect(readOnly).toHaveValue(/E1/);
      // The editable Select trigger must NOT be present.
      await expect(page.getByTestId('field-aeatsiiCauseExemption')).toHaveCount(0);
    });
  });
}

/**
 * Line-add warning sequence + re-arm — the key ETP-4751 journey.
 *
 * Run on sales-invoice only: purchase-invoice shares the exact SifTab + useEntity
 * add-line path (same handleAddChild POST to `<spec>/lines`, same
 * applyExemptionCauseSignals mirror, same one-shot toast effect). The only per-window
 * difference is the endpoint slug; duplicating this fragile full-UI drive on the
 * second window adds no behavioural coverage. The lighter TC-11/TC-12/select-clear
 * journeys above still run on BOTH windows.
 *
 * The trigger is a REAL user action every time: the user opens the product lookup
 * drawer, picks a product, and confirms the inline add-row (Enter) — which issues
 * the real POST `<spec>/lines`. The exempt-vs-non-exempt distinction is a pure
 * backend judgment; in mock mode we faithfully simulate it by SEQUENCING the
 * line-save responses (the response ROOT carries or omits exemptionCauseWarning),
 * exactly as InvoiceLineHandler would. This exercises the true→false→true flip that
 * re-arms SifTab's one-shot guard.
 */
test.describe('SIF exemption cause — line-add warning sequence (sales-invoice)', () => {
  const spec = 'sales-invoice';
  const WARNING_TITLE = 'Debería indicarse una causa de exención';

  // The primary add-line button only renders when every `requiredHeaderFields`
  // value is populated (DetailView#resolveCanAddLines) — an empty draft hides it.
  // Serve a fully-populated editable header so the add-line UI is reachable. These
  // are the sales-invoice requiredHeaderFields (generated HeaderPage.jsx).
  const FULL_EDITABLE_ROW = {
    ...EDITABLE_ROW,
    invoiceDate: '2026-01-15',
    businessPartner: 'bp-1',
    'businessPartner$_identifier': 'Test BP',
    partnerAddress: 'addr-1',
    'partnerAddress$_identifier': 'Test Address',
    paymentTerms: 'pt-1',
    'paymentTerms$_identifier': '30 days',
    paymentMethod: 'pm-1',
    'paymentMethod$_identifier': 'Transfer',
    grandTotalAmount: 100,
    summedLineAmount: 100,
    currency: 'EUR',
    'currency$_identifier': 'EUR',
    priceList: 'pl-1',
    'priceList$_identifier': 'Sales',
    transactionDocument: 'td-1',
    'transactionDocument$_identifier': 'AR Invoice',
  };

  // Ordered exemptionCauseWarning outcomes for successive line saves:
  //   save 1 (exempt line)     → true   → warning fires
  //   save 2 (non-exempt line) → false  → NO warning, guard re-arms
  //   save 3 (exempt line)     → true   → warning fires AGAIN
  const LINE_SAVE_WARNINGS = [true, false, true];

  async function installLineAddMocks(page) {
    let saveIndex = 0;
    // Accumulate saved lines and echo them on the children GET so the lines panel stays
    // internally consistent (optimistic rows vs an always-empty refetch would otherwise
    // leave the panel with no add-line entry point after the first save).
    const savedLines = [];

    // Header detail GET + autosave-POST override for inv-editable. The GET serves the
    // fully-populated header so the add-line button is reachable. The POST is the header
    // autosave the line-add flow triggers (the callout writes a header field); it MUST
    // echo back the SAME id — otherwise the generic login() mock returns a fresh
    // 'e2e-record-id', the app navigates to that non-existent record, and the detail
    // blanks out (which is what silently closed the add-row between saves). The header
    // response never carries the transient exemptionCauseWarning signal.
    await page.route(`**/sws/neo/${spec}/header/inv-editable{/**,}**`, async (route) => {
      const req = route.request();
      if (req.url().includes('/selectors/')) return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [FULL_EDITABLE_ROW] } }),
      });
    });
    // Header autosave POST that targets the collection endpoint (no id) — same rule:
    // echo the existing id so no navigation to a phantom record occurs.
    await page.route(`**/sws/neo/${spec}/header`, async (route) => {
      const req = route.request();
      if (req.method() === 'POST' || req.method() === 'PUT' || req.method() === 'PATCH') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [FULL_EDITABLE_ROW] } }),
        });
      }
      return route.fallback();
    });

    // Lines list GET (empty — start from zero lines) and lines detail defaults.
    await page.route(`**/sws/neo/${spec}/lines{/**,}**`, async (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();

      // Product / tax FK selector for the inline add-row lookup drawer.
      if (url.includes('/selectors/')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              { id: 'prod-e2e', label: 'Test Product', name: 'Test Product', _identifier: 'Test Product' },
            ],
          }),
        });
      }

      // Line callout — fill the required listPrice so the row can save without the
      // user typing a price (mirrors the real product → price callout). Returns no
      // unitPrice/grossUnitPrice, so no SL_Order_Amt cascade fires.
      if (method === 'POST' && url.includes('/callout')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            updates: { listPrice: { value: 10 } },
            combos: {},
            messages: [],
          }),
        });
      }

      // Line-defaults probe.
      if (method === 'GET' && url.includes('/defaults')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [{}] } }),
        });
      }

      // Children list GET (no /<id> segment) — echo the lines saved so far.
      if (method === 'GET' && !/\/lines\/[^/?]+/.test(url)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: savedLines, totalRows: savedLines.length } }),
        });
      }

      if (method === 'POST') {
        const raw = req.postData() || '';
        let parsed = {};
        try { parsed = JSON.parse(raw); } catch { /* ignore */ }
        // Only the child LINE-save carries `parentId` and is NOT wrapped in a
        // `fieldValues` envelope (that shape is a header autosave that the callout's
        // header write triggers). Just the line-save advances the warning sequence and
        // carries the exemption signal — exactly the POST the real InvoiceLineHandler
        // stamps. Benignly ack any other POST so it neither consumes the sequence nor
        // corrupts state.
        const isLineSave = parsed.parentId !== undefined && parsed.fieldValues === undefined;
        if (!isLineSave) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ response: { data: [{ id: 'inv-editable' }] } }),
          });
        }
        const warn = LINE_SAVE_WARNINGS[Math.min(saveIndex, LINE_SAVE_WARNINGS.length - 1)];
        saveIndex += 1;
        const line = { id: `line-${saveIndex}`, product: 'prod-e2e', 'product$_identifier': 'Test Product', invoicedQuantity: 1, listPrice: 10, grossAmount: 10, 'currency$_identifier': 'EUR' };
        savedLines.push(line);
        const body = { response: { data: [line] } };
        if (warn) body.exemptionCauseWarning = true; // omit entirely when false → resolves to false
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      }

      return route.fallback();
    });
  }

  /** Drives ONE real add-line: open the add-row, open the product drawer, pick the
   *  product, wait for the listPrice callout, then confirm the inline row (Enter → POST).
   *
   *  The children list is mocked as always-empty, so the lines panel always shows its
   *  empty state and the add-row is opened via the "+ Añadir líneas" empty-state button
   *  (falls back to the action-add-line toolbar button when present). */
  async function openAddRow(page) {
    const productField = page.getByTestId('inline-add-field-product');
    // Retry loop: after a save the panel briefly re-renders (children refetch +
    // header autosave), so the row can flicker closed. Reopen and wait until the
    // product control is genuinely present before returning.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (await productField.count()) return; // add-row open and ready
      const toolbarBtn = page.getByTestId('action-add-line');
      if (await toolbarBtn.count()) {
        await toolbarBtn.click();
      } else {
        const emptyStateBtn = page.getByRole('button', { name: /añadir líneas|add line/i }).first();
        if (await emptyStateBtn.count()) await emptyStateBtn.click();
      }
      // Give the panel a beat to render the add-row, then re-check.
      await productField.first().waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {});
    }
  }

  async function addOneLine(page) {
    // Open the inline add-row. Do NOT re-click the (already active) lines tab — clicking
    // an active tab collapses an open add-row. After a save the row stays open for rapid
    // entry; openAddRow re-opens it only when it is genuinely closed.
    await openAddRow(page);

    // Open the product lookup drawer and pick the (auto-fetched) product. The pick
    // fires the price callout, which fills the required listPrice — we must wait for
    // it to land before confirming, or submitLine's required-field guard blocks the row.
    const productField = page.getByTestId('inline-add-field-product');
    await expect(productField).toBeVisible({ timeout: 10_000 });
    const calloutPromise = page.waitForRequest(
      (r) => r.method() === 'POST' && /\/sales-invoice\/lines\/callout/.test(r.url()),
      { timeout: 15_000 },
    );
    await productField.click();
    const productOption = page.getByTestId('product-search-option-prod-e2e');
    await expect(productOption).toBeVisible({ timeout: 10_000 });
    await productOption.click();
    await calloutPromise;
    // The callout fills the required listPrice (value 10). Wait for the field to show
    // it before confirming so the required-field guard passes.
    const listPriceInput = page.getByTestId('inline-add-field-listPrice');
    await expect(listPriceInput).toHaveValue(/10/, { timeout: 10_000 });

    // Confirm the row (Enter) → the child LINE-save POST (body carries parentId, not
    // a fieldValues header envelope). Wait specifically for that POST.
    const savePromise = page.waitForRequest(
      (r) => {
        if (r.method() !== 'POST') return false;
        if (!/\/sales-invoice\/lines(\?|$)/.test(r.url()) || r.url().includes('/callout')) return false;
        try {
          const b = JSON.parse(r.postData() || '{}');
          return b.parentId !== undefined && b.fieldValues === undefined;
        } catch { return false; }
      },
      { timeout: 15_000 },
    );
    await listPriceInput.press('Enter');
    await savePromise;
    // Let handleAddChild's async mirror (applyExemptionCauseSignals) + refreshHeaderTotals
    // settle so the SifTab toast effect can observe the flip before the next assertion.
    await page.waitForTimeout(600);
  }

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sf_auth_selected_org', JSON.stringify({ id: 'e2e-org-1', name: 'E2E Org' }));
    });
    await login(page);
    await installMocks(page, spec);
    await installLineAddMocks(page);
  });

  test('exempt line warns, non-exempt line does not (re-arm), exempt line warns again', async ({ page }) => {
    // Land on the detail and open the SIF tab once — this mounts SifTab, whose warning
    // effect then stays mounted (display:none while inactive) and observes every
    // exemptionCauseWarning flip even while we work on the lines tab.
    await openSifTab(page, spec, EDITABLE_ROW.id);
    // Confirm baseline silence before any line save.
    await page.waitForTimeout(500);
    await expect(page.locator('[data-type="warning"]')).toHaveCount(0);

    // Switch to the lines tab to add lines (SifTab remains mounted underneath).
    await page.getByTestId('tab-lines').click();
    await page.waitForTimeout(300);

    // --- Save 1: exempt line → warning fires ---
    await addOneLine(page);
    const warn1 = page.locator('[data-type="warning"]').filter({ hasText: WARNING_TITLE });
    await expect(warn1.first()).toBeVisible({ timeout: 10_000 });

    // Let the warning auto-dismiss (Sonner default 4s) so the next step observes a
    // genuinely new/absent toast — without hand-removing DOM nodes.
    await waitForNoWarningToast(page);

    // --- Save 2: non-exempt line → NO new warning, guard re-arms (flag → false) ---
    // The line-save response omits exemptionCauseWarning → applyExemptionCauseSignals
    // resolves it to false → SifTab's one-shot guard re-arms. Assert no warning appears.
    await addOneLine(page);
    await page.waitForTimeout(2_000);
    await expect(page.locator('[data-type="warning"]').filter({ hasText: WARNING_TITLE })).toHaveCount(0);

    // --- Save 3: exempt line again → warning fires AGAIN (guard genuinely re-armed) ---
    // This only fires if the flag truly flipped true→false→true; a guard stuck "already
    // toasted" from save 1 would leave this silent.
    await addOneLine(page);
    const warn3 = page.locator('[data-type="warning"]').filter({ hasText: WARNING_TITLE });
    await expect(warn3.first()).toBeVisible({ timeout: 10_000 });
  });
});
