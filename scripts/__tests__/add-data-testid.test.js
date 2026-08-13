/**
 * Node test runner tests for the add-data-testid.cjs jscodeshift transformer.
 *
 * The transformer is a pure function: (file, api) => string.
 * We call it directly with mock file/api objects so we do not need the
 * jscodeshift CLI, just the library itself.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Dynamic imports for CJS modules (jscodeshift + the transformer itself)
const jscodeshift = (await import(join(__dirname, '../../node_modules/jscodeshift/index.js'))).default;
const transformer = (await import(join(__dirname, '../add-data-testid.cjs'))).default;

// Build a mock `api` object the way jscodeshift would.
function makeApi() {
  return { jscodeshift: jscodeshift.withParser('babel') };
}

function run(source, filePath = 'src/Component.jsx') {
  return transformer({ source, path: filePath }, makeApi());
}

// ── Basic transformation ──────────────────────────────────────────────────────

describe('add-data-testid transformer — basic transformation', () => {
  it('adds data-testid to a simple uppercase component', () => {
    const src = `function App() { return <MyButton />; }`;
    const out = run(src, 'src/App.jsx');
    assert.match(out, /data-testid=/);
    assert.match(out, /MyButton__/);
  });

  it('does not add data-testid to lowercase JSX elements (native DOM)', () => {
    const src = `function App() { return <div className="x" />; }`;
    const out = run(src, 'src/App.jsx');
    assert.doesNotMatch(out, /data-testid/);
  });

  it('produces a deterministic hash derived from the file path', () => {
    const src = `function App() { return <Widget />; }`;
    const out1 = run(src, 'src/a/Widget.jsx');
    const out2 = run(src, 'src/a/Widget.jsx');
    assert.equal(out1, out2);
  });

  it('produces different hashes for different file paths', () => {
    const src = `function App() { return <Widget />; }`;
    const hashOf = (p) => {
      const out = run(src, p);
      const m = out.match(/Widget__([0-9a-f]{6})/);
      return m ? m[1] : null;
    };
    const h1 = hashOf('src/path/A.jsx');
    const h2 = hashOf('src/path/B.jsx');
    assert.ok(h1 !== null && h2 !== null);
    assert.notEqual(h1, h2);
  });
});

// ── Opt-out marker ────────────────────────────────────────────────────────────

describe('add-data-testid transformer — opt-out marker', () => {
  it('returns source unchanged when @data-testid-ignore is present', () => {
    const src = `// @data-testid-ignore\nfunction App() { return <Widget />; }`;
    const out = run(src, 'src/App.jsx');
    assert.equal(out, src);
  });

  it('skips case-insensitively (DATA-TESTID-IGNORE)', () => {
    const src = `// @DATA-TESTID-IGNORE\nfunction App() { return <Widget />; }`;
    const out = run(src, 'src/App.jsx');
    assert.equal(out, src);
  });
});

// ── Test file exclusion ───────────────────────────────────────────────────────

describe('add-data-testid transformer — test file exclusion', () => {
  it('skips files matching .test.jsx pattern', () => {
    const src = `function App() { return <Widget />; }`;
    const out = run(src, 'src/App.test.jsx');
    assert.equal(out, src);
  });

  it('skips files matching .spec.jsx pattern', () => {
    const src = `function App() { return <Widget />; }`;
    const out = run(src, 'src/App.spec.jsx');
    assert.equal(out, src);
  });

  it('skips files inside __tests__ directories', () => {
    const src = `function App() { return <Widget />; }`;
    const out = run(src, 'src/__tests__/App.jsx');
    assert.equal(out, src);
  });

  it('skips story files', () => {
    const src = `function App() { return <Widget />; }`;
    const out = run(src, 'src/App.stories.jsx');
    assert.equal(out, src);
  });

  it('skips mock files', () => {
    const src = `function App() { return <Widget />; }`;
    const out = run(src, 'src/App.mock.jsx');
    assert.equal(out, src);
  });
});

// ── Preserve existing data-testid ─────────────────────────────────────────────

describe('add-data-testid transformer — preserves existing attributes', () => {
  it('does not duplicate data-testid when one already exists', () => {
    const src = `function App() { return <Widget data-testid="my-id" />; }`;
    const out = run(src, 'src/App.jsx');
    const count = (out.match(/data-testid/g) || []).length;
    assert.equal(count, 1);
  });

  it('keeps the existing data-testid value unchanged', () => {
    const src = `function App() { return <Widget data-testid="my-id" />; }`;
    const out = run(src, 'src/App.jsx');
    assert.match(out, /data-testid="my-id"/);
  });
});

// ── field.id scope detection ──────────────────────────────────────────────────

describe('add-data-testid transformer — field.id in scope', () => {
  it('uses field.id expression when field param is in function scope', () => {
    const src = `
function FieldRow(field) {
  return <Input />;
}`.trim();
    const out = run(src, 'src/FieldRow.jsx');
    assert.match(out, /data-testid=\{["']Input__["'] \+ field\.id\}/);
  });

  it('uses field.id when field is destructured from object params', () => {
    const src = `
function FieldRow({ field }) {
  return <Input />;
}`.trim();
    const out = run(src, 'src/FieldRow.jsx');
    assert.match(out, /data-testid=\{["']Input__["'] \+ field\.id\}/);
  });

  it('falls back to hash when field is not in scope', () => {
    const src = `function App() { return <Input />; }`;
    const out = run(src, 'src/App.jsx');
    assert.match(out, /data-testid="Input__[0-9a-f]{6}"/);
  });
});

// ── Excluded paths ────────────────────────────────────────────────────────────

describe('add-data-testid transformer — excluded directory paths', () => {
  it('skips files inside node_modules', () => {
    const src = `function App() { return <Widget />; }`;
    const out = run(src, '/some/project/node_modules/lib/Widget.jsx');
    assert.equal(out, src);
  });

  it('skips files inside dist', () => {
    const src = `function App() { return <Widget />; }`;
    const out = run(src, '/some/project/dist/Widget.jsx');
    assert.equal(out, src);
  });
});
