import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Copy, Mail, MoreVertical, Trash2, Loader2 } from 'lucide-react';
import { useUI } from '@/i18n';
import { useDocumentAction } from '@/hooks/useDocumentAction';
import { useNeoAction } from '@/hooks/useNeoAction';
import { isDeleteVisibleForRecord, evalRowVisibleWhen } from '@/utils/recordActions.js';
import { QUICK_ACTIONS_PILL_CLASS } from './quickActionsStyle.js';

/**
 * RowQuickActions — hover-revealed action icons overlaid at the end of a list row.
 *
 * Fixed icon order (current implementation — ETP-3504):
 *   1. Edit            — always shown, navigates to detail page
 *   2. Clone           — always shown, duplicates the row (server clone if available, else client-side)
 *   3. Email/Send      — only when documentPreview is configured for the window
 *   4. More (kebab)    — popover containing every menuActions[] item from the window config
 *   5. Delete          — respects the same hideDeleteWhenComplete + statusField gate as DetailView
 *
 * Per-button in-flight state (plan §2.6): each canonical button and kebab item tracks its own
 * pending Promise locally via `inFlight[key]`. While pending, that button is disabled and shows
 * a spinner; the rest of the row remains interactive. Rows are independent of each other.
 *
 * `visibleWhen` predicate (plan §2.3): an optional Etendo-style display-logic expression on each
 * action descriptor (canonical or kebab). Evaluated via `evalRowVisibleWhen()` from
 * `@/utils/recordActions.js` (same matcher as DetailView's `evalDisplayLogicRaw`). ANDed with the
 * existing edit-view visibility (delete gate, `documentPreview`, `action.visible`).
 *
 * The wrapping <td> uses absolute positioning so the icons overlay the trailing
 * grid columns and reveal on `group-hover/row` (set by DataTable's <TableRow>).
 *
 * NOTE: this component is generic — every prop is optional and gates behavior
 * gracefully. It is safe to mount on every list row regardless of window config.
 */
export default function RowQuickActions({
  row,
  windowName,
  entity = 'header',
  apiBaseUrl,
  token,
  // Window config — all optional
  documentPreview = null,
  // ETP-3914 — Send/Download envelope gate. Resolved upstream from
  // `decisions.json → window.sendDocument` with eligibility heuristic
  // (header has documentNo). Shape: `{ enabled: bool, allowEmail: bool }`.
  // When the prop is absent we fall back to the legacy `documentPreview` gate
  // so existing custom callers (sales-invoice, purchase-invoice) keep working
  // until they migrate.
  sendDocument = null,
  // Either a static array of MenuAction descriptors OR a function
  // ({ row, status }) => MenuAction[] — same shape DetailView accepts, so the
  // row kebab can mirror the detail kebab's per-state visibility logic.
  menuActions = [],
  hideDeleteWhenComplete = false,
  statusField = null,
  // Handlers (host-controlled to keep this component decoupled from routing/modals)
  onEdit,
  onClone,
  onEmail,
  onDelete,
  onMenuActionExecuted, // (action, result) — host can refresh after execution
  // Optional per-action config from decisions.json → window.rowQuickActions.actions.
  // Shape: { edit: { show: true, visibleWhen?: string }, duplicate: ..., email: ..., delete: ...,
  //          <processKey>: { show: 'fixed'|'kebab'|false, visibleWhen?: string } }
  // Only `visibleWhen` is consumed here (per-action display-logic gate). Show/hide decisions
  // for canonical buttons are still derived from the existing props (documentPreview, statusField,
  // hideDeleteWhenComplete) — `actionsConfig` only refines visibility further.
  actionsConfig = null,
}) {
  const ui = useUI();
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const [inFlight, setInFlight] = useState({});
  const moreRef = useRef(null);
  const menuRef = useRef(null);
  const docAction = useDocumentAction({ apiBaseUrl, entity, token });
  // ETP-4298 — declarative NEO action endpoint (e.g. post/unpost). `apiBaseUrl`
  // is already scoped to the spec; entity segment mirrors useDocumentAction.
  const neoAction = useNeoAction({ specName: windowName, entityName: entity, apiBaseUrl, token });

  // visibleWhen lookup for a given action key. Falls back to `true` when no expression set.
  const passesVisibleWhen = useCallback((key) => {
    const expr = actionsConfig?.[key]?.visibleWhen;
    return evalRowVisibleWhen(expr, row);
  }, [actionsConfig, row]);

  // Wrap a handler so we track in-flight state per button. Idempotent: if already in-flight
  // for that key, we ignore the click (no double-submit).
  const runWithInFlight = useCallback((key, fn) => async (...args) => {
    if (inFlight[key]) return undefined;
    setInFlight(prev => ({ ...prev, [key]: true }));
    try {
      return await fn?.(...args);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Quick action '${key}' failed:`, err);
      return undefined;
    } finally {
      setInFlight(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, [inFlight]);

  // Close popover on outside click. The menu is portaled to <body>, so a click
  // outside the trigger AND outside the menu closes it.
  useEffect(() => {
    if (!showMenu) return;
    const onClick = (e) => {
      const insideTrigger = moreRef.current && moreRef.current.contains(e.target);
      const insideMenu = menuRef.current && menuRef.current.contains(e.target);
      if (!insideTrigger && !insideMenu) setShowMenu(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showMenu]);

  // Recompute portal anchor position when the menu opens (and on scroll/resize
  // so it tracks the trigger). Cheap rect read; only active while open.
  useEffect(() => {
    if (!showMenu) return;
    const update = () => {
      const btn = moreRef.current?.querySelector('button');
      const r = (btn || moreRef.current)?.getBoundingClientRect();
      if (r) setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [showMenu]);

  // Same gate as DetailView's edit toolbar — centralized in utils/recordActions.js.
  const showDelete = isDeleteVisibleForRecord({
    record: row,
    statusField,
    hideDeleteWhenComplete,
  });

  const stop = (e) => { e.stopPropagation(); };

  const resolvedMenuActions = typeof menuActions === 'function'
    ? menuActions({ row, data: row, status: statusField ? row?.[statusField] : undefined })
    : menuActions;
  const visibleMenuActions = (Array.isArray(resolvedMenuActions) ? resolvedMenuActions : [])
    .filter(a => a && a.visible !== false)
    .filter(a => evalRowVisibleWhen(
      // Prefer the per-key override in actionsConfig (decisions.json), fall back to the
      // expression possibly attached to the menuAction descriptor itself.
      actionsConfig?.[a.key]?.visibleWhen ?? a.visibleWhen,
      row,
    ));

  // ETP-3504 — Figma exact colors:
  // - Neutral icons (Edit, Clone, Email, More): #828FA3
  // - Delete: #D50B3E
  // Hover darkens slightly: neutrals → text-foreground; delete → red-700.
  const neutralBtnCls = 'h-8 w-8 p-0 flex items-center justify-center rounded-full text-[#828FA3] hover:text-foreground hover:bg-muted/60 transition-colors';
  const dangerBtnCls = 'h-8 w-8 p-0 flex items-center justify-center rounded-full text-[#D50B3E] hover:text-red-700 hover:bg-red-50 transition-colors';

  const handleMenuActionClick = useCallback(async (action) => {
    setShowMenu(false);
    const key = `menu:${action.key ?? action.label ?? 'unknown'}`;
    if (inFlight[key]) return;
    setInFlight(prev => ({ ...prev, [key]: true }));
    try {
      if (action.documentAction) {
        const result = await docAction.execute(row?.id, action.documentAction);
        onMenuActionExecuted?.(action, result);
        return;
      }
      if (action.neoAction) {
        const result = await neoAction.execute(row?.id, action.neoAction);
        onMenuActionExecuted?.(action, result);
        return;
      }
      if (action.onClick) {
        const result = await action.onClick({ row, windowName, apiBaseUrl, token });
        onMenuActionExecuted?.(action, result);
        return;
      }
      // columnName-based AD process buttons require the detail-page hook (handleProcess)
      // and therefore can't be executed from the list. Fall through silently — the user
      // can open the detail to run it.
    } catch (err) {
      // Surface failures via console; toast/snackbar is the host's responsibility.
      // eslint-disable-next-line no-console
      console.error('Quick action failed:', err);
    } finally {
      setInFlight(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, [docAction, neoAction, row, windowName, apiBaseUrl, token, onMenuActionExecuted, inFlight]);

  return (
    <div
      className={`absolute right-3 top-1/2 -translate-y-1/2 flex flex-row items-center justify-center gap-0.5 h-10 px-3 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity z-10 ${QUICK_ACTIONS_PILL_CLASS}`.trim()}
      data-testid="row-quick-actions"
      onClick={stop}
    >
      {/* Edit */}
      {passesVisibleWhen('edit') && (
        <button
          type="button"
          onClick={(e) => { stop(e); runWithInFlight('edit', onEdit)(row); }}
          disabled={!!inFlight.edit}
          className={[neutralBtnCls, inFlight.edit ? 'opacity-60 cursor-wait' : ''].filter(Boolean).join(' ')}
          aria-label={ui('quickAction.edit')}
          title={ui('quickAction.edit')}
          data-testid="row-quick-action-edit"
        >
          {inFlight.edit ? <Loader2 className="h-5 w-5 animate-spin" data-testid="Loader2__ec6673" /> : <Pencil className="h-5 w-5" data-testid="Pencil__ec6673" />}
        </button>
      )}
      {/* Clone — only when host wires onClone (no generic default exists). */}
      {onClone && passesVisibleWhen('duplicate') && (
        <button
          type="button"
          onClick={(e) => { stop(e); runWithInFlight('duplicate', onClone)(row); }}
          disabled={!!inFlight.duplicate}
          className={[neutralBtnCls, inFlight.duplicate ? 'opacity-60 cursor-wait' : ''].filter(Boolean).join(' ')}
          aria-label={ui('quickAction.clone')}
          title={ui('quickAction.clone')}
          data-testid="row-quick-action-clone"
        >
          {inFlight.duplicate ? <Loader2 className="h-5 w-5 animate-spin" data-testid="Loader2__ec6673" /> : <Copy className="h-5 w-5" data-testid="Copy__ec6673" />}
        </button>
      )}
      {/* Email — gated by sendDocument.enabled (default true for eligible
          documental windows) with the legacy `documentPreview` truthy as
          fallback for callers that haven't migrated. */}
      {(sendDocument ? sendDocument.enabled !== false : !!documentPreview) && passesVisibleWhen('email') && (
        <button
          type="button"
          onClick={(e) => { stop(e); runWithInFlight('email', onEmail)(row); }}
          disabled={!!inFlight.email}
          className={[neutralBtnCls, inFlight.email ? 'opacity-60 cursor-wait' : ''].filter(Boolean).join(' ')}
          aria-label={ui('quickAction.email')}
          title={ui('quickAction.email')}
          data-testid="row-quick-action-email"
        >
          {inFlight.email ? <Loader2 className="h-5 w-5 animate-spin" data-testid="Loader2__ec6673" /> : <Mail className="h-5 w-5" data-testid="Mail__ec6673" />}
        </button>
      )}
      {/* More — popover with menuActions[] */}
      {visibleMenuActions.length > 0 && (
        <div className="relative" ref={moreRef}>
          <button
            type="button"
            onClick={(e) => { stop(e); setShowMenu(v => !v); }}
            className={neutralBtnCls}
            aria-label={ui('quickAction.more')}
            title={ui('quickAction.more')}
            data-testid="row-quick-action-more"
          >
            <MoreVertical className="h-5 w-5" data-testid="MoreVertical__ec6673" />
          </button>
          {showMenu && menuPos && createPortal(
            <>
              {/* Invisible backdrop — sits between the table rows and the
                  popover. Because it's portaled to <body> it escapes the per-row
                  stacking context, so rows below cannot paint above it and
                  cannot receive hover (their quick-actions overlay stays
                  hidden). Click bubbles to the mousedown handler above which
                  closes the menu. */}
              <div className="fixed inset-0 z-[60]" aria-hidden="true" />
            <div
              ref={menuRef}
              className="fixed z-[61] bg-white py-2 min-w-[160px] rounded-lg"
              style={{
                top: menuPos.top,
                right: menuPos.right,
                boxShadow:
                  '0px 0px 0px 1px rgba(18,18,23,0.1), 0px 24px 48px rgba(18,18,23,0.03), 0px 10px 18px rgba(18,18,23,0.03), 0px 5px 8px rgba(18,18,23,0.04), 0px 2px 4px rgba(18,18,23,0.04)',
              }}
            >
              {visibleMenuActions.map((action, i) => {
                const ActionIcon = action.icon;
                const label = action.labelKey ? ui(action.labelKey) : action.label;
                const inFlightKey = `menu:${action.key ?? action.label ?? 'unknown'}`;
                const pending = !!inFlight[inFlightKey];
                return (
                  <button
                    key={action.key || i}
                    type="button"
                    data-testid={`menu-action-${action.key ?? i}`}
                    disabled={pending || docAction.loading}
                    onClick={(e) => { stop(e); handleMenuActionClick(action); }}
                    className={[
                      'w-full text-left px-3 py-1.5 text-sm leading-6 transition-colors flex items-center gap-2',
                      action.destructive ? 'text-red-600 hover:bg-red-50' : 'text-foreground hover:bg-secondary',
                      (pending || docAction.loading) ? 'opacity-50 cursor-not-allowed' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {pending ? (
                      <Loader2
                        className="h-4 w-4 flex-shrink-0 animate-spin"
                        data-testid="Loader2__ec6673" />
                    ) : ActionIcon && (
                      <ActionIcon
                        className="h-4 w-4 flex-shrink-0"
                        style={{ color: action.destructive ? undefined : '#828FA3' }}
                        data-testid="ActionIcon__ec6673" />
                    )}
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
            </>,
            document.body,
          )}
        </div>
      )}
      {/* Delete */}
      {showDelete && passesVisibleWhen('delete') && (
        <button
          type="button"
          onClick={(e) => { stop(e); runWithInFlight('delete', onDelete)(row); }}
          disabled={!!inFlight.delete}
          className={[dangerBtnCls, inFlight.delete ? 'opacity-60 cursor-wait' : ''].filter(Boolean).join(' ')}
          aria-label={ui('quickAction.delete')}
          title={ui('quickAction.delete')}
          data-testid="row-quick-action-delete"
        >
          {inFlight.delete ? <Loader2 className="h-5 w-5 animate-spin" data-testid="Loader2__ec6673" /> : <Trash2 className="h-5 w-5" data-testid="Trash2__ec6673" />}
        </button>
      )}
    </div>
  );
}
