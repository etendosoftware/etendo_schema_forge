import '@testing-library/jest-dom/vitest';
import { installMemoryLocalStorage } from './localStorage.js';
import { resetAuthMock } from './authContextMock.js';

installMemoryLocalStorage();

// ETP-4576 — suites that mock `useAuth` (see ./authContextMock.js) get their
// baseline back before every test, so a per-test override cannot leak into the
// next one and no test file has to write the reset itself. A no-op for suites
// that never mock auth: nothing reads the value.
beforeEach(() => {
  resetAuthMock();
});

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
