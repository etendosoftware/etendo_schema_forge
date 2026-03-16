import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { X, MoreVertical, Check, Save, List, Search, Sparkles, Plus, Bell, Mic } from 'lucide-react';
import { useEntity } from '@/hooks/useEntity';
import { useCatalogs } from '@/hooks/useCatalogs';
import { useDisplayLogic } from '@/hooks/useDisplayLogic';
import { useCallout } from '@/hooks/useCallout';
import { useMenuLabel } from '@/i18n';
import { SummaryBar } from './SummaryBar.jsx';
import { resolveIdentifier } from '@/lib/resolveIdentifier.js';
import { getStatusBadgeProps, statusLabel } from '@/lib/statusBadge.js';
import { cn } from '@/lib/utils.js';
import LocaleSwitcher from '@/components/LocaleSwitcher.jsx';

/**
 * Full-page detail view for a single entity record.
 * Two-zone layout: gray top bar + white content card with rounded corner.
 */
export function DetailView({
  entity,
  detailEntity,
  Form,
  DetailTable,
  summary = [],
  statusField,
  processes = [],
  addLineFields = { entry: [], derived: [] },
  catalogs: staticCatalogs,
  api,
  entityLabel,
  detailLabel,
  titleField = 'documentNo',
  windowName,
  recordId,
  token,
  apiBaseUrl,
  breadcrumb,
}) {
  const hook = useEntity(entity, detailEntity, { token, apiBaseUrl });
  const catalogs = useCatalogs(api, token, apiBaseUrl, staticCatalogs);
  const displayLogic = useDisplayLogic(entity, hook.editing, { token, apiBaseUrl });
  const { calloutResult, calloutLoading, executeCallout } = useCallout(entity, { token, apiBaseUrl });
  const navigate = useNavigate();
  const tMenu = useMenuLabel();
  const [addingLine, setAddingLine] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [directFetched, setDirectFetched] = useState(false);

  // Track fields whose values were set by a callout response to avoid re-triggering
  const calloutAppliedRef = useRef(new Set());

  const isNew = recordId === 'new';
  const currentItem = useMemo(() => {
    if (isNew) return null;
    return hook.items.find(item => String(item.id) === String(recordId)) || null;
  }, [hook.items, recordId, isNew]);

  useEffect(() => {
    if (isNew && !hook.editing) {
      hook.handleNew();
    }
  }, [isNew, hook.editing, hook.handleNew]);

  // Resolve $_identifier for default FK values using already-loaded catalogs.
  // If a default ID isn't in the selector options (e.g., generic preference doesn't match
  // this window's filtered list), clear it — the callout will set the correct value later.
  useEffect(() => {
    if (!isNew || !hook.editing || !catalogs || !api?.selectors) return;
    for (const sel of api.selectors) {
      const val = hook.editing[sel.field];
      if (!val || hook.editing[sel.field + '$_identifier']) continue;
      const options = catalogs[sel.reference];
      if (!Array.isArray(options) || options.length === 0) continue;
      const match = options.find(o => o.id === val);
      if (match) {
        hook.handleChange(sel.field + '$_identifier', match.label || match.name || match._identifier);
      } else {
        // Default ID not in filtered options — clear it to avoid showing a raw UUID
        hook.handleChange(sel.field, '');
      }
    }
  }, [isNew, hook.editing, catalogs, api]);

  useEffect(() => {
    if (isNew) return;
    if (currentItem && (!hook.selected || String(hook.selected.id) !== String(recordId))) {
      hook.handleSelect(currentItem);
      setDirectFetched(false);
    } else if (!currentItem && !hook.loading && recordId && !directFetched) {
      setDirectFetched(true);
      hook.fetchById(recordId);
    }
  }, [currentItem, recordId, hook.selected, hook.handleSelect]);

  // Apply callout results to the form when they arrive
  useEffect(() => {
    if (!calloutResult) return;
    const { updates, combos } = calloutResult;
    const appliedFields = new Set();

    if (updates) {
      for (const [key, entry] of Object.entries(updates)) {
        // Skip empty callout values if the field already has a non-empty value
        // (e.g., callout clears warehouse but defaults already set it)
        const currentVal = data[key];
        if ((entry.value === '' || entry.value == null) && currentVal && currentVal !== '') {
          continue;
        }
        appliedFields.add(key);
        hook.handleChange(key, entry.value);
        if (entry._identifier) {
          hook.handleChange(key + '$_identifier', entry._identifier);
        }
      }
    }
    if (combos) {
      for (const [key, combo] of Object.entries(combos)) {
        if (combo.selected != null) {
          appliedFields.add(key);
          hook.handleChange(key, combo.selected);
          if (combo._identifier) {
            hook.handleChange(key + '$_identifier', combo._identifier);
          }
        }
      }
    }

    // Mark these fields so the next onChange doesn't re-trigger callout
    calloutAppliedRef.current = appliedFields;
  }, [calloutResult]);

  // Wrapped onChange that triggers callout for user-initiated FK changes
  const handleChangeWithCallout = useCallback((field, value) => {
    hook.handleChange(field, value);

    // Skip companion/auxiliary fields — they don't have callouts
    if (field.includes('$_identifier') || /^[a-zA-Z]+_[A-Z]{2,4}$/.test(field)) return;

    // If this field was just set by a callout response, don't re-trigger
    if (calloutAppliedRef.current.has(field)) {
      calloutAppliedRef.current.delete(field);
      return;
    }

    // Only trigger callout for meaningful value changes (not empty/typing artifacts)
    if (!value || value === '') return;

    // Trigger callout — the backend returns empty if no callout is registered
    executeCallout(field, value, hook.editing);
  }, [hook.handleChange, hook.editing, executeCallout]);

  const data = hook.editing || currentItem || {};
  const title = isNew
    ? `New ${entityLabel || entity}`
    : `${resolveIdentifier(data, titleField) || data._identifier || data.id || ''}`;

  const allEntryFields = addLineFields.entry ?? [];

  // Build tabs: child entity lines + "Others" tab for non-principal header fields
  const tabs = [];
  if (DetailTable) {
    tabs.push({ key: 'lines', label: detailLabel || detailEntity || 'Lines', count: hook.children?.length || 0 });
  }
  // Always add "Others" tab for secondary header fields
  tabs.push({ key: 'others', label: 'Others' });

  if (hook.loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Top bar area (gray background, inherited from parent) */}
      <div className="px-6 pt-3 pb-3">
        {/* Row: Title + Global search + action icons */}
        <div className="flex items-center gap-4">
          {/* Left: title + breadcrumb */}
          <div className="shrink-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{title}</h1>
              <button className="text-muted-foreground hover:text-foreground">
                <MoreVertical className="h-4 w-4" />
              </button>
            </div>
            {breadcrumb && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {breadcrumb}{title ? ` / ${title}` : ''}
              </p>
            )}
          </div>

          {/* Center: global search */}
          <div className="flex-1 flex justify-center">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search clients, orders, invoices..."
                readOnly
                tabIndex={-1}
                className="w-full h-9 rounded-lg border border-border/50 bg-white/60 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-colors cursor-default"
              />
              <Mic className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
            </div>
          </div>

          {/* Right: action icons */}
          <div className="flex items-center gap-1 shrink-0">
            <button className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <Sparkles className="h-4 w-4" />
            </button>
            <button className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <Plus className="h-4 w-4" />
            </button>
            <button className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="h-4 w-4" />
            </button>
            <LocaleSwitcher />
          </div>
        </div>
      </div>

      {/* White content card with rounded top-left corner */}
      <div className="flex-1 flex flex-col bg-white rounded-tl-2xl overflow-hidden min-h-0">
        {/* Action bar: Cancel + status | actions + save */}
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => navigate(`/${windowName}`)}
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
            {statusField && data[statusField] && (
              <Badge
                {...getStatusBadgeProps(data[statusField])}
                className={cn('ml-1', getStatusBadgeProps(data[statusField]).className)}
              >
                {statusLabel(data[statusField])}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* More actions */}
            <button className="h-9 w-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
              <MoreVertical className="h-4 w-4" />
            </button>
            {/* Process buttons */}
            {processes.map(p => {
              const btnClass = p.style === 'destructive'
                ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
              return (
                <Button
                  key={p.name}
                  variant="outline"
                  size="sm"
                  className={btnClass}
                  onClick={() => hook.handleProcess?.(p.name)}
                >
                  {p.label}
                </Button>
              );
            })}

            <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground" onClick={async () => {
              const saved = await hook.handleSave(data);
              if (saved?.id && isNew) navigate(`/${windowName}/${saved.id}`, { replace: true });
            }}>
              <Save className="h-3.5 w-3.5" />
              Save draft
            </Button>
            <Button size="sm" className="gap-1.5" onClick={async () => {
              const saved = await hook.handleSave(data);
              if (saved?.id && isNew) navigate(`/${windowName}/${saved.id}`, { replace: true });
            }}>
              <Check className="h-3.5 w-3.5" />
              Save
            </Button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-auto px-6 pb-6">
          <div className="max-w-5xl space-y-6">
            {/* Principal header fields (horizontal row) */}
            <div>
              <Form
                entity={entity}
                data={data}
                onChange={handleChangeWithCallout}
                catalogs={catalogs}
                layout="horizontal"
                section="principal"
                displayLogic={displayLogic}
                api={api}
                token={token}
                apiBaseUrl={apiBaseUrl}
              />
            </div>

            {/* Tabs: child entities + Others */}
            {tabs.length > 0 && (
              <div>
                <div className="flex items-center gap-0 border-b border-border/50">
                  {tabs.map((tab, idx) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(idx)}
                      className={[
                        'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative',
                        activeTab === idx
                          ? 'text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      ].join(' ')}
                    >
                      <List className="h-4 w-4" />
                      {tab.label}
                      {tab.count != null && (
                        <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 text-xs rounded-full bg-muted text-muted-foreground">
                          {tab.count}
                        </span>
                      )}
                      {activeTab === idx && (
                        <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-foreground rounded-full" />
                      )}
                    </button>
                  ))}
                </div>

                {/* Tab content: Lines */}
                {tabs[activeTab]?.key === 'lines' && DetailTable && (
                  <div className="pt-3">
                    <DetailTable
                      data={hook.children}
                      entity={detailEntity}
                      addRow={{
                        active: addingLine,
                        fields: allEntryFields,
                        onAdd: (lineData) => {
                          hook.handleAddChild?.(lineData);
                        },
                        onCancel: () => setAddingLine(false),
                        catalogs,
                      }}
                    />
                    <button
                      onClick={() => setAddingLine(!addingLine)}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 mt-3 font-medium"
                    >
                      + Add {detailLabel || 'line'}
                    </button>
                  </div>
                )}

                {/* Tab content: Others (secondary header fields) */}
                {tabs[activeTab]?.key === 'others' && (
                  <div className="pt-5">
                    <Form
                      entity={entity}
                      data={data}
                      onChange={handleChangeWithCallout}
                      catalogs={catalogs}
                      layout="horizontal"
                      section="other"
                      displayLogic={displayLogic}
                      api={api}
                      token={token}
                      apiBaseUrl={apiBaseUrl}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Simple entity (no child): full form only */}
            {!DetailTable && (
              <>
                {summary.length > 0 && (
                  <div className="mt-1">
                    <SummaryBar fields={summary} data={data} />
                  </div>
                )}
              </>
            )}

            {/* Footer totals */}
            {DetailTable && (
              <div className="flex justify-end pt-2 border-t border-border/50">
                <div className="w-72 space-y-1.5">
                  {summary.filter(f => f.type === 'amount').map(f => {
                    const label = f.key.replace(/([A-Z])/g, ' $1').trim();
                    const val = data[f.key] || 0;
                    const currency = data.currency || 'AR$';
                    return (
                      <div key={f.key} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium tabular-nums">{currency} {Number(val).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    );
                  })}
                  <div className="flex justify-between text-base font-bold pt-1.5 border-t border-border/50">
                    <span>Total</span>
                    <span className="tabular-nums">
                      {(() => {
                        const totalField = summary.find(f => f.key.toLowerCase().includes('grand') || f.key.toLowerCase().includes('total'));
                        const val = data[totalField?.key] || 0;
                        const currency = data.currency || 'AR$';
                        return `${currency} ${Number(val).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                      })()}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
