import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
 * package. Validation runs on blur, while correcting a reported value, and before advancing:
 *
 *   - **on blur** of the NIF field, so the user is told while still looking at it;
 *   - **on "Empezar"**, which is the guarantee — the click does not advance the view.
 *
 * ## Two constraints worth knowing before changing this
 *
 * **No wrapper element.** `OnboardingFlow` renders the step as a DIRECT CHILD of a
 * `lg:grid-cols-[...]` container, so wrapping it in a `<div>` would make that div the grid child
 * and collapse the two-column setup layout. The step stays a direct grid child; the error is
 * rendered through a portal into the existing outer field wrapper, after its current children.
 *
 * **The core component has no error prop.** Keep the field layout intact and attach the inline
 * message to the existing field container by id, alongside the validation state on the input.
 */
const COMPANY_STEP_ID = 'company';

/** `id` of the NIF input inside the core `CompanyStep`. */
const FISCAL_ID_INPUT_ID = 'fiscalIdValue';
const FISCAL_ID_ERROR_ID = 'fiscalIdValue-error';

function CompanyStepWithTaxId({ onNext, ...stepProps }) {
  const ui = useUI();
  const companyStep = coreSteps.find((step) => step.id === COMPANY_STEP_ID);
  const CoreCompanyStep = companyStep?.component;
  const [errorKey, setErrorKey] = useState(null);
  const [errorMount, setErrorMount] = useState(null);

  // What was last reported, so a blur that does not change the value does not stack toasts —
  // tabbing in and out of a field the user has not touched should say nothing new.
  const lastReported = useRef(null);
  const hasReported = useRef(false);

  const reportIfInvalid = useCallback((rawValue) => {
    const value = String(rawValue ?? '');
    const nextErrorKey = getTaxIdError(value);
    hasReported.current = true;
    setErrorKey(nextErrorKey);
    if (!nextErrorKey) {
      lastReported.current = null;
      return false;
    }
    const signature = `${nextErrorKey}:${value}`;
    if (lastReported.current !== signature) {
      lastReported.current = signature;
      toast.error(ui(nextErrorKey));
    }
    return true;
  }, [ui]);

  useEffect(() => {
    // Attached by id, not by ref: this component renders no element of its own (see the
    // header). A missing input means the core package renamed it — the blur trigger is then
    // simply absent and the "Empezar" guard below still holds, which is the requirement.
    const input = document.getElementById(FISCAL_ID_INPUT_ID);
    if (!input) return undefined;
    const field = input.parentElement;
    const fieldWrapper = field?.parentElement;
    if (!field || !fieldWrapper) return undefined;
    setErrorMount(fieldWrapper);
    let validationTimer = null;
    const handleBlur = (event) => reportIfInvalid(event.target.value);
    const handleInput = (event) => {
      // This native listener runs on the input before React's delegated onChange handler at the
      // root. Updating wrapper state here can rerender the controlled field before CompanyStep
      // stores the new value, restoring the previous value and making the next keystroke appear
      // ignored. Defer validation to the next task, after React has committed the controlled value.
      const value = event.target.value;
      clearTimeout(validationTimer);
      validationTimer = setTimeout(() => {
        validationTimer = null;
        if (!hasReported.current) return;
        const nextErrorKey = getTaxIdError(value);
        setErrorKey(nextErrorKey);
        if (!nextErrorKey) lastReported.current = null;
      }, 0);
    };
    input.addEventListener('blur', handleBlur);
    input.addEventListener('input', handleInput);
    return () => {
      input.removeEventListener('blur', handleBlur);
      input.removeEventListener('input', handleInput);
      clearTimeout(validationTimer);
    };
  }, [reportIfInvalid]);

  useEffect(() => {
    const input = document.getElementById(FISCAL_ID_INPUT_ID);
    const field = input?.parentElement;
    if (!input || !field) return;
    if (errorKey) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', FISCAL_ID_ERROR_ID);
      field.style.borderColor = 'hsl(var(--destructive))';
      field.classList.add('focus-within:ring-4', 'focus-within:ring-destructive/20');
      return;
    }
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
    field.style.borderColor = '';
    field.classList.remove('focus-within:ring-4', 'focus-within:ring-destructive/20');
  }, [errorKey, errorMount]);

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
  return (
    <>
      <CoreCompanyStep {...stepProps} onNext={handleNext} data-testid="CoreCompanyStep__606e28" />
      {errorMount && errorKey ? createPortal(
        <p id={FISCAL_ID_ERROR_ID} className="mt-1 text-sm text-destructive">
          {ui(errorKey)}
        </p>,
        errorMount,
      ) : null}
    </>
  );
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
