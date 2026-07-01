import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseJrxml, buildContract, buildMigrationNotes } from '../src/extract-from-jasper.js';

const SAMPLE_JRXML = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="OrderReport" pageWidth="842" pageHeight="595" orientation="Landscape">
  <parameter name="dateFrom" class="java.util.Date" isForPrompting="true"/>
  <parameter name="dateTo" class="java.util.Date"/>
  <field name="documentno" class="java.lang.String"/>
  <field name="grandtotal" class="java.math.BigDecimal"/>
  <field name="dateordered" class="java.util.Date"/>
  <field name="bpartner" class="java.lang.String"/>
  <queryString language="SQL"><![CDATA[SELECT documentno, grandtotal, dateordered, bpartner FROM c_order WHERE 1=1]]></queryString>
  <group name="ByPartner">
    <groupExpression><![CDATA[$F{bpartner}]]></groupExpression>
    <groupHeader>
      <band>
        <staticText><text><![CDATA[Partner]]></text></staticText>
        <textFieldExpression><![CDATA[$F{bpartner}]]></textFieldExpression>
      </band>
    </groupHeader>
  </group>
  <detail>
    <band>
      <textFieldExpression><![CDATA[$F{documentno}]]></textFieldExpression>
      <textFieldExpression><![CDATA[$F{grandtotal}]]></textFieldExpression>
      <textFieldExpression><![CDATA[$F{dateordered}]]></textFieldExpression>
    </band>
  </detail>
</jasperReport>`;

describe('extract-from-jasper', () => {
  describe('parseJrxml', () => {
    it('extracts report name', () => {
      const r = parseJrxml(SAMPLE_JRXML);
      assert.equal(r.name, 'OrderReport');
    });

    it('detects landscape orientation', () => {
      const r = parseJrxml(SAMPLE_JRXML);
      assert.equal(r.orientation, 'landscape');
    });

    it('extracts page dimensions', () => {
      const r = parseJrxml(SAMPLE_JRXML);
      assert.equal(r.pageWidth, 842);
      assert.equal(r.pageHeight, 595);
    });

    it('extracts fields with types', () => {
      const r = parseJrxml(SAMPLE_JRXML);
      assert.equal(r.fields.length, 4);
      assert.equal(r.fields[0].name, 'documentno');
      assert.equal(r.fields[0].type, 'string');
      assert.equal(r.fields[1].name, 'grandtotal');
      assert.equal(r.fields[1].type, 'amount');
    });

    it('extracts parameters', () => {
      const r = parseJrxml(SAMPLE_JRXML);
      assert.equal(r.parameters.length, 2);
      assert.equal(r.parameters[0].name, 'dateFrom');
      assert.equal(r.parameters[0].type, 'date');
      assert.equal(r.parameters[0].isForPrompting, true);
    });

    it('extracts SQL query', () => {
      const r = parseJrxml(SAMPLE_JRXML);
      assert.ok(r.query.includes('SELECT documentno'));
      assert.equal(r.queryLanguage, 'SQL');
    });

    it('extracts groups with field references', () => {
      const r = parseJrxml(SAMPLE_JRXML);
      assert.equal(r.groups.length, 1);
      assert.equal(r.groups[0].name, 'ByPartner');
      assert.equal(r.groups[0].fieldRef, 'bpartner');
    });

    it('extracts detail fields', () => {
      const r = parseJrxml(SAMPLE_JRXML);
      assert.ok(r.detailFields.includes('documentno'));
      assert.ok(r.detailFields.includes('grandtotal'));
    });

    it('extracts group header labels', () => {
      const r = parseJrxml(SAMPLE_JRXML);
      assert.ok(r.groups[0].headerLabels.includes('Partner'));
    });

    it('handles minimal XML', () => {
      const r = parseJrxml('<jasperReport name="Empty"></jasperReport>');
      assert.equal(r.name, 'Empty');
      assert.equal(r.fields.length, 0);
    });

    it('detects portrait for tall pages', () => {
      const r = parseJrxml('<jasperReport name="T" pageWidth="595" pageHeight="842"></jasperReport>');
      assert.equal(r.orientation, 'portrait');
    });
  });

  describe('buildContract', () => {
    it('generates contract from parsed JRXML', () => {
      const parsed = parseJrxml(SAMPLE_JRXML);
      const contract = buildContract(parsed);
      assert.ok(contract.reportId);
      assert.ok(contract.title);
      assert.equal(contract.orientation, 'landscape');
      assert.ok(contract.columns.length > 0);
    });

    it('uses custom reportId and title', () => {
      const parsed = parseJrxml(SAMPLE_JRXML);
      const contract = buildContract(parsed, { reportId: 'custom-id', title: 'Custom Title' });
      assert.equal(contract.reportId, 'custom-id');
      // title is a locale object { en_US, es_ES }
      assert.equal(contract.title.en_US, 'Custom Title');
    });

    it('sets type to grouped-listing when groups exist', () => {
      const parsed = parseJrxml(SAMPLE_JRXML);
      const contract = buildContract(parsed);
      assert.equal(contract.type, 'grouped-listing');
    });

    it('sets type to listing when no groups', () => {
      const parsed = parseJrxml('<jasperReport name="Flat"><detail><band><textFieldExpression><![CDATA[$F{x}]]></textFieldExpression></band></detail></jasperReport>');
      const contract = buildContract(parsed);
      assert.equal(contract.type, 'listing');
    });
  });

  describe('buildMigrationNotes', () => {
    it('generates markdown notes', () => {
      const parsed = parseJrxml(SAMPLE_JRXML);
      const contract = buildContract(parsed);
      const notes = buildMigrationNotes(parsed, contract);
      assert.ok(notes.includes('OrderReport'));
      assert.ok(notes.includes('SQL'));
    });
  });
});
