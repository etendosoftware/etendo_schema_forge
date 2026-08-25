import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Info, Loader2, Trash2, TriangleAlert, X } from 'lucide-react';
import { useUI } from '@/i18n';
import { Checkbox } from '@/components/ui/checkbox';
import { AddLineButton } from '@/components/ui/add-line-button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CreatableSearchSelect } from '@/components/contract-ui/CreatableSearchSelect';
import { useActividadesIae } from './useActividadesIae.js';

// Field descriptors mirror `artifacts/organization/contract.json`'s
// `actividadesDelIae` entity (ETP-4975) — same shape SelectorInput/DataTable
// consume elsewhere (see AmortizationLinesTable.jsx's CORE_FIELDS for the
// reference convention: `column` drives the selector URL's last path segment,
// per NEO Headless's `GET /sws/neo/{spec}/{entity}/selectors/{columnName}`).
const EPGRAFE_FIELD = { key: 'epgrafeIAE', column: 'Epiae_Epigraph_ID', type: 'selector', reference: 'EPIAE_Epigraph', inputMode: 'selector' };
const TYPE_FIELD = { key: 'epiaeType', column: 'Epiae_Type_ID', type: 'selector', reference: 'epiae_type', inputMode: 'selector' };
const CODE_FIELD = { key: 'epiaeCode', column: 'Epiae_Code_ID', type: 'selector', reference: 'EPIAE_Code', inputMode: 'selector' };

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

  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [addingRow, setAddingRow] = useState(false);
  const [newRow, setNewRow] = useState({});
  const [savingNew, setSavingNew] = useState(false);

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

  return (
    <div className="flex flex-col gap-3" data-testid="ActividadesIaeSection__root">
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
              <th className="h-9 px-3 text-left align-middle text-xs font-semibold text-foreground">{ui('orgIaeEpigraphLabel')}</th>
              <th className="h-9 px-3 text-left align-middle text-xs font-semibold text-foreground">{ui('orgIaeTypeLabel')}</th>
              <th className="h-9 px-3 text-left align-middle text-xs font-semibold text-foreground">
                {ui('orgIaeCodeLabel')}
                <CodeHint data-testid="CodeHint__iae" />
              </th>
              <th className="h-9 w-24 px-3 text-left align-middle text-xs font-semibold text-foreground">{ui('orgIaeDefaultLabel')}</th>
              <th className="h-9 w-10 px-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-1.5" data-testid="Loader2__iaeLoading" />
                </td>
              </tr>
            ) : rows.length === 0 && !addingRow ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground" data-testid="ActividadesIaeSection__empty">
                  {ui('orgIaeEmpty')}
                </td>
              </tr>
            ) : (
              rows.map(row => {
                const rowDefault = isDefaultTrue(row.default);
                const missingCode = rowDefault && !row.epiaeCode;
                const rowSaving = savingId === row.id;
                return (
                  <tr key={row.id} className="border-b border-border/50 last:border-b-0" data-testid={`ActividadesIaeSection__row-${row.id}`}>
                    <td className="py-1.5 px-2 align-middle">
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
                    </td>
                    <td className="py-1.5 px-2 align-middle">
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
                    </td>
                    <td className="py-1.5 px-2 align-middle">
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
                    </td>
                    <td className="py-1.5 px-2 align-middle">
                      <Checkbox
                        checked={rowDefault}
                        disabled={rowSaving}
                        onChange={() => handleDefaultToggle(row, !rowDefault)}
                        aria-label={ui('orgIaeDefaultLabel')}
                        data-testid="Checkbox__iaeDefault" />
                    </td>
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
              })
            )}
            {addingRow && (
              <tr className="bg-status-info/40 border-t-2 border-primary/20" data-testid="ActividadesIaeSection__addRow">
                <td className="py-1.5 px-2 align-middle">
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
                </td>
                <td className="py-1.5 px-2 align-middle">
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
                </td>
                <td className="py-1.5 px-2 align-middle">
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
                </td>
                <td className="py-1.5 px-2 align-middle">
                  <Checkbox
                    checked={!!newRow.default}
                    onChange={() => setNewRow(p => ({ ...p, default: !p.default }))}
                    aria-label={ui('orgIaeDefaultLabel')}
                    data-testid="Checkbox__iaeNewDefault" />
                </td>
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
            )}
          </tbody>
        </table>
      </div>
      {!addingRow && (
        <div>
          <AddLineButton
            onClick={() => setAddingRow(true)}
            label={ui('orgIaeAddRow')}
            data-testid="ActividadesIaeSection__addButton" />
        </div>
      )}
    </div>
  );
}
