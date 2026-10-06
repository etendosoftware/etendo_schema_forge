import { render, screen } from '@testing-library/react';
import ProgressRing, { clampPercent } from '../ProgressRing.jsx';

const circumference = (r) => 2 * Math.PI * r;

describe('clampPercent', () => {
  it.each([
    [0, 0, 0],
    [50, 50, 50],
    [100, 100, 100],
    [150, 150, 100],
    [-10, -10, 0],
    [NaN, 0, 0],
    ['45', 45, 45],
  ])('clampPercent(%j) -> pct %j, clamped %j', (input, pct, clamped) => {
    expect(clampPercent(input)).toEqual({ pct, clamped });
  });
});

describe('ProgressRing default variant', () => {
  const setup = (value, props = {}) => {
    const { container } = render(<ProgressRing value={value} ringTestId="ring" {...props} />);
    return { svg: screen.getByTestId('ring'), track: container.querySelector('circle') };
  };

  it('renders a 24x24 svg with r=8 and stroke-width 4 and a border track', () => {
    const { svg, track } = setup(50);
    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
    expect(track).toHaveAttribute('r', '8');
    expect(track).toHaveAttribute('stroke-width', '4');
    expect(track.getAttribute('class')).toContain('stroke-border');
  });

  it.each([[0], [NaN], [-10]])('renders no arc for %j', (value) => {
    setup(value);
    expect(screen.queryByTestId('ProgressRing-arc')).toBeNull();
  });

  it.each([[1], [50], [99]])('uses the foreground arc at %i', (value) => {
    setup(value);
    const arc = screen.getByTestId('ProgressRing-arc');
    expect(arc.getAttribute('class')).toContain('stroke-foreground');
    expect(arc.getAttribute('class')).not.toContain('status-done-badge');
  });

  it.each([[100], [150]])('uses the green arc with zero offset at %i', (value) => {
    setup(value);
    const arc = screen.getByTestId('ProgressRing-arc');
    expect(arc.getAttribute('class')).toContain('stroke-[hsl(var(--status-done-badge))]');
    expect(arc.getAttribute('class')).not.toContain('stroke-foreground');
    expect(Number(arc.getAttribute('stroke-dashoffset'))).toBeCloseTo(0, 5);
  });

  it('computes the dashoffset at 50%', () => {
    setup(50);
    const arc = screen.getByTestId('ProgressRing-arc');
    expect(Number(arc.getAttribute('stroke-dasharray'))).toBeCloseTo(circumference(8), 5);
    expect(Number(arc.getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference(8) / 2, 5);
  });

  it('rotates the arc to start at 12 o\'clock', () => {
    setup(50);
    expect(screen.getByTestId('ProgressRing-arc')).toHaveAttribute('transform', 'rotate(-90 12 12)');
  });

  it('honours strokeWidth and radius overrides', () => {
    const { track } = setup(50, { strokeWidth: 3, radius: 5 });
    expect(track).toHaveAttribute('r', '5');
    expect(track).toHaveAttribute('stroke-width', '3');
  });
});

describe('ProgressRing current variant', () => {
  const setup = (value) => {
    const { container } = render(<ProgressRing value={value} size={16} variant="current" ringTestId="ring" />);
    return { svg: screen.getByTestId('ring'), track: container.querySelector('circle') };
  };

  it('renders a 16x16 svg with r=6.5 and stroke-width 2', () => {
    const { svg, track } = setup(50);
    expect(svg).toHaveAttribute('width', '16');
    expect(svg).toHaveAttribute('height', '16');
    expect(track).toHaveAttribute('r', '6.5');
    expect(track).toHaveAttribute('stroke-width', '2');
  });

  it('uses a currentColor track at 20% opacity without the border class', () => {
    const { track } = setup(50);
    expect(track).toHaveAttribute('stroke', 'currentColor');
    expect(track).toHaveAttribute('stroke-opacity', '0.2');
    expect(track.getAttribute('class') || '').not.toContain('stroke-border');
  });

  it('uses a currentColor arc below 100', () => {
    setup(50);
    const arc = screen.getByTestId('ProgressRing-arc');
    expect(arc).toHaveAttribute('stroke', 'currentColor');
    expect(arc.getAttribute('class') || '').not.toContain('stroke-foreground');
  });

  it('renders no arc at 0', () => {
    setup(0);
    expect(screen.queryByTestId('ProgressRing-arc')).toBeNull();
  });

  it('uses the green class at 100', () => {
    setup(100);
    expect(screen.getByTestId('ProgressRing-arc').getAttribute('class')).toContain('status-done-badge');
  });
});

describe('ProgressRing test ids and a11y', () => {
  it('derives the arc id from data-testid and keeps the base off the svg', () => {
    render(<ProgressRing value={50} data-testid="custom" ringTestId="ring" />);
    expect(screen.getByTestId('custom-arc')).toBeInTheDocument();
    expect(screen.queryByTestId('custom')).toBeNull();
    expect(screen.getByTestId('ring').tagName.toLowerCase()).toBe('svg');
  });

  it('defaults the base id to ProgressRing', () => {
    render(<ProgressRing value={50} />);
    expect(screen.getByTestId('ProgressRing-arc')).toBeInTheDocument();
  });

  it('marks the svg aria-hidden', () => {
    render(<ProgressRing value={50} ringTestId="ring" />);
    expect(screen.getByTestId('ring')).toHaveAttribute('aria-hidden', 'true');
  });
});
