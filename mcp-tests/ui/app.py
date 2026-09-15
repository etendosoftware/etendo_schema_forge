"""The optional Streamlit panel (design §9). `make mcp-ui`.

Strictly optional and strictly a spectator: it starts runs by shelling out to
the same CLI a human would type, and follows them by tailing `events.ndjson`
(D11). It holds no state of its own, and the runner does not know it exists.

Not in v1, on purpose (§9): run comparison (D16), editing suites, auth
management, remote hosting.
"""

from __future__ import annotations

import datetime as dt
import json
import sys
import time
from pathlib import Path

import streamlit as st

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from runner.suite import load_suite  # noqa: E402  (reading suites, never executing)
from ui import runs as runs_lib  # noqa: E402
from ui.launch import HARNESS_ROOT, RUNS_DIR, UI_LOG_DIR, build_command, launch, read_log  # noqa: E402

SUITES_DIR = HARNESS_ROOT / "suites"
CONFIG = HARNESS_ROOT / "config.toml"
POLL_SECONDS = 2

st.set_page_config(page_title="MCP test harness", page_icon="🧪", layout="wide")


# --- shared helpers ----------------------------------------------------------


#: The one target that cannot touch anybody else's data. It is the default
#: selection whenever the config defines it, because the cost of the two
#: mistakes is not symmetric: running locally when you meant remote wastes a
#: minute, running remote when you meant local writes sales orders onto a server
#: other people share.
SAFE_TARGET = "local"


def _targets() -> list[str]:
    """Target names in the order `config.toml` writes them.

    NOT sorted. `tomllib` preserves insertion order, and that order is the
    author's intent — `config.toml` lists `local` first on purpose. Sorting threw
    that away and opened the selectbox on `experimental`, a shared remote server.
    """
    try:
        import tomllib

        path = CONFIG if CONFIG.exists() else HARNESS_ROOT / "config.example.toml"
        return list(tomllib.loads(path.read_text(encoding="utf-8")).get("targets", {})) or [SAFE_TARGET]
    except Exception:  # noqa: BLE001 - a UI must not die on a malformed config
        return [SAFE_TARGET]


def _default_target_index(names: list[str]) -> int:
    """Belt and braces with `_targets`' ordering: even a config that lists
    something else first opens on the local target when there is one."""
    return names.index(SAFE_TARGET) if SAFE_TARGET in names else 0


def run_status(counts: dict[str, int]) -> tuple[str, str]:
    """(level, text) for a finished run, derived from the COUNTS.

    Never from "the run reached run_finished": a run that measured nothing
    reached it too, and rendering that green claims a success that did not
    happen.

    Precedence, most severe first — note that it resolves a real ambiguity: an
    aborted probe is both "a probe that failed" (red) and "partially unmeasured"
    (amber). A run where nothing at all was measured is red; a run that measured
    some probes and lost others is amber, because the measured part is real.
    """
    ok = counts.get("ok", 0)
    error = counts.get("error", 0)
    mixed = counts.get("mixed", 0)
    not_measured = counts.get("notMeasured", 0)
    text = f"{ok} ok · {error} error · {mixed} mixed · {not_measured} not measured"
    if error:
        return "error", text
    if not_measured and not (ok or mixed):
        return "error", text
    if not_measured or mixed:
        return "warning", text
    if ok:
        return "success", text
    return "warning", text


def _suite_files() -> list[Path]:
    return sorted(p for p in SUITES_DIR.glob("*.y*ml"))


def _outcome_color(label: str) -> str:
    return {
        "OKAY": "green",
        "MIXED": "orange",
        "ERROR": "red",
        "aborted": "red",
        "not measured": "gray",
        "no verdict": "gray",
        "running": "blue",
    }.get(label, "gray")


def render_verdict(verdict: dict) -> None:
    """Render one verdict-shaped object (§6.3).

    ONE renderer, two callers: a probe's own verdict and the arguments of a
    `neo_feedback` call, which carry the same schema on purpose (D27). A second
    renderer for one schema is how two renderings drift apart.

    Total by construction: every field is optional at read time and a malformed
    entry is shown rather than raised on. This renders data written by an agent,
    which is exactly the input that cannot be assumed well-formed.
    """
    outcome = verdict.get("outcome")
    if outcome:
        st.markdown(f":{_outcome_color(outcome)}[**{outcome}**]")
    if verdict.get("summary"):
        st.write(verdict["summary"])
    if verdict.get("achieved"):
        st.caption(verdict["achieved"])

    # Verdict schema v2. Absent on every v1 verdict in `runs/`, and absent
    # whenever the model declined to answer, so each one renders only when it is
    # there — never as an empty heading.
    if verdict.get("plannedApproach"):
        st.markdown("**Planned approach**")
        st.markdown(verdict["plannedApproach"])
        # Said next to the value, not only in the schema: this is recall after
        # the fact, not the plan. Read it against the transcript below.
        st.caption("recalled after the task, not recorded at the time")
    if verdict.get("howKnown"):
        st.markdown(f"**How that was known** — {verdict['howKnown']}")

    frictions = [f for f in (verdict.get("frictions") or []) if isinstance(f, dict)]
    if frictions:
        st.markdown("**Frictions**")
        for friction in frictions:
            st.markdown(
                f"- *{friction.get('phase')}* — {friction.get('what')} "
                f"(cost: {friction.get('cost')})"
            )

    failures = [f for f in (verdict.get("failures") or []) if isinstance(f, dict)]
    if failures:
        st.markdown("**Failures**")
        for failure in failures:
            recovered = " · recovered" if failure.get("recovered") else ""
            st.markdown(f"- `{failure.get('tool')}` — {failure.get('error')}{recovered}")
            if failure.get("howRecovered"):
                st.caption(failure["howRecovered"])
            st.code(
                json.dumps(failure.get("payload", {}), indent=2, ensure_ascii=False),
                language="json",
            )

    wasted = [w for w in (verdict.get("wastedCalls") or []) if isinstance(w, dict)]
    if wasted:
        st.markdown("**Wasted calls** — succeeded, but got the agent nowhere")
        for call in wasted:
            st.markdown(f"- `{call.get('tool')}` — expected: {call.get('expected')}")
            st.caption(f"got: {call.get('whatHappened')}")

    suggestions = runs_lib.normalize_suggestions(verdict.get("suggestions"))
    if suggestions:
        st.markdown("**Suggestions** — what should exist but does not")
        # Sorted by kind so the same kinds sit together: this field exists to be
        # grouped and counted, and a scannable column of labels is the point.
        # Unclassified (pre-v3) entries sort last rather than being hidden.
        for suggestion in sorted(suggestions, key=lambda s: (s["kind"] is None, s["kind"] or "")):
            kind = suggestion["kind"]
            label = f"`{kind}`" if kind else "`unclassified`"
            st.markdown(f"- {label} — {suggestion['what']}")
            if suggestion["wouldHaveSaved"]:
                st.caption(f"would have saved: {suggestion['wouldHaveSaved']}")


def _code(text: str, language: str | None = None) -> None:
    """A code block that WRAPS.

    Without this a single-line JSON blob renders as one unbroken line behind a
    horizontal scrollbar, cut mid-token — which is how a `neo_feedback` report
    became unreadable in the first place.
    """
    st.code(text, language=language, wrap_lines=True)


def render_args(call: dict, *, full: bool) -> None:
    """Render one tool call's arguments, wherever they came from.

    `full=True` means the probe file, where the arguments are complete;
    `full=False` means an event, where they may be a preview string. A
    `neo_feedback` call is rendered as the report it is, with the raw JSON kept
    one click away — someone debugging the tool itself still needs to see
    exactly what went over the wire.
    """
    value = call.get("args")
    preview = call.get("argsPreview")
    raw_size = call.get("argsBytes")
    shown = value if value is not None else preview
    if shown is None or shown == {}:
        return

    verdict = runs_lib.parse_verdict_args(call.get("tool"), shown)
    if verdict is not None:
        st.caption("agent feedback — same schema as the probe verdict (D27)")
        try:
            render_verdict(verdict)
        except Exception:  # noqa: BLE001 - a rendering failure degrades to the raw value
            _code(json.dumps(verdict, indent=2, ensure_ascii=False), language="json")
        with st.expander("raw arguments"):
            _code(json.dumps(verdict, indent=2, ensure_ascii=False), language="json")
        return

    if isinstance(shown, (dict, list)):
        st.caption("arguments")
        _code(json.dumps(shown, indent=2, ensure_ascii=False), language="json")
        return

    # A preview string: label it as a fragment and say how much is missing, the
    # same way result previews are labelled. Never reassembled, never parsed.
    label = "arguments preview"
    if not full and call.get("argsTruncated"):
        size = f"{raw_size:,} bytes" if isinstance(raw_size, int) else "the full value"
        label += f" — showing {len(str(shown)):,} of {size}; the full value is in the probe file"
    st.caption(label)
    _code(str(shown))


def _start_run(target: str, suite: str, probe: str | None, model: str | None) -> None:
    cmd = build_command(target=target, suite=suite, probe=probe, model=model)
    stamp = dt.datetime.now().strftime("%Y%m%dT%H%M%S")
    log_path = UI_LOG_DIR / f"{stamp}-{target}.log"
    launch(cmd, log_path)
    # Only the log path is remembered. Everything else is re-read from disk on
    # every rerun, so a refreshed browser (or a second tab) sees the same truth.
    st.session_state["log_path"] = str(log_path)
    st.session_state["command"] = " ".join(cmd)
    st.session_state["view"] = "Live run"
    st.rerun()


# --- views -------------------------------------------------------------------


def view_suites() -> None:
    st.header("Suites")
    files = _suite_files()
    if not files:
        st.info(f"No suite files under {SUITES_DIR}")
        return

    col_target, col_model = st.columns(2)
    names = _targets()
    target = col_target.selectbox("Target", names, index=_default_target_index(names))
    model = col_model.text_input("Model override", placeholder="(config.toml wins if empty)")

    for path in files:
        try:
            suite = load_suite(path)
        except Exception as exc:  # noqa: BLE001
            st.error(f"{path.name}: {exc}")
            continue
        writes = [p.id for p in suite.probes if p.mode == "write"]
        with st.expander(f"**{path.name}** — {len(suite.probes)} probes · sha {suite.sha}", expanded=True):
            # Stated before the buttons, not behind a confirmation: running write
            # probes against a remote target is legitimate when it is deliberate,
            # and the thing that must never happen is doing it without knowing.
            if writes and target != SAFE_TARGET:
                st.warning(
                    f"**{path.name}** contains {len(writes)} write probe(s) "
                    f"(`{'`, `'.join(writes)}`). Running it against **{target}** will "
                    f"create records on that server, which other people share."
                )
            if st.button(f"Run whole suite: {path.stem}", key=f"suite-{path.name}"):
                _start_run(target, path.stem, None, model or None)
            for probe in suite.probes:
                left, right = st.columns([5, 1])
                left.markdown(f"`{probe.id}` · *{probe.mode}*")
                left.caption(probe.prompt.strip().splitlines()[0][:160])
                if right.button("Run", key=f"probe-{path.name}-{probe.id}"):
                    _start_run(target, path.stem, probe.id, model or None)


def view_live() -> None:
    st.header("Live run")
    log_path = st.session_state.get("log_path")
    if not log_path:
        st.info("No run started from this UI yet. Start one from **Suites**, or read a past run in **History**.")
        return

    log_text = read_log(Path(log_path))
    st.caption(f"`{st.session_state.get('command', '')}`")

    # Preflight can block on a browser for up to MCP_TEST_AUTH_WAIT seconds
    # (D19). The run directory does not exist yet, so this is read off the CLI's
    # stdout — the one place that says what the run is waiting for.
    authorize_url = runs_lib.pending_authorization(log_text)
    if authorize_url:
        st.warning("Waiting for you to authorize this target in the browser.")
        st.link_button("Open the authorization page", authorize_url)
        st.caption("A browser tab should have opened already. The run continues by itself once you approve.")

    run_id, run_dir = runs_lib.parse_run_id(log_text)
    if not run_dir:
        st.info("Starting…")
        with st.expander("CLI output"):
            st.code(log_text or "(nothing yet)")
        time.sleep(POLL_SECONDS)
        st.rerun()
        return

    events = runs_lib.read_events(run_dir / "events.ndjson")
    state = runs_lib.live_state(events)
    st.subheader(run_id)

    done = state.done_count
    total = state.expected_probes or max(len(state.probes), 1)
    st.progress(min(done / total, 1.0), text=f"{done}/{total} probes")

    if state.finished:
        level, text = run_status(state.finished)
        {"success": st.success, "warning": st.warning, "error": st.error}[level](text)
        if st.button("Open in Run detail"):
            st.session_state["selected_run"] = run_id
            st.session_state["view"] = "Run detail"
            st.rerun()

    for probe_id, progress in state.probes.items():
        label = progress.state
        header = f":{_outcome_color(label)}[{label}] · `{probe_id}` · {len(progress.calls)} calls"
        if state.max_steps:
            # Tool calls, not graph steps: the cap is on agent steps and a step
            # is a model turn plus a tool turn, so this is a lower bound on how
            # close the probe is to the cap, never an equality.
            header += f" (cap {state.max_steps} steps)"
        with st.expander(header, expanded=(probe_id == state.current)):
            if progress.aborted:
                st.error(progress.aborted)
            for call in progress.calls:
                result = call.get("result") or {}
                mark = "…" if not result else ("✅" if result.get("ok") else "❌")
                bits = [f"{mark} **{call.get('tool')}**"]
                if result:
                    bits.append(f"{result.get('bytes', 0):,} B")
                    if result.get("ms") is not None:
                        bits.append(f"{result['ms']} ms")
                st.markdown(" · ".join(bits))
                render_args(call, full=False)
                if result.get("preview"):
                    st.caption("result preview (the full body is in the probe file)")
                    _code(result["preview"])

    if not state.finished:
        with st.expander("CLI output"):
            st.code(log_text[-4000:])
        time.sleep(POLL_SECONDS)
        st.rerun()


def _render_probe(probe: dict) -> None:
    badge = runs_lib.outcome_badge(probe)
    st.markdown(f"### :{_outcome_color(badge)}[{badge}] · `{probe['probeId']}`")
    if probe.get("harnessError"):
        st.error(f"{probe['harnessError'].get('kind')}: {probe['harnessError'].get('detail')}")
        with st.expander("traceback"):
            _code(probe["harnessError"].get("traceback", ""))

    verdict = probe.get("verdict")
    if isinstance(verdict, dict):
        render_verdict(verdict)

    if probe.get("effectVerified") is not None or probe.get("effectCheck"):
        st.markdown(f"**Effect verified:** `{probe.get('effectVerified')}` · `{json.dumps(probe.get('effectCheck'))}`")

    calls = probe.get("toolCalls") or []
    st.markdown(f"**Transcript — {len(calls)} tool calls**")
    if not calls and probe.get("harnessError"):
        st.caption("No tool calls were recorded before the failure.")
    for index, call in enumerate(calls, start=1):
        mark = "❌" if call.get("error") else "✅"
        size = call.get("resultBytes", 0)
        title = f"{index}. {mark} {call.get('tool')} — {size:,} B"
        if call.get("resultTruncated"):
            title += " (truncated)"
        with st.expander(title):
            render_args(call, full=True)
            st.caption(
                f"result — {size:,} bytes"
                + (
                    f", stored body cut to {len(call.get('result') or '')} chars "
                    "(raise run.max_result_chars in config.toml to keep more)"
                    if call.get("resultTruncated")
                    else ""
                )
            )
            # The whole reason results are recorded: a payload that could not be
            # read after the fact once cost a live reproduction to diagnose.
            _code(call.get("result") or "(no result recorded — the call never came back)")


def view_run_detail() -> None:
    st.header("Run detail")
    all_runs = runs_lib.list_runs(RUNS_DIR)
    if not all_runs:
        st.info(f"No runs under {RUNS_DIR}")
        return
    ids = [r.run_id for r in all_runs]
    default = st.session_state.get("selected_run")
    index = ids.index(default) if default in ids else 0
    run_id = st.selectbox("Run", ids, index=index)
    summary = next(r for r in all_runs if r.run_id == run_id)

    if summary.header:
        st.json(summary.header, expanded=False)
    probe_ids = runs_lib.probe_files(summary.path)
    if not probe_ids:
        st.warning("This run wrote no probe files.")
        return
    for probe_id in probe_ids:
        probe = runs_lib.load_probe(summary.path, probe_id)
        if probe is None:
            st.error(f"{probe_id}.json is unreadable")
            continue
        with st.container(border=True):
            _render_probe(probe)


def view_history() -> None:
    st.header("History")
    all_runs = runs_lib.list_runs(RUNS_DIR)
    if not all_runs:
        st.info(f"No runs under {RUNS_DIR}")
        return
    st.dataframe(
        [
            {
                "run": r.run_id,
                "started": r.started_at,
                "target": (r.header or {}).get("target", {}).get("name", ""),
                "model": (r.header or {}).get("model", ""),
                "suite": ((r.header or {}).get("suites") or [{}])[0].get("file", ""),
                "promptVer": (r.header or {}).get("promptVersion", ""),
                "probes": r.probe_count,
            }
            for r in all_runs
        ],
        # No width kwarg: `use_container_width` is deprecated and its
        # replacement (`width="stretch"`) does not exist on the 1.36 floor.
        hide_index=True,
    )
    chosen = st.selectbox("Open a run", [r.run_id for r in all_runs])
    if st.button("Show detail"):
        st.session_state["selected_run"] = chosen
        st.session_state["view"] = "Run detail"
        st.rerun()


VIEWS = {
    "Suites": view_suites,
    "Live run": view_live,
    "Run detail": view_run_detail,
    "History": view_history,
}

with st.sidebar:
    st.title("MCP harness")
    st.caption(str(HARNESS_ROOT))
    names = list(VIEWS)
    current = st.session_state.get("view", "Suites")
    choice = st.radio("View", names, index=names.index(current) if current in names else 0)
    st.session_state["view"] = choice

VIEWS[st.session_state["view"]]()
