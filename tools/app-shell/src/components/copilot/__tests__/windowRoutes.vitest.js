import { assertInternalPath } from '../windowRoutes.js';

/**
 * The origin every path is resolved against. `assertInternalPath()` is the
 * navigation security boundary (ETP-5064): a path it allows must never resolve
 * off this origin once the browser's WHATWG URL parser gets hold of it.
 */
const APP_ORIGIN = 'http://app.etendo.local';

const REFUSAL = /Only internal application paths are allowed/;

/** What the browser would actually navigate to for a given path. */
function resolvedOrigin(path) {
  return new URL(path, APP_ORIGIN).origin;
}

describe('assertInternalPath — origins the URL parser would escape to', () => {
  // Each test below states the parser rewrite that makes the vector work, and
  // first pins that the vector really is an origin escape. Without that
  // premise assertion a future reader cannot tell whether the guard's two
  // string checks are defending against something real or are dead weight.

  it('rejects a backslash authority, which the URL parser treats as //', () => {
    // Under a special scheme (http/https) "\" is equivalent to "/", so this
    // enters authority state exactly like "//evil.example".
    expect(resolvedOrigin('/\\evil.example')).toBe('http://evil.example');
    expect(() => assertInternalPath('/\\evil.example')).toThrow(REFUSAL);
  });

  it('rejects a double backslash authority', () => {
    expect(resolvedOrigin('/\\\\evil.example')).toBe('http://evil.example');
    expect(() => assertInternalPath('/\\\\evil.example')).toThrow(REFUSAL);
  });

  it('rejects a leading double backslash with no slash at all', () => {
    expect(resolvedOrigin('\\\\evil.example')).toBe('http://evil.example');
    expect(() => assertInternalPath('\\\\evil.example')).toThrow(REFUSAL);
  });

  it('rejects an embedded TAB, which the parser strips before parsing', () => {
    // "/\t/evil.example" collapses to "//evil.example" inside the parser.
    expect(resolvedOrigin('/\t/evil.example')).toBe('http://evil.example');
    expect(() => assertInternalPath('/\t/evil.example')).toThrow(REFUSAL);
  });

  it('rejects an embedded LF, which the parser strips before parsing', () => {
    expect(resolvedOrigin('/\n/evil.example')).toBe('http://evil.example');
    expect(() => assertInternalPath('/\n/evil.example')).toThrow(REFUSAL);
  });

  it('rejects an embedded CR, which the parser strips before parsing', () => {
    expect(resolvedOrigin('/\r/evil.example')).toBe('http://evil.example');
    expect(() => assertInternalPath('/\r/evil.example')).toThrow(REFUSAL);
  });

  it('rejects a plain protocol-relative authority', () => {
    expect(resolvedOrigin('//evil.example')).toBe('http://evil.example');
    expect(() => assertInternalPath('//evil.example')).toThrow(REFUSAL);
  });
});

describe('assertInternalPath — paths that genuinely stay on this origin', () => {
  // The mirror image of the block above: the normalization must not become an
  // over-rejection. Every path here resolves to APP_ORIGIN, so refusing it
  // would break navigation for no security gain.

  it('allows a single-segment path that merely looks like a host', () => {
    expect(resolvedOrigin('/evil.example')).toBe(APP_ORIGIN);
    expect(assertInternalPath('/evil.example')).toBe('/evil.example');
  });

  it('allows an embedded plain space, which the parser does NOT strip', () => {
    // This is the case that proves the TAB/LF/CR strip is not "any
    // whitespace": a space survives parsing, so "/ /evil.example" keeps the
    // space as the first path segment and stays same-origin. Widening
    // URL_STRIPPED_RE to \s would break this path for no reason.
    expect(resolvedOrigin('/ /evil.example')).toBe(APP_ORIGIN);
    expect(assertInternalPath('/ /evil.example')).toBe('/ /evil.example');
  });

  it('allows a percent-encoded TAB, which is not decoded before parsing', () => {
    // "%09" is never turned back into a TAB by the parser, so the "//" that
    // follows it is ordinary path text, not an authority.
    expect(resolvedOrigin('/%09//evil.example')).toBe(APP_ORIGIN);
    expect(assertInternalPath('/%09//evil.example')).toBe('/%09//evil.example');
  });

  it('allows a path carrying a query string and a fragment', () => {
    expect(resolvedOrigin('/ok?a=1#f')).toBe(APP_ORIGIN);
    expect(assertInternalPath('/ok?a=1#f')).toBe('/ok?a=1#f');
  });

  it('allows the application root', () => {
    expect(assertInternalPath('/')).toBe('/');
  });

  it('allows a normal window record path', () => {
    expect(assertInternalPath('/sales-order/1')).toBe('/sales-order/1');
  });

  it('returns the original string, not the normalized one', () => {
    // Normalization exists to make the DECISION on the parser's view of the
    // input; it must not rewrite what the caller hands to the router.
    expect(assertInternalPath('/ /evil.example')).toBe('/ /evil.example');
  });
});

describe('assertInternalPath — non-path inputs', () => {
  it('rejects the javascript: scheme', () => {
    expect(() => assertInternalPath('javascript:alert(1)')).toThrow(REFUSAL);
  });

  it('rejects the data: scheme', () => {
    expect(() => assertInternalPath('data:text/html,x')).toThrow(REFUSAL);
  });

  it('rejects an empty string', () => {
    expect(() => assertInternalPath('')).toThrow(REFUSAL);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 42],
    ['an object', { toString: () => '/sales-order' }],
  ])('rejects %s instead of coercing it to a string', (_label, input) => {
    expect(() => assertInternalPath(input)).toThrow(REFUSAL);
  });
});
