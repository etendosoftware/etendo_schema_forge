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

  it.each(['RPR', 'RDNC', 'PPM', 'PWNC', 'RPAE'])(
    'renders nothing for a deposited-but-not-cleared status %s',
    (status) => {
      const { container } = render(<PaymentConciliadoBadge data={{ status }} />);
      expect(container).toBeEmptyDOMElement();
    },
  );

  it('renders the conciliado badge for RPPC (Payment Cleared)', () => {
    render(<PaymentConciliadoBadge data={{ status: 'RPPC' }} />);
    const badge = screen.getByText('conciliado');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveStyle({ background: '#EEFBF4', color: 'rgb(23, 102, 58)' });
  });

  it('renders the checkmark svg icon alongside the label', () => {
    render(<PaymentConciliadoBadge data={{ status: 'RPPC' }} />);
    expect(document.querySelector('svg polyline')).toBeInTheDocument();
  });
});
