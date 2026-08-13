import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import {
  goClientSampledataDir,
  parseSourcedata,
  buildSourcedata,
} from '../src/data-fixes/lib/sampledata-xml.js';

describe('goClientSampledataDir', () => {
  it('builds the GOClient sampledata path under the etendo root', () => {
    const dir = goClientSampledataDir('/etendo');
    assert.equal(
      dir,
      ['', 'etendo', 'modules', 'com.etendoerp.go', 'referencedata', 'sampledata', 'GOClient'].join(sep),
    );
  });
});

describe('parseSourcedata', () => {
  let tmp;

  before(() => {
    tmp = mkdtempSync(join(tmpdir(), 'sampledata-xml-test-'));
  });

  after(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function writeXml(name, body) {
    const file = join(tmp, name);
    writeFileSync(file, body, 'utf8');
    return file;
  }

  it('extracts CDATA field values and preserves __raw', () => {
    const record = '<AD_CLIENT><AD_CLIENT_ID><![CDATA[abc]]></AD_CLIENT_ID><NAME><![CDATA[Acme]]></NAME></AD_CLIENT>';
    const file = writeXml('AD_CLIENT.xml', `<?xml version='1.0'?>\n<data>\n${record}\n</data>\n`);
    const { tag, records } = parseSourcedata(file);
    assert.equal(tag, 'AD_CLIENT');
    assert.equal(records.length, 1);
    assert.equal(records[0].AD_CLIENT_ID, 'abc');
    assert.equal(records[0].NAME, 'Acme');
    assert.equal(records[0].__raw, record);
  });

  it("treats <FIELD/> and <FIELD></FIELD> as empty string", () => {
    const record = '<T><A/><B></B><C><![CDATA[v]]></C></T>';
    const file = writeXml('T.xml', `<data>${record}</data>`);
    const { records } = parseSourcedata(file);
    assert.equal(records[0].A, '');
    assert.equal(records[0].B, '');
    assert.equal(records[0].C, 'v');
  });

  it('derives the record tag from the filename by default', () => {
    const file = writeXml('AD_ORG.xml', '<data><AD_ORG><X><![CDATA[1]]></X></AD_ORG></data>');
    const { tag, records } = parseSourcedata(file);
    assert.equal(tag, 'AD_ORG');
    assert.equal(records.length, 1);
  });

  it('honours an explicit tag argument over the filename', () => {
    const file = writeXml('whatever.xml', '<data><CUSTOM><X><![CDATA[1]]></X></CUSTOM></data>');
    const { tag, records } = parseSourcedata(file, 'CUSTOM');
    assert.equal(tag, 'CUSTOM');
    assert.equal(records.length, 1);
    assert.equal(records[0].X, '1');
  });

  it('returns an empty record list when no records match', () => {
    const file = writeXml('EMPTY.xml', '<data></data>');
    const { records } = parseSourcedata(file);
    assert.deepEqual(records, []);
  });

  it('does not let a later empty tag overwrite a CDATA value of the same name', () => {
    // NAME appears first as CDATA then as an empty self-closing tag: the CDATA
    // value must win (the empty-field pass only fills names not already set).
    const record = '<T><NAME><![CDATA[Acme]]></NAME><NAME/></T>';
    const file = writeXml('DUP.xml', `<data>${record}</data>`);
    const { records } = parseSourcedata(file, 'T');
    assert.equal(records[0].NAME, 'Acme');
  });

  it('parses multiple records', () => {
    const r1 = '<T><A><![CDATA[1]]></A></T>';
    const r2 = '<T><A><![CDATA[2]]></A></T>';
    const file = writeXml('MULTI.xml', `<data>${r1}${r2}</data>`);
    const { records } = parseSourcedata(file, 'T');
    assert.equal(records.length, 2);
    assert.equal(records[0].A, '1');
    assert.equal(records[1].A, '2');
  });
});

describe('buildSourcedata', () => {
  it('wraps records in the xml + data envelope joined by blank lines', () => {
    const out = buildSourcedata(['<T><A>1</A></T>', '<T><A>2</A></T>']);
    assert.equal(
      out,
      "<?xml version='1.0' encoding='UTF-8'?>\n<data>\n<T><A>1</A></T>\n\n<T><A>2</A></T>\n</data>\n",
    );
  });

  it('handles a single record', () => {
    const out = buildSourcedata(['<T><A>1</A></T>']);
    assert.equal(
      out,
      "<?xml version='1.0' encoding='UTF-8'?>\n<data>\n<T><A>1</A></T>\n</data>\n",
    );
  });
});

describe('parse + rebuild round-trip', () => {
  let tmp;

  before(() => {
    tmp = mkdtempSync(join(tmpdir(), 'sampledata-roundtrip-test-'));
  });

  after(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('preserves raw records through parse then build', () => {
    const r1 = '<T><A><![CDATA[1]]></A></T>';
    const r2 = '<T><A><![CDATA[2]]></A></T>';
    const file = join(tmp, 'RT.xml');
    writeFileSync(file, buildSourcedata([r1, r2]), 'utf8');

    const { records } = parseSourcedata(file, 'T');
    const rebuilt = buildSourcedata(records.map(r => r.__raw));
    assert.equal(rebuilt, buildSourcedata([r1, r2]));
  });
});
