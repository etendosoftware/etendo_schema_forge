/**
 * Tests for windows/custom/user/index.jsx — covers both ETP-4906 (role assignment)
 * and ETP-4894 (invitation flow), which share the same `UserWindow` component. See
 * the source file's own doc comment for the full contract of both flows: fetch
 * applied roles on load for an existing user, thread the live selection to
 * `AssignTemplateRolesControl`/`UserRolesTab` via `RoleSelectionProvider`, fire
 * `saveUserRoleAssignments` from `onAfterExistingSave` (only when the locally-selected
 * set actually differs from what was loaded — the `sameIdSet` no-op guard), and render
 * the invitation banner/dialog as an independent extension via `headerContent` and a
 * sibling `InviteUserDialog`.
 *
 * Mirrors `windows/custom/warehouse/__tests__/index.vitest.jsx`'s convention of
 * capturing the generated page's props via a mock and driving its callbacks directly.
 */
const toastError = vi.fn();

vi.mock('sonner', () => ({
  toast: { error: (...args) => toastError(...args) },
}));

vi.mock('@/i18n', () => ({
  // Interpolates params into the returned string (rather than the trivial `(key) => key`)
  // so tests asserting the toast call shape can distinguish between a `detail` sourced
  // from the rejection's domain message vs. the `roleAssignmentSaveFailed` i18n fallback
  // key — both otherwise collapse to the same bare key under `(key) => key`. Plain
  // (no-params) calls — e.g. the invitation banner's copy — still just return the key.
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
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
  // Captures every prop (needed by the ETP-4906 assertions below) AND renders
  // `headerContent` (the real, unmocked `InvitationInfoBanner` markup, ETP-4894) next
  // to the role-selection probe — the two extensions are independent, so both need to
  // show up in this single mock's output.
  default: (props) => {
    lastUserPageProps = props;
    return (
      <div data-testid="user-page">
        {props.headerContent}
        <SelectionProbe />
      </div>
    );
  },
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UserWindow from '../index.jsx';
import { fetchUserRoleAssignments, saveUserRoleAssignments } from '@/lib/userRoleAssignmentsApi.js';

beforeEach(() => {
  vi.clearAllMocks();
  lastUserPageProps = null;
});

describe('UserWindow — fetching applied roles on load', () => {
  it('fetches the currently-applied template roles for an existing user', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: ['role-fin'] });
    render(<UserWindow recordId="user-1" apiBaseUrl="/api" />);

    await waitFor(() => expect(fetchUserRoleAssignments).toHaveBeenCalledWith('user-1'));
    await waitFor(() => expect(screen.getByTestId('selected-ids')).toHaveTextContent('["role-fin"]'));
  });

  it('does not fetch when recordId is "new"', () => {
    render(<UserWindow recordId="new" apiBaseUrl="/api" />);
    expect(fetchUserRoleAssignments).not.toHaveBeenCalled();
  });

  it('does not fetch when recordId is absent', () => {
    render(<UserWindow apiBaseUrl="/api" />);
    expect(fetchUserRoleAssignments).not.toHaveBeenCalled();
  });

  // ETP-4576 removed the `token` half of this gate. It was the reason a user who
  // already had template roles opened with an empty control under a cookie
  // session: the seeding effect returned early forever, so "Guardar" looked
  // clean while the real assignment was invisible. Only the two preconditions a
  // caller can actually control remain.
  it('does not fetch when apiBaseUrl is missing', () => {
    render(<UserWindow recordId="user-1" />);
    expect(fetchUserRoleAssignments).not.toHaveBeenCalled();
  });

  it('fetches with only recordId and apiBaseUrl, taking the credential from the scheme', () => {
    render(<UserWindow recordId="user-1" apiBaseUrl="/api" />);
    expect(fetchUserRoleAssignments).toHaveBeenCalledWith('user-1');
  });

  it('resets to an empty selection (does not crash) when the fetch rejects', async () => {
    fetchUserRoleAssignments.mockRejectedValue(new Error('boom'));
    render(<UserWindow recordId="user-1" apiBaseUrl="/api" />);

    await waitFor(() => expect(fetchUserRoleAssignments).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('selected-ids')).toHaveTextContent('[]'));
  });

  it('does not update state after unmount while the fetch is still in flight', async () => {
    let resolveFetch;
    fetchUserRoleAssignments.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = render(<UserWindow recordId="user-1" apiBaseUrl="/api" />);
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
    render(<UserWindow recordId="user-1" apiBaseUrl="/api" />);

    await screen.findByTestId('user-page');
    expect(lastUserPageProps.customTabs.map((t) => t.key)).toEqual(['roles', 'attachments']);
    expect(lastUserPageProps.customTabs[0]).toMatchObject({ labelKey: 'userRolesTabLabel', placement: 'tab' });
    expect(lastUserPageProps.customTabs[1]).toMatchObject({
      labelKey: 'attachments', placement: 'tab', props: { tableName: 'AD_User', config: {} },
    });
  });

  // ETP-4906 Round 4 (DEV wave 9) — pins the exact `tabOrder` field on each entry
  // directly, rather than relying on `toMatchObject` above (which silently ignores
  // extra/changed fields — this is exactly how the wave 9 regression this locks in
  // slipped past the equivalent `toMatchObject` check once before). `tabOrder: 0` places
  // "Roles del usuario" before the native "Configuración del correo electrónico"
  // secondary tab (default weight 99, see `detailViewHelpers.jsx`'s `buildInitialTabs`)
  // and before `attachments` (default weight 999, no explicit `tabOrder` of its own —
  // it must keep sorting after both `roles` and the native tab).
  it('pins tabOrder: 0 on the roles tab and leaves attachments at its implicit default weight', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: [] });
    render(<UserWindow recordId="user-1" apiBaseUrl="/api" />);

    await screen.findByTestId('user-page');
    const [rolesTab, attachmentsTab] = lastUserPageProps.customTabs;
    expect(rolesTab.tabOrder).toBe(0);
    expect(attachmentsTab.tabOrder).toBeUndefined();
  });

  it('passes onAfterExistingSave through to the generated UserPage', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: [] });
    render(<UserWindow recordId="user-1" apiBaseUrl="/api" />);

    await screen.findByTestId('user-page');
    expect(typeof lastUserPageProps.onAfterExistingSave).toBe('function');
  });
});

describe('UserWindow — handleRoleAssignmentSave (fired via onAfterExistingSave)', () => {
  it('does nothing when the saved record has no id', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: ['role-fin'] });
    render(<UserWindow recordId="user-1" apiBaseUrl="/api" />);
    await screen.findByTestId('user-page');

    await lastUserPageProps.onAfterExistingSave({});

    expect(saveUserRoleAssignments).not.toHaveBeenCalled();
  });

  it('is a no-op when the local selection is unchanged from what was loaded', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: ['role-fin'] });
    render(<UserWindow recordId="user-1" apiBaseUrl="/api" />);
    await waitFor(() => expect(screen.getByTestId('selected-ids')).toHaveTextContent('["role-fin"]'));

    await lastUserPageProps.onAfterExistingSave({ id: 'user-1' });

    expect(saveUserRoleAssignments).not.toHaveBeenCalled();
  });

  it('is a no-op when the selection is merely reordered (set-equality, not array-equality)', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: ['role-fin', 'role-sales'] });
    render(<UserWindow recordId="user-1" apiBaseUrl="/api" />);
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
    render(<UserWindow recordId="user-1" apiBaseUrl="/api" />);
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
    render(<UserWindow recordId="user-1" apiBaseUrl="/api" />);
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
    render(<UserWindow recordId="user-1" apiBaseUrl="/api" />);
    await waitFor(() => expect(fetchUserRoleAssignments).toHaveBeenCalled());

    screen.getByTestId('select-fin-sales').click();
    await waitFor(() => expect(screen.getByTestId('selected-ids')).toHaveTextContent('["role-fin","role-sales"]'));

    await expect(lastUserPageProps.onAfterExistingSave({ id: 'user-1' })).resolves.not.toThrow();

    // The generic AD_User save already succeeded and shown its own toast by the time this
    // fires (`onAfterExistingSave`) — the error toast must frame the failure as "user saved,
    // roles didn't" (`roleAssignmentSaveFailedAfterUserSaved`, not a bare domain message) and
    // stay up longer (`duration: 8000`) so it isn't lost behind the success toast.
    expect(toastError).toHaveBeenCalledWith(
      'roleAssignmentSaveFailedAfterUserSaved:{"detail":"Admin role cannot be assigned"}',
      { duration: 8000 },
    );
  });

  it('falls back to the generic i18n error key when the rejection has no message', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: [] });
    saveUserRoleAssignments.mockRejectedValue(new Error());
    render(<UserWindow recordId="user-1" apiBaseUrl="/api" />);
    await waitFor(() => expect(fetchUserRoleAssignments).toHaveBeenCalled());

    screen.getByTestId('select-fin-sales').click();
    await waitFor(() => expect(screen.getByTestId('selected-ids')).toHaveTextContent('["role-fin","role-sales"]'));

    await lastUserPageProps.onAfterExistingSave({ id: 'user-1' });

    // No `err.message` → `detail` falls back to the `roleAssignmentSaveFailed` i18n key,
    // which is then embedded as `{detail}` inside the after-user-saved wrapper message.
    expect(toastError).toHaveBeenCalledWith(
      'roleAssignmentSaveFailedAfterUserSaved:{"detail":"roleAssignmentSaveFailed"}',
      { duration: 8000 },
    );
  });
});

describe('UserWindow — additionalDirtyState (the "extra dirty source" prop DetailView.jsx reads to enable Guardar)', () => {
  it('is false on initial load, once the local selection matches the fetched applied set', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: ['role-fin'] });
    render(<UserWindow recordId="user-1" apiBaseUrl="/api" />);

    await waitFor(() => expect(screen.getByTestId('selected-ids')).toHaveTextContent('["role-fin"]'));
    expect(lastUserPageProps.additionalDirtyState).toBe(false);
  });

  it('becomes true after toggling a role away from the applied snapshot', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: ['role-fin'] });
    render(<UserWindow recordId="user-1" apiBaseUrl="/api" />);
    await waitFor(() => expect(screen.getByTestId('selected-ids')).toHaveTextContent('["role-fin"]'));

    screen.getByTestId('select-fin-sales').click();

    await waitFor(() => expect(lastUserPageProps.additionalDirtyState).toBe(true));
  });

  it('returns to false after toggling back to the originally-applied (empty) set', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: [] });
    render(<UserWindow recordId="user-1" apiBaseUrl="/api" />);
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
    render(<UserWindow recordId="user-1" apiBaseUrl="/api" />);
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

describe('UserWindow — invitation entry point (ETP-4894)', () => {
  it('renders the invitation info banner and invite button', () => {
    render(<UserWindow />);

    expect(screen.getByTestId('user-invitation-info')).toHaveTextContent(
      'inviteUserDescriptionTitle',
    );
    expect(screen.getByTestId('user-invitation-info')).toHaveTextContent(
      'inviteUserDescription',
    );
    expect(screen.getByTestId('action-open-invite')).toBeInTheDocument();
  });

  it('opens the InviteUserDialog when clicking the invite button', () => {
    render(<UserWindow />);

    expect(screen.queryByTestId('invite-user-dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('action-open-invite'));

    // `InviteUserDialog` is a real (unmocked) component — this asserts the actual
    // DOM node its own `DialogContent` renders (`invite-user-dialog`, see
    // `InviteUserDialog.jsx`), not the wrapper's `data-testid` prop passed by
    // `index.jsx` (`InviteUserDialog__853799`), which the component never spreads
    // onto its DOM since it only destructures `open`/`onOpenChange`/`onSuccess`/`apiBase`.
    expect(screen.getByTestId('invite-user-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('invite-user-email')).toBeInTheDocument();
  });
});
