import React from 'react';
import { OnboardingFlow, coreSteps } from '@etendosoftware/etendo-go-core/onboarding';
import { useUI } from '@etendosoftware/app-shell-core/i18n';
import { checkSalesInvoiceReadiness } from './onboarding/onboardingReadiness.js';
import { track } from '../lib/observability.js';
import { buildObservabilityEvent } from '../lib/observability/events.js';
import { trackSessionStarted } from '../lib/observability/health-events.js';
import { markOnboardingCompleted } from '../lib/surveys/survey-state.js';

export default function OnboardingPage() {
  const ui = useUI();

  const ES_CONFIG = {
    apiBase: '',
    brandLabel: ui('onboardingBrandName'),
    localeCodes: ['es_ES', 'en_US'],
    // TODO(ETP-4444): confirm the final country list with Product/Design — placeholder
    // set covering the markets already live in this monorepo (ES, AR) plus common
    // LatAm expansion candidates. Adding a country is data-only: append the ISO code here.
    countryCodes: ['ES', 'AR', 'MX', 'CO', 'CL'],
    sectorCodes: ['technology', 'services', 'commerce', 'manufacturing'],
    businessTypeValues: ['company', 'freelancer', 'advisory'],
    defaultForm: {
      currency: 'EUR',
      language: 'es_ES',
      countryCode: 'ES',
      fiscalIdType: 'NIF',
      businessType: 'company',
      fullName: '',
      clientName: '',
      fiscalIdValue: '',
      address: '',
      sector: 'technology',
    },
    checkReadiness: (fetchImpl, apiBase, token) => {
      return checkSalesInvoiceReadiness(fetchImpl, apiBase, token);
    },
    track: (eventDefinition, properties) => {
      const event = buildObservabilityEvent(eventDefinition, properties);
      const name = event.name || (typeof eventDefinition === 'string' ? eventDefinition : eventDefinition?.name);
      if (name === 'onboarding_run_succeeded') {
        markOnboardingCompleted();
      }
      return track(name, { ...properties, ...event.properties });
    },
    onSessionStarted: (env) => trackSessionStarted({
      username: env.adminUserName || env.adminUser,
      clientId: env.clientId,
      clientName: env.clientName,
    }),
  };

  return <OnboardingFlow steps={coreSteps} config={ES_CONFIG} data-testid="OnboardingFlow__79cf84" />;
}
