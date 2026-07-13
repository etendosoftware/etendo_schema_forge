-- @id: R9b-restore-element-tree-root
-- @gap: A5
-- @risk: medium
-- @type: sql
-- @description: Restore the missing root AD_TreeNode (node_id='0', parent_id=NULL) on any
--   C_Element tree that lost it, so the standard c_elementvalue_trg() trigger can attach new
--   top-level posting accounts instead of raising a NOT NULL violation on AD_TreeNode.AD_Tree_ID.

-- Background
-- ----------
-- Discovered while investigating R9 (bp-category-seed) failing on 32 experimental tenants with:
--   null value in column "ad_tree_id" of relation "ad_treenode" violates not-null constraint
--
-- Root cause (confirmed via pg_get_functiondef('c_elementvalue_trg'::regproc)): on INSERT INTO
-- c_elementvalue, the standard core trigger resolves which tree/parent to attach the new node to
-- with:
--   SELECT e.AD_Tree_ID, n.Node_ID INTO v_xTree_ID, v_xParent_ID
--   FROM C_Element e, AD_TreeNode n
--   WHERE e.AD_Tree_ID = n.AD_Tree_ID AND n.Parent_ID IS NULL AND e.C_Element_ID = new.C_Element_ID;
-- When the tree that C_Element.AD_Tree_ID points to has no row with Parent_ID IS NULL, this
-- SELECT INTO matches zero rows, v_xTree_ID stays NULL, and the trigger's own INSERT INTO
-- AD_TreeNode(..., AD_Tree_ID, ...) fails the NOT NULL constraint.
--
-- On the 32 affected tenants, a bulk reprovisioning event on 2026-06-30 (visible in
-- ETGO_DATA_FIX_HISTORY as a cluster of R1-R8 timestamps that day) created a SECOND AD_Tree row
-- per tenant, attached the tenant's real chart of accounts to it (confirmed: 1790 real nodes on
-- one sampled tenant), and repointed C_Element.AD_Tree_ID at this new tree -- but never inserted
-- its root node. The original onboarding tree (with a proper root, node_id='0', parent_id=NULL,
-- confirmed via AD_TREENODE on a sampled tenant) was left orphaned and unused. This is a
-- provisioning gap, not anything wrong with R9's own SQL -- R9 is simply the first fix in the
-- chain that happens to INSERT a new top-level C_ElementValue, which is what exposes it. ANY
-- future insert of a new top-level posting account (or any other C_Element hierarchy missing its
-- root) would hit the identical wall, so this check is written generically across every
-- C_Element for the tenant, not scoped to the AC (accounting) dimension alone.
--
-- Timestamp placement (IMPORTANT -- do not renumber to sort after R13)
-- ----------------------------------------------------------------------------------------------
-- This file is deliberately timestamped ONE MINUTE BEFORE R9 (20260701T120000Z) so it runs ahead
-- of R9 in the chain for every tenant. The runner applies fixes in strict chronological order and
-- halts a tenant's chain on the first FAILED fix -- if this file sorted AFTER R9 (e.g. as a plain
-- "R14"), the 32 tenants already halted at R9 would hit R9 again first, fail again (root cause
-- still unfixed), and halt before ever reaching this fix. Placing it before R9 lets it repair the
-- tree first, then R9 succeeds immediately after in the same run.
-- For tenants that already passed R9 successfully (their ledger watermark is already past this
-- file's timestamp), the runner's strict "never look back" watermark rule means this fix is
-- silently skipped for them -- harmless, since they were never missing a root node.
--
-- Idempotency
-- -----------
-- The @apply's NOT EXISTS guard (no AD_TreeNode row with Parent_ID IS NULL for that AD_Tree_ID)
-- mirrors @check exactly, so a re-run after success is a no-op. One row is inserted per affected
-- C_Element (a tenant could in principle have more than one broken tree).

-- @check
SELECT 1
FROM c_element e
WHERE e.ad_client_id = :client_id
  AND e.ad_tree_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ad_treenode n
    WHERE n.ad_tree_id = e.ad_tree_id AND n.parent_id IS NULL
  )
LIMIT 1;

-- @apply
-- WHERE clause mirrors @check exactly (per-element), so a re-run after success is a no-op.
INSERT INTO ad_treenode (
  ad_treenode_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  ad_tree_id, node_id, parent_id, seqno
)
SELECT get_uuid(), :client_id, '0', 'Y', now(), '0', now(), '0',
  e.ad_tree_id, '0', NULL, 0
FROM c_element e
WHERE e.ad_client_id = :client_id
  AND e.ad_tree_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ad_treenode n
    WHERE n.ad_tree_id = e.ad_tree_id AND n.parent_id IS NULL
  );
