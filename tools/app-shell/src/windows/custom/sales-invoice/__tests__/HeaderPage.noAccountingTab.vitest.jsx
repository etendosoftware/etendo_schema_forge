// @covers artifacts/sales-invoice/generated/web/sales-invoice/HeaderPage.jsx
// The sales invoice's journal entries (`accounting` entity) are exposed to agents
// over MCP only: decisions.json keeps the entity with `renderTab: false`, so the
// generator emits AccountingTable/AccountingForm but the page must not wire them.
// This pins that the detail view offers no Accounting tab, i.e. the app is
// unchanged by that exposure.

let detailProps;
vi.mock('@/components/contract-ui/DetailView.jsx', () => ({
  DetailView: (props) => {
    detailProps = props;
    return null;
  },
}));
vi.mock('@/components/contract-ui/ListView.jsx', () => ({ ListView: () => null }));
vi.mock('@/auth/AuthContext.jsx', () => createAuthContextMock(() => 'full'));
vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => createFiscalConfigMock(() => null));

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthContextMock, createFiscalConfigMock } from '@/test/mockOrderWindowAuth.jsx';
import HeaderPage from '@generated/sales-invoice/generated/web/sales-invoice/HeaderPage';
import salesInvoiceDecisions from '@generated/sales-invoice/decisions.json';

describe('sales-invoice HeaderPage — accounting entity is MCP-only', () => {
  beforeEach(() => {
    detailProps = undefined;
  });

  it('keeps the accounting entity out of the rendered tabs', () => {
    expect(salesInvoiceDecisions.entities.accounting.renderTab).toBe(false);

    render(<HeaderPage windowName="sales-invoice" recordId="INV-1" />);

    const tabKeys = [
      ...(detailProps.secondaryTabs || []).map((tab) => tab.key),
      ...(detailProps.customTabs || []).map((tab) => tab.key),
    ];
    expect(tabKeys).toContain('exchangeRates');
    expect(tabKeys).not.toContain('accounting');
  });
});
