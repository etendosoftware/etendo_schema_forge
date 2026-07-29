// Behavioral coverage for survey-state lives in schema_forge_core:
// packages/app-shell-core/src/lib/surveys/__tests__/survey-state.vitest.js.
// This is a SHIM SMOKE TEST. The functional module is a re-export of the core
// module, so this file only verifies that the re-export RESOLVES and that the
// helpers EXECUTE through the real `@/` → package → core import chain. It does
// not re-test behavior: the core copy was byte-identical to this one, so every
// assertion it holds is already running there against the same code. What the
// core copy cannot cover is this resolution path — that is what this file adds.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  readSurveyState,
  markOnboardingCompleted,
  incrementSurveyCounter,
} from '../survey-state.js';

function makeStorage() {
  const store = {};
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
}

describe('survey-state shim', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: makeStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('re-exports the helpers its consumers import', () => {
    // surveys.js and useSurveyEngine import these three from this module.
    expect(typeof readSurveyState).toBe('function');
    expect(typeof markOnboardingCompleted).toBe('function');
    expect(typeof incrementSurveyCounter).toBe('function');
  });

  it('executes a read/write round trip through the real core import graph', () => {
    expect(readSurveyState().onboardingCompleted).toBe(false);

    markOnboardingCompleted();
    expect(readSurveyState().onboardingCompleted).toBe(true);

    expect(incrementSurveyCounter('invoicing')).toBe(1);
    expect(readSurveyState().counters.invoicing).toBe(1);
  });
});
