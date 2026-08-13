import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('lucide-react', () => ({ TriangleAlert: () => null, ArrowUpRight: () => null }));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }) => children,
  TooltipContent: ({ children }) => children,
  TooltipProvider: ({ children }) => children,
  TooltipTrigger: ({ children }) => children,
}));

import { useFmSelection } from '../FmPrimitives.jsx';

const ROWS = [
  { id: 'r1', name: 'Row 1' },
  { id: 'r2', name: 'Row 2' },
  { id: 'r3', name: 'Row 3' },
];

describe('useFmSelection — initial state', () => {
  it('starts with no rows selected', () => {
    const { result } = renderHook(() => useFmSelection(ROWS));
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('allSelected is false when nothing is selected', () => {
    const { result } = renderHook(() => useFmSelection(ROWS));
    expect(result.current.allSelected).toBe(false);
  });

  it('someSelected is false when nothing is selected', () => {
    const { result } = renderHook(() => useFmSelection(ROWS));
    expect(result.current.someSelected).toBe(false);
  });

  it('allSelected is false when rows is empty', () => {
    const { result } = renderHook(() => useFmSelection([]));
    expect(result.current.allSelected).toBe(false);
  });
});

describe('useFmSelection — handleToggleRow', () => {
  it('selects a row by id', () => {
    const { result } = renderHook(() => useFmSelection(ROWS));
    act(() => result.current.handleToggleRow('r1'));
    expect(result.current.selectedIds.has('r1')).toBe(true);
  });

  it('does not select other rows when one is toggled', () => {
    const { result } = renderHook(() => useFmSelection(ROWS));
    act(() => result.current.handleToggleRow('r1'));
    expect(result.current.selectedIds.has('r2')).toBe(false);
    expect(result.current.selectedIds.has('r3')).toBe(false);
  });

  it('deselects a row that was already selected', () => {
    const { result } = renderHook(() => useFmSelection(ROWS));
    act(() => result.current.handleToggleRow('r2'));
    act(() => result.current.handleToggleRow('r2'));
    expect(result.current.selectedIds.has('r2')).toBe(false);
  });

  it('can select multiple rows independently', () => {
    const { result } = renderHook(() => useFmSelection(ROWS));
    act(() => result.current.handleToggleRow('r1'));
    act(() => result.current.handleToggleRow('r3'));
    expect(result.current.selectedIds.has('r1')).toBe(true);
    expect(result.current.selectedIds.has('r2')).toBe(false);
    expect(result.current.selectedIds.has('r3')).toBe(true);
  });
});

describe('useFmSelection — handleToggleAll', () => {
  it('selects all rows when none are selected', () => {
    const { result } = renderHook(() => useFmSelection(ROWS));
    act(() => result.current.handleToggleAll());
    expect(result.current.selectedIds.size).toBe(ROWS.length);
    ROWS.forEach(r => expect(result.current.selectedIds.has(r.id)).toBe(true));
  });

  it('deselects all rows when all are already selected', () => {
    const { result } = renderHook(() => useFmSelection(ROWS));
    act(() => result.current.handleToggleAll());
    act(() => result.current.handleToggleAll());
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('selects all rows when only some are selected', () => {
    const { result } = renderHook(() => useFmSelection(ROWS));
    act(() => result.current.handleToggleRow('r1'));
    act(() => result.current.handleToggleAll());
    expect(result.current.selectedIds.size).toBe(ROWS.length);
  });
});

describe('useFmSelection — allSelected computed', () => {
  it('is true only when every row is selected', () => {
    const { result } = renderHook(() => useFmSelection(ROWS));
    act(() => result.current.handleToggleAll());
    expect(result.current.allSelected).toBe(true);
  });

  it('is false when at least one row is unselected', () => {
    const { result } = renderHook(() => useFmSelection(ROWS));
    act(() => result.current.handleToggleRow('r1'));
    act(() => result.current.handleToggleRow('r2'));
    expect(result.current.allSelected).toBe(false);
  });
});

describe('useFmSelection — someSelected computed', () => {
  it('is true when some but not all rows are selected', () => {
    const { result } = renderHook(() => useFmSelection(ROWS));
    act(() => result.current.handleToggleRow('r1'));
    expect(result.current.someSelected).toBe(true);
  });

  it('is false when no rows are selected', () => {
    const { result } = renderHook(() => useFmSelection(ROWS));
    expect(result.current.someSelected).toBe(false);
  });

  it('is false when all rows are selected', () => {
    const { result } = renderHook(() => useFmSelection(ROWS));
    act(() => result.current.handleToggleAll());
    expect(result.current.someSelected).toBe(false);
  });
});