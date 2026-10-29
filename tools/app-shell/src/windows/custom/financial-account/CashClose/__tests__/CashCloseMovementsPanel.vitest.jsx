// @covers tools/app-shell/src/windows/custom/financial-account/CashClose/CashCloseMovementsPanel.jsx
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { gridViewColumnId } from '@/hooks/useGridView.js';
import { getContractGridColumns } from '@/components/financial-accounts/contractColumns';
import { CashCloseMovementsPanel } from '../CashCloseMovementsPanel.jsx';

const boundary = vi.hoisted(() => ({ enabled: true, apiFetch: vi.fn(), navigate: vi.fn() }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => boundary.apiFetch }));
vi.mock('@/lib/flags', () => ({ GRID_COLUMN_VIEWS: 'grid-column-views', useFeatureFlag: () => boundary.enabled }));
vi.mock('react-router-dom', () => ({ useNavigate: () => boundary.navigate }));
vi.mock('@/i18n', () => ({ useUI: () => (key) => key, useLocaleSwitch: () => ({ locale: 'es_ES' }) }));

const movements = [{ id: 'cash-1', transactionDate: '2026-10-26', partnerName: 'Partner A', documentNo: 'PAY-1', description: 'cash-description', amount: 100 }];
function panel(extra = {}) {
  const props = {
    movements, visible: movements, marked: new Set(), currency: 'EUR', loading: false,
    hideCleared: false, onHideClearedChange: vi.fn(), hideAfter: true, onHideAfterChange: vi.fn(),
    search: '', onSearchChange: vi.fn(), allSelected: false, someSelected: false,
    onToggleAll: vi.fn(), onToggleOne: vi.fn(), afterCount: 0, markedCount: 0, markedNet: 0,
    ...extra,
  };
  return { ...render(<CashCloseMovementsPanel {...props} />), props };
}

describe('cash close movement column views', () => {
  beforeEach(() => {
    boundary.enabled = true;
    const description = getContractGridColumns('transaction').find((column) => column.name === 'description');
    boundary.apiFetch.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => ({
      version: 1, surface: 'list', columns: [
        { id: gridViewColumnId({ ...description, key: 'description' }), visible: false, order: 0 },
        { id: 'list:field:select', visible: false, order: 40 },
      ],
    }) });
  });

  it('preserves row selection, filter callbacks and totals while hiding a personal column', async () => {
    const { props } = panel();
    await waitFor(() => expect(screen.getByTestId('grid-view-columns-trigger')).toBeEnabled());
    expect(boundary.apiFetch).toHaveBeenCalledWith('/sws/neo/grid-views/financial-account/transaction', { baseUrl: '' });
    expect(screen.queryByText('cash-description')).toBeNull();
    const row = screen.getByTestId('cash-close-row-cash-1');
    expect(row.firstElementChild).toContainElement(screen.getByTestId('cash-close-check-cash-1'));
    fireEvent.click(screen.getByTestId('cash-close-check-cash-1'));
    expect(props.onToggleOne).toHaveBeenCalledTimes(1);
    expect(props.onToggleOne).toHaveBeenCalledWith('cash-1');
    fireEvent.click(screen.getByTestId('cash-close-select-all'));
    expect(props.onToggleAll).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByTestId('cash-close-search'), { target: { value: 'Partner' } });
    expect(props.onSearchChange).toHaveBeenCalledWith('Partner');
    expect(screen.getByTestId('cash-close-marked-footer')).toBeInTheDocument();
    expect(within(row).getByText('PAY-1')).toBeInTheDocument();
  });

  it('keeps the original columns and performs no request when the flag is off', () => {
    boundary.enabled = false;
    panel();
    expect(boundary.apiFetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId('grid-view-controls')).toBeNull();
    expect(screen.getByText('cash-description')).toBeInTheDocument();
  });
});
