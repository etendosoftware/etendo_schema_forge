import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getStatusTone } from '../../../lib/statusBadge.js';
import { TONE_STYLES, BASE_STYLE } from '../status-tag-tokens.js';

describe('StatusTag — getStatusTone', () => {
  describe('success tone', () => {
    it('maps CO (Completado) to success', () => assert.equal(getStatusTone('CO'), 'success'));
    it('maps CA (Order Created) to success', () => assert.equal(getStatusTone('CA'), 'success'));
    it('maps PA (Paid) to success', () => assert.equal(getStatusTone('PA'), 'success'));
    it('maps RPPC to success', () => assert.equal(getStatusTone('RPPC'), 'success'));
    it('maps "completed" (lowercase) to success', () => assert.equal(getStatusTone('completed'), 'success'));
    it('maps "booked" to success', () => assert.equal(getStatusTone('booked'), 'success'));
    it('maps "true" to success', () => assert.equal(getStatusTone('true'), 'success'));
  });

  describe('warning tone', () => {
    it('maps IP (In Process) to warning', () => assert.equal(getStatusTone('IP'), 'warning'));
    it('maps UE (Under Evaluation) to warning', () => assert.equal(getStatusTone('UE'), 'warning'));
    it('maps RPAE to warning', () => assert.equal(getStatusTone('RPAE'), 'warning'));
  });

  describe('destructive tone', () => {
    it('maps VO (Voided) to destructive', () => assert.equal(getStatusTone('VO'), 'destructive'));
    it('maps RPVOID to destructive', () => assert.equal(getStatusTone('RPVOID'), 'destructive'));
    it('maps RPVD to destructive', () => assert.equal(getStatusTone('RPVD'), 'destructive'));
    it('maps "voided" (lowercase) to destructive', () => assert.equal(getStatusTone('voided'), 'destructive'));
  });

  describe('neutral tone (default)', () => {
    it('maps DR (Draft) to neutral', () => assert.equal(getStatusTone('DR'), 'neutral'));
    it('maps CL (Closed) to neutral', () => assert.equal(getStatusTone('CL'), 'neutral'));
    it('maps RPAP (Awaiting Execution) to neutral', () => assert.equal(getStatusTone('RPAP'), 'neutral'));
    it('maps unknown code to neutral', () => assert.equal(getStatusTone('XYZ'), 'neutral'));
    it('maps empty string to neutral', () => assert.equal(getStatusTone(''), 'neutral'));
    it('maps null to neutral', () => assert.equal(getStatusTone(null), 'neutral'));
    it('maps undefined to neutral', () => assert.equal(getStatusTone(undefined), 'neutral'));
  });
});

describe('StatusTag — TONE_STYLES Figma tokens', () => {
  it('has all four tones defined', () => {
    assert.ok(TONE_STYLES.success);
    assert.ok(TONE_STYLES.warning);
    assert.ok(TONE_STYLES.destructive);
    assert.ok(TONE_STYLES.neutral);
  });

  it('success uses Figma green palette (#EEFBF4 / #17663A)', () => {
    assert.equal(TONE_STYLES.success.background, '#EEFBF4');
    assert.equal(TONE_STYLES.success.color, '#17663A');
  });

  it('warning uses Figma yellow palette (#FFF9EB / #8A6100)', () => {
    assert.equal(TONE_STYLES.warning.background, '#FFF9EB');
    assert.equal(TONE_STYLES.warning.color, '#8A6100');
  });

  it('destructive uses Figma red palette (#FEF0F4 / #D50B3E)', () => {
    assert.equal(TONE_STYLES.destructive.background, '#FEF0F4');
    assert.equal(TONE_STYLES.destructive.color, '#D50B3E');
  });

  it('neutral uses Figma gray palette (#F5F7F9 / #3F3F50)', () => {
    assert.equal(TONE_STYLES.neutral.background, '#F5F7F9');
    assert.equal(TONE_STYLES.neutral.color, '#3F3F50');
  });
});

describe('StatusTag — BASE_STYLE pill shape', () => {
  it('uses pill border-radius', () => assert.equal(BASE_STYLE.borderRadius, '9999px'));
  it('uses correct padding from Figma', () => assert.equal(BASE_STYLE.padding, '4px 8px'));
  it('uses 12px font size', () => assert.equal(BASE_STYLE.fontSize, '12px'));
  it('uses 400 font weight', () => assert.equal(BASE_STYLE.fontWeight, 400));
});
