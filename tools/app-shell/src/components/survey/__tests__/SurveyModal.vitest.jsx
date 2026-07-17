// Real Vitest component test for SurveyModal — covers actual component code paths
// (NPS 0-10 flow, CSAT star flow, close/skip handlers, and the thanks->onClose timer).
vi.mock('@/i18n/index.js', () => ({
  useUI: () => (key) => key,
}));

import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SurveyModal } from '../SurveyModal.jsx';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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

  it('calls onScoreSelected with the picked score immediately, without submitting', async () => {
    const user = userEvent.setup();
    const { onScoreSelected, onRespond } = setup();

    await user.click(screen.getByTestId('SurveyModal__nps-9'));

    expect(onScoreSelected).toHaveBeenCalledWith(9);
    expect(onRespond).not.toHaveBeenCalled();
  });

  it('calls onScoreSelected again when the user changes their pick before submitting', async () => {
    const user = userEvent.setup();
    const { onScoreSelected } = setup();

    await user.click(screen.getByTestId('SurveyModal__nps-3'));
    await user.click(screen.getByTestId('SurveyModal__nps-9'));

    expect(onScoreSelected).toHaveBeenNthCalledWith(1, 3);
    expect(onScoreSelected).toHaveBeenNthCalledWith(2, 9);
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

  it('calls onScoreSelected with the picked star immediately, without submitting', async () => {
    const user = userEvent.setup();
    const { onScoreSelected, onRespond } = setup({ survey: csatSurvey });

    await user.click(screen.getByTestId('SurveyModal__star-2'));

    expect(onScoreSelected).toHaveBeenCalledWith(2);
    expect(onRespond).not.toHaveBeenCalled();
  });

  it('shows canned-response buttons in the followup phase and clicking one prefills the editable textarea', async () => {
    const user = userEvent.setup();
    setup({ survey: csatSurvey });

    await user.click(screen.getByTestId('SurveyModal__star-2'));
    await user.click(screen.getByText('surveySubmit').closest('button'));

    const textarea = screen.getByPlaceholderText('surveyInvoicingQ2Placeholder');
    expect(textarea).toHaveValue('');

    await user.click(screen.getByText('surveyCsatCanned1'));
    expect(textarea).toHaveValue('surveyCsatCanned1');

    // Still editable after picking a canned response.
    await user.type(textarea, ' but faster');
    expect(textarea).toHaveValue('surveyCsatCanned1 but faster');
  });

  it('does not show canned-response buttons for a score > 3 (straight to thanks)', async () => {
    const user = userEvent.setup();
    setup({ survey: csatSurvey });

    await user.click(screen.getByTestId('SurveyModal__star-5'));
    await user.click(screen.getByText('surveySubmit').closest('button'));

    expect(screen.queryByText('surveyCsatCanned1')).not.toBeInTheDocument();
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
