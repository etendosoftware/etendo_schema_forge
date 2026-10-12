import { resolvePostedStatus, postedStatusLabel } from '@/lib/postedStatus.js';

/** An empty `posted` has never been posted: it reads as `N`, as it always has here. */
export function postedCode(posted) {
  return posted == null || posted === '' ? 'N' : posted;
}

/**
 * Text of a movement's posting status. `Y`/`N` keep this window's own wording; any other code
 * is the REASON a posting attempt failed ("Periodo cerrado", "Cuenta no válida"…) and is shown
 * as such — it used to read "Sin contabilizar", which made a failed posting look merely
 * pending (ETP-5647). Lives outside PostingStatusDot.jsx so the list can sort by exactly the text
 * the dot shows without importing the component.
 *
 * @param {string|undefined} posted raw `posted` code
 * @param {(key: string) => string} ui the `useUI()` translator
 */
export function postingStatusLabel(posted, ui) {
  const code = postedCode(posted);
  const reason = resolvePostedStatus('Posted', code);
  if (reason) return postedStatusLabel(reason, ui);
  return code === 'Y' ? ui('financeAccountMovementsPosted') : ui('financeAccountMovementsNotPosted');
}
