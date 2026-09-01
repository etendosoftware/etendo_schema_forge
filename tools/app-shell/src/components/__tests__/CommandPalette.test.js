import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'CommandPalette.jsx'), 'utf8');

describe('CommandPalette', () => {
  it('imports useMenuLabel from @/i18n', () => {
    assert.match(src, /useMenuLabel/);
    assert.match(src, /from '@\/i18n'/);
  });

  it('destructures useMenuLabel together with useUI in the same i18n import', () => {
    assert.match(src, /import\s*\{[^}]*useMenuLabel[^}]*\}\s*from\s*'@\/i18n'/);
  });

  it('filters groups with !g.hidden', () => {
    assert.match(src, /\.filter\s*\(\s*g\s*=>\s*!g\.hidden\s*\)/);
  });

  it('filters items within groups with !i.hidden', () => {
    assert.match(src, /\.filter\s*\(\s*i\s*=>\s*!i\.hidden\s*\)/);
  });

  it('uses tMenu(group.group) for group headings', () => {
    assert.match(src, /tMenu\s*\(\s*group\.group\s*\)/);
    assert.match(src, /heading\s*=\s*\{?\s*tMenu\s*\(\s*group\.group\s*\)/);
  });

  it('uses tMenu(item.label) to produce translatedLabel for items', () => {
    assert.match(src, /const\s+translatedLabel\s*=\s*tMenu\s*\(\s*item\.label\s*\)/);
  });

  it('uses translatedLabel in the value prop of CommandItem', () => {
    assert.match(src, /value\s*=\s*\{`\$\{translatedLabel\}/);
  });

  it('value prop of CommandItem includes item.label and item.name for search fallback', () => {
    assert.match(src, /`\$\{translatedLabel\}\s*\$\{item\.label\}\s*\$\{item\.name\}`/);
  });

  it('renders translated label inside CommandItem span', () => {
    assert.match(src, /<span>\s*\{translatedLabel\}\s*<\/span>/);
  });

  it('does not hardcode English group names as literal strings outside JSX', () => {
    // Ensure 'Sales', 'Purchases', etc. are not literal strings used outside i18n calls
    assert.doesNotMatch(src, /heading\s*=\s*['"]Sales['"]/);
    assert.doesNotMatch(src, /heading\s*=\s*['"]Purchases['"]/);
    assert.doesNotMatch(src, /heading\s*=\s*['"]Finance['"]/);
  });

  it('calls useMenuLabel hook and assigns it to tMenu', () => {
    assert.match(src, /const\s+tMenu\s*=\s*useMenuLabel\s*\(\s*\)/);
  });

  it('skips groups where all items are hidden (returns null)', () => {
    assert.match(src, /visibleItems\.length\s*===\s*0\s*\)\s*return\s*null/);
  });

  it('uses contract-declared vector targets for semantic results', () => {
    assert.match(src, /resolveVectorSearchTargets/);
    assert.match(src, /import\.meta\.glob\('@generated\/\*\/contract\.json'\)/);
    assert.match(src, /\/sws\/neo\/vectorsearch/);
  });

  it('keeps vector matches opt-in and renders them as a separate result group', () => {
    assert.match(src, /normalizedQuery\.length\s*<\s*3/);
    assert.match(src, /vectorMatches\.length\s*>\s*0/);
    assert.match(src, /semanticSearchResults/);
  });

  it('renders semantic matches before menu navigation groups', () => {
    const semanticGroup = src.indexOf('data-testid="vector-search-results"');
    const menuGroups = src.indexOf('menuConfig.menu.filter');
    assert.ok(semanticGroup >= 0 && semanticGroup < menuGroups);
  });

  it('keeps semantic matches visible even when their label does not contain the query text', () => {
    assert.match(src, /value\s*=\s*\{`\$\{query\}\s+\$\{label\}/);
  });

  it('shows a searching placeholder while vector search is in flight', () => {
    assert.match(src, /isVectorSearchLoading\s*\?\s*ui\('searching'\)\s*:\s*ui\('searchPages'\)/);
    assert.match(src, /data-testid="vector-search-loading"/);
    assert.match(src, /role="status"/);
  });

  it('opens a semantic result in its contract-declared window record route', () => {
    assert.match(src, /resolveVectorSearchTargets/);
    assert.match(src, /navigate\(`\/\$\{target\.specName\}\/\$\{match\.id\}`\)/);
    assert.match(src, /onSelect=\{\(\)\s*=>\s*handleVectorSelect\(match\)\}/);
  });

  it('shows the normalized vector similarity score for each semantic match', () => {
    assert.match(src, /match\.score/);
    assert.match(src, /Math\.round\(match\.score\s*\*\s*100\)/);
  });

  it('shows the contract-declared entity label on each semantic match', () => {
    assert.match(src, /tMenu\(target\.label\)\s*\|\|\s*target\.label/);
    assert.match(src, /\{entityLabel\}/);
  });

  it('defaults semantic search to the contract target of the current window and lets users clear it', () => {
    assert.match(src, /useLocation/);
    assert.match(src, /resolveVectorSearchTargetForPath/);
    assert.match(src, /requestedVectorSearchTargetKeys/);
    assert.match(src, /data-testid="vector-search-scope"/);
    assert.match(src, /setSelectedVectorTargetKeys\(null\)/);
  });

  it('renders contract-declared window-filter suggestions before navigation results', () => {
    assert.match(src, /resolveWindowSearchSuggestions/);
    assert.match(src, /window-filter-suggestions/);
    assert.match(src, /navigate\(suggestion\.path\)/);
  });
});
