import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { selectNextSurvey, SURVEY_TRIGGER_EVENT } from '../lib/surveys/survey-engine.js';
import {
  markFirstLogin,
  markSurveyShown,
  markSurveyResponded,
  markSurveyDismissed,
} from '../lib/surveys/survey-state.js';
import { loadRemoteSurveyConfig } from '../lib/surveys/survey-config.js';
import { getApiBase } from './useNeoResource.js';
import { track, identify } from '../lib/observability.js';
import { OBSERVABILITY_EVENTS, buildObservabilityEvent } from '../lib/observability/events.js';

function isAdminRole(selectedRole) {
  return selectedRole?.name?.toLowerCase().includes('admin') ?? false;
}

function trackSurveyEvent(eventDef, properties) {
  const { name, properties: safeProps } = buildObservabilityEvent(eventDef, properties);
  if (name) {
    Promise.resolve(track(name, safeProps)).catch(() => {});
  }
}

export function useSurveyEngine() {
  const { isAuthenticated, selectedRole, username, selectedOrg, token } = useAuth();
  const [activeSurvey, setActiveSurvey] = useState(null);

  const userProps = useMemo(() => {
    if (!username) return {};
    return { userId: username, ...(selectedOrg?.id ? { accountId: selectedOrg.id } : {}) };
  }, [username, selectedOrg?.id]);

  const checkAndShowSurvey = useCallback((source) => {
    if (!isAuthenticated) return;
    const isAdmin = isAdminRole(selectedRole);
    const survey = selectNextSurvey({ isAdmin, source });
    if (!survey) return;
    markSurveyShown(survey.id);
    trackSurveyEvent(OBSERVABILITY_EVENTS.SURVEY_SHOWN, {
      type: survey.type,
      source: survey.id,
      ...userProps,
    });
    setActiveSurvey(survey);
  }, [isAuthenticated, selectedRole, userProps]);

  useEffect(() => {
    if (!isAuthenticated || !username) return;
    const traits = selectedOrg?.id ? { account_id: selectedOrg.id } : {};
    identify(username, traits);
  }, [isAuthenticated, username, selectedOrg]);

  useEffect(() => {
    if (!isAuthenticated) return;
    markFirstLogin();
    const timer = setTimeout(() => checkAndShowSurvey('login'), 2500);
    return () => clearTimeout(timer);
  }, [isAuthenticated, checkAndShowSurvey]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;
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
      ...userProps,
    });
  }, [activeSurvey, userProps]);

  const handleRespond = useCallback((score, feedback, tags) => {
    if (!activeSurvey) return;
    markSurveyResponded(activeSurvey.id);
    trackSurveyEvent(OBSERVABILITY_EVENTS.SURVEY_RESPONDED, {
      type: activeSurvey.type,
      source: activeSurvey.id,
      score,
      ...(feedback?.trim() ? { feedback: feedback.trim() } : {}),
      ...(tags?.length ? { tags: tags.join(',') } : {}),
      ...userProps,
    });
  }, [activeSurvey, userProps]);

  const handleClose = useCallback(() => {
    setActiveSurvey(null);
  }, []);

  const handleDismiss = useCallback(() => {
    if (!activeSurvey) return;
    markSurveyDismissed(activeSurvey.id);
    trackSurveyEvent(OBSERVABILITY_EVENTS.SURVEY_DISMISSED, {
      type: activeSurvey.type,
      source: activeSurvey.id,
      ...userProps,
    });
    setActiveSurvey(null);
  }, [activeSurvey, userProps]);

  return { activeSurvey, handleScoreSelected, handleRespond, handleClose, handleDismiss };
}
