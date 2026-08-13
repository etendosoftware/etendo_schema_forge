import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => {
    const map = {
      financeAccountMovementsFilterAmountAll: 'Cualquier importe',
      financeAccountMovementsFilterAmountInflows: 'Solo entradas',
      financeAccountMovementsFilterAmountOutflows: 'Solo salidas',
      financeAccountMovementsFilterAmountManualRange: 'Rango manual',
      financeAccountMovementsFilterAmountMin: 'Mínimo',
      financeAccountMovementsFilterAmountMax: 'Máximo',
      financeAccountMovementsFilterAmountClear: 'Limpiar',
      financeAccountMovementsFilterAmountInvalidRange: 'Rango inválido',
      dateRangeApply: 'Aplicar',
      dateRangeCancel: 'Cancelar',
    };
    return map[key] ?? key;
  },
}));

import { AmountFilter } from '../AmountFilter.jsx';

async function openPopover(user) {
  // Trigger is the first button on the page.
  await user.click(screen.getAllByRole('button')[0]);
}

describe('AmountFilter — trigger label', () => {
  it('shows "Cualquier importe" when value is null', () => {
    render(<AmountFilter value={null} onChange={vi.fn()} />);
    // Both the trigger and (eventually) the "all" row share this label;
    // the trigger is the first button.
    const trigger = screen.getAllByRole('button')[0];
    expect(trigger).toHaveTextContent('Cualquier importe');
  });

  it('shows the preset label when value has a presetId', () => {
    render(<AmountFilter value={{ presetId: 'gt0' }} onChange={vi.fn()} />);
    expect(screen.getAllByRole('button')[0]).toHaveTextContent('Solo entradas');
  });

  it('shows "≥ X €" when only min is set', () => {
    render(<AmountFilter value={{ min: 100, max: null }} onChange={vi.fn()} />);
    expect(screen.getAllByRole('button')[0].textContent).toMatch(/≥/);
    expect(screen.getAllByRole('button')[0].textContent).toContain('100');
  });

  it('shows "≤ X €" when only max is set', () => {
    render(<AmountFilter value={{ min: null, max: 500 }} onChange={vi.fn()} />);
    expect(screen.getAllByRole('button')[0].textContent).toMatch(/≤/);
    expect(screen.getAllByRole('button')[0].textContent).toContain('500');
  });

  it('shows "min – max" when both bounds are set', () => {
    render(<AmountFilter value={{ min: 100, max: 500 }} onChange={vi.fn()} />);
    const text = screen.getAllByRole('button')[0].textContent;
    expect(text).toContain('100');
    expect(text).toContain('500');
    expect(text).toContain('–');
  });
});

describe('AmountFilter — preset selection', () => {
  it('emits { presetId: "gt0" } when "Solo entradas" is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AmountFilter value={null} onChange={onChange} />);

    await openPopover(user);
    fireEvent.click(screen.getByText('Solo entradas'));
    expect(onChange).toHaveBeenCalledWith({ presetId: 'gt0' });
  });

  it('emits null when "Cualquier importe" row is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AmountFilter value={{ presetId: 'gt0' }} onChange={onChange} />);

    await openPopover(user);
    // Two nodes share the text (trigger + popover row); click the popover one.
    const matches = screen.getAllByText('Cualquier importe');
    fireEvent.click(matches[matches.length - 1]);
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe('AmountFilter — manual range', () => {
  it('keeps Apply disabled when both inputs are empty', async () => {
    const user = userEvent.setup();
    render(<AmountFilter value={null} onChange={vi.fn()} />);
    await openPopover(user);

    const applyBtn = screen.getByText('Aplicar').closest('button');
    expect(applyBtn).toBeDisabled();
  });

  it('enables Apply once at least one input has a valid number', async () => {
    const user = userEvent.setup();
    render(<AmountFilter value={null} onChange={vi.fn()} />);
    await openPopover(user);

    const minInput = screen.getByPlaceholderText('Mínimo');
    fireEvent.change(minInput, { target: { value: '50' } });

    const applyBtn = screen.getByText('Aplicar').closest('button');
    expect(applyBtn).not.toBeDisabled();
  });

  it('shows the invalid-range message when min > max, and disables Apply', async () => {
    const user = userEvent.setup();
    render(<AmountFilter value={null} onChange={vi.fn()} />);
    await openPopover(user);

    fireEvent.change(screen.getByPlaceholderText('Mínimo'), { target: { value: '200' } });
    fireEvent.change(screen.getByPlaceholderText('Máximo'), { target: { value: '100' } });

    expect(screen.getByText('Rango inválido')).toBeInTheDocument();
    const applyBtn = screen.getByText('Aplicar').closest('button');
    expect(applyBtn).toBeDisabled();
  });

  it('emits { min, max } with parsed numbers when Apply is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AmountFilter value={null} onChange={onChange} />);
    await openPopover(user);

    fireEvent.change(screen.getByPlaceholderText('Mínimo'), { target: { value: '50' } });
    fireEvent.change(screen.getByPlaceholderText('Máximo'), { target: { value: '500' } });

    fireEvent.click(screen.getByText('Aplicar'));
    expect(onChange).toHaveBeenCalledWith({ min: 50, max: 500 });
  });

  it('emits { min: 25, max: null } when only the min input is filled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AmountFilter value={null} onChange={onChange} />);
    await openPopover(user);

    fireEvent.change(screen.getByPlaceholderText('Mínimo'), { target: { value: '25' } });
    fireEvent.click(screen.getByText('Aplicar'));
    expect(onChange).toHaveBeenCalledWith({ min: 25, max: null });
  });

  it('Cancel button closes the popover without calling onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AmountFilter value={null} onChange={onChange} />);
    await openPopover(user);

    fireEvent.click(screen.getByText('Cancelar'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
