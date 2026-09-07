import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ETP-5100 guardrail — a business date is never rendered in UTC.
 *
 * Three helpers (MovementsTable, StatementLinesInline, lib/formatSigned) each did
 *
 *   const d = new Date(iso);
 *   new Intl.DateTimeFormat(bcpLocale, { ..., timeZone: 'UTC' }).format(d);
 *
 * on the premise that the backend only ever sent UTC midnight. Two opposite
 * assumptions that cancel out for exactly that one payload — so the whole suite
 * stayed green — and stack the moment a real wall-clock time arrives:
 * `new Date("2026-09-01T22:59:10")` resolves in the HOST's zone, and rendering
 * that instant back in UTC pushed a 22:59 movement to the next day. It then
 * dropped out of the "last 30 days" window entirely.
 *
 * Pinning the formatter to UTC is the anti-pattern, not the cure. A date-only
 * value has no zone to convert between; the canonical helpers read the leading
 * yyyy-MM-dd and build the Date with the LOCAL-time constructor, so no offset
 * arithmetic happens at all:
 *
 *   import { parseCalendarDate, formatCalendarDate } from '@/lib/dateOnly.js';
 *
 * Narrowly scoped on purpose: this only forbids `timeZone: 'UTC'`. Pinning a
 * REAL zone (a scheduling UI showing a booking in the venue's timezone, say) is
 * a different, legitimate thing and is not the subject of this test.
 *
 * Way out, deliberately visible in a diff: a `utc-date-format-ok: <reason>`
 * comment on the line or directly above it, matching the opt-out convention of
 * the neighbouring policy tests.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src');

const OPT_OUT = 'utc-date-format-ok';

// `timeZone: 'UTC'` in any quoting/spacing, including the `"UTC"` form.
const UTC_TIME_ZONE = /timeZone\s*:\s*(['"`])UTC\1/;

function collectSourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      collectSourceFiles(full, acc);
      continue;
    }
    if (!/\.jsx?$/.test(entry)) continue;
    if (/\.(test|vitest)\.jsx?$/.test(entry)) continue;
    acc.push(full);
  }
  return acc;
}

/**
 * Blanks out every comment while preserving the line count, so the anti-pattern
 * quoted in prose does not read as a call site. This matters here more than
 * anywhere: the three fixed helpers each carry a JSDoc block that names
 * `timeZone: 'UTC'` verbatim to explain why it is gone.
 */
function blankComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

function utcFormatLines(source) {
  const lines = source.split('\n');
  const code = blankComments(source).split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!UTC_TIME_ZONE.test(code[i])) continue;
    // The opt-out marker lives in a comment, so it is read from the ORIGINAL lines.
    const nearby = `${lines[i - 2] || ''}\n${lines[i - 1] || ''}\n${lines[i]}`;
    if (nearby.includes(OPT_OUT)) continue;
    hits.push(i + 1);
  }
  return hits;
}

describe('date-only policy (ETP-5100)', () => {
  it('no source file formats a date with timeZone: UTC', () => {
    const offenders = [];
    for (const file of collectSourceFiles(SRC)) {
      const lines = utcFormatLines(readFileSync(file, 'utf8'));
      const name = relative(SRC, file).split(sep).join('/');
      for (const line of lines) offenders.push(`${name}:${line}`);
    }

    assert.deepEqual(
      offenders,
      [],
      'These call sites render a date in UTC instead of its own calendar day:\n'
      + offenders.map((o) => `  - ${o}`).join('\n')
      + '\n\nA business date (invoice date, movement date, statement date) carries no zone.\n'
      + 'Pinning the formatter to UTC only cancels out the Date constructor when the payload\n'
      + 'happens to be UTC midnight; for any real wall-clock time the two offsets stack and\n'
      + 'the calendar day moves. Use the canonical helpers instead:\n'
      + "  import { parseCalendarDate, formatCalendarDate } from '@/lib/dateOnly.js';\n"
      + `\nIf the value really is an instant that must be shown in UTC, put a\n`
      + `"${OPT_OUT}: <reason>" comment on it or on the line above.\n`,
    );
  });

  it('detects the anti-pattern and honors the opt-out comment', () => {
    // Self-check: an always-empty matcher would make the test above pass forever.
    assert.deepEqual(
      utcFormatLines("const f = new Intl.DateTimeFormat(l, { timeZone: 'UTC' });"),
      [1],
    );
    assert.deepEqual(
      utcFormatLines('const f = new Intl.DateTimeFormat(l, { timeZone: "UTC" });'),
      [1],
    );
    // Prose is not a call site — this is the shape of the JSDoc the fixed helpers carry.
    assert.deepEqual(
      utcFormatLines("/**\n * It used to be Intl.DateTimeFormat(..., timeZone: 'UTC').\n */"),
      [],
    );
    assert.deepEqual(
      utcFormatLines("// utc-date-format-ok: a real instant\nconst f = new Intl.DateTimeFormat(l, { timeZone: 'UTC' });"),
      [],
    );
  });
});
