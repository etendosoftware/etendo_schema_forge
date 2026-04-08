# Architecture Radar — sf-radar Tool Guide

The **etendo-go-architecture** repo contains `sf-radar`, a CLI tool to track and query architecture decisions across teams. This document explains how to use the tool from Schema Forge's perspective.

> **This repo is optional.** Only developers involved in architecture decisions need it locally. If you don't have it and need to check or update a decision, ask your architect or clone the repo.

## What sf-radar does

sf-radar gives a federated view of architecture decisions across 7 teams (copilot, backend, frontend, infra, cloud, servicios, product). Decisions are stored as YAML files in `radar/areas/` — one file per architecture area. The CLI reads those files and optionally syncs status from Jira, Confluence, and GitHub.

## Setup (one-time)

```bash
cd etendo-go-architecture
make install    # Install CLI dependencies
```

## Querying decisions

All query commands run from the architecture repo root:

```bash
# Overview — all 11 areas with progress bars
make status

# Zoom into a specific area
make area deploy
make area backend-neo

# List open decisions (with optional filters)
make open                            # All open
make open OWNER=cloud                # Assigned to cloud team
make open TEAM=backend AREA=ai       # Backend team, AI area only

# List blocked decisions
make blocked
make blocked TEAM=infra

# List gaps (things that need a decision but don't have one)
make gaps
make gaps AREA=localization
```

## Recording decisions

```bash
# Add a new open decision
node cli/src/radar.js add-decision --area deploy --title "CDN provider" --owner cloud --status open

# Close a decision with its resolution
node cli/src/radar.js decide --area deploy --title "CDN provider" --resolution "CloudFront"
```

After adding or closing decisions, commit the updated YAML in `radar/areas/` and push.

## Syncing with external systems

```bash
# Refresh decision status from Jira/Confluence/GitHub
# Requires JIRA_EMAIL and JIRA_API_TOKEN in .env
node cli/src/radar.js sync
```

## Architecture areas (11)

AI, Authentication, Backend NEO, CI/CD, Database, Deploy, Frontend SPA, Integrations, Localization, Observability, Reporting.

Each area YAML tracks: team ownership, decided items (with resolution), open decisions (with owner), blocked decisions (with blockedBy), and gaps.

## When to use sf-radar

| Situation | What to do |
|-----------|------------|
| New technology choice made | `add-decision` + `decide` with the resolution |
| Need to check what's still open | `make open` with filters |
| Identified something that needs a decision | `add-decision --status open` |
| Decision blocked by another team | Update YAML with `blockedBy` field |
| Starting work on an area | `make area <name>` to see current state |
| Preparing for architecture review | `make status` for the full picture |

## Data model

```
radar/areas/{area}.yaml
├── name, team
├── decisions[]
│   ├── id (auto-generated from title)
│   ├── title, status (decided|open|blocked)
│   ├── resolution, owner, jira, github, blockedBy
└── gaps[] (strings)
```

## Tests

```bash
make test    # 69 tests, node:test runner
```

## Relationship to Schema Forge

Architecture decisions (e.g., "use jsreport for reporting", "NeoHandler CDI for custom logic") inform how Schema Forge configures the runtime. The radar is the source of truth for **why** decisions were made. Schema Forge is the source of truth for **how** they are implemented.
