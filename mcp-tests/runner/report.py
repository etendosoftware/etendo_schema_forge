"""Comparison metrics, KR summary and stability check (plan §3, §5.6, §6; D47, D48).

Pure: everything is derived from `compare.json`, each target's `run.json` and
its probe files. **`events.ndjson` is never opened** (D48) — it is a progress
feed, and a number that could only be derived from it would not survive the
loss of a line.

    python -m runner.report report <compareDir>          # writes summary.json + summary.md
    python -m runner.report stability <compareDirA> <compareDirB>

The output carries no generation timestamp on purpose: re-running the report on
the same files yields byte-identical summaries, which is what lets a rule change
be re-applied to an old run and diffed (`make mcp-report`).

Layout read (run schema v4 + REPEAT, plan §5.1 / §5.2 / §5.10):

    <compareDir>/compare.json
    <compareDir>/targets/<target>/run.json
    <compareDir>/targets/<target>/probes/<probeId>/attempt-<n>.json
    <compareDir>/targets/<target>/probes/<probeId>/not-possible.json

All knowledge of that layout lives in `load_target`; the rest of the module
works on what it returns.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import statistics
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from . import decide as rule

#: v2 (S5 review): `selfReportedSuccess` — tasks whose success rests on the
#: agent's own report (a refusal with no objective check) are listed, never hidden.
#: v3 (S6): freshness carries `seedId`, `fixtureHash` and `reasons`; stability
#: refuses a pair whose run B reuses run A's seeded environment.
#: v4: `catalogueChanges` — per target, the tools added / removed since the
#: previous comparison of the same target (name + URL) found under runs/.
#: v5 (plan §9 q14): freshness carries `unverifiable` — the entities a target
#: could not check because its MCP does not offer their tool. A `fresh` target
#: may have some; the official headline names how many, the table lists them.
REPORT_VERSION = 5
SUMMARY_SCHEMA_VERSION = 5
STABILITY_TARGET = 0.90

# A characters-per-token estimate for the tool catalogue's priming share
# (plan §5.7, the ACE convention: bytes / 4). Shown as an estimate, never
# used by the decision rule, which decides on the provider's real totals.
BYTES_PER_TOKEN = 4

# Same place cli.py writes runs to; not imported from it, so the report never
# drags in the agent's dependencies.
RUNS_DIR = Path(__file__).resolve().parent.parent / "runs"

# Same value as runner.fixture.TOOL_NOT_OFFERED (not imported: see RUNS_DIR).
TOOL_NOT_OFFERED = "tool not offered"

# Pins that legitimately differ between the two runs of a stability pair.
_VOLATILE_PINS = {"compareId", "startedAt", "finishedAt", "initializedAt", "checkedAt",
                  "freshness", "concurrency"}


# --------------------------------------------------------------------------- loading


@dataclass
class ProbeRecords:
    attempts: list[tuple[int, dict[str, Any]]] = field(default_factory=list)  # sorted by n
    not_possible: dict[str, Any] | None = None


@dataclass
class TargetRecords:
    name: str
    run: dict[str, Any]
    probes: dict[str, ProbeRecords]


def _read_json(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def load_target(target_dir: Path, name: str) -> TargetRecords:
    """The ONE function that knows the probe-file layout.

    Attempts are read through `ui/runs.py` (stdlib only, no Streamlit import),
    which owns both layouts: `probes/<id>/attempt-<n>.json` (run schema v5) and
    the pre-REPEAT flat `probes/<id>.json`, read as attempt 1. Only
    `not-possible.json` (plan §5.10) is read here, because a notPossible probe
    has no attempt and the UI helpers do not list it.
    """
    from ui import runs as layout

    run = _read_json(target_dir / "run.json") or {}
    probes: dict[str, ProbeRecords] = {}
    for probe_id in layout.probe_files(target_dir):
        records = probes.setdefault(probe_id, ProbeRecords())
        for n in layout.attempt_numbers(target_dir, probe_id):
            data = layout.load_probe(target_dir, probe_id, n)
            if data is not None:
                records.attempts.append((n, data))
    root = target_dir / "probes"
    if root.is_dir():
        for np_file in sorted(root.glob("*/not-possible.json")):
            data = _read_json(np_file)
            if data is not None:
                probes.setdefault(np_file.parent.name, ProbeRecords()).not_possible = data
    return TargetRecords(name=name, run=run, probes=probes)


def _compare_targets(compare: dict[str, Any], compare_dir: Path) -> list[dict[str, Any]]:
    targets = compare.get("targets")
    if isinstance(targets, dict):
        return [{"name": k, **(v or {})} for k, v in targets.items()]
    if isinstance(targets, list):
        return [t if isinstance(t, dict) else {"name": t} for t in targets]
    found = compare_dir / "targets"
    return [{"name": p.name} for p in sorted(found.iterdir()) if p.is_dir()] if found.is_dir() else []


# --------------------------------------------------------------------------- one attempt


def attempt_success(record: dict[str, Any]) -> bool | None:
    """Item 1, objective only (plan §3).

    `success` when the runner recorded it (suite v2: refusal rule included);
    otherwise every objective check present (`effectVerified`, `answerVerified`)
    must hold. None = nothing verified it, which makes the attempt unusable for
    a decision rather than a quiet failure.
    """
    if isinstance(record.get("success"), bool):
        return record["success"]
    checks = [record.get(k) for k in ("effectVerified", "answerVerified")]
    checks = [c for c in checks if isinstance(c, bool)]
    return all(checks) if checks else None


def unrecovered_errors(calls: list[dict[str, Any]]) -> int:
    """Item 5: an error call with no LATER successful call to the same tool."""
    count = 0
    for i, call in enumerate(calls):
        if call.get("error") and not any(
            later.get("tool") == call.get("tool") and not later.get("error") for later in calls[i + 1:]
        ):
            count += 1
    return count


def _usage_total(record: dict[str, Any], key: str) -> int | None:
    usage = (record.get("usage") or {}).get(key) or {}
    value = usage.get("totalTokens")
    return value if isinstance(value, int) else None


def measure_attempt(n: int, record: dict[str, Any]) -> dict[str, Any]:
    calls = record.get("toolCalls") or []
    verdict = record.get("verdict") or {}
    errors = sum(1 for c in calls if c.get("error"))
    unrecovered = unrecovered_errors(calls)
    wasted = len(verdict.get("wastedCalls") or [])
    harness = record.get("harnessError")
    loop = (record.get("usage") or {}).get("loop") or {}
    return {
        "attempt": n,
        "measured": harness is None,
        "harnessError": (harness or {}).get("kind") if harness else None,
        "success": attempt_success(record),
        "toolCalls": record.get("toolCallCount", len(calls)),
        # Item 4: the first call did not error. None when no call was made.
        "firstCallOk": (not calls[0].get("error")) if calls else None,
        "errorCalls": errors,
        "unrecovered": unrecovered,
        "selfCorrected": errors - unrecovered,
        "wastedCalls": wasted,
        "stumbles": errors + wasted,
        "silentWrong": record.get("silentWrong"),
        "tokens": _usage_total(record, "loop"),
        "reportTokens": _usage_total(record, "report"),
        "turns": loop.get("turns"),
        "bytes": sum(int(c.get("resultBytes") or 0) for c in calls),
        # Cross-check only, never item 5 (plan §3): the agent's own claim.
        "selfReportedUnrecovered": sum(1 for f in verdict.get("failures") or [] if not f.get("recovered")),
        "startedAt": record.get("startedAt"),
        "finishedAt": record.get("finishedAt"),
    }


# --------------------------------------------------------------------------- one side


def _median(values: list[float]) -> float | None:
    return statistics.median(values) if values else None


def _catalogue_tokens(run: dict[str, Any]) -> float | None:
    cat = ((run.get("server") or {}).get("catalogue") or {})
    size = cat.get("bytes")
    return size / BYTES_PER_TOKEN if isinstance(size, (int, float)) else None


def aggregate_side(target: TargetRecords, probe_id: str, repeat: int,
                   platform: str | None) -> tuple[dict[str, Any], rule.Side]:
    records = target.probes.get(probe_id)
    base = {"target": target.name, "platform": platform}
    if records is None:
        reason = "no record for this task"
        return {**base, "capability": "possible", "notEvaluable": reason}, rule.Side(not_evaluable=reason)

    if records.not_possible is not None:
        np = records.not_possible
        declaration = np.get("declaration") or {}
        check = np.get("check")
        capability = "invalidDeclaration" if check == "invalidDeclaration" else "notPossible"
        entry = {**base, "capability": capability, "notPossible": {
            "kind": declaration.get("kind"), "reason": declaration.get("reason"),
            "missingTools": declaration.get("missingTools") or [],
            "check": check, "catalogueSha": np.get("catalogueSha"),
        }}
        return entry, rule.Side(capability=capability)

    per_attempt = [measure_attempt(n, rec) for n, rec in records.attempts]
    measured = [a for a in per_attempt if a["measured"]]
    counted = measured[:repeat]
    not_evaluable = None
    if len(counted) < repeat:
        not_evaluable = f"{len(counted)} of {repeat} measured attempts"
    else:
        unverified = [a["attempt"] for a in counted if a["success"] is None]
        if unverified:
            not_evaluable = f"success not verifiable on attempt(s) {unverified}"

    successful = [a for a in counted if a["success"]]
    with_call = [a for a in counted if a["firstCallOk"] is not None]
    errors = sum(a["errorCalls"] for a in counted)
    unrecovered = sum(a["unrecovered"] for a in counted)
    tokens_ok = bool(successful) and all(a["tokens"] is not None for a in successful)
    median_tokens = _median([a["tokens"] for a in successful]) if tokens_ok else None
    median_bytes = _median([a["bytes"] for a in successful])

    catalogue = _catalogue_tokens(target.run)
    priming = None
    if catalogue is not None and tokens_ok:
        primings = [catalogue * (a["turns"] or 0) for a in successful]
        priming = {
            "estimate": True,
            "catalogueTokens": round(catalogue),
            "medianPrimingTokens": round(_median(primings)),
            "medianRemainderTokens": round(_median([a["tokens"] - p for a, p in zip(successful, primings)])),
        }

    items = {
        "success": len(successful),
        "consistency": {"successes": len(successful), "of": len(counted),
                        "ratio": round(len(successful) / len(counted), 4) if counted else None},
        "medianCalls": _median([a["toolCalls"] for a in successful]),
        "firstCallSuccess": {"ok": sum(1 for a in with_call if a["firstCallOk"]), "of": len(with_call)},
        "unrecoveredErrors": unrecovered,
        "selfCorrectedErrors": {"count": errors - unrecovered, "ofErrors": errors,
                                "ratio": round((errors - unrecovered) / errors, 4) if errors else None},
        "stumbles": {"total": sum(a["stumbles"] for a in counted), "errorCalls": errors,
                     "wastedCalls": sum(a["wastedCalls"] for a in counted),
                     "partlySelfReported": True},
        "silentWrong": sum(1 for a in counted if a["silentWrong"] is True),
        "cost": {"medianTokens": median_tokens, "medianBytes": median_bytes,
                 "tokensAvailable": tokens_ok, "priming": priming},
    }
    entry = {
        **base, "capability": "possible", "notEvaluable": not_evaluable,
        "attempts": {"files": len(per_attempt), "measured": len(measured),
                     "harnessErrors": len(per_attempt) - len(measured), "counted": len(counted)},
        "items": items,
        "crossCheck": {"selfReportedUnrecovered": sum(a["selfReportedUnrecovered"] for a in counted)},
        "perAttempt": per_attempt,
    }
    side = rule.Side(
        not_evaluable=not_evaluable, successes=len(successful), attempts=len(counted),
        median_calls=items["medianCalls"], unrecovered=unrecovered,
        median_tokens=median_tokens, median_bytes=median_bytes,
    )
    return entry, side


# --------------------------------------------------------------------------- summary


def _parse_ts(value: Any) -> dt.datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _wall_seconds(starts: list[Any], ends: list[Any]) -> float | None:
    s = [t for t in map(_parse_ts, starts) if t]
    e = [t for t in map(_parse_ts, ends) if t]
    return (max(e) - min(s)).total_seconds() if s and e else None


def _all_measures(target: TargetRecords) -> list[dict[str, Any]]:
    """Every attempt file of a target, replacements and harness errors included."""
    return [measure_attempt(n, rec) for p in target.probes.values() for n, rec in p.attempts]


def _run_cost(measures: list[dict[str, Any]]) -> dict[str, Any]:
    """Real cost of the comparison on one target, from all its attempt measurements.

    A token total is None — never 0 — when no attempt reported usage: "nothing
    was measured" must not read as "it cost nothing" (same rule as usage.loop).
    """
    loop = [m["tokens"] for m in measures if m["tokens"] is not None]
    report = [m["reportTokens"] for m in measures if m["reportTokens"] is not None]
    return {
        "attempts": len(measures),
        "harnessErrors": sum(1 for m in measures if not m["measured"]),
        "loopTokens": sum(loop) if loop else None,
        "reportTokens": sum(report) if report else None,
        "attemptsWithoutLoopUsage": len(measures) - len(loop),
        "wallSeconds": _wall_seconds([m["startedAt"] for m in measures], [m["finishedAt"] for m in measures]),
    }


def _backlog(target: TargetRecords, tasks: list[str]) -> dict[str, Any]:
    """Frictions (by phase) and suggestions (by kind), verbatim — the docs backlog."""
    frictions: dict[str, list[dict[str, Any]]] = {}
    suggestions: dict[str, list[dict[str, Any]]] = {}
    for task in tasks:
        records = target.probes.get(task)
        for n, rec in (records.attempts if records else []):
            verdict = rec.get("verdict") or {}
            for f in verdict.get("frictions") or []:
                frictions.setdefault(f.get("phase") or "unclassified", []).append(
                    {"task": task, "attempt": n, "what": f.get("what"), "cost": f.get("cost")})
            for s in verdict.get("suggestions") or []:
                if isinstance(s, str):  # verdict v1/v2: prose only (D14)
                    s = {"what": s, "kind": "unclassified"}
                suggestions.setdefault(s.get("kind") or "unclassified", []).append(
                    {"task": task, "attempt": n, "what": s.get("what"), "wouldHaveSaved": s.get("wouldHaveSaved")})
    return {"frictions": dict(sorted(frictions.items())), "suggestions": dict(sorted(suggestions.items()))}


def _target_pins(target: TargetRecords, meta: dict[str, Any]) -> dict[str, Any]:
    run = target.run
    server = run.get("server") or {}
    cat = server.get("catalogue") or {}
    return {
        "platform": meta.get("platform"),
        "url": (run.get("target") or {}).get("url"),
        "model": run.get("model"), "temperature": run.get("temperature"),
        "promptVersion": run.get("promptVersion"), "runSchemaVersion": run.get("schemaVersion"),
        "maxSteps": run.get("maxSteps"), "maxResultChars": run.get("maxResultChars"),
        "suites": run.get("suites"),
        "catalogueSha": cat.get("sha"), "toolCount": cat.get("toolCount"),
        "serverInfo": server.get("serverInfo"), "harness": run.get("harness"),
    }


def _run_tools(run: dict[str, Any]) -> list[str] | None:
    tools = (run.get("server") or {}).get("tools")
    return sorted(str(t) for t in tools) if isinstance(tools, list) else None


#: compareId stamps: `%Y%m%dT%H%M%S` since 2026-10-15, `%Y%m%dT%H%M` before.
_ID_STAMP_RE = re.compile(r"^(\d{8}T\d{4}(?:\d{2})?)-")
_EPOCH = dt.datetime.min.replace(tzinfo=dt.timezone.utc)


def _utc(moment: dt.datetime | None) -> dt.datetime | None:
    if moment is None:
        return None
    return moment.replace(tzinfo=dt.timezone.utc) if moment.tzinfo is None else moment


def comparison_order(compare: dict[str, Any], fallback_id: str) -> tuple[dt.datetime, str]:
    """Sort key of a comparison: (when it started, compareId).

    `startedAt` (ms, UTC) decides, the compareId breaks ties. A legacy
    compare.json without `startedAt` falls back to the stamp its compareId
    starts with (minute precision before 2026-10-15), so two legacy
    comparisons of the same minute are still ordered by their random suffix —
    deterministic, but not chronological. An id with no stamp sorts first.
    """
    compare_id = str(compare.get("compareId") or fallback_id)
    started = _utc(_parse_ts(compare.get("startedAt")))
    if started is None:
        match = _ID_STAMP_RE.match(compare_id)
        if match:
            stamp = match.group(1)
            started = dt.datetime.strptime(stamp, "%Y%m%dT%H%M%S" if len(stamp) == 15 else "%Y%m%dT%H%M"
                                           ).replace(tzinfo=dt.timezone.utc)
    return (started or _EPOCH, compare_id)


def _previous_run(compare_dir: Path, current: tuple[dt.datetime, str], name: str, url: str | None
                  ) -> tuple[str, dict[str, Any]] | None:
    """The most recent EARLIER comparison of the same target (name + URL) that recorded its tools.

    Deterministic, so the summary stays byte-reproducible: candidates are the
    sibling comparison directories ordered by `comparison_order`, and only
    those strictly before this one count — a comparison started later, even in
    the same minute, never changes this one's report. A sibling whose
    compare.json or run.json is unreadable or not a JSON object is skipped.
    """
    if url is None:
        return None
    candidates = []
    for other in compare_dir.parent.iterdir() if compare_dir.parent.is_dir() else ():
        if other.resolve() == compare_dir.resolve() or not other.is_dir():
            continue
        compare = _read_json(other / "compare.json")
        if not isinstance(compare, dict):
            continue
        key = comparison_order(compare, other.name)
        if key < current:
            candidates.append((key, other))
    for key, other in sorted(candidates, reverse=True):
        run = _read_json(other / "targets" / name / "run.json")
        if not isinstance(run, dict):
            continue
        if (run.get("target") or {}).get("url") == url and _run_tools(run) is not None:
            return key[1], run
    return None


def _watched_tools(rows: list[dict[str, Any]], target: str, freshness: dict[str, Any]) -> dict[str, list[str]]:
    """tool -> what names it: a `notPossible.missingTools` entry or a freshness checklist entity."""
    watched: dict[str, set[str]] = {}
    for row in rows:
        for key in ("subject", "reference"):
            side = row[key]
            if side.get("target") == target and side.get("notPossible"):
                for tool in side["notPossible"].get("missingTools") or []:
                    watched.setdefault(tool, set()).add(f"notPossible {row['task']}")
    details = (freshness or {}).get("details") or {}
    for kind in ("documents", "masterData"):
        for entry in details.get(kind) or []:
            if entry.get("tool"):
                watched.setdefault(entry["tool"], set()).add(f"freshness {entry.get('name')}")
    for entry in (freshness or {}).get("unverifiable") or []:
        if entry.get("check") == "baseline" and entry.get("tool"):
            watched.setdefault(entry["tool"], set()).add(f"baseline {entry.get('entity')}")
    return {tool: sorted(names) for tool, names in watched.items()}


def catalogue_changes(compare_dir: Path, order: tuple[dt.datetime, str], target: TargetRecords,
                      meta: dict[str, Any], rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Tools added and removed since the previous comparison of this target (vendor catalogues move)."""
    url = (target.run.get("target") or {}).get("url")
    current = _run_tools(target.run)
    sha = ((target.run.get("server") or {}).get("catalogue") or {}).get("sha")
    base = {"url": url, "catalogueSha": sha, "previous": None, "previousCatalogueSha": None,
            "added": [], "removed": [], "watched": []}
    if current is None:
        return {**base, "status": "unknown", "note": "this run recorded no tool list"}
    found = _previous_run(compare_dir, order, target.name, url)
    if found is None:
        return {**base, "status": "noPrevious",
                "note": "no earlier comparison of this target (same name and URL) in runs/"}
    previous_id, previous = found
    before = set(_run_tools(previous) or [])
    added, removed = sorted(set(current) - before), sorted(before - set(current))
    watched = _watched_tools(rows, target.name, meta.get("freshness") or {})
    flagged = [{"tool": t, "change": change, "namedBy": watched[t]}
               for change, tools in (("added", added), ("removed", removed)) for t in tools if t in watched]
    return {**base, "status": "changed" if added or removed else "unchanged", "previous": previous_id,
            "previousCatalogueSha": ((previous.get("server") or {}).get("catalogue") or {}).get("sha"),
            "added": added, "removed": removed, "watched": flagged}


def _self_reported(tasks: list[str], targets: tuple[TargetRecords, ...]) -> dict[str, Any]:
    """Tasks whose success, on some target, rests on `successBasis: selfReport`."""
    rows = []
    for task in tasks:
        for target in targets:
            records = target.probes.get(task)
            if records and any(rec.get("successBasis") == "selfReport" for _n, rec in records.attempts):
                rows.append({"task": task, "target": target.name})
    return {"count": len({r["task"] for r in rows}), "tasks": rows}


def build_summary(compare_dir: Path) -> dict[str, Any]:
    compare_dir = Path(compare_dir)
    compare = _read_json(compare_dir / "compare.json") or {}
    metas = _compare_targets(compare, compare_dir)
    if len(metas) != 2:
        raise ValueError(f"a comparison needs exactly two targets, found {len(metas)} in {compare_dir}")
    subject_name = compare.get("subject") or metas[0]["name"]
    ordered = sorted(metas, key=lambda m: m["name"] != subject_name)
    subject_meta, reference_meta = ordered
    targets = {m["name"]: load_target(compare_dir / "targets" / m["name"], m["name"]) for m in ordered}
    subject, reference = targets[subject_meta["name"]], targets[reference_meta["name"]]

    repeat = int(compare.get("repeat") or subject.run.get("repeat") or 1)
    params = rule.resolve_parameters(compare.get("decision"))
    descriptor = rule.rule_descriptor(params)

    declared = compare.get("probes")
    tasks = list(declared) if isinstance(declared, list) else sorted(set(subject.probes) | set(reference.probes))

    task_rows, decisions = [], {}
    for task in tasks:
        s_entry, s_side = aggregate_side(subject, task, repeat, subject_meta.get("platform"))
        r_entry, r_side = aggregate_side(reference, task, repeat, reference_meta.get("platform"))
        decision = rule.decide(s_side, r_side, params)
        decisions[task] = decision
        task_rows.append({"task": task, **decision.to_json(), "subject": s_entry, "reference": r_entry})

    decided = [r for r in task_rows if r["status"] == "decided"]
    s_wins = [r for r in decided if r["winner"] == rule.SUBJECT]
    r_wins = [r for r in decided if r["winner"] == rule.REFERENCE]
    by_cap = lambda rows: sum(1 for r in rows if r["decidedBy"] == "0-capability")  # noqa: E731
    kr = {
        "subject": subject.name, "reference": reference.name,
        "tasks": len(task_rows), "evaluated": len(decided),
        "subjectWins": {"total": len(s_wins), "byCapability": by_cap(s_wins),
                        "byMeasurement": len(s_wins) - by_cap(s_wins)},
        "referenceWins": {"total": len(r_wins), "byCapability": by_cap(r_wins),
                          "byMeasurement": len(r_wins) - by_cap(r_wins)},
        "ties": sum(1 for r in decided if r["winner"] == rule.TIE),
        "winRate": round(len(s_wins) / len(decided), 4) if decided else None,
        "winRateByCapability": round(by_cap(s_wins) / len(decided), 4) if decided else None,
        "winRateByMeasurement": round((len(s_wins) - by_cap(s_wins)) / len(decided), 4) if decided else None,
        "fragile": sum(1 for r in decided if r["fragile"]),
    }

    stumbles = {}
    for key, target in (("subject", subject), ("reference", reference)):
        sides = [r[key] for r in task_rows if r[key].get("capability") == "possible" and r[key].get("items")]
        attempts = sum(s["attempts"]["counted"] for s in sides)
        total = sum(s["items"]["stumbles"]["total"] for s in sides)
        stumbles[target.name] = {
            "tasks": len(sides), "attempts": attempts, "stumbles": total,
            "perAttempt": round(total / attempts, 4) if attempts else None,
            "tasksWithAnyStumble": sum(1 for s in sides if s["items"]["stumbles"]["total"]),
            "tasksWithAnyStumbleRatio": round(
                sum(1 for s in sides if s["items"]["stumbles"]["total"]) / len(sides), 4) if sides else None,
            "partlySelfReported": True,
        }

    freshness = {}
    for meta in ordered:
        fresh = meta.get("freshness") or {}
        freshness[meta["name"]] = {"status": fresh.get("status") or "unknown",
                                   "checkedAt": fresh.get("checkedAt"),
                                   "initializedAt": fresh.get("initializedAt"),
                                   "seedId": fresh.get("seedId"),
                                   "fixtureHash": fresh.get("fixtureHash"),
                                   "reasons": freshness_reasons(fresh),
                                   # Plan §9 q14: what a `fresh` target could not check.
                                   "unverifiable": fresh.get("unverifiable") or []}
    official = all(f["status"] == "fresh" for f in freshness.values())

    starts = [compare.get("startedAt")] if compare.get("startedAt") else []
    ends = [compare.get("finishedAt")] if compare.get("finishedAt") else []
    measures = {t.name: _all_measures(t) for t in (subject, reference)}
    costs = {name: _run_cost(ms) for name, ms in measures.items()}
    if not (starts and ends):
        everything = [m for ms in measures.values() for m in ms]
        starts = [m["startedAt"] for m in everything]
        ends = [m["finishedAt"] for m in everything]

    return {
        "summarySchemaVersion": SUMMARY_SCHEMA_VERSION,
        "reportVersion": REPORT_VERSION,
        "compareId": compare.get("compareId") or compare_dir.name,
        "rule": {**descriptor, "versionAtRun": (compare.get("decision") or {}).get("ruleVersion")},
        "official": official,
        "freshness": freshness,
        "repeat": repeat,
        "kr": kr,
        "stumbleIndicators": stumbles,
        "tasks": task_rows,
        # Plan §5.5 / S5 review: success that rests on the agent's own word (a
        # refusal with no objective check) is allowed, but never hidden in the
        # success count — every such task is listed here.
        "selfReportedSuccess": _self_reported(tasks, (subject, reference)),
        # A vendor's tools/list moves: what changed since this target's previous
        # comparison, and above all any tool a notPossible or a freshness check names.
        "catalogueChanges": {
            m["name"]: catalogue_changes(compare_dir, comparison_order(compare, compare_dir.name),
                                         targets[m["name"]], m, task_rows)
            for m in ordered
        },
        "capabilityGaps": [
            {"task": r["task"], "target": side["target"], **side["notPossible"]}
            for r in task_rows for side in (r["subject"], r["reference"])
            if side.get("capability") == "notPossible"
        ],
        "excluded": [{"task": r["task"], "reason": r["reason"]} for r in task_rows if r["status"] == "excluded"],
        "notEvaluable": [{"task": r["task"], "reason": r["reason"]} for r in task_rows if r["status"] == "notEvaluable"],
        "backlog": {t.name: _backlog(t, tasks) for t in (subject, reference)},
        "cost": {"wallSeconds": _wall_seconds(starts, ends), "targets": costs},
        "pins": {
            "compare": compare.get("pins") or {},
            "suite": compare.get("suite"),
            "repeat": repeat,
            "subject": subject.name, "reference": reference.name,
            "rule": descriptor,
            "reportVersion": REPORT_VERSION,
            "targets": {m["name"]: _target_pins(targets[m["name"]], m) for m in ordered},
            "concurrency": {m["name"]: m.get("concurrency") for m in ordered},
        },
    }


# --------------------------------------------------------------------------- markdown


def _pct(value: float | None) -> str:
    return "—" if value is None else f"{value * 100:.0f} %"


def _fmt(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:g}"
    return str(value)


def _side_cells(side: dict[str, Any]) -> list[str]:
    if side.get("capability") != "possible":
        np = side.get("notPossible") or {}
        label = "invalid declaration" if side["capability"] == "invalidDeclaration" else "not possible"
        return [f"{label} ({np.get('kind')}): {np.get('reason')}"] + ["—"] * 8
    items = side.get("items")
    if not items:
        return [f"not evaluable: {side.get('notEvaluable')}"] + ["—"] * 8
    cost = items["cost"]
    cost_cell = "—" if not items["success"] else (
        f"{_fmt(cost['medianTokens'])} tok · {_fmt(cost['medianBytes'])} B")
    if cost.get("priming"):
        cost_cell += f" (priming ≈ {cost['priming']['medianPrimingTokens']})"
    sc = items["selfCorrectedErrors"]
    fc = items["firstCallSuccess"]
    return [
        f"{items['success']}" + (f" — {side['notEvaluable']}" if side.get("notEvaluable") else ""),
        f"{items['consistency']['successes']}/{items['consistency']['of']}",
        _fmt(items["medianCalls"]),
        f"{fc['ok']}/{fc['of']}",
        str(items["unrecoveredErrors"]),
        f"{sc['count']}/{sc['ofErrors']}",
        str(items["stumbles"]["total"]),
        str(items["silentWrong"]),
        cost_cell,
    ]


def render_markdown(summary: dict[str, Any]) -> str:
    kr = summary["kr"]
    label = official_label(summary)
    lines = [
        f"# MCP comparison {summary['compareId']} — {label}",
        "",
        f"**KR2.1 ({kr['subject']} vs {kr['reference']}): {_pct(kr['winRate'])}** of "
        f"{kr['evaluated']} evaluated tasks ({kr['tasks']} in the suite) — "
        f"{kr['subjectWins']['byCapability']} won by capability ({_pct(kr['winRateByCapability'])}), "
        f"{kr['subjectWins']['byMeasurement']} by measurement ({_pct(kr['winRateByMeasurement'])}). "
        f"{kr['reference']} won {kr['referenceWins']['total']} "
        f"({kr['referenceWins']['byCapability']} by capability), {kr['ties']} ties, "
        f"{kr['fragile']} fragile.",
        "",
        f"Rule v{summary['rule']['version']} (parameters {summary['rule']['parametersSha']}: "
        + ", ".join(f"{k}={v:g}" for k, v in summary["rule"]["parameters"].items())
        + f") · REPEAT={summary['repeat']} · report v{summary['reportVersion']}",
        "",
        "## Freshness",
        "",
    ]
    if not summary["official"]:
        lines += ["Unofficial: an official number needs every target `fresh` (plan §5.9).", ""]
    lines += ["| Target | Status | Checked at | Initialized at | Seed | Not verifiable |",
              "|---|---|---|---|---|---|"]
    for name, fresh in summary["freshness"].items():
        lines.append(f"| {name} | {fresh['status']} | {_fmt(fresh['checkedAt'])} | {_fmt(fresh['initializedAt'])} "
                     f"| {_fmt(fresh.get('seedId'))} | {len(fresh.get('unverifiable') or [])} |")
    for name, fresh in summary["freshness"].items():
        for reason in fresh.get("reasons") or []:
            lines.append(f"- {name}: {reason}")
    for name, fresh in summary["freshness"].items():
        for u in fresh.get("unverifiable") or []:
            lines.append(f"- {name}: not verifiable — {u.get('check')} {u['entity']} "
                         f"({u['tool']}: {u.get('reason') or TOOL_NOT_OFFERED})")

    lines += ["", "## Tasks", "",
              "| Task | Target | Success | Consistency | Calls (median) | First call ok | Unrecovered "
              "| Self-corrected | Stumbles | Silent wrong | Cost (median) | Winner | Decided by |",
              "|---" * 13 + "|"]
    for row in summary["tasks"]:
        if row["status"] == "decided":
            winner = {"subject": row["subject"]["target"], "reference": row["reference"]["target"]}.get(
                row["winner"], "tie") + (" (fragile)" if row["fragile"] else "")
            by = row["decidedBy"]
        else:
            winner, by = row["status"], row["reason"]
        for i, key in enumerate(("subject", "reference")):
            side = row[key]
            cells = [row["task"] if i == 0 else "", side["target"], *_side_cells(side),
                     winner if i == 0 else "", by if i == 0 else ""]
            lines.append("| " + " | ".join(c.replace("|", "\\|") for c in cells) + " |")
    lines += ["", "Stumbles = error calls + the agent's self-reported wasted calls (partly self-reported)."]

    lines += ["", "## Stumble indicators", "", "| Target | Stumbles / attempt | Tasks with any stumble |", "|---|---|---|"]
    for name, s in summary["stumbleIndicators"].items():
        lines.append(f"| {name} | {_fmt(s['perAttempt'])} | {s['tasksWithAnyStumble']}/{s['tasks']} "
                     f"({_pct(s['tasksWithAnyStumbleRatio'])}) |")

    if summary["capabilityGaps"]:
        lines += ["", "## Capability gaps", ""]
        for gap in summary["capabilityGaps"]:
            tools = ", ".join(gap["missingTools"]) or "no tools declared (unchecked)"
            lines.append(f"- **{gap['task']}** on {gap['target']} ({gap['kind']}): {gap['reason']} — missing: {tools}")
    lines += ["", "## Catalogue changes since the previous comparison", ""]
    for name, change in (summary.get("catalogueChanges") or {}).items():
        if change["status"] in ("unknown", "noPrevious"):
            lines.append(f"- {name}: {change['note']}.")
            continue
        head = f"- {name}: versus {change['previous']}"
        if change["status"] == "unchanged":
            lines.append(f"{head} — no tool added or removed.")
            continue
        lines.append(f"{head} — added {', '.join(change['added']) or 'none'}; "
                     f"removed {', '.join(change['removed']) or 'none'}.")
        for w in change["watched"]:
            lines.append(f"  - **{w['tool']} {w['change']}** — named by {', '.join(w['namedBy'])}: "
                         f"review that declaration.")
    self_reported = summary.get("selfReportedSuccess") or {}
    if self_reported.get("count"):
        lines += ["", "## Success on the agent's word", "",
                  f"{self_reported['count']} task(s) decide success by the agent's self-report alone "
                  f"(a refusal with no objective check, plan §5.5) — read them with that in mind:", ""]
        for row in self_reported["tasks"]:
            lines.append(f"- **{row['task']}** on {row['target']}")
    if summary["excluded"] or summary["notEvaluable"]:
        lines += ["", "## Not counted", ""]
        for row in summary["excluded"]:
            lines.append(f"- **{row['task']}** excluded: {row['reason']}")
        for row in summary["notEvaluable"]:
            lines.append(f"- **{row['task']}** not evaluable: {row['reason']}")

    lines += ["", "## Stumble backlog", ""]
    for name, backlog in summary["backlog"].items():
        lines.append(f"### {name}")
        if not backlog["frictions"] and not backlog["suggestions"]:
            lines += ["", "Nothing reported.", ""]
            continue
        for phase, entries in backlog["frictions"].items():
            lines.append(f"- friction / {phase}:")
            lines += [f"  - [{e['task']} a{e['attempt']}] {e['what']} ({_fmt(e['cost'])})" for e in entries]
        for kind, entries in backlog["suggestions"].items():
            lines.append(f"- suggestion / {kind}:")
            lines += [f"  - [{e['task']} a{e['attempt']}] {e['what']} — saves: {_fmt(e['wouldHaveSaved'])}"
                      for e in entries]
        lines.append("")

    lines += ["## Run cost", "", f"Wall time: {_fmt(summary['cost']['wallSeconds'])} s", "",
              "| Target | Attempts | Harness errors | Loop tokens | Report tokens | Attempts without usage | Wall s |",
              "|---|---|---|---|---|---|---|"]
    for name, c in summary["cost"]["targets"].items():
        lines.append(f"| {name} | {c['attempts']} | {c['harnessErrors']} | {_fmt(c['loopTokens'])} | {_fmt(c['reportTokens'])} "
                     f"| {c['attemptsWithoutLoopUsage']} | {_fmt(c['wallSeconds'])} |")

    lines += ["", "## Pins", "", "```json", json.dumps(summary["pins"], indent=2, sort_keys=True, ensure_ascii=False),
              "```", ""]
    return "\n".join(lines)


def write_summary(compare_dir: Path) -> dict[str, Any]:
    compare_dir = Path(compare_dir)
    summary = build_summary(compare_dir)
    (compare_dir / "summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    (compare_dir / "summary.md").write_text(render_markdown(summary), encoding="utf-8")
    return summary


# --------------------------------------------------------------------------- stability


def _flatten(value: Any, prefix: str = "") -> dict[str, Any]:
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for key, inner in value.items():
            if key in _VOLATILE_PINS:
                continue
            out.update(_flatten(inner, f"{prefix}.{key}" if prefix else key))
        return out
    return {prefix: value}


def official_label(summary: dict[str, Any]) -> str:
    """`OFFICIAL`, `UNOFFICIAL`, or `OFFICIAL — N entities not verifiable on <t> (tools not offered)`.

    Plan §9 q14: a run may be official while a target's MCP does not offer the
    tool some entities are checked with; the headline must say so.
    """
    if not summary["official"]:
        return "UNOFFICIAL"
    parts = [f"{len(f['unverifiable'])} entit{'y' if len(f['unverifiable']) == 1 else 'ies'} not verifiable on {name}"
             for name, f in summary["freshness"].items() if f.get("unverifiable")]
    return "OFFICIAL — " + "; ".join(parts) + " (tools not offered)" if parts else "OFFICIAL"


def freshness_reasons(fresh: dict[str, Any]) -> list[str]:
    """Why a target is not `fresh`, one line per check that is not ok (plan §5.9).

    A check whose only problem is "tool not offered" is not a reason: it is
    listed under `unverifiable` instead (plan §9 q14).
    """
    details = fresh.get("details") or {}
    if fresh.get("status") in (None, "unknown"):
        return [details.get("reason") or "freshness was not checked"]
    out = []
    for kind in ("documents", "masterData"):
        for c in details.get(kind) or []:
            if c.get("status") != "ok" and c.get("reason") != TOOL_NOT_OFFERED:
                extra = c.get("count", c.get("extraCount"))
                out.append(f"{c['name']}: {c['status']}" + (f" ({extra})" if extra else "")
                           + (f" — {c['detail']}" if c.get("detail") else ""))
    # Runs written before the live-catalogue checklist (no `unverified:` list any more).
    out += [f"{u['name']}: unverified — {u['reason']}" for u in details.get("declaredUnverified") or []]
    if details.get("markerCount"):
        out.append(f"{details['markerCount']} row(s) carry a harness marker")
    seed = details.get("baseline") or {}
    if seed.get("status") not in (None, "ok") and seed.get("reason") != TOOL_NOT_OFFERED:
        out.append(f"baseline: {seed['status']} — {seed.get('detail')}")
    return out


def pin_differences(a: dict[str, Any], b: dict[str, Any]) -> list[dict[str, Any]]:
    fa, fb = _flatten(a["pins"]), _flatten(b["pins"])
    return [{"pin": k, "a": fa.get(k), "b": fb.get(k)} for k in sorted(set(fa) | set(fb)) if fa.get(k) != fb.get(k)]


def stability(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    """Agreement between two comparisons (plan §6): same winner / tasks evaluable in both.

    A tie equals a tie. `valid` is False when a pin differs or either run is
    unofficial (plan §5.9): the number is still computed, but it does not count.
    """
    rows_a = {r["task"]: r for r in a["tasks"]}
    rows_b = {r["task"]: r for r in b["tasks"]}
    both = [t for t in rows_a if t in rows_b
            and rows_a[t]["status"] == "decided" and rows_b[t]["status"] == "decided"]
    tasks = [{"task": t, "a": rows_a[t]["winner"], "b": rows_b[t]["winner"],
              "agree": rows_a[t]["winner"] == rows_b[t]["winner"],
              "fragile": rows_a[t]["fragile"] or rows_b[t]["fragile"]} for t in both]
    sturdy = [t for t in tasks if not t["fragile"]]

    def agreement(rows: list[dict[str, Any]]) -> dict[str, Any]:
        agree = sum(1 for r in rows if r["agree"])
        return {"agree": agree, "of": len(rows), "ratio": round(agree / len(rows), 4) if rows else None}

    diffs = pin_differences(a, b)
    overall = agreement(tasks)
    refusals = []
    if diffs:
        refusals.append("pins differ")
    if not (a["official"] and b["official"]):
        refusals.append("both runs must be official (every target fresh)")
    # Plan §5.9 / decision 13: run B re-initializes AND re-seeds every target.
    # A seed refuses a seeded environment, so a new seedId is the proof.
    reused = sorted(name for name, fa in (a.get("freshness") or {}).items()
                    if fa.get("seedId") and fa.get("seedId") == ((b.get("freshness") or {}).get(name) or {}).get("seedId"))
    if reused:
        refusals.append(f"run B reuses run A's seeded environment on {reused}: re-initialize and "
                        f"re-seed every target before run B")
    return {
        "a": a["compareId"], "b": b["compareId"],
        "valid": not refusals, "refusals": refusals,
        "pinDifferences": diffs,
        "agreement": overall,
        "agreementNonFragile": agreement(sturdy),
        "target": STABILITY_TARGET,
        "meetsTarget": overall["ratio"] is not None and overall["ratio"] >= STABILITY_TARGET,
        "concurrency": {"a": a["pins"].get("concurrency"), "b": b["pins"].get("concurrency")},
        "onlyEvaluableInOne": sorted((set(rows_a) | set(rows_b)) - set(both)),
        "tasks": tasks,
    }


def render_stability(result: dict[str, Any]) -> str:
    lines = [f"Stability {result['a']} vs {result['b']}"]
    if result["refusals"]:
        lines.append("NOT VALID: " + "; ".join(result["refusals"]))
        lines += [f"  pin {d['pin']}: {d['a']!r} != {d['b']!r}" for d in result["pinDifferences"]]
    o, nf = result["agreement"], result["agreementNonFragile"]
    lines.append(f"Agreement: {o['agree']}/{o['of']} ({_pct(o['ratio'])}), target {_pct(result['target'])}"
                 f" -> {'met' if result['meetsTarget'] else 'NOT met'}")
    lines.append(f"Non-fragile tasks: {nf['agree']}/{nf['of']} ({_pct(nf['ratio'])})")
    lines.append(f"Concurrency: A {result['concurrency']['a']} · B {result['concurrency']['b']}")
    for t in result["tasks"]:
        if not t["agree"]:
            lines.append(f"  flipped: {t['task']} {t['a']} -> {t['b']}" + (" (fragile)" if t["fragile"] else ""))
    if result["onlyEvaluableInOne"]:
        lines.append("Not evaluable in both: " + ", ".join(result["onlyEvaluableInOne"]))
    return "\n".join(lines)


# --------------------------------------------------------------------------- CLI


def resolve_compare_dir(value: str, runs_dir: Path) -> Path:
    path = Path(value)
    return path if path.is_dir() else runs_dir / value


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="runner.report", description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)
    rep = sub.add_parser("report", help="derive summary.json + summary.md from a comparison's files")
    rep.add_argument("run", help="compareId (under runs/) or a path")
    stab = sub.add_parser("stability", help="winner agreement between two comparisons")
    stab.add_argument("a")
    stab.add_argument("b")
    stab.add_argument("--json", action="store_true", help="print the full result as JSON")
    args = parser.parse_args(argv)

    def comparison(value: str) -> Path:
        # A RUN / A / B that names no comparison is a usage error (exit 2 on stderr), not a traceback.
        compare_dir = resolve_compare_dir(value, RUNS_DIR)
        if not compare_dir.is_dir():
            parser.error(f"no comparison {value!r}: neither a directory nor a compareId under {RUNS_DIR}")
        return compare_dir

    try:
        if args.command == "report":
            compare_dir = comparison(args.run)
            summary = write_summary(compare_dir)
            kr = summary["kr"]
            print(f"{'official' if summary['official'] else 'UNOFFICIAL'} · KR {_pct(kr['winRate'])} "
                  f"({kr['subjectWins']['total']}/{kr['evaluated']}) -> {compare_dir / 'summary.md'}")
            return 0
        result = stability(build_summary(comparison(args.a)), build_summary(comparison(args.b)))
    except ValueError as exc:
        # build_summary's own refusals (not two targets, an unknown rule version).
        parser.error(str(exc))
    print(json.dumps(result, indent=2, sort_keys=True) if args.json else render_stability(result))
    return 0 if result["valid"] else 2


if __name__ == "__main__":
    sys.exit(main())
