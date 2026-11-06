// @covers tools/app-shell/src/lib/statusToneOverride.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveStatusTone } from '../statusToneOverride.js';
import { getStatusTone } from '../statusBadge.js';

describe('resolveStatusTone', () => {
  it('passes a declared StatusTag tone through', () => {
    for (const tone of ['success', 'warning', 'destructive', 'caution', 'info', 'neutral']) {
      assert.equal(resolveStatusTone('PR', { PR: tone }), tone, tone);
    }
  });

  it('maps a declared Tag variant to the tone of its colour family', () => {
    const cases = {
      green: 'success', teal: 'success', yellow: 'warning', red: 'destructive',
      orange: 'caution', blue: 'info', neutral: 'neutral',
    };
    for (const [variant, tone] of Object.entries(cases)) {
      assert.equal(resolveStatusTone('XX', { XX: variant }), tone, variant);
    }
  });

  it('overrides the global catalog for a code the column declares', () => {
    // CO is green globally; a column can recolour it.
    assert.equal(getStatusTone('CO'), 'success');
    assert.equal(resolveStatusTone('CO', { CO: 'destructive' }), 'destructive');
  });

  it('falls back to getStatusTone for a code the column does not declare', () => {
    assert.equal(resolveStatusTone('VO', { PR: 'info' }), getStatusTone('VO'));
    assert.equal(resolveStatusTone('VO', { PR: 'info' }), 'destructive');
  });

  it('falls back to getStatusTone for a declared value that is neither a tone nor a Tag variant', () => {
    assert.equal(resolveStatusTone('CO', { CO: 'purple' }), 'success');
    assert.equal(resolveStatusTone('CO', { CO: 'SUCCESS' }), 'success');
    assert.equal(resolveStatusTone('VO', { VO: '' }), 'destructive');
    assert.equal(resolveStatusTone('VO', { VO: 42 }), 'destructive');
    assert.equal(resolveStatusTone('VO', { VO: null }), 'destructive');
  });

  it('does not read inherited keys as declared variants', () => {
    // `toString` lives on Object.prototype: a status named like it must not resolve to a function.
    assert.equal(resolveStatusTone('toString', {}), getStatusTone('toString'));
  });

  it('falls back to getStatusTone when the column has no enumVariants', () => {
    for (const variants of [undefined, null, {}]) {
      assert.equal(resolveStatusTone('CO', variants), 'success');
      assert.equal(resolveStatusTone('IP', variants), 'warning');
      assert.equal(resolveStatusTone('ZZ', variants), 'neutral');
    }
  });
});
