import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useUI } from '@/i18n';

function toInputDate(value) {
  return value ? new Date(value).toISOString().slice(0, 16) : '';
}

export default function DevLifecyclePage() {
  const ui = useUI();
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
    if (!response.ok) throw new Error(ui('devLifecycleDisabled'));
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
      if (!response.ok) throw new Error(ui('devLifecycleUpdateFailed'));
      const data = await response.json();
      setState(data && typeof data === 'object'
        ? { environments: [], ...data }
        : { environments: [], trialDays: Number(trialDays), renewalGraceDays: Number(graceDays) });
      setMessage(ui('devLifecycleSaved'));
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6" data-testid="DevLifecyclePage">
      <Card data-testid="Card__91748c">
        <CardHeader data-testid="CardHeader__91748c"><CardTitle data-testid="CardTitle__91748c">{ui('devLifecycleTitle')}</CardTitle></CardHeader>
        <CardContent className="space-y-4" data-testid="CardContent__91748c">
          <p className="text-sm text-muted-foreground">
            {ui('devLifecycleDescription')}
          </p>
          <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
            <div><Label htmlFor="trial-days" data-testid="Label__91748c">{ui('devLifecycleTrialDays')}</Label><Input
              id="trial-days"
              type="number"
              min="1"
              value={trialDays}
              onChange={e => setTrialDays(e.target.value)}
              data-testid="Input__91748c" /></div>
            <div><Label htmlFor="grace-days" data-testid="Label__91748c">{ui('devLifecycleGraceDays')}</Label><Input
              id="grace-days"
              type="number"
              min="0"
              value={graceDays}
              onChange={e => setGraceDays(e.target.value)}
              data-testid="Input__91748c" /></div>
            <div className="md:col-span-2"><Label htmlFor="environment" data-testid="Label__91748c">{ui('devLifecycleOwnedEnvironment')}</Label><select id="environment" className="mt-1 w-full rounded-md border bg-background p-2" value={selected} onChange={e => choose(e.target.value)}><option value="">{ui('devLifecycleGlobalSettings')}</option>{state?.environments?.map(item => <option key={item.clientId} value={item.clientId}>{item.clientName} ({item.environmentType || item.plan})</option>)}</select></div>
            {selected && <>
              <div><Label htmlFor="trial-start" data-testid="Label__91748c">{ui('devLifecycleTrialStartedAt')}</Label><Input
                id="trial-start"
                type="datetime-local"
                value={trialStartedAt}
                onChange={e => setTrialStartedAt(e.target.value)}
                data-testid="Input__91748c" /></div>
              <div><Label htmlFor="subscription" data-testid="Label__91748c">{ui('devLifecycleSubscriptionStatus')}</Label><select id="subscription" className="mt-1 w-full rounded-md border bg-background p-2" value={subscriptionStatus} onChange={e => setSubscriptionStatus(e.target.value)}><option value="NONE">{ui('subscriptionNone')}</option><option value="CURRENT">{ui('subscriptionCurrent')}</option><option value="PAST_DUE">{ui('subscriptionPastDue')}</option><option value="EXPIRED">{ui('subscriptionExpired')}</option></select></div>
              <div><Label htmlFor="renewal-due" data-testid="Label__91748c">{ui('devLifecycleRenewalDueAt')}</Label><Input
                id="renewal-due"
                type="datetime-local"
                value={renewalDueAt}
                onChange={e => setRenewalDueAt(e.target.value)}
                data-testid="Input__91748c" /></div>
            </>}
            <Button type="submit" className="md:col-span-2" data-testid="Button__91748c">{ui('devLifecycleSave')}</Button>
          </form>
          {message && <p className="text-sm" role="status">{message}</p>}
        </CardContent>
      </Card>
      <Card data-testid="Card__91748c"><CardHeader data-testid="CardHeader__91748c"><CardTitle data-testid="CardTitle__91748c">{ui('devLifecycleServerProjection')}</CardTitle></CardHeader><CardContent data-testid="CardContent__91748c"><pre className="overflow-auto text-xs">{JSON.stringify(state, null, 2)}</pre></CardContent></Card>
    </main>
  );
}
