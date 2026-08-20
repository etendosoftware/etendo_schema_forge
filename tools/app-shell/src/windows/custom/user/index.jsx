import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import UserPage from '@generated/user/generated/web/user/UserPage';
import UserRolesTab from './UserRolesTab';
import { AttachmentsTab } from '@/components/attachments';
import { RoleSelectionProvider } from './roleSelectionContext.js';
import { fetchUserRoleAssignments, saveUserRoleAssignments } from '@/lib/userRoleAssignmentsApi.js';
import DocumentStatusPill from '@/components/contract-ui/DocumentStatusPill.jsx';

function sameIdSet(a, b) {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((id) => setA.has(id));
}

/**
 * ETP-4830 — amber "Invitación pendiente" pill, wired as `UserPage`'s/`DetailView`'s
 * `topbarExtra` slot: a plain pass-through prop (not a `decisions.json`-declared
 * extension point), rendered in the SAME toolbar row as the Cancel button —
 * `DetailView.jsx`'s "Action bar: Cancel + status" row renders, in order, the Cancel
 * button, the `statusField` pill, `extraBadges`, then `topbarExtra`, all inside one
 * flex group. Reusing this existing generic slot (rather than
 * `window.extraBadges`/`statusPills`, whose `renderStatusPillBadge` only compiles a
 * boolean field into a 2-state true/false pill) means no `schema_forge_core`
 * generator change was needed for this ticket — `invitationStatus` is a 3-state field
 * ("PENDING" | "SENT" | "ACCEPTED" | null, see this file's own stubbing note below on
 * `handleAfterCreate`) where only ONE state should ever render a pill, a shape
 * `extraBadges` cannot express today.
 *
 * Purely reactive to `data` — renders nothing once the backend flips
 * `invitationStatus` away from `'PENDING'` (e.g. once the invitee accepts), no local
 * state or polling needed here.
 */
function PendingInvitationPill({ data }) {
  const ui = useUI();
  if (data?.invitationStatus !== 'PENDING') return null;
  return (
    <DocumentStatusPill
      status="PENDING"
      tone="warning"
      label={ui('pendingInvitationBadge')}
      data-testid="PendingInvitationPill__toolbar" />
  );
}

/**
 * Company user administration. Wraps the generated `UserPage` to wire the
 * multi-role assignment flow (ETP-4906) plus the invite-on-create flow (ETP-4830):
 *
 * B) ETP-4906 — wires the multi-role assignment flow:
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
 * C) ETP-4830 — on successful creation of a brand-new user, `onAfterCreate` (below)
 *    shows a single actionable toast ("Usuario creado. Invitación enviada por
 *    correo.") whose action jumps straight into role configuration. Independent of
 *    A/B above — it only touches the create path, never an existing-record save —
 *    but reuses the SAME `customTabs`/`AssignTemplateRolesControl` wiring B already
 *    set up, so it is documented here rather than as a third separate concern.
 *
 * All three share the same generated `UserPage` instance, so every prop from each
 * is passed into the single call below.
 */
export default function UserWindow(props) {
  const { recordId, token, apiBaseUrl, windowName = 'user' } = props;
  const ui = useUI();
  const navigate = useNavigate();
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);
  const appliedRoleIdsRef = useRef([]);
  const hasUnsavedRoleChange = !sameIdSet(selectedRoleIds, appliedRoleIdsRef.current);

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

  /**
   * ETP-4830 — actionable "user created" toast, replacing the standalone
   * `InviteRolesSnackbar.jsx` this ticket originally planned as its own component
   * (never built — consolidated into this single `sonner` toast instead). Fires from
   * `onAfterCreate`, `DetailView.jsx`'s hook invoked exactly once per NEW-record Save
   * click, strictly AFTER `hook.handleSave` has already resolved and shown ITS OWN
   * generic "Record created" toast (`useEntity.js`'s `getSaveSuccessMessage`) —
   * `toast.dismiss()` clears that one first so only ONE toast is ever visible at a
   * time, per this ticket's decision to show a single toast (there is no generic
   * "silent create" opt-out on the shared Save button that wouldn't also affect
   * every other window using `onAfterCreate`, so dismiss+replace is the
   * window-scoped fix instead of a `DetailView.jsx` behavior change).
   *
   * The action button does two things `DetailView.jsx` treats as separate surfaces:
   *  (a) re-navigates to the just-created record with `location.state.openSecondaryTab`
   *      set to the "roles" custom tab's key (`custom:roles` — `customTabKey()`'s
   *      `custom:` prefix convention, `detailViewHelpers.jsx`) — the SAME mechanism
   *      `DetailView.jsx` already uses internally for "save header first, then land on
   *      a specific tab" (see its own `openSecondaryTab` effect). No ref/imperative
   *      tab-switch API exists on `DetailView`/`UserPage` — this location-state
   *      mechanism is the only documented one, used unmodified.
   *  (b) scrolls/focuses `AssignTemplateRolesControl` — a SEPARATE surface from the
   *      "roles" tab (it's the `formFooter`, inlined in the header card, always
   *      visible regardless of the active tab — see that component's own doc
   *      comment), so switching tabs alone would not bring it into view.
   *
   * Stub note: `saved.invitationStatus` (read by `PendingInvitationPill` above) is
   * shaped against the backend contract as PLANNED at hand-off time
   * ("PENDING" | "SENT" | "ACCEPTED" | null) — developer-1's `com.etendoerp.go` work
   * (auto-sending the invite email on create) was still in flight when this was
   * written. Re-verify the field name/shape once that lands.
   */
  const handleAfterCreate = useCallback((saved) => {
    if (!saved?.id) return;
    toast.dismiss();
    toast.success(ui('userCreatedInvitationSentToast'), {
      action: {
        label: ui('configureRolesAction'),
        onClick: () => {
          navigate(`/${windowName}/${saved.id}`, {
            replace: true,
            state: { openSecondaryTab: 'custom:roles' },
          });
          // Deferred: `openSecondaryTab` is picked up by a `DetailView.jsx` effect on
          // the next render tick, and `AssignTemplateRolesControl` (formFooter) may
          // not have painted its expanded toggle yet on the very first render after
          // create. Best-effort — if neither test-id is present (e.g. slow data load)
          // this silently no-ops rather than throwing.
          setTimeout(() => {
            const target = document.querySelector('[data-testid="AssignTemplateRolesControl__toggle-expand"]')
              ?? document.querySelector('[data-testid="AssignTemplateRolesControl__save-first"]');
            target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
            target?.focus?.();
          }, 50);
        },
      },
    });
  }, [navigate, ui, windowName]);

  return (
    <RoleSelectionProvider
      value={{ selectedRoleIds, setSelectedRoleIds }}>
      <UserPage
        {...props}
        newLabel={ui('newUser')}
        topbarExtra={PendingInvitationPill}
        onAfterCreate={handleAfterCreate}
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
    </RoleSelectionProvider>
  );
}
