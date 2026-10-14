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
        count = len(probe_files(entry))
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


def progress_key(probe_id: str, attempt: Any, repeat: int) -> str:
    """How the live view names one attempt (D43).

    The bare probe id while a run is one attempt per probe, so a REPEAT=1 run
    looks exactly as before; `<id> · a<n>` as soon as there can be more than
    one — REPEAT > 1, or a replacement for a harness-errored attempt.
    """
    if not isinstance(attempt, int) or (repeat <= 1 and attempt == 1):
        return probe_id
    return f"{probe_id} · a{attempt}"


@dataclass
class LiveState:
    run_id: str | None = None
    #: Planned attempts (probes × repeat). Replacements may add to it.
    expected_probes: int = 0
    repeat: int = 1
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
            state.repeat = int(event.get("repeat") or 1)
            state.expected_probes = int(event.get("probes") or 0) * state.repeat
            state.max_steps = int(event.get("maxSteps") or 0)
        elif kind == "run_finished":
            state.finished = event
            state.current = None
        elif probe_id:
            key = progress_key(probe_id, event.get("attempt"), state.repeat)
            progress = state.probes.setdefault(key, ProbeProgress(key))
            if kind == "probe_started":
                state.current = key
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


#: First run schema version that writes one file per attempt (D43):
#: `probes/<id>/attempt-<n>.json`. Older runs hold one `probes/<id>.json` per
#: probe and are never rewritten (D14), so both layouts are read.
ATTEMPTS_SCHEMA_VERSION = 5

_ATTEMPT_FILE = re.compile(r"^attempt-(\d+)\.json$")


#: Layout per run directory, once known from the header. Every helper below
#: asks, and a run detail view asks once per probe and attempt.
_LAYOUT_BY_RUN: dict[Path, bool] = {}


def uses_attempt_layout(run_dir: Path) -> bool:
    """Which layout a run wrote, keyed on `run.json.schemaVersion`.

    A run killed before its header landed has no version to read; then what is
    on disk decides (a probe DIRECTORY only exists in the attempts layout).
    Only a header answer is cached: a header never changes once written, while
    the on-disk guess can (the live view polls a run that is still writing).
    """
    key = run_dir.resolve()
    if key in _LAYOUT_BY_RUN:
        return _LAYOUT_BY_RUN[key]
    try:
        version = json.loads((run_dir / "run.json").read_text(encoding="utf-8")).get("schemaVersion")
    except (OSError, ValueError, AttributeError):
        version = None
    if isinstance(version, int):
        _LAYOUT_BY_RUN[key] = version >= ATTEMPTS_SCHEMA_VERSION
        return _LAYOUT_BY_RUN[key]
    probes = run_dir / "probes"
    return probes.is_dir() and any(p.is_dir() for p in probes.iterdir())


def probe_files(run_dir: Path) -> list[str]:
    """Every probe id the run wrote a record for, in either layout."""
    probes = run_dir / "probes"
    if not probes.exists():
        return []
    if uses_attempt_layout(run_dir):
        return sorted(p.name for p in probes.iterdir() if p.is_dir() and attempt_numbers(run_dir, p.name))
    return sorted(p.stem for p in probes.glob("*.json"))


def attempt_numbers(run_dir: Path, probe_id: str) -> list[int]:
    """The attempts on file for a probe, ascending. A pre-v5 probe is attempt 1."""
    if not uses_attempt_layout(run_dir):
        return [1] if (run_dir / "probes" / f"{probe_id}.json").exists() else []
    folder = run_dir / "probes" / probe_id
    if not folder.is_dir():
        return []
    found = (_ATTEMPT_FILE.match(p.name) for p in folder.iterdir())
    return sorted(int(m.group(1)) for m in found if m)


def load_probe(run_dir: Path, probe_id: str, attempt: int = 1) -> dict[str, Any] | None:
    """One attempt's record; `None` when it is missing or unreadable.

    For a pre-v5 run only attempt 1 exists, and it is the probe file itself.
    """
    if uses_attempt_layout(run_dir):
        path = run_dir / "probes" / probe_id / f"attempt-{attempt}.json"
    elif attempt == 1:
        path = run_dir / "probes" / f"{probe_id}.json"
    else:
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def record_v4(probe: dict[str, Any]) -> dict[str, Any] | None:
    """The fields run schema v4 added to a probe file, or None before v4.

    Old runs are never rewritten (D14), so a v3 file is not "a v4 file with
    nulls": it never recorded an answer or a token count, and a view that
    rendered `None` there would claim the agent said nothing and cost nothing.
    """
    if not isinstance(probe.get("schemaVersion"), int) or probe["schemaVersion"] < 4:
        return None
    usage = probe.get("usage") or {}
    return {
        "finalAnswer": probe.get("finalAnswer"),
        "loop": usage.get("loop"),
        "report": usage.get("report"),
        "servedModel": probe.get("servedModel"),
        "silentWrong": probe.get("silentWrong"),
    }


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
FEEDBACK_TOOL = "etendo_feedback"

_OUTCOMES = {"OKAY", "ERROR", "MIXED"}
#: Checked only when present, which is what makes the same check accept a v1
#: verdict (no `wastedCalls`) and a v2 one alike.
_VERDICT_LISTS = ("frictions", "failures", "wastedCalls", "suggestions")


def is_feedback_tool(tool: Any) -> bool:
    """Tolerates an MCP namespace prefix (`mcp__server__etendo_feedback`)."""
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
    """The verdict carried by a `etendo_feedback` call's arguments, or None.

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
