// Test fixture, not a test: the `fiscalSystemCatalog` answer of com.etendoerp.go
// (FiscalSifRules.catalog()), shared by the fiscal-config suites and the e2e mocks so every one of
// them reads the territory × system rules the backend really serves.
//
// The data is fiscalSystemCatalog.golden.json, the same bytes as
// com.etendoerp.go/src-test/src/com/etendoerp/go/schemaforge/fiscal/fiscalSystemCatalog.golden.json,
// which FiscalSifRulesTest asserts equal to FiscalSifRules.catalog(). The two repositories are
// tested separately, so both suites pin the file's SHA-256 (FISCAL_SYSTEM_CATALOG_SHA256 here,
// GOLDEN_SHA256 there): a change to the rules must update the golden file and the hash in both.

import GOLDEN from './fiscalSystemCatalog.golden.json' with { type: 'json' };

/**
 * The golden file as text — its canonical two-space serialization, which is exactly the file's
 * bytes (the file is kept in that form): what the SHA-256 is computed over.
 */
export const FISCAL_SYSTEM_CATALOG_GOLDEN_TEXT = `${JSON.stringify(GOLDEN, null, 2)}\n`;

/** SHA-256 of the golden file; equal to FiscalSifRulesTest.GOLDEN_SHA256 in com.etendoerp.go. */
export const FISCAL_SYSTEM_CATALOG_SHA256 =
  '176abb4fdbba906c8f6831ff6a9a58dbbdab86d88432bfac86ac4a33121079df';

export const FISCAL_SYSTEM_CATALOG = Object.freeze(GOLDEN);
