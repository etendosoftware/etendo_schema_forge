"""Entry point for the MCP test harness (vertical slice).

    python -m runner.cli --target local --suite sales-order --probe <id>

Auth per target is `bearer` or `oauth` (authorization code + PKCE), resolved at
preflight before the first probe.

Each run writes `run.json`, one `probes/<id>.json` per probe, and the live
`events.ndjson` stream (§6.5) that the optional Streamlit UI (`make mcp-ui`)
tails. The UI is a separate process that shells out to this CLI: nothing here
knows it exists (D11).

Still out of scope: redaction, REPEAT, metrics derivation and summary.md.
"""

from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import json
import secrets
import sys
import traceback
import webbrowser
from pathlib import Path
from typing import Any

from . import config as cfg
from .agent import PROMPT_VERSION, ProbeAborted, check_model, run_probe
from .events import (
    EFFECT_CHECKED,
    PROBE_ABORTED,
    PROBE_FINISHED,
    PROBE_STARTED,
    RUN_FINISHED,
    RUN_STARTED,
    EventWriter,
)
from .mcp_client import (
    DEFAULT_AUTH_WAIT,
    AuthError,
    VerificationError,
    call_tool,
    count_rows,
    is_headless,
    mcp_session,
    preflight,
)
from .suite import Probe, Suite, interpolate, interpolate_args, load_suite

HARNESS_ROOT = Path(__file__).resolve().parent.parent
SUITES_DIR = HARNESS_ROOT / "suites"
RUNS_DIR = HARNESS_ROOT / "runs"

#: v2 adds `id`, `result`, `resultBytes` and `resultTruncated` to every entry of
#: `toolCalls[]`, and makes a partial `toolCalls[]` survive a crashed probe. The
#: keys are additive, but a consumer computing payload metrics (§6.6) must be
#: able to tell "results were never recorded" from "the results were empty", and
#: only the version says which.
RUN_SCHEMA_VERSION = 2


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
    """HTTP status of a provider error, when it carries one."""
    for attr in ("status_code", "http_status", "code"):
        value = getattr(exc, attr, None)
        if isinstance(value, int):
            return value
    return None


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
) -> dict[str, Any]:
    return {
        "schemaVersion": RUN_SCHEMA_VERSION,
        "runId": run_id,
        "startedAt": started_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "target": {"name": target["name"], "url": target["url"]},
        # Not resolved in this slice: the .go build id lives in the other repo (D1).
        "serverBuild": None,
        "provider": provider["name"],
        "model": provider["model"],
        "temperature": provider["temperature"],
        "promptVersion": PROMPT_VERSION,
        "maxSteps": max_steps,
        "maxResultChars": max_result_chars,
        "repeat": 1,
        "suites": [{"file": suite.path.name, "sha": suite.sha}],
    }


async def _verify_effect(
    probe: Probe,
    target: dict[str, Any],
    *,
    run_id: str,
    timestamp: str,
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
        effect.args, run_id=run_id, probe_id=probe.id, timestamp=timestamp
    )
    try:
        # A session of its own, so nothing the agent's session held can reach it.
        async with mcp_session(target) as session:
            payload = await call_tool(session, effect.tool, call_args)
            rows = count_rows(payload)
    except AuthError as exc:
        return None, None, {"kind": "auth", "detail": f"effect check: {exc}"}
    except VerificationError as exc:
        return None, None, {"kind": "verification", "detail": str(exc)}
    except Exception as exc:  # noqa: BLE001
        return None, None, {
            "kind": "verification",
            "detail": f"effect check: {type(exc).__name__}: {exc}",
        }

    verified = rows >= 1 if effect.expect == "atLeastOne" else rows == 0
    detail = {"tool": effect.tool, "args": call_args, "expect": effect.expect, "rows": rows}
    return verified, detail, None


async def _run(args: argparse.Namespace) -> int:
    config = cfg.load_config(args.config)
    provider = cfg.provider_settings(config, model=args.model)
    max_steps = cfg.max_steps(config, override=args.max_steps)
    max_result_chars = cfg.max_result_chars(config)

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
        target = cfg.target_settings(config, args.target)
    except KeyError as exc:
        print(exc, file=sys.stderr)
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
        # Not a product defect (D12): the run still executes so the reasons are
        # written down per probe, and every probe reports "not measured".
        preflight_error = {"kind": "auth", "detail": f"preflight: {exc}"}

    if args.login:
        print(f"target {target['name']!r}: authenticated.")
        return 0

    suite = load_suite(_resolve_suite_path(args.suite))
    probes = [suite.probe(args.probe)] if args.probe else list(suite.probes)

    started_at = dt.datetime.now(dt.timezone.utc)
    run_id = _new_run_id(target["name"], started_at)
    run_dir = RUNS_DIR / run_id

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
        ),
    )
    # The effective configuration on screen, before the first probe, so a
    # misconfiguration is visible in second 1 rather than found afterwards in
    # the metadata. Same values as run.json. The API key is never printed —
    # only the name of the variable it came from.
    # The live stream (§6.5). Additive and never authoritative: `run.json` and
    # `probes/<id>.json` are the record, and if the two ever disagree the probe
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
    )

    print(f"run {run_id} -> {run_dir}")
    print(f"  provider    {provider['name']}")
    print(f"  model       {provider['model']}")
    print(f"  base_url    {provider['base_url'] or '(vendor default)'}")
    print(f"  api key     from ${provider['api_key_env']}")
    print(f"  temperature {provider['temperature']}")
    print(f"  target      {target['name']} -> {target['url']} (auth={target.get('auth', 'bearer')})")
    print(f"  maxSteps    {max_steps}")
    print(f"  maxResChars {max_result_chars}")
    print(f"  promptVer   {PROMPT_VERSION}")
    print(f"  suite       {suite.path.name} @ {suite.sha} ({len(probes)} probe(s))")

    exit_code = 0
    tally = {"ok": 0, "error": 0, "mixed": 0, "notMeasured": 0}

    def finish_run() -> None:
        events.emit(RUN_FINISHED, **tally)
        events.close()

    for probe in probes:
        timestamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        prompt = interpolate(
            probe.prompt, run_id=run_id, probe_id=probe.id, timestamp=timestamp
        )
        print(f"  probe {probe.id} ({probe.mode}) ...", flush=True)
        events.emit(PROBE_STARTED, probe=probe.id, attempt=1, mode=probe.mode)
        # The agent never learns which probe it is running: the probe id is
        # stamped on here, by the owner of the stream.
        on_event = lambda t, fields: events.emit(t, probe=probe.id, **fields)  # noqa: E731

        result: dict[str, Any] = {
            "schemaVersion": RUN_SCHEMA_VERSION,
            "runId": run_id,
            "probeId": probe.id,
            "mode": probe.mode,
            "prompt": prompt,
            "startedAt": timestamp,
            # Third axis, alongside outcome and harnessError. None = not checked
            # or not verifiable; never conflated with "verified absent".
            "effectVerified": None,
            "effectCheck": None,
        }

        if preflight_error:
            result["harnessError"] = preflight_error
            result["verdict"] = None
            result["finishedAt"] = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            _write_json(run_dir / "probes" / f"{probe.id}.json", result)
            events.emit(PROBE_ABORTED, probe=probe.id, kind="auth", detail=preflight_error["detail"], toolCalls=0)
            tally["notMeasured"] += 1
            print("    not measured (auth)", file=sys.stderr)
            exit_code = 1
            continue

        try:
            # A fresh MCP session per probe: probes are fully independent (§3).
            async with mcp_session(target) as session:
                outcome = await run_probe(
                    session=session,
                    provider=provider,
                    prompt=prompt,
                    max_steps=max_steps,
                    max_result_chars=max_result_chars,
                    on_event=on_event,
                )
            result.update(outcome)
            # harnessError is a separate axis from outcome (D12). Classification
            # of failure kinds is not built in this slice; the field exists so
            # the file shape is already right.
            result["harnessError"] = None
            verdict = result["verdict"]
            print(
                f"    {verdict['outcome']} · {result['toolCallCount']} tool calls · "
                f"{verdict['summary']}"
            )

            verified, detail, check_error = await _verify_effect(
                probe, target, run_id=run_id, timestamp=timestamp
            )
            result["effectVerified"] = verified
            result["effectCheck"] = detail
            if check_error:
                result["harnessError"] = check_error
                print(f"    effect NOT VERIFIABLE: {check_error['detail']}", file=sys.stderr)
            elif verified is False:
                # The headline case this amendment exists for.
                claim = " despite the agent reporting OKAY" if verdict["outcome"] == "OKAY" else ""
                print(f"    effect ABSENT{claim} ({detail['tool']} -> {detail['rows']} rows)")
            elif verified is True:
                print(f"    effect verified ({detail['tool']} -> {detail['rows']} rows)")

            events.emit(
                PROBE_FINISHED,
                probe=probe.id,
                outcome=verdict["outcome"],
                steps=result["toolCallCount"],
                exhausted=result.get("exhausted", False),
            )
            if probe.expect_effect is not None:
                events.emit(
                    EFFECT_CHECKED,
                    probe=probe.id,
                    verified=verified,
                    rows=None if detail is None else detail.get("rows"),
                )
            tally[{"OKAY": "ok", "ERROR": "error", "MIXED": "mixed"}.get(verdict["outcome"], "error")] += 1
        except AuthError as exc:
            result["harnessError"] = {"kind": "auth", "detail": str(exc)}
            result["verdict"] = None
            events.emit(PROBE_ABORTED, probe=probe.id, kind="auth", detail=str(exc), toolCalls=0)
            tally["notMeasured"] += 1
            print(f"    not measured (auth): {exc}", file=sys.stderr)
            exit_code = 1
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
                "kind": "provider",
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
            events.emit(
                PROBE_ABORTED, probe=probe.id, kind="provider", detail=detail, toolCalls=salvaged
            )
            tally["notMeasured"] += 1
            print(f"    not measured: {detail}{salvage_note}", file=sys.stderr)
            exit_code = 1
            if _is_provider_config_error(cause):
                result["finishedAt"] = dt.datetime.now(dt.timezone.utc).strftime(
                    "%Y-%m-%dT%H:%M:%SZ"
                )
                _write_json(run_dir / "probes" / f"{probe.id}.json", result)
                finish_run()
                print(
                    f"\nStopping the run: the provider rejected model "
                    f"{provider['model']!r} outright, so every remaining probe would "
                    f"fail identically. Check the model in your config — the startup "
                    f"banner above shows what was actually used.",
                    file=sys.stderr,
                )
                return exit_code

        result["finishedAt"] = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        _write_json(run_dir / "probes" / f"{probe.id}.json", result)

    finish_run()
    print(f"done: {run_dir}")
    return exit_code


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mcp-test", description=__doc__)
    parser.add_argument("--target", default="local", help="Target name from config (default: local)")
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
    parser.add_argument("--config", help="Path to config.toml")
    args = parser.parse_args(argv)
    if args.interactive and args.no_interactive:
        parser.error("--interactive and --no-interactive contradict each other")
    if not args.suite and not args.login:
        parser.error("--suite is required unless --login is given")
    return asyncio.run(_run(args))


if __name__ == "__main__":
    raise SystemExit(main())
