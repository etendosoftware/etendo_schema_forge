// @covers tools/app-shell/src/windows/custom/financial-account/PostingStatusDot.jsx
// @covers tools/app-shell/src/windows/custom/financial-account/postingStatusLabel.js
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { PostingStatusDot } from '../PostingStatusDot.jsx';
import { postingStatusLabel } from '../postingStatusLabel.js';

const ui = (key) => key;

// The tone comes from the shared posting-status registry (ETP-5647); the dot paints it with
// the theme's CSS variable so dark mode keeps a readable shade.
const DOT_VAR = {
  success: '--status-success-fg',
  warning: '--status-warning-fg',
  destructive: '--destructive',
};

function expectDotTone(container, tone) {
  expect(container.firstChild).toHaveAttribute('data-tone', tone);
  expect(container.querySelector('span > span').getAttribute('style')).toContain(DOT_VAR[tone]);
}

describe('PostingStatusDot', () => {
  it('renders the "posted" label and a success dot for posted === "Y"', () => {
    const { container } = render(<PostingStatusDot posted="Y" />);
    expect(screen.getByText('financeAccountMovementsPosted')).toBeInTheDocument();
    expectDotTone(container, 'success');
  });

  it('renders the "not posted" label and the yellow warning dot for posted === "N"', () => {
    const { container } = render(<PostingStatusDot posted="N" />);
    expect(screen.getByText('financeAccountMovementsNotPosted')).toBeInTheDocument();
    expectDotTone(container, 'warning');
  });

  it('treats missing posted as "not posted"', () => {
    const { container } = render(<PostingStatusDot />);
    expect(screen.getByText('financeAccountMovementsNotPosted')).toBeInTheDocument();
    expectDotTone(container, 'warning');
  });

  it('shows a failed posting as the failure, not as "not posted" (period closed)', () => {
    const { container } = render(<PostingStatusDot posted="p" />);
    expect(screen.getByText('postedStatusPeriodClosed')).toBeInTheDocument();
    expect(screen.queryByText('financeAccountMovementsNotPosted')).not.toBeInTheDocument();
    expectDotTone(container, 'destructive');
  });

  it('appends a custom className to the wrapper', () => {
    const { container } = render(
      <PostingStatusDot posted="Y" className="ml-4 extra-class" />,
    );
    expect(container.firstChild.className).toContain('extra-class');
  });
});

describe('postingStatusLabel', () => {
  it('keeps the window wording for Y and N (and an empty value)', () => {
    expect(postingStatusLabel('Y', ui)).toBe('financeAccountMovementsPosted');
    expect(postingStatusLabel('N', ui)).toBe('financeAccountMovementsNotPosted');
    expect(postingStatusLabel(undefined, ui)).toBe('financeAccountMovementsNotPosted');
  });

  it('names the reason for a failure code, and echoes an unknown code', () => {
    expect(postingStatusLabel('E', ui)).toBe('postedStatusError');
    expect(postingStatusLabel('i', ui)).toBe('postedStatusInvalidAccount');
    expect(postingStatusLabel('ZZ', ui)).toBe('ZZ');
  });
});
