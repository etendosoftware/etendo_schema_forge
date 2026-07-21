/**
 * Tests for AssignRoleControl — ETP-4512 role-assignment headerExtra for the
 * User settings window. See the component's own doc comment for why it
 * sources options from userRoles.role (unrestricted) instead of
 * defaultRole's own EXISTS-restricted native selector.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AssignRoleControl from '../AssignRoleControl';

vi.mock('@/i18n', () => ({
  useUI: () => (k) => k,
}));

const ROLE_OPTIONS = [
  { id: 'role-finance', label: 'Finance' },
  { id: 'role-sales', label: 'Sales' },
];

function mockFetchOk(items = ROLE_OPTIONS) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ items }),
  });
}

// Replicate the internal resolveId() helper to document its contract
// (same convention as BillingPreferencesForm.vitest.jsx).
function resolveId(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    const id = value.id ?? value.value ?? null;
    return id == null || id === '' ? null : String(id);
  }
  return String(value);
}

describe('AssignRoleControl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveId (pure helper)', () => {
    it('returns null for null/undefined/empty', () => {
      expect(resolveId(null)).toBeNull();
      expect(resolveId(undefined)).toBeNull();
      expect(resolveId('')).toBeNull();
    });

    it('returns a string for a plain id string', () => {
      expect(resolveId('ABC123')).toBe('ABC123');
    });

    it('extracts id from an {id,...} object shape', () => {
      expect(resolveId({ id: 'ABC123', name: 'Test' })).toBe('ABC123');
    });

    it('extracts value from a {value,...} object shape when no id', () => {
      expect(resolveId({ value: 'V1' })).toBe('V1');
    });

    it('returns null for an object with an empty id', () => {
      expect(resolveId({ id: '' })).toBeNull();
    });
  });

  describe('fetching options', () => {
    it('fetches role options from the userRoles selector on mount', async () => {
      mockFetchOk();
      render(<AssignRoleControl data={{}} token="t" apiBaseUrl="/sws/neo/user" onChange={vi.fn()} />);

      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/sws/neo/user/userRoles/selectors/AD_Role_ID?limit=50&offset=0',
        expect.objectContaining({ headers: { Authorization: 'Bearer t' } }),
      );
    });

    it('does not fetch when token is missing', () => {
      globalThis.fetch = vi.fn();
      render(<AssignRoleControl data={{}} apiBaseUrl="/sws/neo/user" onChange={vi.fn()} />);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('does not fetch when apiBaseUrl is missing', () => {
      globalThis.fetch = vi.fn();
      render(<AssignRoleControl data={{}} token="t" onChange={vi.fn()} />);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('does not update state (or warn) after unmount while a fetch is still in flight', async () => {
      let resolveFetch;
      globalThis.fetch = vi.fn().mockReturnValue(
        new Promise((resolve) => { resolveFetch = resolve; }),
      );

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { unmount } = render(
        <AssignRoleControl data={{}} token="t" apiBaseUrl="/sws/neo/user" onChange={vi.fn()} />,
      );
      unmount();

      // Resolve after unmount — the effect cleanup's `cancelled` flag should
      // prevent the post-unmount setOptions()/setLoading() calls, so React
      // never warns about a state update on an unmounted component.
      resolveFetch({ ok: true, json: async () => ({ items: ROLE_OPTIONS }) });
      await new Promise((r) => setTimeout(r, 0));

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('reflecting the current role', () => {
    it('reflects data.defaultRole (plain id string) as the selected value once options resolve', async () => {
      mockFetchOk();
      render(
        <AssignRoleControl
          data={{ defaultRole: 'role-finance' }}
          token="t"
          apiBaseUrl="/sws/neo/user"
          onChange={vi.fn()}
        />,
      );
      const select = screen.getByTestId('AssignRoleControl__select');
      await waitFor(() => expect(select).toHaveValue('role-finance'));
    });

    it('reflects data.defaultRole given as an {id,...} object shape', async () => {
      mockFetchOk();
      render(
        <AssignRoleControl
          data={{ defaultRole: { id: 'role-sales', name: 'Sales' } }}
          token="t"
          apiBaseUrl="/sws/neo/user"
          onChange={vi.fn()}
        />,
      );
      const select = screen.getByTestId('AssignRoleControl__select');
      await waitFor(() => expect(select).toHaveValue('role-sales'));
    });

    it('shows the empty ("no role assigned") state when data.defaultRole is null', async () => {
      mockFetchOk();
      render(
        <AssignRoleControl data={{ defaultRole: null }} token="t" apiBaseUrl="/sws/neo/user" onChange={vi.fn()} />,
      );
      const select = screen.getByTestId('AssignRoleControl__select');
      await waitFor(() => expect(select).not.toBeDisabled());
      expect(select).toHaveValue('');
    });

    it('shows the empty ("no role assigned") state when data.defaultRole is missing entirely', async () => {
      mockFetchOk();
      render(<AssignRoleControl data={{}} token="t" apiBaseUrl="/sws/neo/user" onChange={vi.fn()} />);
      const select = screen.getByTestId('AssignRoleControl__select');
      await waitFor(() => expect(select).not.toBeDisabled());
      expect(select).toHaveValue('');
    });
  });

  describe('selecting a new role', () => {
    it('calls onChange with defaultRole AND defaultRole$_identifier for the newly selected option', async () => {
      mockFetchOk();
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<AssignRoleControl data={{}} token="t" apiBaseUrl="/sws/neo/user" onChange={onChange} />);

      const select = screen.getByTestId('AssignRoleControl__select');
      await waitFor(() => expect(select).not.toBeDisabled());

      await user.selectOptions(select, 'role-finance');

      expect(onChange).toHaveBeenCalledWith('defaultRole', 'role-finance');
      expect(onChange).toHaveBeenCalledWith('defaultRole$_identifier', 'Finance');
    });

    it('calls onChange with null for both keys when the empty option is (re)selected', async () => {
      mockFetchOk();
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(
        <AssignRoleControl
          data={{ defaultRole: 'role-finance' }}
          token="t"
          apiBaseUrl="/sws/neo/user"
          onChange={onChange}
        />,
      );

      const select = screen.getByTestId('AssignRoleControl__select');
      await waitFor(() => expect(select).toHaveValue('role-finance'));

      await user.selectOptions(select, '');

      expect(onChange).toHaveBeenCalledWith('defaultRole', null);
      expect(onChange).toHaveBeenCalledWith('defaultRole$_identifier', null);
    });
  });

  describe('fetch failure handling', () => {
    it('leaves only the empty option (no crash) when the fetch promise rejects', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'));
      render(<AssignRoleControl data={{}} token="t" apiBaseUrl="/sws/neo/user" onChange={vi.fn()} />);

      const select = screen.getByTestId('AssignRoleControl__select');
      await waitFor(() => expect(select).not.toBeDisabled());
      expect(select).toHaveValue('');
      expect(select.querySelectorAll('option')).toHaveLength(1);
    });

    it('leaves only the empty option (no crash) when the response is not ok', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      render(<AssignRoleControl data={{}} token="t" apiBaseUrl="/sws/neo/user" onChange={vi.fn()} />);

      const select = screen.getByTestId('AssignRoleControl__select');
      await waitFor(() => expect(select).not.toBeDisabled());
      expect(select).toHaveValue('');
      expect(select.querySelectorAll('option')).toHaveLength(1);
    });

    it('deduplicates repeated ids and falls back to name/id when label is absent', async () => {
      mockFetchOk([
        { id: 'role-finance', label: 'Finance' },
        { id: 'role-finance', label: 'Finance (dup)' },
        { id: 'role-sales', name: 'Sales-by-name' },
        { id: '', label: 'Should be skipped (no id)' },
      ]);
      render(<AssignRoleControl data={{}} token="t" apiBaseUrl="/sws/neo/user" onChange={vi.fn()} />);

      const select = screen.getByTestId('AssignRoleControl__select');
      await waitFor(() => expect(select).not.toBeDisabled());
      // empty option + role-finance (first occurrence kept) + role-sales = 3
      expect(select.querySelectorAll('option')).toHaveLength(3);
      expect(screen.getByText('Sales-by-name')).toBeInTheDocument();
    });
  });

  it('renders the assignedRole label via the i18n hook (no hardcoded string)', async () => {
    mockFetchOk();
    render(<AssignRoleControl data={{}} token="t" apiBaseUrl="/sws/neo/user" onChange={vi.fn()} />);
    expect(screen.getByText('assignedRole')).toBeInTheDocument();
  });
});
