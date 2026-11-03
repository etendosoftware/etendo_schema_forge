// @covers tools/app-shell/src/components/contract-ui/AutoMatchSuggestionModal.jsx
// @covers tools/app-shell/src/components/contract-ui/AutoMatchBounceSection.jsx
// @covers tools/app-shell/src/components/contract-ui/BouncePairPanel.jsx
// @covers tools/app-shell/src/components/contract-ui/useBouncePairReview.jsx
// @covers tools/app-shell/src/hooks/useAutoMatchReview.js
// @covers tools/app-shell/src/windows/custom/financial-account/index.jsx
import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

/**
 * Bounce-pair suggestions (the modal's "Rebotes bancarios" section, the panel's "Posibles rebotes"
 * filter) in the bank reconciliation — mocked.
 *
 * The backend detects bounce pairs behind the per-account flag `bank-bounce-suggestions`; the SPA
 * never evaluates it and renders what the backend answers. With the flag on, `autoMatch` carries
 * `kind: "bouncePair"` groups and `kpis.bouncePairs`, and `pendingLines` puts `state: "bounce"` and
 * a `bouncePair` annotation on their lines. With it off, none of that exists and the UI must be
 * unchanged. Contract: com.etendoerp.go docs/neo-headless.md §4.12.1.1.
 *
 * Covered here:
 *   1. the automatch modal auto-opens with one transaction group and three pairs (high, review,
 *      ambiguous): high checked, review unchecked, ambiguous disabled;
 *   2. "Revisar en el panel" on the ambiguous pair closes the modal, switches the panel filter to
 *      "Posibles rebotes" and selects the bounce line, with no review banner; each candidate shows
 *      its bank reference ("Ref. X") and the footer the selected bounce's, the clipped description is
 *      on hover; choosing the original and "Descartar par" POSTs `discardPair` with the original and
 *      the bounce;
 *   3. after "Revisar en el panel", the Automatch button reopens the modal on the same suggestions
 *      with the checks as they were left, and Apply sends ONE `applySuggestions` with the
 *      transaction group first and both checked pairs;
 *   4. "Descartadas" lists the discarded lines (`status=discarded`) and "Restaurar par" POSTs
 *      `restorePair`;
 *   5. flag off: no "Rebotes bancarios" section, no bounce KPI, the original apply payload.
 *
 * Mock mode only (run against plain `make dev`, not `make dev-mock`). Every route is installed AFTER
 * `login()` so it beats the generic `**\/sws\/**` stub (Playwright matches in reverse order).
 */

const ACCOUNT_ID = 'acc-bounce';

const ACCOUNT = {
  id: ACCOUNT_ID,
  name: 'Banco Rebotes',
  type: 'B',
  currentBalance: 1000,
  currencyId: '102',
  currencyIso: 'EUR',
  iban: 'ES1212340000000000000009',
  isDefault: true,
  pendingCount: 7,
  bankConnected: false,
  amountTolerance: 0,
  glItemDifferenceId: '',
  glItemDifferenceName: '',
};

const SUMMARY = {
  totalBalance: 1000,
  byCurrency: [{ currencyIso: 'EUR', total: 1000 }],
  pending: { accountsWithPending: 1, suggestionsReady: 1, byRule: 0 },
};

// ── Lines ─────────────────────────────────────────────────────────────────────

const day = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const TX_LINE = { id: 'bsl-tx', date: day(9), description: 'Cobro cliente ACME', amount: 300 };
const HIGH_ORIGINAL = { id: 'bsl-high-out', date: day(8), description: 'Pago proveedor Luz', amount: -120 };
const HIGH_BOUNCE = { id: 'bsl-high-in', date: day(8), description: 'DEVOLUCION RECIBO Luz', amount: 120 };
const REVIEW_ORIGINAL = { id: 'bsl-rev-out', date: day(7), description: 'Recibo gimnasio', amount: -45 };
const REVIEW_BOUNCE = { id: 'bsl-rev-in', date: day(4), description: 'RECIBO DEVUELTO gimnasio', amount: 45 };
// The candidates carry the bank reference that tells them apart; the first one's description is
// long enough to be clipped in the panel, so its full text is only on hover.
const AMB_LONG_DESC = 'TRANSFERENCIA INMEDIATA A FAVOR DE ACME SUMINISTROS INDUSTRIALES SL CONCEPTO PAGO FACTURA 10000268 100-1';
const AMB_CAND_1 = { id: 'bsl-amb-out-1', date: day(6), description: AMB_LONG_DESC, amount: -80, referenceNo: 'REF-AMB-OUT-1' };
const AMB_CAND_2 = { id: 'bsl-amb-out-2', date: day(5), description: 'Pago ACME factura 2', amount: -80, referenceNo: 'REF-AMB-OUT-2' };
const AMB_BOUNCE = { id: 'bsl-amb-in', date: day(3), description: 'Abono ACME', amount: 80, referenceNo: 'REF-AMB-IN' };

const TX_GROUP = {
  kind: 'transaction',
  groupKey: 'grp-tx',
  statementLine: TX_LINE,
  operations: [{ id: 'trx-1', documentNo: 'COB-0001', partnerName: 'ACME', amount: 300, isNew: false }],
  origin: 'standard',
  isNew: false,
  difference: 0,
};

const pair = (overrides) => ({
  kind: 'bouncePair', origin: 'bounce', operations: [], isNew: false, difference: 0, ambiguous: false, ...overrides,
});

const HIGH_PAIR = pair({
  groupKey: 'bp-high', confidence: 'high', signal: 'return_text', signals: ['return_text'],
  statementLine: HIGH_ORIGINAL, counterpartLine: HIGH_BOUNCE,
});
const REVIEW_PAIR = pair({
  groupKey: 'bp-review', confidence: 'review', signal: 'return_text', signals: ['return_text'],
  statementLine: REVIEW_ORIGINAL, counterpartLine: REVIEW_BOUNCE,
});
const AMB_PAIR = pair({
  groupKey: 'bp-amb', confidence: 'review', ambiguous: true, signal: 'counterparty', signals: ['counterparty'],
  statementLine: null, counterpartLine: AMB_BOUNCE,
  candidates: [
    { line: AMB_CAND_1, signals: ['counterparty'], signal: 'counterparty' },
    { line: AMB_CAND_2, signals: ['counterparty'], signal: 'counterparty' },
  ],
});

/** The `bouncePair` annotation `pendingLines` puts on each line of a pair. */
function annotate(group, role, counterpartLine, extra = {}) {
  return {
    groupKey: group.groupKey, role, ambiguous: !!group.ambiguous, confidence: group.confidence,
    signals: group.signals, signal: group.signal, counterpartLine, ...extra,
  };
}

const bounceLine = (line, annotation) => ({
  ...line, status: 'pending', state: 'bounce', bouncePair: annotation,
});

const PENDING_LINES = [
  { ...TX_LINE, status: 'pending', state: 'suggested' },
  bounceLine(HIGH_ORIGINAL, annotate(HIGH_PAIR, 'original', HIGH_BOUNCE)),
  bounceLine(HIGH_BOUNCE, annotate(HIGH_PAIR, 'bounce', HIGH_ORIGINAL)),
  bounceLine(REVIEW_ORIGINAL, annotate(REVIEW_PAIR, 'original', REVIEW_BOUNCE)),
  bounceLine(REVIEW_BOUNCE, annotate(REVIEW_PAIR, 'bounce', REVIEW_ORIGINAL)),
  bounceLine(AMB_CAND_1, annotate(AMB_PAIR, 'candidate', AMB_BOUNCE)),
  bounceLine(AMB_CAND_2, annotate(AMB_PAIR, 'candidate', AMB_BOUNCE)),
  bounceLine(AMB_BOUNCE, annotate(AMB_PAIR, 'bounce', null, { candidates: AMB_PAIR.candidates })),
];
const PENDING_COUNTS = {
  all: PENDING_LINES.length, pending: 0, suggested: 1, byRule: 0, difference: 0, reconciled: 0,
  bounce: PENDING_LINES.length - 1, discarded: 2,
};

const DISCARDED_AT = `${day(20)}T09:30:00Z`;
const DISCARDED_LINES = [
  {
    id: 'bsl-disc-out', date: day(25), description: 'Cuota seguro', amount: -60,
    status: 'discarded', state: 'discarded', discarded: true,
    bounceLink: { counterpartLineId: 'bsl-disc-in', discardedAt: DISCARDED_AT, signal: 'pis_link', confidence: 'high' },
  },
  {
    id: 'bsl-disc-in', date: day(22), description: 'Devolucion cuota seguro', amount: 60,
    status: 'discarded', state: 'discarded', discarded: true,
    bounceLink: { counterpartLineId: 'bsl-disc-out', discardedAt: DISCARDED_AT, signal: 'pis_link', confidence: 'high' },
  },
];

/** The flag-on answer, and the flag-off one (no kind, no bouncePairs, no bounce state). */
function answers(flagOn) {
  if (flagOn) {
    return {
      groups: [TX_GROUP, HIGH_PAIR, REVIEW_PAIR, AMB_PAIR],
      kpis: { pendingLines: PENDING_LINES.length, groupsFound: 1, opsToLink: 1, willCreate: 0, bouncePairs: 3 },
      lines: PENDING_LINES,
      counts: PENDING_COUNTS,
    };
  }
  const { kind: _kind, ...flagOffGroup } = TX_GROUP;
  const plain = [TX_LINE, HIGH_ORIGINAL, HIGH_BOUNCE].map((l, i) => ({
    ...l, status: 'pending', state: i === 0 ? 'suggested' : 'pending',
  }));
  return {
    groups: [flagOffGroup],
    kpis: { pendingLines: plain.length, groupsFound: 1, opsToLink: 1, willCreate: 0 },
    lines: plain,
    counts: { all: plain.length, pending: 2, suggested: 1, byRule: 0, difference: 0, reconciled: 0 },
  };
}

const MOVEMENTS_PAYLOAD = {
  response: {
    data: {
      transactions: [],
      totals: { balance: 1000, inflows: 0, outflows: 0, currency: 'EUR' },
      paymentMethods: [],
      trxTypes: [],
      enabledDimensions: [],
      headerDimensions: [],
    },
  },
};

const json = (route, body, status = 200) => route.fulfill({
  status, contentType: 'application/json', body: JSON.stringify(body),
});

/**
 * Installs every route the account detail's reconciliation tab needs and records the POSTs.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ flagOn?: boolean }} [opts]
 * @returns {Promise<{ posts: Record<string, object[]>, pendingQueries: URLSearchParams[] }>}
 */
async function installMocks(page, { flagOn = true } = {}) {
  const data = answers(flagOn);
  const posts = { discardPair: [], restorePair: [], applySuggestions: [] };
  const pendingQueries = [];

  await page.route(/\/sws\/neo\/financial-account\/account\?/, async (route) => {
    if (route.request().method() !== 'GET') { await route.fallback(); return; }
    await json(route, { response: { data: [ACCOUNT], totalRows: 1, summary: SUMMARY } });
  });
  await page.route('**/sws/neo/financial-accounts-page', (route) => json(route, {
    response: { data: { accounts: [ACCOUNT], summary: SUMMARY } },
  }));
  const transactions = (route) => json(route, MOVEMENTS_PAYLOAD);
  await page.route('**/sws/neo/financial-account-transactions/**', transactions);
  await page.route('**/sws/neo/financial-account-transactions**', transactions);

  await page.route(/\/sws\/neo\/bank-reconciliation\?/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const action = url.searchParams.get('action');

    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData() ?? '{}');
      if (action === 'discardPair') {
        posts.discardPair.push(body);
        await json(route, { response: { data: { discarded: true, ...body, signal: 'counterparty', confidence: 'review' } } });
        return;
      }
      if (action === 'restorePair') {
        posts.restorePair.push(body);
        await json(route, { response: { data: { restored: ['bsl-disc-out', 'bsl-disc-in'], lineId: body.lineId, counterpartLineId: 'bsl-disc-in' } } });
        return;
      }
      if (action === 'applySuggestions') {
        posts.applySuggestions.push(body);
        const results = (body.groups ?? []).map((g) => (g.kind === 'bouncePair'
          ? { kind: 'bouncePair', statementLineId: g.statementLineId, counterpartLineId: g.counterpartLineId, discarded: true }
          : { statementLineId: g.statementLineId, reconciliationId: 'rec-1' }));
        await json(route, { response: { data: { results } } }, 201);
        return;
      }
      await route.fallback();
      return;
    }

    if (action === 'autoMatch') {
      await json(route, { response: { data: { groups: data.groups, kpis: data.kpis } } });
      return;
    }
    if (action === 'pendingLines') {
      pendingQueries.push(url.searchParams);
      const discarded = url.searchParams.get('status') === 'discarded';
      const lines = discarded ? DISCARDED_LINES : data.lines;
      const counts = discarded ? { discarded: DISCARDED_LINES.length } : data.counts;
      await json(route, { response: { data: { lines, total: lines.length, counts, draftReconciliationCount: 0 } } });
      return;
    }
    if (action === 'candidates') {
      await json(route, { response: { data: { candidates: [], counts: {} } } });
      return;
    }
    await route.fallback();
  });

  return { posts, pendingQueries };
}

/** Opens the reconciliation tab; the automatch modal pops once the suggestions land. */
async function openReconciliation(page) {
  await page.goto(`/financial-account/${ACCOUNT_ID}?tab=reconciliation`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await expect(page.getByTestId('detail-tab-reconciliation')).toBeVisible();
}

const modal = (page) => page.getByTestId('automatch-suggestion-modal');
const pairCheck = (page, key) => page.getByTestId(`automatch-bounce-check-${key}`);
// The shared Checkbox puts the test id on its <label>; the state lives on the input inside it.
const pairInput = (page, key) => pairCheck(page, key).getByRole('checkbox');

test.describe('Reconciliation — bounce-pair suggestions (mocked)', () => {
  test('the automatch modal opens with the pairs and their default checks', async ({ page }) => {
    await login(page);
    await installMocks(page);
    await openReconciliation(page);

    await expect(modal(page)).toBeVisible();
    const section = modal(page).getByTestId('automatch-bounce-section');
    await expect(section).toBeVisible();
    await expect(section.getByTestId('automatch-bounce-count')).toHaveText('3');
    await expect(pairInput(page, 'bp-high')).toHaveAttribute('aria-checked', 'true');
    await expect(pairInput(page, 'bp-review')).toHaveAttribute('aria-checked', 'false');
    await expect(pairInput(page, 'bp-amb')).toBeDisabled();
    await expect(page.getByTestId('automatch-bounce-tag-high-bp-high')).toBeVisible();
    await expect(page.getByTestId('automatch-bounce-review-bp-amb')).toBeVisible();
    await expect(page.getByTestId('automatch-bounce-review-bp-high')).toHaveCount(0);
    // The UI's own wording is "rebote", never "devolución" (the bank descriptions may say it).
    await expect(section).toContainText('Rebotes bancarios');
    await expect(section).toContainText('Pagos que el banco rechazó: una salida y su rebote');
    // The same label twice: the section title and the KPI strip.
    await expect(modal(page).getByText('Rebotes bancarios', { exact: true })).toHaveCount(2);
    const reviewTag = page.getByTestId('automatch-bounce-tag-review-bp-review');
    await expect(reviewTag).toContainText('rebote 3 día(s) después');
    await expect(reviewTag).not.toContainText(/devoluci[oó]n/i);
    // The bounce of the ambiguous pair names its bank reference; its original side, still to be
    // chosen in the panel, shows the candidate dates only.
    await expect(page.getByTestId('automatch-bounce-line-meta-bp-amb')).toContainText(`Ref. ${AMB_BOUNCE.referenceNo}`);
    const ambOriginalMeta = page.getByTestId('automatch-bounce-original-meta-bp-amb');
    await expect(ambOriginalMeta).toContainText(' · ');
    await expect(ambOriginalMeta).not.toContainText('Ref.');
  });

  test('"Revisar en el panel" on the ambiguous pair, then "Descartar par" sends discardPair', async ({ page }) => {
    await login(page);
    const { posts } = await installMocks(page);
    await openReconciliation(page);
    await expect(modal(page)).toBeVisible();

    await page.getByTestId('automatch-bounce-review-bp-amb').click();

    await expect(modal(page)).toHaveCount(0);
    // No review banner and no way back: the Automatch button is how the user returns.
    await expect(page.getByTestId('recon-bounce-review-banner')).toHaveCount(0);
    await expect(page.getByTestId('recon-bounce-review-back')).toHaveCount(0);
    // The filter moved to "Posibles rebotes": the suggested transaction line is gone.
    await expect(page.getByRole('button', { name: /^Posibles rebotes \(7\)/ })).toBeVisible();
    await expect(page.getByTestId(`recon-line-row-${TX_LINE.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`recon-line-radio-${AMB_BOUNCE.id}`)).toBeChecked();

    const panel = page.getByTestId('recon-bounce-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('recon-bounce-discard')).toBeDisabled();
    // Each candidate row shows its bank reference; the footer opens with the selected bounce.
    await expect(panel.getByTestId(`recon-bounce-ref-${AMB_CAND_1.id}`)).toHaveText(`Ref. ${AMB_CAND_1.referenceNo}`);
    await expect(panel.getByTestId(`recon-bounce-ref-${AMB_CAND_2.id}`)).toHaveText(`Ref. ${AMB_CAND_2.referenceNo}`);
    await expect(panel.getByTestId('recon-bounce-total-selected')).toContainText('Rebote seleccionado');
    await expect(panel.getByTestId('recon-bounce-total-selected-meta')).toContainText(`Ref. ${AMB_BOUNCE.referenceNo}`);
    await expect(panel.getByTestId('recon-bounce-total-other-meta')).toHaveCount(0);
    // The clipped description reveals its full text on hover.
    await panel.getByTestId(`recon-bounce-desc-${AMB_CAND_1.id}`).hover();
    await expect(page.getByTestId(`recon-bounce-desc-${AMB_CAND_1.id}-tooltip`)).toContainText(AMB_LONG_DESC);

    await panel.getByTestId(`recon-bounce-radio-${AMB_CAND_2.id}`).check();
    await expect(panel.getByTestId('recon-bounce-discard')).toBeEnabled();
    await expect(panel.getByTestId('recon-bounce-total-other-meta')).toContainText(`Ref. ${AMB_CAND_2.referenceNo}`);

    const post = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes('action=discardPair'));
    await panel.getByTestId('recon-bounce-discard').click();
    await post;

    expect(posts.discardPair).toEqual([{
      financialAccountId: ACCOUNT_ID,
      statementLineId: AMB_CAND_2.id,
      counterpartLineId: AMB_BOUNCE.id,
    }]);
    await expect(page.locator('[data-type="success"]').first()).toBeVisible();
    // A discard reloads the suggestions, but never pops the modal again on its own.
    await expect(modal(page)).toHaveCount(0);
  });

  test('the Automatch button reopens the modal with the checks kept, and Apply sends one call with both kinds', async ({ page }) => {
    await login(page);
    const { posts } = await installMocks(page);
    await openReconciliation(page);
    await expect(modal(page)).toBeVisible();

    await pairCheck(page, 'bp-review').click();
    await expect(pairInput(page, 'bp-review')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('automatch-bounce-review-bp-amb').click();
    await expect(modal(page)).toHaveCount(0);

    // Back through the Automatch button: the suggestions did not reload, so the checks are kept.
    await page.getByTestId('financial-account-automatch').click();
    await expect(modal(page)).toBeVisible();
    await expect(pairInput(page, 'bp-high')).toHaveAttribute('aria-checked', 'true');
    await expect(pairInput(page, 'bp-review')).toHaveAttribute('aria-checked', 'true');

    const post = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes('action=applySuggestions'));
    await page.getByTestId('automatch-modal-apply').click();
    await post;

    expect(posts.applySuggestions).toHaveLength(1);
    expect(posts.applySuggestions[0]).toEqual({
      financialAccountId: ACCOUNT_ID,
      groups: [
        { statementLineId: TX_LINE.id, operationIds: ['trx-1'] },
        { kind: 'bouncePair', statementLineId: HIGH_ORIGINAL.id, counterpartLineId: HIGH_BOUNCE.id },
        { kind: 'bouncePair', statementLineId: REVIEW_ORIGINAL.id, counterpartLineId: REVIEW_BOUNCE.id },
      ],
    });
    await expect(modal(page)).toHaveCount(0);
    await expect(page.locator('[data-type="success"]').first()).toBeVisible();
  });

  test('"Descartadas" lists the discarded pair and "Restaurar par" sends restorePair', async ({ page }) => {
    await login(page);
    const { posts, pendingQueries } = await installMocks(page);
    await openReconciliation(page);
    await expect(modal(page)).toBeVisible();
    await page.getByTestId('automatch-modal-cancel').click();
    await expect(modal(page)).toHaveCount(0);

    await page.getByRole('button', { name: /^Pendientes \(/ }).click();
    await page.getByRole('option', { name: /^Descartadas \(2\)/ }).click();

    const discardedRow = page.getByTestId('recon-line-row-bsl-disc-out');
    await expect(discardedRow).toBeVisible();
    expect(pendingQueries.some((q) => q.get('status') === 'discarded')).toBe(true);
    await expect(page.getByTestId(`recon-line-row-${TX_LINE.id}`)).toHaveCount(0);

    await discardedRow.click();
    const panel = page.getByTestId('recon-bounce-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('recon-bounce-row-bsl-disc-in')).toBeVisible();
    await expect(panel.getByTestId('recon-bounce-dismiss')).toHaveCount(0);

    const post = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes('action=restorePair'));
    await panel.getByTestId('recon-bounce-restore').click();
    await post;

    expect(posts.restorePair).toEqual([{ financialAccountId: ACCOUNT_ID, lineId: 'bsl-disc-out' }]);
    await expect(page.locator('[data-type="success"]').first()).toBeVisible();
  });

  test('flag off: no bounce section, no bounce KPI and the original apply payload', async ({ page }) => {
    await login(page);
    const { posts, pendingQueries } = await installMocks(page, { flagOn: false });
    await openReconciliation(page);

    await expect(modal(page)).toBeVisible();
    await expect(page.getByTestId('automatch-bounce-section')).toHaveCount(0);
    await expect(modal(page)).not.toContainText('Rebotes bancarios');

    const post = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes('action=applySuggestions'));
    await page.getByTestId('automatch-modal-apply').click();
    await post;
    expect(posts.applySuggestions).toEqual([{
      financialAccountId: ACCOUNT_ID,
      groups: [{ statementLineId: TX_LINE.id, operationIds: ['trx-1'] }],
    }]);
    await expect(modal(page)).toHaveCount(0);

    // The panel offers neither of the bounce entries, and never asks for status=discarded.
    await page.getByRole('button', { name: /^Pendientes \(/ }).click();
    await expect(page.getByRole('option', { name: /^Conciliadas/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /^Posibles rebotes/ })).toHaveCount(0);
    await expect(page.getByRole('option', { name: /^Descartadas/ })).toHaveCount(0);
    expect(pendingQueries.every((q) => !q.has('status'))).toBe(true);
  });
});
