import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useNeoAction } from '@/hooks/useNeoAction';
import { translateBackendError } from '@/lib/backendErrors.js';
import HeaderPage, { api } from '@generated/amortization/generated/web/amortization/HeaderPage';
import HeaderTable from '@generated/amortization/generated/web/amortization/HeaderTable';
import AmortizationBulkActions, { isConfirmed, validateConfirmEligibility } from '@generated/amortization/custom/AmortizationBulkActions';
import { isRowPosted, isRowProcessed } from '@/components/contract-ui/BulkDocumentAction';

/* eslint-disable react/prop-types */

// Sonar S6478 — a component-like function defined inline inside a parent's render body is
// recreated on every render, which can cause avoidable remounts. Defined at module scope so
// `ListView`'s `bulkActions` slot (`ListView.jsx`: `bulkActions({ selectedRows, ... })`, a plain
// function call, not a `<bulkActions/>` JSX element) gets a stable reference instead.
function renderAmortizationBulkActions(ctx) {
  return <AmortizationBulkActions {...ctx} data-testid="AmortizationBulkActions__c5474e" />;
}

/**
 * ETP-5414 — per-row kebab ("⋮") for /amortization, offering "Confirmar"/"Reactivar" on
 * each grid row individually, alongside the multi-select bulk bar already shipped
 * (`AmortizationBulkActions.jsx`).
 *
 * **Why this file exists — the generated ListView cannot carry this.** The pipeline's own
 * `artifacts/amortization/generated/web/amortization/HeaderPage.jsx` renders `<ListView>`
 * for the grid branch, but `generate-frontend.js` never emits a `menuActions` entry inside
 * that call's `rowQuickActions` prop for ANY window (verified against sales-order's and
 * purchase-invoice's own generated `HeaderPage.jsx` — same gap). A generated file can never
 * be hand-edited to add it (a window's `generated/` artifact dir is output, not source), and the fix
 * belongs to the generator (`schema_forge_core`, a separate repo), not to this window.
 *
 * The established workaround — already used by `sales-order`, `purchase-order`,
 * `sales-invoice` and `purchase-invoice` (`tools/app-shell/src/windows/custom/<name>/
 * index.jsx`, each with the same literal comment: "The list view here bypasses the
 * generated HeaderPage and renders ListView") — is a small custom `index.jsx` that keeps
 * the DETAIL branch exactly as the pipeline generates it (`<HeaderPage>`, untouched) and
 * replaces ONLY the LIST branch with a hand-written `<ListView>` carrying the extra
 * `rowQuickActions.menuActions`. `purchase-invoice/index.jsx` is the closest reference
 * (a plain `useMemo`, no shared "order family" hook needed) — this file mirrors that
 * pattern, not `useOrderWindow.jsx`'s (which is order-specific: confirm currency checks,
 * manage-docs launcher, etc., none of which apply here).
 *
 * **Visual scope (corrected after browser testing — an earlier version of this file
 * over-read "only show the three dots" as "only the three dots, nothing else" and also
 * suppressed Edit; that was wrong).** The actual scope: this window keeps whatever
 * `RowQuickActions.jsx` already shows by DEFAULT (Edit) and ADDS the kebab — it does not
 * remove anything that worked before. No duplicar/email, but that was never something to
 * suppress either, see below.
 * - Edit is left at its DEFAULT (visible) — no `actions.edit` override. It renders
 *   UNCONDITIONALLY whenever `rowQuickActions` is enabled at all (no gate on `onEdit` being
 *   present — `ListView.jsx`'s `effectiveRowQuickActions` injects a default `onEdit` for
 *   every enabled window), so simply not touching `actions.edit` keeps it exactly as it was
 *   before this file existed.
 * - Clone requires `onClone` to be truthy (`RowQuickActions.jsx`: `!readOnly && onClone &&
 *   ...`) — simply never passing `onCloneRow`/`onClone` keeps it off, nothing to set.
 * - Email requires `sendDocument.enabled !== false` OR a truthy `documentPreview`.
 *   `ListView.jsx` auto-detects "documental windows" from the contract when `sendDocument`
 *   is omitted (`effectiveSendDocument`, keyed on a `documentNo` column existing) —
 *   amortización has no `documentNo` (its `titleField` is `name`), so this is already off
 *   by construction; nothing to set here either.
 * - Delete: mirrors the generated ListView's own `rowQuickActions={{"hideDeleteButton":true}}`
 *   (from `decisions.json → window.hideDeleteButton`).
 *
 * **Confirm vs Reactivate — same wire action, two different execution shapes, exactly
 * mirroring `AmortizationBulkActions.jsx`'s own reasoning (see that file's docblock for the
 * full server-side evidence — not re-derived here):**
 * - `confirm`: NOT expressible as a declarative `neoAction` menu entry, because its
 *   eligibility needs an ASYNC lines-validity check (missing %, non-positive amount, no
 *   lines), and `RowQuickActions.jsx`'s `menuActions` builder is read SYNCHRONOUSLY —
 *   confirmed by reading the component (`typeof menuActions === 'function' ?
 *   menuActions({row,...}) : menuActions`, no `await` anywhere in that path; an async
 *   function there would resolve to a Promise, fail the `Array.isArray` guard, and hide the
 *   whole kebab silently). So this entry's `visible` only gates the SYNC precondition
 *   (`!isConfirmed(row)`, same as the bulk offers "Confirmar"), and the lines check runs at
 *   CLICK time inside `onClick` instead — the same async-validate-then-act pattern
 *   `sales-order`'s own bespoke `confirm` kebab entry already uses
 *   (`useOrderWindow.jsx:132-160`). `validateConfirmEligibility` is imported straight from
 *   `AmortizationBulkActions.jsx` rather than re-implemented, so the row kebab and the bulk
 *   bar can never silently drift on what "eligible to confirm" means.
 * - `reactivate`: needs no async check (its only precondition is
 *   `Processed='Y' AND Posted<>'Y'`, both already on the row), so it stays fully
 *   declarative: `neoAction: 'Processed'` + `preUnpost: true` — the exact same
 *   unpost-then-reactivate mechanism the bulk bar's `preUnpostActions={['reactivate']}`
 *   already uses, now supported by `RowQuickActions.jsx` itself (see that component's
 *   docblock for the `neoActionName`/`preUnpost` extension this window's reactivate entry
 *   exercises).
 *
 * **Toasting**: `RowQuickActions.jsx` deliberately never toasts for the declarative
 * `documentAction`/`neoAction` paths ("toast/snackbar is the host's responsibility" — see
 * its own docblock) — mirrors `buildInvoiceRowQuickActions`'s (`useInvoiceWindow.js`)
 * identical `onMenuActionExecuted` toast wiring for its own `post` neoAction entry. The
 * `confirm` entry is the one exception: it toasts directly inside its own `onClick` (it
 * needs the raw validation-failure REASON string, not the generic success/actionFailed
 * pair `onMenuActionExecuted` applies to every other entry), so `onMenuActionExecuted`
 * skips it explicitly to avoid a double toast.
 *
 * **Third entry — `post` ("Contabilizar"), added alongside the bulk bar's own "Contabilizar"
 * button (`AmortizationBulkActions.jsx`).** Fully declarative like `reactivate`, no
 * `onClick`: its only precondition (`processed === 'Y' && !posted`) is already on the row,
 * synchronously, and `post` needs no preUnpost step (unlike `reactivate`, there is nothing
 * to reverse first — posting a not-yet-posted document is the base case, not a toggle back
 * from an already-posted one). `visible` reuses `isRowProcessed`/`isRowPosted` imported from
 * `BulkDocumentAction.jsx` — the SAME predicates `postRowFilter`/`buildPostActions` use for
 * the bulk button — instead of a third hand-written copy of `row.posted === 'Y' || ...`.
 * `successKey: 'documentPosted'` matches `decisions.json → window.menuActions[1]`'s own
 * `Post` detail-kebab entry, so the success toast reads identically wherever the user posts
 * from. Falls into the generic `onMenuActionExecuted` branch (toast + refresh), same as
 * `reactivate` — nothing amortización-specific needed there either.
 */
export default function AmortizationWindow(props) {
  const {
    recordId, windowName, apiBaseUrl, token,
  } = props;
  const ui = useUI();
  const apiFetch = useApiFetch(apiBaseUrl);
  const neoAction = useNeoAction({
    specName: windowName, entityName: 'header', apiBaseUrl, token,
  });
  const [refreshKey, setRefreshKey] = useState(0);

  // ETP-4520 — mirrors purchase-invoice/index.jsx's identical rationale: this hand-rolled
  // list view never delegates to the generated HeaderPage, so it never picks up its
  // access-tier guard on its own. The generated `<HeaderPage>` below still guards itself
  // for the DETAIL branch (`useWindowAccess('800026')` inside it, untouched) — this check
  // covers the LIST branch only, which is the one this file actually replaces.
  const windowAccessTier = useWindowAccess('800026');
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);

  const rowQuickActions = useMemo(() => ({
    enabled: true,
    // No `actions.edit` override — Edit stays at its default (visible), unchanged from
    // before this file existed. See the file docblock's "Visual scope" note.
    hideDeleteButton: true,
    menuActions: ({ row }) => [
      {
        key: 'confirm',
        labelKey: 'confirm',
        visible: !isConfirmed(row),
        onClick: async ({ row: r }) => {
          const reason = await validateConfirmEligibility(r, apiFetch, ui);
          if (reason !== true) {
            toast.error(reason);
            return { success: false, message: reason };
          }
          const result = await neoAction.execute(r.id, 'Processed');
          if (result?.success === false) {
            toast.error(translateBackendError(result.message, ui) || ui('actionFailed'));
          } else {
            toast.success(ui('actionCompleted'));
            setRefreshKey((k) => k + 1);
          }
          return result;
        },
      },
      {
        key: 'reactivate',
        labelKey: 'reactivate',
        visible: isConfirmed(row),
        neoAction: 'Processed',
        preUnpost: true,
        successKey: 'reactivated',
      },
      {
        key: 'post',
        labelKey: 'post',
        visible: isRowProcessed(row) && !isRowPosted(row),
        neoAction: 'post',
        successKey: 'documentPosted',
      },
    ],
    onMenuActionExecuted: (action, result) => {
      // 'confirm' already toasted (success or failure) and refreshed inside its own
      // onClick above — it needs the raw validation reason, which this generic handler
      // doesn't have. 'reactivate' and 'post' (and any future declarative entry) reach
      // here — mirrors buildInvoiceRowQuickActions' (useInvoiceWindow.js) identical split.
      if (action.key === 'confirm') return;
      if (result?.success === false) {
        toast.error(translateBackendError(result?.message, ui) || ui('actionFailed'));
      } else {
        toast.success((action.successKey ? ui(action.successKey) : action.successMessage) || ui('actionCompleted'));
      }
      setRefreshKey((k) => k + 1);
    },
  }), [apiFetch, neoAction, ui]);

  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="800026" data-testid="WindowAccessGuard__amortization" />;
  }

  if (recordId) {
    return <HeaderPage {...props} data-testid="HeaderPage__amortization" />;
  }

  return (
    <ListView
      entity="header"
      Table={HeaderTable}
      entityLabel="Amortization"
      windowName={windowName}
      // Mirrors artifacts/amortization/generated/web/amortization/HeaderPage.jsx's own
      // `breadcrumb` const — not exported by that module, so duplicated here. This window
      // bypasses that generated ListView branch (see file docblock), so the generator's
      // own breadcrumb never reaches it.
      breadcrumb="Finance / Amortization"
      api={api}
      bulkActions={renderAmortizationBulkActions}
      listbarPaddingX="px-2"
      tablePaddingX="px-2"
      hidePrint
      hideCreate
      hideLink
      labelOverrides={api.labelOverrides}
      rowQuickActions={rowQuickActions}
      listSortBy="accountingDate desc"
      refreshTrigger={refreshKey}
      {...props}
      window={effectiveWindow}
      data-testid="ListView__amortization"
    />
  );
}
