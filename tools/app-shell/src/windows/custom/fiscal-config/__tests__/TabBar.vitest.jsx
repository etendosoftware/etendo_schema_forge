import { render, screen, fireEvent } from '@testing-library/react';
import TabBar from '../TabBar.jsx';

const TABS = ['SII', 'TicketBAI'];

describe('TabBar — rendering', () => {
  it('renders all tab labels', () => {
    render(<TabBar tabs={TABS} active={0} onChange={vi.fn()} />);
    expect(screen.getByText('SII')).toBeInTheDocument();
    expect(screen.getByText('TicketBAI')).toBeInTheDocument();
  });

  it('applies active styling to the selected tab', () => {
    render(<TabBar tabs={TABS} active={0} onChange={vi.fn()} />);
    const siiBtn = screen.getByText('SII');
    expect(siiBtn.className).toContain('bg-card');
    expect(siiBtn.className).toContain('font-medium');
  });

  it('applies idle styling to inactive tabs', () => {
    render(<TabBar tabs={TABS} active={0} onChange={vi.fn()} />);
    const tbaiBtn = screen.getByText('TicketBAI');
    expect(tbaiBtn.className).toContain('font-normal');
  });

  it('calls onChange with the correct index when a tab is clicked', () => {
    const onChange = vi.fn();
    render(<TabBar tabs={TABS} active={0} onChange={onChange} />);
    fireEvent.click(screen.getByText('TicketBAI'));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('calls onChange with index 0 when the first tab is clicked', () => {
    const onChange = vi.fn();
    render(<TabBar tabs={TABS} active={1} onChange={onChange} />);
    fireEvent.click(screen.getByText('SII'));
    expect(onChange).toHaveBeenCalledWith(0);
  });
});
