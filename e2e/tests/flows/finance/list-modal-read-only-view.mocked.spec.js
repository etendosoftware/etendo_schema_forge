// @covers tools/app-shell/src/components/contract-ui/ListModalWindow.jsx
// @covers tools/app-shell/src/components/contract-ui/ListModalCompactDialog.jsx
// @covers tools/app-shell/src/components/contract-ui/EntityForm.jsx
// @covers tools/app-shell/src/components/contract-ui/CreatableSearchSelect.jsx
import { test, expect } from '../../helpers/test.js';
import { login } from '../../helpers/auth.js';

/**
 * List-modal windows — read-only view mode (mocked).
 *
 * A read-only window-access tier opens a list-modal record in VIEW mode: by row click (even on a
 * window without `rowClickEdit`) and by the deep link `/<window>/:recordId`. The modal shows the
 * record with every field locked and offers nothing that writes — no Save, no row edit / clone /
 * delete, no "+ New" — only a Close pill. Each window also runs a full-access control so the
 * read-only assertions cannot pass just because the modal never rendered.
 *
 * - payment-term: compact popup (`modalVariant: compact`) with `rowClickEdit`.
 * - match-rule: the wide modal, without `rowClickEdit` (a full-access row click does nothing). Its
 *   editor shows a subtitle; the view shows none.
 *
 * The tier comes from login()'s `windowAccessOverrides`; every other window stays "full".
 * transaction-type is left out: it has no route or menu entry (backend-only).
 */

const WINDOWS = {
  'payment-term': {
    windowId: '141',
    entityPath: 'header',
    compact: true,
    rowClickEdit: true,
    row: { id: 'pt-001', name: 'PT E2E 30 dias', overduePaymentDaysRule: 30, default: false, nextBusinessDay: true },
    // View: both checkboxes locked with the record's values; the days stepper (− / +) is not
    // rendered at all, only the plain locked value.
    async expectViewFields(modal) {
      await expect(modal.getByTestId('field-default')).toBeDisabled();
      await expect(modal.getByTestId('field-default')).toHaveAttribute('aria-checked', 'false');
      await expect(modal.getByTestId('field-nextBusinessDay')).toBeDisabled();
      await expect(modal.getByTestId('field-nextBusinessDay')).toHaveAttribute('aria-checked', 'true');
      await expect(inputOf(modal, 'overduePaymentDaysRule')).toHaveValue('30');
      await expect(inputOf(modal, 'overduePaymentDaysRule')).not.toBeEditable();
      for (const part of ['stepper', 'increment', 'decrement']) {
        await expect(modal.getByTestId(`field-overduePaymentDaysRule-${part}`)).toHaveCount(0);
      }
    },
    async expectEditFields(modal) {
      await expect(modal.getByTestId('field-default')).toBeEnabled();
      await expect(modal.getByTestId('field-nextBusinessDay')).toBeEnabled();
      await expect(modal.getByTestId('field-overduePaymentDaysRule-increment')).toBeVisible();
    },
  },
  'match-rule': {
    windowId: '24963D64E83B4543A7F6BD248CF944EE',
    entityPath: 'etgoMatchRuleHeader',
    compact: false,
    rowClickEdit: false,
    // Declares subtitleKey ("Configura una regla…"), which the editor shows and the view does not.
    subtitled: true,
    row: {
      id: 'mr-001', name: 'MR E2E comision', textPattern: 'COMISION', textCondition: 'C',
      priority: 10, active: true, matchCount: 0,
      transactionType: 'tt-001', 'transactionType$_identifier': 'Comision bancaria E2E',
      financialAccount: 'fa-001', 'financialAccount$_identifier': 'Cuenta E2E',
    },
    // View: the FK selectors show their identifiers locked, and the transaction-type selector
    // (`allowCreate`) cannot be opened, so it never offers "create transaction type".
    async expectViewFields(modal) {
      for (const [key, label] of [['transactionType', 'Comision bancaria E2E'], ['financialAccount', 'Cuenta E2E']]) {
        await expect(inputOf(modal, key)).toHaveValue(label);
        await expect(inputOf(modal, key)).not.toBeEditable();
      }
      await inputOf(modal, 'transactionType').click({ force: true });
      await expect(modal.page().getByTestId('options-transactionType')).toHaveCount(0);
      await expect(modal.page().getByTestId('action-create-transactionType')).toHaveCount(0);
    },
    // Control: editable, the selected value is a clearable chip, and opening it offers "create".
    async expectEditFields(modal) {
      const chip = modal.getByTestId('field-transactionType-chip');
      await expect(chip).toContainText('Comision bancaria E2E');
      await chip.click();
      await expect(modal.page().getByTestId('action-create-transactionType')).toBeVisible();
    },
  },
};

async function installRecordMock(page, spec) {
  const { entityPath, row } = WINDOWS[spec];
  const handler = async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') {
      await route.fallback();
      return;
    }
    const isDetail = new RegExp(`/${entityPath}/[^/?]+`).test(req.url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isDetail
        ? { response: { data: [row] } }
        : { response: { data: [row], totalRows: 1 } }),
    });
  };
  // Two routes (docs/e2e-testing-guide.md): `word/**` for the detail GET by id, `word**` for the
  // bare list URL and its query string.
  await page.route(`**/sws/neo/${spec}/${entityPath}/**`, handler);
  await page.route(`**/sws/neo/${spec}/${entityPath}**`, handler);
}

/** Every write the page sends to this window's spec. */
function trackWrites(page, spec) {
  const writes = [];
  page.on('request', (req) => {
    if (req.url().includes(`/sws/neo/${spec}/`) && req.method() !== 'GET') {
      writes.push(`${req.method()} ${req.url()}`);
    }
  });
  return writes;
}

async function open(page, spec, { readOnly, path = `/${spec}` }) {
  await login(page, readOnly ? { windowAccessOverrides: { [WINDOWS[spec].windowId]: 'read-only' } } : {});
  await installRecordMock(page, spec);
  // No networkidle wait: every step below auto-waits on its own locator.
  await page.goto(path);
}

function modalOf(page, spec) {
  return WINDOWS[spec].compact ? page.getByTestId('list-modal-compact-dialog') : page.getByRole('dialog');
}

/** A field's text input, whether its `field-<key>` test id sits on the input or on a wrapper. */
function inputOf(modal, key) {
  return modal.getByTestId(`field-${key}`).locator('xpath=self::input | .//input').first();
}

function nameInput(modal) {
  return inputOf(modal, 'name');
}

/** The read-only view: the record is shown, every write affordance is gone, Close is offered. */
async function expectViewModal(page, spec) {
  const modal = modalOf(page, spec);
  await expect(modal).toBeVisible();
  await expect(nameInput(modal)).toHaveValue(WINDOWS[spec].row.name);
  await expect(nameInput(modal)).not.toBeEditable();
  await expect(modal.getByTestId('list-modal-submit')).toHaveCount(0);
  await expect(modal.getByTestId('list-modal-subtitle')).toHaveCount(0);
  const closeId = WINDOWS[spec].compact ? 'list-modal-cancel' : 'list-modal-close-view';
  await expect(modal.getByTestId(closeId)).toHaveText(/Cerrar|Close/);
  await WINDOWS[spec].expectViewFields(modal);
  return { modal, close: modal.getByTestId(closeId) };
}

for (const spec of Object.keys(WINDOWS)) {
  const { row, rowClickEdit } = WINDOWS[spec];

  test.describe(`List-modal read-only view — ${spec}`, () => {
    test('read-only: a row click opens the record in view mode, with no write affordance', async ({ page }) => {
      const writes = trackWrites(page, spec);
      await open(page, spec, { readOnly: true });

      const listRow = page.getByTestId(`list-modal-row-${row.id}`);
      await expect(listRow).toBeVisible();
      await expect(page.getByTestId('list-modal-new')).toHaveCount(0);
      await listRow.hover();
      for (const action of ['edit', 'clone', 'delete']) {
        await expect(page.getByTestId(`list-modal-${action}-${row.id}`)).toHaveCount(0);
      }

      await listRow.getByText(row.name).click();
      const { modal, close } = await expectViewModal(page, spec);

      await close.click();
      await expect(modal).toBeHidden();
      expect(writes).toEqual([]);
    });

    test('read-only: the deep link opens the record in view mode', async ({ page }) => {
      const writes = trackWrites(page, spec);
      await open(page, spec, { readOnly: true, path: `/${spec}/${row.id}` });

      const { modal, close } = await expectViewModal(page, spec);
      await close.click();
      await expect(modal).toBeHidden();
      await expect(page).toHaveURL(new RegExp(`/${spec}$`));
      expect(writes).toEqual([]);
    });

    test('full access (control): the record opens editable, with Save', async ({ page }) => {
      await open(page, spec, { readOnly: false });
      const listRow = page.getByTestId(`list-modal-row-${row.id}`);
      await expect(listRow).toBeVisible();
      await expect(page.getByTestId('list-modal-new')).toBeVisible();

      if (rowClickEdit) {
        await listRow.getByText(row.name).click();
      } else {
        // Without rowClickEdit a full-access row click opens nothing; the hover pencil does.
        await listRow.getByText(row.name).click();
        await expect(modalOf(page, spec)).toHaveCount(0);
        await listRow.hover();
        await page.getByTestId(`list-modal-edit-${row.id}`).click();
      }

      const modal = modalOf(page, spec);
      await expect(modal).toBeVisible();
      await expect(nameInput(modal)).toHaveValue(row.name);
      await expect(nameInput(modal)).toBeEditable();
      await expect(modal.getByTestId('list-modal-submit')).toBeVisible();
      await expect(modal.getByTestId('list-modal-close-view')).toHaveCount(0);
      if (WINDOWS[spec].subtitled) {
        await expect(modal.getByTestId('list-modal-subtitle')).toHaveText(/Configura una regla|Configure a rule/);
      }
      await WINDOWS[spec].expectEditFields(modal);
    });
  });
}
