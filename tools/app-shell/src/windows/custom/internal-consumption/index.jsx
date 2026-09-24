import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import GeneratedApp from '@generated/internal-consumption/generated/web/internal-consumption/index.jsx';
import BulkDocumentAction, { buildPostActions, postRowFilter, buildUnpostActions, unpostRowFilter } from '@/components/contract-ui/BulkDocumentAction';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { extractErrorMessage, PROCESS_FAILURE_TOAST_DURATION_MS } from '@/hooks/useEntity.js';
import { buildDocumentRowQuickActionsPostMenu } from '../shared/buildDocumentRowQuickActions.js';

// ETP-5445 — the form's draftMode "Confirmar" is not a DocAction: it POSTs the
// `processNow` AD button with the mandatory M_Internal_Consumption_Post `action`
// parameter at the request root. The row entry sends the exact same body, so it is
// the same action, not a reduced version of it. The row entry keeps an explicit
// onClick rather than a declarative `neoAction`: RowQuickActions' neoAction path
// always sends `{}` (NEO rejects it with "Missing mandatory parameter"), and the
// onClick reuses the form's own error extractor (extractErrorMessage) for parity.
const CONFIRM_PARAMS = { fieldValues: { processNow: 'CO' }, action: 'CO' };
const CONFIRM_BODY = JSON.stringify(CONFIRM_PARAMS);

// Same gate the form applies (the Confirm button hides once processed): only drafts.
export function isConfirmableRow(row) {
  const processed = row?.processed === 'Y' || row?.processed === true;
  return row?.status === 'DR' && !processed;
}

// ETP-5445 — bulk "Confirmar": the same processNow call as the form and the row kebab,
// through BulkDocumentAction's neoAction mode with an explicit request body
// (`neoActionBody`). `value` is the intent the row filter keys on; `neoActionName` is the
// real AD button on the wire.
export const buildConfirmActions = (rows) => (rows.some(isConfirmableRow)
  ? [{ value: 'confirm', labelKey: 'confirm', neoActionName: 'processNow', neoActionBody: CONFIRM_PARAMS }]
  : []);

export const confirmRowFilter = (row, action, ui) => {
  if (action !== 'confirm') return true;
  return isConfirmableRow(row) ? true : ui('bulkRowNotDraft');
};

// ETP-5445 — bulk Confirmar/Contabilizar/Descontabilizar in the grid multi-select
// toolbar; Post/Unpost mirror physical-inventory (ETP-5360). `entity="internalConsumption"`
// matches `entities.header.name` in decisions.json.
function InternalConsumptionBulkActions(props) {
  return (
    <>
      <BulkDocumentAction
        {...props}
        entity="internalConsumption"
        actionMode="neoAction"
        buildActions={buildConfirmActions}
        rowFilter={confirmRowFilter}
        labelKey="confirm"
        data-testid="BulkDocumentActionConfirm__b7e2c1" />
      <BulkDocumentAction
        {...props}
        entity="internalConsumption"
        actionMode="neoAction"
        buildActions={buildPostActions}
        rowFilter={postRowFilter}
        labelKey="post"
        data-testid="BulkDocumentActionPost__b7e2c1" />
      <BulkDocumentAction
        {...props}
        entity="internalConsumption"
        actionMode="neoAction"
        buildActions={buildUnpostActions}
        rowFilter={unpostRowFilter}
        labelKey="unpost"
        data-testid="BulkDocumentActionUnpost__b7e2c1" />
    </>
  );
}

// Thin wrapper over the generated page: everything the generator emits
// (Void via moreMenuContent, the lines bottom panel, the detail Post/Unpost
// menuActions, the list toolbar options) is preserved; this only adds the grid
// bulk actions and the row-hover Confirmar/Post/Unpost kebab.
export default function InternalConsumptionWindow(props) {
  const ui = useUI();
  const apiFetch = useApiFetch(props.apiBaseUrl);
  const [refreshKey, setRefreshKey] = useState(0);

  const rowQuickActions = useMemo(() => {
    const refresh = () => setRefreshKey(k => k + 1);
    // Toasts and refreshes itself: buildMenuActionExecutedHandler only reacts to
    // neoAction/documentAction entries, so there is no double toast.
    const confirmRow = async ({ row }) => {
      let res;
      try {
        res = await apiFetch(`/internalConsumption/${encodeURIComponent(row.id)}/action/processNow`, {
          method: 'POST',
          body: CONFIRM_BODY,
        });
      } catch {
        // Network error / abort: RowQuickActions' own catch would only log it, so the user
        // would see nothing. Report it here and refresh, like any other failure.
        toast.error(ui('actionFailed'), { duration: PROCESS_FAILURE_TOAST_DURATION_MS });
        refresh();
        return { success: false };
      }
      if (!res.ok) {
        // Same extractor and toast duration the form's Save & Confirm uses (the extractor
        // routes through translateBackendError).
        const message = await extractErrorMessage(res, ui);
        toast.error(message || ui('actionFailed'), { duration: PROCESS_FAILURE_TOAST_DURATION_MS });
        refresh();
        return { success: false, message };
      }
      toast.success(ui('documentConfirmed'));
      refresh();
      return { success: true };
    };
    return {
      enabled: true,
      ...buildDocumentRowQuickActionsPostMenu({
        ui,
        onRefresh: refresh,
        includeUnpost: true,
        extraMenuActions: (row) => (isConfirmableRow(row)
          ? { key: 'confirm', labelKey: 'confirm', onClick: confirmRow }
          : null),
      }),
    };
  }, [ui, apiFetch]);

  return (
    <GeneratedApp
      {...props}
      bulkActions={InternalConsumptionBulkActions}
      rowQuickActions={rowQuickActions}
      refreshTrigger={refreshKey}
      data-testid="GeneratedApp__b7e2c1" />
  );
}
