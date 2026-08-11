import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeImageName } from '../imageUpload.js';

describe('sanitizeImageName', () => {
  it('leaves short names untouched', () => {
    assert.equal(sanitizeImageName('logo.png'), 'logo.png');
  });

  it('returns the input unchanged when it is falsy', () => {
    assert.equal(sanitizeImageName(''), '');
    assert.equal(sanitizeImageName(null), null);
    assert.equal(sanitizeImageName(undefined), undefined);
  });

  it('truncates a name longer than 60 chars while preserving the extension', () => {
    // Real filename from the AD_Image 500 bug report (ETP-4749): 72 chars.
    const longName = 'Captura_de_pantalla_2026-07-28_a_las_10.02.31_a._m._2_optimized_2000.png';
    assert.equal(longName.length, 72);

    const result = sanitizeImageName(longName);

    assert.ok(result.length <= 60, `expected <= 60 chars, got ${result.length}`);
    assert.ok(result.endsWith('.png'), 'extension must be preserved');
  });

  it('respects a custom maxLength', () => {
    const result = sanitizeImageName('a-fairly-long-filename.jpg', 10);
    assert.equal(result.length, 10);
    assert.ok(result.endsWith('.jpg'));
  });

  it('falls back to plain truncation when there is no real extension', () => {
    const noExt = 'a'.repeat(70);
    const result = sanitizeImageName(noExt);
    assert.equal(result.length, 60);
  });

  it('treats a leading dot (dotfile-style name, no real extension) as having no extension', () => {
    const dotfile = '.' + 'a'.repeat(70);
    const result = sanitizeImageName(dotfile);
    assert.equal(result.length, 60);
  });
});
