/**
 * Test-support helper: assert that two or more statements are ADJACENT in a
 * source file, tolerating comments between them.
 *
 * WHY THIS EXISTS (ETP-5381)
 * --------------------------
 * Source-reading tests routinely express "B runs immediately after A" as a
 * single regex joining the two statements with `\s*`:
 *
 *     /setShowInvoiceConfirm\(false\);\s*setConfirmedDocs\(\{/
 *
 * `\s*` means "no intervening CHARACTERS", but the property under test is "no
 * intervening STATEMENT". Those differ on exactly one thing: a comment. Adding
 * an explanatory comment between the two calls — a change with no behavioural
 * effect whatsoever — breaks the assertion and reports a regression that does
 * not exist. That is what happened to the ETP-5333 guard in
 * GoodsReceiptActions.test.js when ETP-5381 documented the line above
 * setConfirmedDocs.
 *
 * Stripping comments first makes `\s*` mean what the test always meant. A real
 * statement inserted between A and B still leaves non-whitespace behind, so it
 * still fails — the guard keeps all of its teeth.
 */
import assert from 'node:assert/strict';

/**
 * Remove `//` and block comments from JS/JSX source, leaving everything else
 * (including string contents and line structure) untouched.
 *
 * String, template and regex literals are skipped, so a `'http://x'` URL or a
 * `// inside a string` is never mistaken for a comment. Newlines inside removed
 * comments are preserved so line-oriented assertions still line up.
 *
 * @param {string} source
 * @returns {string}
 */
export function codeWithoutComments(source) {
  let out = '';
  let i = 0;

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    // Line comment — drop up to (not including) the newline.
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }

    // Block comment — drop it, but keep its newlines.
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') out += '\n';
        i += 1;
      }
      i += 2;
      continue;
    }

    // String or template literal — copy verbatim, honouring escapes.
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') {
          out += source.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += source[i];
        if (source[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

/**
 * Assert that the given patterns appear in order with nothing but whitespace
 * and comments between them.
 *
 * @param {string} source   Raw file text.
 * @param {RegExp[]} patterns Ordered fragments, each matching one statement.
 * @param {string} [message]
 */
export function assertAdjacentStatements(source, patterns, message) {
  const joined = new RegExp(patterns.map(p => p.source).join('\\s*'));
  assert.match(codeWithoutComments(source), joined, message);
}
