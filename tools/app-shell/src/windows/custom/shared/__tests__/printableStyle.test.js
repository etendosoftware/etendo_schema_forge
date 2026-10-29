// ETP-5988 — the common appearance options of a printable, as CSS appended after the design's own.
// @covers tools/app-shell/src/windows/custom/shared/printableStyle.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  documentStyleCss, isCurrentDesign, isHexColor, readableInk, resolveListingCss, softTint,
} from '../printableStyle.js';

describe('printableStyle — color', () => {
  it('accepts only an exact #RRGGBB', () => {
    for (const ok of ['#000000', '#1A73E8', '#1a73e8']) assert.equal(isHexColor(ok), true, ok);
    for (const bad of ['red', '#FFF', '#12345G', '#1234567', '123456', '#123456;}', '#123456\n', null, 7, undefined]) {
      assert.equal(isHexColor(bad), false, String(bad));
    }
  });

  it('derives a very light tint and a readable ink from the color', () => {
    assert.equal(softTint('#000000'), '#E6E6E6');
    assert.equal(softTint('#FFFFFF'), '#FFFFFF');
    assert.equal(readableInk('#111827'), '#111827');
    // a light yellow would print unreadable text: it is darkened until it reads on white
    assert.notEqual(readableInk('#FFE600'), '#FFE600');
    assert.match(readableInk('#FFE600'), /^#[0-9A-F]{6}$/);
  });
});

describe('printableStyle — documents', () => {
  it('adds nothing when no option is set, so the document is the current one', () => {
    assert.equal(documentStyleCss(null), '');
    assert.equal(documentStyleCss({ variant: 'classic' }), '');
    assert.equal(documentStyleCss({ variant: 'modern', color: null, font: null, fontSize: null, rowStripes: null }), '');
  });

  it('applies the base color to accents, never to the Verifactu QR', () => {
    const css = documentStyleCss({ color: '#0F766E' });
    assert.match(css, /--accent: #0F766E/);
    assert.match(css, /--accent-soft: #E7F1F0|--accent-soft: #[0-9A-F]{6}/);
    assert.match(css, /\.inv-table thead th/);
    assert.equal(/verifactu/i.test(css), false);
  });

  it('ignores a color that is not #RRGGBB instead of writing it into the stylesheet', () => {
    assert.equal(documentStyleCss({ color: 'red; } body { display:none' }), '');
    assert.equal(documentStyleCss({ color: '#12345G' }), '');
  });

  it('sets the font family, the large text size and the striped rows', () => {
    assert.match(documentStyleCss({ font: 'serif' }), /--font-sans: Georgia/);
    assert.match(documentStyleCss({ font: 'mono' }), /--font-sans: 'SF Mono'/);
    assert.equal(documentStyleCss({ font: 'sans' }), '');
    assert.match(documentStyleCss({ fontSize: 'large' }), /font-size: 15px/);
    assert.match(documentStyleCss({ fontSize: 'small' }), /font-size: 11px/);
    assert.equal(documentStyleCss({ fontSize: 'normal' }), '');
    assert.match(documentStyleCss({ rowStripes: 'on' }), /nth-child\(even\) td \{ background: #F6F7F9/);
    assert.match(documentStyleCss({ rowStripes: 'on', color: '#0F766E' }), /nth-child\(even\) td \{ background: #[0-9A-F]{6}/);
    assert.equal(documentStyleCss({ rowStripes: 'off' }), '');
  });
});

describe('printableStyle — list print', () => {
  const BASE = '.report-table { width: 100%; }';

  it('returns the very same CSS when there is no configuration', () => {
    assert.equal(resolveListingCss(null, BASE), BASE);
    assert.equal(resolveListingCss(undefined, BASE), BASE);
  });

  it('a configured list print has no alternating rows unless they are asked for', () => {
    const NO_STRIPES = /nth-child\(even\) \{ background: transparent/;
    assert.match(resolveListingCss({ variant: 'classic' }, BASE), NO_STRIPES);
    assert.match(resolveListingCss({ variant: 'classic', rowStripes: 'off' }, BASE), NO_STRIPES);
    assert.doesNotMatch(resolveListingCss({ variant: 'classic', rowStripes: 'on' }, BASE), NO_STRIPES);
  });

  it('compact tightens the layout, modern carries its own accent', () => {
    assert.match(resolveListingCss({ variant: 'compact' }, BASE), /variant: compact/);
    const modern = resolveListingCss({ variant: 'modern' }, BASE);
    assert.match(modern, /#2F5BEA/);
    assert.match(modern, /\.report-table thead th/);
  });

  it('a chosen color wins over the variant accent', () => {
    const css = resolveListingCss({ variant: 'modern', color: '#B91C1C' }, BASE);
    assert.match(css, /#B91C1C/);
    assert.equal(css.includes('#2F5BEA'), false);
  });

  it('small text shrinks the list, large grows it', () => {
    assert.match(resolveListingCss({ variant: 'classic', fontSize: 'small' }, BASE), /font-size: 8\.5pt/);
    assert.match(resolveListingCss({ variant: 'classic', fontSize: 'large' }, BASE), /font-size: 12pt/);
    assert.doesNotMatch(resolveListingCss({ variant: 'classic', fontSize: 'normal' }, BASE), /style: (small|large) text/);
  });

  it('the show-logo option adds the logo style, and only when on', () => {
    const css = resolveListingCss({ variant: 'classic', showLogo: 'on' }, BASE);
    assert.match(css, /\.report-logo/);
    // the logo sits to the LEFT of the title: a row, not a stack
    assert.match(css, /\.report-brand \{ display: flex; align-items: center/);
    assert.doesNotMatch(resolveListingCss({ variant: 'classic', showLogo: 'off' }, BASE), /report-logo/);
    assert.doesNotMatch(resolveListingCss({ variant: 'classic', showLogo: null }, BASE), /report-logo/);
  });

  it('applies font, large text and no stripes; refuses a hostile color', () => {
    const css = resolveListingCss({ variant: 'classic', font: 'serif', fontSize: 'large', rowStripes: 'off' }, BASE);
    assert.match(css, /font-family: Georgia/);
    assert.match(css, /font-size: 12pt/);
    assert.doesNotMatch(resolveListingCss({ variant: 'classic', color: 'red;}' }, BASE), /red/);
  });
});

describe('printableStyle — isCurrentDesign', () => {
  it('is true only when nothing at all is set', () => {
    assert.equal(isCurrentDesign(null), true);
    assert.equal(isCurrentDesign({ variant: 'classic', color: null, font: null, fontSize: null, rowStripes: null, logo: null, footerText: null }), true);
    assert.equal(isCurrentDesign({ variant: 'modern' }), false);
    assert.equal(isCurrentDesign({ variant: 'classic', showLogo: 'on' }), false);
    assert.equal(isCurrentDesign({ variant: 'classic', showLogo: 'off' }), true);
    assert.equal(isCurrentDesign({ variant: 'classic', color: '#112233' }), false);
    assert.equal(isCurrentDesign({ variant: 'classic', footerText: 'x' }), false);
  });
});
