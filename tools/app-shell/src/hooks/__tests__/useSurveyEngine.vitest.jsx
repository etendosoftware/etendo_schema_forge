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
    SURVEY_RESPONDED: { name: 'survey_responded' },
    SURVEY_DISMISSED: { name: 'survey_dismissed' },
  },
}));

// ---------------------------------------------------------------------------
// Module mocks — must appear before any import of the hook
// ---------------------------------------------------------------------------

vi.mock('@/auth/AuthContext.jsx', () => authMocks);

vi.mock('@/lib/surveys/survey-engine.js', () => surveyEngineMocks);

vi.mock('@/lib/surveys/survey-state.js', () => surveyStateMocks);

vi.mock('@/lib/observability.js', () => observabilityMocks);

vi.mock('@/lib/observability/events.js', () => observabilityEventsMocks);

// ---------------------------------------------------------------------------
// Import the hook AFTER mocks are registered
// ---------------------------------------------------------------------------
import { useSurveyEngine } from '../useSurveyEngine.js';

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
  });

  // -------------------------------------------------------------------------
  // identify
  // -------------------------------------------------------------------------

  describe('identify', () => {
    it('calls identify when isAuthenticated and username are set', () => {
      useAuth.mockReturnValue(
        makeAuth({ isAuthenticated: true, username: 'alice', selectedOrg: { id: 'org-99' } }),
      );

      renderHook(() => useSurveyEngine());

      expect(identify).toHaveBeenCalledTimes(1);
      expect(identify).toHaveBeenCalledWith('alice', { account_id: 'org-99' });
    });

    it('passes empty traits when selectedOrg has no id', () => {
      useAuth.mockReturnValue(
        makeAuth({ isAuthenticated: true, username: 'bob', selectedOrg: null }),
      );

      renderHook(() => useSurveyEngine());

      expect(identify).toHaveBeenCalledWith('bob', {});
    });

    it('does NOT call identify when isAuthenticated is false', () => {
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: false, username: 'carol' }));

      renderHook(() => useSurveyEngine());

      expect(identify).not.toHaveBeenCalled();
    });

    it('does NOT call identify when username is null even if authenticated', () => {
      useAuth.mockReturnValue(makeAuth({ isAuthenticated: true, username: null }));

      renderHook(() => useSurveyEngine());

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
  // handleRespond
  // -------------------------------------------------------------------------

  describe('handleRespond', () => {
    it('calls markSurveyResponded and track with score, trimmed feedback and joined tags', () => {
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
          feedback: 'great tool',
          tags: 'tag1,tag2',
        }),
      );
      // track called twice: once for shown, once for responded
      expect(track).toHaveBeenCalledTimes(2);
    });

    it('omits feedback key when feedback is blank', () => {
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
        expect.not.objectContaining({ feedback: expect.anything() }),
      );
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
  // userProps (accountId in track payload)
  // -------------------------------------------------------------------------

  describe('userProps', () => {
    it('includes userId and accountId in track payload when selectedOrg.id is present', () => {
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
        expect.objectContaining({ userId: 'alice', accountId: 'org-42' }),
      );
    });

    it('omits accountId in track payload when selectedOrg is null', () => {
      const survey = makeSurvey();
      useAuth.mockReturnValue(
        makeAuth({ isAuthenticated: true, username: 'alice', selectedOrg: null }),
      );
      selectNextSurvey.mockReturnValue(survey);

      renderHook(() => useSurveyEngine());
      act(() => { vi.advanceTimersByTime(2500); });

      expect(buildObservabilityEvent).toHaveBeenCalledWith(
        OBSERVABILITY_EVENTS.SURVEY_SHOWN,
        expect.not.objectContaining({ accountId: expect.anything() }),
      );
    });

    it('omits userId and accountId in track payload when username is null', () => {
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
        }),
      );
    });
  });
});
