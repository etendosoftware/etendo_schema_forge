import { render, screen, fireEvent } from '@testing-library/react';
import { SquareCheckbox } from '../SquareCheckbox.jsx';

describe('SquareCheckbox', () => {
  it('renders the label', () => {
    render(<SquareCheckbox label="Shipping Address" checked={false} onChange={vi.fn()} />);
    expect(screen.getByText('Shipping Address')).toBeInTheDocument();
  });

  it('does NOT render the checkmark SVG when unchecked', () => {
    const { container } = render(<SquareCheckbox label="X" checked={false} onChange={vi.fn()} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders the checkmark polyline SVG when checked', () => {
    const { container } = render(<SquareCheckbox label="X" checked onChange={vi.fn()} />);
    const polyline = container.querySelector('svg polyline');
    expect(polyline).not.toBeNull();
    expect(polyline.getAttribute('points')).toBe('20 6 9 17 4 12');
  });

  it('fires onChange with the BOOLEAN (not the event) when toggled', () => {
    const onChange = vi.fn();
    render(<SquareCheckbox label="X" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reflects the checked prop on the underlying input', () => {
    const { rerender } = render(<SquareCheckbox label="X" checked={false} onChange={vi.fn()} />);
    expect(screen.getByRole('checkbox').checked).toBe(false);
    rerender(<SquareCheckbox label="X" checked onChange={vi.fn()} />);
    expect(screen.getByRole('checkbox').checked).toBe(true);
  });

  it('forwards ...rest (data-testid, aria-label) onto the input', () => {
    render(
      <SquareCheckbox label="X" checked={false} onChange={vi.fn()} data-testid="cb-x" aria-label="Toggle X" />,
    );
    const input = screen.getByTestId('cb-x');
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveAttribute('aria-label', 'Toggle X');
  });
});
