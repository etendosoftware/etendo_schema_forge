import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { createClient, updateClient } from '@/lib/oauth2Api.js';
import { toast } from 'sonner';
import { Copy, AlertTriangle, Loader2 } from 'lucide-react';

const ALL_SCOPES = ['neo:read', 'neo:write', 'neo:process', 'neo:report', 'neo:*'];
const GRANULAR_SCOPES = ALL_SCOPES.filter((s) => s !== 'neo:*');

/**
 * Dialog for creating or editing an OAuth2 client.
 *
 * Create mode: client prop is null. On success, shows SecretRevealDialog.
 * Edit mode: client prop is an existing client object.
 */
export default function OAuth2ClientDialog({ open, onOpenChange, client, apiFetch, onSuccess }) {
  const isEdit = !!client;

  const [name, setName] = useState('');
  const [adUserId, setAdUserId] = useState('');
  const [adRoleId, setAdRoleId] = useState('');
  const [scopes, setScopes] = useState([]);
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Secret reveal state (only used after create)
  const [revealData, setRevealData] = useState(null);

  // Reset form when dialog opens or client changes
  useEffect(() => {
    if (open) {
      if (client) {
        setName(client.name || '');
        setAdUserId(client.adUserId || '');
        setAdRoleId(client.adRoleId || '');
        setScopes(client.scopes || []);
        setIsActive(client.isActive !== false);
      } else {
        setName('');
        setAdUserId('');
        setAdRoleId('');
        setScopes([]);
        setIsActive(true);
      }
      setRevealData(null);
    }
  }, [open, client]);

  const hasWildcard = scopes.includes('neo:*');

  const toggleScope = (scope) => {
    if (scope === 'neo:*') {
      // Toggle wildcard: if already set, clear all; otherwise set wildcard + all granular
      if (hasWildcard) {
        setScopes([]);
      } else {
        setScopes([...ALL_SCOPES]);
      }
    } else {
      if (hasWildcard) return; // granular scopes locked when wildcard is on
      setScopes((prev) =>
        prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
      );
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        adUserId: adUserId.trim() || undefined,
        adRoleId: adRoleId.trim() || undefined,
        scopes,
        isActive,
      };

      if (isEdit) {
        await updateClient(apiFetch, client.id, payload);
        toast.success('Client updated');
        onOpenChange(false);
        onSuccess?.();
      } else {
        const result = await createClient(apiFetch, payload);
        if (result.clientSecret) {
          setRevealData({
            clientId: result.clientId,
            clientSecret: result.clientSecret,
          });
        } else {
          toast.success('Client created');
          onOpenChange(false);
          onSuccess?.();
        }
      }
    } catch (err) {
      toast.error(isEdit ? 'Failed to update client' : 'Failed to create client', {
        description: err.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseReveal = () => {
    setRevealData(null);
    onOpenChange(false);
    onSuccess?.();
  };

  // If we have reveal data, show the secret reveal dialog instead
  if (revealData) {
    return (
      <SecretRevealDialog
        open={open}
        onClose={handleCloseReveal}
        clientId={revealData.clientId}
        clientSecret={revealData.clientSecret}
        data-testid="SecretRevealDialog__4aea7f" />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} data-testid="Dialog__4aea7f">
      <DialogContent className="sm:max-w-md" data-testid="DialogContent__4aea7f">
        <form onSubmit={handleSubmit}>
          <DialogHeader data-testid="DialogHeader__4aea7f">
            <DialogTitle data-testid="DialogTitle__4aea7f">{isEdit ? 'Edit Client' : 'Create OAuth2 Client'}</DialogTitle>
            <DialogDescription data-testid="DialogDescription__4aea7f">
              {isEdit
                ? 'Update the client configuration. Secret is not changed here.'
                : 'Create a new OAuth2 client for MCP agent authentication.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Name */}
            <div className="grid gap-2">
              <Label htmlFor="client-name" data-testid="Label__4aea7f">Name *</Label>
              <Input
                id="client-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My MCP Agent"
                required
                data-testid="Input__4aea7f" />
            </div>

            {/* Etendo User ID */}
            <div className="grid gap-2">
              <Label htmlFor="client-user-id" data-testid="Label__4aea7f">Etendo User ID</Label>
              <Input
                id="client-user-id"
                value={adUserId}
                onChange={(e) => setAdUserId(e.target.value)}
                placeholder="e.g. 100"
                className="font-mono text-sm"
                data-testid="Input__4aea7f" />
            </div>

            {/* Etendo Role ID */}
            <div className="grid gap-2">
              <Label htmlFor="client-role-id" data-testid="Label__4aea7f">Etendo Role ID</Label>
              <Input
                id="client-role-id"
                value={adRoleId}
                onChange={(e) => setAdRoleId(e.target.value)}
                placeholder="e.g. 0"
                className="font-mono text-sm"
                data-testid="Input__4aea7f" />
            </div>

            {/* Scopes */}
            <div className="grid gap-2">
              <Label data-testid="Label__4aea7f">Scopes</Label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_SCOPES.map((scope) => {
                  const isGranular = scope !== 'neo:*';
                  const checked = scopes.includes(scope) || (isGranular && hasWildcard);
                  const disabled = isGranular && hasWildcard;

                  return (
                    <label
                      key={scope}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors ${
                        checked
                          ? 'border-primary bg-primary/5'
                          : 'border-input hover:border-primary/50'
                      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleScope(scope)}
                        className="rounded border-input"
                      />
                      <span className={`font-mono ${scope === 'neo:*' ? 'font-semibold' : ''}`}>
                        {scope}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between">
              <Label htmlFor="client-active" data-testid="Label__4aea7f">Active</Label>
              <Switch
                id="client-active"
                checked={isActive}
                onCheckedChange={setIsActive}
                data-testid="Switch__4aea7f" />
            </div>
          </div>

          <DialogFooter data-testid="DialogFooter__4aea7f">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="Button__4aea7f">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} data-testid="Button__4aea7f">
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" data-testid="Loader2__4aea7f" />}
              {isEdit ? 'Save Changes' : 'Create Client'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Dialog shown once after client creation, displaying the generated secret.
 * The secret cannot be retrieved again after closing.
 */
export function SecretRevealDialog({ open, onClose, clientId, clientSecret }) {
  const [copied, setCopied] = useState(null);

  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      data-testid="Dialog__4aea7f">
      <DialogContent className="sm:max-w-lg" data-testid="DialogContent__4aea7f">
        <DialogHeader data-testid="DialogHeader__4aea7f">
          <DialogTitle data-testid="DialogTitle__4aea7f">Client Created Successfully</DialogTitle>
          <DialogDescription data-testid="DialogDescription__4aea7f">
            Save these credentials now. The secret will not be shown again.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-2 rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" data-testid="AlertTriangle__4aea7f" />
            <span>This secret will not be shown again. Copy it now.</span>
          </div>

          {/* Client ID */}
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground" data-testid="Label__4aea7f">Client ID</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono break-all">
                {clientId}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => copyToClipboard(clientId, 'Client ID')}
                data-testid="Button__4aea7f">
                <Copy className="h-4 w-4" data-testid="Copy__4aea7f" />
              </Button>
            </div>
          </div>

          {/* Client Secret */}
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground" data-testid="Label__4aea7f">Client Secret</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono break-all">
                {clientSecret}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => copyToClipboard(clientSecret, 'Secret')}
                data-testid="Button__4aea7f">
                <Copy className="h-4 w-4" data-testid="Copy__4aea7f" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter data-testid="DialogFooter__4aea7f">
          <Button onClick={onClose} data-testid="Button__4aea7f">
            I have saved the secret
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Confirmation dialog built on top of shadcn Dialog.
 * Used for destructive actions (delete, regenerate, revoke).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  loading = false,
  onConfirm,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} data-testid="Dialog__4aea7f">
      <DialogContent className="sm:max-w-md" data-testid="DialogContent__4aea7f">
        <DialogHeader data-testid="DialogHeader__4aea7f">
          <DialogTitle data-testid="DialogTitle__4aea7f">{title}</DialogTitle>
          <DialogDescription data-testid="DialogDescription__4aea7f">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter data-testid="DialogFooter__4aea7f">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            data-testid="Button__4aea7f">
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={loading}
            data-testid="Button__4aea7f">
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" data-testid="Loader2__4aea7f" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
