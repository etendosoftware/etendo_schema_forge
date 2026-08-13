// Tests for downloadBlobAsFile (pdfUtils.js)
// Uses Vitest + jsdom because the function manipulates the DOM.

vi.mock('@/lib/locationAddress.js', () => ({
  buildLocationAddressLines: vi.fn(),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return actual;
});

import { downloadBlobAsFile, buildReturnDocCommonFields, sortLinesByLineNo } from '../pdfUtils.js';

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
