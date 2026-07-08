vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const sonnerMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: sonnerMocks.success, error: sonnerMocks.error },
}));

vi.mock('lucide-react', () => ({
  Copy: (props) => <span {...props}>Copy</span>,
  Check: (props) => <span {...props}>Check</span>,
}));

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CopyButton, CopyBlock } from '../copy-button.jsx';

describe('CopyButton', () => {
  let writeText;

  beforeEach(() => {
    vi.clearAllMocks();
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText }, configurable: true, writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the copy icon by default', () => {
    render(<CopyButton value="hello" />);
    expect(screen.getByTestId('CopyButton__copy')).toBeInTheDocument();
    expect(screen.queryByTestId('CopyButton__check')).not.toBeInTheDocument();
  });

  it('copies the given value to the clipboard on click', async () => {
    const user = userEvent.setup();
    render(<CopyButton value="copy-me" data-testid="my-copy" />);
    await user.click(screen.getByTestId('my-copy'));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('copy-me');
    });
  });

  it('flips to the copied state and shows a success toast after copying', async () => {
    const user = userEvent.setup();
    render(<CopyButton value="copy-me" data-testid="my-copy" />);
    await user.click(screen.getByTestId('my-copy'));

    await waitFor(() => {
      expect(screen.getByTestId('CopyButton__check')).toBeInTheDocument();
    });
    expect(sonnerMocks.success).toHaveBeenCalledWith('copied');
  });

  it('shows an error toast when the clipboard write fails', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'));
    const user = userEvent.setup();
    render(<CopyButton value="copy-me" data-testid="my-copy" />);
    await user.click(screen.getByTestId('my-copy'));

    await waitFor(() => {
      expect(sonnerMocks.error).toHaveBeenCalledWith('copyFailed');
    });
    expect(screen.queryByTestId('CopyButton__check')).not.toBeInTheDocument();
  });
});

describe('CopyBlock', () => {
  let writeText;

  beforeEach(() => {
    vi.clearAllMocks();
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText }, configurable: true, writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the given value as code content', () => {
    render(<CopyBlock value="const x = 1;" data-testid="my-block" />);
    expect(screen.getByTestId('my-block')).toBeInTheDocument();
    expect(screen.getByText('const x = 1;')).toBeInTheDocument();
  });

  it('copies the block value via its embedded CopyButton', async () => {
    const user = userEvent.setup();
    render(<CopyBlock value="const x = 1;" data-testid="my-block" />);
    await user.click(screen.getByTestId('my-block__copy'));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('const x = 1;');
    });
  });
});
