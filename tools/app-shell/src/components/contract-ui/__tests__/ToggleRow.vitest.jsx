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
  // ToggleRow now cancels that dimming (`disabled:opacity-100`) and supplies
  // two deliberate, theme-aware disabled-track colours via CSS custom
  // properties. jsdom does not compute real CSS pixel colors, so these
  // assertions target the className/data-state/disabled attribute
  // combinations that drive the fix instead of computed `rgb()` output.
  describe('4-state disabled/enabled visual distinction (ETP-4879)', () => {
    it('off + enabled: keeps the base unchecked-track class, no disabled attribute', () => {
      render(<ToggleRow label="Off enabled" checked={false} data-testid="tr" />);
      const el = screen.getByTestId('tr-switch');
      expect(el).not.toBeDisabled();
      expect(el).toHaveAttribute('data-state', 'unchecked');
      expect(el.className).toContain('data-[state=unchecked]:bg-input');
    });

    it('on + enabled: keeps the base checked-track class, no disabled attribute', () => {
      render(<ToggleRow label="On enabled" checked data-testid="tr" />);
      const el = screen.getByTestId('tr-switch');
      expect(el).not.toBeDisabled();
      expect(el).toHaveAttribute('data-state', 'checked');
      expect(el.className).toContain('data-[state=checked]:bg-primary');
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

    it('does not regress the two already-correct enabled states with unexpected new classes', () => {
      render(<ToggleRow label="Off enabled" checked={false} data-testid="off" />);
      render(<ToggleRow label="On enabled" checked data-testid="on" />);
      const offClass = screen.getByTestId('off-switch').className;
      const onClass = screen.getByTestId('on-switch').className;
      // The base track classes for the enabled states are untouched by the fix.
      expect(offClass).toContain('data-[state=unchecked]:bg-input');
      expect(onClass).toContain('data-[state=checked]:bg-primary');
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
  });
});
