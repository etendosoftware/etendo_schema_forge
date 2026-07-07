import { useUI } from '@/i18n';
import { AccountBadgeSelect } from '@/components/contract-ui';
import SectionShell from './SectionShell.jsx';
import NoFieldGroupHint from './NoFieldGroupHint.jsx';
import { ACCOUNT_OPTIONS, DEFAULTS_GROUPS } from './mockCatalogs.js';

/**
 * Valores por defecto tab — labeled groups (Banco · Diario · Contactos ·
 * Impuestos · Producto · Activos · Proyecto · Almacén) of AccountBadgeSelect
 * controls, driven by `DEFAULTS_GROUPS`. Section boundaries mirror AD_FieldGroup
 * on window 125 / tab 252 (see the comment above `DEFAULTS_GROUPS` in
 * `mockCatalogs.js`). Producto/Activos/Proyecto/Almacén/Diario expose
 * product/warehouse/asset/project/cash-journal `*_Acct` defaults not shown in
 * the original Figma mock. Fields flagged `noFieldGroupInAD` render
 * `NoFieldGroupHint` — a placeholder pending a product decision on grouping.
 */
export default function DefaultsTab({ defaults, accountOptions = ACCOUNT_OPTIONS, setDefaultField, errors = {} }) {
  const ui = useUI();

  return (
    <div className="px-1">
      {DEFAULTS_GROUPS.map((group, idx) => (
        <SectionShell
          key={group.section}
          first={idx === 0}
          title={ui(`glc.group.${group.section}.title`)}
          subtitle={ui(`glc.group.${group.section}.subtitle`)}
          data-testid={`glc-defaults-group-${group.section}`}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {group.fields.map((f) => (
              <AccountBadgeSelect
                key={f.key}
                label={ui(`glc.acct.${f.key}`)}
                required={f.required}
                labelHint={f.noFieldGroupInAD ? <NoFieldGroupHint /> : null}
                value={defaults[f.key]}
                options={accountOptions}
                onChange={(id) => setDefaultField(f.key, id)}
                error={errors[f.key]}
                data-testid={`glc-acct-${f.key}`}
              />
            ))}
          </div>
        </SectionShell>
      ))}
    </div>
  );
}
