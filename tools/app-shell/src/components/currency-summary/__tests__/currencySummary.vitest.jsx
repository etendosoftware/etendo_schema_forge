// @covers tools/app-shell/src/components/currency-summary/CurrencyBreakdown.jsx
// @covers tools/app-shell/src/components/currency-summary/AmountText.jsx
// @covers tools/app-shell/src/components/currency-summary/InfoTooltipButton.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { AmountText, CurrencyBreakdown, InfoTooltipButton, buildBalanceDisplay } from '../index.js';

describe('CurrencyBreakdown', () => {
  it('renders one row per currency with the default and a custom testid prefix', () => {
    const rows = [{ currencyIso: 'EUR', total: 10 }, { currencyIso: 'USD', total: 5 }];
    const { unmount } = render(<CurrencyBreakdown rows={rows} primaryIso="EUR" title="T" />);
    expect(screen.getByText('T')).toBeInTheDocument();
    expect(screen.getByTestId('balance-by-currency-USD')).toBeInTheDocument();
    unmount();
    render(<CurrencyBreakdown rows={rows} primaryIso="EUR" title="T" testIdPrefix="x" />);
    expect(screen.getByTestId('x-EUR-amount')).toBeInTheDocument();
  });

  it('shows a zero row for the primary currency when empty, unless emptyFallback is off', () => {
    const { unmount } = render(<CurrencyBreakdown rows={[]} primaryIso="EUR" title="T" />);
    expect(screen.getByTestId('balance-by-currency-EUR')).toBeInTheDocument();
    unmount();
    render(<CurrencyBreakdown rows={[]} primaryIso="EUR" title="T" emptyFallback={false} />);
    expect(screen.queryByTestId('balance-by-currency-EUR')).not.toBeInTheDocument();
  });
});

describe('CurrencyBreakdown — display rules', () => {
  it('is informational only: no button role, no click handler affordance', () => {
    render(<CurrencyBreakdown rows={[{ currencyIso: 'EUR', total: 10 }]} primaryIso="EUR" title="T" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByTestId('balance-by-currency-EUR')).not.toHaveAttribute('role');
  });

  it('renders the exact amount in each row currency, without the approximate prefix', () => {
    render(<CurrencyBreakdown rows={[{ currencyIso: 'EUR', total: 1500.5 }]} primaryIso="EUR" title="T" />);
    expect(screen.getByTestId('balance-by-currency-EUR-amount')).toHaveTextContent('1.500,50 €');
    expect(screen.getByTestId('balance-by-currency-EUR-amount').textContent).not.toContain('≈');
  });
});

describe('InfoTooltipButton', () => {
  it('uses the label as aria-label and the given testid', () => {
    render(<InfoTooltipButton label="info" testId="my-btn" />);
    expect(screen.getByTestId('my-btn')).toHaveAttribute('aria-label', 'info');
  });

  it('shows the label as tooltip content on keyboard focus', async () => {
    const user = userEvent.setup();
    render(<InfoTooltipButton label="the explanation" />);
    await user.tab();
    expect(screen.getByTestId('balance-info-button')).toHaveFocus();
    expect((await screen.findAllByText('the explanation')).length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('balance-info-tooltip').length).toBeGreaterThan(0);
  });

  it('shows distinct content on hover, with a custom content testid', async () => {
    const user = userEvent.setup();
    render(<InfoTooltipButton label="aria" content="long body" contentTestId="my-tip" />);
    await user.hover(screen.getByTestId('balance-info-button'));
    expect((await screen.findAllByText('long body')).length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('my-tip').length).toBeGreaterThan(0);
    expect(screen.getByTestId('balance-info-button')).toHaveAttribute('aria-label', 'aria');
  });
});

describe('AmountText', () => {
  it('renders the plain formatted amount with no prefix when not approximate', () => {
    render(<AmountText iso="EUR" amount={10} testId="a" />);
    const el = screen.getByTestId('a');
    expect(el).toHaveAttribute('data-approximate', 'false');
    expect(el.textContent).not.toContain('≈');
    expect(el.children).toHaveLength(0);
  });

  it('mutes the "≈ " prefix and keeps the same text as buildBalanceDisplay', () => {
    render(<AmountText iso="EUR" amount={1500.5} approximate testId="a" />);
    const el = screen.getByTestId('a');
    expect(el).toHaveAttribute('data-approximate', 'true');
    expect(el.textContent).toBe(buildBalanceDisplay('EUR', 1500.5, { approximate: true }).text);
    expect(el.firstElementChild).toHaveStyle({ color: 'hsl(var(--muted-foreground))' });
    expect(el.firstElementChild.textContent).toBe('≈ ');
  });
});
