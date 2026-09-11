/**
 * ETP-5190 — the signup wizard's NIF is reported BEFORE the view changes.
 *
 * The requirement is specifically about ordering: the server already refuses a malformed NIF,
 * but that answer arrives after "Empezar" has asked for provisioning. These tests assert the
 * two things that make the feedback useful — the blur trigger, and that the click does not
 * advance.
 *
 * `CompanyStep` is replaced by a minimal stand-in that keeps the parts the wrapper actually
 * couples to: an input with `id="fiscalIdValue"` and an `onNext(form)` button. Rendering the
 * real one would drag in the whole core setup shell and test the package, not the guard.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@etendosoftware/app-shell-core/i18n', () => ({
  useUI: () => (key) => key,
}));

/**
 * Stand-in for the core CompanyStep. Mirrors only what the wrapper relies on:
 *  - the input's `id` (which is how the blur listener finds it — see the wrapper's header),
 *  - `onNext(form)` carrying `fiscalIdValue`,
 *  - and rendering NO wrapper element, so the "no extra DOM" contract stays visible here too.
 */
vi.mock('@etendosoftware/etendo-go-core/onboarding', () => {
  const CompanyStep = ({ onNext, onBack }) => (
    <>
      <input id="fiscalIdValue" defaultValue="" data-testid="nif" />
      <button
        type="button"
        data-testid="start"
        onClick={() => onNext({ fiscalIdValue: document.getElementById('fiscalIdValue').value })}
      />
      <button type="button" data-testid="back" onClick={onBack} />
    </>
  );
  return {
    coreSteps: [
      { id: 'login', component: () => null },
      { id: 'company', component: CompanyStep, persistable: true, draftStep: 2 },
      { id: 'setup-progress', component: () => null },
    ],
  };
});

import { onboardingSteps, CompanyStepWithTaxId } from '../onboardingSteps.jsx';

const VALID_CIF = 'B1234567D';
const WRONG_CHECK_DIGIT = 'B12345679';
const MALFORMED = 'not-a-nif';

let onNext;
let onBack;

beforeEach(() => {
  vi.clearAllMocks();
  onNext = vi.fn();
  onBack = vi.fn();
});

const renderStep = () => render(<CompanyStepWithTaxId onNext={onNext} onBack={onBack} />);

const type = async (user, value) => {
  const input = screen.getByTestId('nif');
  await user.clear(input);
  if (value) await user.type(input, value);
  return input;
};

describe('the step list handed to OnboardingFlow', () => {
  it('replaces only the company step, keeping order and every other step', () => {
    expect(onboardingSteps.map((s) => s.id)).toEqual(['login', 'company', 'setup-progress']);
    const company = onboardingSteps.find((s) => s.id === 'company');
    expect(company.component).toBe(CompanyStepWithTaxId);
    // The core step's own metadata must survive — `persistable`/`draftStep` are what make the
    // draft-resume feature work, and dropping them would silently disable it.
    expect(company.persistable).toBe(true);
    expect(company.draftStep).toBe(2);
  });

  it('leaves the other steps untouched', () => {
    const core = onboardingSteps.filter((s) => s.id !== 'company');
    expect(core).toHaveLength(2);
    for (const step of core) expect(step.component).not.toBe(CompanyStepWithTaxId);
  });
});

describe('blur — told while still looking at the field', () => {
  it('reports a wrong check digit on blur, without advancing anything', async () => {
    const user = userEvent.setup();
    renderStep();
    await type(user, WRONG_CHECK_DIGIT);
    await user.tab();

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('taxIdInvalidCheckDigit'));
    expect(onNext).not.toHaveBeenCalled();
  });

  it('reports a malformed value with the other message', async () => {
    const user = userEvent.setup();
    renderStep();
    await type(user, MALFORMED);
    await user.tab();

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('taxIdInvalidFormat'));
  });

  it('marks the input aria-invalid, and clears it once the value is good', async () => {
    const user = userEvent.setup();
    renderStep();
    const input = await type(user, WRONG_CHECK_DIGIT);
    await user.tab();
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));

    await type(user, VALID_CIF);
    await user.tab();
    await waitFor(() => expect(input).not.toHaveAttribute('aria-invalid'));
  });

  it('says nothing on blur when the field is empty — the NIF is optional in the wizard', async () => {
    const user = userEvent.setup();
    renderStep();
    screen.getByTestId('nif').focus();
    await user.tab();

    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('says nothing for a valid NIF', async () => {
    const user = userEvent.setup();
    renderStep();
    await type(user, VALID_CIF);
    await user.tab();

    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('does not stack a toast per blur on an unchanged value', async () => {
    // Tabbing in and out of a field the user has not touched must not repeat itself.
    const user = userEvent.setup();
    renderStep();
    const input = await type(user, WRONG_CHECK_DIGIT);
    await user.tab();
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));

    input.focus();
    await user.tab();
    expect(toastMock.error).toHaveBeenCalledTimes(1);
  });

  it('reports again once the value changes to a different bad one', async () => {
    const user = userEvent.setup();
    renderStep();
    await type(user, WRONG_CHECK_DIGIT);
    await user.tab();
    await type(user, MALFORMED);
    await user.tab();

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(2));
    expect(toastMock.error).toHaveBeenLastCalledWith('taxIdInvalidFormat');
  });
});

describe('Empezar — the guarantee that the view does not change', () => {
  it('does NOT advance on a malformed NIF', async () => {
    // THE requirement. Without this the wizard moved on and the refusal came back from
    // provisioning, after the user had already left the field behind.
    const user = userEvent.setup();
    renderStep();
    await type(user, MALFORMED);
    await user.click(screen.getByTestId('start'));

    expect(onNext).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith('taxIdInvalidFormat');
  });

  it('does NOT advance on a wrong check digit', async () => {
    const user = userEvent.setup();
    renderStep();
    await type(user, WRONG_CHECK_DIGIT);
    await user.click(screen.getByTestId('start'));

    expect(onNext).not.toHaveBeenCalled();
  });

  it('blocks even when the field never lost focus', async () => {
    // Clicking straight from the input onto the button, or pressing Enter, reaches Empezar
    // without a blur — which is why the click is guarded too rather than trusting the blur.
    const user = userEvent.setup();
    renderStep();
    const input = await type(user, WRONG_CHECK_DIGIT);
    input.focus();
    await user.click(screen.getByTestId('start'));

    expect(onNext).not.toHaveBeenCalled();
  });

  it('advances with a valid CIF, forwarding the form untouched', async () => {
    const user = userEvent.setup();
    renderStep();
    await type(user, VALID_CIF);
    await user.click(screen.getByTestId('start'));

    expect(onNext).toHaveBeenCalledWith({ fiscalIdValue: VALID_CIF });
  });

  it('advances with a natural-person DNI — an autónomo has no CIF', async () => {
    const user = userEvent.setup();
    renderStep();
    await type(user, '12345678Z');
    await user.click(screen.getByTestId('start'));

    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('advances with the field left empty', async () => {
    // The wizard marks the NIF optional and `wireOrgInfo()` only persists a non-blank value;
    // making it required here would be a different change than the one asked for.
    const user = userEvent.setup();
    renderStep();
    await user.click(screen.getByTestId('start'));

    expect(onNext).toHaveBeenCalledWith({ fiscalIdValue: '' });
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('accepts a NIF pasted with separators', async () => {
    const user = userEvent.setup();
    renderStep();
    await type(user, ' b-1234567d ');
    await user.click(screen.getByTestId('start'));

    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('leaves Back alone — a bad NIF must not trap the user on the step', async () => {
    const user = userEvent.setup();
    renderStep();
    await type(user, MALFORMED);
    await user.click(screen.getByTestId('back'));

    expect(onBack).toHaveBeenCalled();
  });
});
