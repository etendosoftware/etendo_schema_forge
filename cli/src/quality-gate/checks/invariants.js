import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectSourceFiles, isJavaScriptModule, readJson } from './shared.js';

const NON_EDITABLE_VISIBILITIES = new Set(['discarded', 'system', 'readOnly']);
const SERVER_DEFAULT_DERIVATIONS = new Set(['sequence', 'fromParent', 'fromConfig']);

function readContract(windowDir) {
  const contractPath = join(windowDir, 'contract.json');
  return existsSync(contractPath) ? readJson(contractPath) : null;
}

function getAddLineFieldsSource(pageSource) {
  const match = pageSource.match(/const addLineFields = \{[\s\S]*?\};/);
  return match ? match[0] : null;
}

function findAddLineFieldsSource(windowDir, windowName) {
  const generatedDir = join(windowDir, 'generated', 'web', windowName);
  const files = collectSourceFiles(generatedDir, isJavaScriptModule);
  for (const filePath of files) {
    const source = readFileSync(filePath, 'utf8');
    const block = getAddLineFieldsSource(source);
    if (block) {
      return block;
    }
  }
  return null;
}

function hasServerDefault(field) {
  if (field.callout) {
    return true;
  }
  return SERVER_DEFAULT_DERIVATIONS.has(field.derivation?.type);
}

function findCustomFormDeclarations(windowConfig) {
  const declarations = [];
  if (windowConfig?.headerExtra?.customForm) {
    declarations.push({ location: 'window.headerExtra.customForm', component: windowConfig.headerExtra.customForm });
  }
  for (const [key, value] of Object.entries(windowConfig?.secondaryTabs ?? {})) {
    if (value?.customForm) {
      declarations.push({ location: `window.secondaryTabs.${key}.customForm`, component: value.customForm });
    }
  }
  return declarations;
}

function customFormExists(rootDir, windowName, component) {
  const componentName = component.split('/').at(-1);
  return existsSync(join(rootDir, 'artifacts', windowName, 'custom', `${componentName}.jsx`))
    || existsSync(join(rootDir, 'tools', 'app-shell', 'src', 'windows', 'custom', windowName, `${componentName}.jsx`));
}

function findDetailEntityName(entities, primaryEntity) {
  if (entities.lines) {
    return 'lines';
  }
  return Object.keys(entities).find((entityName) => entityName !== primaryEntity) ?? null;
}

function hasHiddenKey(addLineFieldsSource, key) {
  const hiddenMatch = addLineFieldsSource.match(/hidden:\s*\[([\s\S]*?)\]/);
  if (!hiddenMatch) {
    return false;
  }
  const hiddenSource = hiddenMatch[1];
  return new RegExp(`['\"]${key}['\"]|key:\s*['\"]${key}['\"]`).test(hiddenSource);
}

function findQuantityEntrySource(addLineFieldsSource) {
  const entryMatch = addLineFieldsSource.match(/entry:\s*\[([\s\S]*?)\]/);
  if (!entryMatch) {
    return null;
  }
  const entrySource = entryMatch[1];
  const objectMatches = entrySource.match(/\{[\s\S]*?\}/g) ?? [];
  return objectMatches.find((objectSource) => /key:\s*['"][^'"]*(quantity|qty)[^'"]*['"]/i.test(objectSource)) ?? null;
}

function isDraftModeReadOnlyLogicAllowed(windowName, primaryEntity, fieldName, allowlist = []) {
  const fullKey = `${windowName}.${primaryEntity}.${fieldName}`;
  const localKey = `${primaryEntity}.${fieldName}`;
  return allowlist.includes(fullKey) || allowlist.includes(localKey);
}

export async function runInvariantsCheck(windowName, { rootDir, windowDir, config }) {
  const contract = readContract(windowDir);
  if (!contract?.frontendContract) {
    return { status: 'skip', detail: 'contract.json is missing frontendContract.' };
  }

  const violations = [];
  const entities = contract.frontendContract.entities ?? {};
  const primaryEntity = contract.frontendContract.window?.primaryEntity ?? Object.keys(entities)[0] ?? null;
  const headerEntity = primaryEntity ? entities[primaryEntity] : null;
  const anyDraftMode = Object.values(entities).some((entity) => entity?.draftMode?.enabled === true);
  const draftModeReadOnlyLogicAllowlist = config?.invariants?.draftModeReadOnlyLogicAllowlist ?? [];

  if (config?.invariants?.draftModeReadOnlyLogic && anyDraftMode && headerEntity?.fields) {
    for (const field of headerEntity.fields) {
      if (!field.form || NON_EDITABLE_VISIBILITIES.has(field.visibility)) {
        continue;
      }
      if (isDraftModeReadOnlyLogicAllowed(windowName, primaryEntity, field.name, draftModeReadOnlyLogicAllowlist)) {
        continue;
      }
      if (!field.readOnlyLogic) {
        violations.push(`${primaryEntity}.${field.name} missing readOnlyLogic while draftMode is enabled.`);
      }
    }
  }

  if (config?.invariants?.notNullRequiresRequired) {
    for (const [entityName, entity] of Object.entries(entities)) {
      for (const field of entity.fields ?? []) {
        if (field.sourceRequired === true && field.required !== true && !hasServerDefault(field)) {
          violations.push(`${entityName}.${field.name} must remain required because the source column is NOT NULL.`);
        }
      }
    }
  }

  const detailEntityName = findDetailEntityName(entities, primaryEntity);
  const detailEntity = detailEntityName ? entities[detailEntityName] : null;
  const detailFieldNames = new Set((detailEntity?.fields ?? []).map((field) => field.name));
  const addLineFieldsSource = config?.invariants?.addLineFields && detailEntityName === 'lines'
    ? findAddLineFieldsSource(windowDir, windowName)
    : null;

  if (addLineFieldsSource) {
    if (
      config.invariants.addLineFields.requiredProductLookup
      && detailFieldNames.has('product')
      && !/key:\s*'product'[\s\S]*?lookup:\s*true/.test(addLineFieldsSource)
    ) {
      violations.push('lines.addLineFields.product must declare lookup: true.');
    }

    if (config.invariants.addLineFields.quantityDefaultOne) {
      const quantityEntrySource = findQuantityEntrySource(addLineFieldsSource);
      if (quantityEntrySource && !/defaultValue:\s*1/.test(quantityEntrySource)) {
        violations.push('lines.addLineFields quantity field must declare defaultValue: 1.');
      }
    }

    if (config.invariants.addLineFields.hiddenContainsGrossUnitPriceAndPriceList) {
      if (detailFieldNames.has('grossUnitPrice') && !hasHiddenKey(addLineFieldsSource, 'grossUnitPrice')) {
        violations.push("lines.addLineFields.hidden must include 'grossUnitPrice'.");
      }
      if (detailFieldNames.has('priceList') && !hasHiddenKey(addLineFieldsSource, 'priceList')) {
        violations.push("lines.addLineFields.hidden must include 'priceList'.");
      }
    }
  }

  const customFormPathRoot = config?.invariants?.customFormPathRoot ?? null;
  for (const declaration of findCustomFormDeclarations(contract.frontendContract.window)) {
    if (
      customFormPathRoot
      && (declaration.component.includes('/') || declaration.component.startsWith('@/'))
      && !declaration.component.startsWith(customFormPathRoot)
    ) {
      violations.push(`${declaration.location} must stay under '${customFormPathRoot}'.`);
      continue;
    }
    if (!customFormExists(rootDir, windowName, declaration.component)) {
      violations.push(`${declaration.location} references '${declaration.component}', but no local custom form exists for ${windowName}.`);
    }
  }

  if (violations.length > 0) {
    return {
      status: 'fail',
      detail: violations.join(' '),
    };
  }

  return { status: 'pass', detail: 'All invariants satisfied.' };
}
