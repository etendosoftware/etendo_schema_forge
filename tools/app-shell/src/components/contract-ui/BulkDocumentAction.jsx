import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog.jsx';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select.jsx';
import { Label } from '@/components/ui/label.jsx';
import { FileCheck, Loader2 } from 'lucide-react';
import { useUI } from '@/i18n';
import { useDocumentAction } from '@/hooks/useDocumentAction';
import { useNeoAction } from '@/hooks/useNeoAction';
import { showBulkActionToast, persistBulkActionResult } from '@/hooks/useBulkActionToast';
import { runPreUnpost } from '@/lib/preUnpost.js';
import { translateBackendError } from '@/lib/backendErrors.js';

export const buildInOutActions = (rows) => {
  const hasDraft = rows.some((r) => (r.documentStatus || r.docStatus) === 'DR');
  return hasDraft ? [{ value: 'CO', labelKey: 'confirm' }] : [];
};

// ETP-5209 — generic bulk "Contabilizar" (post) action, reused by
// purchase-invoice/sales-invoice/goods-receipt/goods-shipment. Mirrors the same
// posted/processed gate as the row-kebab and form-view Post menu action: a
// document must be processed (completed) and not yet posted.
// ETP-5414 — exported (were private consts) so a per-row consumer (the row kebab's
// declarative `post` menuAction, e.g. amortización's `index.jsx`) can reuse the EXACT same
// posted/processed predicates instead of a third hand-copied definition — this repo already
// had this pair written twice (here and, before this export, nowhere else — the row kebab
// would have been the third).
export const isRowPosted = (row) => row.posted === 'Y' || row.posted === true;
export const isRowProcessed = (row) => row.processed === 'Y' || row.processed === true;

export const buildPostActions = (rows) =>
  (rows.some((row) => !isRowPosted(row) && isRowProcessed(row)) ? [{ value: 'post', labelKey: 'post' }] : []);

// Plain function (not a hook-producing factory): `ui` is passed in at call
// time by BulkDocumentAction's own `handleDone`, which already holds a safe
// `useUI()` result from its own top-level hook call. A caller-side factory
// like `createPostRowFilter(ui)` would force every `bulkActions` wrapper
// (a plain function invocation, not JSX — see ListView.jsx) to call
// `useUI()` itself, which is a Rules-of-Hooks violation once that wrapper's
// hook count becomes conditional on whether the selection toolbar is
// mounted (ETP-5209 production bug — "Rendered more hooks than during the
// previous render").
// ETP-5302 — the mirror of buildPostActions/postRowFilter, for the bulk "Descontabilizar"
// button. Kept as a SEPARATE pair rather than teaching the post ones to also emit 'unpost':
// sales-invoice and purchase-invoice mount the post pair too, and they must NOT offer a
// standalone unpost — for an invoice, reversing the accounting is part of Reactivate
// (`preUnpost`), never a user-facing action of its own. Only goods-receipt and
// goods-shipment, whose detail kebab already exposes "Descontabilizar", mount this pair.
export const buildUnpostActions = (rows) =>
  (rows.some(isRowPosted) ? [{ value: 'unpost', labelKey: 'unpost' }] : []);

export const unpostRowFilter = (row, action, ui) => {
  if (action !== 'unpost') return true;
  if (!isRowPosted(row)) return ui('bulkRowNotPosted');
  return true;
};

export const postRowFilter = (row, action, ui) => {
  if (action !== 'post') return true;
  if (isRowPosted(row)) return ui('bulkRowAlreadyPosted');
  if (!isRowProcessed(row)) return ui('bulkRowNotCompleted');
  return true;
};

export default function BulkDocumentAction({
  selectedRows, clearSelection, token, apiBaseUrl, windowName,
  // ETP-5302 — in-place list refetch supplied by ListView's `bulkActions` slot. When
  // absent (a host that mounts this outside that slot) we fall back to the legacy
  // persist-then-full-reload path, so no caller can silently lose its result toast.
  refresh,
  entity = 'header',
  buildActions,
  rowFilter,
  labelKey = 'bulkCompletion',
  actionMode = 'documentAction',
  // ETP-5302 — document actions that must reverse the accounting of an already-posted
  // record before they run, mirroring the `preUnpost: true` flag those same actions carry
  // in `decisions.json` for the detail kebab. Opt-in per window rather than applied to
  // every 'RE': an order's PL/SQL has no posted-state guard at all (C_ORDER_POST1), so
  // unposting there would be a gratuitous accounting reversal, while an invoice's does
  // block RE while Posted='Y' (C_INVOICE_POST) — which is exactly the bug this closes.
  preUnpostActions = [],
  // ETP-5414 — row identifier used to label a row in the ok/omitted/failed toast.
  // Defaults to the DocAction-window convention (`documentNo`, falling back to `id`).
  // A window with no `documentNo` at all (e.g. amortization, whose readable identifier
  // is `name`) passes its own `rowLabel={(row) => row.name || row.id}` instead of
  // patching this default for every caller.
  rowLabel = (row) => row.documentNo || row.id,
  windowReadOnly = false,
}) {
  const ui = useUI();
  const docAction = useDocumentAction({ apiBaseUrl, entity, token });
  const neoAction = useNeoAction({ specName: windowName, entityName: entity, apiBaseUrl, token });
  // ETP-5075 — `actionMode: 'neoAction'` retargets the per-row call from the DocAction
  // endpoint (`/action/documentAction` with a `{docAction}` body) to the generic NEO action
  // endpoint (`/action/{name}`), so each `buildActions` value is an action NAME instead of a
  // DocAction code. That is what lets a window whose actions are not DocActions at all —
  // e.g. matched-purchase-invoices' accounting `post`/`unpost` — reuse this whole modal.
  //
  // The adapter is load-bearing, not ceremony: `useNeoAction.execute` RESOLVES with
  // `{ success: false }` on failure (its own javadoc contrasts itself with
  // useDocumentAction, which throws), while `handleDone` below detects failures via
  // Promise.allSettled's 'rejected' status. Without normalising to a throw, every failed
  // row would be silently counted as a success and the toast would report "N ok, 0 failed".
  const execute = actionMode === 'neoAction'
    ? async (recordId, actionName, requestBody) => {
      const result = await (requestBody === undefined
        ? neoAction.execute(recordId, actionName)
        : neoAction.execute(recordId, actionName, requestBody));
      if (!result?.success) {
        const err = new Error(result?.message || 'Unknown error');
        // ETP-5316 — carry the AD_MESSAGE keys across the resolve→throw normalisation too,
        // otherwise this adapter would be the one path that loses them.
        err.messageKeys = result?.messageKeys;
        throw err;
      }
      return result;
    }
    : docAction.execute;
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [selectedAction, setSelectedAction] = useState(null);

  const actions = useMemo(() => {
    if (buildActions) return buildActions(selectedRows);
    const statusOf = (r) => r.documentStatus || r.docStatus;
    const hasDraft = selectedRows.some((r) => statusOf(r) === 'DR');
    const hasCompleted = selectedRows.some((r) => statusOf(r) === 'CO');
    const out = [];
    if (hasDraft) out.push({ value: 'CO', labelKey: 'confirm' });
    if (hasCompleted) out.push({ value: 'RE', labelKey: 'reactivate' });
    return out;
  }, [selectedRows, buildActions]);

  if (selectedRows.length === 0 || actions.length === 0 || windowReadOnly) return null;

  const handleOpen = () => {
    setSelectedAction(actions[0].value);
    setOpen(true);
  };

  const handleDone = async () => {
    if (running || !selectedAction) return;
    setRunning(true);

    // ETP-5209 — `omitted` (pre-blocked by `rowFilter`, never sent to the API) is kept
    // separate from `failed` (the API call was actually attempted and threw). Merging
    // them used to make a correctly-skipped "not eligible yet" row read as a genuine
    // failure in the toast — see useBulkActionToast.js for how the 3 counts render.
    let rowsToProcess = selectedRows;
    const omitted = [];
    if (rowFilter) {
      // ETP-5414 — `rowFilter` MAY be async (return a Promise). Every row's gate is
      // evaluated in PARALLEL (`Promise.all`), not one row's `await` after another: with a
      // large selection a serial per-row round-trip (e.g. amortization's lines fetch) would
      // chain N network round-trips before the user sees anything. `Promise.resolve` on a
      // plain sync return value is a no-op, so every existing sync rowFilter (post/unpost,
      // reactivate, matched-invoice) is unaffected — `Promise.all` over already-resolved
      // values settles on the same microtask turn as before.
      // No concurrency cap here deliberately: the action-execution fan-out below
      // (`Promise.allSettled(rowsToProcess.map(runRow))`) already runs uncapped, so capping
      // only the gate would be inconsistent with the rest of this component.
      const results = await Promise.all(
        selectedRows.map((row) => Promise.resolve(rowFilter(row, selectedAction, ui))),
      );
      rowsToProcess = [];
      // Classify in selection order (not resolution order) so `omitted` reads the same list
      // the user selected, regardless of which row's fetch happened to resolve first.
      selectedRows.forEach((row, i) => {
        const result = results[i];
        if (result === true || result == null) {
          rowsToProcess.push(row);
        } else {
          omitted.push({ documentNo: rowLabel(row), message: result });
        }
      });
    }

    // ETP-5414 — the dropdown's `value` (the user's INTENT, e.g. 'confirm' / 'reactivate')
    // is not always the wire action name the NEO endpoint expects. Amortization's confirm
    // and reactivate are two different user intents that hit the exact same button/process
    // (`columnName: 'Processed'`) — the PL/pgSQL process itself decides which direction to
    // run in by reading the record's CURRENT state, not by anything the request sends. So
    // `value: 'confirm'`/`value: 'reactivate'` (needed for the Select and for `rowFilter` to
    // tell the two intents apart) cannot ALSO be the URL segment — neither name is a real
    // button columnName, so either 404s. `neoActionName` is the escape hatch: an OPTIONAL
    // per-action override of the wire name, defaulting to `value` so every existing caller
    // (post/unpost, CO/RE, matched-invoice) — whose `value` already IS the real action name —
    // is unaffected.
    const selectedActionDef = actions.find((a) => a.value === selectedAction);
    const wireActionName = selectedActionDef?.neoActionName ?? selectedAction;
    // ETP-5445 — OPTIONAL per-action request body, neoAction mode only: an action backed by an
    // AD process whose mandatory parameters are validated at the request root (Internal
    // Consumption's `processNow` needs `{ action: 'CO' }`) is rejected with "Missing mandatory
    // parameter" when sent the default empty body. `undefined` — every existing caller —
    // leaves useNeoAction sending its literal `'{}'`, and documentAction mode never receives
    // one (its third parameter is an unrelated `{ onSuccess, onError }` options bag).
    const wireActionBody = actionMode === 'neoAction' ? selectedActionDef?.neoActionBody : undefined;

    // ETP-5302 — each row runs the same two-step sequence the detail kebab runs for an
    // action flagged `preUnpost`: reverse the accounting first, then the document action.
    // Without this the bulk bar sent a bare `docAction: 'RE'` for a posted invoice and
    // Core's C_INVOICE_POST rejected it with "Factura contabilizada", so reactivating from
    // the list failed while reactivating the very same invoice from its form succeeded.
    // A failed unpost aborts that row (never reactivate a document still carrying its
    // accounting entries) and is reported as the row's failure message, like any other.
    const runRow = async (row) => {
      const pre = await runPreUnpost({
        recordId: row.id,
        record: row,
        enabled: preUnpostActions.includes(selectedAction),
        execute: neoAction.execute,
      });
      if (!pre.success) {
        throw new Error(translateBackendError(pre.message, ui) || ui('actionFailed'));
      }
      // Arity kept at two when there is no body, so every existing call is unchanged.
      await (wireActionBody === undefined
        ? execute(row.id, wireActionName)
        : execute(row.id, wireActionName, wireActionBody));
      return row;
    };

    const outcomes = await Promise.allSettled(rowsToProcess.map(runRow));
    const failed = outcomes
      .map((o, i) => ({ o, row: rowsToProcess[i] }))
      .filter(({ o }) => o.status === 'rejected')
      .map(({ o, row }) => ({
        documentNo: rowLabel(row),
        message: o.reason?.message || 'Unknown error',
        // ETP-5316 — the AD_MESSAGE keys behind `message`, so useBulkActionToast's single-record
        // path can translate a core document-action failure by identity instead of by prose.
        // Plain strings, so they survive the sessionStorage JSON round-trip below unchanged;
        // `undefined` drops out of JSON.stringify by itself, leaving the pre-ETP-5316 shape.
        messageKeys: o.reason?.messageKeys,
      }));
    const ok = rowsToProcess.length - failed.length;
    const result = { ok, omitted, failed };
    setRunning(false);
    setOpen(false);

    // ETP-5302 — refetch the rows in place. The old path persisted the result to
    // sessionStorage and reloaded the whole page; that reload was never about the data,
    // it was how the toast survived until `useBulkActionToast`'s mount effect could read
    // it back. Showing the toast directly removes the only reason to reload, so scroll
    // position, active filters and the SPA itself all survive the action.
    // (Spelling the reload call out in prose here would break the "exactly one reload
    // call site" guard in BulkDocumentAction.test.js, which counts source occurrences.)
    if (refresh) {
      clearSelection();
      showBulkActionToast(ui, result);
      refresh();
      return;
    }

    // No refetch available (mounted outside ListView's `bulkActions` slot): keep the
    // legacy behaviour rather than dropping the result on the floor.
    persistBulkActionResult(result);
    const delay = (failed.length === 0 && omitted.length === 0) ? 600 : 1500;
    setTimeout(() => {
      clearSelection();
      window.location.reload();
    }, delay);
  };

  return (
    <>
      {/* ETP-4972 — plain hand-rolled button (not the shared shadcn Button):
          Button's size="sm" bakes in text-xs + `[&_svg]:size-4`, and that
          descendant selector beats a child's own `h-3.5 w-3.5` classes on
          CSS specificity alone regardless of Tailwind/twMerge class order —
          it was rendering this button smaller-text/bigger-icon than the
          sibling "Crear factura" button (BulkInvoiceFromShipment.jsx), which
          made the pair look mismatched even though both are Figma "Size: md".
          Mirrors that button's classes exactly so both render identically.
          Keeps its text label: Ale (design) confirmed icon-only is fine for
          universally-recognized actions (print, clone, delete) but this one
          needs it — the same checklist icon here means "Procesar" in some
          windows and "Procesado masivo" in others depending on `labelKey`,
          so the icon alone isn't even consistently meaningful. Figma
          "Confirmar" button (Button 7, verified in Dev Mode): icon
          file-checkmark → lucide FileCheck, padding 7px/12px, gap 4px. */}
      <button
        type="button"
        disabled={running}
        onClick={handleOpen}
        title={ui(labelKey)}
        className="inline-flex items-center gap-1 rounded-md px-3 py-[7px] text-sm font-medium transition-colors hover:bg-[hsl(var(--floating-toolbar-fg)/0.1)]"
        style={{
          color: 'hsl(var(--floating-toolbar-fg))',
          cursor: running ? 'not-allowed' : 'pointer',
          opacity: running ? 0.5 : 1,
        }}
        data-testid="Button__90fe6a">
        <FileCheck className="h-3.5 w-3.5" data-testid="FileCheck__90fe6a" />
        {ui(labelKey)}
      </button>
      <Dialog open={open} onOpenChange={setOpen} data-testid="Dialog__90fe6a">
        <DialogContent data-testid="DialogContent__90fe6a">
          <DialogHeader data-testid="DialogHeader__90fe6a">
            <DialogTitle data-testid="DialogTitle__90fe6a">{ui(labelKey)}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Label data-testid="Label__90fe6a">{ui('documentAction')}</Label>
            <Select
              value={selectedAction ?? ''}
              onValueChange={setSelectedAction}
              data-testid="Select__90fe6a">
              <SelectTrigger data-testid="SelectTrigger__90fe6a">
                <SelectValue data-testid="SelectValue__90fe6a" />
              </SelectTrigger>
              <SelectContent data-testid="SelectContent__90fe6a">
                {actions.map((a) => (
                  <SelectItem key={a.value} value={a.value} data-testid="SelectItem__90fe6a">
                    {ui(a.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter data-testid="DialogFooter__90fe6a">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={running}
              data-testid="Button__90fe6a">
              {ui('cancel')}
            </Button>
            <Button
              onClick={handleDone}
              disabled={running || !selectedAction}
              data-testid="Button__90fe6a">
              {/* ETP-5302 — "Aceptar", not `done` ("Completado"): this dialog is about
                  document actions, and "Completado" is the name of a document STATE, so
                  the confirm button read as if it would mark the documents completed.
                  A separate key from `done`, which RecordCreateModal still uses. */}
              {/* ETP-5414 review — `running` already covers the whole handleDone span
                  (rowFilter gate + action execution), and both buttons were already
                  disabled while it's true, but nothing signalled that visually: the dialog
                  looked frozen instead of busy, especially now the gate can take a moment
                  on a large selection. Reuses the existing `running` state and the repo's
                  established Loader2/animate-spin pattern (DataTable.jsx, CreatableSearchSelect.jsx)
                  rather than adding a new loading state or spinner. */}
              {running && (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" data-testid="Loader2__90fe6a" />
              )}
              {ui('accept')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
