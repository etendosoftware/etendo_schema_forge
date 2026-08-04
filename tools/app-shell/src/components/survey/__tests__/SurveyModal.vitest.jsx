// Real Vitest component test for SurveyModal — covers actual component code paths
// (NPS 0-10 flow, CSAT star flow, close/skip handlers, and the thanks->onClose timer).
vi.mock('@/i18n/index.js', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: vi.fn() }),
}));

const surveyConfigMocks = vi.hoisted(() => ({
  getRemoteCannedResponses: vi.fn(() => null),
}));

vi.mock('@/lib/surveys/survey-config.js', () => surveyConfigMocks);

import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SurveyModal } from '../SurveyModal.jsx';

const { getRemoteCannedResponses } = surveyConfigMocks;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  getRemoteCannedResponses.mockReturnValue(null);
});

const npsSurvey = {
  id: 'nps',
  type: 'nps',
  titleKey: 'surveyNpsTitle',
};

const csatSurvey = {
  id: 'csat_invoicing',
  type: 'csat',
  titleKey: 'surveyInvoicingTitle',
  q2TitleKey: 'surveyInvoicingQ2',
  q2PlaceholderKey: 'surveyInvoicingQ2Placeholder',
  thanksKey: 'surveyInvoicingThanks',
  canned: [
    { icon: '🐢', key: 'surveyInvoicingCanned1' },
    { icon: '🤔', key: 'surveyInvoicingCanned2' },
    { icon: '📄', key: 'surveyInvoicingCanned3' },
    { icon: '🧾', key: 'surveyInvoicingCanned4' },
    { icon: '📤', key: 'surveyInvoicingCanned5' },
    { icon: '🐛', key: 'surveyInvoicingCanned6' },
  ],
};

function setup(props = {}) {
  const onScoreSelected = vi.fn();
  const onRespond = vi.fn();
  const onDismiss = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <SurveyModal
      survey={npsSurvey}
      open
      onScoreSelected={onScoreSelected}
      onRespond={onRespond}
      onDismiss={onDismiss}
      onClose={onClose}
      {...props}
    />
  );
  return { ...utils, onScoreSelected, onRespond, onDismiss, onClose };
}

describe('SurveyModal — visibility', () => {
  it('renders nothing when open is false', () => {
    render(
      <SurveyModal survey={npsSurvey} open={false} onRespond={vi.fn()} onDismiss={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.queryByTestId('SurveyModal__overlay')).not.toBeInTheDocument();
  });

  it('renders nothing when survey is null', () => {
    render(
      <SurveyModal survey={null} open onRespond={vi.fn()} onDismiss={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.queryByTestId('SurveyModal__overlay')).not.toBeInTheDocument();
  });

  it('renders the overlay and card when open with a survey', () => {
    setup();
    expect(screen.getByTestId('SurveyModal__overlay')).toBeInTheDocument();
    expect(screen.getByTestId('SurveyModal__card')).toBeInTheDocument();
  });
});

describe('SurveyModal — NPS flow', () => {
  it('renders 11 score buttons (0-10) and the NPS title', () => {
    setup();
    expect(screen.getByText('surveyNpsTitle')).toBeInTheDocument();
    for (let n = 0; n <= 10; n++) {
      expect(screen.getByTestId(`SurveyModal__nps-${n}`)).toBeInTheDocument();
    }
  });

  it('disables Next until a score is picked, then enables it', async () => {
    const user = userEvent.setup();
    setup();
    const next = screen.getByText('surveyNext').closest('button');
    expect(next).toBeDisabled();

    await user.click(screen.getByTestId('SurveyModal__nps-9'));
    expect(next).toBeEnabled();
  });

  it('advances to followup with promoter copy for score 9', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByTestId('SurveyModal__nps-9'));
    await user.click(screen.getByText('surveyNext').closest('button'));

    expect(screen.getByText('surveyNpsQ2Promoter')).toBeInTheDocument();
  });

  it('advances to followup with passive copy for score 6', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByTestId('SurveyModal__nps-6'));
    await user.click(screen.getByText('surveyNext').closest('button'));

    expect(screen.getByText('surveyNpsQ2Passive')).toBeInTheDocument();
  });

  it('advances to followup with detractor copy for score 3', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByTestId('SurveyModal__nps-3'));
    await user.click(screen.getByText('surveyNext').closest('button'));

    expect(screen.getByText('surveyNpsQ2Detractor')).toBeInTheDocument();
  });

  it('Back on the followup phase returns to score selection with the score preserved', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByTestId('SurveyModal__nps-7'));
    await user.click(screen.getByText('surveyNext').closest('button'));
    expect(screen.getByText('surveyNpsQ2Passive')).toBeInTheDocument();

    await user.click(screen.getByTestId('SurveyModal__back'));

    expect(screen.getByTestId('SurveyModal__nps-scale')).toBeInTheDocument();
    expect(screen.getByTestId('SurveyModal__nps-7')).toHaveStyle({ background: '#C28800' });
  });

  it('Back clears stale tags: resubmitting under a different score/segment does not carry the previously-selected tag (regression)', async () => {
    const user = userEvent.setup();
    const { onRespond } = setup();

    await user.click(screen.getByTestId('SurveyModal__nps-9'));
    await user.click(screen.getByText('surveyNext').closest('button'));
    expect(screen.getByText('surveyNpsQ2Promoter')).toBeInTheDocument();

    // Select a chip tag while in the promoter followup.
    await user.click(screen.getByText('surveyChipSpeed'));

    await user.click(screen.getByTestId('SurveyModal__back'));

    // Score selection UI is back, with the previously-selected score preserved.
    expect(screen.getByTestId('SurveyModal__nps-scale')).toBeInTheDocument();
    expect(screen.getByTestId('SurveyModal__nps-9')).toHaveStyle({ background: '#17663A' });

    // Pick a different score (detractor segment) and advance to followup again,
    // WITHOUT re-selecting any tag.
    await user.click(screen.getByTestId('SurveyModal__nps-2'));
    await user.click(screen.getByText('surveyNext').closest('button'));
    expect(screen.getByText('surveyNpsQ2Detractor')).toBeInTheDocument();

    await user.click(screen.getByText('surveySubmit').closest('button'));

    expect(onRespond).toHaveBeenCalledWith(2, '', []);
    const [, , tagsArg] = onRespond.mock.calls[0];
    expect(tagsArg).not.toContain('surveyChipSpeed');
  });

  it('shows the promoter-only AI chip option for promoters', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByTestId('SurveyModal__nps-10'));
    await user.click(screen.getByText('surveyNext').closest('button'));

    expect(screen.getByText('surveyChipAI')).toBeInTheDocument();
  });

  it('does not show the AI chip option for detractors', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByTestId('SurveyModal__nps-2'));
    await user.click(screen.getByText('surveyNext').closest('button'));

    expect(screen.queryByText('surveyChipAI')).not.toBeInTheDocument();
  });

  it('submits followup: calls onRespond with score/feedback/tags, then onClose after the timer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onRespond, onClose } = setup();

    await user.click(screen.getByTestId('SurveyModal__nps-9'));
    await user.click(screen.getByText('surveyNext').closest('button'));

    const textarea = screen.getByPlaceholderText('surveyNpsQ2Placeholder');
    await user.type(textarea, 'Great product');

    // Select a chip tag (any option offered for promoters).
    await user.click(screen.getByText('surveyChipSpeed'));

    await user.click(screen.getByText('surveySubmit').closest('button'));

    expect(onRespond).toHaveBeenCalledWith(9, 'Great product', ['surveyChipSpeed']);
    expect(screen.getByTestId('SurveyModal__thank-you')).toBeInTheDocument();
    expect(screen.getByText('surveyNpsThanksLine')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking Skip on the initial phase calls onDismiss without calling onRespond', async () => {
    const user = userEvent.setup();
    const { onDismiss, onRespond } = setup();

    await user.click(screen.getByText('surveySkip').closest('button'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onRespond).not.toHaveBeenCalled();
  });

  it('does NOT call onScoreSelected immediately when a score is picked', async () => {
    const user = userEvent.setup();
    const { onScoreSelected } = setup();

    await user.click(screen.getByTestId('SurveyModal__nps-9'));

    expect(onScoreSelected).not.toHaveBeenCalled();
  });

  it('calls onScoreSelected with the last picked score, exactly once, when Skip is clicked after selecting', async () => {
    const user = userEvent.setup();
    const { onScoreSelected, onDismiss } = setup();

    await user.click(screen.getByTestId('SurveyModal__nps-3'));
    await user.click(screen.getByTestId('SurveyModal__nps-9'));
    await user.click(screen.getByText('surveySkip').closest('button'));

    expect(onScoreSelected).toHaveBeenCalledTimes(1);
    expect(onScoreSelected).toHaveBeenCalledWith(9);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onScoreSelected when Skip is clicked without ever picking a score', async () => {
    const user = userEvent.setup();
    const { onScoreSelected, onDismiss } = setup();

    await user.click(screen.getByText('surveySkip').closest('button'));

    expect(onScoreSelected).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onScoreSelected when the user submits (survey_responded already carries the score)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onScoreSelected, onRespond } = setup();

    await user.click(screen.getByTestId('SurveyModal__nps-9'));
    await user.click(screen.getByText('surveyNext').closest('button'));
    await user.click(screen.getByText('surveySubmit').closest('button'));

    expect(onRespond).toHaveBeenCalledWith(9, '', []);
    expect(onScoreSelected).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
  });

  it('calls onScoreSelected once when the close (X) button is clicked after picking a score', async () => {
    const user = userEvent.setup();
    const { onScoreSelected } = setup();

    await user.click(screen.getByTestId('SurveyModal__nps-6'));
    await user.click(screen.getByTestId('SurveyModal__close'));

    expect(onScoreSelected).toHaveBeenCalledTimes(1);
    expect(onScoreSelected).toHaveBeenCalledWith(6);
  });

  it('calls onScoreSelected once when the backdrop is clicked after picking a score', () => {
    const { onScoreSelected } = setup();

    fireEvent.click(screen.getByTestId('SurveyModal__nps-4'));
    fireEvent.click(screen.getByTestId('SurveyModal__backdrop'));

    expect(onScoreSelected).toHaveBeenCalledTimes(1);
    expect(onScoreSelected).toHaveBeenCalledWith(4);
  });
});

describe('SurveyModal — CSAT flow', () => {
  it('renders 5 star buttons and the survey title', () => {
    setup({ survey: csatSurvey });
    expect(screen.getByText('surveyInvoicingTitle')).toBeInTheDocument();
    for (let n = 1; n <= 5; n++) {
      expect(screen.getByTestId(`SurveyModal__star-${n}`)).toBeInTheDocument();
    }
  });

  it('score > 3 goes straight to thanks and calls onRespond (no followup textarea)', async () => {
    const user = userEvent.setup();
    const { onRespond } = setup({ survey: csatSurvey });

    await user.click(screen.getByTestId('SurveyModal__star-5'));
    await user.click(screen.getByText('surveySubmit').closest('button'));

    expect(onRespond).toHaveBeenCalledWith(5, '', []);
    expect(screen.getByTestId('SurveyModal__thank-you')).toBeInTheDocument();
    expect(screen.getByText('surveyInvoicingThanks')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('surveyInvoicingQ2Placeholder')).not.toBeInTheDocument();
  });

  it('score <= 3 shows the followup textarea before thanks', async () => {
    const user = userEvent.setup();
    const { onRespond } = setup({ survey: csatSurvey });

    await user.click(screen.getByTestId('SurveyModal__star-2'));
    await user.click(screen.getByText('surveySubmit').closest('button'));

    // Still in followup — onRespond not called yet, textarea for Q2 is visible.
    expect(onRespond).not.toHaveBeenCalled();
    expect(screen.getByText('surveyInvoicingQ2')).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText('surveyInvoicingQ2Placeholder');
    expect(textarea).toBeInTheDocument();

    await user.type(textarea, 'Could be faster');
    await user.click(screen.getByText('surveySubmit').closest('button'));

    expect(onRespond).toHaveBeenCalledWith(2, 'Could be faster', []);
    expect(screen.getByTestId('SurveyModal__thank-you')).toBeInTheDocument();
  });

  it('Back on the followup phase returns to star selection with the score preserved', async () => {
    const user = userEvent.setup();
    setup({ survey: csatSurvey });

    await user.click(screen.getByTestId('SurveyModal__star-2'));
    await user.click(screen.getByText('surveySubmit').closest('button'));
    expect(screen.getByText('surveyInvoicingQ2')).toBeInTheDocument();

    await user.click(screen.getByTestId('SurveyModal__back'));

    expect(screen.getByTestId('SurveyModal__star-scale')).toBeInTheDocument();
    expect(screen.getByTestId('SurveyModal__star-2')).toHaveAttribute('aria-label', '2');
    // The star scale re-renders with the preserved score: stars 1-2 render filled.
    const star2Svg = screen.getByTestId('SurveyModal__star-2').querySelector('svg');
    expect(star2Svg).toHaveAttribute('fill', '#FFC233');
  });

  it('Back clears stale feedback: switching to a high score after Back does not resubmit the old low-score feedback (regression)', async () => {
    const user = userEvent.setup();
    const { onRespond } = setup({ survey: csatSurvey });

    await user.click(screen.getByTestId('SurveyModal__star-2'));
    await user.click(screen.getByText('surveySubmit').closest('button'));
    expect(screen.getByText('surveyInvoicingQ2')).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText('surveyInvoicingQ2Placeholder');
    await user.type(textarea, 'Stale feedback for score 2');
    expect(textarea).toHaveValue('Stale feedback for score 2');

    await user.click(screen.getByTestId('SurveyModal__back'));

    // Score selection UI is back, with the previously-selected score preserved.
    expect(screen.getByTestId('SurveyModal__star-scale')).toBeInTheDocument();
    expect(screen.getByTestId('SurveyModal__star-2')).toHaveAttribute('aria-label', '2');

    // Pick a high score (>3) — this routes straight to thanks, skipping followup entirely.
    await user.click(screen.getByTestId('SurveyModal__star-5'));
    await user.click(screen.getByText('surveySubmit').closest('button'));

    expect(onRespond).toHaveBeenCalledWith(5, '', []);
    const [, feedbackArg] = onRespond.mock.calls[0];
    // Explicit, readable regression guard: the feedback argument must be empty/falsy,
    // not merely "not equal to the stale string" (which would also pass on any other leak).
    expect(feedbackArg).toBeFalsy();
    expect(feedbackArg).not.toBe('Stale feedback for score 2');
  });

  it('disables Submit until a star is picked', () => {
    setup({ survey: csatSurvey });
    const submit = screen.getByText('surveySubmit').closest('button');
    expect(submit).toBeDisabled();
  });

  it('star hover/selection updates which stars render as "on" via aria-label lookup', async () => {
    const user = userEvent.setup();
    setup({ survey: csatSurvey });

    await user.click(screen.getByTestId('SurveyModal__star-3'));

    // Selecting star 3 should fill stars 1-3 (stroke changes) — verify via the
    // rendered svg fill attribute, which flips from 'transparent' to the fill color.
    const star1Svg = screen.getByTestId('SurveyModal__star-1').querySelector('svg');
    const star3Svg = screen.getByTestId('SurveyModal__star-3').querySelector('svg');
    const star5Svg = screen.getByTestId('SurveyModal__star-5').querySelector('svg');

    expect(star1Svg).toHaveAttribute('fill', '#FFC233');
    expect(star3Svg).toHaveAttribute('fill', '#FFC233');
    expect(star5Svg).toHaveAttribute('fill', 'transparent');
  });

  it('clicking Skip on the initial phase calls onDismiss without calling onRespond', async () => {
    const user = userEvent.setup();
    const { onDismiss, onRespond } = setup({ survey: csatSurvey });

    await user.click(screen.getByText('surveySkip').closest('button'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onRespond).not.toHaveBeenCalled();
  });

  it('does NOT call onScoreSelected immediately when a star is picked', async () => {
    const user = userEvent.setup();
    const { onScoreSelected } = setup({ survey: csatSurvey });

    await user.click(screen.getByTestId('SurveyModal__star-2'));

    expect(onScoreSelected).not.toHaveBeenCalled();
  });

  it('calls onScoreSelected once with the picked star when Skip is clicked after selecting', async () => {
    const user = userEvent.setup();
    const { onScoreSelected, onDismiss } = setup({ survey: csatSurvey });

    await user.click(screen.getByTestId('SurveyModal__star-2'));
    await user.click(screen.getByText('surveySkip').closest('button'));

    expect(onScoreSelected).toHaveBeenCalledTimes(1);
    expect(onScoreSelected).toHaveBeenCalledWith(2);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onScoreSelected when the user submits a low score and completes the followup', async () => {
    const user = userEvent.setup();
    const { onScoreSelected, onRespond } = setup({ survey: csatSurvey });

    await user.click(screen.getByTestId('SurveyModal__star-2'));
    await user.click(screen.getByText('surveySubmit').closest('button'));
    await user.click(screen.getByText('surveySubmit').closest('button'));

    expect(onRespond).toHaveBeenCalledWith(2, '', []);
    expect(onScoreSelected).not.toHaveBeenCalled();
  });

  it('shows all 6 canned-response options in the followup phase and clicking one prefills the editable textarea', async () => {
    const user = userEvent.setup();
    setup({ survey: csatSurvey });

    await user.click(screen.getByTestId('SurveyModal__star-2'));
    await user.click(screen.getByText('surveySubmit').closest('button'));

    for (let n = 1; n <= 6; n++) {
      expect(screen.getByText(`surveyInvoicingCanned${n}`)).toBeInTheDocument();
    }

    const textarea = screen.getByPlaceholderText('surveyInvoicingQ2Placeholder');
    expect(textarea).toHaveValue('');

    await user.click(screen.getByText('surveyInvoicingCanned1'));
    expect(textarea).toHaveValue('surveyInvoicingCanned1');

    // Still editable after picking a canned response.
    await user.type(textarea, ' but faster');
    expect(textarea).toHaveValue('surveyInvoicingCanned1 but faster');
  });

  it('prefers backoffice-configured canned responses over the hardcoded locale-key fallback', async () => {
    getRemoteCannedResponses.mockReturnValue([
      { icon: '🐢', text: 'Muy lento (config remota)', minScore: 1, maxScore: 3 },
      { icon: '🤔', text: 'Difícil (config remota)', minScore: 1, maxScore: 3 },
    ]);
    const user = userEvent.setup();
    setup({ survey: csatSurvey });

    await user.click(screen.getByTestId('SurveyModal__star-2'));
    await user.click(screen.getByText('surveySubmit').closest('button'));

    expect(getRemoteCannedResponses).toHaveBeenCalledWith('csat_invoicing', 'es_ES');
    expect(screen.getByText('Muy lento (config remota)')).toBeInTheDocument();
    // Falls back away from the hardcoded locale-key list entirely when remote data exists.
    expect(screen.queryByText('surveyInvoicingCanned1')).not.toBeInTheDocument();

    await user.click(screen.getByText('Muy lento (config remota)'));
    const textarea = screen.getByPlaceholderText('surveyInvoicingQ2Placeholder');
    expect(textarea).toHaveValue('Muy lento (config remota)');
  });

  it('filters remote canned responses by the score range the user picked', async () => {
    getRemoteCannedResponses.mockReturnValue([
      { icon: '😡', text: 'Muy insatisfecho', minScore: 1, maxScore: 1 },
      { icon: '😐', text: 'Podría mejorar', minScore: 2, maxScore: 3 },
    ]);
    const user = userEvent.setup();
    setup({ survey: csatSurvey });

    await user.click(screen.getByTestId('SurveyModal__star-1'));
    await user.click(screen.getByText('surveySubmit').closest('button'));

    expect(screen.getByText('Muy insatisfecho')).toBeInTheDocument();
    expect(screen.queryByText('Podría mejorar')).not.toBeInTheDocument();
  });

  it('shows a different score band range when the user picks a higher (still low) score', async () => {
    getRemoteCannedResponses.mockReturnValue([
      { icon: '😡', text: 'Muy insatisfecho', minScore: 1, maxScore: 1 },
      { icon: '😐', text: 'Podría mejorar', minScore: 2, maxScore: 3 },
    ]);
    const user = userEvent.setup();
    setup({ survey: csatSurvey });

    await user.click(screen.getByTestId('SurveyModal__star-3'));
    await user.click(screen.getByText('surveySubmit').closest('button'));

    expect(screen.getByText('Podría mejorar')).toBeInTheDocument();
    expect(screen.queryByText('Muy insatisfecho')).not.toBeInTheDocument();
  });

  it('clicking one of the last canned options (5 or 6) prefills the textarea with plain text only (no icon)', async () => {
    const user = userEvent.setup();
    setup({ survey: csatSurvey });

    await user.click(screen.getByTestId('SurveyModal__star-1'));
    await user.click(screen.getByText('surveySubmit').closest('button'));

    await user.click(screen.getByText('surveyInvoicingCanned6'));

    const textarea = screen.getByPlaceholderText('surveyInvoicingQ2Placeholder');
    expect(textarea).toHaveValue('surveyInvoicingCanned6');
  });

  it('shows the order-specific canned options (not the invoicing ones) for csat_order', async () => {
    const user = userEvent.setup();
    const orderSurvey = {
      id: 'csat_order',
      type: 'csat',
      titleKey: 'surveyOrderTitle',
      q2TitleKey: 'surveyOrderQ2',
      q2PlaceholderKey: 'surveyOrderQ2Placeholder',
      thanksKey: 'surveyOrderThanks',
      canned: [
        { icon: '🐢', key: 'surveyOrderCanned1' },
        { icon: '🤔', key: 'surveyOrderCanned2' },
        { icon: '🔍', key: 'surveyOrderCanned3' },
        { icon: '📋', key: 'surveyOrderCanned4' },
        { icon: '✅', key: 'surveyOrderCanned5' },
        { icon: '🐛', key: 'surveyOrderCanned6' },
      ],
    };
    setup({ survey: orderSurvey });

    await user.click(screen.getByTestId('SurveyModal__star-2'));
    await user.click(screen.getByText('surveySubmit').closest('button'));

    expect(screen.getByText('surveyOrderCanned3')).toBeInTheDocument();
    expect(screen.queryByText('surveyInvoicingCanned3')).not.toBeInTheDocument();
  });

  it('does not show canned-response buttons for a score > 3 (straight to thanks)', async () => {
    const user = userEvent.setup();
    setup({ survey: csatSurvey });

    await user.click(screen.getByTestId('SurveyModal__star-5'));
    await user.click(screen.getByText('surveySubmit').closest('button'));

    expect(screen.queryByText('surveyInvoicingCanned1')).not.toBeInTheDocument();
  });
});

describe('SurveyModal — close handlers', () => {
  it('close button calls onDismiss (not onClose directly)', async () => {
    const user = userEvent.setup();
    const { onDismiss, onClose } = setup();

    await user.click(screen.getByTestId('SurveyModal__close'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('backdrop click calls onDismiss while phase is not thanks', () => {
    const { onDismiss } = setup();
    fireEvent.click(screen.getByTestId('SurveyModal__backdrop'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('close button is not rendered once phase is thanks', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup({ survey: csatSurvey });

    await user.click(screen.getByTestId('SurveyModal__star-5'));
    await user.click(screen.getByText('surveySubmit').closest('button'));

    expect(screen.getByTestId('SurveyModal__thank-you')).toBeInTheDocument();
    expect(screen.queryByTestId('SurveyModal__close')).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
  });

  it('backdrop click is a no-op (does not call onDismiss) once phase is thanks', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onDismiss } = setup({ survey: csatSurvey });

    await user.click(screen.getByTestId('SurveyModal__star-5'));
    await user.click(screen.getByText('surveySubmit').closest('button'));
    onDismiss.mockClear();

    fireEvent.click(screen.getByTestId('SurveyModal__backdrop'));
    expect(onDismiss).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
  });
});

describe('SurveyModal — state reset on reopen', () => {
  it('resets score/phase/feedback when reopened after being closed', async () => {
    const user = userEvent.setup();
    const { rerender, onRespond } = setup();

    await user.click(screen.getByTestId('SurveyModal__nps-9'));
    await user.click(screen.getByText('surveyNext').closest('button'));
    expect(screen.getByText('surveyNpsQ2Promoter')).toBeInTheDocument();

    rerender(
      <SurveyModal survey={npsSurvey} open={false} onRespond={onRespond} onDismiss={vi.fn()} onClose={vi.fn()} />
    );
    rerender(
      <SurveyModal survey={npsSurvey} open onRespond={onRespond} onDismiss={vi.fn()} onClose={vi.fn()} />
    );

    // Back to the initial phase with no score selected.
    expect(screen.getByText('surveyNpsTitle')).toBeInTheDocument();
    const next = screen.getByText('surveyNext').closest('button');
    expect(next).toBeDisabled();
  });
});
