import { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getCatalogOptions } from '@/lib/selectorCatalog.js';
import { useUI } from '@/i18n';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

function formatPrice(v) {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (['true', 'y', 'yes', '1'].includes(normalized)) return true;
  if (['false', 'n', 'no', '0'].includes(normalized)) return false;
  return null;
}

function getSalesFlagFromOption(option) {
  if (!option || typeof option !== 'object') return null;
  for (const [key, value] of Object.entries(option)) {
    if (!key.toLowerCase().includes('salespricelist')) continue;
    const parsed = parseBoolean(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function getSalesFlagFromRow(row) {
  return parseBoolean(row?.['priceListVersion$salesPriceList']);
}

async function extractErrorMessage(res) {
  try {
    const data = await res.json();
    if (data?.error?.message) return data.error.message;
    if (data?.response?.error?.message) return data.response.error.message;
    if (typeof data?.response?.error === 'string') return data.response.error;
    const validationErrors = data?.response?.errors;
    if (validationErrors && typeof validationErrors === 'object') {
      const messages = Object.entries(validationErrors)
        .map(([field, detail]) => {
          if (typeof detail === 'string') return `${field}: ${detail}`;
          if (detail?.errorMessage) return `${field}: ${detail.errorMessage}`;
          if (detail?.message) return `${field}: ${detail.message}`;
          return null;
        })
        .filter(Boolean);
      if (messages.length > 0) return messages.join(' | ');
    }
    if (data?.message) return data.message;
  } catch {
    // Ignore non-JSON responses.
  }
  return `Error ${res.status}`;
}

function toFiniteNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractReferenceId(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value === 'object') {
    const objectId = value.id ?? value.value ?? value.key ?? null;
    return extractReferenceId(objectId);
  }
  return null;
}

function sanitizeDefaults(defaults) {
  const clean = {};
  if (!defaults || typeof defaults !== 'object') return clean;

  for (const [key, rawValue] of Object.entries(defaults)) {
    if (rawValue == null) continue;
    if (key === 'id') continue;

    if (typeof rawValue === 'object') {
      const refId = extractReferenceId(rawValue);
      if (refId != null) clean[key] = refId;
      continue;
    }

    clean[key] = rawValue;
  }

  return clean;
}

function looksLikeEtendoId(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return /^[0-9]+$/.test(trimmed) || /^[0-9A-Fa-f]{32}$/.test(trimmed);
}

function resolveOptionId(options, candidate) {
  const normalizedCandidate = extractReferenceId(candidate);
  if (!normalizedCandidate) return null;
  if (!Array.isArray(options) || options.length === 0) return null;

  const byId = options.find(opt => extractReferenceId(opt?.id) === normalizedCandidate);
  if (byId) return extractReferenceId(byId.id);

  const byName = options.find(opt => {
    const name = typeof opt?.name === 'string' ? opt.name.trim() : null;
    return name && name === normalizedCandidate;
  });
  if (byName) return extractReferenceId(byName.id);

  if (looksLikeEtendoId(normalizedCandidate)) return null;
  return null;
}

function PriceTable({ title, rows, variant = 'neutral' }) {
  const isEmpty = !rows || rows.length === 0;
  const tone = variant === 'sales'
    ? {
      shell: 'border-blue-200 bg-blue-50/70',
      badge: 'bg-blue-100 text-blue-700',
      listPrice: 'text-blue-700',
    }
    : variant === 'purchase'
      ? {
        shell: 'border-emerald-200 bg-emerald-50/70',
        badge: 'bg-emerald-100 text-emerald-700',
        listPrice: 'text-emerald-700',
      }
      : {
        shell: 'border-gray-200 bg-gray-50',
        badge: 'bg-gray-100 text-gray-700',
        listPrice: 'text-gray-900',
      };

  return (
    <div className={`rounded-2xl border p-3 ${tone.shell}`}>
      <div className="flex items-center justify-between px-2 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-800">{title}</span>
          {!isEmpty && (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.badge}`}>
              {rows.length} {rows.length === 1 ? 'list' : 'lists'}
            </span>
          )}
        </div>
      </div>

      {isEmpty ? (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 text-xs text-gray-400">
          No price lists configured for this type.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full table-fixed">
            <colgroup>
              <col />
              <col className="w-36" />
              <col className="w-36" />
            </colgroup>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Name</th>
                <th className="w-36 text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Unit Price</th>
                <th className="w-36 text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">List Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const unitPrice = Number(row.standardPrice) || 0;
                const listPrice = Number(row.listPrice) || 0;
                const currency = row.currencySymbol ?? '€';
                const name = row['priceListVersion$_identifier'] || row['priceList$_identifier'] || 'Unknown';
                return (
                  <tr key={row.id} className={`${idx > 0 ? 'border-t border-gray-100' : ''}`}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-800 truncate">{name}</td>
                    <td className="w-36 px-4 py-3 text-sm text-gray-500 text-right">{formatPrice(unitPrice)} {currency}</td>
                    <td className={`w-36 px-4 py-3 text-sm font-bold text-right ${tone.listPrice}`}>{formatPrice(listPrice)} {currency}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


function PricingDialog({ open, onOpenChange, priceRows, apiBaseUrl, token, onSaved, selectorOptions = [], productId }) {
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [pendingSale, setPendingSale] = useState(null);
  const [pendingPurchase, setPendingPurchase] = useState(null);
  const [stagedAdds, setStagedAdds] = useState([]);
  const [stagedDeletes, setStagedDeletes] = useState([]);

  useEffect(() => {
    if (open && Array.isArray(priceRows)) {
      const initial = {};
      for (const row of priceRows) {
        initial[row.id] = {
          standardPrice: String(row.standardPrice ?? ''),
          listPrice: String(row.listPrice ?? ''),
        };
      }
      setDrafts(initial);
      setPendingSale(null);
      setPendingPurchase(null);
      setStagedAdds([]);
      setStagedDeletes([]);
    }
  }, [open, priceRows]);

  const saleOptions = useMemo(() => {
    if (!Array.isArray(selectorOptions) || selectorOptions.length === 0) return [];
    const filtered = selectorOptions.filter(opt => getSalesFlagFromOption(opt) === true);
    return filtered.length > 0 ? filtered : selectorOptions;
  }, [selectorOptions]);

  const purchaseOptions = useMemo(() => {
    if (!Array.isArray(selectorOptions) || selectorOptions.length === 0) return [];
    const filtered = selectorOptions.filter(opt => getSalesFlagFromOption(opt) === false);
    return filtered.length > 0 ? filtered : selectorOptions;
  }, [selectorOptions]);

  const handleAddRow = (pending, clearPending, options, variant) => {
    if (!pending?.plvId) {
      toast.error('Select a price list version first.');
      return;
    }
    const existsInCurrent = (priceRows ?? []).some(row => String(row.priceListVersion) === String(pending.plvId));
    const existsInStaged = stagedAdds.some(row => String(row.priceListVersion) === String(pending.plvId));
    if (existsInCurrent || existsInStaged) {
      toast.error('This price list version is already present.');
      return;
    }

    const selected = options.find(opt => String(extractReferenceId(opt.id)) === String(pending.plvId));
    const label = selected?.name || selected?.label || pending.plvId;
    const isSales = variant === 'sales';

    const newId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setStagedAdds(prev => ([
      ...prev,
      {
        id: newId,
        isNewRow: true,
        priceListVersion: pending.plvId,
        'priceListVersion$_identifier': label,
        'priceListVersion$salesPriceList': isSales,
        standardPrice: pending.stdPrice || '0',
        listPrice: pending.listPrice || '0',
      },
    ]));
    setDrafts(prev => ({
      ...prev,
      [newId]: {
        standardPrice: String(pending.stdPrice || '0'),
        listPrice: String(pending.listPrice || '0'),
      },
    }));

    clearPending(null);
  };

  const handleDeleteRow = (rowId) => {
    if (String(rowId).startsWith('new-')) {
      setStagedAdds(prev => prev.filter(row => row.id !== rowId));
      setDrafts(prev => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      return;
    }
    setStagedDeletes(prev => (prev.includes(rowId) ? prev : [...prev, rowId]));
  };

  const effectiveRows = useMemo(() => {
    const baseRows = (priceRows ?? []).filter(row => !stagedDeletes.includes(row.id));
    return [...baseRows, ...stagedAdds];
  }, [priceRows, stagedDeletes, stagedAdds]);

  const saleRows = useMemo(() => {
    if (!Array.isArray(effectiveRows)) return [];
    return effectiveRows.filter(r => getSalesFlagFromRow(r) === true);
  }, [effectiveRows]);

  const purchaseRows = useMemo(() => {
    if (!Array.isArray(effectiveRows)) return [];
    return effectiveRows.filter(r => getSalesFlagFromRow(r) === false);
  }, [effectiveRows]);

  const updateDraft = (id, field, value) => {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const hasDraftChanges = useMemo(() => {
    return Array.isArray(priceRows) && priceRows.some(row => {
      if (stagedDeletes.includes(row.id)) return false;
      const draft = drafts[row.id];
      if (!draft) return false;
      return draft.standardPrice !== String(row.standardPrice ?? '')
        || draft.listPrice !== String(row.listPrice ?? '');
    });
  }, [drafts, priceRows, stagedDeletes]);

  const hasPendingDraft = Boolean(pendingSale || pendingPurchase);
  const hasUnsavedChanges = hasDraftChanges || stagedAdds.length > 0 || stagedDeletes.length > 0 || hasPendingDraft;

  const handleSave = async () => {
    if (!Array.isArray(priceRows)) return;
    if (pendingSale || pendingPurchase) {
      toast.info('There are unfinished new rows. Complete or cancel them before saving.');
      return false;
    }

    setSaving(true);
    try {
      for (const rowId of stagedDeletes) {
        const res = await fetch(`${apiBaseUrl}/price/${rowId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await extractErrorMessage(res));
      }

      for (const row of stagedAdds) {
        const draft = drafts[row.id] ?? {
          standardPrice: String(row.standardPrice ?? '0'),
          listPrice: String(row.listPrice ?? '0'),
        };
        const res = await fetch(`${apiBaseUrl}/price`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            parentId: productId,
            product: productId,
            priceListVersion: row.priceListVersion,
            standardPrice: draft.standardPrice || '0',
            listPrice: draft.listPrice || '0',
            priceLimit: draft.listPrice || '0',
          }),
        });
        if (!res.ok) throw new Error(await extractErrorMessage(res));
      }

      const changedRows = priceRows.filter(row => {
        if (stagedDeletes.includes(row.id)) return false;
        const draft = drafts[row.id];
        if (!draft) return false;
        return draft.standardPrice !== String(row.standardPrice ?? '')
          || draft.listPrice !== String(row.listPrice ?? '');
      });

      for (const row of changedRows) {
        const draft = drafts[row.id];
        const res = await fetch(`${apiBaseUrl}/price/${row.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            standardPrice: draft.standardPrice,
            listPrice: draft.listPrice,
          }),
        });
        if (!res.ok) {
          throw new Error(await extractErrorMessage(res));
        }
      }

      toast.success('Pricing updated successfully.');
      if (onSaved) await onSaved();
      setStagedAdds([]);
      setStagedDeletes([]);
      setPendingSale(null);
      setPendingPurchase(null);
      return true;
    } catch (err) {
      toast.error(err?.message || 'Unable to save pricing.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleRequestClose = (open) => {
    if (!open && hasUnsavedChanges) {
      setShowCloseConfirm(true);
      return;
    }
    onOpenChange(open);
  };

  const handleDiscard = () => {
    setShowCloseConfirm(false);
    onOpenChange(false);
  };

  const handleSaveAndClose = async () => {
    setShowCloseConfirm(false);
    const saved = await handleSave();
    if (saved) {
      onOpenChange(false);
    }
  };

  const renderSection = (title, rows, pending, setPending, options, variant = 'neutral') => {
    const showTable = rows.length > 0 || pending;
    const tone = variant === 'sales'
      ? {
        shell: 'border-blue-200 bg-blue-50/70',
        badge: 'bg-blue-100 text-blue-700',
        focus: 'focus:ring-blue-500',
        pending: 'border-t border-blue-100 bg-blue-50/30',
      }
      : {
        shell: 'border-emerald-200 bg-emerald-50/70',
        badge: 'bg-emerald-100 text-emerald-700',
        focus: 'focus:ring-emerald-500',
        pending: 'border-t border-emerald-100 bg-emerald-50/30',
      };

    return (
      <div className={`flex-1 min-w-0 rounded-2xl border p-3 ${tone.shell}`}>
        <div className="flex items-center justify-between px-2 pb-3">
          <div className="flex items-center gap-2">
            <div className="text-sm font-bold text-gray-800">{title}</div>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.badge}`}>
              {(rows.length + (pending ? 1 : 0))} {rows.length + (pending ? 1 : 0) === 1 ? 'list' : 'lists'}
            </span>
          </div>
          {!pending && (
            <button
              type="button"
              onClick={() => setPending({ plvId: '', stdPrice: '', listPrice: '' })}
              className="w-6 h-6 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 transition-colors font-medium shrink-0 text-sm"
            >
              +
            </button>
          )}
        </div>

        {!showTable && (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 text-xs text-gray-400">
            No price lists configured for this type.
          </div>
        )}

        {showTable && (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col />
                <col className="w-32" />
                <col className="w-32" />
                <col className="w-14" />
              </colgroup>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="w-full text-left px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="whitespace-nowrap text-right px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Unit Price</th>
                  <th className="whitespace-nowrap text-right px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">List Price</th>
                  <th className="w-14" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const draft = drafts[row.id] ?? {
                    standardPrice: String(row.standardPrice ?? ''),
                    listPrice: String(row.listPrice ?? ''),
                  };
                  return (
                    <tr key={row.id} className={idx > 0 ? 'border-t border-gray-100' : ''}>
                      <td className="px-3 py-2 font-medium text-gray-700 truncate">
                        {row['priceListVersion$_identifier'] || 'Unknown'}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={draft.standardPrice}
                          onChange={e => updateDraft(row.id, 'standardPrice', e.target.value)}
                          className={`w-28 text-right text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 ${tone.focus}`}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={draft.listPrice}
                          onChange={e => updateDraft(row.id, 'listPrice', e.target.value)}
                          className={`w-28 text-right text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 ${tone.focus}`}
                        />
                      </td>
                      <td className="w-14 px-1 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(row.id)}
                          title="Remove"
                          className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 bg-white text-gray-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors disabled:opacity-40"
                        >
                          <span className="text-[11px] leading-none">✕</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {pending && (
                  <tr className={tone.pending}>
                    <td className="px-2 py-1.5">
                      <select
                        value={pending.plvId}
                        onChange={e => setPending(p => ({ ...p, plvId: e.target.value }))}
                        className={`w-full text-sm border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 ${tone.focus}`}
                        autoFocus
                      >
                        <option value="">Select version…</option>
                        {options.map(opt => {
                          const id = extractReferenceId(opt.id);
                          return (
                            <option key={id} value={id}>
                              {opt.name || opt.label || id}
                            </option>
                          );
                        })}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={pending.stdPrice}
                        onChange={e => setPending(p => ({ ...p, stdPrice: e.target.value }))}
                        placeholder="0.00"
                        className={`w-28 text-right text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 ${tone.focus}`}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={pending.listPrice}
                        onChange={e => setPending(p => ({ ...p, listPrice: e.target.value }))}
                        placeholder="0.00"
                        className={`w-28 text-right text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 ${tone.focus}`}
                      />
                    </td>
                    <td className="w-14 px-1 py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setPending(null)}
                          title="Cancel"
                          className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 transition-colors text-xs"
                        >
                          ✕
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddRow(pending, setPending, options, variant)}
                          disabled={!pending.plvId}
                          title="Add"
                          className="w-6 h-6 flex items-center justify-center rounded border border-transparent bg-gray-900 text-white hover:bg-gray-700 transition-colors disabled:opacity-40 text-xs"
                        >
                          ✓
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleRequestClose}>
      <DialogContent className="max-w-5xl w-full">
        <div className="relative">
          <DialogHeader>
            <DialogTitle className="text-lg">Manage Pricing</DialogTitle>
            <DialogDescription className="mt-1">
              View and edit prices for all price lists assigned to this product.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-4 pt-2 max-h-[60vh] overflow-y-auto items-start">
            {renderSection('Sales Price Lists', saleRows, pendingSale, setPendingSale, saleOptions, 'sales')}
            {renderSection('Purchase Price Lists', purchaseRows, pendingPurchase, setPendingPurchase, purchaseOptions, 'purchase')}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100 mt-1">
            <button
              type="button"
              onClick={() => handleRequestClose(false)}
              disabled={saving}
              className="text-xs px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !hasUnsavedChanges}
                className="text-xs px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
              {saving && <Loader2 size={11} className="animate-spin" />}
              Save changes
            </button>
          </div>

          {showCloseConfirm && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/75 backdrop-blur-[2px]">
              <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-5 max-w-xs w-full mx-4">
                <div className="text-sm font-semibold text-gray-900 mb-1">Unsaved changes</div>
                <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                  You have changes that haven't been saved yet. What would you like to do?
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={handleDiscard}
                    disabled={saving}
                    className="text-xs px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    Discard changes
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAndClose}
                    disabled={saving}
                    className="text-xs px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {saving && <Loader2 size={11} className="animate-spin" />}
                    Save changes
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ProductPriceBar({ data, token, apiBaseUrl, catalogs, api }) {
  const ui = useUI();
  const recordId = data?.id;
  const [priceRows, setPriceRows] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Create-flow drafts (used only when no rows exist yet)
  const [saleDraft, setSaleDraft] = useState('');
  const [purchaseDraft, setPurchaseDraft] = useState('');
  const [creating, setCreating] = useState(false);

  const priceSelector = useMemo(() => (
    api?.selectors?.find(sel => sel.entity === 'price' && (sel.field === 'priceListVersion' || sel.column === 'M_PriceList_Version_ID'))
  ), [api]);

  const selectorOptions = useMemo(() => (
    priceSelector ? getCatalogOptions(catalogs, 'price', priceSelector) : []
  ), [catalogs, priceSelector]);

  const refreshPrices = useCallback(async () => {
    if (!recordId || !token) {
      setPriceRows([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/price?parentId=${recordId}&_startRow=0&_endRow=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const payload = await res.json();
      setPriceRows(payload?.response?.data ?? []);
    } catch {
      setPriceRows([]);
    } finally {
      setLoading(false);
    }
  }, [recordId, token, apiBaseUrl]);

  useEffect(() => {
    refreshPrices();
  }, [refreshPrices]);

  const hasRows = Array.isArray(priceRows) && priceRows.length > 0;
  const displaySaleRows = hasRows ? priceRows.filter(r => getSalesFlagFromRow(r) === true) : [];
  const displayPurchaseRows = hasRows ? priceRows.filter(r => getSalesFlagFromRow(r) === false) : [];

  const resolveCreateDefaults = useCallback(async () => {
    if (!token || !apiBaseUrl) {
      return { priceListVersion: null, priceList: null };
    }

    const defaultUrl = recordId
      ? `${apiBaseUrl}/price/defaults?parentId=${recordId}`
      : `${apiBaseUrl}/price/defaults`;

    let priceListVersion = null;
    let priceList = null;

    try {
      const defaultsRes = await fetch(defaultUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (defaultsRes.ok) {
        const defaultsPayload = await defaultsRes.json();
        const defaults = sanitizeDefaults(defaultsPayload?.defaults ?? {});
        priceListVersion = extractReferenceId(
          defaults.priceListVersion
          ?? defaults.M_PriceList_Version_ID
          ?? defaults.priceListVersionId
        );
        priceList = extractReferenceId(
          defaults.priceList
          ?? defaults.M_PriceList_ID
          ?? defaults.priceListId
        );
      }
    } catch {
      // Continue with selector fallback.
    }

    priceListVersion = resolveOptionId(selectorOptions, priceListVersion);

    if (!priceListVersion && Array.isArray(selectorOptions) && selectorOptions.length > 0) {
      const salesOption = selectorOptions.find(option => getSalesFlagFromOption(option) === true);
      priceListVersion = extractReferenceId(salesOption?.id) ?? extractReferenceId(selectorOptions[0]?.id);
    }

    if (!priceListVersion) {
      const selectorColumn = priceSelector?.column ?? 'M_PriceList_Version_ID';
      try {
        const selectorRes = await fetch(`${apiBaseUrl}/price/selectors/${selectorColumn}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (selectorRes.ok) {
          const selectorPayload = await selectorRes.json();
          const options = (selectorPayload?.items ?? []).map(item => ({
            id: item.id,
            name: item.label || item.name || item.id,
            ...item,
          }));
          const salesOption = options.find(option => getSalesFlagFromOption(option) === true);
          priceListVersion = extractReferenceId(salesOption?.id) ?? extractReferenceId(options[0]?.id);
        }
      } catch {
        // Keep null and validate before create.
      }
    }

    return { priceListVersion, priceList };
  }, [recordId, token, apiBaseUrl, selectorOptions, priceSelector]);

  const handleOpenDialog = () => {
    if (hasRows) {
      setDialogOpen(true);
    } else {
      // No rows: use create flow
      setSaleDraft('');
      setPurchaseDraft('');
      setCreating(true);
    }
  };

  const handleDialogSaved = async () => {
    await refreshPrices();
    setDialogOpen(false);
  };

  const cancelCreate = () => setCreating(false);

  const saveCreate = async () => {
    if (!recordId) {
      toast.info(ui('saveProductFirstPricing'));
      return;
    }

    setSaving(true);
    let savedSuccessfully = false;
    try {
      const saleNumber = toFiniteNumber(saleDraft);
      const purchaseNumber = toFiniteNumber(purchaseDraft);

      if (saleNumber === null && purchaseNumber === null) {
        toast.info(ui('enterAtLeastOneValueCreatePricing'));
        return;
      }

      const { priceListVersion, priceList } = await resolveCreateDefaults();
      const resolvedSale = saleNumber ?? purchaseNumber;
      const resolvedPurchase = purchaseNumber ?? saleNumber;
      const normalizedSale = resolvedSale ?? 0;
      const normalizedPurchase = resolvedPurchase ?? normalizedSale;

      const createPayload = {
        parentId: recordId,
        product: recordId,
        standardPrice: String(normalizedSale),
        listPrice: String(normalizedPurchase),
        priceLimit: String(normalizedPurchase),
        cost: '0',
        algorithm: 'S',
        active: true,
      };
      const organizationId = extractReferenceId(data?.organization);
      if (organizationId) {
        createPayload.organization = organizationId;
      }
      const clientId = extractReferenceId(data?.client);
      if (clientId) {
        createPayload.client = clientId;
      }
      if (priceList) {
        createPayload.priceList = priceList;
      }
      if (priceListVersion && priceListVersion !== recordId) {
        createPayload.priceListVersion = priceListVersion;
      }

      const minimalPayload = {
        parentId: recordId,
        standardPrice: String(normalizedSale),
        listPrice: String(normalizedPurchase),
        priceLimit: String(normalizedPurchase),
      };
      if (createPayload.priceListVersion) {
        minimalPayload.priceListVersion = createPayload.priceListVersion;
      }
      if (createPayload.priceList) {
        minimalPayload.priceList = createPayload.priceList;
      }

      const fallbackPayload = {
        parentId: recordId,
        product: recordId,
        standardPrice: String(normalizedSale),
        listPrice: String(normalizedPurchase),
      };
      if (createPayload.priceListVersion) {
        fallbackPayload.priceListVersion = createPayload.priceListVersion;
      }
      if (createPayload.priceList) {
        fallbackPayload.priceList = createPayload.priceList;
      }

      const noPriceListPayload = {
        parentId: recordId,
        product: recordId,
        standardPrice: String(normalizedSale),
        listPrice: String(normalizedPurchase),
        priceLimit: String(normalizedPurchase),
      };

      const attemptPayloads = [];
      const seenPayloads = new Set();
      for (const candidate of [noPriceListPayload, createPayload, minimalPayload, fallbackPayload]) {
        const signature = JSON.stringify(candidate);
        if (seenPayloads.has(signature)) continue;
        seenPayloads.add(signature);
        attemptPayloads.push(candidate);
      }

      let createRes = null;
      const failedAttempts = [];
      for (const candidate of attemptPayloads) {
        const res = await fetch(`${apiBaseUrl}/price`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(candidate),
        });

        if (res.ok) {
          createRes = res;
          break;
        }

        let errorPayload = null;
        try {
          errorPayload = await res.clone().json();
        } catch {
          try {
            errorPayload = await res.clone().text();
          } catch {
            errorPayload = null;
          }
        }
        failedAttempts.push({ payload: candidate, response: errorPayload, status: res.status });
        createRes = res;
      }

      if (!createRes?.ok) {
        const normalizedAttempts = [];
        for (const attempt of failedAttempts) {
          let parsedMessage = `HTTP ${attempt.status}`;
          try {
            const fakeResponse = {
              json: async () => attempt.response,
              status: attempt.status,
            };
            parsedMessage = await extractErrorMessage(fakeResponse);
          } catch {
            // Keep default parsed message.
          }
          normalizedAttempts.push({
            status: attempt.status,
            payload: attempt.payload,
            parsedMessage,
            response: attempt.response,
          });
        }
        console.error('Product pricing create failed', {
          failedAttempts: normalizedAttempts,
          failedAttemptsJson: JSON.stringify(normalizedAttempts, null, 2),
        });
        throw new Error(await extractErrorMessage(createRes));
      }

      toast.success('Pricing created using default values.');
      await refreshPrices();
      savedSuccessfully = true;
    } catch (err) {
      toast.error(err?.message || ui('unableToSavePricing'));
    } finally {
      setSaving(false);
      if (savedSuccessfully) {
        setCreating(false);
      }
    }
  };

  const handleCreateKeyDown = (e) => {
    if (e.key === 'Escape') cancelCreate();
    if (e.key === 'Enter') saveCreate();
  };

  if (!recordId) {
    return (
      <div className="rounded-2xl border border-gray-200/70 bg-white shadow-sm p-5 mb-2">
        <div className="text-sm font-semibold text-gray-800">{ui('pricing')}</div>
        <div className="text-sm text-gray-500 mt-1">
          {ui('saveProductFirstPricing')}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200/70 bg-white shadow-sm pt-2 pb-5 px-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-base font-semibold text-gray-800">{ui('pricing')}</div>
          <div className="text-sm text-gray-400 mt-0.5">
            {ui('configureMainSaleAndPurchasePrice')}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {creating ? (
            <>
              <button
                onClick={cancelCreate}
                disabled={saving}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 transition-colors"
              >
                {ui('cancel')}
              </button>
              <button
                onClick={saveCreate}
                disabled={saving}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors flex items-center gap-1.5"
              >
                {saving && <Loader2 size={11} className="animate-spin" />}
                {ui('savePricing')}
              </button>
            </>
          ) : (
            <button
              onClick={handleOpenDialog}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 transition-colors font-medium"
            >
              {hasRows ? ui('editPricing') : ui('setPricing')}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" />
          {ui('loadingPricing')}
        </div>
      ) : creating && !hasRows ? (
        <div className="flex gap-3">
          <div className="flex-1 rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-sm font-semibold text-gray-800 mb-1">Sales price</div>
            <p className="text-xs text-gray-400 mb-3">Initial price used for sales lists.</p>
            <input
              type="number"
              step="0.01"
              value={saleDraft}
              onChange={e => setSaleDraft(e.target.value)}
              onKeyDown={handleCreateKeyDown}
              placeholder="0.00"
              className="w-full text-2xl font-bold text-gray-900 bg-transparent border-0 outline-none focus:ring-0 p-0"
              autoFocus
            />
          </div>
          <div className="flex-1 rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-sm font-semibold text-gray-800 mb-1">Purchase price</div>
            <p className="text-xs text-gray-400 mb-3">Initial price used for purchase lists.</p>
            <input
              type="number"
              step="0.01"
              value={purchaseDraft}
              onChange={e => setPurchaseDraft(e.target.value)}
              onKeyDown={handleCreateKeyDown}
              placeholder="0.00"
              className="w-full text-2xl font-bold text-gray-900 bg-transparent border-0 outline-none focus:ring-0 p-0"
            />
          </div>
        </div>
      ) : !hasRows ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-400">
          {ui('noPricingConfigured')}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 items-start">
          <PriceTable title="Sales Price Lists" rows={displaySaleRows} variant="sales" />
          <PriceTable title="Purchase Price Lists" rows={displayPurchaseRows} variant="purchase" />
        </div>
      )}

      <PricingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        priceRows={priceRows}
        apiBaseUrl={apiBaseUrl}
        token={token}
        onSaved={handleDialogSaved}
        selectorOptions={selectorOptions}
        productId={recordId}
      />
    </div>
  );
}
