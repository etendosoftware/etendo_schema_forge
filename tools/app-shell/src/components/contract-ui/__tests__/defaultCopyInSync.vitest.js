import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import esES from '@/locales/es_ES.json';

// ETP-5003 — the send modal composes the default subject and message itself, and the module
// composes the same two sentences for a send that carries no edits. Two copies of one string is a
// deliberate trade: it saves a round trip on every open of the modal. It is only safe while they
// agree, and they did not once before — the operator read one subject on screen while the customer
// received another, for long enough that a comment in the Java saying "the two must agree" went
// unnoticed. A comment does not hold two files together; this does.
//
// If this fails, the copy drifted. Fix whichever side is wrong; do not relax the assertion.
const CATALOG = resolve(
  __dirname,
  '../../../../../../../modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/email/render/messages/emails_es_ES.properties',
);

function readCatalog() {
  const entries = new Map();
  for (const line of readFileSync(CATALOG, 'utf8').split('\n')) {
    const match = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (match) entries.set(match[1], match[2].trim());
  }
  return entries;
}

describe('document email default copy stays in sync with the module catalog', () => {
  // The module is a sibling checkout: present on the machine of anyone who edits either copy —
  // which is exactly when drift is introduced — and absent in this repo's own CI, where there is
  // nothing to compare against. The guard therefore runs where it can do its job and stands down
  // where it cannot, rather than turning CI permanently red for a file it cannot see.
  const available = existsSync(CATALOG);

  it.runIf(available)('says the same sentence as document.body', () => {
    const catalogBody = readCatalog().get('document.body');
    // The catalog interpolates by position, the locale by name; compare what a reader sees.
    const asRendered = catalogBody
      .replace('{0}', '{documentType}')
      .replace('{1}', '{documentNo}');

    expect(esES.genericLabels.sendModalDefaultMessage).toBe(asRendered);
  });

  it.runIf(available)('builds the same subject shape as document.subject.withRecipient', () => {
    const catalogSubject = readCatalog().get('document.subject.withRecipient');

    // The modal builds `${documentType} #${documentNo} — ${bpName}` inline; this pins the shape the
    // catalog uses, so a change on the module side surfaces here.
    expect(catalogSubject).toBe('{0} #{1} — {2}');
  });

});
