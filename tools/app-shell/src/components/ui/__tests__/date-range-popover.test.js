// ETP-4771 — regression test for the invisible "Aplicar" button text on hover.
//
// Root cause: in the light theme, `--primary` and `--foreground` resolve to the
// EXACT SAME HSL value (222 47% 11%). The Aplicar button paired
// `hover:bg-primary` with `hover:text-foreground` — on hover, background and
// text collapse to the same color and the label disappears.
//
// Fix under test: the hover state uses the brand-yellow highlight tokens
// (`hover:bg-accent-highlight` / `hover:text-accent-highlight-foreground`) —
// the same convention already shipped for this exact bug in ETP-4767 and used
// by the shared month/year-picker chrome's PickerGrid (ETP-4771 Case 2 below),
// so hover feedback is consistent across every date picker in the app.
//
// This is a source-reading test (no render/mount) — it inspects the raw JSX
// text for the exact className string on the Aplicar button only, anchored
// on its distinguishing `onClick={handleApplyCustom}` prop so it cannot be
// satisfied by any other button in the file.

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

  it('pairs hover:bg-accent-highlight with hover:text-accent-highlight-foreground (the fix)', () => {
    const className = applyButtonMatch[1];
    assert.match(
      className,
      /hover:bg-accent-highlight\s+hover:text-accent-highlight-foreground\b/,
      'Aplicar button hover state should use the brand-yellow highlight tokens ' +
        '(hover:bg-accent-highlight / hover:text-accent-highlight-foreground) — the same ' +
        'convention ETP-4767 shipped for this bug and the shared date-picker chrome already uses, ' +
        'so it is guaranteed distinct from the base state in both light and dark theme.',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ETP-4771 Case 2 — CalendarWithPicker must reuse the shared month/year-picker
// chrome (HeaderRow, PickerTabs, PickerGrid) from date-picker-chrome.jsx
// instead of reimplementing the header/nav/tabs/grid markup locally.
//
// This is the "commit 1" of the two-commit bug-workflow pattern: these
// assertions describe the POST-FIX state and are expected to FAIL against
// the current (pre-fix) source, which still declares its own local
// `FilterNavBtn` and its own inline header/tab/grid JSX. A second commit
// will rewrite CalendarWithPicker to import and use the shared chrome,
// making these pass.
//
// Deliberately source-reading only (no render/mount): the shared chrome
// file lives in the sibling schema_forge_core repo and is not yet part of
// the published @etendosoftware/app-shell-core version this repo installs
// (pinned below the change) — a test that imports/renders it would only
// resolve under the opt-in LOCAL_CORE=1 profile, not the default one CI
// uses. See docs/repo-topology.md.
// ─────────────────────────────────────────────────────────────────────────────

// Import statement (if any) pulling names from the shared chrome file.
const chromeImportMatch = src.match(
  /import\s*\{([^}]*)\}\s*from\s*['"]@etendosoftware\/app-shell-core\/components\/ui\/date-picker-chrome\.jsx['"]/,
);

// The CalendarWithPicker function body, isolated so JSX assertions don't
// accidentally match something in DateRangePopoverContent above it.
const calendarWithPickerMatch = src.match(
  /function CalendarWithPicker\([\s\S]*$/,
);

describe('CalendarWithPicker — reuses the shared date-picker-chrome (ETP-4771 Case 2)', () => {
  it('does NOT declare its own local FilterNavBtn (must reuse the shared chrome\'s NavButton instead)', () => {
    assert.doesNotMatch(
      src,
      /function FilterNavBtn\(/,
      'CalendarWithPicker must not reimplement its own nav-button component — ' +
        'it should use NavButton (via HeaderRow) from the shared date-picker-chrome.jsx.',
    );
  });

  it('imports HeaderRow, PickerTabs and PickerGrid from the shared date-picker-chrome.jsx', () => {
    assert.ok(
      chromeImportMatch,
      "Expected an import from '@etendosoftware/app-shell-core/components/ui/date-picker-chrome.jsx'",
    );
    const importedNames = chromeImportMatch[1];
    assert.match(importedNames, /\bHeaderRow\b/);
    assert.match(importedNames, /\bPickerTabs\b/);
    assert.match(importedNames, /\bPickerGrid\b/);
  });

  it('renders the shared HeaderRow, PickerTabs and PickerGrid in its JSX (not inline reimplementations)', () => {
    assert.ok(calendarWithPickerMatch, 'Expected to find the CalendarWithPicker function in the source');
    const body = calendarWithPickerMatch[0];
    assert.match(body, /<HeaderRow\b/);
    assert.match(body, /<PickerTabs\b/);
    assert.match(body, /<PickerGrid\b/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ETP-4771 Case 3 — CalendarWithPicker's header label must be computed with
// the same formatMonthYearLabel(date, localeStr) helper the conditional-filter
// date picker (DateField) uses, not a local combined Intl.DateTimeFormat call.
//
// Root cause: `new Intl.DateTimeFormat(localeStr, { month: 'long', year:
// 'numeric' }).format(month)` produces "agosto de 2026" in es-ES — Spanish's
// combined long-month+year format inserts the "de" preposition.
// formatMonthYearLabel formats month and year with two SEPARATE
// Intl.DateTimeFormat calls and joins them with a plain space
// ("Agosto 2026", capitalized, no preposition), matching DateField's header.
//
// Source-reading only, consistent with the rest of this file: the helper
// lives in the sibling schema_forge_core repo, imported via the
// '@etendosoftware/app-shell-core/lib/dateMask.js' subpath.
// ─────────────────────────────────────────────────────────────────────────────

describe('CalendarWithPicker — header label uses formatMonthYearLabel (ETP-4771 Case 3)', () => {
  it("imports formatMonthYearLabel from '@etendosoftware/app-shell-core/lib/dateMask.js'", () => {
    assert.match(
      src,
      /import\s*\{\s*formatMonthYearLabel\s*\}\s*from\s*['"]@etendosoftware\/app-shell-core\/lib\/dateMask\.js['"]/,
      "Expected an import of formatMonthYearLabel from '@etendosoftware/app-shell-core/lib/dateMask.js'",
    );
  });

  it('computes headerLabel by calling formatMonthYearLabel(month, localeStr)', () => {
    assert.ok(calendarWithPickerMatch, 'Expected to find the CalendarWithPicker function in the source');
    const body = calendarWithPickerMatch[0];
    assert.match(
      body,
      /const headerLabel\s*=\s*useMemo\(\s*\(\)\s*=>\s*formatMonthYearLabel\(\s*month\s*,\s*localeStr\s*\)/,
      'headerLabel must be computed via formatMonthYearLabel(month, localeStr), not a local Intl.DateTimeFormat call.',
    );
  });

  it('does NOT reintroduce a combined month+year Intl.DateTimeFormat call for the header label', () => {
    assert.ok(calendarWithPickerMatch, 'Expected to find the CalendarWithPicker function in the source');
    const body = calendarWithPickerMatch[0];
    assert.doesNotMatch(
      body,
      /new Intl\.DateTimeFormat\([^)]*month:\s*['"]long['"][^)]*year:\s*['"]numeric['"]/s,
      'A combined { month: "long", year: "numeric" } Intl.DateTimeFormat call inserts the "de" ' +
        'preposition in es-ES ("agosto de 2026") — the header label must use formatMonthYearLabel instead.',
    );
  });
});
