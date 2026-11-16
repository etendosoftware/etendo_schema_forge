// @covers artifacts/remittance/custom/RemittanceStatusBanner.jsx
//
// One translated sentence per REM status code under the top bar, in the tone the guide fixes
// (docs/generated-custom-windows/remittance.md → «Status banner»). Rendered through the real
// InfoBanner, so the tone is read from the classes it applies.
const mockUi = (key) => key;
vi.mock('@/i18n', () => ({ useUI: () => mockUi }));

import { render, screen } from '@testing-library/react';
import RemittanceStatusBanner, { remittanceStatusBanner } from '@generated/remittance/custom/RemittanceStatusBanner.jsx';

// The container class InfoBanner gives each tone (components/InfoBanner.jsx → TONES).
const TONE_CLASS = {
  info: 'bg-status-info',
  success: 'bg-status-success',
  warning: 'bg-status-warning',
  danger: 'bg-destructive/10',
};

const CASES = [
  ['PE', 'info', 'remittanceBannerPending'],
  ['PR', 'info', 'remittanceBannerProcessed'],
  ['CT', 'success', 'remittanceBannerCollected'],
  ['PT', 'success', 'remittanceBannerPaid'],
  ['CP', 'warning', 'remittanceBannerPartiallyCollected'],
  ['PP', 'warning', 'remittanceBannerPartiallyPaid'],
  ['AN', 'danger', 'remittanceBannerVoided'],
];

describe('RemittanceStatusBanner', () => {
  it.each(CASES)('status %s renders the %s banner with %s', (status, tone, key) => {
    render(<RemittanceStatusBanner data={{ id: 'rem-1', remittanceStatus: status }} />);
    const banner = screen.getByTestId('remittance-status-banner');
    expect(banner).toHaveAttribute('data-status', status);
    expect(banner).toHaveTextContent(key);
    expect(banner.className).toContain(TONE_CLASS[tone]);
    for (const [other, cls] of Object.entries(TONE_CLASS)) {
      if (other !== tone) expect(banner.className).not.toContain(cls);
    }
  });

  it('is not dismissible: it explains the state, it is not a one-off advice', () => {
    render(<RemittanceStatusBanner data={{ id: 'rem-1', remittanceStatus: 'PE' }} />);
    expect(screen.getByTestId('remittance-status-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('info-banner-dismiss')).toBeNull();
  });

  it('renders nothing for a new record (no id), whatever its status', () => {
    const { container } = render(<RemittanceStatusBanner data={{ remittanceStatus: 'PE' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing without data', () => {
    const { container } = render(<RemittanceStatusBanner data={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an unknown or missing status code', () => {
    const { container, rerender } = render(<RemittanceStatusBanner data={{ id: 'rem-1', remittanceStatus: 'XX' }} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<RemittanceStatusBanner data={{ id: 'rem-1' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('exposes the per-status table: tone and key for known codes, null otherwise', () => {
    for (const [status, tone, key] of CASES) {
      expect(remittanceStatusBanner(status)).toMatchObject({ tone, key });
    }
    expect(remittanceStatusBanner('XX')).toBeNull();
    expect(remittanceStatusBanner(undefined)).toBeNull();
  });
});
