import { useState, useEffect, useRef } from 'react';
import { Minus, Plus } from 'lucide-react';
import { EntityForm } from '@/components/contract-ui';
import { useUI, useLabel } from '@/i18n';
import CheckboxGroup from '@/windows/custom/shared/CheckboxGroup';

function WeightStepper({ label, value, readOnly, onChange }) {
  const [local, setLocal] = useState(String(value ?? ''));
  const debounceRef = useRef(null);

  useEffect(() => { setLocal(String(value ?? '')); }, [value]);
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  function step(delta) {
    if (readOnly) return;
    const base = Number.isFinite(Number(local)) ? Number(local) : 0;
    const next = Math.max(0, base + delta);
    setLocal(String(next));
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChange(next), 400);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</p>
      <div className="flex flex-row items-center h-10 border border-[hsl(var(--border-control))] rounded-lg shadow-[0px_1px_2px_hsl(var(--foreground) / 0.05)] overflow-hidden bg-card focus-within:border-[hsl(var(--foreground))] focus-within:shadow-[0px_0px_0px_1px_hsl(var(--foreground))] transition-colors">
        <input
          type="number"
          step="0.01"
          value={local}
          disabled={readOnly}
          onChange={e => setLocal(e.target.value)}
          onBlur={() => onChange(local === '' ? 0 : Number(local))}
          className="flex-1 px-3 text-sm text-[hsl(var(--foreground))] bg-transparent outline-none min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button type="button" onClick={() => step(-1)} disabled={readOnly}
          className="w-10 h-[38px] flex items-center justify-center border-l border-[hsl(var(--border-subtle))] text-[hsl(var(--text-disabled))] hover:bg-muted disabled:opacity-40 shrink-0">
          <Minus size={16} data-testid="Minus__fe05d5" />
        </button>
        <button type="button" onClick={() => step(1)} disabled={readOnly}
          className="w-10 h-[38px] flex items-center justify-center border-l border-[hsl(var(--border-subtle))] text-[hsl(var(--text-disabled))] hover:bg-muted disabled:opacity-40 shrink-0">
          <Plus size={16} data-testid="Plus__fe05d5" />
        </button>
      </div>
    </div>
  );
}

export default function ProductAdditionalInfoPanel({ entity, data, token, apiBaseUrl, catalogs, api, editing, onChange }) {
  const ui = useUI();
  const t = useLabel();

  const readOnly = !editing;

  return (
    <div className="space-y-2 pb-6 [&_input]:bg-card">
      <div className="flex flex-row items-start p-2 gap-5">
        <div className="flex flex-col gap-1 w-[148px] shrink-0">
          <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{ui('commercial')}</div>
          <div className="text-xs text-[hsl(var(--foreground))]">{ui('commercialDescription')}</div>
        </div>
        <div className="flex flex-row items-start gap-5 flex-1">
          <div className="w-[236px] shrink-0">
            <EntityForm
              entity={entity}
              fields={[
                { key: 'taxCategory', column: 'C_TaxCategory_ID', type: 'selector', label: 'Tax Category', required: true, section: 'other', reference: 'TaxCategory', inputMode: 'selector' },
              ]}
              data={data ?? {}}
              onChange={onChange}
              catalogs={catalogs}
              cols={1}
              displayLogic={{ readOnly: readOnly ? { taxCategory: true } : {}, visibility: {} }}
              api={api}
              token={token}
              apiBaseUrl={apiBaseUrl}
              data-testid="EntityForm__fe05d5" />
          </div>
          <CheckboxGroup
            label={ui('availability')}
            items={[
              { key: 'sale', column: 'IsSold', label: ui('priceTabSales') },
              { key: 'purchase', column: 'IsPurchased', label: ui('priceTabPurchase') },
            ]}
            data={data}
            readOnly={readOnly}
            onChange={onChange}
            data-testid="CheckboxGroup__fe05d5" />
        </div>
      </div>
      <hr className="border-t border-[hsl(var(--border-subtle))] mx-5" />
      <div className="flex flex-row items-start p-2 gap-5">
        <div className="flex flex-col gap-1 w-[148px] shrink-0">
          <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{ui('logistics')}</div>
          <div className="text-xs text-[hsl(var(--foreground))]">{ui('logisticsDescription')}</div>
        </div>
        <div className="flex flex-col gap-5 flex-1">
          <div className="flex flex-row items-start gap-5">
            <div className="w-[236px] shrink-0">
              <EntityForm
                entity={entity}
                fields={[
                  { key: 'uOMForWeight', column: 'C_Uom_Weight_ID', type: 'selector', label: 'UOM for Weight', section: 'other', reference: 'UOM', inputMode: 'selector' },
                ]}
                data={data ?? {}}
                onChange={onChange}
                catalogs={catalogs}
                cols={1}
                displayLogic={{ readOnly: readOnly ? { uOMForWeight: true } : {}, visibility: {} }}
                api={api}
                token={token}
                apiBaseUrl={apiBaseUrl}
                data-testid="EntityForm__fe05d5" />
            </div>
            <div className="w-[236px] shrink-0">
              <WeightStepper
                label={t('Weight') ?? 'Weight'}
                value={data?.weight ?? 0}
                readOnly={readOnly}
                onChange={v => onChange?.('weight', v, 'Weight')}
                data-testid="WeightStepper__fe05d5" />
            </div>
          </div>
          <CheckboxGroup
            label={ui('stockManagement')}
            items={[
              { key: 'stocked', column: 'IsStocked', label: ui('productStocked') },
              { key: 'returnable', column: 'Returnable', label: ui('productReturnable') },
            ]}
            data={data}
            readOnly={readOnly}
            onChange={onChange}
            data-testid="CheckboxGroup__fe05d5" />
        </div>
      </div>
    </div>
  );
}
