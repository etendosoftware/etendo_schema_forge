// ETP-5073 / DOC-08 — the in-app navigation half of the unsaved-changes guard.
//
// ETP-5022 already covered F5, tab close and the language switch. What stayed broken: leaving a
// dirty form by navigating INSIDE the app (another window from the side menu, any navigate()
// call) discarded the edits with no prompt at all.
//
// react-router's own useBlocker is unavailable here — the app mounts a declarative
// <BrowserRouter> and v7 only serves useBlocker from a data router — so the interception happens
// at the navigation sources, all funnelled through this gate.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setUnsavedChanges, clearUnsavedChanges, hasUnsavedChanges, canSaveUnsavedChanges,
  saveUnsavedChanges, requestNavigation, requestTransition, subscribeNavigationPrompt,
  confirmPendingNavigation, cancelPendingNavigation, savePendingNavigation,
  resetUnsavedChangesForTests,
} from '../unsavedChanges.js';

describe('navigation gate', () => {
  beforeEach(() => resetUnsavedChangesForTests());

  it('navigates immediately when nothing is dirty', () => {
    const perform = vi.fn();
    subscribeNavigationPrompt(vi.fn());
    requestNavigation(perform);
    expect(perform).toHaveBeenCalledTimes(1);
  });

  it('holds the navigation and raises the prompt when a form is dirty', () => {
    const perform = vi.fn();
    const listener = vi.fn();
    subscribeNavigationPrompt(listener);
    setUnsavedChanges('form', true);
    requestNavigation(perform);
    expect(perform).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith(true);
  });

  it('fails OPEN with no dialog host mounted, so the app can never become unnavigable', () => {
    // A swallowed navigation would be a far worse bug than the one being fixed.
    const perform = vi.fn();
    setUnsavedChanges('form', true);
    requestNavigation(perform);
    expect(perform).toHaveBeenCalledTimes(1);
  });

  it('runs the held navigation on discard', () => {
    const perform = vi.fn();
    const listener = vi.fn();
    subscribeNavigationPrompt(listener);
    setUnsavedChanges('form', true);
    requestNavigation(perform);
    confirmPendingNavigation();
    expect(perform).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(false);
  });

  it('drops the held navigation on cancel, so the user stays on the form', () => {
    const perform = vi.fn();
    subscribeNavigationPrompt(vi.fn());
    setUnsavedChanges('form', true);
    requestNavigation(perform);
    cancelPendingNavigation();
    expect(perform).not.toHaveBeenCalled();
    // And a second answer cannot resurrect it.
    confirmPendingNavigation();
    expect(perform).not.toHaveBeenCalled();
  });

  it('saves and then navigates when the user picks Save', async () => {
    const perform = vi.fn();
    const save = vi.fn().mockResolvedValue({ id: 'saved' });
    subscribeNavigationPrompt(vi.fn());
    setUnsavedChanges('form', true, save);
    requestNavigation(perform);
    await expect(savePendingNavigation()).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(perform).toHaveBeenCalledTimes(1);
  });

  it('does NOT navigate when the save is refused by validation', async () => {
    // handleSave resolves null when it rejects the form. Navigating anyway would be the exact
    // data loss this guard exists to prevent.
    const perform = vi.fn();
    const save = vi.fn().mockResolvedValue(null);
    subscribeNavigationPrompt(vi.fn());
    setUnsavedChanges('form', true, save);
    requestNavigation(perform);
    await expect(savePendingNavigation()).resolves.toBe(false);
    expect(perform).not.toHaveBeenCalled();
  });

  it('closes the prompt even when the save was refused, so the error is readable', async () => {
    const listener = vi.fn();
    subscribeNavigationPrompt(listener);
    setUnsavedChanges('form', true, vi.fn().mockResolvedValue(null));
    requestNavigation(vi.fn());
    await savePendingNavigation();
    expect(listener).toHaveBeenLastCalledWith(false);
  });

  it('unsubscribes cleanly, restoring the fail-open behaviour', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeNavigationPrompt(listener);
    unsubscribe();
    const perform = vi.fn();
    setUnsavedChanges('form', true);
    requestNavigation(perform);
    expect(listener).not.toHaveBeenCalled();
    expect(perform).toHaveBeenCalledTimes(1);
  });
});

describe('saving every dirty form', () => {
  beforeEach(() => resetUnsavedChangesForTests());

  it('reports it cannot save when a dirty form registered no saver', () => {
    // e.g. LocationEditorModal, which registers dirtiness but has no save handle to offer.
    setUnsavedChanges('with-saver', true, vi.fn());
    setUnsavedChanges('without-saver', true);
    expect(canSaveUnsavedChanges()).toBe(false);
  });

  it('reports it can save when every dirty form has one', () => {
    setUnsavedChanges('a', true, vi.fn());
    setUnsavedChanges('b', true, vi.fn());
    expect(canSaveUnsavedChanges()).toBe(true);
  });

  it('is false when nothing is dirty — there is nothing to save', () => {
    expect(canSaveUnsavedChanges()).toBe(false);
  });

  it('stops at the first refusal instead of saving the rest', async () => {
    const first = vi.fn().mockResolvedValue(null);
    const second = vi.fn().mockResolvedValue({ id: 'x' });
    setUnsavedChanges('first', true, first);
    setUnsavedChanges('second', true, second);
    await expect(saveUnsavedChanges()).resolves.toBe(false);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('refuses outright when a dirty form cannot save itself', async () => {
    setUnsavedChanges('no-saver', true);
    await expect(saveUnsavedChanges()).resolves.toBe(false);
  });
});

describe('scoped save precedence over the global saver (ETP-5073)', () => {
  // guardLineSwitch (DetailView.jsx) is a SCOPED transition: switching lines endangers only the
  // line being edited, not the header. It must supply its own `save` so the prompt saves the
  // line, not every dirty form. These tests exercise the generic rule that makes that possible —
  // the caller-side bug that motivated them is documented separately below.
  beforeEach(() => resetUnsavedChangesForTests());

  it('runs only the transition-own saver, never the global one, when both are dirty', async () => {
    const perform = vi.fn();
    const headerSave = vi.fn().mockResolvedValue({ id: 'header' });
    const lineSave = vi.fn().mockResolvedValue({ id: 'line' });
    subscribeNavigationPrompt(vi.fn());
    setUnsavedChanges('header', true, headerSave);
    requestTransition(perform, { isDirty: () => true, save: lineSave });
    await expect(savePendingNavigation()).resolves.toBe(true);
    expect(lineSave).toHaveBeenCalledTimes(1);
    expect(headerSave).not.toHaveBeenCalled();
    expect(perform).toHaveBeenCalledTimes(1);
  });

  it('blocks the transition when the scoped saver is refused, without touching the global saver', async () => {
    const perform = vi.fn();
    const headerSave = vi.fn().mockResolvedValue({ id: 'header' });
    const lineSave = vi.fn().mockResolvedValue(null);
    subscribeNavigationPrompt(vi.fn());
    setUnsavedChanges('header', true, headerSave);
    requestTransition(perform, { isDirty: () => true, save: lineSave });
    await expect(savePendingNavigation()).resolves.toBe(false);
    expect(lineSave).toHaveBeenCalledTimes(1);
    expect(headerSave).not.toHaveBeenCalled();
    expect(perform).not.toHaveBeenCalled();
  });

  it('REGRESSION: a scoped transition with no `save` falls back to the GLOBAL saver — this is ' +
    'exactly why guardLineSwitch must always pass its own `save`', async () => {
    // Before the fix, guardLineSwitch called requestTransition(openLine, { isDirty }) — no
    // `save`. With the header ALSO dirty and registered with its own saver, savePendingNavigation
    // fell back to saveUnsavedChanges(), which saved the HEADER, reported success, and switched
    // lines — silently discarding the line edit the prompt existed to protect. This test proves
    // the module's fallback rule is correct behaviour by design: the defect was the caller
    // omitting `save`, not this fallback.
    const perform = vi.fn();
    const headerSave = vi.fn().mockResolvedValue({ id: 'header' });
    subscribeNavigationPrompt(vi.fn());
    setUnsavedChanges('header', true, headerSave);
    requestTransition(perform, { isDirty: () => true });
    await expect(savePendingNavigation()).resolves.toBe(true);
    expect(headerSave).toHaveBeenCalledTimes(1);
    expect(perform).toHaveBeenCalledTimes(1);
  });
});

describe('the dirty registry still behaves as ETP-5022 left it', () => {
  beforeEach(() => resetUnsavedChangesForTests());

  it('is keyed per form, so two mounted forms do not clobber each other', () => {
    setUnsavedChanges('record', true);
    setUnsavedChanges('modal', true);
    setUnsavedChanges('record', false);
    expect(hasUnsavedChanges()).toBe(true);
    setUnsavedChanges('modal', false);
    expect(hasUnsavedChanges()).toBe(false);
  });

  it('drops an entry on unmount, so a dirty form that unmounts does not wedge the app', () => {
    setUnsavedChanges('record', true);
    clearUnsavedChanges('record');
    expect(hasUnsavedChanges()).toBe(false);
  });
});
