import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { createApiFetch } from '@/auth/api.js';
import { listClients, deleteClient, regenerateSecret, revokeTokens } from '@/lib/oauth2Api.js';
import OAuth2ClientDialog, { SecretRevealDialog, ConfirmDialog } from '@/components/OAuth2ClientDialog.jsx';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Shield, Plus, RefreshCw, Trash2, Key, MoreHorizontal, Copy, Ban, Pencil } from 'lucide-react';
import { useUI } from '@/i18n';
import { toast } from 'sonner';

function detectBaseUrl() {
  const path = window.location.pathname;
  const webIdx = path.indexOf('/web/');
  if (webIdx !== -1) return path.substring(0, webIdx);
  return import.meta.env.VITE_API_BASE || '';
}

export default function OAuth2ClientsPage() {
  const { token, logout } = useAuth();
  const ui = useUI();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  const apiFetch = useMemo(
    () => createApiFetch(detectBaseUrl(), () => token, logout),
    [token, logout]
  );

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listClients(apiFetch);
      setClients(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch OAuth2 clients:', err);
      toast.error('Failed to load clients', { description: err.message });
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // Create/Edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);

  // Confirmation dialog state
  const [confirmState, setConfirmState] = useState({
    open: false,
    title: '',
    description: '',
    confirmLabel: 'Confirm',
    variant: 'default',
    onConfirm: null,
  });
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Secret reveal after regenerate
  const [revealSecret, setRevealSecret] = useState(null);

  const handleCreate = () => {
    setEditingClient(null);
    setDialogOpen(true);
  };

  const handleEdit = (client) => {
    setEditingClient(client);
    setDialogOpen(true);
  };

  const handleDelete = (client) => {
    setConfirmState({
      open: true,
      title: `Delete "${client.name}"?`,
      description: ui('oauthDeleteDesc'),
      confirmLabel: 'Delete',
      variant: 'destructive',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          await deleteClient(apiFetch, client.id);
          toast.success('Client deleted');
          setConfirmState((s) => ({ ...s, open: false }));
          fetchClients();
        } catch (err) {
          toast.error('Failed to delete client', { description: err.message });
        } finally {
          setConfirmLoading(false);
        }
      },
    });
  };

  const handleRegenerateSecret = (client) => {
    setConfirmState({
      open: true,
      title: `Regenerate secret for "${client.name}"?`,
      description: ui('oauthRegenerateDesc'),
      confirmLabel: 'Regenerate',
      variant: 'destructive',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const result = await regenerateSecret(apiFetch, client.id);
          setConfirmState((s) => ({ ...s, open: false }));
          if (result.clientSecret) {
            setRevealSecret({
              clientId: result.clientId || client.clientId,
              clientSecret: result.clientSecret,
            });
          } else {
            toast.success('Secret regenerated');
          }
        } catch (err) {
          toast.error('Failed to regenerate secret', { description: err.message });
        } finally {
          setConfirmLoading(false);
        }
      },
    });
  };

  const handleRevokeTokens = (client) => {
    setConfirmState({
      open: true,
      title: `Revoke tokens for "${client.name}"?`,
      description: ui('oauthRevokeDesc'),
      confirmLabel: 'Revoke All',
      variant: 'destructive',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          await revokeTokens(apiFetch, client.id);
          toast.success('All tokens revoked', {
            description: `Tokens for "${client.name}" have been invalidated.`,
          });
          setConfirmState((s) => ({ ...s, open: false }));
        } catch (err) {
          toast.error('Failed to revoke tokens', { description: err.message });
        } finally {
          setConfirmLoading(false);
        }
      },
    });
  };

  const copyClientId = async (clientId) => {
    try {
      await navigator.clipboard.writeText(clientId);
      toast.success('Client ID copied');
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{ui("oauth2Clients")}</h2>
          <p className="text-muted-foreground">{ui("oauthClientManage")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={fetchClients}
            disabled={loading}
            data-testid="Button__82406d">
            <RefreshCw
              className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              data-testid="RefreshCw__82406d" />
          </Button>
          <Button onClick={handleCreate} data-testid="Button__82406d">
            <Plus className="h-4 w-4 mr-2" data-testid="Plus__82406d" />
            {ui("oauthClientNew")}
          </Button>
        </div>
      </div>
      <Card data-testid="Card__82406d">
        <CardContent className="p-0" data-testid="CardContent__82406d">
          {(() => {
            if (loading) {
              return (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" data-testid="RefreshCw__82406d" />
              {ui("loadingClients")}
            </div>
              );
            }

            if (clients.length === 0) {
              return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Shield
                className="h-12 w-12 text-muted-foreground/40 mb-4"
                data-testid="Shield__82406d" />
              <h3 className="text-lg font-medium text-foreground mb-1">{ui("oauthClientNoClients")}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {ui("oauthClientNoClientsDesc")}
              </p>
              <Button onClick={handleCreate} data-testid="Button__82406d">
                <Plus className="h-4 w-4 mr-2" data-testid="Plus__82406d" />
                {ui("oauthClientCreateFirst")}
              </Button>
            </div>
              );
            }

            return (
            <Table data-testid="Table__82406d">
              <TableHeader data-testid="TableHeader__82406d">
                <TableRow data-testid="TableRow__82406d">
                  <TableHead data-testid="TableHead__82406d">{ui("name")}</TableHead>
                  <TableHead data-testid="TableHead__82406d">{ui("oauthClientId")}</TableHead>
                  <TableHead data-testid="TableHead__82406d">{ui("user")}</TableHead>
                  <TableHead data-testid="TableHead__82406d">{ui("role")}</TableHead>
                  <TableHead data-testid="TableHead__82406d">{ui("oauthScopes")}</TableHead>
                  <TableHead data-testid="TableHead__82406d">{ui("oauthActive")}</TableHead>
                  <TableHead className="w-[60px]" data-testid="TableHead__82406d" />
                </TableRow>
              </TableHeader>
              <TableBody data-testid="TableBody__82406d">
                {clients.map((client) => (
                  <TableRow key={client.id} data-testid="TableRow__82406d">
                    <TableCell className="font-medium" data-testid="TableCell__82406d">{client.name}</TableCell>
                    <TableCell data-testid="TableCell__82406d">
                      <button
                        onClick={() => copyClientId(client.clientId)}
                        className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
                        title={ui("oauthClickToCopy")}
                      >
                        {client.clientId?.slice(0, 12)}{ui('ellipsis')}
                        <Copy className="h-3 w-3" data-testid="Copy__82406d" />
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground" data-testid="TableCell__82406d">
                      {client.adUserIdentifier || client.adUserId || '\u2014'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground" data-testid="TableCell__82406d">
                      {client.adRoleIdentifier || client.adRoleId || '\u2014'}
                    </TableCell>
                    <TableCell data-testid="TableCell__82406d">
                      <div className="flex flex-wrap gap-1">
                        {(client.scopes || []).map((scope) => (
                          <Badge
                            key={scope}
                            variant="secondary"
                            className="text-xs"
                            data-testid="Badge__82406d">
                            {scope}
                          </Badge>
                        ))}
                        {(!client.scopes || client.scopes.length === 0) && (
                          <span className="text-xs text-muted-foreground">{'\u2014'}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell data-testid="TableCell__82406d">
                      <Badge
                        variant={client.isActive ? 'default' : 'outline'}
                        data-testid="Badge__82406d">
                        {client.isActive ? ui('oauthActive') : ui('oauthInactive')}
                      </Badge>
                    </TableCell>
                    <TableCell data-testid="TableCell__82406d">
                      <DropdownMenu data-testid="DropdownMenu__82406d">
                        <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__82406d">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            data-testid="Button__82406d">
                            <MoreHorizontal className="h-4 w-4" data-testid="MoreHorizontal__82406d" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" data-testid="DropdownMenuContent__82406d">
                          <DropdownMenuItem onClick={() => handleEdit(client)} data-testid="DropdownMenuItem__82406d">
                            <Pencil className="h-4 w-4 mr-2" data-testid="Pencil__82406d" />
                            {ui("edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleRegenerateSecret(client)}
                            data-testid="DropdownMenuItem__82406d">
                            <Key className="h-4 w-4 mr-2" data-testid="Key__82406d" />
                            {ui("oauthRegenerateSecret")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleRevokeTokens(client)}
                            data-testid="DropdownMenuItem__82406d">
                            <Ban className="h-4 w-4 mr-2" data-testid="Ban__82406d" />
                            {ui("oauthRevokeTokens")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator data-testid="DropdownMenuSeparator__82406d" />
                          <DropdownMenuItem
                            onClick={() => handleDelete(client)}
                            className="text-destructive focus:text-destructive"
                            data-testid="DropdownMenuItem__82406d">
                            <Trash2 className="h-4 w-4 mr-2" data-testid="Trash2__82406d" />
                            {ui("delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
              );
          })()}
        </CardContent>
      </Card>
      {/* Create/Edit dialog */}
      <OAuth2ClientDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        client={editingClient}
        apiFetch={apiFetch}
        onSuccess={fetchClients}
        data-testid="OAuth2ClientDialog__82406d" />
      {/* Confirmation dialog (delete, regenerate, revoke) */}
      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(v) => {
          if (!v) setConfirmState((s) => ({ ...s, open: false }));
        }}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={confirmState.confirmLabel}
        variant={confirmState.variant}
        loading={confirmLoading}
        onConfirm={confirmState.onConfirm}
        data-testid="ConfirmDialog__82406d" />
      {/* Secret reveal after regenerate */}
      {revealSecret && (
        <SecretRevealDialog
          open={!!revealSecret}
          onClose={() => setRevealSecret(null)}
          clientId={revealSecret.clientId}
          clientSecret={revealSecret.clientSecret}
          data-testid="SecretRevealDialog__82406d" />
      )}
    </div>
  );
}
