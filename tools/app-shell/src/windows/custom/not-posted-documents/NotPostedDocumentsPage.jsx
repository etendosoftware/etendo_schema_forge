import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import './not-posted-documents.css';

function buildHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function formatDate(raw) {
  if (!raw) return '';
  const s = typeof raw === 'string' ? raw : String(raw);
  return s.slice(0, 10);
}

function MultiSelect({ options, selected, onToggle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedLabels = options.filter(o => selected.has(o.value)).map(o => o.label);

  return (
    <div className="npd-multiselect" ref={ref}>
      <button type="button" className="npd-multiselect-trigger" onClick={() => setOpen(v => !v)}>
        <span className={selected.size === 0 ? 'npd-placeholder' : ''}>
          {selected.size === 0 ? '—' : selectedLabels.join(', ')}
        </span>
        <svg className={`npd-chevron${open ? ' open' : ''}`} width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1.5 3.5l3.5 3 3.5-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="npd-multiselect-dropdown">
          {options.map(o => (
            <label key={o.value} className="npd-multiselect-option">
              <input type="checkbox" checked={selected.has(o.value)} onChange={() => onToggle(o.value)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NotPostedDocumentsPage({ token, apiBaseUrl }) {
  const ui = useUI();
  // apiBaseUrl already points to the spec (e.g. .../swebsf/not-posted-documents)
  const neoUrl = apiBaseUrl;

  // ── Filter options (fetched once) ────────────────────────────────────────────
  const [filterOptions, setFilterOptions] = useState({ documentTypes: [], accountingStatuses: [] });

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`${neoUrl}/header?_mode=filter-options`, {
      headers: buildHeaders(token),
      signal: ctrl.signal,
    })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (j) {
          setFilterOptions({
            documentTypes: j.documentTypes ?? [],
            accountingStatuses: j.accountingStatuses ?? [],
          });
        }
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [neoUrl, token]);

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [document, setDocument] = useState('');
  const [accountingStatuses, setAccountingStatuses] = useState(new Set());

  function toggleAccountingStatus(value) {
    setAccountingStatuses(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });
  }
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ── Document rows ─────────────────────────────────────────────────────────────
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const fetchAbortRef = useRef(null);

  const fetchRows = useCallback(async (filters) => {
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    const ctrl = new AbortController();
    fetchAbortRef.current = ctrl;

    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (filters.document) params.set('document', filters.document);
      if (filters.accountingStatuses?.size > 0)
        params.set('accountingStatus', [...filters.accountingStatuses].join(','));
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);

      const res = await fetch(`${neoUrl}/header?${params}`, {
        headers: buildHeaders(token),
        signal: ctrl.signal,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        if (fetchAbortRef.current === ctrl) setLoadError(json?.message || res.statusText);
        return;
      }
      const rowsData = json?.rows ?? [];
      if (fetchAbortRef.current === ctrl) setRows(rowsData);
    } catch (e) {
      if (e.name !== 'AbortError' && fetchAbortRef.current === ctrl) setLoadError(e.message);
    } finally {
      if (fetchAbortRef.current === ctrl) setLoading(false);
    }
  }, [neoUrl, token]);

  // ── Initial load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchRows({ document: '', accountingStatuses: new Set(), dateFrom: '', dateTo: '' });
  }, [fetchRows]);

  function handleApply() {
    fetchRows({ document, accountingStatuses, dateFrom, dateTo });
    setSelected(new Set());
  }

  // ── Row selection ─────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState(new Set());
  const [posting, setPosting] = useState(new Set());

  function toggleRow(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === rows.length && rows.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map(r => r.documentId)));
    }
  }

  // ── Post single row ───────────────────────────────────────────────────────────
  async function postRow(row) {
    if (!row.tableId) {
      toast.error(`${ui('postingFailed')}: unknown tableId for ${row.documentType}`);
      return;
    }
    setPosting(p => new Set(p).add(row.documentId));
    try {
      const res = await fetch(
        `${neoUrl}/header/${encodeURIComponent(row.documentId)}/action/post`,
        {
          method: 'POST',
          headers: buildHeaders(token),
          body: JSON.stringify({ tableId: row.tableId, recordId: row.documentId }),
        }
      );
      const json = await res.json().catch(() => null);
      if (res.ok && json?.response?.data?.[0]?.success !== false) {
        toast.success(`${row.description ?? row.documentId} — ${ui('documentPosted')}`);
        fetchRows({ document, accountingStatuses, dateFrom, dateTo });
        setSelected(p => { const n = new Set(p); n.delete(row.documentId); return n; });
      } else {
        toast.error(json?.response?.data?.[0]?.message || json?.message || ui('postingFailed'));
      }
    } catch (e) {
      toast.error(ui('postingFailed'));
    } finally {
      setPosting(p => { const n = new Set(p); n.delete(row.documentId); return n; });
    }
  }

  // ── Bulk post ─────────────────────────────────────────────────────────────────
  async function postSelected() {
    const rowsToPost = rows.filter(r => selected.has(r.documentId) && r.tableId);
    if (!rowsToPost.length) {
      toast.error(ui('postingFailed'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `${neoUrl}/header/0/action/bulk-post`,
        {
          method: 'POST',
          headers: buildHeaders(token),
          body: JSON.stringify({
            rows: rowsToPost.map(r => ({ tableId: r.tableId, recordId: r.documentId, label: r.description })),
          }),
        }
      );
      const json = await res.json().catch(() => null);
      const d = json?.response?.data?.[0];
      const ok = d?.ok ?? 0;
      const total = d?.total ?? rowsToPost.length;
      if (ok === total) {
        toast.success(ui('postingComplete'));
      } else if (ok > 0) {
        toast.success(ui('postingPartial').replace('{ok}', ok).replace('{total}', total));
      } else {
        toast.error(ui('postingFailed'));
      }
      fetchRows({ document, accountingStatuses, dateFrom, dateTo });
      setSelected(new Set());
    } catch {
      toast.error(ui('postingFailed'));
    } finally {
      setLoading(false);
    }
  }

  useSetPageMeta({ title: ui('notPostedDocuments'), recordCount: rows.length });

  const allChecked = rows.length > 0 && selected.size === rows.length;
  const someChecked = selected.size > 0 && selected.size < rows.length;

  function renderTableContent() {
    if (loading && !rows.length) return <div className="npd-center"><span>…</span></div>;
    if (loadError) return <div className="npd-center npd-error">{loadError}</div>;
    if (rows.length === 0) {
      return (
        <div data-testid="npd-empty-state" className="npd-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
          <span>{ui('noResults') || 'No unposted documents'}</span>
        </div>
      );
    }
    return (
      <div className="npd-table-wrap">
        <table className="npd-table">
          <thead>
            <tr>
              <th className="col-check">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={el => { if (el) el.indeterminate = someChecked; }}
                  onChange={toggleAll}
                />
              </th>
              <th>{ui('filterDocumentType')}</th>
              <th>{ui('description') || 'Document'}</th>
              <th>{ui('accountingDate') || 'Date'}</th>
              <th>{ui('organization') || 'Organization'}</th>
              <th className="col-actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const id = row.documentId;
              const isPosting = posting.has(id);
              return (
                <tr key={id} data-testid={`npd-row-${id}`} className={selected.has(id) ? 'is-selected' : ''}>
                  <td className="col-check">
                    <input
                      data-testid={`npd-row-checkbox-${id}`}
                      type="checkbox"
                      checked={selected.has(id)}
                      onChange={() => toggleRow(id)}
                    />
                  </td>
                  <td>
                    <span className="npd-doc-type-badge">{row.documentType}</span>
                  </td>
                  <td>{row.description}</td>
                  <td className="npd-date">{formatDate(row.accountingDate)}</td>
                  <td className="npd-date">{row.organization}</td>
                  <td className="col-actions">
                    <button
                      data-testid={`npd-post-row-${id}`}
                      className="npd-btn npd-btn-ghost"
                      onClick={() => postRow(row)}
                      disabled={isPosting || loading}
                    >
                      {isPosting ? '…' : ui('post')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="npd-page">
      {/* ── Filters ──────────────────────────────────────────────────────────── */}
      <div className="npd-filters">
        <div className="npd-filter-field">
          <label>{ui('filterDocumentType')}</label>
          <select data-testid="npd-filter-document-type" value={document} onChange={e => setDocument(e.target.value)}>
            <option value="">—</option>
            {filterOptions.documentTypes.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="npd-filter-field">
          <label>{ui('filterAccountingStatus')}</label>
          <MultiSelect
            options={filterOptions.accountingStatuses}
            selected={accountingStatuses}
            onToggle={toggleAccountingStatus}
          />
        </div>

        <div className="npd-filter-field">
          <label>From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>

        <div className="npd-filter-field">
          <label>To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>

        <button data-testid="npd-filter-apply" className="npd-btn npd-btn-ghost" onClick={handleApply} disabled={loading}>
          {loading ? '…' : ui('search') || 'Search'}
        </button>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="npd-toolbar">
        <div className="npd-toolbar-left">
          {selected.size > 0 && (
            <button
              data-testid="npd-post-selected"
              className="npd-btn npd-btn-primary"
              onClick={postSelected}
              disabled={loading}
            >
              {ui('postSelected')} ({selected.size})
            </button>
          )}
        </div>
        <span className="npd-record-count">
          {rows.length} {ui('records') || 'records'}
        </span>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      {renderTableContent()}
    </div>
  );
}
