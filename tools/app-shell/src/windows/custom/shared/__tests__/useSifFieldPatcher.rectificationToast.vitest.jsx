// @covers tools/app-shell/src/windows/custom/shared/useSifFieldPatcher.js
// ETP-5745 CP-14/CP-16/CP-23: the rectification heads-up toast fires only while at least one
// ACTIVE fiscal system still needs its own rectification code/motive (missingRectificationSystems),
// and names the PRECISE field of each missing system — never a generic "motivo/código" that is
// flatly wrong for VERI*FACTU (no separate "motivo" field — see SYSTEM_FIELD_LABEL_KEYS' own
// comment in the production file).
//
// Mocks must be declared before any imports that pull in the mocked modules.

const toastWarning = vi.fn();
vi.mock('sonner', () => ({ toast: { warning: (...args) => toastWarning(...args) } }));

vi.mock('@/i18n', () => ({
  // Deterministic, inspectable translation: echoes the key (and, with params, a readable suffix)
  // so assertions can check exactly what was asked for without depending on real locale copy.
  useUI: () => (key, params) => (params ? `${key}{${JSON.stringify(params)}}` : key),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: { id: 'ORG-1' } }),
}));

const useFiscalConfigMock = vi.fn(() => ({ profile: 'sii+tbai', tbaiRecord: {} }));
vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: (...args) => useFiscalConfigMock(...args),
}));

vi.mock('@/windows/custom/fiscal-config/fiscalConfig.utils.js', () => ({
  normalizeDateInputValue: (v) => v ?? '',
}));

import { renderHook } from '@testing-library/react';
import { useSifFieldPatcher, missingRectificationSystems } from '../useSifFieldPatcher.js';

function renderPatcher(data, overrides = {}) {
  const props = {
    data: { documentStatus: 'DR', adOrgId: 'ORG-1', ...data },
    recordId: 'inv-5745',
    apiBaseUrl: '/sws/neo/sales-invoice',
    onChange: vi.fn(),
    ...overrides,
  };
  return renderHook(() => useSifFieldPatcher(props));
}

describe('missingRectificationSystems (pure function)', () => {
  it('returns SII when active and aeatsiiMotivoRectif is blank', () => {
    expect(missingRectificationSystems({}, { showSii: true, showTbai: false, showVerifactu: false }))
      .toEqual(['SII']);
  });

  it('returns nothing for an inactive system even when its field is blank', () => {
    expect(missingRectificationSystems({}, { showSii: false, showTbai: false, showVerifactu: false }))
      .toEqual([]);
  });

  it('treats a non-R1-R5 etvfacInvType as missing for Verifactu', () => {
    expect(missingRectificationSystems({ etvfacInvType: 'F1' },
      { showSii: false, showTbai: false, showVerifactu: true })).toEqual(['Verifactu']);
  });

  it('returns empty once every active system already has its value', () => {
    const data = {
      aeatsiiMotivoRectif: 'R1', tbaiReverseinvoicecode: 'R4', etvfacInvType: 'R2',
    };
    expect(missingRectificationSystems(data, { showSii: true, showTbai: true, showVerifactu: true }))
      .toEqual([]);
  });
});

describe('useSifFieldPatcher — rectification toast (ETP-5745 CP-14/CP-16/CP-23)', () => {
  beforeEach(() => {
    toastWarning.mockClear();
    useFiscalConfigMock.mockClear();
    useFiscalConfigMock.mockReturnValue({ profile: 'sii+tbai', tbaiRecord: {} });
  });

  it('fires naming the precise field of each missing system, joined dynamically', () => {
    renderPatcher({ isRectificative: true });

    expect(toastWarning).toHaveBeenCalledTimes(1);
    const [title, options] = toastWarning.mock.calls[0];
    expect(title).toBe('sifDataTabs.toast.rectificationCodeRequired.title');
    // SII -> "Motivo de rectificación" field label key; TicketBAI -> its own field label key —
    // never a shared generic string for both.
    expect(options.description).toContain('sifDataTabs.field.rectificationReason');
    expect(options.description).toContain('(SII)');
    expect(options.description).toContain('sifDataTabs.field.tbaiReverseinvoicecode');
    expect(options.description).toContain('(TicketBAI)');
  });

  it('does NOT fire when the invoice is not rectificative', () => {
    renderPatcher({ isRectificative: false });

    expect(toastWarning).not.toHaveBeenCalled();
  });

  /**
   * ETP-5745 CP-16: the reactivation (RE) repro — a rectificative invoice whose codes were
   * already filled in before completion must never toast again, because `isRectificative` alone
   * stays true forever. Gating on `missingRectificationSystems(...).length` instead fixes it.
   */
  it('does NOT fire when every active system already has its rectification value', () => {
    renderPatcher({
      isRectificative: true,
      aeatsiiMotivoRectif: 'R1',
      tbaiReverseinvoicecode: 'R4',
    });

    expect(toastWarning).not.toHaveBeenCalled();
  });

  it('names only the system(s) actually missing when some are already complete', () => {
    renderPatcher({ isRectificative: true, aeatsiiMotivoRectif: 'R1' });

    expect(toastWarning).toHaveBeenCalledTimes(1);
    const description = toastWarning.mock.calls[0][1].description;
    expect(description).not.toContain('(SII)');
    expect(description).toContain('(TicketBAI)');
  });

  it('names VERI*FACTU by its own field ("Tipo de Factura"), never a generic "motivo"', () => {
    useFiscalConfigMock.mockReturnValue({ profile: 'verifactu', tbaiRecord: {} });

    renderPatcher({ isRectificative: true, etvfacInvType: 'F1' });

    expect(toastWarning).toHaveBeenCalledTimes(1);
    const description = toastWarning.mock.calls[0][1].description;
    expect(description).toContain('sifDataTabs.field.vfInvoiceType');
    expect(description).toContain('(Verifactu)');
  });

  it('fires only once per record even as other fields keep changing', () => {
    const { rerender } = renderPatcher({ isRectificative: true });
    expect(toastWarning).toHaveBeenCalledTimes(1);

    rerender();
    rerender();

    expect(toastWarning).toHaveBeenCalledTimes(1);
  });

  /**
   * ETP-5745 QA gap (low severity, UX, not a bug): `rectifCodeToastRef` is keyed only by
   * `recordId` ("fires once per record" — see the production comment above the effect), so a
   * double toggle of "Tipo de documento" within the SAME unsaved form (rectificative -> normal
   * -> rectificative again) does not re-arm the toast on the second transition, even though the
   * fields were cleared by the doc-type callout in between. This is intentional: the blocking
   * completion guard (RectificationFiscalCodeGuard.java) still enforces the same requirement
   * regardless of whether this heads-up toast re-fires. Documented here as a test, not just a
   * code comment, per QA's gap report.
   */
  it('does NOT re-fire after a double toggle (rectificative -> normal -> rectificative) in the same unsaved form', () => {
    const baseProps = {
      recordId: 'inv-5745',
      apiBaseUrl: '/sws/neo/sales-invoice',
      onChange: vi.fn(),
    };
    const { rerender } = renderHook(
      ({ data }) => useSifFieldPatcher({ ...baseProps, data }),
      { initialProps: { data: { documentStatus: 'DR', adOrgId: 'ORG-1', isRectificative: true } } },
    );
    expect(toastWarning).toHaveBeenCalledTimes(1);

    // User reverts "Tipo de documento" to a non-rectificative one; the doc-type callout clears
    // the fiscal fields, but the toast guard tracks only recordId, not isRectificative.
    rerender({ data: { documentStatus: 'DR', adOrgId: 'ORG-1', isRectificative: false } });
    expect(toastWarning).toHaveBeenCalledTimes(1);

    // User toggles back to rectificative, same record, still unsaved — no second toast.
    rerender({ data: { documentStatus: 'DR', adOrgId: 'ORG-1', isRectificative: true } });
    expect(toastWarning).toHaveBeenCalledTimes(1);
  });
});
