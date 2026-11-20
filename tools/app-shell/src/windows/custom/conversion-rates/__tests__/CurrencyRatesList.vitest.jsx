// @covers tools/app-shell/src/windows/custom/conversion-rates/CurrencyRatesList.jsx
// @covers tools/app-shell/src/windows/custom/conversion-rates/conversionRatesFormat.js

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: vi.fn() }),
}));

import { render, screen, within } from '@testing-library/react';
import { ROW_LIFT_SHADOW, ROW_LIFT_HOVER_NO_BORDERS } from '@/components/contract-ui/rowVisuals.js';
import { CurrencyRatesList } from '../CurrencyRatesList.jsx';

const MANUAL_ROW = {
  id: 'manual-1',
  toCurrency: 'usd-id',
  validFromDate: '2026-11-18T14:30:00',
  validToDate: '9999-12-31T00:00:00',
  multipleRateBy: 1.1,
  divideRateBy: 0.909091,
  etgoRateStatus: 'CURRENT',
  sMFCRSynced: false,
};
const SYNCED_ROW = {
  id: 'synced-1',
  toCurrency: 'usd-id',
  validFromDate: '2026-11-17T00:00:00',
  validToDate: '2026-11-17T00:00:00',
  multipleRateBy: 1234.5,
  divideRateBy: 0.00081,
  etgoRateStatus: 'HISTORIC',
  sMFCRSynced: true,
};
const ENTRY = {
  currencyId: 'usd-id', isoCode: 'USD', name: 'US Dollar', symbol: '$', automatic: false,
  rate: 1.1, validFrom: MANUAL_ROW.validFromDate, lastDownloadAt: null, rows: [MANUAL_ROW, SYNCED_ROW],
};

function renderList() {
  render(
    <CurrencyRatesList
      entries={[ENTRY]}
      orgIso="EUR"
      orgSymbol="€"
      expanded={new Set(['usd-id'])}
      onToggle={vi.fn()}
      loading={false}
      loaded
      error={false}
      onNewRate={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      deletingId={null}
      ui={(key) => key} />,
  );
}

describe('CurrencyRatesList — rate rows', () => {
  it.each([MANUAL_ROW.id, SYNCED_ROW.id])('row %s carries the shared row-hover lift without borders', (id) => {
    renderList();
    const row = screen.getByTestId(`convrate-row-${id}`);
    for (const cls of `${ROW_LIFT_SHADOW} ${ROW_LIFT_HOVER_NO_BORDERS}`.split(' ')) {
      expect(row.classList.contains(cls)).toBe(true);
    }
  });

  it('a manual row offers Modificar and Eliminar; a downloaded row offers none', () => {
    renderList();
    expect(screen.getByTestId(`convrate-edit-${MANUAL_ROW.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`convrate-delete-${MANUAL_ROW.id}`)).toBeInTheDocument();
    const synced = screen.getByTestId(`convrate-row-${SYNCED_ROW.id}`);
    expect(within(synced).queryAllByRole('button')).toHaveLength(0);
  });

  it.each([
    ['open-ended manual range', MANUAL_ROW.id, '18/11/2026 14:30', '—', '1,1000'],
    ['downloaded daily range closing at 00:00', SYNCED_ROW.id, '17/11/2026 00:00', '17/11/2026 23:59', '1.234,5000'],
  ])('%s: dates and a 4-decimal rate as displayed', (_label, id, from, to, rate) => {
    renderList();
    const row = screen.getByTestId(`convrate-row-${id}`);
    expect(within(row).getByTestId('TableCell__convrate-from')).toHaveTextContent(from);
    expect(within(row).getByTestId('TableCell__convrate-to')).toHaveTextContent(to);
    expect(within(row).getByTestId('TableCell__convrate-rate')).toHaveTextContent(`${rate} $`);
  });
});
