import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useApiFetch } from '@/auth/useApiFetch.js';

function toInputDate(value) {
  return value ? new Date(value).toISOString().slice(0, 16) : '';
}

export default function DevLifecyclePage() {
  const apiFetch = useApiFetch('');
  const [state, setState] = useState({ environments: [], trialDays: 15, renewalGraceDays: 15 });
  const [selected, setSelected] = useState('');
  const [trialDays, setTrialDays] = useState('15');
  const [graceDays, setGraceDays] = useState('15');
  const [trialStartedAt, setTrialStartedAt] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState('NONE');
  const [renewalDueAt, setRenewalDueAt] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const response = await apiFetch('/sws/go/dev/lifecycle');
    if (!response.ok) throw new Error('Development lifecycle tool is disabled');
    const data = await response.json();
    const normalized = data && typeof data === 'object'
      ? { environments: [], ...data }
      : { environments: [], trialDays: 15, renewalGraceDays: 15 };
    setState(normalized);
    setTrialDays(String(normalized.trialDays));
    setGraceDays(String(normalized.renewalGraceDays));
  }, [apiFetch]);

  useEffect(() => { load().catch(error => setMessage(error.message)); }, [load]);

  const choose = clientId => {
    const environment = state?.environments?.find(item => item.clientId === clientId);
    setSelected(clientId);
    setTrialStartedAt(toInputDate(environment?.trialStartedAt));
    setSubscriptionStatus(environment?.subscriptionStatus || 'NONE');
    setRenewalDueAt(toInputDate(environment?.renewalDueAt));
  };

  const save = async event => {
    event.preventDefault();
    setMessage('Saving...');
    try {
      const environment = state?.environments?.find(item => item.clientId === selected);
      const response = await apiFetch('/sws/go/dev/lifecycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trialDays: Number(trialDays),
          renewalGraceDays: Number(graceDays),
          ...(selected ? {
            clientId: selected,
            type: environment?.environmentType || 'DEMO',
            trialStartedAt: trialStartedAt ? new Date(trialStartedAt).toISOString() : undefined,
            subscriptionStatus,
            renewalDueAt: renewalDueAt ? new Date(renewalDueAt).toISOString() : undefined,
          } : {}),
        }),
      });
      if (!response.ok) throw new Error('Could not update lifecycle state');
      const data = await response.json();
      setState(data && typeof data === 'object'
        ? { environments: [], ...data }
        : { environments: [], trialDays: Number(trialDays), renewalGraceDays: Number(graceDays) });
      setMessage('Saved for this local backend process.');
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6" data-testid="DevLifecyclePage">
      <Card data-testid="Card__91748c">
        <CardHeader data-testid="CardHeader__91748c"><CardTitle data-testid="CardTitle__91748c">Development lifecycle controls</CardTitle></CardHeader>
        <CardContent className="space-y-4" data-testid="CardContent__91748c">
          <p className="text-sm text-muted-foreground">
            Local QA tool for ETP-5396. Runtime day settings reset when the backend restarts.
          </p>
          <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
            <div><Label htmlFor="trial-days" data-testid="Label__91748c">Demo trial days</Label><Input
              id="trial-days"
              type="number"
              min="1"
              value={trialDays}
              onChange={e => setTrialDays(e.target.value)}
              data-testid="Input__91748c" /></div>
            <div><Label htmlFor="grace-days" data-testid="Label__91748c">Renewal grace days</Label><Input
              id="grace-days"
              type="number"
              min="0"
              value={graceDays}
              onChange={e => setGraceDays(e.target.value)}
              data-testid="Input__91748c" /></div>
            <div className="md:col-span-2"><Label htmlFor="environment" data-testid="Label__91748c">Owned environment</Label><select id="environment" className="mt-1 w-full rounded-md border bg-background p-2" value={selected} onChange={e => choose(e.target.value)}><option value="">Only change global settings</option>{state?.environments?.map(item => <option key={item.clientId} value={item.clientId}>{item.clientName} ({item.environmentType || item.plan})</option>)}</select></div>
            {selected && <>
              <div><Label htmlFor="trial-start" data-testid="Label__91748c">Trial started at (UTC)</Label><Input
                id="trial-start"
                type="datetime-local"
                value={trialStartedAt}
                onChange={e => setTrialStartedAt(e.target.value)}
                data-testid="Input__91748c" /></div>
              <div><Label htmlFor="subscription" data-testid="Label__91748c">Subscription status</Label><select id="subscription" className="mt-1 w-full rounded-md border bg-background p-2" value={subscriptionStatus} onChange={e => setSubscriptionStatus(e.target.value)}><option>NONE</option><option>CURRENT</option><option>PAST_DUE</option><option>EXPIRED</option></select></div>
              <div><Label htmlFor="renewal-due" data-testid="Label__91748c">Renewal due at (UTC)</Label><Input
                id="renewal-due"
                type="datetime-local"
                value={renewalDueAt}
                onChange={e => setRenewalDueAt(e.target.value)}
                data-testid="Input__91748c" /></div>
            </>}
            <Button type="submit" className="md:col-span-2" data-testid="Button__91748c">Save local test state</Button>
          </form>
          {message && <p className="text-sm" role="status">{message}</p>}
        </CardContent>
      </Card>
      <Card data-testid="Card__91748c"><CardHeader data-testid="CardHeader__91748c"><CardTitle data-testid="CardTitle__91748c">Current server projection</CardTitle></CardHeader><CardContent data-testid="CardContent__91748c"><pre className="overflow-auto text-xs">{JSON.stringify(state, null, 2)}</pre></CardContent></Card>
    </main>
  );
}
