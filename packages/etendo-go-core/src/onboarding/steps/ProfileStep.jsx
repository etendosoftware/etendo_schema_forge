import React, { useState, useEffect } from 'react';
import { ArrowRight, Building2, User, MessageCircle } from 'lucide-react';
import { Button } from '@etendosoftware/app-shell-core/components/ui/button';
import { Label } from '@etendosoftware/app-shell-core/components/ui/label';
import { useUI, useLocaleSwitch } from '@etendosoftware/app-shell-core/i18n';
import { isProfileStepValid } from '../state.js';
import { trackOnboarding } from '../tracking.js';
import { SetupShell } from '../components/SetupShell.jsx';
import { SetupField } from '../components/SetupField.jsx';
import { SetupSelect } from '../components/SetupSelect.jsx';
import { BusinessTypeCard } from '../components/BusinessTypeCard.jsx';
import { OnboardingLanguageSelect } from '../components/OnboardingLanguageSelect.jsx';

export function ProfileStep({ config, stepData, onNext, onBack, goToStep, accountName, draftNotice, setDraftNotice, onChange }) {
  const ui = useUI();
  const { locale, setLocale } = useLocaleSwitch();

  const [form, setForm] = useState(() => ({
    fullName: stepData.fullName ?? config.defaultForm?.fullName ?? accountName ?? '',
    countryCode: stepData.countryCode ?? config.defaultForm?.countryCode ?? '',
    businessType: stepData.businessType ?? config.defaultForm?.businessType ?? 'company',
    language: stepData.language ?? config.defaultForm?.language ?? locale ?? '',
    sector: stepData.sector ?? config.defaultForm?.sector ?? 'technology',
  }));

  useEffect(() => {
    if (accountName && !form.fullName) {
      setForm(prev => ({ ...prev, fullName: accountName }));
    }
  }, [accountName]);

  useEffect(() => {
    if (locale && form.language !== locale) {
      setForm(prev => ({ ...prev, language: locale }));
    }
  }, [locale]);

  const updateField = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    if (onChange) onChange({ [field]: value });
  };

  const setOnboardingLocale = (nextLocale) => {
    if (setLocale) setLocale(nextLocale);
    updateField('language', nextLocale);
  };

  const handleContinue = () => {
    trackOnboarding(config, 'onboarding_setup_step_completed', {
      action: 'continue',
      status: 'success',
      type: 'profile',
    });
    // Remove the draft notice banner once they proceed past the first step
    if (setDraftNotice) setDraftNotice(false);
    onNext(form);
  };

  const countryOptions = (config.countryCodes || []).map((code) => ({
    value: code,
    label: code === 'ES'
      ? ui('onboardingCountrySpain')
      : (code === 'AR' ? ui('onboardingCountryArgentina') : code),
  }));

  const businessTypeOptions = (config.businessTypeValues || ['company', 'freelancer', 'advisory']).map((value) => ({
    value,
    label: ui(`onboardingBusinessType${value.charAt(0).toUpperCase()}${value.slice(1)}`),
    icon: value === 'company' ? Building2 : value === 'freelancer' ? User : MessageCircle,
  }));

  const languageOptions = (config.localeCodes || []).map((code) => ({
    value: code,
    label: code.startsWith('es') ? ui('onboardingLanguageSpanish') : ui('onboardingLanguageEnglish'),
  }));

  const localeControl = setLocale ? (
    <OnboardingLanguageSelect
      label={ui('language')}
      locale={locale}
      onChange={setOnboardingLocale}
      options={languageOptions}
      data-testid="OnboardingLanguageSelect__79cf84" />
  ) : null;

  const setupHeaderContent = (
    <div className="flex flex-wrap items-end justify-end gap-3">
      {localeControl}
    </div>
  );

  const isValid = isProfileStepValid(form);
  const setupGreetingName = (form.fullName || accountName || ui('onboardingGreetingFallback')).trim().split(/\s+/)[0];

  return (
    <SetupShell
      progressLabel={ui('onboardingProgressAlmostReady')}
      progressValue={50}
      headerContent={setupHeaderContent}
      brandLabel={config.brandLabel || 'Etendo GO'}
      data-testid="SetupShell__79cf84">
      {draftNotice && (
        <div
          data-testid="draft-restored-notice"
          className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700"
        >
          {ui('onboardingDraftRestoredNotice')}
        </div>
      )}

      <div>
        <div className="mb-10">
          <h1 className="text-3xl font-semibold tracking-[-0.06em] text-slate-900 sm:text-[2.7rem] sm:leading-[1.04]">
            {ui('onboardingGreeting', { name: setupGreetingName })}
          </h1>
          <p className="mt-3 text-base text-slate-700 sm:text-xl">
            {ui('onboardingSetupSubtitle')}
          </p>
        </div>

        <div className="space-y-6">
          <SetupField
            id="fullName"
            label={ui('onboardingFullNameLabel')}
            required
            value={form.fullName}
            onChange={e => updateField('fullName', e.target.value)}
            placeholder={ui('onboardingFullNamePlaceholder')}
            data-testid="SetupField__79cf84" />

          <SetupSelect
            id="countryCode"
            label={ui('onboardingCountryLabel')}
            required
            value={form.countryCode}
            onChange={e => updateField('countryCode', e.target.value)}
            data-testid="SetupSelect__79cf84">
            {countryOptions.map((country) => (
              <option key={country.value} value={country.value}>{country.label}</option>
            ))}
          </SetupSelect>

          <div>
            <Label
              className="mb-2 block text-base font-medium tracking-[-0.02em] text-slate-900"
              data-testid="Label__79cf84">
              {ui('onboardingBusinessTypeLabel')}
            </Label>
            <div className="grid gap-4 sm:grid-cols-3">
              {businessTypeOptions.map((option) => (
                <BusinessTypeCard
                  key={option.value}
                  icon={option.icon}
                  label={option.label}
                  selected={form.businessType === option.value}
                  onClick={() => updateField('businessType', option.value)}
                  data-testid="BusinessTypeCard__79cf84" />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <Button
            type="button"
            onClick={handleContinue}
            disabled={!isValid}
            className="h-12 rounded-2xl bg-gray-900 px-6 text-base font-medium text-white hover:bg-gray-800"
            data-testid="Button__79cf84">
            {ui('onboardingContinueAction')} <ArrowRight className="ml-2 h-4 w-4" data-testid="ArrowRight__79cf84" />
          </Button>
        </div>
      </div>
    </SetupShell>
  );
}

export default ProfileStep;
