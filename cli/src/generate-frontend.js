import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { MARKERS } from './custom-section-markers.js';

/**
 * Capitalize the first letter of a string.
 */
export function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Convert camelCase name to "Title Case" label.
 * e.g., 'orderLine' -> 'Order Line'
 */
export function toLabel(name) {
  if (!name) return '';
  const words = name.replace(/([A-Z])/g, ' $1').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Pluralize a label string.
 * Handles common English rules: -y → -ies, -s/-x/-z/-sh/-ch → -es, else → -s.
 */
export function pluralize(label) {
  if (!label) return '';
  // Split on space to pluralize only the last word
  const parts = label.split(' ');
  const last = parts[parts.length - 1];
  let plural;
  if (/[^s]s$/i.test(last)) {
    plural = last; // already plural (e.g. "Assets", "Items")
  } else if (/[^aeiou]y$/i.test(last)) {
    plural = last.replace(/y$/i, 'ies');
  } else if (/(ss|x|z|sh|ch)$/i.test(last)) {
    plural = last + 'es';
  } else {
    plural = last + 's';
  }
  return [...parts.slice(0, -1), plural].join(' ');
}

/**
 * Get process endpoints that match a given entity.
 */
export function getProcessesForEntity(contract, entityName) {
  const endpoints = contract.backendContract?.processEndpoints ?? [];
  return endpoints.filter(p => p.entity === entityName);
}

/**
 * Get the read-only fields for an entity (used by page component for summary strip).
 */
export function getReadOnlyFields(contract, entityName) {
  const entity = contract.frontendContract.entities[entityName];
  return entity.fields.filter(f => f.form && f.visibility === 'readOnly');
}

/**
 * Map a contract field type to a column/field type for the declarative config.
 */
function mapFieldType(field) {
  // Explicit columnType override from decisions (e.g. "percent" for progress bars)
  if (field.columnType) return field.columnType;
  if (field.type !== 'foreignKey' && field.name.toLowerCase().includes('status')) {
    // Integer/number status fields without explicit columnType → show as number, not badge
    if ((field.type === 'integer' || field.type === 'number') && field.name.toLowerCase() !== 'documentstatus') {
      return 'number';
    }
    return 'status';
  }
  if (field.type === 'boolean') return 'boolean';
  if (field.type === 'amount') return 'amount';
  if (['number', 'integer', 'quantity', 'price', 'decimal'].includes(field.type)) return 'number';
  if (field.type === 'date') return 'date';
  if (field.type === 'enum') return 'enum';
  return 'string';
}

/**
 * Map a contract field to a form field type.
 * FK fields use inputMode (search/selector/dependent); non-FK fields use type.
 */
function mapFormFieldType(field) {
  if (field.type === 'foreignKey') {
    if (field.inputMode === 'selector') return 'selector';
    if (field.inputMode === 'dependent') return 'dependent';
    return 'search';
  }
  if (field.type === 'boolean') return 'checkbox';
  if (field.type === 'enum') return 'select';
  if (field.type === 'image') return 'image';
  if (field.tsType === 'number') return 'number';
  if (field.type === 'date') return 'date';
  if (/notes|description|comments|remarks/i.test(field.name)) return 'textarea';
  return 'text';
}

/**
 * Generate a data table component for an entity.
 * Produces a thin declarative component that imports DataTable from contract-ui.
 */
export function generateTableComponent(entityName, contract) {
  const entity = contract.frontendContract.entities[entityName];
  const gridFields = entity.fields.filter(f => f.grid);
  const searchableFields = entity.searchableFields ?? [];
  const compName = `${capitalize(entityName)}Table`;

  const columnsArray = gridFields.map(f => {
    const type = mapFieldType(f);
    const selectionPart = f.isSelectionColumn ? ', isSelectionColumn: true' : '';
    const enumLabelsPart = (type === 'enum' && f.enumValues?.length)
      ? `, enumLabels: { ${f.enumValues.map(o => `'${o.value}': '${o.name.replace(/'/g, "\\'")}'`).join(', ')} }`
      : '';
    const labelPart = f.label ? `, label: '${f.label.replace(/'/g, "\\'")}'` : '';
    const badgePart = f.badge ? ', badge: true' : '';
    const badgeLabelsPart = f.badgeLabels ? `, badgeLabels: ${JSON.stringify(f.badgeLabels)}` : '';
    const summablePart = f.summable ? ', summable: true' : '';
    const displayPart = f.display ? `, display: '${f.display}'` : '';
    return `  { key: '${f.name}', column: '${f.column}', type: '${type}'${labelPart}${enumLabelsPart}${selectionPart}${badgePart}${badgeLabelsPart}${summablePart}${displayPart} },`;
  }).join('\n');

  const filtersArray = searchableFields.map(f => `'${f}'`).join(', ');

  return `import { DataTable } from '@/components/contract-ui';

${MARKERS.GENERATED_START(`columns:${entityName}`)}
const columns = [
${columnsArray}
];
${MARKERS.GENERATED_END(`columns:${entityName}`)}

const filters = [${filtersArray}];

${MARKERS.GENERATED_START(`component:${compName}`)}
export default function ${compName}(props) {
  ${MARKERS.CUSTOM_SLOT(`hooks:${compName}`)}
  return <DataTable columns={columns} filters={filters} {...props} />;
}
${MARKERS.GENERATED_END(`component:${compName}`)}

${MARKERS.CUSTOM_SLOT(`section:${compName}-custom`)}
`;
}

/**
 * Generate a detail/edit form component for an entity.
 * Produces a thin declarative component that imports EntityForm from contract-ui.
 * Only renders editable fields (visibility !== 'readOnly').
 */
export function generateFormComponent(entityName, contract) {
  const entity = contract.frontendContract.entities[entityName];
  const formCols = entity.formCols ?? null;
  const colsProp = formCols != null ? ` cols={${formCols}}` : '';
  // Sort by seq override if present (stable sort: fields without seq keep natural DB order)
  const formFields = entity.fields
    .filter(f => f.form && f.type !== 'button')
    .sort((a, b) => {
      if (a.seq != null && b.seq != null) return a.seq - b.seq;
      if (a.seq != null) return -1;
      if (b.seq != null) return 1;
      return 0;
    });
  const compName = `${capitalize(entityName)}Form`;

  // Classify fields into sections: first N editable non-readOnly fields are 'principal', rest are 'other'.
  // Fields with explicit section in the contract take precedence.
  const MAX_PRINCIPAL = 4;
  let principalCount = 0;
  const fieldSections = formFields.map(f => {
    if (f.section) return f.section;
    if (f.visibility === 'readOnly') return 'other';
    if (principalCount < MAX_PRINCIPAL) {
      principalCount++;
      return 'principal';
    }
    return 'other';
  });

  const fieldsArray = formFields.map((f, idx) => {
    const type = mapFormFieldType(f);
    const requiredPart = f.required ? ', required: true' : '';
    const lookupPart = f.lookup ? ', lookup: true' : '';
    const readOnlyPart = f.visibility === 'readOnly' ? ', readOnly: true' : '';
    const referencePart = f.reference ? `, reference: '${f.reference}'` : '';
    const inputModePart = f.inputMode ? `, inputMode: '${f.inputMode}'` : '';
    const dependsOnPart = f.dependsOn
      ? `, dependsOn: { field: '${f.dependsOn.field}', filterKey: '${f.dependsOn.filterKey}' }`
      : '';
    // Section classification
    const sectionPart = `, section: '${fieldSections[idx]}'`;
    // UI hints
    const defaultValuePart = f.defaultValue ? `, defaultValue: '${f.defaultValue.replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '')}'` : '';
    const helpPart = f.help ? `, help: '${f.help.replace(/'/g, "\\'")}'` : '';
    const fieldGroupPart = f.fieldGroup ? `, fieldGroup: '${f.fieldGroup.replace(/'/g, "\\'")}'` : '';
    const precisionPart = f.precision ? `, precision: ${f.precision}` : '';
    // Behavioral metadata: displayLogic and readOnlyLogic
    let displayLogicPart = '';
    if (f.displayLogic) {
      if (f.displayLogic.js) {
        displayLogicPart = `, displayLogic: (record) => ${f.displayLogic.js}`;
      } else if (f.displayLogic.evaluable === false) {
        displayLogicPart = `, visible: null, visibilitySource: 'server', displayLogicReason: '${f.displayLogic.reason || 'unknown'}'`;
      }
    }
    let readOnlyLogicPart = '';
    if (f.readOnlyLogic) {
      if (f.readOnlyLogic.evaluable === false) {
        readOnlyLogicPart = `, readOnlySource: 'server', readOnlyLogicReason: '${f.readOnlyLogic.reason || 'unknown'}'`;
      } else if (f.readOnlyLogic.js) {
        readOnlyLogicPart = `, readOnlyLogic: (record) => ${f.readOnlyLogic.js}`;
      }
    }
    // Custom slots for callout and onChangeFunction behavioral hints
    const slotLines = [];
    if (f.callout) {
      const calloutId = f.callout.className.replace(/.*\./, '');
      slotLines.push(`  ${MARKERS.CUSTOM_SLOT(`callout:${calloutId}`)}`);
    }
    if (f.onChangeFunction) {
      slotLines.push(`  ${MARKERS.CUSTOM_SLOT(`onchange:${f.onChangeFunction.name}`)}`);
    }
    const optionsPart = (type === 'select' && f.enumValues?.length)
      ? `, options: [${f.enumValues.map(o => `{ value: '${o.value}', label: '${o.name.replace(/'/g, "\\'")}' }`).join(', ')}]`
      : '';
    const formLabelPart = f.label ? `, label: '${f.label.replace(/'/g, "\\'")}'` : '';
    const fieldLine = `  { key: '${f.name}', column: '${f.column}', type: '${type}'${formLabelPart}${requiredPart}${lookupPart}${readOnlyPart}${sectionPart}${referencePart}${inputModePart}${dependsOnPart}${optionsPart}${defaultValuePart}${helpPart}${fieldGroupPart}${precisionPart}${displayLogicPart}${readOnlyLogicPart} },`;
    return [...slotLines, fieldLine].join('\n');
  }).join('\n');

  // Generate field groups comment if any fields have fieldGroup
  const uniqueGroups = [...new Set(formFields.map(f => f.fieldGroup).filter(Boolean))];
  const fieldGroupsComment = uniqueGroups.length > 0
    ? `// Field groups: ${uniqueGroups.join(', ')}\n`
    : '';

  return `import { EntityForm } from '@/components/contract-ui';

${MARKERS.GENERATED_START(`fields:${entityName}`)}
${fieldGroupsComment}const fields = [
${fieldsArray}
];
${MARKERS.GENERATED_END(`fields:${entityName}`)}

${MARKERS.GENERATED_START(`component:${compName}`)}
export default function ${compName}(props) {
  ${MARKERS.CUSTOM_SLOT(`hooks:${compName}`)}
  return <EntityForm fields={fields}${colsProp} {...props} />;
}
${MARKERS.GENERATED_END(`component:${compName}`)}

${MARKERS.CUSTOM_SLOT(`section:${compName}-custom`)}
`;
}

/**
 * Generate a StatusBar component for windows with a statusBar config.
 * Returns an object with { componentCode, lucideImports } strings.
 */
function generateStatusBarComponent(headerEntity, statusBarConfig) {
  const headerName = capitalize(headerEntity);
  const { cards = [], progress } = statusBarConfig;

  // Collect unique lucide icon names
  const iconNames = new Set();
  for (const card of cards) {
    if (card.icon) iconNames.add(card.icon);
  }
  if (progress?.completedIcon) iconNames.add(progress.completedIcon);
  // The progress bar also uses a card icon as its "in-progress" icon
  // (matching the first card's icon or TrendingDown by convention)
  if (progress && cards.length > 0 && cards[0].icon) iconNames.add(cards[0].icon);
  const lucideImports = `import { ${[...iconNames].join(', ')} } from 'lucide-react';`;

  // Build cards array literal
  const cardsLiteral = cards.map(card => {
    return `    { label: '${card.label}', value: fmt(data.${card.field}), color: '${card.color}',  Icon: ${card.icon} },`;
  }).join('\n');

  // Build progress section
  let progressSection = '';
  if (progress) {
    const { numerator, denominator, condition, label, color, completedColor, completedIcon } = progress;
    // Determine the in-progress icon (first card icon, or first icon in the set)
    const inProgressIcon = (cards.length > 0 && cards[0].icon) ? cards[0].icon : [...iconNames][0];
    progressSection = `  const progressColor = pct === 100 ? '${completedColor}' : '${color}';
  const pc = colorMap[progressColor];`;

    const progressJsx = `      {pct !== null && (
        <div className={\`flex items-center gap-3 \${pc.bg} border-l-4 \${pc.border} rounded-lg px-4 py-2.5 min-w-[170px]\`}>
          {pct === 100 ? <${completedIcon} size={18} className={pc.icon} /> : <${inProgressIcon} size={18} className={pc.icon} />}
          <div>
            <div className={\`text-lg font-semibold leading-tight \${pc.text}\`}>{pct}%</div>
            <div className={\`text-xs \${pc.sub} mt-0.5\`}>${label}</div>
            <div className={\`mt-1.5 h-1.5 w-24 \${pc.barTrack} rounded-full overflow-hidden\`}>
              <div className={\`h-full \${pc.bar} rounded-full transition-all\`} style={{ width: \`\${pct}%\` }} />
            </div>
          </div>
        </div>
      )}`;

    const componentCode = `${MARKERS.GENERATED_START(`statusBar:${headerEntity}`)}
function ${headerName}StatusBar({ data }) {
  if (!data) return null;
  const fmt = (v) => v != null ? Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  const ${condition} = data.${condition} === true || data.${condition} === 'Y';
  const ${numerator} = Number(data.${numerator} ?? 0);
  const ${denominator} = Number(data.${denominator} ?? 0);
  const pct = (${condition} && ${denominator} > 0) ? Math.min(100, Math.round((${numerator} / ${denominator}) * 100)) : null;
  const colorMap = {
    blue:   { bg: 'bg-blue-100',   border: 'border-l-blue-500',    text: 'text-blue-800',    sub: 'text-blue-500',    icon: 'text-blue-500',    bar: 'bg-blue-500',    barTrack: 'bg-blue-200'    },
    teal:   { bg: 'bg-teal-50',    border: 'border-l-teal-500',    text: 'text-teal-800',    sub: 'text-teal-500',    icon: 'text-teal-500',    bar: 'bg-teal-500',    barTrack: 'bg-teal-200'    },
    orange: { bg: 'bg-orange-50',  border: 'border-l-orange-500',  text: 'text-orange-700',  sub: 'text-orange-500',  icon: 'text-orange-500',  bar: 'bg-orange-500',  barTrack: 'bg-orange-200'  },
    green:  { bg: 'bg-emerald-50', border: 'border-l-emerald-500', text: 'text-emerald-800', sub: 'text-emerald-500', icon: 'text-emerald-500', bar: 'bg-emerald-500', barTrack: 'bg-emerald-200' },
  };
  const cards = [
${cardsLiteral}
  ];
  ${progressSection}
  return (
    <div className="flex flex-wrap gap-3 pt-2 pb-3 mb-2 border-b border-gray-100">
      {cards.map(({ label, value, color, Icon }) => {
        const c = colorMap[color];
        return (
          <div key={label} className={\`flex items-center gap-3 \${c.bg} border-l-4 \${c.border} rounded-lg px-4 py-2.5 min-w-[160px]\`}>
            <Icon size={18} className={c.icon} />
            <div>
              <div className={\`text-lg font-semibold leading-tight \${c.text}\`}>{value}</div>
              <div className={\`text-xs \${c.sub} mt-0.5\`}>{label}</div>
            </div>
          </div>
        );
      })}
${progressJsx}
    </div>
  );
}
${MARKERS.GENERATED_END(`statusBar:${headerEntity}`)}`;

    return { componentCode, lucideImports };
  }

  // No progress section
  const componentCode = `${MARKERS.GENERATED_START(`statusBar:${headerEntity}`)}
function ${headerName}StatusBar({ data }) {
  if (!data) return null;
  const fmt = (v) => v != null ? Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  const colorMap = {
    blue:   { bg: 'bg-blue-100',   border: 'border-l-blue-500',    text: 'text-blue-800',    sub: 'text-blue-500',    icon: 'text-blue-500',    bar: 'bg-blue-500',    barTrack: 'bg-blue-200'    },
    teal:   { bg: 'bg-teal-50',    border: 'border-l-teal-500',    text: 'text-teal-800',    sub: 'text-teal-500',    icon: 'text-teal-500',    bar: 'bg-teal-500',    barTrack: 'bg-teal-200'    },
    orange: { bg: 'bg-orange-50',  border: 'border-l-orange-500',  text: 'text-orange-700',  sub: 'text-orange-500',  icon: 'text-orange-500',  bar: 'bg-orange-500',  barTrack: 'bg-orange-200'  },
    green:  { bg: 'bg-emerald-50', border: 'border-l-emerald-500', text: 'text-emerald-800', sub: 'text-emerald-500', icon: 'text-emerald-500', bar: 'bg-emerald-500', barTrack: 'bg-emerald-200' },
  };
  const cards = [
${cardsLiteral}
  ];
  return (
    <div className="flex flex-wrap gap-3 pt-2 pb-3 mb-2 border-b border-gray-100">
      {cards.map(({ label, value, color, Icon }) => {
        const c = colorMap[color];
        return (
          <div key={label} className={\`flex items-center gap-3 \${c.bg} border-l-4 \${c.border} rounded-lg px-4 py-2.5 min-w-[160px]\`}>
            <Icon size={18} className={c.icon} />
            <div>
              <div className={\`text-lg font-semibold leading-tight \${c.text}\`}>{value}</div>
              <div className={\`text-xs \${c.sub} mt-0.5\`}>{label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
${MARKERS.GENERATED_END(`statusBar:${headerEntity}`)}`;

  return { componentCode, lucideImports };
}

/**
 * Generate a header-detail page component with ListView/DetailView pattern.
 * Produces a thin declarative component that routes by recordId.
 */
export function generatePageComponent(headerEntity, detailEntity, contract) {
  const headerName = capitalize(headerEntity);
  const detailName = detailEntity ? capitalize(detailEntity) : null;
  const compName = `${headerName}Page`;
  const layoutType = contract?.frontendContract?.window?.layoutType ?? 'default';
  const isGallery = layoutType === 'gallery';
  const isSidebar = !!contract?.frontendContract?.window?.sidebarLayout;
  const processes = getProcessesForEntity(contract, headerEntity);
  const readOnlyFields = getReadOnlyFields(contract, headerEntity);

  // Detail entity editable fields for the add-line mini form
  const detailFields = contract.frontendContract.entities[detailEntity]?.fields ?? [];
  const detailEditableFields = detailFields.filter(f => f.form && f.visibility !== 'readOnly');

  // Status field gets a badge in the header; summary strip uses only fields with explicit section:'summary'.
  // Prefer DocStatus column (document workflow status) if present, even when form:false.
  const allEntityFields = contract.frontendContract.entities[headerEntity]?.fields ?? [];
  const docStatusField = allEntityFields.find(f => f.column === 'DocStatus');
  const statusFieldOverride = contract.frontendContract.window.statusField;
  const statusField = statusFieldOverride
    ? (allEntityFields.find(f => f.name === statusFieldOverride) ?? null)
    : (docStatusField ?? allEntityFields.find(f => f.visibility === 'readOnly' && f.name.toLowerCase().includes('status')));
  const summaryFieldsOverride = contract.frontendContract.window.summaryFields;
  const summaryFields = Array.isArray(summaryFieldsOverride)
    ? summaryFieldsOverride.length === 0
      ? []
      : readOnlyFields.filter(f => f !== statusField && summaryFieldsOverride.includes(f.name))
    : readOnlyFields.filter(f => f !== statusField);

  // Summary config
  const summaryArray = summaryFields.map(f => {
    const type = mapFieldType(f);
    return `  { key: '${f.name}', column: '${f.column}', type: '${type}' },`;
  }).join('\n');

  // Status field config
  const statusFieldLine = statusField ? `'${statusField.name}'` : 'null';

  // Process config: backendContract process endpoints + button-type fields from frontendContract
  // processOverrides from decisions.json allow label, style, displayLogicRaw, and exclude overrides
  const processOverrides = contract?.frontendContract?.window?.processOverrides ?? {};
  const buttonFields = allEntityFields.filter(f => f.type === 'button' && f.form);
  const processesArray = [
    ...processes.map(p => {
      const ovr = processOverrides[p.name] || processOverrides[p.columnName] || {};
      if (ovr.exclude) return null;
      const isDestructive = /void|cancel|reject/i.test(p.name);
      const style = ovr.style || (isDestructive ? 'destructive' : 'positive');
      const label = ovr.label || toLabel(p.name);
      const colPart = p.columnName ? `, columnName: '${p.columnName}'` : '';
      const paramsPart = p.params?.length ? `, params: ${JSON.stringify(p.params)}` : '';
      const dlRaw = ovr.displayLogicRaw
        ? `,\n    displayLogicRaw: "${ovr.displayLogicRaw.replace(/"/g, '\\"')}"`
        : '';
      return `  { name: '${p.name}', label: '${label.replace(/'/g, "\\'")}', style: '${style}'${colPart}${paramsPart}${dlRaw} },`;
    }).filter(Boolean),
    ...buttonFields.map(f => {
      const ovr = processOverrides[f.name] || {};
      if (ovr.exclude) return null;
      const isDestructive = /void|cancel|reject/i.test(f.name);
      const style = ovr.style || (isDestructive ? 'destructive' : 'positive');
      const label = ovr.label || f.label || toLabel(f.name);
      const dlRawVal = ovr.displayLogicRaw || f.displayLogic?.raw;
      const dlRaw = dlRawVal ? `,\n    displayLogicRaw: "${dlRawVal.replace(/"/g, '\\"')}"` : '';
      return `  { name: '${f.name}', label: '${label.replace(/'/g, "\\'")}', style: '${style}'${dlRaw} },`;
    }).filter(Boolean),
    // Extra processes defined purely in decisions.json (not in backend contract)
    ...Object.entries(processOverrides)
      .filter(([, ovr]) => ovr.add && !ovr.exclude)
      .map(([name, ovr]) => {
        const style = ovr.style || 'positive';
        const label = ovr.label || toLabel(name);
        const colPart = ovr.columnName ? `, columnName: '${ovr.columnName}'` : '';
        const dlRaw = ovr.displayLogicRaw
          ? `,\n    displayLogicRaw: "${ovr.displayLogicRaw.replace(/"/g, '\\"')}"`
          : '';
        return `  { name: '${name}', label: '${label.replace(/'/g, "\\'")}', style: '${style}'${colPart}${dlRaw} },`;
      }),
  ].join('\n');

  // Separate entry fields (user types) from auto-derived fields (price, tax, discount, amount)
  const autoPatterns = /price|tax|discount|amount|total|cost|net/i;
  const derivedFields = detailEditableFields.filter(f =>
    autoPatterns.test(f.name) && !f.required && !f.reference
  );
  const entryFields = detailEditableFields.filter(f => !derivedFields.includes(f));
  const hiddenDefaultFields = detailFields.filter(f =>
    f.visibility !== 'readOnly' && !f.form && f.defaultValue !== undefined
  );

  // The first search-type entry field (usually product) triggers a lookup modal
  const firstSearchIdx = entryFields.findIndex(f => mapFormFieldType(f) === 'search');
  const entryArray = entryFields.map((f, i) => {
    const type = mapFormFieldType(f);
    const requiredPart = f.required ? ', required: true' : '';
    const lookupPart = (i === firstSearchIdx && firstSearchIdx !== -1) ? ', lookup: true' : '';
    const labelPart = f.label ? `, label: '${f.label}'` : '';
    const referencePart = f.reference ? `, reference: '${f.reference}'` : '';
    const inputModePart = f.inputMode ? `, inputMode: '${f.inputMode}'` : '';
    const dependsOnPart = f.dependsOn
      ? `, dependsOn: { field: '${f.dependsOn.field}', filterKey: '${f.dependsOn.filterKey}' }`
      : '';
    return `    { key: '${f.name}', column: '${f.column}', type: '${type}'${requiredPart}${lookupPart}${labelPart}${referencePart}${inputModePart}${dependsOnPart} },`;
  }).join('\n');

  const derivedArray = derivedFields.map(f => {
    const type = mapFormFieldType(f);
    const labelPart = f.label ? `, label: '${f.label}'` : '';
    const referencePart = f.reference ? `, reference: '${f.reference}'` : '';
    const inputModePart = f.inputMode ? `, inputMode: '${f.inputMode}'` : '';
    return `    { key: '${f.name}', column: '${f.column}', type: '${type}'${labelPart}${referencePart}${inputModePart} },`;
  }).join('\n');

  const hiddenDefaultsArray = hiddenDefaultFields.map(f => {
    const defaultValue = String(f.defaultValue).replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '');
    return `    { key: '${f.name}', value: '${defaultValue}' },`;
  }).join('\n');

  // API prediction config
  const apiPrediction = contract.apiPrediction;
  const apiBlock = apiPrediction
    ? `\nconst api = ${JSON.stringify(apiPrediction, null, 2)};\n`
    : '';
  const apiProp = apiPrediction ? '\n      api={api}' : '';

  const windowBreadcrumbOverride = contract?.frontendContract?.window?.breadcrumb;
  const windowCategory = capitalize(contract?.frontendContract?.window?.category ?? 'general');
  const windowLabel = contract?.frontendContract?.window?.name ?? toLabel(headerEntity);

  // Window-level UI config from decisions.json
  const windowConfig = contract?.frontendContract?.window ?? {};
  const documentPreview = windowConfig.documentPreview ?? null;
  const notesField = windowConfig.notesField ?? null;
  const relatedDocuments = windowConfig.relatedDocuments ?? false;
  const hideDeleteWhenComplete = windowConfig.hideDeleteWhenComplete ?? false;
  const hidePrint = windowConfig.hidePrint ?? false;
  const customComponents = windowConfig.customComponents ?? {};
  const menuActionsConfig = windowConfig.menuActions ?? [];
  const statusBar = windowConfig.statusBar ?? null;
  const detailSortBy = windowConfig.detailSortBy ?? null;
  const salesTheme = windowConfig.salesTheme ?? false;

  // Detect secondary child entities for additional tabs
  const secondaryTabsDecl = windowConfig.secondaryTabs;
  let secondaryTabDefs;

  if (secondaryTabsDecl) {
    // Declarative config from decisions.json — sorted by tabOrder
    secondaryTabDefs = Object.entries(secondaryTabsDecl)
      .sort((a, b) => (a[1].tabOrder ?? 99) - (b[1].tabOrder ?? 99))
      .map(([key, cfg]) => {
        const isFormTab = cfg.tabMode === 'form-only';
        const FormName = cfg.customForm ?? `${capitalize(key)}Form`;
        const TableName = cfg.customTable ?? `${capitalize(key)}Table`;
        const addLineFieldKeys = cfg.addLineFields ?? [];
        const entityFields = contract.frontendContract.entities[key]?.fields ?? [];
        const addLineEntries = addLineFieldKeys.map(fk => {
          const f = entityFields.find(ef => ef.name === fk);
          if (!f) return null;
          const type = mapFormFieldType(f);
          const requiredPart = f.required ? ', required: true' : '';
          const labelPart = f.label ? `, label: '${f.label}'` : '';
          const referencePart = f.reference ? `, reference: '${f.reference}'` : '';
          const inputModePart = f.inputMode ? `, inputMode: '${f.inputMode}'` : '';
          const optionsPart = (type === 'select' && f.enumValues?.length)
            ? `, options: [${f.enumValues.map(o => `{ value: '${o.value}', label: '${o.name.replace(/'/g, "\\'")}' }`).join(', ')}]`
            : '';
          return `          { key: '${fk}', column: '${f.column}', type: '${type}'${requiredPart}${labelPart}${referencePart}${inputModePart}${optionsPart} }`;
        }).filter(Boolean);
        return { key, label: cfg.label ?? toLabel(key), isFormTab, isCustomForm: !!cfg.customForm, isCustomTable: !!cfg.customTable, FormName, TableName, addLineEntries };
      });
  } else {
    // Fallback: hardcoded known list + entity inference (backward compat)
    const allEntityEntries = Object.entries(contract.frontendContract.entities);
    const knownSecondaryTabDefs = [
      { key: 'orderTax', label: 'Tax', TableName: 'OrderTaxTable', FormName: 'OrderTaxForm' },
      { key: 'invoiceTax', label: 'Tax', TableName: 'InvoiceTaxTable', FormName: 'InvoiceTaxForm' },
      { key: 'basicDiscounts', label: 'Basic Discounts', TableName: 'BasicDiscountsTable', FormName: 'BasicDiscountsForm' },
      { key: 'paymentPlan', label: 'Payment Plan', TableName: 'PaymentPlanTable', FormName: 'PaymentPlanForm' },
      { key: 'accounting', label: 'Accounting', TableName: 'AccountingTable', FormName: 'AccountingForm' },
      { key: 'landedCost', label: 'Landed Cost', TableName: 'LandedCostTable', FormName: 'LandedCostForm' },
      { key: 'reversedInvoices', label: 'Reversed Invoices', TableName: 'ReversedInvoicesTable', FormName: 'ReversedInvoicesForm' },
    ].filter(t => allEntityEntries.some(([name]) => name === t.key));

    const knownSecondaryKeys = new Set(knownSecondaryTabDefs.map(t => t.key));
    const inferredSecondaryTabDefs = allEntityEntries
      .filter(([name, entity]) => {
        if (name === headerEntity || name === detailEntity) return false;
        if (knownSecondaryKeys.has(name)) return false;
        const editableFieldCount = (entity.fields || []).filter(f => f.visibility === 'editable').length;
        return editableFieldCount === 0;
      })
      .map(([name, entity]) => ({
        key: name,
        label: entity.tabName || toLabel(name),
        isFormTab: false,
        TableName: `${capitalize(name)}Table`,
        FormName: `${capitalize(name)}Form`,
        addLineEntries: [],
      }));

    secondaryTabDefs = [
      ...knownSecondaryTabDefs.map(t => ({ ...t, isFormTab: false, addLineEntries: [] })),
      ...inferredSecondaryTabDefs,
    ].slice(0, 4);
  }

  const specName = contract.apiPrediction?.specName;
  const secondaryTabsImports = secondaryTabDefs
    .map(t => {
      const formImportPath = (t.isCustomForm && specName)
        ? `@/windows/custom/${specName}/${t.FormName}`
        : `./${t.FormName}`;
      const tableImportPath = (t.isCustomTable && specName)
        ? `@/windows/custom/${specName}/${t.TableName}`
        : `./${t.TableName}`;
      if (t.isFormTab) {
        return `import ${t.FormName} from '${formImportPath}';`;
      }
      return `import ${t.TableName} from '${tableImportPath}';\nimport ${t.FormName} from '${formImportPath}';`;
    })
    .join('\n');

  const secondaryTabsPropEntries = secondaryTabDefs.map(t => {
    if (t.isFormTab) {
      return `          { key: '${t.key}', label: '${t.label}', isFormTab: true, Form: ${t.FormName} },`;
    }
    const addLinePart = t.addLineEntries.length > 0
      ? `, addLineFields: { entry: [\n${t.addLineEntries.join(',\n')},\n          ], derived: [], hidden: [] }`
      : '';
    return `          { key: '${t.key}', label: '${t.label}', Table: ${t.TableName}, Form: ${t.FormName}${addLinePart} },`;
  }).join('\n');

  const secondaryTabsProp = secondaryTabDefs.length > 0
    ? `\n        secondaryTabs={[\n${secondaryTabsPropEntries}\n        ]}`
    : '';

  // Build optional DetailView props from window-level decisions config
  const documentPreviewProp = documentPreview
    ? `\n        documentPreview={{ titlePrefix: '${documentPreview.titlePrefix || ''}', pdfUrl: null }}`
    : '';
  const notesFieldProp = notesField
    ? `\n        notesField="${notesField}"`
    : '';
  const customTabsProp = relatedDocuments
    ? `\n        customTabs={[{ key: 'related', label: 'Related Documents', Component: RelatedDocuments }]}`
    : '';

  // hideDeleteWhenComplete prop
  const hideDeleteProp = hideDeleteWhenComplete ? '\n        hideDeleteWhenComplete' : '';

  // hidePrint prop
  const hidePrintProp = hidePrint ? '\n        hidePrint' : '';

  // Custom component props (bottomSection, topbarRight)
  const customComponentImports = [];
  const customComponentProps = [];
  if (customComponents.bottomSection) {
    customComponentImports.push(`import ${customComponents.bottomSection} from '../../../custom/${customComponents.bottomSection}';`);
    customComponentProps.push(`\n        bottomSection={${customComponents.bottomSection}}`);
  }
  if (customComponents.topbarRight) {
    customComponentImports.push(`import ${customComponents.topbarRight} from '../../../custom/${customComponents.topbarRight}';`);
    customComponentProps.push(`\n        topbarRight={${customComponents.topbarRight}}`);
  }
  if (customComponents.bulkActions) {
    customComponentImports.push(`import ${customComponents.bulkActions} from '../../../custom/${customComponents.bulkActions}';`);
  }
  if (customComponents.sidePanel) {
    customComponentImports.push(`import ${customComponents.sidePanel} from '../../../custom/${customComponents.sidePanel}';`);
    customComponentProps.push(`\n        sidePanel={${customComponents.sidePanel}}`);
    if (customComponents.sidePanelStyle) {
      customComponentProps.push(`\n        sidePanelStyle={${JSON.stringify(customComponents.sidePanelStyle)}}`);
    }
  }
  if (customComponents.newRecordComponent) {
    customComponentImports.push(`import ${customComponents.newRecordComponent} from '../../../custom/${customComponents.newRecordComponent}';`);
  }
  const customCompImportBlock = customComponentImports.length > 0
    ? customComponentImports.join('\n') + '\n'
    : '';
  const customCompPropsBlock = customComponentProps.join('');

  // Custom headerTable override
  const customHeaderTable = customComponents.headerTable ?? null;
  const headerTableImport = customHeaderTable
    ? `import ${headerName}Table from '../../../custom/${customHeaderTable}';`
    : `import ${headerName}Table from './${headerName}Table';`;

  // menuActions prop
  const menuActionsProp = menuActionsConfig.length > 0
    ? `\n        menuActions={({ status }) => [\n${menuActionsConfig.map(a => {
        const vis = a.visibleWhenStatus
          ? Array.isArray(a.visibleWhenStatus)
            ? `visible: ${JSON.stringify(a.visibleWhenStatus)}.includes(status)`
            : `visible: status === '${a.visibleWhenStatus}'`
          : '';
        const destr = a.destructive ? 'destructive: true, ' : '';
        const col = a.columnName ? `columnName: '${a.columnName}', ` : `onClick: () => {},`;
        const visPart = vis ? `${vis}, ` : '';
        return `          { key: '${a.key}', label: '${a.label}', ${destr}${visPart}${col} }`;
      }).join(',\n')}\n        ]}`
    : '';

  // Build optional import for RelatedDocuments
  const relatedDocsImport = relatedDocuments
    ? `import RelatedDocuments from '../../../custom/RelatedDocuments';\n`
    : '';

  // Draft mode config from frontend contract
  const draftModeConfig = contract.frontendContract.entities[headerEntity]?.draftMode;
  const draftModeValue = draftModeConfig?.enabled
    ? JSON.stringify(draftModeConfig, null, 2)
    : 'null';
  const draftModeProp = draftModeConfig?.enabled ? '\n        draftMode={draftMode}' : '';

  // entityLabel / detailLabel / detailTabIndex from window decisions config
  const entityLabel = windowConfig.entityLabel || toLabel(headerEntity);
  const entityDetailLabel = detailEntity
    ? (windowConfig.detailLabel || contract.frontendContract.entities[detailEntity]?.tabName || toLabel(detailEntity))
    : '';
  const detailTabIndexProp = windowConfig.detailTabIndex != null
    ? `\n        detailTabIndex={${windowConfig.detailTabIndex}}`
    : '';

  // StatusBar component generation
  const statusBarResult = statusBar ? generateStatusBarComponent(headerEntity, statusBar) : null;
  const statusBarImport = statusBarResult ? `\n${statusBarResult.lucideImports}` : '';
  const statusBarCode = statusBarResult ? `\n${statusBarResult.componentCode}\n` : '';
  const headerContentProp = statusBar
    ? `\n        headerContent={(data) => <${headerName}StatusBar data={data} />}`
    : (isGallery && !isSidebar ? `\n        headerContent={
          <${headerName}DetailHeader
            recordId={recordId}
            token={props.token}
            apiBaseUrl={api.baseUrl}
          />
        }` : '');
  const sidebarContentProp = isSidebar
    ? `\n        sidebarContent={(data) => (
          <${headerName}Sidebar
            recordId={recordId}
            data={data}
            token={props.token}
            apiBaseUrl={api.baseUrl}
          />
        )}`
    : '';

  // detailSortBy prop
  const detailSortByProp = detailSortBy ? `\n        detailSortBy="${detailSortBy}"` : '';

  // salesTheme prop
  const salesThemeProp = salesTheme ? '\n        salesTheme' : '';

  // listKpiCards → headerContent prop in ListView
  const listKpiCardsConfig = windowConfig.listKpiCards ?? null;
  let listKpiCardsImport = '';
  let listKpiCardsProp = '';
  if (listKpiCardsConfig?.customComponent && specName) {
    const kpiComp = listKpiCardsConfig.customComponent;
    listKpiCardsImport = `import ${kpiComp} from '@/windows/custom/${specName}/${kpiComp}';\n`;
    listKpiCardsProp = `\n      headerContent={(p) => <${kpiComp} {...p} />}`;
  }

  // headerExtra → formFooter prop
  const headerExtraConfig = windowConfig.headerExtra ?? null;
  let formFooterImport = '';
  let formFooterProp = '';
  if (headerExtraConfig?.customForm && specName) {
    const compName = headerExtraConfig.customForm;
    formFooterImport = `import ${compName} from '@/windows/custom/${specName}/${compName}';\n`;
    formFooterProp = `\n        formFooter={${compName}}`;
  }

  // primaryTabs support
  const primaryTabsConfig = windowConfig.primaryTabs ?? null;
  let primaryTabsImports = '';
  let primaryTabsProp = '';
  if (primaryTabsConfig && specName) {
    const imports = [];
    const tabEntries = primaryTabsConfig.map(tab => {
      if (tab.panel) {
        imports.push(`import ${tab.panel} from '@/windows/custom/${specName}/${tab.panel}';`);
        return `{ key: '${tab.key}', label: '${tab.label}', Panel: ${tab.panel} }`;
      }
      return `{ key: '${tab.key}', label: '${tab.label}' }`;
    });
    primaryTabsImports = imports.length > 0 ? imports.join('\n') + '\n' : '';
    primaryTabsProp = `\n        primaryTabs={[\n          ${tabEntries.join(',\n          ')},\n        ]}`;
  }

  // othersLabel support
  const othersLabelValue = windowConfig.othersLabel ?? null;
  const othersLabelProp = othersLabelValue ? `\n        othersLabel="${othersLabelValue}"` : '';

  return `import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';${menuActionsConfig.length > 0 ? `\nimport { toast } from 'sonner';` : ''}
${headerTableImport}
import ${headerName}Form from './${headerName}Form';${detailEntity ? `
import ${detailName}Table from './${detailName}Table';
import ${detailName}Form from './${detailName}Form';` : ''}
${secondaryTabDefs.length > 0 ? `${secondaryTabsImports}\n` : ''}${formFooterImport}${primaryTabsImports}${listKpiCardsImport}${relatedDocsImport}${customCompImportBlock}import catalogs from './mockCatalogs';
${isGallery ? `import ${headerName}Gallery from '@/windows/custom/${headerEntity}/${headerName}Gallery';` : ''}${isSidebar ? `
import ${headerName}Sidebar from '@/windows/custom/${headerEntity}/${headerName}Sidebar';` : (isGallery ? `
import ${headerName}DetailHeader from '@/windows/custom/${headerEntity}/${headerName}DetailHeader';` : '')}${statusBarImport}

const breadcrumb = '${windowBreadcrumbOverride !== undefined ? windowBreadcrumbOverride : `${windowCategory} / ${windowLabel}`}';
${statusBarCode}

${MARKERS.GENERATED_START(`summary:${headerEntity}`)}
const summary = [
${summaryArray}
];

const statusField = ${statusFieldLine};
${MARKERS.GENERATED_END(`summary:${headerEntity}`)}

${MARKERS.CUSTOM_SLOT(`extraBadges:${headerEntity}`)}
${MARKERS.GENERATED_START(`extraBadges:${headerEntity}`)}
const extraBadges = [];
${MARKERS.GENERATED_END(`extraBadges:${headerEntity}`)}

${MARKERS.GENERATED_START(`processes:${headerEntity}`)}
const processes = [
${processesArray}
];
${MARKERS.GENERATED_END(`processes:${headerEntity}`)}

${MARKERS.GENERATED_START(`draftMode:${headerEntity}`)}
const draftMode = ${draftModeValue};
${MARKERS.GENERATED_END(`draftMode:${headerEntity}`)}

${detailEntity ? `${MARKERS.GENERATED_START(`addLineFields:${detailEntity}`)}
const addLineFields = {
  entry: [
${entryArray}
  ],
  derived: [
${derivedArray}
  ],
  hidden: [
${hiddenDefaultsArray}
  ],
};
${MARKERS.GENERATED_END(`addLineFields:${detailEntity}`)}` : ''}
${apiBlock}
${MARKERS.GENERATED_START(`component:${compName}`)}
export default function ${compName}({ windowName, recordId, ...props }) {
  ${MARKERS.CUSTOM_SLOT(`hooks:${compName}`)}
  ${customComponents.newRecordComponent ? `if (recordId === 'new') {
    return <${customComponents.newRecordComponent} token={props.token} apiBaseUrl={props.apiBaseUrl} windowName={windowName} />;
  }` : ''}
  if (recordId) {
    return (
      <DetailView
        entity="${headerEntity}"${detailEntity ? `
        detailEntity="${detailEntity}"` : ''}
        Form={${headerName}Form}${detailEntity ? `
        DetailTable={${detailName}Table}
        DetailForm={${detailName}Form}` : ''}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}${detailEntity ? `
        addLineFields={addLineFields}` : ''}
        catalogs={catalogs}
        entityLabel="${entityLabel}"${detailEntity ? `
        detailLabel="${entityDetailLabel}"` : ''}
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}${apiProp}${detailTabIndexProp}${secondaryTabsProp}${formFooterProp}${primaryTabsProp}${othersLabelProp}${documentPreviewProp}${hideDeleteProp}${hidePrintProp}${notesFieldProp}${customTabsProp}${customCompPropsBlock}${menuActionsProp}${draftModeProp}${headerContentProp}${detailSortByProp}${salesThemeProp}
        {...props}${sidebarContentProp}
      />
    );
  }

  return (
    <ListView
      entity="${headerEntity}"
      Table={${headerName}Table}
      entityLabel="${windowConfig.name || pluralize(entityLabel)}"
      windowName={windowName}
      breadcrumb={breadcrumb}${apiProp}${isGallery ? `
      galleryRenderer={(gProps) => <${headerName}Gallery {...gProps} />}` : ''}${listKpiCardsProp}
      {...props}
    />
  );
}
${MARKERS.GENERATED_END(`component:${compName}`)}

${MARKERS.CUSTOM_SLOT(`section:${compName}-custom`)}
`;
}

/**
 * Generate the entry point / index component.
 * Accepts { token, apiBaseUrl, window } props.
 */
export function generateIndexComponent(headerEntity, detailEntity, contract) {
  const headerName = capitalize(headerEntity);
  const category = contract?.frontendContract?.window?.category ?? 'general';
  const windowName = contract?.frontendContract?.window?.name ?? toLabel(headerEntity);
  const apiPrediction = contract?.apiPrediction;

  const apiBlock = apiPrediction
    ? `\nconst api = ${JSON.stringify(apiPrediction, null, 2)};\n`
    : '';
  const apiProp = apiPrediction ? ' api={api}' : '';
  return `import ${headerName}Page from './${headerName}Page';

const windowMeta = { category: '${category}', name: '${windowName}' };
${apiBlock}
${MARKERS.GENERATED_START('component:App')}
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  ${MARKERS.CUSTOM_SLOT('hooks:App')}
  return <${headerName}Page windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta}${apiProp} {...rest} />;
}
${MARKERS.GENERATED_END('component:App')}

${MARKERS.CUSTOM_SLOT('section:App-custom')}
`;
}

// --- Mock Catalog Data Pools ---

const CATALOG_DATA = {
  BusinessPartner: Array.from({ length: 15 }, (_, i) => ({
    id: `bp-${String(i + 1).padStart(3, '0')}`,
    name: [
      'Acme Corp', 'TechFlow Inc', 'Global Trade Ltd', 'Summit Industries',
      'Pacific Partners', 'Alpine Solutions', 'Meridian Group', 'Vertex Systems',
      'Atlas Manufacturing', 'Nova Enterprises', 'Pinnacle Services', 'Horizon Labs',
      'Cedar Holdings', 'Sterling & Co', 'Quantum Logistics',
    ][i],
  })),
  Product: Array.from({ length: 20 }, (_, i) => ({
    id: `prod-${String(i + 1).padStart(3, '0')}`,
    name: [
      'Laptop Pro 15', 'USB-C Cable', 'Wireless Mouse', 'Mechanical Keyboard',
      'Monitor 27"', 'Webcam HD', 'Headset Pro', 'Docking Station',
      'SSD 1TB', 'RAM 16GB', 'Power Supply 750W', 'Network Switch',
      'Printer Laser', 'Scanner Flatbed', 'External HDD 2TB', 'Tablet 10"',
      'Router Pro', 'UPS Battery', 'Graphics Card', 'CPU Cooler',
    ][i],
    price: [1299, 15, 29, 89, 549, 79, 149, 199, 109, 65, 95, 45, 299, 189, 79, 449, 129, 159, 699, 49][i],
    uomId: 'uom-001',
  })),
  User: Array.from({ length: 8 }, (_, i) => ({
    id: `user-${String(i + 1).padStart(3, '0')}`,
    name: [
      'Alice Johnson', 'Bob Smith', 'Carol Williams', 'David Brown',
      'Eva Martinez', 'Frank Lee', 'Grace Kim', 'Henry Davis',
    ][i],
  })),
  Warehouse: Array.from({ length: 5 }, (_, i) => ({
    id: `wh-${String(i + 1).padStart(3, '0')}`,
    name: ['Main Warehouse', 'East Distribution Center', 'West Hub', 'North Storage', 'South Logistics'][i],
  })),
  PriceList: Array.from({ length: 4 }, (_, i) => ({
    id: `pl-${String(i + 1).padStart(3, '0')}`,
    name: ['Standard Price List', 'Wholesale Prices', 'Retail Prices', 'VIP Pricing'][i],
  })),
  PaymentTerm: Array.from({ length: 5 }, (_, i) => ({
    id: `pt-${String(i + 1).padStart(3, '0')}`,
    name: ['Immediate', 'Net 15', 'Net 30', 'Net 60', '2/10 Net 30'][i],
  })),
  PaymentMethod: Array.from({ length: 4 }, (_, i) => ({
    id: `pm-${String(i + 1).padStart(3, '0')}`,
    name: ['Wire Transfer', 'Credit Card', 'Check', 'Cash'][i],
  })),
  Tax: Array.from({ length: 6 }, (_, i) => ({
    id: `tax-${String(i + 1).padStart(3, '0')}`,
    name: ['VAT 21%', 'VAT 10%', 'VAT 0%', 'Sales Tax 8.5%', 'Exempt', 'Reduced Rate 5%'][i],
    rate: [21, 10, 0, 8.5, 0, 5][i],
  })),
  UOM: Array.from({ length: 5 }, (_, i) => ({
    id: `uom-${String(i + 1).padStart(3, '0')}`,
    name: ['Each', 'Box', 'Kg', 'Meter', 'Liter'][i],
  })),
  StorageBin: Array.from({ length: 10 }, (_, i) => ({
    id: `sb-${String(i + 1).padStart(3, '0')}`,
    name: ['A-01-01', 'A-01-02', 'A-02-01', 'A-02-02', 'B-01-01', 'B-01-02', 'B-02-01', 'B-02-02', 'C-01-01', 'C-01-02'][i],
    warehouseId: `wh-${String(Math.floor(i / 2) + 1).padStart(3, '0')}`,
  })),
  ProductCategory: Array.from({ length: 9 }, (_, i) => ({
    id: `cat-${String(i + 1).padStart(3, '0')}`,
    name: ['Electronics', 'Accessories', 'Peripherals', 'Displays', 'Audio', 'Storage', 'Components', 'Networking', 'Power'][i],
  })),
  BusinessPartnerLocation: Array.from({ length: 20 }, (_, i) => ({
    id: `bploc-${String(i + 1).padStart(3, '0')}`,
    name: [
      'HQ - 100 Main St', 'Branch - 200 Oak Ave', 'Warehouse - 300 Elm Dr',
      'Office - 50 Pine Rd', 'Factory - 400 Maple Ln', 'Store - 150 Cedar Blvd',
      'Depot - 250 Birch Way', 'Lab - 75 Spruce Ct', 'HQ - 500 Willow St',
      'Branch - 600 Ash Ave', 'Office - 10 Palm Dr', 'Store - 20 Ivy Rd',
      'Depot - 30 Fern Ln', 'Lab - 40 Sage Blvd', 'HQ - 55 Rose Way',
      'Branch - 65 Lily Ct', 'Office - 70 Daisy St', 'Store - 80 Tulip Ave',
      'Depot - 90 Orchid Dr', 'Lab - 95 Violet Rd',
    ][i],
    businessPartnerId: `bp-${String(Math.floor(i / 2) + 1).padStart(3, '0')}`,
  })),
};

/**
 * Collect all unique reference names from a contract's frontend entities.
 */
function collectReferences(contract) {
  const refs = new Set();
  for (const entity of Object.values(contract.frontendContract.entities)) {
    for (const field of entity.fields) {
      if (field.reference) refs.add(field.reference);
    }
  }
  return refs;
}

/**
 * Generate a mockCatalogs.js file with reference data for all FK fields in the contract.
 */
export function generateMockCatalogs(contract) {
  const refs = collectReferences(contract);
  const lines = [
    '// Auto-generated mock catalogs for FK reference data - do not edit manually',
    '',
    'const catalogs = {};',
    '',
  ];

  for (const ref of refs) {
    const data = CATALOG_DATA[ref];
    if (data) {
      lines.push(`catalogs['${ref}'] = ${JSON.stringify(data, null, 2)};`);
      lines.push('');
    }
  }

  lines.push('export default catalogs;');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate all frontend components from a contract.
 * Returns a map of { filename: code }.
 */
export function generateAll(contract) {
  const { frontendContract } = contract;
  const { window: win, entities } = frontendContract;
  const primaryEntity = win.primaryEntity;
  const entityNames = Object.keys(entities);
  const detailEntity = 'detailEntity' in win
    ? win.detailEntity
    : entityNames.find(name => name !== primaryEntity);

  const files = {};

  // Generate Table + Form for each entity
  for (const entityName of entityNames) {
    const capName = capitalize(entityName);
    files[`${capName}Table.jsx`] = generateTableComponent(entityName, contract);
    files[`${capName}Form.jsx`] = generateFormComponent(entityName, contract);
  }

  // Generate Page component (handles both header-detail and header-only layouts)
  files[`${capitalize(primaryEntity)}Page.jsx`] = generatePageComponent(primaryEntity, detailEntity, contract);

  // Generate mock catalogs
  files['mockCatalogs.js'] = generateMockCatalogs(contract);

  // Always generate index
  files['index.jsx'] = generateIndexComponent(primaryEntity, detailEntity, contract);

  return files;
}

/**
 * Capture the current state of generated files for a window.
 * Returns a { filename: content } map for use as the "before" snapshot.
 */
export function captureCurrentState(windowName, baseDir) {
  const webDir = resolve(baseDir || '.', `artifacts/${windowName}/generated/web/${windowName}`);
  const files = {};
  if (!existsSync(webDir)) return files;
  for (const filename of readdirSync(webDir)) {
    if (filename.endsWith('.jsx') || filename.endsWith('.js')) {
      files[filename] = readFileSync(resolve(webDir, filename), 'utf-8');
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// Process form generation
// ---------------------------------------------------------------------------

/**
 * Convert a kebab-case string to PascalCase.
 * "generate-invoices" -> "GenerateInvoices"
 */
function toPascalCase(kebab) {
  return kebab
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Generate a process form component from a process contract.
 */
export function generateProcessFormComponent(contract) {
  const proc = contract.process;
  const compName = toPascalCase(proc.specName) + 'Process';

  const paramsArray = contract.parameters.map(p => {
    const requiredPart = p.required ? ', required: true' : '';
    const defaultPart = p.defaultValue ? `, defaultValue: '${p.defaultValue.replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '')}'` : '';
    const referencePart = p.referenceValueId ? `, reference: '${p.referenceValueId}'` : '';
    return `  { key: '${p.name}', column: '${p.column}', type: '${p.inputMode}'${requiredPart}${defaultPart}${referencePart} },`;
  }).join('\n');

  const executeUrl = contract.apiPrediction?.baseUrl || `/sws/neo/${proc.specName}`;

  return `import { ProcessForm } from '@/components/contract-ui';

const parameters = [
${paramsArray}
];

const processConfig = {
  name: '${proc.name.replace(/'/g, "\\'")}',
  specName: '${proc.specName}',
  executeUrl: '${executeUrl}',
};

export default function ${compName}(props) {
  return <ProcessForm parameters={parameters} process={processConfig} {...props} />;
}
`;
}

/**
 * Generate the index/entry point for a process form.
 */
export function generateProcessIndex(contract) {
  const proc = contract.process;
  const compName = toPascalCase(proc.specName) + 'Process';

  return `import ${compName} from './${compName}';

const processMeta = { name: '${proc.name.replace(/'/g, "\\'")}', specName: '${proc.specName}' };

export default function App({ token, apiBaseUrl }) {
  return <${compName} token={token} apiBaseUrl={apiBaseUrl} process={processMeta} />;
}
`;
}

/**
 * Generate all frontend files for a process contract.
 * Returns { filename: code } map.
 */
export function generateAllProcess(contract) {
  const compName = toPascalCase(contract.process.specName) + 'Process';
  const files = {};
  files[`${compName}.jsx`] = generateProcessFormComponent(contract);
  files['index.jsx'] = generateProcessIndex(contract);
  return files;
}

// ---------------------------------------------------------------------------
// Report form generation
// ---------------------------------------------------------------------------

/**
 * Generate a report form component from a report contract.
 * Similar to process form but uses ReportForm, adds format selector,
 * and targets the generateReport endpoint.
 */
export function generateReportFormComponent(contract) {
  const proc = contract.process;
  const compName = toPascalCase(proc.specName) + 'Report';

  const paramsArray = contract.parameters.map(p => {
    const requiredPart = p.required ? ', required: true' : '';
    const defaultPart = p.defaultValue ? `, defaultValue: '${p.defaultValue.replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '')}'` : '';
    const referencePart = p.referenceValueId ? `, reference: '${p.referenceValueId}'` : '';
    return `  { key: '${p.name}', column: '${p.column}', type: '${p.inputMode}'${requiredPart}${defaultPart}${referencePart} },`;
  }).join('\n');

  const generateUrl = `/sws/neo/${proc.specName}/generateReport`;

  return `import { ReportForm } from '@/components/contract-ui';

const parameters = [
${paramsArray}
];

const reportConfig = {
  name: '${proc.name.replace(/'/g, "\\'")}',
  specName: '${proc.specName}',
  generateUrl: '${generateUrl}',
  supportedFormats: ['PDF', 'XLS', 'XLSX', 'HTML', 'CSV'],
};

export default function ${compName}(props) {
  return <ReportForm parameters={parameters} report={reportConfig} {...props} />;
}
`;
}

/**
 * Generate the index/entry point for a report form.
 */
export function generateReportIndex(contract) {
  const proc = contract.process;
  const compName = toPascalCase(proc.specName) + 'Report';

  return `import ${compName} from './${compName}';

const reportMeta = { name: '${proc.name.replace(/'/g, "\\'")}', specName: '${proc.specName}' };

export default function App({ token, apiBaseUrl }) {
  return <${compName} token={token} apiBaseUrl={apiBaseUrl} report={reportMeta} />;
}
`;
}

/**
 * Generate all frontend files for a report contract.
 * Returns { filename: code } map.
 */
export function generateAllReport(contract) {
  const compName = toPascalCase(contract.process.specName) + 'Report';
  const files = {};
  files[`${compName}.jsx`] = generateReportFormComponent(contract);
  files['index.jsx'] = generateReportIndex(contract);
  return files;
}

// CLI entry point -- only runs when executed directly
const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/.*\//, ''));
if (isDirectRun) {
  const contractPath = process.argv[2];
  if (!contractPath) {
    console.error('Usage: node cli/src/generate-frontend.js <contract-path>');
    process.exit(1);
  }

  const contractJson = readFileSync(resolve(contractPath), 'utf-8');
  const contract = JSON.parse(contractJson);
  const files = generateAll(contract);

  const windowName = contract.frontendContract.window.name
    .toLowerCase()
    .replace(/\s+/g, '-');

  const outDir = resolve(`artifacts/${windowName}/generated/web/${windowName}`);
  mkdirSync(outDir, { recursive: true });

  for (const [filename, code] of Object.entries(files)) {
    const filePath = resolve(outDir, filename);
    writeFileSync(filePath, code, 'utf-8');
    console.log(`  wrote ${filePath}`);
  }

  console.log(`\nGenerated ${Object.keys(files).length} files in ${outDir}`);
}
