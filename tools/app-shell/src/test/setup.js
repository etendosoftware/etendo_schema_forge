import '@testing-library/jest-dom/vitest';
import { installMemoryLocalStorage } from './localStorage.js';
import { resetAuthMock } from './authContextMock.js';
import { resetSessionCredentials } from '@etendosoftware/app-shell-core/auth';

installMemoryLocalStorage();

// ETP-4576 — suites that mock `useAuth` (see ./authContextMock.js) get their
// baseline back before every test, so a per-test override cannot leak into the
// next one and no test file has to write the reset itself. A no-op for suites
// that never mock auth: nothing reads the value.
beforeEach(() => {
  // Credentials first: resetAuthMock publishes through them, so it must land on a
  // clean scheme rather than whatever the previous test left behind.
  resetSessionCredentials();
  resetAuthMock();
  // ETP-4576 — the credential scheme is module state in app-shell-core, so a
  // suite that switches to the cookie session would otherwise leak it into every
  // test that runs after it. Reset puts every test back on the default (bearer,
  // no token); a suite that needs another scheme declares it with
  // setSessionCredentials.
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
