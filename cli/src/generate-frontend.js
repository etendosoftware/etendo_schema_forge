import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { MARKERS } from './custom-section-markers.js';
import { convertLogicToJs } from './generate-contract.js';

const FRONTEND_ACTION_PROJECTION = [
  ['entity', 'entity'],
  ['field', 'field'],
  ['column', 'column'],
  ['url', 'url'],
  ['processId', 'processId'],
  ['processType', 'processType'],
];

function projectActionForFrontend(action) {
  const result = {};
  for (const [targetKey, sourceKey] of FRONTEND_ACTION_PROJECTION) {
    if (action?.[sourceKey] !== undefined) result[targetKey] = action[sourceKey];
  }
  return result;
}

export function projectApiPredictionForFrontend(apiPrediction) {
  if (!apiPrediction) return apiPrediction;
  return {
    ...apiPrediction,
    actions: (apiPrediction.actions ?? []).map(projectActionForFrontend),
  };
}

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
  if (existsSync(resolve(`tools/app-shell/src/windows/custom/shared/${component}.jsx`))) {
    return `'@/windows/custom/shared/${component}'`;
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
  return capped
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_$]/g, '');
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
  if (field.explicitType) return field.type;
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

function optProp(name, val) {
  return val !== undefined ? `, ${name}: ${val}` : '';
}

/**
 * Return `fragment` when `cond` is truthy, otherwise an empty string.
 * Used to conditionally append optional prop fragments to generated code.
 */
export function fragmentIf(cond, fragment) {
  return cond ? fragment : '';
}

/**
 * Serialize the inline-create props (`createLabelKey`, `createSpec`, `createEntity`)
 * for an `allowCreate` FK selector. These tell EntityForm where to POST a new record
 * created on the fly (e.g. match-rule transaction type → ETGO_Transaction_Type) and
 * which i18n key labels the "+ create" action. Emitted only when the field opts in.
 */
export function buildInlineCreatePart(f) {
  if (!f.allowCreate) return '';
  const esc = (v) => String(v).replace(/'/g, "\\'");
  let out = '';
  if (f.createLabelKey) out += `, createLabelKey: '${esc(f.createLabelKey)}'`;
  if (f.createTitleKey) out += `, createTitleKey: '${esc(f.createTitleKey)}'`;
  if (f.createNamePlaceholderKey) out += `, createNamePlaceholderKey: '${esc(f.createNamePlaceholderKey)}'`;
  if (f.createSpec) out += `, createSpec: '${esc(f.createSpec)}'`;
  if (f.createEntity) out += `, createEntity: '${esc(f.createEntity)}'`;
  return out;
}

/**
 * Return `${prefix}${value}${suffix}` when the gate is truthy, otherwise an
 * empty string. Used to build optional JSX props whose injected content is the
 * value itself (e.g. `name="value"` or `name={value}`). The parameter order
 * mirrors the produced string, keeping call sites readable.
 *
 * By default the gate IS `value` (the common case: emit only when there is a
 * value). Pass `cond` to gate on a custom expression while still injecting
 * `value` — for props where the condition differs from the value, e.g.
 * `wrapIf('\n  tabIndex={', idx, '}', idx != null)` (must emit when idx === 0).
 */
export function wrapIf(prefix, value, suffix = '', cond = value) {
  return cond ? `${prefix}${value}${suffix}` : '';
}

/**
 * Like {@link wrapIf}, but serializes `value` with `JSON.stringify` — for
 * optional expression props such as `name={${JSON.stringify(value)}}`. Accepts
 * the same optional `cond` gate (e.g. `arr.length > 0` so empty arrays, which
 * are truthy, are not emitted).
 */
export function jsonWrapIf(prefix, value, suffix = '', cond = value) {
  return cond ? `${prefix}${JSON.stringify(value)}${suffix}` : '';
}

/**
 * Return `whenTrue` when `cond` is truthy, otherwise `whenFalse`. A binary
 * choice between two ready values — moves the ternary out of the calling
 * function to keep cognitive complexity down.
 *
 * IMPORTANT: both branches are evaluated eagerly (it's a plain function call,
 * not a lazy `?:`). Use ONLY with cheap, side-effect-free values that are safe
 * to compute unconditionally — typically string literals. For branches that
 * interpolate possibly-null values or call functions, keep the ternary.
 */
export function pick(cond, whenTrue, whenFalse) {
  return cond ? whenTrue : whenFalse;
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
    const selectionPart = fragmentIf(f.isSelectionColumn, ', isSelectionColumn: true');
    const enumLabelsPart = ((type === 'enum' || type === 'status') && f.enumValues?.length)
      ? `, enumLabels: { ${f.enumValues.map(o => `'${o.value}': '${o.name.replace(/'/g, "\\'")}'`).join(', ')} }`
      : '';
    const labelPart = f.label ? `, label: '${f.label.replace(/'/g, "\\'")}'` : '';
    const togglePart = fragmentIf(f.inlineToggle, ', toggle: true');
    const badgePart = fragmentIf(f.badge && !f.cellType, ', badge: true');
    const badgeLabelsPart = jsonWrapIf(', badgeLabels: ', f.badgeLabels);
    const badgeColorsPart = jsonWrapIf(', badgeColors: ', f.badgeColors);
    const badgeVariantsPart = jsonWrapIf(', badgeVariants: ', f.badgeVariants);
    const enumVariantsPart = jsonWrapIf(', enumVariants: ', f.enumVariants);
    const labelsPart = jsonWrapIf(', labels: ', f.labels);
    const summablePart = fragmentIf(f.summable, ', summable: true');
    const displayPart = wrapIf(", display: '", f.display, "'");
    let renderPart = '';
    if (f.cellType === 'depreciationProgress') renderPart = ', render: renderDepreciationProgress';
    else if (f.cellType === 'taxRate') renderPart = ', render: renderTaxRate';
    else if (f.cellType === 'taxScope') renderPart = `, render: (row) => <TaxScopeCell row={row} fieldKey="${f.name}" />`;
    // Flags consumed by InlineLinesPanel to drive inline-edit affordances:
    //  - required → suppress the empty option in the SelectorInput dropdown.
    //  - lookup / popup → swap the dropdown for a ProductSearchDrawer modal.
    const requiredPart = fragmentIf(f.required, ', required: true');
    const lookupPart = fragmentIf(f.lookup, ', lookup: true');
    const popupPart = fragmentIf(f.popup, ', popup: true');
    const minColPart = optProp('min', f.min);
    const growPart = fragmentIf(f.grow, ', grow: true');
    const columnWidthPart = optProp('minWidth', f.columnWidth);
    const noTrailingPart = fragmentIf(f.noTrailing, ', noTrailing: true');
    const filterOnlyPart = fragmentIf((f.filterOnly || f.filterable === false), ', filterable: false');
    const dotPart = fragmentIf(f.dot === false, ', dot: false');
    const gridReadOnlyPart = fragmentIf(f.gridReadOnly, ', readOnly: true');
    return `  { key: '${f.name}', column: '${f.column}', type: '${type}'${labelsPart}${labelPart}${enumLabelsPart}${enumVariantsPart}${selectionPart}${togglePart}${badgePart}${badgeLabelsPart}${badgeColorsPart}${badgeVariantsPart}${summablePart}${displayPart}${renderPart}${requiredPart}${lookupPart}${popupPart}${minColPart}${growPart}${columnWidthPart}${noTrailingPart}${filterOnlyPart}${dotPart}${gridReadOnlyPart} },`;
  }).join('\n');

  const filtersArray = searchableFields.map(f => `'${f}'`).join(', ');

  // Render helper functions for custom cell types
  const depreciationProgressHelper = neededCellTypes.has('depreciationProgress') ? `
function renderDepreciationProgress(row) {
  const pct = row.etgoAmortizationStatus ?? null;
  if (pct == null || pct === 0) return null;
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
  if (val > 0)  return <Tag variant="green"   label={\`+\${val} %\`} />;
  if (val === 0) return <Tag variant="neutral" label="0 %" />;
  return <Tag variant="red" label={\`\${val} %\`} />;
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
  // Inline-editable layout always uses InlineLinesPanel for existing rows so column
  // widths (flex layout) never shift when the add-row form opens. When addRow is
  // active we render a header-hidden, data-hidden DataTable below for just the
  // add-row form — it owns callouts, selectors, validation and the imperative flush
  // ref. The ref is forwarded to InlineLinesPanel so DetailView can flush pending
  // inline edits on global save.
  if (props.linesLayout === 'inlineEditable') {
    if (props.addRow?.active) {
      return (
        <>
          <InlineLinesPanel ref={ref} columns={columns} {...props} addRow={undefined} />
          <DataTable columns={columns} filters={filters} {...props} hideHeader hideDataRows />
        </>
      );
    }
    return <InlineLinesPanel ref={ref} columns={columns} {...props} />;
  }
  return <DataTable columns={columns} filters={filters} {...props} />;
});

export default ${compName};
${MARKERS.GENERATED_END(`component:${compName}`)}
`;
}

function getDefaultValuePart(skipCheckboxDefault, skipServerMacro, f) {
  if (typeof f.defaultValue === 'number') {
    if (!skipCheckboxDefault && !skipServerMacro && f.defaultValue !== undefined && f.defaultValue !== null && f.defaultValue !== '') {
      return `, defaultValue: ${f.defaultValue}`;
    } else {
      return '';
    }
  } else {
    if (!skipCheckboxDefault && !skipServerMacro && f.defaultValue !== undefined && f.defaultValue !== null && f.defaultValue !== '') {
      return `, defaultValue: '${String(f.defaultValue).replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '')}'`;
    } else {
      return '';
    }
  }
}

function buildDisplayLogicPart(f) {
  let displayLogicPart = '';
  if (f.displayLogic) {
    if (f.displayLogic.js) {
      displayLogicPart = `, displayLogic: (record) => ${f.displayLogic.js}`;
    } else if (f.displayLogic.evaluable === false) {
      displayLogicPart = `, visible: null, visibilitySource: 'server', displayLogicReason: '${f.displayLogic.reason || 'unknown'}'`;
    }
  }
  return displayLogicPart;
}

function buildReadOnlyLogicPart(f) {
  let readOnlyLogicPart = '';
  if (f.readOnlyLogic) {
    if (f.readOnlyLogic.evaluable === false) {
      readOnlyLogicPart = `, readOnlySource: 'server', readOnlyLogicReason: '${f.readOnlyLogic.reason || 'unknown'}'`;
    } else if (f.readOnlyLogic.js) {
      readOnlyLogicPart = `, readOnlyLogic: (record) => ${f.readOnlyLogic.js}`;
    }
  }
  return readOnlyLogicPart;
}

function getS(o) {
  return `{ value: '${o.value}', label: '${o.name.replace(/'/g, "\\'")}' }`;
}

function getOptionsPart(type, f) {
  if (type === 'select' && f.enumValues?.length) {
    return `, options: [${f.enumValues.map(o => getS(o)).join(', ')}]`;
  } else {
    return '';
  }
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
    const requiredPart = fragmentIf(f.required, ', required: true');
    const lookupPart = fragmentIf(f.lookup, ', lookup: true');
    const popupPart = fragmentIf(f.popup, ', popup: true');
    const readOnlyPart = fragmentIf(f.visibility === 'readOnly', ', readOnly: true');
    const inlinePart = fragmentIf(f.inline, ', inline: true');
    const referencePart = wrapIf(", reference: '", f.reference, "'");
    const inputModePart = wrapIf(", inputMode: '", f.inputMode, "'");
    const searchSelectPart = fragmentIf(f.searchSelect, ', searchSelect: true');
    const allowCreatePart = fragmentIf(f.allowCreate, ', allowCreate: true');
    const createPart = buildInlineCreatePart(f);
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
    const defaultValuePart = getDefaultValuePart(skipCheckboxDefault, skipServerMacro, f);
    const helpPart = f.help ? `, help: '${f.help.replace(/'/g, "\\'")}'` : '';
    const placeholderPart = f.placeholderKey ? `, placeholderKey: '${f.placeholderKey.replace(/'/g, "\\'")}'` : '';
    const emptyOptionPart = f.emptyOptionLabelKey ? `, emptyOptionLabelKey: '${f.emptyOptionLabelKey.replace(/'/g, "\\'")}'` : '';
    const fieldGroupPart = f.fieldGroup ? `, fieldGroup: '${f.fieldGroup.replace(/'/g, "\\'")}'` : '';
    const precisionPart = wrapIf(', precision: ', f.precision);
    // Behavioral metadata: displayLogic and readOnlyLogic
    let displayLogicPart = buildDisplayLogicPart(f);
    let readOnlyLogicPart = buildReadOnlyLogicPart(f);
    const slotLines = [];
    const optionsPart = getOptionsPart(type, f);
    const formLabelPart = f.label ? `, label: '${f.label.replace(/'/g, "\\'")}'` : '';
    const valueTypePart = (type === 'select' && f.tsType === 'boolean') ? `, valueType: 'boolean'` : '';
    const spanPart = (f.span && f.span > 1) ? `, span: ${f.span}` : '';
    const rowsPart = f.rows != null ? `, rows: ${f.rows}` : '';
    const clearablePart = f.clearable === false ? ', clearable: false' : '';
    const fieldLine = `  { key: '${f.name}', column: '${f.column}', type: '${type}'${formLabelPart}${requiredPart}${lookupPart}${popupPart}${readOnlyPart}${inlinePart}${sectionPart}${referencePart}${inputModePart}${searchSelectPart}${allowCreatePart}${createPart}${dependsOnPart}${optionsPart}${valueTypePart}${defaultValuePart}${helpPart}${placeholderPart}${emptyOptionPart}${fieldGroupPart}${precisionPart}${displayLogicPart}${readOnlyLogicPart}${spanPart}${rowsPart}${clearablePart} },`;
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
    const valueExpr = card.display === 'identifier'
      ? `(data['${card.field}$_identifier'] || data['${card.field}'] || '—')`
      : `fmt(data.${card.field})`;
    return `    { label: '${card.label}', value: ${valueExpr}, color: '${card.color}',  Icon: ${card.icon} },`;
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
  const ui = useUI();
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
              <div className={\`text-xs \${c.sub} mt-0.5\`}>{ui(label)}</div>
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
 * Build the lookup-related entry-field prop fragments (drawer, title,
 * onSelect mappings and displayFromCatalog) for an addLineFields entry.
 */
export function buildLookupEntryParts(f) {
  const lookupDrawerPart = f.lookupDrawer ? `, lookupDrawer: '${String(f.lookupDrawer).replace(/'/g, "\\'")}'` : '';
  const lookupTitlePart = f.lookupTitle ? `, lookupTitle: '${String(f.lookupTitle).replace(/'/g, "\\'")}'` : '';
  const onSelectMappingsPart = Array.isArray(f.onSelectMappings) && f.onSelectMappings.length > 0
    ? `, onSelectMappings: ${JSON.stringify(f.onSelectMappings)}`
    : '';
  const displayFromCatalogPart = fragmentIf(f.displayFromCatalog, ', displayFromCatalog: true');
  return { lookupDrawerPart, lookupTitlePart, onSelectMappingsPart, displayFromCatalogPart };
}

function getNewActionsPropValue(hasNewActions, newActionsConfig) {
  return hasNewActions
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
}

function getSummaryFields(summaryFieldsOverride, readOnlyFields, statusField) {
  if (Array.isArray(summaryFieldsOverride)) {
    if (summaryFieldsOverride.length === 0) {
      return [];
    } else {
      return readOnlyFields.filter(f => f !== statusField && summaryFieldsOverride.includes(f.name));
    }
  } else {
    return readOnlyFields.filter(f => f !== statusField);
  }
}

function resolveStatusAndSummaryFields(requiredHeaderFieldNames, allEntityFields, contract, readOnlyFields) {
  const quotedRequiredHeaderFields = requiredHeaderFieldNames.map(n => "'" + n + "'").join(', ');
  const requiredHeaderFieldsArray = requiredHeaderFieldNames.length > 0
    ? `[${quotedRequiredHeaderFields}]`
    : '[]';
  const docStatusField = allEntityFields.find(f => f.column === 'DocStatus');
  const statusFieldOverride = contract.frontendContract.window.statusField;
  let statusField;
  if (statusFieldOverride === false || statusFieldOverride === 'none') {
    statusField = null;
  } else if (statusFieldOverride) {
    statusField = allEntityFields.find(f => f.name === statusFieldOverride) ?? null;
  } else {
    statusField = docStatusField ?? allEntityFields.find(f => f.visibility === 'readOnly' && f.name.toLowerCase().includes('status'));
  }
  const summaryFieldsOverride = contract.frontendContract.window.summaryFields;
  const summaryFields = getSummaryFields(summaryFieldsOverride, readOnlyFields, statusField);
  return { requiredHeaderFieldsArray, statusField, summaryFields };
}

function resolveSendDocumentConfig(windowConfig, allEntityFields) {
  const sendDocumentOverride = windowConfig.sendDocument || null;
  const isDocumentalWindow = allEntityFields.some(
    f => f.name === 'documentNo' && f.visibility !== 'discarded',
  );
  const sdEnabled = sendDocumentOverride?.enabled !== undefined
    ? !!sendDocumentOverride.enabled
    : isDocumentalWindow;
  const sdAllowEmail = sendDocumentOverride?.allowEmail !== false;
  if (!sdEnabled) return null;
  const sendDocument = { enabled: true, allowEmail: sdAllowEmail };
  // ETP-4226 — recipient-edit policy overrides pass through verbatim so
  // ListView can forward them to SendDocumentModal as `sendPolicy`.
  // Absence means the shared default applies (editable To/CC, max 10).
  for (const key of ['editableRecipients', 'cc', 'maxRecipients']) {
    if (sendDocumentOverride && sendDocumentOverride[key] !== undefined) {
      sendDocument[key] = sendDocumentOverride[key];
    }
  }
  return sendDocument;
}

function buildCustomComponentImportsAndProps(customComponents, specName, customPanelTabs, newActionsConfig) {
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
  // customPanelTabs — import each panel component
  for (const pt of customPanelTabs) {
    customComponentImports.push(`import ${pt.component} from ${resolveCustomImport(specName, pt.component)};`);
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
  return { newActionsWithComponents, customCompImportBlock, customCompPropsBlock };
}

function getVis(visParts) {
  return visParts.length > 0 ? `visible: ${visParts.join(' && ')}, ` : '';
}

function getSuccessPart(a) {
  if (a.successKey) {
    return `successKey: '${a.successKey}', `;
  } else {
    if (a.successMessage) {
      return `successMessage: '${String(a.successMessage).replace(/'/g, "\\'")}', `;
    } else {
      return '';
    }
  }
}

function getMenuActionsProp(menuActionsConfig, menuActionsFnParams) {
  let menuActionsProp;
  if (menuActionsConfig.length > 0) {
    menuActionsProp = `\n        menuActions={${menuActionsFnParams} => [\n${menuActionsConfig.map(a => {
      let statusVis;
      if (Array.isArray(a.visibleWhenStatus)) {
        statusVis = a.visibleWhenStatus
          ? `${JSON.stringify(a.visibleWhenStatus)}.includes(status)`
          : '';
      } else {
        statusVis = a.visibleWhenStatus
          ? `status === '${a.visibleWhenStatus}'`
          : '';
      }
      const fieldVisFalse = a.visibleWhenFieldFalse ? `!data?.${a.visibleWhenFieldFalse}` : '';
      const fieldVisTrue = a.visibleWhenFieldTrue ? `(data?.${a.visibleWhenFieldTrue} === 'Y' || data?.${a.visibleWhenFieldTrue} === true)` : '';
      const visParts = [statusVis, fieldVisFalse, fieldVisTrue].filter(Boolean);
      const vis = getVis(visParts);
      const destr = fragmentIf(a.destructive, 'destructive: true, ');
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
      const successPart = getSuccessPart(a);
      return `          { key: '${a.key}', label: '${a.label}', ${destr}${vis}${labelKeyPart}${successPart}${handler} }`;
    }).join(',\n')}\n        ]}`;
  } else {
    menuActionsProp = '';
  }
  return menuActionsProp;
}

function getHeaderContentProp(statusBar, headerName, isGallery, isSidebar) {
  if (isGallery && !isSidebar) {
    return statusBar
      ? `\n        headerContent={(data) => <${headerName}StatusBar data={data} />}`
      : `\n        headerContent={
          <${headerName}DetailHeader
            recordId={recordId}
            token={props.token}
            apiBaseUrl={api.baseUrl}
          />
        }`;
  } else {
    return statusBar
      ? `\n        headerContent={(data) => <${headerName}StatusBar data={data} />}`
      : '';
  }
}

function buildSendDocumentProps(sendDocument) {
  let sendDocumentProp = '';
  let sendDocumentDetailProp = '';
  if (sendDocument) {
    // ETP-4226 — any recipient-policy key (editableRecipients/cc/maxRecipients)
    // makes the object non-default so it is emitted verbatim.
    const isDefaults = sendDocument.enabled === true && sendDocument.allowEmail === true
      && Object.keys(sendDocument).length === 2;
    const propValue = isDefaults ? '' : `={${JSON.stringify(sendDocument)}}`;
    sendDocumentProp = `\n      sendDocument${propValue}`;
    sendDocumentDetailProp = `\n        sendDocument${propValue}`;
  }
  return { sendDocumentProp, sendDocumentDetailProp };
}

function buildPrimaryTabsProps(primaryTabsConfig, specName) {
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
  return { primaryTabsImports, primaryTabsProp };
}

function getExtraTabsImport(extraTabs) {
  return extraTabs.length > 0
    ? extraTabs.map(et => `import ${et.component} from '${et.importFrom}';\n`).join('')
    : '';
}

function validateAttachmentsEnabled(attachmentsEnabled, headerTableName, headerEntity) {
  if (attachmentsEnabled && !headerTableName) {
    console.warn(
      `[generate-frontend] AttachmentsTab disabled for "${headerEntity}": header entity has no tableName in contract.`
    );
    attachmentsEnabled = false;
  }
  return attachmentsEnabled;
}

function getCustomTabsProp(customTabItems) {
  const customTabsProp = customTabItems.length > 0
    ? `\n        customTabs={[${customTabItems.join(', ')}]}`
    : '';
  return customTabsProp;
}

function buildApiParts(contract) {
  const apiPrediction = projectApiPredictionForFrontend(contract.apiPrediction);
  const apiBlock = apiPrediction
    ? `\nexport const api = ${JSON.stringify(apiPrediction, null, 2)};\n`
    : '';
  const apiProp = apiPrediction ? '\n      api={api}' : '';
  return { apiBlock, apiProp };
}

function getBulkActionsProp(customComponents) {
  return customComponents.bulkActions
    ? `\n      bulkActions={(ctx) => <${customComponents.bulkActions} {...ctx} />}`
    : '';
}

function buildFormFooterParts(headerExtraConfig, specName) {
  let formFooterImport = '';
  let formFooterProp = '';
  if (headerExtraConfig?.customForm && specName) {
    const compName = headerExtraConfig.customForm;
    formFooterImport = `import ${compName} from ${resolveCustomImport(specName, compName)};\n`;
    formFooterProp = `\n        formFooter={${compName}}`;
  }
  return { formFooterImport, formFooterProp };
}

function resolveAttachmentsConfig(windowConfig, layoutType, headerTableName, headerEntity) {
  // Attachments tab — enabled by default on standard (default) layout windows.
  // Opt out per-window via `window.attachments: false` in decisions.json, or
  // pass an object to forward options to the AttachmentsTab component (e.g.
  // `{ enabled: true, accept: '.pdf', maxSizeMb: 10 }`).
  const attachmentsCfg = windowConfig.attachments ?? true;
  // attachments are auto-enabled on default layout; on other layouts they must be
  // explicitly opted-in via `window.attachments: true` (or an options object) in decisions.json.
  const attachmentsExplicit = windowConfig.attachments !== undefined;
  let attachmentsEnabled =
    (layoutType === 'default' || attachmentsExplicit) &&
    attachmentsCfg !== false &&
    (typeof attachmentsCfg !== 'object' || attachmentsCfg?.enabled !== false);
  const attachmentsOpts = typeof attachmentsCfg === 'object' && attachmentsCfg !== null
    ? attachmentsCfg
    : {};

  attachmentsEnabled = validateAttachmentsEnabled(attachmentsEnabled, headerTableName, headerEntity);
  return { attachmentsEnabled, attachmentsOpts };
}

function getBreadcrumbLiteral(windowBreadcrumbOverride, windowCategory, windowLabel) {
  let bdcrum;
  if (windowBreadcrumbOverride !== undefined) {
    bdcrum = windowBreadcrumbOverride;
  } else {
    bdcrum = `${windowCategory} / ${windowLabel}`;
  }
  return `'${bdcrum}'`;
}

function buildGalleryImport(isGallery, headerName, specName, headerEntity, componentName) {
  return isGallery ? `import ${headerName}Gallery from ${resolveCustomImport(specName || headerEntity, componentName)};` : '';
}

function buildSidebarImport(isSidebar, headerName, specName, headerEntity, componentName) {
  return isSidebar ? `
import ${headerName}Sidebar from ${resolveCustomImport(specName || headerEntity, componentName)};` : '';
}

function buildDetailHeaderImport(isGallery, isSidebar, headerName, specName, headerEntity, componentName) {
  return isGallery && !isSidebar ? `
import ${headerName}DetailHeader from ${resolveCustomImport(specName || headerEntity, componentName)};` : '';
}

function getLabelOverridesParts(windowConfig) {
  const labelOverridesConfig = windowConfig.labelOverrides ?? null;
  const labelOverridesProp = labelOverridesConfig ? '\n        labelOverrides={labelOverrides}' : '';
  const labelOverridesListProp = labelOverridesConfig ? '\n      labelOverrides={labelOverrides}' : '';
  // Derive the standalone const from api.labelOverrides so the data lives in one
  // place only (the api object) and the prop reference is just an alias. The block
  // is emitted after the `api` declaration (see page template) so the reference resolves.
  const labelOverridesBlock = labelOverridesConfig
    ? `\nconst labelOverrides = api.labelOverrides;\n`
    : '';
  return { labelOverridesProp, labelOverridesListProp, labelOverridesBlock };
}

function getRelatedDocsImport(relatedDocuments, specName) {
  return relatedDocuments
    ? `import RelatedDocuments from ${resolveCustomImport(specName, 'RelatedDocuments')};\n`
    : '';
}

function getEntityDetailLabel(detailEntity, windowConfig, contract) {
  return detailEntity
    ? (windowConfig.detailLabel || contract.frontendContract.entities[detailEntity]?.tabName || toLabel(detailEntity))
    : '';
}

function getHeaderTableImport(customHeaderTable, headerName, specName) {
  return customHeaderTable
    ? `import ${headerName}Table from ${resolveCustomImport(specName, customHeaderTable)};`
    : `import ${headerName}Table from './${headerName}Table';`;
}

function getMenuActionsFnParams(menuActionsNeedsData) {
  return pick(menuActionsNeedsData, '({ data, status })', '({ status })');
}

function getStatusBarParts(statusBar, headerEntity, confirmModalName, specName, headerName, isGallery, isSidebar) {
  const statusBarResult = statusBar ? generateStatusBarComponent(headerEntity, statusBar) : null;
  const statusBarImport = statusBarResult ? `\nimport { useUI } from '@/i18n';\n${statusBarResult.lucideImports}` : '';
  const confirmModalImport = confirmModalName
    ? `\nimport ${confirmModalName} from ${resolveCustomImport(specName || headerEntity, confirmModalName)};`
    : '';
  const statusBarCode = statusBarResult ? `\n${statusBarResult.componentCode}\n` : '';
  const headerContentProp = getHeaderContentProp(statusBar, headerName, isGallery, isSidebar);
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
  return { statusBarImport, confirmModalImport, statusBarCode, headerContentProp, sidebarContentProp };
}

function getDraftModeParts(draftModeConfig) {
  const draftModeStaticConfig = draftModeConfig
    ? Object.fromEntries(Object.entries(draftModeConfig).filter(([k]) => k !== 'confirmModal'))
    : null;
  const draftModeValue = draftModeStaticConfig?.enabled
    ? JSON.stringify(draftModeStaticConfig, null, 2)
    : 'null';
  return { draftModeStaticConfig, draftModeValue };
}

function getDetailName(detailEntity) {
  return detailEntity ? toJsIdentifier(detailEntity) : null;
}

function pushAttachmentsTab(attachmentsEnabled, attachmentsOpts, customTabItems, headerTableName) {
  if (attachmentsEnabled) {
    const optsLiteral = JSON.stringify(attachmentsOpts);
    customTabItems.push(
      `{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: ${JSON.stringify(headerTableName)}, config: ${optsLiteral} } }`
    );
  }
}

function getListKpiCardsParts(windowConfig, specName) {
  const listKpiCardsConfig = windowConfig.listKpiCards ?? null;
  let listKpiCardsImport = '';
  let listKpiCardsProp = '';
  if (listKpiCardsConfig?.customComponent && specName) {
    const kpiComp = listKpiCardsConfig.customComponent;
    listKpiCardsImport = `import ${kpiComp} from ${resolveCustomImport(specName, kpiComp)};\n`;
    listKpiCardsProp = `\n      headerContent={(p) => <${kpiComp} {...p} />}`;
  }
  return { listKpiCardsImport, listKpiCardsProp };
}

function getRowQuickActionsProp(rowQuickActions) {
  let rowQuickActionsProp = '';
  if (!rowQuickActions || rowQuickActions.enabled !== false) {
    const declarativePart = rowQuickActions ?? {};
    rowQuickActionsProp = `\n      rowQuickActions={${JSON.stringify(declarativePart)}}`;
  }
  return rowQuickActionsProp;
}

function buildDetailImports(detailEntity, detailName, customLinesComp) {
  // When a window declares a customLinesComponent (e.g. AmortizationLinesTable),
  // it replaces the standard lines Table/Form — skip those imports to avoid
  // referencing generated files that are not produced.
  return (detailEntity && !customLinesComp) ? `
import ${detailName}Table from './${detailName}Table';
import ${detailName}Form from './${detailName}Form';` : '';
}

function getLineConfigSymbol(lineEntityConfig, LINE_CONFIG_SYMBOLS) {
  return lineEntityConfig ? (LINE_CONFIG_SYMBOLS[lineEntityConfig] ?? null) : null;
}

function buildCustomLinesParts(windowConfig, specName) {
  const customLinesComp = windowConfig.customLinesComponent ?? null;
  const customLinesLabelValue = windowConfig.customLinesLabel ?? null;
  let customLinesImport = '';
  let customLinesProp = '';
  if (customLinesComp && specName) {
    customLinesImport = `import ${customLinesComp} from ${resolveCustomImport(specName, customLinesComp)};\n`;
    customLinesProp = `\n        CustomLines={${customLinesComp}}`;
    if (customLinesLabelValue) {
      customLinesProp += `\n        customLinesLabel="${customLinesLabelValue}"`;
    }
  }
  return {customLinesComp, customLinesImport, customLinesProp};
}

function getCustomTabItems(relatedDocuments, customPanelTabs, attachmentsEnabled, attachmentsOpts, headerTableName, extraTabs) {
  const customTabItems = [];
  if (relatedDocuments) {
    customTabItems.push(`{ key: 'related', labelKey: 'relatedDocuments', Component: RelatedDocuments }`);
  }
  customPanelTabs.forEach(pt => {
    const labelPart = pt.labelKey ? `labelKey: '${pt.labelKey}'` : `label: '${pt.label}'`;
    customTabItems.push(
        `{ key: '${pt.key}', ${labelPart}, Component: ${pt.component}, placement: 'tab' }`
    );
  });
  pushAttachmentsTab(attachmentsEnabled, attachmentsOpts, customTabItems, headerTableName);
  extraTabs.forEach(et => {
    const labelPart = et.labelKey ? `labelKey: '${et.labelKey}'` : `label: '${JSON.stringify(et.label)}'`;
    customTabItems.push(
        `{ key: '${et.key}', ${labelPart}, Component: ${et.component}, placement: 'tab' }`
    );
  });
  return customTabItems;
}

/**
 * Build the `detailEntity="..."` JSX attribute fragment (with leading newline
 * and indentation) when a detail entity is present, or an empty string otherwise.
 */
export function buildDetailEntityAttr(detailEntity) {
  return detailEntity ? `
        detailEntity="${detailEntity}"` : '';
}

/**
 * Build the `processes` registry literal for a page: backend process endpoints,
 * button-type header fields, and extra processes declared only in decisions.json.
 * `processOverrides` can relabel, restyle, exclude, or add entries.
 */
function buildProcessesArray({ processes, buttonFields, processOverrides }) {
  return [
    ...processes.map(p => {
      const ovr = processOverrides[p.name] || processOverrides[p.columnName] || {};
      if (ovr.exclude) return null;
      const isDestructive = /void|cancel|reject/i.test(p.name);
      const style = ovr.style || pick(isDestructive, 'destructive', 'positive');
      const label = ovr.label || toLabel(p.name);
      const colPart = wrapIf(", columnName: '", p.columnName, "'");
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
      const style = ovr.style || pick(isDestructive, 'destructive', 'positive');
      const label = ovr.label || f.label || toLabel(f.name);
      const dlRawVal = ovr.displayLogicRaw || f.displayLogic?.raw;
      const dlRaw = dlRawVal ? `,\n    displayLogicRaw: "${dlRawVal.replace(/"/g, '\\"')}"` : '';
      const requiresLinesPart = fragmentIf(ovr.requiresLines, ', requiresLines: true');
      return `  { name: '${f.name}', label: '${label.replace(/'/g, "\\'")}', style: '${style}'${dlRaw}${requiresLinesPart} },`;
    }).filter(Boolean),
    // Extra processes defined purely in decisions.json (not in backend contract)
    ...Object.entries(processOverrides)
      .filter(([, ovr]) => ovr.add && !ovr.exclude)
      .map(([name, ovr]) => {
        const style = ovr.style || 'positive';
        const label = ovr.label || toLabel(name);
        const colPart = wrapIf(", columnName: '", ovr.columnName, "'");
        const dlRaw = ovr.displayLogicRaw
          ? `,\n    displayLogicRaw: "${ovr.displayLogicRaw.replace(/"/g, '\\"')}"`
          : '';
        const requiresLinesPart = fragmentIf(ovr.requiresLines, ', requiresLines: true');
        const fieldMaxPart = ovr.requiresFieldMax
          ? `, requiresFieldMax: ${JSON.stringify(ovr.requiresFieldMax)}`
          : '';
        return `  { name: '${name}', label: '${label.replace(/'/g, "\\'")}', style: '${style}'${colPart}${dlRaw}${requiresLinesPart}${fieldMaxPart} },`;
      }),
  ].join('\n');
}

/**
 * Build the hidden add-line defaults literal: form=false fields with a default.
 * `@Column@` macros become `fromParent` references when the column maps to a
 * header field; literal defaults pass through. `@SQL=`/session macros are skipped.
 */
function buildHiddenDefaultsArray(hiddenDefaultFields, allEntityFields) {
  return hiddenDefaultFields
    .filter(f => !String(f.defaultValue).startsWith('@SQL=') && !isEtendoSessionMacro(f.defaultValue))
    .map(f => {
      const rawDefault = String(f.defaultValue);
      const parentColMatch = rawDefault.match(/^@(\w+)@$/);
      const headerField = parentColMatch
        ? allEntityFields.find(hf => hf.column === parentColMatch[1])
        : null;
      if (headerField) {
        return `    { key: '${f.name}', fromParent: '${headerField.name}' },`;
      }
      const defaultValue = rawDefault.replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '');
      return `    { key: '${f.name}', value: '${defaultValue}' },`;
    }).join('\n');
}

export function buildHeaderLogicMaps(contract, headerEntity) {
  const headerEntityForLogic = contract.frontendContract.entities[headerEntity] ?? {};
  const headerColumnMap = {};
  const headerBooleanFields = [];
  for (const hf of (headerEntityForLogic.fields ?? [])) {
    if (hf.column && hf.name) headerColumnMap[hf.column] = hf.name;
    if (hf.tsType === 'boolean' || hf.type === 'boolean') headerBooleanFields.push(hf.name);
  }
  return {headerColumnMap, headerBooleanFields};
}

function getHiddenArraySeparator(hiddenDefaultsArray, hiddenSiblingArray) {
  return (hiddenDefaultsArray && hiddenSiblingArray) ? '\n' : '';
}

function getAddLineGuardProp(maxDetailLines) {
  return maxDetailLines != null
      ? `\n        addLineGuard={(_, children) => children.length < ${maxDetailLines}}`
      : '';
}

/**
 * Order the grid fields the same way generateTableComponent does: fields with an
 * explicit `gridOrder` are inserted at that 1-based position, the rest keep their
 * natural relative order. Shared so the list-modal grid matches the standard grid.
 */
function orderGridFields(entity) {
  const gridFieldsRaw = entity.fields.filter(f => f.grid && f.visibility !== 'discarded');
  const pinned = [...gridFieldsRaw].filter(f => f.gridOrder != null).sort((a, b) => a.gridOrder - b.gridOrder);
  const unpinned = gridFieldsRaw.filter(f => f.gridOrder == null);
  const gridFields = [...unpinned];
  for (const f of pinned) {
    const pos = Math.max(1, Math.min(f.gridOrder, gridFields.length + 1));
    gridFields.splice(pos - 1, 0, f);
  }
  return gridFields;
}

/**
 * Build the column descriptor literals for the list-modal grid. Reuses the same
 * field flags as the standard DataTable (`type`, `label`, enum labels, `toggle`
 * for inlineToggle, `inlineEdit`, `badge`). Backend-agnostic: every cell renders
 * from the row payload alone.
 */
function buildListModalColumns(entity) {
  return orderGridFields(entity).map(f => {
    const type = mapFieldType(f);
    const labelPart = f.label ? `, label: '${f.label.replace(/'/g, "\\'")}'` : '';
    let enumLabelsPart = '';
    if ((type === 'enum' || type === 'status') && f.enumValues?.length) {
      const enumEntries = f.enumValues.map(o => `'${o.value}': '${o.name.replace(/'/g, "\\'")}'`).join(', ');
      enumLabelsPart = `, enumLabels: { ${enumEntries} }`;
    }
    const enumVariantsPart = jsonWrapIf(', enumVariants: ', f.enumVariants);
    const togglePart = fragmentIf(f.inlineToggle, ', toggle: true');
    const inlineEditPart = fragmentIf(f.inlineEdit, ', inlineEdit: true');
    const badgePart = fragmentIf(f.badge, ', badge: true');
    const displayPart = wrapIf(", display: '", f.display, "'");
    // Cell-renderer registry config (listModalCells.jsx). cellType selects the
    // renderer; the rest carry its inputs. All values are field names or i18n
    // keys (never raw user text), so they are safe to emit verbatim.
    const cellTypePart = wrapIf(", cellType: '", f.cellType, "'");
    const labelKeyPart = wrapIf(", labelKey: '", f.gridLabelKey, "'");
    const subFieldPart = wrapIf(", subField: '", f.subField, "'");
    const subEmptyKeyPart = wrapIf(", subEmptyKey: '", f.subEmptyKey, "'");
    const kindFieldPart = wrapIf(", kindField: '", f.kindField, "'");
    const patternFieldPart = wrapIf(", patternField: '", f.patternField, "'");
    const kindLabelsPart = jsonWrapIf(', kindLabels: ', f.kindLabels);
    const tonesPart = jsonWrapIf(', tones: ', f.tones);
    return `  { key: '${f.name}', column: '${f.column}', type: '${type}'${labelPart}${labelKeyPart}${enumLabelsPart}${enumVariantsPart}${togglePart}${inlineEditPart}${badgePart}${displayPart}${cellTypePart}${subFieldPart}${subEmptyKeyPart}${kindFieldPart}${patternFieldPart}${kindLabelsPart}${tonesPart} },`;
  }).join('\n');
}

/**
 * Resolve the ordered modal sections. Honors templateConfig.sections (array of
 * `{ key, label }` or string keys); otherwise derives the order from the first
 * appearance of each field's `section` (defaulting unsectioned fields to 'general').
 */
function resolveModalSections(formFields, templateConfig) {
  const declared = templateConfig?.sections;
  if (Array.isArray(declared) && declared.length > 0) {
    return declared.map(s => (typeof s === 'string' ? { key: s, label: null } : { key: s.key, label: s.label ?? null }));
  }
  const seen = [];
  for (const f of formFields) {
    const key = f.section || 'general';
    if (!seen.includes(key)) seen.push(key);
  }
  return seen.map(key => ({ key, label: null }));
}

/**
 * Build the modal field descriptor literals for the list-modal create/edit form.
 * Mirrors generateFormComponent's field shape (type, required, lookup, reference,
 * inputMode, options, defaultValue, span, section) so EntityForm renders identically.
 */
function buildListModalFields(formFields) {
  return formFields.map(f => {
    const type = mapFormFieldType(f);
    const requiredPart = fragmentIf(f.required, ', required: true');
    const lookupPart = fragmentIf(f.lookup, ', lookup: true');
    const popupPart = fragmentIf(f.popup, ', popup: true');
    const referencePart = wrapIf(", reference: '", f.reference, "'");
    const inputModePart = wrapIf(", inputMode: '", f.inputMode, "'");
    const searchSelectPart = fragmentIf(f.searchSelect, ', searchSelect: true');
    const allowCreatePart = fragmentIf(f.allowCreate, ', allowCreate: true');
    const createPart = buildInlineCreatePart(f);
    const sectionPart = `, section: '${f.section || 'general'}'`;
    const optionsPart = getOptionsPart(type, f);
    const valueTypePart = (type === 'select' && f.tsType === 'boolean') ? `, valueType: 'boolean'` : '';
    const labelPart = f.label ? `, label: '${f.label.replace(/'/g, "\\'")}'` : '';
    const helpPart = f.help ? `, help: '${f.help.replace(/'/g, "\\'")}'` : '';
    const placeholderPart = f.placeholderKey ? `, placeholderKey: '${f.placeholderKey.replace(/'/g, "\\'")}'` : '';
    const emptyOptionPart = f.emptyOptionLabelKey ? `, emptyOptionLabelKey: '${f.emptyOptionLabelKey.replace(/'/g, "\\'")}'` : '';
    const spanPart = (f.span && f.span > 1) ? `, span: ${f.span}` : '';
    const rowsPart = f.rows != null ? `, rows: ${f.rows}` : '';
    const skipCheckboxDefault = type === 'checkbox' && (f.defaultValue === 'N' || f.defaultValue === false);
    const skipServerMacro = isEtendoSessionMacro(f.defaultValue);
    const defaultValuePart = getDefaultValuePart(skipCheckboxDefault, skipServerMacro, f);
    // A boolean field flagged as a grid toggle renders as the shared PillToggle switch in the
    // modal body too (in place), instead of a plain checkbox.
    const togglePart = (type === 'checkbox' && (f.cellType === 'toggle' || f.inlineToggle))
      ? ', toggle: true' : '';
    return `  { key: '${f.name}', column: '${f.column}', type: '${type}'${labelPart}${requiredPart}${lookupPart}${popupPart}${referencePart}${inputModePart}${searchSelectPart}${allowCreatePart}${createPart}${sectionPart}${optionsPart}${valueTypePart}${defaultValuePart}${helpPart}${placeholderPart}${emptyOptionPart}${spanPart}${rowsPart}${togglePart} },`;
  }).join('\n');
}

/**
 * Generate the page component for `layoutType: "list-modal"` windows.
 *
 * Emits a thin wrapper around the generic <ListModalWindow> component: a grid
 * (list) + create/edit modal with NO drill-in detail view. All structure comes
 * from the contract — grid columns, modal fields grouped by section, the NEO
 * CRUD endpoint and the i18n title/banner — so the same template serves any
 * catalog/master-data window that opts in.
 */
export function generateListModalPage(headerEntity, contract) {
  const headerName = toJsIdentifier(headerEntity);
  const compName = `${headerName}Page`;
  const entity = contract.frontendContract.entities[headerEntity];
  const windowConfig = contract?.frontendContract?.window ?? {};
  const templateConfig = windowConfig.templateConfig ?? null;

  const columnsArray = buildListModalColumns(entity);

  const formFields = entity.fields
    .filter(f => f.form && f.type !== 'button' && f.visibility !== 'discarded')
    .sort((a, b) => {
      if (a.seq != null && b.seq != null) return a.seq - b.seq;
      if (a.seq != null) return -1;
      if (b.seq != null) return 1;
      return 0;
    });
  const fieldsArray = buildListModalFields(formFields);
  const sections = resolveModalSections(formFields, templateConfig);
  const sectionsArray = sections
    .map(s => {
      const sectionLabelPart = s.label ? `, label: '${String(s.label).replace(/'/g, "\\'")}'` : '';
      return `  { key: '${s.key}'${sectionLabelPart} },`;
    })
    .join('\n');

  const searchableFields = entity.searchableFields ?? [];
  const filtersArray = searchableFields.map(f => `'${f}'`).join(', ');

  const { apiBlock, apiProp } = buildApiParts(contract);

  const windowCategory = capitalize(windowConfig.category ?? 'general');
  const windowLabel = windowConfig.name ?? toLabel(headerEntity);
  const breadcrumbLiteral = getBreadcrumbLiteral(windowConfig.breadcrumb, windowCategory, windowLabel);
  const entityLabel = windowConfig.entityLabel || windowConfig.name || toLabel(headerEntity);

  // Optional list-modal config (all i18n keys / field names; never raw user text).
  const tc = templateConfig ?? {};
  const configLiteral = JSON.stringify({
    titleKey: tc.titleKey ?? null,
    editTitleKey: tc.editTitleKey ?? null,
    // Modal header subtitle (Figma muted line under the title) and submit button
    // labels. All i18n keys; edit variants fall back to the create variant in the UI.
    subtitleKey: tc.subtitleKey ?? null,
    editSubtitleKey: tc.editSubtitleKey ?? null,
    submitLabelKey: tc.submitLabelKey ?? null,
    editSubmitLabelKey: tc.editSubmitLabelKey ?? null,
    bannerKey: tc.bannerKey ?? null,
    searchPlaceholderKey: tc.searchPlaceholderKey ?? null,
    newLabelKey: tc.newLabelKey ?? null,
    autoPriorityField: tc.autoPriorityField ?? null,
    autoPriorityStep: tc.autoPriorityStep ?? null,
    identifierField: tc.identifierField ?? null,
    // Footer toggle: a boolean field promoted out of the body grid into the modal
    // footer (switch + helper, beside the submit button — Figma "Crear transacción
    // automáticamente"). Value is a field name from `fields`.
    footerToggleField: tc.footerToggleField ?? null,
    // Per-section column count for the modal body grid, keyed by section key
    // (e.g. { general: 3, dimensions: 4 }). Defaults to 3 columns per section.
    sectionGrid: tc.sectionGrid ?? {},
    // Opt-in row "clone" action: a hover Copy button that opens the create modal
    // pre-filled with the row's values (new record, re-seeded auto-priority).
    allowClone: tc.allowClone ?? false,
    // Toolbar back button + declarative dropdown filters (Figma "Cancelar",
    // "Todas las reglas", "Todos los estados"). Filters are applied client-side
    // by ListModalWindow over the loaded rows. Keys are i18n keys / field names.
    backLabelKey: tc.backLabelKey ?? null,
    backTo: tc.backTo ?? null,
    toolbarFilters: tc.toolbarFilters ?? [],
  }, null, 2);

  return `import { ListModalWindow } from '@/components/contract-ui';

${MARKERS.GENERATED_START(`columns:${headerEntity}`)}
const columns = [
${columnsArray}
];
${MARKERS.GENERATED_END(`columns:${headerEntity}`)}

${MARKERS.GENERATED_START(`fields:${headerEntity}`)}
const fields = [
${fieldsArray}
];

const sections = [
${sectionsArray}
];

const filters = [${filtersArray}];
${MARKERS.GENERATED_END(`fields:${headerEntity}`)}

const breadcrumb = ${breadcrumbLiteral};
const listModalConfig = ${configLiteral};
${apiBlock}
${MARKERS.GENERATED_START(`component:${compName}`)}
export default function ${compName}({ windowName, ...props }) {
  return (
    <ListModalWindow
      entity="${headerEntity}"
      entityLabel="${entityLabel.replace(/"/g, '\\"')}"
      windowName={windowName}
      breadcrumb={breadcrumb}
      columns={columns}
      fields={fields}
      sections={sections}
      filters={filters}
      config={listModalConfig}${apiProp}
      {...props}
    />
  );
}
${MARKERS.GENERATED_END(`component:${compName}`)}
`;
}

/**
 * Split a detail entity's editable fields into user-entry fields vs auto-derived
 * fields (price/tax/amount/…), plus the hidden form=false defaults that still need
 * to reach the server for callouts. Extracted to keep generatePageComponent flat.
 * Note: discount is intentionally excluded — user-editable, triggers recalculation.
 */
function splitDetailLineFields(detailEditableFields, detailFields) {
  const autoPatterns = /price|tax|amount|total|cost|net/i;
  const derivedFields = detailEditableFields.filter(f =>
    autoPatterns.test(f.name) && !f.required && !f.reference
  );
  const entryFields = detailEditableFields.filter(f => !derivedFields.includes(f));
  const hiddenDefaultFields = detailFields.filter(f =>
    !f.form && f.defaultValue !== undefined
  );
  return { entryFields, derivedFields, hiddenDefaultFields };
}

// Quote a field's name for emission, or the literal 'null' when absent.
function quoteNameOrNull(field) {
  return field ? `'${field.name}'` : 'null';
}

// One header summary-strip descriptor line. Hoisted out of generatePageComponent
// to keep its map callbacks out of the function's cognitive complexity.
function buildSummaryFieldLine(f) {
  return `  { key: '${f.name}', column: '${f.column}', type: '${mapFieldType(f)}' },`;
}

// One auto-derived detail field descriptor line (price/tax/amount fields).
function buildDerivedFieldLine(f) {
  const type = mapFormFieldType(f);
  const labelPart = wrapIf(", label: '", f.label, "'");
  const referencePart = wrapIf(", reference: '", f.reference, "'");
  const inputModePart = wrapIf(", inputMode: '", f.inputMode, "'");
  return `    { key: '${f.name}', column: '${f.column}', type: '${type}'${labelPart}${referencePart}${inputModePart} },`;
}

/**
 * Build one descriptor line for a detail add-line entry field. Hoisted out of
 * generatePageComponent's map callback to keep that function's cognitive
 * complexity low. `firstSearchIdx` flags which entry field opens the lookup.
 */
function buildEntryFieldLine(f, i, firstSearchIdx) {
  const type = mapFormFieldType(f);
  const requiredPart = fragmentIf(f.required, ', required: true');
  const lookupPart = fragmentIf(i === firstSearchIdx && firstSearchIdx !== -1, ', lookup: true');
  const labelPart = wrapIf(", label: '", f.label, "'");
  const labelsDictPart = f.labels ? `, labels: ${JSON.stringify(f.labels)}` : '';
  const clearsFieldPart = f.clearsField ? `, clearsField: '${String(f.clearsField).replace(/'/g, "\\'")}'` : '';
  const skipDefaultPart = f.skipDefault ? ', skipDefault: true' : '';
  const referencePart = wrapIf(", reference: '", f.reference, "'");
  const inputModePart = wrapIf(", inputMode: '", f.inputMode, "'");
  const dependsOnPart = f.dependsOn
    ? `, dependsOn: { field: '${f.dependsOn.field}', filterKey: '${f.dependsOn.filterKey}' }`
    : '';
  // Include defaultValue for quantity/numeric fields so the add-line form starts with a
  // sensible value. Skip redundant unchecked YESNO/checkbox defaults (backend coerces).
  const rawDv = f.defaultValue;
  let defaultValuePart = '';
  const skipCheckboxDefault = type === 'checkbox' && (rawDv === 'N' || rawDv === false);
  const skipServerMacro = isEtendoSessionMacro(rawDv);
  if (!skipCheckboxDefault && !skipServerMacro && rawDv !== undefined && rawDv !== null && rawDv !== '') {
    const numDv = Number(rawDv);
    const dvLiteral = (!isNaN(numDv) && String(rawDv).trim() !== '') ? numDv : `'${String(rawDv).replace(/'/g, "\\'")}'`;
    defaultValuePart = `, defaultValue: ${dvLiteral}`;
  }
  const forceCalloutFieldsPart = Array.isArray(f.forceCalloutFields) && f.forceCalloutFields.length > 0
    ? `, forceCalloutFields: ${JSON.stringify(f.forceCalloutFields)}`
    : '';
  const { lookupDrawerPart, lookupTitlePart, onSelectMappingsPart, displayFromCatalogPart } = buildLookupEntryParts(f);
  const minEntryPart = optProp('min', f.min);
  return `    { key: '${f.name}', column: '${f.column}', type: '${type}'${requiredPart}${lookupPart}${labelPart}${labelsDictPart}${clearsFieldPart}${skipDefaultPart}${referencePart}${inputModePart}${dependsOnPart}${defaultValuePart}${forceCalloutFieldsPart}${lookupDrawerPart}${lookupTitlePart}${onSelectMappingsPart}${displayFromCatalogPart}${minEntryPart} },`;
}

/**
 * Generate a header-detail page component with ListView/DetailView pattern.
 * Produces a thin declarative component that routes by recordId.
 */
export function generatePageComponent(headerEntity, detailEntity, contract) {
  const headerName = toJsIdentifier(headerEntity);
  const detailName = getDetailName(detailEntity);
  const compName = `${headerName}Page`;
  const layoutType = contract?.frontendContract?.window?.layoutType ?? 'default';
  // list-modal: grid (list) + create/edit modal, no drill-in detail view.
  // Delegate to the dedicated generator and skip the ListView/DetailView template.
  if (layoutType === 'list-modal') {
    return generateListModalPage(headerEntity, contract);
  }
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
  const {
    requiredHeaderFieldsArray,
    statusField,
    summaryFields
  } = resolveStatusAndSummaryFields(requiredHeaderFieldNames, allEntityFields, contract, readOnlyFields);

  // Summary config
  const summaryArray = summaryFields.map(buildSummaryFieldLine).join('\n');

  // Status field config
  const statusFieldLine = quoteNameOrNull(statusField);

  // Process config: backendContract process endpoints + button-type fields from frontendContract
  // processOverrides from decisions.json allow label, style, displayLogicRaw, and exclude overrides
  const processOverrides = contract?.frontendContract?.window?.processOverrides ?? {};
  const buttonFields = allEntityFields.filter(f => f.type === 'button' && f.form);
  const processesArray = buildProcessesArray({ processes, buttonFields, processOverrides });

  const { entryFields, derivedFields, hiddenDefaultFields } = splitDetailLineFields(detailEditableFields, detailFields);

  // The first search-type entry field (usually product) triggers a lookup modal
  const firstSearchIdx = entryFields.findIndex(f => mapFormFieldType(f) === 'search');
  const entryArray = entryFields
    .map((f, i) => buildEntryFieldLine(f, i, firstSearchIdx))
    .join('\n');

  const derivedArray = derivedFields.map(buildDerivedFieldLine).join('\n');

  const hiddenDefaultsArray = buildHiddenDefaultsArray(hiddenDefaultFields, allEntityFields);
  const hiddenSiblingNames = contract.frontendContract.entities[detailEntity]?.addLineHiddenFromSibling ?? [];
  const hiddenSiblingArray = hiddenSiblingNames
    .map(name => `    { key: '${name}', fromSibling: '${name}' },`)
    .join('\n');
  const hiddenArraySeparator = getHiddenArraySeparator(hiddenDefaultsArray, hiddenSiblingArray);

  // API prediction config
  const { apiBlock, apiProp } = buildApiParts(contract);

  const windowBreadcrumbOverride = contract?.frontendContract?.window?.breadcrumb;
  const windowCategory = capitalize(contract?.frontendContract?.window?.category ?? 'general');
  const windowLabel = contract?.frontendContract?.window?.name ?? toLabel(headerEntity);

  // Window-level UI config from decisions.json
  const windowConfig = contract?.frontendContract?.window ?? {};
  const documentPreview = windowConfig.documentPreview ?? null;
  const notesField = windowConfig.notesField ?? null;
  const relatedDocuments = windowConfig.relatedDocuments ?? false;
  const hideDeleteWhenComplete = windowConfig.hideDeleteWhenComplete ?? false;
  const customTabsAfterBottom = windowConfig.customTabsAfterBottom ?? false;
  const hidePrint = windowConfig.hidePrint ?? false;
  const hideSaveStatuses = windowConfig.hideSaveStatuses ?? [];
  const hideMoreMenu = windowConfig.hideMoreMenu ?? false;
  const hideMoreDetails = windowConfig.hideMoreDetails ?? false;
  const noHeaderBorder = windowConfig.noHeaderBorder ?? false;
  const toolbarBorderBottom = windowConfig.toolbarBorderBottom ?? false;
  const compactSidebarPadding = windowConfig.compactSidebarPadding ?? false;
  const whiteFormBackground = windowConfig.whiteFormBackground ?? false;
  const autoSaveOnBlur = windowConfig.autoSaveOnBlur ?? false;
  const hideFormCard = windowConfig.hideFormCard ?? false;
  const sidebarAboveTabsOnly = windowConfig.sidebarAboveTabsOnly ?? false;
  const sidebarClassName = windowConfig.sidebarClassName ?? null;
  const tabsBarPaddingX = windowConfig.tabsBarPaddingX ?? null;
  const primaryTabsVariant = windowConfig.primaryTabsVariant ?? null;
  const toolbarPaddingX = windowConfig.toolbarPaddingX ?? null;
  const toolbarButtonSize = windowConfig.toolbarButtonSize ?? null;
  const listbarPaddingX = windowConfig.listbarPaddingX ?? null;
  const tablePaddingX = windowConfig.tablePaddingX ?? null;
  const linesLayout = windowConfig.linesLayout ?? 'classic';
  const balanceFooter = windowConfig.balanceFooter ?? null;
  const listViewOptions = windowConfig.listViewOptions ?? null;
  const listBaseFilter = windowConfig.listBaseFilter ?? null;
  const quickFilters = windowConfig.quickFilters ?? null;
  const subsetFilters = windowConfig.subsetFilters ?? null;
  const dateFilterKey = windowConfig.dateFilterKey ?? null;
  const contentBg = windowConfig.contentBg ?? null;
  const formCardPadding = windowConfig.formCardPadding ?? null;
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
  const selectorPriceCurrency = windowConfig.selectorPriceCurrency ?? null;
  const extraTabs = windowConfig.extraTabs ?? [];
  const customPanelTabs = windowConfig.customPanelTabs ?? [];
  const lineEntityConfig = windowConfig.lineEntityConfig ?? null;
  // ETP-3914 — Row Quick Actions overlay config (defaults injected by resolve-curated.js).
  // When the entire feature is disabled we skip emitting the prop so the list view is
  // identical to the pre-feature behavior.
  const rowQuickActions = windowConfig.rowQuickActions ?? null;
  // ETP-3914 — Send/Download envelope gate.
  // Eligibility heuristic: header has a non-discarded `documentNo` field (the
  // structural signature of a transactional document). Master-data windows
  // (tax, product, UOM…) never satisfy this and stay silent automatically.
  // `decisions.json → window.sendDocument` is copied verbatim into the contract
  // and overrides eligibility in both directions:
  //   { enabled: false }              → force off (even if eligible)
  //   { enabled: true }               → force on (even if non-eligible)
  //   { allowEmail: false }           → keep eligibility, hide email column
  // Both fields default to `true` when omitted. We only emit the JSX prop when
  // the feature is on, so non-eligible windows render no envelope.
  const sendDocument = resolveSendDocumentConfig(windowConfig, allEntityFields);
  // Resolve header DB table name from the contract — required by AttachmentsTab
  // to build the NEO endpoint `/sws/neo/attachments/{tableName}/{recordId}`.
  const headerEntityContract = contract?.frontendContract?.entities?.[headerEntity];
  const headerTableName = headerEntityContract?.tableName ?? null;

  let { attachmentsEnabled, attachmentsOpts } = resolveAttachmentsConfig(windowConfig, layoutType, headerTableName, headerEntity);

  // Detect secondary child entities for additional tabs
  const secondaryTabsDecl = windowConfig.secondaryTabs;
  let secondaryTabDefs;

  // Column→property and boolean-field maps built from the header entity, used
  // to compile tab-level readOnlyLogic expressions the same way field-level
  // readOnlyLogic is compiled in generate-contract.js.
  const {headerColumnMap, headerBooleanFields} = buildHeaderLogicMaps(contract, headerEntity);

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
          const requiredPart = fragmentIf(f.required, ', required: true');
          const labelPart = wrapIf(", label: '", f.label, "'");
          const labelsDictPart = f.labels ? `, labels: ${JSON.stringify(f.labels)}` : '';
          const clearsFieldPart = f.clearsField ? `, clearsField: '${String(f.clearsField).replace(/'/g, "\\'")}'` : '';
          const referencePart = wrapIf(", reference: '", f.reference, "'");
          const inputModePart = wrapIf(", inputMode: '", f.inputMode, "'");
          // Skip redundant unchecked defaults on YESNO/checkbox fields (backend coerces to false anyway).
          const skipCheckboxDefault = type === 'checkbox' && (f.defaultValue === 'N' || f.defaultValue === false);
          const defaultValuePart = (!skipCheckboxDefault && f.defaultValue) ? `, defaultValue: '${String(f.defaultValue).replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '')}'` : '';
          const optionsPart = (type === 'select' && f.enumValues?.length)
            ? `, options: [${f.enumValues.map(o => `{ value: '${o.value}', label: '${o.name.replace(/'/g, "\\'")}' }`).join(', ')}]`
            : '';
          const lookupDrawerPart = f.lookupDrawer ? `, lookupDrawer: '${String(f.lookupDrawer).replace(/'/g, "\\'")}'` : '';
          const lookupTitlePart = f.lookupTitle ? `, lookupTitle: '${String(f.lookupTitle).replace(/'/g, "\\'")}'` : '';
          const onSelectMappingsPart = Array.isArray(f.onSelectMappings) && f.onSelectMappings.length > 0
            ? `, onSelectMappings: ${JSON.stringify(f.onSelectMappings)}`
            : '';
          const displayFromCatalogPart = f.displayFromCatalog ? `, displayFromCatalog: true` : '';
          // Declarative selector exclusion: this entry's options drop the live value
          // of another field in the same add-row (e.g. toCurrency excludes the
          // document currency). Declared in secondaryTabs.<tab>.addLineFieldExclusions.
          const excludeValueOf = cfg.addLineFieldExclusions?.[fk];
          const excludeValueOfPart = excludeValueOf ? `, excludeValueOf: '${String(excludeValueOf).replace(/'/g, "\\'")}'` : '';
          return `          { key: '${fk}', column: '${f.column}', type: '${type}'${requiredPart}${labelPart}${labelsDictPart}${clearsFieldPart}${referencePart}${inputModePart}${defaultValuePart}${optionsPart}${lookupDrawerPart}${lookupTitlePart}${onSelectMappingsPart}${displayFromCatalogPart}${excludeValueOfPart} }`;
        }).filter(Boolean);
        // Tab-level readOnlyLogic — when truthy at runtime the tab still
        // renders existing rows but blocks add / edit / delete actions.
        // Compiled using the same translator as field-level readOnlyLogic.
        const readOnlyLogicJs = cfg.readOnlyLogic
          ? convertLogicToJs(cfg.readOnlyLogic, headerColumnMap, headerBooleanFields)
          : null;
        return { key, label: cfg.label ?? toLabel(key), isFormTab, isPanelTab, isCustomForm: !!cfg.customForm, isCustomTable: !!cfg.customTable, PanelName, FormName, TableName, addLineEntries, requireSavedRecord, isCustomAddModal: !!customAddModalName, CustomAddModalName: customAddModalName, readOnlyLogicJs };
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
    ].filter(t => t.key !== detailEntity).slice(0, 4);
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
    const readOnlyLogicPart = t.readOnlyLogicJs
      ? `, readOnlyLogic: (record) => ${t.readOnlyLogicJs}`
      : '';
    if (t.isFormTab) {
      return `          { key: '${t.key}', label: '${t.label}', isFormTab: true, Form: ${t.FormName}${requireSavedPart}${readOnlyLogicPart} },`;
    }
    if (t.isPanelTab) {
      return `          { key: '${t.key}', label: '${t.label}', Panel: ${t.PanelName}${requireSavedPart}${readOnlyLogicPart} },`;
    }
    const addLinePart = t.addLineEntries.length > 0
      ? `, addLineFields: { entry: [\n${t.addLineEntries.join(',\n')},\n          ], derived: [], hidden: [] }`
      : '';
    const customAddModalPart = wrapIf(', customAddModal: ', t.CustomAddModalName);
    const formProp = (t.isCustomAddModal && !t.isCustomForm) ? '' : `, Form: ${t.FormName}`;
    return `          { key: '${t.key}', label: '${t.label}', Table: ${t.TableName}${formProp}${addLinePart}${customAddModalPart}${requireSavedPart}${readOnlyLogicPart} },`;
  }).join('\n');

  const secondaryTabsProp = wrapIf('\n        secondaryTabs={[\n', secondaryTabsPropEntries, '\n        ]}', secondaryTabDefs.length > 0);

  // Build optional DetailView props from window-level decisions config
  const documentPreviewProp = wrapIf(
    "\n        documentPreview={{ titlePrefix: '",
    documentPreview?.titlePrefix || '',
    "', pdfUrl: null }}",
    documentPreview
  );
  const notesFieldProp = wrapIf('\n        notesField="', notesField, '"');
  // customTabs accumulator — DetailView supports items with shape
  //   { key, label, Component, placement?: 'tab' | 'footer', props?: {} }
  // `placement: 'tab'` renders as a main tab (Lines/Notes style);
  // `placement: 'footer'` (default) keeps the legacy chip-footer behavior.
  const customTabItems = getCustomTabItems(relatedDocuments, customPanelTabs, attachmentsEnabled, attachmentsOpts, headerTableName, extraTabs);
  const customTabsProp = getCustomTabsProp(customTabItems);

  // hideDeleteWhenComplete prop
  const hideDeleteProp = fragmentIf(hideDeleteWhenComplete, '\n        hideDeleteWhenComplete');
  // customTabsAfterBottom prop
  const customTabsAfterBottomProp = fragmentIf(customTabsAfterBottom, '\n        customTabsAfterBottom');

  // hidePrint prop (DetailView)
  const hidePrintProp = fragmentIf(hidePrint, '\n        hidePrint');
  // hideSaveStatuses prop (DetailView)
  const hideSaveStatusesProp = jsonWrapIf('\n        hideSaveStatuses={', hideSaveStatuses, '}', hideSaveStatuses.length > 0);
  // hideMoreMenu prop (DetailView)
  const hideMoreMenuProp = fragmentIf(hideMoreMenu, '\n        hideMoreMenu');
  // hideMoreDetails prop (DetailView)
  const hideMoreDetailsProp = fragmentIf(hideMoreDetails, '\n        hideMoreDetails');
  // noHeaderBorder prop (DetailView)
  const noHeaderBorderProp = fragmentIf(noHeaderBorder, '\n        noHeaderBorder');
  // toolbarBorderBottom prop (DetailView)
  const toolbarBorderBottomProp = fragmentIf(toolbarBorderBottom, '\n        toolbarBorderBottom');
  // compactSidebarPadding prop (DetailView)
  const compactSidebarPaddingProp = fragmentIf(compactSidebarPadding, '\n        compactSidebarPadding');
  const whiteFormBackgroundProp = fragmentIf(whiteFormBackground, '\n        whiteFormBackground');
  const autoSaveOnBlurProp = fragmentIf(autoSaveOnBlur, '\n        autoSaveOnBlur');
  // hideFormCard prop (DetailView)
  const hideFormCardProp = fragmentIf(hideFormCard, '\n        hideFormCard');
  // sidebarAboveTabsOnly prop (DetailView)
  const sidebarAboveTabsOnlyProp = fragmentIf(sidebarAboveTabsOnly, '\n        sidebarAboveTabsOnly');
  // sidebarClassName prop (DetailView)
  const sidebarClassNameProp = wrapIf('\n        sidebarClassName="', sidebarClassName, '"');
  // tabsBarPaddingX prop (DetailView)
  const tabsBarPaddingXProp = wrapIf('\n        tabsBarPaddingX="', tabsBarPaddingX, '"');
  // primaryTabsVariant prop (DetailView)
  const primaryTabsVariantProp = wrapIf('\n        primaryTabsVariant="', primaryTabsVariant, '"');
  // toolbarPaddingX prop (DetailView)
  const toolbarPaddingXProp = wrapIf('\n        toolbarPaddingX="', toolbarPaddingX, '"');
  // toolbarButtonSize prop (DetailView)
  const toolbarButtonSizeProp = wrapIf('\n        toolbarButtonSize="', toolbarButtonSize, '"');
  // listbarPaddingX / tablePaddingX props (ListView)
  const listbarPaddingXProp = wrapIf('\n      listbarPaddingX="', listbarPaddingX, '"');
  const tablePaddingXProp = wrapIf('\n      tablePaddingX="', tablePaddingX, '"');
  // linesLayout prop (DetailView). Only emit when non-default to keep generated
  // output diff-free for windows that don't opt in.
  const cond = linesLayout && linesLayout !== 'classic';
  const linesLayoutProp = wrapIf('\n        linesLayout="', linesLayout, '"', cond);
  // balanceFooter prop (DetailView) — { debitField, creditField } for double-entry windows.
  const balanceFooterProp = jsonWrapIf('\n        balanceFooter={', balanceFooter, '}');
  // listViewOptions props
  const listViewOptionsProp = jsonWrapIf('\n      listViewOptions={', listViewOptions, '}');
  const listBaseFilterProp = wrapIf('\n      baseFilter="', listBaseFilter, '"');
  const quickFiltersProp = jsonWrapIf('\n      quickFilters={', quickFilters, '}');
  const subsetFiltersProp = jsonWrapIf('\n      subsetFilters={', subsetFilters, '}');
  const dateFilterKeyProp = wrapIf('\n      dateFilterKey="', dateFilterKey, '"');
  // filterOnly fields are in the table columns (so ListFilterBar detects them)
  // but should not be visually rendered. Pass as initialHiddenColumns to DataTable.
  const filterOnlyFields = allEntityFields.filter(f => f.filterOnly && f.grid);
  const initialHiddenColumnsProp = jsonWrapIf('\n      hiddenColumns={', filterOnlyFields.map(f => f.name), '}', filterOnlyFields.length > 0);
  // contentBg prop
  const contentBgProp = wrapIf('\n        contentBg="', contentBg, '"');
  // formCardPadding prop (DetailView)
  const formCardPaddingProp = wrapIf('\n        formCardPadding="', formCardPadding, '"');
  // formScrollPaddingX prop (DetailView) — overrides the horizontal padding of the content scroll column
  const formScrollPaddingX = windowConfig.formScrollPaddingX ?? null;
  const formScrollPaddingXProp = wrapIf('\n        formScrollPaddingX="', formScrollPaddingX, '"');
  // lineConfig prop — emitted when the window uses a non-default line pricing config
  const LINE_CONFIG_SYMBOLS = { invoice: 'INVOICE_LINE_CONFIG', returnOrder: 'RETURN_ORDER_LINE_CONFIG' };
  const lineConfigSymbol = getLineConfigSymbol(lineEntityConfig, LINE_CONFIG_SYMBOLS);
  const lineConfigProp = wrapIf('\n        lineConfig={', lineConfigSymbol, '}');
  // ListView toolbar props
  const hidePrintListProp = fragmentIf(hidePrint, '\n      hidePrint');
  const hideMoreMenuListProp = fragmentIf(hideMoreMenu, '\n      hideMoreMenu');
  const hideListFiltersProp = fragmentIf(hideListFilters, '\n      hideListFilters');
  const hideLinkProp = fragmentIf(hideLink, '\n      hideLink');
  const hideEyeCountProp = fragmentIf(hideEyeCount, '\n      hideEyeCount');

  // Custom component props (bottomSection, topbarRight)
  const {
    newActionsWithComponents,
    customCompImportBlock,
    customCompPropsBlock
  } = buildCustomComponentImportsAndProps(customComponents, specName, customPanelTabs, newActionsConfig);

  // Custom headerTable override
  const customHeaderTable = customComponents.headerTable ?? null;
  const headerTableImport = getHeaderTableImport(customHeaderTable, headerName, specName);

  // menuActions prop
  const menuActionsNeedsData = menuActionsConfig.some(a => a.visibleWhenFieldFalse || a.visibleWhenFieldTrue);
  const menuActionsFnParams = getMenuActionsFnParams(menuActionsNeedsData);
  const menuActionsProp = getMenuActionsProp(menuActionsConfig, menuActionsFnParams);

  // Build optional import for RelatedDocuments
  const relatedDocsImport = getRelatedDocsImport(relatedDocuments, specName);

  // Build optional import for the generic AttachmentsTab component
  const attachmentsImport = fragmentIf(attachmentsEnabled, `import { AttachmentsTab } from '@/components/attachments';\n`);

  // Build optional imports for extra custom tabs (window.extraTabs in decisions.json)
  const extraTabsImport = getExtraTabsImport(extraTabs);

  // Draft mode config from frontend contract
  const draftModeConfig = contract.frontendContract.entities[headerEntity]?.draftMode;
  const confirmModalName = draftModeConfig?.confirmModal || null;
  // Strip confirmModal from the static config — it's runtime-only (resolved via useState in the component)
  const { draftModeStaticConfig, draftModeValue } = getDraftModeParts(draftModeConfig);
  const draftModePropName = pick(confirmModalName, 'draftModeWithConfirm', 'draftMode');
  const draftModeProp = wrapIf('\n        draftMode={', draftModePropName, '}', !!draftModeStaticConfig?.enabled);
  const requiredHeaderFieldsProp = fragmentIf(requiredHeaderFieldNames.length > 0, '\n        requiredHeaderFields={requiredHeaderFields}');

  // maxDetailLines: limits the detail entity to N lines; hides the Add Line button once reached.
  const maxDetailLines = windowConfig.maxDetailLines ?? null;
  const addLineGuardProp = getAddLineGuardProp(maxDetailLines);

  // entityLabel / detailLabel / detailTabIndex from window decisions config
  let entityLabel = windowConfig.entityLabel || toLabel(headerEntity);
  const entityDetailLabel = getEntityDetailLabel(detailEntity, windowConfig, contract);
  const detailTabIndexProp = wrapIf('\n        detailTabIndex={', windowConfig.detailTabIndex, '}', windowConfig.detailTabIndex != null);

  // StatusBar component generation
  const {
    statusBarImport,
    confirmModalImport,
    statusBarCode,
    headerContentProp,
    sidebarContentProp
  } = getStatusBarParts(statusBar, headerEntity, confirmModalName, specName, headerName, isGallery, isSidebar);

  // detailSortBy prop
  const detailSortByProp = wrapIf('\n        detailSortBy="', detailSortBy, '"');

  // titleField prop
  const titleFieldProp = wrapIf('\n        titleField="', titleField, '"');

  // salesTheme prop
  const salesThemeProp = fragmentIf(salesTheme, '\n        salesTheme');

  // selectorPriceCurrency prop (DetailView) — only emit when set in decisions
  const selectorPriceCurrencyProp = wrapIf('\n        selectorPriceCurrency="', selectorPriceCurrency, '"');

  // listKpiCards → headerContent prop in ListView
  let { listKpiCardsImport, listKpiCardsProp } = getListKpiCardsParts(windowConfig, specName);

  // bulkActions → render function prop in ListView
  const bulkActionsProp = getBulkActionsProp(customComponents);

  // headerExtra → formFooter prop
  const headerExtraConfig = windowConfig.headerExtra ?? null;
  let { formFooterImport, formFooterProp } = buildFormFooterParts(headerExtraConfig, specName);

  // customLinesComponent → CustomLines prop
  let {customLinesComp, customLinesImport, customLinesProp} = buildCustomLinesParts(windowConfig, specName);

  // primaryTabs support
  const primaryTabsConfig = windowConfig.primaryTabs ?? null;
  let { primaryTabsImports, primaryTabsProp } = buildPrimaryTabsProps(primaryTabsConfig, specName);

  // othersLabel support
  const othersLabelValue = windowConfig.othersLabel ?? null;
  const othersLabelProp = wrapIf('\n        othersLabel="', othersLabelValue, '"');

  // disableProcessedLock support
  const disableProcessedLockProp = fragmentIf(windowConfig.disableProcessedLock, `\n        lockWhenProcessed={false}`);

  // statusEnumLabels support
  const statusEnumLabelsConfig = windowConfig.statusEnumLabels ?? null;
  const statusEnumLabelsProp = jsonWrapIf('\n        statusEnumLabels={', statusEnumLabelsConfig, '}');

  // showDetailFooterTotals support
  const showDetailFooterTotalsValue = windowConfig.showDetailFooterTotals;
  const showDetailFooterTotalsProp = wrapIf('\n        showDetailFooterTotals={', showDetailFooterTotalsValue, '}', showDetailFooterTotalsValue !== undefined);

  // labelOverrides support
  const { labelOverridesProp, labelOverridesListProp, labelOverridesBlock } = getLabelOverridesParts(windowConfig);

  // ETP-3914 — rowQuickActions prop forwarded to ListView.
  // The feature is ON by default for every window. The contract only carries a block
  // when the user wants to override defaults (decisions.json → window.rowQuickActions).
  // The generator forwards whatever is declared verbatim; an empty `{}` is enough to
  // mount the overlay since DataTable + RowQuickActions resolve defaults at runtime.
  // We skip emission entirely only when the user explicitly set `enabled: false`.
  let rowQuickActionsProp = getRowQuickActionsProp(rowQuickActions);

  // ETP-3914 — Send/Download envelope prop. ListView routes it into DataTable →
  // RowQuickActions to control the email quick action, and mounts the generic
  // SendDocumentModal when no host-supplied `onEmail` exists. When both defaults
  // match (enabled + allowEmail), emit the bare attribute (`sendDocument`) which
  // JSX treats as `={true}` — runtime gates use `enabled !== false` and optional
  // chaining, so a plain `true` behaves identically to `{enabled:true,allowEmail:true}`
  // while keeping generated files clean of redundant default objects.
  let { sendDocumentProp, sendDocumentDetailProp } = buildSendDocumentProps(sendDocument);

  // newActions support — split button dropdown on the list view
  const hasNewActions = newActionsConfig.length > 0;
  const newActionsStatements = newActionsWithComponents.map(a => {
    const stateName = `show${capitalize(a.key.replace(/-./g, m => m[1].toUpperCase()))}Modal`;
    return `  const [${stateName}, set${capitalize(a.key.replace(/-./g, m => m[1].toUpperCase()))}Modal] = useState(false);`;
  }).join('\n');
  const newActionsPropValue = getNewActionsPropValue(hasNewActions, newActionsConfig);
  const newActionsModals = newActionsWithComponents.map(a => {
    const stateName = `show${capitalize(a.key.replace(/-./g, m => m[1].toUpperCase()))}Modal`;
    const setterName = `set${capitalize(a.key.replace(/-./g, m => m[1].toUpperCase()))}Modal`;
    return `    {${stateName} && <${a.component} token={props.token} apiBaseUrl={props.apiBaseUrl} windowName={windowName} onClose={() => ${setterName}(false)} />}`;
  }).join('\n');

  const needsUseState = customComponents.newRecordComponent || newActionsWithComponents.length > 0 || !!confirmModalName;
  const needsFragment = customComponents.newRecordComponent || newActionsWithComponents.length > 0;

  const galleryComponentName = `${headerName}Gallery`;
  const sidebarComponentName = `${headerName}Sidebar`;
  const detailHeaderComponentName = `${headerName}DetailHeader`;
  const useStateImport = fragmentIf(needsUseState, 'useState, ');
  return `import { ${useStateImport}useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';${fragmentIf(menuActionsConfig.length > 0, `\nimport { toast } from 'sonner';`)}${wrapIf('\nimport { ', lineConfigSymbol, ` } from '@/hooks/useLineGrossAmount';`)}
${headerTableImport}
import ${headerName}Form from './${headerName}Form';${(buildDetailImports(detailEntity, detailName, customLinesComp))}
${fragmentIf(secondaryTabDefs.length > 0, `${secondaryTabsImports}\n`)}${formFooterImport}${customLinesImport}${primaryTabsImports}${listKpiCardsImport}${relatedDocsImport}${attachmentsImport}${extraTabsImport}${customCompImportBlock}import catalogs from './mockCatalogs';
${(buildGalleryImport(isGallery, headerName, specName, headerEntity, galleryComponentName))}${(buildSidebarImport(isSidebar, headerName, specName, headerEntity, sidebarComponentName))}${(buildDetailHeaderImport(isGallery, isSidebar, headerName, specName, headerEntity, detailHeaderComponentName))}${statusBarImport}${confirmModalImport}

const breadcrumb = ${getBreadcrumbLiteral(windowBreadcrumbOverride, windowCategory, windowLabel)};
${statusBarCode}

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
${hiddenDefaultsArray}${hiddenArraySeparator}${hiddenSiblingArray}
  ],
};
${MARKERS.GENERATED_END(`addLineFields:${detailEntity}`)}` : ''}
${apiBlock}
${labelOverridesBlock}${MARKERS.GENERATED_START(`component:${compName}`)}
export default function ${compName}({ windowName, recordId, ...props }) {${fragmentIf(customComponents.newRecordComponent, `
  const [showNewModal, setShowNewModal] = useState(false);`)}${fragmentIf(newActionsWithComponents.length > 0, `\n${newActionsStatements}`)}${fragmentIf(confirmModalName, `
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const draftModeWithConfirm = { ...draftMode, onConfirm: () => setShowConfirmModal(true) };`)}
  if (recordId) {
    return (${fragmentIf(confirmModalName, `
      <>`)}
      <DetailView
        entity="${headerEntity}"${buildDetailEntityAttr(detailEntity)}
        Form={${headerName}Form}${detailEntity && !customLinesComp ? `
        DetailTable={${detailName}Table}
        DetailForm={${detailName}Form}` : ''}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}${detailEntity && !customLinesComp ? `
        addLineFields={addLineFields}` : ''}
        catalogs={catalogs}
        entityLabel="${entityLabel}"${detailEntity ? `
        detailLabel="${entityDetailLabel}"` : ''}
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}${apiProp}${detailTabIndexProp}${secondaryTabsProp}${formFooterProp}${customLinesProp}${primaryTabsProp}${othersLabelProp}${documentPreviewProp}${hideDeleteProp}${customTabsAfterBottomProp}${hidePrintProp}${hideSaveStatusesProp}${hideMoreMenuProp}${hideMoreDetailsProp}${noHeaderBorderProp}${toolbarBorderBottomProp}${compactSidebarPaddingProp}${whiteFormBackgroundProp}${autoSaveOnBlurProp}${hideFormCardProp}${sidebarAboveTabsOnlyProp}${sidebarClassNameProp}${tabsBarPaddingXProp}${primaryTabsVariantProp}${toolbarPaddingXProp}${toolbarButtonSizeProp}${contentBgProp}${formCardPaddingProp}${formScrollPaddingXProp}${notesFieldProp}${customTabsProp}${customCompPropsBlock}${menuActionsProp}${draftModeProp}${requiredHeaderFieldsProp}${addLineGuardProp}${headerContentProp}${detailSortByProp}${titleFieldProp}${salesThemeProp}${disableProcessedLockProp}${statusEnumLabelsProp}${showDetailFooterTotalsProp}${labelOverridesProp}${lineConfigProp}${linesLayoutProp}${balanceFooterProp}${sendDocumentDetailProp}${selectorPriceCurrencyProp}
        {...props}${sidebarContentProp}
      />${confirmModalName ? `
      {showConfirmModal && (
        <${confirmModalName}
          recordId={recordId}
          token={props.token}
          apiBaseUrl={props.apiBaseUrl}
          onClose={(success) => {
            setShowConfirmModal(false);
            if (success) window.location.reload();
          }}
        />
      )}
      </>` : ''}
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
      galleryRenderer={(gProps) => <${headerName}Gallery {...gProps} />}` : ''}${listKpiCardsProp}${listViewOptionsProp}${listBaseFilterProp}${quickFiltersProp}${subsetFiltersProp}${dateFilterKeyProp}${initialHiddenColumnsProp}${bulkActionsProp}${listbarPaddingXProp}${tablePaddingXProp}${hidePrintListProp}${hideMoreMenuListProp}${hideListFiltersProp}${hideLinkProp}${hideEyeCountProp}${labelOverridesListProp}${rowQuickActionsProp}${sendDocumentProp}
      {...props}${customComponents.newRecordComponent ? `
      onNew={() => setShowNewModal(true)}` : ''}${newActionsPropValue}
    />${customComponents.newRecordComponent ? `
    {showNewModal && <${customComponents.newRecordComponent} token={props.token} apiBaseUrl={props.apiBaseUrl} windowName={windowName} onClose={() => setShowNewModal(false)} />}` : ''}${fragmentIf(newActionsWithComponents.length > 0, `\n${newActionsModals}`)}${fragmentIf(needsFragment, `
    </>`)}
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

  // list-modal pages are self-contained (columns + fields live in the Page file and
  // are rendered by the generic ListModalWindow), so the per-entity Table/Form
  // components are not needed and would only add dead files.
  const isListModal = win.layoutType === 'list-modal';

  // Generate Table + Form for each entity
  if (!isListModal) {
    for (const entityName of entityNames) {
      const capName = toJsIdentifier(entityName);
      files[`${capName}Table.jsx`] = generateTableComponent(entityName, contract);
      files[`${capName}Form.jsx`] = generateFormComponent(entityName, contract);
    }
  }

  // Generate Page component (handles both header-detail and header-only layouts)
  files[`${toJsIdentifier(primaryEntity)}Page.jsx`] = generatePageComponent(primaryEntity, detailEntity, contract);

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
    const requiredPart = fragmentIf(p.required, ', required: true');
    const defaultPart = p.defaultValue ? `, defaultValue: '${p.defaultValue.replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '')}'` : '';
    const referencePart = wrapIf(", reference: '", p.referenceValueId, "'");
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
    const requiredPart = fragmentIf(p.required, ', required: true');
    const defaultPart = p.defaultValue ? `, defaultValue: '${p.defaultValue.replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '')}'` : '';
    const referencePart = wrapIf(", reference: '", p.referenceValueId, "'");
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
