"""Deterministic probe setup and teardown (D41).

A probe may declare `setup:` and `teardown:` lists of MCP tool calls that the
runner makes itself, OUTSIDE the agent: setup before the agent starts, teardown
after the agent and the effect check, always. They exist so a write probe can
start from a known state it created (a fresh, completed invoice) and leave
nothing behind, without making the agent build that state — which would put the
fixture inside the measurement.

Deliberately small. A step is one tool call; the only extras are:

* `saveAs: <name>` keeps the step's parsed result, readable by any later step,
  the prompt and the effect check as `{{steps.<name>.<path>}}`;
* `forEach: "{{steps.<name>.<path>}}"` repeats a step once per element of a list
  result, each element readable as `{{item.<path>}}` — the one loop teardown
  needs, because how many payments an agent left behind is not known upfront;
* `optional: true` marks a step whose failure is expected in some states (unpost
  a document a background process may or may not have posted yet). It is still
  recorded, with `optional: true`, but it neither stops setup nor makes a
  teardown unclean — a later, required step is what proves the state.

`<path>` is dotted; a numeric segment indexes a list (`data.0.id`). A value that
is EXACTLY one reference keeps the referenced value's type (a number stays a
number, a list stays a list); a reference inside a longer string is spliced in
as text. An unresolvable reference fails the step instead of sending a
half-filled call — which, for a destructive teardown call, is the safe answer.

No LangChain, no provider import: steps reach the server through the same SDK
session helpers the effect check uses.
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

#: `{{steps.<name>[.<path>]}}` or `{{item[.<path>]}}`.
_REF_RE = re.compile(r"\{\{\s*(steps\.[A-Za-z0-9_\-]+(?:\.[A-Za-z0-9_\-]+)*|item(?:\.[A-Za-z0-9_\-]+)*)\s*\}\}")


class StepError(RuntimeError):
    """A step could not be prepared (bad reference) or the call failed."""


@dataclass(frozen=True)
class Step:
    tool: str
    args: dict[str, Any]
    save_as: str | None = None
    for_each: str | None = None
    optional: bool = False


def parse_steps(raw: Any, *, probe_id: str, phase: str) -> list[Step]:
    """Validate one `setup:` / `teardown:` list from the suite file."""
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValueError(f"Probe {probe_id!r}: {phase} must be a list of steps.")
    steps: list[Step] = []
    for i, entry in enumerate(raw):
        if not isinstance(entry, dict) or not entry.get("tool"):
            raise ValueError(f"Probe {probe_id!r}: {phase}[{i}] needs a `tool`.")
        unknown = set(entry) - {"tool", "args", "saveAs", "forEach", "optional"}
        if unknown:
            raise ValueError(
                f"Probe {probe_id!r}: {phase}[{i}] has unknown key(s) {sorted(unknown)}."
            )
        for_each = entry.get("forEach")
        if for_each is not None and not _REF_RE.fullmatch(str(for_each).strip()):
            raise ValueError(
                f"Probe {probe_id!r}: {phase}[{i}].forEach must be one "
                f"{{{{steps.<name>.<path>}}}} reference, got {for_each!r}."
            )
        steps.append(
            Step(
                tool=entry["tool"],
                args=entry.get("args") or {},
                save_as=entry.get("saveAs"),
                for_each=for_each,
                optional=bool(entry.get("optional", False)),
            )
        )
    return steps


def _lookup(ref: str, saved: dict[str, Any], item: Any) -> Any:
    parts = ref.split(".")
    if parts[0] == "item":
        if item is None:
            raise StepError(f"{{{{{ref}}}}} used outside a forEach step")
        value, path = item, parts[1:]
    else:
        name = parts[1]
        if name not in saved:
            raise StepError(f"{{{{{ref}}}}}: no earlier step saved as {name!r}")
        value, path = saved[name], parts[2:]
    for seg in path:
        if isinstance(value, list) and seg.isdigit() and int(seg) < len(value):
            value = value[int(seg)]
        elif isinstance(value, dict) and seg in value:
            value = value[seg]
        else:
            raise StepError(f"{{{{{ref}}}}}: no {seg!r} in the saved result")
    return value


def resolve_refs(value: Any, saved: dict[str, Any], item: Any = None) -> Any:
    """Expand step references inside an args tree (or a prompt string)."""
    if isinstance(value, str):
        whole = _REF_RE.fullmatch(value.strip())
        if whole:
            return _lookup(whole.group(1), saved, item)
        return _REF_RE.sub(
            lambda m: _as_text(_lookup(m.group(1), saved, item)), value
        )
    if isinstance(value, dict):
        return {k: resolve_refs(v, saved, item) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve_refs(v, saved, item) for v in value]
    return value


def _as_text(value: Any) -> str:
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)


#: `(tool, args) -> parsed payload`, raising on a tool error.
CallFn = Callable[[str, dict[str, Any]], Awaitable[Any]]


async def run_steps(
    steps: list[Step],
    call: CallFn,
    *,
    phase: str,
    saved: dict[str, Any],
    stop_on_error: bool,
    max_result_chars: int,
    on_record: Callable[[dict[str, Any]], None] | None = None,
) -> list[dict[str, Any]]:
    """Run steps in order and return one record per tool call actually attempted.

    Setup stops at the first failure of a required step (the state the probe
    needs does not exist).
    Teardown keeps going (an undo that gave up on step 1 would leave everything
    else behind too). `saved` is updated in place, so teardown sees setup's names.
    """
    records: list[dict[str, Any]] = []

    def record(rec: dict[str, Any]) -> None:
        records.append(rec)
        if on_record:
            on_record(rec)

    for index, step in enumerate(steps):
        base = {"phase": phase, "index": index, "tool": step.tool}
        if step.optional:
            base["optional"] = True
        stop = stop_on_error and not step.optional
        try:
            items = [None]
            if step.for_each:
                items = resolve_refs(step.for_each, saved)
                if not isinstance(items, list):
                    raise StepError(f"forEach {step.for_each} is not a list")
        except StepError as exc:
            record({**base, "ok": False, "error": str(exc)})
            if stop:
                return records
            continue

        for n, item in enumerate(items):
            rec = dict(base)
            if step.for_each:
                rec["forEachIndex"] = n
            try:
                args = resolve_refs(step.args, saved, item)
            except StepError as exc:
                record({**rec, "ok": False, "error": str(exc)})
                if stop:
                    return records
                continue
            rec["args"] = args
            started = time.monotonic()
            try:
                payload = await call(step.tool, args)
            except Exception as exc:  # noqa: BLE001 - recorded, never raised
                rec.update(ok=False, error=f"{type(exc).__name__}: {exc}")
                rec["ms"] = int((time.monotonic() - started) * 1000)
                record(rec)
                if stop:
                    return records
                continue
            rec["ms"] = int((time.monotonic() - started) * 1000)
            text = json.dumps(payload, ensure_ascii=False, default=str)
            rec.update(
                ok=True,
                result=text[:max_result_chars],
                resultTruncated=len(text) > max_result_chars,
            )
            if step.save_as:
                rec["saveAs"] = step.save_as
                saved[step.save_as] = payload
            record(rec)
    return records
