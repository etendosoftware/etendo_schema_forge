import { escapeAttributeValue, isVisibleElement } from '../domVisibility.js';

/**
 * Resolve what `highlight_element` should point at.
 *
 * Two addressing modes, deliberately:
 *  - `fieldKey` — the stable contract key of a form field. It survives a
 *    re-render and a new `inspect_page_dom` snapshot, so it is what the model
 *    should prefer.
 *  - `elementId` — a positional `dom-N` handle from the last
 *    `inspect_page_dom` call, for anything that is not a field (a button, a
 *    tab, a menu item).
 *
 * Every thrown message is read by the MODEL, not by a human: it must say what
 * to do next, in the same voice as interactWithDom's own errors.
 *
 * @param {{ elementId?: string, fieldKey?: string }} target
 * @param {Map<string, Element>} registry — the dom-N registry filled by inspectInteractiveDom
 * @param {Document|Element} [root]
 * @returns {Element}
 */
export function resolveHighlightTarget({ elementId, fieldKey } = {}, registry, root = document) {
  // fieldKey wins on purpose: when the model sends both, the stable key is the
  // one that is still correct after a re-render.
  if (fieldKey) return resolveByFieldKey(fieldKey, root);
  if (elementId) return resolveByElementId(elementId, registry);
  throw new Error('highlight_element requires elementId or fieldKey');
}

function resolveByFieldKey(fieldKey, root) {
  let selector;
  try {
    selector = `[data-testid="field-${escapeAttributeValue(String(fieldKey))}"]`;
  } catch {
    throw new Error(`The fieldKey "${fieldKey}" is not a valid field key; call inspect_page_dom and use a fieldKey it reports`);
  }
  const element = root?.querySelector?.(selector);
  if (!element) {
    throw new Error(`No field named "${fieldKey}" is rendered on this page; call inspect_page_dom and use a fieldKey it reports`);
  }
  assertHighlightable(element);
  return element;
}

function resolveByElementId(elementId, registry) {
  const element = registry?.get?.(elementId);
  if (!element || !element.isConnected || !isVisibleElement(element)) {
    throw new Error('The elementId is unknown or the element is no longer visible; inspect the page again');
  }
  assertHighlightable(element);
  return element;
}

/**
 * A password field is never pointed at — the same exclusion setInputValue
 * enforces for writes. Highlighting one would draw a bystander's eye straight
 * to the credential the user is typing.
 */
function assertHighlightable(element) {
  if (element.matches?.('input[type="password"]')) {
    throw new Error('Password fields cannot be highlighted by the Copilot');
  }
  if (!element.isConnected || !isVisibleElement(element)) {
    throw new Error('That element is no longer visible; inspect the page again');
  }
}

/**
 * Place the explanation popover relative to the highlighted element.
 *
 * Pure geometry so it is unit-testable without a layout engine: the caller
 * measures, this decides. Preference is below the element; it flips above when
 * the note would fall off the bottom, and the horizontal position is clamped
 * into the viewport so a field at the right edge never pushes the note
 * off-screen.
 *
 * @param {{top:number,left:number,width:number,height:number}} rect — viewport rect of the target
 * @param {{width:number,height:number}} note — measured size of the popover
 * @param {{width:number,height:number}} viewport
 * @param {number} [gap] — space between element and popover
 * @returns {{top:number,left:number,placement:'above'|'below'}}
 */
export function positionHighlightNote(rect, note, viewport, gap = 8) {
  const margin = 8;
  const below = rect.top + rect.height + gap;
  const above = rect.top - note.height - gap;
  const fitsBelow = below + note.height + margin <= viewport.height;
  const placement = fitsBelow || above < margin ? 'below' : 'above';
  const top = placement === 'below' ? below : above;
  const maxLeft = Math.max(margin, viewport.width - note.width - margin);
  const left = Math.min(Math.max(rect.left, margin), maxLeft);
  return { top, left, placement };
}
