// @covers tools/app-shell/src/hooks/useSurveyEngine.js
// @covers tools/app-shell/src/lib/sessionIdentity.js
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Hoisted mocks (vi.hoisted runs before imports)
// ---------------------------------------------------------------------------

const authMocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

const surveyEngineMocks = vi.hoisted(() => ({
  selectNextSurvey: vi.fn(),
  SURVEY_TRIGGER_EVENT: 'sf:survey:trigger',
}));

const surveyStateMocks = vi.hoisted(() => ({
  markFirstLogin: vi.fn(),
  markSurveyShown: vi.fn(),
  markSurveyResponded: vi.fn(),
  markSurveyDismissed: vi.fn(),
}));

const observabilityMocks = vi.hoisted(() => ({
  track: vi.fn(),
  identify: vi.fn(),
}));

const observabilityEventsMocks = vi.hoisted(() => ({
  buildObservabilityEvent: vi.fn(),
  OBSERVABILITY_EVENTS: {
    SURVEY_SHOWN: { name: 'survey_shown' },
    SURVEY_SCORE_SELECTED: { name: 'survey_score_selected' },
    SURVEY_RESPONDED: { name: 'survey_responded' },
    SURVEY_DISMISSED: { name: 'survey_dismissed' },
  },
}));

const surveyConfigMocks = vi.hoisted(() => ({
  loadRemoteSurveyConfig: vi.fn(),
  submitSurveyResponse: vi.fn(),
}));

const neoResourceMocks = vi.hoisted(() => ({
  getApiBase: vi.fn(() => '/etendo'),
}));

// ---------------------------------------------------------------------------
// Module mocks — must appear before any import of the hook
// ---------------------------------------------------------------------------

vi.mock('@/auth/AuthContext.jsx', () => authMocks);

vi.mock('@/lib/surveys/survey-engine.js', () => surveyEngineMocks);

vi.mock('@/lib/surveys/survey-state.js', () => surveyStateMocks);

vi.mock('@/lib/surveys/survey-config.js', () => surveyConfigMocks);

vi.mock('../useNeoResource.js', () => neoResourceMocks);

vi.mock('@/lib/observability.js', () => observabilityMocks);

vi.mock('@/lib/observability/events.js', () => observabilityEventsMocks);

// ---------------------------------------------------------------------------
// Import the hook AFTER mocks are registered
//
// sessionIdentity.js is NOT mocked here: it is a plain in-memory singleton
// (no network, no browser API), and the existing convention for it
// (health-events.vitest.js) exercises the real module via
// setSessionIdentity/clearSessionIdentity rather than a vi.mock.
// ---------------------------------------------------------------------------
import { useSurveyEngine } from '../useSurveyEngine.js';
import { setSessionIdentity, clearSessionIdentity } from '../../lib/sessionIdentity.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAuth(overrides = {}) {
  return {
    isAuthenticated: false,
    username: null,
    selectedOrg: null,
    selectedRole: null,
    ...overrides,
  };
}

function makeSurvey(overrides = {}) {
  return { id: 'survey-1', type: 'nps', ...overrides };
}

const { useAuth } = authMocks;
const { selectNextSurvey, SURVEY_TRIGGER_EVENT } = surveyEngineMocks;
const { markFirstLogin, markSurveyShown, markSurveyResponded, markSurveyDismissed } = surveyStateMocks;
const { track, identify } = observabilityMocks;
const { buildObservabilityEvent, OBSERVABILITY_EVENTS } = observabilityEventsMocks;
const { loadRemoteSurveyConfig, submitSurveyResponse } = surveyConfigMocks;
const { getApiBase } = neoResourceMocks;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('useSurveyEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();

    useAuth.mockReturnValue(makeAuth());
    selectNextSurvey.mockReturnValue(null);
    buildObservabilityEvent.mockImplementation((eventDef, props) => ({
      name: eventDef?.name ?? 'unknown',
      properties: props ?? {},
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    // sessionIdentity is a real, module-level singleton (not mocked) — reset it so a
    // clientId set by one test never leaks into the next.
    clearSessionIdentity();
  });

  // -------------------------------------------------------------------------
  // identify — removed entirely from the survey flow (ETP-4352 GDPR remediation).
  // useSurveyEngine.js no longer imports or calls identify() at all; it used to
  // fire on every authenticated login. Regression guard: it must stay gone.
  // -------------------------------------------------------------------------

  describe('identify (GDPR remediation — must never be called from this hook)', () => {
    it('does NOT call identify on login, even with a full authenticated user + org', () => {
      useAuth.mockReturnValue(
        makeAuth({ isAuthenticated: true, username: 'alice', selectedOrg: { id: 'org-99' } }),
      );

      renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      expect(identify).not.toHaveBeenCalled();
    });

    it('does NOT call identify through the full show → respond → dismiss flow', () => {
      const survey = makeSurvey();
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));
      selectNextSurvey.mockReturnValue(survey);

      const { result } = renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      act(() => {
        result.current.handleScoreSelected(8);
        result.current.handleRespond(8, 'nice', []);
        result.current.handleDismiss();
      });

      expect(identify).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // markFirstLogin + login timer
  // -------------------------------------------------------------------------

  describe('markFirstLogin and login timer', () => {
    it('calls markFirstLogin when authenticated', () => {
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));

      renderHook(() => useSurveyEngine());

      expect(markFirstLogin).toHaveBeenCalledTimes(1);
    });

    it('does NOT call markFirstLogin when not authenticated', () => {
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: false }));

      renderHook(() => useSurveyEngine());

      expect(markFirstLogin).not.toHaveBeenCalled();
    });

    it('triggers checkAndShowSurvey("login") after 2500ms', () => {
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));

      renderHook(() => useSurveyEngine());

      expect(selectNextSurvey).not.toHaveBeenCalled();

      act(() => { vi.advanceTimersByTime(2500); });

      expect(selectNextSurvey).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'login' }),
      );
    });

    it('clears the login timer on unmount', () => {
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));

      const { unmount } = renderHook(() => useSurveyEngine());
      unmount();

      act(() => { vi.advanceTimersByTime(2500); });

      expect(selectNextSurvey).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // checkAndShowSurvey
  // -------------------------------------------------------------------------

  describe('checkAndShowSurvey', () => {
    it('does nothing when not authenticated', () => {
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: false }));

      renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      expect(selectNextSurvey).not.toHaveBeenCalled();
    });

    it('does not set activeSurvey when selectNextSurvey returns null', () => {
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));
      selectNextSurvey.mockReturnValue(null);

      const { result } = renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      expect(result.current.activeSurvey).toBeNull();
      expect(markSurveyShown).not.toHaveBeenCalled();
    });

    it('sets activeSurvey, calls markSurveyShown and track when a survey is returned', () => {
      const survey = makeSurvey();
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));
      selectNextSurvey.mockReturnValue(survey);

      const { result } = renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      expect(result.current.activeSurvey).toEqual(survey);
      expect(markSurveyShown).toHaveBeenCalledWith(survey.id);
      expect(track).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // SURVEY_TRIGGER_EVENT listener
  // -------------------------------------------------------------------------

  describe('SURVEY_TRIGGER_EVENT', () => {
    it('adds the event listener on mount and removes it on unmount', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));

      const { unmount } = renderHook(() => useSurveyEngine());

      const addCalls = addSpy.mock.calls.filter(([evt]) => evt === SURVEY_TRIGGER_EVENT);
      expect(addCalls.length).toBe(1);

      unmount();

      const removeCalls = removeSpy.mock.calls.filter(([evt]) => evt === SURVEY_TRIGGER_EVENT);
      expect(removeCalls.length).toBe(1);

      addSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it('triggers checkAndShowSurvey("trigger") after 1000ms when event fires', () => {
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));

      renderHook(() => useSurveyEngine());

      act(() => {
        window.dispatchEvent(new Event(SURVEY_TRIGGER_EVENT));
      });

      expect(selectNextSurvey).not.toHaveBeenCalled();

      act(() => { vi.advanceTimersByTime(1000); });

      expect(selectNextSurvey).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'trigger' }),
      );
    });

    it('clears the trigger timer on unmount', () => {
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));

      const { unmount } = renderHook(() => useSurveyEngine());

      act(() => {
        window.dispatchEvent(new Event(SURVEY_TRIGGER_EVENT));
      });

      unmount();

      act(() => { vi.advanceTimersByTime(1000); });

      expect(selectNextSurvey).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // QA edge case: concurrent survey triggers — two events within 1s
    // The shared `timer` variable means the second event overwrites the first
    // reference; only the second timer's delay is cancelled on cleanup. The
    // first timer still fires, so the survey can be shown twice.
    // This test documents the current (buggy) behavior.
    // -------------------------------------------------------------------------

    it('fires checkAndShowSurvey twice when two events arrive within the 1000ms debounce window [BUG]', () => {
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));
      selectNextSurvey.mockReturnValue(makeSurvey());

      renderHook(() => useSurveyEngine());

      act(() => {
        window.dispatchEvent(new Event(SURVEY_TRIGGER_EVENT));
        window.dispatchEvent(new Event(SURVEY_TRIGGER_EVENT));
      });

      act(() => { vi.advanceTimersByTime(1000); });

      // The second event debounces the first (clearTimeout before setTimeout).
      // Only one timer fires — selectNextSurvey is called exactly once.
      expect(selectNextSurvey).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // QA edge case: auth state transition — user logs out while login timer is running
  // -------------------------------------------------------------------------

  describe('auth state transition during login timer', () => {
    it('does not show survey when isAuthenticated becomes false before 2500ms elapses', () => {
      const { rerender } = renderHook(() => useSurveyEngine(), {
        wrapper: ({ children }) => children,
      });

      // Start authenticated — timer begins
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));
      rerender();

      // Simulate logout before the 2500ms timer fires
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: false, username: null }));
      rerender();

      act(() => { vi.advanceTimersByTime(2500); });

      // checkAndShowSurvey guards on isAuthenticated at call time — must NOT call selectNextSurvey
      expect(selectNextSurvey).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Admin role detection
  // -------------------------------------------------------------------------

  describe('isAdminRole detection', () => {
    it('passes isAdmin: true when selectedRole.name contains "admin"', () => {
      useAuth.mockReturnValue(
        makeAuth({
          isAuthenticated: true,
          username: 'alice',
          selectedRole: { name: 'System Administrator' },
        }),
      );

      renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      expect(selectNextSurvey).toHaveBeenCalledWith(
        expect.objectContaining({ isAdmin: true }),
      );
    });

    it('passes isAdmin: false when selectedRole.name does not contain "admin"', () => {
      useAuth.mockReturnValue(
        makeAuth({
          isAuthenticated: true,
          username: 'bob',
          selectedRole: { name: 'Regular User' },
        }),
      );

      renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      expect(selectNextSurvey).toHaveBeenCalledWith(
        expect.objectContaining({ isAdmin: false }),
      );
    });

    it('passes isAdmin: false when selectedRole is null', () => {
      useAuth.mockReturnValue(
        makeAuth({ isAuthenticated: true, username: 'carol', selectedRole: null }),
      );

      renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      expect(selectNextSurvey).toHaveBeenCalledWith(
        expect.objectContaining({ isAdmin: false }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // handleScoreSelected
  // -------------------------------------------------------------------------

  describe('handleScoreSelected', () => {
    it('tracks survey_score_selected with the score, without calling markSurveyResponded', () => {
      const survey = makeSurvey();
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));
      selectNextSurvey.mockReturnValue(survey);

      const { result } = renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      act(() => {
        result.current.handleScoreSelected(7);
      });

      expect(buildObservabilityEvent).toHaveBeenCalledWith(
        OBSERVABILITY_EVENTS.SURVEY_SCORE_SELECTED,
        expect.objectContaining({ type: survey.type, source: survey.id, score: 7 }),
      );
      expect(markSurveyResponded).not.toHaveBeenCalled();
    });

    it('fires again on a subsequent score change without requiring submit', () => {
      const survey = makeSurvey();
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));
      selectNextSurvey.mockReturnValue(survey);

      const { result } = renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      act(() => {
        result.current.handleScoreSelected(3);
        result.current.handleScoreSelected(9);
      });

      const scoreCalls = buildObservabilityEvent.mock.calls.filter(
        ([eventDef]) => eventDef === OBSERVABILITY_EVENTS.SURVEY_SCORE_SELECTED,
      );
      expect(scoreCalls).toHaveLength(2);
      expect(scoreCalls[0][1]).toEqual(expect.objectContaining({ score: 3 }));
      expect(scoreCalls[1][1]).toEqual(expect.objectContaining({ score: 9 }));
    });

    it('does nothing when activeSurvey is null', () => {
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));
      selectNextSurvey.mockReturnValue(null);

      const { result } = renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      act(() => {
        result.current.handleScoreSelected(5);
      });

      expect(buildObservabilityEvent).not.toHaveBeenCalledWith(
        OBSERVABILITY_EVENTS.SURVEY_SCORE_SELECTED,
        expect.anything(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // handleRespond
  // -------------------------------------------------------------------------

  describe('handleRespond', () => {
    it('calls markSurveyResponded and track with score, hasComment:true, and joined tags '
      + '(no raw feedback text — GDPR remediation)', () => {
      const survey = makeSurvey();
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));
      selectNextSurvey.mockReturnValue(survey);

      const { result } = renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      act(() => {
        result.current.handleRespond(9, '  great tool  ', ['tag1', 'tag2']);
      });

      expect(markSurveyResponded).toHaveBeenCalledWith(survey.id);
      expect(buildObservabilityEvent).toHaveBeenCalledWith(
        OBSERVABILITY_EVENTS.SURVEY_RESPONDED,
        expect.objectContaining({
          score: 9,
          hasComment: true,
          tags: 'tag1,tag2',
        }),
      );
      expect(buildObservabilityEvent).toHaveBeenLastCalledWith(
        OBSERVABILITY_EVENTS.SURVEY_RESPONDED,
        expect.not.objectContaining({ feedback: expect.anything() }),
      );
      // track called twice: once for shown, once for responded
      expect(track).toHaveBeenCalledTimes(2);
    });

    it('sets hasComment: false when feedback is blank/whitespace-only', () => {
      const survey = makeSurvey();
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));
      selectNextSurvey.mockReturnValue(survey);

      const { result } = renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      act(() => {
        result.current.handleRespond(7, '   ', []);
      });

      expect(buildObservabilityEvent).toHaveBeenLastCalledWith(
        OBSERVABILITY_EVENTS.SURVEY_RESPONDED,
        expect.objectContaining({ hasComment: false }),
      );
      expect(buildObservabilityEvent).toHaveBeenLastCalledWith(
        OBSERVABILITY_EVENTS.SURVEY_RESPONDED,
        expect.not.objectContaining({ feedback: expect.anything() }),
      );
    });

    it('sets hasComment: false when feedback is null/undefined (no comment at all)', () => {
      const survey = makeSurvey();
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));
      selectNextSurvey.mockReturnValue(survey);

      const { result } = renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      act(() => {
        result.current.handleRespond(7, null, []);
      });

      expect(buildObservabilityEvent).toHaveBeenLastCalledWith(
        OBSERVABILITY_EVENTS.SURVEY_RESPONDED,
        expect.objectContaining({ hasComment: false }),
      );
    });

    it('sets hasComment: true when feedback has real (non-whitespace) content', () => {
      const survey = makeSurvey();
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));
      selectNextSurvey.mockReturnValue(survey);

      const { result } = renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      act(() => {
        result.current.handleRespond(7, 'a', []);
      });

      expect(buildObservabilityEvent).toHaveBeenLastCalledWith(
        OBSERVABILITY_EVENTS.SURVEY_RESPONDED,
        expect.objectContaining({ hasComment: true }),
      );
    });

    it('never leaks the raw feedback text value anywhere in the SURVEY_RESPONDED payload '
      + '(GDPR/PII compliance invariant — a regression here is a compliance regression)', () => {
      const survey = makeSurvey();
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));
      selectNextSurvey.mockReturnValue(survey);

      const { result } = renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      const sensitiveFeedback = 'Contact me at alice@example.com, this feature is broken';
      act(() => {
        result.current.handleRespond(9, sensitiveFeedback, ['tag1']);
      });

      const respondedCall = buildObservabilityEvent.mock.calls.find(
        ([eventDef]) => eventDef === OBSERVABILITY_EVENTS.SURVEY_RESPONDED,
      );
      expect(respondedCall).toBeTruthy();
      const [, properties] = respondedCall;

      expect(properties).not.toHaveProperty('feedback');
      expect(Object.values(properties)).not.toContain(sensitiveFeedback);
      expect(JSON.stringify(properties)).not.toContain('alice@example.com');
    });

    it('omits tags key when tags array is empty', () => {
      const survey = makeSurvey();
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));
      selectNextSurvey.mockReturnValue(survey);

      const { result } = renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      act(() => {
        result.current.handleRespond(5, null, []);
      });

      expect(buildObservabilityEvent).toHaveBeenLastCalledWith(
        OBSERVABILITY_EVENTS.SURVEY_RESPONDED,
        expect.not.objectContaining({ tags: expect.anything() }),
      );
    });

    it('does nothing when activeSurvey is null', () => {
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));
      selectNextSurvey.mockReturnValue(null);

      const { result } = renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      act(() => {
        result.current.handleRespond(8, 'ok', []);
      });

      expect(markSurveyResponded).not.toHaveBeenCalled();
      expect(submitSurveyResponse).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // submitSurveyResponse (fire-and-forget persistence of the real feedback text —
  // ETP-4352 GDPR remediation counterpart: the raw text goes here, never to Mixpanel)
  // -------------------------------------------------------------------------

  describe('submitSurveyResponse (fire-and-forget)', () => {
    it('calls submitSurveyResponse with the real feedback text, score, tags, token and apiBaseUrl', () => {
      const survey = makeSurvey();
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice', token: 'tok-1' }));
      selectNextSurvey.mockReturnValue(survey);
      submitSurveyResponse.mockResolvedValue(undefined);

      const { result } = renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      act(() => {
        result.current.handleRespond(9, 'great tool', ['tag1']);
      });

      expect(submitSurveyResponse).toHaveBeenCalledWith({
        apiBaseUrl: '/etendo',
        token: 'tok-1',
        surveyKey: survey.id,
        score: 9,
        feedback: 'great tool',
        tags: ['tag1'],
      });
    });

    it('does not throw synchronously and does not block the UI when submitSurveyResponse rejects '
      + '(fire-and-forget — a flaky network must never break the survey flow)', async () => {
      const survey = makeSurvey();
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice', token: 'tok-1' }));
      selectNextSurvey.mockReturnValue(survey);
      submitSurveyResponse.mockRejectedValue(new Error('network down'));

      const { result } = renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      expect(() => {
        act(() => {
          result.current.handleRespond(9, 'great tool', ['tag1']);
        });
      }).not.toThrow();

      // markSurveyResponded/track already ran synchronously — handleRespond did not await
      // the rejected submitSurveyResponse promise before returning.
      expect(markSurveyResponded).toHaveBeenCalledWith(survey.id);

      // Let the internal .catch(() => {}) settle so no unhandled rejection surfaces.
      await act(async () => { await Promise.resolve().then(() => {}); });
    });
  });

  // -------------------------------------------------------------------------
  // handleDismiss
  // -------------------------------------------------------------------------

  describe('handleDismiss', () => {
    it('calls markSurveyDismissed, track, and clears activeSurvey', () => {
      const survey = makeSurvey();
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));
      selectNextSurvey.mockReturnValue(survey);

      const { result } = renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      expect(result.current.activeSurvey).toEqual(survey);

      act(() => {
        result.current.handleDismiss();
      });

      expect(markSurveyDismissed).toHaveBeenCalledWith(survey.id);
      expect(buildObservabilityEvent).toHaveBeenCalledWith(
        OBSERVABILITY_EVENTS.SURVEY_DISMISSED,
        expect.objectContaining({ type: survey.type, source: survey.id }),
      );
      expect(result.current.activeSurvey).toBeNull();
    });

    it('does nothing when activeSurvey is null', () => {
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));
      selectNextSurvey.mockReturnValue(null);

      const { result } = renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      act(() => {
        result.current.handleDismiss();
      });

      expect(markSurveyDismissed).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // handleClose
  // -------------------------------------------------------------------------

  describe('handleClose', () => {
    it('clears activeSurvey without calling any state/tracking functions', () => {
      const survey = makeSurvey();
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));
      selectNextSurvey.mockReturnValue(survey);

      const { result } = renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      expect(result.current.activeSurvey).toEqual(survey);

      // Clear mocks so we can assert no extra calls happen on handleClose
      markSurveyDismissed.mockClear();
      markSurveyResponded.mockClear();
      track.mockClear();

      act(() => {
        result.current.handleClose();
      });

      expect(result.current.activeSurvey).toBeNull();
      expect(markSurveyDismissed).not.toHaveBeenCalled();
      expect(markSurveyResponded).not.toHaveBeenCalled();
      expect(track).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // userProps (orgId in track payload — GDPR remediation: userId/accountId removed,
  // accountId renamed to orgId)
  // -------------------------------------------------------------------------

  describe('userProps', () => {
    it('includes orgId (not userId/accountId) in track payload when selectedOrg.id is present', () => {
      const survey = makeSurvey();
      useAuth.mockReturnValue(
        makeAuth({
          isAuthenticated: true,
          username: 'alice',
          selectedOrg: { id: 'org-42' },
        }),
      );
      selectNextSurvey.mockReturnValue(survey);

      renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      expect(buildObservabilityEvent).toHaveBeenCalledWith(
        OBSERVABILITY_EVENTS.SURVEY_SHOWN,
        expect.objectContaining({ orgId: 'org-42' }),
      );
      expect(buildObservabilityEvent).toHaveBeenLastCalledWith(
        OBSERVABILITY_EVENTS.SURVEY_SHOWN,
        expect.not.objectContaining({
          userId: expect.anything(),
          accountId: expect.anything(),
        }),
      );
    });

    it('omits orgId in track payload when selectedOrg is null', () => {
      const survey = makeSurvey();
      useAuth.mockReturnValue(
        makeAuth({ isAuthenticated: true, username: 'alice', selectedOrg: null }),
      );
      selectNextSurvey.mockReturnValue(survey);

      renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      expect(buildObservabilityEvent).toHaveBeenCalledWith(
        OBSERVABILITY_EVENTS.SURVEY_SHOWN,
        expect.not.objectContaining({ orgId: expect.anything() }),
      );
    });

    it('omits orgId in track payload when username is null (even with a selectedOrg present)', () => {
      const survey = makeSurvey();
      useAuth.mockReturnValue(
        makeAuth({ isAuthenticated: true, username: null, selectedOrg: { id: 'org-1' } }),
      );
      selectNextSurvey.mockReturnValue(survey);

      renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      expect(buildObservabilityEvent).toHaveBeenCalledWith(
        OBSERVABILITY_EVENTS.SURVEY_SHOWN,
        expect.not.objectContaining({
          userId: expect.anything(),
          accountId: expect.anything(),
          orgId: expect.anything(),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // userProps — account_id (ETP-5808): the Client-level SaaS tenant identifier,
  // sourced from getSessionIdentity().clientId, snake_case `account_id` — distinct from
  // the camelCase `accountId` key asserted absent above (GDPR remediation, unrelated key).
  // -------------------------------------------------------------------------

  describe('userProps — account_id from session identity (ETP-5808)', () => {
    it('includes account_id with the session clientId in the payload of all 4 survey events', () => {
      setSessionIdentity({ clientId: 'client-77' });
      const survey = makeSurvey();
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));
      selectNextSurvey.mockReturnValue(survey);

      const { result } = renderHook(() => useSurveyEngine());
      // SURVEY_SHOWN — fired by the login timer.
      act(() => { vi.advanceTimersByTime(2500); });

      act(() => {
        result.current.handleScoreSelected(8);
        result.current.handleRespond(8, 'nice', []);
        result.current.handleDismiss();
      });

      for (const eventDef of [
        OBSERVABILITY_EVENTS.SURVEY_SHOWN,
        OBSERVABILITY_EVENTS.SURVEY_SCORE_SELECTED,
        OBSERVABILITY_EVENTS.SURVEY_RESPONDED,
        OBSERVABILITY_EVENTS.SURVEY_DISMISSED,
      ]) {
        expect(buildObservabilityEvent).toHaveBeenCalledWith(
          eventDef,
          expect.objectContaining({ account_id: 'client-77' }),
        );
      }
    });

    it('omits account_id from the payload when the session has no clientId (signed-out/default state)', () => {
      clearSessionIdentity();
      const survey = makeSurvey();
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));
      selectNextSurvey.mockReturnValue(survey);

      const { result } = renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      act(() => {
        result.current.handleScoreSelected(8);
        result.current.handleRespond(8, 'nice', []);
        result.current.handleDismiss();
      });

      for (const eventDef of [
        OBSERVABILITY_EVENTS.SURVEY_SHOWN,
        OBSERVABILITY_EVENTS.SURVEY_SCORE_SELECTED,
        OBSERVABILITY_EVENTS.SURVEY_RESPONDED,
        OBSERVABILITY_EVENTS.SURVEY_DISMISSED,
      ]) {
        expect(buildObservabilityEvent).toHaveBeenCalledWith(
          eventDef,
          expect.not.objectContaining({ account_id: expect.anything() }),
        );
      }
    });

    // QA REJECT repro (BUG-1, now fixed): userProps used to be a useMemo keyed on
    // [username, selectedOrg?.id]. getSessionIdentity().clientId was read only at the
    // moment that memo first computed — if clientId resolved asynchronously afterwards
    // (a plain module-level mutation, triggers no re-render), the memo never recomputed
    // and account_id stayed absent for the rest of the mount's life. The fix reads
    // getSessionIdentity() fresh, inline, at each event's track call (getUserProps()).
    it('BUG-1 regression — account_id reaches a later event even though clientId resolved only after an earlier event fired, with no re-render in between', () => {
      clearSessionIdentity();
      const survey = makeSurvey();
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice' }));
      selectNextSurvey.mockReturnValue(survey);

      const { result } = renderHook(() => useSurveyEngine());
      // SURVEY_SHOWN fires via the login timer, before clientId has resolved — correct,
      // there is no identity data yet.
      act(() => { vi.advanceTimersByTime(2500); });

      expect(buildObservabilityEvent).toHaveBeenCalledWith(
        OBSERVABILITY_EVENTS.SURVEY_SHOWN,
        expect.not.objectContaining({ account_id: expect.anything() }),
      );

      // Identity resolves asynchronously AFTER that first event (e.g. useAccountIdentity's
      // async reset flow) — a plain module-level mutation, not a prop/state change, so
      // the hook is never re-rendered and username/selectedOrg?.id never change.
      setSessionIdentity({ clientId: 'client-resolved-later' });

      act(() => { result.current.handleDismiss(); });

      expect(buildObservabilityEvent).toHaveBeenCalledWith(
        OBSERVABILITY_EVENTS.SURVEY_DISMISSED,
        expect.objectContaining({ account_id: 'client-resolved-later' }),
      );
    });

    it('includes orgId and account_id together in the same payload when selectedOrg and the session clientId are both set', () => {
      setSessionIdentity({ clientId: 'client-77' });
      const survey = makeSurvey();
      useAuth.mockReturnValue(
        makeAuth({ isAuthenticated: true, username: 'alice', selectedOrg: { id: 'org-1' } }),
      );
      selectNextSurvey.mockReturnValue(survey);

      renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      expect(buildObservabilityEvent).toHaveBeenCalledWith(
        OBSERVABILITY_EVENTS.SURVEY_SHOWN,
        expect.objectContaining({ orgId: 'org-1', account_id: 'client-77' }),
      );
    });

    it('omits both orgId and account_id when username is falsy, even with a stale clientId left over from a previous session', () => {
      setSessionIdentity({ clientId: 'stale-client' });
      const survey = makeSurvey();
      useAuth.mockReturnValue(
        makeAuth({ isAuthenticated: true, username: null, selectedOrg: { id: 'org-1' } }),
      );
      selectNextSurvey.mockReturnValue(survey);

      renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      expect(buildObservabilityEvent).toHaveBeenCalledWith(
        OBSERVABILITY_EVENTS.SURVEY_SHOWN,
        expect.not.objectContaining({
          account_id: expect.anything(),
          orgId: expect.anything(),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Remote survey config (backoffice "Survey Configuration" window)
  // -------------------------------------------------------------------------

  describe('loadRemoteSurveyConfig', () => {
    it('loads the remote config when authenticated with a token', () => {
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice', token: 'tok-123' }));

      renderHook(() => useSurveyEngine());

      expect(getApiBase).toHaveBeenCalled();
      expect(loadRemoteSurveyConfig).toHaveBeenCalledWith({ apiBaseUrl: '/etendo', token: 'tok-123' });
    });

    it('does not load the remote config when not authenticated', () => {
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: false, token: 'tok-123' }));

      renderHook(() => useSurveyEngine());

      expect(loadRemoteSurveyConfig).not.toHaveBeenCalled();
    });

    it('does not load the remote config when there is no token — inverted: the cookie carries the session', () => {
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: 'alice', token: null }));

      renderHook(() => useSurveyEngine());

    // ETP-4576 — inverted on purpose: under the cookie scheme the client holds no token,
    // so the request MUST still go out. The old expectation encoded the guard that made
    // this call silently disappear for every authenticated user.
      expect(loadRemoteSurveyConfig).toHaveBeenCalled();
    });
  });
});
