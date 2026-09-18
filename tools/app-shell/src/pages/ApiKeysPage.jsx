import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUI } from '@/i18n';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useLogout } from '@/auth/useLogout.js';
import { createApiFetch } from '@/auth/api.js';
import {
  createApiKey, deleteApiKey, listApiKeys, revokeApiKeyTokens, rotateApiKey, updateApiKey,
} from '@/lib/apiKeysApi.js';
import { SecretRevealDialog, ConfirmDialog } from '@/components/OAuth2ClientDialog.jsx';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Ban, Copy, ExternalLink, KeyRound, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useFeatureFlag, PUBLIC_API_KEYS } from '@/lib/flags';

const CAPABILITIES = [
  ['public-api:read', 'apiKeysCapabilityRead'],
  ['public-api:write', 'apiKeysCapabilityWrite'],
  ['public-api:process', 'apiKeysCapabilityProcess'],
];

const SCALAR_DOCS_URL = import.meta.env.VITE_PUBLIC_API_DOCS_URL || 'https://app.etendo.software/api';

function detectBaseUrl() {
  const path = window.location.pathname;
  const webIndex = path.indexOf('/web/');
  return webIndex === -1 ? (import.meta.env.VITE_API_BASE || '') : path.substring(0, webIndex);
}

export default function ApiKeysPage() {
  const ui = useUI();
  const { token, capabilities } = useAuth();
  const publicApiKeysEnabled = useFeatureFlag(PUBLIC_API_KEYS);
  const logout = useLogout();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState({ open: false, key: null });
  const [name, setName] = useState('');
  const [selected, setSelected] = useState(['public-api:read']);
  const [active, setActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [reveal, setReveal] = useState(null);
  const apiFetch = useMemo(() => createApiFetch(detectBaseUrl(), () => token, logout), [token, logout]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setKeys(await listApiKeys(apiFetch)); }
    catch (error) { setKeys([]); toast.error(ui('apiKeysLoadFailed'), { description: error.message }); }
    finally { setLoading(false); }
  }, [apiFetch, ui]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setName(''); setSelected(['public-api:read']); setActive(true); setDialog({ open: true, key: null });
  };
  const openEdit = (key) => {
    setName(key.name || ''); setActive(key.isActive !== false); setDialog({ open: true, key });
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim() || (!dialog.key && selected.length === 0)) return;
    setSubmitting(true);
    try {
      if (dialog.key) {
        await updateApiKey(apiFetch, dialog.key.id, { name: name.trim(), isActive: active });
        toast.success(ui('apiKeysUpdated')); setDialog({ open: false, key: null });
      } else {
        const result = await createApiKey(apiFetch, { name: name.trim(), capabilities: selected });
        setDialog({ open: false, key: null });
        setReveal({ clientId: result.clientId, clientSecret: result.clientSecret });
      }
      await load();
    } catch (error) { toast.error(ui('apiKeysSaveFailed'), { description: error.message }); }
    finally { setSubmitting(false); }
  };

  const runAction = (key, title, description, label, action) => setConfirm({ key, title, description, label, action });
  const confirmAction = async () => {
    setConfirmLoading(true);
    try { await confirm.action(); setConfirm(null); await load(); }
    catch (error) { toast.error(ui('apiKeysActionFailed'), { description: error.message }); }
    finally { setConfirmLoading(false); }
  };
  const copy = async (value, label) => {
    try { await navigator.clipboard.writeText(value); toast.success(`${label} copied`); }
    catch { toast.error(ui('apiKeysCopyFailed')); }
  };

  let submitLabel = ui('apiKeysCreateKey');
  if (dialog.key) submitLabel = ui('saveChanges');
  if (submitting) submitLabel = ui('saving');

  let keyContent;
  if (loading) {
    keyContent = <div className="flex justify-center py-12 text-muted-foreground"><RefreshCw className="mr-2 h-5 w-5 animate-spin" data-testid="RefreshCw__5d273f" />{ui('apiKeysLoading')}</div>;
  } else if (keys.length === 0) {
    keyContent = <div className="py-16 text-center"><KeyRound
      className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40"
      data-testid="KeyRound__5d273f" /><h3 className="text-lg font-medium">{ui('apiKeysEmpty')}</h3><p className="mb-4 text-sm text-muted-foreground">{ui('apiKeysEmptyDescription')}</p><Button onClick={openCreate} data-testid="Button__5d273f"><Plus className="mr-2 h-4 w-4" data-testid="Plus__5d273f" />{ui('apiKeysCreateFirst')}</Button></div>;
  } else {
    keyContent = <Table data-testid="Table__5d273f"><TableHeader data-testid="TableHeader__5d273f"><TableRow data-testid="TableRow__5d273f"><TableHead data-testid="TableHead__5d273f">{ui('name')}</TableHead><TableHead data-testid="TableHead__5d273f">{ui('clientId')}</TableHead><TableHead data-testid="TableHead__5d273f">{ui('capabilities')}</TableHead><TableHead data-testid="TableHead__5d273f">{ui('active')}</TableHead><TableHead data-testid="TableHead__5d273f" /></TableRow></TableHeader><TableBody data-testid="TableBody__5d273f">{keys.map((key) => <TableRow key={key.id} data-testid="TableRow__5d273f"><TableCell className="font-medium" data-testid="TableCell__5d273f">{key.name}</TableCell><TableCell data-testid="TableCell__5d273f"><button className="inline-flex items-center gap-1 font-mono text-xs" onClick={() => copy(key.clientId, ui('clientId'))}>{key.clientId?.slice(0, 12)}…<Copy className="h-3 w-3" data-testid="Copy__5d273f" /></button></TableCell><TableCell data-testid="TableCell__5d273f"><div className="flex flex-wrap gap-1">{(key.capabilities || []).map((capability) => <Badge variant="secondary" key={capability} data-testid="Badge__5d273f">{capability}</Badge>)}</div></TableCell><TableCell data-testid="TableCell__5d273f"><Badge
          variant={key.isActive ? 'default' : 'outline'}
          data-testid="Badge__5d273f">{key.isActive ? ui('active') : ui('inactive')}</Badge></TableCell><TableCell data-testid="TableCell__5d273f"><DropdownMenu data-testid="DropdownMenu__5d273f"><DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__5d273f"><Button variant="ghost" size="icon" data-testid="Button__5d273f"><MoreHorizontal className="h-4 w-4" data-testid="MoreHorizontal__5d273f" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" data-testid="DropdownMenuContent__5d273f"><DropdownMenuItem onClick={() => openEdit(key)} data-testid="DropdownMenuItem__5d273f"><Pencil className="mr-2 h-4 w-4" data-testid="Pencil__5d273f" />{ui('edit')}</DropdownMenuItem><DropdownMenuItem
          onClick={() => runAction(key, `Rotate "${key.name}"?`, ui('apiKeysRotateDescription'), ui('apiKeysRotate'), async () => { const result = await rotateApiKey(apiFetch, key.id); setReveal({ clientId: result.clientId, clientSecret: result.clientSecret }); })}
          data-testid="DropdownMenuItem__5d273f"><KeyRound className="mr-2 h-4 w-4" data-testid="KeyRound__5d273f" />{ui('apiKeysRotate')}</DropdownMenuItem><DropdownMenuItem
          onClick={() => runAction(key, `Revoke tokens for "${key.name}"?`, ui('apiKeysRevokeDescription'), ui('revokeTokens'), async () => { await revokeApiKeyTokens(apiFetch, key.id); toast.success(ui('apiKeysTokensRevoked')); })}
          data-testid="DropdownMenuItem__5d273f"><Ban className="mr-2 h-4 w-4" data-testid="Ban__5d273f" />{ui('revokeTokens')}</DropdownMenuItem><DropdownMenuSeparator data-testid="DropdownMenuSeparator__5d273f" /><DropdownMenuItem
          className="text-destructive"
          onClick={() => runAction(key, `Delete "${key.name}"?`, ui('apiKeysDeleteDescription'), ui('delete'), async () => { await deleteApiKey(apiFetch, key.id); toast.success(ui('apiKeysDeleted')); })}
          data-testid="DropdownMenuItem__5d273f"><Trash2 className="mr-2 h-4 w-4" data-testid="Trash2__5d273f" />{ui('delete')}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table>;
  }

  // The route is registered for deep links, but the menu capability is the authoritative gate.
  if (!publicApiKeysEnabled || capabilities?.isAdminOrClientAdmin !== true || capabilities?.publicApiKeyManagement !== true) return null;

  return (
    <div className="space-y-6 p-6" data-testid="ApiKeysPage">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold tracking-tight">{ui('apiKeysTitle')}</h2><p className="text-muted-foreground">{ui('apiKeysDescription')}</p></div>
        <div className="flex gap-2"><Button
          variant="outline"
          size="icon"
          onClick={load}
          disabled={loading}
          data-testid="Button__5d273f"><RefreshCw
          className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
          data-testid="RefreshCw__5d273f" /></Button><Button onClick={openCreate} data-testid="Button__5d273f"><Plus className="mr-2 h-4 w-4" data-testid="Plus__5d273f" />{ui('apiKeysCreate')}</Button></div>
      </div>
      <div className="rounded-md border border-primary/20 bg-primary/5 p-4 text-sm" data-testid="ApiKeysScalarHelp">
        <p className="font-medium">{ui('apiKeysScalarConnectTitle')}</p>
        <p className="mt-1 text-muted-foreground">{ui('apiKeysScalarConnectDescription')} <code className="rounded bg-muted px-1 font-mono text-xs">{ui('apiKeysReadCapability')}</code>{ui('apiKeysScalarConnectDescriptionMiddle')} <code className="rounded bg-muted px-1 font-mono text-xs">{ui('apiKeysCredentialFormat')}</code>{ui('apiKeysScalarConnectDescriptionEnd')} <span className="font-medium">{ui('apiKeysBearerField')}</span>{ui('apiKeysScalarConnectDescriptionTail')} <code className="rounded bg-muted px-1 font-mono text-xs">{ui('apiKeysBearerScheme')}</code> {ui('apiKeysScalarAutomatically')}</p>
        <a className="mt-2 inline-flex items-center gap-1 text-primary underline underline-offset-4" href={SCALAR_DOCS_URL} target="_blank" rel="noreferrer">{ui('apiKeysOpenScalarDocs')} <ExternalLink className="h-3.5 w-3.5" data-testid="ExternalLink__5d273f" /></a>
      </div>
      <Card data-testid="Card__5d273f"><CardContent className="p-0" data-testid="CardContent__5d273f">
        {keyContent}
      </CardContent></Card>
      <Dialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((state) => ({ ...state, open }))}
        data-testid="Dialog__5d273f"><DialogContent data-testid="DialogContent__5d273f"><form onSubmit={submit}><DialogHeader data-testid="DialogHeader__5d273f"><DialogTitle data-testid="DialogTitle__5d273f">{dialog.key ? ui('apiKeysEditTitle') : ui('apiKeysCreateTitle')}</DialogTitle><DialogDescription data-testid="DialogDescription__5d273f">{dialog.key ? ui('apiKeysEditDescription') : ui('apiKeysCreateDescription')}</DialogDescription></DialogHeader><div className="grid gap-4 py-4"><div className="grid gap-2"><Label htmlFor="api-key-name" data-testid="Label__5d273f">{ui('name')}</Label><Input
        id="api-key-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={120}
        placeholder={ui('apiKeysNamePlaceholder')}
        required
        data-testid="Input__5d273f" /></div>{!dialog.key && <><div className="grid gap-2"><Label data-testid="Label__5d273f">{ui('apiKeysAllowedCapabilities')}</Label>{CAPABILITIES.map(([capability, description]) => <label className="flex items-start gap-2 rounded-md border p-3 text-sm" key={capability}><input type="checkbox" checked={selected.includes(capability)} onChange={() => setSelected((values) => values.includes(capability) ? values.filter((value) => value !== capability) : [...values, capability])} /><span><span className="font-mono">{capability}</span><span className="block text-xs text-muted-foreground">{ui(description)}</span></span></label>)}</div><div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm"><p className="font-medium">{ui('apiKeysScalarDialogTitle')}</p><p className="mt-1 text-muted-foreground">{ui('apiKeysScalarDialogDescription')} <span className="font-medium">{ui('apiKeysBearerFieldLower')}</span> {ui('apiKeysScalarAuthorizationField')}. {ui('apiKeysUse')} <code className="rounded bg-muted px-1 font-mono text-xs">{ui('apiKeysCredentialFormat')}</code>; {ui('apiKeysDoNotAdd')} <code className="rounded bg-muted px-1 font-mono text-xs">{ui('apiKeysBearerScheme')}</code>.</p><a className="mt-2 inline-flex items-center gap-1 text-primary underline underline-offset-4" href={SCALAR_DOCS_URL} target="_blank" rel="noreferrer">{ui('apiKeysOpenScalarDocs')} <ExternalLink className="h-3.5 w-3.5" data-testid="ExternalLink__5d273f" /></a></div></>}<div className="flex items-center justify-between"><Label htmlFor="api-key-active" data-testid="Label__5d273f">{ui('active')}</Label><Switch
        id="api-key-active"
        checked={active}
        onCheckedChange={setActive}
        data-testid="Switch__5d273f" /></div></div><DialogFooter data-testid="DialogFooter__5d273f"><Button
        type="button"
        variant="outline"
        onClick={() => setDialog({ open: false, key: null })}
        data-testid="Button__5d273f">{ui('cancel')}</Button><Button type="submit" disabled={submitting} data-testid="Button__5d273f">{submitLabel}</Button></DialogFooter></form></DialogContent></Dialog>
      {confirm && <ConfirmDialog
        open
        title={confirm.title}
        description={confirm.description}
        confirmLabel={confirm.label}
        variant="destructive"
        loading={confirmLoading}
        onOpenChange={(open) => !open && setConfirm(null)}
        onConfirm={confirmAction}
        data-testid="ConfirmDialog__5d273f" />}
      {reveal && <SecretRevealDialog
        open
        clientId={reveal.clientId}
        clientSecret={reveal.clientSecret}
        authorizationValue={`${reveal.clientId}:${reveal.clientSecret}`}
        docsUrl={SCALAR_DOCS_URL}
        onClose={() => { setReveal(null); load(); }}
        data-testid="SecretRevealDialog__5d273f" />}
    </div>
  );
}
