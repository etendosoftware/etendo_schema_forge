import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

function buildHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Extract a human-readable error message from a NEO Headless error response.
 */
async function extractErrorMessage(res) {
  try {
    const data = await res.json();
    // NEO Headless top-level error: { error: { message, status } }
    if (data?.error?.message) return data.error.message;
    // Etendo JsonDataService wraps errors in response.error
    const err = data?.response?.error;
    if (err?.message) return err.message;
    if (typeof err === 'string') return err;
    if (data?.message) return data.message;
  } catch { /* body not JSON */ }
  return `Error ${res.status}`;
}

const BATCH_SIZE = 75;

/**
 * Resolve the backend sort key for a given column.
 * FK columns have a companion `col$_identifier` in the response — sorting by that
 * produces alphabetical order instead of sorting by the raw UUID.
 */
function resolveSortKey(sortColumn, sampleRow) {
  if (!sampleRow) return sortColumn;
  const identifierKey = `${sortColumn}$_identifier`;
  if (identifierKey in sampleRow) return identifierKey;
  return sortColumn;
}

export function useEntity(entity, childEntity, { token, apiBaseUrl, childSortBy }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [saveError, setSaveError] = useState(null);
  const [sortColumn, setSortColumn] = useState('creationDate');
  const [sortDirection, setSortDirection] = useState('desc');
  const startRowRef = useRef(0);
  const sampleRowRef = useRef(null);

  const headers = buildHeaders(token);

  const refresh = useCallback(() => {
    startRowRef.current = 0;
    setHasMore(true);
    setLoading(true);
    const sortKey = resolveSortKey(sortColumn, sampleRowRef.current);
    fetch(`${apiBaseUrl}/${entity}?_sortBy=${sortKey} ${sortDirection}&_startRow=0&_endRow=${BATCH_SIZE - 1}`, { headers })
      .then(res => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then(data => {
        const rows = data?.response?.data ?? (Array.isArray(data) ? data : []);
        if (rows.length > 0) sampleRowRef.current = rows[0];
        setItems(rows);
        startRowRef.current = rows.length;
        if (rows.length < BATCH_SIZE) setHasMore(false);
        setLoading(false);
      })
      .catch(() => { setItems([]); setHasMore(false); setLoading(false); });
  }, [apiBaseUrl, entity, token, sortColumn, sortDirection]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    const start = startRowRef.current;
    const sortKey = resolveSortKey(sortColumn, sampleRowRef.current);
    fetch(`${apiBaseUrl}/${entity}?_sortBy=${sortKey} ${sortDirection}&_startRow=${start}&_endRow=${start + BATCH_SIZE - 1}`, { headers })
      .then(res => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then(data => {
        const rows = data?.response?.data ?? (Array.isArray(data) ? data : []);
        setItems(prev => [...prev, ...rows]);
        startRowRef.current = start + rows.length;
        if (rows.length < BATCH_SIZE) setHasMore(false);
        setLoadingMore(false);
      })
      .catch(() => { setLoadingMore(false); setHasMore(false); });
  }, [apiBaseUrl, entity, token, sortColumn, sortDirection, hasMore, loadingMore, loading]);

  useEffect(() => { refresh(); }, [refresh]);

  const fetchChildren = useCallback((parentId) => {
    if (!childEntity || !parentId) { setChildren([]); return; }
    // NEO Headless uses ?parentId= to filter child entity records
    fetch(`${apiBaseUrl}/${childEntity}?parentId=${parentId}${childSortBy ? `&_sortBy=${childSortBy}` : ''}`, { headers })
      .then(res => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then(data => {
        const rows = data?.response?.data ?? (Array.isArray(data) ? data : []);
        setChildren(rows);
      })
      .catch(() => setChildren([]));
  }, [apiBaseUrl, childEntity, token, childSortBy]);

  const fetchById = useCallback((id) => {
    if (!id) return;
    setLoading(true);
    fetch(`${apiBaseUrl}/${entity}/${id}`, { headers })
      .then(res => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then(data => {
        const row = data?.response?.data?.[0] ?? data;
        setSelected(row);
        setEditing({ ...row });
        fetchChildren(row?.id);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [apiBaseUrl, entity, token, fetchChildren]);

  const handleSelect = useCallback((row) => {
    setSelected(row);
    setEditing(row ? { ...row } : null);
    fetchChildren(row?.id);
  }, [fetchChildren]);

  const handleNew = useCallback(async () => {
    setSelected(null);
    setEditing({}); // Start with empty so UI is responsive
    try {
      const res = await fetch(`${apiBaseUrl}/${entity}/defaults`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.defaults) {
          // Normalize date values from Etendo format (dd-MM-yyyy) to HTML date input (yyyy-MM-dd)
          const normalized = { ...data.defaults };
          for (const [key, val] of Object.entries(normalized)) {
            if (typeof val === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(val)) {
              const [dd, mm, yyyy] = val.split('-');
              normalized[key] = `${yyyy}-${mm}-${dd}`;
            }
          }
          setEditing(prev => ({ ...prev, ...normalized }));
        }
      }
    } catch {
      // Defaults are best-effort; proceed with empty form if endpoint fails
    }
  }, [apiBaseUrl, entity, token]);

  const handleChange = useCallback((field, value) => {
    setEditing(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!editing) return;
    setSaveError(null);
    const isNew = !editing.id;
    const url = isNew ? `${apiBaseUrl}/${entity}` : `${apiBaseUrl}/${entity}/${editing.id}`;
    // Use PATCH for existing records (partial update), POST for new
    const method = isNew ? 'POST' : 'PATCH';
    // For PATCH, only send changed fields
    let payload;
    if (!isNew && selected) {
      const changes = {};
      for (const [key, value] of Object.entries(editing)) {
        if (key === 'id') continue;
        if (value !== selected[key]) changes[key] = value;
      }
      payload = changes;
    } else {
      // For POST (create), strip empty strings — let backend injectMandatoryDefaults
      // resolve proper values for fields not explicitly set by the user or callouts.
      payload = {};
      for (const [key, value] of Object.entries(editing)) {
        if (value !== '' && value != null) payload[key] = value;
      }
    }
    // NEO Headless expects flat field values — NeoServlet handles wrapping for JsonDataService
    const body = JSON.stringify(payload);
    try {
      const res = await fetch(url, { method, headers, body });
      if (res.ok) {
        const data = await res.json();
        const saved = data?.response?.data?.[0] ?? data;
        setSelected(saved);
        setEditing({ ...saved });
        setSaveError(null);
        toast.success(isNew ? 'Record created' : 'Record saved');
        refresh();
        return saved;
      } else {
        const msg = await extractErrorMessage(res);
        setSaveError(msg);
        toast.error(msg);
        return null;
      }
    } catch (err) {
      const msg = err?.message || 'Network error';
      setSaveError(msg);
      toast.error(msg);
      return null;
    }
  }, [editing, selected, apiBaseUrl, entity, token, refresh]);

  const handleDelete = useCallback(async () => {
    if (!selected?.id) return;
    try {
      const res = await fetch(`${apiBaseUrl}/${entity}/${selected.id}`, { method: 'DELETE', headers });
      if (res.ok) {
        setSelected(null);
        setEditing(null);
        setChildren([]);
        toast.success('Record deleted');
        refresh();
      } else {
        const msg = await extractErrorMessage(res);
        toast.error(msg);
      }
    } catch (err) {
      toast.error(err?.message || 'Network error');
    }
  }, [selected, apiBaseUrl, entity, token, refresh]);

  const handleAddChild = useCallback(async (childData) => {
    if (!childEntity || !apiBaseUrl || !token || !selected?.id) return;
    try {
      const body = {};
      // Include all fields from childData, skipping internal/companion keys.
      // Send values as-is — backend coerceTypes handles String→BigDecimal conversion.
      // Do NOT convert numeric strings to Number here: legacy FK IDs like "100" (uOM)
      // or "102" (currency) must remain strings, not integers.
      for (const [key, val] of Object.entries(childData)) {
        // Skip internal/companion keys
        if (key === 'id' || key.includes('$_identifier') || /^[a-zA-Z]+_[A-Z]{2,4}$/.test(key)) continue;
        // Skip callout internal fields
        if (key === 'CURSOR_FIELD' || key.startsWith('has')) continue;
        // Skip empty values — let backend defaults handle them
        if (val === '' || val == null) continue;
        body[key] = val;
      }
      // Include parentId in the body — the backend resolves it to the correct FK field name
      // and uses it to load parent record values for @FieldName@ defaults (generic, no hardcoding).
      body.parentId = selected.id;
      const res = await fetch(`${apiBaseUrl}/${childEntity}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const msg = await extractErrorMessage(res);
        setSaveError(msg);
        toast.error(msg);
        return null;
      }
      const data = await res.json().catch(() => null);
      // Refresh children and header (totals recalculated by backend)
      fetchChildren(selected.id);
      fetchById(selected.id);
      setSaveError(null);
      toast.success('Line added');
      return data?.response?.data?.[0] ?? data ?? true;
    } catch (err) {
      const msg = err?.message || 'Network error';
      setSaveError(msg);
      toast.error(msg);
      return null;
    }
  }, [childEntity, apiBaseUrl, token, selected, headers, fetchChildren]);

  const handleUpdateChild = useCallback((childId, fieldOrObject, value) => {
    setChildren(prev => prev.map(c => {
      if (String(c.id) !== String(childId)) return c;
      if (typeof fieldOrObject === 'object') return { ...c, ...fieldOrObject };
      return { ...c, [fieldOrObject]: value };
    }));
    // Refetch header to update totals after line edit
    if (selected?.id) fetchById(selected.id);
  }, [selected, fetchById]);

  const handleDeleteChild = useCallback((childId) => {
    setChildren(prev => prev.filter(c => String(c.id) !== String(childId)));
    // Refetch header to update totals after line deletion
    if (selected?.id) fetchById(selected.id);
  }, [selected, fetchById]);

  const handleSaveAndProcess = useCallback(async (draftModeConfig) => {
    const saved = await handleSave();
    if (!saved?.id) return null;

    const { processField, processValue } = draftModeConfig;
    const url = `${apiBaseUrl}/${entity}/${saved.id}/action`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ fieldValues: { [processField]: processValue } }),
    });
    if (!res.ok) {
      const msg = await extractErrorMessage(res);
      toast.error(msg);
      return saved;
    }
    toast.success('Record processed');
    refresh();
    return saved;
  }, [handleSave, apiBaseUrl, entity, token, refresh]);

  const handleProcess = useCallback(async (process, paramValues = {}) => {
    if (!selected?.id) return;
    // Build field values: start with hidden params from process definition, then merge user-supplied values
    const fieldValues = {};
    for (const p of (process.params ?? [])) {
      if (p.hidden) fieldValues[p.key] = p.value;
    }
    Object.assign(fieldValues, paramValues);
    const url = `${apiBaseUrl}/${entity}/${selected.id}/action/${process.columnName ?? process.name}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ fieldValues }),
      });
      if (res.ok) {
        toast.success(process.label ? `${process.label} completed` : 'Process completed');
        window.dispatchEvent(new CustomEvent('neo:processSuccess', { detail: { process, entity, recordId: selected.id } }));
        fetchById(selected.id);
        refresh();
      } else {
        const msg = await extractErrorMessage(res);
        toast.error(msg);
      }
    } catch (err) {
      toast.error(err?.message || 'Network error');
    }
  }, [selected, entity, apiBaseUrl, token, refresh, fetchById]);

  return {
    items, selected, editing, children, loading, loadingMore, hasMore, saveError,
    handleSelect, handleNew, handleChange, handleSave, handleSaveAndProcess, handleDelete, handleProcess,
    handleAddChild, handleUpdateChild, handleDeleteChild,
    refresh, fetchById, fetchChildren, loadMore,
    sortColumn, sortDirection, setSortColumn, setSortDirection,
  };
}
