/**
 * ETP-5108 — shared assertion helper for typography inheritance.
 *
 * The design system declares its typeface once, on `body` in the core's
 * styles.css, and every component inherits it. So "this text uses the design
 * system font" is really "nothing between this text and <body> declares a
 * font-family of its own". Computed styles cannot answer that in jsdom — the
 * suites run with `css: false`, so the core stylesheet is never loaded and
 * `getComputedStyle(...).fontFamily` is empty for every element, passing
 * vacuously. Walking the ancestor chain checks the actual mechanism instead.
 *
 * Used by both document-confirmation modal suites; keep it here rather than
 * duplicating the walk in each.
 */

/**
 * Every inline `font-family` declaration from `element` up to and including
 * `<body>`, as `tagName: value` strings. An empty array means the element
 * inherits the design system typeface intact.
 *
 * @param {Element} element - the node whose inherited typeface is in question
 * @returns {string[]} one entry per ancestor that overrides the family
 */
export function inlineFontFamiliesUpToBody(element) {
  const declarations = [];
  let node = element;
  while (node) {
    if (node.style?.fontFamily) {
      declarations.push(`${node.tagName.toLowerCase()}: ${node.style.fontFamily}`);
    }
    if (node === document.body) break;
    node = node.parentElement;
  }
  return declarations;
}
