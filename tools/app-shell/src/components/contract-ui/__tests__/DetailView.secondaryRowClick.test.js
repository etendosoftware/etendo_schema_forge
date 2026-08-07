import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'DetailView.jsx'), 'utf8');
const helpersSrc = readFileSync(join(__dirname, '..', 'detailViewHelpers.jsx'), 'utf8');
const secondaryTabSrc = readFileSync(join(__dirname, '..', 'SecondaryTableTab.jsx'), 'utf8');

describe('DetailView — secondary tab row click on inline-editable layouts', () => {
  it('resolveSecondaryRowClickHandler short-circuits to undefined when linesLayout is inlineEditable', () => {
    // Function definition now lives in detailViewHelpers.jsx (extracted from DetailView).
    assert.match(
      helpersSrc,
      /function resolveSecondaryRowClickHandler\(st, \{ openCustomModal, openSecondaryLine, linesLayout \}\)/,
      'helper signature must accept linesLayout so it can gate the side-panel behavior',
    );
    assert.match(
      helpersSrc,
      /if \(st\.Form && linesLayout !== ['"]inlineEditable['"]\) return openSecondaryLine/,
      'helper must return openSecondaryLine only when the layout is NOT inline-editable',
    );
  });

  it('passes linesLayout into resolveSecondaryRowClickHandler at the secondary-tab call site', () => {
    // The call site lives inside the extracted SecondaryTableTab component, so it
    // reads `props.st` and threads `linesLayout: props.linesLayout` (instead of the
    // pre-extraction bare `st` / `linesLayout` shorthand). Either form is accepted.
    assert.match(
      secondaryTabSrc,
      /onRowClick=\{resolveSecondaryRowClickHandler\((?:props\.)?st, \{[\s\S]*?linesLayout(?::\s*props\.linesLayout)?,?\s*\}\)\}/,
      'call site must thread the active linesLayout so inline-editable tabs do not open the side panel',
    );
  });
});
