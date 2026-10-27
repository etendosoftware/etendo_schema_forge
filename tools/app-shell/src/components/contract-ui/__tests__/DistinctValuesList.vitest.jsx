// @covers tools/app-shell/src/components/contract-ui/DistinctValuesList.jsx
import { useState } from 'react';
import { render, screen, act, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@etendosoftware/app-shell-core', () => ({
  useUI: () => (key) => key,
}));

import { DistinctValuesList } from '../DistinctValuesList.jsx';

const ALL = 'allStatuses';
const labelFor = (c) => `label-${c}`;

/**
 * Stateful harness: owns the search text like the caller's useDistinctValues hook does,
 * and exposes the spy so tests can assert what reaches the hook.
 */
function Harness({
  initialSearch = '',
  codes = ['DR', 'CO'],
  allLabel = ALL,
  activeCode = null,
  loading = false,
  onSelect = () => {},
  renderOption,
  setSearchSpy,
  withoutSetSearch = false,
}) {
  const [search, setSearch] = useState(initialSearch);
  const distinct = {
    values: codes.map((id) => ({ id })),
    loading,
    loadingMore: false,
    hasMore: false,
    search,
    loadMore: vi.fn(),
    ...(withoutSetSearch ? {} : { setSearch: (v) => { setSearchSpy?.(v); setSearch(v); } }),
  };
  return (
    <DistinctValuesList
      activeCode={activeCode}
      allLabel={allLabel}
      codes={codes}
      labelFor={labelFor}
      renderOption={renderOption}
      distinct={distinct}
      onSelect={onSelect}
      searchPlaceholder="searchStatuses"
    />
  );
}

const input = () => screen.getByRole('combobox');
const options = () => screen.getAllByRole('option');

describe('DistinctValuesList', () => {
  // Debounce tests switch to fake timers and drive the input with fireEvent: RTL's async
  // wrapper (used by userEvent) waits on a real setTimeout and hangs under vitest fake timers.
  afterEach(() => {
    vi.useRealTimers();
  });
  const type = (value) => fireEvent.change(input(), { target: { value } });

  const setupUser = () => userEvent.setup({ delay: null });

  describe('search row and no-results state', () => {
    it('renders the search icon, a borderless input and a separator', () => {
      render(<Harness />);
      expect(screen.getByTestId('Search__55c679')).toBeInTheDocument();
      expect(screen.getByTestId('distinct-values-separator')).toBeInTheDocument();
      expect(input()).toHaveClass('border-0', 'ring-0');
    });

    it('shows "no results" for a settled non-empty search with no codes, without the all row', () => {
      render(<Harness initialSearch="zzz" codes={[]} />);
      expect(screen.getByTestId('distinct-values-no-results')).toHaveTextContent('noResults');
      expect(screen.queryByText(ALL)).not.toBeInTheDocument();
      expect(screen.queryByText('—')).not.toBeInTheDocument();
      expect(screen.queryAllByRole('option')).toHaveLength(0);
    });

    it('does not flash "no results" before the debounce has settled', () => {
      vi.useFakeTimers();
      render(<Harness codes={[]} />);
      type('zz');
      act(() => { vi.advanceTimersByTime(299); });
      expect(screen.queryByTestId('distinct-values-no-results')).not.toBeInTheDocument();
      expect(screen.getByText(ALL)).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(1); });
      expect(screen.getByTestId('distinct-values-no-results')).toBeInTheDocument();
      expect(screen.queryByText(ALL)).not.toBeInTheDocument();
    });

    it('never shows "no results" while the backend is loading', () => {
      render(<Harness initialSearch="zzz" codes={[]} loading />);
      expect(screen.queryByTestId('distinct-values-no-results')).not.toBeInTheDocument();
      expect(screen.getByTestId('Loader2__55c679')).toBeInTheDocument();
    });

    it('shows only the all row for an empty search with no codes (a view with no records)', () => {
      render(<Harness codes={[]} />);
      expect(screen.getByText(ALL)).toBeInTheDocument();
      expect(screen.queryByTestId('distinct-values-no-results')).not.toBeInTheDocument();
      expect(options()).toHaveLength(1);
    });

    it('shows the all row plus the matches and no "no results" when there are matches', () => {
      render(<Harness initialSearch="d" codes={['DR']} />);
      expect(screen.getByText(ALL)).toBeInTheDocument();
      expect(screen.getByText('label-DR')).toBeInTheDocument();
      expect(screen.queryByTestId('distinct-values-no-results')).not.toBeInTheDocument();
    });

    it('hides "no results" immediately when the search is cleared', () => {
      render(<Harness initialSearch="zzz" codes={[]} />);
      expect(screen.getByTestId('distinct-values-no-results')).toBeInTheDocument();
      type('');
      expect(screen.queryByTestId('distinct-values-no-results')).not.toBeInTheDocument();
      expect(screen.getByText(ALL)).toBeInTheDocument();
    });

    it('hides "no results" until a changed search text settles', () => {
      vi.useFakeTimers();
      render(<Harness initialSearch="zzz" codes={[]} />);
      expect(screen.getByTestId('distinct-values-no-results')).toBeInTheDocument();
      type('zzzx');
      expect(screen.queryByTestId('distinct-values-no-results')).not.toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(300); });
      expect(screen.getByTestId('distinct-values-no-results')).toBeInTheDocument();
    });

    it('clears the search once on unmount', () => {
      const setSearchSpy = vi.fn();
      const { unmount } = render(<Harness initialSearch="abc" setSearchSpy={setSearchSpy} />);
      expect(setSearchSpy).not.toHaveBeenCalled();
      unmount();
      expect(setSearchSpy).toHaveBeenCalledTimes(1);
      expect(setSearchSpy).toHaveBeenCalledWith('');
    });

    it('does not throw on unmount when setSearch is undefined', () => {
      const { unmount } = render(<Harness withoutSetSearch />);
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('option rows', () => {
    it('marks only the row matching activeCode with a single check and the tint', () => {
      render(<Harness activeCode="CO" />);
      const rows = options();
      const co = rows.find((r) => r.textContent === 'label-CO');
      expect(within(co).getByTestId('Check__55c679')).toBeInTheDocument();
      expect(co).toHaveClass('bg-[rgba(18,18,23,0.05)]');
      expect(screen.getAllByTestId('Check__55c679')).toHaveLength(1);
      const dr = rows.find((r) => r.textContent === 'label-DR');
      expect(within(dr).queryByTestId('Check__55c679')).not.toBeInTheDocument();
    });

    it('selects the all row (with the check) when activeCode is null', () => {
      render(<Harness activeCode={null} />);
      const all = options().find((r) => r.textContent === ALL);
      expect(within(all).getByTestId('Check__55c679')).toBeInTheDocument();
      expect(screen.getAllByTestId('Check__55c679')).toHaveLength(1);
    });

    it('leaves the all row unchecked when a code is active', () => {
      render(<Harness activeCode="DR" />);
      const all = options().find((r) => r.textContent === ALL);
      expect(within(all).queryByTestId('Check__55c679')).not.toBeInTheDocument();
    });

    it('calls onSelect with the code when a row is clicked and with null for the all row', async () => {
      const user = setupUser();
      const onSelect = vi.fn();
      render(<Harness onSelect={onSelect} />);
      await user.click(screen.getByText('label-CO'));
      expect(onSelect).toHaveBeenLastCalledWith('CO');
      await user.click(screen.getByText(ALL));
      expect(onSelect).toHaveBeenLastCalledWith(null);
    });

    it('gives every row the hover tint class', () => {
      render(<Harness />);
      options().forEach((r) => expect(r.className).toContain('hover:bg-[rgba(18,18,23,0.05)]'));
    });

    it('renders plain text options when renderOption is omitted', () => {
      render(<Harness />);
      expect(screen.getByText('label-DR').closest('[role="option"]')).toBeInTheDocument();
      expect(screen.queryByTestId('custom-option')).not.toBeInTheDocument();
    });

    it('passes (code, label) to renderOption, renders its output and never routes the all row through it', () => {
      const renderOption = vi.fn((code, label) => <b data-testid="custom-option">{`${code}|${label}`}</b>);
      render(<Harness renderOption={renderOption} />);
      expect(renderOption).toHaveBeenCalledWith('DR', 'label-DR');
      expect(renderOption).toHaveBeenCalledWith('CO', 'label-CO');
      expect(renderOption).toHaveBeenCalledTimes(renderOption.mock.calls.length);
      expect(renderOption.mock.calls.every(([code]) => code !== null)).toBe(true);
      expect(screen.getAllByTestId('custom-option').map((n) => n.textContent)).toEqual(['DR|label-DR', 'CO|label-CO']);
      expect(screen.getByText(ALL).querySelector('[data-testid="custom-option"]')).toBeNull();
    });
  });

  describe('accessibility wiring', () => {
    it('exposes a combobox input controlling a labelled listbox', () => {
      render(<Harness />);
      const listbox = screen.getByRole('listbox');
      expect(input()).toHaveAttribute('aria-autocomplete', 'list');
      expect(input()).toHaveAttribute('aria-controls', listbox.id);
      expect(input()).toHaveAttribute('aria-label', 'searchStatuses');
      expect(listbox).toHaveAttribute('aria-label', 'searchStatuses');
    });

    it('gives every option a unique id and tabIndex -1', () => {
      render(<Harness />);
      const ids = options().map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
      ids.forEach((id) => expect(id).toBeTruthy());
      options().forEach((o) => expect(o).toHaveAttribute('tabindex', '-1'));
    });

    it('sets aria-selected only on the selected option, including the all row with no active code', () => {
      const { rerender } = render(<Harness activeCode={null} />);
      expect(options().map((o) => o.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
      rerender(<Harness activeCode="CO" />);
      expect(options().map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true']);
    });

    it('uses distinct ids across two mounted instances', () => {
      render(<><Harness /><Harness /></>);
      const ids = screen.getAllByRole('option').map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
      const listIds = screen.getAllByRole('listbox').map((l) => l.id);
      expect(new Set(listIds).size).toBe(2);
    });
  });

  describe('keyboard navigation', () => {
    it('ArrowDown from none activates the first option (the all row) and sets aria-activedescendant', async () => {
      const user = setupUser();
      render(<Harness />);
      await user.click(input());
      await user.keyboard('{ArrowDown}');
      const first = options()[0];
      expect(input()).toHaveAttribute('aria-activedescendant', first.id);
      expect(first).toHaveAttribute('data-active', 'true');
      expect(options()[1]).not.toHaveAttribute('data-active');
    });

    it('ArrowUp from none activates the last option', async () => {
      const user = setupUser();
      render(<Harness />);
      await user.click(input());
      await user.keyboard('{ArrowUp}');
      const last = options()[2];
      expect(input()).toHaveAttribute('aria-activedescendant', last.id);
      expect(last).toHaveAttribute('data-active', 'true');
    });

    it('starts at the first code when there is no all row', async () => {
      const user = setupUser();
      render(<Harness allLabel={null} />);
      await user.click(input());
      await user.keyboard('{ArrowDown}');
      expect(options()[0]).toHaveTextContent('label-DR');
      expect(input()).toHaveAttribute('aria-activedescendant', options()[0].id);
    });

    it('clamps at both ends without wrapping', async () => {
      const user = setupUser();
      render(<Harness />);
      await user.click(input());
      await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
      expect(input()).toHaveAttribute('aria-activedescendant', options()[2].id);
      await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}');
      expect(input()).toHaveAttribute('aria-activedescendant', options()[0].id);
    });

    it('Enter on the active code option selects its code', async () => {
      const user = setupUser();
      const onSelect = vi.fn();
      render(<Harness onSelect={onSelect} />);
      await user.click(input());
      await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith('DR');
    });

    it('Enter on the active all row selects null', async () => {
      const user = setupUser();
      const onSelect = vi.fn();
      render(<Harness onSelect={onSelect} />);
      await user.click(input());
      await user.keyboard('{ArrowDown}{Enter}');
      expect(onSelect).toHaveBeenCalledWith(null);
    });

    it('Enter with no active option does nothing', async () => {
      const user = setupUser();
      const onSelect = vi.fn();
      render(<Harness onSelect={onSelect} />);
      await user.click(input());
      await user.keyboard('{Enter}');
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('resets the active option when the search text changes', async () => {
      const user = setupUser();
      render(<Harness />);
      await user.click(input());
      await user.keyboard('{ArrowDown}');
      expect(input()).toHaveAttribute('aria-activedescendant');
      await user.keyboard('d');
      expect(input()).not.toHaveAttribute('aria-activedescendant');
    });

    it('resets the active option when the codes change', async () => {
      const user = setupUser();
      const { rerender } = render(<Harness codes={['DR', 'CO']} />);
      await user.click(input());
      await user.keyboard('{ArrowDown}');
      expect(input()).toHaveAttribute('aria-activedescendant');
      rerender(<Harness codes={['DR', 'CO', 'VO']} />);
      expect(input()).not.toHaveAttribute('aria-activedescendant');
    });

    it('resets the active option when the all row appears or disappears', async () => {
      const user = setupUser();
      const { rerender } = render(<Harness />);
      await user.click(input());
      await user.keyboard('{ArrowDown}');
      expect(input()).toHaveAttribute('aria-activedescendant');
      rerender(<Harness allLabel={null} />);
      expect(input()).not.toHaveAttribute('aria-activedescendant');
    });

    it('ignores ArrowDown when there are no options (no-results) and sets no aria-activedescendant', async () => {
      const user = setupUser();
      render(<Harness initialSearch="zzz" codes={[]} />);
      await user.click(input());
      await user.keyboard('{ArrowDown}');
      expect(input()).not.toHaveAttribute('aria-activedescendant');
    });

    it('ignores ArrowDown while loading with no options', async () => {
      const user = setupUser();
      render(<Harness initialSearch="zzz" codes={[]} loading allLabel={null} />);
      await user.click(input());
      await user.keyboard('{ArrowDown}');
      expect(input()).not.toHaveAttribute('aria-activedescendant');
    });

    it('clears the active state when the pointer moves over an option', async () => {
      const user = setupUser();
      render(<Harness />);
      await user.click(input());
      await user.keyboard('{ArrowDown}');
      expect(input()).toHaveAttribute('aria-activedescendant');
      await user.pointer({ target: options()[2], keys: '[MouseLeft>]' }).catch(() => {});
      fireEvent.pointerMove(options()[2]);
      expect(input()).not.toHaveAttribute('aria-activedescendant');
      options().forEach((o) => expect(o).not.toHaveAttribute('data-active'));
    });

    it('does not trigger loadMore from keyboard navigation', async () => {
      const user = setupUser();
      const loadMore = vi.fn();
      const distinct = { values: [{ id: 'DR' }], loading: false, loadingMore: false, hasMore: false, search: '', setSearch: vi.fn(), loadMore };
      render(<DistinctValuesList activeCode={null} allLabel={ALL} codes={['DR']} labelFor={labelFor} distinct={distinct} onSelect={vi.fn()} searchPlaceholder="s" />);
      await user.click(input());
      await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}');
      expect(loadMore).not.toHaveBeenCalled();
    });
  });
});
