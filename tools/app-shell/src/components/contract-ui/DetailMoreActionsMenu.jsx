import React, { useState, useEffect, useRef } from 'react';
import { MoreVertical } from 'lucide-react';
import { toast } from 'sonner';
import { translateBackendError } from '@/lib/backendErrors.js';
import { resolveHideMoreMenu } from './DetailView.jsx';
import { maybeSaveBeforeConfirm } from './detailViewHelpers.jsx';

/**
 * Kebab ("more actions") menu of the detail toolbar.
 *
 * Owns its own open state and the hidden probe that detects whether
 * `customMenuContent` renders anything for the current record — that state has no
 * consumer outside this menu, so it lives here rather than in DetailView.
 */
export function DetailMoreActionsMenu({
  apiBaseUrl,
  customMenuContent,
  data,
  docAction,
  hideMoreMenu,
  hook,
  menuActions,
  neoAction,
  recordId,
  setDocsRefreshSignal,
  sqBtnSize,
  statusField,
  token,
  ui,
}) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef(null);
  // Probe to detect whether customMenuContent actually renders anything for the
  // current record. A custom kebab component may return null based on status
  // (e.g. an action only valid in a given document state); without this the
  // popover would open as an empty box. Mirrors Sales Order's menuActions
  // behavior where the kebab opens nothing when no action applies.
  const moreMenuProbeRef = useRef(null);
  const [customMenuHasContent, setCustomMenuHasContent] = useState(customMenuContent ? null : false);

  useEffect(() => {
    if (!showMoreMenu) return;
    const handleClick = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMoreMenu]);
  // Keep customMenuHasContent in sync with what the hidden probe renders. Runs
  // every render (status/data can change over the record's lifecycle) but only
  // updates state when the value actually flips, so it never loops.
  useEffect(() => {
    if (!customMenuContent) return;
    const has = !!(moreMenuProbeRef.current && moreMenuProbeRef.current.childElementCount > 0);
    setCustomMenuHasContent(prev => (prev === has ? prev : has));
  });

  // More actions — only render the button when there is something to show
  if (resolveHideMoreMenu(hideMoreMenu, data)) return null;
  const resolvedActions = typeof menuActions === 'function'
    ? menuActions({ data, status: data?.[statusField] })
    : menuActions;
  const visibleActions = (Array.isArray(resolvedActions) ? resolvedActions : [])
    .filter(a => a.visible !== false);
  const hasCustomContent = customMenuContent && customMenuHasContent !== false;
  if (visibleActions.length === 0 && !hasCustomContent) return null;
  const currentId = data?.id || recordId;
  const runDocumentAction = async (action) => {
    // ETP-4783 / ETP-4940: Flush any pending header edit before running the document
    // action (Complete/Void/etc., and before any preUnpost) so the server sees the
    // latest field values. Without this, fields that are intentionally editable on a
    // completed document (e.g. aeatsiiErrorRegistral) cannot be saved — the "Guardar"
    // button is disabled for completed invoices — and the DB-level doc-action validator
    // reads the stale value and blocks the action; for windows without draftMode, an
    // edit made without clicking Save first was also silently discarded, the action
    // running against the last-persisted value. Mirrored from the maybeSaveBeforeProcess
    // pattern (ETP-4542). handleSave already surfaced the error on failure — abort
    // without running preUnpost or the action.
    if (!(await maybeSaveBeforeConfirm({ isDirty: hook.isDirtyHeader, handleSave: hook.handleSave }))) {
      return false;
    }
    if (action.preUnpost && (data?.posted === 'Y' || data?.posted === true)) {
      const unpostResult = await neoAction.execute(currentId, 'unpost');
      if (!unpostResult.success) {
        toast.error(translateBackendError(unpostResult.message, ui) || ui('actionFailed'));
        return false;
      }
    }
    try {
      await docAction.execute(currentId, action.documentAction);
      const msg = (action.successKey ? ui(action.successKey) : action.successMessage) || ui('actionCompleted');
      toast.success(msg);
      hook.fetchById?.(currentId);
      setDocsRefreshSignal(v => v + 1);
    } catch (err) {
      toast.error(err.message);
    }
    return true;
  };
  const runNeoMenuAction = async (action) => {
    const result = await neoAction.execute(currentId, action.neoAction);
    const msg = (action.successKey ? ui(action.successKey) : action.successMessage) || ui('actionCompleted');
    if (result.success) {
      toast.success(msg);
      hook.fetchById?.(currentId);
      setDocsRefreshSignal(v => v + 1);
    } else {
      toast.error(translateBackendError(result.message, ui) || ui('actionFailed'));
    }
  };
  return (
    <div className="relative" ref={moreMenuRef}>
      <button
        data-testid="action-more"
        onClick={() => setShowMoreMenu(v => !v)}
        className={`${sqBtnSize} flex items-center justify-center rounded-md bg-card border border-[hsl(var(--border-control))] shadow-[0px_1px_2px_0px_hsl(var(--foreground))0D] text-muted-foreground hover:bg-[hsl(var(--muted))] hover:text-foreground transition-colors`}
      >
        <MoreVertical className="h-[15px] w-[15px]" data-testid="MoreVertical__fa3275" />
      </button>
      {customMenuContent && (() => {
        const ProbeContent = customMenuContent;
        return (
          <div ref={moreMenuProbeRef} aria-hidden="true" style={{ display: 'none' }}>
            <ProbeContent
              data={data}
              recordId={data?.id || recordId}
              token={token}
              apiBaseUrl={apiBaseUrl}
              onClose={() => {}}
              onRefresh={() => {}}
              data-testid="ProbeContent__fa3275" />
          </div>
        );
      })()}
      {showMoreMenu && (
      <div
        className="absolute right-0 top-full mt-1 z-50 bg-card py-2 min-w-[148px]"
        style={{
          borderRadius: '8px',
          boxShadow:
            '0px 0px 0px 1px hsl(var(--foreground) / 0.1), 0px 24px 48px hsl(var(--foreground) / 0.03), 0px 10px 18px hsl(var(--foreground) / 0.03), 0px 5px 8px hsl(var(--foreground) / 0.04), 0px 2px 4px hsl(var(--foreground) / 0.04)',
        }}
      >
        {visibleActions.map((action, i) => {
          const ActionIcon = action.icon;
          return (
            <button
              key={action.key || i}
              type="button"
              data-testid={`menu-action-${action.key || i}`}
              disabled={docAction.loading || neoAction.loading}
              onClick={async () => {
                setShowMoreMenu(false);
                if (action.documentAction) {
                  await runDocumentAction(action);
                  return;
                }
                if (action.neoAction) {
                  await runNeoMenuAction(action);
                  return;
                }
                if (action.preUnpost && (data?.posted === 'Y' || data?.posted === true)) {
                  const unpostResult = await neoAction.execute(currentId, 'unpost');
                  if (!unpostResult.success) {
                    toast.error(translateBackendError(unpostResult.message, ui) || ui('actionFailed'));
                    return;
                  }
                }
                if (action.columnName) {
                  hook.handleProcess?.({ columnName: action.columnName, name: action.key });
                } else if (action.onClick) {
                  action.onClick();
                }
              }}
              className={`w-full text-left px-2 py-1 text-sm leading-6 transition-colors flex items-center gap-2 ${action.destructive
                ? 'text-destructive hover:bg-destructive/10'
                : 'text-foreground hover:bg-secondary'
                } ${docAction.loading || neoAction.loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              style={{ fontFamily: 'Inter, sans-serif', fontWeight: 400 }}
            >
              {ActionIcon && (
                <ActionIcon
                  className="h-4 w-4 flex-shrink-0 ml-1"
                  style={{ color: action.destructive ? undefined : 'hsl(var(--text-disabled))' }}
                  data-testid="ActionIcon__fa3275" />
              )}
              <span className={ActionIcon ? 'pl-1' : ''}>
                {action.labelKey ? ui(action.labelKey) : action.label}
              </span>
            </button>
          );
        })}
        {customMenuContent && (() => {
          const CustomMenuContent = customMenuContent;
          return (
            <CustomMenuContent
              data={data}
              recordId={data?.id || recordId}
              token={token}
              apiBaseUrl={apiBaseUrl}
              onClose={() => setShowMoreMenu(false)}
              onRefresh={() => hook.fetchById?.(data?.id || recordId)}
              data-testid="CustomMenuContent__fa3275" />
          );
        })()}
      </div>
      )}
    </div>
  );
}
