import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InviteUserDialog } from '../InviteUserDialog.jsx';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

describe('InviteUserDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the email input and submit button when open', () => {
    render(<InviteUserDialog open={true} onOpenChange={() => {}} />);

    expect(screen.getByTestId('invite-user-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('invite-user-email')).toBeInTheDocument();
    expect(screen.getByTestId('invite-user-submit')).toBeInTheDocument();
  });

  it('submits email and displays pending confirmation upon success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        invitation: { id: 'inv-1', email: 'colleague@example.com', status: 'PENDING' },
      }),
    });
    globalThis.fetch = fetchMock;

    const onSuccess = vi.fn();
    render(<InviteUserDialog open={true} onOpenChange={() => {}} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByTestId('invite-user-email'), {
      target: { value: 'colleague@example.com' },
    });
    fireEvent.click(screen.getByTestId('invite-user-submit'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/sws/go/company-invitations'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'colleague@example.com', language: 'es_ES' }),
        })
      );
      expect(screen.getByTestId('invite-user-success-view')).toBeInTheDocument();
      expect(screen.getByTestId('invite-user-pending-status')).toHaveTextContent('inviteUserPendingBadge');
    });

    expect(onSuccess).toHaveBeenCalled();
  });

  it('displays error message when email is invalid or member exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: true,
        code: 'USER_ALREADY_MEMBER',
        message: 'This user is already a member of this company.',
      }),
    });
    globalThis.fetch = fetchMock;

    render(<InviteUserDialog open={true} onOpenChange={() => {}} />);

    fireEvent.change(screen.getByTestId('invite-user-email'), {
      target: { value: 'existing@example.com' },
    });
    fireEvent.click(screen.getByTestId('invite-user-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('invite-user-error')).toBeInTheDocument();
      expect(screen.getByTestId('invite-user-error')).toHaveTextContent('inviteUserAlreadyMember');
    });
  });

  // ETP-5206 — `invitationErrorMessage`'s unmapped-code fallback used to read the backend's
  // raw `message` field; it now always falls back to the generic, cataloged description.
  it('ETP-5206: falls back to the generic description for an unmapped error code, never the raw backend message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: true,
        code: 'SOME_UNMAPPED_CODE',
        message: 'boom from backend',
      }),
    });
    globalThis.fetch = fetchMock;

    render(<InviteUserDialog open={true} onOpenChange={() => {}} />);

    fireEvent.change(screen.getByTestId('invite-user-email'), {
      target: { value: 'existing@example.com' },
    });
    fireEvent.click(screen.getByTestId('invite-user-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('invite-user-error')).toBeInTheDocument();
      expect(screen.getByTestId('invite-user-error')).toHaveTextContent('invitePageInvalidDescription');
    });
    expect(screen.getByTestId('invite-user-error')).not.toHaveTextContent('boom from backend');
  });

  // ETP-5206 — the catch-all (network/fetch exception) path used to read `err.message`; it
  // now always shows the same generic, cataloged description.
  it('ETP-5206: falls back to the generic description when the request throws, never the raw exception message', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('boom from backend'));
    globalThis.fetch = fetchMock;

    render(<InviteUserDialog open={true} onOpenChange={() => {}} />);

    fireEvent.change(screen.getByTestId('invite-user-email'), {
      target: { value: 'existing@example.com' },
    });
    fireEvent.click(screen.getByTestId('invite-user-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('invite-user-error')).toBeInTheDocument();
      expect(screen.getByTestId('invite-user-error')).toHaveTextContent('invitePageInvalidDescription');
    });
    expect(screen.getByTestId('invite-user-error')).not.toHaveTextContent('boom from backend');
  });
});
