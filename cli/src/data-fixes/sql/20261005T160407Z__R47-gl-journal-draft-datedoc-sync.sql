-- @id: R47-gl-journal-draft-datedoc-sync
-- @gap: ETP-5611
-- @risk: low
-- @type: sql
-- @description: Align GL_Journal.DateDoc with DateAcct on draft manual journals — the window shows one "Fecha" (DateAcct) and DateDoc used to stay frozen at the creation date.

-- ETP-5611 — Asientos Manuales (`simple-g-l-journal`) shows a single "Fecha" field, bound to
-- `accountingDate` (DateAcct). `documentDate` (DateDoc) is hidden and was only defaulted to
-- `@#Date@` (today) on create, then never updated: editing the Fecha moved DateAcct only, so any
-- draft whose date was changed after creation carries DateDoc <> DateAcct.
--
-- CODE-SIDE HALF (com.etendoerp.go, same ticket, NOT touched by this fix):
-- `GlJournalHeaderHandler` now mirrors `accountingDate` into `documentDate` on every CRUD
-- POST/PUT/PATCH, so no new draft drifts. This fix only corrects drafts that drifted before that.
--
-- DIRECTION: DateDoc := DateAcct. The visible Fecha is the date the user chose; it wins.
--
-- SCOPE GUARD: drafts only (DocStatus='DR', Processed='N', Posted='N'). Completed or posted
-- journals are locked and their accounting is already correct — never touched.
--
-- DB-STATE INVESTIGATION (2026-10-05): local dev DB → 0 drafts affected (136 journals, all with
-- DateDoc = DateAcct; they were created and never re-dated). The PRO count could NOT be run (no
-- PRO DB access when this fix was written), so it ships on the assumption that at least one draft
-- is affected there. The @check returns 0 rows on a clean tenant, so it is a no-op wherever there
-- is nothing to fix.
--
-- IDEMPOTENT: a second run finds 0 rows (@check) and @apply re-applies its own guard.

-- @check
SELECT 1
FROM gl_journal g
WHERE g.ad_client_id = :client_id
  AND g.docstatus = 'DR'
  AND g.processed = 'N'
  AND g.posted = 'N'
  AND g.datedoc IS DISTINCT FROM g.dateacct;

-- @apply
UPDATE gl_journal g
SET datedoc = g.dateacct,
    updated = now(),
    updatedby = '0'
WHERE g.ad_client_id = :client_id
  AND g.docstatus = 'DR'
  AND g.processed = 'N'
  AND g.posted = 'N'
  AND g.datedoc IS DISTINCT FROM g.dateacct;
