"""Reading what a run left on disk. No Streamlit, no runner internals.

The UI holds no state of its own and the runner does not know it exists (D11):
everything here is a pure function over files the CLI already writes. Keeping it
out of `app.py` is what makes it verifiable without launching a browser.

`events.ndjson` is a PROGRESS feed, not the record. Where an event and a probe
file disagree — a probe finished between two polls, an event line was lost to a
full disk — `probes/<id>.json` wins. Nothing here reports a result that only the
event stream believes in.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

#: Printed by the CLI as its first line: `run <id> -> <dir>`.
_RUN_LINE = re.compile(r"^run (\S+) -> (.+)$", re.MULTILINE)
#: The CLI prints the authorization URL on its own line when a browser is needed.
_URL_LINE = re.compile(r"https?://\S+")


@dataclass
class RunSummary:
    run_id: str
    path: Path
    header: dict[str, Any] | None
    probe_count: int

    @property
    def started_at(self) -> str:
        return (self.header or {}).get("startedAt", "")


def list_runs(runs_dir: Path) -> list[RunSummary]:
    """Every run directory, newest first. Run ids are timestamp-prefixed (§6.2),
    so a reverse name sort IS chronological and no file has to be opened to order
    them."""
    if not runs_dir.exists():
        return []
    out: list[RunSummary] = []
    for entry in sorted(runs_dir.iterdir(), reverse=True):
        # `.ui/` holds the UI's own subprocess logs, not runs.
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        header: dict[str, Any] | None = None
        try:
            header = json.loads((entry / "run.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            # A run killed before its header landed is still a run worth listing.
            pass
        probes = entry / "probes"
        count = len(list(probes.glob("*.json"))) if probes.exists() else 0
        out.append(RunSummary(run_id=entry.name, path=entry, header=header, probe_count=count))
    return out


def read_events(path: Path) -> list[dict[str, Any]]:
    """Every parseable event line.

    A line is skipped rather than raised on: the file is read while it is being
    appended to, so the last line can legitimately be half-written, and a
    malformed event must degrade the view, never break it.
    """
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    events: list[dict[str, Any]] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            parsed = json.loads(line)
        except ValueError:
            continue
        if isinstance(parsed, dict):
            events.append(parsed)
    return events


@dataclass
class ProbeProgress:
    probe_id: str
    calls: list[dict[str, Any]] = field(default_factory=list)
    outcome: str | None = None
    aborted: str | None = None

    @property
    def state(self) -> str:
        if self.aborted:
            return "aborted"
        if self.outcome:
            return self.outcome
        return "running"


@dataclass
class LiveState:
    run_id: str | None = None
    expected_probes: int = 0
    max_steps: int = 0
    probes: dict[str, ProbeProgress] = field(default_factory=dict)
    finished: dict[str, Any] | None = None
    current: str | None = None

    @property
    def done_count(self) -> int:
        return sum(1 for p in self.probes.values() if p.state != "running")


def live_state(events: Iterable[dict[str, Any]]) -> LiveState:
    """Fold the event stream into what a progress view needs."""
    state = LiveState()
    for event in events:
        kind = event.get("t")
        probe_id = event.get("probe")
        if kind == "run_started":
            state.run_id = event.get("runId")
            state.expected_probes = int(event.get("probes") or 0)
            state.max_steps = int(event.get("maxSteps") or 0)
        elif kind == "run_finished":
            state.finished = event
            state.current = None
        elif probe_id:
            progress = state.probes.setdefault(probe_id, ProbeProgress(probe_id))
            if kind == "probe_started":
                state.current = probe_id
            elif kind == "tool_call":
                progress.calls.append({**event, "result": None})
            elif kind == "tool_result":
                # Match the result to its call by id; fall back to the last
                # unanswered call, because an event line can be lost.
                target = next(
                    (c for c in reversed(progress.calls) if c.get("id") == event.get("id")),
                    None,
                ) or next((c for c in reversed(progress.calls) if c["result"] is None), None)
                if target is not None:
                    target["result"] = event
                else:
                    progress.calls.append({"tool": event.get("tool"), "result": event})
            elif kind == "probe_finished":
                progress.outcome = event.get("outcome")
                state.current = None
            elif kind == "probe_aborted":
                progress.aborted = event.get("detail") or event.get("kind") or "aborted"
                state.current = None
    return state


def parse_run_id(log_text: str) -> tuple[str | None, Path | None]:
    """The run id and directory the CLI announced on stdout."""
    match = _RUN_LINE.search(log_text)
    if not match:
        return None, None
    return match.group(1), Path(match.group(2).strip())


def pending_authorization(log_text: str) -> str | None:
    """The authorization URL the CLI is waiting on, if it is waiting.

    Read off the CLI's own stdout because preflight runs BEFORE the run
    directory exists (D19 front-loads auth), so there is no event stream to
    announce it on. Cleared once the run banner appears, which the CLI only
    prints after preflight has returned.
    """
    if "run " in log_text and _RUN_LINE.search(log_text):
        return None
    if "authorize" not in log_text:
        return None
    urls = _URL_LINE.findall(log_text)
    return urls[-1] if urls else None


def load_probe(run_dir: Path, probe_id: str) -> dict[str, Any] | None:
    try:
        return json.loads((run_dir / "probes" / f"{probe_id}.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def probe_files(run_dir: Path) -> list[str]:
    probes = run_dir / "probes"
    if not probes.exists():
        return []
    return sorted(p.stem for p in probes.glob("*.json"))


def outcome_badge(probe: dict[str, Any]) -> str:
    """One word for a probe file — the PROBE FILE, which is authoritative."""
    if probe.get("harnessError"):
        return "not measured"
    verdict = probe.get("verdict")
    if not verdict:
        return "no verdict"
    return verdict.get("outcome", "?")


#: The in-band feedback tool. By design (D27) its arguments carry the SAME
#: schema as the harness verdict (§6.3) — one shape, shared between
#: `runner/verdict.py` and `McpFeedbackVerdict.java` — so the UI renders them
#: with the verdict renderer instead of dumping JSON at the reader.
FEEDBACK_TOOL = "neo_feedback"

_OUTCOMES = {"OKAY", "ERROR", "MIXED"}
#: Checked only when present, which is what makes the same check accept a v1
#: verdict (no `wastedCalls`) and a v2 one alike.
_VERDICT_LISTS = ("frictions", "failures", "wastedCalls", "suggestions")


def is_feedback_tool(tool: Any) -> bool:
    """Tolerates an MCP namespace prefix (`mcp__server__neo_feedback`)."""
    if not isinstance(tool, str):
        return False
    name = tool.strip()
    return name == FEEDBACK_TOOL or name.endswith(f"__{FEEDBACK_TOOL}")


def looks_like_verdict(value: Any) -> bool:
    """Whether `value` really carries the verdict shape.

    Checked in addition to the tool name, never instead of it: if the feedback
    schema ever diverges from the verdict schema, this is what stops the UI from
    confidently misreading a payload it no longer understands — it falls back to
    showing the raw value, which is always correct.
    """
    if not isinstance(value, dict):
        return False
    if value.get("outcome") not in _OUTCOMES:
        return False
    if not isinstance(value.get("summary"), str):
        return False
    return all(isinstance(value[key], list) for key in _VERDICT_LISTS if key in value)


def parse_verdict_args(tool: Any, value: Any) -> dict[str, Any] | None:
    """The verdict carried by a `neo_feedback` call's arguments, or None.

    `value` may be the decoded arguments or the raw preview string an event
    carries. A preview that was cut mid-JSON simply does not parse, and that is
    the end of it: truncated JSON is never repaired, because a guessed
    reconstruction of what the agent reported is worse than showing the
    fragment verbatim.
    """
    if not is_feedback_tool(tool):
        return None
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return None
    return value if looks_like_verdict(value) else None


#: Verdict schema v3 turned each suggestion from a sentence into a record. Old
#: runs are full of the string form and are never rewritten, so both shapes are
#: read here, per ENTRY rather than per verdict: the shape is decided by what the
#: item actually is, so a half-migrated or hand-edited list still renders.
def normalize_suggestions(value: Any) -> list[dict[str, Any]]:
    """Both suggestion shapes as one list of records.

    A legacy string becomes `{"what": <the string>, "kind": None}` — `kind` is
    None rather than "other", because "the agent did not classify this" and "the
    agent classified it as other" are different facts and must not be conflated
    when these are counted.
    """
    out: list[dict[str, Any]] = []
    for item in value or []:
        if isinstance(item, str):
            out.append({"what": item, "kind": None, "wouldHaveSaved": None})
        elif isinstance(item, dict) and item.get("what"):
            out.append(
                {
                    "what": item["what"],
                    "kind": item.get("kind"),
                    "wouldHaveSaved": item.get("wouldHaveSaved"),
                }
            )
    return out
