import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DashboardEmptyState } from '../DashboardEmptyState.jsx';

const IconStub = (props) => <svg {...props} data-testid="icon-stub" />;

describe('DashboardEmptyState', () => {
  it('renders title and subtitle', () => {
    render(<DashboardEmptyState title="No data" subtitle="Try later" />);
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.getByText('Try later')).toBeInTheDocument();
  });

  it('does not render any action button when actions is empty', () => {
    const { container } = render(
      <DashboardEmptyState title="t" subtitle="s" actions={[]} />,
    );
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('does not render any action button when actions is undefined', () => {
    const { container } = render(<DashboardEmptyState title="t" subtitle="s" />);
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('renders one button per action with its label', () => {
    render(
      <DashboardEmptyState
        title="t"
        subtitle="s"
        actions={[
          { key: 'a', label: 'Action A', onClick: () => {} },
          { key: 'b', label: 'Action B', onClick: () => {} },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Action A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Action B' })).toBeInTheDocument();
  });

  it('invokes onClick when the action button is clicked', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <DashboardEmptyState
        title="t"
        subtitle="s"
        actions={[{ key: 'a', label: 'Click me', onClick }]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Click me' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies primary variant styling (black background)', () => {
    render(
      <DashboardEmptyState
        title="t"
        subtitle="s"
        actions={[{ key: 'p', label: 'P', variant: 'primary', onClick: () => {} }]}
      />,
    );
    const button = screen.getByRole('button', { name: 'P' });
    expect(button.style.background).toMatch(/#121217|rgb\(18, 18, 23\)/i);
  });

  it('applies secondary variant styling (white background with border)', () => {
    render(
      <DashboardEmptyState
        title="t"
        subtitle="s"
        actions={[{ key: 's', label: 'S', variant: 'secondary', onClick: () => {} }]}
      />,
    );
    const button = screen.getByRole('button', { name: 'S' });
    expect(button.style.border).toMatch(/1px solid (#D1D4DB|rgb\(209, 212, 219\))/i);
  });

  it('applies width prop when given', () => {
    const { container } = render(
      <DashboardEmptyState title="t" subtitle="s" width="320px" />,
    );
    // container > flex-1 > inner flex-col with width style
    const inner = container.querySelector('.flex-1 > div');
    expect(inner.style.width).toBe('320px');
  });

  it('applies textPadding prop when given', () => {
    const { container } = render(
      <DashboardEmptyState title="t" subtitle="s" textPadding="16px" />,
    );
    const textBlock = container.querySelector('.flex-1 > div > div');
    expect(textBlock.style.padding).toBe('16px');
  });

  it('renders the icon when provided in an action', () => {
    render(
      <DashboardEmptyState
        title="t"
        subtitle="s"
        actions={[{ key: 'i', label: 'WithIcon', icon: IconStub, onClick: () => {} }]}
      />,
    );
    expect(screen.getByTestId('icon-stub')).toBeInTheDocument();
  });
});
