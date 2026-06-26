const ONBOARDING_EVENT_CONTEXT = {
  component: 'OnboardingPage',
  source: 'onboarding',
  windowName: 'onboarding',
};

export function trackOnboarding(config, eventDefinition, properties = {}) {
  if (config?.track) {
    Promise.resolve(
      config.track(eventDefinition, {
        ...ONBOARDING_EVENT_CONTEXT,
        ...properties,
      })
    ).catch(() => {});
  }
}
