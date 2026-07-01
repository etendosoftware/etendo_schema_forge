import { render, screen, fireEvent } from '@testing-library/react';
import { PillToggle } from '../PillToggle.jsx';

describe('PillToggle', () => {
  it('renders a switch button', () => {
    render(<PillToggle checked={false} onCheckedChange={() => {}} />);
    expect(screen.getByRole('switch')).toBeTruthy();
  });

  it('aria-checked is true when checked=true', () => {
    render(<PillToggle checked={true} onCheckedChange={() => {}} />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('aria-checked is true when checked="Y"', () => {
    render(<PillToggle checked="Y" onCheckedChange={() => {}} />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('aria-checked is true when checked="true"', () => {
    render(<PillToggle checked="true" onCheckedChange={() => {}} />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('aria-checked is false when checked=false', () => {
    render(<PillToggle checked={false} onCheckedChange={() => {}} />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });

  it('calls onCheckedChange with toggled value on click', () => {
    const onChange = vi.fn();
    render(<PillToggle checked={false} onCheckedChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('calls onCheckedChange with false when currently on', () => {
    const onChange = vi.fn();
    render(<PillToggle checked={true} onCheckedChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('does not call onCheckedChange when disabled', () => {
    const onChange = vi.fn();
    render(<PillToggle checked={false} onCheckedChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies on style when checked', () => {
    const { container } = render(<PillToggle checked={true} onCheckedChange={() => {}} />);
    expect(container.firstChild.className).toContain('bg-[#121217]');
  });

  it('applies off style when unchecked', () => {
    const { container } = render(<PillToggle checked={false} onCheckedChange={() => {}} />);
    expect(container.firstChild.className).toContain('bg-[#D1D1DB]');
  });

  it('applies disabled opacity when disabled', () => {
    const { container } = render(<PillToggle checked={false} onCheckedChange={() => {}} disabled />);
    expect(container.firstChild.className).toContain('opacity-60');
  });

  it('passes extra className to button', () => {
    const { container } = render(<PillToggle checked={false} onCheckedChange={() => {}} className="my-class" />);
    expect(container.firstChild.className).toContain('my-class');
  });
});
