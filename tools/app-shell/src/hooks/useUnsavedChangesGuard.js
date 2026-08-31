import { useEffect, useId } from 'react';
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
 * @param {boolean} isDirty whether this form currently holds unsaved changes
 */
export function useUnsavedChangesGuard(isDirty) {
  const key = useId();
  useEffect(() => {
    setUnsavedChanges(key, Boolean(isDirty));
    return () => clearUnsavedChanges(key);
  }, [key, isDirty]);
}
