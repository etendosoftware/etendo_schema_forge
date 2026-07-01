-- NEO UNIQUE constraints for ETGO_SF_* tables.
--
-- Run this against the target DB *after* dedupe-neo has reported 0 duplicate
-- groups. If any ALTER fails with "duplicate key value", STOP — duplicates
-- remain and need cleaning first.
--
-- Usage:
--   PGPASSWORD=tad psql -h localhost -p 5416 -U tad -d etendo27 \
--     -f cli/sql/neo-constraints.sql
--
-- Already declared in ETGO_SF_ENTITY.xml and NOT in this script:
--   ETGO_SF_ENTITY_SPEC_NAME_UQ (etgo_sf_spec_id, name)
--
-- Module-level counterpart (survives update.database):
--   {etendo_root}/modules/com.etendoerp.go/src-db/database/model/tables/ETGO_SF_*.xml
--   Add matching <unique> elements there if you want dbsm to recreate these
--   on a fresh install. Otherwise this file is the manual regen path.

BEGIN;

-- 1. Specs: one spec per AD window.
ALTER TABLE etgo_sf_spec
  ADD CONSTRAINT etgo_sf_spec_window_uk
  UNIQUE (ad_window_id);

-- 2. Specs: one spec per (process, spec_type). Same process can exist as
--    type P (process) and type R (report) so spec_type must be part of the key.
ALTER TABLE etgo_sf_spec
  ADD CONSTRAINT etgo_sf_spec_process_uk
  UNIQUE (ad_process_id, spec_type);

-- 3. Entities: one entity per (spec, AD tab). Blocks the "Header" + "header"
--    coexistence that came from the two-phase rename in push-to-neo.
ALTER TABLE etgo_sf_entity
  ADD CONSTRAINT etgo_sf_entity_tab_uk
  UNIQUE (etgo_sf_spec_id, ad_tab_id);

-- 4. Fields: one field per (entity, AD column). Covers 31/32 of the
--    historically observed duplicates.
ALTER TABLE etgo_sf_field
  ADD CONSTRAINT etgo_sf_field_column_uk
  UNIQUE (etgo_sf_entity_id, ad_column_id);

-- 5. Fields: one field per (entity, java_qualifier). Protects process
--    parameter rows where ad_column_id is NULL by design.
ALTER TABLE etgo_sf_field
  ADD CONSTRAINT etgo_sf_field_qualifier_uk
  UNIQUE (etgo_sf_entity_id, java_qualifier);

COMMIT;

-- Verification query:
--   SELECT conrelid::regclass, conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid::regclass::text LIKE 'etgo_sf_%' AND contype = 'u'
--   ORDER BY conrelid::regclass, conname;

-- Rollback (in reverse order):
--   ALTER TABLE etgo_sf_field  DROP CONSTRAINT etgo_sf_field_qualifier_uk;
--   ALTER TABLE etgo_sf_field  DROP CONSTRAINT etgo_sf_field_column_uk;
--   ALTER TABLE etgo_sf_entity DROP CONSTRAINT etgo_sf_entity_tab_uk;
--   ALTER TABLE etgo_sf_spec   DROP CONSTRAINT etgo_sf_spec_process_uk;
--   ALTER TABLE etgo_sf_spec   DROP CONSTRAINT etgo_sf_spec_window_uk;
