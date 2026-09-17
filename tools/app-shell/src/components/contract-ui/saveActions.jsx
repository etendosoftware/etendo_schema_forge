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
import { useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Check, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { maybeSaveBeforeConfirm } from './detailViewHelpers.jsx';

/**
 * The required-field gate shared by every primary persist button. ETP-4839 layers a
 * second, independent gate on top (see `buildCompletedFieldsGate` below): both share
 * the exact same `{ blocked, title, missingAttr }` shape so every consumer of
 * `saveGate` (GateTooltip + the Button's `disabled`) keeps working unchanged.
 *
 * `blocked` feeds `disabled`, `title` explains WHY in the user's language, and
 * `missingAttr` exposes the reason to E2E as a locale-independent data attribute
 * (same pattern as data-doc-status / data-row-status). Labels resolve through
 * `labelFor` (useLabel, keyed on the AD column), falling back to the descriptor's
 * label and finally the field key, so a missing translation degrades to something
 * readable rather than blank.
 */
export function buildSaveGate({
  isValid, missingRequiredFields = [], labelFor, ui,
  draftMode, isDraftModeCompleted = false, dirtyFieldKeys = [], gateFields = [],
}) {
  // Fails OPEN, deliberately: block only when we actually know WHICH fields are
  // missing. A caller that reports no validity at all (`isValid === undefined` —
  // a mocked hook, or any consumer predating ETP-4933) must never end up with a
  // permanently disabled button and an empty explanation.
  if (!(isValid || missingRequiredFields.length === 0)) {
    const names = missingRequiredFields.map(f => labelFor?.(f.column) || f.label || f.key);
    return {
      blocked: true,
      title: ui('saveMissingRequired', { fields: names.join(', ') }),
      missingAttr: missingRequiredFields.map(f => f.key).join(','),
    };
  }
  return buildCompletedFieldsGate({ draftMode, isDraftModeCompleted, dirtyFieldKeys, gateFields, labelFor, ui });
}

/**
 * ETP-4839 — `window.draftMode.keepSaveWhenCompletedFields` (string[]): once the
 * document is completed, Save is allowed to persist ONLY the header fields named in
 * this list (e.g. purchase-invoice's `orderReference`/"N° documento"). "Confirm" is
 * NEVER re-exposed for a completed document, regardless of this list — that stays
 * `onlySaveButton`'s job in `renderDraftModeSaveActions`, unconditionally, for every
 * window (unifying the earlier per-window `completedStatuses` idempotency exception).
 *
 * Fails CLOSED here, unlike the required-field gate above: if the user has ANY dirty
 * header field outside the allowed list, Save is blocked entirely — never a silent
 * partial save of just the allowed fields, never a silent save of everything. This was
 * an explicit human decision (safety over convenience): an unreviewed edit must never
 * slip through disguised as an allowed one.
 *
 * No-op (never blocks) unless the caller passes `isDraftModeCompleted: true` AND a
 * non-empty `keepSaveWhenCompletedFields` — so every window without the feature, and
 * every non-completed document, is completely unaffected.
 */
function buildCompletedFieldsGate({ draftMode, isDraftModeCompleted, dirtyFieldKeys, gateFields, labelFor, ui }) {
  const allowedWhenCompleted = draftMode?.keepSaveWhenCompletedFields;
  const gateActive = isDraftModeCompleted && Array.isArray(allowedWhenCompleted) && allowedWhenCompleted.length > 0;
  const notBlocked = { blocked: false, title: undefined, missingAttr: undefined };
  if (!gateActive) return notBlocked;
  const disallowedDirty = (dirtyFieldKeys || []).filter(key => !allowedWhenCompleted.includes(key));
  if (disallowedDirty.length === 0) return notBlocked;
  const names = disallowedDirty.map((key) => {
    const descriptor = (gateFields || []).find(f => f?.key === key);
    return (descriptor && labelFor?.(descriptor.column)) || descriptor?.label || key;
  });
  return {
    blocked: true,
    title: ui('saveBlockedFieldsNotAllowedWhenCompleted', { fields: names.join(', ') }),
    missingAttr: disallowedDirty.join(','),
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
async function runDraftModeConfirm({ flushPendingLines, draftMode, isDirty, hook, isNew, onAfterCreate, onAfterSave, navigate, windowName, token, apiBaseUrl, ui, setShowProcessingModal, setCustomConfirmBusy }) {
  if (!(await flushPendingLines())) return;
  if (typeof draftMode.onConfirm === 'function') {
    // onConfirm fully bypasses handleSaveAndProcess (below), which already
    // saves first. Persist any pending header edit before handing off.
    if (!(await maybeSaveBeforeConfirm({ isDirty, handleSave: hook.handleSave }))) return;
    // ETP-5265 QA follow-up — in-flight feedback for a custom `onConfirm` belongs IN the
    // Confirm button (spinner + disabled), exactly like the native handleSaveAndProcess
    // path below that the invoice windows already take; QA rejected the floating
    // "processing" toast that stood in for it while this branch was fire-and-forget.
    // An onConfirm that really does async work now returns a promise for that work
    // (goods-shipment / goods-receipt hand their documentAction call back through the
    // CustomEvent `detail`), and awaiting it here is what drives the button's spinner.
    //
    // Behaviour-preserving for every other window: `await undefined` settles on the next
    // microtask, so an onConfirm that merely opens a modal and returns nothing
    // (sales-order, purchase-order, sales-quotation, and the not-fully-invoiced branch of
    // the goods windows) flips the flag straight back with nothing visible in between.
    // `setCustomConfirmBusy` is optional-called so a caller that never passes it behaves
    // exactly as before. try/finally so a throwing or rejecting onConfirm can never leave
    // the button stuck spinning and permanently disabled.
    setCustomConfirmBusy?.(true);
    try {
      await draftMode.onConfirm();
    } finally {
      setCustomConfirmBusy?.(false);
    }
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
    if (saved.id) return hook.fetchById?.(saved.id, { force: true });
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
 * ETP-5265 QA follow-up — the draftMode "Confirm" button, lifted out of
 * `renderDraftModeSaveActions` VERBATIM (same DOM, same testids, same gate expressions)
 * for exactly one reason: it now needs a piece of local state.
 *
 * QA rejected the floating `toast.loading` that goods-shipment/goods-receipt used as
 * in-flight feedback and asked for the spinner to be in the button, the way the invoice
 * windows behave. Those get it for free because they use the native
 * `processField`/`processValue` path, where `hook.isSaving` is the busy flag; a window
 * that supplies its own `draftMode.onConfirm` bypasses the hook entirely and so had no
 * busy flag at all. `customConfirmBusy` is that missing flag — the onConfirm-path twin of
 * `hook.isSaving`, flipped by `runDraftModeConfirm` around the awaited onConfirm.
 *
 * The state lives HERE rather than in DetailView deliberately: DetailView is a God
 * Component under a committed no-growth guardrail
 * (.claude/hooks/check-detailview-growth.mjs), nothing outside this button reads the
 * flag, and keeping it local means only this subtree re-renders when it flips.
 *
 * Behaviour-preserving for every window that does not opt in: the flag can only turn true
 * while an awaited `onConfirm` is pending, and an onConfirm that returns undefined (every
 * window except the fully-invoiced goods-shipment / goods-receipt path) resolves on the
 * next microtask, so no other window ever renders different DOM than before.
 */
function DraftModeConfirmButton({ confirmParams, hook, ui, draftMode, saveBtnCls, saveGate, blockCompleteForBalance }) {
  const [customConfirmBusy, setCustomConfirmBusy] = useState(false);
  const busy = hook.isSaving || customConfirmBusy;
  return (
    <GateTooltip data-testid="GateTooltip__3b2291" title={blockCompleteForBalance ? ui('journalUnbalancedCompleteBlocked') : saveGate.title}><Button data-missing-required={saveGate.missingAttr} size="default" className={saveBtnCls} data-testid="action-save" disabled={hook.isSaving || blockCompleteForBalance || customConfirmBusy || (draftMode.disableWhenEmpty === true && !hook.childrenLoading && hook.children.length === 0) || saveGate.blocked} title={blockCompleteForBalance ? ui('journalUnbalancedCompleteBlocked') : saveGate.title} onClick={() => runDraftModeConfirm({ ...confirmParams, setCustomConfirmBusy })}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__fa3275" /> : <Check className="h-3.5 w-3.5" data-testid="Check__fa3275" />}
      {ui(draftMode.label) || draftMode.label || ui('process')}
    </Button></GateTooltip>
  );
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
  onlySaveButton = false,
}) {
  return (
    <>
      <GateTooltip data-testid="GateTooltip__3b2291" title={blockSaveForBalance ? ui('journalUnbalancedSaveBlocked') : saveGate.title}><Button data-missing-required={saveGate.missingAttr} variant="outline" size="default" className={`${saveBtnCls} ${SECONDARY_SAVE_CLS}`} data-testid="action-save-draft" disabled={hook.isSaving || !isDirty || blockSaveForBalance || saveGate.blocked} title={blockSaveForBalance ? ui('journalUnbalancedSaveBlocked') : saveGate.title} onClick={async () => {
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
      {/* ETP-4839: `draftMode.keepSaveWhenCompletedFields` keeps Save visible once
         the document is completed (isDraftModeCompleted, see DetailView.jsx) while
         the process/"Confirm" button below stays hidden UNCONDITIONALLY — its
         handler always sends `processField`, which some backends are not idempotent
         against on an already-completed document. `onlySaveButton` is the
         render-time signal for that state; Save's own enabled/disabled state is a
         separate concern handled by `saveGate` (see buildCompletedFieldsGate). Does
         not change behaviour on any window without a non-empty array configured. */}
      {!onlySaveButton && (
        <DraftModeConfirmButton
          confirmParams={{ flushPendingLines, draftMode, isDirty, hook, isNew, onAfterCreate, onAfterSave, navigate, windowName, token, apiBaseUrl, ui, setShowProcessingModal }}
          hook={hook} ui={ui} draftMode={draftMode} saveBtnCls={saveBtnCls} saveGate={saveGate}
          blockCompleteForBalance={blockCompleteForBalance}
        />
      )}
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

/**
 * ETP-5199 — the post-save side-effect (`onAfterCreate`/`onAfterExistingSave`) extracted out
 * of `handlePostSaveNavigation` so a caller that must NOT navigate afterwards — the
 * "Guardar y salir" unsaved-changes-navigation-guard saver in `DetailView.jsx` — can still run
 * it. `handlePostSaveNavigation` (below) is the ONLY other caller and keeps its exact previous
 * behaviour: this is a behaviour-preserving extraction, not a new rule.
 *
 * Deliberately no try/catch here: a rejection propagates to the caller exactly as it did when
 * this line lived inline in `handlePostSaveNavigation`, so both save paths (the toolbar Save
 * button and the unsaved-changes-guard saver) treat a throwing hook identically. Individual
 * `onAfterExistingSave`/`onAfterCreate` implementations are expected to handle their own
 * errors when a failure must not look like the whole save failed — see
 * `handleRoleAssignmentSave` in `windows/custom/user/index.jsx`, which already does.
 */
export async function runAfterSaveHook(saved, { isNew, onAfterCreate, onAfterExistingSave, token, apiBaseUrl }) {
  await (isNew ? onAfterCreate : onAfterExistingSave)?.(saved, { token, apiBaseUrl });
}

export async function handlePostSaveNavigation(saved, { isNew, onAfterCreate, onAfterExistingSave, onAfterSave, navigate, windowName, token, apiBaseUrl, hook, ui }) {
  if (!saved) return;
  await runAfterSaveHook(saved, { isNew, onAfterCreate, onAfterExistingSave, token, apiBaseUrl });
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
 * ETP-5199 — builds the saver `DetailView.jsx` registers with `useUnsavedChangesGuard` for the
 * in-app "Guardar y salir" navigation-guard path (see `unsavedChanges.js`'s
 * `savePendingNavigation`). Extracted here rather than inlined in `DetailView.jsx` per that
 * component's own no-growth guardrail (`.claude/hooks/check-detailview-growth.mjs`).
 *
 * Bug this fixes: this saver used to be `() => hook.handleSave({ silent: true })` only, so
 * "Guardar y salir" persisted plain header fields (they live in `hook.editing`, part of
 * `handleSave`'s own payload) but silently dropped any state a window keeps OUTSIDE
 * `hook.editing` and persists via `onAfterExistingSave`/`onAfterCreate` — e.g. the Users
 * window's "Roles asignados" multi-select (`handleRoleAssignmentSave` in
 * `windows/custom/user/index.jsx`; see `docs/generated-custom-windows/user.md`'s
 * "Save-lifecycle hook" section). The toolbar Save button never had this gap: its own
 * `onClick` always chains `handlePostSaveNavigation`, which calls `runAfterSaveHook`.
 *
 * Deliberately does NOT call `handlePostSaveNavigation` itself: this saver's caller
 * (`savePendingNavigation`) already owns and performs the pending navigation, so this must
 * run ONLY the post-save side-effect, never a second, competing redirect. Mirrors
 * `handlePostSaveNavigation`'s own `if (!saved) return;` guard: a validation refusal must
 * stop here so the false/null `handleSave` result still blocks navigation for the caller.
 *
 * QA follow-up (same ETP-5199 change): `runAfterSaveHook` is wrapped in its own try/catch,
 * unlike the toolbar Save button's `handlePostSaveNavigation` (which deliberately lets it
 * propagate — see that function's own comment). This path has no such luxury: an uncaught
 * rejection here propagates through `savePendingNavigation()` all the way to
 * `UnsavedChangesNavigationDialog`'s `handleSave`, neither of which has a try/catch, leaving
 * the "Guardar y salir" modal stuck open (spinner forever, every button disabled, no way out
 * short of reloading and losing the edits this guard exists to protect). The record itself
 * DID save by this point (`hook.handleSave` already resolved truthy) — only the follow-up
 * side-effect failed — so this reports it with a toast and still `return`s `saved`, exactly
 * like a genuine save success: this is NOT the `!saved` case above, which correctly blocks
 * navigation because the record itself never persisted. Mirrors the tone/precedent of
 * `handleRoleAssignmentSave`'s own `roleAssignmentSaveFailedAfterUserSaved` toast in
 * `windows/custom/user/index.jsx`, generalized here (via `savedButFollowUpActionFailed`)
 * since this helper is not Users-specific.
 */
export function buildUnsavedChangesSaver({ hook, isNew, onAfterCreate, onAfterExistingSave, token, apiBaseUrl, ui }) {
  return async () => {
    const saved = await hook.handleSave({ silent: true });
    if (saved) {
      try {
        await runAfterSaveHook(saved, { isNew, onAfterCreate, onAfterExistingSave, token, apiBaseUrl });
      } catch (err) {
        const detail = err?.message || '';
        toast.error(ui?.('savedButFollowUpActionFailed', { detail }) || 'savedButFollowUpActionFailed');
      }
    }
    return saved;
  };
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
      <GateTooltip data-testid="GateTooltip__3b2291" title={blockSaveForBalance ? ui('journalUnbalancedSaveBlocked') : saveGate.title}><Button data-missing-required={saveGate.missingAttr} {...(hasExternalPrimaryAction ? { variant: 'outline' } : {})} size="default" className={saveCls} data-testid="action-save" disabled={isDocumentReadOnly || hook.isSaving || blockSaveForBalance || saveGate.blocked} title={blockSaveForBalance ? ui('journalUnbalancedSaveBlocked') : saveGate.title} onClick={async () => {
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
        <GateTooltip data-testid="GateTooltip__3b2291" title={blockCompleteForBalance ? ui('journalUnbalancedCompleteBlocked') : saveGate.title}><Button data-missing-required={saveGate.missingAttr} size="default" className={saveBtnCls} data-testid="action-complete" disabled={hook.isSaving || blockCompleteForBalance || saveGate.blocked} title={blockCompleteForBalance ? ui('journalUnbalancedCompleteBlocked') : saveGate.title} onClick={async () => {
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
    <GateTooltip data-testid="GateTooltip__3b2291" title={blockSaveForBalance ? ui('journalUnbalancedSaveBlocked') : saveGate.title}><Button data-missing-required={saveGate.missingAttr} variant="outline" size="default" className={`${saveBtnCls} ${SECONDARY_SAVE_CLS}`} data-testid="action-save" disabled={isDocumentReadOnly || hook.isSaving || !isDirty || blockSaveForBalance || saveGate.blocked} title={blockSaveForBalance ? ui('journalUnbalancedSaveBlocked') : saveGate.title} onClick={async () => {
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
