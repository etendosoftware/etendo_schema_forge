import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { MARKERS } from './custom-section-markers.js';

/**
 * Resolves the correct import path for a custom component.
 *
 * Two conventions coexist in the project:
 *  - Pipeline windows (sales-order, sales-invoice, etc.) place their custom components
 *    in `artifacts/{specName}/custom/` → import as `'../../../custom/<Component>'`
 *    (3 levels up from `generated/web/{specName}/`)
 *  - Hand-built windows (product, assets, contacts, etc.) place their custom components
 *    in `tools/app-shell/src/windows/custom/{specName}/` → import as
 *    `'@/windows/custom/{specName}/<Component>'`
 *
 * The function checks the filesystem at generation time and picks the right path.
 * Falls back to `'../../../custom/'` (artifact-local, the convention for new windows).
 *
 * @param {string} specName  - window spec name, e.g. 'sales-invoice'
 * @param {string} component - component filename without extension, e.g. 'InvoiceBottomPanel'
 * @param {string} [appShellDir] - override the app-shell subdir (defaults to specName)
 * @returns {string} - the quoted import path, e.g. `'../../../custom/Foo'`
 */
function resolveCustomImport(specName, component, appShellDir) {
  if (existsSync(resolve(`artifacts/${specName}/custom/${component}.jsx`))) {
    return `'../../../custom/${component}'`;
  }
  const dir = appShellDir || specName;
  if (existsSync(resolve(`tools/app-shell/src/windows/custom/${dir}/${component}.jsx`))) {
    return `'@/windows/custom/${dir}/${component}'`;
  }
  // Default: artifact-local convention for newly created windows
  return `'../../../custom/${component}'`;
}

/**
 * Capitalize the first letter of a string.
 */
export function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Capitalize and strip characters that are invalid in a JS identifier.
 * Needed when entity/tab names contain parens, accents or spaces
 * (e.g. "issuedInvoices(previousPeriod)" → "IssuedInvoicespreviousPeriod").
 */
export function toJsIdentifier(s) {
  if (!s) return '';
  const capped = s.charAt(0).toUpperCase() + s.slice(1);
  return capped.replace(/[^a-zA-Z0-9_$]/g, '');
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
 * Etendo session/system macros (`@#Date@`, `@#User@`, `@#Client@`, ...) are
 * resolved server-side by NeoDefaultsService. Emitting them as a frontend
 * defaultValue would leak the literal token into inputs, so skip them here.
 */
function isEtendoSessionMacro(value) {
  return typeof value === 'string' && /^@#[\w]+@$/.test(value);
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
  if (field.enumValues?.length) return 'enum';
  if (field.type === 'boolean') return 'boolean';
  if (field.type === 'amount') return 'amount';
  if (['number', 'integer', 'quantity', 'price', 'decimal'].includes(field.type)) return 'number';
  if (field.type === 'date') return 'date';
  if (field.type === 'foreignKey') return 'selector';
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
  if (field.enumValues?.length) return 'select';
  if (field.type === 'boolean') return 'checkbox';
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
  const gridFieldsRaw = entity.fields.filter(f => f.grid && f.visibility !== 'discarded');
  // gridOrder: absolute insertion position (1-based). Only the tagged fields move;
  // all other fields stay in their original relative order.
  const pinned = [...gridFieldsRaw].filter(f => f.gridOrder != null).sort((a, b) => a.gridOrder - b.gridOrder);
  const unpinned = gridFieldsRaw.filter(f => f.gridOrder == null);
  const gridFields = [...unpinned];
  for (const f of pinned) {
    const pos = Math.max(1, Math.min(f.gridOrder, gridFields.length + 1));
    gridFields.splice(pos - 1, 0, f);
  }
  const searchableFields = entity.searchableFields ?? [];
  const compName = `${toJsIdentifier(entityName)}Table`;

  // Collect known cell type render helpers needed by this table
  const neededCellTypes = new Set(gridFields.map(f => f.cellType).filter(Boolean));

  const columnsArray = gridFields.map(f => {
    const type = mapFieldType(f);
    const selectionPart = f.isSelectionColumn ? ', isSelectionColumn: true' : '';
    const enumLabelsPart = ((type === 'enum' || type === 'status') && f.enumValues?.length)
      ? `, enumLabels: { ${f.enumValues.map(o => `'${o.value}': '${o.name.replace(/'/g, "\\'")}'`).join(', ')} }`
      : '';
    const labelPart = f.label ? `, label: '${f.label.replace(/'/g, "\\'")}'` : '';
    const togglePart = f.inlineToggle ? ', toggle: true' : '';
    const badgePart = (f.badge && !f.cellType) ? ', badge: true' : '';
    const badgeLabelsPart = f.badgeLabels ? `, badgeLabels: ${JSON.stringify(f.badgeLabels)}` : '';
    const badgeColorsPart = f.badgeColors ? `, badgeColors: ${JSON.stringify(f.badgeColors)}` : '';
    const badgeVariantsPart = f.badgeVariants ? `, badgeVariants: ${JSON.stringify(f.badgeVariants)}` : '';
    const enumVariantsPart = f.enumVariants ? `, enumVariants: ${JSON.stringify(f.enumVariants)}` : '';
    const labelsPart = f.labels ? `, labels: ${JSON.stringify(f.labels)}` : '';
    const summablePart = f.summable ? ', summable: true' : '';
    const displayPart = f.display ? `, display: '${f.display}'` : '';
    let renderPart = '';
    if (f.cellType === 'depreciationProgress') renderPart = ', render: renderDepreciationProgress';
    else if (f.cellType === 'taxRate') renderPart = ', render: renderTaxRate';
    else if (f.cellType === 'taxScope') renderPart = `, render: (row) => renderTaxScope(row, '${f.name}')`;
    // Flags consumed by InlineLinesPanel to drive inline-edit affordances:
    //  - required → suppress the empty option in the SelectorInput dropdown.
    //  - lookup / popup → swap the dropdown for a ProductSearchDrawer modal.
    const requiredPart = f.required ? ', required: true' : '';
    const lookupPart = f.lookup ? ', lookup: true' : '';
    const popupPart = f.popup ? ', popup: true' : '';
    return `  { key: '${f.name}', column: '${f.column}', type: '${type}'${labelsPart}${labelPart}${enumLabelsPart}${enumVariantsPart}${selectionPart}${togglePart}${badgePart}${badgeLabelsPart}${badgeColorsPart}${badgeVariantsPart}${summablePart}${displayPart}${renderPart}${requiredPart}${lookupPart}${popupPart} },`;
  }).join('\n');

  const filtersArray = searchableFields.map(f => `'${f}'`).join(', ');

  // Render helper functions for custom cell types
  const depreciationProgressHelper = neededCellTypes.has('depreciationProgress') ? `
function renderDepreciationProgress(row) {
  const pct = row.assetValue > 0
    ? Math.min(100, Math.round(((row.depreciatedValue ?? 0) / row.assetValue) * 100))
    : null;
  if (pct == null) return null;
  const color = pct === 100 ? '#10b981' : '#f59e0b';
  return (
    <div className="flex items-center gap-1.5" style={{ minWidth: 80 }}>
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: \`\${pct}%\`, background: color }} />
      </div>
      <span className="text-xs tabular-nums w-8 text-right" style={{ color: '#6b7280' }}>{pct}%</span>
    </div>
  );
}
` : '';

  const taxRateHelper = neededCellTypes.has('taxRate') ? `
function renderTaxRate(row) {
  const val = row?.rate;
  if (val == null) return '';
  return <Tag variant="green" label={\`+\${val} %\`} />;
}
` : '';

  const taxScopeHelper = neededCellTypes.has('taxScope') ? `
function TaxScopeCell({ row, fieldKey }) {
  const ui = useUI();
  const value = fieldKey ? row?.[fieldKey] : (row?.applicableTo ?? row?.salesPurchaseType);
  const showSales    = value === 'B' || value === 'S';
  const showPurchase = value === 'B' || value === 'P';
  if (!showSales && !showPurchase) return value ?? '';
  return (
    <span className="inline-flex items-center gap-1">
      {showSales    && <Tag variant="blue"   label={ui('taxScopeSales')} />}
      {showPurchase && <Tag variant="purple" label={ui('taxScopePurchase')} />}
    </span>
  );
}
` : '';

  const needsTagImport = neededCellTypes.has('taxRate') || neededCellTypes.has('taxScope');
  const tagImport = needsTagImport ? `import { Tag } from '@/components/ui/tag';\n` : '';
  const needsUiImport = neededCellTypes.has('taxScope');
  const uiImport = needsUiImport ? `import { useUI } from '@/i18n';\n` : '';

  return `import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';
${tagImport}${uiImport}${depreciationProgressHelper}${taxRateHelper}${taxScopeHelper}
${MARKERS.GENERATED_START(`columns:${entityName}`)}
const columns = [
${columnsArray}
];
${MARKERS.GENERATED_END(`columns:${entityName}`)}

const filters = [${filtersArray}];

${MARKERS.GENERATED_START(`component:${compName}`)}
const ${compName} = forwardRef(function ${compName}(props, ref) {
  // Inline-editable layout owns rendering of the existing rows. The add-line flow keeps
  // using the proven DataTable inline-add row (callouts, focus management, defaults) —
  // when addRow.active flips on, we hand off to DataTable so the user can fill the new
  // line, then return to InlineLinesPanel once addRow.active flips off again. The ref
  // is forwarded so DetailView can imperatively flush pending edits on global save.
  if (props.linesLayout === 'inlineEditable' && !props.addRow?.active) {
    return <InlineLinesPanel ref={ref} columns={columns} {...props} />;
  }
  return <DataTable columns={columns} filters={filters} {...props} />;
});

export default ${compName};
${MARKERS.GENERATED_END(`component:${compName}`)}
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
    .filter(f => f.form && f.type !== 'button' && f.visibility !== 'discarded')
    .sort((a, b) => {
      if (a.seq != null && b.seq != null) return a.seq - b.seq;
      if (a.seq != null) return -1;
      if (b.seq != null) return 1;
      return 0;
    });
  const compName = `${toJsIdentifier(entityName)}Form`;

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

  const hasCollapsed = fieldSections.some(s => s === 'collapsed');

  const fieldsArray = formFields.map((f, idx) => {
    const type = mapFormFieldType(f);
    const requiredPart = f.required ? ', required: true' : '';
    const lookupPart = f.lookup ? ', lookup: true' : '';
    const popupPart = f.popup ? ', popup: true' : '';
    const readOnlyPart = f.visibility === 'readOnly' ? ', readOnly: true' : '';
    const referencePart = f.reference ? `, reference: '${f.reference}'` : '';
    const inputModePart = f.inputMode ? `, inputMode: '${f.inputMode}'` : '';
    const dependsOnPart = f.dependsOn
      ? `, dependsOn: { field: '${f.dependsOn.field}', filterKey: '${f.dependsOn.filterKey}' }`
      : '';
    // Section classification
    const sectionPart = `, section: '${fieldSections[idx]}'`;
    // UI hints
    // Skip redundant unchecked defaults on YESNO/checkbox fields: backend NeoDefaultsService
    // already coerces missing/'N'/false to false, so emitting them only bloats generated files.
    const skipCheckboxDefault = type === 'checkbox' && (f.defaultValue === 'N' || f.defaultValue === false);
    const skipServerMacro = isEtendoSessionMacro(f.defaultValue);
    const defaultValuePart = (!skipCheckboxDefault && !skipServerMacro && f.defaultValue !== undefined && f.defaultValue !== null && f.defaultValue !== '')
      ? (typeof f.defaultValue === 'number'
          ? `, defaultValue: ${f.defaultValue}`
          : `, defaultValue: '${String(f.defaultValue).replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '')}'`)
      : '';
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
    const slotLines = [];
    const optionsPart = (type === 'select' && f.enumValues?.length)
      ? `, options: [${f.enumValues.map(o => `{ value: '${o.value}', label: '${o.name.replace(/'/g, "\\'")}' }`).join(', ')}]`
      : '';
    const formLabelPart = f.label ? `, label: '${f.label.replace(/'/g, "\\'")}'` : '';
    const valueTypePart = (type === 'select' && f.tsType === 'boolean') ? `, valueType: 'boolean'` : '';
    const fieldLine = `  { key: '${f.name}', column: '${f.column}', type: '${type}'${formLabelPart}${requiredPart}${lookupPart}${popupPart}${readOnlyPart}${sectionPart}${referencePart}${inputModePart}${dependsOnPart}${optionsPart}${valueTypePart}${defaultValuePart}${helpPart}${fieldGroupPart}${precisionPart}${displayLogicPart}${readOnlyLogicPart} },`;
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
  return <EntityForm fields={fields}${colsProp} {...props} />;
}
${hasCollapsed ? `${compName}.hasCollapsedFields = true;\n` : ''}
${MARKERS.GENERATED_END(`component:${compName}`)}
`;
}

/**
 * Generate a StatusBar component for windows with a statusBar config.
 * Returns an object with { componentCode, lucideImports } strings.
 */
function generateStatusBarComponent(headerEntity, statusBarConfig) {
  const headerName = toJsIdentifier(headerEntity);
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
  const headerName = toJsIdentifier(headerEntity);
  const detailName = detailEntity ? toJsIdentifier(detailEntity) : null;
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

  // Required form fields on the header. DetailView uses this as the default
  // gate for "+ Añadir línea" — the button only appears when all of these are
  // filled in `data`. Windows can still override with their own addLineGuard
  // prop for more complex business rules.
  const requiredHeaderFieldNames = allEntityFields
    .filter(f => f.required && f.form && f.visibility !== 'discarded' && f.visibility !== 'system')
    .map(f => f.name);
  // Built without a nested template literal (Sonar S4624): plain concat
  // around each name keeps the outer template flat.
  const quotedRequiredHeaderFields = requiredHeaderFieldNames.map(n => "'" + n + "'").join(', ');
  const requiredHeaderFieldsArray = requiredHeaderFieldNames.length > 0
    ? `[${quotedRequiredHeaderFields}]`
    : '[]';
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
      const requiresLinesPart = ovr.requiresLines ? `, requiresLines: true` : '';
      return `  { name: '${f.name}', label: '${label.replace(/'/g, "\\'")}', style: '${style}'${dlRaw}${requiresLinesPart} },`;
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
        const requiresLinesPart = ovr.requiresLines ? `, requiresLines: true` : '';
        return `  { name: '${name}', label: '${label.replace(/'/g, "\\'")}', style: '${style}'${colPart}${dlRaw}${requiresLinesPart} },`;
      }),
  ].join('\n');

  // Separate entry fields (user types) from auto-derived fields (price, tax, amount)
  // Note: discount is intentionally excluded — it is user-editable and triggers SL_Order_Amt recalculation.
  const autoPatterns = /price|tax|amount|total|cost|net/i;
  const derivedFields = detailEditableFields.filter(f =>
    autoPatterns.test(f.name) && !f.required && !f.reference
  );
  const entryFields = detailEditableFields.filter(f => !derivedFields.includes(f));
  // Include all form=false fields with a defaultValue as hidden defaults, regardless of readOnly —
  // readOnly fields like grossUnitPrice still need to be sent to the server for callout price calculation.
  const hiddenDefaultFields = detailFields.filter(f =>
    !f.form && f.defaultValue !== undefined
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
    // Include defaultValue for quantity/numeric fields so the add-line form starts with a sensible value.
    // Skip redundant unchecked defaults on YESNO/checkbox fields (backend coerces to false anyway).
    const rawDv = f.defaultValue;
    let defaultValuePart = '';
    const skipCheckboxDefault = type === 'checkbox' && (rawDv === 'N' || rawDv === false);
    const skipServerMacro = isEtendoSessionMacro(rawDv);
    if (!skipCheckboxDefault && !skipServerMacro && rawDv !== undefined && rawDv !== null && rawDv !== '') {
      const numDv = Number(rawDv);
      defaultValuePart = `, defaultValue: ${(!isNaN(numDv) && String(rawDv).trim() !== '') ? numDv : `'${String(rawDv).replace(/'/g, "\\'")}'`}`;
    }
    const forceCalloutFieldsPart = Array.isArray(f.forceCalloutFields) && f.forceCalloutFields.length > 0
      ? `, forceCalloutFields: ${JSON.stringify(f.forceCalloutFields)}`
      : '';
    return `    { key: '${f.name}', column: '${f.column}', type: '${type}'${requiredPart}${lookupPart}${labelPart}${referencePart}${inputModePart}${dependsOnPart}${defaultValuePart}${forceCalloutFieldsPart} },`;
  }).join('\n');

  const derivedArray = derivedFields.map(f => {
    const type = mapFormFieldType(f);
    const labelPart = f.label ? `, label: '${f.label}'` : '';
    const referencePart = f.reference ? `, reference: '${f.reference}'` : '';
    const inputModePart = f.inputMode ? `, inputMode: '${f.inputMode}'` : '';
    return `    { key: '${f.name}', column: '${f.column}', type: '${type}'${labelPart}${referencePart}${inputModePart} },`;
  }).join('\n');

  const hiddenDefaultsArray = hiddenDefaultFields
    .filter(f => !String(f.defaultValue).startsWith('@SQL=') && !isEtendoSessionMacro(f.defaultValue))
    .map(f => {
    const rawDefault = String(f.defaultValue);
    const parentColMatch = rawDefault.match(/^@(\w+)@$/);
    if (parentColMatch) {
      const colName = parentColMatch[1];
      const headerField = allEntityFields.find(hf => hf.column === colName);
      if (headerField) {
        return `    { key: '${f.name}', fromParent: '${headerField.name}' },`;
      }
    }
    const defaultValue = rawDefault.replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '');
    return `    { key: '${f.name}', value: '${defaultValue}' },`;
  }).join('\n');

  // API prediction config
  const apiPrediction = contract.apiPrediction;
  const apiBlock = apiPrediction
    ? `\nexport const api = ${JSON.stringify(apiPrediction, null, 2)};\n`
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
  const hideSaveStatuses = windowConfig.hideSaveStatuses ?? [];
  const hideMoreMenu = windowConfig.hideMoreMenu ?? false;
  const hideMoreDetails = windowConfig.hideMoreDetails ?? false;
  const noHeaderBorder = windowConfig.noHeaderBorder ?? false;
  const linesLayout = windowConfig.linesLayout ?? 'classic';
  const listViewOptions = windowConfig.listViewOptions ?? null;
  const listBaseFilter = windowConfig.listBaseFilter ?? null;
  const quickFilters = windowConfig.quickFilters ?? null;
  const subsetFilters = windowConfig.subsetFilters ?? null;
  const dateFilterKey = windowConfig.dateFilterKey ?? null;
  const contentBg = windowConfig.contentBg ?? null;
  const hideListFilters = windowConfig.hideListFilters ?? false;
  const hideLink = windowConfig.hideLink ?? false;
  const hideEyeCount = windowConfig.hideEyeCount ?? false;
  const customComponents = windowConfig.customComponents ?? {};
  const menuActionsConfig = windowConfig.menuActions ?? [];
  const newActionsConfig = windowConfig.newActions ?? [];
  const statusBar = windowConfig.statusBar ?? null;
  const detailSortBy = windowConfig.detailSortBy ?? null;
  const titleField = windowConfig.titleField ?? null;
  const salesTheme = windowConfig.salesTheme ?? false;
  const lineEntityConfig = windowConfig.lineEntityConfig ?? null;

  // Detect secondary child entities for additional tabs
  const secondaryTabsDecl = windowConfig.secondaryTabs;
  let secondaryTabDefs;

  if (secondaryTabsDecl) {
    // Declarative config from decisions.json — sorted by tabOrder
    secondaryTabDefs = Object.entries(secondaryTabsDecl)
      .sort((a, b) => (a[1].tabOrder ?? 99) - (b[1].tabOrder ?? 99))
      .map(([key, cfg]) => {
        const isFormTab = cfg.tabMode === 'form-only';
        const isPanelTab = !!cfg.customPanel;
        const PanelName = cfg.customPanel ?? null;
        const FormName = cfg.customForm ?? `${toJsIdentifier(key)}Form`;
        const TableName = cfg.customTable ?? `${toJsIdentifier(key)}Table`;
        const addLineFieldKeys = cfg.addLineFields ?? [];
        const requireSavedRecord = cfg.requireSavedRecord === true;
        const customAddModalName = cfg.customAddModal ?? null;
        const entityFields = contract.frontendContract.entities[key]?.fields ?? [];
        const addLineEntries = addLineFieldKeys.map(fk => {
          const f = entityFields.find(ef => ef.name === fk);
          if (!f) return null;
          const type = mapFormFieldType(f);
          const requiredPart = f.required ? ', required: true' : '';
          const labelPart = f.label ? `, label: '${f.label}'` : '';
          const referencePart = f.reference ? `, reference: '${f.reference}'` : '';
          const inputModePart = f.inputMode ? `, inputMode: '${f.inputMode}'` : '';
          // Skip redundant unchecked defaults on YESNO/checkbox fields (backend coerces to false anyway).
          const skipCheckboxDefault = type === 'checkbox' && (f.defaultValue === 'N' || f.defaultValue === false);
          const defaultValuePart = (!skipCheckboxDefault && f.defaultValue) ? `, defaultValue: '${String(f.defaultValue).replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '')}'` : '';
          const optionsPart = (type === 'select' && f.enumValues?.length)
            ? `, options: [${f.enumValues.map(o => `{ value: '${o.value}', label: '${o.name.replace(/'/g, "\\'")}' }`).join(', ')}]`
            : '';
          return `          { key: '${fk}', column: '${f.column}', type: '${type}'${requiredPart}${labelPart}${referencePart}${inputModePart}${defaultValuePart}${optionsPart} }`;
        }).filter(Boolean);
        return { key, label: cfg.label ?? toLabel(key), isFormTab, isPanelTab, isCustomForm: !!cfg.customForm, isCustomTable: !!cfg.customTable, PanelName, FormName, TableName, addLineEntries, requireSavedRecord, isCustomAddModal: !!customAddModalName, CustomAddModalName: customAddModalName };
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
        TableName: `${toJsIdentifier(name)}Table`,
        FormName: `${toJsIdentifier(name)}Form`,
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
      if (t.isPanelTab && specName) {
        return `import ${t.PanelName} from ${resolveCustomImport(specName, t.PanelName)};`;
      }
      const formImportPath = (t.isCustomForm && specName)
        ? resolveCustomImport(specName, t.FormName).replace(/'/g, '')
        : `./${t.FormName}`;
      const tableImportPath = (t.isCustomTable && specName)
        ? resolveCustomImport(specName, t.TableName).replace(/'/g, '')
        : `./${t.TableName}`;
      const customModalImport = (t.isCustomAddModal && specName)
        ? `\nimport ${t.CustomAddModalName} from ${resolveCustomImport(specName, t.CustomAddModalName)};`
        : '';
      if (t.isFormTab) {
        return `import ${t.FormName} from '${formImportPath}';${customModalImport}`;
      }
      const formImport = (t.isCustomAddModal && !t.isCustomForm) ? '' : `\nimport ${t.FormName} from '${formImportPath}';`;
      return `import ${t.TableName} from '${tableImportPath}';${formImport}${customModalImport}`;
    })
    .join('\n');

  const secondaryTabsPropEntries = secondaryTabDefs.map(t => {
    const requireSavedPart = t.requireSavedRecord ? ', requireSavedRecord: true' : '';
    if (t.isFormTab) {
      return `          { key: '${t.key}', label: '${t.label}', isFormTab: true, Form: ${t.FormName}${requireSavedPart} },`;
    }
    if (t.isPanelTab) {
      return `          { key: '${t.key}', label: '${t.label}', Panel: ${t.PanelName}${requireSavedPart} },`;
    }
    const addLinePart = t.addLineEntries.length > 0
      ? `, addLineFields: { entry: [\n${t.addLineEntries.join(',\n')},\n          ], derived: [], hidden: [] }`
      : '';
    const customAddModalPart = t.CustomAddModalName ? `, customAddModal: ${t.CustomAddModalName}` : '';
    const formProp = (t.isCustomAddModal && !t.isCustomForm) ? '' : `, Form: ${t.FormName}`;
    return `          { key: '${t.key}', label: '${t.label}', Table: ${t.TableName}${formProp}${addLinePart}${customAddModalPart}${requireSavedPart} },`;
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

  // hidePrint prop (DetailView)
  const hidePrintProp = hidePrint ? '\n        hidePrint' : '';
  // hideSaveStatuses prop (DetailView)
  const hideSaveStatusesProp = hideSaveStatuses.length > 0
    ? `\n        hideSaveStatuses={${JSON.stringify(hideSaveStatuses)}}`
    : '';
  // hideMoreMenu prop (DetailView)
  const hideMoreMenuProp = hideMoreMenu ? '\n        hideMoreMenu' : '';
  // hideMoreDetails prop (DetailView)
  const hideMoreDetailsProp = hideMoreDetails ? '\n        hideMoreDetails' : '';
  // noHeaderBorder prop (DetailView)
  const noHeaderBorderProp = noHeaderBorder ? '\n        noHeaderBorder' : '';
  // linesLayout prop (DetailView). Only emit when non-default to keep generated
  // output diff-free for windows that don't opt in.
  const linesLayoutProp = linesLayout && linesLayout !== 'classic'
    ? `\n        linesLayout="${linesLayout}"`
    : '';
  // listViewOptions props
  const listViewOptionsProp = listViewOptions
    ? `\n      listViewOptions={${JSON.stringify(listViewOptions)}}`
    : '';
  const listBaseFilterProp = listBaseFilter
    ? `\n      baseFilter="${listBaseFilter}"`
    : '';
  const quickFiltersProp = quickFilters
    ? `\n      quickFilters={${JSON.stringify(quickFilters)}}`
    : '';
  const subsetFiltersProp = subsetFilters
    ? `\n      subsetFilters={${JSON.stringify(subsetFilters)}}`
    : '';
  const dateFilterKeyProp = dateFilterKey
    ? `\n      dateFilterKey="${dateFilterKey}"`
    : '';
  // contentBg prop
  const contentBgProp = contentBg ? `\n        contentBg="${contentBg}"` : '';
  // lineConfig prop — emitted when the window uses a non-default line pricing config
  const LINE_CONFIG_SYMBOLS = { invoice: 'INVOICE_LINE_CONFIG', returnOrder: 'RETURN_ORDER_LINE_CONFIG' };
  const lineConfigSymbol = lineEntityConfig ? (LINE_CONFIG_SYMBOLS[lineEntityConfig] ?? null) : null;
  const lineConfigProp = lineConfigSymbol ? `\n        lineConfig={${lineConfigSymbol}}` : '';
  // ListView toolbar props
  const hidePrintListProp = hidePrint ? '\n      hidePrint' : '';
  const hideMoreMenuListProp = hideMoreMenu ? '\n      hideMoreMenu' : '';
  const hideListFiltersProp = hideListFilters ? '\n      hideListFilters' : '';
  const hideLinkProp = hideLink ? '\n      hideLink' : '';
  const hideEyeCountProp = hideEyeCount ? '\n      hideEyeCount' : '';

  // Custom component props (bottomSection, topbarRight)
  const customComponentImports = [];
  const customComponentProps = [];
  if (customComponents.bottomSection) {
    customComponentImports.push(`import ${customComponents.bottomSection} from ${resolveCustomImport(specName, customComponents.bottomSection)};`);
    customComponentProps.push(`\n        bottomSection={${customComponents.bottomSection}}`);
  }
  if (customComponents.topbarRight) {
    customComponentImports.push(`import ${customComponents.topbarRight} from ${resolveCustomImport(specName, customComponents.topbarRight)};`);
    customComponentProps.push(`\n        topbarRight={${customComponents.topbarRight}}`);
  }
  if (customComponents.topbarExtra) {
    customComponentImports.push(`import ${customComponents.topbarExtra} from ${resolveCustomImport(specName, customComponents.topbarExtra)};`);
    customComponentProps.push(`\n        topbarExtra={${customComponents.topbarExtra}}`);
  }
  if (customComponents.bulkActions) {
    customComponentImports.push(`import ${customComponents.bulkActions} from ${resolveCustomImport(specName, customComponents.bulkActions)};`);
  }
  if (customComponents.sidePanel) {
    customComponentImports.push(`import ${customComponents.sidePanel} from ${resolveCustomImport(specName, customComponents.sidePanel)};`);
    customComponentProps.push(`\n        sidePanel={${customComponents.sidePanel}}`);
    if (customComponents.sidePanelStyle) {
      customComponentProps.push(`\n        sidePanelStyle={${JSON.stringify(customComponents.sidePanelStyle)}}`);
    }
  }
  if (customComponents.moreMenuContent) {
    customComponentImports.push(`import ${customComponents.moreMenuContent} from ${resolveCustomImport(specName, customComponents.moreMenuContent)};`);
    customComponentProps.push(`\n        customMenuContent={${customComponents.moreMenuContent}}`);
  }
  if (customComponents.newRecordComponent) {
    customComponentImports.push(`import ${customComponents.newRecordComponent} from ${resolveCustomImport(specName, customComponents.newRecordComponent)};`);
  }
  // newActions — import component modals if declared
  const newActionsWithComponents = newActionsConfig.filter(a => a.component);
  for (const action of newActionsWithComponents) {
    customComponentImports.push(`import ${action.component} from ${resolveCustomImport(specName, action.component)};`);
  }
  const customCompImportBlock = customComponentImports.length > 0
    ? customComponentImports.join('\n') + '\n'
    : '';
  const customCompPropsBlock = customComponentProps.join('');

  // Custom headerTable override
  const customHeaderTable = customComponents.headerTable ?? null;
  const headerTableImport = customHeaderTable
    ? `import ${headerName}Table from ${resolveCustomImport(specName, customHeaderTable)};`
    : `import ${headerName}Table from './${headerName}Table';`;

  // menuActions prop
  const menuActionsNeedsData = menuActionsConfig.some(a => a.visibleWhenFieldFalse);
  const menuActionsFnParams = menuActionsNeedsData ? '({ data, status })' : '({ status })';
  const menuActionsProp = menuActionsConfig.length > 0
    ? `\n        menuActions={${menuActionsFnParams} => [\n${menuActionsConfig.map(a => {
        const statusVis = a.visibleWhenStatus
          ? Array.isArray(a.visibleWhenStatus)
            ? `${JSON.stringify(a.visibleWhenStatus)}.includes(status)`
            : `status === '${a.visibleWhenStatus}'`
          : '';
        const fieldVis = a.visibleWhenFieldFalse ? `!data?.${a.visibleWhenFieldFalse}` : '';
        const visParts = [statusVis, fieldVis].filter(Boolean);
        const vis = visParts.length > 0 ? `visible: ${visParts.join(' && ')}, ` : '';
        const destr = a.destructive ? 'destructive: true, ' : '';
        // Handler precedence: documentAction (declarative DocAction) > columnName (AD process button) > onClick placeholder
        let handler;
        if (a.documentAction) {
          handler = `documentAction: '${a.documentAction}', `;
        } else if (a.columnName) {
          handler = `columnName: '${a.columnName}', `;
        } else {
          handler = `onClick: () => {},`;
        }
        const labelKeyPart = a.labelKey ? `labelKey: '${a.labelKey}', ` : '';
        const successPart = a.successKey
          ? `successKey: '${a.successKey}', `
          : a.successMessage ? `successMessage: '${String(a.successMessage).replace(/'/g, "\\'")}', ` : '';
        return `          { key: '${a.key}', label: '${a.label}', ${destr}${vis}${labelKeyPart}${successPart}${handler} }`;
      }).join(',\n')}\n        ]}`
    : '';

  // Build optional import for RelatedDocuments
  const relatedDocsImport = relatedDocuments
    ? `import RelatedDocuments from ${resolveCustomImport(specName, 'RelatedDocuments')};\n`
    : '';

  // Draft mode config from frontend contract
  const draftModeConfig = contract.frontendContract.entities[headerEntity]?.draftMode;
  const draftModeValue = draftModeConfig?.enabled
    ? JSON.stringify(draftModeConfig, null, 2)
    : 'null';
  const draftModeProp = draftModeConfig?.enabled ? '\n        draftMode={draftMode}' : '';
  const requiredHeaderFieldsProp = requiredHeaderFieldNames.length > 0
    ? '\n        requiredHeaderFields={requiredHeaderFields}'
    : '';

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
            apiBaseUrl={props.apiBaseUrl}
          />
        )}`
    : '';

  // detailSortBy prop
  const detailSortByProp = detailSortBy ? `\n        detailSortBy="${detailSortBy}"` : '';

  // titleField prop
  const titleFieldProp = titleField ? `\n        titleField="${titleField}"` : '';

  // salesTheme prop
  const salesThemeProp = salesTheme ? '\n        salesTheme' : '';

  // listKpiCards → headerContent prop in ListView
  const listKpiCardsConfig = windowConfig.listKpiCards ?? null;
  let listKpiCardsImport = '';
  let listKpiCardsProp = '';
  if (listKpiCardsConfig?.customComponent && specName) {
    const kpiComp = listKpiCardsConfig.customComponent;
    listKpiCardsImport = `import ${kpiComp} from ${resolveCustomImport(specName, kpiComp)};\n`;
    listKpiCardsProp = `\n      headerContent={(p) => <${kpiComp} {...p} />}`;
  }

  // bulkActions → render function prop in ListView
  const bulkActionsProp = customComponents.bulkActions
    ? `\n      bulkActions={(ctx) => <${customComponents.bulkActions} {...ctx} />}`
    : '';

  // headerExtra → formFooter prop
  const headerExtraConfig = windowConfig.headerExtra ?? null;
  let formFooterImport = '';
  let formFooterProp = '';
  if (headerExtraConfig?.customForm && specName) {
    const compName = headerExtraConfig.customForm;
    formFooterImport = `import ${compName} from ${resolveCustomImport(specName, compName)};\n`;
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
        imports.push(`import ${tab.panel} from ${resolveCustomImport(specName, tab.panel)};`);
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

  // disableProcessedLock support
  const disableProcessedLockProp = windowConfig.disableProcessedLock ? `\n        lockWhenProcessed={false}` : '';

  // statusEnumLabels support
  const statusEnumLabelsConfig = windowConfig.statusEnumLabels ?? null;
  const statusEnumLabelsProp = statusEnumLabelsConfig
    ? `\n        statusEnumLabels={${JSON.stringify(statusEnumLabelsConfig)}}`
    : '';

  // showDetailFooterTotals support
  const showDetailFooterTotalsValue = windowConfig.showDetailFooterTotals;
  const showDetailFooterTotalsProp = showDetailFooterTotalsValue !== undefined
    ? `\n        showDetailFooterTotals={${showDetailFooterTotalsValue}}`
    : '';

  // labelOverrides support
  const labelOverridesConfig = windowConfig.labelOverrides ?? null;
  const labelOverridesProp = labelOverridesConfig ? '\n        labelOverrides={labelOverrides}' : '';
  const labelOverridesListProp = labelOverridesConfig ? '\n      labelOverrides={labelOverrides}' : '';
  const labelOverridesBlock = labelOverridesConfig
    ? `\nconst labelOverrides = ${JSON.stringify(labelOverridesConfig, null, 2)};\n`
    : '';

  // newActions support — split button dropdown on the list view
  const hasNewActions = newActionsConfig.length > 0;
  const newActionsStatements = newActionsWithComponents.map(a => {
    const stateName = `show${capitalize(a.key.replace(/-./g, m => m[1].toUpperCase()))}Modal`;
    return `  const [${stateName}, set${capitalize(a.key.replace(/-./g, m => m[1].toUpperCase()))}Modal] = useState(false);`;
  }).join('\n');
  const newActionsPropValue = hasNewActions
    ? `\n      newActions={[${newActionsConfig.map(a => {
        const hasComp = !!a.component;
        const stateSetter = hasComp
          ? `set${capitalize(a.key.replace(/-./g, m => m[1].toUpperCase()))}Modal`
          : null;
        const onClick = hasComp
          ? `() => ${stateSetter}(true)`
          : `() => {}`;
        return `\n        { key: '${a.key}', label: '${a.label}', onClick: ${onClick} }`;
      }).join(',')}\n      ]}`
    : '';
  const newActionsModals = newActionsWithComponents.map(a => {
    const stateName = `show${capitalize(a.key.replace(/-./g, m => m[1].toUpperCase()))}Modal`;
    const setterName = `set${capitalize(a.key.replace(/-./g, m => m[1].toUpperCase()))}Modal`;
    return `    {${stateName} && <${a.component} token={props.token} apiBaseUrl={props.apiBaseUrl} windowName={windowName} onClose={() => ${setterName}(false)} />}`;
  }).join('\n');

  const needsUseState = customComponents.newRecordComponent || newActionsWithComponents.length > 0;
  const needsFragment = customComponents.newRecordComponent || newActionsWithComponents.length > 0;

  return `import { ${needsUseState ? 'useState, ' : ''}useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';${menuActionsConfig.length > 0 ? `\nimport { toast } from 'sonner';` : ''}${lineConfigSymbol ? `\nimport { ${lineConfigSymbol} } from '@/hooks/useLineGrossAmount';` : ''}
${headerTableImport}
import ${headerName}Form from './${headerName}Form';${detailEntity ? `
import ${detailName}Table from './${detailName}Table';
import ${detailName}Form from './${detailName}Form';` : ''}
${secondaryTabDefs.length > 0 ? `${secondaryTabsImports}\n` : ''}${formFooterImport}${primaryTabsImports}${listKpiCardsImport}${relatedDocsImport}${customCompImportBlock}import catalogs from './mockCatalogs';
${isGallery ? `import ${headerName}Gallery from ${resolveCustomImport(specName || headerEntity, `${headerName}Gallery`)};` : ''}${isSidebar ? `
import ${headerName}Sidebar from ${resolveCustomImport(specName || headerEntity, `${headerName}Sidebar`)};` : (isGallery ? `
import ${headerName}DetailHeader from ${resolveCustomImport(specName || headerEntity, `${headerName}DetailHeader`)};` : '')}${statusBarImport}

const breadcrumb = '${windowBreadcrumbOverride !== undefined ? windowBreadcrumbOverride : `${windowCategory} / ${windowLabel}`}';
${labelOverridesBlock}${statusBarCode}

${MARKERS.GENERATED_START(`summary:${headerEntity}`)}
const summary = [
${summaryArray}
];

const statusField = ${statusFieldLine};
${MARKERS.GENERATED_END(`summary:${headerEntity}`)}

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

${MARKERS.GENERATED_START(`requiredHeaderFields:${headerEntity}`)}
const requiredHeaderFields = ${requiredHeaderFieldsArray};
${MARKERS.GENERATED_END(`requiredHeaderFields:${headerEntity}`)}

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
export default function ${compName}({ windowName, recordId, ...props }) {${customComponents.newRecordComponent ? `
  const [showNewModal, setShowNewModal] = useState(false);` : ''}${newActionsWithComponents.length > 0 ? `\n${newActionsStatements}` : ''}
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
        breadcrumb={breadcrumb}${apiProp}${detailTabIndexProp}${secondaryTabsProp}${formFooterProp}${primaryTabsProp}${othersLabelProp}${documentPreviewProp}${hideDeleteProp}${hidePrintProp}${hideSaveStatusesProp}${hideMoreMenuProp}${hideMoreDetailsProp}${noHeaderBorderProp}${contentBgProp}${notesFieldProp}${customTabsProp}${customCompPropsBlock}${menuActionsProp}${draftModeProp}${requiredHeaderFieldsProp}${headerContentProp}${detailSortByProp}${titleFieldProp}${salesThemeProp}${disableProcessedLockProp}${statusEnumLabelsProp}${showDetailFooterTotalsProp}${labelOverridesProp}${lineConfigProp}${linesLayoutProp}
        {...props}${sidebarContentProp}
      />
    );
  }

  return (${needsFragment ? `
    <>` : ''}
    <ListView
      entity="${headerEntity}"
      Table={${headerName}Table}
      entityLabel="${windowConfig.name || entityLabel}"
      windowName={windowName}
      breadcrumb={breadcrumb}${apiProp}${isGallery ? `
      galleryRenderer={(gProps) => <${headerName}Gallery {...gProps} />}` : ''}${listKpiCardsProp}${listViewOptionsProp}${listBaseFilterProp}${quickFiltersProp}${subsetFiltersProp}${dateFilterKeyProp}${bulkActionsProp}${hidePrintListProp}${hideMoreMenuListProp}${hideListFiltersProp}${hideLinkProp}${hideEyeCountProp}${labelOverridesListProp}
      {...props}${customComponents.newRecordComponent ? `
      onNew={() => setShowNewModal(true)}` : ''}${newActionsPropValue}
    />${customComponents.newRecordComponent ? `
    {showNewModal && <${customComponents.newRecordComponent} token={props.token} apiBaseUrl={props.apiBaseUrl} windowName={windowName} onClose={() => setShowNewModal(false)} />}` : ''}${newActionsWithComponents.length > 0 ? `\n${newActionsModals}` : ''}${needsFragment ? `
    </>` : ''}
  );
}
${MARKERS.GENERATED_END(`component:${compName}`)}
`;
}

/**
 * Generate the entry point / index component.
 * Accepts { token, apiBaseUrl, window } props.
 */
export function generateIndexComponent(headerEntity, detailEntity, contract) {
  const headerName = toJsIdentifier(headerEntity);
  const category = contract?.frontendContract?.window?.category ?? 'general';
  const windowName = contract?.frontendContract?.window?.name ?? toLabel(headerEntity);
  const apiPrediction = contract?.apiPrediction;

  const apiProp = apiPrediction ? ' api={api}' : '';
  const apiImport = apiPrediction ? `, { api }` : '';
  return `import ${headerName}Page${apiImport} from './${headerName}Page';

const windowMeta = { category: '${category}', name: '${windowName}' };

${MARKERS.GENERATED_START('component:App')}
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <${headerName}Page windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta}${apiProp} {...rest} />;
}
${MARKERS.GENERATED_END('component:App')}
`;
}

/**
 * Generate a mockCatalogs.js stub.
 *
 * Historically this emitted fake FK reference data (e.g. "Acme Corp", "Wire Transfer")
 * as a fallback for selector dropdowns. Those fakes leaked into production UIs and
 * caused a visible "flash of wrong values" when opening a dropdown before the real
 * `/selector` response arrived. The file is kept (still imported by HeaderPage.jsx)
 * but now exports an empty catalog — all selector data comes from the real backend.
 */
export function generateMockCatalogs(_contract) {
  return [
    '// Auto-generated - intentionally empty. Selector data comes from the real backend.',
    '',
    'const catalogs = {};',
    '',
    'export default catalogs;',
    '',
  ].join('\n');
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
    const capName = toJsIdentifier(entityName);
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
