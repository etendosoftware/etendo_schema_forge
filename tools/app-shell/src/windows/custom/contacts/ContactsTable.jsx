import { useMemo, useCallback, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/contract-ui';
import { useLocale, useUI } from '@/i18n';
import { Tag } from '@/components/ui/tag';
import { Button } from '@/components/ui/button.jsx';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog.jsx';
import { extractApiErrorMessage } from '@/lib/apiError';

const filters = ['searchKey', 'name', 'etgoFirstname', 'etgoLastname'];

const INPUT_CLS = 'w-full h-7 px-2 text-sm rounded border border-[#E8EAEF] bg-white text-[#121217] focus:outline-none focus:ring-1 focus:ring-[#121217] focus:border-transparent';

const HIDDEN_COLS = ['__contactType'];

function isPersonRow(row) {
  return row.etgoIsperson === true || row.etgoIsperson === 'Y';
}

function TypeBadge({ row, t }) {
  const isCust = row.customer === true || row.customer === 'Y';
  const isVend = row.vendor === true || row.vendor === 'Y';
  if (isCust && isVend) {
    return (
      <span className="inline-flex items-center gap-1">
        <Tag variant="purple" label={t('Customer')} data-testid="Tag__5c74a8" />
        <Tag variant="blue" label={t('Vendor')} data-testid="Tag__5c74a8" />
      </span>
    );
  }
  if (isCust) return <Tag variant="purple" label={t('Customer')} data-testid="Tag__5c74a8" />;
  if (isVend) return <Tag variant="blue" label={t('Vendor')} data-testid="Tag__5c74a8" />;
  return '—';
}

function EditableCell({ value, onChange, onKeyDown }) {
  return (
    <input
      className={INPUT_CLS}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export default function ContactsTable({ data = [], apiBaseUrl, token, onDataMutated, ...rest }) {
  const dictionary = useLocale();
  const ui = useUI();
  const gl = dictionary?.genericLabels || {};
  const t = (key) => gl[key] || key;

  const [editingRow, setEditingRow] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const handleEditChange = useCallback((key, val) => {
    setEditingRow(prev => prev ? { ...prev, values: { ...prev.values, [key]: val } } : prev);
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSave(); }
    if (e.key === 'Escape') { e.preventDefault(); setEditingRow(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingRow]);

  const handleSave = useCallback(async () => {
    if (!editingRow) return;
    const { id, values } = editingRow;
    setEditingRow(null);
    const res = await fetch(`${apiBaseUrl}/businessPartner/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    onDataMutated?.();
  }, [editingRow, apiBaseUrl, token, onDataMutated]);

  const handleEditRow = useCallback((row) => {
    const isPerson = isPersonRow(row);
    setEditingRow({
      id: row.id,
      values: {
        ...(isPerson
          ? { etgoFirstname: row.etgoFirstname ?? '', etgoLastname: row.etgoLastname ?? '' }
          : { name: row.name ?? '' }
        ),
        etgoWeb: row.etgoWeb ?? '',
        etgoEmail: row.etgoEmail ?? '',
        etgoPhone: row.etgoPhone ?? '',
      },
    });
  }, []);

  const handleCancelEdit = useCallback(() => setEditingRow(null), []);

  const columns = useMemo(() => {
    const isEditing = (row) => editingRow?.id === row.id;
    return [
      {
        key: 'name', column: 'Name', type: 'string', label: t('commercialName'),
        render: (row) => (isEditing(row) && !isPersonRow(row))
          ? <EditableCell
          value={editingRow.values.name ?? ''}
          onChange={(v) => handleEditChange('name', v)}
          onKeyDown={handleKeyDown}
          data-testid="EditableCell__5c74a8" />
          : (row.name ?? '—'),
      },
      {
        key: 'etgoFirstname', column: 'EM_Etgo_Firstname', type: 'string', label: t('firstNameColumn'),
        render: (row) => (isEditing(row) && isPersonRow(row))
          ? <EditableCell
          value={editingRow.values.etgoFirstname ?? ''}
          onChange={(v) => handleEditChange('etgoFirstname', v)}
          onKeyDown={handleKeyDown}
          data-testid="EditableCell__5c74a8" />
          : (row.etgoFirstname ?? '—'),
      },
      {
        key: 'etgoLastname', column: 'EM_Etgo_Lastname', type: 'string', label: t('lastNameColumn'),
        render: (row) => (isEditing(row) && isPersonRow(row))
          ? <EditableCell
          value={editingRow.values.etgoLastname ?? ''}
          onChange={(v) => handleEditChange('etgoLastname', v)}
          onKeyDown={handleKeyDown}
          data-testid="EditableCell__5c74a8" />
          : (row.etgoLastname ?? '—'),
      },
      {
        key: '__type', type: 'string', label: t('typeColumn'), sortable: false, filterable: false,
        render: (row) => <TypeBadge row={row} t={t} data-testid="TypeBadge__5c74a8" />,
      },
      {
        key: 'eTGOLocation', column: 'EM_Etgo_Location', type: 'string', label: t('locationColumn'),
        render: (row) => row.eTGOLocation ?? '—',
      },
      {
        key: 'etgoWeb', column: 'EM_Etgo_Web', type: 'string', label: t('webColumn'),
        render: (row) => isEditing(row)
          ? <EditableCell
          value={editingRow.values.etgoWeb ?? ''}
          onChange={(v) => handleEditChange('etgoWeb', v)}
          onKeyDown={handleKeyDown}
          data-testid="EditableCell__5c74a8" />
          : (row.etgoWeb ?? '—'),
      },
      {
        key: 'etgoEmail', column: 'EM_Etgo_Email', type: 'string', label: t('emailColumn'),
        render: (row) => isEditing(row)
          ? <EditableCell
          value={editingRow.values.etgoEmail ?? ''}
          onChange={(v) => handleEditChange('etgoEmail', v)}
          onKeyDown={handleKeyDown}
          data-testid="EditableCell__5c74a8" />
          : (row.etgoEmail ?? '—'),
      },
      {
        key: 'etgoPhone', column: 'EM_Etgo_Phone', type: 'string', label: t('phoneColumn'),
        render: (row) => isEditing(row)
          ? <EditableCell
          value={editingRow.values.etgoPhone ?? ''}
          onChange={(v) => handleEditChange('etgoPhone', v)}
          onKeyDown={handleKeyDown}
          data-testid="EditableCell__5c74a8" />
          : (row.etgoPhone ?? '—'),
      },
      // Hidden virtual column — appears in conditional filter panel as "Tipo" with
      // "Cliente"/"Proveedor" options. buildCriteria maps each value to the real
      // backend boolean field (customer / vendor).
      {
        key: '__contactType', type: 'enum', label: t('typeColumn'),
        filterable: true, sortable: false, render: () => null,
        enumLabels: { customer: t('Customer'), vendor: t('Vendor') },
        buildCriteria: (condition) => {
          const { operator, value } = condition;
          if (operator === 'equals') {
            if (value === 'customer') return [{ fieldName: 'customer', operator: 'equals', value: true }];
            if (value === 'vendor')   return [{ fieldName: 'vendor',   operator: 'equals', value: true }];
          }
          if (operator === 'notEqual') {
            if (value === 'customer') return [{ fieldName: 'customer', operator: 'equals', value: false }];
            if (value === 'vendor')   return [{ fieldName: 'vendor',   operator: 'equals', value: false }];
          }
          return null;
        },
      },
    ];
  // editingRow in deps so renders update when editing state changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, editingRow, handleEditChange, handleKeyDown]);

  // Returns a Promise so DataTable's spinner stays active until the user confirms or cancels.
  const handleDeleteRow = useCallback((row) => {
    return new Promise((resolve) => {
      setPendingDelete({ row, resolve });
    });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const { row, resolve } = pendingDelete;
    setPendingDelete(null);
    try {
      const res = await fetch(`${apiBaseUrl}/businessPartner/${row.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        toast.error(await extractApiErrorMessage(res));
      } else {
        onDataMutated?.();
      }
    } catch (err) {
      toast.error(err.message || 'Network error');
    } finally {
      resolve();
    }
  }, [pendingDelete, apiBaseUrl, token, onDataMutated]);

  const cancelDelete = useCallback(() => {
    pendingDelete?.resolve();
    setPendingDelete(null);
  }, [pendingDelete]);

  return (
    <>
      <DataTable
        columns={columns}
        hiddenColumns={HIDDEN_COLS}
        filters={filters}
        data={data}
        apiBaseUrl={apiBaseUrl}
        token={token}
        onDataMutated={onDataMutated}
        onDeleteRow={handleDeleteRow}
        onEditRow={handleEditRow}
        editingRowId={editingRow?.id ?? null}
        onSaveRow={handleSave}
        onCancelEdit={handleCancelEdit}
        {...rest}
        data-testid="DataTable__5c74a8" />
      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => { if (!open) cancelDelete(); }}
        data-testid="Dialog__5c74a8">
        <DialogContent className="max-w-sm" data-testid="DialogContent__5c74a8">
          <DialogHeader data-testid="DialogHeader__5c74a8">
            <DialogTitle data-testid="DialogTitle__5c74a8">{ui('deleteConfirmTitle')}</DialogTitle>
            <DialogDescription data-testid="DialogDescription__5c74a8">{ui('deleteConfirmMessage')}</DialogDescription>
          </DialogHeader>
          <DialogFooter data-testid="DialogFooter__5c74a8">
            <Button
              variant="outline"
              size="sm"
              onClick={cancelDelete}
              data-testid="Button__5c74a8">
              {ui('cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={confirmDelete}
              data-testid="Button__5c74a8">
              {ui('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
