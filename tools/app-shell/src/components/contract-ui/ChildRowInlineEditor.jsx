/**
 * ChildRowInlineEditor — the inline editor for a selected child row, shown when a
 * window declares no `DetailForm`. Extracted from DetailView.jsx (Ola 3).
 *
 * Its own file rather than detailViewHelpers.jsx: that module is a way station at
 * 1.7k lines and the churn report's §9.2 target is ~600 per file, so piling a new
 * component in would trade one oversized file for another. The file-lines ratchet
 * refused to raise its baseline, which is the guard working as intended.
 */
import { getChildSaveButtonLabel } from './detailViewHelpers.jsx';

export function ChildRowInlineEditor({
  editingChild, setEditingChild, editableChildFields,
  savingChild, setSavingChild,
  api, apiBaseUrl, detailEntity, token, hook, confirmDelete, ui,
}) {
  const childUrlFor = (id) =>
    api?.crud?.[detailEntity]?.detailUrl?.replace('{id}', id) || `${apiBaseUrl}/${detailEntity}/${id}`;
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  return (
    <div className="mt-3 p-4 border rounded-lg bg-muted/20">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-3">
        {editableChildFields.map(f => (
          <div key={f.key} className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">{f.label || f.key}</label>
            <input
              type="number"
              step="0.01"
              value={editingChild[f.key] ?? ''}
              onChange={e => setEditingChild(prev => ({ ...prev, [f.key]: e.target.value }))}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          disabled={savingChild}
          onClick={async () => {
            setSavingChild(true);
            try {
              const fieldValues = {};
              for (const f of editableChildFields) {
                fieldValues[f.column] = editingChild[f.key];
              }
              const res = await fetch(childUrlFor(editingChild.id), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({ fieldValues }),
              });
              if (res.ok) {
                hook.handleUpdateChild(editingChild.id, editableChildFields.reduce((acc, f) => ({ ...acc, [f.key]: editingChild[f.key] }), {}));
                setEditingChild(null);
              }
            } finally { setSavingChild(false); }
          }}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {getChildSaveButtonLabel(savingChild, ui)}
        </button>
        <button
          onClick={() => setEditingChild(null)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border hover:bg-accent"
        >
          {ui('cancel')}
        </button>
        <button
          disabled={savingChild}
          onClick={async () => {
            if (!(await confirmDelete())) return;
            setSavingChild(true);
            try {
              const res = await fetch(childUrlFor(editingChild.id), {
                method: 'DELETE',
                headers: { ...authHeaders },
              });
              if (res.ok) { hook.handleDeleteChild(editingChild.id); setEditingChild(null); }
            } finally { setSavingChild(false); }
          }}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border border-destructive text-destructive hover:bg-destructive/10 disabled:opacity-50 ml-auto"
        >
          {ui('delete')}
        </button>
      </div>
    </div>
  );
}
