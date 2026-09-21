import { render, screen, fireEvent } from '@testing-library/react';
import { CheckboxField } from '../CheckboxField.jsx';

// Regression coverage for the bug this component was extracted to fix: the
// shared `Checkbox` collapsed checked+disabled to the SAME `bg-muted
// text-text-disabled` classes as unchecked+disabled, with a hardcoded white
// checkmark stroke — so a disabled checked field (e.g. "rectificativa" on a
// completed declaration) rendered with an invisible checkmark and looked
// unchecked even though the value was `true`. `CheckboxField` must dim via
// `disabled:opacity-50` instead of a color-collapse, keeping the checkmark
// visible at every disabled state.
describe('CheckboxField', () => {
  describe('checked+disabled visual contract (regression pin)', () => {
    it('renders the checkmark SVG when checked AND disabled', () => {
      const { container } = render(
        <CheckboxField id="cb" checked disabled onToggle={vi.fn()} />,
      );
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      const polyline = container.querySelector('svg polyline');
      expect(polyline).not.toBeNull();
      expect(polyline.getAttribute('points')).toBe('20 6 9 17 4 12');
    });

    it('uses currentColor for the checkmark stroke, not a hardcoded white', () => {
      const { container } = render(
        <CheckboxField id="cb" checked disabled onToggle={vi.fn()} />,
      );
      const svg = container.querySelector('svg');
      expect(svg.getAttribute('stroke')).toBe('currentColor');
    });

    it('dims the checked+disabled control via opacity, not a color-collapse', () => {
      render(<CheckboxField id="cb" checked disabled onToggle={vi.fn()} />);
      const button = screen.getByRole('checkbox');
      expect(button.className).toContain('disabled:opacity-50');
      // The checked background/border classes must still be present — the bug
      // this replaces swapped them out for `bg-muted text-text-disabled`.
      expect(button.className).toContain('bg-primary');
      expect(button.className).toContain('text-primary-foreground');
      expect(button.className).not.toContain('bg-muted');
      expect(button.className).not.toContain('text-text-disabled');
    });

    it('checked+disabled classes DIFFER from unchecked+disabled classes', () => {
      const { rerender } = render(
        <CheckboxField id="cb" checked disabled onToggle={vi.fn()} />,
      );
      const checkedDisabledClass = screen.getByRole('checkbox').className;

      rerender(<CheckboxField id="cb" checked={false} disabled onToggle={vi.fn()} />);
      const uncheckedDisabledClass = screen.getByRole('checkbox').className;

      expect(checkedDisabledClass).not.toBe(uncheckedDisabledClass);
    });

    it('does NOT render a checkmark when unchecked+disabled', () => {
      const { container } = render(
        <CheckboxField id="cb" checked={false} disabled onToggle={vi.fn()} />,
      );
      expect(container.querySelector('svg')).toBeNull();
    });

    it('renders the checkmark when checked+enabled, with normal (non-dimmed) opacity class present but inactive by default', () => {
      const { container } = render(
        <CheckboxField id="cb" checked disabled={false} onToggle={vi.fn()} />,
      );
      const button = screen.getByRole('checkbox');
      expect(container.querySelector('svg polyline')).not.toBeNull();
      expect(button.className).toContain('bg-primary');
      expect(button).not.toBeDisabled();
    });

    it('exposes aria-checked correctly across all 4 states', () => {
      const { rerender } = render(
        <CheckboxField id="cb" checked disabled onToggle={vi.fn()} />,
      );
      expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');

      rerender(<CheckboxField id="cb" checked={false} disabled onToggle={vi.fn()} />);
      expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');

      rerender(<CheckboxField id="cb" checked disabled={false} onToggle={vi.fn()} />);
      expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');

      rerender(<CheckboxField id="cb" checked={false} disabled={false} onToggle={vi.fn()} />);
      expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
    });
  });

  describe('interaction', () => {
    it('calls onToggle with the flipped boolean when enabled and clicked', () => {
      const onToggle = vi.fn();
      render(<CheckboxField id="cb" checked={false} disabled={false} onToggle={onToggle} />);
      fireEvent.click(screen.getByRole('checkbox'));
      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(onToggle).toHaveBeenCalledWith(true);
    });

    it('calls onToggle(false) when toggling a checked+enabled control', () => {
      const onToggle = vi.fn();
      render(<CheckboxField id="cb" checked disabled={false} onToggle={onToggle} />);
      fireEvent.click(screen.getByRole('checkbox'));
      expect(onToggle).toHaveBeenCalledWith(false);
    });

    it('does NOT call onToggle when disabled', () => {
      const onToggle = vi.fn();
      render(<CheckboxField id="cb" checked={false} disabled onToggle={onToggle} />);
      fireEvent.click(screen.getByRole('checkbox'));
      expect(onToggle).not.toHaveBeenCalled();
    });

    it('the native button disabled attribute blocks the click from firing onClick logic', () => {
      const onToggle = vi.fn();
      render(<CheckboxField id="cb" checked disabled onToggle={onToggle} />);
      expect(screen.getByRole('checkbox')).toBeDisabled();
      fireEvent.click(screen.getByRole('checkbox'));
      expect(onToggle).not.toHaveBeenCalled();
    });

    it('invokes the extra onClick callback (in addition to onToggle) when enabled', () => {
      const onClick = vi.fn();
      const onToggle = vi.fn();
      render(<CheckboxField id="cb" checked={false} onClick={onClick} onToggle={onToggle} />);
      fireEvent.click(screen.getByRole('checkbox'));
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onToggle).toHaveBeenCalledWith(true);
    });

    it('does not double-fire or throw on rapid repeated clicks while checked stays fixed (no internal state to race)', () => {
      // CheckboxField is stateless: it derives the toggle value from the `checked`
      // prop on every click, it does not track its own state. If a caller never
      // re-renders with the flipped value (e.g. a slow parent update), N rapid
      // clicks call onToggle N times with the SAME flipped value, not a
      // alternating/duplicated one — there is no internal mutable state to race.
      const onToggle = vi.fn();
      render(<CheckboxField id="cb" checked={false} onToggle={onToggle} />);
      const button = screen.getByRole('checkbox');
      expect(() => {
        fireEvent.click(button);
        fireEvent.click(button);
        fireEvent.click(button);
      }).not.toThrow();
      expect(onToggle).toHaveBeenCalledTimes(3);
      onToggle.mock.calls.forEach(call => expect(call).toEqual([true]));
    });

    it('rapid clicks correctly alternate onToggle values when the parent re-renders with the flipped checked prop each time', () => {
      const onToggle = vi.fn();
      const { rerender } = render(<CheckboxField id="cb" checked={false} onToggle={onToggle} />);
      const click = () => fireEvent.click(screen.getByRole('checkbox'));

      click();
      expect(onToggle).toHaveBeenNthCalledWith(1, true);
      rerender(<CheckboxField id="cb" checked onToggle={onToggle} />);

      click();
      expect(onToggle).toHaveBeenNthCalledWith(2, false);
      rerender(<CheckboxField id="cb" checked={false} onToggle={onToggle} />);

      click();
      expect(onToggle).toHaveBeenNthCalledWith(3, true);
      expect(onToggle).toHaveBeenCalledTimes(3);
    });
  });

  describe('props contract', () => {
    it('forwards id onto the button', () => {
      render(<CheckboxField id="cb-rectificativa" checked={false} onToggle={vi.fn()} />);
      expect(screen.getByRole('checkbox')).toHaveAttribute('id', 'cb-rectificativa');
    });

    it('forwards ...rest (data-testid, aria-label) onto the button', () => {
      render(
        <CheckboxField
          id="cb"
          checked={false}
          onToggle={vi.fn()}
          data-testid="cb-x"
          aria-label="Toggle X"
        />,
      );
      const button = screen.getByTestId('cb-x');
      expect(button.tagName).toBe('BUTTON');
      expect(button).toHaveAttribute('aria-label', 'Toggle X');
    });

    it('merges a custom className with the base classes', () => {
      render(<CheckboxField id="cb" checked={false} onToggle={vi.fn()} className="my-extra" />);
      expect(screen.getByRole('checkbox').className).toContain('my-extra');
    });
  });
});
