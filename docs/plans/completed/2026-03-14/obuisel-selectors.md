# Plan: OBUISEL Selector Support in NEO Headless

**Created:** 2026-03-13
**Completed:** 2026-03-14
**Status:** Completed

## Problem

NEO Headless selector endpoint (`/sws/neo/{spec}/{entity}/selectors/{column}`) currently only supports **simple selectors** (TableDir, Table). OBUISEL selectors return `{"error":{"message":"Custom HQL selectors not supported yet","status":400}}`.

## Impact

Many FK fields use OBUISEL (Warehouse, Business Partner, Project, Asset, Cost Center, User Dimensions). These dropdowns can't be populated from the API yet.

## Root Cause

OBUISEL selectors use custom HQL/SQL defined in `OBUISEL_Selector` table with complex filtering, paging, and column definitions. The current `NeoSelectorService` only handles TableDir and Table reference types.

## Implementation Plan

1. In `NeoSelectorService.java`, add a handler for OBUISEL reference type
2. Read `OBUISEL_Selector` config (HQL, table, display column, value column)
3. Execute the HQL with proper OBContext (org, client filtering)
4. Support `?q=` search param for typeahead filtering
5. Support `?_startRow=&_endRow=` for pagination
6. Return same `{ items: [{ id, label }], totalCount }` format as simple selectors

## Implementation Notes

### Changes made

**NeoSelectorService.java:**
- Added `customHql` and `entityAlias` fields to `SelectorMeta` inner class
- In `resolveObuiselSelector()`: when `isCustomQuery` is true, captures the full HQL via `Selector.getHQL()` and the alias via `Selector.getEntityAlias()` (defaults to "e")
- In `executeRichQuery()`: replaced the 400 error block with a delegation to `executeCustomHqlQuery()` when custom HQL is present. If `isCustomQuery` is true but no HQL is defined, falls through to the standard entity-based query (graceful degradation)
- New method `executeCustomHqlQuery()`: uses `Session.createQuery()` with the full custom HQL as the FROM clause base. Appends WHERE clause filters, validation filters, readable org restrictions, and search filters using the selector's entity alias. Executes count and data queries with pagination. Maps results using the same grid field resolution as standard rich selectors.

**NeoOpenAPIEndpoint.java:**
- Replaced vague `createObjectSchema("Selector query results")` with `createSelectorQueryResponseSchema()` that documents the actual response format: `items` (array with id, label, plus grid fields), `columns` (array with name, label, sortNo), `totalCount`, `limit`, `offset`, `hasMore`

## Workaround

Until implemented, use mock/fallback data for OBUISEL selectors in the frontend.
