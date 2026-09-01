import { useEffect, useId, useRef } from 'react';
import { setUnsavedChanges, clearUnsavedChanges } from '@/lib/unsavedChanges.js';

/**
 * Publish a form's unsaved-changes state to the global registry (ETP-5022), so the locale
 * switcher and the `beforeunload` guard can warn before throwing the page away.
 *
 * `useId` keys the entry per component instance, so two forms mounted at once (a record
 * plus a modal) never clobber each other. The cleanup runs on unmount and removes the
 * entry — a form that unmounts while dirty must NOT leave the app stuck in a dirty state,
 * or every later reload would prompt for changes that no longer exist.
 *
 * ETP-5073 adds the optional `save`: with it, the in-app navigation prompt can offer **Save and
 * continue** instead of only **Discard**, which is what acceptance criterion 2 ("asks to save or
 * discard") actually requires. Omitting it is still valid — the form blocks navigation and offers
 * Discard, which is the old behaviour plus the prompt.
 *
 * `save` is deliberately NOT in the dependency array: an inline arrow re-created every render
 * would re-register on every keystroke. The registry only ever calls the latest one it was
 * handed, and `isDirty` changing is what re-registers, so the saver cannot go stale in a way that
 * matters.
 *
 * @param {boolean} isDirty whether this form currently holds unsaved changes
 * @param {() => Promise<unknown>} [save] saves the form; resolves falsy when it refuses
 */
export function useUnsavedChangesGuard(isDirty, save) {
  const key = useId();
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    setUnsavedChanges(
      key,
      Boolean(isDirty),
      saveRef.current ? () => saveRef.current?.() : undefined,
    );
    return () => clearUnsavedChanges(key);
  }, [key, isDirty]);
}
