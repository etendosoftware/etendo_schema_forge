import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * NEO read-only field rejection on create — live integration (IMP-28 clause 2 / ETP-4793).
 *
 * `NeoFieldFilter.filterCreateRequest` now throws `ReadOnlyFieldRejectedException` — turned
 * by `NeoCrudHandler` into a structured 422 — instead of silently dropping a client-supplied
 * value for a field that is `IsIncluded=Y`, `IsReadOnly=Y`, has no AD-configured default, and
 * belongs to an entity with no `Java_Qualifier` (no NeoHandler that could legitimately have
 * supplied it). Before the fix such a write answered 200 with the value discarded and no
 * indication anything happened — a silent no-op an MCP agent or the UI could not detect.
 *
 * (spec, entity, field) triple used here: `asset-group` / `assetCategory` / `helpComment`
 * (DAL property `Help`, DB column `Help` on `A_Asset_Group`). All four IMP-28-clause-2
 * conditions were confirmed live against this environment's ETGO_SF_FIELD/ETGO_SF_ENTITY/
 * AD_Column rows (query below) — every condition must hold for the rejection to fire, so a
 * future config change to any one of them silently turns this into a false positive rather
 * than a red test:
 * <pre>
 * SELECT f.isincluded, f.isreadonly, c.columnname, c.defaultvalue, e.java_qualifier
 * FROM etgo_sf_field f
 * JOIN etgo_sf_entity e ON e.etgo_sf_entity_id = f.etgo_sf_entity_id
 * JOIN etgo_sf_spec s ON s.etgo_sf_spec_id = e.etgo_sf_spec_id
 * JOIN ad_column c ON c.ad_column_id = f.ad_column_id
 * WHERE s.name='asset-group' AND e.name='assetCategory' AND f.java_qualifier='helpComment';
 * -- => isincluded=Y, isreadonly=Y, defaultvalue=<blank>, java_qualifier=<blank>
 * </pre>
 * i.e. `IsIncluded=Y` (the field reaches the filter at all), `IsReadOnly=Y` (it is the
 * clause the exception targets), no `AD_Column.DefaultValue` (no legitimate source could
 * have supplied it), and the `assetCategory` entity carries no `Java_Qualifier` (no
 * NeoHandler pre-hook exempts it). If this query ever returns a non-blank `defaultvalue` or
 * `java_qualifier`, or `isreadonly`/`isincluded` flips to `N`, re-derive the triple before
 * trusting a green run of this spec.
 *
 * Requires a live Etendo GO backend with a loaded F&B dataset AND built at or after the
 * ETP-4793 commit that introduces this rejection — a build predating it lacks
 * `ReadOnlyFieldRejectedException.class` entirely (creates would answer 200 with the field
 * silently dropped, which is exactly the pre-fix behavior this spec exists to catch). Before
 * treating a red run here as a real regression, check the deploy is current:
 * `GET /sws/neo/asset-group/assetCategory` after a create with `helpComment` set — a `200`
 * with the field simply absent from the response (rather than a `422`) means the backend is
 * stale, not that the assertion is wrong.
 *
 * Gated by E2E_NEO_ETP4793_CONTRACTS=1 (see docs/e2e-testing-guide.md).
 */

const RUN = process.env.E2E_NEO_ETP4793_CONTRACTS === '1';
const ETENDO_BASE_URL = trimTrailingSlash(process.env.ETENDO_URL || 'http://localhost:8080/etendo');
const TOKEN = process.env.E2E_ETENDOGO_JWT || resolveJwt();

const MARKER = 'E2E-ETP4793';
const ENDPOINT = `${ETENDO_BASE_URL}/sws/neo/asset-group/assetCategory`;

// Mandatory fields with no AD_Column default for A_Asset_Group — resolved from the live
// AD_Ref_List values for Amortizationcalctype / Amortizationtype / Assetschedule.
function baseBody(suffix) {
  return {
    name: `${MARKER} asset category ${suffix}`,
    description: `${MARKER} contract2 probe — safe to delete`,
    calculateType: 'TI', // Amortizationcalctype: Time
    depreciationType: 'LI', // Amortizationtype: Linear
    amortize: 'MO', // Assetschedule: Monthly
    depreciate: false,
  };
}

test.describe('NEO read-only field rejection on create — asset-group.assetCategory.helpComment (integration)', () => {
  test.skip(!RUN, 'Set E2E_NEO_ETP4793_CONTRACTS=1 to run this live NEO read-only-field-rejection contract test.');

  test.describe.configure({ timeout: 60_000 });

  const createdIds = [];

  test.afterAll(async ({ request }) => {
    for (const id of createdIds) {
      const resp = await request.delete(`${ENDPOINT}/${id}`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      }).catch((e) => e);
      if (!resp || !resp.ok?.()) {
        // eslint-disable-next-line no-console
        console.error(`[neo-readonly-field-rejection] could not delete asset category ${id} — clean up manually`);
      }
    }
  });

  test('a create carrying the read-only field is rejected with a structured 422, not silently accepted', async ({ request }) => {
    const response = await request.post(ENDPOINT, {
      headers: { authorization: `Bearer ${TOKEN}` },
      data: { ...baseBody('rejected'), helpComment: 'should never be persisted' },
    });

    expect(response.status(), await response.text()).toBe(422);
    const body = await response.json();

    // Wire contract asserted by exact key, not just status — the MCP layer and the
    // React UI both branch on these names.
    expect(body.status).toBe(422);
    expect(body.error).toBe('read_only_field');
    expect(body.field).toBe('helpComment');
    expect(typeof body.detail).toBe('string');
    expect(body.detail.length).toBeGreaterThan(0);
    expect(typeof body.hint).toBe('string');
    expect(body.hint.length).toBeGreaterThan(0);
    expect(typeof body.seeAlso).toBe('string');

    // Nothing should have been persisted for the rejected attempt — confirm by name.
    const listResp = await request.get(`${ETENDO_BASE_URL}/sws/neo/asset-group/assetCategory`, {
      headers: { authorization: `Bearer ${TOKEN}` },
      params: { limit: 50, offset: 0 },
    });
    const listBody = await listResp.json();
    const rows = listBody.response?.data ?? [];
    const leaked = rows.find((row) => row.name === baseBody('rejected').name);
    if (leaked) createdIds.push(leaked.id); // clean it up regardless, then fail loudly
    expect(leaked, leaked ? `rejected create nonetheless persisted a row (id=${leaked.id})` : undefined).toBeUndefined();
  });

  test('regression guard: the same create WITHOUT the read-only field still succeeds', async ({ request }) => {
    const response = await request.post(ENDPOINT, {
      headers: { authorization: `Bearer ${TOKEN}` },
      data: baseBody('accepted'),
    });

    expect(response.status(), await response.text()).toBe(200);
    const body = await response.json();
    const row = body.response?.data?.[0];
    expect(row?.id).toBeTruthy();
    createdIds.push(row.id);
  });
});

function resolveJwt() {
  if (!RUN) return '';
  try {
    return execFileSync(
      resolve(import.meta.dirname, '..', '..', '..', 'scripts', 'neo-token-groupadmin.sh'),
      {
        encoding: 'utf8',
        env: { ...process.env, ETENDO_URL: ETENDO_BASE_URL },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ).trim();
  } catch (error) {
    throw new Error(`Could not get Etendo GO JWT for the read-only-field-rejection contract test: ${error.stderr || error.message}`);
  }
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}
