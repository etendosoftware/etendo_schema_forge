import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReconciliationTab } from '../ReconciliationTab';

// Mock the heavy split panel — this unit only verifies the tab wires props through.
vi.mock('@/components/contract-ui/ReconciliationSplitPanel.jsx', () => ({
  ReconciliationSplitPanel: ({ accountId, currency }) => (
    <div data-testid="split-panel" data-account={accountId} data-currency={currency} />
  ),
}));

describe('ReconciliationTab', () => {
  it('renders the reconciliation split panel', () => {
    render(
      <MemoryRouter>
        <ReconciliationTab account={{ id: 'ACC-1', currency: 'EUR' }} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('split-panel')).toBeDefined();
  });

  it('forwards the account id and currency to the split panel', () => {
    render(
      <MemoryRouter>
        <ReconciliationTab account={{ id: 'ACC-9', currency: 'USD' }} />
      </MemoryRouter>,
    );
    const panel = screen.getByTestId('split-panel');
    expect(panel.getAttribute('data-account')).toBe('ACC-9');
    expect(panel.getAttribute('data-currency')).toBe('USD');
  });

  it('does not crash when no account is provided', () => {
    render(
      <MemoryRouter>
        <ReconciliationTab account={null} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('split-panel')).toBeDefined();
  });
});
