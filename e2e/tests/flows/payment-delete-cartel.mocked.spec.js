import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Payment delete cartel — end-to-end (mocked).
 *
 * Locks in the user-visible delete journey that `DetailView.jsx` currently
 * derives from two hardcoded, `windowName`-keyed tables:
 *
 *   WINDOW_DELETE_ACTIONS        → payment-in/out delete via the
 *                                  `eTPRRemovePayment` NEO action (ETP-4479)
 *   WINDOW_DELETE_CONFIRM_MODALS → payment-in/out confirm through the rich
 *                                  PaymentLifecycleConfirmModal cartel, with a
 *                                  per-window `dir` driving cobro/pago wording
 *                                  (ETP-4500)
 *
 * A later phase replaces both tables with declarative `decisions.json` props.
 * These tests are the behaviour-preserving proof required by the blast-radius
 * rule (`docs/ops/blast-radius-review.md`): they must pass identically before
 * and after that swap, because they assert only what the user sees and what
 * goes on the wire — never how DetailView resolves the configuration.
 *
 * Complements `DetailView.deleteActionFallback.vitest.jsx`, which covers the
 * table lookup and the cartel's item-list computation at unit level. What is
 * only reachable end-to-end, and therefore lives here: list → detail routing,
 * the real i18n-resolved cartel, the portal-rendered modal in a real DOM, the
 * actual `POST .../action/eTPRRemovePayment` request, and the post-delete
 * redirect back to the list.
 */

/**
 * Per-window wiring under test. `entity` is the API path segment each window's
 * generated page passes to DetailView — payment-in exposes `finPayment` while
 * payment-out exposes `header`, so the action URL differs between them and a
 * single hardcoded path would silently pass for the wrong reason.
 *
 * `deleteTitle` is the cartel heading produced by the table's `dir`, the one
 * piece of that configuration nothing else asserts end-to-end. Both locales are
 * accepted because mock mode has no LocaleProvider data and falls back to es_ES.
 */
const WINDOWS = {
  'payment-in': {
    entity: 'finPayment',
    deleteTitle: /eliminar cobro|delete collection/i,
  },
  'payment-out': {
    entity: 'header',
    deleteTitle: /eliminar pago|delete payment/i,
  },
};

const DELETE_ACTION = 'eTPRRemovePayment';

/**
 * Two payments at the lifecycle extremes the cartel distinguishes:
 *   RPAP  — draft, never deposited
 *   RPPC  — cleared: reconciled AND deposited, and `processed`, so it also
 *           exercises the deleteAction bypass of `hideDeleteWhenComplete`
 *           (every payment window sets that flag).
 */
const ROWS = [
  {
    id: 'pay-draft-001',
    documentNo: 'PAY-DRAFT-001',
    status: 'RPAP',
    processed: false,
    paymentDate: '2026-01-15',
    amount: 150.5,
    'businessPartner$_identifier': 'Test BP',
    'currency$_identifier': 'EUR',
  },
  {
    id: 'pay-cleared-002',
    documentNo: 'PAY-CLEARED-002',
    status: 'RPPC',
    processed: true,
    paymentDate: '2026-01-16',
    amount: 320,
    'businessPartner$_identifier': 'Test BP',
    'currency$_identifier': 'EUR',
  },
];

const DRAFT = ROWS[0];
const CLEARED = ROWS[1];

/**
 * Serve the list and detail GETs for one window's entity. Must run AFTER
 * login() — Playwright matches routes in reverse registration order, so the
 * generic /sws/** stub seeded there would otherwise win.
 *
 * Everything that is not a GET (notably the delete action POST) falls through
 * to that generic stub, which answers `{ success: true }` — exactly what
 * useNeoAction needs to report success and let DetailView redirect.
 */
async function installPaymentMock(page, spec) {
  const { entity } = WINDOWS[spec];
  await page.route(`**/sws/neo/${spec}/${entity}**`, async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() !== 'GET') {
      await route.fallback();
      return;
    }
    const detail = url.match(new RegExp(`/${entity}/([^/?]+)`));
    if (!detail) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: ROWS, totalRows: ROWS.length } }),
      });
      return;
    }
    const found = ROWS.find(r => r.id === detail[1]) ?? ROWS[0];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [found] } }),
    });
  });
}

/** Open a payment detail view directly, bypassing the list. */
async function openDetail(page, spec, recordId) {
  await page.goto(`/${spec}/${recordId}`);
  await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 15_000 });
}

/**
 * Matcher for the delete action request this window should emit. Asserting the
 * whole path (spec + entity + record + action) is what makes the test fail if a
 * refactor keeps dispatching *an* action but loses the record, the entity
 * segment, or the action name.
 */
function isDeleteActionRequest(request, spec, recordId) {
  return request.method() === 'POST'
    && request.url().includes(`/sws/neo/${spec}/${WINDOWS[spec].entity}/${recordId}/action/${DELETE_ACTION}`);
}

for (const spec of Object.keys(WINDOWS)) {
  test.describe(`Payment delete cartel — ${spec}`, () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
      await installPaymentMock(page, spec);
    });

    test('opening a payment from the list reaches its detail view', async ({ page }) => {
      await page.goto(`/${spec}`);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

      // Payment lists expose only the `more` and `delete` quick actions (no
      // `edit`), so opening a record is a plain row click.
      const row = page.locator('tbody tr').filter({ hasText: DRAFT.documentNo }).first();
      await expect(row).toBeVisible({ timeout: 15_000 });
      await row.click();

      await expect(page).toHaveURL(new RegExp(`/${spec}/${DRAFT.id}`));
      await expect(page.getByTestId('detail-view')).toBeVisible();
    });

    test('delete opens the payment cartel instead of the generic confirm dialog', async ({ page }) => {
      await openDetail(page, spec, DRAFT.id);

      await page.getByTestId('action-delete').click();

      await expect(page.getByTestId('payment-confirm-modal')).toBeVisible();
      // The generic Dialog branch must not render at all for these windows —
      // this is the assertion that pins *which* modal the configuration selects.
      await expect(page.getByTestId('action-delete-confirm')).toHaveCount(0);
    });

    test('the cartel carries this window\'s cobro/pago wording', async ({ page }) => {
      await openDetail(page, spec, DRAFT.id);
      await page.getByTestId('action-delete').click();

      await expect(page.getByTestId('payment-confirm-title'))
        .toHaveText(WINDOWS[spec].deleteTitle);
    });

    test('cancelling the cartel dispatches nothing and stays on the record', async ({ page }) => {
      await openDetail(page, spec, DRAFT.id);

      const dispatched = [];
      page.on('request', (req) => {
        if (isDeleteActionRequest(req, spec, DRAFT.id)) dispatched.push(req);
      });

      await page.getByTestId('action-delete').click();
      await expect(page.getByTestId('payment-confirm-modal')).toBeVisible();
      await page.getByTestId('payment-confirm-cancel').click();

      await expect(page.getByTestId('payment-confirm-modal')).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`/${spec}/${DRAFT.id}`));
      expect(dispatched).toHaveLength(0);
    });

    test('confirming dispatches the NEO delete action and returns to the list', async ({ page }) => {
      await openDetail(page, spec, DRAFT.id);

      const actionRequest = page.waitForRequest(
        (req) => isDeleteActionRequest(req, spec, DRAFT.id),
        { timeout: 15_000 },
      );

      await page.getByTestId('action-delete').click();
      await expect(page.getByTestId('payment-confirm-modal')).toBeVisible();
      await page.getByTestId('payment-confirm-accept').click();

      await actionRequest;
      await expect(page).toHaveURL(new RegExp(`/${spec}$`));
    });

    test('a cleared payment still offers delete and still routes through the action', async ({ page }) => {
      // hideDeleteWhenComplete would hide the button on a processed record; the
      // delete action is what keeps it available past draft, so losing the
      // action wiring shows up here as a missing button, not just a wrong URL.
      await openDetail(page, spec, CLEARED.id);
      await expect(page.getByTestId('action-delete')).toBeVisible();

      const actionRequest = page.waitForRequest(
        (req) => isDeleteActionRequest(req, spec, CLEARED.id),
        { timeout: 15_000 },
      );

      await page.getByTestId('action-delete').click();
      await expect(page.getByTestId('payment-confirm-modal')).toBeVisible();
      await page.getByTestId('payment-confirm-accept').click();

      await actionRequest;
      await expect(page).toHaveURL(new RegExp(`/${spec}$`));
    });
  });
}

/**
 * Control: the cartel must stay scoped to the payment windows. A refactor that
 * widens the configuration — or drops the generic branch while wiring the
 * declarative one — breaks here rather than silently changing every window's
 * delete confirmation.
 */
test.describe('Payment delete cartel — scoping control (sales-order)', () => {
  const SO_ROW = {
    id: 'so-draft-001',
    documentNo: 'SO-DRAFT-001',
    documentStatus: 'DR',
    'documentStatus$_identifier': 'Borrador',
    processed: false,
    orderDate: '2026-01-15',
    grandTotalAmount: 100,
    'businessPartner$_identifier': 'Test BP',
  };

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.route('**/sws/neo/sales-order/header**', async (route) => {
      const req = route.request();
      if (req.method() !== 'GET') {
        await route.fallback();
        return;
      }
      const detail = /\/header\/([^/?]+)/.test(req.url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: detail ? { data: [SO_ROW] } : { data: [SO_ROW], totalRows: 1 },
        }),
      });
    });
  });

  test('a non-payment window still gets the generic delete dialog', async ({ page }) => {
    await page.goto(`/sales-order/${SO_ROW.id}`);
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('action-delete').click();

    await expect(page.getByTestId('action-delete-confirm')).toBeVisible();
    await expect(page.getByTestId('payment-confirm-modal')).toHaveCount(0);
  });
});
