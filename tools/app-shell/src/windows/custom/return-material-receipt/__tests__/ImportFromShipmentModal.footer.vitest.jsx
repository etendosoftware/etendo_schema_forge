// @covers tools/app-shell/src/windows/custom/return-material-receipt/ImportFromShipmentModal.jsx
// @covers tools/app-shell/src/components/contract-ui/ImportLinesModal.jsx
//
// ETP-5651 — the shipment popup of the return receipt, rendered with the REAL ImportLinesModal: its
// footer counts the selected LINES (singular / plural) and the import button follows the selection,
// with no extra prop — the same wording as the order popup.

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

const mockApiFetch = vi.fn();
vi.mock('@/auth/api.js', () => ({ apiFetch: (...args) => mockApiFetch(...args) }));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ImportFromShipmentModal from '../ImportFromShipmentModal.jsx';

const ok = (data) => ({ ok: true, json: async () => ({ response: { data } }) });

describe('ImportFromShipmentModal footer (ETP-5651)', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (url) => {
      if (url.endsWith('/availableShipments')) {
        return ok([{ id: 'S1', documentNo: 'SHIP-001', movementDate: '2026-10-01', pendingLines: 2 }]);
      }
      if (url.endsWith('/availableShipmentLines')) {
        return ok([
          { id: 'L1', lineNo: 10, 'product$_identifier': 'Widget A', movementQuantity: 2, returnableQuantity: 2 },
          { id: 'L2', lineNo: 20, 'product$_identifier': 'Widget B', movementQuantity: 3, returnableQuantity: 3 },
        ]);
      }
      return ok([]);
    });
  });

  it('shows the empty hint, then «1 línea» / «N líneas» seleccionada(s), and enables the button', async () => {
    render(
      <ImportFromShipmentModal
        targetId="REC-1" bpId="BP-1" base="/sws/neo" headers={{}} onClose={vi.fn()} onSuccess={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText('SHIP-001')).toBeInTheDocument());

    const hint = screen.getByTestId('ImportLinesModal__selectionHint');
    const button = screen.getByTestId('ImportLinesModal__import');
    expect(hint).toHaveTextContent('selectLinesToImport');
    expect(button).toBeDisabled();

    fireEvent.click(screen.getByText('SHIP-001').closest('[data-testid="ImportLinesModal__docRow"]'));
    await waitFor(() => expect(screen.getByText('Widget A')).toBeInTheDocument());
    // autoSelectOnExpand: both lines come selected.
    await waitFor(() => expect(hint).toHaveTextContent('importLinesSelectedCountMany:{"count":2}'));
    expect(hint).not.toHaveTextContent('selected:');
    expect(button).not.toBeDisabled();

    fireEvent.click(screen.getByText('Widget B').closest('[data-testid="ImportLinesModal__lineRow"]'));
    expect(hint).toHaveTextContent('importLinesSelectedCountOne:{"count":1}');
    expect(hint).not.toHaveTextContent('selected:');
    expect(button).not.toBeDisabled();
  });
});
