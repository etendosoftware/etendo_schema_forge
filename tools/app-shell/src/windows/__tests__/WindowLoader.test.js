import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Source-shape tests for `WindowLoader.jsx` (ETP-4300 Phase 2B.2 wiring).
 *
 * WindowLoader is a thin JSX shell with heavy deps (react-router `useParams`,
 * auth context, dynamic imports), so per the project convention it is tested by
 * reading the source and asserting structural patterns — NOT by rendering.
 *
 * These regex-shape tests guard the sliced-label wiring: the build-time flag
 * gating, the per-window slice dynamic import, the failure tolerance, and the
 * provider wrapping. The runtime side is covered elsewhere.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'WindowLoader.jsx'), 'utf8');

describe('WindowLoader.jsx — sliced labels wiring (ETP-4300)', () => {
  it('imports WindowLabelsProvider from @/i18n', () => {
    assert.match(src, /import\s*\{\s*WindowLabelsProvider\s*\}\s*from\s*'@\/i18n'/);
  });

  it('reads the build-time VITE_SLICED_LABELS flag', () => {
    assert.match(src, /import\.meta\.env\.VITE_SLICED_LABELS/);
  });

  it('gates the slice load on the flag (the dynamic import lives in the on-branch)', () => {
    // The flag must guard the dynamic slice import: a ternary whose truthy branch
    // is the `import(...)` and whose falsy branch resolves to null.
    assert.match(src, /SLICED_LABELS\s*\?\s*[\s\S]*?import\(`@generated\/\$\{windowName\}\//);
  });

  it('loads the per-window slice via a dynamic import of a @generated labels.js path', () => {
    assert.match(src, /import\(`@generated\/\$\{windowName\}\/[^`]*labels\.js`\)/);
  });

  it('resolves to null when the flag is off (Promise.resolve(null))', () => {
    assert.match(src, /:\s*Promise\.resolve\(null\)/);
  });

  it('tolerates a missing slice — .catch on the slice import returns null', () => {
    assert.match(src, /\.catch\(\(\)\s*=>\s*null\)/);
  });

  it('wraps the rendered Component in <WindowLabelsProvider slice={...}>', () => {
    // Tolerate extra JSX attributes after slice={slice} (e.g. the data-testid the
    // repo codemod injects), so the assertion is not brittle to attribute presence.
    assert.match(src, /<WindowLabelsProvider\s+slice=\{slice\}[\s/>]/);
    assert.match(src, /<\/WindowLabelsProvider>/);
  });

  it('renders <Component .../> inside the provider boundary', () => {
    // The Component tag must appear between the opening and closing provider tags.
    const open = src.indexOf('<WindowLabelsProvider');
    const close = src.indexOf('</WindowLabelsProvider>');
    assert.ok(open >= 0 && close > open, 'WindowLabelsProvider boundary not found');
    const subtree = src.slice(open, close);
    assert.match(subtree, /<Component\b/);
  });
});
