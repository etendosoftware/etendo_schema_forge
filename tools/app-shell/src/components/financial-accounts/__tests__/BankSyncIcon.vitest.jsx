// @covers tools/app-shell/src/components/financial-accounts/BankSyncIcon.jsx
import { render, screen } from '@testing-library/react';
import { BankSyncIcon } from '../BankSyncIcon.jsx';

describe('BankSyncIcon', () => {
  it('renders the bank glyph with the arrows badge, idle by default', () => {
    render(<BankSyncIcon />);

    const root = screen.getByTestId('bank-sync-icon');
    expect(root).toHaveAttribute('data-spinning', 'false');
    expect(root).toContainElement(screen.getByTestId('Landmark__banksync'));
    expect(root).toContainElement(screen.getByTestId('ArrowDownUp__banksync'));
    expect(screen.getByTestId('ArrowDownUp__banksync').getAttribute('class')).not.toMatch(/animate-spin/);
  });

  it('spins only the badge while a sync runs, never the bank', () => {
    render(<BankSyncIcon spinning />);

    expect(screen.getByTestId('bank-sync-icon')).toHaveAttribute('data-spinning', 'true');
    expect(screen.getByTestId('ArrowDownUp__banksync').getAttribute('class')).toMatch(/animate-spin/);
    expect(screen.getByTestId('Landmark__banksync').getAttribute('class')).not.toMatch(/animate-spin/);
    expect(screen.getByTestId('bank-sync-icon').className).not.toMatch(/animate-spin/);
  });

  it('is decorative: hidden from assistive technology', () => {
    render(<BankSyncIcon />);
    expect(screen.getByTestId('bank-sync-icon')).toHaveAttribute('aria-hidden', 'true');
  });

  it('sizes the whole icon with className (h-5 w-5 by default)', () => {
    const { rerender } = render(<BankSyncIcon />);
    expect(screen.getByTestId('bank-sync-icon').className).toMatch(/\bh-5 w-5\b/);

    rerender(<BankSyncIcon className="h-4 w-4 text-red-500" />);
    const root = screen.getByTestId('bank-sync-icon');
    expect(root.className).toMatch(/\bh-4 w-4 text-red-500\b/);
    expect(root.className).not.toMatch(/\bh-5\b/);
  });

  it('puts badgeClassName on the badge backdrop (bg-card by default)', () => {
    const { rerender } = render(<BankSyncIcon />);
    const badgeOf = () => screen.getByTestId('ArrowDownUp__banksync').parentElement;
    expect(badgeOf().className).toMatch(/\bbg-card\b/);

    rerender(<BankSyncIcon badgeClassName="bg-primary" />);
    expect(badgeOf().className).toMatch(/\bbg-primary\b/);
    expect(badgeOf().className).not.toMatch(/\bbg-card\b/);
  });

  it('uses the data-testid it is given', () => {
    render(<BankSyncIcon data-testid="row-sync-icon" />);
    expect(screen.getByTestId('row-sync-icon')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByTestId('bank-sync-icon')).toBeNull();
  });
});
