import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { selectNextSurvey, SURVEY_TRIGGER_EVENT } from '../lib/surveys/survey-engine.js';
import {
  markFirstLogin,
  markSurveyShown,
  markSurveyResponded,
  markSurveyDismissed,
} from '../lib/surveys/survey-state.js';
import { loadRemoteSurveyConfig, submitSurveyResponse } from '../lib/surveys/survey-config.js';
import { getApiBase } from './useNeoResource.js';
import { track } from '../lib/observability.js';
import { OBSERVABILITY_EVENTS, buildObservabilityEvent } from '../lib/observability/events.js';
import { getSessionIdentity } from '../lib/sessionIdentity.js';

function isAdminRole(selectedRole) {
  return selectedRole?.name?.toLowerCase().includes('admin') ?? false;
}

function trackSurveyEvent(eventDef, properties) {
  const { name, properties: safeProps } = buildObservabilityEvent(eventDef, properties);
  if (name) {
    Promise.resolve(track(name, safeProps)).catch(() => {});
  }
}

// ETP-5808: deliberately NOT memoized. `account_id` comes from getSessionIdentity(),
// which is a plain module-level mutation (setSessionIdentity in trackSessionStarted /
// useAccountIdentity) — it does NOT trigger a React re-render when it resolves. A
// useMemo keyed on [username, selectedOrg?.id] would freeze account_id at whatever
// value existed the last time one of those actually-reactive inputs changed, which can
// be before the identity resolves — permanently dropping account_id from every event
// in the session once that memo had computed without it. Reading getSessionIdentity()
// fresh, here, at the moment each event is built — independent of render timing —
// is what QA's repro requires. orgId stays gated by `username` same as before (no
// account/org context on an event fired while nobody is signed in).
function getUserProps({ username, selectedOrg }) {
  if (!username) return {};
  const { clientId } = getSessionIdentity();
  return {
    ...(selectedOrg?.id ? { orgId: selectedOrg.id } : {}),
    ...(clientId ? { account_id: clientId } : {}),
  };
}

export function useSurveyEngine() {
  const { isAuthenticated, selectedRole, username, selectedOrg, token } = useAuth();
  const [activeSurvey, setActiveSurvey] = useState(null);

  const checkAndShowSurvey = useCallback((source) => {
    if (!isAuthenticated) return;
    const isAdmin = isAdminRole(selectedRole);
    const survey = selectNextSurvey({ isAdmin, source });
    if (!survey) return;
    markSurveyShown(survey.id);
    trackSurveyEvent(OBSERVABILITY_EVENTS.SURVEY_SHOWN, {
      type: survey.type,
      source: survey.id,
      ...getUserProps({ username, selectedOrg }),
    });
    setActiveSurvey(survey);
  }, [isAuthenticated, selectedRole, username, selectedOrg?.id]);

  useEffect(() => {
    if (!isAuthenticated) return;
    markFirstLogin();
    const timer = setTimeout(() => checkAndShowSurvey('login'), 2500);
    return () => clearTimeout(timer);
  }, [isAuthenticated, checkAndShowSurvey]);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadRemoteSurveyConfig({ apiBaseUrl: getApiBase(), token });
  }, [isAuthenticated, token]);

  useEffect(() => {
    let timer;
    const handler = () => {
      clearTimeout(timer);
      timer = setTimeout(() => checkAndShowSurvey('trigger'), 1000);
    };
    window.addEventListener(SURVEY_TRIGGER_EVENT, handler);
    return () => {
      window.removeEventListener(SURVEY_TRIGGER_EVENT, handler);
      clearTimeout(timer);
    };
  }, [checkAndShowSurvey]);

  const handleScoreSelected = useCallback((score) => {
    if (!activeSurvey) return;
    trackSurveyEvent(OBSERVABILITY_EVENTS.SURVEY_SCORE_SELECTED, {
      type: activeSurvey.type,
      source: activeSurvey.id,
      score,
      ...getUserProps({ username, selectedOrg }),
    });
  }, [activeSurvey, username, selectedOrg?.id]);

  const handleRespond = useCallback((score, feedback, tags) => {
    if (!activeSurvey) return;
    markSurveyResponded(activeSurvey.id);
    trackSurveyEvent(OBSERVABILITY_EVENTS.SURVEY_RESPONDED, {
      type: activeSurvey.type,
      source: activeSurvey.id,
      score,
      hasComment: Boolean(feedback?.trim()),
      ...(tags?.length ? { tags: tags.join(',') } : {}),
      ...getUserProps({ username, selectedOrg }),
    });
    // The actual feedback text is never sent to Mixpanel (see hasComment above) — it's persisted
    // server-side instead so product can still read it. Fire-and-forget, same as the Mixpanel
    // track call above: never blocks the UI on the network round-trip.
    Promise.resolve(submitSurveyResponse({
      apiBaseUrl: getApiBase(),
      token,
      surveyKey: activeSurvey.id,
      score,
      feedback,
      tags,
    })).catch(() => {});
  }, [activeSurvey, username, selectedOrg?.id, token]);

  const handleClose = useCallback(() => {
    setActiveSurvey(null);
  }, []);

  const handleDismiss = useCallback(() => {
    if (!activeSurvey) return;
    markSurveyDismissed(activeSurvey.id);
    trackSurveyEvent(OBSERVABILITY_EVENTS.SURVEY_DISMISSED, {
      type: activeSurvey.type,
      source: activeSurvey.id,
      ...getUserProps({ username, selectedOrg }),
    });
    setActiveSurvey(null);
  }, [activeSurvey, username, selectedOrg?.id]);

  return { activeSurvey, handleScoreSelected, handleRespond, handleClose, handleDismiss };
}
