import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'CreatableSearchSelect.jsx'), 'utf8');

describe('CreatableSearchSelect', () => {
  it('exports a named CreatableSearchSelect function', () => {
    assert.match(src, /export function CreatableSearchSelect/);
  });

  it('accepts field, value, displayValue, onChange, formData, resolvedLabel props', () => {
    assert.match(src, /field/);
    assert.match(src, /value/);
    assert.match(src, /displayValue/);
    assert.match(src, /onChange/);
    assert.match(src, /formData/);
    assert.match(src, /resolvedLabel/);
  });

  it('accepts selectorUrl, selectorContext, token props for server fetching', () => {
    assert.match(src, /selectorUrl/);
    assert.match(src, /selectorContext/);
    assert.match(src, /token/);
  });

  it('accepts createLabel and onCreateRequest props for inline creation', () => {
    assert.match(src, /createLabel/);
    assert.match(src, /onCreateRequest/);
  });

  it('reads dependent field config from field.dependsOn', () => {
    assert.match(src, /field\.dependsOn/);
    assert.match(src, /parentKey/);
    assert.match(src, /filterKey/);
    assert.match(src, /parentValue/);
  });

  it('disables the input when parent is required but not yet selected', () => {
    assert.match(src, /isDisabled/);
    assert.match(src, /disabled.*isDisabled/);
  });

  it('clears options and dependent value when the parent value is cleared', () => {
    assert.match(src, /setOptions\(\[\]\)/);
    assert.match(src, /onChangeRef\.current\('', ''\)/);
  });

  it('fetches options from selectorUrl with Authorization header', () => {
    assert.match(src, /Authorization.*Bearer.*token/);
    assert.match(src, /buildUrlWithParams/);
  });

  it('appends parent filter key to fetch params when dependsOn is configured', () => {
    assert.match(src, /params\[filterKey\] = parentValue/);
  });

  it('auto-selects the first option when the current value is no longer in the refreshed list', () => {
    assert.match(src, /currentValid/);
    assert.match(src, /items\[0\]\.id/);
    assert.match(src, /items\[0\]\.name/);
  });

  it('lazy-loads options on first focus via refreshKey', () => {
    assert.match(src, /onFocus/);
    assert.match(src, /refreshKey/);
    assert.match(src, /loadedForRef/);
  });

  it('uses a local memo filter to narrow options without extra server calls', () => {
    assert.match(src, /filteredOptions/);
    assert.match(src, /useMemo/);
    assert.match(src, /toLowerCase/);
  });

  it('syncs display text from displayValue when the user is not typing', () => {
    assert.match(src, /isEditingRef/);
    assert.match(src, /setQuery\(displayValue/);
  });

  it('opens the dropdown after clearing the selection', () => {
    assert.match(src, /handleClear/);
    assert.match(src, /setOpen\(true\)/);
  });

  it('calls onCreateRequest with current query and an onCreated callback', () => {
    assert.match(src, /handleCreate/);
    assert.match(src, /onCreateRequest\(query/);
  });

  it('optimistically adds the new item and triggers a server refresh after creation', () => {
    assert.match(src, /setOptions\(prev/);
    assert.match(src, /setRefreshKey\(k => k \+ 1\)/);
  });

  it('renders the create action pinned at the top of the dropdown', () => {
    // Extracted into the CreateAction sub-component (cognitive-complexity refactor) —
    // same gating condition (createLabel present AND onCreateRequest present), now
    // expressed as an early-return guard instead of an inline && chain.
    assert.match(src, /!createLabel \|\| !onCreateRequest/);
    assert.match(src, /handleCreate/);
  });

  it('shows a clear (X) button when a value is selected', () => {
    assert.match(src, /hasSelection/);
    assert.match(src, /handleClear/);
    // ETP-4000: the X is rendered by the shared SelectorChip component
    // (extracted from this file and SearchInput to satisfy Sonar duplication).
    assert.match(src, /import \{ SelectorChip \} from '\.\/SelectorChip\.jsx'/);
    assert.match(src, /<SelectorChip[\s\S]*?onClear=\{handleClear\}/);
  });

  it('shows a no-results message when the filter matches nothing', () => {
    assert.match(src, /filteredOptions\.length === 0/);
    assert.match(src, /noResultsFor/);
  });

  it('uses useUI for all user-visible strings', () => {
    assert.match(src, /useUI/);
    assert.match(src, /ui\(/);
  });

  it('uses stable refs so closures can read current values without stale captures', () => {
    assert.match(src, /valueRef/);
    assert.match(src, /onChangeRef/);
    assert.match(src, /useRef/);
  });
});
