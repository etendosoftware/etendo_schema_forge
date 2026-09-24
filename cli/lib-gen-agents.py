#!/usr/bin/env python3
"""Generate Codex and OpenCode subagent definitions from .claude/agents/*.md.

Subagents are the one layer of agent configuration with no shared standard:
Claude uses Markdown + YAML frontmatter, Codex uses TOML, OpenCode uses
Markdown with a different schema. Instructions (AGENTS.md) and skills
(SKILL.md) converged; this did not. So the Claude files stay the single
source and the other two are generated, with every dropped field recorded in
the generated file itself.

Usage: lib-gen-agents.py <src-dir> <codex-out-dir> <opencode-out-dir>
"""
import json
import pathlib
import sys

import yaml

REGEN = "Regenerate: make sync-agents"


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


def main(src_dir, codex_dir, opencode_dir):
    src = pathlib.Path(src_dir)
    codex = pathlib.Path(codex_dir)
    opencode = pathlib.Path(opencode_dir)
    codex.mkdir(parents=True, exist_ok=True)
    opencode.mkdir(parents=True, exist_ok=True)

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
        if meta.get("color"):
            fm.append(f"color: {json.dumps(str(meta['color']), ensure_ascii=False)}")
        fm.append("---")

        note = [f"<!-- GENERATED MIRROR - DO NOT EDIT. Source: {rel} - {REGEN}"]
        for d in dropped_opencode:
            note.append(f"     Dropped in translation: {d}")
        note.append("-->")

        (opencode / f"{name}.md").write_text(
            "\n".join(fm) + "\n\n" + "\n".join(note) + "\n\n" + body
        )
        count += 1

    print(count)


if __name__ == "__main__":
    main(*sys.argv[1:4])
