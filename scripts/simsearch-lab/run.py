#!/usr/bin/env python3
"""SimSearch weighting lab.

Compares candidate scoring formulas for SimSearch (com.etendoerp.copilot.toolpack) against a
labelled query battery, using the REAL pg_trgm functions (similarity / word_similarity) of a
local PostgreSQL. Nothing here touches the module under test: the formulas are evaluated
offline from the raw (similarity, word_similarity, equality) triple of every (query, record)
pair.

Usage:
  python3 scripts/simsearch-lab/run.py                 # build lab DB + run the battery
  python3 scripts/simsearch-lab/run.py --src-db etendo34 --seed 7 --gap 15 --auto-min 90
  python3 scripts/simsearch-lab/run.py --keep-ranking-detail IVA   # print top-5 per formula for one query

Requires: psql/createdb on PATH, a source Etendo DB (read only) with pg_trgm-capable server.
The lab DB (default: simsearch_lab) is scratch and rebuilt on every run.
"""
import argparse
import csv
import io
import json
import math
import os
import random
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent

SRC_SQL = """
select entity, id, regexp_replace(name, E'[\\r\\n\\t]+', ' ', 'g') from (
select 'uom' entity, c_uom_id id, name from c_uom
union all select 'tax', c_tax_id, name from c_tax
union all select 'product', m_product_id, name from m_product where name not like 'E2E%'
union all select 'bpartner', c_bpartner_id, name from c_bpartner
union all select 'category', m_product_category_id, name from m_product_category
union all select 'country', c_country_id, name from c_country
union all select 'paymentterm', c_paymentterm_id, name from c_paymentterm
) s
"""

NEGATIVE_POOL = [
    "zzzqx", "xylophone", "qwerty 123", "banana split", "lorem ipsum", "kjhgfd", "asdfgh",
    "flux capacitor", "hyperdrive", "quokka", "zebra crossing", "ñandú", "wxyz", "plumbus",
    "schwarzwald", "mnbvcx", "trombone", "unobtainium", "gizmo 9000", "blorptastic",
]


# ----------------------------------------------------------------------------- psql plumbing
def psql(db, sql=None, stdin=None, tuples=False):
    cmd = ["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", db]
    if tuples:
        cmd += ["-At", "-F", "\t"]
    if sql is not None:
        cmd += ["-c", sql]
    r = subprocess.run(cmd, input=stdin, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("psql failed: %s\n%s" % (r.stderr.strip(), sql or ""))
    return r.stdout


def build_lab(args, fixtures):
    subprocess.run(["dropdb", "--if-exists", args.lab_db], check=True, capture_output=True)
    subprocess.run(["createdb", args.lab_db], check=True, capture_output=True)
    psql(args.lab_db, "create extension pg_trgm")
    psql(args.lab_db, "create table corpus(entity text, id text, name text)")
    csv_out = psql(args.src_db, "\\copy (%s) to stdout csv" % SRC_SQL.strip().replace("\n", " "))
    syn = io.StringIO()
    w = csv.writer(syn, lineterminator="\n")
    for ent, names in fixtures["corpus"].items():
        for i, n in enumerate(names):
            w.writerow([ent, "%s:%d" % (ent, i), n])
    psql(args.lab_db, "\\copy corpus from stdin csv", stdin=csv_out + syn.getvalue())


# ----------------------------------------------------------------------------- battery
def norm(s):
    return " ".join(s.upper().split())


def load_corpus(db):
    rows = psql(db, "select entity, id, name from corpus where name is not null and btrim(name) <> ''",
                tuples=True).strip().splitlines()
    by_ent = defaultdict(list)
    for line in rows:
        ent, id_, name = line.split("\t", 2)
        by_ent[ent].append((id_, name))
    return by_ent


def build_queries(by_ent, fixtures, seed, cap):
    rnd = random.Random(seed)
    queries = []  # dicts: entity, q, cls, expect(set of ids)
    seen = set()

    def add(ent, q, cls, expect, cover=0.0):
        key = (ent, q.lower())
        if key in seen or not q.strip():
            return
        seen.add(key)
        queries.append({"entity": ent, "q": " ".join(q.split()), "cls": cls, "expect": set(expect),
                        "cover": cover})

    # --- hand labelled fixtures (PR examples, OCR rule)
    for fx in fixtures["queries"]:
        names = {norm(n): i for i, n in by_ent_fixture_ids(by_ent, fx["entity"])}
        ids = [i for n, i in names.items() if n in {norm(e) for e in fx["expect"]}]
        nm = {i: norm(n) for i, n in by_ent_fixture_ids(by_ent, fx["entity"])}
        cov = max((len(norm(fx["q"])) / len(nm[i]) for i in ids), default=0.0)
        add(fx["entity"], fx["q"], "fx_" + fx["cls"], ids, cov)

    # --- generated from real data
    for ent, recs in by_ent.items():
        if ent.endswith("_syn") or ent.endswith("_syn2"):
            continue
        names = defaultdict(list)  # norm -> ids
        for id_, n in recs:
            names[norm(n)].append(id_)
        distinct = sorted(names)
        gen = defaultdict(list)

        def classify(q):
            nq = norm(q)
            exact = names.get(nq)
            contains = [n for n in distinct if nq in n and n != nq]
            if exact:
                if len(exact) > 1:
                    return "exact_dup", (exact, 0.0)
                return ("exact_competitors" if contains else "exact_nocompetitors"), (exact, 0.0)
            if contains:
                cover = max(len(nq) / len(n) for n in contains)
                return "partial", ([i for n in contains for i in names[n]], cover)
            return None, None

        for n in distinct:
            raw = next(nm for _, nm in recs if norm(nm) == n)
            if len(n) < 4:
                continue
            for q in {raw, raw.lower()}:
                cls, exp = classify(q)
                if cls:
                    gen[cls].append((q, exp))
            toks = raw.split()
            for k in range(1, len(toks)):                       # prefixes: "IVA", "IVA Normal"
                q = " ".join(toks[:k])
                if len(q) >= 4:
                    cls, exp = classify(q)
                    if cls:
                        gen[cls].append((q, exp))
            if len(toks) > 1 and len(toks[-1]) >= 4:            # last word
                cls, exp = classify(toks[-1])
                if cls:
                    gen[cls].append((toks[-1], exp))
            if len(raw) >= 7:                                   # typos of the full name
                m = len(raw) // 2
                for q in (raw[:m] + raw[m + 1:], raw[:m] + raw[m + 1] + raw[m] + raw[m + 2:]):
                    nq = norm(q)
                    if nq != n and nq not in names and not any(nq in x for x in distinct):
                        gen["typo"].append((q, (names[n], 0.0)))
        for cls, items in gen.items():
            rnd.shuffle(items)
            for q, (exp, cover) in items[:cap]:
                add(ent, q, cls, exp, cover)
        # negatives: junk that is not a substring of any name of the entity
        pool = NEGATIVE_POOL[:]
        rnd.shuffle(pool)
        for q in pool[:12]:
            if not any(norm(q) in x for x in distinct):
                add(ent, q, "negative", [])
    return queries


def by_ent_fixture_ids(by_ent, ent):
    return [(i, n) for i, n in by_ent.get(ent, [])]


# ----------------------------------------------------------------------------- pairs from PG
def compute_pairs(args, queries):
    db = args.lab_db
    psql(db, "create extension if not exists fuzzystrmatch");
    psql(db, "drop table if exists queries; create table queries(qid int, entity text, q text)")
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    for i, q in enumerate(queries):
        q["qid"] = i
        w.writerow([i, q["entity"], q["q"]])
    psql(db, "\\copy queries from stdin csv", stdin=buf.getvalue())
    sql = """
      select q.qid, c.id, c.name,
             similarity(upper(c.name), upper(q.q)),
             word_similarity(upper(q.q), upper(c.name)),
             1 - levenshtein(left(upper(c.name), 200), left(upper(q.q), 200))::float
                 / greatest(length(left(upper(c.name), 200)), length(left(upper(q.q), 200)), 1),
             least(length(btrim(c.name)), length(q.q))::float / greatest(length(btrim(c.name)), length(q.q), 1),
             (upper(regexp_replace(btrim(c.name), E'\\\\s+', ' ', 'g'))
              = upper(regexp_replace(btrim(q.q), E'\\\\s+', ' ', 'g')))::int
      from queries q join corpus c on c.entity = q.entity
      where similarity(upper(c.name), upper(q.q)) >= 0.15
         or word_similarity(upper(q.q), upper(c.name)) >= 0.15
    """
    out = psql(db, "\\copy (%s) to stdout csv" % " ".join(sql.split()))
    pairs = defaultdict(list)
    for row in csv.reader(io.StringIO(out)):
        qid, id_, name, sim, wsim, nes, lr, eq = row
        pairs[int(qid)].append({"id": id_, "name": name, "sim": float(sim), "wsim": float(wsim),
                                "nes": float(nes), "lr": float(lr), "eq": bool(int(eq))})
    return pairs


# ----------------------------------------------------------------------------- formulas
# Every formula returns (incl, disp):
#   incl -> number compared with minPct (decides which rows are returned)
#   disp -> number shown/ordered/used for the auto-resolve gap
# Ranking is (disp desc, sim desc, id asc) unless 'prepr' (no tie-break at all).
def F_current(s, w, eq, n=0.0):            # ETP-3963 as shipped
    v = max(s, w) * 100
    return v, v


def F_simonly(s, w, eq, n=0.0):            # before ETP-3963
    return s * 100, s * 100


def F_prstrict(s, w, eq, n=0.0):           # PRs 74/75 + client reading text_similarity_percent
    return max(s, w) * 100, s * 100


def mk_cap(a):
    def f(s, w, eq, n=0.0):
        v = max(s, a * w) * 100
        return v, v
    return f


def mk_capx(a):                     # cap + exact override (only equality reaches 100)
    def f(s, w, eq, n=0.0):
        v = 100.0 if eq else min(99.0, max(s, a * w) * 100)
        return v, v
    return f


def mk_blend(wt):
    def f(s, w, eq, n=0.0):
        v = (wt * s + (1 - wt) * w) * 100
        return v, v
    return f


def mk_clamp(a, top=85.0):          # exact -> 100, everything else compressed under `top`
    def f(s, w, eq, n=0.0):
        v = 100.0 if eq else min(top, max(s, a * w) * 100)
        return v, v
    return f


def mk_scale(a, top=85.0):          # exact -> 100, everything else scaled linearly into [0, top]
    def f(s, w, eq, n=0.0):
        v = 100.0 if eq else top * max(s, a * w)
        return v, v
    return f


def mk_graded(floor, top=85.0, a=0.8):
    """Contained names are graded by how much extra text they carry (normalized edit similarity
    n in [0,1]) instead of all getting the same flat value: a*w maps to [floor, top]."""
    def f(s, w, eq, n=0.0):
        contained = w * (floor + (top / 100.0 - floor) * n)
        v = 100.0 if eq else min(top, max(s, contained) * 100)
        return v, v
    return f


def mk_graded_edit(floor, k, top=85.0, a=0.8):
    """graded + edit similarity as an extra inclusion term (rescues typos trigrams underrate)."""
    def f(s, w, eq, n=0.0):
        contained = w * (floor + (top / 100.0 - floor) * n)
        v = 100.0 if eq else min(top, max(s, contained, k * n) * 100)
        return v, v
    return f


def mk_graded_len(floor, top=85.0):
    """Same as mk_graded but n is the length ratio (no extension needed: for a contained term the
    edit distance is exactly len(name) - len(term))."""
    f = mk_graded(floor, top)
    f.uses_lr = True
    return f


def mk_graded_len_strict(floor, top=85.0):
    """Length-graded only when the term is fully contained (word_similarity == 1); otherwise the
    flat 0.8 * word_similarity. Length ratio equals edit similarity only in the contained case."""
    def f(s, w, eq, n=0.0):
        contained = w * (floor + (top / 100.0 - floor) * n) if w >= 0.999 else 0.8 * w
        v = 100.0 if eq else min(top, max(s, contained) * 100)
        return v, v
    f.uses_lr = True
    return f


def mk_editsim(top=85.0):           # plain normalized edit similarity, capped
    def f(s, w, eq, n=0.0):
        v = 100.0 if eq else min(top, max(s, n) * 100)
        return v, v
    return f


def F_geo(s, w, eq, n=0.0):
    v = math.sqrt(s * w) * 100
    return v, v


def mk_blendx(wt):
    def f(s, w, eq, n=0.0):
        v = 100.0 if eq else min(99.0, (wt * s + (1 - wt) * w) * 100)
        return v, v
    return f


FORMULAS = [("current (max)", F_current, "prepr"), ("current + tie-break", F_current, "tb"),
            ("PR strict (gap on sim)", F_prstrict, "tb"), ("sim only (pre-3963)", F_simonly, "tb")]
FORMULAS += [("cap %.2f" % a, mk_cap(a), "tb") for a in (0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9)]
FORMULAS += [("cap %.2f + exact" % a, mk_capx(a), "tb") for a in (0.6, 0.7, 0.8, 0.9)]
FORMULAS += [("blend %.1f" % w, mk_blend(w), "tb") for w in (0.3, 0.5, 0.7)]
FORMULAS += [("blend %.1f + exact" % w, mk_blendx(w), "tb") for w in (0.3, 0.5, 0.7)]
FORMULAS += [("geo mean", F_geo, "tb")]
FORMULAS += [("graded-len-strict .70", mk_graded_len_strict(0.70), "tb"),
             ("graded-len-strict .60", mk_graded_len_strict(0.60), "tb"),
             ("graded-len floor .70 + exact", mk_graded_len(0.70), "tb"),
             ("graded-len floor .60 + exact", mk_graded_len(0.60), "tb"),
             ("graded floor .50 + exact", mk_graded(0.50), "tb"),
             ("graded floor .60 + exact", mk_graded(0.60), "tb"),
             ("graded floor .70 + exact", mk_graded(0.70), "tb"),
             ("edit-sim only + exact", mk_editsim(), "tb"),
             ("graded .70 + edit k=1.0", mk_graded_edit(0.70, 1.0), "tb"),
             ("graded .70 + edit k=0.9", mk_graded_edit(0.70, 0.9), "tb"),
             ("graded .70 + edit k=0.8", mk_graded_edit(0.70, 0.8), "tb"),
             ("cap 0.80 + exact, clamp 85", mk_clamp(0.8), "tb"),
             ("cap 0.90 + exact, clamp 85", mk_clamp(0.9), "tb"),
             ("scale 85 (a=0.8) + exact", mk_scale(0.8), "tb"),
             ("scale 85 (a=1.0) + exact", mk_scale(1.0), "tb")]


def rank(rows, fn, mode, min_pct, qty):
    scored = []
    for r in rows:
        incl, disp = fn(r["sim"], r["wsim"], r["eq"], r["lr"] if getattr(fn, "uses_lr", False) else r["nes"])
        if incl > min_pct:
            scored.append((disp, r["sim"], r))
    if mode == "prepr":
        scored.sort(key=lambda t: (-t[0], t[2]["id"]))
    else:
        scored.sort(key=lambda t: (-t[0], -t[1], t[2]["id"]))
    return [(d, r) for d, _, r in scored[:qty]]


# ----------------------------------------------------------------------------- evaluation
def evaluate(queries, pairs, args):
    results = {}
    for name, fn, mode in FORMULAS:
        res = {}
        for min_pct in args.min_pct:
            m = defaultdict(float)
            n = defaultdict(int)
            for q in queries:
                top = rank(pairs.get(q["qid"], []), fn, mode, min_pct, args.qty)
                cls = q["cls"].replace("fx_", "")
                n[cls] += 1
                top_ids = [r["id"] for _, r in top]
                s1 = top[0][0] if top else 0.0
                s2 = top[1][0] if len(top) > 1 else 0.0
                auto = bool(top) and s1 >= args.auto_min and (s1 - s2) >= args.gap
                ok1 = bool(top) and top_ids[0] in q["expect"]
                if cls.startswith("exact"):
                    m[cls + "_top1"] += ok1
                    if cls == "exact_competitors":
                        m["exact_auto"] += ok1 and auto
                    m["wrong_auto"] += auto and not ok1
                elif cls == "partial":
                    m["partial_recall3"] += any(i in q["expect"] for i in top_ids[:3])
                    m["partial_top1"] += ok1
                    # a partial name must not auto-resolve unless it covers nearly the whole name
                    m["wrong_auto"] += auto and (not ok1 or q["cover"] < args.cover)
                elif cls == "typo":
                    m["typo_top1"] += ok1
                    m["wrong_auto"] += auto and not ok1
                elif cls == "negative":
                    m["noise_rows"] += len(top)
                    m["wrong_auto"] += auto
            res[min_pct] = (m, n)
        results[name] = res
    return results


def pct(a, b):
    return "  - " if not b else "%3.0f%%" % (100.0 * a / b)


def report(results, args):
    first = next(iter(results.values()))[args.min_pct[0]][1]
    print("\nBattery size:", ", ".join("%s=%d" % (k, v) for k, v in sorted(first.items())))
    print("auto-resolve rule: top >= %.0f and lead over 2nd >= %.0f ; qty=%d ; seed=%d\n"
          % (args.auto_min, args.gap, args.qty, args.seed))
    for min_pct in args.min_pct:
        print("### minPct = %d\n" % min_pct)
        print("| formula | exact top1 | exact AUTO | typo top1 | partial recall@3 | partial top1 | "
              "noise rows/neg | WRONG auto |")
        print("|---|---|---|---|---|---|---|---|")
        rows = []
        for name, res in results.items():
            m, n = res[min_pct]
            ex_t = m["exact_competitors_top1"] + m["exact_nocompetitors_top1"] + m["exact_dup_top1"]
            ex_n = n["exact_competitors"] + n["exact_nocompetitors"] + n["exact_dup"]
            row = dict(name=name,
                       ex=ex_t / ex_n if ex_n else 1,
                       auto=m["exact_auto"] / n["exact_competitors"] if n["exact_competitors"] else 0,
                       typo=m["typo_top1"] / n["typo"] if n["typo"] else 1,
                       rec=m["partial_recall3"] / n["partial"] if n["partial"] else 1,
                       ptop=m["partial_top1"] / n["partial"] if n["partial"] else 1,
                       noise=m["noise_rows"] / n["negative"] if n["negative"] else 0,
                       wrong=int(m["wrong_auto"]))
            rows.append(row)
        # constraints first (no wrong exact, no wrong auto), then objectives
        rows.sort(key=lambda r: (r["ex"] < 1, r["wrong"] > 0, -r["auto"], -r["rec"], r["noise"], -r["typo"]))
        for r in rows:
            flag = "" if (r["ex"] == 1 and r["wrong"] == 0) else " ✗"
            print("| %s%s | %s | %s | %s | %s | %s | %.2f | %d |" % (
                r["name"], flag, pct(r["ex"], 1), pct(r["auto"], 1), pct(r["typo"], 1),
                pct(r["rec"], 1), pct(r["ptop"], 1), r["noise"], r["wrong"]))
        print()
    print("✗ = violates a hard constraint (an exact match not on top, or a wrong/partial row auto-resolved)")


def debug_fail(queries, pairs, args):
    fn, mode = next((f, m) for n, f, m in FORMULAS if n == args.debug_fail)
    min_pct = args.min_pct[0]
    print("\n### constraint violations for %r at minPct=%d" % (args.debug_fail, min_pct))
    for q in queries:
        top = rank(pairs.get(q["qid"], []), fn, mode, min_pct, args.qty)
        cls = q["cls"].replace("fx_", "")
        ok1 = bool(top) and top[0][1]["id"] in q["expect"]
        s1 = top[0][0] if top else 0.0
        s2 = top[1][0] if len(top) > 1 else 0.0
        auto = bool(top) and s1 >= args.auto_min and (s1 - s2) >= args.gap
        bad = (cls.startswith("exact") and not ok1) or (auto and (
            (cls == "partial" and (not ok1 or q["cover"] < args.cover)) or cls == "negative" or not ok1))
        if bad:
            print("- [%s/%s] %r -> %s" % (q["entity"], cls, q["q"], "; ".join(
                "%s%s %.0f" % ("*" if r["id"] in q["expect"] else "", r["name"][:30], d) for d, r in top[:3])))


def detail(queries, pairs, args, needle):
    for q in queries:
        if needle.lower() not in q["q"].lower():
            continue
        print("\n=== [%s] %r (%s) expect=%d ids" % (q["entity"], q["q"], q["cls"], len(q["expect"])))
        for name, fn, mode in FORMULAS:
            top = rank(pairs.get(q["qid"], []), fn, mode, args.min_pct[0], 5)
            line = "; ".join("%s%s %.0f" % ("*" if r["id"] in q["expect"] else "", r["name"][:28], d)
                             for d, r in top)
            print("  %-26s %s" % (name, line))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src-db", default=os.environ.get("SIMSEARCH_LAB_SRC", "etendoagosto"))
    ap.add_argument("--lab-db", default="simsearch_lab")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--cap", type=int, default=150, help="max generated queries per class per entity")
    ap.add_argument("--min-pct", type=int, nargs="+", default=[30, 50])
    ap.add_argument("--qty", type=int, default=5)
    ap.add_argument("--gap", type=float, default=15.0)
    ap.add_argument("--cover", type=float, default=0.8,
                    help="a partial query covering >= this share of the name may auto-resolve")
    ap.add_argument("--auto-min", type=float, default=90.0)
    ap.add_argument("--keep-ranking-detail", metavar="TEXT")
    ap.add_argument("--debug-fail", metavar="FORMULA", help="list queries that violate a constraint")
    args = ap.parse_args()

    fixtures = json.loads((HERE / "fixtures.json").read_text())
    build_lab(args, fixtures)
    by_ent = load_corpus(args.lab_db)
    queries = build_queries(by_ent, fixtures, args.seed, args.cap)
    pairs = compute_pairs(args, queries)
    report(evaluate(queries, pairs, args), args)
    if args.debug_fail:
        debug_fail(queries, pairs, args)
    if args.keep_ranking_detail:
        detail(queries, pairs, args, args.keep_ranking_detail)


if __name__ == "__main__":
    main()
