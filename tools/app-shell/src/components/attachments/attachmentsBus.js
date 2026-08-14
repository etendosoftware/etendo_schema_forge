import { useEffect, useRef } from 'react';

/**
 * Cross-view invalidation for a record's attachments.
 *
 * The same attachments are rendered by two independent components that each own
 * their state: the Attachments tab (`useAttachments`) and the OCR side panel
 * (`OcrSidePanel`). Both are mounted at once in form view — DetailView keeps
 * inactive tabs mounted — so a write through one left the other showing stale
 * data until the user navigated away and back (ETP-4855).
 *
 * They share a server store, not a client one, so the fix is a notification: a
 * writer announces the change, every other view of the same record reloads.
 * Same mechanism the OCR extraction flow already uses to cross component
 * boundaries (`window` CustomEvent).
 *
 * Writers must pass their own `source` so they do not react to their own write —
 * they have already applied it, optimistically or by reloading.
 */

export const ATTACHMENTS_CHANGED_EVENT = 'etgo:attachments-changed';

let sourceCounter = 0;

/** Stable per-view identity, so a view can ignore the events it emitted. */
export function newAttachmentsSource() {
  sourceCounter += 1;
  return `attachments-source-${sourceCounter}`;
}

/**
 * Announce that the set of attachments of (tableName, recordId) changed.
 * Call it only after the server confirmed the write.
 */
export function notifyAttachmentsChanged({ tableName, recordId, source = null } = {}) {
  if (typeof window === 'undefined' || !tableName || !recordId) return;
  window.dispatchEvent(
    new CustomEvent(ATTACHMENTS_CHANGED_EVENT, { detail: { tableName, recordId, source } }),
  );
}

/**
 * Run `onChange` when another view changes this record's attachments.
 *
 * `onChange` is read through a ref, so passing an inline closure does not
 * resubscribe on every render.
 */
export function useAttachmentsChanged({ tableName, recordId, source = null } = {}, onChange) {
  const handlerRef = useRef(onChange);
  useEffect(() => { handlerRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (typeof window === 'undefined' || !tableName || !recordId) return undefined;
    const listener = (event) => {
      const detail = event.detail || {};
      // Our own write — already reflected locally.
      if (source && detail.source === source) return;
      if (detail.tableName !== tableName) return;
      if (String(detail.recordId) !== String(recordId)) return;
      handlerRef.current?.();
    };
    window.addEventListener(ATTACHMENTS_CHANGED_EVENT, listener);
    return () => window.removeEventListener(ATTACHMENTS_CHANGED_EVENT, listener);
  }, [tableName, recordId, source]);
}
