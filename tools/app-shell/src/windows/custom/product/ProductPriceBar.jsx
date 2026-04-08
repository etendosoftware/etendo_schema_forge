import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getCatalogOptions } from '@/lib/selectorCatalog.js';

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

function PriceCard({ label, description, value, editing, draft, onDraftChange, onKeyDown }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.select(), 0);
  }, [editing]);

  return (
    <div className="flex-1 rounded-xl border border-gray-200 bg-white p-4 min-w-[200px]">
      <div className="flex items-start justify-between mb-1">
        <span className="text-sm font-semibold text-gray-800">{label}</span>
        <span className="text-[11px] font-semibold bg-gray-900 text-white px-2 py-0.5 rounded-full">Main</span>
      </div>
      <p className="text-xs text-gray-400 mb-3 leading-snug">{description}</p>
      <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
        <div className="text-[11px] text-gray-400 mb-1">Principal price</div>
        {editing ? (
          <input
            ref={inputRef}
            type="number"
            step="0.01"
            value={draft}
            onChange={e => onDraftChange(e.target.value)}
            onKeyDown={onKeyDown}
            className="w-full text-2xl font-bold text-gray-900 bg-transparent border-0 outline-none focus:ring-0 p-0"
            autoFocus
          />
        ) : (
          <div className="text-2xl font-bold text-gray-900">{formatPrice(value)}</div>
        )}
      </div>
    </div>
  );
}

export default function ProductPriceBar({ data, token, apiBaseUrl, catalogs, api }) {
  const recordId = data?.id;
  const [priceRows, setPriceRows] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saleDraft, setSaleDraft] = useState('');
  const [purchaseDraft, setPurchaseDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

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

  const saleRow = hasRows
    ? priceRows.find(r => getSalesFlagFromRow(r) === true) ?? priceRows[0] ?? null
    : null;

  const purchaseCandidate = hasRows
    ? priceRows.find(r => getSalesFlagFromRow(r) === false) ?? null
    : null;

  // If there is only one row and it's not flagged as sales, keep purchase as fallback
  // to avoid writing both prices into the same PriceStd column.
  const purchaseRow = purchaseCandidate && saleRow && String(purchaseCandidate.id) === String(saleRow.id)
    ? null
    : purchaseCandidate;

  // When no dedicated purchase row exists, fall back to listPrice from the sale row
  const purchaseValue = purchaseRow ? purchaseRow.standardPrice : saleRow?.listPrice ?? null;
  const purchaseIsFallback = !purchaseRow && !!saleRow; // using saleRow.listPrice

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

  const startEdit = () => {
    setSaleDraft(saleRow?.standardPrice != null ? String(saleRow.standardPrice) : '');
    setPurchaseDraft(purchaseValue != null ? String(purchaseValue) : '');
    setEditing(true);
  };

  const cancel = () => setEditing(false);

  const save = async () => {
    if (!recordId) {
      toast.info('Save the product first, then configure pricing.');
      return;
    }

    setSaving(true);
    let savedSuccessfully = false;
    try {
      const saleNumber = toFiniteNumber(saleDraft);
      const purchaseNumber = toFiniteNumber(purchaseDraft);

      const patches = [];
      if (saleRow?.id && saleNumber !== null) {
        patches.push(
          fetch(`${apiBaseUrl}/price/${saleRow.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ standardPrice: String(saleNumber) }),
          })
        );
      }

      const purchaseTargetId = purchaseRow?.id ?? saleRow?.id;
      const purchaseField = purchaseRow ? 'standardPrice' : 'listPrice';
      if (purchaseTargetId && purchaseNumber !== null) {
        patches.push(
          fetch(`${apiBaseUrl}/price/${purchaseTargetId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ [purchaseField]: String(purchaseNumber) }),
          })
        );
      }

      if (patches.length > 0) {
        const responses = await Promise.all(patches);
        const failed = responses.find(response => !response.ok);
        if (failed) {
          throw new Error(await extractErrorMessage(failed));
        }
      } else if (!hasRows) {
        if (saleNumber === null && purchaseNumber === null) {
          toast.info('Enter at least one value to create pricing.');
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
      } else {
        toast.info('Enter at least one value to update pricing.');
        return;
      }

      await refreshPrices();
      savedSuccessfully = true;
    } catch (err) {
      toast.error(err?.message || 'Unable to save pricing.');
    } finally {
      setSaving(false);
      if (savedSuccessfully) {
        setEditing(false);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') cancel();
    if (e.key === 'Enter') save();
  };

  if (!recordId) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 mb-2">
        <div className="text-sm font-semibold text-gray-800">Pricing</div>
        <div className="text-xs text-gray-500 mt-1">
          Save the product first. Then you can define sale and purchase prices in a default price list version.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 mb-2">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-gray-800">Pricing</div>
          <div className="text-xs text-gray-400 mt-0.5">
            Configure a main sale price and purchase price. If no pricing exists yet, a default price list row is created automatically.
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {editing ? (
            <>
              <button
                onClick={cancel}
                disabled={saving}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors flex items-center gap-1.5"
              >
                {saving && <Loader2 size={11} className="animate-spin" />}
                Save pricing
              </button>
            </>
          ) : (
            <button
              onClick={startEdit}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 transition-colors font-medium"
            >
              {hasRows ? 'Edit pricing' : 'Set pricing'}
            </button>
          )}
        </div>
      </div>

      {!hasRows && !editing && !loading && (
        <div className="mb-3 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-xs text-gray-500">
          No pricing is configured for this product yet.
        </div>
      )}

      <div className="flex gap-3">
        {loading ? (
          <div className="w-full rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500 flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            Loading pricing...
          </div>
        ) : (
          <>
          <PriceCard
            label="Sales price"
            description="Main price used for sales."
            value={saleRow?.standardPrice}
            editing={editing}
            draft={saleDraft}
            onDraftChange={setSaleDraft}
            onKeyDown={handleKeyDown}
          />
          <PriceCard
            label="Purchase price"
            description={purchaseIsFallback ? 'Uses list price from the same row when no dedicated purchase row exists.' : 'Main price used for purchasing.'}
            value={purchaseValue}
            editing={editing}
            draft={purchaseDraft}
            onDraftChange={setPurchaseDraft}
            onKeyDown={handleKeyDown}
          />
          </>
        )}
      </div>
    </div>
  );
}
