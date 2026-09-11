import { beforeEach, describe, expect, it } from 'vitest';
import {
  assertInternalPath,
  formatDomForAgent,
  inspectInteractiveDom,
  interactWithDom,
  resolveWindowPath,
} from '../useAiCopilotChat.js';
import {
  AmbiguousWindowError,
  UnknownWindowError,
  buildWindowRouteIndex,
  knownWindowSlugs,
  normalizeWindowKey,
} from '../windowRoutes.js';

// Shape of the access-filtered groups AppLayout hands the CopilotProvider.
const MENU_GROUPS = [
  {
    group: 'Sales',
    items: [
      { name: 'sales-order', label: 'Order', favname: 'Sales Order', windowId: '143' },
      { name: 'goods-shipment', label: 'Shipment', favname: 'Goods Shipment', windowId: '169' },
    ],
  },
  { group: 'People', items: [{ name: 'contacts', label: 'Contacts', favname: 'Contacts', windowId: '123' }] },
];

const ES_MENU_LABELS = {
  'Sales Order': 'Pedido de Venta',
  'Goods Shipment': 'Albarán de Venta',
};
const translateMenu = key => ES_MENU_LABELS[key] ?? key;
const routeIndex = buildWindowRouteIndex(MENU_GROUPS, translateMenu);

describe('useAiCopilotChat client tool path policy', () => {
  it('allows internal application paths', () => {
    expect(assertInternalPath('/sales-order/new')).toBe('/sales-order/new');
  });

  it('rejects external and protocol-relative paths', () => {
    expect(() => assertInternalPath('https://example.com')).toThrow();
    expect(() => assertInternalPath('//example.com')).toThrow();
    expect(() => assertInternalPath('sales-order/new')).toThrow();
  });

  it('resolves an explicit path unchanged', () => {
    expect(resolveWindowPath('/goods-shipment', routeIndex)).toBe('/goods-shipment');
    expect(resolveWindowPath('/sales-order/new', routeIndex)).toBe('/sales-order/new');
  });

  it('resolves a window the user names in English, in Spanish, or as a slug', () => {
    expect(resolveWindowPath('Sales Order', routeIndex)).toBe('/sales-order');
    expect(resolveWindowPath('sales order', routeIndex)).toBe('/sales-order');
    expect(resolveWindowPath('sales-order', routeIndex)).toBe('/sales-order');
    expect(resolveWindowPath('Pedido de Venta', routeIndex)).toBe('/sales-order');
  });

  it('resolves a plural or accent-free spelling of a translated label', () => {
    // ETP-5064: the regression the hardcoded alias table used to cover for
    // goods documents only — now it comes from the menu for every window.
    expect(resolveWindowPath('Albaranes de Venta', routeIndex)).toBe('/goods-shipment');
    expect(resolveWindowPath('albaran de venta', routeIndex)).toBe('/goods-shipment');
  });

  it('sends a URL or a scheme to the security guard, never to the name lookup', () => {
    // A path claim must be judged as one. Falling through to the index would
    // report "https://evil.example" as a mere unknown window and lose the
    // security signal entirely.
    for (const hostile of ['https://example.com/phish', '//evil.host', 'javascript:alert(1)']) {
      expect(() => resolveWindowPath(hostile, routeIndex))
        .toThrow('Only internal application paths are allowed');
    }
  });

  it('reports an unresolved name as recoverable, not as a rejected external path', () => {
    // Conflating the two is what made the agent tell the user navigation was
    // unavailable and to use the menu by hand.
    let error;
    try {
      resolveWindowPath('External Window', routeIndex);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(UnknownWindowError);
    expect(error.message).not.toContain('Only internal application paths');
    expect(error.message).toContain('/sales-order');
  });

  it('reports a missing path as unresolved instead of throwing the security error', () => {
    // `open_form` used to make `path` optional and guess it from the message
    // text; a miss reached assertInternalPath(null) and raised the external-URL
    // error for what was only a resolution failure.
    expect(() => resolveWindowPath(undefined, routeIndex)).toThrow(UnknownWindowError);
  });

  it('refuses a window absent from the access-filtered menu', () => {
    const restricted = buildWindowRouteIndex(
      [{ group: 'People', items: [{ name: 'contacts', favname: 'Contacts' }] }],
      translateMenu
    );
    expect(resolveWindowPath('Contacts', restricted)).toBe('/contacts');
    expect(() => resolveWindowPath('Sales Order', restricted)).toThrow(UnknownWindowError);
  });

  it('refuses to guess a label shared by several windows', () => {
    // The real menu labels Sales Order and Purchase Order both "Order"
    // ("Pedido" in Spanish) — 11 such clashes exist. Picking one silently
    // would navigate to the wrong document.
    const ambiguous = buildWindowRouteIndex(
      [{
        group: 'Documents',
        items: [
          { name: 'sales-order', label: 'Order', favname: 'Sales Order' },
          { name: 'purchase-order', label: 'Order', favname: 'Purchase Order' },
        ],
      }],
      key => key
    );
    expect(resolveWindowPath('Sales Order', ambiguous)).toBe('/sales-order');
    expect(resolveWindowPath('Purchase Order', ambiguous)).toBe('/purchase-order');
    let error;
    try {
      resolveWindowPath('Order', ambiguous);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(AmbiguousWindowError);
    expect(error.candidates).toEqual(['purchase-order', 'sales-order']);
    expect(error.message).toContain('/purchase-order');
  });

  it('lets a window keep its own slug when another window uses it as a label', () => {
    // "Sales Order" folds onto the sales-order slug itself, which is canonical:
    // quick-order-sales carrying that label cannot make the slug ambiguous.
    const shadowed = buildWindowRouteIndex(
      [{
        group: 'Documents',
        items: [
          { name: 'sales-order', label: 'Order' },
          { name: 'quick-order-sales', label: 'Sales Order' },
        ],
      }],
      key => key
    );
    expect(resolveWindowPath('sales-order', shadowed)).toBe('/sales-order');
    expect(resolveWindowPath('Sales Order', shadowed)).toBe('/sales-order');
    expect(resolveWindowPath('quick order sales', shadowed)).toBe('/quick-order-sales');
  });

  it('states navigation is unavailable while no window is reachable yet', () => {
    // useRoleMenu() still in flight: the sidebar hides AD-backed items and so
    // does the index, so the agent must not route anywhere.
    const empty = buildWindowRouteIndex([], translateMenu);
    expect(knownWindowSlugs(empty)).toEqual([]);
    expect(() => resolveWindowPath('Sales Order', empty))
      .toThrow(/no reachable windows/);
  });
});

describe('window reference normalization', () => {
  it('folds case, accents, punctuation and plurals to one key', () => {
    expect(normalizeWindowKey('Albaranes de Venta')).toBe(normalizeWindowKey('albarán de venta'));
    expect(normalizeWindowKey('  Sales Order  ')).toBe(normalizeWindowKey('sales-order'));
  });

  it('returns an empty key for a non-string reference', () => {
    expect(normalizeWindowKey(null)).toBe('');
    expect(normalizeWindowKey(undefined)).toBe('');
  });

  it('keeps distinct windows distinct', () => {
    expect(normalizeWindowKey('Sales Order')).not.toBe(normalizeWindowKey('Purchase Order'));
  });
});

describe('browser DOM tools', () => {
  beforeEach(() => {
    document.body.innerHTML = '<button aria-label="Open form">Open</button><input placeholder="Search" />';
    for (const element of document.body.children) {
      element.getBoundingClientRect = () => ({ width: 100, height: 20 });
    }
  });

  it('returns temporary IDs for visible interactive elements without field values', () => {
    const registry = new Map();
    const snapshot = inspectInteractiveDom(document, registry);
    expect(snapshot.elements.map(element => element.elementId)).toEqual(['dom-1', 'dom-2']);
    expect(snapshot.elements[0].name).toBe('Open form');
    expect(snapshot.elements[1]).not.toHaveProperty('value');
    expect(registry.size).toBe(2);
  });

  it('interacts with a previously inspected text field', () => {
    const registry = new Map();
    inspectInteractiveDom(document, registry);
    const input = document.querySelector('input');
    interactWithDom(registry, { elementId: 'dom-2', action: 'fill', value: 'albaranes' });
    expect(input.value).toBe('albaranes');
  });

  it('formats the DOM snapshot as direct model context', () => {
    expect(formatDomForAgent({
      url: '/sales-invoice/1',
      title: 'Sales Invoice',
      elements: [{ elementId: 'dom-1', role: 'button', name: 'Send reminder' }],
    })).toContain('Send reminder');
  });
});
