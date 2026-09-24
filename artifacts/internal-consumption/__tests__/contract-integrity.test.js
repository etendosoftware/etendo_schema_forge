import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactDir = join(__dirname, '..');

const decisions = JSON.parse(readFileSync(join(artifactDir, 'decisions.json'), 'utf8'));
const contract = JSON.parse(readFileSync(join(artifactDir, 'contract.json'), 'utf8'));
const pageSrc = readFileSync(
  join(artifactDir, 'generated', 'web', 'internal-consumption', 'InternalConsumptionPage.jsx'),
  'utf8',
);

const headerDecisions = decisions.entities.header;
const contractHeader = contract.frontendContract.entities.internalConsumption;

function contractField(name) {
  return contractHeader.fields.find((field) => field.name === name);
}

function menuAction(key) {
  return (decisions.window.menuActions ?? []).find((action) => action.key === key);
}

describe('internal-consumption decisions (ETP-5445)', () => {
  describe('draft mode confirm button', () => {
    it('labels the draft process button with the generic confirm key (TC6)', () => {
      assert.equal(headerDecisions.draftMode.enabled, true);
      assert.equal(headerDecisions.draftMode.label, 'confirm');
    });

    it('disables the confirm button while the document has no lines (TC7)', () => {
      assert.equal(headerDecisions.draftMode.disableWhenEmpty, true);
    });

    it('still completes via processNow=CO', () => {
      assert.equal(headerDecisions.draftMode.processField, 'processNow');
      assert.equal(headerDecisions.draftMode.processValue, 'CO');
      assert.deepEqual(headerDecisions.draftMode.extraParams, { action: 'CO' });
    });
  });

  describe('Post / Unpost menu actions', () => {
    it('declares a post menu action gated on processed and not yet posted', () => {
      const post = menuAction('post');
      assert.ok(post, 'post menuAction missing');
      assert.equal(post.action, 'post');
      assert.equal(post.labelKey, 'post');
      assert.equal(post.visibleWhenFieldTrue, 'processed');
      assert.equal(post.visibleWhenFieldFalse, 'posted');
    });

    it('declares a destructive unpost menu action gated on posted', () => {
      const unpost = menuAction('unpost');
      assert.ok(unpost, 'unpost menuAction missing');
      assert.equal(unpost.action, 'unpost');
      assert.equal(unpost.labelKey, 'unpost');
      assert.equal(unpost.visibleWhenFieldTrue, 'posted');
      assert.equal(unpost.destructive, true);
    });
  });

  describe('backend routing', () => {
    it('routes the header entity through the internal-consumption NeoHandler', () => {
      assert.equal(headerDecisions.javaQualifier, 'internal-consumption');
    });
  });

  describe('posted field', () => {
    it('is no longer hidden as a system field', () => {
      assert.notEqual(headerDecisions.fields.posted.visibility, 'system');
      assert.notEqual(headerDecisions.fields.posted.visibility, 'discarded');
    });

    it('is a read-only grid badge, not a form field', () => {
      const posted = headerDecisions.fields.posted;
      assert.equal(posted.visibility, 'readOnly');
      assert.equal(posted.grid, true);
      assert.equal(posted.form, false);
      assert.equal(posted.badge, true);
    });
  });

  describe('rules', () => {
    it('keeps the PROCESS_Posted rule (posting is supported)', () => {
      assert.ok(decisions.rules.PROCESS_Posted, 'PROCESS_Posted rule missing');
      assert.equal(decisions.rules.PROCESS_Posted.decision, 'Keep');
    });
  });
});

describe('internal-consumption contract.json (ETP-5445)', () => {
  it('propagates the draftMode confirm label and disableWhenEmpty', () => {
    assert.equal(contractHeader.draftMode.label, 'confirm');
    assert.equal(contractHeader.draftMode.disableWhenEmpty, true);
  });

  it('propagates the javaQualifier', () => {
    assert.equal(contractHeader.javaQualifier, 'internal-consumption');
  });

  it('exposes posted as a read-only grid badge', () => {
    const posted = contractField('posted');
    assert.ok(posted, 'posted field missing from contract');
    assert.equal(posted.visibility, 'readOnly');
    assert.equal(posted.grid, true);
    assert.equal(posted.badge, true);
  });
});

describe('internal-consumption generated InternalConsumptionPage.jsx (ETP-5445)', () => {
  it('emits disableWhenEmpty in the draft mode config', () => {
    assert.match(pageSrc, /"disableWhenEmpty":\s*true/);
  });

  it('emits the post menu action with neoAction post', () => {
    assert.match(pageSrc, /\{\s*key:\s*'post'[^}]*neoAction:\s*'post'/);
  });

  it('emits the destructive unpost menu action with neoAction unpost', () => {
    assert.match(pageSrc, /\{\s*key:\s*'unpost'[^}]*destructive:\s*true[^}]*neoAction:\s*'unpost'/);
  });

  it('keeps the custom more-menu content (Void) wired', () => {
    assert.match(pageSrc, /customMenuContent=\{InternalConsumptionActions\}/);
  });
});

// ETP-5445 (W2) — drift guard. The list's bulk and row-hover "Confirmar" hand-copy the body
// the form's draftMode Confirm sends (useEntity.handleSaveAndProcess:
// `{ fieldValues: { [processField]: processValue }, ...(extraParams || {}) }` POSTed to
// `/action/${processField}`). If draftMode changes in decisions.json and the wrapper is not
// updated, the grid would confirm differently from the form. The wrapper is JSX (not
// loadable by plain node --test), so CONFIRM_PARAMS is read from its source text.
describe('internal-consumption list Confirm matches the form draftMode Confirm (ETP-5445)', () => {
  const wrapperSrc = readFileSync(
    join(artifactDir, '..', '..', 'tools', 'app-shell', 'src', 'windows', 'custom', 'internal-consumption', 'index.jsx'),
    'utf8',
  );
  const draftMode = contractHeader.draftMode;

  function wrapperConfirmParams() {
    const m = wrapperSrc.match(/const CONFIRM_PARAMS = (\{[^;]*\});/);
    assert.ok(m, 'CONFIRM_PARAMS literal not found in the wrapper');
    // The literal is a plain object of string constants — evaluate it in isolation.
    return new Function(`return (${m[1]});`)();
  }

  it('the contract header declares an enabled draftMode with a processField', () => {
    assert.equal(draftMode?.enabled, true);
    assert.equal(typeof draftMode.processField, 'string');
  });

  it('CONFIRM_PARAMS equals the body handleSaveAndProcess derives from draftMode', () => {
    const { processField, processValue, extraParams } = draftMode;
    const formBody = { fieldValues: { [processField]: processValue }, ...(extraParams || {}) };
    assert.deepEqual(wrapperConfirmParams(), formBody);
  });

  it('the row entry POSTs to the draftMode processField action', () => {
    assert.match(
      wrapperSrc,
      new RegExp(`/internalConsumption/\\$\\{encodeURIComponent\\(row\\.id\\)\\}/action/${draftMode.processField}\``),
    );
    assert.match(wrapperSrc, /body:\s*CONFIRM_BODY/);
    assert.match(wrapperSrc, /const CONFIRM_BODY = JSON\.stringify\(CONFIRM_PARAMS\)/);
  });

  it('the bulk action targets the draftMode processField with CONFIRM_PARAMS as its body', () => {
    assert.match(
      wrapperSrc,
      new RegExp(`neoActionName:\\s*'${draftMode.processField}',\\s*neoActionBody:\\s*CONFIRM_PARAMS`),
    );
  });

  it('the row URL entity matches the contract header entity name', () => {
    assert.ok(contract.frontendContract.entities.internalConsumption, 'internalConsumption entity missing');
    assert.match(wrapperSrc, /`\/internalConsumption\//);
  });
});
