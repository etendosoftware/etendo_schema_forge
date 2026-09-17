"""Configuration resolution.

POLICY: secrets by reference, everything else by value.

- `config.toml` holds the LITERAL values of provider, model, base_url,
  temperature, max_steps and the target URLs. They are not secrets, and they
  must be readable at a glance in a file.
- Only the API key stays in the environment. The config names the variable
  (`api_key_env`); it never holds the key itself.
- The config file WINS over the environment for everything that is not a
  secret. An ambient env var that silently beat the config is exactly the
  invisibility this policy exists to remove: you would learn what you ran with
  only after you ran it. The explicit escape hatches are CLI flags
  (`--model`, `--max-steps`), which are visible in the command you typed.

Plain data only — no auth logic (that is `mcp_client.py`), no provider import
(that is `agent.py`).
"""

from __future__ import annotations

import os
import tomllib
from pathlib import Path
from typing import Any

HARNESS_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = HARNESS_ROOT / "config.toml"
EXAMPLE_CONFIG = HARNESS_ROOT / "config.example.toml"


def load_config(path: str | Path | None = None) -> dict[str, Any]:
    """Load config.toml, falling back to config.example.toml.

    The example carries no secrets — only the name of the environment variable
    holding the key — so falling back to it is safe and makes a fresh checkout
    runnable.
    """
    candidate = Path(path) if path else DEFAULT_CONFIG
    if not candidate.exists():
        candidate = EXAMPLE_CONFIG
    if not candidate.exists():
        return {}
    with candidate.open("rb") as fh:
        return tomllib.load(fh)


def env_or(name: str | None, default: str | None = None) -> str | None:
    """Read the env var `name` (when given), else `default`. Blank counts as unset."""
    if not name:
        return default
    value = os.environ.get(name)
    return value if value else default


def provider_settings(config: dict[str, Any], *, model: str | None = None) -> dict[str, Any]:
    """Resolve the LLM provider block from the config file.

    `model` is the `--model` CLI flag: the one explicit, visible override.
    Nothing here reads an ambient environment variable except the API key,
    and that is read by NAME, from the config.
    """
    block = config.get("provider", {})
    return {
        "name": block.get("name", "openai"),
        "model": model or block.get("model"),
        "base_url": block.get("base_url"),
        "temperature": float(block.get("temperature", 0)),
        "api_key": env_or(block.get("api_key_env", "OPENAI_API_KEY")),
        # Recorded so the run can state WHERE the key came from without ever
        # recording the key itself.
        "api_key_env": block.get("api_key_env", "OPENAI_API_KEY"),
    }


def max_steps(config: dict[str, Any], *, override: int | None = None) -> int:
    return int(override or config.get("run", {}).get("max_steps", 25))


def max_result_chars(config: dict[str, Any]) -> int:
    """How much of each tool RESULT is stored per call.

    No CLI override on purpose: the config file wins, and only `--model` and
    `--max-steps` are visible escape hatches.
    """
    return int(config.get("run", {}).get("max_result_chars", 20000))


def target_settings(config: dict[str, Any], name: str) -> dict[str, Any]:
    targets = config.get("targets", {})
    if name not in targets:
        known = ", ".join(sorted(targets)) or "(none configured)"
        raise KeyError(f"Unknown target {name!r}. Configured targets: {known}")
    return {"name": name, **targets[name]}
