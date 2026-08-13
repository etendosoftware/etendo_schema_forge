import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TypeFilter } from '../TypeFilter';

vi.mock('@/i18n', () => ({ useUI: () => (k) => k }));
vi.mock('@/components/ui/distinct-values-filter', () => ({
  DistinctValuesFilter: ({ allLabel, codes, onChange }) => (
    <div data-testid="distinct-filter">
      <span>{allLabel}</span>
      <span data-testid="code-count">{codes.length}</span>
      <button type="button" onClick={() => onChange('BPD')}>select-bpd</button>
    </div>
  ),
}));

describe('TypeFilter', () => {
  it('renders DistinctValuesFilter with exactly 2 type codes (BPD, BPW)', () => {
    render(<TypeFilter value={null} onChange={() => {}} />);
    expect(screen.getByTestId('distinct-filter')).toBeDefined();
    expect(screen.getByTestId('code-count').textContent).toBe('2');
  });

  it('uses the anyType i18n key as allLabel', () => {
    render(<TypeFilter value={null} onChange={() => {}} />);
    expect(screen.getByText('financeAccountMovementsFilterTypeAll')).toBeDefined();
  });

  it('forwards onChange when a code is selected', () => {
    const onChange = vi.fn();
    render(<TypeFilter value={null} onChange={onChange} />);
    screen.getByRole('button', { name: 'select-bpd' }).click();
    expect(onChange).toHaveBeenCalledWith('BPD');
  });
});
