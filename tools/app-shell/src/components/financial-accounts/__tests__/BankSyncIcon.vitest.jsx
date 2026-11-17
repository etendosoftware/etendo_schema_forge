// @covers tools/app-shell/src/components/financial-accounts/BankSyncIcon.jsx
import { render, screen } from '@testing-library/react';
import { BankSyncIcon } from '../BankSyncIcon.jsx';

describe('BankSyncIcon', () => {
  // ETP-6154 option D — FileDown ("traer extractos"), and a vertical bob instead of a rotation.
  it('renders the FileDown glyph, idle by default (no animation)', () => {
    render(<BankSyncIcon />);

    const root = screen.getByTestId('bank-sync-icon');
    expect(root).toHaveAttribute('data-spinning', 'false');
    expect(root).toContainElement(screen.getByTestId('FileDown__banksync'));
    expect(screen.getByTestId('FileDown__banksync').getAttribute('class')).not.toMatch(/bank-sync-bob/);
  });

  it('bobs (never rotates) while a fetch runs, and stops for reduced motion', () => {
    render(<BankSyncIcon spinning />);

    expect(screen.getByTestId('bank-sync-icon')).toHaveAttribute('data-spinning', 'true');
    const glyphClass = screen.getByTestId('FileDown__banksync').getAttribute('class');
    expect(glyphClass).toMatch(/animate-\[bank-sync-bob_1s_ease-in-out_infinite\]/);
    expect(glyphClass).toMatch(/motion-reduce:animate-none/);
    expect(glyphClass).not.toMatch(/animate-spin/);
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

  it('uses the data-testid it is given', () => {
    render(<BankSyncIcon data-testid="row-sync-icon" />);
    expect(screen.getByTestId('row-sync-icon')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByTestId('bank-sync-icon')).toBeNull();
  });
});
