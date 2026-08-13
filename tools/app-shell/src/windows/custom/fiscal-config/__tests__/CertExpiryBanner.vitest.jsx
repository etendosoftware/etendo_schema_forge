import { render, screen, fireEvent } from '@testing-library/react';

// --- Mocks ----------------------------------------------------------------

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('lucide-react', () => ({
  OctagonAlert: () => <svg data-testid="icon-octagon-alert" />,
  TriangleAlert: () => <svg data-testid="icon-triangle-alert" />,
  X: () => <svg data-testid="icon-x" />,
}));

// --- Import under test ----------------------------------------------------

import CertExpiryBanner from '../CertExpiryBanner.jsx';

// --- Tests ----------------------------------------------------------------

describe('CertExpiryBanner — null / hidden cases', () => {
  it('returns null when daysLeft is null', () => {
    const { container } = render(<CertExpiryBanner daysLeft={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when daysLeft > 60 (above WARN_DAYS)', () => {
    const { container } = render(<CertExpiryBanner daysLeft={61} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null exactly at daysLeft = 61', () => {
    const { container } = render(<CertExpiryBanner daysLeft={61} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('CertExpiryBanner — warning state (daysLeft = 45)', () => {
  it('renders the warning banner when daysLeft = 45 (amber)', () => {
    render(<CertExpiryBanner daysLeft={45} />);
    expect(screen.getByText('fiscal.cert.expiry.warn.title')).toBeInTheDocument();
  });

  it('renders the body text', () => {
    render(<CertExpiryBanner daysLeft={45} />);
    expect(screen.getByText('fiscal.cert.expiry.body')).toBeInTheDocument();
  });

  it('renders a dismiss button in warning state', () => {
    render(<CertExpiryBanner daysLeft={45} />);
    expect(screen.getByRole('button', { name: 'fiscal.cert.expiry.dismiss' })).toBeInTheDocument();
  });

  it('dismisses the banner when dismiss button is clicked', () => {
    const { container } = render(<CertExpiryBanner daysLeft={45} />);
    expect(container.firstChild).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'fiscal.cert.expiry.dismiss' }));
    expect(container.firstChild).toBeNull();
  });

  it('renders TriangleAlert icon in warning state (prominent)', () => {
    render(<CertExpiryBanner daysLeft={45} />);
    expect(screen.getByTestId('icon-triangle-alert')).toBeInTheDocument();
  });
});

describe('CertExpiryBanner — critical state (daysLeft = 15)', () => {
  it('renders the critical banner when daysLeft = 15 (red)', () => {
    render(<CertExpiryBanner daysLeft={15} />);
    expect(screen.getByText('fiscal.cert.expiry.critical.title')).toBeInTheDocument();
  });

  it('does NOT render a dismiss button in critical state', () => {
    render(<CertExpiryBanner daysLeft={15} />);
    expect(screen.queryByRole('button', { name: 'fiscal.cert.expiry.dismiss' })).not.toBeInTheDocument();
  });

  it('renders OctagonAlert icon in critical state (prominent)', () => {
    render(<CertExpiryBanner daysLeft={15} />);
    expect(screen.getByTestId('icon-octagon-alert')).toBeInTheDocument();
  });
});

describe('CertExpiryBanner — boundary at CRITICAL_DAYS (30)', () => {
  it('renders as critical at daysLeft = 30 (boundary)', () => {
    render(<CertExpiryBanner daysLeft={30} />);
    expect(screen.getByText('fiscal.cert.expiry.critical.title')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'fiscal.cert.expiry.dismiss' })).not.toBeInTheDocument();
  });

  it('renders as warning at daysLeft = 31 (just above critical)', () => {
    render(<CertExpiryBanner daysLeft={31} />);
    expect(screen.getByText('fiscal.cert.expiry.warn.title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'fiscal.cert.expiry.dismiss' })).toBeInTheDocument();
  });

  it('renders banner at daysLeft = 60 (at WARN_DAYS boundary)', () => {
    render(<CertExpiryBanner daysLeft={60} />);
    expect(screen.getByText('fiscal.cert.expiry.warn.title')).toBeInTheDocument();
  });
});

describe('CertExpiryBanner — variant="subtle"', () => {
  it('renders a compact inline banner for variant="subtle"', () => {
    render(<CertExpiryBanner daysLeft={45} variant="subtle" />);
    expect(screen.getByText('fiscal.cert.expiry.warn.title')).toBeInTheDocument();
    expect(screen.getByText('fiscal.cert.expiry.body')).toBeInTheDocument();
  });

  it('renders dismiss button for warning in subtle mode', () => {
    render(<CertExpiryBanner daysLeft={45} variant="subtle" />);
    expect(screen.getByRole('button', { name: 'fiscal.cert.expiry.dismiss' })).toBeInTheDocument();
  });

  it('does not render dismiss button for critical in subtle mode', () => {
    render(<CertExpiryBanner daysLeft={15} variant="subtle" />);
    expect(screen.queryByRole('button', { name: 'fiscal.cert.expiry.dismiss' })).not.toBeInTheDocument();
  });

  it('renders critical title in subtle mode', () => {
    render(<CertExpiryBanner daysLeft={15} variant="subtle" />);
    expect(screen.getByText('fiscal.cert.expiry.critical.title')).toBeInTheDocument();
  });

  it('no icon elements in subtle mode (no Triangle/Octagon)', () => {
    render(<CertExpiryBanner daysLeft={45} variant="subtle" />);
    expect(screen.queryByTestId('icon-triangle-alert')).not.toBeInTheDocument();
    expect(screen.queryByTestId('icon-octagon-alert')).not.toBeInTheDocument();
  });

  it('dismisses banner in subtle mode when button is clicked', () => {
    const { container } = render(<CertExpiryBanner daysLeft={45} variant="subtle" />);
    fireEvent.click(screen.getByRole('button', { name: 'fiscal.cert.expiry.dismiss' }));
    expect(container.firstChild).toBeNull();
  });
});

describe('CertExpiryBanner — variant="prominent" (default)', () => {
  it('renders prominent banner when no variant prop is passed', () => {
    render(<CertExpiryBanner daysLeft={45} />);
    expect(screen.getByTestId('icon-triangle-alert')).toBeInTheDocument();
  });

  it('renders prominent banner when variant="prominent" is explicit', () => {
    render(<CertExpiryBanner daysLeft={45} variant="prominent" />);
    expect(screen.getByTestId('icon-triangle-alert')).toBeInTheDocument();
  });
});

describe('CertExpiryBanner — i18n keys', () => {
  it('uses fiscal.cert.expiry.warn.title for warning', () => {
    render(<CertExpiryBanner daysLeft={45} />);
    expect(screen.getByText('fiscal.cert.expiry.warn.title')).toBeInTheDocument();
  });

  it('uses fiscal.cert.expiry.critical.title for critical', () => {
    render(<CertExpiryBanner daysLeft={15} />);
    expect(screen.getByText('fiscal.cert.expiry.critical.title')).toBeInTheDocument();
  });

  it('uses fiscal.cert.expiry.body', () => {
    render(<CertExpiryBanner daysLeft={45} />);
    expect(screen.getByText('fiscal.cert.expiry.body')).toBeInTheDocument();
  });

  it('uses fiscal.cert.expiry.dismiss as aria-label on the dismiss button', () => {
    render(<CertExpiryBanner daysLeft={45} />);
    expect(screen.getByRole('button', { name: 'fiscal.cert.expiry.dismiss' })).toBeInTheDocument();
  });
});
