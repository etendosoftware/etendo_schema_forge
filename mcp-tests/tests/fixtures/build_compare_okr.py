"""Regenerates tests/fixtures/compare-okr/ (the S4 report fixture).

The JSON files are committed and are what the tests read; this script only
documents how they were built and rebuilds them after a deliberate change:

    python3 tests/fixtures/build_compare_okr.py tests/fixtures/compare-okr

One task per decision path; see the numbered comments below.
"""
import json, shutil, sys
from pathlib import Path

root = Path(sys.argv[1])
shutil.rmtree(root, ignore_errors=True)

def w(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")

def call(tool, error=False, nbytes=100):
    return {"id": f"c-{tool}", "tool": tool, "args": {}, "error": error,
            "result": "", "resultBytes": nbytes, "resultTruncated": False}

def usage(total, turns):
    if total is None:
        return {"loop": {"turns": turns, "turnsWithUsage": 0, "inputTokens": None,
                         "outputTokens": None, "totalTokens": None, "cachedInputTokens": None},
                "report": None}
    return {"loop": {"turns": turns, "turnsWithUsage": turns, "inputTokens": total - 100,
                     "outputTokens": 100, "totalTokens": total, "cachedInputTokens": 0},
            "report": {"turns": 1, "turnsWithUsage": 1, "inputTokens": 400, "outputTokens": 100,
                       "totalTokens": 500, "cachedInputTokens": 0}}

def attempt(target, probe, n, *, calls, success, tokens="auto", outcome="OKAY", harness=None,
            frictions=(), suggestions=(), wasted=(), failures=(), start="10:00:00", end="10:01:00",
            replaces=None, mode="write"):
    rec = {
        "schemaVersion": 5, "runId": f"run-{target}", "probeId": probe, "attempt": n,
        "replaces": replaces, "mode": mode, "prompt": "p",
        "startedAt": f"2026-10-14T{start}Z", "finishedAt": f"2026-10-14T{end}Z",
        "effectVerified": success if harness is None else None,
        "effectCheck": None,
        "silentWrong": (outcome == "OKAY" and success is False) if harness is None else None,
        "finalAnswer": "listo",
        "usage": usage(3000 * max(len(calls), 1) if tokens == "auto" else tokens, max(len(calls), 1)),
        "servedModel": {"models": ["gpt-5.2"], "systemFingerprints": ["fp_1"]},
        "toolCallCount": len(calls), "toolCalls": calls, "exhausted": False,
        "setup": [], "teardown": [], "teardownClean": None,
        "harnessError": harness,
        "verdict": None if harness else {
            "schemaVersion": 3, "outcome": outcome, "summary": "s", "achieved": "a",
            "frictions": list(frictions), "failures": list(failures),
            "wastedCalls": list(wasted), "suggestions": list(suggestions)},
    }
    w(root / "targets" / target / "probes" / probe / f"attempt-{n}.json", rec)

def not_possible(target, probe, kind, reason, tools, check="ok"):
    w(root / "targets" / target / "probes" / probe / "not-possible.json", {
        "outcome": "notPossible", "probeId": probe,
        "declaration": {"kind": kind, "reason": reason, "missingTools": tools},
        "catalogueSha": f"sha-{target}", "check": check})

for target, platform, size in (("local", "etendo-go", 2000), ("holded", "holded", 8000)):
    w(root / "targets" / target / "run.json", {
        "schemaVersion": 5, "runId": f"run-{target}", "startedAt": "2026-10-14T10:00:00Z",
        "target": {"name": target, "url": f"https://{target}.example/mcp"},
        "serverBuild": None,
        "server": {"serverInfo": {"name": target, "version": "1.0.0"}, "protocolVersion": "2025-06-18",
                   "catalogue": {"sha": f"sha-{target}", "toolCount": 28 if target == "local" else 180,
                                 "bytes": size}, "error": None},
        "harness": {"commit": "abc123", "dirty": False}, "provider": "openai", "model": "openai/gpt-5.2",
        "temperature": 0, "promptVersion": 4, "maxSteps": 25, "maxResultChars": 20000, "repeat": 3,
        "suites": [{"file": "okr.yaml", "sha": "deadbeef"}]})
    # The progress feed: deliberately carries numbers that DISAGREE with the probe
    # files, so a report that read it would be caught by the deletion test.
    (root / "targets" / target / "events.ndjson").write_text(
        '{"t":"run_finished","ts":"2026-10-14T11:00:00Z","ok":99,"error":0,"mixed":0,"notMeasured":0}\n')

w(root / "compare.json", {
    "compareSchemaVersion": 1, "compareId": "20261014T1000-cmp-fixture",
    "startedAt": "2026-10-14T10:00:00Z", "finishedAt": "2026-10-14T10:30:00Z",
    "subject": "local", "repeat": 3,
    "decision": {"ruleVersion": 1, "callsMargin": 0.20, "tokensMargin": 0.10},
    "suite": {"file": "okr.yaml", "sha": "deadbeef", "schemaVersion": 2},
    "probes": ["w-invoice-one-product-issued", "q-product-prices-stock", "f-process-sales-order",
               "e-unknown-document", "q-both-not-possible", "q-short-of-attempts", "q-tokens-missing"],
    "targets": [
        {"name": "local", "platform": "etendo-go", "concurrency": 4,
         "freshness": {"status": "fresh", "checkedAt": "2026-10-14T09:59:00Z", "initializedAt": "2026-10-14T09:00:00Z"}},
        {"name": "holded", "platform": "holded", "concurrency": 2,
         "freshness": {"status": "clean", "checkedAt": "2026-10-14T09:59:30Z", "initializedAt": "2026-10-13T09:00:00Z"}},
    ],
    "pins": {"scheduleSeed": 42, "matcherVersion": 1, "verdictSchemaVersion": 3},
})

# 1. capability: holded cannot create invoices -> local wins by capability.
for n in (1, 2, 3):
    attempt("local", "w-invoice-one-product-issued", n, calls=[call("etendo_create"), call("etendo_action")], success=True)
not_possible("holded", "w-invoice-one-product-issued", "goal", "Holded's MCP has no tool to create an invoice.",
             ["create_invoice"])

# 2. q-product: local 3/3 (one recovered error), holded 2/3 with a harness error rescheduled.
attempt("local", "q-product-prices-stock", 1, mode="read",
        calls=[call("etendo_list", error=True), call("etendo_list"), call("etendo_get")], success=True)
attempt("local", "q-product-prices-stock", 2, mode="read", calls=[call("etendo_list"), call("etendo_get")], success=True)
attempt("local", "q-product-prices-stock", 3, mode="read", calls=[call("etendo_list"), call("etendo_get")], success=True)
attempt("holded", "q-product-prices-stock", 1, mode="read",
        calls=[call("list_products"), call("get_product", error=True), call("list_services")], success=True,
        wasted=[{"tool": "list_services", "expected": "x", "whatHappened": "y"}],
        failures=[{"tool": "get_product", "payload": {}, "error": "e", "recovered": False, "howRecovered": None}],
        frictions=[{"what": "No stock field on list", "cost": "2 calls", "phase": "read"}],
        suggestions=[{"what": "Return stock in list_products", "kind": "betterMetadata", "wouldHaveSaved": "1 call"}])
attempt("holded", "q-product-prices-stock", 2, mode="read", calls=[call("list_products")], success=None,
        harness={"kind": "provider", "detail": "429"})
attempt("holded", "q-product-prices-stock", 3, mode="read", calls=[call("list_products")], success=True)
attempt("holded", "q-product-prices-stock", 4, mode="read", replaces=2,
        calls=[call("list_products")], success=False, outcome="OKAY",
        suggestions=["legacy prose suggestion"])

# 3. f-process: both 3/3, median calls local 10 vs holded 8 -> exactly 20 % -> holded wins on calls.
for n, k in ((1, 10), (2, 10), (3, 9)):
    attempt("local", "f-process-sales-order", n, calls=[call("etendo_get")] * k, success=True)
for n, k in ((1, 8), (2, 8), (3, 9)):
    attempt("holded", "f-process-sales-order", n, calls=[call("approve_sales_order")] * k, success=True)

# 4. e-unknown: both 0/3 -> tie.
for t, tool in (("local", "etendo_list"), ("holded", "list_documents")):
    for n in (1, 2, 3):
        attempt(t, "e-unknown-document", n, calls=[call(tool)], success=False, outcome="ERROR")

# 5. both not possible -> excluded.
not_possible("local", "q-both-not-possible", "setup", "No tool for payroll.", [])
not_possible("holded", "q-both-not-possible", "setup", "No tool for payroll.", ["create_payroll"])

# 6. short of attempts on local -> not evaluable.
attempt("local", "q-short-of-attempts", 1, mode="read", calls=[call("etendo_list")], success=True)
attempt("local", "q-short-of-attempts", 2, mode="read", calls=[call("etendo_list")], success=None,
        harness={"kind": "setup", "detail": "setup failed"})
for n in (1, 2, 3):
    attempt("holded", "q-short-of-attempts", n, mode="read", calls=[call("list_contacts")], success=True)

# 7. tokens missing on holded -> bytes decide (local 300 B vs holded 1000 B).
for n in (1, 2, 3):
    attempt("local", "q-tokens-missing", n, mode="read", calls=[call("etendo_list", nbytes=300)], success=True)
    attempt("holded", "q-tokens-missing", n, mode="read", calls=[call("list_contacts", nbytes=1000)],
            success=True, tokens=None)
print("ok", root)
