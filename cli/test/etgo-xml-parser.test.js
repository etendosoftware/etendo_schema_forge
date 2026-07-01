import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseEtgoXmlText, indexByNaturalKey } from '../src/lib/etgo-xml-parser.js';

describe('etgo-xml-parser', () => {
  describe('parseEtgoXmlText', () => {
    it('parses a single record with CDATA values', () => {
      const xml = `
<data>
<!--ABC123--><ETGO_SF_SPEC>
<!--ABC123-->  <ETGO_SF_SPEC_ID><![CDATA[ABC123]]></ETGO_SF_SPEC_ID>
<!--ABC123-->  <NAME><![CDATA[purchase-order]]></NAME>
<!--ABC123-->  <ISACTIVE><![CDATA[Y]]></ISACTIVE>
</ETGO_SF_SPEC>
</data>`;
      const rows = parseEtgoXmlText(xml, 'ETGO_SF_SPEC');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].ETGO_SF_SPEC_ID, 'ABC123');
      assert.equal(rows[0].NAME, 'purchase-order');
      assert.equal(rows[0].ISACTIVE, 'Y');
    });

    it('parses multiple records', () => {
      const xml = `
<data>
<ETGO_SF_SPEC>
  <NAME><![CDATA[window-a]]></NAME>
</ETGO_SF_SPEC>
<ETGO_SF_SPEC>
  <NAME><![CDATA[window-b]]></NAME>
</ETGO_SF_SPEC>
</data>`;
      const rows = parseEtgoXmlText(xml, 'ETGO_SF_SPEC');
      assert.equal(rows.length, 2);
      assert.equal(rows[0].NAME, 'window-a');
      assert.equal(rows[1].NAME, 'window-b');
    });

    it('handles plain text values (no CDATA)', () => {
      const xml = `
<data>
<MY_TABLE>
  <COL_A>hello</COL_A>
  <COL_B><![CDATA[world]]></COL_B>
</MY_TABLE>
</data>`;
      const rows = parseEtgoXmlText(xml, 'MY_TABLE');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].COL_A, 'hello');
      assert.equal(rows[0].COL_B, 'world');
    });

    it('strips XML comments inside records', () => {
      const xml = `
<data>
<!--UUID1--><ETGO_SF_FIELD>
<!--UUID1-->  <NAME><![CDATA[fieldA]]></NAME>
<!--UUID1-->  <VISIBILITY><![CDATA[editable]]></VISIBILITY>
</ETGO_SF_FIELD>
</data>`;
      const rows = parseEtgoXmlText(xml, 'ETGO_SF_FIELD');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].NAME, 'fieldA');
      assert.equal(rows[0].VISIBILITY, 'editable');
    });

    it('returns empty array when no matching records', () => {
      const xml = '<data><OTHER_TABLE><X>1</X></OTHER_TABLE></data>';
      const rows = parseEtgoXmlText(xml, 'ETGO_SF_SPEC');
      assert.deepEqual(rows, []);
    });

    it('handles empty CDATA', () => {
      const xml = `
<data>
<MY_TABLE>
  <COL><![CDATA[]]></COL>
</MY_TABLE>
</data>`;
      const rows = parseEtgoXmlText(xml, 'MY_TABLE');
      assert.equal(rows[0].COL, '');
    });

    it('handles CDATA with special characters', () => {
      const xml = `
<data>
<MY_TABLE>
  <EXPR><![CDATA[@DocumentStatus@ = 'CO']]></EXPR>
</MY_TABLE>
</data>`;
      const rows = parseEtgoXmlText(xml, 'MY_TABLE');
      assert.equal(rows[0].EXPR, "@DocumentStatus@ = 'CO'");
    });
  });

  describe('indexByNaturalKey', () => {
    it('indexes rows by a key function', () => {
      const rows = [
        { NAME: 'alpha', VALUE: '1' },
        { NAME: 'beta', VALUE: '2' },
      ];
      const index = indexByNaturalKey(rows, (r) => r.NAME);
      assert.equal(index.size, 2);
      assert.equal(index.get('alpha').VALUE, '1');
      assert.equal(index.get('beta').VALUE, '2');
    });

    it('skips rows with null/undefined/empty keys', () => {
      const rows = [
        { NAME: 'valid', VALUE: '1' },
        { NAME: null, VALUE: '2' },
        { NAME: undefined, VALUE: '3' },
        { NAME: '', VALUE: '4' },
      ];
      const index = indexByNaturalKey(rows, (r) => r.NAME);
      assert.equal(index.size, 1);
      assert.ok(index.has('valid'));
    });

    it('last row wins on duplicate keys', () => {
      const rows = [
        { NAME: 'dup', VALUE: 'first' },
        { NAME: 'dup', VALUE: 'second' },
      ];
      const index = indexByNaturalKey(rows, (r) => r.NAME);
      assert.equal(index.size, 1);
      assert.equal(index.get('dup').VALUE, 'second');
    });

    it('returns empty Map for empty input', () => {
      const index = indexByNaturalKey([], (r) => r.NAME);
      assert.equal(index.size, 0);
    });
  });
});
