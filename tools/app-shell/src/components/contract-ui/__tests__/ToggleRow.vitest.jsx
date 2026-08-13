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
});
