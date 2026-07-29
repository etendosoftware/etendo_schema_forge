import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';
import {
  getAuthToken, getSelectedOrg,
  createSiiConfig, deleteAllSiiConfigs, fetchInvoice,
  DOC_TYPE, openNewInvoice, selectDocType, selectBusinessPartner,
  saveDraftAndGetId, addProductLine, clickConfirm, dismissSuccessModal,
  openRectificacionesTab, addRectification,
  expectRectificacionesPanelReadOnly, expectRectificacionesPanelReadOnlyNoLines,
  expectRectificacionesPanelEditable,
} from '../helpers/rectificative-helpers.js';

/**
 * ETP-4536 — Rectificative document types follow the SIF configuration (LIVE).
 *
 * WHAT THIS VALIDATES END-TO-END
 * ------------------------------
 * When a SIF config (here: SII, test mode) is SAVED from GO, a backend service
 * auto-flags the client's rectificative document types (Credit Note / Return)
 * and their sequences as rectificative. Two user-visible behaviors are now
 * genuinely gated by the org being SIF-enrolled:
 *
 *   1. Completion of a RECTIFICATIVE document (ETP-4548, server DB trigger):
 *      - WITHOUT a SIF configured, a Credit Note / Return completes freely even
 *        with no rectification linked (no restriction applies);
 *      - WITH a SIF configured, the SIF DB trigger BLOCKS completing a Credit
 *        Note / Return until at least one rectification is linked. Live block
 *        message: "El tipo de documento es rectificativo, pero no se han
 *        asociado facturas a rectificar." (matched loosely by BLOCK_MESSAGE).
 *
 *   2. The Rectificaciones panel of a NORMAL (non-rectificative) invoice
 *      (ETP-4536, ReversedInvoicesPanel — NOW SIF-aware):
 *      - WITHOUT a SIF configured, the panel is EDITABLE: the empty-state add
 *        button (btn__addFirstRectificacion) IS present, so the user CAN add a
 *        rectification to a normal invoice and it STILL completes (the backend
 *        allows it without a SIF — ETP-4548). Asserted in Test 2.
 *      - WITH a SIF configured, the panel is READ-ONLY (no add button), exactly
 *        as before. Asserted in Test 1.
 *
 * GATING SIGNAL IN ReversedInvoicesPanel (ETP-4536, for reference):
 *   sifRestrictionActive = notRectificative && (sifConfigured || fiscalLoading)
 *   isReadOnly           = (processed && !isVoid) || sifRestrictionActive
 *   → the non-rectificative restriction (no add affordance) applies ONLY WHEN a
 *     SIF is configured (or while the fiscal profile is still loading). Without
 *     a SIF, `sifRestrictionActive` is false and the add button
 *     (btn__addFirstRectificacion / btn__addReversedInvoice) IS rendered.
 *     On a brand-new draft the header is not yet enriched (isRectificative is
 *     undefined) so the add button appears regardless; the deterministic signal
 *     asserted below is therefore taken AFTER a product line has been added
 *     (header resolved to isRectificative=false) AND the fiscal profile has
 *     resolved, so the SIF vs no-SIF difference is the only variable left.
 *
 * WHY LIVE: the completion block lives in a server-side DB trigger — a mocked
 * spec cannot exercise it. This runs against the dev server (localhost:3100),
 * which proxies /sws to the real Etendo backend.
 *
 * GATING: skipped unless E2E_RECTIFICATIVE_INTEGRATION=1. Never runs in CI.
 *
 * PRECONDITIONS (discovered live against the local F&B/GO dataset):
 *   - login user goadmin@etendo.software (E2E_PASSWORD), role "GOClient Admin",
 *     org "GOOrg" — an org that HAS Credit Note / Return document types on
 *     sales-invoice and can be SIF-enrolled, and starts with NO SIF configured.
 *   - the FIRST available business partner in the selector is used (no hardcoded
 *     name, so the spec runs on any dataset — Jenkins standard or local). Set
 *     E2E_RECT_BP to a specific BP display name only if an override is needed.
 *     The same BP is reused for the original invoice and the credit note that
 *     rectifies it (picking "first option" is deterministic within a run).
 *   - at least one sellable product.
 *   - The spec creates its own invoices; it does not depend on onboarding-setup
 *     (run with `--no-deps`, see the header run command in the report).
 *
 * CLEANUP: the SII config is created/removed via the NEO API (the GO UI cannot
 * delete it). Teardown runs even on failure so the environment stays clean and
 * the spec is re-runnable.
 */

const RUN = process.env.E2E_RECTIFICATIVE_INTEGRATION === '1';

// Message family raised by the SIF trigger when a rectificative doc is
// completed with no rectification. The backend resolves the @…@ token to a
// localized string, so assert on a broad "rectificative" pattern instead of an
// exact sentence.
const BLOCK_MESSAGE = /rectificativ|rectificaci|ETSG_.*Rectificative|DocType_Rectificative/i;

test.describe('ETP-4536 — rectificative doc types follow SIF config (integration)', () => {
  test.describe.configure({ timeout: 300_000 });

  test.skip(!RUN, 'Set E2E_RECTIFICATIVE_INTEGRATION=1 to run this live integration spec.');

  let baseURL;
  let token;
  let orgId;
  // Document number of a completed sales invoice, captured in Test 2 and reused
  // as the "original" invoice to rectify in Test 1.
  let originalDocNo = process.env.E2E_RECT_ORIGINAL_DOCNO || null;

  test.beforeEach(async ({ page, baseURL: projectBaseURL }) => {
    baseURL = projectBaseURL || process.env.BASE_URL || 'http://localhost:3100';
    await login(page);
    await expect(page, 'login should reach the dashboard').toHaveURL(/dashboard/, { timeout: 30_000 });

    token = await getAuthToken(page);
    const org = await getSelectedOrg(page);
    orgId = org?.id ?? null;
    expect(token, 'a real bearer token should be present after login').toBeTruthy();
    expect(orgId, 'a selected organization should be present after login').toBeTruthy();

    // Guarantee the baseline precondition: NO SIF configured before each test.
    await deleteAllSiiConfigs(page, baseURL, token);
  });

  test.afterEach(async ({ page }) => {
    // Robust teardown — never let a leftover SIF config leak into the next run.
    if (token && baseURL) await deleteAllSiiConfigs(page, baseURL, token);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2 — NO SIF configured (baseline). Assert this FIRST.
  //   - a first normal invoice (Factura) completes freely, providing the
  //     "original" document to rectify (also reused as originalDocNo for Test 1);
  //   - a SECOND normal invoice: with NO SIF, its Rectificaciones panel is now
  //     EDITABLE (add button present, ETP-4536 SIF-gating) — the previously
  //     completed original is ADDED as a rectification, and the normal invoice
  //     STILL completes (CO). This is the SIF-gated difference vs Test 1, where
  //     WITH a SIF the same panel is read-only;
  //   - a Credit Note WITHOUT rectifications ALSO completes (no restriction) —
  //     this IS the completion behavior that changes under SIF (see Test 1).
  // ─────────────────────────────────────────────────────────────────────────
  test('Test 2 — with no SIF, a normal invoice has an EDITABLE rect panel, accepts a rectification and still completes; a rectification-less credit note also completes', async ({ page }) => {
    // — A first normal invoice completes: this is the "original" to rectify —
    await openNewInvoice(page);
    await selectDocType(page, DOC_TYPE.invoice);
    await selectBusinessPartner(page);
    const originalId = await saveDraftAndGetId(page);
    expect(originalId, 'original normal invoice should save and get an id').toBeTruthy();
    await addProductLine(page);

    const originalOutcome = await clickConfirm(page);
    expect(
      originalOutcome.blocked,
      `original normal invoice should complete freely (toast: "${originalOutcome.errorText}")`,
    ).toBeFalsy();
    await dismissSuccessModal(page);

    const originalRecord = await fetchInvoice(page, baseURL, token, originalId);
    expect(originalRecord?.documentStatus, 'original normal invoice should be Completed (CO)').toBe('CO');
    const localOriginalDocNo = originalRecord?.documentNo ?? null;
    expect(localOriginalDocNo, 'original invoice should expose a document number to rectify').toBeTruthy();
    // Reuse this completed invoice as the "original" to rectify in Test 1.
    if (!originalDocNo) originalDocNo = localOriginalDocNo;

    // — A SECOND normal invoice: EDITABLE panel, add a rectification, complete —
    await openNewInvoice(page);
    await selectDocType(page, DOC_TYPE.invoice);
    await selectBusinessPartner(page);
    const invoiceId = await saveDraftAndGetId(page);
    expect(invoiceId, 'normal invoice should save and get an id').toBeTruthy();
    await addProductLine(page);

    // With NO SIF configured, sifRestrictionActive is false for a
    // non-rectificative invoice, so the panel stays EDITABLE and offers the
    // empty-state add button. Test 1 asserts the SAME panel is read-only WITH a
    // SIF, proving this is genuinely SIF-gated (ETP-4536).
    const panel = await expectRectificacionesPanelEditable(page);

    // Actually ADD the previously-completed original invoice as a rectification.
    // The backend allows linking a rectification to a non-rectificative invoice
    // when there is no SIF (ETP-4548), so this must not block completion.
    await addRectification(page, panel, localOriginalDocNo);

    const normalOutcome = await clickConfirm(page);
    expect(
      normalOutcome.blocked,
      `with no SIF, a normal invoice with a rectification linked should still complete (toast: "${normalOutcome.errorText}")`,
    ).toBeFalsy();
    await dismissSuccessModal(page);

    const normalRecord = await fetchInvoice(page, baseURL, token, invoiceId);
    expect(
      normalRecord?.documentStatus,
      'normal invoice with a rectification should be Completed (CO) with no SIF',
    ).toBe('CO');

    // — A credit note WITHOUT rectifications completes (no SIF → no gate) —
    await openNewInvoice(page);
    await selectDocType(page, DOC_TYPE.creditNote);
    await selectBusinessPartner(page);
    const creditId = await saveDraftAndGetId(page);
    expect(creditId, 'credit note should save and get an id').toBeTruthy();
    await addProductLine(page);

    const creditOutcome = await clickConfirm(page);
    expect(
      creditOutcome.blocked,
      `with no SIF, a rectification-less credit note should complete (toast: "${creditOutcome.errorText}")`,
    ).toBeFalsy();
    await dismissSuccessModal(page);

    const creditRecord = await fetchInvoice(page, baseURL, token, creditId);
    expect(creditRecord?.documentStatus, 'credit note should be Completed (CO) with no SIF').toBe('CO');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1 — WITH SIF configured (SII, test mode).
  //   1. configure SII from the API in test mode → triggers auto-flagging;
  //   2. a normal invoice: its Rectificaciones panel is READ-ONLY (no add
  //      button) and it completes freely — this is the SIF-gated difference vs
  //      Test 2, where WITHOUT a SIF the same panel is editable (ETP-4536);
  //   3. a credit note: CANNOT complete without a rectification (server DB
  //      trigger, stays DR); after linking the original invoice it CAN complete
  //      — this IS the completion difference (in Test 2, no SIF, it completed).
  // ─────────────────────────────────────────────────────────────────────────
  test('Test 1 — with SIF, a normal invoice has a READ-ONLY rect panel; a credit note is blocked until a rectification is linked', async ({ page }) => {
    // 1. Configure SII (test/sandbox — production OFF) → auto-flag rectificatives.
    await createSiiConfig(page, baseURL, token, orgId);

    // 2. A normal invoice: read-only Rectificaciones panel + completes freely.
    await openNewInvoice(page);
    await selectDocType(page, DOC_TYPE.invoice);
    await selectBusinessPartner(page);
    const normalId = await saveDraftAndGetId(page);
    expect(normalId, 'normal invoice should save and get an id').toBeTruthy();

    // REGRESSION (ETP-4536, exact manual-testing bug): a SAVED NORMAL invoice
    // with NO product lines yet must ALREADY show a READ-ONLY Rectificaciones
    // panel when a SIF is configured. This is what the component tweak fixes —
    // an UNKNOWN (undefined) rectificative status is now treated as
    // non-rectificative, so sifRestrictionActive is true before any line exists
    // and the add button (btn__addFirstRectificacion) must be absent. Asserted
    // BEFORE addProductLine so the no-lines state is exercised explicitly.
    await expectRectificacionesPanelReadOnlyNoLines(page);

    await addProductLine(page);

    // WITH a SIF configured, sifRestrictionActive is true for a
    // non-rectificative invoice (notRectificative && sifConfigured), so the
    // panel is READ-ONLY and offers NO add affordance. This is the SIF-gated
    // difference vs Test 2's no-SIF path, where the same panel is editable
    // (ETP-4536).
    await expectRectificacionesPanelReadOnly(page);

    const normalOutcome = await clickConfirm(page);
    expect(
      normalOutcome.blocked,
      `a normal invoice should still complete with SIF configured (toast: "${normalOutcome.errorText}")`,
    ).toBeFalsy();
    await dismissSuccessModal(page);
    const normalRecord = await fetchInvoice(page, baseURL, token, normalId);
    expect(normalRecord?.documentStatus, 'normal invoice should be Completed (CO)').toBe('CO');
    if (!originalDocNo) originalDocNo = normalRecord?.documentNo ?? null;

    expect(
      originalDocNo,
      'need a completed original invoice document number to rectify (from Test 2 or E2E_RECT_ORIGINAL_DOCNO)',
    ).toBeTruthy();

    // 3. A credit note: blocked without a rectification, then completes once linked.
    await openNewInvoice(page);
    await selectDocType(page, DOC_TYPE.creditNote);
    await selectBusinessPartner(page);
    const creditId = await saveDraftAndGetId(page);
    expect(creditId, 'credit note should save and get an id').toBeTruthy();
    await addProductLine(page);

    // First completion attempt: NO rectification linked → must be blocked.
    const blockedOutcome = await clickConfirm(page);
    expect(
      blockedOutcome.blocked,
      'with SIF configured, completing a credit note WITHOUT a rectification must be blocked',
    ).toBeTruthy();
    expect(
      blockedOutcome.errorText,
      `block error should reference the rectificative constraint (got: "${blockedOutcome.errorText}")`,
    ).toMatch(BLOCK_MESSAGE);

    // It must still be a draft.
    const stillDraft = await fetchInvoice(page, baseURL, token, creditId);
    expect(stillDraft?.documentStatus, 'blocked credit note must stay Draft (DR)').toBe('DR');

    // Link the original invoice through the Rectificaciones tab.
    const panel = await openRectificacionesTab(page);
    await addRectification(page, panel, originalDocNo);

    // Second completion attempt: now it MUST complete.
    const okOutcome = await clickConfirm(page);
    expect(
      okOutcome.blocked,
      `after linking a rectification the credit note should complete (toast: "${okOutcome.errorText}")`,
    ).toBeFalsy();
    await dismissSuccessModal(page);

    const completed = await fetchInvoice(page, baseURL, token, creditId);
    expect(completed?.documentStatus, 'linked credit note should be Completed (CO)').toBe('CO');
  });
});
