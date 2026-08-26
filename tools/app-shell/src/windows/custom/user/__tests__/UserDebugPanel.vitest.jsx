/**
 * Tests for UserDebugPanel.jsx (ETP-4830, item #4) — the dev/QA-only panel activated by
 * useUserDebugMode's `debuguser` keystroke sequence. Both actions are covered against a
 * mocked `debugInvitationBypassApi.js` (the real fetch/PATCH mechanics live in that module
 * and in the backend `SFDebugInvitationBypass` webhook, covered by their own suites) —
 * this file only has to prove the panel wires email/status input into the right call and
 * surfaces success/error feedback.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args) => toastSuccess(...args),
    error: (...args) => toastError(...args),
  },
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));

const forceAcceptInvitation = vi.fn();
const forceInvitationStatus = vi.fn();
vi.mock('@/lib/debugInvitationBypassApi.js', () => ({
  forceAcceptInvitation: (...args) => forceAcceptInvitation(...args),
  forceInvitationStatus: (...args) => forceInvitationStatus(...args),
}));

import UserDebugPanel from '../UserDebugPanel.jsx';

beforeEach(() => {
  vi.clearAllMocks();
});

it('disables both action buttons until an email is entered', () => {
  render(<UserDebugPanel />);

  expect(screen.getByTestId('UserDebugPanel__forceAccept')).toBeDisabled();
  expect(screen.getByTestId('UserDebugPanel__forceStatus')).toBeDisabled();

  fireEvent.change(screen.getByTestId('UserDebugPanel__email'), { target: { value: 'user@example.com' } });

  expect(screen.getByTestId('UserDebugPanel__forceAccept')).not.toBeDisabled();
  expect(screen.getByTestId('UserDebugPanel__forceStatus')).not.toBeDisabled();
});

it('force-accept calls forceAcceptInvitation with the trimmed email and shows a success toast', async () => {
  forceAcceptInvitation.mockResolvedValue({ success: true, accountId: 'acct-1' });
  const onDataMutated = vi.fn();
  render(<UserDebugPanel onDataMutated={onDataMutated} />);

  fireEvent.change(screen.getByTestId('UserDebugPanel__email'), { target: { value: '  user@example.com  ' } });
  fireEvent.click(screen.getByTestId('UserDebugPanel__forceAccept'));

  await waitFor(() => expect(forceAcceptInvitation).toHaveBeenCalledWith({ email: 'user@example.com' }));
  await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  expect(onDataMutated).toHaveBeenCalled();
});

it('force-accept surfaces the temporary password when a new account was created', async () => {
  forceAcceptInvitation.mockResolvedValue({
    success: true, accountId: 'acct-new', accountCreated: true, temporaryPassword: 'Aa1!xyz',
  });
  render(<UserDebugPanel />);

  fireEvent.change(screen.getByTestId('UserDebugPanel__email'), { target: { value: 'new@example.com' } });
  fireEvent.click(screen.getByTestId('UserDebugPanel__forceAccept'));

  await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  const [message] = toastSuccess.mock.calls[0];
  expect(message).toContain('Aa1!xyz');
});

it('force-accept shows an error toast when the backend rejects the request', async () => {
  forceAcceptInvitation.mockRejectedValue(new Error('Email is required'));
  render(<UserDebugPanel />);

  fireEvent.change(screen.getByTestId('UserDebugPanel__email'), { target: { value: 'user@example.com' } });
  fireEvent.click(screen.getByTestId('UserDebugPanel__forceAccept'));

  await waitFor(() => expect(toastError).toHaveBeenCalledWith('Email is required'));
});

it('force-status calls forceInvitationStatus with the selected status', async () => {
  forceInvitationStatus.mockResolvedValue({ success: true, status: 'DELIVERY_FAILED' });
  render(<UserDebugPanel />);

  fireEvent.change(screen.getByTestId('UserDebugPanel__email'), { target: { value: 'user@example.com' } });
  fireEvent.change(screen.getByTestId('UserDebugPanel__statusSelect'), { target: { value: 'DELIVERY_FAILED' } });
  fireEvent.click(screen.getByTestId('UserDebugPanel__forceStatus'));

  await waitFor(() => expect(forceInvitationStatus).toHaveBeenCalledWith({
    email: 'user@example.com', status: 'DELIVERY_FAILED',
  }));
  await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
});

it('force-status shows an error toast when the backend rejects the request', async () => {
  forceInvitationStatus.mockRejectedValue(new Error('No matching invitation found'));
  render(<UserDebugPanel />);

  fireEvent.change(screen.getByTestId('UserDebugPanel__email'), { target: { value: 'user@example.com' } });
  fireEvent.click(screen.getByTestId('UserDebugPanel__forceStatus'));

  await waitFor(() => expect(toastError).toHaveBeenCalledWith('No matching invitation found'));
});

it('collapsing the panel hides the email/status inputs', () => {
  render(<UserDebugPanel />);

  expect(screen.getByTestId('UserDebugPanel__email')).toBeInTheDocument();

  fireEvent.click(screen.getByTestId('UserDebugPanel__toggleCollapse'));

  expect(screen.queryByTestId('UserDebugPanel__email')).not.toBeInTheDocument();
});

it('seeds the email datalist from the users prop', () => {
  render(<UserDebugPanel users={[{ id: 'u1', email: 'alice@example.com' }, { id: 'u2', email: 'bob@example.com' }]} />);

  const options = document.querySelectorAll('#user-debug-panel-emails option');
  const values = Array.from(options).map((o) => o.value);
  expect(values).toEqual(['alice@example.com', 'bob@example.com']);
});
