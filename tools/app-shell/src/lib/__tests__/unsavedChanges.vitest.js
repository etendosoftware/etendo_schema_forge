import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setUnsavedChanges,
  clearUnsavedChanges,
  hasUnsavedChanges,
  suppressNextUnloadPrompt,
  installUnloadGuard,
  saveEmbeddedUnsavedChanges,
  resetUnsavedChangesForTests,
} from '../unsavedChanges.js';

// ETP-5022 — the registry behind the language-change and F5 warnings. A language change
// reloads the page (translated reference data is resolved per request), so anything unsaved
// is discarded; these are the guarantees that make that safe.

function fireBeforeUnload() {
  // Do NOT pre-set returnValue: on a plain Event it is the legacy inverted-cancel property,
  // so assigning any falsy value here would itself cancel the event and every assertion
  // below would be measuring the test's own side effect.
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

describe('unsavedChanges registry', () => {
  beforeEach(() => resetUnsavedChangesForTests());

  it('reports clean when nothing is registered', () => {
    expect(hasUnsavedChanges()).toBe(false);
  });

  it('reports dirty once a form registers', () => {
    setUnsavedChanges('form-a', true);
    expect(hasUnsavedChanges()).toBe(true);
  });

  it('goes back to clean when the form saves', () => {
    setUnsavedChanges('form-a', true);
    setUnsavedChanges('form-a', false);
    expect(hasUnsavedChanges()).toBe(false);
  });

  it('stays dirty while ANY of several forms is dirty', () => {
    // A record plus a modal can be mounted at once; one saving must not clear the other.
    setUnsavedChanges('record', true);
    setUnsavedChanges('modal', true);
    setUnsavedChanges('modal', false);
    expect(hasUnsavedChanges()).toBe(true);
    setUnsavedChanges('record', false);
    expect(hasUnsavedChanges()).toBe(false);
  });

  it('clears a form that unmounts while still dirty', () => {
    // Otherwise the app would stay permanently dirty and prompt forever afterwards.
    setUnsavedChanges('gone', true);
    clearUnsavedChanges('gone');
    expect(hasUnsavedChanges()).toBe(false);
  });
});

describe('saveEmbeddedUnsavedChanges (ETP-5332)', () => {
  // "Completado" in RecordCreateModal must save ONLY the popup's own embedded DetailView, never
  // the document the popup was opened from — a separate `dirtyForms` entry with `embedded`
  // unset. Saving that one too would be a worse bug than the one this function fixes: it would
  // silently save-and-possibly-navigate the document behind the dialog.
  beforeEach(() => resetUnsavedChangesForTests());

  it('calls the saver of an entry registered as embedded', async () => {
    const save = vi.fn().mockResolvedValue(true);
    setUnsavedChanges('popup-form', true, save, true);

    const result = await saveEmbeddedUnsavedChanges();

    expect(save).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });

  it('does NOT call the saver of an entry that is not embedded (the scoping guard)', async () => {
    // This is the critical regression test: a document editing session sitting behind the
    // popup registers with `embedded` false/omitted. If this ever called its saver too, an
    // edit on that document would be silently saved (and possibly navigated) by the popup's
    // own "Completado" button.
    const documentSave = vi.fn().mockResolvedValue(true);
    const popupSave = vi.fn().mockResolvedValue(true);
    setUnsavedChanges('document-behind-popup', true, documentSave, false);
    setUnsavedChanges('popup-form', true, popupSave, true);

    const result = await saveEmbeddedUnsavedChanges();

    expect(popupSave).toHaveBeenCalledTimes(1);
    expect(documentSave).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('also skips a non-embedded entry with no saver at all, without treating it as a refusal', async () => {
    // `embedded` defaults to false when the 4th arg is omitted — the pre-ETP-5332 call shape
    // every non-popup DetailView still uses. A missing saver on a SKIPPED entry must not be
    // read as "cannot save this", or every ordinary window behind a popup would block finish.
    setUnsavedChanges('document-behind-popup', true, undefined, false);
    const popupSave = vi.fn().mockResolvedValue(true);
    setUnsavedChanges('popup-form', true, popupSave, true);

    const result = await saveEmbeddedUnsavedChanges();

    expect(result).toBe(true);
    expect(popupSave).toHaveBeenCalledTimes(1);
  });

  it('stops at the first refusal among embedded entries, without calling a later one', async () => {
    const firstSave = vi.fn().mockResolvedValue(false);
    const secondSave = vi.fn().mockResolvedValue(true);
    setUnsavedChanges('popup-form-1', true, firstSave, true);
    setUnsavedChanges('popup-form-2', true, secondSave, true);

    const result = await saveEmbeddedUnsavedChanges();

    expect(result).toBe(false);
    expect(firstSave).toHaveBeenCalledTimes(1);
    expect(secondSave).not.toHaveBeenCalled();
  });

  it('resolves true with zero embedded entries, even when non-embedded entries are dirty', async () => {
    // Must not error, or misreport, just because `dirtyForms` is non-empty — it is simply
    // not this function's job to touch any of those entries.
    setUnsavedChanges('document-behind-popup', true, vi.fn().mockResolvedValue(true), false);

    const result = await saveEmbeddedUnsavedChanges();

    expect(result).toBe(true);
  });

  it('resolves true with a totally empty registry', async () => {
    const result = await saveEmbeddedUnsavedChanges();
    expect(result).toBe(true);
  });

  it('an embedded entry still counts for hasUnsavedChanges (beforeunload/locale-switch guard)', () => {
    setUnsavedChanges('popup-form', true, vi.fn(), true);
    expect(hasUnsavedChanges()).toBe(true);
  });
});

describe('beforeunload guard', () => {
  let uninstall;

  beforeEach(() => {
    resetUnsavedChangesForTests();
    uninstall?.();
    uninstall = installUnloadGuard();
  });

  it('does not block the unload when there is nothing unsaved', () => {
    const event = fireBeforeUnload();
    expect(event.defaultPrevented).toBe(false);
  });

  it('blocks the unload when a form is dirty', () => {
    setUnsavedChanges('form-a', true);
    const event = fireBeforeUnload();
    expect(event.defaultPrevented).toBe(true);
  });

  it('stays silent for a reload we perform ourselves after the user confirmed', () => {
    // The language switch already asked in our own dialog; a second native prompt on top
    // of that answer is the bug this suppression exists to prevent.
    setUnsavedChanges('form-a', true);
    suppressNextUnloadPrompt();
    const event = fireBeforeUnload();
    expect(event.defaultPrevented).toBe(false);
  });

  it('suppression applies ONCE and does not leak into a later unload', () => {
    setUnsavedChanges('form-a', true);
    suppressNextUnloadPrompt();
    fireBeforeUnload();
    const second = fireBeforeUnload();
    expect(second.defaultPrevented).toBe(true);
  });

  it('stops guarding after cleanup', () => {
    uninstall();
    uninstall = undefined;
    setUnsavedChanges('form-a', true);
    const event = fireBeforeUnload();
    expect(event.defaultPrevented).toBe(false);
  });
});
