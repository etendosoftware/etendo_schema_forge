// @covers tools/app-shell/src/windows/custom/shared/InvoiceSifStep.jsx
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
  DateField: ({ id, value, onChange, disabled, ...rest }) => (
    <input
      id={id}
      type="date"
      value={value}
      disabled={disabled}
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
    SelectTrigger: ({ children, id }) => <div id={id}>{children}</div>,
    SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
    SelectContent: ({ children }) => <div>{children}</div>,
    SelectItem,
  };
});

import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import {
  fetchSifPreview,
  hasSifSystems,
  InvoiceSifStepModal,
  InvoiceSifStepPanel,
  readOnlySifStep,
  resolveBulkSifPreview,
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

describe('readOnlySifStep', () => {
  it('exposes the preview fields as values, always valid and with no-op setters', () => {
    const p = preview();
    const step = readOnlySifStep(p, { aeatsiiClaveTipo: true });
    expect(step.values).toBe(p.fields);
    expect(step.valid).toBe(true);
    expect(step.varying).toEqual({ aeatsiiClaveTipo: true });
    expect(() => step.setValue('x', 1)).not.toThrow();
    expect(step.back()).toBeUndefined();
  });

  it('tolerates a null preview', () => {
    expect(readOnlySifStep(null).values).toEqual({});
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

  it('marks a field varying when one order does not have it, and unions systems and specs', async () => {
    const a = { systems: ['SII'], fieldSpecs: [SII_SPEC[0]], fields: { etsgDateOperation: '2026-11-10' }, siiAuthorizationAvailable: true };
    const b = { systems: ['Verifactu'], fieldSpecs: [VF_SPEC[0]], fields: { etvfacInvType: 'F1' }, siiAuthorizationAvailable: true };
    const res = await resolveBulkSifPreview(fetchByUrl({ a: jsonResponse(a), b: jsonResponse(b) }), ['a', 'b']);
    expect(res.preview.systems).toEqual(['SII', 'Verifactu']);
    expect(res.preview.fieldSpecs.map(s => s.name)).toEqual(['etsgDateOperation', 'etvfacInvType']);
    expect(res.varying).toEqual({ etsgDateOperation: true, etvfacInvType: true });
  });

  it('offers the SII authorization only when every order allows it', async () => {
    const a = preview();
    const b = preview({ siiAuthorizationAvailable: false });
    const res = await resolveBulkSifPreview(fetchByUrl({ a: jsonResponse(a), b: jsonResponse(b) }), ['a', 'b']);
    expect(res.preview.siiAuthorizationAvailable).toBe(false);
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

  it('a rectificative is invalid until every required code is chosen', async () => {
    const p = preview({ rectificative: true, fields: { ...preview().fields, etvfacInvType: 'R4' } });
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse(p));
    const { result } = setup(apiFetch);
    await act(async () => { await result.current.start(vi.fn()); });
    expect(result.current.valid).toBe(false);
    act(() => result.current.setValue('aeatsiiMotivoRectif', 'R4'));
    expect(result.current.valid).toBe(true);
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

  it('shows the rectification warning when the step is not valid', () => {
    render(<InvoiceSifStepPanel sif={editableStep(preview(), undefined, { valid: false })} />);
    expect(screen.getByTestId('invoice-sif-step-required')).toHaveTextContent('invoiceSifStep.rectificationRequired');
  });

  it('read-only: every control is disabled, the notice replaces the description, no warning', () => {
    const p = preview();
    render(
      <InvoiceSifStepPanel
        sif={{ ...readOnlySifStep(p), valid: false }}
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

  it('shows a varying field as "per customer" / "per order" text instead of its control', () => {
    const p = preview();
    render(
      <InvoiceSifStepPanel
        sif={readOnlySifStep(p, { aeatsiiClaveTipo: true, etvfacInvType: true })}
        readOnly />,
    );
    expect(screen.getByTestId('Varies__sifstep_aeatsiiClaveTipo')).toHaveValue('invoiceSifStep.variesPerCustomer');
    expect(screen.getByTestId('Varies__sifstep_etvfacInvType')).toHaveValue('invoiceSifStep.variesPerOrder');
    expect(screen.queryByTestId('Select__sifstep_aeatsiiClaveTipo')).not.toBeInTheDocument();
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

  it('with onCancel (bulk summary): no Atrás, Cancelar calls onCancel, × still calls onClose', () => {
    const onCancel = vi.fn();
    const { onClose } = renderModal({ onCancel, readOnly: true, sif: readOnlySifStep(preview()) });
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
