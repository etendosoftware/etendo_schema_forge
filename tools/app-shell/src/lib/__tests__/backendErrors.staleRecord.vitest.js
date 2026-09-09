// ETP-5073 / DOC-04 — the lines sidebar does not go through the concurrency-conflict dialog the
// main form uses; it renders the server's message verbatim. Two small changes make that message
// legible: DetailView now passes `ui` into extractErrorMessage (it was omitted, so the helper fell
// back to English), and the conflict wording is mapped here.
//
// Observed before the fix: the sidebar showed the bare string "OBJSON_StaleDate".

import { describe, it, expect } from 'vitest';
import { translateBackendError } from '../backendErrors.js';

const KEYS = { 'backendError.staleRecord': 'Alguien más modificó este registro' };
const t = (key) => KEYS[key] ?? key;

describe('translateBackendError — concurrency conflict', () => {
  it('translates the message Etendo GO sends for a stale write', () => {
    const msg = 'This record was modified by someone else after you read it. '
      + 'Your changes were not saved.';
    expect(translateBackendError(msg, t)).toBe(KEYS['backendError.staleRecord']);
  });

  it("also translates core's own wording", () => {
    // Still reachable on any write that does not go through NeoCrudHandler's pre-check.
    const msg = 'The record you are saving has already been changed by another user or process. '
      + 'Cancel your changes and refresh the data by clicking the refresh button.';
    expect(translateBackendError(msg, t)).toBe(KEYS['backendError.staleRecord']);
  });

  it('tolerates surrounding whitespace, as the map lookup trims', () => {
    const msg = '  This record was modified by someone else after you read it. '
      + 'Your changes were not saved.  ';
    expect(translateBackendError(msg, t)).toBe(KEYS['backendError.staleRecord']);
  });

  it('keeps the original when the translation is missing, never showing a raw key', () => {
    const msg = 'This record was modified by someone else after you read it. '
      + 'Your changes were not saved.';
    expect(translateBackendError(msg, (key) => key)).toBe(msg);
  });

  it('leaves an unrelated backend message alone', () => {
    expect(translateBackendError('Some other failure', t)).toBe('Some other failure');
  });
});
