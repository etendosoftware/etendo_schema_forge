// Vitest render tests for OAuth2ClientDialog.jsx
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('lucide-react', () => ({
  Copy: (p) => <span {...p} />,
  AlertTriangle: (p) => <span {...p} />,
  Loader2: (p) => <span {...p} />,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children, className }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2 data-testid="dialog-title">{children}</h2>,
  DialogDescription: ({ children }) => <p>{children}</p>,
  DialogFooter: ({ children }) => <div data-testid="dialog-footer">{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, type, disabled, variant, ...rest }) => (
    <button onClick={onClick} type={type} disabled={disabled} data-variant={variant} {...rest}>{children}</button>
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props) => <input {...props} />,
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor }) => <label htmlFor={htmlFor}>{children}</label>,
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, id }) => (
    <input type="checkbox" data-testid={id} checked={checked} onChange={(e) => onCheckedChange(e.target.checked)} />
  ),
}));

vi.mock('@/lib/oauth2Api.js', () => ({
  createClient: vi.fn(),
  updateClient: vi.fn(),
}));

// ── Import under test ───────────────────────────────────────────────────────

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OAuth2ClientDialog, { SecretRevealDialog, ConfirmDialog } from '../OAuth2ClientDialog.jsx';
import { createClient, updateClient } from '@/lib/oauth2Api.js';
import { toast } from 'sonner';

// ── Tests ───────────────────────────────────────────────────────────────────

describe('OAuth2ClientDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    client: null,
    apiFetch: vi.fn(),
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dialog when open', () => {
    render(<OAuth2ClientDialog {...defaultProps} />);
    expect(screen.getByTestId('dialog')).toBeTruthy();
  });

  it('does not render when closed', () => {
    render(<OAuth2ClientDialog {...defaultProps} open={false} />);
    expect(screen.queryByTestId('dialog')).toBeNull();
  });

  it('shows "Create OAuth2 Client" title in create mode', () => {
    render(<OAuth2ClientDialog {...defaultProps} />);
    expect(screen.getByTestId('dialog-title').textContent).toBe('Create OAuth2 Client');
  });

  it('shows "Edit Client" title in edit mode', () => {
    const client = { id: '1', name: 'Test', scopes: [], isActive: true };
    render(<OAuth2ClientDialog {...defaultProps} client={client} />);
    expect(screen.getByTestId('dialog-title').textContent).toBe('Edit Client');
  });

  it('renders Name input', () => {
    render(<OAuth2ClientDialog {...defaultProps} />);
    expect(screen.getByPlaceholderText('My MCP Agent')).toBeTruthy();
  });

  it('renders User ID input', () => {
    render(<OAuth2ClientDialog {...defaultProps} />);
    expect(screen.getByPlaceholderText('e.g. 100')).toBeTruthy();
  });

  it('renders Role ID input', () => {
    render(<OAuth2ClientDialog {...defaultProps} />);
    expect(screen.getByPlaceholderText('e.g. 0')).toBeTruthy();
  });

  it('renders all scope checkboxes', () => {
    render(<OAuth2ClientDialog {...defaultProps} />);
    const checkboxes = screen.getAllByRole('checkbox');
    // 5 scopes + 1 active switch = 6
    expect(checkboxes.length).toBe(6);
  });

  it('renders Cancel and Create Client buttons', () => {
    render(<OAuth2ClientDialog {...defaultProps} />);
    expect(document.body.textContent).toContain('Cancel');
    expect(document.body.textContent).toContain('Create Client');
  });

  it('shows "Save Changes" in edit mode', () => {
    const client = { id: '1', name: 'Test', scopes: [], isActive: true };
    render(<OAuth2ClientDialog {...defaultProps} client={client} />);
    expect(document.body.textContent).toContain('Save Changes');
  });

  it('populates form fields in edit mode', () => {
    const client = { id: '1', name: 'My Client', adUserId: 'u1', adRoleId: 'r1', scopes: ['neo:read'], isActive: false };
    render(<OAuth2ClientDialog {...defaultProps} client={client} />);
    expect(screen.getByDisplayValue('My Client')).toBeTruthy();
    expect(screen.getByDisplayValue('u1')).toBeTruthy();
    expect(screen.getByDisplayValue('r1')).toBeTruthy();
  });

  it('calls createClient on submit in create mode', async () => {
    createClient.mockResolvedValue({ clientId: 'c1', clientSecret: null });
    render(<OAuth2ClientDialog {...defaultProps} />);
    // Fill name
    fireEvent.change(screen.getByPlaceholderText('My MCP Agent'), { target: { value: 'Test Client' } });
    // Submit
    const form = screen.getByTestId('dialog-content').querySelector('form');
    fireEvent.submit(form);
    await waitFor(() => {
      expect(createClient).toHaveBeenCalled();
    });
  });

  it('shows toast error when name is empty on submit', async () => {
    render(<OAuth2ClientDialog {...defaultProps} />);
    const form = screen.getByTestId('dialog-content').querySelector('form');
    fireEvent.submit(form);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Name is required');
    });
  });

  it('calls updateClient on submit in edit mode', async () => {
    updateClient.mockResolvedValue({});
    const client = { id: '1', name: 'Test', scopes: [], isActive: true };
    render(<OAuth2ClientDialog {...defaultProps} client={client} />);
    const form = screen.getByTestId('dialog-content').querySelector('form');
    fireEvent.submit(form);
    await waitFor(() => {
      expect(updateClient).toHaveBeenCalled();
    });
  });
});

// ── SecretRevealDialog ──────────────────────────────────────────────────────

describe('SecretRevealDialog', () => {
  it('renders client ID and secret', () => {
    render(
      <SecretRevealDialog open={true} onClose={vi.fn()} clientId="cid-123" clientSecret="secret-abc" />
    );
    expect(document.body.textContent).toContain('cid-123');
    expect(document.body.textContent).toContain('secret-abc');
  });

  it('shows warning about secret not being shown again', () => {
    render(
      <SecretRevealDialog open={true} onClose={vi.fn()} clientId="cid" clientSecret="sec" />
    );
    expect(document.body.textContent).toContain('This secret will not be shown again');
  });

  it('renders "I have saved the secret" button', () => {
    const onClose = vi.fn();
    render(
      <SecretRevealDialog open={true} onClose={onClose} clientId="cid" clientSecret="sec" />
    );
    const btn = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent.includes('I have saved the secret'));
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onClose).toHaveBeenCalled();
  });
});

// ── ConfirmDialog ───────────────────────────────────────────────────────────

describe('ConfirmDialog', () => {
  it('renders title and description', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Delete?"
        description="Are you sure?"
        onConfirm={vi.fn()}
      />
    );
    expect(document.body.textContent).toContain('Delete?');
    expect(document.body.textContent).toContain('Are you sure?');
  });

  it('renders confirm and cancel buttons', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="T"
        description="D"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={vi.fn()}
      />
    );
    expect(document.body.textContent).toContain('Yes');
    expect(document.body.textContent).toContain('No');
  });

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="T"
        description="D"
        onConfirm={onConfirm}
      />
    );
    const btn = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent === 'Confirm');
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalled();
  });

  it('uses destructive variant when specified', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="T"
        description="D"
        variant="destructive"
        onConfirm={vi.fn()}
      />
    );
    const btn = Array.from(document.querySelectorAll('button'))
      .find((b) => b.getAttribute('data-variant') === 'destructive');
    expect(btn).toBeTruthy();
  });

  it('disables buttons when loading', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="T"
        description="D"
        loading={true}
        onConfirm={vi.fn()}
      />
    );
    const btns = screen.getByTestId('dialog-footer').querySelectorAll('button');
    btns.forEach((btn) => expect(btn.disabled).toBe(true));
  });
});
