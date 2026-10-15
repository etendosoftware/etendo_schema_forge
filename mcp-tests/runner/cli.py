"""Entry point for the MCP test harness (vertical slice).

    python -m runner.cli --target local --suite sales-order --probe <id>

Auth per target is `bearer` or `oauth` (authorization code + PKCE), resolved at
preflight before the first probe.

Each run writes `run.json`, one `probes/<id>/attempt-<n>.json` per attempt, and the live
`events.ndjson` stream (§6.5) that the optional Streamlit UI (`make mcp-ui`)
tails. The UI is a separate process that shells out to this CLI: nothing here
knows it exists (D11).

`--targets a,b` runs a comparison (D44): one `runs/<compareId>/` holding
`compare.json` and one ordinary run per target under `targets/<name>/`, run
concurrently, followed by the report (`runner/report.py`).

Still out of scope here: redaction.
"""

from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import json
import random
import secrets
import subprocess
import sys
import traceback
import webbrowser
from collections import deque
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

from . import config as cfg
from . import decide as rule
from . import fixture as fixtures
from .agent import PROMPT_VERSION, ProbeAborted, check_model, run_probe
from .events import (
    EFFECT_CHECKED,
    PROBE_ABORTED,
    PROBE_FINISHED,
    PROBE_STARTED,
    RUN_FINISHED,
    RUN_STARTED,
    SETUP_STEP,
    TEARDOWN_STEP,
    EventWriter,
)
from .mcp_client import (
    DEFAULT_AUTH_WAIT,
    AuthError,
    VerificationError,
    call_tool,
    count_matching,
    count_rows,
    describe_server,
    is_headless,
    mcp_session,
    preflight,
)
from .steps import StepError, resolve_refs, run_steps
from .matcher import MATCHER_VERSION, check_answer
from .suite import (
    Probe,
    Suite,
    attempt_marker,
    interpolate,
    interpolate_args,
    load_suite,
    prompt_tool_mentions,
)
from .verdict import VERDICT_SCHEMA_VERSION

HARNESS_ROOT = Path(__file__).resolve().parent.parent
SUITES_DIR = HARNESS_ROOT / "suites"
RUNS_DIR = HARNESS_ROOT / "runs"

#: v2 adds `id`, `result`, `resultBytes` and `resultTruncated` to every entry of
#: `toolCalls[]`, and makes a partial `toolCalls[]` survive a crashed probe. The
#: keys are additive, but a consumer computing payload metrics (§6.6) must be
#: able to tell "results were never recorded" from "the results were empty", and
#: only the version says which.
#: v3 adds `setup[]`, `teardown[]` and `teardownClean` (D41): the records of the
#: deterministic calls the runner made around the agent. Never part of
#: `toolCalls[]`, which stays the agent's own record.
#: v4 (ETP-5750 S1, plan 2026-10-14 §2/§6) is the groundwork for reproducible
#: comparisons. Probe file: `finalAnswer`, `usage.loop` / `usage.report`,
#: `servedModel`, `silentWrong`. run.json: `harness` (commit + dirty flag) and
#: `server` (`serverInfo`, `protocolVersion`, catalogue sha + tool count, read at
#: preflight). Additive, but "never recorded" and "null" must stay tellable apart.
#: v5 (ETP-5750 S2, D43) is REPEAT: one file per ATTEMPT,
#: `probes/<probeId>/attempt-<n>.json`, instead of `probes/<probeId>.json`; each
#: carries `attempt`, `replaces` and `marker`, and `{{marker}}` becomes
#: `<runId>-<probeId>-a<n>`. run.json.repeat is the requested N. The layout
#: change is what the version is for: a reader picks the layout from it.
#: v6 (ETP-5750 S3, D44) adds the comparison: each attempt records its real
#: `startedAt`/`finishedAt` (ms) and `workerSlot`; run.json gains `platform`,
#: `compareId`, `concurrency` and `schedule`. A comparison writes one ordinary
#: run per target under `runs/<compareId>/targets/<target>/`. The probe-file
#: layout is unchanged from v5.
#: v7 (ETP-5750 S5, D45/D46/D49) adds suite v2: each attempt records
#: `platform`, `answerVerified` / `answerCheck` (expectAnswer, runner/matcher.py)
#: and the objective `success`; a platform that declared a probe impossible gets
#: `probes/<id>/not-possible.json` and no attempt at all.
RUN_SCHEMA_VERSION = 7

#: `compare.json` shape (plan §5.2, §6). Read by `report.py`. v2 (S6): the real
#: `targets[].freshness` (plan §5.9), `targets[].fixtureHash`, `pins.fixture`
#: and `pins.fixtureHashes`. v3 (plan §9 q14): `targets[].freshness.unverifiable`
#: lists the entities whose tool the target's MCP does not offer; with only
#: those, the target is still `fresh`.
COMPARE_SCHEMA_VERSION = 3
#: Plan §5.1 / decision 11: a comparison repeats 3 times and runs 4 attempts at
#: once per target unless told otherwise. A single `mcp-test` stays at 1 / 1.
COMPARE_DEFAULT_REPEAT = 3
COMPARE_DEFAULT_CONCURRENCY = 4


def _unwrap(exc: BaseException) -> BaseException:
    """Walk to the innermost meaningful exception.

    `anyio`'s TaskGroup wraps everything in an ExceptionGroup — sometimes nested
    two deep — and "ExceptionGroup: unhandled errors in a TaskGroup" is how we
    connect, not what went wrong. It must never be what a user reads. `__cause__`
    is followed for the same reason: the outer wrapper is rarely the diagnosis.
    """
    seen: set[int] = set()
    while id(exc) not in seen:
        seen.add(id(exc))
        inner = getattr(exc, "exceptions", None)
        if inner:
            exc = inner[0]
            continue
        if exc.__cause__ is not None:
            exc = exc.__cause__
            continue
        break
    return exc


def _find_probe_aborted(exc: BaseException) -> ProbeAborted | None:
    """Find a ProbeAborted anywhere in the exception tree.

    Not an `isinstance` on the caught exception: `run_probe` is awaited inside
    `mcp_session`, whose anyio task groups re-raise the body's exception wrapped
    in an ExceptionGroup. That wrapping is the same reason `_unwrap` exists, and
    a plain isinstance would silently drop the salvaged transcript exactly when
    the session also failed on the way out.
    """
    stack: list[BaseException] = [exc]
    seen: set[int] = set()
    while stack:
        current = stack.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))
        if isinstance(current, ProbeAborted):
            return current
        stack.extend(getattr(current, "exceptions", None) or [])
        for link in (current.__cause__, current.__context__):
            if link is not None:
                stack.append(link)
    return None


def _provider_status(exc: BaseException) -> int | None:
    """HTTP status of a provider error, when it carries one.

    `response.status_code` covers an httpx error raised by the MCP transport.
    """
    for attr in ("status_code", "http_status", "code"):
        value = getattr(exc, attr, None)
        if isinstance(value, int):
            return value
    value = getattr(getattr(exc, "response", None), "status_code", None)
    return value if isinstance(value, int) else None


def _is_rate_limited(exc: BaseException) -> bool:
    """A 429, from the LLM gateway or the MCP server (plan §5.2)."""
    return _provider_status(_unwrap(exc)) == 429


def _error_detail(exc: BaseException) -> str:
    """A line a human can act on: the real exception, with the provider's words."""
    inner = _unwrap(exc)
    status = _provider_status(inner)
    text = str(inner).strip() or inner.__class__.__name__
    if len(text) > 600:
        text = text[:600] + " ...[truncated]"
    prefix = f"{type(inner).__name__}"
    if status:
        prefix += f" [{status}]"
    return f"{prefix}: {text}"


def _is_provider_config_error(exc: BaseException) -> bool:
    """A 401/403/404 from the provider is a misconfiguration, not a probe result.

    Repeating it once per probe produces a run full of identical useless lines,
    so the run stops instead.
    """
    return _provider_status(_unwrap(exc)) in (401, 403, 404)


def _open_browser(url: str) -> None:
    """CLI presentation of an authorization URL: open it and say so.

    Kept out of `mcp_client`, which only ever HANDS BACK the URL — a UI renders
    it as a link instead of having a browser pop up from under a web page.
    """
    print("  opening your browser to authorize this target...")
    print(f"  if it does not open, visit:\n    {url}")
    webbrowser.open(url)


def _now_ms() -> str:
    """UTC, millisecond precision: enough to read a concurrent schedule back."""
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _new_compare_id(now: dt.datetime) -> str:
    """e.g. 20261014T140233-cmp-a3f1 (plan §5.2).

    Seconds since 2026-10-15 (minutes before): the report orders comparisons by
    `startedAt` and falls back to this stamp for legacy runs without it.
    """
    return f"{now.strftime('%Y%m%dT%H%M%S')}-cmp-{secrets.token_hex(2)}"


def _new_run_id(target: str, now: dt.datetime) -> str:
    """e.g. 20260911T1402-local-a3f1 (design §6.2)."""
    return f"{now.strftime('%Y%m%dT%H%M')}-{target}-{secrets.token_hex(2)}"


def _resolve_suite_path(name: str) -> Path:
    candidate = Path(name)
    if candidate.exists():
        return candidate
    for suffix in (".yaml", ".yml", ""):
        candidate = SUITES_DIR / f"{name}{suffix}"
        if candidate.exists():
            return candidate
    raise FileNotFoundError(f"No suite {name!r} under {SUITES_DIR}")


def _harness_revision() -> dict[str, Any]:
    """The harness commit and whether `mcp-tests/` had uncommitted changes.

    A pin (plan §6): two runs from different harness code are not comparable,
    and a dirty tree means the commit alone does not say what ran. Both are
    None when git is not available — unknown, never assumed clean.
    """
    def git(*argv: str) -> str | None:
        try:
            done = subprocess.run(
                ["git", *argv], cwd=HARNESS_ROOT, capture_output=True, text=True, timeout=10
            )
        except (OSError, subprocess.SubprocessError):
            return None
        return done.stdout if done.returncode == 0 else None

    commit = git("rev-parse", "HEAD")
    status = git("status", "--porcelain", "--", ".")
    return {
        "commit": commit.strip() if commit else None,
        "dirty": None if status is None else bool(status.strip()),
    }


async def _describe_target(target: dict[str, Any]) -> dict[str, Any]:
    """`describe_server`, never raising: a failure is written down, not fatal.

    Not a stop condition in itself — the probes open their own sessions and
    report their own harness errors, exactly as before this read existed.
    `error` has the shape of a probe's `harnessError` (`{kind, detail}`), so one
    reader handles both.
    """
    try:
        return {**await describe_server(target), "error": None}
    except Exception as exc:  # noqa: BLE001
        kind = "auth" if isinstance(_unwrap(exc), AuthError) else "server"
        return {
            "serverInfo": None,
            "protocolVersion": None,
            "catalogue": None,
            "error": {"kind": kind, "detail": _error_detail(exc)},
        }


def _silent_wrong(
    verdict: dict[str, Any] | None, effect_verified: bool | None, answer_verified: bool | None = None
) -> bool | None:
    """Item 8 of the plan (§3): the agent said OKAY and an objective check failed.

    None when there is nothing to compare — no verdict, or no check (or a check
    that could not run). A flag, not a verdict: such an attempt already failed
    the objective check.
    """
    checks = [c for c in (effect_verified, answer_verified) if c is not None]
    if verdict is None or not checks:
        return None
    return verdict.get("outcome") == "OKAY" and not all(checks)


def attempt_success(
    probe: Probe,
    verdict: dict[str, Any] | None,
    effect_verified: bool | None,
    answer_verified: bool | None,
) -> bool | None:
    """Item 1, objective (plan §3, §5.5): what `report.py` reads as success.

    Every check the probe declares must hold; a declared check that could not
    be decided (None) makes success None — "not verifiable", never a failure.
    `expectOutcome: refused` adds the one self-report rule: the agent must not
    have reported OKAY. A probe that declares nothing yields None (a v1 read).
    """
    declared = []
    if probe.expect_effect is not None:
        declared.append(effect_verified)
    if probe.expect_answer is not None:
        declared.append(answer_verified)
    if not declared and probe.expect_outcome != "refused":
        return None
    if any(c is None for c in declared):
        return None
    if verdict is None:
        return None
    success = all(declared)
    if probe.expect_outcome == "refused":
        success = success and verdict.get("outcome") != "OKAY"
    return success


def success_basis(probe: Probe, success: bool | None) -> str | None:
    """What `success` rests on: `objective` or `selfReport` (plan §5.5, S5 review).

    `selfReport` only for a refusal with no objective check at all — a read
    error task such as "show me a document that does not exist", where nothing
    can be written and there is nothing to read back. It is allowed, and it is
    flagged in the summary rather than hidden in the success count. An
    `expectAnswer` (e.g. `none:` items pinning what the agent must NOT claim)
    makes it objective.
    """
    if success is None:
        return None
    if probe.expect_effect is None and probe.expect_answer is None:
        return "selfReport"
    return "objective"


def _check_answer(probe: Probe, answer: Any, *, saved: dict[str, Any], interp: dict[str, Any]
                  ) -> tuple[bool | None, dict[str, Any] | None, str | None]:
    """(answerVerified, answerCheck, error). An unresolvable spec is an error, not a fail."""
    if probe.expect_answer is None:
        return None, None, None
    try:
        spec = resolve_refs(interpolate_args(probe.expect_answer, **interp), saved)
        check = check_answer(answer if isinstance(answer, str) else None, spec)
    except (StepError, ValueError) as exc:
        return None, None, f"answer check: {exc}"
    return check["verified"], check, None


def attempt_path(run_dir: Path, probe_id: str, attempt: int) -> Path:
    """Where one attempt's record lives (run schema v5)."""
    return run_dir / "probes" / probe_id / f"attempt-{attempt}.json"


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def _run_header(
    *,
    run_id: str,
    started_at: dt.datetime,
    target: dict[str, Any],
    provider: dict[str, Any],
    max_steps: int,
    max_result_chars: int,
    suite: Suite,
    harness: dict[str, Any] | None = None,
    server: dict[str, Any] | None = None,
    repeat: int = 1,
    concurrency: int = 1,
    seed: int | None = None,
    compare_id: str | None = None,
) -> dict[str, Any]:
    return {
        "schemaVersion": RUN_SCHEMA_VERSION,
        "runId": run_id,
        # The comparison this run belongs to; null for a single `mcp-test`.
        "compareId": compare_id,
        "startedAt": started_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "target": {"name": target["name"], "url": target["url"]},
        "platform": target.get("platform"),
        "concurrency": concurrency,
        # null seed = suite order, not shuffled (a plain mcp-test).
        "schedule": {"seed": seed, "shuffled": seed is not None},
        # Still null (D1): Etendo's `serverInfo.version` is a constant of the MCP
        # implementation, not the module build, so it cannot stand in for one.
        # `server.catalogue.sha` is the proxy that tells two builds apart.
        "serverBuild": None,
        "server": server,
        "harness": harness,
        "provider": provider["name"],
        "model": provider["model"],
        "temperature": provider["temperature"],
        "promptVersion": PROMPT_VERSION,
        "maxSteps": max_steps,
        "maxResultChars": max_result_chars,
        # Requested MEASURED attempts per probe (D43). Replacements for
        # harness-errored attempts come on top, capped at `repeat` per probe.
        "repeat": repeat,
        "suites": [{"file": suite.path.name, "sha": suite.sha}],
    }


async def _verify_effect(
    probe: Probe,
    target: dict[str, Any],
    *,
    run_id: str,
    timestamp: str,
    saved: dict[str, Any] | None = None,
    marker: str | None = None,
) -> tuple[bool | None, dict[str, Any] | None, dict[str, Any] | None]:
    """Run a write probe's post-condition in a FRESH MCP session.

    Returns (effectVerified, detail, harnessError). `effectVerified` is a THIRD
    axis, never folded into `outcome`: an agent reporting OKAY while the effect
    is missing is a different and more dangerous result than an honest failure.
    `None` means "could not verify", which is not the same as "verified absent".
    """
    effect = probe.expect_effect
    if effect is None:
        return None, None, None

    call_args = interpolate_args(
        effect.args, run_id=run_id, probe_id=probe.id, timestamp=timestamp, marker=marker
    )
    try:
        # A check may name what setup created (`{{steps.invoice.id}}`, D41).
        call_args = resolve_refs(call_args, saved or {})
    except StepError as exc:
        return None, None, {"kind": "verification", "phase": "effectCheck", "detail": f"effect check: {exc}"}
    try:
        # A session of its own, so nothing the agent's session held can reach it.
        async with mcp_session(target) as session:
            payload = await call_tool(session, effect.tool, call_args)
            where = None
            if effect.where:
                where = resolve_refs(interpolate_args(
                    effect.where, run_id=run_id, probe_id=probe.id, timestamp=timestamp, marker=marker
                ), saved or {})
                rows = count_matching(payload, where)
            else:
                rows = count_rows(payload)
    except AuthError as exc:
        return None, None, {"kind": "auth", "phase": "effectCheck", "detail": f"effect check: {exc}"}
    except Exception as exc:  # noqa: BLE001 - VerificationError included
        detail = str(exc) if isinstance(exc, VerificationError) else (
            f"effect check: {type(exc).__name__}: {exc}"
        )
        kind = "rateLimited" if _is_rate_limited(exc) else "verification"
        return None, None, {"kind": kind, "phase": "effectCheck", "detail": detail}

    verified = rows >= 1 if effect.expect == "atLeastOne" else rows == 0
    detail = {"tool": effect.tool, "args": call_args, "expect": effect.expect, "rows": rows}
    if effect.where:
        detail["where"] = where
    return verified, detail, None


class SetupFailed(RuntimeError):
    """A probe's setup did not reach the state the probe needs (D41).

    `rate_limited` when the step that failed was answered with a 429: then
    the failure is throttling, not a setup defect, and is classified (and
    backed off) as `rateLimited`.
    """

    def __init__(self, message: str, *, rate_limited: bool = False) -> None:
        super().__init__(message)
        self.rate_limited = rate_limited


async def _run_phase(
    probe: Probe,
    phase: str,
    target: dict[str, Any],
    *,
    run_id: str,
    timestamp: str,
    saved: dict[str, Any],
    max_result_chars: int,
    events: Any,
    marker: str | None = None,
    attempt: int | None = None,
) -> list[dict[str, Any]]:
    """Run a probe's setup or teardown in a session of its own (D41).

    Never raises: a failure is a record with `ok: false`, so a session that
    dies mid-teardown still leaves the steps it did run on file.
    """
    declared = probe.setup if phase == "setup" else probe.teardown
    if not declared:
        return []
    steps = [
        replace(
            s,
            args=interpolate_args(
                s.args, run_id=run_id, probe_id=probe.id, timestamp=timestamp, marker=marker
            ),
        )
        for s in declared
    ]
    event_type = SETUP_STEP if phase == "setup" else TEARDOWN_STEP
    records: list[dict[str, Any]] = []
    # steps.py stores a failure as text; the 429 is noticed here, on the way
    # through, and stamped on the record of the step it belongs to.
    throttled = [False]

    async def call(session: Any, tool: str, args: dict[str, Any]) -> Any:
        try:
            return await call_tool(session, tool, args)
        except Exception as exc:
            throttled[0] = _is_rate_limited(exc)
            raise

    def on_record(rec: dict[str, Any]) -> None:
        if not rec["ok"] and throttled[0]:
            rec["rateLimited"] = True
            throttled[0] = False
        records.append(rec)
        events.emit(
            event_type,
            probe=probe.id,
            **({"attempt": attempt} if attempt is not None else {}),
            index=rec.get("index"),
            tool=rec.get("tool"),
            ok=rec["ok"],
            ms=rec.get("ms"),
            **({"error": rec["error"]} if not rec["ok"] else {}),
        )

    try:
        async with mcp_session(target) as session:
            await run_steps(
                steps,
                lambda tool, args: call(session, tool, args),
                phase=phase,
                saved=saved,
                stop_on_error=phase == "setup",
                max_result_chars=max_result_chars,
                on_record=on_record,
            )
    except Exception as exc:  # noqa: BLE001 - the session itself failed
        throttled[0] = _is_rate_limited(exc)
        on_record({"phase": phase, "index": None, "tool": None, "ok": False,
                   "error": f"session: {type(exc).__name__}: {exc}"})
    return records


@dataclass(frozen=True)
class AttemptContext:
    """Everything one target's attempts read, and nothing they share (D44).

    `run_id` names the target's run on disk. `token_run_id` is what
    `{{runId}}` expands to and `marker_prefix` what `{{marker}}` starts with:
    both are the run id in a single-target run and the `compareId` in a
    comparison, so the prompt text is byte-identical across targets.
    """

    target: dict[str, Any]
    provider: dict[str, Any]
    run_id: str
    run_dir: Path
    events: Any
    max_steps: int
    max_result_chars: int
    repeat: int
    marker_prefix: str
    token_run_id: str
    preflight_error: dict[str, Any] | None = None
    #: Console prefix; `[<target>] ` in a comparison, where lines interleave.
    tag: str = ""
    #: The target's platform when the suite is v2; None for a v1 suite.
    platform: str | None = None


@dataclass(frozen=True)
class _Work:
    probe: Probe
    attempt: int
    replaces: int | None
    #: Seconds to wait before starting (rate-limit backoff); 0 for planned work.
    delay: float = 0.0


def build_worklist(probes: list[Probe], repeat: int, seed: int | None) -> list[_Work]:
    """The planned attempts of one target: probes x 1..repeat (D44).

    With a seed the list is shuffled by `random.Random(seed)` — the same seed
    gives the same order on every target and every machine — so attempt 1 of
    every probe is not systematically first, and provider drift over the run
    does not correlate with one probe. Without a seed (a plain `mcp-test`) it
    stays in suite order, probe-major, exactly as before REPEAT.
    """
    items = [_Work(p, n, None) for p in probes for n in range(1, repeat + 1)]
    if seed is not None:
        random.Random(seed).shuffle(items)
    return items


@dataclass
class TargetOutcome:
    records: list[dict[str, Any]]
    #: The provider rejected the model outright (401/403/404): nothing more ran.
    stopped: bool = False


async def run_attempt(
    ctx: AttemptContext,
    probe: Probe,
    attempt: int,
    replaces: int | None,
    *,
    slot: int | None = None,
) -> tuple[dict[str, Any], bool]:
    """One attempt of one probe: setup, agent, effect check, teardown (D41, D43).

    Writes `probes/<probeId>/attempt-<n>.json` and returns (record,
    stop_run). Each attempt is a fresh MCP session and a fresh conversation,
    and its own `{{marker}}`, so attempts never see each other's records.

    Module-level and free of shared mutable state (D44): everything it reads
    is in `ctx`, everything it produces is the returned record, and the only
    thing it writes besides its own file is the target's event stream. Tallies
    and exit codes are derived from the records by the caller.
    """
    timestamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    started_at = _now_ms()
    marker = attempt_marker(ctx.marker_prefix, probe.id, attempt)
    prompt = interpolate(
        probe.prompt, run_id=ctx.token_run_id, probe_id=probe.id, timestamp=timestamp, marker=marker
    )
    tag = f"{ctx.tag}{probe.id} a{attempt}"
    again = f", replaces {replaces}" if replaces else ""
    print(f"  {tag} ({probe.mode}) attempt {attempt}/{ctx.repeat}{again} ...", flush=True)
    ctx.events.emit(PROBE_STARTED, probe=probe.id, attempt=attempt, mode=probe.mode,
                **({"replaces": replaces} if replaces else {}))
    # The agent never learns which probe it is running: the probe id is
    # stamped on here, by the owner of the stream.
    on_event = lambda t, fields: ctx.events.emit(t, probe=probe.id, attempt=attempt, **fields)  # noqa: E731

    result: dict[str, Any] = {
        "schemaVersion": RUN_SCHEMA_VERSION,
        "runId": ctx.run_id,
        "probeId": probe.id,
        # 1-based, unique per probe within the run (D43). A replacement for
        # an attempt that hit a harness error gets the next free number and
        # names the one it replaces; the errored attempt stays on file.
        "attempt": attempt,
        "replaces": replaces,
        "marker": marker,
        "mode": probe.mode,
        # The platform this attempt ran as (suite v2); None for a v1 suite.
        "platform": ctx.platform,
        "prompt": prompt,
        # Real wall clock, ms precision, and the pool slot that ran it (D44):
        # the actual schedule, on file, not inferred.
        "startedAt": started_at,
        "workerSlot": slot,
        # Third axis, alongside outcome and harnessError. None = not checked
        # or not verifiable; never conflated with "verified absent".
        "effectVerified": None,
        "effectCheck": None,
        # Persisted, not just printed (plan §3 item 8). See _silent_wrong.
        "silentWrong": None,
        # Suite v2 (D46): expectAnswer over finalAnswer, and the objective
        # success the report reads. None = not checked / not verifiable.
        "answerVerified": None,
        "answerCheck": None,
        "success": None,
        # objective | selfReport (a refusal with no objective check); None
        # when success is None.
        "successBasis": None,
        # None until the agent ran; then always present (agent.run_probe).
        "finalAnswer": None,
        "usage": None,
        "servedModel": None,
        "setup": [],
        "teardown": [],
        # None = the probe declares no teardown; False = something it
        # created may still be on the server.
        "teardownClean": None,
    }
    saved: dict[str, Any] = {}
    stop_run = False
    cancelled = False
    # Which part of the attempt was running, stamped on any harnessError:
    # setup | agent | effectCheck (plus preflight, set by the caller).
    phase = "setup"

    if ctx.preflight_error:
        result["harnessError"] = ctx.preflight_error
        result["verdict"] = None
        result["finishedAt"] = _now_ms()
        _write_json(attempt_path(ctx.run_dir, probe.id, attempt), result)
        ctx.events.emit(PROBE_ABORTED, probe=probe.id, attempt=attempt, kind="auth",
                    detail=ctx.preflight_error["detail"], toolCalls=0)
        print(f"    {tag} not measured (auth)", file=sys.stderr)
        return result, False

    try:
        result["setup"] = await _run_phase(
            probe, "setup", ctx.target, run_id=ctx.token_run_id, timestamp=timestamp, marker=marker, attempt=attempt,
            saved=saved, max_result_chars=ctx.max_result_chars, events=ctx.events,
        )
        failed = next((r for r in result["setup"] if not r["ok"]), None)
        if failed:
            raise SetupFailed(f"setup[{failed['index']}] {failed['tool']}: {failed['error']}",
                              rate_limited=bool(failed.get("rateLimited")))
        try:
            prompt = resolve_refs(prompt, saved)
        except StepError as exc:
            raise SetupFailed(f"prompt: {exc}") from exc
        result["prompt"] = prompt

        # A fresh MCP session per attempt: attempts are fully independent (§3).
        phase = "agent"
        async with mcp_session(ctx.target) as session:
            outcome = await run_probe(
                session=session,
                provider=ctx.provider,
                prompt=prompt,
                max_steps=ctx.max_steps,
                max_result_chars=ctx.max_result_chars,
                on_event=on_event,
            )
        result.update(outcome)
        # harnessError is a separate axis from outcome (D12). Classification
        # of failure kinds is not built in this slice; the field exists so
        # the file shape is already right.
        result["harnessError"] = None
        verdict = result["verdict"]
        print(
            f"    {tag} {verdict['outcome']} · {result['toolCallCount']} tool calls · "
            f"{verdict['summary']}"
        )

        phase = "effectCheck"
        verified, detail, check_error = await _verify_effect(
            probe, ctx.target, run_id=ctx.token_run_id, timestamp=timestamp, saved=saved, marker=marker
        )
        result["effectVerified"] = verified
        result["effectCheck"] = detail
        answered, answer_check, answer_error = _check_answer(
            probe, result.get("finalAnswer"), saved=saved,
            interp={"run_id": ctx.token_run_id, "probe_id": probe.id, "timestamp": timestamp,
                    "marker": marker},
        )
        result["answerVerified"] = answered
        result["answerCheck"] = answer_check
        if answer_error and not check_error:
            check_error = {"kind": "verification", "phase": "answerCheck", "detail": answer_error}
        result["silentWrong"] = _silent_wrong(verdict, verified, answered)
        result["success"] = attempt_success(probe, verdict, verified, answered)
        result["successBasis"] = success_basis(probe, result["success"])
        if answered is not None:
            print(f"    {tag} answer {'matched' if answered else 'DID NOT match'}")
        if check_error:
            result["harnessError"] = check_error
            print(f"    {tag} effect NOT VERIFIABLE: {check_error['detail']}", file=sys.stderr)
        elif verified is False:
            # The headline case this amendment exists for.
            claim = " despite the agent reporting OKAY" if verdict["outcome"] == "OKAY" else ""
            print(f"    {tag} effect ABSENT{claim} ({detail['tool']} -> {detail['rows']} rows)")
        elif verified is True:
            print(f"    {tag} effect verified ({detail['tool']} -> {detail['rows']} rows)")

        ctx.events.emit(
            PROBE_FINISHED,
            probe=probe.id, attempt=attempt,
            outcome=verdict["outcome"],
            steps=result["toolCallCount"],
            exhausted=result.get("exhausted", False),
        )
        if probe.expect_effect is not None:
            ctx.events.emit(
                EFFECT_CHECKED,
                probe=probe.id, attempt=attempt,
                verified=verified,
                rows=None if detail is None else detail.get("rows"),
            )
    except SetupFailed as exc:
        # The agent never ran: there is nothing to measure (D41). A 429 is
        # throttling whatever the phase, so it is classified (and backed off)
        # as rateLimited; `phase` keeps where it happened.
        kind = "rateLimited" if exc.rate_limited else "setup"
        result["harnessError"] = {"kind": kind, "phase": "setup", "detail": str(exc)}
        result["verdict"] = None
        ctx.events.emit(PROBE_ABORTED, probe=probe.id, attempt=attempt, kind=kind, detail=str(exc), toolCalls=0)
        print(f"    {tag} not measured ({kind}): {exc}", file=sys.stderr)
    except AuthError as exc:
        result["harnessError"] = {"kind": "auth", "phase": phase, "detail": str(exc)}
        result["verdict"] = None
        ctx.events.emit(PROBE_ABORTED, probe=probe.id, attempt=attempt, kind="auth", detail=str(exc), toolCalls=0)
        print(f"    {tag} not measured (auth): {exc}", file=sys.stderr)
    except Exception as exc:  # noqa: BLE001 - a crash must still leave evidence
        # A ProbeAborted carries the tool calls recorded before the crash.
        # They are merged FIRST, so the evidence is written down even though
        # the probe has no verdict; `cause` is the real exception, so the
        # detail line and the stop-the-run check behave exactly as before.
        cause: BaseException = exc
        salvaged = 0
        aborted = _find_probe_aborted(exc)
        if aborted is not None:
            result.update(aborted.partial)
            cause = aborted.cause
            salvaged = result.get("toolCallCount", 0)
        detail = _error_detail(cause)
        result["harnessError"] = {
            # A 429 is throttling — ours or the provider's — never a product
            # result (plan §5.2). Named apart so a run full of them says so;
            # like any harness error it is replaced (D43).
            "kind": "rateLimited" if _is_rate_limited(cause) else "provider",
            "phase": phase,
            "detail": detail,
            # The full traceback stays: it is the only reason a nested
            # failure like this is diagnosable at all.
            "traceback": traceback.format_exc(),
        }
        # A failed probe has no verdict. The partial toolCalls above are the
        # objective record and must never be mistaken for one.
        result["verdict"] = None
        salvage_note = f" ({salvaged} tool calls recorded)" if salvaged else ""
        # The terminal event for a probe that has no outcome. Without it a
        # tailing UI would spin forever on a probe that is already dead.
        ctx.events.emit(
            PROBE_ABORTED, probe=probe.id, attempt=attempt, kind=result["harnessError"]["kind"], detail=detail, toolCalls=salvaged
        )
        print(f"    {tag} not measured: {detail}{salvage_note}", file=sys.stderr)
        stop_run = _is_provider_config_error(cause)
    except asyncio.CancelledError:
        # The run is being cancelled (Ctrl-C, or run_target cancelling its pool).
        # Not an attempt result: recorded as a harness error so the file says
        # what happened, teardown still runs below, then the cancellation goes on.
        cancelled = True
        result["harnessError"] = {"kind": "cancelled", "phase": phase,
                                  "detail": "the run was cancelled mid-attempt"}
        result["verdict"] = None
        raise
    finally:
        # Always, whatever happened above — including a setup that got
        # halfway: teardown is what keeps the tenant clean (D41).
        if probe.teardown:
            result["teardown"] = await _run_phase(
                probe, "teardown", ctx.target, run_id=ctx.token_run_id, timestamp=timestamp, marker=marker,
                attempt=attempt,
                saved=saved, max_result_chars=ctx.max_result_chars, events=ctx.events,
            )
            result["teardownClean"] = all(r["ok"] for r in result["teardown"])
            if not result["teardownClean"]:
                bad = sum(1 for r in result["teardown"] if not r["ok"])
                print(f"    {tag} teardown INCOMPLETE ({bad} failed step(s)): data may be left behind",
                      file=sys.stderr)
        if cancelled:
            # Partial record, written before the cancellation propagates.
            result["finishedAt"] = _now_ms()
            _write_json(attempt_path(ctx.run_dir, probe.id, attempt), result)

    result["finishedAt"] = _now_ms()
    _write_json(attempt_path(ctx.run_dir, probe.id, attempt), result)
    return result, stop_run


async def run_target(
    ctx: AttemptContext,
    probes: list[Probe],
    *,
    concurrency: int = 1,
    seed: int | None = None,
    stop: asyncio.Event | None = None,
) -> TargetOutcome:
    """Run every attempt of one target through a pool of `concurrency` slots (D43, D44).

    - Planned attempts come from `build_worklist`; a harness-errored attempt
      is replaced by one appended at the END of the queue, at most `repeat`
      replacements per probe, never after a preflight failure (D43).
    - An `exclusive` probe runs alone: the pool drains before it starts and
      nothing else starts until it finishes.
    - One attempt's failure never cancels a sibling: failures are records.
    - `stop` is shared by every target of a comparison. A provider config
      error sets it; running attempts finish (teardown included), queued ones
      never start.
    """
    stop = stop or asyncio.Event()
    pending = deque(build_worklist(probes, ctx.repeat, seed))
    last_number = {p.id: ctx.repeat for p in probes}
    replacements = {p.id: 0 for p in probes}
    free = list(range(max(concurrency, 1)))
    running: dict[asyncio.Task, tuple[_Work, int]] = {}
    outcome = TargetOutcome(records=[])

    try:
        await _drive_pool(ctx, pending, running, free, last_number, replacements, stop, outcome)
    except asyncio.CancelledError:
        # Cancelled from outside: cancel every attempt in flight and WAIT for
        # them, so each one's teardown (in its `finally`) completes before the
        # cancellation reaches the caller. Each writes a `cancelled` record.
        for task in running:
            task.cancel()
        await asyncio.gather(*running, return_exceptions=True)
        raise
    return outcome


#: Backoff before a `rateLimited` attempt's replacement starts (plan §5.2):
#: exponential in the number of replacements the probe has had, capped, with
#: jitter so parallel slots do not retry in lockstep. The wait holds the slot,
#: which is the point — it lowers the pressure on whoever is throttling.
RATE_LIMIT_BACKOFF_BASE = 2.0
RATE_LIMIT_BACKOFF_CAP = 30.0
#: Injection points for tests.
_backoff_sleep = asyncio.sleep
_backoff_jitter = random.random


def rate_limit_delay(nth_replacement: int) -> float:
    """Seconds to wait before the n-th (1-based) replacement of a throttled probe."""
    ceiling = min(RATE_LIMIT_BACKOFF_CAP, RATE_LIMIT_BACKOFF_BASE * 2 ** (nth_replacement - 1))
    return ceiling * (0.5 + 0.5 * _backoff_jitter())


async def _attempt_after(delay: float, ctx: AttemptContext, work: _Work, slot: int):
    if delay > 0:
        await _backoff_sleep(delay)
    return await run_attempt(ctx, work.probe, work.attempt, work.replaces, slot=slot)


async def _drive_pool(ctx, pending, running, free, last_number, replacements, stop, outcome) -> None:
    exclusive_running = False
    while pending or running:
        while pending and free and not exclusive_running and not stop.is_set():
            work = pending[0]
            if work.probe.exclusive and running:
                break  # drain the pool first
            pending.popleft()
            slot = free.pop(0)
            task = asyncio.create_task(_attempt_after(work.delay, ctx, work, slot))
            running[task] = (work, slot)
            if work.probe.exclusive:
                exclusive_running = True
        if not running:
            break  # stopped with work left: it never starts
        done, _ = await asyncio.wait(running, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            work, slot = running.pop(task)
            free.append(slot)
            free.sort()
            if work.probe.exclusive:
                exclusive_running = False
            try:
                record, stop_run = task.result()
            except BaseException:
                # A bug in the runner itself, not an attempt result: let the
                # attempts already in flight finish their teardown, then fail.
                stop.set()
                await asyncio.gather(*running, return_exceptions=True)
                raise
            outcome.records.append(record)
            if stop_run:
                outcome.stopped = True
                stop.set()
            pid = work.probe.id
            if (
                record.get("harnessError")
                and not ctx.preflight_error
                and replacements[pid] < ctx.repeat
                and not stop.is_set()
            ):
                replacements[pid] += 1
                last_number[pid] += 1
                throttled = record["harnessError"].get("kind") == "rateLimited"
                delay = rate_limit_delay(replacements[pid]) if throttled else 0.0
                pending.append(_Work(work.probe, last_number[pid], work.attempt, delay))


def _tally(records: list[dict[str, Any]]) -> dict[str, int]:
    """The run_finished counts, derived from the records (never kept on the side).

    A record with a harness error is `notMeasured` whatever its verdict says
    (D12) — that includes an effect check that could not run.
    """
    tally = {"ok": 0, "error": 0, "mixed": 0, "notMeasured": 0}
    for record in records:
        verdict = record.get("verdict")
        if record.get("harnessError") or not verdict:
            tally["notMeasured"] += 1
        else:
            tally[{"OKAY": "ok", "ERROR": "error", "MIXED": "mixed"}.get(verdict["outcome"], "error")] += 1
    return tally


def _exit_code(records: list[dict[str, Any]]) -> int:
    """1 when any attempt was not measured, replaced or not; 0 otherwise."""
    return 1 if any(r.get("harnessError") for r in records) else 0


def _stop_message(provider: dict[str, Any]) -> str:
    return (
        f"\nStopping the run: the provider rejected model "
        f"{provider['model']!r} outright, so every remaining probe would "
        f"fail identically. Check the model in your config — the startup "
        f"banner above shows what was actually used."
    )


async def _run(args: argparse.Namespace) -> int:
    config = cfg.load_config(args.config)
    provider = cfg.provider_settings(config, model=args.model)
    max_steps = cfg.max_steps(config, override=args.max_steps)
    max_result_chars = cfg.max_result_chars(config)
    comparing = bool(args.targets)
    # D2 keeps a single run at 1; a comparison defaults to 3 (D43, plan §5.1).
    repeat = args.repeat or (COMPARE_DEFAULT_REPEAT if comparing else 1)

    if not provider["model"]:
        print("No model configured. Set provider.model in config.toml.", file=sys.stderr)
        return 2

    if not provider["api_key"]:
        print(
            f"No LLM API key: the config points api_key_env at "
            f"${provider['api_key_env']}, and that variable is unset or empty. "
            f"Export it (or change api_key_env in config.toml) and re-run. "
            f"Nothing was executed.",
            file=sys.stderr,
        )
        return 2

    try:
        names = _target_names(args) if comparing else [args.target]
        targets = [cfg.target_settings(config, name) for name in names]
        if comparing:
            for target in targets:
                cfg.target_platform(target)
    except (KeyError, ValueError) as exc:
        print(exc.args[0] if exc.args else exc, file=sys.stderr)
        return 2

    # `--interactive` exists for the UI: a run launched from Streamlit has no
    # TTY on stdin, so `is_headless()` would (correctly, for a script) decide no
    # human is present and turn the OAuth browser flow into `harnessError: auth`.
    # The caller is the one that knows a person is sitting there, so it says so.
    interactive = args.interactive or (not args.no_interactive and not is_headless())

    # Auth is resolved for every target the run will touch BEFORE the first
    # probe (D19), never lazily: once probe 1 starts no human is needed again,
    # and bad credentials surface in second 2 rather than minute 12.
    # Prove the model answers before anything else runs (same reasoning as D19
    # for auth): a dead model must not be discovered once per probe.
    try:
        await check_model(provider)
    except Exception as exc:  # noqa: BLE001
        print(
            f"\nThe configured model {provider['model']!r} did not answer:\n"
            f"  {_error_detail(exc)}\n"
            f"That is the effective provider.model, resolved from "
            f"{args.config or 'config.toml'} (or from --model). Fix it there. "
            f"Nothing was measured.",
            file=sys.stderr,
        )
        return 2

    settings = {
        "provider": provider,
        "max_steps": max_steps,
        "max_result_chars": max_result_chars,
        "repeat": repeat,
        "interactive": interactive,
    }
    if comparing:
        return await _run_compare(args, config, targets, **settings)
    return await _run_single(args, config, targets[0], **settings)


def _target_names(args: argparse.Namespace) -> list[str]:
    names = [n.strip() for n in args.targets.split(",") if n.strip()]
    if len(names) != 2 or len(set(names)) != 2:
        raise ValueError(
            f"--targets needs exactly two distinct targets (subject and reference), got {names}."
        )
    if args.subject and args.subject not in names:
        raise ValueError(f"--subject {args.subject!r} is not one of --targets {names}.")
    return names


def _open_target_run(
    *,
    run_id: str,
    run_dir: Path,
    started_at: dt.datetime,
    target: dict[str, Any],
    provider: dict[str, Any],
    max_steps: int,
    max_result_chars: int,
    repeat: int,
    suite: Suite,
    probes: list[Probe],
    server: dict[str, Any] | None,
    harness: dict[str, Any],
    concurrency: int,
    seed: int | None,
    compare_id: str | None,
    preflight_error: dict[str, Any] | None,
    platform: str | None = None,
) -> AttemptContext:
    """Write one target's run.json, open its event stream, print its banner."""
    _write_json(
        run_dir / "run.json",
        _run_header(
            run_id=run_id,
            started_at=started_at,
            target=target,
            provider=provider,
            max_steps=max_steps,
            max_result_chars=max_result_chars,
            suite=suite,
            harness=harness,
            server=server,
            repeat=repeat,
            concurrency=concurrency,
            seed=seed,
            compare_id=compare_id,
        ),
    )
    # The live stream (§6.5). Additive and never authoritative: `run.json` and
    # the probe files are the record, and if the two ever disagree the probe
    # file wins.
    events = EventWriter(run_dir / "events.ndjson")
    if events.disabled_reason:
        print(f"  (no event stream: {events.disabled_reason})", file=sys.stderr)
    events.emit(
        RUN_STARTED,
        runId=run_id,
        probes=len(probes),
        target=target["name"],
        model=provider["model"],
        suite=suite.path.name,
        maxSteps=max_steps,
        repeat=repeat,
    )

    # The effective configuration on screen, before the first probe, so a
    # misconfiguration is visible in second 1 rather than found afterwards in
    # the metadata. Same values as run.json. The API key is never printed —
    # only the name of the variable it came from.
    print(f"run {run_id} -> {run_dir}")
    if compare_id is None:
        print(f"  provider    {provider['name']}")
        print(f"  model       {provider['model']}")
        print(f"  base_url    {provider['base_url'] or '(vendor default)'}")
        print(f"  api key     from ${provider['api_key_env']}")
        print(f"  temperature {provider['temperature']}")
    print(f"  target      {target['name']} -> {target['url']} (auth={target.get('auth', 'bearer')})")
    if compare_id is None:
        print(f"  maxSteps    {max_steps}")
        print(f"  repeat      {repeat}")
        print(f"  maxResChars {max_result_chars}")
        print(f"  promptVer   {PROMPT_VERSION}")
        print(f"  suite       {suite.path.name} @ {suite.sha} ({len(probes)} probe(s))")
    print(f"  concurrency {concurrency}")
    if server and not server["error"]:
        info, cat = server["serverInfo"], server["catalogue"]
        # A server may omit either; say so rather than print "None None".
        identity = " ".join(v for v in (info.get("name"), info.get("version")) if v)
        print(f"  server      {identity or '(serverInfo without name/version)'} · "
              f"{cat['toolCount']} tools · catalogue {cat['sha'][:12]}")

    return AttemptContext(
        target=target,
        provider=provider,
        run_id=run_id,
        run_dir=run_dir,
        events=events,
        max_steps=max_steps,
        max_result_chars=max_result_chars,
        repeat=repeat,
        marker_prefix=compare_id or run_id,
        token_run_id=compare_id or run_id,
        preflight_error=preflight_error,
        tag=f"[{target['name']}] " if compare_id else "",
        platform=platform,
    )


@dataclass
class TargetPlan:
    """What one target will actually run of a suite (suite v2, D45/D49)."""

    runnable: list[Probe]
    not_possible: list[dict[str, Any]]
    problems: list[str]


def plan_target(suite: Suite, probes: list[Probe], platform: str | None,
                server: dict[str, Any] | None) -> TargetPlan:
    """Resolve every probe for one target's platform and check its declarations.

    - A v1 suite runs as it always has: every probe, unchanged.
    - A v2 probe with no block for this platform is a PROBLEM (the run is
      refused): every task verifies on every platform it runs on (plan §5.3).
    - A `notPossible` block is checked against the live tools/list (D49): any
      `missingTools` entry that the catalogue now has makes the declaration
      `invalidDeclaration` (a vendor update cannot keep awarding a loss); no
      `missingTools` at all is `unchecked`; otherwise `ok`. No attempt runs.
    """
    if suite.schema_version < 2:
        return TargetPlan(list(probes), [], [])
    live = set((server or {}).get("tools") or [])
    catalogue_sha = ((server or {}).get("catalogue") or {}).get("sha")
    plan = TargetPlan([], [], [])
    for probe in probes:
        try:
            resolved = probe.for_platform(platform)
        except KeyError as exc:
            plan.problems.append(exc.args[0])
            continue
        if resolved.not_possible is None:
            plan.runnable.append(resolved)
            continue
        declared = resolved.not_possible
        present = sorted(t for t in declared.missing_tools if t in live)
        check = "unchecked" if not declared.missing_tools else (
            "invalidDeclaration" if present else "ok")
        plan.not_possible.append({
            "schemaVersion": RUN_SCHEMA_VERSION,
            "probeId": probe.id,
            "platform": platform,
            "outcome": "notPossible",
            "declaration": declared.to_json(),
            "catalogueSha": catalogue_sha,
            "check": check,
            "presentTools": present,
        })
    return plan


def prompt_problems(probes: list[Probe], servers: list[dict[str, Any] | None]) -> list[str]:
    """v2 prompts that name a tool of ANY compared target's live catalogue (plan §5.3)."""
    names = set()
    for server in servers:
        names.update((server or {}).get("tools") or [])
    problems = []
    for probe in probes:
        if probe.platforms is None:
            continue
        mentions = prompt_tool_mentions(probe.prompt, names)
        if mentions:
            problems.append(f"Probe {probe.id!r}: the shared prompt names live tool(s) {mentions}.")
    return problems


def _write_not_possible(ctx: AttemptContext, plan: TargetPlan) -> None:
    for record in plan.not_possible:
        _write_json(ctx.run_dir / "probes" / record["probeId"] / "not-possible.json", record)
        note = {"ok": "", "unchecked": " (unchecked: no missingTools)",
                "invalidDeclaration": f" — INVALID: {record['presentTools']} now exist"}[record["check"]]
        print(f"  {ctx.tag}{record['probeId']}: not possible on {record['platform']} "
              f"({record['declaration']['kind']}){note}")


#: Baseline records a comparison cannot run on (plan §5.4: a mismatch stops it).
_BASELINE_BROKEN = ("missing", "duplicated", "changed")


async def _assess_target(target: dict[str, Any], platform: str | None, server: dict[str, Any] | None,
                         suite: Suite, *, freshness: bool) -> tuple[dict[str, Any] | None,
                                                                    dict[str, Any] | None, str | None]:
    """Preflight step 4 (plan §5.2): the baseline read back and the freshness checks (S6, D50).

    Returns (baseline, freshness, error). `error` stops the run: a baseline
    record missing, duplicated or changed, a fixture without this platform,
    a bad checklist, a session that failed. A non-fresh environment is NOT an
    error — the comparison runs and is reported unofficial.
    """
    fixture = suite.fixture
    if fixture is not None and platform not in fixture.platforms:
        return None, None, f"fixture {fixture.name!r} declares no platform {platform!r}"
    try:
        checklist = fixtures.load_checklist(platform) if freshness and platform else None
    except ValueError as exc:
        return None, None, str(exc)
    manifest = fixtures.read_manifest(target["name"])
    baseline = fresh = None
    try:
        async with mcp_session(target) as session:
            async def call(tool: str, args: dict[str, Any]) -> Any:
                return await call_tool(session, tool, args)

            live = set((server or {}).get("tools") or [])
            if fixture is not None:
                baseline = await fixtures.verify_baseline(fixture, platform, call, manifest, tools=live)
            if freshness:
                fresh = await fixtures.assess_freshness(
                    checklist, call=call, tools=live, target=target,
                    fixture=fixture, baseline=baseline, manifest=manifest, now=_now_ms())
    except Exception as exc:  # noqa: BLE001 - the session itself failed: nothing is known
        return None, None, f"baseline/freshness read failed: {type(exc).__name__}: {exc}"
    if baseline:
        broken = [f"{rec} {r['status']} ({r['detail']})" for rec, r in baseline["records"].items()
                  if r["status"] in _BASELINE_BROKEN]
        if broken:
            return baseline, fresh, ("the baseline does not hold: " + "; ".join(broken)
                                     + " — re-initialize and run `make mcp-seed`")
    return baseline, fresh, None


def _bind_fixture(suite: Suite, plan: TargetPlan, baseline: dict[str, Any] | None) -> str | None:
    """Resolve `{{fixture.*}}` in every runnable probe for this target; an error message or None."""
    if suite.fixture is None:
        return None
    table = suite.fixture.table((baseline or {}).get("ids") or {})
    try:
        plan.runnable[:] = [fixtures.resolve(p, table) for p in plan.runnable]
    except fixtures.FixtureError as exc:
        return f"{exc} — the record has no id here (not seeded? run `make mcp-seed`)"
    return None


def _finish_target(ctx: AttemptContext, outcome: TargetOutcome) -> None:
    ctx.events.emit(RUN_FINISHED, **_tally(outcome.records))
    ctx.events.close()


async def _run_single(
    args: argparse.Namespace,
    config: dict[str, Any],
    target: dict[str, Any],
    *,
    provider: dict[str, Any],
    max_steps: int,
    max_result_chars: int,
    repeat: int,
    interactive: bool,
) -> int:
    """One target, as `make mcp-test` has always run it.

    Auth failure here is NOT fatal: the run still executes so the reason is
    written down per probe and every probe reports "not measured" (D12).
    """
    preflight_error: dict[str, Any] | None = None
    try:
        preflight(
            target,
            interactive=interactive,
            on_authorize_url=_open_browser,
            wait=args.auth_wait,
        )
    except AuthError as exc:
        print(f"  preflight auth failed for target {target['name']!r}: {exc}", file=sys.stderr)
        if args.login:
            return 2
        preflight_error = {"kind": "auth", "phase": "preflight", "detail": f"preflight: {exc}"}

    if args.login:
        print(f"target {target['name']!r}: authenticated.")
        return 0

    suite = load_suite(_resolve_suite_path(args.suite))
    probes = [suite.probe(args.probe)] if args.probe else list(suite.probes)

    # What the target says it is, and its tool catalogue, read once before the
    # first probe (plan §6). Skipped when auth already failed: there is no
    # session to open, and every probe will say so.
    server = None if preflight_error else await _describe_target(target)
    if server and server["error"]:
        print(f"  (server identity not read: {server['error']['detail']})", file=sys.stderr)

    platform = None
    if suite.schema_version >= 2:
        # A v2 suite cannot be run blind: its platform blocks, its notPossible
        # checks and its prompt lint all need the target's platform AND its
        # live catalogue. So here the soft rule does not apply (D45, D49).
        try:
            platform = cfg.target_platform(target)
        except ValueError as exc:
            print(exc.args[0], file=sys.stderr)
            return 2
        if preflight_error or not server or server["error"]:
            why = (preflight_error or (server or {}).get("error") or {}).get("detail", "no catalogue")
            print(f"A v2 suite needs the target's live catalogue: {why}. Nothing was measured.",
                  file=sys.stderr)
            return 2
    plan = plan_target(suite, probes, platform, server)
    problems = plan.problems + prompt_problems(probes, [server])
    if not problems and suite.fixture is not None:
        baseline, _fresh, error = await _assess_target(target, platform, server, suite, freshness=False)
        error = error or _bind_fixture(suite, plan, baseline)
        if error:
            problems.append(error)
    if problems:
        print("Suite refused for this target:\n  " + "\n  ".join(problems), file=sys.stderr)
        return 2

    started_at = dt.datetime.now(dt.timezone.utc)
    run_id = _new_run_id(target["name"], started_at)
    run_dir = RUNS_DIR / run_id
    # A plain mcp-test stays sequential unless asked on the command line:
    # `run.concurrency` is the comparison's setting, not this one's (D44).
    concurrency = args.concurrency or 1
    ctx = _open_target_run(
        run_id=run_id, run_dir=run_dir, started_at=started_at, target=target,
        provider=provider, max_steps=max_steps, max_result_chars=max_result_chars,
        repeat=repeat, suite=suite, probes=plan.runnable, server=server,
        harness=_harness_revision(), concurrency=concurrency, seed=args.seed,
        compare_id=None, preflight_error=preflight_error, platform=platform,
    )
    _write_not_possible(ctx, plan)
    outcome = await run_target(ctx, plan.runnable, concurrency=concurrency, seed=args.seed)
    _finish_target(ctx, outcome)
    if outcome.stopped:
        print(_stop_message(provider), file=sys.stderr)
    else:
        print(f"done: {run_dir}")
    return _exit_code(outcome.records)


async def _run_compare(
    args: argparse.Namespace,
    config: dict[str, Any],
    targets: list[dict[str, Any]],
    *,
    provider: dict[str, Any],
    max_steps: int,
    max_result_chars: int,
    repeat: int,
    interactive: bool,
) -> int:
    """Two targets, one compareId, run concurrently (D44, plan §5.2).

    Preflight covers EVERY target before the first attempt — auth, then the
    server identity and catalogue — and any failure aborts the whole
    comparison with exit 2 and nothing written: a one-sided comparison cannot
    produce a winner, and a missing catalogue sha is a missing pin. (A single
    `mcp-test` keeps its softer rule: auth failure becomes per-probe "not
    measured".)
    """
    if args.login:
        print("--login takes one --target, not --targets.", file=sys.stderr)
        return 2
    suite = load_suite(_resolve_suite_path(args.suite))
    probes = [suite.probe(args.probe)] if args.probe else list(suite.probes)
    try:
        rule.resolve_parameters(suite.decision)
    except rule.RuleMismatch as exc:
        print(f"suite {suite.path.name}: {exc}", file=sys.stderr)
        return 2

    # MUST stay before the pool starts: the OAuth browser flow blocks the event
    # loop while it waits for the callback, which would stall every attempt in
    # flight on every target (D19 + D44).
    for target in targets:
        try:
            preflight(target, interactive=interactive, on_authorize_url=_open_browser,
                      wait=args.auth_wait)
        except AuthError as exc:
            print(f"Comparison aborted: preflight auth failed for target {target['name']!r}: {exc}\n"
                  f"Nothing was measured.", file=sys.stderr)
            return 2
    servers = await asyncio.gather(*(_describe_target(t) for t in targets))
    for target, server in zip(targets, servers):
        if server["error"]:
            print(f"Comparison aborted: could not read target {target['name']!r} "
                  f"({server['error']['detail']}). Nothing was measured.", file=sys.stderr)
            return 2
    plans = [plan_target(suite, probes, cfg.target_platform(t), srv) for t, srv in zip(targets, servers)]
    problems = [f"[{t['name']}] {p}" for t, plan in zip(targets, plans) for p in plan.problems]
    problems += prompt_problems(probes, servers)
    if problems:
        print("Comparison aborted, the suite is not runnable as declared:\n  " + "\n  ".join(problems),
              file=sys.stderr)
        return 2
    assessed = await asyncio.gather(*(
        _assess_target(t, cfg.target_platform(t), srv, suite, freshness=True) for t, srv in zip(targets, servers)
    ))
    for target, plan, (baseline, _fresh, error) in zip(targets, plans, assessed):
        error = error or _bind_fixture(suite, plan, baseline)
        if error:
            print(f"Comparison aborted: target {target['name']!r}: {error}. Nothing was measured.",
                  file=sys.stderr)
            return 2

    started_at = dt.datetime.now(dt.timezone.utc)
    compare_id = _new_compare_id(started_at)
    compare_dir = RUNS_DIR / compare_id
    seed = args.seed if args.seed is not None else secrets.randbelow(2**31)
    concurrency = cfg.concurrency(config, override=args.concurrency, default=COMPARE_DEFAULT_CONCURRENCY)
    subject = args.subject or targets[0]["name"]
    harness = _harness_revision()

    contexts = []
    target_meta = []
    for target, server, plan, (baseline, fresh, _e) in zip(targets, servers, plans, assessed):
        k = cfg.target_concurrency(target, concurrency)
        run_id = f"{compare_id}-{target['name']}"
        ctx = _open_target_run(
            run_id=run_id, run_dir=compare_dir / "targets" / target["name"],
            started_at=started_at, target=target, provider=provider, max_steps=max_steps,
            max_result_chars=max_result_chars, repeat=repeat, suite=suite, probes=plan.runnable,
            server=server, harness=harness, concurrency=k, seed=seed,
            compare_id=compare_id, preflight_error=None,
            platform=cfg.target_platform(target) if suite.schema_version >= 2 else None,
        )
        _write_not_possible(ctx, plan)
        contexts.append((ctx, k, plan))
        target_meta.append({
            "name": target["name"],
            "platform": cfg.target_platform(target),
            "url": target["url"],
            "runId": run_id,
            "concurrency": k,
            # D50, plan §5.9: only `fresh` on every target is official.
            "freshness": fresh,
            "fixtureHash": (baseline or {}).get("fixtureHash"),
        })
        print(f"  [{target['name']}] freshness {fresh['status']}"
              + (f" ({len(fresh['unverifiable'])} not verifiable: tool not offered)"
                 if fresh.get("unverifiable") else "")
              + (f" · baseline {baseline['status']} {baseline['fixtureHash']}" if baseline else ""))

    record = _compare_record(
        compare_id=compare_id, started_at=_now_ms(), subject=subject, repeat=repeat,
        suite=suite, probes=probes, seed=seed, concurrency=concurrency, provider=provider,
        max_steps=max_steps, max_result_chars=max_result_chars, harness=harness,
        targets=target_meta,
    )
    _write_json(compare_dir / "compare.json", record)
    print(f"compare {compare_id} -> {compare_dir}")
    print(f"  model {provider['model']} · repeat {repeat} · seed {seed} · subject {subject} · "
          f"suite {suite.path.name} @ {suite.sha} ({len(probes)} probe(s))")

    stop = asyncio.Event()
    outcomes = await asyncio.gather(*(
        run_target(ctx, plan.runnable, concurrency=k, seed=seed, stop=stop) for ctx, k, plan in contexts
    ))
    for (ctx, _k, _plan), outcome in zip(contexts, outcomes):
        _finish_target(ctx, outcome)

    record["finishedAt"] = _now_ms()
    _write_json(compare_dir / "compare.json", record)
    if any(o.stopped for o in outcomes):
        print(_stop_message(provider), file=sys.stderr)
    else:
        print(f"done: {compare_dir}")

    # mcp-compare ends with the report (plan §5.6); `make mcp-report` re-derives
    # it from the same files at any time. A report failure never loses the run.
    if not args.no_report:
        from . import report

        try:
            summary = report.write_summary(compare_dir)
            print(f"  summary  {'official' if summary['official'] else 'UNOFFICIAL'} -> "
                  f"{compare_dir / 'summary.md'}")
        except Exception as exc:  # noqa: BLE001
            print(f"  (summary not written: {type(exc).__name__}: {exc}; "
                  f"re-run `make mcp-report RUN={compare_id}`)", file=sys.stderr)
    return _exit_code([r for o in outcomes for r in o.records])


def _compare_record(
    *,
    compare_id: str,
    started_at: str,
    subject: str,
    repeat: int,
    suite: Suite,
    probes: list[Probe],
    seed: int,
    concurrency: int,
    provider: dict[str, Any],
    max_steps: int,
    max_result_chars: int,
    harness: dict[str, Any],
    targets: list[dict[str, Any]],
) -> dict[str, Any]:
    """`compare.json` (plan §5.2, §6): what groups the target runs, and the pins.

    Per-target pins (url, serverInfo, catalogue, model served …) live in each
    target's run.json, where the report reads them. Everything under `pins`
    must be equal for two comparisons to be a stability pair — the seed
    included, so run B is started with `--seed` of run A.
    """
    return {
        "compareSchemaVersion": COMPARE_SCHEMA_VERSION,
        "compareId": compare_id,
        "startedAt": started_at,
        "finishedAt": None,
        "subject": subject,
        "repeat": repeat,
        # The suite's `decision:` block, verbatim (D47); null = rule defaults.
        "decision": suite.decision,
        "suite": {"file": suite.path.name, "sha": suite.sha, "window": suite.window,
                  "schemaVersion": suite.schema_version},
        "probes": [p.id for p in probes],
        "schedule": {"seed": seed, "concurrency": concurrency},
        "pins": {
            "harness": harness,
            "provider": provider["name"],
            "model": provider["model"],
            "temperature": provider["temperature"],
            "promptVersion": PROMPT_VERSION,
            "verdictSchemaVersion": VERDICT_SCHEMA_VERSION,
            "runSchemaVersion": RUN_SCHEMA_VERSION,
            "ruleVersion": rule.RULE_VERSION,
            "maxSteps": max_steps,
            "maxResultChars": max_result_chars,
            "repeat": repeat,
            "seed": seed,
            "suiteSha": suite.sha,
            "suiteSchemaVersion": suite.schema_version,
            "matcherVersion": MATCHER_VERSION,
            # Ids excluded (plan §5.4): equal across a re-initialized pair that
            # holds the same baseline. Freshness itself is checked apart.
            "fixture": {"name": suite.fixture.name, "sha": suite.fixture.sha} if suite.fixture else None,
            "fixtureHashes": {t["name"]: t.get("fixtureHash") for t in targets},
        },
        "targets": targets,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mcp-test", description=__doc__)
    parser.add_argument("--target", default="local", help="Target name from config (default: local)")
    parser.add_argument(
        "--targets",
        help="Compare two targets, e.g. local,holded (D44). One compareId, one run per "
        "target under runs/<compareId>/targets/, run concurrently. Every target needs "
        "`platform` in config.",
    )
    parser.add_argument(
        "--subject", help="With --targets: the side whose win rate is the KR (default: the first)"
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        help="Attempts in flight per target (D44). With --targets: default run.concurrency, "
        "else 4. Without: default 1 (run.concurrency is ignored). A target's own "
        "`concurrency` caps it lower.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        help="Shuffle the attempt order with this seed (recorded). Random by default with "
        "--targets; without it a single run keeps suite order. Reuse a run's seed to "
        "make a stability pair.",
    )
    parser.add_argument(
        "--no-report",
        action="store_true",
        help="With --targets: skip summary.json/summary.md at the end (make mcp-report later).",
    )
    parser.add_argument(
        "--suite", help="Suite file or bare name, e.g. sales-order (not needed with --login)"
    )
    parser.add_argument(
        "--login",
        action="store_true",
        help="Authenticate the target and exit. A convenience to pre-warm or "
        "deliberately re-authenticate — never a prerequisite for a run.",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Force the interactive OAuth flow even without a TTY. For callers "
        "that know a human is present (the Streamlit UI), where headless "
        "auto-detection would otherwise refuse to open a browser.",
    )
    parser.add_argument(
        "--no-interactive",
        action="store_true",
        help="Never open a browser. A missing or unrefreshable token becomes "
        "harnessError: auth and the run reports 'not measured'. Auto-detected "
        "when headless (no TTY, no DISPLAY, or CI=1).",
    )
    parser.add_argument(
        "--auth-wait",
        type=int,
        default=DEFAULT_AUTH_WAIT,
        help=f"Seconds to wait for the OAuth callback (default {DEFAULT_AUTH_WAIT}).",
    )
    parser.add_argument("--probe", help="Run only this probe id (default: every probe in the suite)")
    parser.add_argument(
        "--model",
        help="Explicit override of provider.model from the config. The only "
        "model override there is: no ambient environment variable wins over "
        "the config file.",
    )
    parser.add_argument("--max-steps", type=int, help="Override the per-probe agent loop cap")
    parser.add_argument(
        "--repeat",
        type=int,
        help="Measured attempts per probe (D43; default 1, or 3 with --targets). Each attempt is a fresh "
        "session, conversation and {{marker}}. An attempt with a harness error is "
        "kept and replaced, at most REPEAT replacements per probe.",
    )
    parser.add_argument("--config", help="Path to config.toml")
    args = parser.parse_args(argv)
    if args.interactive and args.no_interactive:
        parser.error("--interactive and --no-interactive contradict each other")
    if not args.suite and not args.login:
        parser.error("--suite is required unless --login is given")
    if args.repeat is not None and args.repeat < 1:
        parser.error("--repeat must be at least 1")
    if args.concurrency is not None and args.concurrency < 1:
        parser.error("--concurrency must be at least 1")
    if args.subject and not args.targets:
        parser.error("--subject needs --targets")
    return asyncio.run(_run(args))


if __name__ == "__main__":
    raise SystemExit(main())
