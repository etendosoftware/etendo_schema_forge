import React from 'react';
import { Check, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { toast } from 'sonner';

const UNNAVIGABLE_SAVE_MESSAGE_KEY = 'savedButCannotOpenRecord';

export function reportUnnavigableSave({ saved, isNew, windowName, ui }) {
  if (!isNew || !saved || saved.id) return false;
  console.error(
    `[DetailView] Save succeeded for '${windowName}' but the response has no derivable record id — redirect skipped`,
    saved,
  );
  toast.error(ui?.(UNNAVIGABLE_SAVE_MESSAGE_KEY) || UNNAVIGABLE_SAVE_MESSAGE_KEY);
  return true;
}

export async function handlePostSaveNavigation(saved, { isNew, onAfterCreate, onAfterSave, navigate, windowName, token, apiBaseUrl, hook, ui }) {
  if (!saved) return;
  if (isNew && onAfterCreate) await onAfterCreate(saved, { token, apiBaseUrl });
  if (onAfterSave) {
    navigate(`/${windowName}`, { replace: true, state: { savedRecord: saved, justSaved: saved } });
  } else if (saved.id && isNew) {
    hook.primeSaved?.(saved);
    navigate(`/${windowName}/${saved.id}`, { replace: true, state: { justSaved: saved } });
  } else {
    reportUnnavigableSave({ saved, isNew, windowName, ui });
  }
}

/**
 * Save / Confirm toolbar buttons for draftMode windows (Save Draft + Confirm).
 * Extracted from the DetailView footer IIFE to keep cognitive complexity low.
 * All identifiers are destructured with the SAME names used inside the component
 * so closure-equivalent logic and the dirty-state regression substrings stay intact.
 */
function renderDraftModeSaveActions({
  hook, isDirty, flushPendingLines, data, isNew, navigate, windowName,
  ui, onAfterCreate, onAfterSave, token, apiBaseUrl, saveBtnCls,
  draftMode, blockSaveForBalance, blockCompleteForBalance, setShowProcessingModal,
}) {
  return (
    <>
      <Button variant="outline" size="default" className={`${saveBtnCls} bg-card border-[hsl(var(--border-control))] text-[hsl(var(--foreground))]`} data-testid="action-save-draft" disabled={hook.isSaving || !isDirty || blockSaveForBalance} title={blockSaveForBalance ? ui('journalUnbalancedSaveBlocked') : undefined} onClick={async () => {
        if (!(await flushPendingLines())) return;
        const saved = await hook.handleSave(data);
        if (saved?.id && isNew) {
          hook.primeSaved?.(saved);
          navigate(`/${windowName}/${saved.id}`, { replace: true, state: { justSaved: saved } });
        } else {
          reportUnnavigableSave({ saved, isNew, windowName, ui });
        }
      }}>
        {hook.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__fa3275" /> : <Save className="h-3.5 w-3.5" color="hsl(var(--muted-foreground))" data-testid="Save__fa3275" />}
        {ui('save')}
      </Button>
      <Button size="default" className={saveBtnCls} data-testid="action-save" disabled={hook.isSaving || blockCompleteForBalance || (draftMode.disableWhenEmpty === true && !hook.childrenLoading && hook.children.length === 0)} title={blockCompleteForBalance ? ui('journalUnbalancedCompleteBlocked') : undefined} onClick={async () => {
        if (!(await flushPendingLines())) return;
        if (typeof draftMode.onConfirm === 'function') { draftMode.onConfirm(); return; }
        const showProcessing = Boolean(draftMode.processingModal);
        if (showProcessing) setShowProcessingModal(true);
        try {
          const saved = await hook.handleSaveAndProcess(draftMode);
          if (saved) {
            if (isNew && onAfterCreate) await onAfterCreate(saved, { token, apiBaseUrl });
            if (onAfterSave) {
              navigate(`/${windowName}`, { replace: true, state: { savedRecord: saved, justSaved: saved } });
            } else if (saved.id && isNew) {
              hook.primeSaved?.(saved);
              navigate(`/${windowName}/${saved.id}`, { replace: true, state: { justSaved: saved } });
            } else if (saved.id) {
              hook.fetchById?.(saved.id);
            } else {
              reportUnnavigableSave({ saved, isNew, windowName, ui });
            }
          }
        } finally {
          if (showProcessing) setShowProcessingModal(false);
        }
      }}>
        {hook.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__fa3275" /> : <Check className="h-3.5 w-3.5" data-testid="Check__fa3275" />}
        {ui(draftMode.label) || draftMode.label || ui('process')}
      </Button>
    </>
  );
}

/**
 * Save (+ optional Confirm) toolbar buttons for a brand-new (unsaved) record.
 * Extracted from the DetailView footer IIFE. New-record Save is never gated by
 * !isDirty — only by isDocumentReadOnly, isSaving and blockSaveForBalance.
 */
function renderNewRecordSaveActions({
  hook, flushPendingLines, data, isNew, navigate, windowName,
  ui, tMenu, onAfterCreate, onAfterSave, token, apiBaseUrl, saveBtnCls,
  isDocumentReadOnly, isProcessed, draftMode, blockSaveForBalance, blockCompleteForBalance,
}) {
  return (
    <>
      <Button size="default" className={saveBtnCls} data-testid="action-save" disabled={isDocumentReadOnly || hook.isSaving || blockSaveForBalance} title={blockSaveForBalance ? ui('journalUnbalancedSaveBlocked') : undefined} onClick={async () => {
        if (!(await flushPendingLines())) return;
        const saved = await hook.handleSave(data);
        if (saved?.id && isNew) {
          if (onAfterCreate) await onAfterCreate(saved, { token, apiBaseUrl });
          hook.primeSaved?.(saved);
          navigate(`/${windowName}/${saved.id}`, { replace: true, state: { justSaved: saved } });
        } else {
          reportUnnavigableSave({ saved, isNew, windowName, ui });
        }
      }}>
        {hook.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__fa3275" /> : <Save className="h-3.5 w-3.5" data-testid="Save__fa3275" />}
        {ui('save')}
      </Button>
      {!isProcessed && hook.children.length > 0 && (
        <Button size="default" className={saveBtnCls} data-testid="action-complete" disabled={hook.isSaving || blockCompleteForBalance} title={blockCompleteForBalance ? ui('journalUnbalancedCompleteBlocked') : undefined} onClick={async () => {
          if (!(await flushPendingLines())) return;
          const saved = await hook.handleSaveAndProcess(draftMode);
          await handlePostSaveNavigation(saved, { isNew, onAfterCreate, onAfterSave, navigate, windowName, token, apiBaseUrl, hook, ui });
        }}>
          {hook.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__fa3275" /> : <Check className="h-3.5 w-3.5" data-testid="Check__fa3275" />}
          {ui(draftMode.label) || tMenu(draftMode.label) || ui('process')}
        </Button>
      )}
    </>
  );
}

/**
 * Single Save toolbar button for an existing (already-persisted) record.
 * Extracted from the DetailView footer IIFE. Gated by isDocumentReadOnly,
 * isSaving, !isDirty and blockSaveForBalance.
 */
function renderExistingRecordSaveAction({
  hook, isDirty, flushPendingLines, data, isNew, navigate, windowName,
  ui, onAfterCreate, onAfterSave, token, apiBaseUrl, saveBtnCls,
  isDocumentReadOnly, blockSaveForBalance,
}) {
  return (
    <Button variant="outline" size="default" className={`${saveBtnCls} bg-card border-[hsl(var(--border-control))] text-[hsl(var(--foreground))]`} data-testid="action-save" disabled={isDocumentReadOnly || hook.isSaving || !isDirty || blockSaveForBalance} title={blockSaveForBalance ? ui('journalUnbalancedSaveBlocked') : undefined} onClick={async () => {
      if (!(await flushPendingLines())) return;
      const saved = await hook.handleSave(data);
      await handlePostSaveNavigation(saved, { isNew, onAfterCreate, onAfterSave, navigate, windowName, token, apiBaseUrl, hook, ui });
    }}>
      {hook.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__fa3275" /> : <Save className="h-3.5 w-3.5" color="hsl(var(--muted-foreground))" data-testid="Save__fa3275" />}
      {ui('save')}
    </Button>
  );
}

/**
 * Dispatches the footer Save/Confirm action block by record state. Extracted to
 * module level so the branch logic does not count toward DetailView's cognitive
 * complexity. All values arrive via the `params` object built in DetailView.
 */
export function renderSaveActions(params) {
  if (params.draftMode?.enabled) return renderDraftModeSaveActions(params);
  if (params.isNew) return renderNewRecordSaveActions(params);
  return renderExistingRecordSaveAction(params);
}
