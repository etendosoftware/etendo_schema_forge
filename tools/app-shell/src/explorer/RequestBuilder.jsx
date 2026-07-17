import { useState, useEffect } from 'react';
import { useNeoFetch } from './useDiscovery';

const METHOD_COLORS = {
  GET: 'bg-status-success hover:bg-status-success',
  POST: 'bg-status-info hover:bg-status-info',
  PUT: 'bg-status-warning hover:bg-status-warning',
  PATCH: 'bg-status-warning hover:bg-status-warning',
  DELETE: 'bg-destructive hover:bg-destructive',
};

export default function RequestBuilder({ specName, entity, onResponse }) {
  const neoFetch = useNeoFetch();
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('');
  const [params, setParams] = useState([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const methods = entity?.methods || ['GET'];

  // Update path and method when entity changes
  useEffect(() => {
    if (specName && entity) {
      setPath(`/${specName}/${entity.name}`);
      setMethod(methods.includes('GET') ? 'GET' : methods[0]);
      // Auto-generate body template for write methods
      if (entity.fields) {
        const template = {};
        entity.fields
          .filter(f => !f.readOnly && f.columnType !== 'button')
          .forEach(f => {
            template[f.name] = placeholderForType(f.columnType);
          });
        setBody(JSON.stringify(template, null, 2));
      }
    }
  }, [specName, entity?.name]);

  const addParam = () => setParams([...params, { key: '', value: '' }]);
  const removeParam = (i) => setParams(params.filter((_, idx) => idx !== i));
  const updateParam = (i, field, value) => {
    const next = [...params];
    next[i] = { ...next[i], [field]: value };
    setParams(next);
  };

  const send = async () => {
    setSending(true);
    try {
      let fullPath = path;
      const validParams = params.filter(p => p.key);
      if (validParams.length > 0) {
        const qs = validParams.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
        fullPath += `?${qs}`;
      }

      const options = { method };
      if (['POST', 'PUT', 'PATCH'].includes(method) && body.trim()) {
        options.body = body;
      }

      const result = await neoFetch(fullPath, options);
      onResponse(result);
    } catch (e) {
      onResponse({ status: 0, statusText: 'Network Error', elapsed: 0, body: e.message });
    } finally {
      setSending(false);
    }
  };

  const showBody = ['POST', 'PUT', 'PATCH'].includes(method);

  return (
    <div className="flex flex-col gap-3">
      {/* URL bar */}
      <div className="flex gap-2">
        <select
          value={method}
          onChange={e => setMethod(e.target.value)}
          className="bg-inverse-muted text-inverse-foreground border border-inverse-border rounded px-2 py-2 text-sm font-mono font-semibold focus:outline-none focus:ring-1 focus:ring-focus-ring"
        >
          {methods.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input
          value={path}
          onChange={e => setPath(e.target.value)}
          className="flex-1 bg-inverse-muted text-inverse-foreground border border-inverse-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-focus-ring"
          placeholder="/specName/entityName"
        />
        <button
          onClick={send}
          disabled={sending || !path}
          className={`px-4 py-2 rounded text-sm font-semibold text-white transition-colors disabled:opacity-50 ${METHOD_COLORS[method] || 'bg-inverse-muted'}`}
        >
          {sending ? '...' : 'Send'}
        </button>
      </div>

      {/* Query params */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-inverse-muted font-medium">Query Params</span>
          <button onClick={addParam} className="text-xs text-status-info-foreground hover:text-status-info-foreground">+ Add</button>
        </div>
        {params.map((p, i) => (
          <div key={i} className="flex gap-2 mb-1">
            <input
              value={p.key}
              onChange={e => updateParam(i, 'key', e.target.value)}
              placeholder="key"
              className="w-1/3 bg-inverse-muted text-inverse-foreground border border-inverse-border rounded px-2 py-1 text-xs font-mono focus:outline-none"
            />
            <input
              value={p.value}
              onChange={e => updateParam(i, 'value', e.target.value)}
              placeholder="value"
              className="flex-1 bg-inverse-muted text-inverse-foreground border border-inverse-border rounded px-2 py-1 text-xs font-mono focus:outline-none"
            />
            <button onClick={() => removeParam(i)} className="text-xs text-inverse-muted hover:text-destructive">x</button>
          </div>
        ))}
      </div>

      {/* Request body */}
      {showBody && (
        <div>
          <span className="text-xs text-inverse-muted font-medium block mb-1">Body (JSON)</span>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={10}
            className="w-full bg-inverse-muted text-inverse-foreground border border-inverse-border rounded px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-focus-ring resize-y"
          />
        </div>
      )}
    </div>
  );
}

function placeholderForType(type) {
  switch (type) {
    case 'number': return 0;
    case 'boolean': return false;
    case 'date': return '2025-01-01';
    case 'datetime': return '2025-01-01T00:00:00';
    default: return '';
  }
}
