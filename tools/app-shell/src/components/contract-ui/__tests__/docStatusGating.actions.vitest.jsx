// @covers tools/app-shell/src/components/contract-ui/BulkDocumentAction.jsx
// @covers tools/app-shell/src/components/contract-ui/DocumentPrintDrawer.jsx
// @covers tools/app-shell/src/windows/custom/shared/ConfirmWithCreditButtonBase.jsx
// ETP-6232 — table-driven status gating of the shared many-window units touched by the docStatus
// migration, over DR/CO/VO/UE/unknown/undefined, so a later inverted condition is caught.
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/contract-ui/ConfirmInOutModal', () => ({
  default: () => <div data-testid="confirm-inout-modal" />,
}));
vi.mock('@/components/contract-ui/CreateInvoiceConfirmModal', () => ({
  default: () => <div data-testid="create-invoice-confirm-modal" />,
}));

import { act, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { toast } from 'sonner';
import { buildInOutActions } from '../BulkDocumentAction.jsx';
import { printDocuments } from '../DocumentPrintDrawer.jsx';
import ConfirmWithCreditButtonBase from '../../../windows/custom/shared/ConfirmWithCreditButtonBase.jsx';

const STATUSES = ['DR', 'CO', 'VO', 'UE', 'XX', undefined];

describe('buildInOutActions (bulk Confirm)', () => {
  it.each(STATUSES)('status %s', (documentStatus) => {
    expect(buildInOutActions([{ documentStatus }])).toHaveLength(documentStatus === 'DR' ? 1 : 0);
  });

  it('reads docStatus when documentStatus is absent', () => {
    expect(buildInOutActions([{ docStatus: 'DR' }])).toHaveLength(1);
  });
});

describe('printDocuments draft exclusion', () => {
  it.each(STATUSES)('status %s', async (documentStatus) => {
    toast.info.mockClear();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('') });
    await printDocuments('order', [{ id: 'd1', documentStatus }], 'tok', (k) => k);
    const excluded = toast.info.mock.calls.some(([m]) => m === 'printAllDraftExcluded');
    expect(excluded).toBe(documentStatus === 'DR');
    if (documentStatus === 'DR') expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('ConfirmWithCreditButtonBase status gating', () => {
  const PROPS = {
    recordId: 'R1', token: 't', apiBaseUrl: '/sws/neo/w', entitySegment: 'w', invoiceRoute: '/i/',
    invoiceType: 'facturaVenta', generatePdfFn: vi.fn(), getPdfLabelsFn: () => ({}),
    specName: 'w', entityName: 'w', onRefresh: vi.fn(), confirmEventName: 'w:open-confirm',
  };

  it.each(STATUSES)('status %s: create-return button only when completed; confirm modal only when draft', (documentStatus) => {
    const { container } = render(<ConfirmWithCreditButtonBase {...PROPS} data={{ documentStatus, linesCount: 2 }} />);
    if (documentStatus !== 'DR' && documentStatus !== 'CO') {
      expect(container).toBeEmptyDOMElement();
      return;
    }
    expect(Boolean(screen.queryByTestId('action-create-return-invoice'))).toBe(documentStatus === 'CO');
    act(() => { window.dispatchEvent(new CustomEvent('w:open-confirm')); });
    expect(Boolean(screen.queryByTestId('confirm-inout-modal'))).toBe(documentStatus === 'DR');
  });
});
