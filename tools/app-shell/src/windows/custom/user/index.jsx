import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import UserPage from '@generated/user/generated/web/user/UserPage';
import UserRolesTab from './UserRolesTab';
import { AttachmentsTab } from '@/components/attachments';
import { RoleSelectionProvider } from './roleSelectionContext.js';
import { fetchUserRoleAssignments, saveUserRoleAssignments } from '@/lib/userRoleAssignmentsApi.js';
import { RECORD_SAVE_TOAST_ID } from '@/hooks/useEntity';
import { runInlineToggleRequest } from '@/components/contract-ui/DataTable.jsx';
import { Switch } from '@/components/ui/switch';
import PendingInvitationPill from './PendingInvitationPill.jsx';

function sameIdSet(a, b) {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((id) => setA.has(id));
}

/**
 * ETP-4830 — 'Activo' active/inactive Switch, rendered in the SAME `topbarExtra`
 * slot as `PendingInvitationPill` above (see `TopbarExtra` below) — matches the
 * ticket's reference screenshot, which places the pending-invite pill next to an
 * "Inactivo" active/inactive toggle in the detail-form header. Mirrors the Users
 * grid's own inline "Activo" column (`UserHeaderTable.jsx`, `active` field's
 * `inlineToggle: true` in `artifacts/user/decisions.json`) — same live-PATCH
 * behavior, reusing the exact same request/optimistic-update/error-toast helper
 * (`runInlineToggleRequest`, exported from `DataTable.jsx` for this reuse) instead
 * of re-implementing it here.
 *
 * De-activating a user only flips `AD_User.IsActive` — it never deletes the record
 * or blocks an admin from still opening/editing it afterward (standard Etendo
 * de-activation semantics; see the field's own AD help text, quoted in this ticket's
 * `active` field decision in `decisions.json`).
 *
 * Hidden entirely while creating a new user (no `id`/`recordId` yet to PATCH against
 * — same guard `AssignTemplateRolesControl` uses for its own save-first placeholder).
 */
function ActiveStatusToggle({ data, recordId, token, apiBaseUrl, onRefresh }) {
  const ui = useUI();
  const [optimisticToggles, setOptimisticToggles] = useState({});
  const [savingToggles, setSavingToggles] = useState({});
  const id = data?.id || recordId;
  const toggleKey = 'active';

  if (!id || id === 'new') return null;

  const rawValue = Object.hasOwn(optimisticToggles, toggleKey) ? optimisticToggles[toggleKey] : data?.active;
  const checked = rawValue === true || rawValue === 'Y' || rawValue === 'true';
  const disabled = !!savingToggles[toggleKey];

  const handleCheckedChange = (nextChecked) => {
    runInlineToggleRequest({
      apiBaseUrl,
      entity: 'user',
      row: { id },
      col: { key: 'active' },
      token,
      checked: nextChecked,
      toggleKey,
      setOptimisticToggles,
      setSavingToggles,
      onDataMutated: onRefresh,
    }).catch((err) => {
      console.error('Failed to toggle user active status:', err);
    });
  };

  return (
    <div className="flex items-center gap-2" data-testid="ActiveStatusToggle__toolbar">
      <span className="text-sm text-muted-foreground">{ui('active')}</span>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={handleCheckedChange}
        aria-label={ui('active')}
        data-testid="ActiveStatusToggle__switch" />
    </div>
  );
}

/**
 * ETP-4830 — composite `topbarExtra` component: pending-invitation pill first, then
 * the active/inactive toggle, matching the reference screenshot's visual order
 * (pill-then-toggle is the reasonable default absent a pixel-exact mockup).
 * `ActiveStatusToggle` reads straight off the same props `DetailView.jsx` passes into
 * `topbarExtra` (`data`, `recordId`, `token`, `apiBaseUrl`, `onRefresh`, ...) — spread
 * straight through. `PendingInvitationPill` (`./PendingInvitationPill.jsx`, extracted
 * so the Users LIST GRID can render the identical pill per row — see that file's own
 * doc comment) only needs the raw status value, so only `data?.invitationStatus` is
 * pulled out of `props` for it, rather than spreading the whole prop bag.
 */
function TopbarExtra(props) {
  return (
    <div className="flex items-center gap-3" data-testid="UserTopbarExtra">
      <PendingInvitationPill
        status={props.data?.invitationStatus}
        data-testid="PendingInvitationPill__toolbar" />
      <ActiveStatusToggle {...props} />
    </div>
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
 *    comparison below. Conversely, whenever `recordId` is falsy/`'new'` the SAME effect
 *    explicitly resets both to `[]` — this `UserWindow` instance is not guaranteed to
 *    remount when navigating from viewing an existing user straight to "New user" (same
 *    route pattern, `recordId` prop just changes), so without this reset the previous
 *    user's roles would linger in state and render as already-selected chips on the
 *    blank create form (ETP-4830 regression fix — confirmed via `ad_user_roles` that
 *    nothing was actually persisted; purely stale client state, never a real assignment).
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
    // A genuinely new/blank record must always start with zero roles selected. Without
    // this explicit reset, navigating from an EXISTING user (whose roles were already
    // fetched into `selectedRoleIds`/`appliedRoleIdsRef`) straight to "New user" — same
    // `UserWindow` component instance, `recordId` prop just changes from a real id to
    // `'new'`/undefined, no remount — left the previous user's role selection in state,
    // so the blank create form rendered someone else's roles as already-selected,
    // removable chips. Confirmed via DB (`ad_user_roles`) that nothing was actually
    // persisted for these brand-new users — purely a stale client-side state bug.
    if (!recordId || recordId === 'new') {
      appliedRoleIdsRef.current = [];
      setSelectedRoleIds([]);
      return undefined;
    }
    if (!token || !apiBaseUrl) return undefined;
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
   * Passing the SAME `RECORD_SAVE_TOAST_ID` id that `showSaveSuccessToast`
   * (`useEntity.js`) used for that toast makes sonner UPDATE it in place instead of
   * creating a second one, so only ONE toast is ever visible at a time, per this
   * ticket's decision to show a single toast (there is no generic "silent create"
   * opt-out on the shared Save button that wouldn't also affect every other window
   * using `onAfterCreate`, so an id-based replace is the window-scoped fix instead
   * of a `DetailView.jsx` behavior change).
   *
   * ETP-4830 regression fix: this used to call `toast.dismiss()` (no id — dismiss
   * ALL toasts) immediately followed by `toast.success(...)`. That is a real race —
   * sonner schedules a dismiss via `requestAnimationFrame` and a new toast's mount
   * via `setTimeout`, two independently-scheduled callbacks with no ordering
   * guarantee between them — and on a real click (save → navigate → re-render of
   * the freshly-loaded record, all happening immediately after), the add could lose
   * the race and the toast would never appear at all. Passing a shared id turns the
   * two-step "dismiss then create" into one atomic `toast.success(msg, { id })`
   * call — sonner's own `ToastState.create()` updates an existing id in place via a
   * single synchronous `publish()`, the exact same code path a normal single toast
   * call uses, so there is no dismiss/add race left to lose.
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
   * `saved.invitationStatus` (read by `PendingInvitationPill` above) matches the
   * confirmed `com.etendoerp.go` contract: `"PENDING" | "SENT" | "ACCEPTED" |
   * "EXPIRED" | "REVOKED" | "DELIVERY_FAILED" | null`, present on every `user` GET
   * response.
   */
  const handleAfterCreate = useCallback((saved) => {
    if (!saved?.id) return;
    toast.success(ui('userCreatedInvitationSentToast'), {
      id: RECORD_SAVE_TOAST_ID,
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
        topbarExtra={TopbarExtra}
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
