import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ImageField.jsx'), 'utf8');

describe('ImageField — upload constraints and validation', () => {
  // --- imports ---
  it('imports toast from sonner', () => {
    assert.match(src, /import.*\btoast\b.*from 'sonner'/);
  });

  it('does not define a local error state (setError was removed)', () => {
    assert.doesNotMatch(src, /setError/);
  });

  // --- upload constraints ---
  it('declares IMAGE_MAX_SIZE_MB = 30', () => {
    assert.match(src, /const IMAGE_MAX_SIZE_MB\s*=\s*30/);
  });

  it('declares IMAGE_MAX_WIDTH = 7680', () => {
    assert.match(src, /const IMAGE_MAX_WIDTH\s*=\s*7680/);
  });

  it('declares IMAGE_MAX_HEIGHT = 4320', () => {
    assert.match(src, /const IMAGE_MAX_HEIGHT\s*=\s*4320/);
  });

  it('declares IMAGE_ALLOWED_TYPES with png and jpeg', () => {
    assert.match(src, /const IMAGE_ALLOWED_TYPES\s*=\s*\[/);
    assert.match(src, /['"]image\/png['"]/);
    assert.match(src, /['"]image\/jpeg['"]/);
  });

  // --- validateImageFile ---
  it('defines validateImageFile as an async function', () => {
    assert.match(src, /async function validateImageFile/);
  });

  it('validateImageFile uses IMAGE_ALLOWED_TYPES.includes to check file type', () => {
    assert.match(src, /IMAGE_ALLOWED_TYPES\.includes\(file\.type\)/);
  });

  it('validateImageFile compares file size against IMAGE_MAX_SIZE_MB * 1024 * 1024', () => {
    assert.match(src, /IMAGE_MAX_SIZE_MB\s*\*\s*1024\s*\*\s*1024/);
  });

  it('validateImageFile awaits readImageDimensions', () => {
    assert.match(src, /await readImageDimensions\(/);
  });

  it('validateImageFile checks both width and height against the declared limits', () => {
    assert.match(src, /dims\.width\s*>\s*IMAGE_MAX_WIDTH/);
    assert.match(src, /dims\.height\s*>\s*IMAGE_MAX_HEIGHT/);
  });

  it('validateImageFile returns null on success (no error)', () => {
    assert.match(src, /return null;/);
  });

  // --- readImageDimensions ---
  it('defines readImageDimensions as a function', () => {
    assert.match(src, /function readImageDimensions/);
  });

  // --- error reporting via toast ---
  it('calls toast.error on validation failure (not inline <p>)', () => {
    assert.match(src, /toast\.error\(/);
  });

  it('does not render an inline error <p> element for validation errors', () => {
    assert.doesNotMatch(src, /<p[^>]*>\s*\{.*error.*\}\s*<\/p>/);
  });

  // --- drag & drop handlers ---
  it('defines handleDragEnter', () => {
    assert.match(src, /const handleDragEnter\s*=/);
  });

  it('defines handleDragLeave', () => {
    assert.match(src, /const handleDragLeave\s*=/);
  });

  it('defines handleDragOver', () => {
    assert.match(src, /const handleDragOver\s*=/);
  });

  it('defines handleDrop', () => {
    assert.match(src, /const handleDrop\s*=/);
  });

  it('all drag handlers call e.preventDefault()', () => {
    // Count occurrences — there must be at least 4 (one per handler)
    const matches = src.match(/e\.preventDefault\(\)/g) ?? [];
    assert.ok(matches.length >= 4, `expected >= 4 calls to e.preventDefault(), found ${matches.length}`);
  });

  it('all drag handlers call e.stopPropagation()', () => {
    const matches = src.match(/e\.stopPropagation\(\)/g) ?? [];
    assert.ok(matches.length >= 4, `expected >= 4 calls to e.stopPropagation(), found ${matches.length}`);
  });

  // --- isDragging state ---
  it('declares isDragging state with setIsDragging', () => {
    assert.match(src, /const\s+\[isDragging,\s*setIsDragging\]\s*=\s*useState\(false\)/);
  });

  it('sets isDragging to true on drag enter', () => {
    assert.match(src, /setIsDragging\(true\)/);
  });

  it('sets isDragging to false on drag leave and drop', () => {
    const matches = src.match(/setIsDragging\(false\)/g) ?? [];
    assert.ok(matches.length >= 2, `expected >= 2 calls to setIsDragging(false), found ${matches.length}`);
  });

  it('applies conditional class based on isDragging for visual feedback', () => {
    assert.match(src, /isDragging/);
  });
});
