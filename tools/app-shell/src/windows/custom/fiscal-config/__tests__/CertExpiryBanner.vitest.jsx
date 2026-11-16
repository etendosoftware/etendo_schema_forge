// @covers tools/app-shell/src/windows/custom/fiscal-config/CertExpiryBanner.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import esES from '@/locales/es_ES.json';

// --- Mocks ----------------------------------------------------------------

// `i18n.dict` null → ui() echoes the key (most tests); set to a real genericLabels dictionary →
// ui() resolves and interpolates it, so a test can assert the copy the user actually reads.
const i18n = vi.hoisted(() => ({ dict: null }));
vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    if (!i18n.dict) return key;
    const text = i18n.dict[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (m, name) => (params && name in params ? String(params[name]) : m));
  },
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

// ETP-6053 — with the real backend the banner finally renders, so its copy must make sense at
// every edge: an expired certificate, one expiring today, and a single remaining day.
describe('CertExpiryBanner — expired, today and singular copy (es_ES, ETP-6053)', () => {
  beforeEach(() => { i18n.dict = esES.genericLabels; });
  afterEach(() => { i18n.dict = null; });

  it.each(['prominent', 'subtle'])('shows the expired copy for daysLeft = -12, not dismissable (%s)', (variant) => {
    render(<CertExpiryBanner daysLeft={-12} variant={variant} />);
    expect(screen.getByText('El certificado digital ha caducado')).toBeInTheDocument();
    expect(screen.getByText(/Sube un certificado vigente desde Configuración fiscal\./)).toBeInTheDocument();
    expect(screen.queryByText(/-12/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar' })).not.toBeInTheDocument();
  });

  it('uses the critical icon for an expired certificate', () => {
    render(<CertExpiryBanner daysLeft={-1} />);
    expect(screen.getByTestId('icon-octagon-alert')).toBeInTheDocument();
  });

  it.each(['prominent', 'subtle'])('shows "vence hoy" for daysLeft = 0, not dismissable (%s)', (variant) => {
    render(<CertExpiryBanner daysLeft={0} variant={variant} />);
    expect(screen.getByText('El certificado digital vence hoy')).toBeInTheDocument();
    expect(screen.queryByText(/0 días/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar' })).not.toBeInTheDocument();
  });

  it('uses the singular for daysLeft = 1', () => {
    render(<CertExpiryBanner daysLeft={1} />);
    expect(screen.getByText('El certificado vence en 1 día')).toBeInTheDocument();
  });

  it('keeps the plural for daysLeft = 15', () => {
    render(<CertExpiryBanner daysLeft={15} />);
    expect(screen.getByText('El certificado vence en 15 días')).toBeInTheDocument();
    expect(screen.getByText('Renueva tu certificado digital para evitar interrupciones en los envíos fiscales.')).toBeInTheDocument();
  });

  it('every _one key exists in en_US, es_ES and es_AR next to its plural', async () => {
    const [en, ar] = await Promise.all([import('@/locales/en_US.json'), import('@/locales/es_AR.json')]);
    const keys = [
      'fiscal.cert.expiry.warn.title_one', 'fiscal.cert.expiry.critical.title_one',
      'fiscal.cert.expiry.today.title', 'fiscal.cert.expiry.expired.title', 'fiscal.cert.expiry.expired.body',
    ];
    for (const dict of [esES, en.default ?? en, ar.default ?? ar]) {
      for (const k of keys) expect(dict.genericLabels[k], k).toBeTruthy();
    }
  });
});
