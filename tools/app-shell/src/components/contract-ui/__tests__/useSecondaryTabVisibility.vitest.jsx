// @covers tools/app-shell/src/components/contract-ui/useSecondaryTabVisibility.js
// @covers tools/app-shell/src/hooks/useCurrencyId.jsx
import { renderHook } from '@testing-library/react';

const orgCurrencyRef = vi.hoisted(() => ({ current: null }));
vi.mock('@/hooks/useCurrencyId.jsx', () => ({ useCurrencyId: () => orgCurrencyRef.current }));

import {
  useSecondaryTabVisibility,
  useRevealedTabFetch,
  useActiveTabResolver,
} from '../useSecondaryTabVisibility.js';

const foreign = (record, ctx) =>
  ctx['OrgCurrencyId'] != null &&
  ((record['currency'] != null && record['currency'] !== '') && record['currency'] !== ctx['OrgCurrencyId']);

describe('useSecondaryTabVisibility', () => {
  beforeEach(() => { orgCurrencyRef.current = null; });

  it('prefers the live editing record over the saved one', () => {
    const hook = { editing: { id: '1', currency: 'USD' }, selected: { id: '1', currency: 'EUR' } };
    const { result } = renderHook(() => useSecondaryTabVisibility({ hook, orgCurrencyCode: 'EUR' }));
    expect(result.current.record.currency).toBe('USD');
  });

  it('falls back to selected when there is no editing record, and is undefined with neither', () => {
    const sel = { id: '1' };
    expect(renderHook(() => useSecondaryTabVisibility({ hook: { selected: sel }, orgCurrencyCode: 'EUR' })).result.current.record).toBe(sel);
    expect(renderHook(() => useSecondaryTabVisibility({ hook: {}, orgCurrencyCode: 'EUR' })).result.current.record).toBeUndefined();
  });

  it('exposes OrgCurrencyId null while loading, then the resolved id and code', () => {
    const hook = { editing: {} };
    const { result, rerender } = renderHook(() => useSecondaryTabVisibility({ hook, orgCurrencyCode: 'EUR' }));
    expect(result.current.ctx).toEqual({ OrgCurrencyId: null, OrgCurrencyCode: 'EUR' });
    orgCurrencyRef.current = '102';
    rerender();
    expect(result.current.ctx).toEqual({ OrgCurrencyId: '102', OrgCurrencyCode: 'EUR' });
  });

  it('keeps ctx referentially stable while the ids do not change, and changes it when they do', () => {
    orgCurrencyRef.current = '102';
    const { result, rerender } = renderHook(
      ({ hook }) => useSecondaryTabVisibility({ hook, orgCurrencyCode: 'EUR' }),
      { initialProps: { hook: { editing: { currency: 'A' } } } },
    );
    const first = result.current.ctx;
    rerender({ hook: { editing: { currency: 'B' } } });
    expect(result.current.ctx).toBe(first);
    orgCurrencyRef.current = '103';
    rerender({ hook: { editing: { currency: 'B' } } });
    expect(result.current.ctx).not.toBe(first);
  });
});

describe('useRevealedTabFetch', () => {
  const ratesTab = { key: 'exchangeRates', visibleWhen: foreign };
  const notesTab = { key: 'notes' };
  const ctxLoading = { OrgCurrencyId: null };
  const ctxEur = { OrgCurrencyId: 'EUR' };
  let hooks;
  beforeEach(() => {
    hooks = [{ fetchChildren: vi.fn() }, { fetchChildren: vi.fn() }];
  });

  const setup = (initial) => renderHook(
    (p) => useRevealedTabFetch({
      secondaryTabs: [ratesTab, notesTab], secondaryHooks: hooks, capabilities: {}, ...p,
    }),
    { initialProps: initial },
  );

  it('does not fetch on the first render even when the tab is already visible', () => {
    setup({ vis: { record: { currency: 'USD' }, ctx: ctxEur }, selectedId: 'inv1' });
    expect(hooks[0].fetchChildren).not.toHaveBeenCalled();
  });

  it('force-fetches the revealed tab exactly once when ctx resolves for a saved record', () => {
    const { rerender } = setup({ vis: { record: { currency: 'USD' }, ctx: ctxLoading }, selectedId: 'inv1' });
    rerender({ vis: { record: { currency: 'USD' }, ctx: ctxEur }, selectedId: 'inv1' });
    expect(hooks[0].fetchChildren).toHaveBeenCalledTimes(1);
    expect(hooks[0].fetchChildren).toHaveBeenCalledWith('inv1', { force: true });
    expect(hooks[1].fetchChildren).not.toHaveBeenCalled();
    rerender({ vis: { record: { currency: 'USD' }, ctx: { ...ctxEur } }, selectedId: 'inv1' });
    expect(hooks[0].fetchChildren).toHaveBeenCalledTimes(1);
  });

  it('does not fetch when there is no selected id (unsaved record)', () => {
    const { rerender } = setup({ vis: { record: { currency: '' }, ctx: ctxEur }, selectedId: undefined });
    rerender({ vis: { record: { currency: 'USD' }, ctx: ctxEur }, selectedId: undefined });
    expect(hooks[0].fetchChildren).not.toHaveBeenCalled();
  });

  it('does not fetch when the tab becomes hidden, nor re-fetch an already visible one', () => {
    const { rerender } = setup({ vis: { record: { currency: 'USD' }, ctx: ctxEur }, selectedId: 'inv1' });
    rerender({ vis: { record: { currency: 'EUR' }, ctx: ctxEur }, selectedId: 'inv1' });
    expect(hooks[0].fetchChildren).not.toHaveBeenCalled();
  });

  it('ignores tabs without visibleWhen and tolerates a missing hook entry', () => {
    hooks = [];
    const { rerender } = setup({ vis: { record: { currency: 'USD' }, ctx: ctxLoading }, selectedId: 'inv1' });
    expect(() => rerender({ vis: { record: { currency: 'USD' }, ctx: ctxEur }, selectedId: 'inv1' })).not.toThrow();
  });

  it('a throwing predicate never reveals the tab', () => {
    const bad = { key: 'bad', visibleWhen: () => { throw new Error('x'); } };
    const fetchChildren = vi.fn();
    const { rerender } = renderHook(
      (p) => useRevealedTabFetch({ secondaryTabs: [bad], secondaryHooks: [{ fetchChildren }], capabilities: {}, ...p }),
      { initialProps: { vis: { record: {}, ctx: ctxLoading }, selectedId: 'a' } },
    );
    rerender({ vis: { record: {}, ctx: ctxEur }, selectedId: 'a' });
    expect(fetchChildren).not.toHaveBeenCalled();
  });
});

describe('useActiveTabResolver', () => {
  const t = (...keys) => keys.map(key => ({ key }));

  function setup(initialTabs, initialActive) {
    const state = { active: initialActive };
    const setActiveTab = vi.fn((n) => { state.active = n; });
    const hook = renderHook(
      ({ tabs }) => useActiveTabResolver(tabs, state.active, setActiveTab),
      { initialProps: { tabs: initialTabs } },
    );
    return { state, setActiveTab, hook };
  }

  it('keeps "others" active when a tab appears before it (index follows the key)', () => {
    const { state, setActiveTab, hook } = setup(t('lines', 'others'), 1);
    hook.rerender({ tabs: t('lines', 'exchangeRates', 'others') });
    expect(setActiveTab).toHaveBeenCalledWith(2);
    expect(state.active).toBe(2);
  });

  it('keeps "others" active when a tab before it hides', () => {
    const { setActiveTab, hook } = setup(t('lines', 'exchangeRates', 'others'), 2);
    hook.rerender({ tabs: t('lines', 'others') });
    expect(setActiveTab).toHaveBeenCalledWith(1);
  });

  it('falls back to the first tab when the active tab itself disappears', () => {
    const { setActiveTab, hook } = setup(t('lines', 'exchangeRates', 'others'), 1);
    hook.rerender({ tabs: t('lines', 'others') });
    expect(setActiveTab).toHaveBeenCalledWith(0);
  });

  it('does not revert a plain user click (signature unchanged)', () => {
    const { state, setActiveTab, hook } = setup(t('lines', 'others'), 0);
    state.active = 1; // user clicks "others"
    hook.rerender({ tabs: t('lines', 'others') });
    expect(setActiveTab).not.toHaveBeenCalled();
    // a later signature change follows the clicked tab, not the original one
    hook.rerender({ tabs: t('lines', 'exchangeRates', 'others') });
    expect(setActiveTab).toHaveBeenCalledWith(2);
  });

  it('user click in the same render as a signature change is not reverted', () => {
    const { state, setActiveTab, hook } = setup(t('lines', 'others'), 0);
    state.active = 1; // user clicks while a tab appears before the active one
    hook.rerender({ tabs: t('exchangeRates', 'custom', 'lines', 'others') });
    expect(setActiveTab).not.toHaveBeenCalled();
    expect(state.active).toBe(1);
  });

  it('clamps an out-of-range index to the first tab when the signature changed and a click moved it', () => {
    const { state, setActiveTab, hook } = setup(t('lines', 'exchangeRates', 'others'), 0);
    state.active = 2;
    hook.rerender({ tabs: t('lines') });
    expect(setActiveTab).toHaveBeenCalledWith(0);
  });

  it('does nothing when the index is already right after a signature change', () => {
    const { setActiveTab, hook } = setup(t('lines', 'others'), 0);
    hook.rerender({ tabs: t('lines', 'others', 'extra') });
    expect(setActiveTab).not.toHaveBeenCalled();
  });

  it('tolerates an empty tab list', () => {
    const { setActiveTab, hook } = setup([], 0);
    hook.rerender({ tabs: t('lines') });
    expect(setActiveTab).not.toHaveBeenCalled();
  });
});

describe('useCurrencyId re-export (hooks/useCurrencyId.jsx)', () => {
  it('is the core hook, exposed from its own module', async () => {
    const actual = await vi.importActual('@/hooks/useCurrencyId.jsx');
    const core = await vi.importActual('@etendosoftware/app-shell-core/hooks/useCurrency.jsx');
    expect(typeof actual.useCurrencyId).toBe('function');
    expect(actual.useCurrencyId).toBe(core.useCurrencyId);
  });
});
