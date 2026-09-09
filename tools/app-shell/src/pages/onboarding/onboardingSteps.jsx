import { useCallback, useEffect, useRef } from 'react';
import { coreSteps } from '@etendosoftware/etendo-go-core/onboarding';
import { useUI } from '@etendosoftware/app-shell-core/i18n';
import { toast } from 'sonner';
import { getTaxIdError } from '@/lib/taxIdValidation.js';

/**
 * ETP-5190 — the onboarding step list, with the company step's NIF validated BEFORE the wizard
 * moves on.
 *
 * The tax identifier is one of only two places a tenant sets its own fiscal id, and the wrong
 * value is expensive: nothing in classic Etendo validates it, so it surfaces weeks later as a
 * failure to complete an invoice. `parseOnboardingRequest` already refuses it server-side — but
 * that rejection arrives after "Empezar", once provisioning has been asked for, which is too
 * late to be useful feedback.
 *
 * `coreSteps` is a plain array of `{ id, component }` and `onNext` is a prop, so the step can be
 * guarded from this repo without touching the published `@etendosoftware/etendo-go-core`
 * package. Two triggers, matching the request:
 *
 *   - **on blur** of the NIF field, so the user is told while still looking at it;
 *   - **on "Empezar"**, which is the guarantee — the click does not advance the view.
 *
 * ## Two constraints worth knowing before changing this
 *
 * **No wrapper element.** `OnboardingFlow` renders the step as a DIRECT CHILD of a
 * `lg:grid-cols-[...]` container, so wrapping it in a `<div>` would make that div the grid child
 * and collapse the two-column setup layout. This component returns the core step itself and
 * adds no DOM of its own — which is also why the blur listener is attached by id rather than
 * through a ref.
 *
 * **No inline message under the field.** `CompanyStep` takes no error/validator prop and
 * `config` has no slot for one, so the message is a toast plus `aria-invalid` on the input. An
 * inline `FieldError` like the Organización window's needs the core package to expose a slot;
 * until then the toast is what there is, and it is not silent.
 */
const COMPANY_STEP_ID = 'company';

/** `id` of the NIF input inside the core `CompanyStep`. */
const FISCAL_ID_INPUT_ID = 'fiscalIdValue';

function CompanyStepWithTaxId({ onNext, ...stepProps }) {
  const ui = useUI();
  const companyStep = coreSteps.find((step) => step.id === COMPANY_STEP_ID);
  const CoreCompanyStep = companyStep?.component;

  // What was last reported, so a blur that does not change the value does not stack toasts —
  // tabbing in and out of a field the user has not touched should say nothing new.
  const lastReported = useRef(null);

  const reportIfInvalid = useCallback((rawValue) => {
    const value = String(rawValue ?? '');
    const errorKey = getTaxIdError(value);
    const input = document.getElementById(FISCAL_ID_INPUT_ID);
    if (input) {
      // The only visual cue available at the field itself, given the core step exposes no
      // error slot. Also what a screen reader has to go on.
      if (errorKey) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
    if (!errorKey) {
      lastReported.current = null;
      return false;
    }
    const signature = `${errorKey}:${value}`;
    if (lastReported.current !== signature) {
      lastReported.current = signature;
      toast.error(ui(errorKey));
    }
    return true;
  }, [ui]);

  useEffect(() => {
    // Attached by id, not by ref: this component renders no element of its own (see the
    // header). A missing input means the core package renamed it — the blur trigger is then
    // simply absent and the "Empezar" guard below still holds, which is the requirement.
    const input = document.getElementById(FISCAL_ID_INPUT_ID);
    if (!input) return undefined;
    const handleBlur = (event) => reportIfInvalid(event.target.value);
    input.addEventListener('blur', handleBlur);
    return () => input.removeEventListener('blur', handleBlur);
  }, [reportIfInvalid]);

  const handleNext = useCallback((form) => {
    // The guarantee: a malformed NIF keeps the user on this step. Reported again here rather
    // than trusting the blur, because the value can reach "Empezar" without the field ever
    // losing focus (Enter, or a click straight from the input onto the button).
    if (reportIfInvalid(form?.[FISCAL_ID_INPUT_ID])) {
      return;
    }
    onNext(form);
  }, [onNext, reportIfInvalid]);

  if (!CoreCompanyStep) return null;
  return <CoreCompanyStep {...stepProps} onNext={handleNext} />;
}

/**
 * `coreSteps` with the company step guarded. Order and every other step are untouched, so a step
 * added to the core package appears here without a change.
 */
export const onboardingSteps = coreSteps.map((step) => (
  step.id === COMPANY_STEP_ID ? { ...step, component: CompanyStepWithTaxId } : step
));

export { CompanyStepWithTaxId };
export default onboardingSteps;
