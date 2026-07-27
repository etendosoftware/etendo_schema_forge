import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { use349Pdf } from '../use349Pdf.js';

vi.mock('../../../../shared/pdfUtils.js', () => ({
  renderPdf: vi.fn(),
  COMMON_HANDLEBARS_HELPERS: '',
}));

import { renderPdf } from '../../../../shared/pdfUtils.js';

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe('use349Pdf — initial state', () => {
  it('pdfUrl is null initially', () => {
    const { result } = renderHook(() => use349Pdf());
    expect(result.current.pdfUrl).toBeNull();
  });

  it('loading is false initially', () => {
    const { result } = renderHook(() => use349Pdf());
    expect(result.current.loading).toBe(false);
  });

  it('error is null initially', () => {
    const { result } = renderHook(() => use349Pdf());
    expect(result.current.error).toBeNull();
  });
});

describe('use349Pdf — generatePdf', () => {
  it('sets loading true while generating, false after', async () => {
    let resolveBlob;
    renderPdf.mockReturnValue(new Promise(res => { resolveBlob = res; }));

    const { result } = renderHook(() => use349Pdf());

    let generatePromise;
    act(() => {
      generatePromise = result.current.generatePdf({ year: 2026, period: 'T1' }, []);
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveBlob(new Blob(['pdf'], { type: 'application/pdf' }));
      await generatePromise;
    });

    expect(result.current.loading).toBe(false);
  });

  it('calls renderPdf with the operators data', async () => {
    const mockBlob = new Blob(['pdf'], { type: 'application/pdf' });
    renderPdf.mockResolvedValue(mockBlob);

    const operators = [
      { nif: 'IT12345678901', name: 'Test SRL', key: 'A', base: 1000 },
    ];
    const { result } = renderHook(() => use349Pdf());

    await act(async () => {
      await result.current.generatePdf({ year: 2026, period: 'T1' }, operators);
    });

    expect(renderPdf).toHaveBeenCalledTimes(1);
    const [, , , data] = renderPdf.mock.calls[0];
    expect(data.operators).toEqual(operators);
  });

  it('sets pdfUrl to object URL when renderPdf succeeds', async () => {
    const mockBlob = new Blob(['pdf'], { type: 'application/pdf' });
    renderPdf.mockResolvedValue(mockBlob);

    const { result } = renderHook(() => use349Pdf());

    await act(async () => {
      await result.current.generatePdf({ year: 2026, period: 'T1' }, []);
    });

    expect(result.current.pdfUrl).toBe('blob:mock-url');
    expect(URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
  });

  it('sets error when renderPdf throws', async () => {
    renderPdf.mockRejectedValue(new Error('render failed'));

    const { result } = renderHook(() => use349Pdf());

    await act(async () => {
      await result.current.generatePdf({ year: 2026, period: 'T1' }, []);
    });

    expect(result.current.error).toBe('render failed');
    expect(result.current.pdfUrl).toBeNull();
  });

  it('includes totalAmount = sum of operator bases in data passed to renderPdf', async () => {
    const mockBlob = new Blob(['pdf'], { type: 'application/pdf' });
    renderPdf.mockResolvedValue(mockBlob);

    const operators = [
      { nif: 'DE123456789', name: 'Bayern GmbH', key: 'E', base: 500 },
      { nif: 'FR40123456789', name: 'Provence SARL', key: 'A', base: 300.5 },
    ];
    const { result } = renderHook(() => use349Pdf());

    await act(async () => {
      await result.current.generatePdf({ year: 2026, period: 'T1' }, operators);
    });

    const [, , , data] = renderPdf.mock.calls[0];
    expect(data.totalAmount).toBeCloseTo(800.5);
  });
});

describe('use349Pdf — HELPERS.fmtAmount (real Handlebars template helper)', () => {
  // `renderPdf` is mocked above, but it's still invoked with the real, unmocked
  // `HELPERS` template string built at module scope — so the mock call capture
  // gives us the actual `fmtAmount` source the PDF renderer executes, not a
  // stand-in. This is what actually runs at PDF-generation time; asserting only
  // on the `data` object (as the other tests here do) would never catch a
  // formatting bug inside the Handlebars helper itself.
  function extractFunctionSource(source, fnName) {
    const startIdx = source.indexOf(`function ${fnName}(`);
    if (startIdx === -1) throw new Error(`${fnName} not found in HELPERS`);
    const braceStart = source.indexOf('{', startIdx);
    let depth = 0;
    let i = braceStart;
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    return source.slice(startIdx, i + 1);
  }

  async function getRealFmtAmount() {
    const mockBlob = new Blob(['pdf'], { type: 'application/pdf' });
    renderPdf.mockResolvedValue(mockBlob);
    const { result } = renderHook(() => use349Pdf());
    await act(async () => {
      await result.current.generatePdf({ year: 2026, period: 'T1' }, []);
    });
    const [, , helpers] = renderPdf.mock.calls[0];
    const fnSource = extractFunctionSource(helpers, 'fmtAmount');
    return new Function(`${fnSource}; return fmtAmount;`)();
  }

  it('returns "0,00" for null/undefined', async () => {
    const fmtAmount = await getRealFmtAmount();
    expect(fmtAmount(null)).toBe('0,00');
    expect(fmtAmount(undefined)).toBe('0,00');
  });

  it('groups thousands for amounts in the 1000-9999 range (Intl silently drops it without useGrouping)', async () => {
    const fmtAmount = await getRealFmtAmount();
    expect(fmtAmount(1234.56)).toBe('1.234,56');
  });

  it('keeps grouping for amounts at/above 10000 (already correct even pre-fix)', async () => {
    const fmtAmount = await getRealFmtAmount();
    expect(fmtAmount(12345.67)).toBe('12.345,67');
  });
});

describe('use349Pdf — clearPdf', () => {
  it('resets pdfUrl to null', async () => {
    const mockBlob = new Blob(['pdf'], { type: 'application/pdf' });
    renderPdf.mockResolvedValue(mockBlob);

    const { result } = renderHook(() => use349Pdf());

    await act(async () => {
      await result.current.generatePdf({ year: 2026, period: 'T1' }, []);
    });
    expect(result.current.pdfUrl).toBe('blob:mock-url');

    act(() => {
      result.current.clearPdf();
    });

    expect(result.current.pdfUrl).toBeNull();
  });

  it('revokes the object URL', async () => {
    const mockBlob = new Blob(['pdf'], { type: 'application/pdf' });
    renderPdf.mockResolvedValue(mockBlob);

    const { result } = renderHook(() => use349Pdf());

    await act(async () => {
      await result.current.generatePdf({ year: 2026, period: 'T1' }, []);
    });

    act(() => {
      result.current.clearPdf();
    });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
