// @covers artifacts/remittance/generated/web/remittance/RemittancePage.jsx
// @covers artifacts/remittance/generated/web/remittance/RemittanceForm.jsx
// @covers artifacts/remittance/generated/web/remittance/LinesTable.jsx
//
// Guards what the generated remittance page hands to the shared views — the header processes
// («Procesar» / «Reactivar»), the custom slots and the «Todas / Cobros / Pagos» list tabs — as
// declared in artifacts/remittance/decisions.json. ListView and DetailView are captured stubs;
// the process visibility and routing are run through DetailView's real helpers
// (evalDisplayLogicRaw / dispatchProcessAction), with the same two filters DetailView applies
// (displayLogicRaw, then requiresLines).
// The Lines tab is the real generated LinesTable rendered over a stubbed DataTable, so its columns
// are read as the page ships them; labels and tones go through the real resolvers DataTable uses.
let mockTier = 'full';
const mockCaptured = {};

vi.mock('@/components/contract-ui/ListView.jsx', () => ({
  ListView: (props) => { mockCaptured.list = props; return <div data-testid="list-view" />; },
}));
vi.mock('@/components/contract-ui/DetailView.jsx', () => ({
  DetailView: (props) => {
    mockCaptured.detail = props;
    return <div data-testid="detail-view">{props.headerContent?.({ id: 'rem-1', remittanceStatus: 'PE' })}</div>;
  },
}));
vi.mock('@/auth/AuthContext.jsx', () => ({
  useWindowAccess: () => mockTier,
  WindowAccessGuard: () => <div data-testid="window-access-guard" />,
}));
vi.mock('@/components/attachments', () => ({ AttachmentsTab: () => null }));
vi.mock('@generated/remittance/generated/web/remittance/RemittanceTable', () => ({ default: () => null }));
vi.mock('@generated/remittance/generated/web/remittance/RemittanceForm', () => ({ default: () => null }));
vi.mock('@/components/contract-ui', () => ({
  DataTable: (props) => { mockCaptured.linesColumns = props.columns; return <div data-testid="lines-data-table" />; },
  InlineLinesPanel: (props) => { mockCaptured.linesColumns = props.columns; return <div data-testid="lines-inline-panel" />; },
  // The real generated RemittanceForm (vi.importActual below) renders EntityForm: capture its fields.
  EntityForm: (props) => { mockCaptured.form = props; return null; },
}));
vi.mock('@generated/remittance/generated/web/remittance/LinesForm', () => ({ default: () => null }));
vi.mock('@generated/remittance/custom/RemittanceBottomPanel', () => ({ default: function MockBottomPanel() { return null; } }));
vi.mock('@generated/remittance/custom/RemittanceSepaFileData', () => ({ default: function MockSepaFileData() { return null; } }));
vi.mock('@generated/remittance/custom/RemittanceProcessConfirmModal', () => ({ default: function MockConfirmModal() { return null; } }));
vi.mock('@generated/remittance/custom/RemittanceStatusBanner', () => ({
  default: ({ data }) => <div data-testid="status-banner-stub" data-status={data?.remittanceStatus} />,
}));

import { render, screen } from '@testing-library/react';
import decisions from '@generated/remittance/decisions.json';
import contract from '@generated/remittance/contract.json';
import { getMissingRequiredFields } from '@/lib/requiredFields.js';
import { REMITTANCE_DRAFT_MODE } from '@/windows/custom/remittance/index.jsx';
import RemittancePage from '@generated/remittance/generated/web/remittance/RemittancePage.jsx';
import RemittanceBottomPanel from '@generated/remittance/custom/RemittanceBottomPanel';
import RemittanceProcessConfirmModal from '@generated/remittance/custom/RemittanceProcessConfirmModal';
import RemittanceSepaFileData from '@generated/remittance/custom/RemittanceSepaFileData';
import { evalDisplayLogicRaw, dispatchProcessAction, canShowAddLineArea, resolveCanAddLines, WINDOW_HIDE_STATUS_PILL_FOR } from '@/components/contract-ui/detailViewHelpers.jsx';
import enUS from '@/locales/en_US.json';
import esES from '@/locales/es_ES.json';
import esAR from '@/locales/es_AR.json';
import { resolveLabel } from '@etendosoftware/app-shell-core/i18n/resolveLabel';
import { resolveColumnLabel } from '@/lib/resolveColumnLabel.js';
import { statusLabel } from '@/lib/statusBadge.js';
import { resolveStatusTone } from '@/lib/statusToneOverride.js';

const LOCALES = [['en_US', enUS], ['es_ES', esES], ['es_AR', esAR]];

beforeEach(() => {
  mockTier = 'full';
  delete mockCaptured.list;
  delete mockCaptured.detail;
  delete mockCaptured.linesColumns;
});

function detailProps() {
  render(<RemittancePage windowName="remittance" recordId="rem-1" />);
  return mockCaptured.detail;
}

function listProps() {
  render(<RemittancePage windowName="remittance" />);
  return mockCaptured.list;
}

// DetailView's process filter (DetailView.jsx, process buttons): the display logic first, then
// `requiresLines` against the loaded lines.
const visibleProcessNames = (processes, data, lines) => processes
  .filter((p) => (p.displayLogicRaw ? evalDisplayLogicRaw(p.displayLogicRaw, data) : true))
  .filter((p) => !p.requiresLines || lines.length > 0)
  .map((p) => p.name);

const ONE_LINE = [{ id: 'line-1' }];

describe('RemittancePage — header processes', () => {
  it('declares exactly «reactivate» and «returnLines» as header process buttons («Confirmar» is the draftMode button of the route; the advance steps are the status chip selector)', () => {
    expect(detailProps().processes.map((p) => p.name)).toEqual(['reactivate', 'returnLines']);
  });

  // ETP-6247 — the step-by-step flow: PE -> Confirmar -> PR -> Marcar enviada -> SB -> Marcar cobrada -> CT/PT.
  it.each([
    ['a pending remittance with lines (no process button: «Confirmar» is the draftMode button)', { processed: false, remittanceStatus: 'PE' }, ONE_LINE, []],
    ['a pending remittance (Y/N) with lines', { processed: 'N', remittanceStatus: 'PE' }, ONE_LINE, []],
    ['a pending remittance without lines', { processed: false, remittanceStatus: 'PE' }, [], []],
    ['a Pendiente de envío remittance (PR): only «Reactivar» (the advance is the status chip)', { processed: 'Y', remittanceStatus: 'PR' }, ONE_LINE, ['reactivate']],
    ['an Enviada al banco remittance (SB): only «Reactivar»', { processed: 'Y', remittanceStatus: 'SB' }, ONE_LINE, ['reactivate']],
    ['a Cobrada remittance (CT): «Devolver» only', { processed: 'Y', remittanceStatus: 'CT' }, ONE_LINE, ['returnLines']],
    ['a Pagada remittance (PT): nothing', { processed: 'Y', remittanceStatus: 'PT' }, ONE_LINE, []],
    ['a partially collected remittance (CP): «Devolver» for what is left', { processed: 'Y', remittanceStatus: 'CP' }, ONE_LINE, ['returnLines']],
    ['a partially paid remittance (PP)', { processed: 'Y', remittanceStatus: 'PP' }, ONE_LINE, []],
    ['an Anulada remittance (AN)', { processed: 'Y', remittanceStatus: 'AN' }, ONE_LINE, []],
    ['a PR remittance without lines keeps «Reactivar»', { processed: 'Y', remittanceStatus: 'PR' }, [], ['reactivate']],
  ])('on %s shows %#', (_label, data, lines, expected) => {
    const { processes } = detailProps();
    expect(visibleProcessNames(processes, { id: 'rem-1', ...data }, lines)).toEqual(expected);
  });

  it('«Devolver» is never offered before the remittance is collected', () => {
    const { processes } = detailProps();
    for (const status of ['PE', 'PR', 'SB']) {
      expect(visibleProcessNames(processes, { id: 'rem-1', remittanceStatus: status }, ONE_LINE)).not.toContain('returnLines');
    }
  });

  it('no blue advance button in the header: markSent and markCollected are not header processes', () => {
    const names = detailProps().processes.map((p) => p.name);
    expect(names).not.toContain('markSent');
    expect(names).not.toContain('markCollected');
  });

  it('the header status chip is the window\'s own selector (topbarExtra), and the plain pill is hidden for PR and SB', () => {
    const { topbarExtra } = detailProps();
    expect(topbarExtra).toBeTruthy();
    expect(topbarExtra.name ?? topbarExtra.displayName).toBe('RemittanceStatusSelector');
    expect(WINDOW_HIDE_STATUS_PILL_FOR.remittance).toEqual(new Set(['PR', 'SB']));
  });

  it('«confirm» is no header process: it stays declared (the dialog reads its grouping param, default P) but excluded', () => {
    expect(detailProps().processes.find((p) => p.name === 'confirm')).toBeUndefined();
    const override = decisions.window.processOverrides.confirm;
    expect(override.exclude).toBe(true);
    expect(override.style).toBe('positive');
    expect(override.confirmModal).toBe(true);
    expect(override.params).toEqual([{
      key: 'grouping',
      type: 'select',
      label: 'remittanceGrouping',
      required: true,
      defaultValue: 'P',
      options: [
        { value: 'P', label: 'remittanceGroupingNone' },
        { value: 'GGPD', label: 'remittanceGroupingByBpAndDueDate' },
      ],
    }]);
  });

  it('«Confirmar» is the route\'s draftMode button: always offered, disabled without lines, opening the confirm dialog by event', () => {
    const draftMode = REMITTANCE_DRAFT_MODE;
    expect(draftMode).toMatchObject({ enabled: true, label: 'confirm', disableWhenEmpty: true, disabledEmptyTitleKey: 'remittanceConfirmNeedsLines' });
    const listener = vi.fn();
    window.addEventListener('remittance:open-confirm-modal', listener);
    draftMode.onConfirm();
    window.removeEventListener('remittance:open-confirm-modal', listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('«Devolver» opens the return dialog through the window’s modal, never a direct run', () => {
    const { processes, processConfirmModal } = detailProps();
    const ret = processes.find((p) => p.name === 'returnLines');
    expect(ret).toMatchObject({ label: 'remittanceReturnAction', style: 'primary-danger', requiresLines: true, confirmModal: true });
    const ctx = { processConfirmModal, setConfirmProcess: vi.fn(), setParamDialogProcess: vi.fn(), handleProcess: vi.fn() };
    dispatchProcessAction(ret, ctx);
    expect(ctx.setConfirmProcess).toHaveBeenCalledWith(ret);
    expect(ctx.handleProcess).not.toHaveBeenCalled();
  });

  it('«reactivate» is a danger action routed to the window’s confirmation modal', () => {
    const { processes, processConfirmModal } = detailProps();
    const reactivate = processes.find((p) => p.name === 'reactivate');
    expect(reactivate.style).toBe('primary-danger');
    expect(reactivate.params).toBeUndefined();
    const ctx = { processConfirmModal, setConfirmProcess: vi.fn(), setParamDialogProcess: vi.fn(), handleProcess: vi.fn() };
    dispatchProcessAction(reactivate, ctx);
    expect(ctx.setConfirmProcess).toHaveBeenCalledWith(reactivate);
    expect(ctx.setParamDialogProcess).not.toHaveBeenCalled();
    expect(ctx.handleProcess).not.toHaveBeenCalled();
  });

  it.each(LOCALES)('every process and parameter label is translated in %s', (_loc, json) => {
    const keys = ['confirm', 'reactivate', 'remittanceGrouping', 'remittanceGroupingNone', 'remittanceGroupingByBpAndDueDate',
      'remittanceReactivateConfirmTitle', 'remittanceReactivateConfirmBody'];
    for (const key of keys) expect(json.genericLabels[key], key).toEqual(expect.stringMatching(/\S/));
  });
});

describe('RemittancePage — detail slots', () => {
  it('wires the bottom panel, the confirmation modal and the status banner', () => {
    const props = detailProps();
    expect(props.bottomSection).toBe(RemittanceBottomPanel);
    expect(props.processConfirmModal).toBe(RemittanceProcessConfirmModal);
    expect(screen.getByTestId('status-banner-stub')).toHaveAttribute('data-status', 'PE');
  });

  // User decision (round 3 live test): the header fields sit flush on the page like Sales Invoice,
  // not inside DetailView's default rounded, bordered card (window.noHeaderBorder).
  it('renders the header form without the card wrapper, like Sales Invoice', () => {
    expect(detailProps().noHeaderBorder).toBe(true);
  });

  // ETP-6148 — «Datos para el fichero SEPA» below the header form.
  it('renders the SEPA file data block as the form footer', () => {
    expect(detailProps().formFooter).toBe(RemittanceSepaFileData);
  });

  it('the Cuenta field of the generated form carries the «Sin IBAN» optionBadge, and no other field does', async () => {
    const { default: RealRemittanceForm } = await vi.importActual('@generated/remittance/generated/web/remittance/RemittanceForm.jsx');
    render(<RealRemittanceForm data={{}} onChange={vi.fn()} />);
    const { fields } = mockCaptured.form;
    expect(fields.find((f) => f.key === 'financialAccount').optionBadge)
      .toEqual({ field: 'ibanValid', equals: false, labelKey: 'remittanceAccountNoIbanBadge' });
    expect(fields.filter((f) => f.optionBadge).map((f) => f.key)).toEqual(['financialAccount']);
  });

  // ETP-6247 — REM_REMITTANCE.ISFINANCED is NOT NULL (default N), so `financed` stays required in the contract (the
  // quality gate's notNullRequiresRequired invariant). It is form:false — the custom «Opciones avanzadas» switch owns
  // it — so it is not in the generated form's field list, which is DetailView's save gate (`gateFields`): a new
  // remittance whose switch was never touched still saves. And a required boolean holding false counts as filled.
  it('«financed» stays required in the contract without holding «Guardar» back on a new remittance', async () => {
    const financed = contract.frontendContract.entities.remittance.fields.find((f) => f.name === 'financed');
    expect(financed).toMatchObject({ required: true, sourceRequired: true, form: false, type: 'boolean', defaultValue: 'N' });

    const { default: RealRemittanceForm } = await vi.importActual('@generated/remittance/generated/web/remittance/RemittanceForm.jsx');
    expect(RealRemittanceForm.fields.map((f) => f.key)).not.toContain('financed');
    const newRemittance = Object.fromEntries(RealRemittanceForm.fields.map((f) => [f.key, 'x']));
    expect(getMissingRequiredFields(RealRemittanceForm.fields, newRemittance)).toEqual([]);

    const requiredBoolean = [{ key: 'financed', required: true, type: 'boolean' }];
    expect(getMissingRequiredFields(requiredBoolean, { financed: false })).toEqual([]);
  });

  it.each(LOCALES)('the «Sin IBAN» badge label is translated in %s', (_loc, json) => {
    expect(json.genericLabels.remittanceAccountNoIbanBadge).toEqual(expect.stringMatching(/\S/));
  });

  it('orders the lines by line number and titles the record by its document number', () => {
    const props = detailProps();
    expect(props.detailSortBy).toBe('lineNo asc');
    expect(props.titleField).toBe('documentNo');
    expect(props.statusField).toBe('remittanceStatus');
  });

  it('marks the window read-only for a read-only access tier', () => {
    mockTier = 'read-only';
    expect(detailProps().window).toEqual({ readOnly: true });
  });

  // Repro (ETP-6148 round 3, live test): «A remesar» became an editable field, so the generated
  // addLineFields.entry is no longer empty, and DetailView's add-line area — gated only by
  // canShowAddLineArea(…, entry fields, …, canAddLines) — showed «+ Añadir línea» under a pending
  // remittance's lines. Lines have no POST (405); they only come from «Seleccionar desde factura».
  // Run through DetailView's real gate with the props the page hands it.
  it('never shows the add-line area, even on a pending remittance with lines and an editable amount', () => {
    const props = detailProps();
    const pending = { id: 'rem-1', processed: false, remittanceType: 'T', financialAccount: 'A', name: 'R', dueDate: '2026-12-01' };
    const children = [{ id: 'l1', amount: 10 }];
    expect(props.addLineFields.entry.map((f) => f.key)).toContain('amount');
    const canAddLines = resolveCanAddLines(props.addLineGuard, pending, props.requiredHeaderFields, children);
    expect(canAddLines).toBe(false);
    expect(canShowAddLineArea({ editing: pending }, false, props.addLineFields.entry, undefined, canAddLines)).toBe(false);
  });

  it('renders the access guard instead of the views when access is none', () => {
    mockTier = 'none';
    render(<RemittancePage windowName="remittance" recordId="rem-1" />);
    expect(screen.getByTestId('window-access-guard')).toBeInTheDocument();
    expect(mockCaptured.detail).toBeUndefined();
  });
});

describe('RemittancePage — «Todas / Cobros / Pagos» list tabs', () => {
  const criteriaOf = (subset) => (subset.filter
    ? JSON.parse(new URLSearchParams(subset.filter).get('criteria'))
    : null);

  it('offers the three tabs in order, «Todas» first (the default) and unfiltered', () => {
    const { subsetFilters } = listProps();
    expect(subsetFilters.map((s) => s.label)).toEqual(['remittanceTabAll', 'remittanceTabCollections', 'remittanceTabPayments']);
    expect(subsetFilters[0].filter).toBeUndefined();
  });

  it('«Cobros» filters on the payment method allowing pay-ins, with a real boolean', () => {
    const collections = listProps().subsetFilters.find((s) => s.label === 'remittanceTabCollections');
    expect(criteriaOf(collections)).toEqual([
      { fieldName: 'remittanceType$paymentMethod$payinAllow', operator: 'equals', value: true },
    ]);
  });

  it('«Pagos» filters on the payment method allowing pay-outs, with a real boolean', () => {
    const payments = listProps().subsetFilters.find((s) => s.label === 'remittanceTabPayments');
    expect(criteriaOf(payments)).toEqual([
      { fieldName: 'remittanceType$paymentMethod$payoutAllow', operator: 'equals', value: true },
    ]);
  });

  it('sends the criteria as a single URL-encoded `criteria` parameter', () => {
    for (const subset of listProps().subsetFilters.filter((s) => s.filter)) {
      expect([...new URLSearchParams(subset.filter).keys()]).toEqual(['criteria']);
    }
  });

  it('sorts the list by transaction date, newest first', () => {
    expect(listProps().listSortBy).toBe('transactionDate desc');
  });

  it.each(LOCALES)('every tab label is translated in %s', (_loc, json) => {
    for (const key of ['remittanceTabAll', 'remittanceTabCollections', 'remittanceTabPayments']) {
      expect(json.genericLabels[key], key).toEqual(expect.stringMatching(/\S/));
    }
  });
});

describe('RemittancePage — Lines tab', () => {
  // The columns of the real LinesTable the page hands to DetailView.
  function linesColumns() {
    const { DetailTable } = detailProps();
    render(<DetailTable />);
    return mockCaptured.linesColumns;
  }

  // Header label as DataTable resolves it: col.labels, then useLabel(column) with the window's
  // labelOverrides, then col.label.
  function headerLabels(locale, json) {
    const { labelOverrides } = detailProps();
    const translate = (column) => resolveLabel(json, column, labelOverrides?.[locale] ?? null);
    return linesColumns().map((col) => resolveColumnLabel(col, locale, translate));
  }

  const ES_HEADERS = ['Factura', 'Fecha factura', 'Vencimiento', 'Cliente', 'Total factura', 'Pendiente', 'A remesar', 'Estado del recibo'];

  it('shows the due item columns in order, «Estado del recibo» last', () => {
    expect(linesColumns().map((c) => c.key)).toEqual([
      'invoiceDocumentNo', 'invoiceDate', 'dueDate', 'businessPartner', 'invoiceGrandTotal', 'invoiceOutstanding', 'amount', 'status',
    ]);
    expect(headerLabels('es_ES', esES)).toEqual(ES_HEADERS);
  });

  it.each([
    ['en_US', enUS, ['Invoice', 'Invoice date', 'Due date', 'Customer', 'Invoice total', 'Outstanding', 'To remit', 'Receipt status']],
    ['es_AR', esAR, ES_HEADERS],
  ])('translates every column header in %s', (locale, json, expected) => {
    expect(headerLabels(locale, json)).toEqual(expected);
  });

  it('renders the receipt status as a status badge with the payment status labels', () => {
    const status = linesColumns().find((c) => c.key === 'status');
    expect(status.type).toBe('status');
    expect(status.enumLabels).toEqual({
      RPAP: 'statusRpap', RPAE: 'statusRpae', RPVOID: 'remittanceReceiptReturned', REM_SENT: 'statusRemSent', PPM: 'statusPpm',
      RPR: 'statusRpr', REM_CANCEL: 'statusRemCancel', RDNC: 'statusRdnc', PWNC: 'statusPwnc', RPPC: 'statusRppc',
      ETGOERR: 'statusEtgoerr',
    });
  });

  it.each([
    ['RPAP', 'A Pagar', 'neutral'],
    ['REM_SENT', 'Remesado', 'warning'],
    ['REM_CANCEL', 'Liquidado en remesa', 'success'],
    ['RPR', 'Cobrado', 'success'],
    ['PPM', 'Pagado', 'warning'],
    ['RPVOID', 'Devuelto', 'destructive'], // the voided payment a return leaves
    ['ETGOERR', 'Pago con error', 'destructive'],
  ])('shows %s as «%s» in the %s tone', (code, label, tone) => {
    const status = linesColumns().find((c) => c.key === 'status');
    expect(statusLabel(code, esES, undefined, status.enumLabels)).toBe(label);
    expect(resolveStatusTone(code, status.enumVariants)).toBe(tone);
  });

  it.each([['en_US', enUS], ['es_ES', esES]])('every receipt status label is translated in %s', (_loc, json) => {
    const status = linesColumns().find((c) => c.key === 'status');
    for (const key of Object.values(status.enumLabels)) {
      expect(json.genericLabels[key], key).toEqual(expect.stringMatching(/\S/));
    }
  });

  it('passes no line form, so a row click opens nothing', () => {
    const props = detailProps();
    expect(props.DetailTable).toBeTruthy();
    expect(props).not.toHaveProperty('DetailForm');
  });
});
