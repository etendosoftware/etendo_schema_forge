"""The live event stream (`runs/<runId>/events.ndjson`, design §6.5).

Append-only, one JSON object per line, flushed after every write. This is what
makes live progress possible WITHOUT the UI talking to the runner: the
filesystem is the API (D11).

**The event stream is never the source of truth for results.** It is a progress
feed, deliberately small and lossy-tolerant. `run.json` and `probes/<id>.json`
are the record (§6.1); if the two ever disagree, the probe file wins. Nothing
downstream may derive a metric from events that it could have derived from the
probe files.

Plain data and one file handle — no LangChain, no provider, no MCP import, so
`agent.py` stays the only module that touches the agent library (§5).
"""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from typing import Any

#: Event type names. Constants rather than literals because `agent.py` emits
#: some of them and a typo would be invisible in an NDJSON file nobody parses
#: strictly.
RUN_STARTED = "run_started"
PROBE_STARTED = "probe_started"
TOOL_CALL = "tool_call"
TOOL_RESULT = "tool_result"
PROBE_FINISHED = "probe_finished"
#: A probe that died without producing a verdict. Distinct from
#: `probe_finished`, which always carries an outcome: reporting a crash as
#: "finished" would invent a result, and reporting nothing at all would leave a
#: tailing UI spinning forever on a probe that is already dead.
PROBE_ABORTED = "probe_aborted"
EFFECT_CHECKED = "effect_checked"
RUN_FINISHED = "run_finished"

#: How much of a tool result (and of a serialised argument blob) a single event
#: line may carry. The BODIES live in `probes/<id>.json`; the event carries a
#: head just long enough to recognise what came back while the run is still
#: going — the Gemini `$ref` defect is visible in the first 60 characters of a
#: row. See `_preview`.
EVENT_PREVIEW_CHARS = 400

#: Arguments get their own, much larger cap, because the two are not the same
#: kind of value. A RESULT is large by default and its head is diagnostic — the
#: Gemini `$ref` is recognisable in 60 characters. ARGUMENTS are tiny by default
#: (a filter, an id), so this cap almost never fires; the one call that breaks
#: that rule is `neo_feedback`, whose arguments are a whole verdict report (D27),
#: and for which a 400-character head is worthless: truncated JSON does not
#: parse, so the live view cannot render it as the report it is. The cost is
#: bounded and it is not per-call — only the handful of calls whose arguments
#: exceed 400 characters grow, in practice one report per probe.
#:
#: Deliberately NOT per-tool: a tool-name-keyed cap would put product knowledge
#: into the event layer, which is exactly what the harness keeps out of itself.
EVENT_ARGS_PREVIEW_CHARS = 4000


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _preview(text: str, limit: int = EVENT_PREVIEW_CHARS) -> tuple[str, bool]:
    """Head of `text` plus whether it was cut."""
    if len(text) <= limit:
        return text, False
    return text[:limit], True


class EventWriter:
    """Appends events to one NDJSON file, flushing every line.

    Every failure mode is swallowed: a broken event file must degrade the UI,
    never the measurement. Once a write fails the writer disables itself rather
    than raising once per event for the rest of the run.
    """

    def __init__(self, path: Path) -> None:
        self.path = path
        self._handle: Any = None
        self.disabled_reason: str | None = None
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            # Line-buffered append. `a` so a resumed or re-entered run can only
            # ever add to the record, never truncate it.
            self._handle = path.open("a", encoding="utf-8")
        except OSError as exc:
            self.disabled_reason = f"{type(exc).__name__}: {exc}"

    def emit(self, event_type: str, **fields: Any) -> None:
        if self._handle is None:
            return
        line = {"t": event_type, "ts": _now(), **fields}
        try:
            self._handle.write(json.dumps(line, ensure_ascii=False, default=str) + "\n")
            # Flushed immediately (§6.5): a UI tailing the file must see the
            # event now, and a run killed mid-probe must keep what it wrote.
            self._handle.flush()
        except (OSError, TypeError, ValueError) as exc:  # noqa: BLE001
            self.disabled_reason = f"{type(exc).__name__}: {exc}"
            self.close()

    def close(self) -> None:
        handle, self._handle = self._handle, None
        try:
            if handle is not None:
                handle.close()
        except OSError:
            pass


class NullEventWriter:
    """No stream at all. Lets every caller emit unconditionally."""

    path = None
    disabled_reason = None

    def emit(self, event_type: str, **fields: Any) -> None:
        return

    def close(self) -> None:
        return


def tool_call_fields(*, tool: str, call_id: str | None, args: Any) -> dict[str, Any]:
    """The payload of a `tool_call` event, minus the probe id.

    `probe` is added by whoever owns the stream (the CLI), so the agent never
    has to be told which probe it is running.

    Arguments are normally tiny, but they are capped like results are: one
    pathological argument must not produce a megabyte-long line in a file whose
    whole job is to be tailed cheaply.
    """
    rendered = json.dumps(args, ensure_ascii=False, sort_keys=True, default=str)
    head, cut = _preview(rendered, EVENT_ARGS_PREVIEW_CHARS)
    payload: dict[str, Any] = {"tool": tool, "id": call_id, "argsBytes": len(rendered.encode("utf-8"))}
    if cut:
        payload["argsPreview"] = head
        payload["argsTruncated"] = True
    else:
        payload["args"] = args
    return payload


def tool_result_fields(
    *,
    tool: str,
    call_id: str | None,
    ok: bool,
    result: str,
    result_bytes: int,
    ms: int | None,
) -> dict[str, Any]:
    """The payload of a `tool_result` event.

    `bytes` is the TRUE size of the response (§6.6 reads it as the payload
    metric), independent of how much of the body the preview shows.
    """
    head, cut = _preview(result)
    return {
        "tool": tool,
        "id": call_id,
        "ok": ok,
        "bytes": result_bytes,
        "ms": ms,
        "preview": head,
        "previewTruncated": cut,
    }
