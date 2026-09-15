"""The structured verdict an agent returns about one probe (design §6.3).

This module is deliberately free of any LangChain or provider import: it is the
contract, and it must survive a change of agent library (design §5).
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

VERDICT_SCHEMA_VERSION = 3

Phase = Literal["discovery", "schema", "write", "action", "read"]
Outcome = Literal["OKAY", "ERROR", "MIXED"]

#: Deliberately CONSTRUCTIVE categories only — what should exist, never a verdict
#: on whether something is broken. An agent cannot tell "the product is defective"
#: from "I failed to find it", so asking it to would fill the corpus with its own
#: ignorance labelled as defects. That judgement belongs to a human under the UI
#: test (D22). If a `bug`/`error` value ever looks necessary here, it is the
#: design that needs revisiting, not this list.
#:
#: `other` is a first-class choice, not a failure state: a closed enum makes an
#: agent cram a bad fit into a real category, which corrupts the data silently
#: and invisibly. What accumulates under `other` is how the next missing category
#: gets discovered.
SuggestionKind = Literal[
    "shortcut", "missingCapability", "clearerDocs", "betterMetadata", "other"
]


class Friction(BaseModel):
    """Something that was hard, ambiguous, or had to be guessed at."""

    what: str = Field(description="What was difficult, ambiguous or unclear.")
    cost: str = Field(description="What it cost, e.g. '3 wasted calls'.")
    phase: Phase = Field(description="Where in the task the difficulty occurred.")


class Failure(BaseModel):
    """A tool call that failed — including one the agent later fixed itself.

    A silently self-corrected error is still a product defect, so `recovered`
    must never be used as a reason to omit the entry.
    """

    tool: str = Field(description="Exact name of the tool that failed.")
    payload: dict[str, Any] = Field(
        default_factory=dict,
        description="The exact arguments sent on the failing call.",
    )
    error: str = Field(description="The error returned, verbatim.")
    recovered: bool = Field(description="Whether the agent afterwards worked around it.")
    howRecovered: str | None = Field(
        default=None, description="How it was worked around, if it was."
    )


class WastedCall(BaseModel):
    """A tool call that SUCCEEDED but contributed nothing to the task.

    Distinct from `Failure`, which errored. A 200 that turned out useless is the
    invisible cost bad documentation or metadata produces: nothing in the
    transcript marks it, because nothing went wrong. It gets its own list rather
    than being folded into `frictions`, so it can be counted.
    """

    tool: str = Field(description="Exact name of the tool you called.")
    expected: str = Field(
        description="What you expected this call to return, as you expected it BEFORE "
        "you made the call."
    )
    whatHappened: str = Field(
        description="What it actually returned, and why that was of no use to you."
    )


class Suggestion(BaseModel):
    """Something that should exist, as opposed to something that went wrong.

    The constructive channel of the verdict: `failures` records what broke,
    `frictions` what was hard, `wastedCalls` what was useless, and this what is
    missing. Structured rather than prose because this is the field the whole
    harness exists to produce — a sentence cannot be counted, grouped, or
    compared across runs.
    """

    what: str = Field(description="What should exist, or what should change.")
    kind: SuggestionKind = Field(
        description="Which kind of thing this is: `shortcut` (a way to do in one step "
        "what took several), `missingCapability` (something the system does not let you "
        "do at all), `clearerDocs` (it exists, but nothing told you so, or told you "
        "wrongly), `betterMetadata` (a name, description or field that should have said "
        "what it was), or `other`. Choose `other` freely whenever none of the rest "
        "genuinely fits — a suggestion filed under the wrong category is worse than one "
        "filed under `other`."
    )
    wouldHaveSaved: str = Field(
        description="What this would have saved you on THIS task, specifically — the "
        "calls, the guesses or the dead ends it would have avoided. If it would have "
        "saved you nothing here, say so plainly: a suggestion that helps somebody else "
        "is still worth making, and a payoff invented for this task is worth nothing."
    )


class Verdict(BaseModel):
    """The agent's own self-report. Subjective by construction (design §6.1).

    `plannedApproach` and `howKnown` carry a bias that is accepted on purpose and
    must not be read as ground truth: they are asked AFTER the task is over, so
    they are RECALL, not the plan. The agent already knows how things turned out
    and will reconstruct something more coherent than what it actually had. They
    are still worth having because the objective tool-call sequence is recorded
    alongside them (§6.1): the contrast between the claimed plan and the executed
    one is informative even when the claim is polished. Read them against the
    transcript, never on their own.
    """

    schemaVersion: int = Field(
        default=VERDICT_SCHEMA_VERSION,
        description="Verdict schema version. Always 3 for now.",
    )
    outcome: Outcome = Field(
        description="OKAY only if the task was fully completed; MIXED if partially; "
        "ERROR if it was not completed."
    )
    summary: str = Field(description="One sentence: what happened.")
    achieved: str = Field(description="What was actually accomplished, not attempted.")
    plannedApproach: str | None = Field(
        default=None,
        description="Recall the plan you had BEFORE you started: the sequence of tools "
        "you intended to use, as you understood the task at the time — for example "
        "'list the entities, then read the schema of the right one, then create the "
        "record'. Report what you actually believed then, not the route that turned "
        "out to work. If you had no plan and worked it out as you went, say exactly "
        "that: it is a complete and acceptable answer.",
    )
    howKnown: str | None = Field(
        default=None,
        description="Where that plan came from. Name the specific source: the output of "
        "a particular tool (name the tool and say what in its output told you), the "
        "description of a particular tool, knowledge you already had, or guesswork. "
        "'I guessed' is a valid and valuable answer — say so plainly rather than "
        "inventing a source. A vague answer such as 'from the tools' is of no use.",
    )
    frictions: list[Friction] = Field(default_factory=list)
    failures: list[Failure] = Field(default_factory=list)
    wastedCalls: list[WastedCall] = Field(
        default_factory=list,
        description="Calls that SUCCEEDED but got you nowhere: they returned no error, "
        "and the answer turned out to be of no use for the task. They cost you just as "
        "much as a failure did, and nothing in the record shows them unless you report "
        "them here.",
    )
    suggestions: list[Suggestion] = Field(
        default_factory=list,
        description="What would have made this task easy: the things that should exist "
        "but do not. Not a list of what went wrong — that is what the other lists are "
        "for.",
    )
