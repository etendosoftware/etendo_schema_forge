import { useUI } from '@/i18n';
import { ToggleRow } from '@/components/contract-ui';
import SectionShell from './SectionShell.jsx';

/**
 * Dimensiones tab — single "Dimensiones contables" section: a list of toggle rows
 * (IsActive on/off) with a sub-caption combining IsMandatory ("Obligatorio" /
 * "Opcional") + a scope phrase.
 */
export default function DimensionsTab({ dimensions, setDimensionField }) {
  const ui = useUI();

  const caption = (row) => {
    return row.caption ?? '';
  };

  return (
    <div className="px-1">
      <SectionShell
        first
        title={ui('glc.section.dimensions.title')}
        subtitle={ui('glc.section.dimensions.subtitle')}
        data-testid="glc-section-dimensions"
      >
        <div className="max-w-2xl">
          {dimensions.map((row) => (
            <ToggleRow
              key={row.id}
              label={row.labelKey ? ui(row.labelKey) : row.label}
              caption={caption(row)}
              checked={row.active}
              disabled={Boolean(row.mandatory)}
              onCheckedChange={(checked) => setDimensionField(row.id, 'active', checked)}
              data-testid={`glc-dim-${row.id}`}
            />
          ))}
        </div>
      </SectionShell>
    </div>
  );
}
