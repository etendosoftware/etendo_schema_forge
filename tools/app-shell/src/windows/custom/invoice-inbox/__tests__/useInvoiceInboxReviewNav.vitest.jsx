// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxReviewNav.js
// New file justification: no existing test covers the review panel's paging/focus hook;
// useInvoiceInboxList.vitest.jsx covers the list paging it consumes, not the panel walk.
import { useState } from 'react';
import { renderHook, act } from '@testing-library/react';
import { useInvoiceInboxReviewNav } from '../useInvoiceInboxReviewNav.js';

const row = (id, status = 'READY') => ({ id, status });

/**
 * Harness: the list state (rows, loading...) lives in the hook under test's host, and `loadMore`
 * flips `loading` in the same batch as the real list does, so the walk's "ask again" rule is
 * exercised as in production.
 */
function setup(initial = {}) {
  const loadMore = vi.fn();
  const onClosed = vi.fn();
  const list = {
    rows: [row('a'), row('b'), row('c')], hasMore: false, loading: false, loadError: false, serverTotal: null, ...initial,
  };
  const utils = renderHook(() => {
    const [state, setState] = useState(list);
    const nav = useInvoiceInboxReviewNav({
      ...state,
      loadMore: () => { loadMore(); setState((prev) => ({ ...prev, loading: true })); },
      onClosed,
    });
    return { ...nav, setList: (patch) => setState((prev) => ({ ...prev, ...patch })) };
  });
  return { ...utils, props: { loadMore, onClosed } };
}
/** The pending page arrives: `patch` is the new list state, `loading` goes false. */
const finishPage = (utils, patch = {}) => act(() => utils.result.current.setList({ loading: false, ...patch }));
const update = (utils, patch) => act(() => utils.result.current.setList(patch));

afterEach(() => { document.body.innerHTML = ''; });

describe('useInvoiceInboxReviewNav — opening and walking', () => {
  it('starts closed with no position', () => {
    const { result } = setup();
    expect(result.current).toMatchObject({ openId: null, position: null, canPrev: false, canNext: false, advancing: false });
  });

  it('open() sets the document and its position among the openable rows', () => {
    const { result } = setup();
    act(() => result.current.open(row('b')));
    expect(result.current).toMatchObject({ openId: 'b', position: 2, total: 3, canPrev: true, canNext: true });
  });

  it('a PROCESSING row does not open', () => {
    const { result } = setup();
    act(() => result.current.open(row('p', 'PROCESSING')));
    expect(result.current.openId).toBeNull();
    act(() => result.current.open(null));
    expect(result.current.openId).toBeNull();
  });

  it('prev / next walk the rows, skipping PROCESSING ones, and stop at the ends', () => {
    const { result } = setup({ rows: [row('a'), row('p', 'PROCESSING'), row('b'), row('c', 'ERROR')] });
    act(() => result.current.open(row('a')));
    expect(result.current.canPrev).toBe(false);
    act(() => result.current.goPrev());
    expect(result.current.openId).toBe('a');
    act(() => result.current.goNext());
    expect(result.current.openId).toBe('b');
    expect(result.current.position).toBe(2);
    expect(result.current.total).toBe(3);
    act(() => result.current.goNext());
    expect(result.current.openId).toBe('c');
    expect(result.current.canNext).toBe(false);
    act(() => result.current.goNext());
    expect(result.current.openId).toBe('c');
    act(() => result.current.goPrev());
    expect(result.current.openId).toBe('b');
  });

  it('position is null when the open document is not in the loaded rows', () => {
    const utils = setup();
    act(() => utils.result.current.open(row('b')));
    update(utils, { rows: [row('a'), row('c')] });
    expect(utils.result.current.position).toBeNull();
    expect(utils.result.current.canNext).toBe(false);
  });
});

describe('useInvoiceInboxReviewNav — total of "n de total"', () => {
  it('without more pages the total is the loaded openable rows, whatever the server counter says', () => {
    const { result } = setup({ rows: [row('a'), row('p', 'PROCESSING'), row('b')], hasMore: false, serverTotal: 99 });
    expect(result.current.total).toBe(2);
  });

  it('with more pages it is the server counter', () => {
    const { result } = setup({ hasMore: true, serverTotal: 130 });
    expect(result.current.total).toBe(130);
  });

  it('with more pages it is never below what is loaded', () => {
    const { result } = setup({ hasMore: true, serverTotal: 2 });
    expect(result.current.total).toBe(3);
  });

  it('with more pages and an unknown counter it falls back to the loaded openable rows', () => {
    expect(setup({ hasMore: true, serverTotal: null }).result.current.total).toBe(3);
    expect(setup({ hasMore: true, serverTotal: undefined }).result.current.total).toBe(3);
    expect(setup({ hasMore: true, serverTotal: NaN }).result.current.total).toBe(3);
  });
});

describe('useInvoiceInboxReviewNav — loading more at the end', () => {
  it('next at the last loaded row asks for the next page when more exist, and moves to its first openable row', () => {
    const utils = setup({ hasMore: true, serverTotal: 6 });
    act(() => utils.result.current.open(row('c')));
    expect(utils.result.current.canNext).toBe(true);
    act(() => utils.result.current.goNext());
    expect(utils.props.loadMore).toHaveBeenCalledTimes(1);
    expect(utils.result.current.advancing).toBe(true);
    expect(utils.result.current.openId).toBe('c');
    finishPage(utils, { rows: [row('a'), row('b'), row('c'), row('d'), row('e')], hasMore: false });
    expect(utils.result.current.openId).toBe('d');
    expect(utils.result.current.advancing).toBe(false);
    expect(utils.props.loadMore).toHaveBeenCalledTimes(1);
  });

  it('a page made only of PROCESSING rows keeps loading until an openable one arrives', () => {
    const utils = setup({ hasMore: true });
    act(() => utils.result.current.open(row('c')));
    act(() => utils.result.current.goNext());
    expect(utils.props.loadMore).toHaveBeenCalledTimes(1);
    finishPage(utils, { rows: [row('a'), row('b'), row('c'), row('p1', 'PROCESSING')], hasMore: true });
    expect(utils.props.loadMore).toHaveBeenCalledTimes(2);
    expect(utils.result.current.openId).toBe('c');
    expect(utils.result.current.advancing).toBe(true);
    finishPage(utils, { rows: [row('a'), row('b'), row('c'), row('p1', 'PROCESSING'), row('z')], hasMore: false });
    expect(utils.result.current.openId).toBe('z');
    expect(utils.props.loadMore).toHaveBeenCalledTimes(2);
  });

  it('a failed load stops the advance without asking again', () => {
    const utils = setup({ hasMore: true });
    act(() => utils.result.current.open(row('c')));
    act(() => utils.result.current.goNext());
    finishPage(utils, { loadError: true });
    expect(utils.result.current.advancing).toBe(false);
    expect(utils.props.loadMore).toHaveBeenCalledTimes(1);
    expect(utils.result.current.openId).toBe('c');
  });

  it('the end of the list (a page that brings nothing and no more pages) stops the advance', () => {
    const utils = setup({ hasMore: true });
    act(() => utils.result.current.open(row('c')));
    act(() => utils.result.current.goNext());
    finishPage(utils, { hasMore: false });
    expect(utils.result.current.advancing).toBe(false);
    expect(utils.props.loadMore).toHaveBeenCalledTimes(1);
    expect(utils.result.current.openId).toBe('c');
  });

  it('next does not request a page while the list is already loading or without more pages', () => {
    const loading = setup({ hasMore: true, loading: true });
    act(() => loading.result.current.open(row('c')));
    act(() => loading.result.current.goNext());
    expect(loading.props.loadMore).not.toHaveBeenCalled();
    const done = setup({ hasMore: false });
    act(() => done.result.current.open(row('c')));
    act(() => done.result.current.goNext());
    expect(done.props.loadMore).not.toHaveBeenCalled();
  });

  it('a second next while advancing does not request a second page', () => {
    const utils = setup({ hasMore: true });
    act(() => utils.result.current.open(row('c')));
    act(() => utils.result.current.goNext());
    act(() => utils.result.current.goNext());
    expect(utils.props.loadMore).toHaveBeenCalledTimes(1);
  });
});

describe('useInvoiceInboxReviewNav — closing', () => {
  it('onClosed receives every document visited since opening, once; then the visit set resets', () => {
    const { result, props } = setup();
    act(() => result.current.open(row('a')));
    act(() => result.current.goNext());
    act(() => result.current.goNext());
    act(() => result.current.goPrev());
    act(() => result.current.close());
    expect(result.current.openId).toBeNull();
    expect(props.onClosed).toHaveBeenCalledTimes(1);
    expect(props.onClosed.mock.calls[0][0].sort()).toEqual(['a', 'b', 'c']);
    act(() => result.current.open(row('c')));
    act(() => result.current.close());
    expect(props.onClosed).toHaveBeenLastCalledWith(['c']);
  });

  it('a silent close (discard already reloads the list) does not call onClosed', () => {
    const { result, props } = setup();
    act(() => result.current.open(row('a')));
    act(() => result.current.close({ silent: true }));
    expect(result.current.openId).toBeNull();
    expect(props.onClosed).not.toHaveBeenCalled();
  });

  it('closing a panel that never opened calls nothing', () => {
    const { result, props } = setup();
    act(() => result.current.close());
    expect(props.onClosed).not.toHaveBeenCalled();
  });

  it('closing cancels a pending advance', () => {
    const utils = setup({ hasMore: true });
    act(() => utils.result.current.open(row('c')));
    act(() => utils.result.current.goNext());
    expect(utils.result.current.advancing).toBe(true);
    act(() => utils.result.current.close());
    expect(utils.result.current.advancing).toBe(false);
  });
});

describe('useInvoiceInboxReviewNav — focus restore', () => {
  function mountRowWithPencil(id) {
    const tr = document.createElement('tr');
    tr.setAttribute('data-testid', `row-${id}`);
    tr.tabIndex = -1;
    const pencil = document.createElement('button');
    pencil.setAttribute('data-testid', `invoice-inbox-row-edit-${id}`);
    tr.appendChild(pencil);
    document.body.appendChild(tr);
    return { tr, pencil };
  }

  it('gives focus back to the focused element that opened the panel (the pencil)', () => {
    const { pencil } = mountRowWithPencil('a');
    pencil.focus();
    const { result } = setup();
    act(() => result.current.open(row('a')));
    document.body.focus();
    act(() => result.current.restoreFocus());
    expect(document.activeElement).toBe(pencil);
  });

  it('a row click (nothing focused) restores to the pencil of the clicked row', () => {
    const { pencil } = mountRowWithPencil('a');
    const { result } = setup();
    act(() => result.current.open(row('a')));
    act(() => result.current.restoreFocus());
    expect(document.activeElement).toBe(pencil);
  });

  it('falls back to the row itself when it has no pencil', () => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-testid', 'row-a');
    tr.tabIndex = -1;
    document.body.appendChild(tr);
    const { result } = setup();
    act(() => result.current.open(row('a')));
    act(() => result.current.restoreFocus());
    expect(document.activeElement).toBe(tr);
  });

  it('is skipped when the opener left the DOM', () => {
    const { tr, pencil } = mountRowWithPencil('a');
    const focus = vi.spyOn(pencil, 'focus');
    pencil.focus();
    const { result } = setup();
    act(() => result.current.open(row('a')));
    tr.remove();
    focus.mockClear();
    act(() => result.current.restoreFocus());
    expect(focus).not.toHaveBeenCalled();
  });

  it('restoring twice only focuses once (the opener is forgotten)', () => {
    const { pencil } = mountRowWithPencil('a');
    pencil.focus();
    const { result } = setup();
    act(() => result.current.open(row('a')));
    const focus = vi.spyOn(pencil, 'focus');
    act(() => result.current.restoreFocus());
    act(() => result.current.restoreFocus());
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('with no opener element at all, restoring does nothing and does not throw', () => {
    const { result } = setup();
    act(() => result.current.open(row('zzz')));
    expect(() => act(() => result.current.restoreFocus())).not.toThrow();
  });

  it('navigating with prev/next does not change the remembered opener', () => {
    const { pencil } = mountRowWithPencil('a');
    mountRowWithPencil('b');
    pencil.focus();
    const { result } = setup();
    act(() => result.current.open(row('a')));
    act(() => result.current.goNext());
    document.body.focus();
    act(() => result.current.restoreFocus());
    expect(document.activeElement).toBe(pencil);
  });
});
