import { expect } from 'vitest';
import regen from '../../../../../cli/config/regen-windows.json';
import { collectAllowedIds } from '../../lib/menuTree.js';

// Reviewed product navigation baseline, NOT generated from menu.json. Keep only
// membership, location and permission intent here; labels/icons/order stay free.
// Sources: docs/generated-custom-windows/INDEX.md and each window's guide;
// runtime-routes.jsx for synthetic destinations. Additions/removals need review.
const groups = {
  // ETP-5190 — ungated, like Home: the checklist is every tenant's landing page,
  // so menu.json declares it with no windowId and no capability.
  'First Steps': 'first-steps',
  Home: 'dashboard',
  People: 'contacts',
  Sales: 'sales-quotation sales-order goods-shipment sales-invoice return-material-receipt',
  Purchases: 'purchase-order goods-receipt purchase-invoice return-to-vendor-shipment matched-purchase-invoices',
  Inventory: 'product product-category physical-inventory goods-movements internal-consumption warehouse report-viewer-inventory',
  Finance: 'payment-in payment-out financial-account chart-of-accounts cost-center service-project general-ledger-configuration calendar assets asset-group amortization not-posted-documents simple-g-l-journal fiscal-monitor conversion-rates fiscal-models tax tax-category report-viewer-finance',
  Connections: 'authorize',
  Settings: 'organization document-sequence price-list payment-term business-partner-category user roles smart-scan fiscal-config',
};

// Composition aliases documented in calendar/fiscal-monitor/fiscal-config guides.
const aliases = { calendar: 'fiscal-calendar', 'fiscal-monitor': 'sii-monitor', 'fiscal-config': 'sii-config' };
const exceptions = {
  dashboard: {},
  'first-steps': {},
  authorize: {},
  roles: { capability: 'isAdminOrClientAdmin' },
  // Tax Report AD window: core-maps/ad-menu-cache.json (typed window entry),
  // app-shell-functional-flows.md, "Role-gated custom pages".
  'fiscal-models': { windowId: '3E8FEA1EA7404D979306C9EE7FD2E7E8' },
  // OBUIAPP permission documented in app-shell-functional-flows.md. The AD
  // cache omits this namespace; its "Not Posted Documents" row has null IDs.
  'not-posted-documents': { obuiappProcessId: 'D6AB95CE52D34E1599590526115E26C6' },
  // Independent content gates: ReportViewerPage.jsx and SmartScanPage.jsx.
  'report-viewer-finance': { accessWindowId: 'D647D118F5014D00AF47A636B2CD0DD3', path: 'report-viewer?category=finance' },
  'report-viewer-inventory': { accessWindowId: '6346B88619F948F9A42224BDB0B239FA', path: 'report-viewer?category=inventory' },
  'smart-scan': { accessWindowId: '33705E0F52874D91B0BB2FF8BB648B8E' },
};

export const defaultNavigation = Object.entries(groups).flatMap(([group, names]) => names.split(' ').map(name => {
  if (Object.hasOwn(exceptions, name)) return { name, group, path: name, ...exceptions[name] };
  const source = regen.windows.find(window => window.name === (aliases[name] || name));
  if (!source?.windowId) throw new Error(`Missing independent window identity for ${name}`);
  return { name, group, path: name, windowId: source.windowId };
}));

// Optional intent: SideMenu's PROOF_OF_CONCEPT_MENU, registry's Marketplace
// unlock, and apps-registry.js's two SDK apps. These are not default entitlements.
export const optionalNavigation = [
  { name: 'quick-sales-order', group: 'Proof of Concept', path: 'quick-sales-order', proof: true },
  { name: 'quick-purchase-order', group: 'Proof of Concept', path: 'quick-purchase-order', proof: true },
  { name: 'app-store', group: 'Marketplace', path: 'app-store', marketplace: true },
  { name: 'spike-hello-app', group: 'Marketplace', path: 'spike-hello-app', marketplace: true, app: 'spike-hello-app' },
  { name: 'quick-order-sales', group: 'Sales', path: 'quick-order-sales', app: 'quick-order' },
  { name: 'quick-order-purchase', group: 'Purchases', path: 'quick-order-purchase', app: 'quick-order' },
];

// Hidden/route-only entries from the functional guides and current product
// exclusions. App Store is classified above, not permanently hidden.
export const hiddenNavigation = 'business-partner deal activity lead hr employee absence report-viewer-purchases warehouse-storage-bins project time-tracking document match-rule fiscal-calendar open-close-period-control recurring-invoice oauth2-clients'.split(' ');

export const navigationProfiles = [
  { label: 'default', apps: [], marketplace: false, proof: false },
  { label: 'proof enabled', apps: [], marketplace: false, proof: true },
  { label: 'Marketplace unlocked without apps', apps: [], marketplace: true, proof: false },
  { label: 'Quick Order installed with Marketplace locked', apps: ['quick-order'], marketplace: false, proof: false },
  { label: 'Hello installed with Marketplace locked', apps: ['spike-hello-app'], marketplace: false, proof: false },
  { label: 'all optional entries enabled', apps: ['quick-order', 'spike-hello-app'], marketplace: true, proof: true },
];

export function expectedNavigation({ apps = [], marketplace = false, proof = false } = {}) {
  return [...defaultNavigation, ...optionalNavigation.filter(entry =>
    (!entry.proof || proof) && (!entry.marketplace || marketplace) && (!entry.app || apps.includes(entry.app)))];
}

// Build typed identities FIRST, then use the same flattening boundary as the
// role-menu hook. Never union raw cache IDs: window 800001 (Service Project)
// collides with the unrelated General Ledger Report process 800001 there.
export function navigationPermissions(entries = defaultNavigation, tier = 'full') {
  return {
    allowedIds: collectAllowedIds(entries.map(({ windowId, processId, obuiappProcessId }) => ({ windowId, processId, obuiappProcessId }))),
    windowAccess: Object.fromEntries(entries.filter(entry => entry.accessWindowId).map(entry => [entry.accessWindowId, tier])),
    capabilities: Object.fromEntries(entries.filter(entry => entry.capability).map(entry => [entry.capability, true])),
  };
}

// Exact named membership (including duplicates), groups and destinations, not
// circular counts. Used by registry and AppLayout against real built groups.
export function expectNavigation(groups, expected) {
  const actual = groups.flatMap(group => group.items.map(item => ({ name: item.name, group: group.group, path: item.path || item.name })));
  const byName = (a, b) => a.name.localeCompare(b.name);
  expect(actual.sort(byName)).toEqual(expected.map(({ name, group, path }) => ({ name, group, path })).sort(byName));
}
