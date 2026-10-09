// @covers tools/app-shell/src/components/financial-accounts/AccountsSidebar/index.jsx
// @covers tools/app-shell/src/components/financial-accounts/AccountsSidebar/balanceDisplay.js
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { formatCurrency } from '@/lib/formatCurrency.js';

vi.mock('@/i18n', () => ({
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: () => {} }),
  // Interpolates `{param}` placeholders so parameterized labels (missing-rate line)
  // are assertable; keys without params behave exactly as before.
  useUI: () => (key, params) => {
    const map = {
      financeAccountsBalanceTitle: 'Saldo',
      financeAccountsBalanceInfo: 'Info',
      financeAccountsBalanceMissingRate: 'No incluye: {currencies} (sin tasa de cambio)',
      financeAccountsBalanceByCurrency: 'Por moneda',
      financeAccountsBalanceEmpty: 'Sin saldos',
      financeAccountsPendingTitle: 'Pendientes',
      // Label no longer includes the count — the count shows as the right-side value.
      financeAccountsPendingAccountsRow: 'Cuentas con pendientes',
    };
    const template = map[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name) => (
      params[name] === undefined ? match : String(params[name])
    ));
  },
}));

import { AccountsSidebar } from '../index.jsx';

// The "Saldo" total is the FULL amount (`formatCurrency`, no K/M/B), "≈ " in front when a
// currency was converted, at a fixed 30px / 32px carried by the `balance-total` row. The amount
// (`balance-card`) is a TruncatedText: it ellipsises and shows the exact text in a tooltip only
// when it is actually clipped.
//
// The currency-format config is not loaded in this file, so the formatter runs on the
// defaults (`.`/`,`, every symbol on the right). `formatCurrency` separates amount and
// symbol with a non-breaking space.
const NBSP = '\u00A0';

const SIZE_30 = { fontSize: '30px', lineHeight: '32px' };

const setMetrics = (element, scrollWidth, clientWidth) => {
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: clientWidth });
};

function expectStyle(element, { fontSize, lineHeight }) {
  expect(element.style.fontSize).toBe(fontSize);
  expect(element.style.lineHeight).toBe(lineHeight);
}

const baseSummary = {
  totalBalance: 1250.5,
  byCurrency: [
    { currencyIso: 'EUR', total: 1000 },
    { currencyIso: 'USD', total: 250.5 },
  ],
  pending: { accountsWithPending: 3, suggestionsReady: 2, byRule: 1 },
};

describe('AccountsSidebar — no sync pill', () => {
  it('does not render any sync/updated label in the header', () => {
    render(<AccountsSidebar summary={baseSummary} loading={false} />);
    expect(screen.queryByTestId('sidebar-last-sync')).not.toBeInTheDocument();
    expect(screen.queryByText(/Actualizado/)).not.toBeInTheDocument();
  });
});

describe('AccountsSidebar', () => {
  it('renders the Saldo header and the formatted total balance', () => {
    render(<AccountsSidebar summary={baseSummary} loading={false} />);
    expect(screen.getByText('Saldo')).toBeInTheDocument();
    expect(screen.getByTestId('balance-card')).toBeInTheDocument();
  });

  it('renders one row per currency in the breakdown card', () => {
    render(<AccountsSidebar summary={baseSummary} loading={false} />);
    expect(screen.getByTestId('balance-by-currency-EUR')).toBeInTheDocument();
    expect(screen.getByTestId('balance-by-currency-USD')).toBeInTheDocument();
  });

  it('renders the pending-accounts row with its label and count value', () => {
    render(<AccountsSidebar summary={baseSummary} loading={false} />);
    const card = screen.getByTestId('pending-reconcile-card');
    // Label no longer carries the count; the count appears as the right-side value.
    expect(card).toHaveTextContent('Cuentas con pendientes');
    expect(card).toHaveTextContent('3');
    // The removed "Sugerencias listas" / "Por regla" indicators are gone.
    expect(card).not.toHaveTextContent('Sugerencias');
    expect(card).not.toHaveTextContent('Por regla');
  });

  it('shows an em-dash placeholder while loading is true', () => {
    render(<AccountsSidebar summary={null} loading={true} />);
    expect(screen.getByTestId('balance-card')).toHaveTextContent('—');
  });

  it('falls back to a single empty currency row when there are no accounts', () => {
    render(
      <AccountsSidebar
        summary={{ totalBalance: 0, byCurrency: [], pending: {} }}
        loading={false}
      />,
    );
    expect(screen.getByTestId('balance-by-currency-EUR')).toBeInTheDocument();
  });

  // ── ETP-5580: converted total, approximate marker, missing rates, full total ──

  describe('total currency', () => {
    it('formats the total with totalBalanceCurrencyIso, not the first breakdown row', () => {
      render(
        <AccountsSidebar
          summary={{
            ...baseSummary,
            totalBalanceCurrencyIso: 'EUR',
            byCurrency: [
              { currencyIso: 'USD', total: 250.5 },
              { currencyIso: 'EUR', total: 1000 },
            ],
          }}
          loading={false}
        />,
      );
      const card = screen.getByTestId('balance-card');
      expect(card.textContent).toBe(`1.250,50${NBSP}€`);
      expect(card.textContent).toBe(formatCurrency('EUR', 1250.5));
      expect(card.textContent).not.toContain('$');
    });

    it('falls back to byCurrency[0] for an old backend that omits the new fields', () => {
      render(
        <AccountsSidebar
          summary={{
            totalBalance: 1250.5,
            byCurrency: [
              { currencyIso: 'USD', total: 250.5 },
              { currencyIso: 'EUR', total: 1000 },
            ],
            pending: {},
          }}
          loading={false}
        />,
      );
      const card = screen.getByTestId('balance-card');
      expect(card.textContent).toBe(formatCurrency('USD', 1250.5));
      expect(card.textContent.startsWith('≈')).toBe(false);
      expect(screen.queryByTestId('balance-missing-rate')).not.toBeInTheDocument();
    });

    it('falls back to byCurrency[0] when totalBalanceCurrencyIso is null (empty hook shape)', () => {
      render(
        <AccountsSidebar
          summary={{
            ...baseSummary,
            totalBalanceCurrencyIso: null,
            byCurrency: [{ currencyIso: 'USD', total: 1250.5 }],
          }}
          loading={false}
        />,
      );
      expect(screen.getByTestId('balance-card').textContent).toBe(formatCurrency('USD', 1250.5));
    });

    it('falls back to EUR when there is neither an ISO nor a breakdown row', () => {
      render(
        <AccountsSidebar summary={{ totalBalance: 10, byCurrency: [], pending: {} }} loading={false} />,
      );
      expect(screen.getByTestId('balance-card').textContent).toBe(`10,00${NBSP}€`);
    });

    it('treats an empty-string totalBalanceCurrencyIso as unknown and uses byCurrency[0]', () => {
      render(
        <AccountsSidebar
          summary={{
            ...baseSummary,
            totalBalanceCurrencyIso: '',
            byCurrency: [
              { currencyIso: 'USD', total: 250.5 },
              { currencyIso: 'EUR', total: 1000 },
            ],
          }}
          loading={false}
        />,
      );
      const card = screen.getByTestId('balance-card');
      expect(card.textContent).toBe(formatCurrency('USD', 1250.5));
    });

    it('treats an empty-string totalBalanceCurrencyIso with no breakdown as EUR', () => {
      render(
        <AccountsSidebar
          summary={{ totalBalance: 10, totalBalanceCurrencyIso: '', byCurrency: [], pending: {} }}
          loading={false}
        />,
      );
      expect(screen.getByTestId('balance-card').textContent).toBe(`10,00${NBSP}€`);
      // The empty-breakdown placeholder row follows the same fallback.
      expect(screen.getByTestId('balance-by-currency-EUR')).toBeInTheDocument();
    });

    it('uses totalBalanceCurrencyIso for the empty-breakdown placeholder row', () => {
      render(
        <AccountsSidebar
          summary={{ totalBalance: 0, totalBalanceCurrencyIso: 'USD', byCurrency: [], pending: {} }}
          loading={false}
        />,
      );
      expect(screen.getByTestId('balance-by-currency-USD')).toBeInTheDocument();
      expect(screen.queryByTestId('balance-by-currency-EUR')).not.toBeInTheDocument();
    });
  });

  describe('approximate marker', () => {
    it('prefixes the full total with "≈ " when approximate', () => {
      render(
        <AccountsSidebar
          summary={{
            ...baseSummary,
            totalBalance: 797841242058.53,
            totalBalanceCurrencyIso: 'EUR',
            totalBalanceApproximate: true,
          }}
          loading={false}
        />,
      );
      const card = screen.getByTestId('balance-card');
      expect(card.textContent).toBe(`≈ 797.841.242.058,53${NBSP}€`);
      expect(card).not.toHaveAttribute('title');
    });

    it('shows no "≈" when totalBalanceApproximate is false', () => {
      render(
        <AccountsSidebar
          summary={{ ...baseSummary, totalBalanceCurrencyIso: 'EUR', totalBalanceApproximate: false }}
          loading={false}
        />,
      );
      const card = screen.getByTestId('balance-card');
      expect(card.textContent).toBe(`1.250,50${NBSP}€`);
      expect(card.textContent).not.toContain('≈');
    });

    it('only treats a strict boolean true as approximate', () => {
      render(
        <AccountsSidebar
          summary={{ ...baseSummary, totalBalanceCurrencyIso: 'EUR', totalBalanceApproximate: 'true' }}
          loading={false}
        />,
      );
      const card = screen.getByTestId('balance-card');
      expect(card.textContent).toBe(formatCurrency('EUR', 1250.5));
      expect(card.textContent).not.toContain('≈');
    });

    it('shows only the em dash while loading (no "≈"), at the 30px size', () => {
      render(
        <AccountsSidebar
          summary={{
            ...baseSummary,
            totalBalance: 44564687609500,
            totalBalanceCurrencyIso: 'EUR',
            totalBalanceApproximate: true,
          }}
          loading={true}
        />,
      );
      const card = screen.getByTestId('balance-card');
      expect(card.textContent).toBe('—');
      expect(card).not.toHaveAttribute('title');
      expectStyle(screen.getByTestId('balance-total'), SIZE_30);
    });
  });

  describe('missing exchange rates', () => {
    it('renders the missing-rate line with the ISO list joined by ", "', () => {
      render(
        <AccountsSidebar
          summary={{
            ...baseSummary,
            totalBalanceCurrencyIso: 'EUR',
            missingRateCurrencies: ['ARS', 'BRL'],
          }}
          loading={false}
        />,
      );
      expect(screen.getByTestId('balance-missing-rate').textContent).toBe(
        'No incluye: ARS, BRL (sin tasa de cambio)',
      );
    });

    it('renders a single missing currency without a separator', () => {
      render(
        <AccountsSidebar
          summary={{ ...baseSummary, missingRateCurrencies: ['ARS'] }}
          loading={false}
        />,
      );
      expect(screen.getByTestId('balance-missing-rate').textContent).toBe(
        'No incluye: ARS (sin tasa de cambio)',
      );
    });

    it.each([
      ['an empty array', []],
      ['undefined', undefined],
      ['null', null],
      ['a non-array value', 'ARS'],
    ])('omits the missing-rate line when missingRateCurrencies is %s', (_label, value) => {
      render(
        <AccountsSidebar
          summary={{ ...baseSummary, missingRateCurrencies: value }}
          loading={false}
        />,
      );
      expect(screen.queryByTestId('balance-missing-rate')).not.toBeInTheDocument();
    });

    it('omits the missing-rate line while loading', () => {
      render(
        <AccountsSidebar
          summary={{ ...baseSummary, missingRateCurrencies: ['ARS'] }}
          loading={true}
        />,
      );
      expect(screen.queryByTestId('balance-missing-rate')).not.toBeInTheDocument();
    });
  });

  describe('full total, fixed size and overflow tooltip', () => {
    const HUGE = 87542314548725.5;

    it('shows a negative total in full, at 30px', () => {
      render(
        <AccountsSidebar
          summary={{ ...baseSummary, totalBalance: -357.99, totalBalanceCurrencyIso: 'EUR' }}
          loading={false}
        />,
      );
      expect(screen.getByTestId('balance-card').textContent).toBe(`-357,99${NBSP}€`);
      expectStyle(screen.getByTestId('balance-total'), SIZE_30);
    });

    it('never compacts a huge total', () => {
      render(
        <AccountsSidebar
          summary={{ ...baseSummary, totalBalance: HUGE, totalBalanceCurrencyIso: 'EUR' }}
          loading={false}
        />,
      );
      const card = screen.getByTestId('balance-card');
      expect(card.textContent).toBe(formatCurrency('EUR', HUGE));
      expect(card.textContent).toContain('87.542.314.548.725,50');
    });

    it('renders the amount inside the balance-total row, which carries the 30px style', () => {
      render(<AccountsSidebar summary={baseSummary} loading={false} />);
      const row = screen.getByTestId('balance-total');
      const card = screen.getByTestId('balance-card');
      expect(row).toContainElement(card);
      expect(row).toHaveClass('flex', 'min-w-0');
      expectStyle(row, SIZE_30);
      // The amount inherits the size; it has no inline font size or text-[..px] class.
      expect(card.style.fontSize).toBe('');
      expect(card.className).not.toMatch(/text-\[\d+px\]/);
      expect(card).toHaveClass('truncate', 'min-w-0', 'flex-1');
    });

    it.each([
      ['a short total', 1250.5, false],
      ['a huge total', HUGE, false],
      ['a huge negative approximate total', -HUGE, true],
    ])('keeps 30px for %s (it never shrinks)', (_label, total, approximate) => {
      render(
        <AccountsSidebar
          summary={{ ...baseSummary, totalBalance: total, totalBalanceCurrencyIso: 'EUR', totalBalanceApproximate: approximate }}
          loading={false}
        />,
      );
      expectStyle(screen.getByTestId('balance-total'), SIZE_30);
    });

    it('keeps 30px while loading', () => {
      render(<AccountsSidebar summary={null} loading={true} />);
      expectStyle(screen.getByTestId('balance-total'), SIZE_30);
      expect(screen.getByTestId('balance-card').textContent).toBe('—');
    });

    it('opens no tooltip when the total fits', () => {
      render(<AccountsSidebar summary={baseSummary} loading={false} />);
      const card = screen.getByTestId('balance-card');
      setMetrics(card, 120, 268);

      fireEvent.focus(card);

      expect(screen.queryByTestId('balance-card-tooltip')).not.toBeInTheDocument();
    });

    it('shows the exact total, "≈ " included, in a tooltip when it is clipped', () => {
      render(
        <AccountsSidebar
          summary={{ ...baseSummary, totalBalance: -HUGE, totalBalanceCurrencyIso: 'EUR', totalBalanceApproximate: true }}
          loading={false}
        />,
      );
      const card = screen.getByTestId('balance-card');
      setMetrics(card, 520, 268);

      fireEvent.focus(card);

      // textContent, not toHaveTextContent: the latter normalizes formatCurrency's NBSP.
      const tooltip = screen.getByTestId('balance-card-tooltip');
      expect(tooltip.textContent).toContain(`≈ ${formatCurrency('EUR', -HUGE)}`);
      expect(tooltip.textContent).toContain('≈ -87.542.314.548.725,50');
    });

    it('shows the exact non-approximate total in the tooltip without "≈"', () => {
      render(
        <AccountsSidebar
          summary={{ ...baseSummary, totalBalance: HUGE, totalBalanceCurrencyIso: 'EUR' }}
          loading={false}
        />,
      );
      const card = screen.getByTestId('balance-card');
      setMetrics(card, 480, 268);

      fireEvent.focus(card);

      const tooltip = screen.getByTestId('balance-card-tooltip');
      expect(tooltip.textContent).toContain(formatCurrency('EUR', HUGE));
      expect(tooltip.textContent).not.toContain('≈');
    });
  });

  describe('breakdown rows', () => {
    it('keeps each row in its own currency regardless of the total currency', () => {
      render(
        <AccountsSidebar
          summary={{
            ...baseSummary,
            totalBalanceCurrencyIso: 'EUR',
            totalBalanceApproximate: true,
            missingRateCurrencies: ['ARS'],
            byCurrency: [
              { currencyIso: 'USD', total: 250.5 },
              { currencyIso: 'EUR', total: 1000 },
              { currencyIso: 'ARS', total: 99999 },
            ],
          }}
          loading={false}
        />,
      );
      const usd = screen.getByTestId('balance-by-currency-USD');
      expect(within(usd).getByText('USD')).toBeInTheDocument();
      expect(usd.textContent).toContain(formatCurrency('USD', 250.5));
      expect(usd.textContent).not.toContain('≈');

      const eur = screen.getByTestId('balance-by-currency-EUR');
      expect(eur.textContent).toContain(formatCurrency('EUR', 1000));

      // A currency without exchange rate is still listed with its real balance.
      const ars = screen.getByTestId('balance-by-currency-ARS');
      expect(ars.textContent).toContain(formatCurrency('ARS', 99999));
    });

    it('renders the exact amount through TruncatedText next to a non-shrinking ISO label', () => {
      render(<AccountsSidebar summary={baseSummary} loading={false} />);
      const row = screen.getByTestId('balance-by-currency-EUR');
      const amount = screen.getByTestId('balance-by-currency-EUR-amount');
      expect(row).toContainElement(amount);
      expect(amount.textContent).toBe(formatCurrency('EUR', 1000));
      expect(amount).toHaveClass('truncate', 'min-w-0', 'flex-1', 'text-right');
      expect(within(row).getByText('EUR')).toHaveClass('shrink-0');
    });

    it('shows the exact amount in a tooltip when the row amount is clipped', () => {
      const huge = 87542314548725.5;
      render(
        <AccountsSidebar
          summary={{ ...baseSummary, byCurrency: [{ currencyIso: 'EUR', total: huge }] }}
          loading={false}
        />,
      );
      const amount = screen.getByTestId('balance-by-currency-EUR-amount');
      setMetrics(amount, 260, 180);

      fireEvent.focus(amount);

      const tooltip = screen.getByTestId('balance-by-currency-EUR-amount-tooltip');
      // textContent, not toHaveTextContent: the latter normalizes the NBSP of formatCurrency.
      expect(tooltip.textContent).toContain(formatCurrency('EUR', huge));
      expect(tooltip.textContent).toContain('87.542.314.548.725,50');
    });

    it('opens no tooltip when the row amount fits', () => {
      render(<AccountsSidebar summary={baseSummary} loading={false} />);
      const amount = screen.getByTestId('balance-by-currency-USD-amount');
      setMetrics(amount, 60, 180);

      fireEvent.focus(amount);

      expect(screen.queryByTestId('balance-by-currency-USD-amount-tooltip')).not.toBeInTheDocument();
    });
  });

  describe('info tooltip', () => {
    it('renders the info button with an accessible label', () => {
      render(<AccountsSidebar summary={baseSummary} loading={false} />);
      const button = screen.getByTestId('balance-info-button');
      expect(button).toHaveAttribute('aria-label', 'Info');
      expect(button).toHaveAttribute('type', 'button');
      expect(screen.queryByTestId('balance-info-tooltip')).not.toBeInTheDocument();
    });

    it('opens the tooltip with the explanation when the button receives focus', async () => {
      const user = userEvent.setup();
      render(<AccountsSidebar summary={baseSummary} loading={false} />);
      await user.tab();
      expect(screen.getByTestId('balance-info-button')).toHaveFocus();
      const tooltip = await screen.findByTestId('balance-info-tooltip');
      expect(tooltip).toHaveTextContent('Info');
    });
  });
});
