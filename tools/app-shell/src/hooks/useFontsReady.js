import { useEffect, useState } from 'react';

/**
 * ETP-5833 (QA) — one-shot flag that flips to true when `document.fonts.ready` resolves. Text
 * widths measured with canvas while Inter is still swapping in (`display=swap`) use the fallback
 * face, so any memo that measures text (DataTable's list header floor, the lines grid's
 * no-truncate column width — ETP-5133) depends on this flag to re-measure exactly once when the
 * real font is in. True from the start when the fonts are already loaded or the FontFaceSet API
 * is missing (jsdom, old browsers).
 */
export function useFontsReady() {
  const [ready, setReady] = useState(() => {
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    return !fonts?.ready || fonts.status === 'loaded';
  });
  useEffect(() => {
    if (ready) return undefined;
    let alive = true;
    document.fonts.ready.then(() => { if (alive) setReady(true); }, () => {});
    return () => { alive = false; };
  }, [ready]);
  return ready;
}
