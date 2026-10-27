#!/usr/bin/env python3
"""Generate Codex, OpenCode and omp subagent definitions from .claude/agents/*.md.

Subagents are the one layer of agent configuration with no shared standard:
Claude uses Markdown + YAML frontmatter, Codex uses TOML, OpenCode and
oh-my-pi (omp) use Markdown with different schemas. Instructions (AGENTS.md)
and skills (SKILL.md) converged; this did not. So the Claude files stay the
single source and the others are generated, with every dropped field recorded
in the generated file itself.

Usage: lib-gen-agents.py <src-dir> <codex-out-dir> <opencode-out-dir> <omp-out-dir>
"""
import json
import pathlib
import sys

import yaml

REGEN = "Regenerate: make sync-agents"

# OpenCode rejects the whole config unless `color` is #RRGGBB or a theme token,
# so Claude's named colors are translated; anything unknown is dropped.
OPENCODE_COLORS = {
    "red": "error",
    "green": "success",
    "yellow": "warning",
    "blue": "info",
    "purple": "#a855f7",
    "pink": "#ec4899",
    "cyan": "#06b6d4",
    "orange": "#f97316",
    "gray": "#6b7280",
}


def split_frontmatter(text):
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---\n", 3)
    if end == -1:
        return {}, text
    meta = yaml.safe_load(text[4:end]) or {}
    return meta, text[end + 5 :].lstrip("\n")


def toml_multiline(value):
    # TOML multi-line basic string: only \ and a literal """ need escaping.
    value = value.replace("\\", "\\\\").replace('"""', '\\"\\"\\"')
    if not value.endswith("\n"):
        value += "\n"
    return '"""\n' + value + '"""'


# Claude tool names -> omp tool names. omp discovers project subagents only in
# .omp/agents/*.md (it skips .claude/agents, .codex/agents and .opencode/agents).
OMP_TOOLS = {
    "read": "read",
    "write": "write",
    "edit": "edit",
    "bash": "bash",
    "grep": "grep",
    "glob": "glob",
}


def omp_tools(value):
    names = value if isinstance(value, list) else str(value).split(",")
    out = []
    for raw in names:
        n = raw.strip().lower()
        if n:
            out.append(OMP_TOOLS.get(n, n))
    return out


def main(src_dir, codex_dir, opencode_dir, omp_dir):
    src = pathlib.Path(src_dir)
    codex = pathlib.Path(codex_dir)
    opencode = pathlib.Path(opencode_dir)
    omp = pathlib.Path(omp_dir)
    codex.mkdir(parents=True, exist_ok=True)
    opencode.mkdir(parents=True, exist_ok=True)
    omp.mkdir(parents=True, exist_ok=True)

    count = 0
    for path in sorted(src.glob("*.md")):
        meta, body = split_frontmatter(path.read_text())
        name = meta.get("name") or path.stem
        description = (meta.get("description") or "").strip()
        rel = f".claude/agents/{path.name}"

        # --- what cannot cross over ------------------------------------------
        # `tools` is a Claude allowlist; Codex has no per-agent allowlist (it
        # scopes with sandbox_mode) and OpenCode deprecated `tools` in favour
        # of a `permission` object. `model: inherit` is Claude-only. `color`
        # exists in OpenCode but not in Codex.
        dropped_codex = []
        dropped_opencode = []
        if meta.get("tools"):
            dropped_codex.append("tools (Codex scopes with sandbox_mode, not an allowlist)")
            dropped_opencode.append("tools (deprecated in OpenCode; use a permission object)")
        if meta.get("model"):
            note = f"model: {meta['model']} (Claude-specific)"
            dropped_codex.append(note)
            dropped_opencode.append(note)
        if meta.get("color"):
            dropped_codex.append("color (no Codex equivalent)")
        opencode_color = OPENCODE_COLORS.get(str(meta.get("color", "")).lower())
        if meta.get("color") and not opencode_color:
            dropped_opencode.append(f"color: {meta['color']} (not an OpenCode color)")

        # --- Codex: .codex/agents/<name>.toml --------------------------------
        lines = [
            f"# GENERATED MIRROR - DO NOT EDIT. Source: {rel} - {REGEN}",
        ]
        for d in dropped_codex:
            lines.append(f"# Dropped in translation: {d}")
        lines += [
            "",
            f"name = {json.dumps(name, ensure_ascii=False)}",
            f"description = {json.dumps(description, ensure_ascii=False)}",
            f"developer_instructions = {toml_multiline(body)}",
            "",
        ]
        (codex / f"{name}.toml").write_text("\n".join(lines))

        # --- OpenCode: .opencode/agents/<name>.md ----------------------------
        # Only emit fields OpenCode knows: it forwards UNKNOWN frontmatter keys
        # to the model provider as options, so a stray `tools:` would be sent
        # to the LLM as a parameter rather than ignored.
        fm = [
            "---",
            f"description: {json.dumps(description, ensure_ascii=False)}",
            "mode: subagent",
        ]
        if opencode_color:
            fm.append(f"color: {json.dumps(opencode_color)}")
        fm.append("---")

        note = [f"<!-- GENERATED MIRROR - DO NOT EDIT. Source: {rel} - {REGEN}"]
        for d in dropped_opencode:
            note.append(f"     Dropped in translation: {d}")
        note.append("-->")

        (opencode / f"{name}.md").write_text(
            "\n".join(fm) + "\n\n" + "\n".join(note) + "\n\n" + body
        )

        # --- omp: .omp/agents/<name>.md --------------------------------------
        # `model: inherit` is Claude-only (omitting model makes omp inherit the
        # parent's); `color` has no omp equivalent. Omitted `tools` selects omp's
        # default toolset, like Claude's.
        dropped_omp = []
        if meta.get("model"):
            dropped_omp.append(f"model: {meta['model']} (Claude-specific; omp inherits the parent model)")
        if meta.get("color"):
            dropped_omp.append("color (no omp equivalent)")
        ofm = [
            "---",
            f"name: {json.dumps(name, ensure_ascii=False)}",
            f"description: {json.dumps(description, ensure_ascii=False)}",
        ]
        if meta.get("tools"):
            ofm.append(f"tools: {', '.join(omp_tools(meta['tools']))}")
        ofm.append("---")
        onote = [f"<!-- GENERATED MIRROR - DO NOT EDIT. Source: {rel} - {REGEN}"]
        for d in dropped_omp:
            onote.append(f"     Dropped in translation: {d}")
        onote.append("-->")
        (omp / f"{name}.md").write_text(
            "\n".join(ofm) + "\n\n" + "\n".join(onote) + "\n\n" + body
        )
        count += 1

    print(count)


if __name__ == "__main__":
    main(*sys.argv[1:5])
