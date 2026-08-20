// Tests for downloadBlobAsFile (pdfUtils.js)
// Uses Vitest + jsdom because the function manipulates the DOM.

vi.mock('@/lib/locationAddress.js', () => ({
  buildLocationAddressLines: vi.fn(),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return actual;
});

// ETP-4315 follow-up (2026-08-18) — usePdfGenerator's cache-gating branch calls
// these two before ever touching buildBlobFn/jsreport.
const mockFetchMainAttachment = vi.fn();
const mockFetchAttachmentBlob = vi.fn();
vi.mock('@/components/copilot/ocr/listAttachments', () => ({
  fetchMainAttachment: (...args) => mockFetchMainAttachment(...args),
  fetchAttachmentBlob: (...args) => mockFetchAttachmentBlob(...args),
}));

import { renderHook, waitFor } from '@testing-library/react';
import { downloadBlobAsFile, buildReturnDocCommonFields, sortLinesByLineNo, usePdfGenerator } from '../pdfUtils.js';

describe('downloadBlobAsFile', () => {
  let createObjectURLMock;
  let revokeObjectURLMock;
  let appendChildMock;
  let removeChildMock;
  let clickMock;
  let createElementMock;

  beforeEach(() => {
    clickMock = vi.fn();
    createObjectURLMock = vi.fn(() => 'blob:http://localhost/test-url');
    revokeObjectURLMock = vi.fn();

    globalThis.URL.createObjectURL = createObjectURLMock;
    globalThis.URL.revokeObjectURL = revokeObjectURLMock;

    appendChildMock = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    removeChildMock = vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});
    createElementMock = vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: clickMock,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls URL.createObjectURL with the provided blob', () => {
    const blob = new Blob(['test'], { type: 'application/pdf' });
    downloadBlobAsFile(blob, 'report.pdf');
    expect(createObjectURLMock).toHaveBeenCalledWith(blob);
  });

  it('creates an anchor element', () => {
    const blob = new Blob(['test'], { type: 'application/pdf' });
    downloadBlobAsFile(blob, 'report.pdf');
    expect(createElementMock).toHaveBeenCalledWith('a');
  });

  it('sets href to the object URL on the anchor', () => {
    const blob = new Blob(['test'], { type: 'application/pdf' });
    const fakeAnchor = { href: '', download: '', click: clickMock };
    createElementMock.mockReturnValue(fakeAnchor);
    downloadBlobAsFile(blob, 'report.pdf');
    expect(fakeAnchor.href).toBe('blob:http://localhost/test-url');
  });

  it('sets download attribute to the provided filename', () => {
    const blob = new Blob(['test'], { type: 'application/pdf' });
    const fakeAnchor = { href: '', download: '', click: clickMock };
    createElementMock.mockReturnValue(fakeAnchor);
    downloadBlobAsFile(blob, 'my-document.pdf');
    expect(fakeAnchor.download).toBe('my-document.pdf');
  });

  it('appends the anchor to document.body', () => {
    const blob = new Blob(['test'], { type: 'application/pdf' });
    downloadBlobAsFile(blob, 'report.pdf');
    expect(appendChildMock).toHaveBeenCalled();
  });

  it('calls click() on the anchor to trigger download', () => {
    const blob = new Blob(['test'], { type: 'application/pdf' });
    downloadBlobAsFile(blob, 'report.pdf');
    expect(clickMock).toHaveBeenCalled();
  });

  it('removes the anchor from document.body after clicking', () => {
    const blob = new Blob(['test'], { type: 'application/pdf' });
    downloadBlobAsFile(blob, 'report.pdf');
    expect(removeChildMock).toHaveBeenCalled();
  });

  it('calls URL.revokeObjectURL with the created URL to free memory', () => {
    const blob = new Blob(['test'], { type: 'application/pdf' });
    downloadBlobAsFile(blob, 'report.pdf');
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost/test-url');
  });
});

describe('sortLinesByLineNo', () => {
  it('sorts lines ascending by lineNo', () => {
    const lines = [{ lineNo: '30' }, { lineNo: '10' }, { lineNo: '20' }];
    expect(sortLinesByLineNo(lines).map(l => l.lineNo)).toEqual(['10', '20', '30']);
  });

  it('returns a new array without mutating the original', () => {
    const lines = [{ lineNo: '20' }, { lineNo: '10' }];
    const sorted = sortLinesByLineNo(lines);
    expect(sorted).not.toBe(lines);
    expect(lines[0].lineNo).toBe('20');
  });

  it('treats missing lineNo as 0', () => {
    const lines = [{ lineNo: '5' }, {}, { lineNo: '3' }];
    expect(sortLinesByLineNo(lines).map(l => l.lineNo ?? undefined)).toEqual([undefined, '3', '5']);
  });

  it('handles an empty array', () => {
    expect(sortLinesByLineNo([])).toEqual([]);
  });
});

describe('buildReturnDocCommonFields', () => {
  it('extracts org fields when issuerOrg is present', () => {
    const header = {
      issuerOrg: { name: 'Acme', address1: 'Calle 1', address2: 'Piso 2', cityLine: 'Madrid', taxId: 'B123' },
      documentNo: 'SH-001',
      movementDate: '2025-01-15',
    };
    const result = buildReturnDocCommonFields(header, 'data:image/png;base64,abc');
    expect(result.companyName).toBe('Acme');
    expect(result.companyAddress1).toBe('Calle 1');
    expect(result.companyTaxId).toBe('B123');
    expect(result.documentNo).toBe('SH-001');
    expect(result.movementDate).toBe('2025-01-15');
    expect(result.companyLogoDataUrl).toBe('data:image/png;base64,abc');
  });

  it('falls back to organization$_identifier when issuerOrg has no name', () => {
    const header = {
      issuerOrg: {},
      'organization$_identifier': 'Fallback Corp',
      documentNo: 'SH-002',
      movementDate: '',
    };
    expect(buildReturnDocCommonFields(header, null).companyName).toBe('Fallback Corp');
  });

  it('falls back to "Empresa" when no name is available', () => {
    const header = { issuerOrg: {}, documentNo: '', movementDate: '' };
    expect(buildReturnDocCommonFields(header, null).companyName).toBe('Empresa');
  });

  it('returns empty string for documentNo when missing', () => {
    const header = { issuerOrg: {} };
    expect(buildReturnDocCommonFields(header, null).documentNo).toBe('');
  });
});

// ETP-4315 follow-up (2026-08-18): usePdfGenerator's jsreport-regeneration-skip
// optimization. When cacheConfig.storeCondition && cacheConfig.tableName are both
// truthy, it looks up the marked Attachment via fetchMainAttachment first and, on a
// hit, fetches its blob via fetchAttachmentBlob — skipping buildBlobFn (and thus
// jsreport) entirely. On a cache miss, or when cacheConfig doesn't opt in, it falls
// back to the original buildBlobFn behavior.
describe('usePdfGenerator — cache-gating (ETP-4315 follow-up)', () => {
  let buildBlobFn;
  let builtBlob;
  let cachedBlob;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/generated');
    globalThis.URL.revokeObjectURL = vi.fn();
    builtBlob = new Blob(['%PDF-built'], { type: 'application/pdf' });
    cachedBlob = new Blob(['%PDF-cached'], { type: 'application/pdf' });
    buildBlobFn = vi.fn(() => Promise.resolve(builtBlob));
  });

  it('cache hit: fetches the marked attachment blob and never calls buildBlobFn', async () => {
    mockFetchMainAttachment.mockResolvedValue({ id: 'att-1' });
    mockFetchAttachmentBlob.mockResolvedValue(cachedBlob);

    const { result } = renderHook(() =>
      usePdfGenerator('rec-1', '/api/sales-order', 'tok', buildBlobFn, {
        tableName: 'C_Order',
        storeCondition: true,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchMainAttachment).toHaveBeenCalledWith({
      tableName: 'C_Order', recordId: 'rec-1', apiBaseUrl: '/api/sales-order',
    });
    expect(mockFetchAttachmentBlob).toHaveBeenCalledWith({
      attachmentId: 'att-1', apiBaseUrl: '/api/sales-order',
    });
    expect(buildBlobFn).not.toHaveBeenCalled();
    expect(result.current.pdfBlob).toBe(cachedBlob);
    expect(result.current.pdfUrl).toBe('blob:http://localhost/generated');
    expect(result.current.error).toBeNull();
  });

  it('cache miss (no marked attachment): falls back to buildBlobFn', async () => {
    mockFetchMainAttachment.mockResolvedValue(null);

    const { result } = renderHook(() =>
      usePdfGenerator('rec-1', '/api/sales-order', 'tok', buildBlobFn, {
        tableName: 'C_Order',
        storeCondition: true,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchMainAttachment).toHaveBeenCalled();
    expect(mockFetchAttachmentBlob).not.toHaveBeenCalled();
    // buildBlobFn receives the trimmed base (apiBaseUrl with the last path
    // segment stripped), not the raw apiBaseUrl — see usePdfGenerator's `base` local.
    expect(buildBlobFn).toHaveBeenCalledWith('rec-1', '/api', 'tok');
    expect(result.current.pdfBlob).toBe(builtBlob);
  });

  it('cache miss (marked attachment has no id): falls back to buildBlobFn', async () => {
    mockFetchMainAttachment.mockResolvedValue({});

    const { result } = renderHook(() =>
      usePdfGenerator('rec-1', '/api/sales-order', 'tok', buildBlobFn, {
        tableName: 'C_Order',
        storeCondition: true,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchAttachmentBlob).not.toHaveBeenCalled();
    expect(buildBlobFn).toHaveBeenCalled();
    expect(result.current.pdfBlob).toBe(builtBlob);
  });

  it('cacheConfig omitted (backward-compat): calls buildBlobFn and never attempts a cache lookup', async () => {
    const { result } = renderHook(() =>
      usePdfGenerator('rec-1', '/api/sales-order', 'tok', buildBlobFn),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchMainAttachment).not.toHaveBeenCalled();
    expect(mockFetchAttachmentBlob).not.toHaveBeenCalled();
    expect(buildBlobFn).toHaveBeenCalledWith('rec-1', '/api', 'tok');
    expect(result.current.pdfBlob).toBe(builtBlob);
  });

  it('cacheConfig null (backward-compat): calls buildBlobFn and never attempts a cache lookup', async () => {
    const { result } = renderHook(() =>
      usePdfGenerator('rec-1', '/api/sales-order', 'tok', buildBlobFn, null),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchMainAttachment).not.toHaveBeenCalled();
    expect(mockFetchAttachmentBlob).not.toHaveBeenCalled();
    expect(buildBlobFn).toHaveBeenCalled();
    expect(result.current.pdfBlob).toBe(builtBlob);
  });

  it('storeCondition: false skips the cache lookup even with a tableName present', async () => {
    const { result } = renderHook(() =>
      usePdfGenerator('rec-1', '/api/sales-order', 'tok', buildBlobFn, {
        tableName: 'C_Order',
        storeCondition: false,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchMainAttachment).not.toHaveBeenCalled();
    expect(mockFetchAttachmentBlob).not.toHaveBeenCalled();
    expect(buildBlobFn).toHaveBeenCalled();
    expect(result.current.pdfBlob).toBe(builtBlob);
  });

  it('storeCondition: true but no tableName skips the cache lookup', async () => {
    const { result } = renderHook(() =>
      usePdfGenerator('rec-1', '/api/sales-order', 'tok', buildBlobFn, {
        storeCondition: true,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchMainAttachment).not.toHaveBeenCalled();
    expect(buildBlobFn).toHaveBeenCalled();
  });
});
