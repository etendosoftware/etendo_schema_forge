import { render, screen } from '@testing-library/react';
import FiscalStepItem from '../FiscalStepItem.jsx';

describe('FiscalStepItem — idle state', () => {
  it('renders the step number when not done and not active', () => {
    render(<FiscalStepItem n={2} label="Details" done={false} active={false} isFirst={false} />);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  it('renders the separator line when isFirst=false', () => {
    const { container } = render(
      <FiscalStepItem n={2} label="Details" done={false} active={false} isFirst={false} />
    );
    const spans = container.querySelectorAll('span');
    const separator = Array.from(spans).find(s => s.style.width === '40px');
    expect(separator).toBeTruthy();
  });

  it('does not render the separator line when isFirst=true', () => {
    const { container } = render(
      <FiscalStepItem n={1} label="Territory" done={false} active={false} isFirst={true} />
    );
    const spans = container.querySelectorAll('span');
    const separator = Array.from(spans).find(s => s.style.width === '40px');
    expect(separator).toBeFalsy();
  });
});

describe('FiscalStepItem — done state', () => {
  it('renders a checkmark icon instead of the step number when done', () => {
    render(<FiscalStepItem n={1} label="Territory" done={true} active={false} isFirst={true} />);
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.getByText('Territory')).toBeInTheDocument();
  });

  it('applies line-through style to the label when done', () => {
    render(<FiscalStepItem n={1} label="Territory" done={true} active={false} isFirst={true} />);
    const label = screen.getByText('Territory');
    expect(label.style.textDecoration).toBe('line-through');
  });
});

describe('FiscalStepItem — active state', () => {
  it('renders the step number with dark background when active', () => {
    const { container } = render(
      <FiscalStepItem n={2} label="Details" done={false} active={true} isFirst={false} />
    );
    const numberSpan = screen.getByText('2');
    expect(numberSpan.style.background).toBe('hsl(var(--foreground))');
  });

  it('applies bold font weight to label when active', () => {
    render(<FiscalStepItem n={2} label="Details" done={false} active={true} isFirst={false} />);
    const label = screen.getByText('Details');
    expect(label.style.fontWeight).toBe('600');
  });
});
