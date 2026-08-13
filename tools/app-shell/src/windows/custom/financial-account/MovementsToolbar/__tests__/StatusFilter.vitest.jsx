import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusFilter } from '../StatusFilter';

vi.mock('@/i18n', () => ({ useUI: () => (k) => k }));
vi.mock('@/components/ui/distinct-values-filter', () => ({
  DistinctValuesFilter: ({ allLabel, value, onChange, codes }) => (
    <div data-testid="distinct-filter">
      <span>{allLabel}</span>
      <span data-testid="code-count">{codes.length}</span>
      <button type="button" onClick={() => onChange('RPPC')}>select</button>
    </div>
  ),
}));

describe('StatusFilter', () => {
  it('renders DistinctValuesFilter with all 8 status codes', () => {
    render(<StatusFilter value={null} onChange={() => {}} />);
    expect(screen.getByTestId('distinct-filter')).toBeDefined();
    expect(screen.getByTestId('code-count').textContent).toBe('8');
  });

  it('uses the allStatuses i18n key as allLabel', () => {
    render(<StatusFilter value={null} onChange={() => {}} />);
    expect(screen.getByText('financeAccountMovementsFilterAllStatuses')).toBeDefined();
  });

  it('forwards onChange', () => {
    const onChange = vi.fn();
    render(<StatusFilter value={null} onChange={onChange} />);
    screen.getByRole('button', { name: 'select' }).click();
    expect(onChange).toHaveBeenCalledWith('RPPC');
  });
});
