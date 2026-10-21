/**
 * Builds a `@/lib/dateOnly` mock that keeps every REAL export and replaces only the
 * formatter a test needs to make predictable.
 *
 * Test files used to mock `@/lib/dateOnly` with an exhaustive factory. That breaks
 * silently as the component's import graph grows: the moment anything in the tree reaches
 * for another export (`parseCalendarDate`, `parseWallClockInstant`, ...), vitest fails at
 * render time with `No "<name>" export is defined on the "@/lib/dateOnly" mock` — which is
 * how adding `parseWallClockInstant` (ETP-5046) broke tests that assert nothing about dates.
 * Spreading the real module also keeps real date-only semantics (`parseCalendarDate`) for
 * any code that needs them.
 *
 * Usage — the factory stays lazy, so the formatter can be defined inline:
 *
 *   import { dateOnlyWithFormatter } from '@/test/dateOnlyMock.js';
 *   vi.mock('@/lib/dateOnly', async (importOriginal) =>
 *     dateOnlyWithFormatter(importOriginal, (val) => val || '-'));
 *
 * @param {Function} importOriginal vitest's own loader for the real module
 * @param {Function} formatCalendarDate stand-in for the real `formatCalendarDate`
 */
export async function dateOnlyWithFormatter(importOriginal, formatCalendarDate) {
  const actual = await importOriginal();
  return { ...actual, formatCalendarDate };
}
