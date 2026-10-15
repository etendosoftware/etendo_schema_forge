"""Baseline dataset and fresh-environment checks (plan §5.4, §5.9, D50 — S6).

Two files per comparison, both versioned under `mcp-tests/fixtures/`:

* `<name>.yaml` — the **baseline dataset**: vendor-neutral records (customers,
  products …) with the values a probe may name, and per platform how each
  record is created, found and checked, through that platform's OWN MCP. No
  REST, no SQL (decided, plan §9 #2). Loaded once per environment by
  `make mcp-seed`, which writes a local **manifest** (`.seeds/<target>.json`).
* `fresh.<platform>.yaml` — the **freshness checklist**: which document lists
  must be empty and which master-data lists must hold exactly the baseline plus
  what initialization creates (the allowlist). Every entity names the list tool
  it is read with, EVEN when the platform does not offer that tool today: the
  live `tools/list` decides at every preflight, so a tool a vendor adds is used
  the next run with no edit, and one it removes turns its entity `unverified`
  ("tool not offered") instead of breaking the run.

Probes name baseline records as `{{fixture.<record>.<key>}}`: `id` is the
record's id on the target being run, any other key one of the record's
vendor-neutral `values` (identical on every platform by construction, so a
shared prompt may use them).

Everything here reaches the server through a `call(tool, args)` coroutine the
caller supplies, so it is testable with fake sessions and never imports the
agent.
"""

from __future__ import annotations

import dataclasses
import datetime as dt
import hashlib
import json
import re
import secrets
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable

import yaml

from .mcp_client import VerificationError, _MISSING, _path, _same, count_rows, extract_rows, matching_rows
from .steps import Step, StepError, parse_steps, resolve_refs, run_steps

HARNESS_ROOT = Path(__file__).resolve().parent.parent
FIXTURES_DIR = HARNESS_ROOT / "fixtures"
#: Local, never versioned: one manifest per target, written by `make mcp-seed`.
SEEDS_DIR = HARNESS_ROOT / ".seeds"

FIXTURE_SCHEMA_VERSION = 1
CHECKLIST_SCHEMA_VERSION = 1
MANIFEST_VERSION = 1

#: Most to least severe; the first one any check reaches is the status.
#: `fresh` is the only official one (D50); `clean` is a diagnostic label;
#: `unknown` means no checklist, so no check ran.
FRESHNESS_STATUSES = ("dirty", "unverified", "clean", "fresh", "unknown")
#: What one check's outcome makes of the whole environment.
_CHECK_STATUS = {"dirty": "dirty", "unverified": "unverified", "leftover": "clean", "ok": "fresh"}
#: `reason` of a check whose list / read tool the live catalogue does not carry.
#: The ONLY `unverified` cause that does not block `fresh` (plan §9 q14,
#: decided 2026-10-15): the entity is listed under `unverifiable` instead.
TOOL_NOT_OFFERED = "tool not offered"

#: A harness marker anywhere in a value: `suite.attempt_marker` writes
#: `<prefix>-<probeId>-a<n>`, and every prefix (a run id or a compareId) starts
#: with the stamp of cli._new_run_id (`%Y%m%dT%H%M`) or cli._new_compare_id
#: (`%Y%m%dT%H%M%S`; `%Y%m%dT%H%M` before 2026-10-15).
MARKER_RE = re.compile(r"\b\d{8}T\d{4}(?:\d{2})?-\S+?-a\d+\b")

_FIXTURE_REF_RE = re.compile(r"\{\{\s*fixture\.([A-Za-z0-9_\-]+)\.([A-Za-z0-9_\-]+)\s*\}\}")
_EXTRA_SHOWN = 20

CallFn = Callable[[str, dict[str, Any]], Awaitable[Any]]


class FixtureError(RuntimeError):
    """A `{{fixture.*}}` reference that cannot be resolved for this target."""


# --------------------------------------------------------------------------- baseline file


@dataclass(frozen=True)
class RecordPlan:
    """How one baseline record exists on one platform."""

    create: tuple[Step, ...]
    #: Where the new id is once `create` ran: one `{{steps.<name>.<path>}}` ref.
    id_ref: str
    #: A read that returns the record (among others); None when the platform's
    #: MCP cannot read it back — then the record is `unverified` and its id
    #: comes from the seed manifest.
    find: Step | None = None
    #: Exact-match conditions picking THE record out of `find`'s rows.
    match: dict[str, Any] = field(default_factory=dict)
    #: Further values the found record must hold (a price, a tax).
    expect: dict[str, Any] = field(default_factory=dict)
    id_path: str = "id"


@dataclass(frozen=True)
class Fixture:
    name: str
    path: Path
    sha: str
    #: record -> vendor-neutral values, in seeding order.
    records: dict[str, dict[str, Any]]
    platforms: dict[str, dict[str, RecordPlan]]

    def table(self, ids: dict[str, Any]) -> dict[str, dict[str, Any]]:
        """What `{{fixture.<record>.<key>}}` reads, given the record ids known so far."""
        out = {}
        for rec, values in self.records.items():
            row = dict(values)
            if ids.get(rec) is not None:
                row["id"] = ids[rec]
            out[rec] = row
        return out


def fixture_path(name: str) -> Path:
    return FIXTURES_DIR / f"{name}.yaml"


def load_fixture(name: str) -> Fixture:
    path = fixture_path(name)
    if not path.exists():
        raise ValueError(f"fixture {name!r}: no file {path}")
    raw = path.read_bytes()
    data = yaml.safe_load(raw) or {}
    where = f"fixture {path.name}"
    if data.get("schemaVersion") != FIXTURE_SCHEMA_VERSION:
        raise ValueError(f"{where}: schemaVersion must be {FIXTURE_SCHEMA_VERSION}.")
    records_raw = data.get("records")
    if not isinstance(records_raw, dict) or not records_raw:
        raise ValueError(f"{where}: `records` is a non-empty mapping.")
    records: dict[str, dict[str, Any]] = {}
    for rec, body in records_raw.items():
        values = (body or {}).get("values") or {}
        if not isinstance(values, dict):
            raise ValueError(f"{where}: records.{rec}.values must be a mapping.")
        if "id" in values:
            raise ValueError(f"{where}: records.{rec}.values may not define `id` (it is per platform).")
        records[rec] = values
    platforms_raw = data.get("platforms")
    if not isinstance(platforms_raw, dict) or not platforms_raw:
        raise ValueError(f"{where}: `platforms` is a non-empty mapping.")
    platforms: dict[str, dict[str, RecordPlan]] = {}
    for platform, block in platforms_raw.items():
        block = block or {}
        missing = [r for r in records if r not in block]
        unknown = [r for r in block if r not in records]
        if missing or unknown:
            raise ValueError(f"{where}: platforms.{platform} must declare every record exactly "
                             f"(missing {missing}, unknown {unknown}).")
        plans = {}
        for position, rec in enumerate(records):
            plans[rec] = _parse_record(block[rec], f"{where} platforms.{platform}.{rec}")
            # A record may only name records seeded before it.
            earlier = set(list(records)[:position])
            for ref_rec, _key in refs_in(dataclasses.asdict(plans[rec])):
                if ref_rec not in earlier and ref_rec != rec:
                    raise ValueError(f"{where} platforms.{platform}.{rec}: names {ref_rec!r}, "
                                     f"which is not seeded before it.")
            check_refs(_ref_table(records), refs_in(dataclasses.asdict(plans[rec])),
                       f"{where} platforms.{platform}.{rec}", allow_ids=earlier)
        platforms[platform] = plans
    return Fixture(name=data.get("name") or name, path=path, sha=hashlib.sha256(raw).hexdigest()[:12],
                   records=records, platforms=platforms)


def _parse_record(raw: Any, where: str) -> RecordPlan:
    if not isinstance(raw, dict):
        raise ValueError(f"{where}: must be a mapping.")
    unknown = set(raw) - {"create", "id", "find", "match", "expect", "idPath"}
    if unknown:
        raise ValueError(f"{where}: unknown key(s) {sorted(unknown)}.")
    create = tuple(parse_steps(raw.get("create"), probe_id=where, phase="create"))
    if not create:
        raise ValueError(f"{where}: `create` needs at least one step.")
    id_ref = raw.get("id")
    if not isinstance(id_ref, str) or not id_ref.strip().startswith("{{steps."):
        raise ValueError(f"{where}: `id` is one {{{{steps.<name>.<path>}}}} reference into `create`.")
    find = None
    if raw.get("find") is not None:
        find = parse_steps([raw["find"]], probe_id=where, phase="find")[0]
        if not raw.get("match"):
            raise ValueError(f"{where}: a `find` needs a non-empty `match` that picks the record out.")
    for key in ("match", "expect"):
        if raw.get(key) is not None and not isinstance(raw[key], dict):
            raise ValueError(f"{where}: `{key}` must be a mapping.")
    return RecordPlan(create=create, id_ref=id_ref.strip(), find=find, match=raw.get("match") or {},
                      expect=raw.get("expect") or {}, id_path=raw.get("idPath") or "id")


# --------------------------------------------------------------------------- {{fixture.*}}


def refs_in(value: Any) -> set[tuple[str, str]]:
    """Every `{{fixture.<record>.<key>}}` inside a tree of str / dict / list."""
    if isinstance(value, str):
        return set(_FIXTURE_REF_RE.findall(value))
    if isinstance(value, dict):
        return set().union(*(refs_in(v) for v in value.values())) if value else set()
    if isinstance(value, (list, tuple)):
        return set().union(*(refs_in(v) for v in value)) if value else set()
    return set()


def _ref_table(records: dict[str, dict[str, Any]]) -> dict[str, set[str]]:
    return {rec: set(values) | {"id"} for rec, values in records.items()}


def check_refs(table: dict[str, set[str]], refs: set[tuple[str, str]], where: str,
               *, allow_ids: set[str] | None = None) -> None:
    """Load-time check: every reference names a record and a key it has."""
    for rec, key in sorted(refs):
        if rec not in table:
            raise ValueError(f"{where}: {{{{fixture.{rec}.{key}}}}} names no baseline record "
                             f"(known: {sorted(table)}).")
        if key not in table[rec]:
            raise ValueError(f"{where}: {{{{fixture.{rec}.{key}}}}}: the record has no {key!r} "
                             f"(it has {sorted(table[rec])}).")
        if key == "id" and allow_ids is not None and rec not in allow_ids:
            raise ValueError(f"{where}: {{{{fixture.{rec}.id}}}} is not known yet at that point.")


def resolve(value: Any, table: dict[str, dict[str, Any]]) -> Any:
    """Expand `{{fixture.*}}`. Exactly one reference keeps the value's type."""
    if isinstance(value, str):
        whole = _FIXTURE_REF_RE.fullmatch(value.strip())
        if whole:
            return _lookup(table, *whole.groups())
        return _FIXTURE_REF_RE.sub(lambda m: _text(_lookup(table, *m.groups())), value)
    if isinstance(value, dict):
        return {k: resolve(v, table) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve(v, table) for v in value]
    if isinstance(value, tuple):
        return tuple(resolve(v, table) for v in value)
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        changes = {f.name: resolve(getattr(value, f.name), table)
                   for f in dataclasses.fields(value) if f.name != "platforms"}
        return dataclasses.replace(value, **changes)
    return value


def _lookup(table: dict[str, dict[str, Any]], rec: str, key: str) -> Any:
    if rec not in table or key not in table[rec]:
        raise FixtureError(f"{{{{fixture.{rec}.{key}}}}} is not known on this target")
    return table[rec][key]


def _text(value: Any) -> str:
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)


# --------------------------------------------------------------------------- manifest


def manifest_path(target_name: str) -> Path:
    return SEEDS_DIR / f"{target_name}.json"


def read_manifest(target_name: str) -> dict[str, Any] | None:
    path = manifest_path(target_name)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def archive_manifest(target_name: str, manifest: dict[str, Any]) -> Path:
    """Move `.seeds/<target>.json` to `.seeds/archive/<target>-<seedId>.json`; never overwrites one."""
    archive = SEEDS_DIR / "archive"
    archive.mkdir(parents=True, exist_ok=True)
    stem = f"{target_name}-{manifest.get('seedId') or 'no-seed-id'}"
    dest, n = archive / f"{stem}.json", 1
    while dest.exists():
        n += 1
        dest = archive / f"{stem}-{n}.json"
    manifest_path(target_name).rename(dest)
    return dest


def write_manifest(target_name: str, manifest: dict[str, Any]) -> Path:
    path = manifest_path(target_name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def new_seed_id() -> str:
    return secrets.token_hex(6)


# --------------------------------------------------------------------------- verify


async def verify_baseline(fixture: Fixture, platform: str, call: CallFn,
                          manifest: dict[str, Any] | None, *, tools: set[str] | None = None) -> dict[str, Any]:
    """Read every baseline record back through the MCP (plan §5.4).

    Per record: `ok`, `missing` (find returns no such row), `duplicated` (more
    than one), `changed` (found, but an `expect` value differs), `replaced`
    (found under another id than the seed manifest recorded) or `unverified`
    (no `find` on this platform, or the read failed). The status is `dirty` if
    any record is missing / duplicated / changed / replaced, else `unverified`
    if any is unverified, else `ok`.

    `tools` is the live catalogue: a `find` whose tool it does not carry is not
    called — the record is `unverified` with `reason: "tool not offered"`, its
    id from the seed manifest, and the run the vendor adds the tool it is read
    for real. None (no catalogue known) calls every `find`.

    `fixtureHash` covers the fixture file and the values read back — NOT the
    ids, which differ after every re-initialization, so the two runs of a
    stability pair hash the same when both hold the same baseline.
    """
    plans = fixture.platforms[platform]
    seeded = (manifest or {}).get("records") or {}
    ids: dict[str, Any] = {}
    records: dict[str, dict[str, Any]] = {}
    for rec, plan in plans.items():
        if plan.find is None:
            ids[rec] = seeded.get(rec)
            records[rec] = {"status": "unverified", "id": ids[rec],
                            "detail": "this platform's MCP cannot read the record back; id from the seed manifest",
                            "observed": None}
            continue
        if tools is not None and plan.find.tool not in tools:
            ids[rec] = seeded.get(rec)
            records[rec] = {"status": "unverified", "id": ids[rec], "observed": None,
                            "tool": plan.find.tool, "reason": TOOL_NOT_OFFERED,
                            "detail": f"{TOOL_NOT_OFFERED}: {plan.find.tool} is not in the live catalogue; "
                                      f"id from the seed manifest"}
            continue
        table = fixture.table(ids)
        try:
            find = resolve(plan.find, table)
            match = resolve(plan.match, table)
            expect = resolve(plan.expect, table)
            rows = matching_rows(await call(find.tool, find.args), match)
        except Exception as exc:  # noqa: BLE001 - a read that failed proves nothing
            records[rec] = {"status": "unverified", "id": seeded.get(rec), "observed": None,
                            "detail": f"{type(exc).__name__}: {exc}"}
            ids[rec] = seeded.get(rec)
            continue
        if not rows:
            records[rec] = {"status": "missing", "id": None, "observed": None,
                            "detail": f"{find.tool} returned no row matching {match}"}
            continue
        if len(rows) > 1:
            records[rec] = {"status": "duplicated", "id": None, "observed": None,
                            "ids": [_json(_path(r, plan.id_path)) for r in rows],
                            "detail": f"{len(rows)} rows match {match}"}
            continue
        row = rows[0]
        rid = _path(row, plan.id_path)
        ids[rec] = None if rid is _MISSING else rid
        observed = {p: _json(_path(row, p)) for p in sorted(set(match) | set(expect))}
        diffs = {p: {"expected": v, "found": observed[p]} for p, v in expect.items()
                 if not _same(_path(row, p), v)}
        status, detail = "ok", None
        if diffs:
            status, detail = "changed", diffs
        elif rec in seeded and seeded[rec] is not None and str(seeded[rec]) != str(ids[rec]):
            status, detail = "replaced", f"seeded as {seeded[rec]!r}, found as {ids[rec]!r}"
        records[rec] = {"status": status, "id": ids[rec], "observed": observed, "detail": detail}
    statuses = {r["status"] for r in records.values()}
    overall = ("dirty" if statuses & {"missing", "duplicated", "changed", "replaced"}
               else "unverified" if "unverified" in statuses else "ok")
    digest = {"fixture": fixture.sha, "platform": platform,
              "records": {rec: {"status": r["status"], "observed": r["observed"]} for rec, r in records.items()}}
    return {"status": overall, "records": records, "ids": ids,
            "fixtureHash": hashlib.sha256(json.dumps(digest, sort_keys=True).encode()).hexdigest()[:16]}


def _json(value: Any) -> Any:
    return None if value is _MISSING else value


# --------------------------------------------------------------------------- freshness checklist


@dataclass(frozen=True)
class Checklist:
    platform: str
    path: Path
    sha: str
    documents: tuple[dict[str, Any], ...]
    master_data: tuple[dict[str, Any], ...]
    #: False until the allowlists were captured from a freshly initialized
    #: environment (`make mcp-seed CAPTURE=1`): then a master-data row nobody
    #: explains is `unverified`, not `dirty` — the allowlist cannot judge it.
    allowlist_captured: bool

    def tools(self) -> set[str]:
        """Every list tool the checklist reads with, offered today or not."""
        return {e["tool"] for e in self.documents + self.master_data}


def checklist_path(platform: str) -> Path:
    return FIXTURES_DIR / f"fresh.{platform}.yaml"


def load_checklist(platform: str) -> Checklist | None:
    """`fixtures/fresh.<platform>.yaml`, or None when the platform has none (status `unknown`)."""
    path = checklist_path(platform)
    if not path.exists():
        return None
    raw = path.read_bytes()
    data = yaml.safe_load(raw) or {}
    where = f"checklist {path.name}"
    if data.get("schemaVersion") != CHECKLIST_SCHEMA_VERSION:
        raise ValueError(f"{where}: schemaVersion must be {CHECKLIST_SCHEMA_VERSION}.")
    if data.get("platform") != platform:
        raise ValueError(f"{where}: platform must be {platform!r}.")
    if not isinstance(data.get("allowlistCaptured"), bool):
        raise ValueError(f"{where}: allowlistCaptured must be true or false.")
    if "unverified" in data:
        raise ValueError(f"{where}: `unverified` is gone — declare the entity under documents/masterData "
                         f"with the list tool it WOULD use; preflight marks it unverified while the live "
                         f"catalogue does not offer that tool.")
    names: set[str] = set()

    def entries(key: str, required: tuple[str, ...], allowed: set[str]) -> tuple[dict[str, Any], ...]:
        out = []
        for i, e in enumerate(data.get(key) or []):
            if not isinstance(e, dict) or any(not e.get(r) for r in required):
                raise ValueError(f"{where}: {key}[{i}] needs {list(required)}.")
            if set(e) - allowed:
                raise ValueError(f"{where}: {key}[{i}] has unknown key(s) {sorted(set(e) - allowed)}.")
            if e["name"] in names:
                raise ValueError(f"{where}: entity {e['name']!r} is declared twice.")
            names.add(e["name"])
            out.append(e)
        return tuple(out)

    documents = entries("documents", ("name", "tool"), {"name", "tool", "args"})
    master = entries("masterData", ("name", "tool", "key"),
                     {"name", "tool", "args", "key", "idPath", "baseline", "allow"})
    if not documents and not master:
        raise ValueError(f"{where}: declares no documents and no masterData — a checklist that checks "
                         f"nothing would read as fresh.")
    return Checklist(platform=platform, path=path, sha=hashlib.sha256(raw).hexdigest()[:12],
                     documents=documents, master_data=master,
                     allowlist_captured=data["allowlistCaptured"])


def _has_marker(value: Any) -> bool:
    if isinstance(value, str):
        return MARKER_RE.search(value) is not None
    if isinstance(value, dict):
        return any(_has_marker(v) for v in value.values())
    if isinstance(value, list):
        return any(_has_marker(v) for v in value)
    return False


async def assess_freshness(
    checklist: Checklist | None,
    *,
    call: CallFn,
    tools: set[str],
    target: dict[str, Any],
    fixture: Fixture | None,
    baseline: dict[str, Any] | None,
    manifest: dict[str, Any] | None,
    now: str,
) -> dict[str, Any]:
    """The four checks of plan §5.9, through the MCP only. Never raises.

    1. documents: every listable document type holds 0 rows;
    2. master data: rows are exactly the baseline + the init allowlist;
    3. markers: no row carries a harness marker;
    4. baseline: the records read back, the seed manifest is complete and
       matches the target, the suite's fixture and the hash recomputed now.

    A check reaches one of: `dirty` (a row nobody explains, a broken baseline),
    `unverified` (cannot be read: the live catalogue does not offer the
    entity's tool, a failed read, a partial page, no allowlist yet, baseline
    rows with no baseline to tell them by, no manifest), `leftover` (only rows
    tagged with a harness marker — what `clean` means) or `ok`.
    Status: the most severe across checks, in FRESHNESS_STATUSES order —
    dirty > unverified > clean > fresh.

    One exception (plan §9 q14, decided 2026-10-15): a check whose ONLY problem
    is "tool not offered" does not block `fresh`. It counts as ok for the
    status and is listed under `unverifiable` ({entity, tool, reason}), so an
    official run says what it could not see. Every other `unverified` cause
    still blocks, and at least one document / master-data check must actually
    have run: a catalogue that offers none of them proves nothing.

    `baseline` None means "not known" (the suite has no fixture): a master-data
    row that may be a baseline record is then `unverified`, never `dirty`. A
    caller that KNOWS nothing is seeded yet (the seed preflight) passes the
    pre-seed read-back, whose ids are empty.
    """
    base = {
        "checkedAt": now,
        "initializedAt": (manifest or {}).get("initializedAt"),
        "seedId": (manifest or {}).get("seedId"),
        "fixtureHash": (baseline or {}).get("fixtureHash"),
    }
    if checklist is None:
        return {"status": "unknown", **base, "unverifiable": [], "checklist": None,
                "details": {"reason": f"no fixtures/fresh.<platform>.yaml for this platform"}}

    async def read(tool: str, args: dict[str, Any]) -> tuple[Any, str | None]:
        try:
            return await call(tool, args or {}), None
        except Exception as exc:  # noqa: BLE001 - recorded as unverified, never clean
            return None, f"{type(exc).__name__}: {exc}"

    def not_offered(entry: dict[str, Any]) -> dict[str, Any]:
        return {**entry, "status": "unverified", "reason": TOOL_NOT_OFFERED,
                "detail": f"{TOOL_NOT_OFFERED}: {entry['tool']} is not in the live catalogue"}

    markers: list[dict[str, Any]] = []
    documents = []
    for doc in checklist.documents:
        entry = {"name": doc["name"], "tool": doc["tool"]}
        if doc["tool"] not in tools:
            documents.append(not_offered(entry))
            continue
        payload, error = await read(doc["tool"], doc.get("args") or {})
        if error:
            documents.append({**entry, "status": "unverified", "detail": error})
            continue
        try:
            count = count_rows(payload)
        except VerificationError as exc:
            documents.append({**entry, "status": "unverified", "detail": str(exc)})
            continue
        try:
            rows = extract_rows(payload)
        except VerificationError:
            rows = None  # a partial page: the rows cannot all be classified
        tagged = [r for r in rows or [] if _has_marker(r)]
        markers += [{"entity": doc["name"], "row": _brief(r)} for r in tagged]
        if count == 0:
            status = "ok"
        elif rows is not None and len(rows) == count and len(tagged) == count:
            status = "leftover"
        else:
            status = "dirty"
        documents.append({**entry, "status": status, "count": count})

    baseline_ids: dict[str, set[str]] = {}
    for rec, row in ((baseline or {}).get("records") or {}).items():
        if row.get("id") is not None:
            baseline_ids[rec] = {str(row["id"])}
    master = []
    for ent in checklist.master_data:
        entry = {"name": ent["name"], "tool": ent["tool"]}
        if ent["tool"] not in tools:
            master.append(not_offered(entry))
            continue
        payload, error = await read(ent["tool"], ent.get("args") or {})
        if error:
            master.append({**entry, "status": "unverified", "detail": error})
            continue
        try:
            rows = extract_rows(payload)
        except VerificationError as exc:
            master.append({**entry, "status": "unverified", "detail": str(exc)})
            continue
        expected_ids = set().union(*(baseline_ids.get(r, set()) for r in ent.get("baseline") or [])) \
            if ent.get("baseline") else set()
        allow = {str(a) for a in ent.get("allow") or []}
        id_path = ent.get("idPath") or "id"
        extra = [r for r in rows
                 if str(_json(_path(r, id_path))) not in expected_ids
                 and str(_json(_path(r, ent["key"]))) not in allow]
        tagged = [r for r in rows if _has_marker(r)]
        markers += [{"entity": ent["name"], "row": _brief(r)} for r in tagged]
        detail = None
        if not extra:
            status = "ok"
        elif all(_has_marker(r) for r in extra):
            status = "leftover"
        elif ent.get("baseline") and baseline is None:
            status, detail = "unverified", "no baseline to tell the baseline records by (the suite declares no fixture)"
        elif not checklist.allowlist_captured:
            status, detail = "unverified", "allowlist not captured yet (allowlistCaptured: false)"
        else:
            status = "dirty"
        master.append({**entry, "status": status, "rows": len(rows),
                       "extra": [_json(_path(r, ent["key"])) for r in extra[:_EXTRA_SHOWN]],
                       "extraCount": len(extra),
                       **({"detail": detail} if detail else {})})

    seed = _manifest_check(target, fixture, baseline, manifest)
    unverifiable = [{"check": kind, "entity": c["name"], "tool": c["tool"], "reason": TOOL_NOT_OFFERED}
                    for kind, entries in (("documents", documents), ("masterData", master))
                    for c in entries if c.get("reason") == TOOL_NOT_OFFERED]
    unverifiable += [{"check": "baseline", "entity": rec, "tool": r["tool"], "reason": TOOL_NOT_OFFERED}
                     for rec, r in ((baseline or {}).get("records") or {}).items()
                     if r.get("reason") == TOOL_NOT_OFFERED]

    def effective(check: dict[str, Any]) -> str:
        return "ok" if check.get("reason") == TOOL_NOT_OFFERED else check["status"]

    checks = ([effective(d) for d in documents] + [effective(m) for m in master]
              + [effective(seed)] + ["leftover" if markers else "ok"])
    ran = [c for c in documents + master if c.get("reason") != TOOL_NOT_OFFERED]
    if not ran:
        checks.append("unverified")  # nothing was read: tool-not-offered everywhere proves nothing
    status = min((_CHECK_STATUS[c] for c in checks), key=FRESHNESS_STATUSES.index)
    return {
        "status": status,
        **base,
        # What an official run could not see (plan §9 q14): listed, never hidden.
        "unverifiable": unverifiable,
        "checklist": {"file": checklist.path.name, "sha": checklist.sha,
                      "allowlistCaptured": checklist.allowlist_captured},
        "details": {
            "documents": documents,
            "masterData": master,
            "markers": markers[:_EXTRA_SHOWN],
            "markerCount": len(markers),
            "baseline": seed,
        },
    }


def _manifest_check(target: dict[str, Any], fixture: Fixture | None, baseline: dict[str, Any] | None,
                    manifest: dict[str, Any] | None) -> dict[str, Any]:
    """Check 4: the baseline as seeded is the baseline the suite expects, read back now."""
    if fixture is None:
        return {"status": "unverified", "detail": "the suite declares no fixture: nothing proves a seeded baseline"}
    if manifest is None:
        return {"status": "unverified", "detail": "no seed manifest: run `make mcp-seed` on a freshly initialized target"}
    problems = []
    if not manifest.get("complete"):
        problems.append("the seed did not complete")
    if manifest.get("url") != target.get("url"):
        problems.append(f"seeded at {manifest.get('url')!r}, not {target.get('url')!r}")
    if manifest.get("fixture") != fixture.name or manifest.get("fixtureSha") != fixture.sha:
        problems.append(f"seeded with {manifest.get('fixture')}@{manifest.get('fixtureSha')}, "
                        f"the suite needs {fixture.name}@{fixture.sha}")
    # Only a baseline that read back fully can be compared by hash: one that
    # could not be read is `unverified` below, not a mismatch.
    if baseline and baseline["status"] == "ok" and manifest.get("fixtureHash") != baseline.get("fixtureHash"):
        problems.append(f"fixtureHash {baseline.get('fixtureHash')} != seeded {manifest.get('fixtureHash')}")
    if baseline and baseline["status"] == "dirty":
        problems.append("baseline records missing, duplicated, changed or replaced")
    if problems:
        return {"status": "dirty", "detail": "; ".join(problems)}
    if baseline and baseline["status"] == "unverified":
        unread = [r for r in baseline["records"].values() if r["status"] == "unverified"]
        if all(r.get("reason") == TOOL_NOT_OFFERED for r in unread):
            # The manifest holds (above); only the read-back tool is missing.
            return {"status": "unverified", "reason": TOOL_NOT_OFFERED,
                    "detail": "some baseline records cannot be read back: their read tool is not offered"}
        return {"status": "unverified", "detail": "some baseline records cannot be read back on this platform"}
    return {"status": "ok", "detail": None}


def _brief(row: Any) -> Any:
    if isinstance(row, dict):
        return {k: row[k] for k in list(row)[:4]}
    return row


# --------------------------------------------------------------------------- seeding


async def seed_records(fixture: Fixture, platform: str, call: CallFn, *, max_result_chars: int = 2000,
                       ids: dict[str, Any] | None = None
                       ) -> tuple[dict[str, Any], list[dict[str, Any]], str | None]:
    """Create every baseline record in order. Returns (ids, step records, error).

    Stops at the first failure: what was created stays (there is no undo for a
    baseline), and the caller writes an INCOMPLETE manifest, so the next seed
    refuses and the next comparison reads the target as dirty. `ids`, when
    given, is filled in place as each record is created: a caller interrupted
    mid-seed still knows what exists.
    """
    ids = {} if ids is None else ids
    log: list[dict[str, Any]] = []
    for rec, plan in fixture.platforms[platform].items():
        saved: dict[str, Any] = {}
        try:
            steps = [resolve(s, fixture.table(ids)) for s in plan.create]
        except FixtureError as exc:
            return ids, log, f"{rec}: {exc}"
        records = await run_steps(steps, call, phase=f"seed:{rec}", saved=saved, stop_on_error=True,
                                  max_result_chars=max_result_chars)
        log += records
        failed = next((r for r in records if not r["ok"]), None)
        if failed:
            return ids, log, f"{rec}: {failed['tool']}: {failed['error']}"
        try:
            ids[rec] = resolve_refs(plan.id_ref, saved)
        except StepError as exc:
            return ids, log, f"{rec}: id {plan.id_ref}: {exc}"
    return ids, log, None


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
