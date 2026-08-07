// Vitest tests for the DOM-dependent download helpers added for ETP-4456
// (Blob/atob/URL.createObjectURL aren't available under plain `node --test`,
// hence a separate .vitest.js file — see fiscalModelsUtils.test.js for the
// existing pure-logic node:test suite).
import { base64ToBlob, triggerBase64Download, triggerDownload } from '../fiscalModelsUtils.js';

describe('base64ToBlob', () => {
  it('decodes a base64 string into a Blob with the given mime type', async () => {
    // "hello" in base64
    const blob = base64ToBlob('aGVsbG8=', 'text/plain');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/plain');
    const text = await blob.text();
    expect(text).toBe('hello');
  });

  it('defaults to application/pdf when no mime type is given', () => {
    const blob = base64ToBlob('aGVsbG8=');
    expect(blob.type).toBe('application/pdf');
  });
});

describe('triggerBase64Download', () => {
  let clickSpy;
  let createObjectURLSpy;
  let revokeObjectURLSpy;

  beforeEach(() => {
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    clickSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });

  it('does nothing when base64 is empty/null', () => {
    triggerBase64Download(null, 'foo.pdf');
    triggerBase64Download('', 'foo.pdf');
    expect(createObjectURLSpy).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('creates an object URL, clicks a download link, and revokes the URL', () => {
    triggerBase64Download('aGVsbG8=', '303_justificante_2026_T2.pdf');
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(createObjectURLSpy.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
  });
});

describe('triggerDownload — exported for direct reuse', () => {
  it('is exported as a function', () => {
    expect(typeof triggerDownload).toBe('function');
  });
});

describe('base64ToBlob / triggerBase64Download — malformed input (Sentinel QA gap, ETP-4456)', () => {
  // GAP: base64ToBlob has no try/catch around atob(). If the backend ever returns a
  // malformed/truncated pdfBase64 (e.g. a partial response body from a connection interrupted
  // right after a successful AEAT submission, or any non-base64-alphabet character), calling this
  // from AeatSubmitFlow's "Download receipt" button throws uncaught — that click handler
  // (`onClick={() => triggerBase64Download(...)}`) has no try/catch of its own either. The user
  // gets no feedback at all: no error banner, no toast, just a console error and a download that
  // silently never happens. Documented here, not fixed (QA writes tests, doesn't patch
  // production code) — flagged as a bug in the QA report.
  it('base64ToBlob throws (does not swallow) on a non-base64-alphabet string', () => {
    expect(() => base64ToBlob('not-valid-base64!!!')).toThrow();
  });

  it('triggerBase64Download does not catch the error either — it propagates to the caller', () => {
    expect(() => triggerBase64Download('not-valid-base64!!!', 'foo.pdf')).toThrow();
  });
});
