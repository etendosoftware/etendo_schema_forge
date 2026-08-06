// ETP-4771 — regression test for the invisible "Aplicar" button text on hover.
//
// Root cause: in the light theme, `--primary` and `--foreground` resolve to the
// EXACT SAME HSL value (222 47% 11%). The Aplicar button paired
// `hover:bg-primary` with `hover:text-foreground` — on hover, background and
// text collapse to the same color and the label disappears.
//
// Fix under test: the hover text class must be `hover:text-primary-foreground`
// instead of `hover:text-foreground`, so only the background swaps on hover
// while the text keeps the base-state pairing (`text-primary-foreground`),
// which is guaranteed distinct from `--primary` in BOTH themes.
//
// This is a source-reading test (no render/mount) — it inspects the raw JSX
// text for the exact className string on the Aplicar button only, anchored
// on its distinguishing `onClick={handleApplyCustom}` prop so it cannot be
// satisfied by any other button in the file (e.g. the month/year picker
// button further down shares the same buggy pairing but is NOT in scope here).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'date-range-popover.jsx'), 'utf8');

// Extract the className of the button whose onClick is `handleApplyCustom`
// (the "Aplicar" button), matching from that prop up to its className attr.
const applyButtonMatch = src.match(
  /onClick=\{handleApplyCustom\}[\s\S]*?className="([^"]*)"/,
);

describe('DateRangePopoverContent — Aplicar button hover contrast (ETP-4771)', () => {
  it('finds the Aplicar button (onClick={handleApplyCustom}) in the source', () => {
    assert.ok(applyButtonMatch, 'Expected to find a button with onClick={handleApplyCustom}');
  });

  it('does NOT pair hover:bg-primary with hover:text-foreground (the bug)', () => {
    const className = applyButtonMatch[1];
    assert.doesNotMatch(
      className,
      /hover:bg-primary\s+hover:text-foreground\b/,
      'Aplicar button must not combine hover:bg-primary with hover:text-foreground — ' +
        'both tokens resolve to the same HSL value in the light theme, making the label invisible on hover.',
    );
  });

  it('pairs hover:bg-primary with hover:text-primary-foreground (the fix)', () => {
    const className = applyButtonMatch[1];
    assert.match(
      className,
      /hover:bg-primary\s+hover:text-primary-foreground\b/,
      'Aplicar button hover state should only swap the background (hover:bg-primary) ' +
        'while keeping text on hover:text-primary-foreground, which is distinct from ' +
        '--primary in both light and dark theme.',
    );
  });
});
