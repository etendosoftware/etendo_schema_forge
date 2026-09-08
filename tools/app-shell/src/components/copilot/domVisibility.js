/**
 * DOM inspection primitives shared by every Copilot browser tool.
 *
 * They live here — and not in useAiCopilotChat.js — because both the tool
 * dispatcher and the highlight resolver (copilot/highlight/highlightTarget.js)
 * need them: importing them from the hook would close an import cycle, and
 * copying them would let the two halves of `inspect_page_dom` ->
 * `highlight_element` disagree about what "visible" means.
 */

/**
 * A element is targetable only when it is actually painted. `aria-hidden`
 * subtrees count as invisible even when they have a box, because a screen
 * reader — and therefore the model's mental model of the page — cannot see
 * them either.
 *
 * @param {Element} element
 * @returns {boolean}
 */
export function isVisibleElement(element) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden'
    && rect.width > 0 && rect.height > 0 && !element.closest('[aria-hidden="true"]');
}

/**
 * Best-effort accessible name, in the order a user would read it.
 *
 * @param {Element} element
 * @returns {string}
 */
export function accessibleElementName(element) {
  const label = element.getAttribute('aria-label')
    || element.getAttribute('placeholder')
    || element.getAttribute('title');
  if (label) return label.trim();
  return (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

/**
 * Escape a value for use inside an attribute selector.
 *
 * `CSS.escape` is the correct tool but is absent from some test environments,
 * so fall back to rejecting anything that is not a plain identifier rather
 * than interpolating an unescaped value into a selector.
 *
 * @param {string} value
 * @returns {string} the escaped value
 * @throws {Error} when the value cannot be escaped safely
 */
export function escapeAttributeValue(value) {
  if (typeof value !== 'string' || !value) throw new Error('An attribute value is required');
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  if (!/^[\w.-]+$/.test(value)) throw new Error(`Unsupported value: ${value}`);
  return value;
}

/**
 * The label a human reads next to a field: its `<label for>`, its wrapping
 * label, or — failing both — whatever accessible name the control itself
 * carries. The model uses it to confirm it pointed at the right field.
 *
 * @param {Element} element
 * @returns {string}
 */
export function fieldAccessibleName(element) {
  const id = element.getAttribute('id');
  if (id) {
    try {
      const label = element.ownerDocument?.querySelector(`label[for="${escapeAttributeValue(id)}"]`);
      const text = label?.textContent?.replace(/\s+/g, ' ').trim();
      if (text) return text;
    } catch {
      // An id that cannot be escaped simply has no resolvable label.
    }
  }
  const wrapping = element.closest('label');
  const wrappingText = wrapping?.textContent?.replace(/\s+/g, ' ').trim();
  if (wrappingText) return wrappingText;
  return accessibleElementName(element);
}
