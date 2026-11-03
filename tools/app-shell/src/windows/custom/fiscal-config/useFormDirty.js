import { useEffect, useState } from 'react';

/**
 * Whether a section's form differs from the values it was seeded with, reported to the page
 * through `onDirtyChange` (ETP-5831: the page's "Guardar" is only enabled while something is
 * unsaved). Same mechanism as the Organization window's unsaved-changes banner
 * (`OrganizationPage.jsx` `seededBaseline`): the form is serialized once, at mount, and compared
 * against its current serialization.
 *
 * The baseline is the mount-time form: the page remounts the sections after a successful save
 * (`resetKey`), which reseeds it. On unmount the section reports itself clean — its unsaved
 * values are gone with it (e.g. switching the SII | TicketBAI tab unmounts the other section).
 *
 * @param {object} form the section's current form state
 * @param {(dirty: boolean) => void} [onDirtyChange] stable callback (useCallback / useMemo)
 * @returns {boolean} dirty
 */
export function useFormDirty(form, onDirtyChange) {
  const [baseline] = useState(() => JSON.stringify(form));
  const dirty = JSON.stringify(form) !== baseline;

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  return dirty;
}
