import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'AssetsDetailPanel.jsx'), 'utf8');

describe('AssetsDetailPanel — props and structure', () => {
  it('accepts data, token, apiBaseUrl, catalogs, api, editing, onChange props', () => {
    assert.match(src, /data/);
    assert.match(src, /token/);
    assert.match(src, /apiBaseUrl/);
    assert.match(src, /catalogs/);
    assert.match(src, /editing/);
    assert.match(src, /onChange/);
  });

  it('uses EntityForm for field rendering', () => {
    assert.match(src, /EntityForm/);
    assert.match(src, /from '@\/components\/contract-ui'/);
  });

  it('uses useUI for translations', () => {
    assert.match(src, /useUI/);
    assert.match(src, /from '@\/i18n'/);
  });

  it('echoes pre-filled currency for new records via a guarded useEffect (ETP-4333)', () => {
    assert.match(src, /useEffect/);
    // Echo goes through a stable onChange ref, not the unstable prop directly.
    assert.match(src, /onChangeRef\.current\?\.\('currency', d\.currency\)/);
    // Guard ref keeps the echo to a single fire per new-record session.
    assert.match(src, /currencyEchoedRef/);
    // The unstable `onChange` MUST NOT be in the effect deps — that drove the
    // effect->onChange->setEditing->new onChange->effect feedback loop.
    assert.match(src, /\}, \[isNewRecord, d\?\.currency\]\);/);
  });
});

describe('AssetsDetailPanel — 4 form groups', () => {
  it('renders Group 1: Asset Info fields directly (no subtitle)', () => {
    assert.match(src, /'searchKey'/);
    assert.match(src, /'name'/);
  });

  it('renders Group 2: Financial Info with assetsGroupFinancialTitle', () => {
    assert.match(src, /assetsGroupFinancialTitle/);
  });

  it('renders Group 3: Depreciation Config with assetsGroupDepreciationTitle', () => {
    assert.match(src, /assetsGroupDepreciationTitle/);
  });

  it('renders Group 4: Dates with assetsGroupDatesTitle', () => {
    assert.match(src, /assetsGroupDatesTitle/);
  });

  it('separates groups with GroupDivider (border-t)', () => {
    assert.match(src, /GroupDivider/);
    assert.match(src, /border-t/);
  });
});

describe('AssetsDetailPanel — depreciation conditional logic', () => {
  it('detects depreciate flag from both boolean true and Y string', () => {
    assert.match(src, /depreciate.*===.*true/);
    assert.match(src, /depreciate.*===.*'Y'/);
  });

  it('ToggleCard for depreciate field is always rendered', () => {
    assert.match(src, /ToggleCard/);
    assert.match(src, /fieldKey="depreciate"/);
  });

  it('depreciation fields only render when depreciate is true', () => {
    assert.match(src, /depreciate.*&&/);
    assert.match(src, /deprecFields/);
  });

  it('date fields only render when depreciate is true', () => {
    assert.match(src, /depreciate.*&&/);
    assert.match(src, /dateFields/);
  });

  it('shows disabled hint text when depreciate is false', () => {
    assert.match(src, /assetsDepreciationDisabledHint/);
  });
});

describe('AssetsDetailPanel — field definitions', () => {
  it('defines group1 fields: searchKey, name, assetCategory, description', () => {
    assert.match(src, /'searchKey'/);
    assert.match(src, /'name'/);
    assert.match(src, /'assetCategory'/);
    assert.match(src, /'description'/);
  });

  it('defines group2 fields: currency, assetValue, residualAssetValue, depreciationAmt', () => {
    assert.match(src, /'currency'/);
    assert.match(src, /'assetValue'/);
    assert.match(src, /'residualAssetValue'/);
    assert.match(src, /'depreciationAmt'/);
  });

  it('currency field is always readOnly via readOnlyLogic (ETP-4539), independent of depreciatedPlan/depreciatedValue', () => {
    // Currency is unconditionally read-only now — no dependency on amortization
    // lines existing.
    assert.doesNotMatch(src, /depreciatedPlan/);
    assert.doesNotMatch(src, /depreciatedValue/);
    // Must use a `readOnlyLogic` FUNCTION (always returning true), not a static
    // `readOnly: true` — EntityForm's horizontal-layout render path strips fields
    // with a truthy static `readOnly` entirely instead of just disabling them.
    assert.match(src, /key: 'currency'[\s\S]*?readOnlyLogic: \(\) => true/);
    assert.doesNotMatch(src, /key: 'currency'[\s\S]*?readOnly: true/);
  });

  it('caps name and description with maxLength matching the AD column length (ETP-4984)', () => {
    // Guards against a StringPropertyValidator "Value too long" backend rejection —
    // AD column lengths are 60 (Name) and 255 (Description).
    assert.match(src, /key: 'name'[\s\S]*?maxLength: 60/);
    assert.match(src, /key: 'description'[\s\S]*?maxLength: 255/);
  });

  it('defines Project and Cost Center as dimension field candidates (ETP-4914)', () => {
    // ETP-4914 — corrected matrix: Centro de costo is also "Por config" for Activo
    // (Amortizaciones), not "Nunca" as ETP-4529 originally recorded — its raw AD
    // DisplayLogic is already correctly wired, same pattern as Proyecto's. Contacto
    // (businessPartner) is corrected in this same ETP-4914 pass and is now shown —
    // but it is "Siempre" (gated only by `depreciate`), not a GL-config-gated
    // dimension like Project/Cost Center, so it is deliberately NOT a candidate
    // here; it renders as a plain field directly in group2Fields instead (see the
    // dedicated businessPartner shape test below). Producto is "Siempre" too — it
    // lives in group1Fields as a plain always-visible field, never a dimension
    // candidate, so this array-scoped check doesn't need to mention it.
    const candidatesBlock = src.match(/dimensionFieldCandidates = \[[\s\S]*?\];/)[0];
    assert.match(candidatesBlock, /'C_Project_ID'/);
    assert.match(candidatesBlock, /'EM_Etadas_Costcenter_ID'/);
    // Contacto is shown (see group2Fields), but not as a dimension candidate —
    // it isn't GL-config-gated, only depreciate-gated.
    assert.doesNotMatch(candidatesBlock, /'C_BPartner_ID'/);
    // The 5 out-of-scope dimensions were removed from the panel.
    assert.doesNotMatch(candidatesBlock, /'EM_Etadas_User1_ID'/);
    assert.doesNotMatch(candidatesBlock, /'EM_Etadas_User2_ID'/);
    assert.doesNotMatch(candidatesBlock, /'EM_Etadas_Salesregion_ID'/);
    assert.doesNotMatch(candidatesBlock, /'EM_Etadas_C_Activity_ID'/);
    assert.doesNotMatch(candidatesBlock, /'EM_Etadas_Campaign_ID'/);
  });

  it('defines businessPartner (Contacto) as a plain group2Fields entry using a search-select, not the product lookup modal (ETP-4914)', () => {
    // Contacto is "Siempre" for this Cabecera per the corrected matrix — rendered
    // directly in group2Fields, gated only by `depreciate` (not a dimension
    // candidate — see the test above). It must resolve to the plain
    // SearchSelectField -> CreatableSearchSelect path (same as sales-order's own
    // C_BPartner_ID field), so `lookup`/`popup` — which would route it to the
    // product-search modal instead — must be absent.
    const group2Block = src.match(/group2Fields = \[[\s\S]*?\];/)[0];
    assert.match(group2Block, /'businessPartner'/);
    const bpFieldMatch = group2Block.match(/\{ key: 'businessPartner'[^}]*\}/);
    assert.ok(bpFieldMatch, 'businessPartner field definition not found in group2Fields');
    const bpField = bpFieldMatch[0];
    assert.match(bpField, /column: 'C_BPartner_ID'/);
    assert.doesNotMatch(bpField, /lookup:\s*true/);
    assert.doesNotMatch(bpField, /popup:\s*true/);
  });

  it('defines product as a plain, always-visible group1Fields entry (ETP-4529 — Siempre)', () => {
    const group1Block = src.match(/group1Fields = \[[\s\S]*?\];/)[0];
    assert.match(group1Block, /'product'/);
    assert.match(group1Block, /'M_Product_ID'/);
    assert.match(group1Block, /reference: 'Product'/);
  });

  it('resolves final dimension visibility via the shared evaluate-display hook (ETP-4529)', () => {
    // Candidates are no longer rendered unconditionally — useAccountingDimensionFields
    // (wrapping the same evaluate-display evaluator DetailView uses) decides the final
    // visible set per the client's accounting-dimension configuration.
    assert.match(src, /from '@\/hooks\/useAccountingDimensionFields'/);
    assert.match(src, /useAccountingDimensionFields\('assets', d, dimensionFieldCandidates, \{ token, apiBaseUrl \}\)/);
  });
});

describe('AssetsDetailPanel — accounting dimensions section', () => {
  it('renders the dimensions group with assetsGroupDimensionsTitle', () => {
    assert.match(src, /assetsGroupDimensionsTitle/);
  });

  it('renders dimensions in a 4-column grid', () => {
    assert.match(src, /fields=\{dimensionFields\}/);
    assert.match(src, /cols=\{4\}/);
  });

  it('only renders the dimensions section when depreciate is true', () => {
    // The dimensions block is guarded by the same depreciate flag as Dates.
    assert.match(src, /depreciate && \([\s\S]*?assetsGroupDimensionsTitle/);
  });

  it('includes the kept dimension keys and businessPartner in the read-only field set', () => {
    // readOnlyAll locks these fields when the panel is not in edit mode. Contacto
    // (businessPartner) belongs here too — it's a depreciate-gated field (ETP-4914,
    // shown per the corrected matrix), not a dimension, but it must still freeze
    // like the rest of group2Fields/group1Fields when editing is off.
    const readOnlyBlock = src.match(/readOnlyAll = [\s\S]*?\.map\(k => \[k, true\]\)\)/)[0];
    assert.match(readOnlyBlock, /'eTADASCostCenter'/);
    assert.match(readOnlyBlock, /'businessPartner'/);
    assert.match(readOnlyBlock, /'product'/);
    assert.doesNotMatch(readOnlyBlock, /'eTADASSalesCampaign'/);
  });
});

describe('AssetsDetailPanel — visual style', () => {
  it('applies semantic card backgrounds with matching input/textarea overrides', () => {
    assert.match(src, /bg-card/);
    assert.match(src, /\[&_input\]:bg-card/);
    assert.match(src, /\[&_textarea\]:bg-card/);
  });

  it('applies p-2 padding to root container', () => {
    assert.match(src, /p-2/);
  });
});
