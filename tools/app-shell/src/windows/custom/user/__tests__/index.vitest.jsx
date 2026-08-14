/**
 * Tests for windows/custom/user/index.jsx — ETP-4906. See the file's own doc comment
 * for the 3-step flow it owns: fetch applied roles on load for an existing user, thread
 * the live selection to `AssignTemplateRolesControl`/`UserRolesTab` via
 * `RoleSelectionProvider`, and fire `saveUserRoleAssignments` from
 * `onAfterExistingSave` — but ONLY when the locally-selected set actually differs from
 * what was loaded (the `sameIdSet` no-op guard, this ticket's "fires exactly once, only
 * when the role selection actually changed" constraint).
 *
 * Mirrors `windows/custom/warehouse/__tests__/index.vitest.jsx`'s convention of
 * capturing the generated page's props via a mock and driving its callbacks directly.
 */
const toastError = vi.fn();

vi.mock('sonner', () => ({
  toast: { error: (...args) => toastError(...args) },
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/components/attachments', () => ({
  AttachmentsTab: () => <div data-testid="attachments-tab" />,
}));

vi.mock('../UserRolesTab', () => ({
  default: () => <div data-testid="user-roles-tab" />,
}));

vi.mock('@/lib/userRoleAssignmentsApi.js', () => ({
  fetchUserRoleAssignments: vi.fn(),
  saveUserRoleAssignments: vi.fn(),
}));

import { useRoleSelection } from '../roleSelectionContext.js';

/** Renders inside the mocked UserPage, giving tests a hook to drive the shared
 * selection context the same way AssignTemplateRolesControl/UserRolesTab would. */
function SelectionProbe() {
  const { selectedRoleIds, setSelectedRoleIds } = useRoleSelection();
  return (
    <div>
      <div data-testid="selected-ids">{JSON.stringify(selectedRoleIds)}</div>
      <button type="button" data-testid="select-fin-sales" onClick={() => setSelectedRoleIds(['role-fin', 'role-sales'])}>
        select fin+sales
      </button>
      <button type="button" data-testid="select-sales-fin-reordered" onClick={() => setSelectedRoleIds(['role-sales', 'role-fin'])}>
        select sales+fin (reordered)
      </button>
      <button type="button" data-testid="clear-selection" onClick={() => setSelectedRoleIds([])}>
        clear
      </button>
    </div>
  );
}

let lastUserPageProps;
vi.mock('@generated/user/generated/web/user/UserPage', () => ({
  default: (props) => {
    lastUserPageProps = props;
    return (
      <div data-testid="user-page">
        <SelectionProbe />
      </div>
    );
  },
}));

import { render, screen, waitFor } from '@testing-library/react';
import UserWindow from '../index.jsx';
import { fetchUserRoleAssignments, saveUserRoleAssignments } from '@/lib/userRoleAssignmentsApi.js';

beforeEach(() => {
  vi.clearAllMocks();
  lastUserPageProps = null;
});

describe('UserWindow — fetching applied roles on load', () => {
  it('fetches the currently-applied template roles for an existing user', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: ['role-fin'] });
    render(<UserWindow recordId="user-1" token="tok" apiBaseUrl="/api" />);

    await waitFor(() => expect(fetchUserRoleAssignments).toHaveBeenCalledWith('user-1'));
    await waitFor(() => expect(screen.getByTestId('selected-ids')).toHaveTextContent('["role-fin"]'));
  });

  it('does not fetch when recordId is "new"', () => {
    render(<UserWindow recordId="new" token="tok" apiBaseUrl="/api" />);
    expect(fetchUserRoleAssignments).not.toHaveBeenCalled();
  });

  it('does not fetch when recordId is absent', () => {
    render(<UserWindow token="tok" apiBaseUrl="/api" />);
    expect(fetchUserRoleAssignments).not.toHaveBeenCalled();
  });

  it('does not fetch when token is missing', () => {
    render(<UserWindow recordId="user-1" apiBaseUrl="/api" />);
    expect(fetchUserRoleAssignments).not.toHaveBeenCalled();
  });

  it('does not fetch when apiBaseUrl is missing', () => {
    render(<UserWindow recordId="user-1" token="tok" />);
    expect(fetchUserRoleAssignments).not.toHaveBeenCalled();
  });

  it('resets to an empty selection (does not crash) when the fetch rejects', async () => {
    fetchUserRoleAssignments.mockRejectedValue(new Error('boom'));
    render(<UserWindow recordId="user-1" token="tok" apiBaseUrl="/api" />);

    await waitFor(() => expect(fetchUserRoleAssignments).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('selected-ids')).toHaveTextContent('[]'));
  });

  it('does not update state after unmount while the fetch is still in flight', async () => {
    let resolveFetch;
    fetchUserRoleAssignments.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = render(<UserWindow recordId="user-1" token="tok" apiBaseUrl="/api" />);
    unmount();
    resolveFetch({ userId: 'user-1', templateRoleIds: ['role-fin'] });
    await new Promise((r) => setTimeout(r, 0));

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe('UserWindow — customTabs wiring', () => {
  it('overrides customTabs with a "roles" tab and an "attachments" tab, in that order', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: [] });
    render(<UserWindow recordId="user-1" token="tok" apiBaseUrl="/api" />);

    await screen.findByTestId('user-page');
    expect(lastUserPageProps.customTabs.map((t) => t.key)).toEqual(['roles', 'attachments']);
    expect(lastUserPageProps.customTabs[0]).toMatchObject({ labelKey: 'userRolesTabLabel', placement: 'tab' });
    expect(lastUserPageProps.customTabs[1]).toMatchObject({
      labelKey: 'attachments', placement: 'tab', props: { tableName: 'AD_User', config: {} },
    });
  });

  it('passes onAfterExistingSave through to the generated UserPage', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: [] });
    render(<UserWindow recordId="user-1" token="tok" apiBaseUrl="/api" />);

    await screen.findByTestId('user-page');
    expect(typeof lastUserPageProps.onAfterExistingSave).toBe('function');
  });
});

describe('UserWindow — handleRoleAssignmentSave (fired via onAfterExistingSave)', () => {
  it('does nothing when the saved record has no id', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: ['role-fin'] });
    render(<UserWindow recordId="user-1" token="tok" apiBaseUrl="/api" />);
    await screen.findByTestId('user-page');

    await lastUserPageProps.onAfterExistingSave({});

    expect(saveUserRoleAssignments).not.toHaveBeenCalled();
  });

  it('is a no-op when the local selection is unchanged from what was loaded', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: ['role-fin'] });
    render(<UserWindow recordId="user-1" token="tok" apiBaseUrl="/api" />);
    await waitFor(() => expect(screen.getByTestId('selected-ids')).toHaveTextContent('["role-fin"]'));

    await lastUserPageProps.onAfterExistingSave({ id: 'user-1' });

    expect(saveUserRoleAssignments).not.toHaveBeenCalled();
  });

  it('is a no-op when the selection is merely reordered (set-equality, not array-equality)', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: ['role-fin', 'role-sales'] });
    render(<UserWindow recordId="user-1" token="tok" apiBaseUrl="/api" />);
    await waitFor(() => expect(fetchUserRoleAssignments).toHaveBeenCalled());

    screen.getByTestId('select-sales-fin-reordered').click();
    await waitFor(() => expect(screen.getByTestId('selected-ids')).toHaveTextContent('["role-sales","role-fin"]'));

    await lastUserPageProps.onAfterExistingSave({ id: 'user-1' });

    expect(saveUserRoleAssignments).not.toHaveBeenCalled();
  });

  it('calls saveUserRoleAssignments with the full new set when the selection changed', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: ['role-fin'] });
    saveUserRoleAssignments.mockResolvedValue({
      success: true, userId: 'user-1', personalRoleId: 'p-1', templateRoleIds: ['role-fin', 'role-sales'], added: 1, removed: 0,
    });
    render(<UserWindow recordId="user-1" token="tok" apiBaseUrl="/api" />);
    await waitFor(() => expect(fetchUserRoleAssignments).toHaveBeenCalled());

    screen.getByTestId('select-fin-sales').click();
    await waitFor(() => expect(screen.getByTestId('selected-ids')).toHaveTextContent('["role-fin","role-sales"]'));

    await lastUserPageProps.onAfterExistingSave({ id: 'user-1' });

    expect(saveUserRoleAssignments).toHaveBeenCalledWith('user-1', ['role-fin', 'role-sales']);
  });

  it('does not re-fire the save on a second call once the local ref catches up with the new applied set', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: ['role-fin'] });
    saveUserRoleAssignments.mockResolvedValue({
      success: true, userId: 'user-1', personalRoleId: 'p-1', templateRoleIds: ['role-fin', 'role-sales'], added: 1, removed: 0,
    });
    render(<UserWindow recordId="user-1" token="tok" apiBaseUrl="/api" />);
    await waitFor(() => expect(fetchUserRoleAssignments).toHaveBeenCalled());

    screen.getByTestId('select-fin-sales').click();
    await waitFor(() => expect(screen.getByTestId('selected-ids')).toHaveTextContent('["role-fin","role-sales"]'));

    await lastUserPageProps.onAfterExistingSave({ id: 'user-1' });
    expect(saveUserRoleAssignments).toHaveBeenCalledTimes(1);

    // Same selection, saved again (e.g. a second Guardar click with no further edits).
    await lastUserPageProps.onAfterExistingSave({ id: 'user-1' });
    expect(saveUserRoleAssignments).toHaveBeenCalledTimes(1);
  });

  it('shows an error toast (and does not throw) when saveUserRoleAssignments rejects with a domain message', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: [] });
    saveUserRoleAssignments.mockRejectedValue(new Error('Admin role cannot be assigned'));
    render(<UserWindow recordId="user-1" token="tok" apiBaseUrl="/api" />);
    await waitFor(() => expect(fetchUserRoleAssignments).toHaveBeenCalled());

    screen.getByTestId('select-fin-sales').click();
    await waitFor(() => expect(screen.getByTestId('selected-ids')).toHaveTextContent('["role-fin","role-sales"]'));

    await expect(lastUserPageProps.onAfterExistingSave({ id: 'user-1' })).resolves.not.toThrow();

    expect(toastError).toHaveBeenCalledWith('Admin role cannot be assigned');
  });

  it('falls back to the generic i18n error key when the rejection has no message', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: [] });
    saveUserRoleAssignments.mockRejectedValue(new Error());
    render(<UserWindow recordId="user-1" token="tok" apiBaseUrl="/api" />);
    await waitFor(() => expect(fetchUserRoleAssignments).toHaveBeenCalled());

    screen.getByTestId('select-fin-sales').click();
    await waitFor(() => expect(screen.getByTestId('selected-ids')).toHaveTextContent('["role-fin","role-sales"]'));

    await lastUserPageProps.onAfterExistingSave({ id: 'user-1' });

    expect(toastError).toHaveBeenCalledWith('roleAssignmentSaveFailed');
  });
});

describe('UserWindow — additionalDirtyState (the "extra dirty source" prop DetailView.jsx reads to enable Guardar)', () => {
  it('is false on initial load, once the local selection matches the fetched applied set', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: ['role-fin'] });
    render(<UserWindow recordId="user-1" token="tok" apiBaseUrl="/api" />);

    await waitFor(() => expect(screen.getByTestId('selected-ids')).toHaveTextContent('["role-fin"]'));
    expect(lastUserPageProps.additionalDirtyState).toBe(false);
  });

  it('becomes true after toggling a role away from the applied snapshot', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: ['role-fin'] });
    render(<UserWindow recordId="user-1" token="tok" apiBaseUrl="/api" />);
    await waitFor(() => expect(screen.getByTestId('selected-ids')).toHaveTextContent('["role-fin"]'));

    screen.getByTestId('select-fin-sales').click();

    await waitFor(() => expect(lastUserPageProps.additionalDirtyState).toBe(true));
  });

  it('returns to false after toggling back to the originally-applied (empty) set', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: [] });
    render(<UserWindow recordId="user-1" token="tok" apiBaseUrl="/api" />);
    await waitFor(() => expect(fetchUserRoleAssignments).toHaveBeenCalled());
    expect(lastUserPageProps.additionalDirtyState).toBe(false);

    screen.getByTestId('select-fin-sales').click();
    await waitFor(() => expect(lastUserPageProps.additionalDirtyState).toBe(true));

    // Toggle back to the originally-applied set (empty).
    screen.getByTestId('clear-selection').click();
    await waitFor(() => expect(screen.getByTestId('selected-ids')).toHaveTextContent('[]'));
    expect(lastUserPageProps.additionalDirtyState).toBe(false);
  });

  it('regression: goes back to false after a successful handleRoleAssignmentSave (ref-mirror-to-state fix, not just a ref mutation)', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: ['role-fin'] });
    saveUserRoleAssignments.mockResolvedValue({
      success: true, userId: 'user-1', personalRoleId: 'p-1', templateRoleIds: ['role-fin', 'role-sales'], added: 1, removed: 0,
    });
    render(<UserWindow recordId="user-1" token="tok" apiBaseUrl="/api" />);
    await waitFor(() => expect(screen.getByTestId('selected-ids')).toHaveTextContent('["role-fin"]'));
    expect(lastUserPageProps.additionalDirtyState).toBe(false);

    screen.getByTestId('select-fin-sales').click();
    await waitFor(() => expect(lastUserPageProps.additionalDirtyState).toBe(true));

    await lastUserPageProps.onAfterExistingSave({ id: 'user-1' });

    // Before the fix, `appliedRoleIdsRef.current` was updated but `selectedRoleIds` state
    // was not mirrored, so this stayed stuck at `true` (no re-render). The regression this
    // test locks in: the confirmed set is mirrored back into state, flipping this to `false`.
    await waitFor(() => expect(lastUserPageProps.additionalDirtyState).toBe(false));
  });
});
