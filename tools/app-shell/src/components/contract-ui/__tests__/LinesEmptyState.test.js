import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'LinesEmptyState.jsx'), 'utf8');

describe('LinesEmptyState', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function LinesEmptyState/);
  });

  it('accepts data, onAddLine and canAddLine props', () => {
    assert.match(src, /data/);
    assert.match(src, /onAddLine/);
    assert.match(src, /canAddLine/);
  });

  it('defaults canAddLine to true', () => {
    assert.match(src, /canAddLine\s*=\s*true/);
  });

  it('returns null when documentStatus is not DR', () => {
    assert.match(src, /documentStatus.*===.*'DR'/);
    assert.match(src, /if\s*\(!isDraft\)\s*return null/);
  });

  it('only renders when document is in Draft status', () => {
    assert.match(src, /isDraft/);
    assert.match(src, /data\?\.documentStatus/);
  });

  it('uses i18n via useUI', () => {
    assert.match(src, /useUI/);
    assert.match(src, /const ui = useUI\(\)/);
  });

  it('renders noLinesYet i18n key', () => {
    assert.match(src, /ui\('noLinesYet'\)/);
  });

  it('renders addLinesManually i18n key as default description', () => {
    assert.match(src, /ui\('addLinesManually'\)/);
  });

  it('accepts a description prop that overrides the default description', () => {
    assert.match(src, /description/);
    assert.match(src, /description\s*\?\?\s*ui\('addLinesManually'\)/);
  });

  it('renders addLines i18n key inside the button', () => {
    assert.match(src, /ui\('addLines'\)/);
  });

  it('gates the add button on canAddLine', () => {
    assert.match(src, /canAddLine\s*\?/);
  });

  it('calls onAddLine when the button is clicked', () => {
    assert.match(src, /onClick\s*=\s*\{onAddLine\}/);
  });

  it('renders a document SVG icon', () => {
    assert.match(src, /<svg/);
    assert.match(src, /M14 2H6/);
  });

  it('accepts a secondaryAction prop for extra buttons', () => {
    assert.match(src, /secondaryAction/);
  });

  it('wraps buttons in a flex container when secondaryAction is provided', () => {
    assert.match(src, /secondaryAction\s*\?/);
    assert.match(src, /display:\s*'flex'/);
    assert.match(src, /gap:\s*8/);
  });

  it('renders primaryButton without wrapper when secondaryAction is absent', () => {
    assert.match(src, /:\s*primaryButton/);
  });

  describe('import-only mode (canAddLine=false, ETP-4462)', () => {
    it('resolves primaryButton to null when canAddLine is false', () => {
      assert.match(src, /const primaryButton = canAddLine \? \(/);
      assert.match(src, /\)\s*:\s*null;/);
    });

    it('tags the primary button with its data-testid', () => {
      assert.match(src, /data-testid="action-add-lines-empty-state"/);
    });

    it('renders secondaryAction outside the canAddLine gate (survives import-only mode)', () => {
      assert.match(src, /\{primaryButton\}\s*\{secondaryAction\}/s);
    });
  });
});
