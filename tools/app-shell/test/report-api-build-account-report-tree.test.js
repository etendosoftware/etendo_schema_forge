import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountReportTree } from '../vite-plugins/report-api.js';

// ETP-4899 — `buildAccountReportTree()` is the pure engine behind BOTH Profit &
// Loss and Balance Sheet's indented account-report tree, mirroring Etendo
// Classic's `AccountTree` (GeneralAccountingReports — literally the same Java
// class for both reports, differing only by the selected `C_ACCT_RPT.REPORTTYPE`,
// 'N' for P&L vs 'Y' for Balance Sheet). It takes the flat node list the
// contract's `sql.query` returns plus the formula edges `sql.operandsQuery`
// returns, and emits the flattened, document-ordered rows the .hbs templates
// render.
//
// Everything here uses small synthetic fixtures — no DB. The behaviours pinned
// below were each verified against Classic's real PDF/xlsx output for the
// GOClient 2026 chart (see the ETP-4899 notes): heading-level rollups,
// `A) = 1+..+12` formula nodes, nested formulas (C = A + B), the cumulative
// accountLevel cutoff, the "show only accounts with value" toggle, the
// branch-inherited `accountsign` (Classic's `applySignAsPerParent`) and the
// multi-`c_acct_rpt_group` banding Balance Sheet needs.

// ── fixture builders ────────────────────────────────────────────────────────

/**
 * A tree node row exactly as `sql.query` shapes it: `parent_id` is COALESCE'd
 * to '' for roots, `sort_path` is the zero-padded seqno chain that makes a
 * plain string sort equal document order, `accountsign` is the raw
 * `C_ElementValue.ACCOUNTSIGN` ('D' debit-normal / 'C' credit-normal) and
 * `group_name` is the `c_acct_rpt_group` this node's branch hangs off.
 *
 * Defaults are the single-group, debit-normal shape, so `own_amt` (always the
 * RAW debit - credit the SQL now returns) passes straight through: the sign
 * and grouping behaviours get their own fixtures below.
 */
function node(node_id, {
  parent_id = '',
  sort_path = node_id,
  value = node_id,
  name = `Name ${node_id}`,
  elementlevel = 'C',
  isalwaysshown = 'N',
  own_amt = 0,
  own_amt_ref = 0,
  accountsign = 'D',
  group_name = 'G1',
} = {}) {
  return {
    node_id, parent_id, sort_path, value, name, elementlevel, isalwaysshown,
    own_amt, own_amt_ref, accountsign, group_name,
  };
}

function operand(owner_id, operand_id, sign = 1, seqno = 10) {
  return { owner_id, operand_id, sign, seqno };
}

function byId(rows) {
  return Object.fromEntries(rows.map((r) => [r.node_id, r]));
}

// ── value resolution ────────────────────────────────────────────────────────

describe('buildAccountReportTree — value resolution: children roll-up', () => {
  const nodes = [
    node('root', { sort_path: '000001' }),
    node('P', { parent_id: 'root', sort_path: '000001.000001', elementlevel: 'E' }),
    node('c1', { parent_id: 'P', sort_path: '000001.000001.000001', own_amt: 10, own_amt_ref: 4 }),
    node('c2', { parent_id: 'P', sort_path: '000001.000001.000002', own_amt: 5, own_amt_ref: 1 }),
  ];

  it('a parent is the sum of its children', () => {
    const rows = byId(buildAccountReportTree(nodes, []));
    assert.equal(rows.P.amount, 15);
    assert.equal(rows.P.amount_ref, 5);
  });

  it("a parent's OWN posted amount is added on top of its children", () => {
    const withOwn = nodes.map((n) => (n.node_id === 'P' ? { ...n, own_amt: 100, own_amt_ref: 2 } : n));
    const rows = byId(buildAccountReportTree(withOwn, []));
    assert.equal(rows.P.amount, 115);
    assert.equal(rows.P.amount_ref, 7);
  });

  it('a childless, operand-less leaf is just its own amount', () => {
    const rows = byId(buildAccountReportTree(nodes, []));
    assert.equal(rows.c1.amount, 10);
    assert.equal(rows.c1.amount_ref, 4);
  });

  it('rolls up through more than one level', () => {
    const deep = [
      node('root', { sort_path: '000001' }),
      node('A', { parent_id: 'root', sort_path: '000001.000001', elementlevel: 'E' }),
      node('B', { parent_id: 'A', sort_path: '000001.000001.000001' }),
      node('L', { parent_id: 'B', sort_path: '000001.000001.000001.000001', own_amt: 7 }),
    ];
    const rows = byId(buildAccountReportTree(deep, []));
    assert.equal(rows.L.amount, 7);
    assert.equal(rows.B.amount, 7);
    assert.equal(rows.A.amount, 7);
  });
});

describe('buildAccountReportTree — value resolution: formula nodes', () => {
  // Mirrors Classic's "A) RESULTADO DE EXPLOTACIÓN (1+2+...+12)": a node with
  // NO children but WITH C_ELEMENTVALUE_OPERAND rows.
  const nodes = [
    node('root', { sort_path: '000001' }),
    node('g1', { parent_id: 'root', sort_path: '000001.000001', elementlevel: 'E', own_amt: 80, own_amt_ref: 8 }),
    node('g2', { parent_id: 'root', sort_path: '000001.000002', elementlevel: 'E', own_amt: 20, own_amt_ref: 2 }),
    node('A', { parent_id: 'root', sort_path: '000001.000003', elementlevel: 'E' }),
  ];
  const operands = [operand('A', 'g1', 1, 10), operand('A', 'g2', 1, 20)];

  it('sums its operands when it has no children', () => {
    const rows = byId(buildAccountReportTree(nodes, operands));
    assert.equal(rows.A.amount, 100);
    assert.equal(rows.A.amount_ref, 10);
  });

  it('honours a negative operand sign', () => {
    const rows = byId(buildAccountReportTree(nodes, [operand('A', 'g1', 1, 10), operand('A', 'g2', -1, 20)]));
    assert.equal(rows.A.amount, 60);
    assert.equal(rows.A.amount_ref, 6);
  });

  it("ignores the formula node's own posted amount (operands win)", () => {
    const withOwn = nodes.map((n) => (n.node_id === 'A' ? { ...n, own_amt: 999, own_amt_ref: 999 } : n));
    const rows = byId(buildAccountReportTree(withOwn, operands));
    assert.equal(rows.A.amount, 100);
    assert.equal(rows.A.amount_ref, 10);
  });

  it('ignores operands on a node that DOES have children (children win)', () => {
    const withChild = [...nodes, node('kid', { parent_id: 'A', sort_path: '000001.000003.000001', own_amt: 3, own_amt_ref: 1 })];
    const rows = byId(buildAccountReportTree(withChild, operands));
    assert.equal(rows.A.amount, 3);
    assert.equal(rows.A.amount_ref, 1);
  });

  it('skips an operand pointing at a node absent from the tree', () => {
    const rows = byId(buildAccountReportTree(nodes, [...operands, operand('A', 'ghost', 1, 30)]));
    assert.equal(rows.A.amount, 100);
  });

  it('resolves NESTED formulas (C = A + B, like the real P.G.C)', () => {
    // A = g1 + g2 (100), B = g3 (5), C = A + B (105), D = C + g4 (107).
    const nested = [
      ...nodes,
      node('g3', { parent_id: 'root', sort_path: '000001.000004', elementlevel: 'E', own_amt: 5, own_amt_ref: 1 }),
      node('B', { parent_id: 'root', sort_path: '000001.000005', elementlevel: 'E' }),
      node('C', { parent_id: 'root', sort_path: '000001.000006', elementlevel: 'E' }),
      node('g4', { parent_id: 'root', sort_path: '000001.000007', elementlevel: 'E', own_amt: 2, own_amt_ref: 0 }),
      node('D', { parent_id: 'root', sort_path: '000001.000008', elementlevel: 'E' }),
    ];
    const nestedOperands = [
      ...operands,
      operand('B', 'g3', 1, 10),
      operand('C', 'A', 1, 10),
      operand('C', 'B', 1, 20),
      operand('D', 'C', 1, 10),
      operand('D', 'g4', 1, 20),
    ];
    const rows = byId(buildAccountReportTree(nested, nestedOperands));
    assert.equal(rows.A.amount, 100);
    assert.equal(rows.B.amount, 5);
    assert.equal(rows.C.amount, 105);
    assert.equal(rows.D.amount, 107);
    assert.equal(rows.C.amount_ref, 11);
  });

  it('does not depend on operand row order (a formula defined before its inputs still resolves)', () => {
    const reordered = [operand('C', 'A', 1, 10), operand('A', 'g1', 1, 10), operand('A', 'g2', 1, 20)];
    const nested = [...nodes, node('C', { parent_id: 'root', sort_path: '000001.000009', elementlevel: 'E' })];
    const rows = byId(buildAccountReportTree(nested, reordered));
    assert.equal(rows.C.amount, 100);
  });
});

describe('buildAccountReportTree — cycle guard (malformed formula data)', () => {
  const base = [
    node('root', { sort_path: '000001' }),
    node('X', { parent_id: 'root', sort_path: '000001.000001', elementlevel: 'E' }),
    node('Y', { parent_id: 'root', sort_path: '000001.000002', elementlevel: 'E' }),
  ];

  it('a formula referencing ITSELF terminates and yields 0', () => {
    const rows = byId(buildAccountReportTree(base, [operand('X', 'X', 1, 10)]));
    assert.equal(rows.X.amount, 0);
    assert.equal(rows.X.amount_ref, 0);
  });

  it('a two-node formula cycle (X = Y, Y = X) terminates and yields 0', () => {
    const rows = byId(buildAccountReportTree(base, [operand('X', 'Y', 1, 10), operand('Y', 'X', 1, 10)]));
    assert.equal(rows.X.amount, 0);
    assert.equal(rows.Y.amount, 0);
  });
});

// ── accountLevel: cumulative depth cutoff ───────────────────────────────────

describe('buildAccountReportTree — accountLevel is a CUMULATIVE cutoff, not an equality filter', () => {
  // E -> C -> D -> S, exactly the real chain P.G.4 -> 600 -> 6000 -> 60000000.
  const nodes = [
    node('root', { sort_path: '000001' }),
    node('e', { parent_id: 'root', sort_path: '000001.000001', elementlevel: 'E', value: 'P.G.4' }),
    node('c', { parent_id: 'e', sort_path: '000001.000001.000001', elementlevel: 'C', value: '600' }),
    node('d', { parent_id: 'c', sort_path: '000001.000001.000001.000001', elementlevel: 'D', value: '6000' }),
    node('s', { parent_id: 'd', sort_path: '000001.000001.000001.000001.000001', elementlevel: 'S', value: '60000000', own_amt: -22.48 }),
  ];

  const expected = {
    E: ['e'],
    C: ['e', 'c'],
    D: ['e', 'c', 'd'],
    S: ['e', 'c', 'd', 's'],
  };

  for (const [accountLevel, visible] of Object.entries(expected)) {
    it(`accountLevel="${accountLevel}" emits ${visible.join(', ')} and nothing deeper`, () => {
      const out = buildAccountReportTree(nodes, [], { accountLevel });
      assert.deepEqual(out.map((r) => r.node_id), visible);
      for (const hidden of ['e', 'c', 'd', 's'].filter((id) => !visible.includes(id))) {
        assert.ok(!out.some((r) => r.node_id === hidden), `${hidden} must NOT be emitted at accountLevel=${accountLevel}`);
      }
    });
  }

  it('the cutoff row still carries the rolled-up value of the levels it hides', () => {
    const out = buildAccountReportTree(nodes, [], { accountLevel: 'E' });
    assert.equal(out.length, 1);
    assert.equal(out[0].amount, -22.48);
  });

  it('defaults to the deepest level (S) when accountLevel is omitted', () => {
    assert.equal(buildAccountReportTree(nodes, []).length, 4);
  });

  it('falls back to the deepest level (S) for an unknown accountLevel', () => {
    assert.equal(buildAccountReportTree(nodes, [], { accountLevel: 'ZZZ' }).length, 4);
  });

  it('an unknown/blank elementlevel is never a reason to drop a row', () => {
    const odd = [
      node('root', { sort_path: '000001' }),
      node('mystery', { parent_id: 'root', sort_path: '000001.000001', elementlevel: '' }),
      // `null` is what Postgres hands back for an unset ELEMENTLEVEL column.
      node('nolevel', { parent_id: 'mystery', sort_path: '000001.000001.000001', elementlevel: null }),
    ];
    const out = buildAccountReportTree(odd, [], { accountLevel: 'E' });
    assert.deepEqual(out.map((r) => r.node_id), ['mystery', 'nolevel']);
  });
});

// ── showOnlyWithValue ───────────────────────────────────────────────────────

describe('buildAccountReportTree — showOnlyWithValue', () => {
  const nodes = [
    node('root', { sort_path: '000001' }),
    node('zero', { parent_id: 'root', sort_path: '000001.000001' }),
    node('refOnly', { parent_id: 'root', sort_path: '000001.000002', own_amt: 0, own_amt_ref: 5 }),
    node('alwaysZero', { parent_id: 'root', sort_path: '000001.000003', isalwaysshown: 'Y' }),
    node('valued', { parent_id: 'root', sort_path: '000001.000004', own_amt: 100 }),
    node('rounding', { parent_id: 'root', sort_path: '000001.000005', own_amt: -0.000000001 }),
  ];

  it('off (default): every node is emitted, zeros included', () => {
    const out = buildAccountReportTree(nodes, []);
    assert.deepEqual(out.map((r) => r.node_id), ['zero', 'refOnly', 'alwaysZero', 'valued', 'rounding']);
  });

  it('on: hides a node that is zero in BOTH periods', () => {
    const out = buildAccountReportTree(nodes, [], { showOnlyWithValue: true });
    assert.ok(!out.some((r) => r.node_id === 'zero'));
  });

  it('on: KEEPS a node that is zero in the main period but non-zero in the reference period', () => {
    const out = buildAccountReportTree(nodes, [], { showOnlyWithValue: true });
    const kept = out.find((r) => r.node_id === 'refOnly');
    assert.ok(kept, 'a node with only a reference-period value must survive the filter');
    assert.equal(kept.amount, 0);
    assert.equal(kept.amount_ref, 5);
  });

  it("on: never hides an isalwaysshown='Y' node, even at zero", () => {
    const out = buildAccountReportTree(nodes, [], { showOnlyWithValue: true });
    assert.ok(out.some((r) => r.node_id === 'alwaysZero'));
  });

  it('on: a float-residual amount below the 0.005 epsilon counts as zero', () => {
    const out = buildAccountReportTree(nodes, [], { showOnlyWithValue: true });
    assert.ok(!out.some((r) => r.node_id === 'rounding'), 'a -1e-9 residual must not keep a row alive');
  });

  it('on: keeps a real value', () => {
    const out = buildAccountReportTree(nodes, [], { showOnlyWithValue: true });
    assert.deepEqual(out.map((r) => r.node_id), ['refOnly', 'alwaysZero', 'valued']);
  });
});

// ── flattening: order, indentation, row shape ───────────────────────────────

describe('buildAccountReportTree — flattening', () => {
  it('the report ROOT is a container, not a row: its children start at indent 0', () => {
    const nodes = [
      node('root', { sort_path: '000001', value: 'RPT', elementlevel: 'E' }),
      node('kid', { parent_id: 'root', sort_path: '000001.000001', elementlevel: 'E' }),
      node('grandkid', { parent_id: 'kid', sort_path: '000001.000001.000001' }),
    ];
    const out = buildAccountReportTree(nodes, []);
    assert.ok(!out.some((r) => r.node_id === 'root'), 'the root container must never be emitted as a row');
    assert.equal(out[0].node_id, 'kid');
    assert.equal(out[0].indent, 0);
    assert.equal(out[1].indent, 1);
  });

  it('orders siblings by sort_path, not by input order', () => {
    const nodes = [
      node('root', { sort_path: '000001' }),
      node('third', { parent_id: 'root', sort_path: '000001.000030' }),
      node('first', { parent_id: 'root', sort_path: '000001.000010' }),
      node('second', { parent_id: 'root', sort_path: '000001.000020' }),
    ];
    assert.deepEqual(
      buildAccountReportTree(nodes, []).map((r) => r.node_id),
      ['first', 'second', 'third']
    );
  });

  it('emits document order depth-first (parent, then its subtree, then the next sibling)', () => {
    const nodes = [
      node('root', { sort_path: '000001' }),
      node('b', { parent_id: 'root', sort_path: '000001.000020' }),
      node('a', { parent_id: 'root', sort_path: '000001.000010' }),
      node('a2', { parent_id: 'a', sort_path: '000001.000010.000020' }),
      node('a1', { parent_id: 'a', sort_path: '000001.000010.000010' }),
    ];
    assert.deepEqual(
      buildAccountReportTree(nodes, []).map((r) => r.node_id),
      ['a', 'a1', 'a2', 'b']
    );
  });

  it('emits the full row shape the templates consume', () => {
    const nodes = [
      node('root', { sort_path: '000001' }),
      node('n1', { parent_id: 'root', sort_path: '000001.000001', value: '700', name: 'Ventas', elementlevel: 'C', own_amt: 8716.16, own_amt_ref: 12 }),
    ];
    const [row] = buildAccountReportTree(nodes, []);
    assert.deepEqual(row, {
      node_id: 'n1',
      value: '700',
      name: 'Ventas',
      element: '700 - Ventas',
      elementlevel: 'C',
      amount: 8716.16,
      amount_ref: 12,
      indent: 0,
      indentClass: 'ind-0',
      isHeading: false,
      // ETP-4899 — `group`/`isGroupStart` drive the .group-header band the
      // templates render between `c_acct_rpt_group` roots. A single-group
      // report (Profit & Loss) never flips isGroupStart.
      group: 'G1',
      isGroupStart: false,
    });
  });

  it("isHeading is true ONLY for elementlevel === 'E'", () => {
    const nodes = [
      node('root', { sort_path: '000001' }),
      node('e', { parent_id: 'root', sort_path: '000001.000001', elementlevel: 'E' }),
      node('c', { parent_id: 'root', sort_path: '000001.000002', elementlevel: 'C' }),
      node('d', { parent_id: 'root', sort_path: '000001.000003', elementlevel: 'D' }),
      node('s', { parent_id: 'root', sort_path: '000001.000004', elementlevel: 'S' }),
      node('blank', { parent_id: 'root', sort_path: '000001.000005', elementlevel: '' }),
    ];
    const out = buildAccountReportTree(nodes, []);
    assert.deepEqual(
      out.map((r) => [r.node_id, r.isHeading]),
      [['e', true], ['c', false], ['d', false], ['s', false], ['blank', false]]
    );
  });

  it('indentClass tracks depth and CAPS at ind-6', () => {
    // A 9-deep chain under the root container: indents 0..8, so the last two
    // rows must both collapse onto ind-6 (there is no .ind-7 CSS rule).
    const nodes = [node('root', { sort_path: '000001' })];
    let path = '000001';
    for (let i = 0; i < 9; i += 1) {
      path += `.${String(i).padStart(6, '0')}`;
      nodes.push(node(`n${i}`, { parent_id: i === 0 ? 'root' : `n${i - 1}`, sort_path: path, elementlevel: '' }));
    }
    const out = buildAccountReportTree(nodes, []);
    assert.deepEqual(out.map((r) => r.indent), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(
      out.map((r) => r.indentClass),
      ['ind-0', 'ind-1', 'ind-2', 'ind-3', 'ind-4', 'ind-5', 'ind-6', 'ind-6', 'ind-6']
    );
  });

  it('handles multiple roots, ordered by sort_path', () => {
    const nodes = [
      node('rootB', { sort_path: '000002' }),
      node('rootA', { sort_path: '000001' }),
      node('a', { parent_id: 'rootA', sort_path: '000001.000001' }),
      node('b', { parent_id: 'rootB', sort_path: '000002.000001' }),
    ];
    const out = buildAccountReportTree(nodes, []);
    assert.deepEqual(out.map((r) => r.node_id), ['a', 'b']);
    assert.deepEqual(out.map((r) => r.indent), [0, 0]);
  });

  it('treats a node whose parent_id points outside the result set as a root container', () => {
    const nodes = [
      node('orphanParent', { parent_id: 'not-in-set', sort_path: '000001' }),
      node('kid', { parent_id: 'orphanParent', sort_path: '000001.000001' }),
    ];
    const out = buildAccountReportTree(nodes, []);
    assert.deepEqual(out.map((r) => r.node_id), ['kid']);
  });

  it('returns [] for empty / missing inputs instead of throwing', () => {
    assert.deepEqual(buildAccountReportTree([], []), []);
    assert.deepEqual(buildAccountReportTree(undefined, undefined), []);
  });
});

// ── inherited branch sign (Classic's applySignAsPerParent) ──────────────────
//
// `own_amt` is the RAW debit - credit the SQL returns; the polarity a row is
// DISPLAYED in comes from its branch ROOT's `accountsign`, never from its own
// row. That is what makes Balance Sheet work: the "Activo" root is
// debit-normal and "Patrimonio Neto y Pasivo" is credit-normal, so the same
// underlying figures print with opposite polarity depending on which root they
// are filed under. Profit & Loss's single root is credit-normal, which is why
// generalizing this reproduces its old hardcoded `cr - dr` byte-for-byte.

describe('buildAccountReportTree — inherited branch sign (applySignAsPerParent)', () => {
  // Both branches carry children that DECLARE the opposite sign of their root.
  // Every one of those declarations must be ignored.
  const nodes = [
    node('rootD', { sort_path: '000001', accountsign: 'D', group_name: 'Activo' }),
    node('A', { parent_id: 'rootD', sort_path: '000001.000001', elementlevel: 'E', accountsign: 'C', group_name: 'Activo' }),
    node('a1', { parent_id: 'A', sort_path: '000001.000001.000001', own_amt: 100, own_amt_ref: 10, accountsign: 'C', group_name: 'Activo' }),
    node('a2', { parent_id: 'A', sort_path: '000001.000001.000002', own_amt: -40, own_amt_ref: -4, accountsign: 'C', group_name: 'Activo' }),

    node('rootC', { sort_path: '000002', accountsign: 'C', group_name: 'Pasivo' }),
    node('P', { parent_id: 'rootC', sort_path: '000002.000001', elementlevel: 'E', accountsign: 'D', group_name: 'Pasivo' }),
    node('p1', { parent_id: 'P', sort_path: '000002.000001.000001', own_amt: 100, own_amt_ref: 10, accountsign: 'D', group_name: 'Pasivo' }),
    node('p2', { parent_id: 'P', sort_path: '000002.000001.000002', own_amt: -40, own_amt_ref: -4, accountsign: 'D', group_name: 'Pasivo' }),
  ];

  it("a debit-normal ('D') root passes own_amt through as raw debit - credit", () => {
    const rows = byId(buildAccountReportTree(nodes, []));
    assert.equal(rows.a1.amount, 100);
    assert.equal(rows.a2.amount, -40);
    assert.equal(rows.a1.amount_ref, 10);
  });

  it("a credit-normal ('C') root NEGATES own_amt into credit - debit", () => {
    const rows = byId(buildAccountReportTree(nodes, []));
    assert.equal(rows.p1.amount, -100);
    assert.equal(rows.p2.amount, 40);
    assert.equal(rows.p1.amount_ref, -10);
  });

  it("a child's OWN declared accountsign is ignored — the root's wins for the whole branch", () => {
    const rows = byId(buildAccountReportTree(nodes, []));
    // a1/a2 declare 'C' under a 'D' root; p1/p2 declare 'D' under a 'C' root.
    // If a node's own row were honoured the two branches would be identical.
    assert.equal(rows.a1.amount, -rows.p1.amount);
    assert.equal(rows.a2.amount, -rows.p2.amount);
  });

  it('the inherited sign applies at every depth, including the roll-up parents', () => {
    const rows = byId(buildAccountReportTree(nodes, []));
    assert.equal(rows.A.amount, 60);   // 100 + (-40), debit-normal
    assert.equal(rows.P.amount, -60);  // -(100) + -(-40), credit-normal
  });

  it("a roll-up parent's OWN posted amount is sign-adjusted too, not just its children's", () => {
    const withOwn = nodes.map((n) => (n.node_id === 'P' ? { ...n, own_amt: 10 } : n));
    const rows = byId(buildAccountReportTree(withOwn, []));
    assert.equal(rows.P.amount, -70, "P's own 10 must be negated to -10 before the roll-up");
  });

  it("treats an unset/unknown accountsign as debit-normal (no flip)", () => {
    const unset = [
      node('root', { sort_path: '000001', accountsign: null }),
      node('n', { parent_id: 'root', sort_path: '000001.000001', own_amt: 33, accountsign: undefined }),
    ];
    assert.equal(byId(buildAccountReportTree(unset, [])).n.amount, 33);
  });

  it("reproduces Profit & Loss's single credit-normal root exactly (cr - dr regression)", () => {
    // The real GOClient 2026 Account-level figures: `600` posts a raw
    // dr - cr of +22.48 and must display as -22.48, `700` posts -8716.16 and
    // must display as +8716.16 — the exact values the pre-generalization,
    // hardcoded `cr - dr` SQL produced.
    const pyg = [
      node('PYG', { sort_path: '000001', accountsign: 'C', group_name: 'Pérdidas y Ganancias' }),
      node('P.G.1', { parent_id: 'PYG', sort_path: '000001.000001', elementlevel: 'E', accountsign: 'C', group_name: 'Pérdidas y Ganancias' }),
      node('700', { parent_id: 'P.G.1', sort_path: '000001.000001.000001', own_amt: -8716.16, accountsign: 'C', group_name: 'Pérdidas y Ganancias' }),
      node('P.G.4', { parent_id: 'PYG', sort_path: '000001.000002', elementlevel: 'E', accountsign: 'C', group_name: 'Pérdidas y Ganancias' }),
      node('600', { parent_id: 'P.G.4', sort_path: '000001.000002.000001', own_amt: 22.48, accountsign: 'C', group_name: 'Pérdidas y Ganancias' }),
      node('610', { parent_id: 'P.G.4', sort_path: '000001.000002.000002', own_amt: -28274.22, accountsign: 'C', group_name: 'Pérdidas y Ganancias' }),
    ];
    const rows = byId(buildAccountReportTree(pyg, []));
    assert.equal(rows['700'].amount, 8716.16);
    assert.equal(rows['600'].amount, -22.48);
    assert.equal(rows['610'].amount, 28274.22);
    assert.equal(rows['P.G.1'].amount, 8716.16);
    assert.equal(Number(rows['P.G.4'].amount.toFixed(2)), 28251.74);
  });
});

describe('buildAccountReportTree — formula nodes across differently-signed branches', () => {
  // gD lives under a debit-normal root, gC under a credit-normal one, so with
  // the SAME raw own_amt they resolve to opposite values. The formula nodes
  // must consume those ALREADY sign-adjusted operand values verbatim
  // (Classic's operandsCalculate), never re-flip them by the formula owner's
  // own inherited sign.
  const nodes = [
    node('rootD', { sort_path: '000001', accountsign: 'D', group_name: 'Activo' }),
    node('gD', { parent_id: 'rootD', sort_path: '000001.000001', elementlevel: 'E', own_amt: 100, own_amt_ref: 10, accountsign: 'D', group_name: 'Activo' }),
    node('F2', { parent_id: 'rootD', sort_path: '000001.000002', elementlevel: 'E', accountsign: 'D', group_name: 'Activo' }),

    node('rootC', { sort_path: '000002', accountsign: 'C', group_name: 'Pasivo' }),
    node('gC', { parent_id: 'rootC', sort_path: '000002.000001', elementlevel: 'E', own_amt: 100, own_amt_ref: 10, accountsign: 'C', group_name: 'Pasivo' }),
    node('F1', { parent_id: 'rootC', sort_path: '000002.000002', elementlevel: 'E', accountsign: 'C', group_name: 'Pasivo' }),
  ];

  it('the two leaves resolve to opposite values from the same raw own_amt', () => {
    const rows = byId(buildAccountReportTree(nodes, []));
    assert.equal(rows.gD.amount, 100);
    assert.equal(rows.gC.amount, -100);
  });

  it("a credit-normal formula does NOT re-flip a debit-normal operand's resolved value", () => {
    const rows = byId(buildAccountReportTree(nodes, [operand('F1', 'gD', 1, 10)]));
    assert.equal(rows.F1.amount, 100, "F1 is 'C' but must take gD's +100 as-is");
    assert.equal(rows.F1.amount_ref, 10);
  });

  it("a debit-normal formula takes a credit-normal operand's already-negated value", () => {
    const rows = byId(buildAccountReportTree(nodes, [operand('F2', 'gC', 1, 10)]));
    assert.equal(rows.F2.amount, -100, "F2 is 'D' but must take gC's -100 as-is");
    assert.equal(rows.F2.amount_ref, -10);
  });

  it('sums operands from BOTH branches as sign * operand.amount', () => {
    const rows = byId(buildAccountReportTree(nodes, [
      operand('F1', 'gD', 1, 10),
      operand('F1', 'gC', 1, 20),
    ]));
    assert.equal(rows.F1.amount, 0, '100 + (-100)');

    const negated = byId(buildAccountReportTree(nodes, [
      operand('F1', 'gD', 1, 10),
      operand('F1', 'gC', -1, 20),
    ]));
    assert.equal(negated.F1.amount, 200, '100 - (-100)');
  });

  it('a nested formula inherits the already-resolved value of a cross-branch formula', () => {
    const rows = byId(buildAccountReportTree(nodes, [
      operand('F1', 'gD', 1, 10),  // F1 = +100
      operand('F2', 'F1', 1, 10),  // F2 = F1 = +100, not -100
      operand('F2', 'gC', 1, 20),  // + (-100)
    ]));
    assert.equal(rows.F1.amount, 100);
    assert.equal(rows.F2.amount, 0);
  });
});

// ── multi-group banding (Balance Sheet's two c_acct_rpt_group roots) ────────

describe('buildAccountReportTree — isGroupStart across multiple c_acct_rpt_group roots', () => {
  const multi = [
    node('rootA', { sort_path: '000001', group_name: 'Activo' }),
    node('a1', { parent_id: 'rootA', sort_path: '000001.000001', elementlevel: 'E', group_name: 'Activo', own_amt: 5 }),
    node('a2', { parent_id: 'a1', sort_path: '000001.000001.000001', group_name: 'Activo', own_amt: 5 }),
    node('rootB', { sort_path: '000002', group_name: 'Patrimonio Neto y Pasivo' }),
    node('b1', { parent_id: 'rootB', sort_path: '000002.000001', elementlevel: 'E', group_name: 'Patrimonio Neto y Pasivo', own_amt: 7 }),
    node('b2', { parent_id: 'b1', sort_path: '000002.000001.000001', group_name: 'Patrimonio Neto y Pasivo', own_amt: 7 }),
  ];

  it("carries each row's group name through to the output", () => {
    const out = buildAccountReportTree(multi, []);
    assert.deepEqual(
      out.map((r) => [r.node_id, r.group]),
      [
        ['a1', 'Activo'],
        ['a2', 'Activo'],
        ['b1', 'Patrimonio Neto y Pasivo'],
        ['b2', 'Patrimonio Neto y Pasivo'],
      ]
    );
  });

  it('flags isGroupStart on the FIRST visible row of every group and nowhere else', () => {
    const out = buildAccountReportTree(multi, []);
    assert.deepEqual(
      out.map((r) => [r.node_id, r.isGroupStart]),
      [['a1', true], ['a2', false], ['b1', true], ['b2', false]]
    );
    assert.equal(out.filter((r) => r.isGroupStart).length, 2, 'exactly one band per c_acct_rpt_group');
  });

  it('flags the very first row too, so the leading group header still renders', () => {
    // Without the multi-group forcing pass, row 0 could never flip (there is
    // no previous row to differ from) and "Activo" would print headerless.
    assert.equal(buildAccountReportTree(multi, [])[0].isGroupStart, true);
  });

  it('handles three groups (the mechanism is not hardcoded to two)', () => {
    const three = [
      ...multi,
      node('rootC', { sort_path: '000003', group_name: 'Cuentas de orden' }),
      node('c1', { parent_id: 'rootC', sort_path: '000003.000001', group_name: 'Cuentas de orden', own_amt: 1 }),
    ];
    const out = buildAccountReportTree(three, []);
    assert.deepEqual(out.filter((r) => r.isGroupStart).map((r) => r.group), [
      'Activo', 'Patrimonio Neto y Pasivo', 'Cuentas de orden',
    ]);
  });

  it("moves the band onto the next visible row when the group's first row is filtered out", () => {
    // `lastGroup` must only advance on EMITTED rows: the zero-valued b0 sits
    // first in document order but is filtered out, so the band has to land on
    // b1 instead of being lost with it.
    const filtered = [
      ...multi,
      node('b0', { parent_id: 'rootB', sort_path: '000002.000000', elementlevel: 'E', group_name: 'Patrimonio Neto y Pasivo', own_amt: 0 }),
    ];
    const out = buildAccountReportTree(filtered, [], { showOnlyWithValue: true });
    assert.deepEqual(out.map((r) => r.node_id), ['a1', 'a2', 'b1', 'b2']);
    assert.deepEqual(out.map((r) => r.isGroupStart), [true, false, true, false]);
  });

  it('respects the accountLevel cutoff when deciding which row opens a band', () => {
    const out = buildAccountReportTree(multi, [], { accountLevel: 'E' });
    assert.deepEqual(out.map((r) => r.node_id), ['a1', 'b1']);
    assert.deepEqual(out.map((r) => r.isGroupStart), [true, true]);
  });

  it('a single-group report (Profit & Loss) NEVER flips isGroupStart, not even on row 0', () => {
    const single = [
      node('root', { sort_path: '000001', group_name: 'Pérdidas y Ganancias' }),
      node('n1', { parent_id: 'root', sort_path: '000001.000001', elementlevel: 'E', group_name: 'Pérdidas y Ganancias' }),
      node('n2', { parent_id: 'n1', sort_path: '000001.000001.000001', group_name: 'Pérdidas y Ganancias' }),
      node('n3', { parent_id: 'root', sort_path: '000001.000002', elementlevel: 'E', group_name: 'Pérdidas y Ganancias' }),
    ];
    const out = buildAccountReportTree(single, []);
    assert.equal(out.length, 3);
    assert.ok(out.every((r) => r.isGroupStart === false), 'a one-group report must render zero group-header bands');
    assert.ok(out.every((r) => r.group === 'Pérdidas y Ganancias'));
  });

  it('two roots that share the same group name count as ONE group (no band)', () => {
    const sameGroup = [
      node('rootA', { sort_path: '000001', group_name: 'Activo' }),
      node('a', { parent_id: 'rootA', sort_path: '000001.000001', group_name: 'Activo' }),
      node('rootB', { sort_path: '000002', group_name: 'Activo' }),
      node('b', { parent_id: 'rootB', sort_path: '000002.000001', group_name: 'Activo' }),
    ];
    const out = buildAccountReportTree(sameGroup, []);
    assert.deepEqual(out.map((r) => r.isGroupStart), [false, false]);
  });
});
