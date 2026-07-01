import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { SF_PREFIX, MARKERS, PATTERNS } from '../src/custom-section-markers.js';

describe('custom-section-markers', () => {
  describe('SF_PREFIX', () => {
    it('equals @sf-', () => {
      assert.equal(SF_PREFIX, '@sf-');
    });
  });

  describe('MARKERS', () => {
    it('GENERATED_START produces correct marker', () => {
      const marker = MARKERS.GENERATED_START('imports');
      assert.equal(marker, '// @sf-generated-start imports');
    });

    it('GENERATED_END produces correct marker', () => {
      const marker = MARKERS.GENERATED_END('imports');
      assert.equal(marker, '// @sf-generated-end imports');
    });

    it('handles IDs with special characters', () => {
      const marker = MARKERS.GENERATED_START('addLineFields');
      assert.equal(marker, '// @sf-generated-start addLineFields');
    });
  });

  describe('PATTERNS', () => {
    it('GENERATED_START matches and captures ID', () => {
      const match = '// @sf-generated-start imports'.match(PATTERNS.GENERATED_START);
      assert.ok(match, 'should match a valid start marker');
      assert.equal(match[1], 'imports');
    });

    it('GENERATED_END matches and captures ID', () => {
      const match = '// @sf-generated-end imports'.match(PATTERNS.GENERATED_END);
      assert.ok(match, 'should match a valid end marker');
      assert.equal(match[1], 'imports');
    });

    it('GENERATED_START tolerates extra whitespace', () => {
      const match = '//  @sf-generated-start  mySection'.match(PATTERNS.GENERATED_START);
      assert.ok(match, 'should match with extra spaces');
      assert.equal(match[1].trim(), 'mySection');
    });

    it('does not match partial or invalid markers', () => {
      assert.equal('some random code'.match(PATTERNS.GENERATED_START), null);
      assert.equal('/* @sf-generated-start x */'.match(PATTERNS.GENERATED_START), null);
    });

    it('roundtrips: MARKERS output matches PATTERNS', () => {
      const id = 'headerFields';
      const line = MARKERS.GENERATED_START(id);
      const match = line.match(PATTERNS.GENERATED_START);
      assert.ok(match);
      assert.equal(match[1], id);

      const endLine = MARKERS.GENERATED_END(id);
      const endMatch = endLine.match(PATTERNS.GENERATED_END);
      assert.ok(endMatch);
      assert.equal(endMatch[1], id);
    });
  });
});