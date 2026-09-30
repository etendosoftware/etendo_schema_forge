import { render, screen } from '@testing-library/react';

import { ProgressCircle } from '../ProgressCircle.jsx';

const CIRCUMFERENCE = 2 * Math.PI * 8;

function arcOf(container) {
  return container.querySelector('[data-testid="ProgressCircle-arc"]');
}

describe('ProgressCircle', () => {
  describe('arc geometry', () => {
    it('uses a 24x24 svg with r=8, stroke 4 and dasharray = circumference', () => {
      const { container } = render(<ProgressCircle value={50} />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('width', '24');
      expect(svg).toHaveAttribute('height', '24');
      const arc = arcOf(container);
      expect(arc).toHaveAttribute('r', '8');
      expect(arc).toHaveAttribute('stroke-width', '4');
      expect(Number(arc.getAttribute('stroke-dasharray'))).toBeCloseTo(CIRCUMFERENCE, 6);
    });

    it.each([
      [50, CIRCUMFERENCE * 0.5],
      [100, 0],
      [120, 0],
    ])('sets the dashoffset for %s%%', (value, expected) => {
      const { container } = render(<ProgressCircle value={value} />);
      expect(Number(arcOf(container).getAttribute('stroke-dashoffset'))).toBeCloseTo(expected, 6);
    });

    it('accepts numeric strings', () => {
      const { container } = render(<ProgressCircle value="45" />);
      expect(Number(arcOf(container).getAttribute('stroke-dashoffset')))
        .toBeCloseTo(CIRCUMFERENCE * 0.55, 6);
      expect(screen.getByText('45%')).toBeInTheDocument();
    });
  });

  describe('no arc', () => {
    it.each([[0], [-10], [NaN], ['abc'], [undefined]])('renders only the track for %s', (value) => {
      const { container } = render(<ProgressCircle value={value} />);
      expect(arcOf(container)).toBeNull();
      expect(container.querySelectorAll('circle')).toHaveLength(1);
      expect(container.querySelector('circle')).toHaveClass('stroke-border');
    });
  });

  describe('tones', () => {
    it('label is foreground at 0 (no arc)', () => {
      const { container } = render(<ProgressCircle value={0} />);
      expect(screen.getByText('0%')).toHaveClass('text-foreground');
      expect(arcOf(container)).toBeNull();
    });

    it.each([[1], [50], [99]])('uses foreground arc and label at %s%%', (value) => {
      const { container } = render(<ProgressCircle value={value} />);
      expect(arcOf(container)).toHaveClass('stroke-foreground');
      expect(screen.getByText(`${value}%`)).toHaveClass('text-foreground');
    });

    it.each([[100], [120]])('label is foreground and arc is green at %s%%', (value) => {
      const { container } = render(<ProgressCircle value={value} />);
      expect(arcOf(container)).toHaveClass('stroke-[hsl(var(--status-done-badge))]');
      expect(screen.getByText(`${value}%`)).toHaveClass('text-foreground');
    });

    it.each([[0], [0.4], [1], [50], [99], [100], [120], [NaN], [-10]])(
      'label is always text-foreground and never muted/success/warning for %s',
      (value) => {
        const { container } = render(<ProgressCircle value={value} />);
        const label = container.querySelector('span > span');
        expect(label).toHaveClass('text-foreground');
        expect(label).not.toHaveClass('text-muted-foreground');
        expect(label).not.toHaveClass('text-status-success-foreground');
        expect(label).not.toHaveClass('text-status-warning-foreground');
      },
    );
  });

  describe('accessibility and labeling', () => {
    it('marks the svg aria-hidden', () => {
      const { container } = render(<ProgressCircle value={30} />);
      expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    });

    it('renders the label beside the svg (not inside) with the real value', () => {
      const { container } = render(<ProgressCircle value={120} />);
      const label = screen.getByText('120%');
      expect(label).toBeInTheDocument();
      expect(container.querySelector('svg').contains(label)).toBe(false);
    });

    it('treats NaN as 0%', () => {
      render(<ProgressCircle value={NaN} />);
      expect(screen.getByText('0%')).toBeInTheDocument();
    });
  });

  describe('test ids', () => {
    it('defaults to ProgressCircle', () => {
      render(<ProgressCircle value={10} />);
      expect(screen.getByTestId('ProgressCircle')).toBeInTheDocument();
      expect(screen.getByTestId('ProgressCircle-arc')).toBeInTheDocument();
    });

    it('derives the arc id from a custom data-testid', () => {
      render(<ProgressCircle value={10} data-testid="delivery" />);
      expect(screen.getByTestId('delivery')).toBeInTheDocument();
      expect(screen.getByTestId('delivery-arc')).toBeInTheDocument();
    });
  });
});
