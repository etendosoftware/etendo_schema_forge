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
    // Etendo JsonDataService wraps errors in response.error
    const err = data?.response?.error;
    if (err?.message) return err.message;
    if (typeof err === 'string') return err;
    if (data?.message) return data.message;
  } catch { /* body not JSON */ }
  return `Error ${res.status}`;
}

const BATCH_SIZE = 75;

export function useEntity(entity, childEntity, { token, apiBaseUrl }) {
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

  const headers = buildHeaders(token);

  const refresh = useCallback(() => {
    startRowRef.current = 0;
    setHasMore(true);
    setLoading(true);
    fetch(`${apiBaseUrl}/${entity}?_sortBy=${sortColumn} ${sortDirection}&_startRow=0&_endRow=${BATCH_SIZE - 1}`, { headers })
      .then(res => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then(data => {
        const rows = data?.response?.data ?? (Array.isArray(data) ? data : []);
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
    fetch(`${apiBaseUrl}/${entity}?_sortBy=${sortColumn} ${sortDirection}&_startRow=${start}&_endRow=${start + BATCH_SIZE - 1}`, { headers })
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
    fetch(`${apiBaseUrl}/${childEntity}?parentId=${parentId}`, { headers })
      .then(res => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then(data => {
        const rows = data?.response?.data ?? (Array.isArray(data) ? data : []);
        setChildren(rows);
      })
      .catch(() => setChildren([]));
  }, [apiBaseUrl, childEntity, token]);

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
      payload = editing;
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

  const handleAddChild = useCallback((childData) => {
    const newChild = { id: `new-${Date.now()}`, ...childData };
    setChildren(prev => [...prev, newChild]);
  }, []);

  const handleUpdateChild = useCallback((childId, field, value) => {
    setChildren(prev => prev.map(c =>
      String(c.id) === String(childId) ? { ...c, [field]: value } : c
    ));
  }, []);

  const handleDeleteChild = useCallback((childId) => {
    setChildren(prev => prev.filter(c => String(c.id) !== String(childId)));
  }, []);

  const handleProcess = useCallback(async (processName) => {
    if (!selected?.id) return;
    await fetch(`${apiBaseUrl}/process/${processName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: selected.id }),
    });
    refresh();
  }, [selected, apiBaseUrl, token, refresh]);

  return {
    items, selected, editing, children, loading, loadingMore, hasMore, saveError,
    handleSelect, handleNew, handleChange, handleSave, handleDelete, handleProcess,
    handleAddChild, handleUpdateChild, handleDeleteChild,
    refresh, fetchById, loadMore,
    sortColumn, sortDirection, setSortColumn, setSortDirection,
  };
}
