// ETP-5073 / DOC-04 — the prompt shown when the server refuses a save because somebody else
// changed the record.
//
// This started as a toast and had to become a dialog: sonner renders action buttons inline with
// the message, so two labels as long as these squeezed the text into a one-character-wide column
// (seen in a real run). Shortening the labels would have hidden the symptom — the real mismatch is
// that this is a blocking decision with a destructive option, which is dialog-shaped.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  openSaveConflict, subscribeSaveConflict, dismissSaveConflict,
  refreshFromSaveConflict, canRefreshFromSaveConflict, resetSaveConflictForTests,
} from '../saveConflict.js';

describe('save-conflict prompt', () => {
  beforeEach(() => resetSaveConflictForTests());

  it('opens the prompt and reports that it was shown', () => {
    const listener = vi.fn();
    subscribeSaveConflict(listener);
    expect(openSaveConflict({ onRefresh: vi.fn() })).toBe(true);
    expect(listener).toHaveBeenCalledWith(true);
  });

  it('reports NOT shown when no host is mounted, so the caller can fall back', () => {
    // The caller falls back to a toast on false. Silence is the one outcome this ticket removes,
    // so "no host" must never mean "the user is not told".
    expect(openSaveConflict({ onRefresh: vi.fn() })).toBe(false);
  });

  it('runs the refresh handler when the user chooses to discard and refresh', () => {
    const onRefresh = vi.fn();
    const listener = vi.fn();
    subscribeSaveConflict(listener);
    openSaveConflict({ onRefresh });
    refreshFromSaveConflict();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(false);
  });

  it('does nothing on cancel — nothing was written, so the edits stay the user\'s', () => {
    const onRefresh = vi.fn();
    subscribeSaveConflict(vi.fn());
    openSaveConflict({ onRefresh });
    dismissSaveConflict();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('cannot run the refresh twice, nor after a cancel', () => {
    const onRefresh = vi.fn();
    subscribeSaveConflict(vi.fn());
    openSaveConflict({ onRefresh });
    refreshFromSaveConflict();
    refreshFromSaveConflict();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    openSaveConflict({ onRefresh });
    dismissSaveConflict();
    refreshFromSaveConflict();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('reports whether a refresh is available, so the dialog can hide a dead button', () => {
    subscribeSaveConflict(vi.fn());
    openSaveConflict({});
    expect(canRefreshFromSaveConflict()).toBe(false);
    dismissSaveConflict();
    openSaveConflict({ onRefresh: vi.fn() });
    expect(canRefreshFromSaveConflict()).toBe(true);
  });

  it('unsubscribes cleanly, restoring the not-shown answer', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSaveConflict(listener);
    unsubscribe();
    expect(openSaveConflict({ onRefresh: vi.fn() })).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });
});
