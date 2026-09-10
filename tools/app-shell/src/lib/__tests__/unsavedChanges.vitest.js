import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setUnsavedChanges,
  clearUnsavedChanges,
  hasUnsavedChanges,
  suppressNextUnloadPrompt,
  installUnloadGuard,
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
