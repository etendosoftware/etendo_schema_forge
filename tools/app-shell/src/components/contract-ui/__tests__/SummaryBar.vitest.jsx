vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
}));

import { render, screen } from '@testing-library/react';
import { SummaryBar } from '../SummaryBar.jsx';

describe('SummaryBar', () => {
  it('formats an amount field via the shared formatAmount (es-ES, grouped, real symbol)', () => {
    render(
      <SummaryBar
        fields={[{ key: 'total', column: 'total', type: 'amount' }]}
        data={{ total: 1355.2, 'currency$_identifier': 'EUR' }}
      />,
    );
    expect(screen.getByText('1.355,20 €')).toBeInTheDocument();
    expect(screen.queryByText('1,355.20 €')).toBeNull();
  });

  it('shows an em dash when the value is null', () => {
    render(
      <SummaryBar
        fields={[{ key: 'total', column: 'total', type: 'amount' }]}
        data={{ total: null }}
      />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
