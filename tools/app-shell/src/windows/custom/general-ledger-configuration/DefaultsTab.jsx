import { useUI, useLocale } from '@/i18n';
import { AccountBadgeSelect } from '@/components/contract-ui';
import SectionShell from './SectionShell.jsx';
import { ACCOUNT_OPTIONS, DEFAULTS_GROUPS, resolveFieldLabel } from './mockCatalogs.js';

/**
 * Valores por defecto tab — labeled groups of AccountBadgeSelect controls,
 * driven by `DEFAULTS_GROUPS`, which is DERIVED from `contract.json` (see
 * `buildDefaultsGroups` in `mockCatalogs.js`) rather than hand-typed. A field
 * with no curated `glc.acct.<key>` translation falls back to its raw AD
 * label via `resolveFieldLabel`. See
 * docs/superpowers/specs/2026-07-07-glc-defaults-ad-driven-grouping-design.md.
 */
export default function DefaultsTab({ defaults, accountOptions = ACCOUNT_OPTIONS, setDefaultField, errors = {} }) {
  const ui = useUI();
  const dictionary = useLocale();

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
                label={resolveFieldLabel(dictionary, f.key, f.fallbackLabel)}
                required={f.required}
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
