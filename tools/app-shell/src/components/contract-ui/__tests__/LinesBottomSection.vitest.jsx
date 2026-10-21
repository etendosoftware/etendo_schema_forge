// @covers tools/app-shell/src/components/contract-ui/LinesBottomSection.jsx
// Footer no-overlap rule (ETP-5756). jsdom has no layout engine, so this guards the
// CSS contract: Totals width is content-relative (never a bare 520px) and the
// Docs/Notes rows wrap their content under the label instead of squeezing it.
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LinesBottomSection, { TOTALS_COLUMN_WIDTH } from '../LinesBottomSection.jsx';

const Docs = () => <div data-testid="docs-chips" />;
const BASE = { data: { documentStatus: 'DR' }, lines: [], notesField: 'description' };

describe('LinesBottomSection footer layout', () => {
  // jsdom drops min()/max()/clamp() declarations, so the formula is guarded by its
  // exported constant and evaluated numerically below.
  const totalsPx = (footerPx) => Math.min(520, Math.max(320, footerPx - 469));

  it('keeps 520px for the Totals column whenever the left column keeps >= 469px', () => {
    expect(TOTALS_COLUMN_WIDTH).toBe('min(520px, max(320px, calc(100% - 469px)))');
    // Windows without a side panel (sales-invoice etc.): footer >= 989px -> unchanged.
    for (const footer of [989, 1000, 1040, 1200, 1500]) expect(totalsPx(footer)).toBe(520);
  });

  // Row box math: left column = footer - totals - 1px divider; row content box = left - 16 (p-2) - 24 (px-3).
  const leftContentBox = (footer) => footer - totalsPx(footer) - 1 - 16 - 24;
  const rowFitsUnwrapped = (footer) => leftContentBox(footer) >= 96 + 12 + 320; // label + gap + content min

  it('floors Totals at 320px in a narrow footer and stacks the label above full-width content (~690px)', () => {
    expect(totalsPx(690)).toBe(320);
    expect(rowFitsUnwrapped(690)).toBe(false); // wraps: label above content
    // Stacked, the content gets the whole row: >= the chip's natural ~300px and its 20rem minimum.
    expect(leftContentBox(690)).toBeGreaterThanOrEqual(320);
    expect(totalsPx(500)).toBe(320);
  });

  it('gives Totals space back before the rows wrap, and never wraps a normal-width footer', () => {
    expect(rowFitsUnwrapped(866)).toBe(true); // Totals ~397px, rows still unwrapped
    expect(rowFitsUnwrapped(989)).toBe(true);
    expect(rowFitsUnwrapped(1000)).toBe(true); // sales-invoice, rail expanded at 1280: 520px Totals, 11px spare
    expect(leftContentBox(1000) - (96 + 12 + 320)).toBe(11);
    for (let footer = 800; footer <= 1600; footer += 7) {
      if (totalsPx(footer) > 320) expect(rowFitsUnwrapped(footer)).toBe(true);
    }
  });

  it('renders the Totals column as a non-shrinking sibling of the left column', () => {
    render(<LinesBottomSection {...BASE} relatedDocuments={Docs} />);
    expect(screen.getByTestId('lines-bottom-totals-column').className).toContain('shrink-0');
  });

  it('lets the Docs and Notes rows wrap content under the label with a readable minimum', () => {
    render(<LinesBottomSection {...BASE} relatedDocuments={Docs} />);
    for (const id of ['lines-bottom-docs-row', 'lines-bottom-notes-row']) {
      expect(screen.getByTestId(id).className).toContain('flex-wrap');
    }
    expect(screen.getByTestId('docs-chips').parentElement.className).toContain('min-w-[20rem]');
    expect(screen.getByTestId('notes-textarea').className).toContain('min-w-[20rem]');
  });

  it('does not render the Totals column when showTotals is false', () => {
    render(<LinesBottomSection {...BASE} showTotals={false} />);
    expect(screen.queryByTestId('lines-bottom-totals-column')).toBeNull();
  });
});
