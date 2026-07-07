import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));

import { SatisfactionRating } from '../SatisfactionRating.jsx';

describe('SatisfactionRating', () => {
  it('renders the thank-you state when already submitted', () => {
    render(<SatisfactionRating onSubmit={vi.fn()} submitted />);
    expect(screen.getByText('supportRatingThanks')).toBeInTheDocument();
  });

  it('renders 5 rating options and a disabled submit button by default', () => {
    render(<SatisfactionRating onSubmit={vi.fn()} submitted={false} />);
    expect(screen.getByLabelText('supportRating1')).toBeInTheDocument();
    expect(screen.getByLabelText('supportRating5')).toBeInTheDocument();
    expect(screen.getByText('supportSubmitRating')).toBeDisabled();
  });

  it('enables the submit button once a score is selected', async () => {
    const user = userEvent.setup();
    render(<SatisfactionRating onSubmit={vi.fn()} submitted={false} />);
    await user.click(screen.getByLabelText('supportRating4'));
    expect(screen.getByText('supportSubmitRating')).toBeEnabled();
  });

  it('submits the selected score and trimmed comment', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue();
    render(<SatisfactionRating onSubmit={onSubmit} submitted={false} />);
    await user.click(screen.getByLabelText('supportRating3'));
    await user.type(screen.getByPlaceholderText('supportAddComment'), '  great!  ');
    await user.click(screen.getByText('supportSubmitRating'));
    expect(onSubmit).toHaveBeenCalledWith(3, 'great!');
  });

  it('does not submit when no score has been selected', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SatisfactionRating onSubmit={onSubmit} submitted={false} />);
    await user.click(screen.getByText('supportSubmitRating'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
