import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveCurated } from '../src/resolve-curated.js';

describe('resolveCurated', () => {
  it('applies entity, field, window, draft mode, and explicit rule decisions', async () => {
    const schemaRaw = {
      window: { id: '100', name: 'Sales Order' },
      entities: [{
        name: 'cOrder',
        tableName: 'C_Order',
        tabId: '10',
        tabName: 'Header',
        fields: [{
          name: 'businessPartner',
          columnName: 'C_BPartner_ID',
          label: 'Business Partner',
          type: 'foreignKey',
          visibility: 'editable',
          mandatory: true,
          reference: { type: 'Search', targetTable: 'C_BPartner' },
          readOnlyLogic: '@Processed@=Y',
          displayLogic: '@IsSOTrx@=Y',
          callout: 'SL_Order_BPartner',
          validationRule: '@AD_Org_ID@',
        }, {
          name: 'internalFlag',
          columnName: 'EM_Internal_Flag',
          label: 'Internal Flag',
          type: 'boolean',
          visibility: 'editable',
        }, {
          name: 'documentAction',
          columnName: 'DocAction',
          label: 'Document Action',
          type: 'button',
          visibility: 'editable',
          processId: '111',
          processType: 'classic',
        }],
      }],
    };

    const decisions = {
      version: 2,
      discardPatterns: ['EM_*'],
      window: {
        name: 'Order Entry',
        layoutType: 'document',
        hidePrint: true,
        hideMoreMenu: true,
        hideSaveStatuses: ['CO'],
        contentBg: null,
        breadcrumb: false,
        summaryFields: ['grandTotal'],
        detailTabIndex: 0,
        detailEntity: null,
        salesTheme: false,
        noHeaderBorder: true,
        draftMode: {
          enabled: true,
          processField: 'documentAction',
          processValue: 'CO',
          label: 'Complete',
          completedStatuses: ['CO', 'CL'],
        },
      },
      entities: {
        cOrder: {
          name: 'order',
          formCols: 3,
          javaQualifier: 'sales-order',
          fields: {
            businessPartner: {
              label: 'Customer',
              grid: true,
              searchable: true,
              inputMode: null,
              reference: null,
              displayLogic: null,
              readOnlyLogic: null,
              displayLogicJs: 'isSales',
              forceCalloutFields: ['priceList'],
              order: 2,
            },
            internalFlag: {
              visibility: 'editable',
              badge: true,
              order: 1,
            },
          },
        },
      },
      rules: {
        SL_Order_BPartner_C_BPartner_ID: {
          type: 'callout',
          entity: 'order',
          decision: 'Keep',
          description: 'Default order values from the selected customer.',
          impactIfOmitted: 'Customer defaults would not be applied.',
          translated: { expression: 'customerChanged' },
        },
      },
    };

    const { schema, rules } = await resolveCurated(schemaRaw, { rules: [] }, decisions);

    assert.deepEqual(schema.window, {
      id: '100',
      name: 'Order Entry',
      primaryEntity: 'order',
      category: 'sales',
      layoutType: 'document',
      hidePrint: true,
      hideSaveStatuses: ['CO'],
      hideMoreMenu: true,
      contentBg: null,
      breadcrumb: false,
      detailTabIndex: 0,
      detailEntity: null,
      summaryFields: ['grandTotal'],
      salesTheme: false,
      noHeaderBorder: true,
      // ETP-3914 — rowQuickActions intentionally absent: feature is ON by default,
      // contract only carries the block when the user overrides defaults.
    });

    assert.equal(schema.entities.length, 1);
    assert.deepEqual(schema.entities[0].draftMode, {
      enabled: true,
      processField: 'documentAction',
      processValue: 'CO',
      label: 'Complete',
      completedStatuses: ['CO', 'CL'],
    });
    assert.equal(schema.entities[0].javaQualifier, 'sales-order');
    assert.equal(schema.entities[0].formCols, 3);

    const [internalFlag, businessPartner, documentAction] = schema.entities[0].fields;
    assert.equal(internalFlag.name, 'internalFlag');
    assert.equal(internalFlag.visibility, 'editable');
    assert.equal(internalFlag.badge, true);

    assert.equal(businessPartner.name, 'businessPartner');
    assert.equal(businessPartner.label, 'Customer');
    assert.equal(businessPartner.sourceRequired, true);
    assert.equal(businessPartner.grid, true);
    assert.equal(businessPartner.form, true);
    assert.equal(businessPartner.searchable, true);
    assert.equal(businessPartner.reference, undefined);
    assert.equal(businessPartner.inputMode, undefined);
    assert.equal(businessPartner.readOnlyLogic, '@Processed@=Y');
    assert.equal(businessPartner.displayLogic, undefined);
    assert.equal(businessPartner.displayLogicJs, 'isSales');
    assert.deepEqual(businessPartner.forceCalloutFields, ['priceList']);
    assert.equal(businessPartner.callout, 'SL_Order_BPartner');
    assert.equal(businessPartner.validationRule, '@AD_Org_ID@');

    assert.equal(documentAction.processId, '111');
    assert.equal(documentAction.processType, 'classic');

    assert.deepEqual(rules, [{
      name: 'SL_Order_BPartner_C_BPartner_ID',
      type: 'callout',
      entity: 'order',
      decision: 'Keep',
      description: 'Default order values from the selected customer.',
      impactIfOmitted: 'Customer defaults would not be applied.',
      translated: { expression: 'customerChanged' },
    }]);
  });
});

// ─── F3 refactor — lookupDrawer / lookupTitle / onSelectMappings / displayFromCatalog ───
describe('resolveCurated — field-level drawer + display passthroughs (F3)', () => {
  const schemaRaw = {
    window: { id: '600', name: 'Internal Consumption' },
    entities: [{
      name: 'mInternalConsumptionLine',
      tableName: 'M_InternalConsumptionLine',
      tabId: '10',
      tabName: 'Lines',
      fields: [
        { name: 'product', columnName: 'M_Product_ID', label: 'Product', type: 'foreignKey',
          visibility: 'editable', reference: { type: 'Search', targetTable: 'M_Product' } },
        { name: 'displayedProduct', columnName: 'DisplayedProduct_ID', label: 'Displayed Product',
          type: 'foreignKey', visibility: 'editable',
          reference: { type: 'Search', targetTable: 'M_Product' } },
        { name: 'plain', columnName: 'PlainCol', label: 'Plain', type: 'string', visibility: 'editable' },
      ],
    }],
  };

  const decisions = {
    version: 2,
    window: { name: 'Internal Consumption' },
    entities: {
      mInternalConsumptionLine: {
        name: 'internalConsumptionLine',
        fields: {
          product: {
            lookupDrawer: 'internal-consumption-product',
            lookupTitle: 'Product + Warehouse',
            onSelectMappings: [
              { from: 'M_Locator_ID', to: 'storageBin' },
              { from: 'M_Product_ID', to: 'product' },
            ],
          },
          displayedProduct: { displayFromCatalog: true },
          plain: {},
        },
      },
    },
    rules: {},
  };

  it('passes lookupDrawer + lookupTitle from decisions to curated field', async () => {
    const { schema } = await resolveCurated(schemaRaw, { rules: [] }, decisions);
    const product = schema.entities[0].fields.find(f => f.name === 'product');
    assert.equal(product.lookupDrawer, 'internal-consumption-product');
    assert.equal(product.lookupTitle, 'Product + Warehouse');
  });

  it('passes onSelectMappings array from decisions to curated field', async () => {
    const { schema } = await resolveCurated(schemaRaw, { rules: [] }, decisions);
    const product = schema.entities[0].fields.find(f => f.name === 'product');
    assert.deepEqual(product.onSelectMappings, [
      { from: 'M_Locator_ID', to: 'storageBin' },
      { from: 'M_Product_ID', to: 'product' },
    ]);
  });

  it('passes displayFromCatalog from decisions to curated field', async () => {
    const { schema } = await resolveCurated(schemaRaw, { rules: [] }, decisions);
    const dp = schema.entities[0].fields.find(f => f.name === 'displayedProduct');
    assert.equal(dp.displayFromCatalog, true);
  });

  it('does NOT add any of the four properties when not declared', async () => {
    const { schema } = await resolveCurated(schemaRaw, { rules: [] }, decisions);
    const plain = schema.entities[0].fields.find(f => f.name === 'plain');
    assert.equal(plain.lookupDrawer, undefined);
    assert.equal(plain.lookupTitle, undefined);
    assert.equal(plain.onSelectMappings, undefined);
    assert.equal(plain.displayFromCatalog, undefined);
  });

  it('ignores empty onSelectMappings array (does not set property)', async () => {
    const emptyDecisions = JSON.parse(JSON.stringify(decisions));
    emptyDecisions.entities.mInternalConsumptionLine.fields.product.onSelectMappings = [];
    const { schema } = await resolveCurated(schemaRaw, { rules: [] }, emptyDecisions);
    const product = schema.entities[0].fields.find(f => f.name === 'product');
    assert.equal(product.onSelectMappings, undefined);
  });
});

describe('resolveCurated — agentPrompt passthrough (ETP-4252)', () => {
  const schemaRaw = {
    window: { id: '700', name: 'Purchase Order' },
    entities: [{
      name: 'order', tableName: 'C_Order', tabId: '1', tabName: 'Header',
      fields: [
        { name: 'docStatus', columnName: 'DocStatus', label: 'Status', type: 'string', visibility: 'editable' },
        { name: 'plain', columnName: 'PlainCol', label: 'Plain', type: 'string', visibility: 'editable' },
      ],
    }],
  };
  const decisions = {
    version: 2,
    window: { name: 'Purchase Order', agentPrompt: 'Confirm before completing.' },
    entities: {
      order: {
        name: 'order',
        fields: {
          docStatus: { agentPrompt: 'Only advance status forward.' },
          plain: {},
        },
      },
    },
    rules: {},
  };

  it('copies window.agentPrompt into the curated window', async () => {
    const { schema } = await resolveCurated(schemaRaw, { rules: [] }, decisions);
    assert.equal(schema.window.agentPrompt, 'Confirm before completing.');
  });

  it('copies field agentPrompt into the curated field', async () => {
    const { schema } = await resolveCurated(schemaRaw, { rules: [] }, decisions);
    const docStatus = schema.entities[0].fields.find(f => f.name === 'docStatus');
    assert.equal(docStatus.agentPrompt, 'Only advance status forward.');
  });

  it('omits agentPrompt when a field does not declare one', async () => {
    const { schema } = await resolveCurated(schemaRaw, { rules: [] }, decisions);
    const plain = schema.entities[0].fields.find(f => f.name === 'plain');
    assert.equal(plain.agentPrompt, undefined);
  });
});

describe('resolveCurated — excludeValueOf passthrough', () => {
  const schemaRaw = {
    window: { id: '900', name: 'Goods Movements' },
    entities: [{
      name: 'movementLine',
      tableName: 'M_MovementLine',
      tabId: '10',
      tabName: 'Lines',
      fields: [
        { name: 'storageBin', columnName: 'M_Locator_ID', label: 'Origin Bin', type: 'foreignKey',
          visibility: 'editable', reference: { type: 'Search', targetTable: 'M_Locator' } },
        { name: 'newStorageBin', columnName: 'M_LocatorTo_ID', label: 'Destination Bin', type: 'foreignKey',
          visibility: 'editable', reference: { type: 'Search', targetTable: 'M_Locator' } },
        { name: 'plain', columnName: 'PlainCol', label: 'Plain', type: 'string', visibility: 'editable' },
      ],
    }],
  };

  const decisions = {
    version: 2,
    window: { name: 'Goods Movements' },
    entities: {
      movementLine: {
        name: 'movementLine',
        fields: {
          newStorageBin: { excludeValueOf: 'storageBin' },
          plain: {},
        },
      },
    },
    rules: {},
  };

  it('copies field excludeValueOf into the curated field', async () => {
    const { schema } = await resolveCurated(schemaRaw, { rules: [] }, decisions);
    const newBin = schema.entities[0].fields.find(f => f.name === 'newStorageBin');
    assert.equal(newBin.excludeValueOf, 'storageBin');
  });

  it('omits excludeValueOf when a field does not declare one', async () => {
    const { schema } = await resolveCurated(schemaRaw, { rules: [] }, decisions);
    const plain = schema.entities[0].fields.find(f => f.name === 'plain');
    assert.equal(plain.excludeValueOf, undefined);
    const originBin = schema.entities[0].fields.find(f => f.name === 'storageBin');
    assert.equal(originBin.excludeValueOf, undefined);
  });
});

// ─── virtualFields — appendVirtualFields exercised via resolveCurated ───
describe('resolveCurated — virtualFields', () => {
  const baseSchema = {
    window: { id: '200', name: 'Return Receipt' },
    entities: [{
      name: 'returnMaterialReceipt',
      tableName: 'M_InOut',
      tabId: '20',
      tabName: 'Header',
      fields: [
        { name: 'documentNo', columnName: 'DocumentNo', label: 'Document No', type: 'string', visibility: 'readOnly' },
      ],
    }],
  };

  it('virtual field appears in curated fields with virtual: true', async () => {
    const decisions = {
      version: 2,
      window: { name: 'Return Receipt' },
      entities: {
        returnMaterialReceipt: {
          name: 'returnReceipt',
          virtualFields: [{ name: 'totalReturned', label: 'Total Returned', type: 'decimal' }],
          fields: {},
        },
      },
      rules: {},
    };

    const { schema } = await resolveCurated(baseSchema, { rules: [] }, decisions);
    const vf = schema.entities[0].fields.find(f => f.name === 'totalReturned');
    assert.ok(vf, 'virtual field should be present');
    assert.equal(vf.virtual, true);
    assert.equal(vf.type, 'decimal');
    assert.equal(vf.label, 'Total Returned');
  });

  it('applies defaults when optional properties are omitted', async () => {
    const decisions = {
      version: 2,
      window: { name: 'Return Receipt' },
      entities: {
        returnMaterialReceipt: {
          name: 'returnReceipt',
          virtualFields: [{ name: 'minimalField' }],
          fields: {},
        },
      },
      rules: {},
    };

    const { schema } = await resolveCurated(baseSchema, { rules: [] }, decisions);
    const vf = schema.entities[0].fields.find(f => f.name === 'minimalField');
    assert.ok(vf, 'minimal virtual field should be present');
    assert.equal(vf.virtual, true);
    assert.equal(vf.column, 'minimalField');
    assert.equal(vf.label, 'minimalField');
    assert.equal(vf.type, 'string');
    assert.equal(vf.visibility, 'readOnly');
    assert.equal(vf.required, false);
    assert.equal(vf.form, true);
    assert.equal(vf.grid, true);
    assert.equal(vf.section, 'other');
    assert.equal(vf.gridOrder, undefined);
  });

  it('column falls back to name when not specified', async () => {
    const decisions = {
      version: 2,
      window: { name: 'Return Receipt' },
      entities: {
        returnMaterialReceipt: {
          name: 'returnReceipt',
          virtualFields: [{ name: 'computedStatus' }],
          fields: {},
        },
      },
      rules: {},
    };

    const { schema } = await resolveCurated(baseSchema, { rules: [] }, decisions);
    const vf = schema.entities[0].fields.find(f => f.name === 'computedStatus');
    assert.equal(vf.column, 'computedStatus');
  });

  it('explicit column overrides name fallback', async () => {
    const decisions = {
      version: 2,
      window: { name: 'Return Receipt' },
      entities: {
        returnMaterialReceipt: {
          name: 'returnReceipt',
          virtualFields: [{ name: 'myField', column: 'customColumnKey' }],
          fields: {},
        },
      },
      rules: {},
    };

    const { schema } = await resolveCurated(baseSchema, { rules: [] }, decisions);
    const vf = schema.entities[0].fields.find(f => f.name === 'myField');
    assert.equal(vf.column, 'customColumnKey');
  });

  it('empty virtualFields array adds no virtual fields', async () => {
    const decisions = {
      version: 2,
      window: { name: 'Return Receipt' },
      entities: {
        returnMaterialReceipt: {
          name: 'returnReceipt',
          virtualFields: [],
          fields: {},
        },
      },
      rules: {},
    };

    const { schema } = await resolveCurated(baseSchema, { rules: [] }, decisions);
    const virtualFields = schema.entities[0].fields.filter(f => f.virtual === true);
    assert.equal(virtualFields.length, 0);
  });
});

// ─── gridReadOnly — FIELD_DECISION_COPY_PROPS passthrough ───────────────────
describe('resolveCurated — gridReadOnly passthrough', () => {
  const schemaRaw = {
    window: { id: '901', name: 'Return To Vendor Shipment' },
    entities: [{
      name: 'rtvShipment',
      tableName: 'M_InOut',
      tabId: '50',
      tabName: 'Header',
      fields: [
        { name: 'quantity', columnName: 'Qty', label: 'Quantity',
          type: 'number', visibility: 'editable', mandatory: false },
        { name: 'product', columnName: 'M_Product_ID', label: 'Product',
          type: 'foreignKey', visibility: 'editable', mandatory: false },
      ],
    }],
  };

  const decisionsWithGridReadOnly = {
    version: 2,
    window: { name: 'Return To Vendor Shipment' },
    entities: {
      rtvShipment: {
        name: 'returnToVendorShipment',
        fields: {
          quantity: { gridReadOnly: true },
          product: {},
        },
      },
    },
    rules: {},
  };

  it('copies gridReadOnly: true from decisions to the curated field', async () => {
    const { schema } = await resolveCurated(schemaRaw, { rules: [] }, decisionsWithGridReadOnly);
    const qty = schema.entities[0].fields.find(f => f.name === 'quantity');
    assert.equal(qty.gridReadOnly, true);
  });

  it('does NOT set gridReadOnly on a field that lacks it in decisions', async () => {
    const { schema } = await resolveCurated(schemaRaw, { rules: [] }, decisionsWithGridReadOnly);
    const product = schema.entities[0].fields.find(f => f.name === 'product');
    assert.equal(product.gridReadOnly, undefined);
  });

  it('does NOT set gridReadOnly when decisions field entry is absent', async () => {
    const decisionsNoGridReadOnly = {
      version: 2,
      window: { name: 'Return To Vendor Shipment' },
      entities: {
        rtvShipment: {
          name: 'returnToVendorShipment',
          fields: {
            quantity: {},
            product: {},
          },
        },
      },
      rules: {},
    };
    const { schema } = await resolveCurated(schemaRaw, { rules: [] }, decisionsNoGridReadOnly);
    const qty = schema.entities[0].fields.find(f => f.name === 'quantity');
    assert.equal(qty.gridReadOnly, undefined);
  });
});

// ─── businessCritical per-field flag (ETP-4233) ──────────────────────────────

describe('resolveCurated — businessCritical per-field flag (ETP-4233)', () => {
  const baseSchema = {
    window: { id: '200', name: 'Sales Order' },
    entities: [{
      name: 'cOrder',
      tableName: 'C_Order',
      tabId: '10',
      tabName: 'Header',
      fields: [
        { name: 'documentNo', columnName: 'DocumentNo', label: 'Document No',
          type: 'string', visibility: 'readOnly' },
        { name: 'description', columnName: 'Description', label: 'Description',
          type: 'string', visibility: 'editable' },
      ],
    }],
  };

  it('decision businessCritical:true propagates to curated field', async () => {
    const decisions = {
      version: 2,
      window: { name: 'Sales Order' },
      entities: {
        cOrder: {
          name: 'order',
          fields: {
            documentNo: { businessCritical: true },
          },
        },
      },
      rules: {},
    };
    const { schema } = await resolveCurated(baseSchema, { rules: [] }, decisions);
    const field = schema.entities[0].fields.find(f => f.name === 'documentNo');
    assert.equal(field.businessCritical, true);
  });

  it('decision without businessCritical leaves field without the property', async () => {
    const decisions = {
      version: 2,
      window: { name: 'Sales Order' },
      entities: {
        cOrder: {
          name: 'order',
          fields: {
            description: {},
          },
        },
      },
      rules: {},
    };
    const { schema } = await resolveCurated(baseSchema, { rules: [] }, decisions);
    const field = schema.entities[0].fields.find(f => f.name === 'description');
    assert.equal(field.businessCritical, undefined,
      'businessCritical should be absent when not declared in decisions');
  });
});

// ─── ETP-4277 — max constraint propagation ───────────────────────────────────
describe('resolveCurated — max field constraint (ETP-4277)', () => {
  const schemaRaw = {
    window: { id: '800', name: 'Sales Order' },
    entities: [{
      name: 'cOrderLine',
      tableName: 'C_OrderLine',
      tabId: '20',
      tabName: 'Lines',
      fields: [
        { name: 'discount', columnName: 'Discount', label: 'Discount', type: 'number', visibility: 'editable' },
        { name: 'quantity', columnName: 'QtyOrdered', label: 'Quantity', type: 'number', visibility: 'editable' },
      ],
    }],
  };

  it('propagates max from field decision to curated field', async () => {
    const decisions = {
      version: 2,
      window: { name: 'Sales Order' },
      entities: {
        cOrderLine: {
          name: 'orderLine',
          fields: {
            discount: { max: 100 },
            quantity: {},
          },
        },
      },
      rules: {},
    };
    const { schema } = await resolveCurated(schemaRaw, { rules: [] }, decisions);
    const discount = schema.entities[0].fields.find(f => f.name === 'discount');
    assert.equal(discount.max, 100);
  });

  it('does not add max property when not declared in field decision', async () => {
    const decisions = {
      version: 2,
      window: { name: 'Sales Order' },
      entities: {
        cOrderLine: {
          name: 'orderLine',
          fields: {
            discount: { max: 100 },
            quantity: {},
          },
        },
      },
      rules: {},
    };
    const { schema } = await resolveCurated(schemaRaw, { rules: [] }, decisions);
    const quantity = schema.entities[0].fields.find(f => f.name === 'quantity');
    assert.equal(quantity.max, undefined);
  });

  it('propagates max: 0 (zero is a valid constraint)', async () => {
    const decisions = {
      version: 2,
      window: { name: 'Sales Order' },
      entities: {
        cOrderLine: {
          name: 'orderLine',
          fields: {
            discount: { max: 0 },
          },
        },
      },
      rules: {},
    };
    const { schema } = await resolveCurated(schemaRaw, { rules: [] }, decisions);
    const discount = schema.entities[0].fields.find(f => f.name === 'discount');
    assert.equal(discount.max, 0);
  });

  it('propagates both min and max when both are declared', async () => {
    const decisions = {
      version: 2,
      window: { name: 'Sales Order' },
      entities: {
        cOrderLine: {
          name: 'orderLine',
          fields: {
            discount: { min: 0, max: 100 },
          },
        },
      },
      rules: {},
    };
    const { schema } = await resolveCurated(schemaRaw, { rules: [] }, decisions);
    const discount = schema.entities[0].fields.find(f => f.name === 'discount');
    assert.equal(discount.min, 0);
    assert.equal(discount.max, 100);
  });
});
