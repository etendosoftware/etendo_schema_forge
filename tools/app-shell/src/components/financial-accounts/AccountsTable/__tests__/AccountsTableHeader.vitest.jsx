import { render, screen } from '@testing-library/react';
import { Table } from '@/components/ui/table';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => {
    const map = {
      financeAccountsColAccount: 'Cuenta',
      financeAccountsColType: 'Tipo',
      financeAccountsColBalance: 'Saldo',
      financeAccountsColPending: 'Por conciliar',
    };
    return map[key] ?? key;
  },
}));

import { AccountsTableHeader } from '../AccountsTableHeader.jsx';

function renderHeader() {
  return render(
    <Table>
      <AccountsTableHeader />
    </Table>,
  );
}

describe('AccountsTableHeader', () => {
  it('renders the four column headers in the expected order', () => {
    renderHeader();
    expect(screen.getByText('Cuenta')).toBeInTheDocument();
    expect(screen.getByText('Tipo')).toBeInTheDocument();
    expect(screen.getByText('Saldo')).toBeInTheDocument();
    expect(screen.getByText('Por conciliar')).toBeInTheDocument();
  });

  it('uses the Figma typography for the labels (12/16/600 #121217)', () => {
    renderHeader();
    const cuenta = screen.getByText('Cuenta');
    expect(cuenta.className).toMatch(/text-xs/);
    expect(cuenta.className).toMatch(/font-semibold/);
    expect(cuenta.className).toMatch(/text-\[hsl\(var\(--foreground\)\)\]/);
  });

  it('left-pads the Cuenta header so the label aligns with the body avatar', () => {
    renderHeader();
    const cuenta = screen.getByText('Cuenta');
    expect(cuenta.className).toMatch(/pl-\[84px\]/);
  });
});
