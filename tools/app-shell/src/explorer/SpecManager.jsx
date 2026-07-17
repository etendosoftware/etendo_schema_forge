import { useState } from 'react';
import { cn } from '@/lib/utils';
import { upsertEntity, upsertField, populateSpec } from './useDiscovery';

const METHOD_COLORS = {
  GET: 'bg-green-600/20 text-green-400 border-green-600/40',
  POST: 'bg-blue-600/20 text-blue-400 border-blue-600/40',
  PUT: 'bg-amber-600/20 text-amber-400 border-amber-600/40',
  PATCH: 'bg-orange-600/20 text-orange-400 border-orange-600/40',
  DELETE: 'bg-red-600/20 text-red-400 border-red-600/40',
};

const METHOD_FLAGS = [
  { key: 'isGet', label: 'GET', param: 'IsGet' },
  { key: 'isGetbyid', label: 'GET by ID', param: 'IsGetbyid' },
  { key: 'isPost', label: 'POST', param: 'IsPost' },
  { key: 'isPut', label: 'PUT', param: 'IsPut' },
  { key: 'isPatch', label: 'PATCH', param: 'IsPatch' },
  { key: 'isDelete', label: 'DELETE', param: 'IsDelete' },
];

export default function SpecManager({ spec, onRefresh }) {
  const [saving, setSaving] = useState(null);
  const [populating, setPopulating] = useState(false);
  const [message, setMessage] = useState(null);
  const [expandedEntity, setExpandedEntity] = useState(null);
  const [editingQualifier, setEditingQualifier] = useState(null);
  const [qualifierValue, setQualifierValue] = useState('');

  if (!spec) return <div className="p-4 text-sm text-inverse-muted">Select a spec to manage</div>;

  const showMessage = (text, isError = false) => {
    setMessage({ text, isError });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleToggleMethod = async (entity, flag) => {
    setSaving(entity.id + flag.key);
    try {
      const params = {
        SpecID: spec.id,
        TabID: entity.tabId,
        ModuleID: spec.moduleId,
        EntityID: entity.id,
      };
      // Set all current flags, toggling the one clicked
      METHOD_FLAGS.forEach(f => {
        params[f.param] = f.key === flag.key
          ? (entity[f.key] ? 'N' : 'Y')
          : (entity[f.key] ? 'Y' : 'N');
      });
      await upsertEntity(params);
      showMessage(`${flag.label} ${entity[flag.key] ? 'disabled' : 'enabled'} for ${entity.name}`);
      onRefresh?.();
    } catch (e) {
      showMessage(e.message, true);
    } finally {
      setSaving(null);
    }
  };

  const handleToggleField = async (entity, field, prop) => {
    setSaving(field.id + prop);
    try {
      const params = {
        EntityID: entity.id,
        ColumnID: field.columnId,
        ModuleID: spec.moduleId,
        FieldID: field.id,
      };
      if (prop === 'included') {
        params.IsIncluded = field.included ? 'N' : 'Y';
        params.IsReadOnly = field.readOnly ? 'Y' : 'N';
      } else if (prop === 'readOnly') {
        params.IsIncluded = field.included ? 'Y' : 'N';
        params.IsReadOnly = field.readOnly ? 'N' : 'Y';
      }
      await upsertField(params);
      showMessage(`${field.name}: ${prop} toggled`);
      onRefresh?.();
    } catch (e) {
      showMessage(e.message, true);
    } finally {
      setSaving(null);
    }
  };

  const handleSaveQualifier = async (entity) => {
    setSaving(entity.id + 'qualifier');
    try {
      await upsertEntity({
        SpecID: spec.id,
        TabID: entity.tabId,
        ModuleID: spec.moduleId,
        EntityID: entity.id,
        JavaQualifier: qualifierValue || undefined,
      });
      showMessage(`Java qualifier ${qualifierValue ? 'set to ' + qualifierValue : 'cleared'} for ${entity.name}`);
      setEditingQualifier(null);
      onRefresh?.();
    } catch (e) {
      showMessage(e.message, true);
    } finally {
      setSaving(null);
    }
  };

  const handlePopulate = async () => {
    if (!confirm('This will delete all existing entities/fields and re-populate from AD metadata. Continue?')) return;
    setPopulating(true);
    try {
      const result = await populateSpec({
        SpecID: spec.id,
        ModuleID: spec.moduleId,
        IncludeAllMethods: 'Y',
        ExcludeSystemColumns: 'Y',
      });
      showMessage(`Populated: ${result.EntitiesCreated || '?'} entities, ${result.FieldsCreated || '?'} fields`);
      onRefresh?.();
    } catch (e) {
      showMessage(e.message, true);
    } finally {
      setPopulating(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-inverse-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-inverse-foreground">{spec.name}</h3>
          <p className="text-[10px] text-inverse-muted">
            {spec.type === 'W' ? 'Window' : 'Process'} · {spec.entities?.length || 0} entities · ID: {spec.id?.substring(0, 8)}...
          </p>
        </div>
        <button
          onClick={handlePopulate}
          disabled={populating}
          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded transition-colors disabled:opacity-50"
        >
          {populating ? 'Populating...' : 'Populate from AD'}
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className={cn(
          'px-4 py-2 text-xs',
          message.isError ? 'bg-red-900/30 text-red-400' : 'bg-green-900/30 text-green-400'
        )}>
          {message.text}
        </div>
      )}

      {/* Entities */}
      {(spec.entities || []).map(entity => (
        <div key={entity.id || entity.name} className="border-b border-inverse-border/50">
          {/* Entity header */}
          <button
            onClick={() => setExpandedEntity(expandedEntity === entity.name ? null : entity.name)}
            className="w-full text-left px-4 py-3 hover:bg-inverse-muted/50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-inverse-foreground">{entity.name}</span>
                {entity.tabLevel > 0 && (
                  <span className="text-[10px] text-inverse-muted bg-inverse-muted px-1.5 py-0.5 rounded">L{entity.tabLevel}</span>
                )}
              </div>
              <span className="text-[10px] text-inverse-muted">
                {entity.fields?.length || 0} fields · {expandedEntity === entity.name ? '▼' : '▶'}
              </span>
            </div>

            {/* Method toggles */}
            <div className="flex gap-1.5 mt-2 flex-wrap items-center">
              {METHOD_FLAGS.map(flag => (
                <button
                  key={flag.key}
                  onClick={(e) => { e.stopPropagation(); handleToggleMethod(entity, flag); }}
                  disabled={saving === entity.id + flag.key}
                  className={cn(
                    'px-2 py-0.5 rounded border text-[10px] font-mono font-semibold transition-all',
                    entity[flag.key]
                      ? METHOD_COLORS[flag.label.split(' ')[0]] || 'bg-inverse-muted text-inverse-foreground border-inverse-border'
                      : 'bg-inverse text-inverse-muted border-inverse-border opacity-50 hover:opacity-80'
                  )}
                >
                  {saving === entity.id + flag.key ? '...' : flag.label}
                </button>
              ))}

              {/* Java Qualifier (CDI override) */}
              <span className="ml-auto" onClick={e => e.stopPropagation()}>
                {editingQualifier === entity.id ? (
                  <span className="flex items-center gap-1">
                    <input
                      value={qualifierValue}
                      onChange={e => setQualifierValue(e.target.value)}
                      placeholder="CDI qualifier"
                      className="w-32 bg-inverse-muted text-inverse-foreground border border-inverse-border rounded px-1.5 py-0.5 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-focus-ring"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveQualifier(entity);
                        if (e.key === 'Escape') setEditingQualifier(null);
                      }}
                    />
                    <button
                      onClick={() => handleSaveQualifier(entity)}
                      disabled={saving === entity.id + 'qualifier'}
                      className="text-[10px] text-green-400 hover:text-green-300"
                    >
                      {saving === entity.id + 'qualifier' ? '...' : '✓'}
                    </button>
                    <button
                      onClick={() => setEditingQualifier(null)}
                      className="text-[10px] text-inverse-muted hover:text-inverse-foreground"
                    >
                      ✗
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => { setEditingQualifier(entity.id); setQualifierValue(entity.javaQualifier || ''); }}
                    className={cn(
                      'px-2 py-0.5 rounded border text-[10px] font-mono transition-all',
                      entity.javaQualifier
                        ? 'bg-cyan-600/20 text-cyan-400 border-cyan-600/40'
                        : 'bg-inverse text-inverse-muted border-inverse-border opacity-50 hover:opacity-80'
                    )}
                    title="Set CDI Java qualifier for custom NeoHandler override"
                  >
                    {entity.javaQualifier || 'CDI'}
                  </button>
                )}
              </span>
            </div>
          </button>

          {/* Fields (expanded) */}
          {expandedEntity === entity.name && entity.fields && (
            <div className="bg-inverse/50 border-t border-inverse-border/50">
              <div className="px-4 py-1.5 flex items-center text-[10px] text-inverse-muted font-medium uppercase tracking-wider border-b border-inverse-border/30">
                <span className="w-8">Inc</span>
                <span className="w-8">RO</span>
                <span className="flex-1">Field</span>
                <span className="w-20 text-right">Type</span>
              </div>
              {entity.fields.map(field => (
                <div key={field.id || field.name} className="px-4 py-1.5 flex items-center hover:bg-inverse-muted/30 transition-colors">
                  <button
                    onClick={() => handleToggleField(entity, field, 'included')}
                    disabled={saving === field.id + 'included'}
                    className={cn(
                      'w-8 text-center text-xs',
                      field.included ? 'text-green-400' : 'text-inverse-muted'
                    )}
                  >
                    {saving === field.id + 'included' ? '·' : field.included ? '✓' : '✗'}
                  </button>
                  <button
                    onClick={() => handleToggleField(entity, field, 'readOnly')}
                    disabled={saving === field.id + 'readOnly'}
                    className={cn(
                      'w-8 text-center text-xs',
                      field.readOnly ? 'text-amber-400' : 'text-inverse-muted'
                    )}
                  >
                    {saving === field.id + 'readOnly' ? '·' : field.readOnly ? 'RO' : '—'}
                  </button>
                  <span className={cn(
                    'flex-1 text-xs font-mono',
                    field.included ? 'text-inverse-foreground' : 'text-inverse-muted line-through'
                  )}>
                    {field.name}
                    {field.required && <span className="text-red-400 ml-1">*</span>}
                    {field.hasSelector && (
                      <span className="text-blue-400/60 ml-1 text-[10px]">[{field.selectorType}]</span>
                    )}
                  </span>
                  <span className="w-20 text-right text-[10px] text-inverse-muted">{field.columnType}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
