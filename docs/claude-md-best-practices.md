# CLAUDE.md Best Practices Guide

Research compilation on how to write effective CLAUDE.md files for Claude Code projects.

## What is CLAUDE.md

CLAUDE.md is a markdown file that Claude Code reads automatically at the start of every session. It becomes part of the system prompt, giving Claude persistent project-specific context. The filename is case-sensitive.

## File Hierarchy

CLAUDE.md files load hierarchically from multiple locations:

| Location | Scope |
|----------|-------|
| `~/.claude/CLAUDE.md` | Global — applies to ALL projects |
| `./CLAUDE.md` (project root) | Project-wide — commit to git for team sharing |
| Parent directories | Monorepo roots — child projects inherit |
| Child directories | Loaded on demand when Claude works in that directory |

More specific (nested) files take priority over general ones.

## Recommended Length

- Frontier LLMs follow ~150-200 instructions reliably. Claude Code's system prompt already uses ~50, leaving ~100-150 effective instructions for your CLAUDE.md.
- Target **60-200 lines**, max ~300 lines.
- A lean file that Claude follows reliably beats a comprehensive one where instructions get diluted.

**Key question for every line:** "Would removing this cause Claude to make mistakes?" If not, cut it.

## What to Include

### 1. Project Identity (1-3 lines)

Brief orientation so Claude knows what it's working on.

```markdown
# Project Overview
This is a Next.js e-commerce app with Stripe integration and PostgreSQL.
```

### 2. Commands Claude Cannot Guess

Build, test, lint, deploy commands with exact flags. Prevents hallucinated commands.

```markdown
# Commands
- Build: `npm run build`
- Test single file: `pytest tests/test_auth.py -v`
- Lint: `biome check --write .`
```

### 3. Code Style Rules That Differ From Defaults

Only conventions that diverge from what Claude would naturally produce.

```markdown
# Code style
- Use ES modules (import/export), not CommonJS (require)
- Destructure imports when possible
```

### 4. Architecture and Project Structure

Directory map showing where key things live. Critical for monorepos.

```markdown
# Structure
src/
  api/       # REST endpoints
  models/    # Database models
  services/  # Business logic
```

### 5. Repository Etiquette

Branch naming, PR conventions, commit message format.

### 6. Environment Quirks

Required env vars, non-obvious setup steps, credential resolution.

### 7. Common Gotchas

Project-specific warnings that would cause mistakes without documentation.

### 8. Testing Instructions

Preferred runners, how to run single tests vs full suites, patterns.

### 9. Verification Criteria

How Claude should verify its own work (run tests, check types, etc.).

## What NOT to Include

| Exclude | Why |
|---------|-----|
| Anything Claude can figure out by reading code | Wastes instruction budget |
| Standard language conventions Claude already knows | Redundant noise |
| Detailed API documentation | Link to docs instead |
| Information that changes frequently | Goes stale, causes confusion |
| Long explanations or tutorials | Bloats context |
| File-by-file descriptions of the entire codebase | Too verbose, Claude can explore |
| Code style rules enforceable by linters | "Never send an LLM to do a linter's job" |
| Self-evident practices like "write clean code" | Wastes tokens |
| Sensitive data (API keys, passwords) | Security risk |
| Code snippets that will become outdated | Use `file:line` pointers instead |

## Five Production-Proven Patterns

### Pattern 1: Constrained Autonomy

Define what Claude can do without asking (formatting, linting, tests) vs. what requires approval (releases, security changes, bulk operations).

### Pattern 2: Skill System (Modular Behavior)

Break specialized behaviors into separate files (`.claude/skills/`) loaded on demand, rather than one monolithic CLAUDE.md.

### Pattern 3: Multi-Agent Safety

If using parallel agents: never create git stash, don't switch branches without instruction, stage only your own files.

### Pattern 4: Design Guardrails

Explicit constraints to prevent stereotypical AI output (no rainbow gradients, no emojis in UI, reference specific design systems).

### Pattern 5: Verify-Then-Act

Require diagnostic evidence before implementing fixes: proof of symptom, root cause identification, targeted fix, regression test.

## Progressive Disclosure Strategy

Don't put everything in CLAUDE.md. Use a tiered approach:

| Tier | Purpose | Compliance |
|------|---------|------------|
| **CLAUDE.md** | Universally applicable rules (~60-200 lines) | ~80% (advisory) |
| **Skills** (`.claude/skills/`) | Domain-specific knowledge, loaded on demand | ~80% |
| **Referenced docs** | Detailed documentation Claude reads when needed | On demand |
| **Hooks** (`.claude/settings.json`) | Actions that MUST happen every time | 100% (deterministic) |

Example progressive structure:
```markdown
# CLAUDE.md (lean)
See @docs/architecture.md for system design.
See @docs/api-conventions.md for REST patterns.

# Core rules (only the critical ones here)
...
```

## CLAUDE.md vs Hooks

> "CLAUDE.md is advisory and Claude follows it about 80% of the time, while hooks are deterministic at 100%. If something must happen every time without exception, make it a hook."

- **CLAUDE.md**: guidance, preferences, soft rules
- **Hooks**: enforcement (linting after edits, blocking writes to certain directories)

## Maintenance Best Practices

1. **Iterate based on friction**: When Claude makes a mistake, add the correction to CLAUDE.md.
2. **Prune regularly**: If Claude already does something correctly without the instruction, delete it.
3. **Test changes**: Observe whether Claude's behavior actually shifts after edits.
4. **Commit to git**: So the whole team benefits and can contribute.
5. **Use emphasis sparingly**: Add "IMPORTANT" or "YOU MUST" only for critical rules.

## Common Failure Modes

| Failure | Fix |
|---------|-----|
| **Over-specified CLAUDE.md**: too long, Claude ignores half | Ruthlessly prune |
| **Kitchen sink session**: unrelated tasks pollute context | `/clear` between tasks |
| **Correcting over and over**: failed approaches clutter context | After 2 failed corrections, `/clear` and write a better prompt |
| **Claude ignores instructions**: file too bloated, instructions get deprioritized | Reduce to essentials |

## Our Optimization (2026-03-27)

Reduced CLAUDE.md from 760 lines (~11,700 tokens) to ~244 lines (~3,800 tokens) by:
1. Moving detailed policies to `docs/self-documentation-policy.md`
2. Replacing verbose sections with 1-2 line pointers to existing docs
3. Keeping critical gotchas inline (spec naming, export.database, DB conventions)
4. Removing info discoverable via code/CLI tools

**Monitor:** If Claude stops following a rule after reduction, move it back to inline.

## Sources

- [Using CLAUDE.MD files (Official Anthropic Blog)](https://claude.com/blog/using-claude-md-files)
- [Best Practices for Claude Code (Official Docs)](https://code.claude.com/docs/en/best-practices)
- [How to Write a Good CLAUDE.md (Builder.io)](https://www.builder.io/blog/claude-md-guide)
- [Writing a good CLAUDE.md (HumanLayer)](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
- [5 CLAUDE.md Patterns That Work in Production (DEV Community)](https://dev.to/hideyoshi_th/5-claudemd-patterns-that-actually-work-in-production-5ho)
- [Creating the Perfect CLAUDE.md (Dometrain)](https://dometrain.com/blog/creating-the-perfect-claudemd-for-claude-code/)
- [Trail of Bits Claude Code Config (GitHub)](https://github.com/trailofbits/claude-code-config)
- [Claude Code Ultimate Guide (GitHub)](https://github.com/FlorianBruniaux/claude-code-ultimate-guide)
