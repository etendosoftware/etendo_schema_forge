import { useState, useEffect } from 'react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.jsx';

/**
 * Generic process parameter dialog.
 *
 * Shown when a process button has at least one non-hidden `params` entry.
 * Collects parameter values from the user before the process is invoked.
 *
 * Props:
 *   open           boolean               — controlled open state
 *   onOpenChange   (open: boolean) => void
 *   process        object | null         — process definition (from the `processes` array)
 *   onConfirm      (paramValues: object) => void — called with collected values on confirm
 */
export function ProcessParamDialog({ open, onOpenChange, process, onConfirm }) {
  const ui = useUI();
  const [values, setValues] = useState({});

  // Reset values when the dialog opens for a new process
  useEffect(() => {
    if (!open || !process?.params) return;
    const initial = {};
    for (const param of process.params) {
      if (param.hidden) continue;
      if (param.type === 'select' && param.options?.length) {
        initial[param.key] = param.options[0].value;
      }
    }
    setValues(initial);
  }, [open, process]);

  const visibleParams = process?.params?.filter(p => !p.hidden) ?? [];
  const canConfirm = visibleParams.every(p => !p.required || !!values[p.key]);

  const handleConfirm = () => {
    onConfirm(values);
  };

  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={next => (next ? onOpenChange(true) : close())} data-testid="process-param-dialog">
      <DialogContent className="sm:max-w-sm" data-testid="process-param-dialog-content">
        <DialogHeader data-testid="process-param-dialog-header">
          <DialogTitle data-testid="process-param-dialog-title">
            {ui(process?.label ?? '')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {visibleParams.map(param => (
            <div key={param.key} className="space-y-2">
              <Label htmlFor={`process-param-${param.key}`} data-testid={`process-param-label-${param.key}`}>
                {ui(param.label)}
              </Label>
              {param.type === 'select' && (
                <Select
                  value={values[param.key] ?? ''}
                  onValueChange={val => setValues(prev => ({ ...prev, [param.key]: val }))}
                  data-testid="Select__755949">
                  <SelectTrigger id={`process-param-${param.key}`} data-testid={`process-param-select-${param.key}`}>
                    <SelectValue data-testid="SelectValue__755949" />
                  </SelectTrigger>
                  <SelectContent data-testid={`process-param-options-${param.key}`}>
                    {param.options?.map(opt => (
                      <SelectItem key={opt.value} value={opt.value} data-testid={`process-param-option-${param.key}-${opt.value}`}>
                        {ui(opt.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-2" data-testid="process-param-dialog-footer">
          <Button
            type="button"
            variant="ghost"
            onClick={close}
            data-testid="process-param-cancel">
            {ui('cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            data-testid="process-param-confirm">
            {ui('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
