# Plan: Dataset de sistema para impuestos fiscales españoles (ETP-4177)

## Contexto

Durante ETP-4177 se migró la data fiscal española de `ad_client_id=GOClient` → `ad_client_id='0'` (sistema) en 10 tablas. La migración se ejecutó solo en la DB local. Para que un tenant SaaS nuevo reciba esa data automáticamente al hacer `update.database`, hay que formalizarla como un dataset en un módulo nuevo y exportar los archivos XML.

**Stopgap actual:** `com.etendoerp.sampledata.go` (ETP-4132) tiene la misma data pero a nivel GOClient. No se toca en este PR — deprecar en issue separado una vez este módulo esté validado en entorno limpio.

---

## Tablas a incluir — orden FK obligatorio

| # | Tabla | Filas | Depende de |
|---|-------|-------|------------|
| 1 | `c_taxcategory` | 38 | — |
| 2 | `c_taxcategory_trl` | 39 | c_taxcategory |
| 3 | `c_tax` | 653 | c_taxcategory |
| 4 | `c_tax_trl` | 654 | c_tax |
| 5 | `c_tax_zone` | 15.549 | c_tax |
| 6 | `obtl_tributarykey` | 4 | — |
| 7 | `obtl_tax_report` | 54 | — |
| 8 | `obtl_tax_report_group` | 574 | obtl_tax_report |
| 9 | `obtl_tax_report_parameter` | 4.674 | obtl_tax_report, obtl_tax_report_group |
| 10 | `obtl_tax_parameter` | 12.026 | obtl_tributarykey, obtl_tax_report |

`c_tax_zone` scope: solo zonas españolas (mapeo impuesto/región ES). Confirmado contra GOClient sampledata.

**No incluir:** `c_tax_acct` — queda per-client por diseño (config contable por tenant).

---

## Módulo: `com.etendoerp.go.localization.es.data` (nuevo)

Data-only. Escala a `localization.fr.data`, `localization.mx.data` en el futuro.

---

## Implementación

### Fase 1 — Generar UUIDs antes de empezar

```bash
make uuid   # NEW_MODULE_ID
make uuid   # NEW_MODULE_DBPREFIX_ID
make uuid   # NEW_MODULE_DEP_ID_1   (dep → Core)
make uuid   # NEW_MODULE_DEP_ID_2   (dep → taxreportlauncher)
make uuid   # NEW_DATASET_ID
make uuid   # × 10  →  DATASET_TABLE_ID_1..10
```

### Fase 2 — Estructura del módulo en disco

```
modules/com.etendoerp.go.localization.es.data/
  build.gradle
  src-db/database/sourcedata/
    AD_MODULE.xml
    AD_MODULE_DBPREFIX.xml        # prefijo: ETGLES
    AD_MODULE_DEPENDENCY.xml      # deps: Core (0) + taxreportlauncher
    AD_DATASET.xml
    AD_DATASET_TABLE.xml
  referencedata/standard/
    SpanishFiscalTaxesGo.xml      # generado por export.referencedata, NO crear a mano
```

`build.gradle`: copiar de `com.etendoerp.go/build.gradle`, ajustar `artifactId`, añadir deps `com.etendoerp:go` + `org.openbravo:module.taxreportlauncher`.

### Fase 3 — Sourcedata XMLs

**`AD_MODULE.xml`** campos clave:
- `JAVAPACKAGE = com.etendoerp.go.localization.es.data`
- `HASREFERENCEDATA = Y`
- `TYPE = M`

**`AD_DATASET.xml`** — errores críticos a evitar:
- `AD_MODULE_ID` = `NEW_MODULE_ID` ← **NO** el ID de `com.etendoerp.go` (`94E1B433...`)
- `ACCESSLEVEL = 3` (Client/Organization) ← **NO** `4`; el valor `3` es el que usa `org.openbravo.localization.spain.referencedata.taxes`
- `EXPORT = N` en el XML commiteado (se pone `Y` solo en DB durante el export, luego se revierte)
- `VALUE = SpanishFiscalTaxesGo`

**`AD_DATASET_TABLE.xml`** — 10 entradas. Por cada una:
- `AD_MODULE_ID` = `NEW_MODULE_ID` (módulo que posee el registro, no el módulo de la tabla AD)
- `WHERECLAUSE = ad_client_id='0'`
- `INCLUDEALLCOLUMNS = Y`, `EXCLUDEAUDITINFO = Y`, `ISBUSINESSOBJECT = N`

IDs de las tablas AD:
```sql
SELECT ad_table_id, tablename FROM ad_table
WHERE tablename IN ('C_TAX','C_TAX_TRL','C_TAX_ZONE','C_TAXCATEGORY',
  'C_TAXCATEGORY_TRL','OBTL_TAX_PARAMETER','OBTL_TAX_REPORT',
  'OBTL_TAX_REPORT_GROUP','OBTL_TAX_REPORT_PARAMETER','OBTL_TRIBUTARYKEY')
ORDER BY tablename;
```

ID de taxreportlauncher:
```sql
SELECT ad_module_id FROM ad_module WHERE javapackage='org.openbravo.module.taxreportlauncher';
```

### Fase 4 — Insertar en la DB local (orden FK)

Insertar en este orden: AD_MODULE → AD_MODULE_DBPREFIX → AD_MODULE_DEPENDENCY × 2 → AD_DATASET → AD_DATASET_TABLE × 10 (en el orden de la tabla de arriba).

Verificar que los datos del módulo ya están:
```sql
SELECT count(*) FROM c_taxcategory WHERE ad_client_id='0';         -- 38
SELECT count(*) FROM c_tax WHERE ad_client_id='0';                  -- 653
SELECT count(*) FROM obtl_tax_report WHERE ad_client_id='0';        -- 54
```

### Fase 5 — Exportar sourcedata (AD metadata)

```bash
cd {etendo_root}
./gradlew export.database
```

Genera los XML de `src-db/database/sourcedata/`. Verificar que `AD_DATASET.xml` muestra `NEW_MODULE_ID`, NO `94E1B433CF55451EABB764750AC5902A`.

### Fase 6 — Exportar referencedata (los ~33K rows de negocio)

```sql
-- Activar export temporalmente
UPDATE ad_dataset SET export='Y' WHERE ad_dataset_id='<NEW_DATASET_ID>';
```

```bash
cd {etendo_root}
./gradlew export.referencedata -Petendo.referencedata.dataset=SpanishFiscalTaxesGo
```

Genera `referencedata/standard/SpanishFiscalTaxesGo.xml` (formato DAL, no raw columns).

```sql
-- Revertir
UPDATE ad_dataset SET export='N' WHERE ad_dataset_id='<NEW_DATASET_ID>';
```

```bash
./gradlew export.database   # para que AD_DATASET.xml refleje EXPORT=N
```

### Fase 7 — Verificar XMLs generados

```bash
grep -c "FinancialMgmtTaxCategory" referencedata/standard/SpanishFiscalTaxesGo.xml  # ~38
grep -c "FinancialMgmtTax "        referencedata/standard/SpanishFiscalTaxesGo.xml  # ~653
grep -c "FinancialMgmtTaxZone"     referencedata/standard/SpanishFiscalTaxesGo.xml  # ~15549
grep "AD_MODULE_ID" src-db/database/sourcedata/AD_DATASET.xml
# Esperado: NEW_MODULE_ID — no 94E1B433CF55451EABB764750AC5902A
```

### Fase 8 — Commit

```
Feature ETP-4177: Add system-level Spanish fiscal taxes dataset
```

---

## Verificación en entorno limpio

```bash
./gradlew update.database

SELECT count(*) FROM c_taxcategory WHERE ad_client_id='0';              -- 38
SELECT count(*) FROM c_tax WHERE ad_client_id='0';                       -- 653
SELECT count(*) FROM c_tax_trl WHERE ad_client_id='0';                   -- 654
SELECT count(*) FROM c_tax_zone WHERE ad_client_id='0';                  -- ~15549
SELECT count(*) FROM obtl_tributarykey WHERE ad_client_id='0';           -- 4
SELECT count(*) FROM obtl_tax_report WHERE ad_client_id='0';             -- 54
SELECT count(*) FROM obtl_tax_report_group WHERE ad_client_id='0';       -- 574
SELECT count(*) FROM obtl_tax_report_parameter WHERE ad_client_id='0';   -- 4674
SELECT count(*) FROM obtl_tax_parameter WHERE ad_client_id='0';          -- 12026
```
