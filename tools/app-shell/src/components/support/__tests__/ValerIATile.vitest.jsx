import { render } from '@testing-library/react';
import { ValerIATile } from '../ValerIATile.jsx';

describe('ValerIATile', () => {
  it('renders the official Etendo AI logo', () => {
    const { container } = render(<ValerIATile />);
    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('src')).toBe('/logo-etendo-ai.png');
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

  it('fills the tile at any size via object-fit: cover', () => {
    const { container } = render(<ValerIATile size={40} />);
    const img = container.querySelector('img');
    expect(img.style.width).toBe('100%');
    expect(img.style.height).toBe('100%');
    expect(img.style.objectFit).toBe('cover');
  });
});
