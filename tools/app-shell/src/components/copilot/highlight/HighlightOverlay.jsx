import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useUI } from '@/i18n';
import { useHighlight } from './HighlightContext.jsx';
import { positionHighlightNote } from './highlightTarget.js';

const RING_PADDING = 4;

const CONTROL_CLASS = 'rounded px-2 py-1 text-xs font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-40';

function readRect(element) {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

/**
 * The arrow shortcuts are bound on `window`, so they must never steal a key
 * from whatever the user is actually typing in: inside a text field or a
 * combobox the arrows move the caret or the selection, and that always wins.
 */
function isEditableTarget(node) {
  if (!node || typeof node.closest !== 'function') return false;
  return Boolean(node.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"]'));
}

/**
 * Visual half of `highlight_element`: a ring around the element the Copilot is
 * talking about, plus the model's explanation in a small popover.
 *
 * The ring never intercepts pointer events, so the user keeps using the app
 * while the Copilot points at it — this tool explains, it never acts.
 *
 * Rendered through a portal on document.body at the global-tool tier (z-70,
 * see docs/ui-design-guidelines.md) so it can point at a field inside a modal.
 */
export function HighlightOverlay() {
  const ui = useUI();
  const {
    element, note, stepIndex, stepCount, hasNext, hasPrevious, next, previous, clearHighlight,
  } = useHighlight();
  const [rect, setRect] = useState(null);
  const [noteBox, setNoteBox] = useState({ width: 0, height: 0 });
  const noteRef = useRef(null);

  const measure = useCallback(() => {
    if (!element || !element.isConnected) {
      setRect(null);
      return;
    }
    setRect(readRect(element));
  }, [element]);

  useLayoutEffect(() => {
    if (!element) {
      setRect(null);
      return undefined;
    }
    element.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    measure();
    // `scroll` is captured so a highlighted field inside any scroll container —
    // not just the window — keeps its ring aligned.
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [element, measure]);

  useLayoutEffect(() => {
    const node = noteRef.current;
    if (!node) return;
    const { width, height } = node.getBoundingClientRect();
    setNoteBox(current => (current.width === width && current.height === height
      ? current
      : { width, height }));
    // stepIndex/stepCount matter because the footer changes the popover height
    // even when the note text happens to be identical between two steps.
  }, [note, rect, stepIndex, stepCount]);

  useEffect(() => {
    if (!element) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        clearHighlight();
        return;
      }
      // Arrows only, and only while a script is running: Enter is deliberately
      // NOT bound — the overlay lives for the whole session, and hijacking
      // Enter would swallow form submits happening underneath it.
      if (stepCount <= 1 || event.defaultPrevented || isEditableTarget(event.target)) return;
      if (event.key === 'ArrowRight' && hasNext) {
        event.preventDefault();
        next();
      } else if (event.key === 'ArrowLeft' && hasPrevious) {
        event.preventDefault();
        previous();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [element, clearHighlight, stepCount, hasNext, hasPrevious, next, previous]);

  if (!element || !rect || typeof document === 'undefined') return null;

  // A script always shows the popover, even for a step the model left without
  // a note: the navigation controls are the only way out of it.
  const isScript = stepCount > 1;
  const showNote = Boolean(note) || isScript;
  const notePosition = showNote
    ? positionHighlightNote(rect, noteBox, { width: window.innerWidth, height: window.innerHeight })
    : null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-70" data-testid="copilot-highlight-overlay">
      <div
        aria-hidden="true"
        data-testid="copilot-highlight-ring"
        className="absolute rounded-md ring-2 ring-accent-highlight ring-offset-2 ring-offset-background bg-accent-highlight/10 motion-safe:transition-all motion-safe:duration-200"
        style={{
          top: rect.top - RING_PADDING,
          left: rect.left - RING_PADDING,
          width: rect.width + RING_PADDING * 2,
          height: rect.height + RING_PADDING * 2,
        }}
      />
      {showNote ? (
        <div
          ref={noteRef}
          role="status"
          aria-live="polite"
          aria-label={ui('copilotHighlightNoteLabel')}
          data-testid="copilot-highlight-note"
          className="pointer-events-auto absolute max-w-xs rounded-lg border border-border bg-popover p-3 pr-8 text-sm text-popover-foreground shadow-lg"
          style={{ top: notePosition.top, left: notePosition.left }}
        >
          {note}
          {isScript ? (
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-2">
              <span data-testid="copilot-highlight-progress" className="text-xs text-muted-foreground">
                {ui('walkthroughStepCounter', { current: stepIndex + 1, total: stepCount })}
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={previous}
                  disabled={!hasPrevious}
                  data-testid="copilot-highlight-previous"
                  className={CONTROL_CLASS}
                >
                  {ui('walkthroughPrevious')}
                </button>
                <button
                  type="button"
                  onClick={hasNext ? next : clearHighlight}
                  data-testid="copilot-highlight-next"
                  className={CONTROL_CLASS}
                >
                  {hasNext ? ui('walkthroughNext') : ui('walkthroughFinish')}
                </button>
              </span>
            </div>
          ) : null}
          <button
            type="button"
            onClick={clearHighlight}
            title={ui('copilotHighlightDismiss')}
            aria-label={ui('copilotHighlightDismiss')}
            data-testid="copilot-highlight-dismiss"
            className="absolute right-1 top-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
