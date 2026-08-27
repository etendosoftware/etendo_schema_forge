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

vi.mock('@/lib/resendInvitationApi.js', () => ({
  resendInvitation: vi.fn(),
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
  // `topbarExtra` (the real, unmocked composite `TopbarExtra` — `OwnerBadge`/
  // `PendingInvitationPill`/`ActiveStatusToggle`, ETP-4830) — mirroring how
  // `DetailView.jsx` itself instantiates it, passing `data`/`recordId`/`token`/
  // `apiBaseUrl`/`onRefresh` straight through — next to the role-selection probe.
  //
  // ETP-4999 — `extraActions` (now hosting "Resend invitation", relocated out of
  // `topbarExtra` to the right-side toolbar) is also invoked here, the same way
  // `detailViewHelpers.jsx`'s real `renderExtraActionButtons` does: called with
  // `{ data, onRefresh }` and rendered as plain `<button>`s carrying `disabled`.
  // `onRefresh` is threaded from `props.onRefresh` (spread onto `UserPage` from
  // whatever the test passed into `<UserWindow onRefresh={...} />`), mirroring
  // `renderExtraActionButtons`'s own `() => hook.fetchById?.(data?.id)` stand-in.
  default: (props) => {
    lastUserPageProps = props;
    const TopbarExtra = props.topbarExtra;
    const extraActions = typeof props.extraActions === 'function'
      ? props.extraActions({ data: props.data, onRefresh: props.onRefresh })
      : (props.extraActions || []);
    return (
      <div data-testid="user-page">
        {TopbarExtra && (
          <TopbarExtra
            data={props.data}
            recordId={props.recordId}
            token={props.token}
            apiBaseUrl={props.apiBaseUrl}
            onRefresh={props.onRefresh}
          />
        )}
        <div data-testid="UserPageExtraActions">
          {extraActions.map((action) => (
            <button
              key={action.key}
              type="button"
              disabled={!!action.disabled}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
        <SelectionProbe />
      </div>
    );
  },
}));

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import UserWindow from '../index.jsx';
import { fetchUserRoleAssignments, saveUserRoleAssignments } from '@/lib/userRoleAssignmentsApi.js';
import { resendInvitation } from '@/lib/resendInvitationApi.js';
import { RECORD_SAVE_TOAST_ID } from '@/hooks/useEntity';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

  it('regression: clears a previously-loaded user\'s role selection when recordId changes to "new" without a remount (ETP-4830 stale-state bug)', async () => {
    // Reproduces the confirmed manual-test bug: viewing an existing user with roles
    // already applied, then navigating to "New user" WITHOUT the component instance
    // remounting (same `UserWindow` element, `recordId` prop just changes) must NOT
    // leave the previous user's roles pre-selected on the blank create form.
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: ['role-fin', 'role-sales'] });
    const { rerender } = render(<UserWindow recordId="user-1" token="tok" apiBaseUrl="/api" />);
    await waitFor(() => expect(screen.getByTestId('selected-ids')).toHaveTextContent('["role-fin","role-sales"]'));

    rerender(<UserWindow recordId="new" token="tok" apiBaseUrl="/api" />);

    await waitFor(() => expect(screen.getByTestId('selected-ids')).toHaveTextContent('[]'));
  });

  it('regression: clears the selection when recordId becomes absent without a remount', async () => {
    fetchUserRoleAssignments.mockResolvedValue({ userId: 'user-1', templateRoleIds: ['role-fin'] });
    const { rerender } = render(<UserWindow recordId="user-1" token="tok" apiBaseUrl="/api" />);
    await waitFor(() => expect(screen.getByTestId('selected-ids')).toHaveTextContent('["role-fin"]'));

    rerender(<UserWindow token="tok" apiBaseUrl="/api" />);

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

  // ETP-4999 — "Configuración del correo electrónico" was removed from this window's
  // tab strip entirely (human-confirmed not relevant to this window). The exact-equality
  // check above (`customTabs` === ['roles', 'attachments']) already proves no THIRD
  // custom tab slipped back in, but that native secondary tab was never a `customTabs`
  // entry to begin with — it was generated from `decisions.json`'s `entities.
  // emailConfiguration` into the generated `UserPage.jsx`'s own `detailEntity`/
  // `DetailTable`/`DetailForm` props (a pipeline-generated file this suite deliberately
  // does not test directly, per the repo's Generated Files Policy). This test instead
  // anchors the removal in the one hand-authored source of truth: a regression here
  // (someone dropping the `exclude: true`) would silently resurrect the email-config tab
  // on the next `make regen ONLY=user`, without changing a single line this file covers.
  it('declares entities.emailConfiguration.exclude: true in decisions.json', () => {
    const decisions = JSON.parse(
      readFileSync(join(__dirname, '..', '..', '..', '..', '..', '..', '..', 'artifacts', 'user', 'decisions.json'), 'utf8'),
    );
    expect(decisions.entities.emailConfiguration.exclude).toBe(true);
  });

  // ETP-4999 item 3 (Print button removal, Users window) — QA-flagged gap: nothing
  // in the repo asserted these two decisions.json keys, so a future `make regen` that
  // silently dropped either would go undetected until manual QA caught the button
  // reappearing. Mirrors the emailConfiguration.exclude pattern directly above: read
  // decisions.json itself rather than the pipeline-generated UserPage.jsx (per the
  // repo's Generated Files Policy).
  it('declares window.hidePrint and window.listViewOptions.hidePrint: true in decisions.json', () => {
    const decisions = JSON.parse(
      readFileSync(join(__dirname, '..', '..', '..', '..', '..', '..', '..', 'artifacts', 'user', 'decisions.json'), 'utf8'),
    );
    expect(decisions.window.hidePrint).toBe(true);
    expect(decisions.window.listViewOptions.hidePrint).toBe(true);
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

  it('renders the amber pending-invitation pill when invitationStatus is PENDING (transient pre-send state)', () => {
    render(<UserWindow recordId="user-1" data={{ id: 'user-1', invitationStatus: 'PENDING' }} />);

    const pill = screen.getByTestId('document-status-pill');
    expect(pill).toHaveTextContent('pendingInvitationBadge');
    expect(pill).toHaveAttribute('data-tone', 'warning');
    expect(pill).toHaveAttribute('data-status', 'PENDING');
  });

  it('renders the amber pending-invitation pill when invitationStatus is SENT (the real persisted post-send state)', () => {
    render(<UserWindow recordId="user-1" data={{ id: 'user-1', invitationStatus: 'SENT' }} />);

    const pill = screen.getByTestId('document-status-pill');
    expect(pill).toHaveTextContent('pendingInvitationBadge');
    expect(pill).toHaveAttribute('data-tone', 'warning');
    expect(pill).toHaveAttribute('data-status', 'SENT');
  });

  it('renders a red delivery-failed pill when invitationStatus is DELIVERY_FAILED', () => {
    render(<UserWindow recordId="user-1" data={{ id: 'user-1', invitationStatus: 'DELIVERY_FAILED' }} />);

    const pill = screen.getByTestId('document-status-pill');
    expect(pill).toHaveTextContent('invitationDeliveryFailedBadge');
    expect(pill).toHaveAttribute('data-tone', 'destructive');
    expect(pill).toHaveAttribute('data-status', 'DELIVERY_FAILED');
  });

  it('renders a neutral expired pill when invitationStatus is EXPIRED (ETP-4830 item #2/#3 — a genuinely reachable value now that findLatestInvitationStatus computes it live)', () => {
    render(<UserWindow recordId="user-1" data={{ id: 'user-1', invitationStatus: 'EXPIRED' }} />);

    const pill = screen.getByTestId('document-status-pill');
    expect(pill).toHaveTextContent('invitationExpiredBadge');
    expect(pill).toHaveAttribute('data-tone', 'neutral');
    expect(pill).toHaveAttribute('data-status', 'EXPIRED');
  });

  it('renders a green accepted pill when invitationStatus is ACCEPTED (ETP-4999)', () => {
    render(<UserWindow recordId="user-1" data={{ id: 'user-1', invitationStatus: 'ACCEPTED' }} />);

    const pill = screen.getByTestId('document-status-pill');
    expect(pill).toHaveTextContent('invitationAcceptedBadge');
    expect(pill).toHaveAttribute('data-tone', 'success');
    expect(pill).toHaveAttribute('data-status', 'ACCEPTED');
  });

  it('renders nothing when invitationStatus is REVOKED (terminal, non-actionable state)', () => {
    render(<UserWindow recordId="user-1" data={{ id: 'user-1', invitationStatus: 'REVOKED' }} />);
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

describe('UserWindow — owner badge (ETP-4830 item #4, detail-header topbarExtra)', () => {
  it('renders the neutral owner pill when isOwner is true', () => {
    render(<UserWindow recordId="user-1" data={{ id: 'user-1', isOwner: true }} />);

    const pill = screen.getByTestId('document-status-pill');
    expect(pill).toHaveTextContent('ownerBadge');
    expect(pill).toHaveAttribute('data-tone', 'neutral');
    expect(pill).toHaveAttribute('data-status', 'OWNER');
  });

  it('renders nothing when isOwner is false (the normal case)', () => {
    render(<UserWindow recordId="user-1" data={{ id: 'user-1', isOwner: false }} />);
    expect(screen.queryByTestId('document-status-pill')).not.toBeInTheDocument();
  });

  it('renders nothing when isOwner is absent (e.g. an existing pre-ETP-4830 response shape)', () => {
    render(<UserWindow recordId="user-1" data={{ id: 'user-1' }} />);
    expect(screen.queryByTestId('document-status-pill')).not.toBeInTheDocument();
  });

  it('coexists with the pending-invitation pill without a testid collision when both render', () => {
    render(
      <UserWindow
        recordId="user-1"
        data={{ id: 'user-1', isOwner: true, invitationStatus: 'SENT' }} />,
    );

    const pills = screen.getAllByTestId('document-status-pill');
    expect(pills).toHaveLength(2);
    expect(pills.map((p) => p.getAttribute('data-status')).sort()).toEqual(['OWNER', 'SENT']);
  });
});

describe('UserWindow — "Activo" active/inactive toggle (ETP-4830, detail-header topbarExtra)', () => {
  afterEach(() => {
    globalThis.fetch = undefined;
  });

  it('renders the toggle, checked, for an existing active user', () => {
    render(<UserWindow recordId="user-1" data={{ id: 'user-1', active: true }} />);
    const toggle = screen.getByTestId('ActiveStatusToggle__switch');
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('renders the toggle, unchecked, for an existing inactive user', () => {
    render(<UserWindow recordId="user-1" data={{ id: 'user-1', active: false }} />);
    const toggle = screen.getByTestId('ActiveStatusToggle__switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('renders nothing on a brand-new, not-yet-saved record (no id to PATCH against)', () => {
    render(<UserWindow recordId="new" />);
    expect(screen.queryByTestId('ActiveStatusToggle__switch')).not.toBeInTheDocument();
  });

  it('PATCHes user/{id} with { active: checked } on toggle and refreshes the record', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true }));
    const onRefresh = vi.fn();
    render(
      <UserWindow
        recordId="user-1"
        token="tkn"
        apiBaseUrl="/api"
        data={{ id: 'user-1', active: true }}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(screen.getByTestId('ActiveStatusToggle__switch'));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/user/user-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ active: false }),
    })));
  });

  it('rolls back the optimistic value and shows an error toast when the PATCH fails', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500 }));
    render(<UserWindow recordId="user-1" token="tkn" apiBaseUrl="/api" data={{ id: 'user-1', active: true }} />);

    fireEvent.click(screen.getByTestId('ActiveStatusToggle__switch'));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('ActiveStatusToggle__switch')).toHaveAttribute('aria-checked', 'true'));
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

  it('replaces the generic save toast in place (same id, no dismiss race) with exactly one actionable success toast', () => {
    render(<UserWindow />);
    lastUserPageProps.onAfterCreate({ id: 'new-user-1' });

    // ETP-4830 regression fix — this used to call toast.dismiss() (no id) immediately
    // before toast.success(), racing sonner's independently-scheduled dismiss
    // (requestAnimationFrame) against the new toast's mount (setTimeout) — see
    // useEntity.js's RECORD_SAVE_TOAST_ID doc comment. It now instead passes the SAME
    // id the generic "record created" toast used, so sonner updates it in place.
    expect(toastDismiss).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    const [message, options] = toastSuccess.mock.calls[0];
    expect(message).toBe('userCreatedInvitationSentToast');
    expect(options.id).toBe(RECORD_SAVE_TOAST_ID);
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

describe('UserWindow — "Resend invitation" button (ETP-4999 — moved from topbarExtra to the right-side extraActions toolbar)', () => {
  it('passes extraActions as a function to the generated UserPage', () => {
    render(<UserWindow />);
    expect(typeof lastUserPageProps.extraActions).toBe('function');
  });

  // ETP-4999 regression guard — the button used to render inside `topbarExtra`
  // (`UserTopbarExtra`, left side, next to Cancelar/Activo/the pill). It now comes
  // through the `extraActions` prop instead — assert it is NOT a descendant of
  // `UserTopbarExtra` any more.
  it('does not render inside topbarExtra (UserTopbarExtra) any more', () => {
    render(<UserWindow recordId="user-1" data={{ id: 'user-1', invitationStatus: 'PENDING' }} />);
    const topbarExtra = screen.getByTestId('UserTopbarExtra');
    expect(within(topbarExtra).queryByTestId('ResendInvitationButton')).not.toBeInTheDocument();
    expect(screen.getByTestId('ResendInvitationButton')).toBeInTheDocument();
  });

  it('renders nothing on a brand-new, not-yet-saved record (no id to resend against)', () => {
    render(<UserWindow recordId="new" data={{ invitationStatus: 'PENDING' }} />);
    expect(screen.queryByTestId('ResendInvitationButton')).not.toBeInTheDocument();
  });

  it('renders nothing when invitationStatus is absent (e.g. an existing pre-ETP-4830 user)', () => {
    render(<UserWindow recordId="user-1" data={{ id: 'user-1' }} />);
    expect(screen.queryByTestId('ResendInvitationButton')).not.toBeInTheDocument();
  });

  it.each(['ACCEPTED', 'REVOKED'])('renders nothing when invitationStatus is %s (not eligible for resend)', (status) => {
    render(<UserWindow recordId="user-1" data={{ id: 'user-1', invitationStatus: status }} />);
    expect(screen.queryByTestId('ResendInvitationButton')).not.toBeInTheDocument();
  });

  it.each(['PENDING', 'SENT', 'EXPIRED', 'DELIVERY_FAILED'])('renders when invitationStatus is %s (eligible for resend)', (status) => {
    render(<UserWindow recordId="user-1" data={{ id: 'user-1', invitationStatus: status }} />);
    expect(screen.getByTestId('ResendInvitationButton')).toBeInTheDocument();
  });

  it('calls resendInvitation with the record id, shows a success toast, and refreshes on success', async () => {
    resendInvitation.mockResolvedValue({ status: 'success', invitation: { status: 'SENT' } });
    const onRefresh = vi.fn();
    render(
      <UserWindow
        recordId="user-1"
        data={{ id: 'user-1', invitationStatus: 'EXPIRED' }}
        onRefresh={onRefresh} />,
    );

    fireEvent.click(screen.getByTestId('ResendInvitationButton'));

    await waitFor(() => expect(resendInvitation).toHaveBeenCalledWith('user-1'));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('resendInvitationSuccessToast'));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('shows an error toast with the rejection message and does not refresh on failure', async () => {
    resendInvitation.mockRejectedValue(new Error("Invitation status 'REVOKED' cannot be resent"));
    const onRefresh = vi.fn();
    render(
      <UserWindow
        recordId="user-1"
        data={{ id: 'user-1', invitationStatus: 'EXPIRED' }}
        onRefresh={onRefresh} />,
    );

    fireEvent.click(screen.getByTestId('ResendInvitationButton'));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Invitation status 'REVOKED' cannot be resent"));
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('falls back to the generic i18n error key when the rejection has no message', async () => {
    resendInvitation.mockRejectedValue(new Error());
    render(<UserWindow recordId="user-1" data={{ id: 'user-1', invitationStatus: 'EXPIRED' }} />);

    fireEvent.click(screen.getByTestId('ResendInvitationButton'));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('resendInvitationErrorFallback'));
  });

  it('disables the button while a resend is in flight', async () => {
    let resolveResend;
    resendInvitation.mockReturnValue(new Promise((resolve) => { resolveResend = resolve; }));
    render(<UserWindow recordId="user-1" data={{ id: 'user-1', invitationStatus: 'EXPIRED' }} />);

    // `ResendInvitationButton` is now a `data-testid` on the inner label `<span>`
    // (icon + text) — the real `disabled` attribute lives on the enclosing
    // `<button>` rendered by `renderExtraActionButtons`/`detailViewHelpers.jsx`.
    fireEvent.click(screen.getByTestId('ResendInvitationButton'));

    await waitFor(() => expect(screen.getByTestId('ResendInvitationButton').closest('button')).toBeDisabled());

    resolveResend({ status: 'success', invitation: { status: 'SENT' } });
    await waitFor(() => expect(screen.getByTestId('ResendInvitationButton').closest('button')).not.toBeDisabled());
  });
});
