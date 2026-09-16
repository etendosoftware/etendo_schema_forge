"""Suite loading and prompt interpolation (design §4, §8).

No LangChain, no provider, no MCP import here: a suite is data.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

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


@dataclass(frozen=True)
class Probe:
    id: str
    mode: str
    prompt: str
    expect_effect: ExpectEffect | None = None


@dataclass(frozen=True)
class Suite:
    path: Path
    window: str
    probes: list[Probe]

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


def load_suite(path: str | Path) -> Suite:
    path = Path(path)
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    raw_probes = data.get("probes") or []

    probes: list[Probe] = []
    seen: set[str] = set()
    for entry in raw_probes:
        probe_id = entry["id"]
        if probe_id in seen:
            raise ValueError(f"Duplicate probe id {probe_id!r} in {path.name}")
        seen.add(probe_id)
        mode = entry.get("mode", "read")
        raw_effect = entry.get("expectEffect")
        if raw_effect and mode != "write":
            raise ValueError(
                f"Probe {probe_id!r}: expectEffect is only valid on mode: write probes."
            )
        effect = None
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
            )
        )

    return Suite(path=path, window=data.get("window", path.stem), probes=probes)


def interpolate(prompt: str, *, run_id: str, probe_id: str, timestamp: str) -> str:
    """Expand {{marker}} / {{runId}} / {{probeId}} / {{timestamp}}."""
    values = {
        "marker": f"{run_id}-{probe_id}",
        "runId": run_id,
        "probeId": probe_id,
        "timestamp": timestamp,
    }
    return _TOKEN_RE.sub(lambda m: values[m.group(1)], prompt)


def interpolate_args(args: Any, *, run_id: str, probe_id: str, timestamp: str) -> Any:
    """Expand the templating tokens inside an expectEffect args tree."""
    if isinstance(args, str):
        return interpolate(args, run_id=run_id, probe_id=probe_id, timestamp=timestamp)
    if isinstance(args, dict):
        return {
            k: interpolate_args(v, run_id=run_id, probe_id=probe_id, timestamp=timestamp)
            for k, v in args.items()
        }
    if isinstance(args, list):
        return [
            interpolate_args(v, run_id=run_id, probe_id=probe_id, timestamp=timestamp)
            for v in args
        ]
    return args
