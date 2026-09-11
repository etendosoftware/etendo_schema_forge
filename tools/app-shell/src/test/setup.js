import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import { installMemoryLocalStorage } from './localStorage.js';

installMemoryLocalStorage();

// jsdom doesn't implement scroll APIs — stub them so components that
// scroll-to-bottom on new content (chat threads, message lists) don't throw.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

// scroll-pane (app-shell-core) observes size via ResizeObserver, which jsdom
// does not implement.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() { /* no-op: size never changes under jsdom */ }
    unobserve() { /* no-op: nothing is ever observed */ }
    disconnect() { /* no-op: nothing is ever observed */ }
  };
}

// ETP-5255 — the other half of the ETP-4918 timeout knob. That ticket raised vitest's
// testTimeout/hookTimeout to 15s because THIS suite's shape (881 jsdom files through the forks
// pool, ~13 min of wall time, most of it cumulative environment setup) starves forks enough that
// whichever test is unlucky trips a clock — but it left testing-library's own `asyncUtilTimeout`,
// the window every `waitFor` measures itself against, at its 1s default. So the same starvation
// simply resurfaced through `waitFor` instead: `useEntity.coverage` (401 → loading still true) and
// `CommandPalette` (vector-search-scope not found) each failed a full-suite push while passing in
// ~1.6s when run together in isolation, with the whole containing directory green.
// 5s matches what two files (InviteAcceptancePage.sessionGuard/.tenantEntry) had already had to
// configure locally, and stays 3x below testTimeout so a genuinely hung `waitFor` still fails as a
// waitFor timeout — with its DOM dump — instead of being swallowed by the outer test timeout.
// If a test needs more than this, that test is the problem.
configure({ asyncUtilTimeout: 5000 });
