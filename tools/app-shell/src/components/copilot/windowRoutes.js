/**
 * Window-route resolution for the Copilot browser tools.
 *
 * The agent refers to a window the way the user does — "sales order",
 * "Pedido de Venta" — while the router only knows slugs. The index is built
 * from the SAME menu groups the sidebar renders, which `AppLayout` has already
 * passed through `filterMenuGroupsByAccess()`, so the agent can only reach
 * windows this role is granted and the index needs no hardcoded alias table.
 * The previous table covered only Goods Receipt and Goods Shipment, so
 * "llevame a sales order" failed even though `/sales-order` was a perfectly
 * navigable route.
 *
 * Reading the filtered groups rather than `menu.json` also fails closed: while
 * `useRoleMenu()` is still in flight the sidebar hides every AD-backed item,
 * and so does this index — the agent reports it cannot navigate instead of
 * routing to a window the role may not have.
 *
 * Failing to resolve a name is NOT the same failure as rejecting an external
 * URL: the first is recoverable by the model (it can retry `navigate_to` with
 * an explicit path), the second is a security boundary. They therefore raise
 * distinct errors — reusing one message for both is what made the agent
 * conclude navigation was forbidden and tell the user to open the menu by hand.
 */

/**
 * Fold a window reference into a comparable key: accent-free, punctuation-free
 * and singular.
 *
 * The plural rule is deliberately crude ("sales" folds to "sal"), which is
 * harmless because index keys and lookups both pass through here — the pair
 * still matches. It is what lets "albaranes de venta" reach the "Albarán de
 * Venta" entry.
 */
export function normalizeWindowKey(value) {
  if (typeof value !== 'string') return '';
  const slug = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) return '';
  return slug
    .split('-')
    .map(token => token.replace(/(?:es|s)$/, ''))
    .filter(Boolean)
    .join('-');
}

/**
 * Reference -> slug lookup that refuses to guess.
 *
 * Menu labels are not unique: "Order" is the short label of both Sales Order
 * and Purchase Order, and "Albaran" of both goods documents — 11 such clashes
 * across today's menu. A first-writer-wins map would silently send the user to
 * the wrong window, which is worse than an error, so a clashing key is
 * withdrawn and remembered as ambiguous instead.
 *
 * A window's own slug is canonical and never withdrawn: slugs are unique and
 * must keep resolving even if another window's label folds onto them.
 */
export class WindowRouteIndex {
  #routes = new Map();
  #canonical = new Set();
  #ambiguous = new Map();

  add(reference, slug, { canonical = false } = {}) {
    const key = normalizeWindowKey(reference);
    if (!key || !slug) return;

    if (canonical) {
      this.#routes.set(key, slug);
      this.#canonical.add(key);
      this.#ambiguous.delete(key);
      return;
    }
    if (this.#canonical.has(key)) return;

    const clashing = this.#ambiguous.get(key);
    if (clashing) {
      clashing.add(slug);
      return;
    }
    const existing = this.#routes.get(key);
    if (existing === undefined) {
      this.#routes.set(key, slug);
      return;
    }
    if (existing === slug) return;
    this.#routes.delete(key);
    this.#ambiguous.set(key, new Set([existing, slug]));
  }

  /** The slug for a normalized key, or `undefined` when unknown or ambiguous. */
  get(key) {
    return this.#routes.get(key);
  }

  /** Slugs competing for a normalized key; `[]` when it is not ambiguous. */
  candidatesFor(key) {
    return [...(this.#ambiguous.get(key) ?? [])].sort();
  }

  /** Every window reachable through this index, sorted. */
  slugs() {
    const fromClashes = [...this.#ambiguous.values()].flatMap(set => [...set]);
    return [...new Set([...this.#routes.values(), ...fromClashes])].sort();
  }
}

/**
 * Map every known reference of every reachable menu window to its slug.
 *
 * @param {Array<{items?: Array<object>}>} [menuGroups] — the access-filtered
 *   groups the sidebar renders (`filterMenuGroupsByAccess()` output). Windows
 *   absent from it are absent from the index, by design.
 * @param {(key: string) => string} [translate] — the active locale's menu
 *   label resolver (`useMenuLabel()`), so the name the user actually reads on
 *   screen resolves too. Defaults to identity, which keeps the index usable
 *   outside a LocaleProvider.
 */
export function buildWindowRouteIndex(menuGroups = [], translate = key => key) {
  const index = new WindowRouteIndex();
  const items = (menuGroups ?? []).flatMap(group => group?.items ?? []).filter(item => item?.name);

  // Slugs first and as one pass: a canonical key must already be claimed
  // before any other window's label can compete for it.
  for (const item of items) index.add(item.name, item.name, { canonical: true });
  for (const item of items) {
    index.add(item.label, item.name);
    index.add(item.favname, item.name);
    index.add(translate(item.favname || item.label || item.name), item.name);
    index.add(translate(item.label || item.name), item.name);
  }

  return index;
}

/** Distinct slugs in the index, sorted — the hint handed back to the model. */
export function knownWindowSlugs(index) {
  return index?.slugs?.() ?? [];
}

/**
 * A window reference the index could not resolve. Recoverable: the message
 * tells the model how to retry, and `stopWhen: stepCountIs(8)` in the BFF
 * leaves it room to do so.
 */
export class UnknownWindowError extends Error {
  constructor(reference, index) {
    const slugs = knownWindowSlugs(index);
    super([
      `Unknown window reference ${JSON.stringify(reference)}.`,
      'Retry with an explicit internal path built from a known window slug,',
      'for example /sales-order or /sales-order/new.',
      slugs.length
        ? `Windows reachable by this user: ${slugs.join(', ')}.`
        : 'This user currently has no reachable windows, so navigation is unavailable.',
    ].filter(Boolean).join(' '));
    this.name = 'UnknownWindowError';
    this.reference = reference;
  }
}

/**
 * A reference matching more than one reachable window. Recoverable too, but
 * the model must pick — or ask the user — rather than be sent anywhere.
 */
export class AmbiguousWindowError extends Error {
  constructor(reference, candidates) {
    super([
      `Ambiguous window reference ${JSON.stringify(reference)}.`,
      `It matches ${candidates.length} windows: ${candidates.map(slug => `/${slug}`).join(', ')}.`,
      'Retry with one of those exact paths, or ask the user which one they mean.',
    ].join(' '));
    this.name = 'AmbiguousWindowError';
    this.reference = reference;
    this.candidates = candidates;
  }
}
