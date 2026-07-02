vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

import { render, screen, fireEvent } from '@testing-library/react';
import EmailsCard from '../EmailsCard.jsx';

describe('EmailsCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the section title via i18n key', () => {
    render(<EmailsCard onSend={vi.fn()} />);
    expect(screen.getByText('previewCardEmails')).toBeInTheDocument();
  });

  it('renders the "send email" link button via i18n key', () => {
    render(<EmailsCard onSend={vi.fn()} />);
    expect(screen.getByText('previewCardSendEmail')).toBeInTheDocument();
  });

  it('renders the "no email history" message via i18n key', () => {
    render(<EmailsCard onSend={vi.fn()} />);
    expect(screen.getByText('previewCardNoEmailHistory')).toBeInTheDocument();
  });

  it('calls onSend when the send email button is clicked', () => {
    const onSend = vi.fn();
    render(<EmailsCard onSend={onSend} />);
    fireEvent.click(screen.getByText('previewCardSendEmail'));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('renders without crashing when onSend is undefined', () => {
    // Should not throw even with no handler
    expect(() => render(<EmailsCard />)).not.toThrow();
  });

  it('clicking send button with no onSend does not throw', () => {
    render(<EmailsCard />);
    expect(() => fireEvent.click(screen.getByText('previewCardSendEmail'))).not.toThrow();
  });

  // ── ETP-4372 regression: EMAILS-section Send link must be wired ─────────────
  // The bug was a dead "Enviar email" link (onSend passed as undefined). This
  // guards the component boundary: a wired onSend must fire exactly once on click.
  it('ETP-4372: send link invokes the wired onSend exactly once (not a dead link)', () => {
    const onSend = vi.fn();
    render(<EmailsCard onSend={onSend} />);
    fireEvent.click(screen.getByText('previewCardSendEmail'));
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
