"""Starting a run the way a human would: by shelling out to the CLI (D11).

No import of runner internals to EXECUTE anything, no socket, no shared memory.
The UI builds the exact command line a person could paste into a terminal, runs
it, and then learns everything else from the files that command writes.

The subprocess's stdout+stderr go to a log file under `runs/.ui/`, not to a pipe
read by a thread: Streamlit re-executes the script on every interaction, and a
file survives that where an in-process reader does not. The log is also the only
place the OAuth prompt can appear, because preflight runs before the run
directory exists.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

HARNESS_ROOT = Path(__file__).resolve().parent.parent
RUNS_DIR = HARNESS_ROOT / "runs"
UI_LOG_DIR = RUNS_DIR / ".ui"


def build_command(
    *,
    target: str,
    suite: str,
    probe: str | None = None,
    model: str | None = None,
    use_uv: bool | None = None,
) -> list[str]:
    """The command line, verbatim, that the UI will run and display.

    `--interactive` is always passed: a subprocess spawned by Streamlit has no
    TTY, so the CLI's headless auto-detection would refuse to open a browser for
    OAuth and turn every probe into `harnessError: auth`. The UI is, by
    definition, a human sitting in front of a browser.
    """
    if use_uv is None:
        use_uv = shutil.which("uv") is not None
    prefix = ["uv", "run", "python"] if use_uv else [sys.executable]
    cmd = [*prefix, "-m", "runner.cli", "--target", target, "--suite", suite, "--interactive"]
    if probe:
        cmd += ["--probe", probe]
    if model:
        cmd += ["--model", model]
    return cmd


def launch(cmd: list[str], log_path: Path) -> Any:
    """Start the run detached from Streamlit's own lifecycle."""
    log_path.parent.mkdir(parents=True, exist_ok=True)
    handle = log_path.open("w", encoding="utf-8")
    return subprocess.Popen(
        cmd,
        cwd=str(HARNESS_ROOT),
        stdout=handle,
        stderr=subprocess.STDOUT,
        # PYTHONUNBUFFERED, not bufsize: the child writes to a FILE, so its own
        # stdout is block-buffered and the parent's buffering setting changes
        # nothing. A line stuck in a 4 KB buffer is a line the UI cannot show,
        # and the OAuth URL — printed while the run then blocks for up to
        # MCP_TEST_AUTH_WAIT seconds — is exactly such a line.
        env={**os.environ, "PYTHONUNBUFFERED": "1"},
        text=True,
    )


def read_log(log_path: Path) -> str:
    try:
        return log_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
