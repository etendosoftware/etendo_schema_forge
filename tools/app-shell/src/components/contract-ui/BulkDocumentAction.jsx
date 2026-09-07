import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog.jsx';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select.jsx';
import { Label } from '@/components/ui/label.jsx';
import { FileCheck } from 'lucide-react';
import { useUI } from '@/i18n';
import { useDocumentAction } from '@/hooks/useDocumentAction';
import { useNeoAction } from '@/hooks/useNeoAction';

const STORAGE_KEY = 'bulkActionResult';

export const buildInOutActions = (rows) => {
  const hasDraft = rows.some((r) => (r.documentStatus || r.docStatus) === 'DR');
  return hasDraft ? [{ value: 'CO', labelKey: 'book' }] : [];
};

export default function BulkDocumentAction({
  selectedRows, clearSelection, token, apiBaseUrl, windowName,
  entity = 'header',
  buildActions,
  rowFilter,
  labelKey = 'bulkCompletion',
  actionMode = 'documentAction',
}) {
  const ui = useUI();
  const docAction = useDocumentAction({ apiBaseUrl, entity, token });
  const neoAction = useNeoAction({ specName: windowName, entityName: entity, apiBaseUrl, token });
  // ETP-5075 — `actionMode: 'neoAction'` retargets the per-row call from the DocAction
  // endpoint (`/action/documentAction` with a `{docAction}` body) to the generic NEO action
  // endpoint (`/action/{name}`), so each `buildActions` value is an action NAME instead of a
  // DocAction code. That is what lets a window whose actions are not DocActions at all —
  // e.g. matched-purchase-invoices' accounting `post`/`unpost` — reuse this whole modal.
  //
  // The adapter is load-bearing, not ceremony: `useNeoAction.execute` RESOLVES with
  // `{ success: false }` on failure (its own javadoc contrasts itself with
  // useDocumentAction, which throws), while `handleDone` below detects failures via
  // Promise.allSettled's 'rejected' status. Without normalising to a throw, every failed
  // row would be silently counted as a success and the toast would report "N ok, 0 failed".
  const execute = actionMode === 'neoAction'
    ? async (recordId, actionName) => {
      const result = await neoAction.execute(recordId, actionName);
      if (!result?.success) throw new Error(result?.message || 'Unknown error');
      return result;
    }
    : docAction.execute;
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [selectedAction, setSelectedAction] = useState(null);

  const actions = useMemo(() => {
    if (buildActions) return buildActions(selectedRows);
    const statusOf = (r) => r.documentStatus || r.docStatus;
    const hasDraft = selectedRows.some((r) => statusOf(r) === 'DR');
    const hasCompleted = selectedRows.some((r) => statusOf(r) === 'CO');
    const out = [];
    if (hasDraft) out.push({ value: 'CO', labelKey: 'book' });
    if (hasCompleted) out.push({ value: 'RE', labelKey: 'reactivate' });
    return out;
  }, [selectedRows, buildActions]);

  if (selectedRows.length === 0 || actions.length === 0) return null;

  const handleOpen = () => {
    setSelectedAction(actions[0].value);
    setOpen(true);
  };

  const handleDone = async () => {
    if (running || !selectedAction) return;
    setRunning(true);

    let rowsToProcess = selectedRows;
    let preBlocked = [];
    if (rowFilter) {
      rowsToProcess = [];
      for (const row of selectedRows) {
        const result = rowFilter(row, selectedAction);
        if (result === true || result == null) {
          rowsToProcess.push(row);
        } else {
          preBlocked.push({ documentNo: row.documentNo || row.id, message: result });
        }
      }
    }

    const outcomes = await Promise.allSettled(
      rowsToProcess.map((row) => execute(row.id, selectedAction).then(() => row)),
    );
    const apiFailed = outcomes
      .map((o, i) => ({ o, row: rowsToProcess[i] }))
      .filter(({ o }) => o.status === 'rejected')
      .map(({ o, row }) => ({
        documentNo: row.documentNo || row.id,
        message: o.reason?.message || 'Unknown error',
      }));
    const failed = [...preBlocked, ...apiFailed];
    const ok = rowsToProcess.length - apiFailed.length;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ok, failed }));
    setRunning(false);
    setOpen(false);
    const delay = failed.length === 0 ? 600 : 1500;
    setTimeout(() => {
      clearSelection();
      window.location.reload();
    }, delay);
  };

  return (
    <>
      {/* ETP-4972 — plain hand-rolled button (not the shared shadcn Button):
          Button's size="sm" bakes in text-xs + `[&_svg]:size-4`, and that
          descendant selector beats a child's own `h-3.5 w-3.5` classes on
          CSS specificity alone regardless of Tailwind/twMerge class order —
          it was rendering this button smaller-text/bigger-icon than the
          sibling "Crear factura" button (BulkInvoiceFromShipment.jsx), which
          made the pair look mismatched even though both are Figma "Size: md".
          Mirrors that button's classes exactly so both render identically.
          Keeps its text label: Ale (design) confirmed icon-only is fine for
          universally-recognized actions (print, clone, delete) but this one
          needs it — the same checklist icon here means "Confirmar" in some
          windows and "Procesado masivo" in others depending on `labelKey`,
          so the icon alone isn't even consistently meaningful. Figma
          "Confirmar" button (Button 7, verified in Dev Mode): icon
          file-checkmark → lucide FileCheck, padding 7px/12px, gap 4px. */}
      <button
        type="button"
        disabled={running}
        onClick={handleOpen}
        title={ui(labelKey)}
        className="inline-flex items-center gap-1 rounded-md px-3 py-[7px] text-sm font-medium transition-colors hover:bg-[hsl(var(--floating-toolbar-fg)/0.1)]"
        style={{
          color: 'hsl(var(--floating-toolbar-fg))',
          cursor: running ? 'not-allowed' : 'pointer',
          opacity: running ? 0.5 : 1,
        }}
        data-testid="Button__90fe6a">
        <FileCheck className="h-3.5 w-3.5" data-testid="FileCheck__90fe6a" />
        {ui(labelKey)}
      </button>
      <Dialog open={open} onOpenChange={setOpen} data-testid="Dialog__90fe6a">
        <DialogContent data-testid="DialogContent__90fe6a">
          <DialogHeader data-testid="DialogHeader__90fe6a">
            <DialogTitle data-testid="DialogTitle__90fe6a">{ui(labelKey)}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Label data-testid="Label__90fe6a">{ui('documentAction')}</Label>
            <Select
              value={selectedAction ?? ''}
              onValueChange={setSelectedAction}
              data-testid="Select__90fe6a">
              <SelectTrigger data-testid="SelectTrigger__90fe6a">
                <SelectValue data-testid="SelectValue__90fe6a" />
              </SelectTrigger>
              <SelectContent data-testid="SelectContent__90fe6a">
                {actions.map((a) => (
                  <SelectItem key={a.value} value={a.value} data-testid="SelectItem__90fe6a">
                    {ui(a.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter data-testid="DialogFooter__90fe6a">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={running}
              data-testid="Button__90fe6a">
              {ui('cancel')}
            </Button>
            <Button
              onClick={handleDone}
              disabled={running || !selectedAction}
              data-testid="Button__90fe6a">
              {ui('done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
