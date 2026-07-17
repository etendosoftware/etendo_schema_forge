import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { PostingStatusDot } from '../PostingStatusDot.jsx';

describe('PostingStatusDot', () => {
  it('renders the "posted" label and a green dot for posted === "Y"', () => {
    const { container } = render(<PostingStatusDot posted="Y" />);
    expect(screen.getByText('financeAccountMovementsPosted')).toBeInTheDocument();
    const dot = container.querySelector('span > span');
    expect(dot.className).toContain('bg-[var(--status-success-fg)]');
  });

  it('renders the "not posted" label and an orange dot for posted === "N"', () => {
    const { container } = render(<PostingStatusDot posted="N" />);
    expect(screen.getByText('financeAccountMovementsNotPosted')).toBeInTheDocument();
    const dot = container.querySelector('span > span');
    expect(dot.className).toContain('bg-[#E68A00]');
  });

  it('treats missing posted as "not posted"', () => {
    render(<PostingStatusDot />);
    expect(screen.getByText('financeAccountMovementsNotPosted')).toBeInTheDocument();
  });

  it('appends a custom className to the wrapper', () => {
    const { container } = render(
      <PostingStatusDot posted="Y" className="ml-4 extra-class" />,
    );
    expect(container.firstChild.className).toContain('extra-class');
  });
});
