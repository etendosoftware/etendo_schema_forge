"""`make mcp-seed`: load the baseline dataset into a freshly initialized target (plan §5.4, §5.9).

    python -m runner.seed --target local --fixture okr-baseline --initialized-at 2026-10-20T09:00Z
    python -m runner.seed --target local --fixture okr-baseline --capture-allowlist

Through the target's OWN MCP only (decided, plan §9 #2): no REST, no SQL. Order
for an official comparison: initialize the environment -> seed -> mcp-compare.
Run B of a stability pair re-initializes and re-seeds EVERY target again.

Idempotency — a seed never duplicates:

* the target already has a COMPLETE manifest for this fixture and every
  record reads back ok -> nothing is done (exit 0, the manifest is kept);
* a manifest exists but is incomplete, for another fixture or URL, or the
  records no longer read back -> refused (exit 2): re-initialize;
* `--initialized-at` differs from the manifest's `initializedAt` -> the operator
  declares a RE-INITIALIZED environment: the old manifest describes one that no
  longer exists, so the seed runs as if there were none (every refusal below
  still applies) and, only once it is about to create, moves the old manifest
  to `.seeds/archive/<target>-<seedId>.json`. This is what keeps run B of a
  stability pair from silently reusing run A's `seedId` on a platform that
  cannot read its baseline back (Holded); a claim that is false is still caught
  wherever a baseline record IS readable (Etendo), and a refused seed leaves
  the old manifest in place;
* no manifest, but a record the platform CAN read back is already there ->
  refused (exit 2): the environment is not freshly initialized;
* the freshness checklist finds documents, or master-data rows it can PROVE
  are unexplained (`dirty`), or harness-marker rows (`leftover`) -> refused
  (exit 2), for the same reason.

What the checklist cannot judge does NOT refuse the seed: an entity whose list
tool the live catalogue does not offer, a read that failed, a partial page, or
master-data rows while the allowlist is not captured yet are `unverified`.
Each one is printed to stderr as a warning and the seed goes on — refusing
would make a platform with no list tools unseedable. The comparison reads
those same checks as `unverified`, so the run stays unofficial anyway.

A record the platform cannot read back (no `find`, e.g. Holded contacts) can
only be protected by the manifest: never delete `.seeds/<target>.json` of a
seeded target, or a second seed would create those records again. That is why
an INCOMPLETE manifest (with the seed's `seedId`) is written BEFORE the first
create and replaced only at the end: a create that fails, a Ctrl-C, a
cancellation or a session that fails while closing all leave it incomplete,
and both the next seed and the next comparison refuse the target (dirty)
until it is re-initialized. What was created stays: there is no undo.

`--capture-allowlist` seeds nothing: on a freshly initialized target it prints
the master-data rows initialization created, as `allow:` lists to paste into
`fixtures/fresh.<platform>.yaml` (then set `allowlistCaptured: true`).
"""

from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import sys
import webbrowser
from typing import Any

import yaml

from . import config as cfg
from . import fixture as fixtures
from .mcp_client import (
    DEFAULT_AUTH_WAIT,
    AuthError,
    _path,
    call_tool,
    describe_server,
    extract_rows,
    is_headless,
    mcp_session,
    preflight,
)


def _parse_instant(value: str) -> str:
    """An ISO-8601 instant with a timezone, normalized to UTC `...Z`."""
    try:
        moment = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"not an ISO-8601 instant: {value!r}") from exc
    if moment.tzinfo is None:
        raise argparse.ArgumentTypeError(f"{value!r} needs a timezone (e.g. 2026-10-20T09:00Z)")
    return moment.astimezone(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _fixture_tools(fixture: fixtures.Fixture, platform: str) -> set[str]:
    tools = set()
    for plan in fixture.platforms[platform].values():
        tools.update(s.tool for s in plan.create)
        if plan.find:
            tools.add(plan.find.tool)
    return tools


async def seed(target: dict[str, Any], platform: str, fixture: fixtures.Fixture, *,
               initialized_at: str, out=print) -> int:
    """The seed itself, after auth. Returns the exit code."""
    if platform not in fixture.platforms:
        out(f"fixture {fixture.name!r} declares no platform {platform!r}.", file=sys.stderr)
        return 2
    server = await describe_server(target)
    live = set(server.get("tools") or [])
    absent = sorted(_fixture_tools(fixture, platform) - live)
    if absent:
        out(f"Seed refused: the fixture calls {absent}, which {target['name']!r} does not offer. "
            f"Nothing was created.", file=sys.stderr)
        return 2
    checklist = fixtures.load_checklist(platform)
    manifest = fixtures.read_manifest(target["name"])
    # A new INITIALIZED_AT is the operator's re-initialization claim (module docstring): the old
    # manifest is set aside, not trusted, and archived only once the preflight lets the seed go on.
    stale = manifest if manifest is not None and manifest.get("initializedAt") != initialized_at else None
    if stale is not None:
        manifest = None
    base = {"target": target["name"], "url": target["url"], "platform": platform, "fixture": fixture.name,
            "fixtureSha": fixture.sha, "seedId": fixtures.new_seed_id(), "initializedAt": initialized_at}
    ids: dict[str, Any] = {}
    log: list[dict[str, Any]] = []
    error: str | None = None
    after: dict[str, Any] | None = None
    started = False

    try:
        async with mcp_session(target) as session:
            async def call(tool: str, args: dict[str, Any]) -> Any:
                return await call_tool(session, tool, args)

            baseline = await fixtures.verify_baseline(fixture, platform, call, manifest)
            present = {rec: r for rec, r in baseline["records"].items() if r["status"] != "missing"
                       and r["status"] != "unverified"}

            if manifest is not None:
                same = (manifest.get("complete") and manifest.get("fixture") == fixture.name
                        and manifest.get("fixtureSha") == fixture.sha and manifest.get("url") == target["url"])
                if same and baseline["status"] in ("ok", "unverified") \
                        and baseline["fixtureHash"] == manifest.get("fixtureHash"):
                    out(f"{target['name']}: already seeded with {fixture.name}@{fixture.sha} "
                        f"(seed {manifest.get('seedId')}, {manifest.get('seededAt')}). Nothing done.")
                    return 0
                out(f"Seed refused: {target['name']!r} already has a seed manifest that does not hold "
                    f"({_manifest_problem(manifest, fixture, target, baseline)}). Re-initialize the "
                    f"environment and delete {fixtures.manifest_path(target['name'])} before seeding again.",
                    file=sys.stderr)
                return 2
            if present:
                why = (f"although INITIALIZED_AT {initialized_at} declares it re-initialized since seed "
                       f"{stale.get('seedId')} ({stale.get('initializedAt')})" if stale is not None
                       else "but has no seed manifest")
                out(f"Seed refused: {target['name']!r} already holds baseline records "
                    f"{sorted(present)} {why}. It is not a freshly initialized "
                    f"environment; re-initialize it first. Nothing was created.", file=sys.stderr)
                return 2

            if checklist is not None:
                # The pre-seed read-back, not None: nothing is seeded yet, so a
                # master-data row is never a baseline record and can be judged.
                before = await fixtures.assess_freshness(
                    checklist, call=call, tools=live, target=target, fixture=None, baseline=baseline,
                    manifest=None, now=fixtures.now_iso())
                checks = [c for kind in ("documents", "masterData") for c in before["details"][kind]]
                dirty = [c for c in checks if c["status"] in ("dirty", "leftover")]
                if dirty:
                    out("Seed refused: the environment is not freshly initialized:\n  " + "\n  ".join(
                        f"{c['name']}: {c['status']} ({c.get('count', c.get('extraCount'))})" for c in dirty)
                        + "\nNothing was created.", file=sys.stderr)
                    return 2
                for c in checks:
                    if c["status"] == "unverified":
                        out(f"Seed preflight: cannot verify {c['name']} ({c['tool']}): {c.get('detail')}. "
                            f"Not refused; the comparison will read it as unverified.", file=sys.stderr)

            if stale is not None:
                moved = fixtures.archive_manifest(target["name"], stale)
                out(f"{target['name']}: INITIALIZED_AT {initialized_at} differs from the manifest's "
                    f"{stale.get('initializedAt')}: treated as a re-initialized environment. Seed "
                    f"{stale.get('seedId')} archived -> {moved}")
            # From here on something may be created: the manifest exists, INCOMPLETE,
            # until the very end (see the module docstring).
            fixtures.write_manifest(target["name"], _manifest(
                base, ids={}, after=None, steps=0, complete=False,
                error="seed started and did not finish (interrupted, or failed while running)"))
            started = True
            # `ids` fills as each record is created, so an interruption still
            # records what exists.
            _ids, log, error = await fixtures.seed_records(fixture, platform, call, ids=ids)
            after = await fixtures.verify_baseline(fixture, platform, call, {"records": ids}) if not error else None
    except BaseException as exc:  # noqa: BLE001 - Ctrl-C, cancellation, a failed teardown: written down, re-raised
        if started:
            interrupted = f"seed interrupted: {type(exc).__name__}: {exc}"
            fixtures.write_manifest(target["name"], _manifest(
                base, ids=ids, after=None, steps=None, complete=False, error=interrupted))
            out(f"{interrupted}. Created so far: {sorted(ids)}. Manifest written INCOMPLETE "
                f"({fixtures.manifest_path(target['name'])}): re-initialize the environment before "
                f"seeding again.", file=sys.stderr)
        raise

    complete = error is None and after is not None and after["status"] in ("ok", "unverified")
    path = fixtures.write_manifest(target["name"], _manifest(
        base, ids=ids, after=after, steps=len(log), complete=complete, error=error))
    if error:
        out(f"Seed FAILED at {error}. Created so far: {sorted(ids)}. Manifest written INCOMPLETE "
            f"({path}): re-initialize the environment before seeding again.", file=sys.stderr)
        return 2
    if not complete:
        bad = {rec: r["status"] for rec, r in after["records"].items() if r["status"] not in ("ok", "unverified")}
        out(f"Seed created every record but they do not read back as declared: {bad}. Manifest written "
            f"INCOMPLETE ({path}); fix the fixture's find/match/expect, re-initialize, seed again.",
            file=sys.stderr)
        return 2
    out(f"{target['name']}: seeded {len(ids)} record(s) with {fixture.name}@{fixture.sha} "
        f"· baseline {after['status']} {after['fixtureHash']} · seed {base['seedId']} -> {path}")
    return 0


def _manifest(base: dict[str, Any], *, ids: dict[str, Any], after: dict[str, Any] | None,
              steps: int | None, complete: bool, error: str | None) -> dict[str, Any]:
    """`.seeds/<target>.json`. One `seedId` per seed: the in-progress and the final file share it."""
    return {
        "manifestVersion": fixtures.MANIFEST_VERSION,
        **{k: base[k] for k in ("target", "url", "platform", "fixture", "fixtureSha")},
        "fixtureHash": after["fixtureHash"] if after else None,
        "seedId": base["seedId"],
        "seededAt": fixtures.now_iso(),
        "initializedAt": base["initializedAt"],
        "complete": complete,
        "records": {**ids, **({rec: r["id"] for rec, r in after["records"].items() if r["id"] is not None}
                              if after else {})},
        "steps": steps,
        **({"error": error} if error else {}),
        **({"verify": {rec: r["status"] for rec, r in after["records"].items()}} if after else {}),
    }


def _manifest_problem(manifest: dict[str, Any], fixture: fixtures.Fixture, target: dict[str, Any],
                      baseline: dict[str, Any]) -> str:
    if not manifest.get("complete"):
        return "the previous seed did not complete"
    if manifest.get("url") != target["url"]:
        return f"it was seeded at {manifest.get('url')}"
    if (manifest.get("fixture"), manifest.get("fixtureSha")) != (fixture.name, fixture.sha):
        return f"it holds {manifest.get('fixture')}@{manifest.get('fixtureSha')}"
    return f"the baseline reads back {baseline['status']}"


async def capture_allowlist(target: dict[str, Any], platform: str, *, out=print) -> int:
    """Print, per master-data entity of the checklist, the rows initialization created.

    The live tools/list is read first: an entity whose list tool the target
    does not offer is `NOT CAPTURED: tool not offered: <tool>`, never called.
    Exit 2 when no entity at all was captured.
    """
    checklist = fixtures.load_checklist(platform)
    if checklist is None:
        out(f"No fixtures/fresh.{platform}.yaml: nothing to capture.", file=sys.stderr)
        return 2
    live = set((await describe_server(target)).get("tools") or [])
    captured: dict[str, Any] = {}
    async with mcp_session(target) as session:
        for ent in checklist.master_data:
            if ent["tool"] not in live:
                captured[ent["name"]] = f"NOT CAPTURED: {fixtures.TOOL_NOT_OFFERED}: {ent['tool']}"
                continue
            try:
                rows = extract_rows(await call_tool(session, ent["tool"], ent.get("args") or {}))
            except Exception as exc:  # noqa: BLE001 - shown, the operator decides
                captured[ent["name"]] = f"NOT CAPTURED: {type(exc).__name__}: {exc}"
                continue
            captured[ent["name"]] = sorted({str(_path(r, ent["key"])) for r in rows})
    out(f"# Captured from {target['name']} ({target['url']}) at {fixtures.now_iso()}.")
    out(f"# Paste each list as that entity's `allow:` in {checklist.path.name}, review it, then set")
    out("# allowlistCaptured: true. Capture ONLY from a freshly initialized, not yet seeded environment.")
    out(yaml.safe_dump(captured, allow_unicode=True, sort_keys=True).rstrip())
    if not any(isinstance(v, list) for v in captured.values()):
        out("Nothing was captured.", file=sys.stderr)
        return 2
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mcp-seed", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--target", required=True, help="Target name from config.toml")
    parser.add_argument("--fixture", help="Baseline dataset, fixtures/<name>.yaml")
    parser.add_argument("--initialized-at", type=_parse_instant,
                        help="When this environment was initialized (ISO-8601 with timezone). "
                        "Operator-declared, recorded in the manifest and in every comparison's freshness.")
    parser.add_argument("--capture-allowlist", action="store_true",
                        help="Print the master data initialization created; seeds nothing.")
    parser.add_argument("--config", help="Path to config.toml (default: mcp-tests/config.toml)")
    parser.add_argument("--no-interactive", action="store_true", help="Never open a browser for OAuth.")
    parser.add_argument("--auth-wait", type=int, default=DEFAULT_AUTH_WAIT, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    if not args.capture_allowlist and (not args.fixture or not args.initialized_at):
        parser.error("seeding needs --fixture and --initialized-at")
    try:
        config = cfg.load_config(args.config)
        target = cfg.target_settings(config, args.target)
        platform = cfg.target_platform(target)
        fixture = fixtures.load_fixture(args.fixture) if args.fixture else None
    except (ValueError, KeyError) as exc:
        print(exc.args[0] if exc.args else exc, file=sys.stderr)
        return 2
    try:
        preflight(target, interactive=not (args.no_interactive or is_headless()),
                  on_authorize_url=webbrowser.open, wait=args.auth_wait)
    except AuthError as exc:
        print(f"Auth failed for target {args.target!r}: {exc}. Nothing was created.", file=sys.stderr)
        return 2
    if args.capture_allowlist:
        return asyncio.run(capture_allowlist(target, platform))
    return asyncio.run(seed(target, platform, fixture, initialized_at=args.initialized_at))


if __name__ == "__main__":
    sys.exit(main())
