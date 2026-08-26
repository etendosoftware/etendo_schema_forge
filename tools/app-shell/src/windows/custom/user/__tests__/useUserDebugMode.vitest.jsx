/**
 * Tests for useUserDebugMode.js (ETP-4830, item #4) — mirrors fiscal-monitor's own
 * useDebugMode.js shape (module-level keystroke buffer + a Set of React listeners,
 * localStorage-backed), but as an independent module: separate localStorage key
 * (`etendo-debug-user`), separate keystroke sequence (`debuguser`).
 *
 * The module registers ONE `document.addEventListener('keydown', ...)` at import time,
 * for the whole app lifetime — mirroring the real module-level-singleton design, this
 * file imports it once (statically, at the top) rather than per-test, and resets only
 * `localStorage` between tests (the module's own `getActive()`/`setActive()` always read
 * from/write to it directly, so clearing it is enough to reset state — re-importing the
 * module per test would instead stack up a second, independent listener on the shared
 * `document` and produce flaky ON/OFF races between the two).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { useUserDebugMode } from '../useUserDebugMode.js';

function typeSequence(sequence) {
  for (const ch of sequence) {
    fireEvent.keyDown(document, { key: ch });
  }
}

function Probe() {
  const active = useUserDebugMode();
  return <div data-testid="state">{String(active)}</div>;
}

beforeEach(() => {
  localStorage.clear();
});

it('starts inactive when localStorage has no prior state', () => {
  render(<Probe />);

  expect(screen.getByTestId('state')).toHaveTextContent('false');
});

it('activates on typing the debuguser sequence and persists to localStorage', () => {
  render(<Probe />);

  typeSequence('debuguser');

  expect(screen.getByTestId('state')).toHaveTextContent('true');
  expect(localStorage.getItem('etendo-debug-user')).toBe('1');
});

it('typing the sequence again deactivates it', () => {
  render(<Probe />);

  typeSequence('debuguser');
  expect(screen.getByTestId('state')).toHaveTextContent('true');

  typeSequence('debuguser');
  expect(screen.getByTestId('state')).toHaveTextContent('false');
  expect(localStorage.getItem('etendo-debug-user')).toBe('0');
});

it('ignores unrelated keystrokes and modified keys', () => {
  render(<Probe />);

  typeSequence('not-the-sequence');
  fireEvent.keyDown(document, { key: 'a', ctrlKey: true });
  fireEvent.keyDown(document, { key: 'Enter' });

  expect(screen.getByTestId('state')).toHaveTextContent('false');
});

it('does not activate on the sibling fiscal debug sequence (independent modules)', () => {
  render(<Probe />);

  typeSequence('debugfiscal');

  expect(screen.getByTestId('state')).toHaveTextContent('false');
  expect(localStorage.getItem('etendo-debug-fiscal')).toBeNull();
});

it('syncs across multiple mounted hook instances', () => {
  function TwoProbes() {
    return (
      <>
        <div data-testid="state-a">{String(useUserDebugMode())}</div>
        <div data-testid="state-b">{String(useUserDebugMode())}</div>
      </>
    );
  }
  render(<TwoProbes />);

  typeSequence('debuguser');

  expect(screen.getByTestId('state-a')).toHaveTextContent('true');
  expect(screen.getByTestId('state-b')).toHaveTextContent('true');
});
