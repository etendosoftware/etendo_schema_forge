import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.jsx';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import {
  getChangeSifNoticeKey,
  getFiscalRecordId,
  getSystemsToDeactivate,
} from './fiscalConfig.utils.js';

// Per-system PUT coordinates (spec + primary entity) used to deactivate the
// active config record via the SAME NEO save path the sections use for edits.
// Confirmed from artifacts/*/contract.json → backendContract.window.primaryEntity.
const SYSTEM_ENDPOINTS = {
  sii: { spec: 'sii-config', entity: 'siiConfiguration' },
  tbai: { spec: 'tbai-config', entity: 'header' },
  verifactu: { spec: 'verifactu-config', entity: 'cabeceraDeConfiguraciónVerifactu' },
};

/**
 * "Change SIF" confirmation dialog.
 *
 * Shown only when the org has an active fiscal config. On confirm it DEACTIVATES
 * the active config record(s) (isactive='N') via a PUT that sets `active: false`
 * — the same NEO save path the sections use for field edits. The row is kept as
 * a trace, never deleted. After success the caller refetches; with no active row
 * the front resolves to `unconfigured` and the existing onboarding wizard
 * reappears automatically.
 *
 * The permanence notice is informational only — it never blocks the change.
 */
export default function ChangeSifDialog({
  open,
  onOpenChange,
  profile,
  records,
  apiBaseUrl,
  onChanged,
}) {
  const ui = useUI();
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const noticeKey = getChangeSifNoticeKey(profile);

  function close() {
    if (saving) return;
    setError(null);
    onOpenChange(false);
  }

  async function deactivateSystem(system) {
    const record = records?.[system];
    const recordId = getFiscalRecordId(record, system.toUpperCase());
    if (!recordId) {
      throw new Error(ui('fiscal.changeSif.err.noRecordId'));
    }
    const { spec, entity } = SYSTEM_ENDPOINTS[system];
    const res = await apiFetch(`/${spec}/${encodeURIComponent(entity)}/${recordId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: false }),
    });
    if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
  }

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    // Deactivate every system the active profile spans (sii+tbai spans two).
    // We run sequentially and by design DO NOT roll back: if a later PUT fails,
    // the systems deactivated BEFORE it stay deactivated (e.g. sii+tbai can
    // degrade to tbai-only). No data is corrupted — the row is only flagged
    // inactive — and the user recovers by re-opening the dialog and
    // deactivating the remaining system(s). Rollback is intentionally out of
    // scope: the partial state is rare and fully recoverable.
    const deactivated = [];
    try {
      const systems = getSystemsToDeactivate(profile);
      for (const system of systems) {
        await deactivateSystem(system);
        deactivated.push(system);
      }
      onOpenChange(false);
      onChanged?.();
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (deactivated.length > 0) {
        // Partial failure: at least one system was already deactivated before
        // the failing one. Tell the user which, and that they can re-open to
        // finish deactivating the rest.
        setError(
          ui('fiscal.changeSif.err.partial', {
            deactivated: deactivated.map((s) => s.toUpperCase()).join(', '),
            error: raw,
          }),
        );
      } else {
        setError(raw);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close} data-testid="ChangeSifDialog__root">
      <DialogContent data-testid="ChangeSifDialog__content">
        <DialogHeader data-testid="ChangeSifDialog__header">
          <DialogTitle data-testid="ChangeSifDialog__title">
            {ui('fiscal.changeSif.title')}
          </DialogTitle>
          <DialogDescription data-testid="ChangeSifDialog__description">
            {ui('fiscal.changeSif.body')}
          </DialogDescription>
        </DialogHeader>

        {noticeKey && (
          <div
            className="rounded-lg border border-[hsl(var(--border-subtle))] bg-muted/40 p-4 text-sm text-[hsl(var(--foreground))]"
            data-testid="ChangeSifDialog__notice">
            <div className="mb-1 flex items-center gap-2 font-medium">
              <AlertTriangle size={15} className="text-status-warning-foreground" data-testid="ChangeSifDialog__noticeIcon" />
              {ui('fiscal.changeSif.notice.title')}
            </div>
            <p className="leading-relaxed text-muted-foreground">{ui(noticeKey)}</p>
          </div>
        )}

        <p className="text-sm text-muted-foreground" data-testid="ChangeSifDialog__softWarning">
          {ui('fiscal.changeSif.softWarning')}
        </p>

        {error && (
          <p className="text-sm text-destructive" data-testid="ChangeSifDialog__error">{error}</p>
        )}

        <DialogFooter data-testid="ChangeSifDialog__footer">
          <Button
            variant="outline"
            onClick={close}
            disabled={saving}
            data-testid="ChangeSifDialog__cancel">
            {ui('fiscal.changeSif.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={saving}
            data-testid="ChangeSifDialog__confirm">
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" data-testid="ChangeSifDialog__spinner" />}
            {saving ? ui('fiscal.changeSif.deactivating') : ui('fiscal.changeSif.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
