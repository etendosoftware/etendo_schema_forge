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

  // ── ETP-4717 fail-closed contract: no onSend → no send link at all ─────────
  // Previously these two asserted the button was present but inert (onClick
  // undefined) when no handler was given. Once EmailsCard.jsx is fixed to
  // {onSend && (...)}, the button must not render at all in that case — so
  // both are rewritten to match the corrected contract. They currently FAIL
  // against the unfixed source (the button is still found today).
  it('renders without crashing and omits the send link when onSend is undefined (ETP-4717 fail-closed)', () => {
    expect(() => render(<EmailsCard />)).not.toThrow();
    expect(screen.queryByText('previewCardSendEmail')).not.toBeInTheDocument();
  });

  it('exposes no clickable send trigger when onSend is undefined — no dead link (ETP-4717 fail-closed)', () => {
    render(<EmailsCard />);
    // Previously: clicking the inert button didn't throw. Now: there must be
    // no button/link element to click in the first place.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
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

  // ── ETP-4717 Pair 3 regression: hide (not just disable) the Send link ───────
  // EmailsCard currently renders the "Send email" button unconditionally even
  // when a caller intentionally passes onSend={undefined} (e.g. because the
  // document's status makes sending unavailable) — it's just visually present
  // with an inert onClick. The fix wraps the button in {onSend && (...)},
  // matching the sibling PreviewActionButtons.jsx pattern. This case must FAIL
  // against the current (unfixed) source: the button is still found.
  //
  // NOTE for whoever implements the fix: this directly conflicts with the two
  // existing tests above ("renders without crashing when onSend is undefined"
  // and "clicking send button with no onSend does not throw"), which assert
  // the button IS present (just inert) when onSend is undefined. Those two
  // tests will need to be updated in the same change that applies the fix.
  it('ETP-4717: does NOT render the "send email" link at all when onSend is not passed (undefined)', () => {
    render(<EmailsCard />);
    expect(screen.queryByText('previewCardSendEmail')).not.toBeInTheDocument();
  });
});
