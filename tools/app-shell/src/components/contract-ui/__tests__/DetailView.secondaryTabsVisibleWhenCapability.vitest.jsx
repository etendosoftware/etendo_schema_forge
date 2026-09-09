// ETP-5116 — secondaryTabs.visibleWhenCapability gating, mirroring the
// field-level visibleWhenCapability pattern (ETP-4520). buildInitialTabs
// (detailViewHelpers.jsx, re-exported from DetailView.jsx) is the derived,
// render-facing tab list that feeds both the tab-strip nav (`tabs.map` in
// DetailView.jsx) and the `openSecondaryTab` deep-link lookup
// (`tabs.findIndex(tab => tab.key === targetTabKey)`) — filtering a
// capability-hidden secondaryTab out of THIS list (not `secondaryTabs`
// itself) hides it from the nav strip and makes the deep-link a no-op,
// without disturbing index-based (`secondaryHooks[i]`) or key-based
// (`secondaryTabs.find`) lookups elsewhere in DetailView that still index
// into the original, untouched `secondaryTabs` array.
import { describe, it, expect, vi } from 'vitest';
import { buildInitialTabs } from '../DetailView.jsx';

describe('buildInitialTabs — visibleWhenCapability gating (ETP-5116)', () => {
  const baseParams = (overrides = {}) => ({
    secondaryHooks: [{ children: [] }, { children: [] }],
    panelCounts: {},
    DetailTable: null,
    detailLabel: null,
    detailEntity: null,
    hook: {},
    detailTabIndex: undefined,
    detailTabOrder: undefined,
    CustomLines: null,
    customLinesLabel: null,
    customLinesCount: null,
    customTabsAfterBottom: false,
    tabCustomTabs: [],
    ui: (k) => k,
    customTabCounts: {},
    customTabVisibility: {},
    ...overrides,
  });

  it('includes a secondaryTab with no visibleWhenCapability declared (no regression)', () => {
    const secondaryTabs = [{ key: 'accounting', label: 'Accounting' }];
    const tabs = buildInitialTabs(baseParams({ secondaryTabs, capabilities: {} }));
    expect(tabs.map((t) => t.key)).toEqual(['accounting']);
  });

  it('excludes a secondaryTab whose visibleWhenCapability is not granted', () => {
    const secondaryTabs = [{ key: 'accounting', label: 'Accounting', visibleWhenCapability: 'showAccountingFields' }];
    const tabs = buildInitialTabs(baseParams({ secondaryTabs, capabilities: { showAccountingFields: false } }));
    expect(tabs.map((t) => t.key)).toEqual([]);
  });

  it('excludes a secondaryTab whose visibleWhenCapability is not present in the map at all (fail-closed)', () => {
    const secondaryTabs = [{ key: 'accounting', label: 'Accounting', visibleWhenCapability: 'showAccountingFields' }];
    const tabs = buildInitialTabs(baseParams({ secondaryTabs, capabilities: {} }));
    expect(tabs.map((t) => t.key)).toEqual([]);
  });

  it('includes a secondaryTab whose visibleWhenCapability IS granted', () => {
    const secondaryTabs = [{ key: 'accounting', label: 'Accounting', visibleWhenCapability: 'showAccountingFields' }];
    const tabs = buildInitialTabs(baseParams({ secondaryTabs, capabilities: { showAccountingFields: true } }));
    expect(tabs.map((t) => t.key)).toEqual(['accounting']);
  });

  it('preserves the secondaryHooks index alignment for entries after a filtered-out tab', () => {
    // secondaryHooks[1] belongs to 'lines2' by POSITION in the original secondaryTabs
    // array, regardless of 'accounting' (index 0) being filtered out of the derived
    // tabs list — this guards against a naive .filter().map() that would have
    // re-indexed and silently pulled the wrong hook's child count.
    const secondaryTabs = [
      { key: 'accounting', label: 'Accounting', visibleWhenCapability: 'showAccountingFields' },
      { key: 'lines2', label: 'Lines 2' },
    ];
    const secondaryHooks = [{ children: [{ id: 'a' }] }, { children: [{ id: 'b' }, { id: 'c' }] }];
    const tabs = buildInitialTabs(baseParams({
      secondaryTabs, secondaryHooks, capabilities: { showAccountingFields: false },
    }));
    expect(tabs).toHaveLength(1);
    expect(tabs[0].key).toBe('lines2');
    expect(tabs[0].count).toBe(2);
  });

  it('mixed windows: only the gated tab is excluded, others render normally', () => {
    const secondaryTabs = [
      { key: 'customerAccounting', label: 'Customer Accounting', visibleWhenCapability: 'showAccountingFields' },
      { key: 'vendorAccounting', label: 'Vendor Accounting', visibleWhenCapability: 'showAccountingFields' },
      { key: 'notes', label: 'Notes' },
    ];
    const secondaryHooks = [{ children: [] }, { children: [] }, { children: [] }];
    const tabs = buildInitialTabs(baseParams({
      secondaryTabs, secondaryHooks, capabilities: { showAccountingFields: false },
    }));
    expect(tabs.map((t) => t.key)).toEqual(['notes']);
  });

  it('a missing capabilities map (undefined) fails closed for a gated tab but still renders an ungated one', () => {
    const secondaryTabs = [
      { key: 'accounting', label: 'Accounting', visibleWhenCapability: 'showAccountingFields' },
      { key: 'notes', label: 'Notes' },
    ];
    const tabs = buildInitialTabs(baseParams({ secondaryTabs, capabilities: undefined }));
    expect(tabs.map((t) => t.key)).toEqual(['notes']);
  });
});
