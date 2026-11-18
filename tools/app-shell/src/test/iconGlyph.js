import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Finds the rendered Phosphor icon of a given kind inside `root`.
 *
 * lucide stamped every svg with a `lucide-<name>` class that tests could query; Phosphor adds
 * no class, so an icon is recognised by its glyph instead: the `d` of its first path, which is
 * unique per icon and weight.
 *
 * @param {ParentNode} root element to search in
 * @param {import('react').ComponentType} Icon the Phosphor icon component (e.g. `CaretDownIcon`)
 * @param {string} [weight] weight the icon is drawn with (default `regular`)
 * @returns {SVGElement|null}
 */
export function findIcon(root, Icon, weight = 'regular') {
  const glyph = renderToStaticMarkup(createElement(Icon, { weight })).match(/<path[^>]*\sd="([^"]+)"/)?.[1];
  return [...root.querySelectorAll('svg')].find(svg => svg.querySelector('path')?.getAttribute('d') === glyph) ?? null;
}
