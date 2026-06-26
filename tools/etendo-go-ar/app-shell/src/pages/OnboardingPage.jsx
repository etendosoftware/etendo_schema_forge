import React from 'react';
import { OnboardingFlow, coreSteps } from '@etendosoftware/etendo-go-core/onboarding';

const AR_CONFIG = {
  apiBase: import.meta.env.VITE_API_BASE || '',
  brandLabel: 'Etendo GO',
  localeCodes: ['es_AR', 'en_US'],
  countryCodes: ['AR'],
  sectorCodes: ['technology', 'services', 'commerce', 'manufacturing'],
  businessTypeValues: ['company', 'freelancer', 'advisory'],
  defaultForm: {
    currency: 'ARS',
    language: 'es_AR',
    countryCode: 'AR',
    fiscalIdType: 'CUIT',
    businessType: 'company',
    fullName: '',
    clientName: '',
    fiscalIdValue: '',
    address: '',
    sector: 'technology',
  },
  track: (eventDefinition, properties) => {
    // Telemetry placeholder/noop for AR workspace
  },
};

export default function OnboardingPage() {
  return <OnboardingFlow steps={coreSteps} config={AR_CONFIG} />;
}
