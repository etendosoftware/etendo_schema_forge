import { useUI } from '@/i18n';

/**
 * ETP-6103 — the loading text of a picker that is holding its list until the committed value is
 * located and centred (see `useLocateCommittedValue`). Zero-height and sticky, so it overlays the
 * hidden rows without taking layout space and stays in view if the panel scrolls.
 */
export function LocatingNotice({ "data-testid": testId }) {
  const ui = useUI();
  return (
    <div className="sticky top-0 h-0 z-10" role="status" aria-live="polite" data-testid={testId}>
      <div className="flex justify-center py-6 text-xs text-muted-foreground">{ui('loading')}</div>
    </div>
  );
}

/** Scroll class of a picker's listbox: locked while the list is held, so hidden rows cannot scroll. */
export function locatingOverflowClass(locating) {
  return locating ? 'overflow-hidden' : 'overflow-auto';
}

/** Class of the rows of a held list: laid out (so the value can be centred) but not painted. */
export function locatingRowsClass(locating) {
  return locating ? 'invisible' : undefined;
}

export default LocatingNotice;
