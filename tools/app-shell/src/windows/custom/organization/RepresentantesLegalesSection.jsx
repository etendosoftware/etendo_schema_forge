import { useFeatureFlag, GRID_COLUMN_VIEWS } from '@/lib/flags';
import { useGridView } from '@/hooks/useGridView.js';
import { GridViewControls } from '@/components/contract-ui/GridViewControls.jsx';
import { gridHeaderProps, gridReorderHandle, gridResizeHandle } from '@/components/contract-ui/GridColumnHeaderControls.jsx';
import { Fragment, useState } from 'react';
import { toast } from 'sonner';
import { Info, Loader2, Pencil, Trash2, TriangleAlert } from 'lucide-react';
import { useUI, useLocaleSwitch } from '@/i18n';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { AddLineButton } from '@/components/ui/add-line-button';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { useRepresentantesLegales } from './useRepresentantesLegales.js';
import {
  EMPTY_REPRESENTATIVE,
  MODELO_390_REPRESENTATIVE_LIMIT,
  REPRESENTATIVE_MAX_LENGTH,
  activeRepresentatives,
  buildRepresentativePayload,
  hasDeclarableRepresentative,
  isActiveRepresentative,
  getRepresentativeErrors,
  representativeFullName,
  representativeToForm,
} from './representanteLegal.js';

// Form layout of the add/edit card: [field, i18n label key, required].
const FORM_FIELDS = [
  ['taxID', 'orgRepTaxIdLabel', true],
  ['firstName', 'orgRepFirstNameLabel', true],
  ['lastname1', 'orgRepLastname1Label', true],
  ['lastname2', 'orgRepLastname2Label', false],
  ['powerDate', 'orgRepPowerDateLabel', true],
  ['notaryName', 'orgRepNotaryLabel', true],
];

const GRID_COLUMNS = [
  { key: 'taxID', column: 'Taxid', label: 'orgRepTaxIdLabel' },
  { key: 'firstName', column: 'Firstname', label: 'orgRepFullNameLabel' },
  { key: 'powerDate', column: 'Power_Date', label: 'orgRepPowerDateLabel' },
  { key: 'notaryName', column: 'Notary_Name', label: 'orgRepNotaryLabel' },
];

function RequiredMark() {
  return <span className="text-destructive"> *</span>;
}

/**
 * Add/edit card for one representative. Rendered below the table instead of as an inline row:
 * six fields (one of them a date picker) do not fit in a table row at 1280px next to the page's
 * 200px section column, and the card gives each field room for its inline error.
 */
function RepresentativeForm({ initial, isNew, saving, onSubmit, onCancel }) {
  const ui = useUI();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});

  const setField = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    if (errors[field]) {
      setErrors(e => {
        const next = { ...e };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = () => {
    const next = getRepresentativeErrors(form);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSubmit(buildRepresentativePayload(form));
  };

  return (
    <div
      className="rounded-lg border border-primary/20 bg-status-info/40 p-3 flex flex-col gap-3"
      data-testid="RepresentantesLegalesSection__form">
      <div className="text-sm font-semibold text-foreground">
        {ui(isNew ? 'orgRepNewTitle' : 'orgRepEditTitle')}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {FORM_FIELDS.map(([field, labelKey, required]) => {
          const inputId = `org-rep-${field}`;
          const error = errors[field];
          return (
            <div key={field} className="flex flex-col gap-1.5 min-w-0">
              <Label htmlFor={inputId} className="text-sm text-foreground font-medium" data-testid={`Label__orgRep-${field}`}>
                {ui(labelKey)}{required && <RequiredMark data-testid="RequiredMark__orgRep" />}
              </Label>
              {field === 'powerDate' ? (
                <DateField
                  id={inputId}
                  value={form.powerDate}
                  onChange={iso => setField('powerDate', iso ?? '')}
                  required
                  className={'w-full' + (error ? ' border-destructive' : '')}
                  data-testid={`RepresentantesLegalesSection__input-${field}`} />
              ) : (
                <Input
                  id={inputId}
                  value={form[field]}
                  maxLength={REPRESENTATIVE_MAX_LENGTH[field]}
                  onChange={e => setField(field, e.target.value)}
                  aria-invalid={Boolean(error)}
                  className={'bg-card hover:bg-muted focus-visible:bg-card' + (error ? ' border-destructive' : '')}
                  data-testid={`RepresentantesLegalesSection__input-${field}`} />
              )}
              {error && (
                <p role="alert" className="text-xs text-destructive mt-0.5" data-testid={`RepresentantesLegalesSection__error-${field}`}>
                  {ui(error.key, error.params)}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={saving}
          className="h-9 px-3 rounded-lg"
          data-testid="RepresentantesLegalesSection__cancel">
          {ui('cancel')}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={saving}
          className="h-9 px-3 rounded-lg"
          data-testid="RepresentantesLegalesSection__save">
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" data-testid="Loader2__orgRepSaving" />}
          {ui('save')}
        </Button>
      </div>
    </div>
  );
}

/**
 * "Representantes legales" grid (ETP-5716) — `OREP_Representative_Info`, shown in the
 * Modelo 390 section when the organization is NOT a natural person. The Modelo 390 reads the
 * first 3 rows by line, so the rows are listed in line order and those 3 carry a "390" marker.
 *
 * Like the IAE grid, every create/update/delete persists immediately through its own request;
 * it is not part of the page's unsaved-changes form.
 */
export default function RepresentantesLegalesSection({ apiBaseUrl, orgId }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const { rows, loading, error, refetch, createRow, updateRow, deleteRow } =
    useRepresentantesLegales(orgId, apiBaseUrl);

  const gridColumnViews = useFeatureFlag(GRID_COLUMN_VIEWS);
  const gridView = useGridView({ spec: 'organization', entity: 'representanteLegal', columns: GRID_COLUMNS, data: rows, enabled: gridColumnViews, apiBaseUrl });
  const columns = gridView.active ? gridView.columns : GRID_COLUMNS;
  const gridLabel = (key) => ui(GRID_COLUMNS.find(column => column.column === key)?.label ?? key);

  // null = no form open; 'new' = adding; otherwise the id of the row being edited.
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const editingRow = editing && editing !== 'new' ? rows.find(r => r.id === editing) : null;
  // The "390" marker goes on the first 3 ACTIVE rows by line. An inactive row (deactivated in
  // Classic; GO never deactivates one) gets no marker. Note: the classic generator does not filter
  // inactive rows, see docs/generated-custom-windows/organization.md.
  const activeRows = activeRepresentatives(rows);
  const includedIds = new Set(activeRows.slice(0, MODELO_390_REPRESENTATIVE_LIMIT).map(r => r.id));

  async function handleSubmit(payload) {
    setSaving(true);
    try {
      if (editing === 'new') {
        await createRow(payload);
      } else {
        await updateRow(editing, payload);
      }
      setEditing(null);
      await refetch();
    } catch (err) {
      toast.error(ui('orgRepSaveError', { error: err.message }));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row) {
    setDeletingId(row.id);
    try {
      await deleteRow(row.id);
      if (editing === row.id) setEditing(null);
      await refetch();
    } catch (err) {
      toast.error(ui('orgRepDeleteError', { error: err.message }));
    } finally {
      setDeletingId(null);
    }
  }

  if (error) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive bg-destructive/10 p-3" data-testid="RepresentantesLegalesSection__error">
        <p className="text-sm text-destructive">{ui('orgRepLoadError', { error })}</p>
        <button type="button" onClick={refetch} className="text-sm font-medium text-primary underline" data-testid="RepresentantesLegalesSection__retry">
          {ui('retry')}
        </button>
      </div>
    );
  }

  function renderRowsBody() {
    if (loading) {
      return (
        <tr>
          <td colSpan={columns.length + 2} className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline mr-1.5" data-testid="Loader2__orgRepLoading" />
          </td>
        </tr>
      );
    }
    if (rows.length === 0) {
      return (
        <tr>
          <td colSpan={columns.length + 2} className="py-6 text-center text-sm text-muted-foreground" data-testid="RepresentantesLegalesSection__empty">
            {ui('orgRepEmpty')}
          </td>
        </tr>
      );
    }
    return rows.map((row) => {
      const included = includedIds.has(row.id);
      const inactive = !isActiveRepresentative(row);
      const busy = deletingId === row.id;
      const cells = {
        taxID: (<td className="py-2 px-3 align-middle text-sm truncate" title={row.taxID ?? ''}>{row.taxID || '—'}</td>),
        firstName: (<td className="py-2 px-3 align-middle text-sm truncate" title={representativeFullName(row)}>{representativeFullName(row) || '—'}</td>),
        powerDate: (<td className="py-2 px-3 align-middle text-sm tabular-nums">{formatCalendarDate(row.powerDate, locale)}</td>),
        notaryName: (<td className="py-2 px-3 align-middle text-sm truncate" title={row.notaryName ?? ''}>{row.notaryName || '—'}</td>),
      };
      return (
        <tr
          key={row.id}
          className={'border-b border-border/50 last:border-b-0' + (included ? '' : ' text-muted-foreground')}
          data-inactive={inactive || undefined}
          data-testid={`RepresentantesLegalesSection__row-${row.id}`}>
          <td className="py-2 px-3 align-middle text-sm tabular-nums">
            <div className="flex items-center gap-1.5">
              <span>{row.lineNo ?? '—'}</span>
              {included && (
                <span
                  className="rounded px-1 text-[10px] font-semibold leading-4 bg-primary/10 text-primary"
                  title={ui('orgRepIncludedIn390')}
                  aria-label={ui('orgRepIncludedIn390')}
                  data-testid="RepresentantesLegalesSection__included">
                  {ui('orgRepIncludedIn390Badge')}
                </span>
              )}
            </div>
          </td>
          {columns.map(column => <Fragment key={column.key}>{cells[column.key]}</Fragment>)}
          <td className="py-1.5 px-2 align-middle text-right whitespace-nowrap">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin inline text-muted-foreground" data-testid="Loader2__orgRepRowBusy" />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(row.id)}
                  disabled={saving}
                  aria-label={ui('edit')}
                  title={ui('edit')}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors"
                  data-testid="RepresentantesLegalesSection__edit">
                  <Pencil className="h-4 w-4" data-testid="Pencil__orgRepEdit" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(row)}
                  disabled={saving}
                  aria-label={ui('deleteRowTooltip')}
                  title={ui('deleteRowTooltip')}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-full text-destructive hover:bg-destructive/10 transition-colors"
                  data-testid="RepresentantesLegalesSection__delete">
                  <Trash2 className="h-4 w-4" data-testid="Trash2__orgRepDelete" />
                </button>
              </>
            )}
          </td>
        </tr>
      );
    });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="RepresentantesLegalesSection__root">
      <p className="flex items-start gap-1.5 text-xs leading-[18px] text-muted-foreground" data-testid="RepresentantesLegalesSection__limitHint">
        <Info size={13} className="mt-0.5 shrink-0" data-testid="Info__orgRepLimitHint" />
        <span>{ui('orgRepLimitHint', { limit: MODELO_390_REPRESENTATIVE_LIMIT })}</span>
      </p>
      {/* Blocking for the 390: the AEAT rejects a legal entity's declaration with no representative
          NIF (PAR012), so Fiscal390IncidentRules.NO_LEGAL_REPRESENTATIVE blocks generate/submit.
          The grid itself stays editable — this is where the user fixes it. */}
      {!loading && !hasDeclarableRepresentative(rows) && (
        <p
          role="status"
          className="flex items-start gap-1.5 text-xs leading-[18px] text-[var(--status-warning-fg)]"
          data-testid="RepresentantesLegalesSection__noActiveHint">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" data-testid="TriangleAlert__orgRepNoActive" />
          <span>{ui('orgRepLegalEntityHint')}</span>
        </p>
      )}
      {gridColumnViews && <GridViewControls
        gridView={gridView}
        gridColumns={GRID_COLUMNS}
        ui={ui}
        t={gridLabel}
        data-testid="GridViewControls__f6a856" />}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full table-fixed">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="h-9 w-20 px-3 text-left align-middle text-xs font-semibold text-foreground">{ui('orgRepLineLabel')}</th>
              {columns.map(column => {
                const label = ui(column.label);
                return (
                  <th key={column.key} className="relative h-9 px-3 text-left align-middle text-xs font-semibold text-foreground"
                    style={column.gridUserWidthPx != null ? { width: column.gridUserWidthPx, overflowWrap: 'anywhere' } : column.key === 'default' ? { width: 96 } : column.key === 'taxID' || column.key === 'powerDate' ? { width: 112 } : undefined}
                    {...gridHeaderProps(column, gridView)}>
                    {label}
                    {gridReorderHandle(column, gridView, label, ui)}
                    {gridResizeHandle(column, gridView, label, ui)}
                  </th>
                );
              })}
              <th className="h-9 w-20 px-2" />
            </tr>
          </thead>
          <tbody>{renderRowsBody()}</tbody>
        </table>
      </div>
      {editing ? (
        <RepresentativeForm
          // Remount per target so switching from one row to another (or to "new") reseeds it.
          key={editing}
          initial={editingRow ? representativeToForm(editingRow) : EMPTY_REPRESENTATIVE}
          isNew={editing === 'new'}
          saving={saving}
          onSubmit={handleSubmit}
          onCancel={() => setEditing(null)}
          data-testid="RepresentativeForm__orgRep" />
      ) : (
        <div>
          <AddLineButton
            onClick={() => setEditing('new')}
            label={ui('orgRepAddRow')}
            data-testid="RepresentantesLegalesSection__addButton" />
        </div>
      )}
    </div>
  );
}
