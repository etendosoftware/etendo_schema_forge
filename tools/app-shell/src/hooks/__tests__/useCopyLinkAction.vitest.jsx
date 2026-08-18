import { renderHook, act } from '@testing-library/react';
import { toast } from 'sonner';
import { useCopyLinkAction, useCopyRecordLinkAction } from '../useCopyLinkAction';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => {
    const map = {
      linkCopied: 'Link copied',
      copyFailed: 'Failed to copy',
    };
    return map[key] || key;
  },
}));

describe('useCopyLinkAction', () => {
  const originalOrigin = window.location.origin;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://etendogo.example.com' },
      writable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: { origin: originalOrigin }, writable: true });
  });

  it('is not visible with 0 selected rows', () => {
    const { result } = renderHook(() => useCopyLinkAction({ selectedRows: [], windowName: 'sales-order' }));
    expect(result.current.visible).toBe(false);
  });

  it('is visible with exactly 1 selected row', () => {
    const { result } = renderHook(() => useCopyLinkAction({ selectedRows: [{ id: 'r1' }], windowName: 'sales-order' }));
    expect(result.current.visible).toBe(true);
  });

  it('is not visible with 2+ selected rows', () => {
    const { result } = renderHook(() => useCopyLinkAction({
      selectedRows: [{ id: 'r1' }, { id: 'r2' }],
      windowName: 'sales-order',
    }));
    expect(result.current.visible).toBe(false);
  });

  it('copies the correct URL for a row object with an id', async () => {
    const { result } = renderHook(() => useCopyLinkAction({ selectedRows: [{ id: 'r1' }], windowName: 'sales-order' }));
    await act(async () => {
      await result.current.onCopyLink();
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://etendogo.example.com/sales-order/r1');
    expect(toast.success).toHaveBeenCalledWith('Link copied');
  });

  it('copies the correct URL for a bare id (no .id property)', async () => {
    const { result } = renderHook(() => useCopyLinkAction({ selectedRows: ['r1'], windowName: 'sales-order' }));
    await act(async () => {
      await result.current.onCopyLink();
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://etendogo.example.com/sales-order/r1');
    expect(toast.success).toHaveBeenCalledWith('Link copied');
  });

  it('shows an error toast when writeText rejects', async () => {
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error('denied'));
    const { result } = renderHook(() => useCopyLinkAction({ selectedRows: [{ id: 'r1' }], windowName: 'sales-order' }));
    await act(async () => {
      await result.current.onCopyLink();
    });
    expect(toast.error).toHaveBeenCalledWith('Failed to copy');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('defaults iconSizeClass to the "sm" size', () => {
    const { result } = renderHook(() => useCopyLinkAction({ selectedRows: [{ id: 'r1' }], windowName: 'sales-order' }));
    expect(result.current.iconSizeClass).toBe('h-3.5 w-3.5');
  });

  it('uses the "default" size icon class when selectionBarSize is not sm', () => {
    const { result } = renderHook(() => useCopyLinkAction({
      selectedRows: [{ id: 'r1' }],
      windowName: 'sales-order',
      selectionBarSize: 'default',
    }));
    expect(result.current.iconSizeClass).toBe('h-4 w-4');
  });
});

describe('useCopyRecordLinkAction', () => {
  const originalOrigin = window.location.origin;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://etendogo.example.com' },
      writable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: { origin: originalOrigin }, writable: true });
  });

  it('is visible with a real recordId', () => {
    const { result } = renderHook(() => useCopyRecordLinkAction({ recordId: 'r1', windowName: 'sales-order' }));
    expect(result.current.visible).toBe(true);
  });

  it('is not visible when recordId is the "new" sentinel', () => {
    const { result } = renderHook(() => useCopyRecordLinkAction({ recordId: 'new', windowName: 'sales-order' }));
    expect(result.current.visible).toBe(false);
  });

  it('is not visible without a recordId', () => {
    const { result } = renderHook(() => useCopyRecordLinkAction({ recordId: undefined, windowName: 'sales-order' }));
    expect(result.current.visible).toBe(false);
  });

  it('copies the correct record URL', async () => {
    const { result } = renderHook(() => useCopyRecordLinkAction({ recordId: 'r1', windowName: 'sales-order' }));
    await act(async () => {
      await result.current.onCopyLink();
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://etendogo.example.com/sales-order/r1');
    expect(toast.success).toHaveBeenCalledWith('Link copied');
  });

  it('shows an error toast when writeText rejects', async () => {
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error('denied'));
    const { result } = renderHook(() => useCopyRecordLinkAction({ recordId: 'r1', windowName: 'sales-order' }));
    await act(async () => {
      await result.current.onCopyLink();
    });
    expect(toast.error).toHaveBeenCalledWith('Failed to copy');
    expect(toast.success).not.toHaveBeenCalled();
  });
});
