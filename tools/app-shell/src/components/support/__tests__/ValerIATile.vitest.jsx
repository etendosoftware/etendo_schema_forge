import { render } from '@testing-library/react';
import { ValerIATile } from '../ValerIATile.jsx';

describe('ValerIATile', () => {
  it('renders an svg logo', () => {
    const { container } = render(<ValerIATile />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('defaults to a 32px size and 8px radius', () => {
    const { container } = render(<ValerIATile />);
    const tile = container.firstChild;
    expect(tile.style.width).toBe('32px');
    expect(tile.style.height).toBe('32px');
    expect(tile.style.borderRadius).toBe('8px');
  });

  it('applies a custom size and radius', () => {
    const { container } = render(<ValerIATile size={20} radius={999} />);
    const tile = container.firstChild;
    expect(tile.style.width).toBe('20px');
    expect(tile.style.height).toBe('20px');
    expect(tile.style.borderRadius).toBe('999px');
  });

  it('scales the inner icon to half the tile size', () => {
    const { container } = render(<ValerIATile size={40} />);
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('20');
    expect(svg.getAttribute('height')).toBe('20');
  });
});
