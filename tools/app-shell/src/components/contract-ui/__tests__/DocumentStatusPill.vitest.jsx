/**
 * Unit tests for DocumentStatusPill.
 *
 * Covers:
 *  - null guard (status == null → returns null, not a DOM node)
 *  - false guard (status === false passes the null-guard — classic bug regression)
 *  - label resolved from enumLabels via genericLabels dictionary (success tone)
 *  - label resolved from enumLabels via genericLabels dictionary (neutral tone — no icon)
 *  - explicit label prop overrides enumLabels
 *  - icon rendered for success tone, absent for neutral tone
 */

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({
    genericLabels: {
      statusProcessed: 'Processed',
      statusDraft: 'Draft',
    },
    statuses: {},
  }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// status-tag-tokens re-exports from a package that may not resolve in test env —
// mock it with the minimum palette entries used by DocumentStatusPill.
vi.mock('@/components/ui/status-tag-tokens.js', () => ({
  TONE_STYLES: {
    success: { background: '#D1FAE5', color: '#17663A' },
    warning: { background: '#FEF3C7', color: '#C28800' },
    destructive: { background: '#FEE2E2', color: '#D50B3E' },
    neutral: { background: '#F3F4F6', color: '#3F3F50' },
  },
}));

import { render, screen } from '@testing-library/react';
import DocumentStatusPill from '../DocumentStatusPill.jsx';

describe('DocumentStatusPill', () => {
  it('returns null when status is null', () => {
    const { container } = render(<DocumentStatusPill status={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when status is undefined', () => {
    const { container } = render(<DocumentStatusPill status={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('does NOT return null when status is false (null-guard regression)', () => {
    // The original guard was `!status` which incorrectly blocked false.
    // The correct guard is `status == null` which lets false through.
    render(<DocumentStatusPill status={false} />);
    expect(screen.getByTestId('document-status-pill')).toBeInTheDocument();
  });

  it('resolves label from enumLabels via genericLabels dictionary for a processed status', () => {
    // status true → getStatusTone → 'success'
    // enumLabels[true] = 'statusProcessed' → dictionary.genericLabels.statusProcessed = 'Processed'
    render(
      <DocumentStatusPill
        status={true}
        enumLabels={{ true: 'statusProcessed' }}
      />,
    );
    expect(screen.getByText('Processed')).toBeInTheDocument();
  });

  it('renders the pill element with correct data attributes', () => {
    render(
      <DocumentStatusPill
        status="CO"
        enumLabels={{ CO: 'statusProcessed' }}
      />,
    );
    const pill = screen.getByTestId('document-status-pill');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute('data-status', 'CO');
  });

  it('renders a tone icon for success tone', () => {
    render(
      <DocumentStatusPill
        status={true}
        enumLabels={{ true: 'statusProcessed' }}
      />,
    );
    // TONE_ICON.success = Check → icon is rendered with data-testid Icon__1e4f01
    expect(screen.getByTestId('Icon__1e4f01')).toBeInTheDocument();
  });

  it('renders NO icon for neutral tone', () => {
    // status 'IP' → warning tone, 'DR' → neutral; use an unknown status → neutral
    render(<DocumentStatusPill status="UNKNOWN_STATUS" />);
    expect(screen.queryByTestId('Icon__1e4f01')).toBeNull();
  });

  it('uses explicit label prop over enumLabels resolution', () => {
    render(
      <DocumentStatusPill
        status={true}
        label="Custom Label"
        enumLabels={{ true: 'statusProcessed' }}
      />,
    );
    expect(screen.getByText('Custom Label')).toBeInTheDocument();
    expect(screen.queryByText('Processed')).toBeNull();
  });

  it('uses explicit tone prop instead of deriving from status', () => {
    // status=true would normally → success; force tone=neutral → no icon
    render(
      <DocumentStatusPill
        status={true}
        tone="neutral"
        enumLabels={{ true: 'statusProcessed' }}
      />,
    );
    const pill = screen.getByTestId('document-status-pill');
    expect(pill).toHaveAttribute('data-tone', 'neutral');
    expect(screen.queryByTestId('Icon__1e4f01')).toBeNull();
  });
});
