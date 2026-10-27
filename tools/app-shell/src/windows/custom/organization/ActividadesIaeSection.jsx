import { useFeatureFlag, GRID_COLUMN_VIEWS } from '@/lib/flags';
import { useGridView } from '@/hooks/useGridView.js';
import { GridViewControls } from '@/components/contract-ui/GridViewControls.jsx';
import { gridHeaderProps, gridReorderHandle, gridResizeHandle } from '@/components/contract-ui/GridColumnHeaderControls.jsx';
import { Fragment, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, ExternalLink, Info, Loader2, Trash2, TriangleAlert, X } from 'lucide-react';
import { useUI } from '@/i18n';
import { Checkbox } from '@/components/ui/checkbox';
import { AddLineButton } from '@/components/ui/add-line-button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CreatableSearchSelect } from '@/components/contract-ui/CreatableSearchSelect';
import { useActividadesIae, iaeCapState, IAE_MAX_SECONDARY_ACTIVITIES } from './useActividadesIae.js';

// Field descriptors mirror `artifacts/organization/contract.json`'s
// `actividadesDelIae` entity (ETP-4975) — same shape SelectorInput/DataTable
// consume elsewhere (see AmortizationLinesTable.jsx's CORE_FIELDS for the
// reference convention: `column` drives the selector URL's last path segment,
// per NEO Headless's `GET /sws/neo/{spec}/{entity}/selectors/{columnName}`).
const EPGRAFE_FIELD = { key: 'epgrafeIAE', column: 'Epiae_Epigraph_ID', type: 'selector', reference: 'EPIAE_Epigraph', inputMode: 'selector' };
const TYPE_FIELD = { key: 'epiaeType', column: 'Epiae_Type_ID', type: 'selector', reference: 'epiae_type', inputMode: 'selector' };
const CODE_FIELD = { key: 'epiaeCode', column: 'Epiae_Code_ID', type: 'selector', reference: 'EPIAE_Code', inputMode: 'selector' };

const GRID_COLUMN_DEFS = [
  { key: 'epgrafeIAE', column: 'Epiae_Epigraph_ID', labelKey: 'orgIaeEpigraphLabel' },
  { key: 'epiaeType', column: 'Epiae_Type_ID', labelKey: 'orgIaeTypeLabel' },
  { key: 'epiaeCode', column: 'Epiae_Code_ID', labelKey: 'orgIaeCodeLabel' },
  { key: 'default', column: 'Isdefault', labelKey: 'orgIaeDefaultLabel', required: true },
];

const DEFAULT_COLUMN_WIDTHS = { default: 96, taxID: 112, powerDate: 112 };

function headerCellStyle(column) {
  if (column.gridUserWidthPx != null) return { width: column.gridUserWidthPx, overflowWrap: 'anywhere' };
  const width = DEFAULT_COLUMN_WIDTHS[column.key];
  return width == null ? undefined : { width };
}

function isDefaultTrue(value) {
  return value === true || value === 'Y';
}

// Small "why does this matter" affordance next to the Código column header —
// this is the field the Modelo 303 report reads off the default row for the
// last period of the fiscal year (see module docstring in useActividadesIae.js
// and docs/generated-custom-windows/organization.md "Actividades del IAE").
function CodeHint() {
  const ui = useUI();
  return (
    <TooltipProvider data-testid="TooltipProvider__iaeCodeHint">
      <Tooltip data-testid="Tooltip__iaeCodeHint">
        <TooltipTrigger asChild data-testid="TooltipTrigger__iaeCodeHint">
          <span className="inline-flex items-center ml-1 align-middle" tabIndex={0} aria-label={ui('orgIaeCodeHint')}>
            <Info size={13} className="text-muted-foreground" data-testid="Info__iaeCodeHint" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[240px] text-xs" data-testid="TooltipContent__iaeCodeHint">
          {ui('orgIaeCodeHint')}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ETP-5831 — the AEAT's public IAE heading search, linked next to the Epígrafe column header so a
// user who does not know their heading can look it up without leaving the grid unexplained.
export const AEAT_IAE_SEARCH_URL = 'https://sede.agenciatributaria.gob.es/Sede/buscador-iae.html';

function EpigraphSearchLink() {
  const ui = useUI();
  return (
    <a
      href={AEAT_IAE_SEARCH_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ui('orgIaeEpigraphSearchLinkAria')}
      title={ui('orgIaeEpigraphSearchLinkAria')}
      className="ml-2 inline-flex items-center gap-1 align-middle text-xs font-normal text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      data-testid="ActividadesIaeSection__epigraphSearchLink">
      {ui('orgIaeEpigraphSearchLink')}
      <ExternalLink size={12} aria-hidden="true" data-testid="ExternalLink__iaeEpigraphSearch" />
    </a>
  );
}

/**
 * "Actividades del IAE" — editable grid backing `EPIAE_OrgInfo_Epigraph`
 * (ETP-4975). Rendered as a 4th `SectionRow` in `OrganizationPage.jsx`, at the
 * same visual level as Identidad / Datos fiscales / Datos de contacto, but with
 * an inline-editable table instead of a field grid — this entity is
 * repeatable/multi-row, unlike the other three sections.
 *
 * Every field change (selector pick, default toggle, delete) persists
 * immediately via its own API call — there is no batched "unsaved changes"
 * banner for this section, matching the row-level save convention already used
 * by lines-shaped tables elsewhere (see AmortizationLinesTable.jsx).
 */
export default function ActividadesIaeSection({ token, apiBaseUrl, orgId }) {
  const ui = useUI();
  const { rows, loading, error, refetch, createRow, updateRow, deleteRow, enforceSingleDefault } =
    useActividadesIae(orgId, apiBaseUrl);

  const gridColumnViews = useFeatureFlag(GRID_COLUMN_VIEWS);
  const gridColumns = useMemo(() => GRID_COLUMN_DEFS.map(({ labelKey, ...column }) => ({ ...column, label: ui(labelKey) })), [ui]);
  const gridView = useGridView({ spec: 'organization', entity: 'actividadesDelIae', columns: gridColumns, data: rows, enabled: gridColumnViews, apiBaseUrl });
  const columns = gridView.active ? gridView.columns : gridColumns;
  const gridLabel = (key) => gridColumns.find(column => column.column === key)?.label ?? key;

  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [addingRow, setAddingRow] = useState(false);
  const [newRow, setNewRow] = useState({});
  const [savingNew, setSavingNew] = useState(false);

  const { atCap, overCap } = iaeCapState(rows);

  function selectorUrlFor(field) {
    return `${apiBaseUrl}/actividadesDelIae/selectors/${field.column}`;
  }

  async function handleSelectorChange(row, field, value, label) {
    setSavingId(row.id);
    try {
      await updateRow(row.id, { [field.key]: value || null });
      await refetch();
    } catch (err) {
      toast.error(ui('orgIaeSaveError', { error: err.message }));
    } finally {
      setSavingId(null);
    }
  }

  async function handleDefaultToggle(row, checked) {
    setSavingId(row.id);
    try {
      await updateRow(row.id, { default: checked });
      // Single-default rule (see useActividadesIae.js's enforceSingleDefault
      // docstring) — only needs to run when a row is being turned ON.
      if (checked) await enforceSingleDefault(row.id);
      await refetch();
    } catch (err) {
      toast.error(ui('orgIaeSaveError', { error: err.message }));
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(row) {
    setDeletingId(row.id);
    try {
      await deleteRow(row.id);
      await refetch();
    } catch (err) {
      toast.error(ui('orgIaeDeleteError', { error: err.message }));
    } finally {
      setDeletingId(null);
    }
  }

  function cancelAddRow() {
    setAddingRow(false);
    setNewRow({});
  }

  async function submitNewRow() {
    setSavingNew(true);
    try {
      const created = await createRow({
        epgrafeIAE: newRow.epgrafeIAE || null,
        epiaeType: newRow.epiaeType || null,
        epiaeCode: newRow.epiaeCode || null,
        default: !!newRow.default,
      });
      if (newRow.default && created?.id) {
        await enforceSingleDefault(created.id);
      }
      cancelAddRow();
      await refetch();
    } catch (err) {
      toast.error(ui('orgIaeSaveError', { error: err.message }));
    } finally {
      setSavingNew(false);
    }
  }

  if (error) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive bg-destructive/10 p-3" data-testid="ActividadesIaeSection__error">
        <p className="text-sm text-destructive">{ui('orgIaeLoadError', { error })}</p>
        <button type="button" onClick={refetch} className="text-sm font-medium text-primary underline" data-testid="ActividadesIaeSection__retry">
          {ui('retry')}
        </button>
      </div>
    );
  }

  function renderRowsBody() {
    if (loading) {
      return (
        <tr>
          <td colSpan={columns.length + 1} className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline mr-1.5" data-testid="Loader2__iaeLoading" />
          </td>
        </tr>
      );
    }
    if (rows.length === 0 && !addingRow) {
      return (
        <tr>
          <td colSpan={columns.length + 1} className="py-6 text-center text-sm text-muted-foreground" data-testid="ActividadesIaeSection__empty">
            {ui('orgIaeEmpty')}
          </td>
        </tr>
      );
    }
    return rows.map(row => {
      const rowDefault = isDefaultTrue(row.default);
      const missingCode = rowDefault && !row.epiaeCode;
      const rowSaving = savingId === row.id;
      const cells = {
        epgrafeIAE: (<td className="py-1.5 px-2 align-middle">
            <CreatableSearchSelect
              field={EPGRAFE_FIELD}
              value={row.epgrafeIAE ?? ''}
              displayValue={row['epgrafeIAE$_identifier'] ?? ''}
              onChange={(val, label) => handleSelectorChange(row, EPGRAFE_FIELD, val, label)}
              resolvedLabel=""
              selectorUrl={selectorUrlFor(EPGRAFE_FIELD)}
              token={token}
              serverSearch
              data-testid="CreatableSearchSelect__iaeEpgrafe" />
          </td>),
        epiaeType: (<td className="py-1.5 px-2 align-middle">
            <CreatableSearchSelect
              field={TYPE_FIELD}
              value={row.epiaeType ?? ''}
              displayValue={row['epiaeType$_identifier'] ?? ''}
              onChange={(val, label) => handleSelectorChange(row, TYPE_FIELD, val, label)}
              resolvedLabel=""
              selectorUrl={selectorUrlFor(TYPE_FIELD)}
              token={token}
              serverSearch
              data-testid="CreatableSearchSelect__iaeType" />
          </td>),
        epiaeCode: (<td className="py-1.5 px-2 align-middle">
            <div className="flex items-center gap-1.5">
              <div className="flex-1 min-w-0">
                <CreatableSearchSelect
                  field={CODE_FIELD}
                  value={row.epiaeCode ?? ''}
                  displayValue={row['epiaeCode$_identifier'] ?? ''}
                  onChange={(val, label) => handleSelectorChange(row, CODE_FIELD, val, label)}
                  resolvedLabel=""
                  selectorUrl={selectorUrlFor(CODE_FIELD)}
                  token={token}
                  serverSearch
                  data-testid="CreatableSearchSelect__iaeCode" />
              </div>
              {missingCode && (
                <TooltipProvider data-testid="TooltipProvider__iaeMissingCode">
                  <Tooltip data-testid="Tooltip__iaeMissingCode">
                    <TooltipTrigger asChild data-testid="TooltipTrigger__iaeMissingCode">
                      <span className="inline-flex items-center text-[var(--status-warning-fg)]" tabIndex={0} aria-label={ui('orgIaeMissingCodeWarning')}>
                        <TriangleAlert size={14} data-testid="TriangleAlert__iaeMissingCode" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[240px] text-xs" data-testid="TooltipContent__iaeMissingCode">
                      {ui('orgIaeMissingCodeWarning')}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </td>),
        default: (<td className="py-1.5 px-2 align-middle">
            <Checkbox
              checked={rowDefault}
              disabled={rowSaving}
              onChange={() => handleDefaultToggle(row, !rowDefault)}
              aria-label={ui('orgIaeDefaultLabel')}
              data-testid="Checkbox__iaeDefault" />
          </td>),
      };
      return (
        <tr key={row.id} className="border-b border-border/50 last:border-b-0" data-testid={`ActividadesIaeSection__row-${row.id}`}>
          {columns.map(column => <Fragment key={column.key}>{cells[column.key]}</Fragment>)}
          <td className="py-1.5 px-2 align-middle text-right">
            {rowSaving || deletingId === row.id ? (
              <Loader2 className="h-4 w-4 animate-spin inline text-muted-foreground" data-testid="Loader2__iaeRowBusy" />
            ) : (
              <button
                type="button"
                onClick={() => handleDelete(row)}
                aria-label={ui('deleteRowTooltip')}
                title={ui('deleteRowTooltip')}
                className="h-7 w-7 inline-flex items-center justify-center rounded-full text-destructive hover:bg-destructive/10 transition-colors"
                data-testid="ActividadesIaeSection__delete">
                <Trash2 className="h-4 w-4" data-testid="Trash2__iaeDelete" />
              </button>
            )}
          </td>
        </tr>
      );
    });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="ActividadesIaeSection__root">
      {gridColumnViews && <GridViewControls
        gridView={gridView}
        gridColumns={gridColumns}
        ui={ui}
        t={gridLabel}
        data-testid="GridViewControls__93451b" />}
      <div className="overflow-x-auto rounded-lg border border-border">
        {/* table-fixed: keeps the 3 selector columns (Epígrafe/Clave/Código) evenly split
            and the 2 fixed columns (Principal/actions) at their w-24/w-10 from the first
            paint, regardless of option-label length or load order — CreatableSearchSelect
            anchors its own dropdown (fixed-position + shouldAnchorDropdownRight/preferDown),
            so column-width churn no longer risks misplacing an open popover, but a
            deterministic layout is still preferable to an auto one that could resize under
            the selectors as their labels resolve. */}
        <table className="w-full table-fixed">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {columns.map(column => {
                const label = column.label;
                return (
                  <th key={column.key} className="relative h-9 px-3 text-left align-middle text-xs font-semibold text-foreground"
                    style={headerCellStyle(column)}
                    {...gridHeaderProps(column, gridView)}>
                    {label}
                    {column.key === 'epgrafeIAE' && <EpigraphSearchLink data-testid="EpigraphSearchLink__93451b" />}
                    {column.key === 'epiaeCode' && <CodeHint data-testid="CodeHint__iaeCode" />}
                    {gridReorderHandle(column, gridView, label, ui)}
                    {gridResizeHandle(column, gridView, label, ui)}
                  </th>
                );
              })}
              <th className="h-9 w-10 px-2" />
            </tr>
          </thead>
          <tbody>
            {renderRowsBody()}
            {addingRow && (() => {
              const cells = {
                epgrafeIAE: (<td className="py-1.5 px-2 align-middle">
                  <CreatableSearchSelect
                    field={EPGRAFE_FIELD}
                    value={newRow.epgrafeIAE ?? ''}
                    displayValue={newRow['epgrafeIAE$_identifier'] ?? ''}
                    onChange={(val, label) => setNewRow(p => ({ ...p, epgrafeIAE: val, 'epgrafeIAE$_identifier': label ?? '' }))}
                    resolvedLabel={ui('orgIaeEpigraphLabel')}
                    selectorUrl={selectorUrlFor(EPGRAFE_FIELD)}
                    token={token}
                    serverSearch
                    data-testid="CreatableSearchSelect__iaeNewEpgrafe" />
                </td>),
                epiaeType: (<td className="py-1.5 px-2 align-middle">
                  <CreatableSearchSelect
                    field={TYPE_FIELD}
                    value={newRow.epiaeType ?? ''}
                    displayValue={newRow['epiaeType$_identifier'] ?? ''}
                    onChange={(val, label) => setNewRow(p => ({ ...p, epiaeType: val, 'epiaeType$_identifier': label ?? '' }))}
                    resolvedLabel={ui('orgIaeTypeLabel')}
                    selectorUrl={selectorUrlFor(TYPE_FIELD)}
                    token={token}
                    serverSearch
                    data-testid="CreatableSearchSelect__iaeNewType" />
                </td>),
                epiaeCode: (<td className="py-1.5 px-2 align-middle">
                  <CreatableSearchSelect
                    field={CODE_FIELD}
                    value={newRow.epiaeCode ?? ''}
                    displayValue={newRow['epiaeCode$_identifier'] ?? ''}
                    onChange={(val, label) => setNewRow(p => ({ ...p, epiaeCode: val, 'epiaeCode$_identifier': label ?? '' }))}
                    resolvedLabel={ui('orgIaeCodeLabel')}
                    selectorUrl={selectorUrlFor(CODE_FIELD)}
                    token={token}
                    serverSearch
                    data-testid="CreatableSearchSelect__iaeNewCode" />
                </td>),
                default: (<td className="py-1.5 px-2 align-middle">
                  <Checkbox
                    checked={!!newRow.default}
                    onChange={() => setNewRow(p => ({ ...p, default: !p.default }))}
                    aria-label={ui('orgIaeDefaultLabel')}
                    data-testid="Checkbox__iaeNewDefault" />
                </td>),
              };
              return (
              <tr className="bg-status-info/40 border-t-2 border-primary/20" data-testid="ActividadesIaeSection__addRow">
                {columns.map(column => <Fragment key={column.key}>{cells[column.key]}</Fragment>)}
                <td className="py-1.5 px-2 align-middle">
                  <div className="flex items-center gap-1 justify-end">
                    {savingNew ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" data-testid="Loader2__iaeNewSaving" />
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={submitNewRow}
                          aria-label={ui('save')}
                          title={ui('save')}
                          className="h-7 w-7 inline-flex items-center justify-center rounded-full text-primary hover:bg-primary/10 transition-colors"
                          data-testid="ActividadesIaeSection__saveNew">
                          <Check className="h-4 w-4" data-testid="Check__iaeSaveNew" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelAddRow}
                          aria-label={ui('cancel')}
                          title={ui('cancel')}
                          className="h-7 w-7 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors"
                          data-testid="ActividadesIaeSection__cancelNew">
                          <X className="h-4 w-4" data-testid="X__iaeCancelNew" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ); })() }
          </tbody>
        </table>
      </div>
      {/* Modelo 390 cap (1 main + 5 others, see IAE_MAX_SECONDARY_ACTIVITIES): existing rows are
          never hidden — over the cap a warning asks to remove some; at the cap "Añadir" is off. */}
      {!loading && overCap && (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-xs leading-[18px] text-[var(--status-warning-fg)]"
          data-testid="ActividadesIaeSection__overCapWarning">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" data-testid="TriangleAlert__iaeOverCap" />
          <span>{ui('orgIaeOverCapWarning', { max: IAE_MAX_SECONDARY_ACTIVITIES })}</span>
        </p>
      )}
      {!addingRow && (
        <div className="flex items-center gap-2">
          <AddLineButton
            onClick={() => setAddingRow(true)}
            label={ui('orgIaeAddRow')}
            disabled={atCap}
            data-testid="ActividadesIaeSection__addButton" />
          {atCap && !overCap && (
            <span className="text-xs text-muted-foreground" data-testid="ActividadesIaeSection__capHint">
              {ui('orgIaeCapHint', { max: IAE_MAX_SECONDARY_ACTIVITIES })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
