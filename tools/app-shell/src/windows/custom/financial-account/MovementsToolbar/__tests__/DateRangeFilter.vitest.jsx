import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DateRangeFilter } from '../DateRangeFilter';

vi.mock('@/i18n', () => ({ useUI: () => (k) => k, useLocaleSwitch: () => ({ locale: 'es_ES' }) }));
vi.mock('@/components/ui/date-range-popover', () => ({
  DateRangePopover: ({ placeholder, value, onChange }) => (
    <button type="button" data-testid="date-range-popover" onClick={() => onChange(null)}>
      {placeholder ?? 'picker'}
    </button>
  ),
}));

describe('DateRangeFilter', () => {
  it('renders the DateRangePopover with the anyTime placeholder', () => {
    render(<DateRangeFilter value={null} onChange={() => {}} />);
    expect(screen.getByTestId('date-range-popover')).toBeDefined();
    expect(screen.getByText('dateRangeAnyTime')).toBeDefined();
  });

  it('forwards onChange to DateRangePopover', () => {
    const onChange = vi.fn();
    render(<DateRangeFilter value={null} onChange={onChange} />);
    screen.getByTestId('date-range-popover').click();
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
