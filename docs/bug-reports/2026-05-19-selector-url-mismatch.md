# Selector URL mismatch between generated contracts and Etendo GO runtime

Date: 2026-05-19

Jira: [ETP-4058](https://etendoproject.atlassian.net/browse/ETP-4058)

## Summary

Generated Schema Forge contracts and generated UI expose selector URLs using logical field names, such as:

- `/sws/neo/sales-order/header/selectors/partnerAddress`
- `/sws/neo/sales-order/header/selectors/priceList`
- `/sws/neo/sales-order/lines/selectors/tax`

The local Etendo GO runtime rejects those URLs with `404 Field not found or not included`. Manual probing showed that at least some column-name selector URLs are accepted, for example `/selectors/M_PriceList_ID`.

This is a transversal Etendo GO risk because generated UI, NEO consumers, and agentic integrations can receive valid generated URLs that do not execute against runtime.

## Reproduction

Start local Etendo GO, then run:

```bash
cd e2e
ETENDO_URL=http://localhost:8080/etendo npm run test:etendogo-contextual-selectors
```

The smoke is intentionally opt-in and should be skipped by default in normal Playwright runs.

## Observed Failures

- `sales-order/header/partnerAddress` -> 404 `Field not found or not included: partnerAddress`
- `purchase-order/header/partnerAddress` -> 404 `Field not found or not included: partnerAddress`
- `sales-invoice/header/partnerAddress` -> 404 `Field not found or not included: partnerAddress`
- `purchase-invoice/header/partnerAddress` -> 404 `Field not found or not included: partnerAddress`
- `goods-receipt/goodsReceipt/partnerAddress` -> 404 `Field not found or not included: partnerAddress`
- `goods-shipment/goodsShipment/partnerAddress` -> 404 `Field not found or not included: partnerAddress`

Manual probe:

```bash
TOKEN=$(./scripts/neo-token-groupadmin.sh)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/etendo/sws/neo/sales-order/header/selectors/priceList?isSOTrx=Y"

curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/etendo/sws/neo/sales-order/header/selectors/M_PriceList_ID?isSOTrx=Y"
```

Observed result:

- `priceList` returns 404.
- `M_PriceList_ID` returns 200 with selector items.

## Expected Resolution

Either Etendo GO should accept the logical field identifiers emitted by Schema Forge, or Schema Forge should emit the runtime-supported selector identifier consistently. The final selector URL contract must preserve backward compatibility for any existing column-name clients.

## Related Integration Gates

- `cli/test/etendogo-agentic-risk-integration.test.js`: always-on contract/app-shell gate.
- `e2e/tests/flows/etendogo-contextual-selectors.integration.spec.js`: opt-in live Etendo GO smoke that exposes this bug.
