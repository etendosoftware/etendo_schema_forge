import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Mail, UserPlus } from 'lucide-react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import UserPage from '@generated/user/generated/web/user/UserPage';
import UserRolesTab from './UserRolesTab';
import { AttachmentsTab } from '@/components/attachments';
import { RoleSelectionProvider } from './roleSelectionContext.js';
import { fetchUserRoleAssignments, saveUserRoleAssignments } from '@/lib/userRoleAssignmentsApi.js';
import { InviteUserDialog } from './InviteUserDialog.jsx';

function sameIdSet(a, b) {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((id) => setA.has(id));
}

function InvitationInfoBanner({ onOpenInvite }) {
  const ui = useUI();

  return (
    <div
      className="mx-2 mb-4 flex flex-col items-start justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center text-foreground"
      data-testid="user-invitation-info"
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2 font-medium">
          <Mail className="h-4 w-4 text-primary" data-testid="Mail__853799" />
          <span>{ui('inviteUserDescriptionTitle')}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {ui('inviteUserDescription')}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        onClick={onOpenInvite}
        className="shrink-0 gap-2"
        data-testid="action-open-invite"
      >
        <UserPlus className="h-4 w-4" data-testid="UserPlus__853799" />
        {ui('inviteUser')}
      </Button>
    </div>
  );
}

/**
 * Company user administration. Wraps the generated `UserPage` to combine two
 * independent extensions:
 *
 * A) ETP-4894 — email-only invitation flow with pending confirmation. The AD_User
 *    and its organization roles must already exist; the invitation only links that
 *    prepared ERP user to an Etendo Go account after acceptance. Rendered via
 *    `headerContent` (the `InvitationInfoBanner` below, shown above the generated
 *    page's own header) plus a sibling `InviteUserDialog` controlled by local
 *    `inviteOpen` state. `newLabel` overrides the generic "new record" label with
 *    "Invite user" copy, since this window never creates an AD_User directly.
 *
 * B) ETP-4906 — wraps the generated `UserPage` to wire the multi-role assignment flow:
 *
 * 1. On loading an EXISTING user, fetches the currently-applied template role ids
 *    (`fetchUserRoleAssignments`, ETP-4906) and seeds both the shared selection state
 *    (`RoleSelectionProvider` — read/written by `AssignTemplateRolesControl` and, on
 *    the sibling "Roles del usuario" tab, `UserRolesTab`) and `appliedRoleIdsRef`, a
 *    frozen snapshot of what was actually loaded, used only for the changed/unchanged
 *    comparison below.
 * 2. Passes `onAfterExistingSave={handleRoleAssignmentSave}` to `UserPage` — a NEW prop
 *    `DetailView.jsx` invokes exactly once per Guardar click, only for an
 *    already-persisted record (never on creation — see this ticket's Global
 *    Constraints on why `SFAssignUserRoles` must never fire before an `AD_User_ID`
 *    exists). Mirrors `windows/custom/warehouse/index.jsx`'s `onAfterCreate` wiring,
 *    the concrete precedent this pattern was copied from.
 * 3. `handleRoleAssignmentSave` compares the current local selection against the
 *    snapshot from step 1; a no-op unless the set actually changed, satisfying the
 *    "fires exactly once, only when the role selection actually changed" constraint.
 * 4. Passes `additionalDirtyState` to `UserPage` — `DetailView.jsx`'s "extra dirty
 *    source" prop (see its `computeIsDirty`) — computed with the SAME `sameIdSet`
 *    comparison as step 3, so a role-only chip change (which never calls
 *    `onChange('defaultRole', ...)` and therefore never sets `hook.isDirtyHeader`)
 *    still enables Guardar. Recomputed on every render from `selectedRoleIds` state
 *    vs. `appliedRoleIdsRef.current` — see `handleRoleAssignmentSave` for why the ref
 *    is also mirrored back into `selectedRoleIds` state after a successful save (a
 *    ref mutation alone doesn't trigger a re-render, so without it this prop would
 *    stay stuck at `true` after Guardar instead of flipping back to `false`).
 *
 * Both flows are independent — the invitation banner/dialog has no dependency on
 * role-selection context — but they share the same generated `UserPage` instance,
 * so all props from both are passed into the single call below.
 */
export default function UserWindow(props) {
  const { recordId, token, apiBaseUrl } = props;
  const ui = useUI();
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);
  const appliedRoleIdsRef = useRef([]);
  const hasUnsavedRoleChange = !sameIdSet(selectedRoleIds, appliedRoleIdsRef.current);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    if (!recordId || recordId === 'new' || !token || !apiBaseUrl) return undefined;
    let cancelled = false;
    fetchUserRoleAssignments(recordId)
      .then((res) => {
        if (cancelled) return;
        const ids = res?.templateRoleIds ?? [];
        appliedRoleIdsRef.current = ids;
        setSelectedRoleIds(ids);
      })
      .catch(() => {
        if (!cancelled) {
          appliedRoleIdsRef.current = [];
          setSelectedRoleIds([]);
        }
      });
    return () => { cancelled = true; };
  }, [recordId, token, apiBaseUrl]);

  const handleRoleAssignmentSave = useCallback(async (saved) => {
    if (!saved?.id) return;
    if (sameIdSet(selectedRoleIds, appliedRoleIdsRef.current)) return;
    try {
      const result = await saveUserRoleAssignments(saved.id, selectedRoleIds);
      const confirmedIds = result.templateRoleIds ?? selectedRoleIds;
      appliedRoleIdsRef.current = confirmedIds;
      // Mirrors the confirmed set back into state (not just the ref) so the component
      // re-renders and `hasUnsavedRoleChange` — and therefore `additionalDirtyState` —
      // recomputes to `false` post-save. A ref-only update never re-renders.
      setSelectedRoleIds(confirmedIds);
    } catch (err) {
      // The generic AD_User field save has ALREADY succeeded and shown its own "Saved
      // successfully" toast by the time this runs — `handleRoleAssignmentSave` fires as
      // `onAfterExistingSave`, strictly AFTER that save (see this file's own doc comment,
      // step 2). A bare "Couldn't save roles" error here reads as a direct contradiction
      // of the success toast the admin just saw. Fix: the message explicitly says the
      // user record itself DID save and only the role assignment failed, and the toast is
      // given a longer duration so it doesn't get lost/dismissed behind the success toast
      // that already fired first.
      const detail = err?.message || ui('roleAssignmentSaveFailed');
      toast.error(ui('roleAssignmentSaveFailedAfterUserSaved', { detail }), { duration: 8000 });
    }
  }, [selectedRoleIds, ui]);

  // Overrides the generated `customTabs` prop entirely (a hand-written `index.jsx`'s own
  // prop wins — `{...props}` is spread AFTER the hardcoded `customTabs={...}` in the
  // generated `UserPage.jsx`; see `docs/ui-customization.md` §9c for the identical
  // "replaces, not merges" caveat on `listViewOptions`). This is the ONLY way to hand
  // `UserRolesTab` the live selection — `ct.props` is the one per-tab extension point
  // `DetailView.jsx`'s `renderCustomTabPanels` actually spreads onto the tab component.
  // MUST keep the `attachments` entry in sync with what `generate-frontend.js` emits for
  // this window (currently `{ tableName: 'AD_User', config: {} }`) — re-check
  // `artifacts/user/generated/web/user/UserPage.jsx`'s own `customTabs` prop after any
  // `make regen ONLY=user` that touches `window.attachments`.
  const customTabs = useMemo(() => [
    // ETP-4906 Round 4 — `tabOrder: 0` places "Roles del usuario" before the
    // `attachments` custom tab below (default weight 999) — see `DetailView.jsx`'s
    // `buildInitialTabs` (`detailViewHelpers.jsx`), which sorts by weight then
    // insertion index. `attachments` is left at its implicit default so it keeps
    // sorting after both `roles` and the email-config lines tab below.
    { key: 'roles', labelKey: 'userRolesTabLabel', Component: UserRolesTab, placement: 'tab', tabOrder: 0, props: { selectedRoleIds } },
    { key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: 'AD_User', config: {} } },
  ], [selectedRoleIds]);

  return (
    <RoleSelectionProvider
      value={{ selectedRoleIds, setSelectedRoleIds }}>
      <UserPage
        {...props}
        newLabel={ui('inviteUser')}
        headerContent={
          <InvitationInfoBanner
            onOpenInvite={() => setInviteOpen(true)}
            data-testid="InvitationInfoBanner__853799" />
        }
        onAfterExistingSave={handleRoleAssignmentSave}
        additionalDirtyState={hasUnsavedRoleChange}
        customTabs={customTabs}
        // ETP-4906 Round 5 (DEV wave 10) — "Configuración del correo electrónico" is NOT
        // a plain secondaryTabs entry; the generated `UserPage.jsx` renders it via
        // `DetailTable={EmailConfigurationTable}`, which `buildInitialTabs` treats as the
        // special LINES-tab slot (`detailViewHelpers.jsx`'s `computeLinesEntryKey`). With
        // no `detailTabOrder`/`detailTabIndex` passed anywhere, that slot silently
        // defaulted to `LINES_DEFAULT_WEIGHT = -1` — LOWER than `roles`' `tabOrder: 0` —
        // so email-config kept sorting first despite Round 4's fix (confirmed live by the
        // human, not just theorized). `detailTabOrder` is the helper's own documented
        // "preferred" mechanism for this: passed straight through `UserPage`'s `{...props}`
        // spread into `DetailView`, same path as `onAfterExistingSave`/`additionalDirtyState`
        // above. `1` sits strictly between `roles` (0) and `attachments` (999, implicit),
        // giving the final order: Roles del usuario, Configuración del correo
        // electrónico, Adjuntos.
        detailTabOrder={1}
        data-testid="UserPage__853799" />
      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        data-testid="InviteUserDialog__853799" />
    </RoleSelectionProvider>
  );
}
