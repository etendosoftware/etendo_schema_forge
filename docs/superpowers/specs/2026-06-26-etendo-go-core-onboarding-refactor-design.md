# Design Spec: etendo-go-core Onboarding Refactor

- Date: 2026-06-26
- Branch: feature/ETP-4346
- Author: Forge (brainstorming session with sebastianbarrozo)

## Problem

`tools/app-shell/src/pages/OnboardingPage.jsx` (1944 lines) contains the full onboarding flow hardcoded for Spain (ES): locale codes, country codes, currency, fiscal ID type (`NIF`). Argentina (AR) needs the same flow with different constants (CUIT, ARS, es_AR). The code cannot be reused as-is.

## Goal

Extract all common onboarding UI and logic into `packages/etendo-go-core/src/onboarding/` so every locale workspace assembles its own flow via React composition:

```jsx
<OnboardingFlow steps={[...coreSteps, ...localeSteps]} config={localeConfig} />
```

## Package

**`@etendosoftware/etendo-go-core`** — already created at `packages/etendo-go-core/`.  
Onboarding lives at `packages/etendo-go-core/src/onboarding/` — a subfolder, not a separate npm package.  
Exported as `@etendosoftware/etendo-go-core/onboarding`.

Both `tools/app-shell/` (ES) and `tools/etendo-go-ar/app-shell/` (AR) already have this package as a dependency.

## Architecture

### Step contract

Every step is a plain object:

```js
{ id: string, component: React.ComponentType<StepProps> }
```

Every step component receives:

```js
{
  config: OnboardingConfig,   // locale constants + apiBase
  stepData: object,           // accumulated data from previous steps
  onNext: (data?) => void,    // advance to next step, optionally passing data
  onBack: () => void,         // go back one step
}
```

### OnboardingConfig shape

```js
{
  apiBase: string,            // e.g. '' (ES) or VITE_API_BASE (AR)
  brandLabel: string,         // 'Etendo GO'
  localeCodes: string[],      // ['es_ES', 'en_US'] for ES, ['es_AR', 'en_US'] for AR
  countryCodes: string[],     // ['ES'] for ES, ['AR'] for AR
  sectorCodes: string[],      // common or locale-overridden
  businessTypeValues: string[],
  defaultForm: {
    currency: string,         // 'EUR' (ES) | 'ARS' (AR)
    language: string,         // 'es_ES' | 'es_AR'
    countryCode: string,      // 'ES' | 'AR'
    fiscalIdType: string,     // 'NIF' (ES) | 'CUIT' (AR)
    businessType: string,
    fullName: string,
    clientName: string,
    fiscalIdValue: string,
    address: string,
    sector: string,
  },
}
```

### OnboardingFlow engine

`packages/etendo-go-core/src/onboarding/OnboardingFlow.jsx` — already scaffolded.

- Holds `stepIndex` and accumulated `stepData` in local state.
- Renders `steps[stepIndex].component` with `{ config, stepData, onNext, onBack }`.
- `onNext(data)` merges `data` into `stepData` keyed by step id, then advances index.

## File layout

```
packages/etendo-go-core/src/onboarding/
  index.js                        exports OnboardingFlow + coreSteps
  OnboardingFlow.jsx              step engine (done)

  components/                     UI atoms extracted from OnboardingPage.jsx
    AuthBrand.jsx
    AuthFeaturePill.jsx
    AuthPreviewMockup.jsx
    AuthShell.jsx                 container: login/register tabs + marketing column
    AuthField.jsx
    AuthSsoOptions.jsx
    OnboardingLanguageSelect.jsx
    PageHeader.jsx
    SetupShell.jsx                container: setup steps + progress bar
    SetupField.jsx
    SetupSelect.jsx
    BusinessTypeCard.jsx
    SetupProgressCard.jsx
    SetupProgressShell.jsx
    EnterEnvironmentButtonContent.jsx

  steps/
    index.js                      exports coreSteps array
    LoginStep.jsx                 login form + SSO (uses AuthShell)
    RegisterStep.jsx              signup form + password policy (uses AuthShell)
    EnvSelectStep.jsx             environment / org selection
    ProfileStep.jsx               step 1: fullName, businessType, sector, language
    CompanyStep.jsx               step 2: clientName, fiscalIdType, fiscalIdValue, address, countryCode
    SetupProgressStep.jsx         AI onboarding stream (SSE) + progress cards

  api.js                          ALL onboarding API functions (moved from onboardingApi.js)
  passwordPolicy.js               moved from tools/app-shell/src/pages/onboarding/
  sso.js                          moved from onboardingSso.js
  state.js                        SETUP_STEP_DEFINITIONS, applyProgressMessage, buildOnboardingPayload
                                  (locale constants removed — those go in config)
  tracking.js                     trackOnboarding() helper
```

## What stays in tools/app-shell/ (ES-specific)

```
src/pages/OnboardingPage.jsx      becomes a thin assembler:
  import { OnboardingFlow, coreSteps } from '@etendosoftware/etendo-go-core/onboarding';

  const ES_CONFIG = {
    apiBase: '',
    brandLabel: 'Etendo GO',
    localeCodes: ['es_ES', 'en_US'],
    countryCodes: ['ES'],
    sectorCodes: ['technology', 'services', 'commerce', 'manufacturing'],
    businessTypeValues: ['company', 'freelancer', 'advisory'],
    defaultForm: {
      currency: 'EUR', language: 'es_ES', countryCode: 'ES',
      fiscalIdType: 'NIF', businessType: 'company',
      fullName: '', clientName: '', fiscalIdValue: '', address: '', sector: 'technology',
    },
  };

  export default function OnboardingPage() {
    return <OnboardingFlow steps={coreSteps} config={ES_CONFIG} />;
  }

src/pages/onboarding/onboardingReadiness.js   stays (ES-specific readiness check)
```

## What goes in tools/etendo-go-ar/app-shell/ (AR)

```
src/pages/OnboardingPage.jsx      AR assembler:
  import { OnboardingFlow, coreSteps } from '@etendosoftware/etendo-go-core/onboarding';

  const AR_CONFIG = {
    apiBase: import.meta.env.VITE_API_BASE || '',
    brandLabel: 'Etendo GO',
    localeCodes: ['es_AR', 'en_US'],
    countryCodes: ['AR'],
    sectorCodes: ['technology', 'services', 'commerce', 'manufacturing'],
    businessTypeValues: ['company', 'freelancer', 'advisory'],
    defaultForm: {
      currency: 'ARS', language: 'es_AR', countryCode: 'AR',
      fiscalIdType: 'CUIT', businessType: 'company',
      fullName: '', clientName: '', fiscalIdValue: '', address: '', sector: 'technology',
    },
  };

  export default function OnboardingPage() {
    return <OnboardingFlow steps={coreSteps} config={AR_CONFIG} />;
  }
```

If AR needs locale-specific steps (e.g. a CUIT-specific validation step), it adds them:

```js
<OnboardingFlow steps={[...coreSteps, cuitVerificationStep]} config={AR_CONFIG} />
```

## API surface (moved to etendo-go-core/src/onboarding/api.js)

All functions keep the same signature `(fetchImpl, baseUrl, ...)` — no breaking changes.

- `registerAccount` — `POST /sws/go/register`
- `loginAccount` — `POST /sws/go/login`
- `loginWithSsoProvider` — `POST /sws/go/sso/:provider`
- `requestPasswordReset` — `POST /sws/go/password-reset`
- `confirmPasswordReset` — `POST /sws/go/password-reset/confirm`
- `changePassword` — `POST /sws/go/password`
- `fetchAccount` — `GET /sws/go/account`
- `fetchEnvironments` — `GET /sws/go/environments`
- `loginEnvironment` — `POST /sws/go/environments/:id/login`
- `fetchOnboardingDraft` / `saveOnboardingDraft` — draft persistence
- `runOnboardingStream` — SSE stream for AI setup progress
- `ONBOARDING_ERROR_CODES` — error code constants

Both ES and AR use the same endpoints against their respective `apiBase`.

## Migration order (for the agent doing the refactor)

1. Create `packages/etendo-go-core/src/onboarding/api.js` — copy from `onboardingApi.js`, no changes needed.
2. Create `packages/etendo-go-core/src/onboarding/passwordPolicy.js` — copy verbatim.
3. Create `packages/etendo-go-core/src/onboarding/sso.js` — copy from `onboardingSso.js`.
4. Create `packages/etendo-go-core/src/onboarding/state.js` — copy `onboardingState.js`, remove `LOCALE_CODES`, `COUNTRY_CODES`, `DEFAULT_ONBOARDING_FORM` (those move to each workspace's config).
5. Create `packages/etendo-go-core/src/onboarding/tracking.js` — extract `trackOnboarding()`.
6. Extract UI components from `OnboardingPage.jsx` into `components/` (functions listed above — each becomes its own file with a named export).
7. Create step files in `steps/` — each wraps the relevant section of `OnboardingPage`'s main render into a `StepProps`-compatible component.
8. Wire `steps/index.js` — export `coreSteps` array with real imports.
9. Slim down `tools/app-shell/src/pages/OnboardingPage.jsx` to the ES assembler shown above.
10. Create `tools/etendo-go-ar/app-shell/src/pages/OnboardingPage.jsx` with the AR assembler.
11. Update `tools/etendo-go-ar/app-shell/src/App.jsx` to route `/onboarding` → `OnboardingPage` with auth guard.

## Definition of done

- `OnboardingPage.jsx` in ES workspace is ≤ 40 lines (assembler only).
- `OnboardingPage.jsx` in AR workspace is ≤ 40 lines.
- No locale constants (`NIF`, `EUR`, `ES`, `es_ES`) in `etendo-go-core/`.
- `make dev` in both `tools/app-shell/` and `tools/etendo-go-ar/app-shell/` shows the onboarding flow.
- No regressions in `tools/app-shell/` tests (`npm run test:all`).
