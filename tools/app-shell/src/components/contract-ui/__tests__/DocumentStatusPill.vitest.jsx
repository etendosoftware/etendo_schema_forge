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

  it('renders hint as the title attribute when provided', () => {
    render(
      <DocumentStatusPill status="CO" enumLabels={{ CO: 'statusProcessed' }} hint="Some explanation" />,
    );
    expect(screen.getByTestId('document-status-pill')).toHaveAttribute('title', 'Some explanation');
  });

  it('omits the title attribute when hint is not provided (regression guard)', () => {
    render(<DocumentStatusPill status="CO" enumLabels={{ CO: 'statusProcessed' }} />);
    expect(screen.getByTestId('document-status-pill')).not.toHaveAttribute('title');
  });

  it('omits the title attribute when hint is an empty string', () => {
    render(<DocumentStatusPill status="CO" enumLabels={{ CO: 'statusProcessed' }} hint="" />);
    expect(screen.getByTestId('document-status-pill')).not.toHaveAttribute('title');
  });

  describe('showIcon prop', () => {
    it('renders the icon and data-show-icon="true" by default (regression)', () => {
      render(<DocumentStatusPill status={true} tone="success" label="L" />);
      expect(screen.getByTestId('Icon__1e4f01')).toBeInTheDocument();
      expect(screen.getByTestId('document-status-pill')).toHaveAttribute('data-show-icon', 'true');
    });

    it.each(['success', 'warning', 'destructive'])(
      'hides the icon for tone %s with showIcon={false} and keeps colors',
      (tone) => {
        const { unmount } = render(<DocumentStatusPill status="X" tone={tone} label="L" />);
        const withIcon = screen.getByTestId('document-status-pill');
        const expectedBg = withIcon.style.background || withIcon.style.backgroundColor;
        const expectedColor = withIcon.style.color;
        expect(screen.getByTestId('Icon__1e4f01')).toBeInTheDocument();
        unmount();

        render(<DocumentStatusPill status="X" tone={tone} label="L" showIcon={false} />);
        const pill = screen.getByTestId('document-status-pill');
        expect(screen.queryByTestId('Icon__1e4f01')).toBeNull();
        expect(pill).toHaveAttribute('data-show-icon', 'false');
        expect(pill).toHaveAttribute('data-tone', tone);
        expect(pill.style.background || pill.style.backgroundColor).toBe(expectedBg);
        expect(pill.style.color).toBe(expectedColor);
        expect(expectedColor).not.toBe('');
      },
    );

    it('renders the label normally for neutral tone with showIcon={false}', () => {
      render(<DocumentStatusPill status="X" tone="neutral" label="Neutral Label" showIcon={false} />);
      expect(screen.queryByTestId('Icon__1e4f01')).toBeNull();
      expect(screen.getByText('Neutral Label')).toBeInTheDocument();
      expect(screen.getByTestId('document-status-pill')).toHaveAttribute('data-show-icon', 'false');
    });
  });

  describe('icon prop', () => {
    const customIcon = <svg data-testid="custom-icon" />;

    it('renders the custom icon in place of the tone icon', () => {
      render(<DocumentStatusPill status="X" tone="success" label="L" icon={customIcon} />);
      expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
      expect(screen.queryByTestId('Icon__1e4f01')).toBeNull();
    });

    it('sets data-has-icon="true" when an icon is given', () => {
      render(<DocumentStatusPill status="X" tone="neutral" label="L" icon={customIcon} />);
      expect(screen.getByTestId('document-status-pill')).toHaveAttribute('data-has-icon', 'true');
    });

    it('wins over showIcon={false} while data-show-icon still reflects the prop', () => {
      render(<DocumentStatusPill status="X" tone="success" label="L" showIcon={false} icon={customIcon} />);
      const pill = screen.getByTestId('document-status-pill');
      expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
      expect(pill).toHaveAttribute('data-show-icon', 'false');
      expect(pill).toHaveAttribute('data-has-icon', 'true');
    });

    it('without icon: no data-has-icon attribute and the tone icon still renders', () => {
      render(<DocumentStatusPill status="X" tone="success" label="L" />);
      const pill = screen.getByTestId('document-status-pill');
      expect(pill).not.toHaveAttribute('data-has-icon');
      expect(screen.getByTestId('Icon__1e4f01')).toBeInTheDocument();
    });

    it('renders the icon before the label', () => {
      render(<DocumentStatusPill status="X" tone="neutral" label="L" icon={customIcon} />);
      const pill = screen.getByTestId('document-status-pill');
      expect(pill.firstElementChild).toBe(screen.getByTestId('custom-icon'));
      expect(pill.lastElementChild).toHaveTextContent('L');
    });
  });

  describe('testId prop and typography', () => {
    it('keeps data-testid="document-status-pill" by default', () => {
      render(<DocumentStatusPill status="X" tone="neutral" label="L" />);
      expect(screen.getByTestId('document-status-pill')).toBeInTheDocument();
    });

    it('overrides data-testid with the testId prop', () => {
      render(<DocumentStatusPill status="X" tone="neutral" label="L" testId="billing-badge" />);
      expect(screen.getByTestId('billing-badge')).toBeInTheDocument();
      expect(screen.queryByTestId('document-status-pill')).toBeNull();
    });

    it('applies letterSpacing -0.01em on the root style', () => {
      render(<DocumentStatusPill status="X" tone="neutral" label="L" />);
      expect(screen.getByTestId('document-status-pill').style.letterSpacing).toBe('-0.01em');
    });
  });
});
