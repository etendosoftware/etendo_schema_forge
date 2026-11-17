// @covers tools/app-shell/src/windows/custom/shared/InvoiceSifStep.jsx
// @covers tools/app-shell/src/windows/custom/shared/sifRequiredFields.js
//
// The "Datos fiscales" step shared by every invoice-creating modal: the pure helpers, the
// state hook, the panel and the stand-alone dialog. The host modals are covered in their own
// test files; this file guards the shared contract they all rely on.

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
}));

vi.mock('@/windows/custom/fiscal-config/fiscalConfig.utils.js', () => ({
  normalizeDateInputValue: (v) => v ?? '',
}));

vi.mock('@/components/ui/date-field', () => ({
  DateField: ({ id, value, onChange, disabled, required, ...rest }) => (
    <input
      id={id}
      type="date"
      value={value}
      disabled={disabled}
      required={required}
      data-testid={rest['data-testid']}
      onChange={(e) => onChange && onChange(e.target.value)}
    />
  ),
}));

// Radix Select does not open in jsdom: a flat stand-in that renders every option and lets a
// test pick one by clicking it.
vi.mock('@/components/ui/select', () => {
  function SelectItem({ value, children, ...rest }) {
    return <div data-value={value} data-testid={rest['data-testid']}>{children}</div>;
  }
  function collect(node, acc) {
    if (node == null || typeof node !== 'object') return acc;
    if (Array.isArray(node)) { node.forEach(n => collect(n, acc)); return acc; }
    if (node.type === SelectItem) { acc.push(node.props.value); return acc; }
    if (node.props?.children !== undefined) collect(node.props.children, acc);
    return acc;
  }
  function Select({ value, onValueChange, disabled, children, ...rest }) {
    const values = collect(children, []);
    return (
      <div data-testid={rest['data-testid']} data-value={value ?? ''} data-disabled={String(!!disabled)}>
        {values.map(v => (
          <button
            key={v}
            type="button"
            disabled={disabled}
            data-testid={`pick-${rest['data-testid']}-${v}`}
            onClick={() => onValueChange(v)} />
        ))}
        {children}
      </div>
    );
  }
  return {
    Select,
    SelectTrigger: ({ children, id, ...rest }) => (
      <div id={id} aria-required={rest['aria-required']} data-testid={rest['data-testid']}>{children}</div>
    ),
    SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
    SelectContent: ({ children }) => <div>{children}</div>,
    SelectItem,
  };
});

import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import {
  BULK_RECTIFICATIVE_VF_KEY,
  BulkInvoiceSifStepModal,
  bulkSifFields,
  fetchSifPreview,
  hasSifSystems,
  InvoiceSifStepModal,
  InvoiceSifStepPanel,
  resolveBulkSifPreview,
  useBulkSifStep,
  sifOptionLabel,
  useInvoiceSifStep,
  varyingFieldLabelKey,
  withSifFields,
} from '../InvoiceSifStep.jsx';

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => ({ response: { data } }) };
}

const SII_SPEC = [
  { name: 'etsgDateOperation', system: 'SII', type: 'date' },
  { name: 'aeatsiiClaveTipo', system: 'SII', type: 'option', options: ['F1', 'F2', 'R'] },
  { name: 'aeatsiiMotivoRectif', system: 'SII', type: 'option' },
  { name: 'aeatsiiDescripcionSii', system: 'SII', type: 'text' },
  { name: 'aeatsiiIsauthorization', system: 'SII', type: 'boolean' },
];
const VF_SPEC = [
  { name: 'etvfacInvType', system: 'Verifactu', type: 'option' },
  { name: 'etvfacSimpinvart7273', system: 'Verifactu', type: 'boolean' },
  { name: 'etvfacInvNoIDArt61d', system: 'Verifactu', type: 'boolean' },
];

function preview(overrides = {}) {
  return {
    systems: ['SII', 'Verifactu'],
    fieldSpecs: [...SII_SPEC, ...VF_SPEC],
    fields: {
      etsgDateOperation: '2026-11-10',
      aeatsiiClaveTipo: 'F1',
      aeatsiiDescripcionSii: 'Venta',
      aeatsiiIsauthorization: false,
      aeatsiiMotivoRectif: null,
      etvfacInvType: 'F1',
      etvfacSimpinvart7273: false,
      etvfacInvNoIDArt61d: false,
    },
    rectificative: false,
    siiAuthorizationAvailable: true,
    ...overrides,
  };
}

function editableStep(p, values = p.fields, extra = {}) {
  return {
    preview: p, values, setValue: vi.fn(), valid: true, back: vi.fn(), ...extra,
  };
}

describe('sifOptionLabel', () => {
  const opt = { value: 'F1', labelKey: 'k' };

  it('prefixes the code when the label does not carry it', () => {
    expect(sifOptionLabel(opt, () => 'Factura')).toBe('F1 - Factura');
  });

  it('keeps a label that already starts with the code, so the code appears once', () => {
    expect(sifOptionLabel(opt, () => 'F1 - Factura (art. 6)')).toBe('F1 - Factura (art. 6)');
  });

  it('does not treat a label that merely starts with the same letters as already prefixed', () => {
    expect(sifOptionLabel({ value: 'R', labelKey: 'k' }, () => 'Rectificativa')).toBe('R - Rectificativa');
  });

  it('prefixes the raw key when i18n returns the key unchanged', () => {
    expect(sifOptionLabel(opt, (k) => k)).toBe('F1 - k');
  });
});

describe('hasSifSystems', () => {
  it.each([
    [null, false],
    [undefined, false],
    [{}, false],
    [{ systems: [] }, false],
    [{ systems: ['SII'] }, true],
  ])('hasSifSystems(%j) is %s', (input, expected) => {
    expect(hasSifSystems(input)).toBe(expected);
  });
});

describe('varyingFieldLabelKey', () => {
  it('reads "per customer" for the SII key, sales and purchase', () => {
    expect(varyingFieldLabelKey('aeatsiiClaveTipo')).toBe('invoiceSifStep.variesPerCustomer');
    expect(varyingFieldLabelKey('aeatsiiClaveTipoFc')).toBe('invoiceSifStep.variesPerCustomer');
  });

  it('reads "per order" for any other field', () => {
    expect(varyingFieldLabelKey('etvfacInvType')).toBe('invoiceSifStep.variesPerOrder');
    expect(varyingFieldLabelKey('etsgDateOperation')).toBe('invoiceSifStep.variesPerOrder');
  });
});

// ETP-6179: the bulk step is EDITABLE — one set of values for every invoice of the run.
describe('useBulkSifStep', () => {
  it('starts from the merged values; setting a varying field makes it apply to every invoice', () => {
    const p = preview();
    const { result } = renderHook(() => useBulkSifStep({ preview: p, varying: { aeatsiiClaveTipo: true } }));
    expect(result.current.values).toEqual(p.fields);
    expect(result.current.valid).toBe(true);
    expect(result.current.varying).toEqual({ aeatsiiClaveTipo: true });
    act(() => result.current.setValue('aeatsiiClaveTipo', 'F2'));
    expect(result.current.values.aeatsiiClaveTipo).toBe('F2');
    expect(result.current.varying).toEqual({});
  });

  it('tolerates a null summary', () => {
    const { result } = renderHook(() => useBulkSifStep(null));
    expect(result.current.values).toEqual({});
    expect(result.current.valid).toBe(true);
  });
});

describe('withSifFields', () => {
  it('adds sifFields only when the step produced a payload', () => {
    expect(withSifFields({ a: 1 }, { payload: { x: 1 } })).toEqual({ a: 1, sifFields: { x: 1 } });
    expect(withSifFields({ a: 1 }, { payload: undefined })).toEqual({ a: 1 });
    expect(withSifFields({ a: 1 }, null)).toEqual({ a: 1 });
  });
});

describe('fetchSifPreview', () => {
  it('POSTs the body and returns response.data', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ systems: ['SII'] }));
    const data = await fetchSifPreview(apiFetch, '/x/action/sifDefaults', { shipmentIds: ['s1'] });
    expect(data).toEqual({ systems: ['SII'] });
    expect(apiFetch).toHaveBeenCalledWith('/x/action/sifDefaults', {
      method: 'POST', body: JSON.stringify({ shipmentIds: ['s1'] }),
    });
  });

  it('passes baseUrl "" for an absolute URL', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({}));
    await fetchSifPreview(apiFetch, 'http://h/x', undefined, { absoluteUrl: true });
    expect(apiFetch.mock.calls[0][1]).toMatchObject({ baseUrl: '', body: '{}' });
  });

  it('returns null on a non-ok answer or a rejected request (fail open)', async () => {
    expect(await fetchSifPreview(vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 })), '/u')).toBeNull();
    expect(await fetchSifPreview(vi.fn().mockRejectedValue(new Error('net')), '/u')).toBeNull();
  });
});

describe('resolveBulkSifPreview', () => {
  function fetchByUrl(map) {
    return vi.fn((url) => Promise.resolve(map[url]));
  }

  it('is "none" when there are no orders', async () => {
    const res = await resolveBulkSifPreview(vi.fn(), []);
    expect(res).toEqual({ kind: 'none', previews: [] });
  });

  it('is "none" when no order has an active system', async () => {
    const apiFetch = fetchByUrl({ a: jsonResponse({ systems: [] }), b: jsonResponse({ systems: [] }) });
    expect((await resolveBulkSifPreview(apiFetch, ['a', 'b'])).kind).toBe('none');
  });

  it('is "none" when any preview could not be read, even if others have systems', async () => {
    const apiFetch = fetchByUrl({ a: jsonResponse(preview()), b: jsonResponse(null, { ok: false, status: 500 }) });
    const res = await resolveBulkSifPreview(apiFetch, ['a', 'b']);
    expect(res.kind).toBe('none');
    expect(res.previews[1]).toBeNull();
  });

  it('merges equal values and lists differing ones in varying, keeping per-order previews', async () => {
    const a = preview();
    const b = preview({ fields: { ...a.fields, aeatsiiClaveTipo: 'F2', etvfacInvType: 'F2' } });
    const apiFetch = fetchByUrl({ a: jsonResponse(a), b: jsonResponse(b) });
    const res = await resolveBulkSifPreview(apiFetch, ['a', 'b']);

    expect(res.kind).toBe('summary');
    expect(res.previews).toEqual([a, b]);
    expect(res.varying).toEqual({ aeatsiiClaveTipo: true, etvfacInvType: true });
    expect(res.preview.fields.etsgDateOperation).toBe('2026-11-10');
    expect(res.preview.fields).not.toHaveProperty('aeatsiiClaveTipo');
    expect(res.preview.systems).toEqual(['SII', 'Verifactu']);
  });

  it('compares a field only among the orders that have it, and unions systems and specs', async () => {
    const a = { systems: ['SII'], fieldSpecs: [SII_SPEC[0]], fields: { etsgDateOperation: '2026-11-10' }, siiAuthorizationAvailable: true };
    const b = { systems: ['Verifactu'], fieldSpecs: [VF_SPEC[0]], fields: { etvfacInvType: 'F1' }, siiAuthorizationAvailable: true };
    const res = await resolveBulkSifPreview(fetchByUrl({ a: jsonResponse(a), b: jsonResponse(b) }), ['a', 'b']);
    expect(res.preview.systems).toEqual(['SII', 'Verifactu']);
    expect(res.preview.fieldSpecs.map(s => s.name)).toEqual(['etsgDateOperation', 'etvfacInvType']);
    // Each field exists on one order only, so it has one value and does not vary; each order is
    // only ever sent its own fields.
    expect(res.varying).toEqual({});
    expect(res.preview.fields).toEqual({ etsgDateOperation: '2026-11-10', etvfacInvType: 'F1' });
    expect(res.slots).toEqual([
      [{ key: 'etsgDateOperation', name: 'etsgDateOperation' }],
      [{ key: 'etvfacInvType', name: 'etvfacInvType' }],
    ]);
  });

  it('offers the SII authorization only when every order allows it', async () => {
    const a = preview();
    const b = preview({ siiAuthorizationAvailable: false });
    const res = await resolveBulkSifPreview(fetchByUrl({ a: jsonResponse(a), b: jsonResponse(b) }), ['a', 'b']);
    expect(res.preview.siiAuthorizationAvailable).toBe(false);
  });
});

// The bulk step of "one invoice per selected order": ONE set of values, applied per order.
describe('bulk step — per-order payload, blocking and mixed runs', () => {
  const fetchAll = (list) => vi.fn((url) => Promise.resolve(jsonResponse(list[Number(url)])));
  const resolve = (list) => resolveBulkSifPreview(fetchAll(list), list.map((_, i) => String(i)));

  // An ordinary invoice: SII + VERI*FACTU, F-type codes only.
  const ordinary = (fields = {}) => ({
    systems: ['SII', 'Verifactu'],
    rectificative: false,
    fieldSpecs: [
      { name: 'etsgDateOperation', system: 'SII', type: 'date' },
      { name: 'aeatsiiClaveTipo', system: 'SII', type: 'option', options: ['F1', 'F2'] },
      { name: 'aeatsiiDescripcionSii', system: 'SII', type: 'text' },
      { name: 'etvfacInvType', system: 'Verifactu', type: 'option', options: ['F1', 'F2'] },
    ],
    fields: {
      etsgDateOperation: '2026-11-10', aeatsiiClaveTipo: 'F1', aeatsiiDescripcionSii: 'Venta',
      etvfacInvType: 'F1', ...fields,
    },
    siiAuthorizationAvailable: true,
  });
  // A rectificative: same fields plus the SII motive, and R-codes on VERI*FACTU's type.
  const rectificative = (fields = {}) => ({
    ...ordinary(),
    rectificative: true,
    fieldSpecs: [
      { name: 'etsgDateOperation', system: 'SII', type: 'date' },
      { name: 'aeatsiiClaveTipo', system: 'SII', type: 'option', options: ['F1', 'F2', 'R'] },
      { name: 'aeatsiiMotivoRectif', system: 'SII', type: 'option', options: ['R1', 'R2', 'R3', 'R4', 'R5'] },
      { name: 'aeatsiiDescripcionSii', system: 'SII', type: 'text' },
      { name: 'etvfacInvType', system: 'Verifactu', type: 'option', options: ['R1', 'R2', 'R3', 'R4', 'R5'] },
    ],
    fields: {
      etsgDateOperation: '2026-11-10', aeatsiiClaveTipo: 'R', aeatsiiMotivoRectif: null,
      aeatsiiDescripcionSii: 'Abono', etvfacInvType: null, ...fields,
    },
  });

  describe('bulkSifFields', () => {
    it('sends an edited field that every order shares to every order', async () => {
      const summary = await resolve([ordinary(), ordinary()]);
      const payloads = bulkSifFields(summary, { ...summary.preview.fields, aeatsiiDescripcionSii: 'Editada' }, {});
      expect(payloads.map(p => p.aeatsiiDescripcionSii)).toEqual(['Editada', 'Editada']);
      expect(payloads[0]).toEqual({ ...ordinary().fields, aeatsiiDescripcionSii: 'Editada' });
    });

    it('a varying field left untouched keeps each order its own value; once set, all get it', async () => {
      const summary = await resolve([ordinary({ aeatsiiClaveTipo: 'F1' }), ordinary({ aeatsiiClaveTipo: 'F2' })]);
      expect(summary.varying).toEqual({ aeatsiiClaveTipo: true });
      expect(bulkSifFields(summary, summary.preview.fields, summary.varying).map(p => p.aeatsiiClaveTipo))
        .toEqual(['F1', 'F2']);
      expect(bulkSifFields(summary, { ...summary.preview.fields, aeatsiiClaveTipo: 'F2' }, {})
        .map(p => p.aeatsiiClaveTipo)).toEqual(['F2', 'F2']);
    });

    it('never sends an order a field its own preview does not have', async () => {
      const siiOnly = { ...ordinary(), systems: ['SII'], fieldSpecs: ordinary().fieldSpecs.slice(0, 3) };
      delete siiOnly.fields.etvfacInvType;
      const summary = await resolve([siiOnly, ordinary()]);
      // etvfacInvType exists on one order only: one value, not varying.
      expect(summary.varying).toEqual({});
      const payloads = bulkSifFields(summary, { ...summary.preview.fields, etvfacInvType: 'F2' }, {});
      expect(payloads[0]).not.toHaveProperty('etvfacInvType');
      expect(payloads[1].etvfacInvType).toBe('F2');
    });

    it('a mixed run: ordinary invoices get no rectification code, rectificatives the chosen ones', async () => {
      const summary = await resolve([ordinary(), rectificative()]);
      expect(summary.preview.mixed).toBe(true);
      const values = {
        ...summary.preview.fields,
        aeatsiiMotivoRectif: 'R2',
        [BULK_RECTIFICATIVE_VF_KEY]: 'R3',
        etvfacInvType: 'F2',
      };
      const [plain, rect] = bulkSifFields(summary, values, {});
      expect(plain).not.toHaveProperty('aeatsiiMotivoRectif');
      expect(plain.etvfacInvType).toBe('F2');
      expect(rect.aeatsiiMotivoRectif).toBe('R2');
      expect(rect.etvfacInvType).toBe('R3');
      expect(rect).not.toHaveProperty(BULK_RECTIFICATIVE_VF_KEY);
    });

    it('returns nothing for a summary without previews', () => {
      expect(bulkSifFields(null, {}, {})).toEqual([]);
    });
  });

  describe('useBulkSifStep blocking', () => {
    it('a varying mandatory field blocks when one order has it empty, until it is set', async () => {
      const summary = await resolve([ordinary({ aeatsiiDescripcionSii: 'Venta' }), ordinary({ aeatsiiDescripcionSii: '' })]);
      expect(summary.varying).toEqual({ aeatsiiDescripcionSii: true });
      const { result } = renderHook(() => useBulkSifStep(summary));
      expect(result.current.valid).toBe(false);
      expect(result.current.missing).toEqual(['aeatsiiDescripcionSii']);
      act(() => result.current.setValue('aeatsiiDescripcionSii', 'Común'));
      expect(result.current.valid).toBe(true);
      expect(result.current.payloads().map(p => p.aeatsiiDescripcionSii)).toEqual(['Común', 'Común']);
    });

    it('a varying mandatory field filled on every order does not block', async () => {
      const summary = await resolve([ordinary({ aeatsiiClaveTipo: 'F1' }), ordinary({ aeatsiiClaveTipo: 'F2' })]);
      const { result } = renderHook(() => useBulkSifStep(summary));
      expect(result.current.valid).toBe(true);
    });

    it('a shared mandatory field left blank blocks', async () => {
      const summary = await resolve([ordinary({ aeatsiiDescripcionSii: null }), ordinary({ aeatsiiDescripcionSii: null })]);
      const { result } = renderHook(() => useBulkSifStep(summary));
      expect(result.current.missing).toEqual(['aeatsiiDescripcionSii']);
      act(() => result.current.setValue('aeatsiiDescripcionSii', '  '));
      expect(result.current.valid).toBe(false);
      act(() => result.current.setValue('aeatsiiDescripcionSii', 'Venta'));
      expect(result.current.valid).toBe(true);
    });

    it('empty rectification codes block until each one is chosen', async () => {
      const summary = await resolve([ordinary(), rectificative()]);
      const { result } = renderHook(() => useBulkSifStep(summary));
      expect(result.current.missing).toEqual(['aeatsiiMotivoRectif', BULK_RECTIFICATIVE_VF_KEY]);
      act(() => result.current.setValue('aeatsiiMotivoRectif', 'R1'));
      expect(result.current.missing).toEqual([BULK_RECTIFICATIVE_VF_KEY]);
      act(() => result.current.setValue(BULK_RECTIFICATIVE_VF_KEY, 'R1'));
      expect(result.current.valid).toBe(true);
    });
  });

  describe('BulkInvoiceSifStepModal', () => {
    async function renderBulk(list, props = {}) {
      const summary = await resolve(list);
      const handlers = { onConfirm: vi.fn(), onCancel: vi.fn() };
      render(<BulkInvoiceSifStepModal summary={summary} confirmLabel="Crear" notice="n" {...handlers} {...props} />);
      return handlers;
    }

    it('a mixed run shows VERI*FACTU type twice: F codes for ordinary, R1-R5 tagged rectificative-only', async () => {
      await renderBulk([ordinary(), rectificative()]);
      const plain = screen.getByTestId('Select__sifstep_etvfacInvType');
      const rect = screen.getByTestId(`Select__sifstep_${BULK_RECTIFICATIVE_VF_KEY}`);
      expect(plain).toHaveTextContent('F1 -');
      expect(plain).not.toHaveTextContent('R1 -');
      ['R1', 'R2', 'R3', 'R4', 'R5'].forEach(code => expect(rect).toHaveTextContent(`${code} -`));
      expect(rect).not.toHaveTextContent('F1 -');
      const rectRow = rect.closest('div.space-y-1\\.5');
      expect(rectRow).toHaveTextContent('invoiceSifStep.rectificativeOnly');
      expect(plain.closest('div.space-y-1\\.5')).not.toHaveTextContent('invoiceSifStep.rectificativeOnly');
      // The SII motive exists on the rectificatives only: tagged too, and mandatory.
      expect(screen.getByTestId('Select__sifstep_aeatsiiMotivoRectif').closest('div.space-y-1\\.5'))
        .toHaveTextContent('invoiceSifStep.rectificativeOnly');
      expect(screen.getByTestId('RequiredMark__sifstep_sif-step-aeatsiiMotivoRectif')).toBeInTheDocument();
    });

    // Repro: the merged field took its kind from the FIRST order that had it, so with the
    // rectificative first the fields every order shares were tagged rectificative-only.
    it('a mixed run tags the same fields whatever the order of the orders', async () => {
      const rowOf = testId => screen.getByTestId(testId).closest('div.space-y-1\\.5');
      for (const list of [[ordinary(), rectificative()], [rectificative(), ordinary()]]) {
        const { onConfirm } = await renderBulk(list);
        ['Input__sifstep_aeatsiiDescripcionSii', 'Select__sifstep_aeatsiiClaveTipo',
          'Select__sifstep_etvfacInvType'].forEach(testId =>
          expect(rowOf(testId)).not.toHaveTextContent('invoiceSifStep.rectificativeOnly'));
        [`Select__sifstep_${BULK_RECTIFICATIVE_VF_KEY}`, 'Select__sifstep_aeatsiiMotivoRectif'].forEach(testId =>
          expect(rowOf(testId)).toHaveTextContent('invoiceSifStep.rectificativeOnly'));
        // A shared field offers only the codes every order accepts: no 'R' for the ordinary one.
        expect(screen.queryByTestId('pick-Select__sifstep_aeatsiiClaveTipo-R')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('pick-Select__sifstep_aeatsiiMotivoRectif-R2'));
        fireEvent.click(screen.getByTestId(`pick-Select__sifstep_${BULK_RECTIFICATIVE_VF_KEY}-R3`));
        fireEvent.click(screen.getByTestId('invoice-sif-step-modal-confirm'));
        const payloads = onConfirm.mock.calls[0][0];
        const plain = payloads[list.findIndex(p => !p.rectificative)];
        const rect = payloads[list.findIndex(p => p.rectificative)];
        expect(plain).toEqual(ordinary().fields);
        expect(rect).toMatchObject({ aeatsiiMotivoRectif: 'R2', etvfacInvType: 'R3' });
        cleanup();
      }
    });

    it('a run of rectificatives only does not tag anything as rectificative-only', async () => {
      await renderBulk([rectificative(), rectificative()]);
      expect(screen.queryByText(/invoiceSifStep\.rectificativeOnly/)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`Select__sifstep_${BULK_RECTIFICATIVE_VF_KEY}`)).not.toBeInTheDocument();
    });

    it('blocks the confirm until the rectification codes are chosen, then sends one payload per order', async () => {
      const { onConfirm } = await renderBulk([ordinary(), rectificative()]);
      const confirm = screen.getByTestId('invoice-sif-step-modal-confirm');
      expect(confirm).toBeDisabled();
      expect(screen.getByTestId('invoice-sif-step-required')).toHaveTextContent('invoiceSifStep.rectificationRequired');
      fireEvent.click(screen.getByTestId('pick-Select__sifstep_aeatsiiMotivoRectif-R2'));
      fireEvent.click(screen.getByTestId(`pick-Select__sifstep_${BULK_RECTIFICATIVE_VF_KEY}-R3`));
      expect(confirm).not.toBeDisabled();
      fireEvent.click(confirm);
      expect(onConfirm).toHaveBeenCalledTimes(1);
      const [plain, rect] = onConfirm.mock.calls[0][0];
      expect(plain).toEqual(ordinary().fields);
      expect(rect).toMatchObject({ aeatsiiMotivoRectif: 'R2', etvfacInvType: 'R3' });
    });

    it('× and Cancelar both cancel', async () => {
      const { onCancel, onConfirm } = await renderBulk([ordinary(), ordinary()]);
      fireEvent.click(screen.getByTestId('invoice-sif-step-modal-close'));
      fireEvent.click(screen.getByTestId('invoice-sif-step-modal-cancel'));
      expect(onCancel).toHaveBeenCalledTimes(2);
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });
});

describe('useInvoiceSifStep', () => {
  function setup(apiFetch, props = {}) {
    return renderHook((p) => useInvoiceSifStep(p), {
      initialProps: { enabled: true, apiFetch, defaultsUrl: '/so/1/action/sifDefaults', ...props },
    });
  }

  it('shows the step with the preview defaults when a system is active, without proceeding', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse(preview()));
    const proceed = vi.fn();
    const { result } = setup(apiFetch);

    await act(async () => { await result.current.start(proceed); });

    expect(proceed).not.toHaveBeenCalled();
    expect(result.current.active).toBe(true);
    expect(result.current.values.aeatsiiClaveTipo).toBe('F1');
    expect(result.current.payload).toEqual(preview().fields);
  });

  it('proceeds straight away when the preview has no systems', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ systems: [] }));
    const proceed = vi.fn();
    const { result } = setup(apiFetch);
    await act(async () => { await result.current.start(proceed); });
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(false);
    expect(result.current.payload).toBeUndefined();
  });

  it('fails open: a failed preview proceeds without the step', async () => {
    const apiFetch = vi.fn().mockRejectedValue(new Error('down'));
    const proceed = vi.fn();
    const { result } = setup(apiFetch);
    await act(async () => { await result.current.start(proceed); });
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(false);
  });

  it('never asks the server when no invoice is requested', async () => {
    const apiFetch = vi.fn();
    const proceed = vi.fn();
    const { result } = setup(apiFetch, { enabled: false });
    await act(async () => { await result.current.start(proceed); });
    expect(apiFetch).not.toHaveBeenCalled();
    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it('on the step, the same click proceeds; back keeps the edits and does not refetch', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse(preview()));
    const proceed = vi.fn();
    const { result } = setup(apiFetch);
    await act(async () => { await result.current.start(proceed); });

    act(() => result.current.setValue('aeatsiiClaveTipo', 'F2'));
    act(() => result.current.back());
    expect(result.current.active).toBe(false);

    await act(async () => { await result.current.start(proceed); });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(true);
    expect(result.current.values.aeatsiiClaveTipo).toBe('F2');

    await act(async () => { await result.current.start(proceed); });
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(result.current.payload.aeatsiiClaveTipo).toBe('F2');
  });

  // A rectificative whose preview preselects no code (any rectificative but a customer return's,
  // which comes with R1): both come empty, VERI*FACTU's type included, and the step stays invalid
  // until the user chooses each one.
  it('a rectificative comes with no code preselected and is invalid until each one is chosen', async () => {
    const p = preview({
      rectificative: true,
      fields: { ...preview().fields, aeatsiiMotivoRectif: null, etvfacInvType: null },
    });
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse(p));
    const { result } = setup(apiFetch);
    await act(async () => { await result.current.start(vi.fn()); });
    expect(result.current.values.aeatsiiMotivoRectif).toBeNull();
    expect(result.current.values.etvfacInvType).toBeNull();
    expect(result.current.valid).toBe(false);
    expect(result.current.missing).toEqual(['aeatsiiMotivoRectif', 'etvfacInvType']);
    act(() => result.current.setValue('aeatsiiMotivoRectif', 'R1'));
    expect(result.current.valid).toBe(false);
    act(() => result.current.setValue('etvfacInvType', 'R2'));
    expect(result.current.valid).toBe(true);
    expect(result.current.payload).toMatchObject({ aeatsiiMotivoRectif: 'R1', etvfacInvType: 'R2' });
  });

  it('an empty mandatory field that is not a code (SII description) also blocks the step', async () => {
    const p = preview({ fields: { ...preview().fields, aeatsiiDescripcionSii: '' } });
    const { result } = setup(vi.fn().mockResolvedValue(jsonResponse(p)));
    await act(async () => { await result.current.start(vi.fn()); });
    expect(result.current.valid).toBe(false);
    expect(result.current.missing).toEqual(['aeatsiiDescripcionSii']);
    act(() => result.current.setValue('aeatsiiDescripcionSii', '   '));
    expect(result.current.valid).toBe(false);
    act(() => result.current.setValue('aeatsiiDescripcionSii', 'Venta'));
    expect(result.current.valid).toBe(true);
    expect(result.current.missing).toEqual([]);
  });

  it('on an ordinary invoice an empty rectification motive does not block', async () => {
    const { result } = setup(vi.fn().mockResolvedValue(jsonResponse(preview())));
    await act(async () => { await result.current.start(vi.fn()); });
    expect(result.current.values.aeatsiiMotivoRectif).toBeNull();
    expect(result.current.valid).toBe(true);
  });

  it('the operation date blocks only when VERI*FACTU is active', async () => {
    const siiOnly = preview({
      systems: ['SII'], fieldSpecs: SII_SPEC, fields: { ...preview().fields, etsgDateOperation: null },
    });
    const first = setup(vi.fn().mockResolvedValue(jsonResponse(siiOnly)));
    await act(async () => { await first.result.current.start(vi.fn()); });
    expect(first.result.current.valid).toBe(true);

    const withVf = preview({ fields: { ...preview().fields, etsgDateOperation: null } });
    const second = setup(vi.fn().mockResolvedValue(jsonResponse(withVf)));
    await act(async () => { await second.result.current.start(vi.fn()); });
    expect(second.result.current.missing).toEqual(['etsgDateOperation']);
  });

  it('a mandatory field the preview does not list never blocks', async () => {
    // VERI*FACTU's description is mandatory, but the backend did not offer it as editable.
    const { result } = setup(vi.fn().mockResolvedValue(jsonResponse(preview())));
    await act(async () => { await result.current.start(vi.fn()); });
    expect(result.current.values.etvfacVerifacDesc).toBeUndefined();
    expect(result.current.missing).toEqual([]);
  });

  it('Back keeps the codes already chosen on a rectificative', async () => {
    const p = preview({
      rectificative: true,
      fields: { ...preview().fields, aeatsiiMotivoRectif: null, etvfacInvType: null },
    });
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse(p));
    const proceed = vi.fn();
    const { result } = setup(apiFetch);
    await act(async () => { await result.current.start(proceed); });
    act(() => result.current.setValue('aeatsiiMotivoRectif', 'R1'));
    act(() => result.current.back());
    await act(async () => { await result.current.start(proceed); });
    expect(result.current.active).toBe(true);
    expect(result.current.values.aeatsiiMotivoRectif).toBe('R1');
    expect(result.current.missing).toEqual(['etvfacInvType']);
    expect(proceed).not.toHaveBeenCalled();
  });

  it('goes back to idle when the invoice is no longer requested', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse(preview()));
    const { result, rerender } = setup(apiFetch);
    await act(async () => { await result.current.start(vi.fn()); });
    expect(result.current.active).toBe(true);
    rerender({ enabled: false, apiFetch, defaultsUrl: '/so/1/action/sifDefaults' });
    await waitFor(() => expect(result.current.active).toBe(false));
    expect(result.current.payload).toBeUndefined();
  });
});

describe('InvoiceSifStepPanel', () => {
  it('renders nothing without a preview', () => {
    const { container } = render(<InvoiceSifStepPanel sif={editableStep(null, {})} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one section per active system, with its title and fields', () => {
    render(<InvoiceSifStepPanel sif={editableStep(preview())} />);
    expect(screen.getByTestId('invoice-sif-step-SII')).toHaveTextContent('sifDataTabs.panel.sii.title');
    expect(screen.getByTestId('invoice-sif-step-Verifactu')).toHaveTextContent('sifDataTabs.panel.verifactu.title');
    expect(screen.queryByTestId('invoice-sif-step-TicketBAI')).not.toBeInTheDocument();
    expect(screen.getByTestId('invoice-sif-step')).toHaveTextContent('invoiceSifStep.description');
  });

  it('prints every option as "CODE - Label" and restricts it to the allowed codes', () => {
    render(<InvoiceSifStepPanel sif={editableStep(preview())} />);
    const claveTipo = screen.getByTestId('Select__sifstep_aeatsiiClaveTipo');
    expect(claveTipo).toHaveTextContent('F1 - sifDataTabs.option.invoice');
    expect(claveTipo).toHaveTextContent('F2 - sifDataTabs.option.simplifiedInvoice');
    expect(claveTipo).toHaveTextContent('R - sifDataTabs.option.correctiveInvoice');
    // F4 is not in the spec's allowed options.
    expect(claveTipo).not.toHaveTextContent('F4 -');
    // No allowed list: every option of the field is offered.
    expect(screen.getByTestId('Select__sifstep_aeatsiiMotivoRectif')).toHaveTextContent('R5 - sifDataTabs.option.siiMotivoR5');
  });

  it('shows the art. 7.2/7.3 flag or the art. 6.1.d flag depending on the VERI*FACTU type', () => {
    const { rerender } = render(<InvoiceSifStepPanel sif={editableStep(preview())} />);
    expect(screen.getByTestId('CheckboxField__sifstep_etvfacSimpinvart7273')).toBeInTheDocument();
    expect(screen.queryByTestId('CheckboxField__sifstep_etvfacInvNoIDArt61d')).not.toBeInTheDocument();
    const p = preview();
    rerender(<InvoiceSifStepPanel sif={editableStep(p, { ...p.fields, etvfacInvType: 'F2' })} />);
    expect(screen.queryByTestId('CheckboxField__sifstep_etvfacSimpinvart7273')).not.toBeInTheDocument();
    expect(screen.getByTestId('CheckboxField__sifstep_etvfacInvNoIDArt61d')).toBeInTheDocument();
  });

  it('reports each edit through setValue', () => {
    const step = editableStep(preview());
    render(<InvoiceSifStepPanel sif={step} />);
    fireEvent.click(screen.getByTestId('pick-Select__sifstep_aeatsiiClaveTipo-F2'));
    fireEvent.change(screen.getByTestId('Input__sifstep_aeatsiiDescripcionSii'), { target: { value: 'Otro' } });
    fireEvent.change(screen.getByTestId('DateField__sifstep_etsgDateOperation'), { target: { value: '2026-11-01' } });
    fireEvent.click(screen.getByTestId('CheckboxField__sifstep_aeatsiiIsauthorization'));
    expect(step.setValue).toHaveBeenCalledWith('aeatsiiClaveTipo', 'F2');
    expect(step.setValue).toHaveBeenCalledWith('aeatsiiDescripcionSii', 'Otro');
    expect(step.setValue).toHaveBeenCalledWith('etsgDateOperation', '2026-11-01');
    expect(step.setValue).toHaveBeenCalledWith('aeatsiiIsauthorization', true);
  });

  it('disables the SII authorization when the organization cannot use it', () => {
    render(<InvoiceSifStepPanel sif={editableStep(preview({ siiAuthorizationAvailable: false }))} />);
    expect(screen.getByTestId('CheckboxField__sifstep_aeatsiiIsauthorization')).toBeDisabled();
  });

  it('shows the rectification warning while a rectification code is missing', () => {
    const p = preview({
      rectificative: true,
      fields: { ...preview().fields, aeatsiiMotivoRectif: null, etvfacInvType: null },
    });
    render(<InvoiceSifStepPanel
      sif={editableStep(p, undefined, { valid: false, missing: ['aeatsiiMotivoRectif', 'etvfacInvType'] })} />);
    expect(screen.getByTestId('invoice-sif-step-required')).toHaveTextContent('invoiceSifStep.rectificationRequired');
  });

  it('names empty mandatory fields with the generic hint when no rectification code is missing', () => {
    const p = preview({ fields: { ...preview().fields, aeatsiiDescripcionSii: '' } });
    render(<InvoiceSifStepPanel
      sif={editableStep(p, undefined, { valid: false, missing: ['aeatsiiDescripcionSii'] })} />);
    expect(screen.getByTestId('invoice-sif-step-required')).toHaveTextContent('requiredFieldsMissing');
    expect(screen.getByTestId('invoice-sif-step-required')).not.toHaveTextContent('rectificationRequired');
  });

  it('marks every mandatory field of an ordinary invoice with * and aria-required', () => {
    render(<InvoiceSifStepPanel sif={editableStep(preview())} />);
    ['aeatsiiClaveTipo', 'aeatsiiDescripcionSii', 'etvfacInvType', 'etsgDateOperation'].forEach(name => {
      expect(screen.getByTestId(`RequiredMark__sifstep_sif-step-${name}`)).toHaveTextContent('*');
    });
    expect(screen.getByTestId('SelectTrigger__sifstep_aeatsiiClaveTipo')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByTestId('SelectTrigger__sifstep_etvfacInvType')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByTestId('Input__sifstep_aeatsiiDescripcionSii')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByTestId('DateField__sifstep_etsgDateOperation')).toBeRequired();
    // The rectification motive is not mandatory on an ordinary invoice.
    expect(screen.queryByTestId('RequiredMark__sifstep_sif-step-aeatsiiMotivoRectif')).not.toBeInTheDocument();
    expect(screen.getByTestId('SelectTrigger__sifstep_aeatsiiMotivoRectif')).not.toHaveAttribute('aria-required');
  });

  it('does not mark the operation date when VERI*FACTU is not active', () => {
    render(<InvoiceSifStepPanel sif={editableStep(preview({ systems: ['SII'], fieldSpecs: SII_SPEC }))} />);
    expect(screen.queryByTestId('RequiredMark__sifstep_sif-step-etsgDateOperation')).not.toBeInTheDocument();
    expect(screen.getByTestId('DateField__sifstep_etsgDateOperation')).not.toBeRequired();
    expect(screen.getByTestId('RequiredMark__sifstep_sif-step-aeatsiiClaveTipo')).toBeInTheDocument();
  });

  it('on a rectificative, the three codes render empty and are marked mandatory', () => {
    const p = preview({
      systems: ['SII', 'Verifactu', 'TicketBAI'],
      fieldSpecs: [...SII_SPEC, ...VF_SPEC, { name: 'tbaiReverseinvoicecode', system: 'TicketBAI', type: 'option' }],
      rectificative: true,
      fields: { ...preview().fields, aeatsiiMotivoRectif: null, etvfacInvType: null, tbaiReverseinvoicecode: null },
    });
    render(<InvoiceSifStepPanel sif={editableStep(p)} />);
    ['aeatsiiMotivoRectif', 'etvfacInvType', 'tbaiReverseinvoicecode'].forEach(name => {
      expect(screen.getByTestId(`Select__sifstep_${name}`)).toHaveAttribute('data-value', '');
      expect(screen.getByTestId(`RequiredMark__sifstep_sif-step-${name}`)).toBeInTheDocument();
      expect(screen.getByTestId(`SelectTrigger__sifstep_${name}`)).toHaveAttribute('aria-required', 'true');
    });
  });

  it('marks nothing in read-only mode', () => {
    const p = preview({ rectificative: true });
    const { container } = render(<InvoiceSifStepPanel sif={editableStep(p)} readOnly />);
    expect(container.querySelector('[data-testid^="RequiredMark__sifstep_"]')).toBeNull();
    expect(container.querySelector('[aria-required]')).toBeNull();
    expect(screen.getByTestId('DateField__sifstep_etsgDateOperation')).not.toBeRequired();
  });

  it('marks a varying mandatory field too: the bulk step is editable', () => {
    render(<InvoiceSifStepPanel sif={{ ...editableStep(preview()), varying: { aeatsiiClaveTipo: true } }} />);
    expect(screen.getByTestId('RequiredMark__sifstep_sif-step-aeatsiiClaveTipo')).toBeInTheDocument();
    expect(screen.getByTestId('RequiredMark__sifstep_sif-step-aeatsiiDescripcionSii')).toBeInTheDocument();
  });

  it('read-only: every control is disabled, the notice replaces the description, no warning', () => {
    const p = preview();
    render(
      <InvoiceSifStepPanel
        sif={editableStep(p, undefined, { valid: false })}
        readOnly
        notice="bulk notice" />,
    );
    expect(screen.getByTestId('invoice-sif-step-notice')).toHaveTextContent('bulk notice');
    expect(screen.getByTestId('invoice-sif-step')).not.toHaveTextContent('invoiceSifStep.description');
    expect(screen.getByTestId('Input__sifstep_aeatsiiDescripcionSii')).toBeDisabled();
    expect(screen.getByTestId('DateField__sifstep_etsgDateOperation')).toBeDisabled();
    expect(screen.getByTestId('CheckboxField__sifstep_aeatsiiIsauthorization')).toBeDisabled();
    expect(screen.getByTestId('CheckboxField__sifstep_etvfacSimpinvart7273')).toBeDisabled();
    expect(screen.getByTestId('Select__sifstep_aeatsiiClaveTipo')).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByTestId('Select__sifstep_etvfacInvType')).toHaveAttribute('data-disabled', 'true');
    expect(screen.queryByTestId('invoice-sif-step-required')).not.toBeInTheDocument();
  });

  it('keeps a varying field editable, empty, with a "per customer" / "per order" note', () => {
    const p = preview();
    render(
      <InvoiceSifStepPanel
        sif={{ ...editableStep(p), varying: { aeatsiiClaveTipo: true, etvfacInvType: true } }} />,
    );
    expect(screen.getByTestId('Varies__sifstep_aeatsiiClaveTipo')).toHaveTextContent('invoiceSifStep.variesPerCustomer');
    expect(screen.getByTestId('Varies__sifstep_etvfacInvType')).toHaveTextContent('invoiceSifStep.variesPerOrder');
    expect(screen.getByTestId('Select__sifstep_aeatsiiClaveTipo')).toHaveAttribute('data-value', '');
    expect(screen.getByTestId('Select__sifstep_aeatsiiClaveTipo')).toHaveAttribute('data-disabled', 'false');
  });
});

describe('InvoiceSifStepModal', () => {
  function renderModal(props = {}) {
    const step = editableStep(preview());
    const handlers = { onConfirm: vi.fn(), onClose: vi.fn() };
    render(<InvoiceSifStepModal sif={step} confirmLabel="Confirmar" {...handlers} {...props} />);
    return { step, ...handlers };
  }

  it('× and Cancelar close without confirming; Atrás goes back', () => {
    const { step, onConfirm, onClose } = renderModal();
    fireEvent.click(screen.getByTestId('invoice-sif-step-modal-close'));
    fireEvent.click(screen.getByTestId('invoice-sif-step-modal-cancel'));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByTestId('invoice-sif-step-modal-back'));
    expect(step.back).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirm calls onConfirm with the given label', () => {
    const { onConfirm } = renderModal();
    const confirm = screen.getByTestId('invoice-sif-step-modal-confirm');
    expect(confirm).toHaveTextContent('Confirmar');
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('with onCancel (bulk step): no Atrás, Cancelar calls onCancel, × still calls onClose', () => {
    const onCancel = vi.fn();
    const { onClose } = renderModal({ onCancel, sif: editableStep(preview()) });
    expect(screen.queryByTestId('invoice-sif-step-modal-back')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('invoice-sif-step-modal-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('invoice-sif-step-modal-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('confirm is disabled while a required rectification code is empty', () => {
    renderModal({ sif: editableStep(preview(), undefined, { valid: false }) });
    expect(screen.getByTestId('invoice-sif-step-modal-confirm')).toBeDisabled();
  });

  it('while loading: every button disabled, the backdrop does not close, the busy label shows', () => {
    const { onClose } = renderModal({ loading: true });
    ['close', 'cancel', 'back', 'confirm'].forEach(k => {
      expect(screen.getByTestId(`invoice-sif-step-modal-${k}`)).toBeDisabled();
    });
    expect(screen.getByTestId('invoice-sif-step-modal-confirm')).toHaveTextContent('soProcessing');
    fireEvent.click(screen.getByTestId('invoice-sif-step-modal'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a click on the backdrop closes; a click inside the dialog does not', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByTestId('invoice-sif-step'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('invoice-sif-step-modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the error under the panel', () => {
    renderModal({ error: 'Boom' });
    expect(screen.getByTestId('invoice-sif-step-modal-error')).toHaveTextContent('Boom');
  });
});
