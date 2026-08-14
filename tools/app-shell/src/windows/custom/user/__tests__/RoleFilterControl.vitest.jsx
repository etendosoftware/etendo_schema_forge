/**
 * Tests for RoleFilterControl — ETP-4906 Users LIST GRID toolbar role filter, a thin
 * wrapper over the shared `DistinctValuesFilter` (same convention as
 * `financial-account/StatementStatusFilter.jsx` — see that file's own vitest suite,
 * mirrored here). This component owns the dropdown UI + label resolution only; the
 * actual row-filtering logic lives in `UserHeaderTable.jsx`, tested separately.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// Stub DistinctValuesFilter — same surrogate pattern as
// financial-account/__tests__/StatementStatusFilter.vitest.jsx: exposes codes,
// labelFor, allLabel, searchPlaceholder, value, onChange without mounting the real
// Radix popover.
vi.mock('@/components/ui/distinct-values-filter', () => ({
  DistinctValuesFilter: ({ codes, labelFor, allLabel, searchPlaceholder, value, onChange }) => (
    <div data-testid="stub-distinct">
      <div data-testid="all-label">{allLabel}</div>
      <div data-testid="search-placeholder">{searchPlaceholder}</div>
      <div data-testid="current-value">{value ?? '__null__'}</div>
      <ul data-testid="codes">
        {codes.map((c) => (
          <li key={c}>{`${c}::${labelFor(c)}`}</li>
        ))}
      </ul>
      <button type="button" data-testid="trigger-change" onClick={() => onChange('role-sales')}>
        change
      </button>
    </div>
  ),
}));

import { RoleFilterControl } from '../RoleFilterControl.jsx';

const ROLES = [
  { id: 'role-fin', name: 'Finance' },
  { id: 'role-sales', name: 'Sales' },
  { id: 'role-admin', name: 'GOClient Admin', isClientAdmin: true },
];

describe('RoleFilterControl', () => {
  it('renders nothing when there are no roles', () => {
    const { container } = render(<RoleFilterControl value={null} onChange={vi.fn()} roles={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when roles is null/undefined', () => {
    const { container } = render(<RoleFilterControl value={null} onChange={vi.fn()} roles={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('passes every role (including Admin) as a filter code, unlike the composition picker', () => {
    render(<RoleFilterControl value={null} onChange={vi.fn()} roles={ROLES} />);
    const items = screen.getByTestId('codes').textContent;
    expect(items).toContain('role-fin::roleNameFinance');
    expect(items).toContain('role-sales::roleNameSales');
    expect(items).toContain('role-admin::roleNameAdmin');
  });

  it('resolves the Admin role label through the generic admin i18n key, not resolveRoleDisplayName', () => {
    render(<RoleFilterControl value={null} onChange={vi.fn()} roles={ROLES} />);
    expect(screen.getByTestId('codes').textContent).toContain('role-admin::roleNameAdmin');
  });

  it('wires the allLabel and searchPlaceholder i18n keys', () => {
    render(<RoleFilterControl value={null} onChange={vi.fn()} roles={ROLES} />);
    expect(screen.getByTestId('all-label')).toHaveTextContent('roleFilterAllRoles');
    expect(screen.getByTestId('search-placeholder')).toHaveTextContent('roleFilterSearchPlaceholder');
  });

  it('passes the current value through to the underlying filter', () => {
    render(<RoleFilterControl value="role-fin" onChange={vi.fn()} roles={ROLES} />);
    expect(screen.getByTestId('current-value')).toHaveTextContent('role-fin');
  });

  it('renders "__null__" placeholder when value is null (no filter selected)', () => {
    render(<RoleFilterControl value={null} onChange={vi.fn()} roles={ROLES} />);
    expect(screen.getByTestId('current-value')).toHaveTextContent('__null__');
  });

  it('invokes onChange when the underlying filter triggers a change', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<RoleFilterControl value={null} onChange={onChange} roles={ROLES} />);
    await user.click(screen.getByTestId('trigger-change'));
    expect(onChange).toHaveBeenCalledWith('role-sales');
  });

  it('ignores roles with a null/undefined id', () => {
    render(<RoleFilterControl value={null} onChange={vi.fn()} roles={[...ROLES, { id: null, name: 'Broken' }]} />);
    expect(screen.getByTestId('codes').textContent).not.toContain('Broken');
  });
});
