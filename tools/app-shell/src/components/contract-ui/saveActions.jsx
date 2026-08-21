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
import { maybeSaveBeforeConfirm } from './detailViewHelpers.jsx';

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

/**
 * ETP-4940: draftMode "Confirm" click extracted to module level (like its
 * sibling renderers below) so this branch-heavy flow doesn't count toward
 * renderDraftModeSaveActions's cognitive complexity.
 *
 * Ported here during the ETP-4933/ETP-4940 merge: ETP-4940 wrote this against
 * DetailView.jsx while ETP-4933 was moving the same block into this file, so git
 * saw a delete-vs-modify conflict with no common text. The logic below is
 * ETP-4940's verbatim.
 */
async function runDraftModeConfirm({ flushPendingLines, draftMode, isDirty, hook, isNew, onAfterCreate, onAfterSave, navigate, windowName, token, apiBaseUrl, ui, setShowProcessingModal }) {
  if (!(await flushPendingLines())) return;
  if (typeof draftMode.onConfirm === 'function') {
    // onConfirm fully bypasses handleSaveAndProcess (below), which already
    // saves first. Persist any pending header edit before handing off.
    if (!(await maybeSaveBeforeConfirm({ isDirty, handleSave: hook.handleSave }))) return;
    draftMode.onConfirm();
    return;
  }
  const showProcessing = Boolean(draftMode.processingModal);
  if (showProcessing) setShowProcessingModal(true);
  try {
    const saved = await hook.handleSaveAndProcess(draftMode);
    if (!saved) return;
    if (isNew && onAfterCreate) await onAfterCreate(saved, { token, apiBaseUrl });
    if (onAfterSave) return navigate(`/${windowName}`, { replace: true, state: { savedRecord: saved, justSaved: saved } });
    if (saved.id && isNew) { hook.primeSaved?.(saved); return navigate(`/${windowName}/${saved.id}`, { replace: true, state: { justSaved: saved } }); }
    if (saved.id) return hook.fetchById?.(saved.id);
    reportUnnavigableSave({ saved, isNew, windowName, ui });
  } finally {
    if (showProcessing) setShowProcessingModal(false);
  }
}

/**
 * The secondary (outline) look for a Save button, identical to the one the draftMode
 * renderer has always used for Save Draft. Extracted so the two renderers cannot drift.
 */
const SECONDARY_SAVE_CLS = 'bg-card border-[hsl(var(--border-control))] text-[hsl(var(--foreground))]';

/**
 * ETP-4933 follow-up: a `title` on a DISABLED button is never shown. The shared Button
 * carries `disabled:pointer-events-none`, so the element receives no hover and the
 * native tooltip never fires — which silently defeated the whole "explain why Save is
 * blocked" mechanism, and the pre-existing unbalanced-journal titles with it.
 *
 * The wrapper is not disabled, so it does get the hover. It is only inserted when
 * there IS a reason to explain, so the DOM is unchanged on the normal path and no
 * existing selector or layout is affected.
 */
function GateTooltip({ title, children }) {
  if (!title) return children;
  return <span title={title} className="inline-flex">{children}</span>;
}

/**
 * Save / Confirm toolbar buttons for draftMode windows (Save Draft + Confirm).
 * All identifiers are destructured with the SAME names used inside DetailView
 * so closure-equivalent logic and the dirty-state regression substrings stay intact.
 */
function renderDraftModeSaveActions({
  hook, isDirty, flushPendingLines, data, isNew, navigate, windowName,
  ui, onAfterCreate, onAfterSave, token, apiBaseUrl, saveBtnCls,
  draftMode, blockSaveForBalance, blockCompleteForBalance, setShowProcessingModal, saveGate = {},
}) {
  return (
    <>
      <GateTooltip title={blockSaveForBalance ? ui('journalUnbalancedSaveBlocked') : saveGate.title}><Button data-missing-required={saveGate.missingAttr} variant="outline" size="default" className={`${saveBtnCls} ${SECONDARY_SAVE_CLS}`} data-testid="action-save-draft" disabled={hook.isSaving || !isDirty || blockSaveForBalance || saveGate.blocked} title={blockSaveForBalance ? ui('journalUnbalancedSaveBlocked') : saveGate.title} onClick={async () => {
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
      </Button></GateTooltip>
      <GateTooltip title={blockCompleteForBalance ? ui('journalUnbalancedCompleteBlocked') : saveGate.title}><Button data-missing-required={saveGate.missingAttr} size="default" className={saveBtnCls} data-testid="action-save" disabled={hook.isSaving || blockCompleteForBalance || (draftMode.disableWhenEmpty === true && !hook.childrenLoading && hook.children.length === 0) || saveGate.blocked} title={blockCompleteForBalance ? ui('journalUnbalancedCompleteBlocked') : saveGate.title} onClick={() => runDraftModeConfirm({ flushPendingLines, draftMode, isDirty, hook, isNew, onAfterCreate, onAfterSave, navigate, windowName, token, apiBaseUrl, ui, setShowProcessingModal })}>
        {hook.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__fa3275" /> : <Check className="h-3.5 w-3.5" data-testid="Check__fa3275" />}
        {ui(draftMode.label) || draftMode.label || ui('process')}
      </Button></GateTooltip>
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
  hasExternalPrimaryAction = false,
}) {
  // ETP-4933: on a new record Save is normally THE primary action, so the default
  // (blue) variant is right. Windows that render their own primary action beside it
  // — the return windows put a Confirm button in the topbarRight slot — opt in via
  // `hasExternalPrimaryAction` so Save drops to the same outline look the draftMode
  // renderer already gives Save Draft. Named for the reason, not the window: any
  // window that grows a competing primary action wants the same thing.
  const saveCls = hasExternalPrimaryAction ? `${saveBtnCls} ${SECONDARY_SAVE_CLS}` : saveBtnCls;
  return (
    <>
      <GateTooltip title={blockSaveForBalance ? ui('journalUnbalancedSaveBlocked') : saveGate.title}><Button data-missing-required={saveGate.missingAttr} {...(hasExternalPrimaryAction ? { variant: 'outline' } : {})} size="default" className={saveCls} data-testid="action-save" disabled={isDocumentReadOnly || hook.isSaving || blockSaveForBalance || saveGate.blocked} title={blockSaveForBalance ? ui('journalUnbalancedSaveBlocked') : saveGate.title} onClick={async () => {
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
      </Button></GateTooltip>
      {!isProcessed && hook.children.length > 0 && (
        <GateTooltip title={blockCompleteForBalance ? ui('journalUnbalancedCompleteBlocked') : saveGate.title}><Button data-missing-required={saveGate.missingAttr} size="default" className={saveBtnCls} data-testid="action-complete" disabled={hook.isSaving || blockCompleteForBalance || saveGate.blocked} title={blockCompleteForBalance ? ui('journalUnbalancedCompleteBlocked') : saveGate.title} onClick={async () => {
          if (!(await flushPendingLines())) return;
          const saved = await hook.handleSaveAndProcess(draftMode);
          await handlePostSaveNavigation(saved, { isNew, onAfterCreate, onAfterSave, navigate, windowName, token, apiBaseUrl, hook, ui });
        }}>
          {hook.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__fa3275" /> : <Check className="h-3.5 w-3.5" data-testid="Check__fa3275" />}
          {ui(draftMode.label) || tMenu(draftMode.label) || ui('process')}
        </Button></GateTooltip>
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
    <GateTooltip title={blockSaveForBalance ? ui('journalUnbalancedSaveBlocked') : saveGate.title}><Button data-missing-required={saveGate.missingAttr} variant="outline" size="default" className={`${saveBtnCls} ${SECONDARY_SAVE_CLS}`} data-testid="action-save" disabled={isDocumentReadOnly || hook.isSaving || !isDirty || blockSaveForBalance || saveGate.blocked} title={blockSaveForBalance ? ui('journalUnbalancedSaveBlocked') : saveGate.title} onClick={async () => {
      if (!(await flushPendingLines())) return;
      const saved = await hook.handleSave(data);
      await handlePostSaveNavigation(saved, { isNew, onAfterCreate, onAfterExistingSave, onAfterSave, navigate, windowName, token, apiBaseUrl, hook, ui });
    }}>
      {hook.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__fa3275" /> : <Save className="h-3.5 w-3.5" color="hsl(var(--muted-foreground))" data-testid="Save__fa3275" />}
      {ui('save')}
    </Button></GateTooltip>
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
