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
  ['public-api:read', 'Read published public API data'],
  ['public-api:write', 'Create, update, and delete permitted data'],
  ['public-api:process', 'Run explicitly published processes'],
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
        toast.success('API key updated'); setDialog({ open: false, key: null });
      } else {
        const result = await createApiKey(apiFetch, { name: name.trim(), capabilities: selected });
        setDialog({ open: false, key: null });
        setReveal({ clientId: result.clientId, clientSecret: result.clientSecret });
      }
      await load();
    } catch (error) { toast.error('Unable to save API key', { description: error.message }); }
    finally { setSubmitting(false); }
  };

  const runAction = (key, title, description, label, action) => setConfirm({ key, title, description, label, action });
  const confirmAction = async () => {
    setConfirmLoading(true);
    try { await confirm.action(); setConfirm(null); await load(); }
    catch (error) { toast.error('API key action failed', { description: error.message }); }
    finally { setConfirmLoading(false); }
  };
  const copy = async (value, label) => {
    try { await navigator.clipboard.writeText(value); toast.success(`${label} copied`); }
    catch { toast.error('Failed to copy'); }
  };

  // The route is registered for deep links, but the menu capability is the authoritative gate.
  if (!publicApiKeysEnabled || capabilities?.isAdminOrClientAdmin !== true || capabilities?.publicApiKeyManagement !== true) return null;

  return (
    <div className="space-y-6 p-6" data-testid="ApiKeysPage">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold tracking-tight">{ui('apiKeysTitle')}</h2><p className="text-muted-foreground">{ui('apiKeysDescription')}</p></div>
        <div className="flex gap-2"><Button variant="outline" size="icon" onClick={load} disabled={loading}><RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /></Button><Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />{ui('apiKeysCreate')}</Button></div>
      </div>
      <div className="rounded-md border border-primary/20 bg-primary/5 p-4 text-sm" data-testid="ApiKeysScalarHelp">
        <p className="font-medium">Connect an integration with Scalar</p>
        <p className="mt-1 text-muted-foreground">Create a key with <code className="rounded bg-muted px-1 font-mono text-xs">public-api:read</code>, then paste the generated <code className="rounded bg-muted px-1 font-mono text-xs">clientId:clientSecret</code> into Scalar's <span className="font-medium">Authentication → bearer</span> field. Scalar adds <code className="rounded bg-muted px-1 font-mono text-xs">Bearer</code> automatically.</p>
        <a className="mt-2 inline-flex items-center gap-1 text-primary underline underline-offset-4" href={SCALAR_DOCS_URL} target="_blank" rel="noreferrer">Open Scalar docs <ExternalLink className="h-3.5 w-3.5" /></a>
      </div>
      <Card><CardContent className="p-0">
        {loading ? <div className="flex justify-center py-12 text-muted-foreground"><RefreshCw className="mr-2 h-5 w-5 animate-spin" />{ui('apiKeysLoading')}</div> : keys.length === 0 ? <div className="py-16 text-center"><KeyRound className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" /><h3 className="text-lg font-medium">{ui('apiKeysEmpty')}</h3><p className="mb-4 text-sm text-muted-foreground">{ui('apiKeysEmptyDescription')}</p><Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />{ui('apiKeysCreateFirst')}</Button></div> : <Table><TableHeader><TableRow><TableHead>{ui('name')}</TableHead><TableHead>{ui('clientId')}</TableHead><TableHead>{ui('capabilities')}</TableHead><TableHead>{ui('active')}</TableHead><TableHead /></TableRow></TableHeader><TableBody>{keys.map((key) => <TableRow key={key.id}><TableCell className="font-medium">{key.name}</TableCell><TableCell><button className="inline-flex items-center gap-1 font-mono text-xs" onClick={() => copy(key.clientId, ui('clientId'))}>{key.clientId?.slice(0, 12)}…<Copy className="h-3 w-3" /></button></TableCell><TableCell><div className="flex flex-wrap gap-1">{(key.capabilities || []).map((capability) => <Badge variant="secondary" key={capability}>{capability}</Badge>)}</div></TableCell><TableCell><Badge variant={key.isActive ? 'default' : 'outline'}>{key.isActive ? ui('active') : ui('inactive')}</Badge></TableCell><TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => openEdit(key)}><Pencil className="mr-2 h-4 w-4" />{ui('edit')}</DropdownMenuItem><DropdownMenuItem onClick={() => runAction(key, `Rotate "${key.name}"?`, 'The old secret will stop working immediately.', 'Rotate', async () => { const result = await rotateApiKey(apiFetch, key.id); setReveal({ clientId: result.clientId, clientSecret: result.clientSecret }); })}><KeyRound className="mr-2 h-4 w-4" />Rotate secret</DropdownMenuItem><DropdownMenuItem onClick={() => runAction(key, `Revoke tokens for "${key.name}"?`, 'All active access tokens will be invalidated.', 'Revoke tokens', async () => { await revokeApiKeyTokens(apiFetch, key.id); toast.success('Tokens revoked'); })}><Ban className="mr-2 h-4 w-4" />Revoke tokens</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onClick={() => runAction(key, `Delete "${key.name}"?`, 'This permanently removes the credential.', 'Delete', async () => { await deleteApiKey(apiFetch, key.id); toast.success('API key deleted'); })}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table>}
      </CardContent></Card>
      <Dialog open={dialog.open} onOpenChange={(open) => setDialog((state) => ({ ...state, open }))}><DialogContent><form onSubmit={submit}><DialogHeader><DialogTitle>{dialog.key ? 'Edit public API key' : 'Create public API key'}</DialogTitle><DialogDescription>{dialog.key ? 'Change the display name or active state.' : 'Choose a name and the public capabilities this key may request.'}</DialogDescription></DialogHeader><div className="grid gap-4 py-4"><div className="grid gap-2"><Label htmlFor="api-key-name">Name</Label><Input id="api-key-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="e.g. Nest integration" required /></div>{!dialog.key && <><div className="grid gap-2"><Label>Allowed capabilities</Label>{CAPABILITIES.map(([capability, description]) => <label className="flex items-start gap-2 rounded-md border p-3 text-sm" key={capability}><input type="checkbox" checked={selected.includes(capability)} onChange={() => setSelected((values) => values.includes(capability) ? values.filter((value) => value !== capability) : [...values, capability])} /><span><span className="font-mono">{capability}</span><span className="block text-xs text-muted-foreground">{description}</span></span></label>)}</div><div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm"><p className="font-medium">Connect it from Scalar</p><p className="mt-1 text-muted-foreground">After creation, copy the generated credential and paste it into Scalar's <span className="font-medium">bearer</span> authorization field. Use <code className="rounded bg-muted px-1 font-mono text-xs">clientId:clientSecret</code>; do not add the word <code className="rounded bg-muted px-1 font-mono text-xs">Bearer</code>.</p><a className="mt-2 inline-flex items-center gap-1 text-primary underline underline-offset-4" href={SCALAR_DOCS_URL} target="_blank" rel="noreferrer">Open Scalar docs <ExternalLink className="h-3.5 w-3.5" /></a></div></>}<div className="flex items-center justify-between"><Label htmlFor="api-key-active">Active</Label><Switch id="api-key-active" checked={active} onCheckedChange={setActive} /></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => setDialog({ open: false, key: null })}>Cancel</Button><Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : dialog.key ? 'Save changes' : 'Create key'}</Button></DialogFooter></form></DialogContent></Dialog>
      {confirm && <ConfirmDialog open title={confirm.title} description={confirm.description} confirmLabel={confirm.label} variant="destructive" loading={confirmLoading} onOpenChange={(open) => !open && setConfirm(null)} onConfirm={confirmAction} />}
      {reveal && <SecretRevealDialog open clientId={reveal.clientId} clientSecret={reveal.clientSecret} authorizationValue={`${reveal.clientId}:${reveal.clientSecret}`} docsUrl={SCALAR_DOCS_URL} onClose={() => { setReveal(null); load(); }} />}
    </div>
  );
}
