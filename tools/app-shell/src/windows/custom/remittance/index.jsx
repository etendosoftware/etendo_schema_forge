import { useCallback, useMemo, useState } from 'react';
import { ClockIcon, DownloadSimpleIcon, ArrowsClockwiseIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { evalRowVisibleWhen } from '@/utils/recordActions.js';
import { useAuthOptional } from '@etendosoftware/app-shell-core/auth';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { getApiBase } from '@/hooks/useNeoResource.js';
import { useUI } from '@/i18n';
import { useWindowAccess } from '@/auth/AuthContext.jsx';
import { ListProgressBar } from '@/components/contract-ui/ListProgressBar.jsx';
import { AccessDeniedMessage } from '@/components/access/ProcessAccessGuard.jsx';
import { useCapabilitiesSafe } from '@/hooks/useCapabilitiesSafe.js';
import { SEPA_REMITTANCES_CAPABILITY, isCapabilityVisible } from '@/lib/capabilityVisibility.js';
import decisions from '@generated/remittance/decisions.json';
import RemittanceSentDialog from '@generated/remittance/custom/RemittanceSentDialog.jsx';
import RemittanceCollectDialog from '@generated/remittance/custom/RemittanceCollectDialog.jsx';
import { RemittanceStatusChip } from '@generated/remittance/custom/RemittanceStatusChange.jsx';
import { FILE_STATUSES, REGENERATE_STATUSES, downloadRemittanceFile, fileActionErrorMessage, resolveLatestRemittanceFile } from '@generated/remittance/custom/remittanceFileApi.js';
import RemittanceDownloadButton from '@generated/remittance/custom/RemittanceDownloadButton.jsx';
import RemittanceRegenerateDialog from '@generated/remittance/custom/RemittanceRegenerateDialog.jsx';
import { REMITTANCE_CONFIRM_EVENT } from '@generated/remittance/custom/RemittanceStatusSelector.jsx';
import RemittanceApp from '@generated/remittance/generated/web/remittance/index.jsx';

/**
 * Classic "Remittance" AD window (module org.openbravo.module.remittance): the page's access
 * anchor. It is the same id as the sidebar entry (`menu.json` → `accessWindowId`), the generated
 * page's own `useWindowAccess` check, and the Financiero template-role grant
 * (`TemplateRoleWindowAccess`) in com.etendoerp.go.
 */
export const REMITTANCE_WINDOW_ID = 'FF8080812E71F7C7012E71FD0499001B';

/**
 * ETP-6247 — «Guardar» neutral + «Confirmar» primary, as Sales Order: the generic draftMode pair, with a
 * custom `onConfirm` that opens the window's own confirm dialog (hosted by RemittanceStatusSelector, listening to
 * this event). «Confirmar» is always there while the remittance is pending (new or saved) and disabled while it has
 * no lines (`disableWhenEmpty`, with `disabledEmptyTitleKey` as its tooltip); a pending edit is saved first.
 */
// `label` is a genericLabels KEY, not display text: saveActions renders it through `ui(draftMode.label)`.
// i18n-allowlist: ["confirm"]
export const REMITTANCE_DRAFT_MODE = {
  enabled: true,
  label: 'confirm',
  disableWhenEmpty: true,
  disabledEmptyTitleKey: 'remittanceConfirmNeedsLines',
  onConfirm: () => window.dispatchEvent(new CustomEvent(REMITTANCE_CONFIRM_EVENT)),
};

/**
 * The detail status pill's per-code tones: the status field's own `enumVariants` in decisions.json,
 * the same map the grid chip honours, so the two cannot diverge. The generated page emits only
 * `statusEnumLabels`, so this route hands the map to DetailView (`statusEnumVariants`, the prop
 * DocumentStatusPill reads) through the props the page spreads onto it. The caller's own props win.
 */
export const REMITTANCE_STATUS_VARIANTS = decisions.entities.remittance.fields.remittanceStatus.enumVariants;

// ETP-6247 — the grid's row menu (⋮): one «Cambiar estado» entry with a submenu that lists the flow's
// statuses as chips (Pendiente de envío, Enviada al banco, Cobrada), as Holded does. Only the
// transitions the detail header offers today are clickable, with the same visibility (the process
// overrides' own displayLogicRaw, evaluated on the row) and the same dialogs; the current status and
// the transitions that do not exist (no way back, no PR -> Cobrada) stay listed but dimmed. The entry
// is hidden on a row with no transition at all (PE, CT, PT, CP, PP, AN). `RowQuickActions` runs a
// submenu item's `onClick` for a host-owned dialog (the pattern of the invoice windows), so the route
// keeps the open step and refreshes the grid through `refreshTrigger` when the dialog finishes.
const ROW_STEP_DIALOGS = { markSent: RemittanceSentDialog, markCollected: RemittanceCollectDialog };
// Target status -> the process that moves a row there.
const ROW_STATUS_STEPS = [
  { status: 'PR', process: null },
  { status: 'SB', process: 'markSent' },
  { status: 'CT', process: 'markCollected' },
];
const stepAllowed = (process, row) => Boolean(process)
  && evalRowVisibleWhen(decisions.window.processOverrides[process].displayLogicRaw, row);

// «Descargar fichero» is offered on a row that has been confirmed (FILE_STATUSES: it has a file); PE has
// none yet and AN is voided.

/**
 * The row menu's entries for one row: «Cambiar estado» (when a transition exists) and «Descargar
 * fichero» (when the row was confirmed). `openStep({ name, row })` opens a step dialog;
 * `downloadFile(row)` downloads the main SEPA file.
 */
export function buildRowMenuActions(row, openStep, downloadFile) {
  const actions = [];
  if (ROW_STATUS_STEPS.some(({ process }) => stepAllowed(process, row)) && row?.remittanceStatus != null) {
    actions.push({
      key: 'changeStatus',
      labelKey: 'remittanceChangeStatus',
      icon: ClockIcon,
      submenu: ROW_STATUS_STEPS.map(({ status, process }) => ({
        key: status,
        content: <RemittanceStatusChip status={status} data-testid="RemittanceStatusChip__row" />,
        disabled: !stepAllowed(process, row),
        onClick: ({ row: clicked }) => openStep({ name: process, row: clicked }),
      })),
    });
  }
  if (FILE_STATUSES.has(row?.remittanceStatus)) {
    actions.push({
      key: 'downloadFile',
      labelKey: 'remittanceFileDownload',
      icon: DownloadSimpleIcon,
      onClick: ({ row: clicked }) => downloadFile?.(clicked),
    });
  }
  return actions;
}

/**
 * ETP-6148 — route entry of the Remittance window (Finanzas › Remesas). The generated page
 * already turns away a role without window access, but it knows nothing about the per-account
 * rollout. The sidebar only hides the entry, so a URL typed by hand lands here, and this guard
 * checks both axes before mounting the generated window: the `sepaRemittances` capability (the
 * `sepa-remittances` flag, evaluated by the backend in `SFWindowAccessMap`) and the role's window
 * access. Either one missing shows the same access-denied screen, which does not reveal whether
 * the feature exists. With the flag off the remittance handlers answer 403 anyway; this guard
 * keeps the user from reaching a page of failing requests.
 *
 * Same shape as the invoice-inbox route guard. Both hooks run before any return, so hook order is
 * stable. While the access maps are still loading (a reload or a deep link) they read as `{}`,
 * which would flash the access-denied screen, so until `accessLoaded` is true a progress bar
 * shows instead. Once loaded it still fails closed. Without an `AuthProvider` (unit tests), or
 * with an older core that does not publish `accessLoaded`, the maps are taken as loaded.
 */
export default function RemittanceRoute(props) {
  const [rowStep, setRowStep] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // decisions.json's own rowQuickActions config is re-stated here because the props the route passes
  // replace the generated page's `rowQuickActions` object as a whole.
  const ui = useUI();
  const apiFetch = useApiFetch(props.apiBaseUrl);
  const rootApiFetch = useApiFetch(useMemo(() => getApiBase(), []));
  // «Descargar fichero» of the row menu: the same resolution and download as the «Fichero SEPA» card
  // (resolveLatestRemittanceFile / downloadRemittanceFile), nothing else is opened.
  const downloadRowFile = useCallback(async (row) => {
    try {
      const file = await resolveLatestRemittanceFile(apiFetch, rootApiFetch, row.id);
      if (!file) {
        toast.error(ui('remittanceFileNone'));
        return;
      }
      await downloadRemittanceFile(rootApiFetch, file);
    } catch (err) {
      toast.error(fileActionErrorMessage(err, ui, 'remittanceFileDownloadError'));
    }
  }, [apiFetch, rootApiFetch, ui]);
  // «Regenerar fichero» of the DETAIL kebab (`menuActions` as a function of the record, an entry's
  // `onClick` opens the host-owned confirmation), only on PR and SB.
  const [regenerateRecord, setRegenerateRecord] = useState(null);
  const detailMenuActions = useCallback(({ data }) => (REGENERATE_STATUSES.has(data?.remittanceStatus)
    ? [{ key: 'regenerateFile', labelKey: 'remittanceFileRegenerate', icon: ArrowsClockwiseIcon, onClick: () => setRegenerateRecord(data) }]
    : []), []);
  const rowQuickActions = useMemo(() => ({
    ...(decisions.window.rowQuickActions ?? {}),
    menuActions: ({ row }) => buildRowMenuActions(row, setRowStep, downloadRowFile),
  }), [downloadRowFile]);
  const capabilities = useCapabilitiesSafe();
  const tier = useWindowAccess(REMITTANCE_WINDOW_ID);
  const accessLoaded = useAuthOptional()?.accessLoaded;
  if (accessLoaded === false) {
    return (
      <ListProgressBar
        testId="remittance-access-loading"
        data-testid="ListProgressBar__6148a1" />
    );
  }
  if (!isCapabilityVisible(capabilities, SEPA_REMITTANCES_CAPABILITY) || tier === 'none') {
    return <AccessDeniedMessage data-testid="AccessDeniedMessage__6148a1" />;
  }
  // ETP-6148 round 3 — `saveActionsFirst` (DetailView prop, same opt-in as payment-in and
  // payment-out): Guardar renders to the left of Procesar / Reactivar, so the primary action is
  // the right-most button, as in Sales Invoice (whose Confirmar is the draftMode button that
  // already follows Guardar). Procesar is a declared process, which DetailView renders before
  // the save actions unless the window opts in. Order only: no saveBeforeProcesses.
  const StepDialog = rowStep ? ROW_STEP_DIALOGS[rowStep.name] : null;
  return (
    <>
      <RemittanceApp
        statusEnumVariants={REMITTANCE_STATUS_VARIANTS}
        draftMode={REMITTANCE_DRAFT_MODE}
        rowQuickActions={rowQuickActions}
        topbarSecondary={RemittanceDownloadButton}
        menuActions={detailMenuActions}
        {...props}
        refreshTrigger={(props.refreshTrigger ?? 0) + refreshKey}
        saveActionsFirst
        data-testid="RemittanceApp__6148a1" />
      {regenerateRecord && (
        <RemittanceRegenerateDialog
          record={regenerateRecord}
          apiBaseUrl={props.apiBaseUrl}
          onRefresh={() => setRefreshKey((k) => k + 1)}
          onClose={() => setRegenerateRecord(null)}
          data-testid="RemittanceRegenerateDialog__route" />
      )}
      {StepDialog && (
        <StepDialog
          record={rowStep.row}
          apiBaseUrl={props.apiBaseUrl}
          onRefresh={() => setRefreshKey((k) => k + 1)}
          onClose={() => setRowStep(null)}
          data-testid="StepDialog__remittance-row" />
      )}
    </>
  );
}
