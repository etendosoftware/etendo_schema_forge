// @covers tools/app-shell/src/components/ui/date-time-field.jsx

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: vi.fn() }),
}));

import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateTimeField } from '../date-time-field.jsx';

const T = 'dtf';

function Controlled({ initial = '', onChange, ...props }) {
  const [value, setValue] = useState(initial);
  return (
    <DateTimeField
      value={value}
      onChange={(next) => { onChange(next); setValue(next); }}
      data-testid={T}
      {...props} />
  );
}

describe('DateTimeField', () => {
  it('shows the wall-clock value as dd/MM/yyyy HH:mm', () => {
    render(<Controlled initial="2026-11-19T14:20:00" onChange={vi.fn()} />);
    expect(screen.getByTestId(T)).toHaveValue('19/11/2026 14:20');
  });

  it('typing a real day and time commits the wall clock on blur', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const input = screen.getByTestId(T);

    await user.type(input, '191120261420');
    expect(input).toHaveValue('19/11/2026 14:20');
    await user.tab();

    expect(onChange).toHaveBeenLastCalledWith('2026-11-19T14:20:00');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it.each([
    ['Enter', (user) => user.keyboard('{Enter}')],
    ['blur (Tab)', (user) => user.tab()],
  ])('%s on a day that does not exist commits null and keeps the text flagged', async (_how, leave) => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial="2026-11-19T14:20:00" onChange={onChange} />);
    const input = screen.getByTestId(T);

    await user.clear(input);
    await user.type(input, '310220261000');
    await leave(user);

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(input).toHaveValue('31/02/2026 10:00');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('Ahora sets the max minute and Limpiar empties the field', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} max="2026-11-20T10:05:30" />);

    await user.click(screen.getByTestId(`${T}-trigger`));
    await user.click(await screen.findByRole('button', { name: 'dateTimeFieldNow' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-11-20T10:05:00');
    expect(screen.getByTestId(T)).toHaveValue('20/11/2026 10:05');

    await user.click(screen.getByTestId(`${T}-trigger`));
    await user.click(await screen.findByRole('button', { name: 'clear' }));
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(screen.getByTestId(T)).toHaveValue('');
  });

  it('flags a value later than max without changing it', () => {
    const onChange = vi.fn();
    render(<Controlled initial="2026-11-20T10:06:00" max="2026-11-20T10:05:00" onChange={onChange} />);
    expect(screen.getByTestId(T)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId(T)).toHaveValue('20/11/2026 10:06');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('read-only: no popover trigger, the placeholder stands for an empty value', () => {
    render(<DateTimeField value={null} readOnly placeholder="convRateOpenEnd" data-testid={T} />);
    expect(screen.getByTestId(`${T}-trigger`)).toBeDisabled();
    expect(screen.getByTestId(T)).toHaveAttribute('placeholder', 'convRateOpenEnd');
  });
});
