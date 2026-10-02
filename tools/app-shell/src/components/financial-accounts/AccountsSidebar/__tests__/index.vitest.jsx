import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatDashboardCompact } from '@/lib/dashboardNumberFormat.js';

vi.mock('@/i18n', () => ({
  // Interpolates `{param}` placeholders so parameterized labels (missing-rate line)
  // are assertable; keys without params behave exactly as before.
  useUI: () => (key, params) => {
    const map = {
      financeAccountsBalanceTitle: 'Saldo',
      financeAccountsBalanceInfo: 'Info',
      financeAccountsBalanceMissingRate: 'No incluye: {currencies} (sin tasa de cambio)',
      financeAccountsSyncUpdatedAgo: 'Actualizado',
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
  // Same shape as the AccountsHeaderTable mock; the sidebar maps it with `localeFromUi`.
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: vi.fn() }),
}));

import { AccountsSidebar } from '../index.jsx';

// The currency-format config is not loaded in this file, so the formatters run on the
// defaults (`.`/`,`, every symbol on the right). `formatCurrency` separates amount and
// symbol with a non-breaking space.
const NBSP = '\u00A0';
const compact = (iso, value) => formatDashboardCompact(value, { currencyLabel: iso, locale: 'es-ES' });

const SIZE_30 = { fontSize: '30px', lineHeight: '32px' };
const SIZE_24 = { fontSize: '24px', lineHeight: '28px' };
const SIZE_20 = { fontSize: '20px', lineHeight: '24px' };

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

  // ── ETP-5580: converted total, approximate marker, missing rates, compact total ──

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
      expect(card.textContent).toBe(`1,25K${NBSP}€`);
      expect(card).toHaveAttribute('title', formatCurrency('EUR', 1250.5));
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
      expect(card.textContent).toBe(compact('USD', 1250.5));
      expect(card).toHaveAttribute('title', formatCurrency('USD', 1250.5));
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
      expect(screen.getByTestId('balance-card').textContent).toBe(compact('USD', 1250.5));
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
      expect(card.textContent).toBe(compact('USD', 1250.5));
      expect(card).toHaveAttribute('title', formatCurrency('USD', 1250.5));
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
    it('prefixes the compact total and the exact title with "≈ " when approximate', () => {
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
      expect(card.textContent).toBe(`≈ 797,84B${NBSP}€`);
      expect(card).toHaveAttribute('title', `≈ 797.841.242.058,53${NBSP}€`);
    });

    it('shows no "≈" when totalBalanceApproximate is false', () => {
      render(
        <AccountsSidebar
          summary={{ ...baseSummary, totalBalanceCurrencyIso: 'EUR', totalBalanceApproximate: false }}
          loading={false}
        />,
      );
      const card = screen.getByTestId('balance-card');
      expect(card.textContent).toBe(`1,25K${NBSP}€`);
      expect(card.textContent).not.toContain('≈');
      expect(card).toHaveAttribute('title', formatCurrency('EUR', 1250.5));
    });

    it('only treats a strict boolean true as approximate', () => {
      render(
        <AccountsSidebar
          summary={{ ...baseSummary, totalBalanceCurrencyIso: 'EUR', totalBalanceApproximate: 'true' }}
          loading={false}
        />,
      );
      const card = screen.getByTestId('balance-card');
      expect(card.textContent).not.toContain('≈');
      expect(card.getAttribute('title')).not.toContain('≈');
    });

    it('shows neither "≈" nor a title while loading, at the 30px size', () => {
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
      expectStyle(card, SIZE_30);
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

  describe('compact total and size', () => {
    it('does not compact a total under 1.000 and keeps 30px', () => {
      render(
        <AccountsSidebar
          summary={{ ...baseSummary, totalBalance: -357.99, totalBalanceCurrencyIso: 'EUR' }}
          loading={false}
        />,
      );
      const card = screen.getByTestId('balance-card');
      expect(card.textContent).toBe(`-357,99${NBSP}€`);
      expect(card).toHaveAttribute('title', `-357,99${NBSP}€`);
      expectStyle(card, SIZE_30);
    });

    it('sizes the font with an inline style, not a text-[..px] class', () => {
      render(<AccountsSidebar summary={baseSummary} loading={false} />);
      const card = screen.getByTestId('balance-card');
      expectStyle(card, SIZE_30);
      expect(card.className).not.toMatch(/text-\[\d+px\]/);
      expect(card.className).toContain('whitespace-nowrap');
    });

    it('keeps 30px for an approximate 9-char compact total (the prefix is not measured)', () => {
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
      expectStyle(screen.getByTestId('balance-card'), SIZE_30);
    });

    it('drops to 24px for an 11-char compact total, exact value in title', () => {
      const total = 4456468760950.01;
      render(
        <AccountsSidebar
          summary={{ ...baseSummary, totalBalance: total, totalBalanceCurrencyIso: 'EUR' }}
          loading={false}
        />,
      );
      const card = screen.getByTestId('balance-card');
      expect(card.textContent).toBe(`4.456,47B${NBSP}€`);
      expect(card).toHaveAttribute('title', formatCurrency('EUR', total));
      expectStyle(card, SIZE_24);
    });

    it('drops to 20px for a 12-char compact total, exact value in title', () => {
      const total = 44564687609500;
      render(
        <AccountsSidebar
          summary={{
            ...baseSummary,
            totalBalance: total,
            totalBalanceCurrencyIso: 'EUR',
            totalBalanceApproximate: true,
          }}
          loading={false}
        />,
      );
      const card = screen.getByTestId('balance-card');
      expect(card.textContent).toBe(`≈ 44.564,69B${NBSP}€`);
      expect(card).toHaveAttribute('title', `≈ ${formatCurrency('EUR', total)}`);
      expectStyle(card, SIZE_20);
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
