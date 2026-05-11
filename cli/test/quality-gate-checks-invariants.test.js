import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInvariantsCheck } from '../src/quality-gate/checks/invariants.js';

function buildFixture({ withViolations = false, pageName = 'SalesOrderPage.jsx', singleLine = false, quantityKey = 'quantity', includePriceListField = true, includeGrossUnitPriceField = false, customFormValue = null } = {}) {
  const rootDir = mkdtempSync(join(tmpdir(), 'quality-gate-invariants-'));
  const windowDir = join(rootDir, 'artifacts', 'sales-order');
  const generatedDir = join(windowDir, 'generated', 'web', 'sales-order');
  mkdirSync(generatedDir, { recursive: true });
  mkdirSync(join(rootDir, 'tools', 'app-shell', 'src', 'windows', 'custom', 'sales-order'), { recursive: true });

  const detailFields = [
    {
      name: 'product',
      required: true,
      lookup: withViolations ? false : true,
      sourceRequired: true,
    },
  ];

  if (includePriceListField) {
    detailFields.push({
      name: 'priceList',
      required: withViolations ? false : true,
      sourceRequired: true,
      derivation: withViolations ? undefined : { type: 'fromParent', source: 'header.priceList' },
    });
  }
  if (includeGrossUnitPriceField) {
    detailFields.push({
      name: 'grossUnitPrice',
      required: false,
      sourceRequired: false,
    });
  }

  const contract = {
    frontendContract: {
      window: {
        primaryEntity: 'header',
        headerExtra: {
          customForm: customFormValue ?? (withViolations ? 'MissingPanel' : 'ExistingPanel'),
        },
      },
      entities: {
        header: {
          draftMode: { enabled: true },
          fields: [
            {
              name: 'documentNo',
              form: true,
              visibility: 'editable',
              required: true,
              sourceRequired: true,
              readOnlyLogic: withViolations ? undefined : { raw: "@Processed@='Y'" },
            },
          ],
        },
        lines: {
          fields: detailFields,
        },
      },
    },
  };

  const hiddenEntries = [];
  if (!withViolations && includeGrossUnitPriceField) hiddenEntries.push("'grossUnitPrice'");
  if (!withViolations && includePriceListField) hiddenEntries.push("'priceList'");
  if (withViolations && includeGrossUnitPriceField) hiddenEntries.push("'grossUnitPrice'");

  const addLineFieldsBlock = singleLine
    ? `const addLineFields = { entry: [{ key: 'product', lookup: true }, { key: '${quantityKey}', defaultValue: 1 }], derived: [], hidden: [${hiddenEntries.join(', ')}] };\n`
    : withViolations
      ? `const addLineFields = {\n  entry: [\n    { key: 'product', lookup: false },\n    { key: '${quantityKey}' },\n  ],\n  hidden: [${hiddenEntries.join(', ')}],\n};\n`
      : `const addLineFields = {\n  entry: [\n    { key: 'product', lookup: true },\n    { key: '${quantityKey}', defaultValue: 1 },\n  ],\n  hidden: [${hiddenEntries.join(', ')}],\n};\n`;

  writeFileSync(join(windowDir, 'contract.json'), JSON.stringify(contract, null, 2));
  writeFileSync(join(generatedDir, pageName), addLineFieldsBlock);
  if (!withViolations) {
    writeFileSync(
      join(rootDir, 'tools', 'app-shell', 'src', 'windows', 'custom', 'sales-order', 'ExistingPanel.jsx'),
      'export default function ExistingPanel() { return null; }',
    );
  }

  return { rootDir, windowDir };
}

describe('runInvariantsCheck', () => {
  it('passes when contract and generated page satisfy the invariants', async () => {
    const { rootDir, windowDir } = buildFixture();

    try {
      const result = await runInvariantsCheck('sales-order', {
        rootDir,
        windowDir,
        config: {
          invariants: {
            addLineFields: {
              requiredProductLookup: true,
              quantityDefaultOne: true,
              hiddenContainsGrossUnitPriceAndPriceList: true,
            },
            draftModeReadOnlyLogic: true,
            notNullRequiresRequired: true,
            customFormPathRoot: '@/windows/custom/',
          },
        },
      });

      assert.deepEqual(result, { status: 'pass', detail: 'All invariants satisfied.' });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('fails and enumerates invariant violations', async () => {
    const { rootDir, windowDir } = buildFixture({ withViolations: true });

    try {
      const result = await runInvariantsCheck('sales-order', {
        rootDir,
        windowDir,
        config: {
          invariants: {
            addLineFields: {
              requiredProductLookup: true,
              quantityDefaultOne: true,
              hiddenContainsGrossUnitPriceAndPriceList: true,
            },
            draftModeReadOnlyLogic: true,
            notNullRequiresRequired: true,
            customFormPathRoot: '@/windows/custom/',
          },
        },
      });

      assert.equal(result.status, 'fail');
      assert.match(result.detail, /documentNo/);
      assert.match(result.detail, /product/);
      assert.match(result.detail, /quantity field/);
      assert.match(result.detail, /priceList/);
      assert.match(result.detail, /MissingPanel/);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('finds addLineFields in non spec-named pages and accepts quantity aliases', async () => {
    const { rootDir, windowDir } = buildFixture({
      pageName: 'HeaderPage.jsx',
      singleLine: true,
      quantityKey: 'orderedQuantity',
      includePriceListField: false,
      includeGrossUnitPriceField: false,
      customFormValue: '@/windows/custom/sales-order/ExistingPanel',
    });

    try {
      const result = await runInvariantsCheck('sales-order', {
        rootDir,
        windowDir,
        config: {
          invariants: {
            addLineFields: {
              requiredProductLookup: true,
              quantityDefaultOne: true,
              hiddenContainsGrossUnitPriceAndPriceList: true,
            },
            draftModeReadOnlyLogic: true,
            notNullRequiresRequired: true,
            customFormPathRoot: '@/windows/custom/',
          },
        },
      });

      assert.deepEqual(result, { status: 'pass', detail: 'All invariants satisfied.' });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('requires grossUnitPrice only when the detail entity actually exposes it', async () => {
    const { rootDir, windowDir } = buildFixture({
      includePriceListField: false,
      includeGrossUnitPriceField: true,
      withViolations: false,
    });

    try {
      const result = await runInvariantsCheck('sales-order', {
        rootDir,
        windowDir,
        config: {
          invariants: {
            addLineFields: {
              requiredProductLookup: true,
              quantityDefaultOne: true,
              hiddenContainsGrossUnitPriceAndPriceList: true,
            },
            draftModeReadOnlyLogic: true,
            notNullRequiresRequired: true,
            customFormPathRoot: '@/windows/custom/',
          },
        },
      });

      assert.equal(result.status, 'pass');
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('allows explicit draftMode readOnlyLogic exceptions for intentionally editable fields', async () => {
    const { rootDir, windowDir } = buildFixture({ withViolations: true });

    try {
      const result = await runInvariantsCheck('sales-order', {
        rootDir,
        windowDir,
        config: {
          invariants: {
            addLineFields: {
              requiredProductLookup: true,
              quantityDefaultOne: true,
              hiddenContainsGrossUnitPriceAndPriceList: true,
            },
            draftModeReadOnlyLogic: true,
            draftModeReadOnlyLogicAllowlist: ['sales-order.header.documentNo'],
            notNullRequiresRequired: true,
            customFormPathRoot: '@/windows/custom/',
          },
        },
      });

      assert.equal(result.status, 'fail');
      assert.doesNotMatch(result.detail, /documentNo/);
      assert.match(result.detail, /product/);
      assert.match(result.detail, /quantity field/);
      assert.match(result.detail, /priceList/);
      assert.match(result.detail, /MissingPanel/);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
