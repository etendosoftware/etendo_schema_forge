import { render } from '@testing-library/react';

vi.mock('lucide-react', () => ({
  ChevronRight: (props) => <svg {...props} data-testid="icon-ChevronRight" />,
}));

import { DashboardRowChevron } from '../DashboardRowChevron.jsx';

describe('DashboardRowChevron', () => {
  it('renders a single ChevronRight icon', () => {
    const { getAllByTestId } = render(<DashboardRowChevron />);
    expect(getAllByTestId('icon-ChevronRight')).toHaveLength(1);
  });

  it('wrapper has width 28px', () => {
    const { container } = render(<DashboardRowChevron />);
    const wrapper = container.firstChild;
    expect(wrapper.style.width).toBe('28px');
  });

  it('wrapper has flexShrink 0', () => {
    const { container } = render(<DashboardRowChevron />);
    const wrapper = container.firstChild;
    // jsdom may serialise to string '0'
    expect(String(wrapper.style.flexShrink)).toBe('0');
  });

  it('wrapper has height 24px', () => {
    const { container } = render(<DashboardRowChevron />);
    expect(container.firstChild.style.height).toBe('24px');
  });
});
