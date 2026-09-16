"""The probe agent.

DESIGN RULE (§5, protects D8): this is the ONLY module in the harness that
imports the agent library or an LLM provider. If LangChain turns out to be the
wrong bet, the suites, the verdict schema and the CLI are unaffected.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Callable

from .events import TOOL_CALL, TOOL_RESULT, tool_call_fields, tool_result_fields
from .verdict import Verdict

PROMPT_PATH = Path(__file__).parent / "prompts" / "probe_system.md"

#: Bumped whenever `prompts/probe_system.md` changes (D17). Recorded per run,
#: because a silent prompt edit would invalidate comparability invisibly.
#: v2 pins the verdict language to English (the verdict is machine-read data;
#: the prompts stay Spanish per D21).
#: v3 asks for the two fields verdict schema v2 added — the plan the agent had
#: before it started and where that plan came from — and for calls that
#: succeeded yet got it nowhere, which no earlier prompt asked about and which
#: therefore went unreported rather than being reported as zero.
#: v4 goes with verdict schema v3, where a suggestion stopped being a sentence
#: and became a classified record: the prompt now asks for the kind and for what
#: it would have saved on this task, and tells the agent not to judge whether
#: anything is broken (that judgement is a human's, under D22).
PROMPT_VERSION = 4

#: Default cap on how much of a tool RESULT is stored per call (§6.1). Results
#: are recorded because without them a failure cannot be diagnosed from the run
#: files alone; the cap exists because a single `neo_discover` answer is ~79 KB
#: and would otherwise dominate every probe file. The TRUE size always survives
#: as `resultBytes`, so the cap costs detail, never the metric.
DEFAULT_MAX_RESULT_CHARS = 20000


class ProbeAborted(Exception):
    """A probe died before it could produce a verdict, but left evidence.

    Raised instead of letting a provider/transport exception escape bare, so the
    tool calls recorded up to the failure are not lost with it. Precisely in the
    runs that need diagnosing (a provider 400 mid-loop) the transcript is the
    only evidence there is.

    `cause` is the original exception — callers must derive their error detail
    from it, so the message a human reads is unchanged by this wrapper.
    `partial` is the run-record fragment (everything but `verdict`).
    """

    def __init__(self, cause: BaseException, partial: dict[str, Any]) -> None:
        super().__init__(str(cause))
        self.cause = cause
        self.partial = partial

#: Asked of the model after the tool loop ends, to turn the transcript into the
#: structured verdict. It is reporting instruction only — it carries no domain
#: knowledge, so it does not weaken D20.
_REPORT_INSTRUCTION = (
    "The task is over. Report on it now, filling the required structure.\n"
    "Base the report on what actually happened in this conversation, not on what "
    "you intended. List EVERY tool call that returned an error, including the ones "
    "you afterwards fixed yourself — a mistake you recovered from still counts.\n"
    "Also list, under wastedCalls, every call that SUCCEEDED but got you nowhere: "
    "no error, and an answer that turned out to be of no use. Those are as "
    "expensive as failures and nothing else records them.\n"
    "For plannedApproach, recall what you believed BEFORE you began, not the route "
    "that turned out to work; for howKnown, name the specific source it came from. "
    "If you had no plan, or you guessed, say so — that is a complete answer and a "
    "useful one, and an invented plan is worse than none.\n"
    "Under suggestions, report what should EXIST but does not, each with its kind "
    "and with what it would have saved you on this task — 'nothing on this task' "
    "is an acceptable and useful answer. Pick the kind `other` freely when none of "
    "the rest fits; a suggestion in the wrong category is worse than one in "
    "`other`. Do not judge whether anything is a defect.\n"
    "Use OKAY only if the task was fully completed. Write the report in English."
)


def system_prompt() -> str:
    """The naive probe system prompt (D20), with its HTML comment header stripped."""
    text = PROMPT_PATH.read_text(encoding="utf-8")
    if text.lstrip().startswith("<!--"):
        text = text.split("-->", 1)[1]
    return text.strip()


def build_model(provider: dict[str, Any]):
    """Instantiate the chat model from resolved provider settings."""
    name = provider["name"]
    if name != "openai":
        raise NotImplementedError(
            f"Provider {name!r} is not wired in this slice. Only 'openai' "
            "(including any OpenAI-compatible gateway via base_url) is."
        )
    from langchain_openai import ChatOpenAI

    kwargs: dict[str, Any] = {
        "model": provider["model"],
        "api_key": provider["api_key"],
        "temperature": provider["temperature"],
    }
    if provider.get("base_url"):
        kwargs["base_url"] = provider["base_url"]
    return ChatOpenAI(**kwargs)


async def check_model(provider: dict[str, Any]) -> None:
    """One trivial call to prove the configured model answers at all.

    Same reasoning as resolving auth at preflight (D19): a dead model should
    surface in second 2, not after the first probe has burned a minute, and
    certainly not once per probe. Raises the provider's own exception, which the
    caller turns into a readable message.
    """
    await build_model(provider).ainvoke("ok")


def _result_text(content: Any) -> str:
    """Flatten a ToolMessage body to a deterministic string.

    `content` is a plain string for most tools, but the MCP adapters may hand
    back a list of content blocks. Blocks are joined rather than repr'd so the
    stored text is the tool's own words, which is the whole point of recording
    it; anything exotic is JSON-serialised with sorted keys so two identical
    results never differ byte for byte between runs.
    """
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and isinstance(block.get("text"), str):
                parts.append(block["text"])
            else:
                parts.append(json.dumps(block, sort_keys=True, ensure_ascii=False, default=str))
        return "\n".join(parts)
    if isinstance(content, dict):
        return json.dumps(content, sort_keys=True, ensure_ascii=False, default=str)
    return str(content)


def _tool_calls_from(
    messages: list[Any],
    *,
    max_result_chars: int = DEFAULT_MAX_RESULT_CHARS,
) -> list[dict[str, Any]]:
    """Objective record of what the agent actually did (design §6.1).

    The verdict is the agent's story; this is the runner's. They are compared,
    never conflated. The RESULT of each call is part of that record: the Gemini
    `$ref` defect (a reserved key inside `function_response.response`) was not
    establishable from any run file precisely because results were discarded,
    and had to be reproduced by hand against the live server.
    """
    calls: list[dict[str, Any]] = []
    results_by_id: dict[str, dict[str, Any]] = {}

    for message in messages:
        if message.__class__.__name__ == "ToolMessage":
            text = _result_text(getattr(message, "content", None))
            # The TRUE size, measured before truncation: this is the payload
            # metric §6.6 wants, and it must stay honest even when the body
            # stored next to it has been cut.
            result_bytes = len(text.encode("utf-8"))
            truncated = len(text) > max_result_chars
            results_by_id[message.tool_call_id] = {
                "error": getattr(message, "status", "success") == "error",
                "result": text[:max_result_chars] if truncated else text,
                "resultBytes": result_bytes,
                "resultTruncated": truncated,
            }

    for message in messages:
        for call in getattr(message, "tool_calls", None) or []:
            call_id = call.get("id")
            record = results_by_id.get(call_id)
            calls.append(
                {
                    # `id` makes the correlation between a call and its result
                    # explicit, instead of implied by list position.
                    "id": call_id,
                    "tool": call["name"],
                    "args": call.get("args", {}),
                    "error": record["error"] if record else False,
                    # A call with no ToolMessage never came back (the loop died
                    # on it). Empty result + 0 bytes says exactly that.
                    "result": record["result"] if record else "",
                    "resultBytes": record["resultBytes"] if record else 0,
                    "resultTruncated": record["resultTruncated"] if record else False,
                }
            )
    return calls


async def run_probe(
    *,
    session: Any,
    provider: dict[str, Any],
    prompt: str,
    max_steps: int,
    max_result_chars: int = DEFAULT_MAX_RESULT_CHARS,
    on_event: Callable[[str, dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Run one probe to completion and return its verdict plus the objective record.

    `on_event(type, fields)` is called as tool calls and results appear, for the
    live stream (§6.5). It is a plain callback: this module does no I/O and does
    not know a run directory exists. Events are progress only — the returned
    record is the source of truth (§6.1).

    `session` is a raw MCP `ClientSession` supplied by `mcp_client.mcp_session`.

    Raises `ProbeAborted` — carrying the partial record — if the tool loop or the
    reporting call dies. A probe that crashed has no verdict, but it does have
    evidence, and losing the evidence is what makes such a run undiagnosable.
    """
    from langchain_mcp_adapters.tools import load_mcp_tools
    from langgraph.errors import GraphRecursionError
    from langgraph.prebuilt import create_react_agent

    tools = await load_mcp_tools(session)
    model = build_model(provider)
    agent = create_react_agent(model, tools, prompt=system_prompt())

    # Streamed, not ainvoke(), so that the messages survive a blown step cap.
    # recursion_limit counts graph steps; one agent turn is a model node plus a
    # tool node, hence the doubling, and +1 for the final model answer.
    messages: list[Any] = []
    exhausted = False

    def record(**extra: Any) -> dict[str, Any]:
        """The objective half of the result, always buildable from `messages`."""
        tool_calls = _tool_calls_from(messages, max_result_chars=max_result_chars)
        return {
            "promptVersion": PROMPT_VERSION,
            "toolCallCount": len(tool_calls),
            "toolCalls": tool_calls,
            "exhausted": exhausted,
            **extra,
        }

    # Live emission works by diffing the accumulated `messages` after each state
    # yield, rather than by restructuring the loop around callbacks: with
    # stream_mode="values" the list only ever grows, so an index is enough. A
    # tool node completing IS a state yield, which is exactly the granularity a
    # progress view needs.
    emitted = 0
    pending: dict[Any, tuple[str, float]] = {}

    def drain() -> None:
        nonlocal emitted
        if on_event is None:
            emitted = len(messages)
            return
        for message in messages[emitted:]:
            for call in getattr(message, "tool_calls", None) or []:
                call_id = call.get("id")
                pending[call_id] = (call["name"], time.monotonic())
                on_event(
                    TOOL_CALL,
                    tool_call_fields(tool=call["name"], call_id=call_id, args=call.get("args", {})),
                )
            if message.__class__.__name__ == "ToolMessage":
                call_id = getattr(message, "tool_call_id", None)
                tool_name, started = pending.pop(call_id, ("?", None))
                text = _result_text(getattr(message, "content", None))
                on_event(
                    TOOL_RESULT,
                    tool_result_fields(
                        tool=tool_name,
                        call_id=call_id,
                        ok=getattr(message, "status", "success") != "error",
                        result=text,
                        result_bytes=len(text.encode("utf-8")),
                        # Wall clock between observing the call and observing its
                        # result. Honest about what it measures: it is the step
                        # boundary, so it includes the loop's own overhead and is
                        # not the server's own latency.
                        ms=None if started is None else int((time.monotonic() - started) * 1000),
                    ),
                )
        emitted = len(messages)

    try:
        async for state in agent.astream(
            {"messages": [("user", prompt)]},
            config={"recursion_limit": max_steps * 2 + 1},
            stream_mode="values",
        ):
            messages = state["messages"]
            # Never let a failing event sink break the measurement.
            try:
                drain()
            except Exception:  # noqa: BLE001
                on_event = None
    except GraphRecursionError:
        # A probe that spirals is a FINDING, not a harness error (design §5):
        # it still gets a verdict, reported over the transcript it did produce.
        exhausted = True
    except Exception as exc:  # noqa: BLE001
        # Anything else — a provider 400 mid-loop, a 401, a timeout — is a
        # harness/provider failure with no verdict to report. `Exception`, not
        # `BaseException`: CancelledError and KeyboardInterrupt must still stop
        # the run. The transcript produced so far is handed to the caller.
        raise ProbeAborted(exc, record()) from exc

    # method="function_calling" on purpose. OpenAI's strict structured-output
    # mode rejects `failures[].payload`, which is a free-form object by design
    # (§6.3: "the exact arguments sent") and so cannot declare
    # additionalProperties:false. Keeping the verdict schema verbatim is worth
    # more than strict mode.
    reporter = model.with_structured_output(Verdict, method="function_calling")
    instruction = _REPORT_INSTRUCTION
    if exhausted:
        instruction += (
            "\nYou ran out of steps before finishing. Report the outcome accordingly."
        )
    try:
        verdict: Verdict = await reporter.ainvoke([*messages, ("user", instruction)])
    except Exception as exc:  # noqa: BLE001 - the tool calls must outlive the reporter
        raise ProbeAborted(exc, record()) from exc

    # The cap is objective: the runner overrides an over-optimistic self-report.
    if exhausted and verdict.outcome == "OKAY":
        verdict = verdict.model_copy(update={"outcome": "MIXED"})

    return record(verdict=json.loads(verdict.model_dump_json()))
