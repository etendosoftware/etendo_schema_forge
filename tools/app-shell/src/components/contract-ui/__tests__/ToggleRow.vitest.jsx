import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ToggleRow } from '../ToggleRow.jsx';

describe('ToggleRow', () => {
  it('renders the label, caption and switch', () => {
    render(
      <ToggleRow
        label="Centro de coste"
        caption="Obligatorio · Facturas y asientos"
        checked
        data-testid="tr"
      />,
    );
    expect(screen.getByText('Centro de coste')).toBeInTheDocument();
    expect(screen.getByText('Obligatorio · Facturas y asientos')).toBeInTheDocument();
    expect(screen.getByTestId('tr-switch')).toBeInTheDocument();
  });

  it('reflects the checked state on the switch', () => {
    render(<ToggleRow label="On" checked data-testid="tr" />);
    expect(screen.getByTestId('tr-switch')).toBeChecked();
  });

  it('reflects the unchecked state on the switch', () => {
    render(<ToggleRow label="Off" checked={false} data-testid="tr" />);
    expect(screen.getByTestId('tr-switch')).not.toBeChecked();
  });

  it('renders the optional hint node next to the label', () => {
    render(
      <ToggleRow
        label="Conciliación automática"
        hint={<span data-testid="unbacked-marker">marker</span>}
        checked
        data-testid="tr"
      />,
    );
    const root = screen.getByTestId('tr');
    expect(within(root).getByTestId('unbacked-marker')).toBeInTheDocument();
  });

  it('calls onCheckedChange with the new value when toggled', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <ToggleRow
        label="Asientos en periodos cerrados"
        checked={false}
        onCheckedChange={onCheckedChange}
        data-testid="tr"
      />,
    );
    await user.click(screen.getByTestId('tr-switch'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('does not fire onCheckedChange when disabled', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <ToggleRow
        label="Mandatory dimension"
        checked
        disabled
        onCheckedChange={onCheckedChange}
        data-testid="tr"
      />,
    );
    await user.click(screen.getByTestId('tr-switch'));
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('tr-switch')).toBeDisabled();
  });

  // ETP-4879: the shared Switch's disabled look used to be a blanket
  // `disabled:opacity-50` over `bg-primary`/`bg-input`, deriving the
  // disabled-checked colour by opacity math and landing on the wrong shade.
  // ETP-5120 went further and pinned ALL 4 track states (not just the two
  // disabled ones) to deliberate, theme-aware CSS custom properties, so even
  // the enabled off/on tracks no longer come from Tailwind's default
  // `bg-input`/`bg-primary`. jsdom does not compute real CSS pixel colors, so
  // these assertions target the className/data-state/disabled attribute
  // combinations that drive the fix instead of computed `rgb()` output.
  describe('4-state disabled/enabled visual distinction (ETP-4879 / ETP-5120)', () => {
    it('off + enabled: keeps the base unchecked-track class, no disabled attribute', () => {
      render(<ToggleRow label="Off enabled" checked={false} data-testid="tr" />);
      const el = screen.getByTestId('tr-switch');
      expect(el).not.toBeDisabled();
      expect(el).toHaveAttribute('data-state', 'unchecked');
      expect(el.className).toContain('data-[state=unchecked]:bg-[hsl(var(--switch-track-off-enabled))]');
    });

    it('on + enabled: keeps the base checked-track class, no disabled attribute', () => {
      render(<ToggleRow label="On enabled" checked data-testid="tr" />);
      const el = screen.getByTestId('tr-switch');
      expect(el).not.toBeDisabled();
      expect(el).toHaveAttribute('data-state', 'checked');
      expect(el.className).toContain('data-[state=checked]:bg-[hsl(var(--switch-track-on-enabled))]');
    });

    it('off + disabled: carries the explicit off-disabled track colour and cancels the old opacity dimming', () => {
      render(<ToggleRow label="Off disabled" checked={false} disabled data-testid="tr" />);
      const el = screen.getByTestId('tr-switch');
      expect(el).toBeDisabled();
      expect(el).toHaveAttribute('data-state', 'unchecked');
      expect(el.className).toContain(
        'disabled:data-[state=unchecked]:bg-[hsl(var(--switch-track-off-disabled))]',
      );
      // Cancels the shared Switch primitive's blanket disabled:opacity-50.
      expect(el.className).toContain('disabled:opacity-100');
      expect(el.className).not.toContain('opacity-50');
    });

    it('on + disabled: carries the explicit on-disabled track colour and cancels the old opacity dimming', () => {
      render(<ToggleRow label="On disabled" checked disabled data-testid="tr" />);
      const el = screen.getByTestId('tr-switch');
      expect(el).toBeDisabled();
      expect(el).toHaveAttribute('data-state', 'checked');
      expect(el.className).toContain(
        'disabled:data-[state=checked]:bg-[hsl(var(--switch-track-on-disabled))]',
      );
      expect(el.className).toContain('disabled:opacity-100');
      expect(el.className).not.toContain('opacity-50');
    });

    it('off + enabled and on + enabled carry the new ETP-5120 enabled-track overrides', () => {
      render(<ToggleRow label="Off enabled" checked={false} data-testid="off" />);
      render(<ToggleRow label="On enabled" checked data-testid="on" />);
      const offClass = screen.getByTestId('off-switch').className;
      const onClass = screen.getByTestId('on-switch').className;
      // ETP-5120: the enabled-state base classes are now explicit overrides too,
      // not the Tailwind default bg-input/bg-primary.
      expect(offClass).toContain('data-[state=unchecked]:bg-[hsl(var(--switch-track-off-enabled))]');
      expect(onClass).toContain('data-[state=checked]:bg-[hsl(var(--switch-track-on-enabled))]');
      // Only the disabled-prefixed utilities were added by ETP-4879; the
      // enabled-state base classes are identical across both rows.
      expect(offClass).toContain('disabled:opacity-100');
      expect(onClass).toContain('disabled:opacity-100');
    });

    it('the 4 states are mutually distinguishable by (checked, disabled) attribute combination', () => {
      const cases = [
        { name: 'off-enabled', checked: false, disabled: false },
        { name: 'off-disabled', checked: false, disabled: true },
        { name: 'on-enabled', checked: true, disabled: false },
        { name: 'on-disabled', checked: true, disabled: true },
      ];
      const seen = new Set();
      for (const { name, checked, disabled } of cases) {
        render(
          <ToggleRow label={name} checked={checked} disabled={disabled} data-testid={name} />,
        );
        const el = screen.getByTestId(`${name}-switch`);
        const state = el.getAttribute('data-state');
        const isDisabled = el.disabled;
        expect(state).toBe(checked ? 'checked' : 'unchecked');
        expect(isDisabled).toBe(disabled);
        seen.add(`${state}:${isDisabled}`);
      }
      // All 4 (data-state, disabled) combinations must be distinct.
      expect(seen.size).toBe(4);
    });

    it('applies the disabled-track fix classes even when checked/disabled are omitted '
      + '(component defaults, not explicit false)', () => {
      // ToggleRow destructures `checked = false, disabled = false` — this exercises
      // that default-parameter path directly, distinct from passing `checked={false}`
      // explicitly (already covered by the "off + enabled" case above).
      render(<ToggleRow label="Defaults only" data-testid="tr" />);
      const el = screen.getByTestId('tr-switch');
      expect(el).not.toBeDisabled();
      expect(el).toHaveAttribute('data-state', 'unchecked');
      expect(el.className).toContain('data-[state=unchecked]:bg-[hsl(var(--switch-track-off-enabled))]');
      expect(el.className).toContain('disabled:opacity-100');
      expect(el.className).toContain(
        'disabled:data-[state=unchecked]:bg-[hsl(var(--switch-track-off-disabled))]',
      );
      expect(el.className).toContain(
        'disabled:data-[state=checked]:bg-[hsl(var(--switch-track-on-disabled))]',
      );
    });

    it('carries no stale classes/attributes across rapid checked/disabled transitions', () => {
      // The className is a static string recomputed from props on every render (not
      // imperatively mutated via classList), so there is no architectural way for a
      // previous state's class to survive — this proves it empirically across a
      // sequence that flips both checked and disabled, including simultaneously.
      const { rerender } = render(
        <ToggleRow label="Transition" checked={false} disabled={false} data-testid="tr" />,
      );
      const el = screen.getByTestId('tr-switch');

      rerender(<ToggleRow label="Transition" checked disabled={false} data-testid="tr" />);
      expect(el).toHaveAttribute('data-state', 'checked');
      expect(el).not.toBeDisabled();
      expect(el.className).not.toContain('opacity-50');

      rerender(<ToggleRow label="Transition" checked disabled data-testid="tr" />);
      expect(el).toHaveAttribute('data-state', 'checked');
      expect(el).toBeDisabled();
      expect(el.className).toContain(
        'disabled:data-[state=checked]:bg-[hsl(var(--switch-track-on-disabled))]',
      );

      // Flip checked and disabled in the same rerender (simulates a bulk state update
      // landing in one React commit rather than two separate prop changes).
      rerender(<ToggleRow label="Transition" checked={false} disabled={false} data-testid="tr" />);
      expect(el).toHaveAttribute('data-state', 'unchecked');
      expect(el).not.toBeDisabled();
      expect(el.className).not.toContain('opacity-50');
      expect(el.className).toContain('data-[state=unchecked]:bg-[hsl(var(--switch-track-off-enabled))]');

      rerender(<ToggleRow label="Transition" checked={false} disabled data-testid="tr" />);
      expect(el).toHaveAttribute('data-state', 'unchecked');
      expect(el).toBeDisabled();
      expect(el.className).toContain(
        'disabled:data-[state=unchecked]:bg-[hsl(var(--switch-track-off-disabled))]',
      );
      // The two disabled-track classes are mutually exclusive selectors (gated by
      // data-[state=]), so both may legally be present in the class string at once —
      // what matters is the live data-state/disabled attributes, asserted above.
    });
  });
});
