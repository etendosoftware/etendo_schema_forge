// @covers artifacts/remittance/custom/RemittanceStatusBanner.jsx
//
// One translated sentence per REM status code under the top bar, in the tone the guide fixes
// (docs/generated-custom-windows/remittance.md → «Status banner»). Rendered through the real
// InfoBanner, so the tone is read from the classes it applies.
const mockUi = (key) => key;
vi.mock('@/i18n', () => ({ useUI: () => mockUi }));

import { render, screen } from '@testing-library/react';
import RemittanceStatusBanner, { remittanceStatusBanner } from '@generated/remittance/custom/RemittanceStatusBanner.jsx';
import enUS from '@/locales/en_US.json';
import esES from '@/locales/es_ES.json';
import esAR from '@/locales/es_AR.json';

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
  ['SB', 'info', 'remittanceBannerSent'],
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

// ETP-6247 — an automated remittance (EM_Etar_Automaticprocess, `eTARAutomaticprocess`) reaches
// Cobrada/Pagada on «Confirmar», which also generates the SEPA file: its banner says so.
describe('RemittanceStatusBanner — automated remittance (SEPA file)', () => {
  it.each([
    ['CT', 'Y', 'remittanceBannerCollectedFile'],
    ['PT', 'Y', 'remittanceBannerPaidFile'],
    ['CT', true, 'remittanceBannerCollectedFile'],
    ['PT', true, 'remittanceBannerPaidFile'],
  ])('%s with eTARAutomaticprocess %j shows %s, in the success tone', (status, automated, key) => {
    render(<RemittanceStatusBanner data={{ id: 'rem-1', remittanceStatus: status, eTARAutomaticprocess: automated }} />);
    const banner = screen.getByTestId('remittance-status-banner');
    expect(banner).toHaveTextContent(key);
    expect(banner.className).toContain(TONE_CLASS.success);
  });

  it.each([
    ['CT', 'N', 'remittanceBannerCollected'],
    ['PT', 'N', 'remittanceBannerPaid'],
    ['CT', false, 'remittanceBannerCollected'],
    ['CT', undefined, 'remittanceBannerCollected'],
    ['PT', undefined, 'remittanceBannerPaid'],
  ])('%s with eTARAutomaticprocess %j keeps the old key %s', (status, automated, key) => {
    render(<RemittanceStatusBanner data={{ id: 'rem-1', remittanceStatus: status, eTARAutomaticprocess: automated }} />);
    expect(screen.getByTestId('remittance-status-banner').textContent).toBe(key);
  });

  it('other statuses ignore the flag', () => {
    for (const [status, , key] of CASES.filter(([code]) => !['CT', 'PT'].includes(code))) {
      expect(remittanceStatusBanner(status, 'Y')).toMatchObject({ key });
    }
  });

  it.each([['en_US', enUS], ['es_ES', esES], ['es_AR', esAR]])('the file banner keys exist in %s', (_loc, json) => {
    for (const key of ['remittanceBannerCollectedFile', 'remittanceBannerPaidFile']) {
      expect(json.genericLabels[key], key).toEqual(expect.stringMatching(/\S/));
    }
  });
});
