/**
 * Tests for windows/custom/user/index.jsx — covers ETP-4906 (role assignment) and
 * ETP-4830 (invite-on-create: newLabel fix, pending-invitation `topbarExtra` pill,
 * actionable "user created" toast), which share the same `UserWindow` component. See
 * the source file's own doc comment for the full contract of both flows: fetch
 * applied roles on load for an existing user, thread the live selection to
 * `AssignTemplateRolesControl`/`UserRolesTab` via `RoleSelectionProvider`, fire
 * `saveUserRoleAssignments` from `onAfterExistingSave` (only when the locally-selected
 * set actually differs from what was loaded — the `sameIdSet` no-op guard), and — as
 * of ETP-4830 — show a single actionable toast on `onAfterCreate` whose action
 * re-navigates with `location.state.openSecondaryTab` and focuses
 * `AssignTemplateRolesControl`. The old ETP-4894 `InvitationInfoBanner`/
 * `InviteUserDialog` wiring was removed from this file entirely (ETP-4830) — see
 * `InviteUserDialog.vitest.jsx` for that component's own (now-unwired) coverage.
 *
 * Mirrors `windows/custom/warehouse/__tests__/index.vitest.jsx`'s convention of
 * capturing the generated page's props via a mock and driving its callbacks directly.
 */
const toastError = vi.fn();
const toastSuccess = vi.fn();
const toastDismiss = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    error: (...args) => toastError(...args),
    success: (...args) => toastSuccess(...args),
    dismiss: (...args) => toastDismiss(...args),
  },
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/i18n', () => ({
  // Interpolates params into the returned string (rather than the trivial `(key) => key`)
  // so tests asserting the toast call shape can distinguish between a `detail` sourced
  // from the rejection's domain message vs. the `roleAssignmentSaveFailed` i18n fallback
  // key — both otherwise collapse to the same bare key under `(key) => key`.
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
  // The real (unmocked) `DocumentStatusPill` — rendered by `PendingInvitationPill` —
  // also imports `useLocale` from `@/i18n`; stub it so that import doesn't crash.
  // Its own `label` is always explicit in `PendingInvitationPill`, so `dictionary`
  // is never actually read down `statusLabel`'s fallback path.
  useLocale: () => ({}),
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
  // Captures every prop (needed by the ETP-4906/ETP-4830 assertions below) AND renders
  // `topbarExtra` (the real, unmocked `PendingInvitationPill`, ETP-4830) — mirroring how
  // `DetailView.jsx` itself instantiates it, passing `data` straight through — next to
  // the role-selection probe.
  default: (props) => {
    lastUserPageProps = props;
    const TopbarExtra = props.topbarExtra;
    return (
      <div data-testid="user-page">
        {TopbarExtra && <TopbarExtra data={props.data} />}
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
    render(<UserWindow recordId="user-1" token="tok" apiBaseUrl="/api" />);

    await screen.findByTestId('user-page');
    const [rolesTab, attachmentsTab] = lastUserPageProps.customTabs;
    expect(rolesTab.tabOrder).toBe(0);
    expect(attachmentsTab.tabOrder).toBeUndefined();
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
    render(<UserWindow recordId="user-1" token="tok" apiBaseUrl="/api" />);
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

describe('UserWindow — newLabel fix (ETP-4830)', () => {
  it('passes the generic "newUser" label, not the old "inviteUser" mislabel', () => {
    render(<UserWindow />);
    expect(lastUserPageProps.newLabel).toBe('newUser');
  });
});

describe('UserWindow — pending-invitation topbarExtra pill (ETP-4830)', () => {
  it('passes a topbarExtra component to the generated UserPage', () => {
    render(<UserWindow />);
    expect(typeof lastUserPageProps.topbarExtra).toBe('function');
  });

  it('renders the amber pending-invitation pill when invitationStatus is PENDING', () => {
    render(<UserWindow recordId="user-1" data={{ id: 'user-1', invitationStatus: 'PENDING' }} />);

    const pill = screen.getByTestId('document-status-pill');
    expect(pill).toHaveTextContent('pendingInvitationBadge');
    expect(pill).toHaveAttribute('data-tone', 'warning');
    expect(pill).toHaveAttribute('data-status', 'PENDING');
  });

  it('renders nothing when invitationStatus is not PENDING', () => {
    render(<UserWindow recordId="user-1" data={{ id: 'user-1', invitationStatus: 'ACCEPTED' }} />);
    expect(screen.queryByTestId('document-status-pill')).not.toBeInTheDocument();
  });

  it('renders nothing when invitationStatus is absent (e.g. an existing pre-ETP-4830 user)', () => {
    render(<UserWindow recordId="user-1" data={{ id: 'user-1' }} />);
    expect(screen.queryByTestId('document-status-pill')).not.toBeInTheDocument();
  });

  it('renders nothing on a brand-new, not-yet-saved record (no data yet)', () => {
    render(<UserWindow recordId="new" />);
    expect(screen.queryByTestId('document-status-pill')).not.toBeInTheDocument();
  });
});

describe('UserWindow — actionable "user created" toast (ETP-4830, onAfterCreate)', () => {
  it('passes onAfterCreate to the generated UserPage', () => {
    render(<UserWindow />);
    expect(typeof lastUserPageProps.onAfterCreate).toBe('function');
  });

  it('does nothing when the saved record has no id', () => {
    render(<UserWindow />);
    lastUserPageProps.onAfterCreate({});
    expect(toastDismiss).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('dismisses any prior toast, then shows exactly one actionable success toast', () => {
    render(<UserWindow />);
    lastUserPageProps.onAfterCreate({ id: 'new-user-1' });

    expect(toastDismiss).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    const [message, options] = toastSuccess.mock.calls[0];
    expect(message).toBe('userCreatedInvitationSentToast');
    expect(options.action.label).toBe('configureRolesAction');
    expect(typeof options.action.onClick).toBe('function');
  });

  it("the toast action navigates to the saved record with location.state.openSecondaryTab: 'custom:roles'", () => {
    render(<UserWindow windowName="user" />);
    lastUserPageProps.onAfterCreate({ id: 'new-user-1' });

    const { action } = toastSuccess.mock.calls[0][1];
    action.onClick();

    expect(navigateMock).toHaveBeenCalledWith('/user/new-user-1', {
      replace: true,
      state: { openSecondaryTab: 'custom:roles' },
    });
  });

  it('the toast action scrolls/focuses AssignTemplateRolesControl once it is in the DOM', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div data-testid="AssignTemplateRolesControl__toggle-expand" tabindex="0"></div>';
    const target = screen.getByTestId('AssignTemplateRolesControl__toggle-expand');
    target.scrollIntoView = vi.fn();
    const focusSpy = vi.spyOn(target, 'focus');

    render(<UserWindow windowName="user" />);
    lastUserPageProps.onAfterCreate({ id: 'new-user-1' });
    toastSuccess.mock.calls[0][1].action.onClick();

    vi.advanceTimersByTime(50);

    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(focusSpy).toHaveBeenCalled();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('falls back to the "save first" placeholder test-id when the expanded toggle is not in the DOM yet', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div data-testid="AssignTemplateRolesControl__save-first" tabindex="0"></div>';
    const target = screen.getByTestId('AssignTemplateRolesControl__save-first');
    target.scrollIntoView = vi.fn();
    const focusSpy = vi.spyOn(target, 'focus');

    render(<UserWindow windowName="user" />);
    lastUserPageProps.onAfterCreate({ id: 'new-user-1' });
    toastSuccess.mock.calls[0][1].action.onClick();

    vi.advanceTimersByTime(50);

    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('does not throw when neither AssignTemplateRolesControl test-id is present', () => {
    vi.useFakeTimers();
    render(<UserWindow windowName="user" />);
    lastUserPageProps.onAfterCreate({ id: 'new-user-1' });

    expect(() => {
      toastSuccess.mock.calls[0][1].action.onClick();
      vi.advanceTimersByTime(50);
    }).not.toThrow();
    vi.useRealTimers();
  });

  it('defaults the route to "/user/..." when windowName is not passed', () => {
    render(<UserWindow />);
    lastUserPageProps.onAfterCreate({ id: 'new-user-1' });

    toastSuccess.mock.calls[0][1].action.onClick();

    expect(navigateMock).toHaveBeenCalledWith('/user/new-user-1', expect.anything());
  });
});
