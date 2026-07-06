// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// --- Imports ---

import { render, screen } from '@testing-library/react';
import PaymentConciliadoBadge from '../PaymentConciliadoBadge.jsx';

// --- Tests ---

describe('PaymentConciliadoBadge', () => {
  it('renders nothing when data is undefined', () => {
    const { container } = render(<PaymentConciliadoBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when data has no status', () => {
    const { container } = render(<PaymentConciliadoBadge data={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a non-deposited status (e.g. draft)', () => {
    const { container } = render(<PaymentConciliadoBadge data={{ status: 'RPAP' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an unknown/void status', () => {
    const { container } = render(<PaymentConciliadoBadge data={{ status: 'RPVOID' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each(['RPR', 'RPPC', 'RDNC', 'PPM', 'PWNC', 'RPAE'])(
    'renders the conciliado badge for deposited status %s',
    (status) => {
      render(<PaymentConciliadoBadge data={{ status }} />);
      const badge = screen.getByText('conciliado');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveStyle({ background: '#ECFDF3', color: 'rgb(23, 102, 58)' });
    },
  );

  it('renders the checkmark svg icon alongside the label', () => {
    render(<PaymentConciliadoBadge data={{ status: 'RPR' }} />);
    expect(document.querySelector('svg polyline')).toBeInTheDocument();
  });
});
