import BulkDocumentAction, { buildPostActions, postRowFilter } from '@/components/contract-ui/BulkDocumentAction';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';

/**
 * ETP-5414 — bulk "Confirmar"/"Reactivar" amortización from the /amortization list view.
 *
 * Thin wrapper over the shared `BulkDocumentAction` (selection bar button, confirm
 * dialog, per-row `Promise.allSettled` loop, ok/omitted/failed toast). This file only
 * supplies WHICH actions to offer, WHICH rows are eligible for each, and how to label a row.
 *
 * ETP-5414 review — label convention matches every other bulk-action window (sales-order,
 * purchase-order, goods-receipt, etc.): the top-level `labelKey` on `<BulkDocumentAction>`
 * drives BOTH the selection-bar trigger button AND the confirm dialog's title (see
 * `BulkDocumentAction.jsx`'s own docblock at its `labelKey` prop) and is `"process"` →
 * "Procesar"/"Process". Each action's own `labelKey` drives only its "Acción de documento"
 * dropdown OPTION inside that dialog — `"confirm"` → "Confirmar", `"reactivate"` →
 * "Reactivar". `amortizationConfirmAction` is not used here at all — it belongs to
 * `AmortizationConfirmModal.jsx` (the single-record confirm modal), a different component.
 *
 * `actionMode="neoAction"` targets `POST {apiBaseUrl}/header/{id}/action/Processed` for
 * BOTH actions — verified by reading the code that runs each one today, not by analogy:
 * - Confirm: `AmortizationConfirmModal.jsx` posts straight to `/header/{id}/action/Processed`.
 * - Reactivate: the detail kebab (`DetailMoreActionsMenu.jsx`) has no `documentAction`/
 *   `neoAction` on the `reactivate` menuAction, only `columnName: "Processed"`, so it falls
 *   through to `hook.handleProcess({ columnName: 'Processed', ... })`
 *   (`useEntity.js:2332-2361`), which posts to `/${entity}/${id}/action/${columnName}` —
 *   the exact same URL as Confirm.
 * `fieldValues` in the body is ignored server-side either way (`NeoButtonActionHelper.
 * executeButtonActionCore` only ever merges `recordId`/`inpRecordId`/`inpTabId`/
 * `<table>_ID`, never reads `fieldValues`). So the server cannot tell "confirm" from
 * "reactivate" from the request at all — `a_amortization_process` (PL/pgSQL, read live from
 * the DB) decides the direction purely from the row's CURRENT `Processed`/`Posted` columns:
 *   IF (Processed='Y' AND Posted<>'Y') THEN  -- unprocess (reactivate)
 *   ELSIF (Processed='N') THEN               -- process (confirm), plus org/period checks
 *   ELSIF (Posted='Y') THEN RAISE EXCEPTION '@AmortizationDocumentPosted@';
 *   END IF;
 * This is WHY `BulkDocumentAction` needed the `neoActionName` escape hatch (see its own
 * docblock at the `execute`/`wireActionName` call site): `buildAmortizationActions` below
 * gives 'confirm' and 'reactivate' DISTINCT `value`s (so the Select and `rowFilter` can
 * tell the user's two intents apart) but the SAME `neoActionName: 'Processed'` (so both
 * hit the one real button/process that exists).
 *
 * **Why `rowFilter` re-validates lines for `confirm`, but only for `confirm`.** The
 * server-side process does NOT enforce any of the three checks the modal makes
 * client-side (missing %, non-positive amount, no lines at all) — confirmed against the
 * DB. Skipping them here would let the bulk action confirm a document the individual flow
 * blocks. Confirming a document with NO lines is the worst case: `TotalAmortization`
 * resolves to `NULL` via a `sum()` over zero rows, the document is left Processed with a
 * null total, and `a_amortizationline_trg` then refuses further edits — an irreversible
 * bad state. Reactivate needs NONE of this — its only precondition in the PL/pgSQL above
 * is `Processed='Y' AND Posted<>'Y'` — so firing the same `GET /lines?parentId={id}` fetch
 * for a reactivate selection would be N wasted round-trips for a check that action never
 * needs. The lines fetch runs ONLY inside the `action === 'confirm'` branch.
 *
 * **Reactivate on a `posted` row: unpost-then-reactivate, not a client-side block.**
 * Reversed from an earlier version of this file (which pre-filtered `posted` rows out).
 * The product decision, confirmed against the code: try to unpost first, then reactivate;
 * if the unpost genuinely cannot happen (accounting already settled — irreversible), let
 * that failure surface naturally as a `failed` row with the server's own message, instead
 * of silently deciding up front that a posted row is never reactivatable. This mirrors
 * `preUnpostActions` — the SAME mechanism `sales-invoice`/`purchase-invoice` already use
 * for their own Reactivate (`preUnpost: true` on the `RE` `documentAction`,
 * `BulkDocumentAction.jsx`'s `preUnpostActions` prop, `tools/app-shell/src/lib/
 * preUnpost.js`). Verified this actually reaches amortization's accounting, not assumed:
 * `runPreUnpost` calls `neoAction.execute(recordId, 'unpost')` →
 * `POST /header/{id}/action/unpost`, which `AmortizationHeaderHandler.handle()`
 * intercepts via `postingService.handleAction(context)` — the SAME generic
 * `DocumentPostingService` bean `SalesInvoiceHeaderHandler`/`PurchaseInvoiceHeaderHandler`
 * wire, whose `unpost()` runs `ResetAccounting.delete(...)` (deletes the `Fact_Acct` rows,
 * sets `Posted='N'`). Once that succeeds, the follow-up `Processed` call re-reads the row
 * from the DB — now genuinely `Posted<>'Y'` — and `a_amortization_process`'s unprocess
 * branch (`Processed='Y' AND Posted<>'Y'`) runs for real. If the unpost step itself fails,
 * `BulkDocumentAction.jsx`'s `runRow` throws before ever calling the `Processed` action,
 * so the row lands in `failed` with the server's message — never silently skipped.
 * `preUnpostActions` is keyed by the dropdown's `value` ('reactivate'), not by
 * `neoActionName` ('Processed') — confirmed by reading `BulkDocumentAction.jsx`'s
 * `preUnpostActions.includes(selectedAction)` check, which reads `selectedAction` (the
 * `value`) the same way `rowFilter` does.
 *
 * **Residual race — read the `rowFilter` comment below**, not fixable from the client:
 * the `confirm` branch is a STRICT whitelist read off the grid's (possibly stale) snapshot
 * of `processed`, which narrows but cannot close the window where the grid and the DB
 * disagree about which direction the toggle will actually run.
 *
 * **`isConfirmed` and `validateConfirmEligibility` are exported (ETP-5414 follow-up).**
 * The per-row kebab (`tools/app-shell/src/windows/custom/amortization/index.jsx`) needs
 * the EXACT SAME eligibility rule this file already enforces for the bulk bar — not a
 * hand-copied approximation that can drift. `validateConfirmEligibility` is the confirm
 * branch's whitelist + lines-validation, factored out so both call sites share one
 * implementation; `rowFilter` below is now a thin dispatcher over it.
 *
 * **Second bulk button — "Contabilizar" (post), a separate `<BulkDocumentAction>` next to
 * the Confirmar/Reactivar one, not a third dropdown option (ETP-5414 follow-up).** Mirrors
 * `sales-invoice`/`purchase-invoice`'s OWN bulk Post exactly — same two generic exports
 * (`buildPostActions`/`postRowFilter` from `BulkDocumentAction.jsx`), reused verbatim, no
 * amortización-specific wrapper needed: `postRowFilter`'s `isRowPosted`/`isRowProcessed`
 * gate (`posted !== 'Y'` AND `processed === 'Y'`) already matches amortización's OWN
 * `Post` detail-kebab precondition (`decisions.json → window.menuActions[1]`:
 * `visibleWhenFieldFalse: "posted"`, `visibleWhenFieldTrue: "processed"`) exactly. And
 * `POST /header/{id}/action/post` is handled by the SAME generic `DocumentPostingService.
 * handleAction` bean already verified for `unpost` (see above) — `post`/`unpost` are
 * symmetric branches of that one method, both gated only on `context.getFieldName()`, so
 * nothing amortización-specific has to happen server-side for `post` either.
 * `AmortizationHeaderHandler`'s existing (pre-ETP-5414) `Post` detail-kebab button already
 * proves this path works in production — this bulk button reaches the exact same endpoint.
 */

export const isConfirmed = (row) => row.processed === 'Y' || row.processed === true;

/**
 * The full "can this row be confirmed right now" check: whitelist (`isConfirmed`) plus the
 * three lines-validity checks (no lines / missing % / non-positive amount). Returns `true`
 * when eligible, or a translated reason string when not — same contract `rowFilter` and
 * `BulkDocumentAction`'s own gate expect. `apiFetch`/`ui` are passed in rather than closed
 * over, so a caller outside this component's own render (the row kebab, a different
 * component entirely) can reuse it with its own instances of both.
 */
export async function validateConfirmEligibility(row, apiFetch, ui) {
  // Whitelist: only a row NOT (affirmatively) confirmed passes.
  if (isConfirmed(row)) return ui('amortizationBulkAlreadyConfirmed');

  let lines = [];
  try {
    const res = await apiFetch(`/lines?parentId=${encodeURIComponent(row.id)}&_startRow=0&_endRow=999`);
    const body = await res.json().catch(() => null);
    lines = body?.response?.data ?? [];
  } catch {
    // ETP-5414 review — a fetch/parse failure is NOT the same fact as a document that
    // genuinely has zero lines: telling the user "no tiene líneas" when the request
    // just failed sends them to inspect the wrong thing (they open the document, see
    // the lines are there, and conclude the tool is broken). Own reason, own key.
    return ui('amortizationBulkValidationFailed');
  }

  if (lines.length === 0) return ui('amortizationBulkNoLines');
  if (lines.some((l) => l.amortizationPercentage == null || l.amortizationPercentage === '')) {
    return ui('amortizationErrorLinePercentageMissing');
  }
  if (lines.some((l) => Number(l.amortizationAmount ?? 0) <= 0)) {
    return ui('amortizationErrorLineAmountInvalid');
  }
  return true;
}

export const buildAmortizationActions = (rows) => {
  const actions = [];
  if (rows.some((row) => !isConfirmed(row))) actions.push({ value: 'confirm', neoActionName: 'Processed', labelKey: 'confirm' });
  if (rows.some(isConfirmed)) actions.push({ value: 'reactivate', neoActionName: 'Processed', labelKey: 'reactivate' });
  return actions;
};

export default function AmortizationBulkActions(props) {
  const ui = useUI();
  const apiFetch = useApiFetch(props.apiBaseUrl);

  const rowFilter = async (row, action) => {
    // ETP-5414 — both branches are a WHITELIST ("only let through a row I can positively
    // confirm is eligible"), not a blacklist ("let it through unless I see a reason not
    // to"). Reason: the server picks confirm-vs-reactivate by re-reading the row's live
    // state, but this filter can only see the GRID's snapshot of that same state, which
    // may be stale (edited from another tab/session since the grid last loaded). A
    // blacklist would let a row through on absence of evidence; a whitelist requires
    // positive evidence, which is the smaller — though not zero — risk. Concretely: if the
    // grid still shows `processed: 'Y'` for a row someone already reactivated elsewhere,
    // the user picking "Reactivar" here would (without this filter) send a request that
    // the server — seeing the NOW-true state `Processed='N'` — runs through the CONFIRM
    // branch instead, silently doing the opposite of what the user asked and reporting it
    // as a success in the toast. Requiring `row.processed === 'Y'` here does not close that
    // window (the grid can still be stale in the instant between this check and the
    // request landing), it only narrows it to a smaller race than a blacklist would leave.
    // Closing it for real needs the server to receive the user's actual INTENT instead of
    // inferring it from state — a separate, already-flagged follow-up.
    if (action === 'confirm') return validateConfirmEligibility(row, apiFetch, ui);

    if (action === 'reactivate') {
      // Whitelist: only an affirmatively confirmed row passes — same reasoning as the
      // confirm branch's whitelist, inverted. Deliberately NO `posted` check here (see the
      // file's top docblock): a posted row is allowed through, `preUnpostActions={['reactivate']}`
      // below unposts it first, and if that genuinely cannot happen the row fails naturally
      // instead of being pre-blocked. No lines fetch either way — reactivate's only
      // precondition server-side is `Processed='Y' AND Posted<>'Y'`.
      if (!isConfirmed(row)) return ui('amortizationBulkNotConfirmed');
      return true;
    }

    return true;
  };

  return (
    <>
      <BulkDocumentAction
        {...props}
        entity="header"
        actionMode="neoAction"
        buildActions={buildAmortizationActions}
        rowFilter={rowFilter}
        rowLabel={(row) => row.name || row.id}
        labelKey="process"
        // Unpost-then-reactivate for a posted row — see the file's top docblock. Keyed by
        // the dropdown VALUE ('reactivate'), matching `preUnpostActions.includes(selectedAction)`
        // in BulkDocumentAction.jsx, never by `neoActionName`.
        preUnpostActions={['reactivate']}
      />
      {/* ETP-5414 — bulk "Contabilizar", reusing the generic post gate verbatim (see file
          docblock). rowLabel repeated here too — amortización has no `documentNo`, and each
          `<BulkDocumentAction>` instance needs its own copy of the prop. */}
      <BulkDocumentAction
        {...props}
        actionMode="neoAction"
        buildActions={buildPostActions}
        rowFilter={postRowFilter}
        rowLabel={(row) => row.name || row.id}
        labelKey="post"
      />
    </>
  );
}
