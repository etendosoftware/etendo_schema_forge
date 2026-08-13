import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const RUN_LIVE_CONTEXT_SMOKE = process.env.E2E_ETENDOGO_CONTEXT_SELECTORS === '1';
const ETENDO_BASE_URL = trimTrailingSlash(process.env.ETENDO_URL || 'http://localhost:8080/etendo');
const TOKEN = process.env.E2E_ETENDOGO_JWT || resolveJwt();

const DOCUMENT_SCENARIOS = [
  {
    spec: 'sales-order',
    entity: 'header',
    lineEntity: 'lines',
    roleParam: { isCustomer: 'Y' },
    isSOTrx: 'Y',
  },
  {
    spec: 'purchase-order',
    entity: 'header',
    lineEntity: 'lines',
    roleParam: { isVendor: 'Y' },
    isSOTrx: 'N',
  },
  {
    spec: 'sales-invoice',
    entity: 'header',
    lineEntity: 'lines',
    roleParam: { isCustomer: 'Y' },
    isSOTrx: 'Y',
  },
  {
    spec: 'purchase-invoice',
    entity: 'header',
    lineEntity: 'lines',
    roleParam: { isVendor: 'Y' },
    isSOTrx: 'N',
  },
];

const MOVEMENT_SCENARIOS = [
  { spec: 'goods-receipt', entity: 'goodsReceipt', roleParam: { isVendor: 'Y' } },
  { spec: 'goods-shipment', entity: 'goodsShipment', roleParam: { isCustomer: 'Y' } },
];

test.describe('Etendo GO contextual selector live integration', () => {
  test.skip(
    !RUN_LIVE_CONTEXT_SMOKE,
    'Set E2E_ETENDOGO_CONTEXT_SELECTORS=1 to run this live Etendo GO selector smoke.',
  );

  test.describe.configure({ timeout: 120_000 });

  for (const scenario of DOCUMENT_SCENARIOS) {
    test(`${scenario.spec} selectors return data with Etendo GO context params`, async ({ request }) => {
      const fixtureRecord = await firstRecordWith(request, scenario.spec, scenario.entity, 'businessPartner');
      test.skip(!fixtureRecord, `${scenario.spec} has no existing ${scenario.entity} record with businessPartner`);

      const partnerAddress = await firstSelectorItem(request, scenario.spec, scenario.entity, 'partnerAddress', {
        C_BPartner_ID: fixtureRecord.businessPartner,
      });
      expect(partnerAddress?.id, `${scenario.spec} partnerAddress should resolve from selected BP`).toBeTruthy();

      const priceList = await firstSelectorItem(request, scenario.spec, scenario.entity, 'priceList', {
        isSOTrx: scenario.isSOTrx,
      });
      expect(priceList?.id, `${scenario.spec} priceList should resolve for isSOTrx=${scenario.isSOTrx}`).toBeTruthy();

      const tax = await firstSelectorItem(request, scenario.spec, scenario.lineEntity, 'tax', {
        IsSOTrx: scenario.isSOTrx,
        isSOTrx: scenario.isSOTrx,
        DateInvoiced: '12-05-2026',
      });
      expect(tax?.id, `${scenario.spec} line tax should resolve from side/date context`).toBeTruthy();
    });
  }

  for (const scenario of MOVEMENT_SCENARIOS) {
    test(`${scenario.spec} movement partner address selector returns data with selected BP`, async ({ request }) => {
      const fixtureRecord = await firstRecordWith(request, scenario.spec, scenario.entity, 'businessPartner');
      test.skip(!fixtureRecord, `${scenario.spec} has no existing ${scenario.entity} record with businessPartner`);

      const partnerAddress = await firstSelectorItem(request, scenario.spec, scenario.entity, 'partnerAddress', {
        C_BPartner_ID: fixtureRecord.businessPartner,
      });
      expect(partnerAddress?.id, `${scenario.spec} partnerAddress should resolve from selected BP`).toBeTruthy();
    });
  }
});

async function firstRecordWith(request, spec, entity, field) {
  const url = new URL(`${ETENDO_BASE_URL}/sws/neo/${spec}/${entity}`);
  url.searchParams.set('limit', '50');
  url.searchParams.set('offset', '0');

  const response = await request.get(url.toString(), {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  expect(
    response.ok(),
    `${spec}/${entity} list should return HTTP 2xx: ${await response.text()}`,
  ).toBe(true);

  const body = await response.json();
  const rows = body.response?.data ?? body.data ?? [];
  return Array.isArray(rows) ? rows.find((row) => row?.[field]) ?? null : null;
}

async function firstSelectorItem(request, spec, entity, field, params = {}) {
  const url = new URL(`${ETENDO_BASE_URL}/sws/neo/${spec}/${entity}/selectors/${field}`);
  for (const [key, value] of Object.entries({ ...params, limit: 50, offset: 0 })) {
    if (value != null && value !== '') url.searchParams.set(key, value);
  }

  const response = await request.get(url.toString(), {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  expect(
    response.ok(),
    `${spec}/${entity}/${field} selector should return HTTP 2xx: ${await response.text()}`,
  ).toBe(true);

  const body = await response.json();
  const items = body.items ?? body.response?.data ?? body.data ?? [];
  return Array.isArray(items) ? items[0] : null;
}

function resolveJwt() {
  if (!RUN_LIVE_CONTEXT_SMOKE) return '';
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
    throw new Error(`Could not get Etendo GO JWT for live context smoke: ${error.stderr || error.message}`);
  }
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}
