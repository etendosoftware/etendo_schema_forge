/**
 * ETP-4933 — Primary persist actions for DetailView, extracted verbatim from
 * DetailView.jsx (lines 952–1104 at 43fe9a9b9).
 *
 * The extraction is what makes the required-field gating possible: DetailView is a
 * God Component under a committed no-growth guardrail
 * (.claude/hooks/check-detailview-growth.mjs), so the gate could not be wired in
 * place. Moving the five primary buttons here also puts them somewhere focused
 * enough to unit-test directly.
 *
 * Behaviour-preserving move — the only functional change is the `saveGate` prop,
 * which every primary button now honours.
 */
import { Button } from '@/components/ui/button.jsx';
import { Check, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

/**
 * The required-field gate shared by every primary persist button.
 *
 * `blocked` feeds `disabled`, `title` explains WHY in the user's language, and
 * `missingAttr` exposes the reason to E2E as a locale-independent data attribute
 * (same pattern as data-doc-status / data-row-status). Labels resolve through
 * `labelFor` (useLabel, keyed on the AD column), falling back to the descriptor's
 * label and finally the field key, so a missing translation degrades to something
 * readable rather than blank.
 */
export function buildSaveGate({ isValid, missingRequiredFields = [], labelFor, ui }) {
  // Fails OPEN, deliberately: block only when we actually know WHICH fields are
  // missing. A caller that reports no validity at all (`isValid === undefined` —
  // a mocked hook, or any consumer predating ETP-4933) must never end up with a
  // permanently disabled button and an empty explanation.
  if (isValid || missingRequiredFields.length === 0) {
    return { blocked: false, title: undefined, missingAttr: undefined };
  }
  const names = missingRequiredFields.map(f => labelFor?.(f.column) || f.label || f.key);
  return {
    blocked: true,
    title: ui('saveMissingRequired', { fields: names.join(', ') }),
    missingAttr: missingRequiredFields.map(f => f.key).join(','),
  };
}

function renderDraftModeSaveActions({
  hook, isDirty, flushPendingLines, data, isNew, navigate, windowName,
  ui, onAfterCreate, onAfterSave, token, apiBaseUrl, saveBtnCls,
  draftMode, blockSaveForBalance, blockCompleteForBalance, setShowProcessingModal, saveGate = {},
}) {
  return (
    <>
      <Button data-missing-required={saveGate.missingAttr} variant="outline" size="default" className={`${saveBtnCls} bg-card border-[hsl(var(--border-control))] text-[hsl(var(--foreground))]`} data-testid="action-save-draft" disabled={hook.isSaving || !isDirty || blockSaveForBalance || saveGate.blocked} title={blockSaveForBalance ? ui('journalUnbalancedSaveBlocked') : saveGate.title} onClick={async () => {
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
      <Button data-missing-required={saveGate.missingAttr} size="default" className={saveBtnCls} data-testid="action-save" disabled={hook.isSaving || blockCompleteForBalance || (draftMode.disableWhenEmpty === true && !hook.childrenLoading && hook.children.length === 0) || saveGate.blocked} title={blockCompleteForBalance ? ui('journalUnbalancedCompleteBlocked') : saveGate.title} onClick={async () => {
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

const UNNAVIGABLE_SAVE_MESSAGE_KEY = 'savedButCannotOpenRecord';

/**
 * A NEW record that saves OK but whose response yields no derivable id (see
 * deriveRecordId in useEntity) used to skip the redirect with no signal at all,
 * leaving the user on /window/new. Surface it instead of failing silently.
 * Returns true when the failure was reported.
 */
export function reportUnnavigableSave({ saved, isNew, windowName, ui }) {
  if (!isNew || !saved || saved.id) return false;
  console.error(
    `[DetailView] Save succeeded for '${windowName}' but the response has no derivable record id — redirect skipped`,
    saved,
  );
  toast.error(ui?.(UNNAVIGABLE_SAVE_MESSAGE_KEY) || UNNAVIGABLE_SAVE_MESSAGE_KEY);
  return true;
}

export async function handlePostSaveNavigation(saved, { isNew, onAfterCreate, onAfterExistingSave, onAfterSave, navigate, windowName, token, apiBaseUrl, hook, ui }) {
  if (!saved) return;
  await (isNew ? onAfterCreate : onAfterExistingSave)?.(saved, { token, apiBaseUrl });
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
 * Save (+ optional Confirm) toolbar buttons for a brand-new (unsaved) record.
 * Extracted from the DetailView footer IIFE. New-record Save is never gated by
 * !isDirty — only by isDocumentReadOnly, isSaving and blockSaveForBalance.
 */
function renderNewRecordSaveActions({
  hook, flushPendingLines, data, isNew, navigate, windowName,
  ui, tMenu, onAfterCreate, onAfterSave, token, apiBaseUrl, saveBtnCls,
  isDocumentReadOnly, isProcessed, draftMode, blockSaveForBalance, blockCompleteForBalance, saveGate = {},
}) {
  return (
    <>
      <Button data-missing-required={saveGate.missingAttr} size="default" className={saveBtnCls} data-testid="action-save" disabled={isDocumentReadOnly || hook.isSaving || blockSaveForBalance || saveGate.blocked} title={blockSaveForBalance ? ui('journalUnbalancedSaveBlocked') : saveGate.title} onClick={async () => {
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
        <Button data-missing-required={saveGate.missingAttr} size="default" className={saveBtnCls} data-testid="action-complete" disabled={hook.isSaving || blockCompleteForBalance || saveGate.blocked} title={blockCompleteForBalance ? ui('journalUnbalancedCompleteBlocked') : saveGate.title} onClick={async () => {
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
  ui, onAfterCreate, onAfterExistingSave, onAfterSave, token, apiBaseUrl, saveBtnCls, isDocumentReadOnly, blockSaveForBalance, saveGate = {},
}) {
  return (
    <Button data-missing-required={saveGate.missingAttr} variant="outline" size="default" className={`${saveBtnCls} bg-card border-[hsl(var(--border-control))] text-[hsl(var(--foreground))]`} data-testid="action-save" disabled={isDocumentReadOnly || hook.isSaving || !isDirty || blockSaveForBalance || saveGate.blocked} title={blockSaveForBalance ? ui('journalUnbalancedSaveBlocked') : saveGate.title} onClick={async () => {
      if (!(await flushPendingLines())) return;
      const saved = await hook.handleSave(data);
      await handlePostSaveNavigation(saved, { isNew, onAfterCreate, onAfterExistingSave, onAfterSave, navigate, windowName, token, apiBaseUrl, hook, ui });
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
function renderSaveActions(params) {
  if (params.draftMode?.enabled) return renderDraftModeSaveActions(params);
  if (params.isNew) return renderNewRecordSaveActions(params);
  return renderExistingRecordSaveAction(params);
}
export { renderSaveActions };
