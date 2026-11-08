// @covers tools/app-shell/src/windows/custom/financial-account/ReconciliationList/ClearedItemsInline.jsx
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { gridViewColumnId } from '@/hooks/useGridView.js';
import { getContractGridColumns } from '@/components/financial-accounts/contractColumns';
import { ClearedItemsInline } from '../ClearedItemsInline.jsx';

const boundary = vi.hoisted(() => ({ enabled: true, apiFetch: vi.fn(), navigate: vi.fn(), useClearedItems: vi.fn() }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => boundary.apiFetch }));
vi.mock('@/lib/flags', () => ({ GRID_COLUMN_VIEWS: 'grid-column-views', useFeatureFlag: () => boundary.enabled }));
vi.mock('react-router-dom', () => ({ useNavigate: () => boundary.navigate }));
vi.mock('@/i18n', () => ({ useUI: () => (key) => key, useLocaleSwitch: () => ({ locale: 'es_ES' }) }));
vi.mock('@/hooks/useReconciliationList', () => ({ useClearedItems: (...args) => boundary.useClearedItems(...args) }));

const item = {
  id: 'cleared-1', transactionDate: '2026-10-26', description: 'cleared-description',
  financialAccountTransaction: 'transaction-1', 'financialAccountTransaction$_identifier': 'Movement A',
  payment: 'payment-1', 'payment$_identifier': 'PAY-1 - Partner A', transactionType: 'BPD',
  depositAmount: 100, paymentAmount: 0,
};

describe('cleared item column views', () => {
  beforeEach(() => {
    boundary.enabled = true;
    boundary.navigate.mockReset();
    boundary.useClearedItems.mockReturnValue({ items: [item], loading: false });
    const columns = getContractGridColumns('clearedItems');
    boundary.apiFetch.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => ({
      version: 1, surface: 'list', columns: [
        { id: gridViewColumnId({ ...columns.find((column) => column.name === 'description'), key: 'description' }), visible: false, order: 0 },
        { id: gridViewColumnId({ ...columns.find((column) => column.name === 'financialAccountTransaction'), key: 'financialAccountTransaction' }), visible: false, order: -1 },
      ],
    }) });
  });

  it('keeps the movement action usable and the parent scope stable when a data column is hidden', async () => {
    render(<ClearedItemsInline reconciliationId="reconciliation-A" currency="EUR" />);
    await waitFor(() => expect(screen.getByTestId('grid-view-columns-trigger')).toBeEnabled());
    expect(boundary.apiFetch).toHaveBeenCalledWith('/sws/neo/grid-views/financial-account/clearedItems', { baseUrl: '' });
    expect(boundary.useClearedItems).toHaveBeenCalledWith('reconciliation-A');
    expect(screen.queryByText('cleared-description')).toBeNull();
    const row = screen.getByTestId('cleared-item-row-cleared-1');
    fireEvent.click(within(row).getByRole('button', { name: 'financeAccountClearedItemsOpenMovement' }));
    expect(boundary.navigate).toHaveBeenCalledWith('?tab=movements&txn=transaction-1');
    fireEvent.click(within(row).getByText('PAY-1'));
    expect(boundary.navigate).toHaveBeenCalledWith('/payment-in/payment-1');
  });

  it('keeps all original cells and makes no view request when disabled', () => {
    boundary.enabled = false;
    render(<ClearedItemsInline reconciliationId="reconciliation-A" />);
    expect(boundary.apiFetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId('grid-view-controls')).toBeNull();
    expect(screen.getByText('cleared-description')).toBeInTheDocument();
  });
});
