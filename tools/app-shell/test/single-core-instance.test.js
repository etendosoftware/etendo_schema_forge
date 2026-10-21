// @covers tools/app-shell/vite-plugins/single-core-instance.js
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import singleCoreInstancePlugin from '../vite-plugins/single-core-instance.js';

const HASH = 'abc123';
const CORE = '/@fs/Users/x/node_modules/@etendosoftware/app-shell-core/src/hooks/useCurrency.jsx';

function setup({ url = '/src/foo.js', headers = {}, hash = HASH, headersSent = false } = {}) {
  let middleware;
  const server = {
    middlewares: { use: (fn) => { middleware = fn; } },
    environments: { client: { depsOptimizer: { metadata: hash ? { browserHash: hash } : {} } } },
  };
  singleCoreInstancePlugin().configureServer(server);
  const hdr = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const sent = { writes: [], end: undefined, endCalls: 0 };
  const res = {
    headersSent,
    getHeader: (k) => hdr.get(k.toLowerCase()),
    setHeader: (k, v) => hdr.set(k.toLowerCase(), v),
    removeHeader: (k) => hdr.delete(k.toLowerCase()),
    write(chunk) { sent.writes.push(chunk); return true; },
    end(chunk) { sent.endCalls++; sent.end = chunk; },
  };
  const originals = { write: res.write, end: res.end };
  let nextCalled = false;
  middleware({ url }, res, () => { nextCalled = true; });
  return { res, sent, hdr, originals, next: () => nextCalled };
}

const JS = { 'Content-Type': 'text/javascript' };
const body = (r) => Buffer.from(r.sent.end).toString('utf8');

describe('single-core-instance plugin', () => {
  it('stamps double- and single-quoted unstamped core imports', () => {
    const r = setup({ headers: JS });
    r.res.end(`import a from "${CORE}";\nimport b from '${CORE}';`);
    assert.equal(body(r), `import a from "${CORE}?v=${HASH}";\nimport b from '${CORE}?v=${HASH}';`);
  });

  it('leaves already-stamped and non-core /@fs/ imports unchanged', () => {
    const src = `import a from "${CORE}?v=x";\nimport b from "/@fs/Users/x/other/lib/foo.jsx";`;
    const r = setup({ headers: JS });
    r.res.end(src);
    assert.equal(body(r), src);
  });

  it('rewrites app module URLs (src/hooks/useCurrency.jsx)', () => {
    const r = setup({ url: '/src/hooks/useCurrency.jsx', headers: JS });
    r.res.end(`export * from "${CORE}";`);
    assert.equal(body(r), `export * from "${CORE}?v=${HASH}";`);
  });

  it('rewrites core URLs served from node_modules', () => {
    const r = setup({
      url: '/node_modules/@etendosoftware/app-shell-core/src/index.js?v=1',
      headers: JS,
    });
    r.res.end(`import "${CORE}";`);
    assert.equal(body(r), `import "${CORE}?v=${HASH}";`);
  });

  it('removes Content-Length and Etag after a rewrite', () => {
    const r = setup({ headers: { ...JS, 'Content-Length': '10', Etag: 'W/"1"' } });
    r.res.end('x');
    assert.equal(r.hdr.has('content-length'), false);
    assert.equal(r.hdr.has('etag'), false);
  });

  it('passes through when Content-Encoding is set', () => {
    const src = `import a from "${CORE}";`;
    const r = setup({ headers: { ...JS, 'Content-Encoding': 'gzip' } });
    r.res.end(src);
    assert.equal(r.sent.end, src);
  });

  it('passes through non-javascript binary and event-stream responses', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const a = setup({ headers: { 'Content-Type': 'image/png' } });
    a.res.end(png);
    assert.equal(a.sent.end, png);
    const b = setup({ headers: { 'Content-Type': 'text/event-stream' } });
    b.res.write('data: 1\n\n');
    b.res.end();
    assert.deepEqual(b.sent.writes, ['data: 1\n\n']);
    const c = setup({});
    c.res.end(`"${CORE}"`);
    assert.equal(c.sent.end, `"${CORE}"`);
  });

  it('passes through when headers were already sent', () => {
    const src = `"${CORE}"`;
    const r = setup({ headers: JS, headersSent: true });
    r.res.end(src);
    assert.equal(r.sent.end, src);
  });

  it('forwards streamed writes immediately on pass-through', () => {
    const r = setup({ headers: { 'Content-Type': 'text/event-stream' } });
    r.res.write('a');
    assert.deepEqual(r.sent.writes, ['a']);
    assert.equal(r.sent.endCalls, 0);
    r.res.write('b');
    assert.deepEqual(r.sent.writes, ['a', 'b']);
    r.res.end();
    assert.equal(r.sent.endCalls, 1);
  });

  it('skips with next() and does not patch res when there is no browserHash', () => {
    const r = setup({ hash: null, headers: JS });
    assert.ok(r.next());
    assert.equal(r.res.write, r.originals.write);
    assert.equal(r.res.end, r.originals.end);
  });

  it('skips non-core /node_modules/ URLs', () => {
    const r = setup({ url: '/node_modules/.vite/deps/react.js', headers: JS });
    assert.ok(r.next());
    assert.equal(r.res.write, r.originals.write);
    assert.equal(r.res.end, r.originals.end);
  });

  it('patches res and calls next() for eligible requests', () => {
    const r = setup({ headers: JS });
    assert.ok(r.next());
    assert.notEqual(r.res.end, r.originals.end);
  });

  it('restores the original write/end after a pass-through decision', () => {
    const r = setup({ headers: { 'Content-Type': 'image/png' } });
    r.res.write('x');
    assert.equal(r.res.write, r.originals.write);
    assert.equal(r.res.end, r.originals.end);
    const e = setup({ headers: { 'Content-Type': 'image/png' } });
    e.res.end('y');
    assert.equal(e.res.write, e.originals.write);
    assert.equal(e.res.end, e.originals.end);
  });

  it('restores the original write/end after a rewrite', () => {
    const r = setup({ headers: JS });
    r.res.end('x');
    assert.equal(r.res.write, r.originals.write);
    assert.equal(r.res.end, r.originals.end);
  });

  it('end(callback) does not throw and is not pushed as a chunk', () => {
    const r = setup({ headers: JS });
    r.res.write('const a = 1;');
    assert.doesNotThrow(() => r.res.end(() => {}));
    assert.equal(body(r), 'const a = 1;');
    const p = setup({ headers: { 'Content-Type': 'image/png' } });
    const cb = () => {};
    assert.doesNotThrow(() => p.res.end(cb));
    assert.equal(p.sent.end, cb);
  });

  it('concatenates writes and the end chunk before rewriting a split import', () => {
    const r = setup({ headers: JS });
    const full = `import a from "${CORE}";`;
    const cut = full.indexOf('app-shell-core') + 4;
    r.res.write(Buffer.from(full.slice(0, cut)));
    r.res.write(Buffer.from(full.slice(cut, cut + 20)));
    assert.equal(r.sent.writes.length, 0);
    r.res.end(Buffer.from(full.slice(cut + 20)));
    assert.equal(body(r), `import a from "${CORE}?v=${HASH}";`);
  });
});
