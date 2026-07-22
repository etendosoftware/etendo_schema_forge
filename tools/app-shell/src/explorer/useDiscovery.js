import { useState, useEffect, useCallback } from 'react';

function detectBase() {
  const path = window.location.pathname;
  const webIdx = path.indexOf('/web/');
  return webIdx !== -1 ? path.substring(0, webIdx) : (import.meta.env.VITE_API_BASE || '');
}

const BASE = detectBase();
const NEO_BASE = `${BASE}/sws/neo`;
const WEBHOOK_BASE = `${BASE}/webhooks`;

function getToken() {
  return localStorage.getItem('sf_auth_token');
}

function getAdminToken() {
  return localStorage.getItem('sf_admin_token') || getToken();
}

function authHeaders(token) {
  const t = token || getToken();
  const h = { 'Content-Type': 'application/json' };
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

function adminAuthHeaders() {
  return authHeaders(getAdminToken());
}

// ── Discovery hooks ──

export function useSpecs({ useAdmin = false } = {}) {
  const [specs, setSpecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`${NEO_BASE}/`, { headers: useAdmin ? adminAuthHeaders() : authHeaders() })
      .then(r => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then(data => setSpecs(data.specs || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [useAdmin]);

  useEffect(() => { refresh(); }, [refresh]);

  return { specs, loading, error, refresh };
}

export function useSpecDetail(specName) {
  const [spec, setSpec] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    if (!specName) { setSpec(null); return; }
    setLoading(true);
    setError(null);
    fetch(`${NEO_BASE}/${specName}`, { headers: authHeaders() })
      .then(r => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then(data => setSpec(data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [specName]);

  useEffect(() => { refresh(); }, [refresh]);

  return { spec, loading, error, refresh };
}

// ── NEO fetch (for testing endpoints) ──

export function useNeoFetch() {
  return useCallback(async (path, options = {}) => {
    const url = `${NEO_BASE}${path.startsWith('/') ? path : '/' + path}`;
    const start = performance.now();
    const res = await fetch(url, {
      ...options,
      headers: { ...authHeaders(), ...options.headers },
    });
    const elapsed = Math.round(performance.now() - start);
    let body;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) {
      body = await res.json();
    } else {
      body = await res.text();
    }
    return { status: res.status, statusText: res.statusText, elapsed, body };
  }, []);
}

// ── Webhook calls (for managing specs) ──

async function callWebhook(name, params) {
  const url = `${WEBHOOK_BASE}/${name}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: adminAuthHeaders(),
    body: JSON.stringify(params),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(data?.error || data?.message || `Webhook error: ${res.status}`);
  return data;
}

export async function upsertSpec({ Name, ModuleID, SpecType, WindowID, ProcessID, Description, SpecID }) {
  const params = { Name, ModuleID };
  if (SpecType) params.SpecType = SpecType;
  if (WindowID) params.WindowID = WindowID;
  if (ProcessID) params.ProcessID = ProcessID;
  if (Description) params.Description = Description;
  if (SpecID) params.SpecID = SpecID;
  return callWebhook('SFUpsertSpec', params);
}

export async function upsertEntity({ SpecID, TabID, ModuleID, Name, IsGet, IsGetbyid, IsPost, IsPut, IsPatch, IsDelete, JavaQualifier, SeqNo, EntityID }) {
  const params = { SpecID, TabID, ModuleID };
  if (Name) params.Name = Name;
  if (IsGet) params.IsGet = IsGet;
  if (IsGetbyid) params.IsGetbyid = IsGetbyid;
  if (IsPost) params.IsPost = IsPost;
  if (IsPut) params.IsPut = IsPut;
  if (IsPatch) params.IsPatch = IsPatch;
  if (IsDelete) params.IsDelete = IsDelete;
  if (JavaQualifier) params.JavaQualifier = JavaQualifier;
  if (SeqNo != null) params.SeqNo = String(SeqNo);
  if (EntityID) params.EntityID = EntityID;
  return callWebhook('SFUpsertEntity', params);
}

export async function upsertField({ EntityID, ColumnID, ModuleID, IsIncluded, IsReadOnly, DefaultValue, JavaQualifier, SeqNo, FieldID }) {
  const params = { EntityID, ColumnID, ModuleID };
  if (IsIncluded) params.IsIncluded = IsIncluded;
  if (IsReadOnly) params.IsReadOnly = IsReadOnly;
  if (DefaultValue) params.DefaultValue = DefaultValue;
  if (JavaQualifier) params.JavaQualifier = JavaQualifier;
  if (SeqNo != null) params.SeqNo = String(SeqNo);
  if (FieldID) params.FieldID = FieldID;
  return callWebhook('SFUpsertField', params);
}

export { fetchMenuTree } from '@/lib/menuTree.js';

export async function populateSpec({ SpecID, ModuleID, IncludeAllMethods, ExcludeSystemColumns }) {
  const params = { SpecID };
  if (ModuleID) params.ModuleID = ModuleID;
  if (IncludeAllMethods) params.IncludeAllMethods = IncludeAllMethods;
  if (ExcludeSystemColumns) params.ExcludeSystemColumns = ExcludeSystemColumns;
  return callWebhook('SFPopulateSpec', params);
}
