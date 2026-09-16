/**
 * ETP-5254 — `lookupCreateTargets.js` is the single greppable scope switch for the
 * "create a record from inside a lookup" affordance. Everything it needs is derived from
 * the drawer's own `selectorUrl`, which is why none of the three lookup trigger components
 * had to change; these tests pin BOTH halves of that derivation:
 *
 *   1. `parseSelectorUrl` — the `{neoBaseUrl}/{spec}/{entity}/selectors/{column}` shape.
 *   2. `resolveLookupCreateTarget` — the allowlist gate plus the `apiBaseUrl` it builds.
 *
 * The allowlist is asserted exhaustively (all 7 entries) on purpose: dropping a spec from
 * it silently removes the button from that window with no other failing test.
 */
import { describe, expect, it } from 'vitest';
import productDecisions from '@generated/product/decisions.json';
// Read as TEXT rather than imported: `ProductPage.jsx` is the module the registry exists to
// avoid pulling in (DetailView, ListView, the sidebar, the price bar, the gallery). The drift
// guard only needs the literal it hands to DetailView.
import productPageSource from '@generated/product/generated/web/product/ProductPage.jsx?raw';
import {
  CREATE_PRODUCT_SPECS,
  LOOKUP_CREATE_TARGETS,
  parseSelectorUrl,
  resolveLookupCreateTarget,
} from '../lookupCreateTargets.js';

const ALLOWED_SPECS = [
  'sales-quotation',
  'sales-order',
  'purchase-order',
  'sales-invoice',
  'purchase-invoice',
  'goods-shipment',
  'goods-receipt',
];

// Specs that reach the very same default product drawer but must NOT offer creation.
const DENIED_SPECS = ['requisition', 'physical-inventory', 'goods-movements'];

describe('CREATE_PRODUCT_SPECS', () => {
  it('contains exactly the seven document specs that offer product creation', () => {
    expect([...CREATE_PRODUCT_SPECS].sort()).toEqual([...ALLOWED_SPECS].sort());
  });

  it('is the same Set the product target exposes as allowedSpecs', () => {
    expect(LOOKUP_CREATE_TARGETS.product.allowedSpecs).toBe(CREATE_PRODUCT_SPECS);
  });
});

describe('LOOKUP_CREATE_TARGETS.product', () => {
  it('declares the entity, i18n keys and a lazy form loader', () => {
    const target = LOOKUP_CREATE_TARGETS.product;
    expect(target.key).toBe('product');
    expect(target.entity).toBe('product');
    expect(target.ctaKey).toBe('createProduct');
    expect(target.titleKey).toBe('createProductTitle');
    expect(target.errorKey).toBe('createProductError');
    // Lazy on purpose — a document window must not pay for the Products form up front.
    expect(typeof target.loadForm).toBe('function');
  });

  it('prefills the name with the text typed in the lookup, and nothing when it is empty', () => {
    const { prefill } = LOOKUP_CREATE_TARGETS.product;
    expect(prefill('Agua')).toEqual({ name: 'Agua' });
    expect(prefill('')).toEqual({});
    expect(prefill(undefined)).toEqual({});
  });

  it('declares a lazy loader for the window field-label slice', () => {
    // Optional on the modal side (`target.loadLabels?.()`), but the product target must have
    // one: without it the product-only columns fall back to raw English AD labels inside a
    // document window, because WindowLoader only loaded the DOCUMENT's slice.
    expect(typeof LOOKUP_CREATE_TARGETS.product.loadLabels).toBe('function');
  });

  it('renders the form with the same column count and tab variant as the window', () => {
    const target = LOOKUP_CREATE_TARGETS.product;
    expect(target.cols).toBe(3);
    expect(target.tabsVariant).toBe('pill');
  });

  it('gives every tab a key, a label and the EntityForm section it renders', () => {
    // Tab key and form section are separate concepts — the modal indexes `activeTab` by KEY
    // and passes `section` to the embedded form.
    for (const tab of LOOKUP_CREATE_TARGETS.product.tabs) {
      expect(typeof tab.key).toBe('string');
      expect(typeof tab.label).toBe('string');
      expect(['principal', 'other']).toContain(tab.section);
    }
    expect(LOOKUP_CREATE_TARGETS.product.tabs.map(t => t.section)).toEqual(['principal', 'other']);
  });

  it('keeps the `other` tab, which is the only home of the required taxCategory', () => {
    expect(LOOKUP_CREATE_TARGETS.product.tabs.some(t => t.section === 'other')).toBe(true);
  });
});

/**
 * Drift guards.
 *
 * `labelOverrides` and `tabs` are hand-COPIES of `window.labelOverrides` / `window.primaryTabs`
 * in `artifacts/product/decisions.json`. The copy is deliberate — importing `ProductPage.jsx`
 * to read them would drag DetailView, ListView, the sidebar, the price bar and the gallery
 * into every document bundle — but a copy drifts silently, and the symptom (the popup saying
 * "Categoría del producto" where the window says "Categoría", or a tab whose caption no longer
 * matches) is cosmetic enough to survive review. So compare against the source of truth here.
 *
 * If one of these fails: fix the COPY in `lookupCreateTargets.js`, never `decisions.json` —
 * the window owns the values.
 */
describe('registry copies stay in sync with artifacts/product/decisions.json', () => {
  const windowDecisions = productDecisions.window;

  it('labelOverrides matches window.labelOverrides verbatim', () => {
    expect(LOOKUP_CREATE_TARGETS.product.labelOverrides).toEqual(windowDecisions.labelOverrides);
  });

  it('tabs mirror window.primaryTabs key-for-key and label-for-label', () => {
    // `section` is the modal's own addition and `panel` is the window's — compare the two
    // properties both sides genuinely share.
    const registry = LOOKUP_CREATE_TARGETS.product.tabs.map(({ key, label }) => ({ key, label }));
    const decisions = windowDecisions.primaryTabs.map(({ key, label }) => ({ key, label }));
    expect(registry).toEqual(decisions);
  });

  it('tabsVariant matches window.primaryTabsVariant', () => {
    expect(LOOKUP_CREATE_TARGETS.product.tabsVariant).toBe(windowDecisions.primaryTabsVariant);
  });
});

/**
 * The popup's second phase reuses the Products window's OWN bottom panels, so the registry's
 * `loadPostCreateTabs` is a second hand-copy — this time of the `customTabs` array
 * `ProductPage.jsx` hands to `DetailView`. Same drift risk, same guard.
 */
describe('post-create tabs mirror ProductPage customTabs', () => {
  // The whole `customTabs={[ … ]}` literal, as written in the generated page.
  const customTabsLiteral = /customTabs=\{(\[[\s\S]*?\])\}/.exec(productPageSource)?.[1];

  function matchAll(re) {
    return [...(customTabsLiteral ?? '').matchAll(re)].map(m => m[1]);
  }

  // `\b` before `key` is what keeps `labelKey:` out of this list: `lK` is a word-to-word
  // transition, so there is no boundary there.
  const pageKeys = matchAll(/\bkey:\s*'([^']+)'/g);
  const pageLabelKeys = matchAll(/labelKey:\s*'([^']+)'/g);

  it('finds the customTabs literal in the generated page', () => {
    // Guards the guard: a generator change that reshapes this prop must not silently turn
    // every assertion below into a comparison against an empty list.
    expect(customTabsLiteral, 'customTabs literal not found in ProductPage.jsx').toBeTruthy();
    expect(pageKeys.length).toBeGreaterThan(0);
  });

  it('exposes the same tab keys, in the same order, as the window', async () => {
    const tabs = await LOOKUP_CREATE_TARGETS.product.loadPostCreateTabs();
    expect(tabs.map(t => t.key)).toEqual(pageKeys);
  });

  it('exposes the same labelKeys as the window', async () => {
    const tabs = await LOOKUP_CREATE_TARGETS.product.loadPostCreateTabs();
    expect(tabs.map(t => t.labelKey)).toEqual(pageLabelKeys);
  });

  it('passes AttachmentsTab the same AD table name the window passes', async () => {
    const tabs = await LOOKUP_CREATE_TARGETS.product.loadPostCreateTabs();
    const attachments = tabs.find(t => t.key === 'attachments');
    const pageTableName = /tableName:\s*["']([^"']+)["']/.exec(customTabsLiteral)?.[1];
    expect(pageTableName).toBe('M_Product');
    expect(attachments.props).toEqual({ tableName: pageTableName, config: {} });
  });

  it('resolves a real component for every tab', async () => {
    const tabs = await LOOKUP_CREATE_TARGETS.product.loadPostCreateTabs();
    for (const tab of tabs) {
      expect(typeof tab.Component, `${tab.key} resolved no component`).toBe('function');
    }
  });

  it('deliberately omits Accounting', async () => {
    // Not an oversight: Accounting is a `secondaryTabs` entry, not a custom panel, so it
    // needs DetailView's per-tab useEntity machinery — and it is capability-gated behind
    // `showAccountingFields`. Tracked as debt; if it is ever added, this test is the place
    // that says so out loud.
    const tabs = await LOOKUP_CREATE_TARGETS.product.loadPostCreateTabs();
    expect(tabs.map(t => t.key)).not.toContain('accounting');
    // The two properties that justify the omission, read from the window's own config:
    // it is a secondary TABLE tab (not a custom panel) and it is capability-gated.
    const accounting = productDecisions.window.secondaryTabs?.accounting;
    expect(accounting, 'Accounting is no longer a secondaryTabs entry — revisit the omission')
      .toBeTruthy();
    expect(accounting.visibleWhenCapability).toBe('showAccountingFields');
  });

  it('is declared lazily so a document window does not pay for the panels up front', () => {
    expect(typeof LOOKUP_CREATE_TARGETS.product.loadPostCreateTabs).toBe('function');
  });
});

/**
 * Not a registry copy, but the same class of guard: a decision in the window that the popup's
 * behaviour is derived FROM rather than duplicated from.
 *
 * `RecordCreateModal`'s phase 2 commits each edited header field on blur. That is not a
 * bespoke choice — it is what the Products window itself does. If the window ever stops
 * autosaving, the popup silently stops matching it, and the person changing the window is
 * the one who needs to hear about it.
 */
describe('post-create blur-commit tracks the window own save behaviour', () => {
  it('the Products window autosaves on blur', () => {
    expect(
      productDecisions.window.autoSaveOnBlur,
      'the Products window no longer autosaves on blur — RecordCreateModal phase 2 still does',
    ).toBe(true);
  });
});

describe('parseSelectorUrl', () => {
  it('splits a selector URL into base, spec, entity and column', () => {
    expect(parseSelectorUrl('/sws/neo/sales-order/lines/selectors/product')).toEqual({
      neoBaseUrl: '/sws/neo',
      spec: 'sales-order',
      entity: 'lines',
      column: 'product',
    });
  });

  it('handles an absolute URL with host and context path', () => {
    expect(
      parseSelectorUrl('http://localhost:8080/etendo/neo/purchase-order/lines/selectors/product'),
    ).toEqual({
      neoBaseUrl: 'http://localhost:8080/etendo/neo',
      spec: 'purchase-order',
      entity: 'lines',
      column: 'product',
    });
  });

  it('stops the column at a query string or fragment', () => {
    expect(parseSelectorUrl('/sws/neo/sales-order/lines/selectors/product?limit=20').column)
      .toBe('product');
    expect(parseSelectorUrl('/sws/neo/sales-order/lines/selectors/product#frag').column)
      .toBe('product');
  });

  it('accepts the AD column-name form used by the invoice line tables', () => {
    expect(parseSelectorUrl('/sws/neo/sales-invoice/lines/selectors/M_Product_ID')).toEqual({
      neoBaseUrl: '/sws/neo',
      spec: 'sales-invoice',
      entity: 'lines',
      column: 'M_Product_ID',
    });
  });

  it.each([
    ['an empty string', ''],
    ['null', null],
    ['undefined', undefined],
    ['a URL with no /selectors/ segment', '/sws/neo/sales-order/lines/product'],
    ['a URL missing the spec and entity segments', '/selectors/product'],
    ['a URL with no column after /selectors/', '/sws/neo/sales-order/lines/selectors/'],
  ])('returns null for %s', (_label, url) => {
    expect(parseSelectorUrl(url)).toBeNull();
  });
});

describe('resolveLookupCreateTarget', () => {
  it.each(ALLOWED_SPECS)('resolves for the %s spec with the product apiBaseUrl', (spec) => {
    const target = resolveLookupCreateTarget({
      selectorUrl: `/sws/neo/${spec}/lines/selectors/product`,
      createEnabled: true,
    });
    expect(target).not.toBeNull();
    expect(target.apiBaseUrl).toBe('/sws/neo/product');
    expect(target.entity).toBe('product');
    expect(target.ctaKey).toBe('createProduct');
  });

  it.each(DENIED_SPECS)('returns null for the non-allowlisted %s spec', (spec) => {
    expect(resolveLookupCreateTarget({
      selectorUrl: `/sws/neo/${spec}/lines/selectors/product`,
      createEnabled: true,
    })).toBeNull();
  });

  it('returns null when createEnabled is false, even on an allowlisted spec', () => {
    expect(resolveLookupCreateTarget({
      selectorUrl: '/sws/neo/sales-order/lines/selectors/product',
      createEnabled: false,
    })).toBeNull();
  });

  it('defaults createEnabled to false, so an unaware caller never gets the affordance', () => {
    expect(resolveLookupCreateTarget({
      selectorUrl: '/sws/neo/sales-order/lines/selectors/product',
    })).toBeNull();
  });

  it.each([
    ['an empty selectorUrl', ''],
    ['a null selectorUrl', null],
    ['a malformed selectorUrl', '/sws/neo/sales-order'],
  ])('returns null for %s', (_label, selectorUrl) => {
    expect(resolveLookupCreateTarget({ selectorUrl, createEnabled: true })).toBeNull();
  });

  it('resolves when the column is the AD name M_Product_ID (invoice line tables)', () => {
    const target = resolveLookupCreateTarget({
      selectorUrl: '/sws/neo/purchase-invoice/lines/selectors/M_Product_ID',
      createEnabled: true,
    });
    expect(target?.apiBaseUrl).toBe('/sws/neo/product');
  });

  it('derives apiBaseUrl from the URL host and context path, not from a hardcoded root', () => {
    const target = resolveLookupCreateTarget({
      selectorUrl: 'http://localhost:8080/etendo/neo/goods-receipt/lines/selectors/product',
      createEnabled: true,
    });
    expect(target.apiBaseUrl).toBe('http://localhost:8080/etendo/neo/product');
  });

  it('passes the rendering contract through to the resolved target', () => {
    // The modal reads all of these off the resolved object, so a spread that dropped one
    // would degrade the popup silently (untranslated labels, wrong grid, one tab missing).
    const target = resolveLookupCreateTarget({
      selectorUrl: '/sws/neo/sales-order/lines/selectors/product',
      createEnabled: true,
    });
    expect(target.loadForm).toBe(LOOKUP_CREATE_TARGETS.product.loadForm);
    expect(target.loadLabels).toBe(LOOKUP_CREATE_TARGETS.product.loadLabels);
    expect(target.labelOverrides).toBe(LOOKUP_CREATE_TARGETS.product.labelOverrides);
    expect(target.tabs).toBe(LOOKUP_CREATE_TARGETS.product.tabs);
    expect(target.tabsVariant).toBe('pill');
    expect(target.cols).toBe(3);
  });

  it('returns a copy rather than mutating the registry entry', () => {
    const target = resolveLookupCreateTarget({
      selectorUrl: '/sws/neo/sales-order/lines/selectors/product',
      createEnabled: true,
    });
    expect(target).not.toBe(LOOKUP_CREATE_TARGETS.product);
    expect(LOOKUP_CREATE_TARGETS.product.apiBaseUrl).toBeUndefined();
  });
});
