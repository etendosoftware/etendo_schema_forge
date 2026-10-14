"""Suite loading and prompt interpolation (design §4, §8).

No LangChain, no provider, no MCP import here: a suite is data.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any

import yaml

from .matcher import is_small_literal, normalize_spec
from .steps import Step, parse_steps

#: Suite schema versions this loader reads. v1 is the original single-target
#: shape (no `schemaVersion` key); v2 adds vendor-neutral prompts with
#: per-platform blocks (D45, D46, D49; plan §5.3).
SUITE_SCHEMA_VERSIONS = (1, 2)
#: Same list as config.PLATFORMS; repeated so a suite stays plain data.
PLATFORMS = ("etendo-go", "holded")
CATEGORIES = ("query", "write", "flow", "error")
NOT_POSSIBLE_KINDS = ("goal", "setup")
#: Tool-shaped words a prompt may never contain, whatever the catalogue says:
#: Etendo's own tool family. The live catalogue check at preflight covers the
#: rest (any other vendor's names), see `prompt_tool_mentions`.
_TOOL_SHAPED = re.compile(r"\b(?:etendo|neo)_[a-z_]+\b", re.IGNORECASE)

# Tokens interpolated into prompts and expectEffect args (design §8). An unknown
# `{{...}}` is left untouched rather than silently blanked, so a typo is visible
# in the prompt the agent actually received.
#
# {{marker}} is what a WRITE probe must use to tag the record it creates. It is
# `<runId>-<probeId>`, so two probes in the same run can never write the same
# marker — {{runId}} alone identifies the RUN, and using it as a write marker
# let one probe's effect check pass on another probe's record. Because the
# marker still STARTS with the run id, the run-wide sweep
# (`description LIKE '%<runId>%'`) keeps working unchanged.
_TOKEN_RE = re.compile(r"\{\{\s*(marker|runId|probeId|timestamp)\s*\}\}")


@dataclass(frozen=True)
class ExpectEffect:
    """A post-condition for a write probe (narrow amendment to D7).

    Answers exactly one question — did the effect the agent CLAIMED actually
    happen? — because a run proved that neither the verdict nor the transcript
    can see that: both reported success while the record was never written.

    Deliberately thin. It asserts nothing about which tools the agent used, the
    path it took, or field-by-field state.
    """

    tool: str
    args: dict[str, Any]
    expect: str  # "atLeastOne" | "none"
    # Suite v2 (plan §5.3): exact-match conditions the RUNNER applies to the
    # returned rows (dotted paths allowed). For tools that cannot filter by the
    # field server-side; keeps the check deterministic without assuming filters.
    where: dict[str, Any] | None = None


@dataclass(frozen=True)
class NotPossible:
    """A task this platform's MCP cannot do (D49): declared, never inferred.

    `kind: goal` — the MCP cannot do what the task asks; `kind: setup` — it
    cannot build the starting state. `missing_tools` are checked against the
    live tools/list at preflight; a tool that has since appeared makes the
    declaration `invalidDeclaration`.
    """

    kind: str
    reason: str
    missing_tools: tuple[str, ...] = ()

    def to_json(self) -> dict[str, Any]:
        return {"kind": self.kind, "reason": self.reason, "missingTools": list(self.missing_tools)}


@dataclass(frozen=True)
class PlatformBlock:
    """What one platform needs to run and verify a v2 probe."""

    setup: tuple[Step, ...] = ()
    teardown: tuple[Step, ...] = ()
    expect_effect: ExpectEffect | None = None
    expect_answer: dict[str, Any] | None = None
    expect_outcome: str | None = None
    not_possible: NotPossible | None = None


@dataclass(frozen=True)
class Probe:
    id: str
    mode: str
    prompt: str
    expect_effect: ExpectEffect | None = None
    # Deterministic tool calls the runner makes itself, outside the agent (D41).
    setup: tuple[Step, ...] = ()
    teardown: tuple[Step, ...] = ()
    # Runs alone when attempts run in parallel (D44, plan §5.2): for a probe
    # that cannot keep to records tagged with its own {{marker}}.
    exclusive: bool = False
    # --- suite v2 (plan §5.3, §5.5) ---
    category: str | None = None
    # Deterministic matcher spec over `finalAnswer` (D46, runner/matcher.py).
    expect_answer: dict[str, Any] | None = None
    # "refused": success = the declared checks hold AND the agent did not
    # report OKAY — the one place the self-report enters success (plan §5.5).
    expect_outcome: str | None = None
    # Set on a probe resolved for a platform that declared it impossible.
    not_possible: NotPossible | None = None
    # v2 only: the per-platform blocks, keyed by platform. None on a v1 probe.
    platforms: dict[str, PlatformBlock] | None = field(default=None, compare=False)

    @property
    def verifies(self) -> bool:
        """Whether anything objective decides success for this (resolved) probe."""
        return bool(self.expect_effect or self.expect_answer or self.expect_outcome)

    def for_platform(self, platform: str | None) -> "Probe":
        """This probe as one platform runs it (D45).

        A v1 probe is returned unchanged. A v2 probe takes its setup, teardown
        and checks from the platform's block — or carries `not_possible`.
        Raises KeyError when the probe has no block for that platform: every
        v2 task must say, per platform it runs on, how it is verified or why
        it cannot be done.
        """
        if self.platforms is None:
            return self
        if platform not in self.platforms:
            raise KeyError(
                f"Probe {self.id!r} declares no `platforms.{platform}` block "
                f"(it has: {', '.join(sorted(self.platforms))})."
            )
        block = self.platforms[platform]
        return replace(
            self,
            setup=block.setup,
            teardown=block.teardown,
            expect_effect=block.expect_effect,
            expect_answer=block.expect_answer,
            expect_outcome=block.expect_outcome,
            not_possible=block.not_possible,
        )


@dataclass(frozen=True)
class Suite:
    path: Path
    window: str
    probes: list[Probe]
    # The suite's `decision:` block, verbatim (D47): ruleVersion and the margins
    # of runner/decide.py. None = the rule's defaults. Copied into compare.json.
    decision: dict[str, Any] | None = None
    schema_version: int = 1

    @property
    def sha(self) -> str:
        """Short content hash, recorded in the run header (design §6.2)."""
        return hashlib.sha256(self.path.read_bytes()).hexdigest()[:8]

    def probe(self, probe_id: str) -> Probe:
        for p in self.probes:
            if p.id == probe_id:
                return p
        known = ", ".join(p.id for p in self.probes)
        raise KeyError(f"No probe {probe_id!r} in {self.path.name}. Known probes: {known}")


def _parse_effect(raw: Any, probe_id: str, *, allow_where: bool) -> ExpectEffect | None:
    if not raw:
        return None
    expect = raw.get("expect", "atLeastOne")
    if expect not in ("atLeastOne", "none"):
        raise ValueError(
            f"Probe {probe_id!r}: expectEffect.expect must be "
            f"'atLeastOne' or 'none', got {expect!r}."
        )
    where = raw.get("where")
    if where is not None and (not allow_where or not isinstance(where, dict) or not where):
        raise ValueError(f"Probe {probe_id!r}: expectEffect.where is a non-empty mapping (suite v2 only).")
    return ExpectEffect(tool=raw["tool"], args=raw.get("args", {}), expect=expect, where=where)


def load_suite(path: str | Path) -> Suite:
    path = Path(path)
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    version = data.get("schemaVersion", 1)
    if version not in SUITE_SCHEMA_VERSIONS:
        raise ValueError(f"{path.name}: suite schemaVersion {version!r} is not supported "
                         f"(this loader reads {SUITE_SCHEMA_VERSIONS}).")
    decision = data.get("decision")
    if decision is not None and not isinstance(decision, dict):
        raise ValueError(f"{path.name}: decision must be a mapping.")
    window = data.get("window", path.stem)
    if version == 2:
        return Suite(path=path, window=window, probes=_load_v2_probes(data, path),
                     decision=decision, schema_version=2)
    return Suite(path=path, window=window, probes=_load_v1_probes(data, path), decision=decision)


def _load_v1_probes(data: dict[str, Any], path: Path) -> list[Probe]:
    """The original shape, byte-for-byte the same behaviour as before v2."""
    raw_probes = data.get("probes") or []

    probes: list[Probe] = []
    seen: set[str] = set()
    for entry in raw_probes:
        probe_id = entry["id"]
        if probe_id in seen:
            raise ValueError(f"Duplicate probe id {probe_id!r} in {path.name}")
        seen.add(probe_id)
        mode = entry.get("mode", "read")
        exclusive = entry.get("exclusive", False)
        if not isinstance(exclusive, bool):
            raise ValueError(f"Probe {probe_id!r}: exclusive must be true or false.")
        raw_effect = entry.get("expectEffect")
        if raw_effect and mode != "write":
            raise ValueError(
                f"Probe {probe_id!r}: expectEffect is only valid on mode: write probes."
            )
        effect = None
        if raw_effect and "where" in raw_effect:
            raise ValueError(f"Probe {probe_id!r}: expectEffect.where needs a v2 suite (schemaVersion: 2).")
        if raw_effect:
            expect = raw_effect.get("expect", "atLeastOne")
            if expect not in ("atLeastOne", "none"):
                raise ValueError(
                    f"Probe {probe_id!r}: expectEffect.expect must be "
                    f"'atLeastOne' or 'none', got {expect!r}."
                )
            effect = ExpectEffect(
                tool=raw_effect["tool"], args=raw_effect.get("args", {}), expect=expect
            )

        probes.append(
            Probe(
                id=probe_id,
                mode=mode,
                prompt=entry["prompt"].strip(),
                expect_effect=effect,
                setup=tuple(parse_steps(entry.get("setup"), probe_id=probe_id, phase="setup")),
                teardown=tuple(
                    parse_steps(entry.get("teardown"), probe_id=probe_id, phase="teardown")
                ),
                exclusive=exclusive,
            )
        )

    return probes


def _load_v2_probes(data: dict[str, Any], path: Path) -> list[Probe]:
    """Suite v2 (D45): one vendor-neutral prompt, one block per platform."""
    probes: list[Probe] = []
    seen: set[str] = set()
    for entry in data.get("probes") or []:
        probe_id = entry["id"]
        if probe_id in seen:
            raise ValueError(f"Duplicate probe id {probe_id!r} in {path.name}")
        seen.add(probe_id)
        for key in ("setup", "teardown", "expectEffect", "expectAnswer", "expectOutcome", "notPossible"):
            if key in entry:
                raise ValueError(f"Probe {probe_id!r}: `{key}` belongs inside a `platforms.<platform>` "
                                 f"block in a v2 suite.")
        category = entry.get("category")
        if category not in CATEGORIES:
            raise ValueError(f"Probe {probe_id!r}: category must be one of {CATEGORIES}, got {category!r}.")
        exclusive = entry.get("exclusive", False)
        if not isinstance(exclusive, bool):
            raise ValueError(f"Probe {probe_id!r}: exclusive must be true or false.")
        raw_platforms = entry.get("platforms")
        if not isinstance(raw_platforms, dict) or not raw_platforms:
            raise ValueError(f"Probe {probe_id!r}: a v2 probe needs a non-empty `platforms:` mapping.")
        blocks = {}
        for platform, raw in raw_platforms.items():
            if platform not in PLATFORMS:
                raise ValueError(f"Probe {probe_id!r}: unknown platform {platform!r} (known: {PLATFORMS}).")
            blocks[platform] = _parse_block(raw or {}, f"{probe_id}/{platform}",
                                            mode=entry.get("mode", "read"))
        prompt = entry["prompt"].strip()
        probe = Probe(id=probe_id, mode=entry.get("mode", "read"), prompt=prompt,
                      exclusive=exclusive, category=category, platforms=blocks)
        _lint_prompt(probe)
        probes.append(probe)
    return probes


def _parse_block(raw: dict[str, Any], where: str, *, mode: str = "read") -> PlatformBlock:
    if "notPossible" in raw:
        extra = set(raw) - {"notPossible"}
        if extra:
            raise ValueError(f"Probe {where}: a notPossible block declares nothing else (found {sorted(extra)}).")
        np = raw["notPossible"] or {}
        if np.get("kind") not in NOT_POSSIBLE_KINDS:
            raise ValueError(f"Probe {where}: notPossible.kind must be one of {NOT_POSSIBLE_KINDS}.")
        if not str(np.get("reason") or "").strip():
            raise ValueError(f"Probe {where}: notPossible needs a reason.")
        missing = np.get("missingTools") or []
        if not isinstance(missing, list) or not all(isinstance(t, str) and t for t in missing):
            raise ValueError(f"Probe {where}: notPossible.missingTools must be a list of tool names.")
        return PlatformBlock(not_possible=NotPossible(np["kind"], np["reason"].strip(), tuple(missing)))

    unknown = set(raw) - {"setup", "teardown", "expectEffect", "expectAnswer", "expectOutcome"}
    if unknown:
        raise ValueError(f"Probe {where}: unknown keys {sorted(unknown)}.")
    outcome = raw.get("expectOutcome")
    if outcome is not None and outcome != "refused":
        raise ValueError(f"Probe {where}: expectOutcome can only be `refused`, got {outcome!r}.")
    answer = raw.get("expectAnswer")
    if answer is not None:
        try:
            spec = normalize_spec(answer)
        except ValueError as exc:
            raise ValueError(f"Probe {where}: {exc}") from exc
        loose = [i for i in spec["all"] + spec["none"] if is_small_literal(i)]
        if loose:
            raise ValueError(
                f"Probe {where}: expectAnswer number(s) {[i['number'] for i in loose]} are small "
                f"integers with no `near:` anchor (or tolerance/percent); a bare 3 or 10 matches "
                f"almost any answer. Add `near: <text the number sits next to>`."
            )
    block = PlatformBlock(
        setup=tuple(parse_steps(raw.get("setup"), probe_id=where, phase="setup")),
        teardown=tuple(parse_steps(raw.get("teardown"), probe_id=where, phase="teardown")),
        expect_effect=_parse_effect(raw.get("expectEffect"), where, allow_where=True),
        expect_answer=answer,
        expect_outcome=outcome,
    )
    if block.expect_outcome == "refused":
        # Plan §5.5: refused = OBJECTIVE no effect AND the agent not reporting
        # OKAY. A write refusal must therefore prove the absence of the effect.
        effect = block.expect_effect
        if effect is not None and effect.expect != "none":
            raise ValueError(f"Probe {where}: expectOutcome: refused with expectEffect.expect: "
                             f"{effect.expect} is contradictory; a refusal expects `none`.")
        if mode == "write" and effect is None:
            raise ValueError(f"Probe {where}: a mode: write refusal needs expectEffect with "
                             f"expect: none — the agent's word alone does not prove nothing was written.")
    if not (block.expect_effect or block.expect_answer or block.expect_outcome):
        raise ValueError(f"Probe {where}: declares no verification (expectEffect, expectAnswer or "
                         f"expectOutcome) and is not notPossible. Every v2 task verifies on every "
                         f"platform it runs on (plan §5.3).")
    return block


def _suite_tools(probe: Probe) -> set[str]:
    """Every tool name the suite itself names for this probe, on any platform."""
    names: set[str] = set()
    for block in (probe.platforms or {}).values():
        names.update(s.tool for s in block.setup + block.teardown)
        if block.expect_effect:
            names.add(block.expect_effect.tool)
        if block.not_possible:
            names.update(block.not_possible.missing_tools)
    return names


def prompt_tool_mentions(prompt: str, tool_names: Any) -> list[str]:
    """Tool names that appear as whole words in a prompt (case-insensitive).

    Used twice: at load against the names the suite itself mentions plus the
    Etendo tool family, and at preflight against every target's live
    tools/list (plan §5.3: neutrality enforced, not hoped for).
    """
    found = set(m.group(0) for m in _TOOL_SHAPED.finditer(prompt))
    for name in tool_names:
        if name and re.search(rf"(?<![\w]){re.escape(name)}(?![\w])", prompt, re.IGNORECASE):
            found.add(name)
    return sorted(found)


def _lint_prompt(probe: Probe) -> None:
    if "{{fixture." in probe.prompt.replace(" ", ""):
        raise ValueError(f"Probe {probe.id!r}: {{{{fixture.*}}}} lands with the baseline dataset (S6).")
    mentions = prompt_tool_mentions(probe.prompt, _suite_tools(probe))
    if mentions:
        raise ValueError(f"Probe {probe.id!r}: the shared prompt names tool(s) {mentions}; a v2 "
                         f"prompt is vendor-neutral and never names a tool (plan §5.3).")


def attempt_marker(prefix: str, probe_id: str, attempt: int) -> str:
    """`{{marker}}` for one attempt (D43, plan §5.1): `<prefix>-<probeId>-a<n>`.

    Unique per probe AND attempt, so one attempt's effect check can never pass on
    a sibling attempt's record. `prefix` is the run id today; a comparison (S3)
    passes its compareId, which keeps the marker — and so the prompt text —
    byte-identical across targets for the same attempt. It still starts with the
    prefix, so the leftover sweep of design §8 keeps matching it.
    """
    return f"{prefix}-{probe_id}-a{attempt}"


def interpolate(
    prompt: str, *, run_id: str, probe_id: str, timestamp: str, marker: str | None = None
) -> str:
    """Expand {{marker}} / {{runId}} / {{probeId}} / {{timestamp}}.

    `marker` defaults to the pre-REPEAT form `<runId>-<probeId>`; the runner
    always passes `attempt_marker(...)`.
    """
    values = {
        "marker": marker if marker is not None else f"{run_id}-{probe_id}",
        "runId": run_id,
        "probeId": probe_id,
        "timestamp": timestamp,
    }
    return _TOKEN_RE.sub(lambda m: values[m.group(1)], prompt)


def interpolate_args(
    args: Any, *, run_id: str, probe_id: str, timestamp: str, marker: str | None = None
) -> Any:
    """Expand the templating tokens inside an expectEffect args tree."""
    kw = {"run_id": run_id, "probe_id": probe_id, "timestamp": timestamp, "marker": marker}
    if isinstance(args, str):
        return interpolate(args, **kw)
    if isinstance(args, dict):
        return {k: interpolate_args(v, **kw) for k, v in args.items()}
    if isinstance(args, list):
        return [interpolate_args(v, **kw) for v in args]
    return args
