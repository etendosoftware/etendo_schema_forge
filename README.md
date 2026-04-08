# Schema Forge

Design and tooling layer for building a simplified Etendo interface. Schema Forge analyzes Etendo metadata, helps humans make design decisions, and configures the runtime module ([NEO Headless](docs/neo-headless-extensibility.md)) — no backend code generation needed.

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│       SCHEMA FORGE          │         │      com.etendoerp.go        │
│    (design + tooling)       │ writes  │    (runtime / NEO Headless)  │
│                             │ ──────▶ │                              │
│  cli/    → extractors, etc  │  via DB │  NeoServlet (/sws/neo/*)     │
│  tools/  → decision UIs     │         │  ETGO_SF_SPEC/ENTITY/FIELD   │
│  artifacts/ → per-window    │         │  Webhooks, CDI hooks         │
└─────────────────────────────┘         └──────────────────────────────┘
```

Schema Forge decides **what** to expose. Etendo Go decides **how** to serve it.

## Prerequisites

Before starting, make sure you have the following installed:

- **Node.js >= 22** — [download](https://nodejs.org/)
- **npm** (ships with Node.js)
- **GitHub CLI (`gh`)** — required for window locks and PR workflow
  ```bash
  # macOS
  brew install gh
  # Then authenticate:
  gh auth login
  ```
  [Install instructions for other platforms](https://cli.github.com/)
- **PostgreSQL** — access to an Etendo development database
- **Claude Code** — with the **Chrome DevTools MCP server** installed for UI testing and debugging
  - Install the MCP server: `claude mcp add chrome-devtools` or configure it in `.claude/settings.json`
  - See the [Chrome DevTools MCP](https://github.com/anthropics/claude-code) docs for setup details
- **Etendo Claude Marketplace** — Claude Code plugins for Etendo development
  - Install the marketplace and plugins:
    ```
    /plugin marketplace add etendosoftware/etendo_claude_marketplace
    /plugin install dev-assistant@etendo_claude_marketplace
    /plugin install etendo-workflow-manager@etendo_claude_marketplace
    ```
  - See the [marketplace repo](https://github.com/etendosoftware/etendo_claude_marketplace) for the full plugin reference

## Installation

### 1. Start from a working Etendo Core

You need a functional Etendo Core instance as the base. This gives Claude Code full access to the Etendo source code and database.

```bash
cd /path/to/etendo_core
git checkout feature/ETP-3519
```

Make sure Etendo compiles and runs correctly before proceeding.

### 2. Clone Schema Forge

Clone this repository **inside** the Etendo project directory (sibling to `modules/`):

```bash
cd /path/to/etendo_core
git clone git@github.com:etendosoftware/etendo_schema_forge.git schema_forge
cd schema_forge
git checkout develop
```

### 3. Clone com.etendoerp.go

Clone the runtime module into the Etendo `modules/` directory:

```bash
cd /path/to/etendo_core/modules
git clone git@github.com:etendosoftware/com.etendoerp.go.git
cd com.etendoerp.go
git checkout develop
```

### 4. Clone com.etendoerp.openapi (if needed)

If the build fails due to a missing dependency, clone the OpenAPI module:

```bash
cd /path/to/etendo_core/modules
git clone git@github.com:etendosoftware/com.etendoerp.openapi.git
cd com.etendoerp.openapi
git checkout main
```

### 5. Install Schema Forge dependencies

```bash
cd /path/to/etendo_core/schema_forge
make install
```

This installs all workspace dependencies (CLI tools + UI tools).

### 6. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Path to your Etendo root (relative or absolute)
ETENDO_ROOT=..

# Database connection (optional — CLI auto-reads from gradle.properties)
ETENDO_DB_HOST=localhost
ETENDO_DB_PORT=5432
ETENDO_DB_USER=etendo
ETENDO_DB_PASSWORD=
ETENDO_DB_NAME=etendo_dev
```

> **Note:** The CLI tools auto-read DB credentials from `{ETENDO_ROOT}/gradle.properties`. The `.env` overrides are only needed if your setup differs.

### Expected directory structure

After installation, your project should look like this:

```
etendo_core/                    ← branch: feature/ETP-3519
├── modules/
│   ├── com.etendoerp.go/       ← branch: develop
│   └── com.etendoerp.openapi/  ← branch: main (if needed)
├── schema_forge/               ← branch: develop
└── gradle.properties
```

## jsreport Installation (Draft)

> ⚠️ **This section is in the process of official integration.** The `com.etendoerp:docker` dependency is not yet part of `com.etendoerp.go` — add it manually until it is integrated.

jsreport is the report engine used by NEO Headless for PDF report generation. It runs as a Docker container managed by the `com.etendoerp:docker` module.

### 1. Add the Docker dependency to build.gradle

In the Etendo project's `build.gradle`, add inside the `dependencies` block:

```groovy
implementation 'com.etendoerp:docker:latest.release'
```

### 2. Configure gradle.properties

Add the following to the project's `gradle.properties`:

```properties
docker_com.etendoerp.go=true
JSREPORT_PORT=5488
SCHEMA_FORGE_DIR=../../schema_forge
```

> **Note:** `SCHEMA_FORGE_DIR` is a placeholder — replace it with the actual path to your `schema_forge` directory (relative or absolute).

### 3. Build the jsreport Docker image

> **Temporary step:** This manual build will be removed once the image is published to a registry. In a future version, the image will be pulled automatically without needing to build from the Dockerfile.

```bash
cd modules/com.etendoerp.go/compose
docker buildx build -f Dockerfile -t etendo-jsreport:latest .
```

### 4. Start jsreport

From the Etendo root directory:

```bash
./gradlew resources.up
```

This starts the jsreport container (and any other configured Docker resources). The `com.etendoerp:docker` module manages the container lifecycle.

### 5. Server Deployment: Apache Proxy for jsreport

When deploying to a server (production, staging, experimental), the frontend accesses jsreport through a relative path (`/jsreport/api/report`). In development, Vite proxies this automatically. In a deployed environment, you need to configure your web server to proxy these requests to the jsreport container.

#### Apache (with SSL / Let's Encrypt)

Edit your Apache virtual host config (e.g., `/etc/apache2/sites-available/000-default-le-ssl.conf`) and add the jsreport proxy **before** the catch-all `ProxyPass "/"` rule:

```apache
<VirtualHost *:443>
    # ... existing config ...

    # jsreport proxy — must be BEFORE the catch-all ProxyPass
    ProxyPass "/jsreport/" "http://127.0.0.1:5488/"
    ProxyPassReverse "/jsreport/" "http://127.0.0.1:5488/"

    # Existing Etendo/app proxy (catch-all, must be last)
    ProxyPass "/" "http://127.0.0.1:3000/"
    ProxyPassReverse "/" "http://127.0.0.1:3000/"

    # ... SSL config ...
</VirtualHost>
```

> **Important:** Apache evaluates `ProxyPass` rules in order. The more specific `/jsreport/` rule must appear before the generic `/` rule, otherwise all requests will be caught by the generic rule first.

After editing, restart Apache:

```bash
sudo systemctl restart apache2
```

Verify the proxy is working:

```bash
curl https://your-domain.com/jsreport/api/ping
```

#### How it works

```
Browser → HTTPS (443) → Apache (SSL termination) → HTTP (5488) → jsreport
```

Apache handles SSL — jsreport does not need its own SSL configuration. The same build works across all environments as long as each server has this proxy rule configured.

---

## First Steps (Claude Guided) (Recommended)
This tool is designed to be used iteratively through the Claude Code interface, interacting with the agent.

### 1. Start Etendo Classic
Make sure your Etendo instance is running and accessible. This allows the agent to use the backend endpoints for testing and validation during the pipeline execution. It can be in SmartTomcat or Dockerized Tomcat. The important thing is that the database is accessible.

### 1. Start a new conversation in Claude Code
- Open Claude Code and start a new conversation. IMPORTANT: Open the conversation in the schema_forge directory to ensure the agent has access to the correct context and files.

### 2. Set up the agent
- In the conversation, ask to set up the agent with the configuration required to work, such as "Etendo path", "Database credentials", "Menu cache", etc.

### 3. Start the UI in development mode
- Ask the agent to start the UI. It will install dependencies and start the development server. The UI will be available at http://localhost:3100. This UI will auto-refresh on changes.

### 4. Ask the agent to run the pipeline for a specific window or process
- You can ask the agent to run the pipeline for a specific window or process by providing the menu name or ID. For example, "Run the pipeline for the Sales Order window" or "Run the pipeline for menu ID 143". The agent will execute the pipeline steps, including metadata extraction, rule classification, contract generation, and frontend generation.

It is recommended to give the agent the "decisions" from the start so they can be applied automatically. This is not mandatory, as they can be provided before the "classification" step, but if given from the start, they can be applied immediately in the "classification" step and also used to "validate" the rules with the decisions in mind.


### 5. Change decisions and re-run the pipeline
- If you want to change any design decisions (e.g., field visibility, rule classifications), you can do so through the chat with the agent, and then re-run the pipeline to see the changes reflected in the generated UI. This will modify the "decisions" file so the changes will be persisted for future runs, and the pipeline steps that run will be the post-classification steps (contract generation, push to NEO, frontend generation, etc.), skipping the extraction and classification steps. Example: "Change the visibility of the 'Credit Limit' field to hidden and re-run the pipeline for the Sales Order window".


### 6. Use Claude to solve problems and errors
- When you encounter any issues, errors, or unexpected behavior during the pipeline execution or in the generated UI, you can ask the agent for help. It's important to differentiate between errors that are expected during development (e.g., due to incomplete implementations or edge cases) and those that indicate a problem with the pipeline or the generated code. You can ask the agent to analyze error messages, logs, or unexpected UI behavior to identify potential causes and solutions. Example: "I'm getting a validation error in the pipeline related to the 'Order Total' field. Can you help me understand why and how to fix it?"

### 7. Use the agent to test the UI or investigate issues
- "I have an issue with the generated UI for the Sales Order window. The 'Add Line' button is not working as expected. Can you help me debug this issue?" The agent can guide you through using the Chrome DevTools MCP server to inspect the frontend code, check network requests, and analyze logs to identify the root cause of the issue.

### 8. Deploy the UI to the Etendo Go module
- Once you are satisfied with the generated UI in development mode, you can ask the agent to deploy it to the Etendo Go module. The agent will build the frontend for production and copy the build artifacts to the correct location in the `com.etendoerp.go` module. Example: "Deploy the UI to the Etendo Go module".



## First Steps (Manual)
### 1. Refresh the menu cache

The menu cache indexes all Etendo windows, processes, and reports for fast lookup:

```bash
node cli/src/menu-cache.js refresh
```

### 2. Explore available windows and processes

```bash
# Search by name
node cli/src/menu-cache.js search "sales order"

# Filter by type
node cli/src/menu-cache.js search "invoice" --type window
node cli/src/menu-cache.js search "payment" --type process

# List all of a type
node cli/src/menu-cache.js list window
node cli/src/menu-cache.js list process
node cli/src/menu-cache.js list report
```

### 3. Run the pipeline for a window

The pipeline extracts metadata, classifies fields, generates contracts, configures NEO Headless, and generates the React frontend:

```bash
# By menu name (recommended — auto-detects type)
node cli/src/pipeline.js --menu-name "Sales Order"

# By menu ID
node cli/src/pipeline.js --menu-id 143
```

Pipeline steps (window mode):

| Phase | Step | Description |
|-------|------|-------------|
| F1a | extract-fields | Extract field metadata from Etendo DB |
| F1b | extract-rules | Extract business rules and callouts |
| F2 | validate | Validate schema (4 levels) |
| F3 | pre-classify | Auto-classify rules (deterministic + AI) |
| F4 | human-decisions | Open Decision Panel for human review |
| F6 | generate-contract | Generate frontend/backend contracts |
| F7 | push-to-neo | Configure NEO Headless (DB writes) |
| F8 | generate-frontend | Generate React components |
| F9 | run-tests | Run contract tests |

### 4. Start the dev server

Preview the generated UI with hot reload:

```bash
make dev
# → http://localhost:3100
```

By default it runs with mock data (`VITE_MOCK=true`). To connect to a live Etendo instance, edit `tools/app-shell/.env.development`:

```env
VITE_MOCK=false
VITE_API_BASE=http://localhost:8080/etendo
```

### 5. Build and deploy to Etendo

```bash
make deploy
```

The built SPA is copied to `modules/com.etendoerp.go/web/com.etendoerp.go/` and served by Tomcat at `/etendo/web/com.etendoerp.go/` — no restart needed.

### 6. Run tests

```bash
make test
```

## CLI Tools Reference

All tools live in `cli/src/`. Available as `sf-*` commands after `npm install`:

| Command | Description |
|---------|-------------|
| `sf-pipeline` | Full pipeline (auto-detects window/process/report from menu) |
| `sf-extract-db` | Extract fields + rules from Etendo DB |
| `sf-extract` | Field extraction with FK resolution |
| `sf-extract-rules` | Rule + callout extraction |
| `sf-classify` | Pre-classify rules (deterministic + AI) |
| `sf-validate` | 4-level schema validation |
| `sf-contract` | Generate frontend/backend contracts |
| `sf-push-neo` | Configure NEO Headless via DB writes |
| `sf-test` | Run contract tests |
| `sf-lock` | Window lock management (via GitHub Issues) |
| `sf-check-version` | Check contract version and classify changes |

## Make Targets

```
make help           Show all targets
make install        Install all workspace dependencies
make dev            Start dev server (localhost:3100)
make build          Build app-shell for production
make deploy         Build + deploy to Etendo module
make test           Run all CLI tests
make test-frontend  Run frontend generator tests
make clean          Remove build artifacts
```

## Project Structure

```
schema_forge/
├── cli/                    # Node.js CLI tools (extractors, validators, generators)
├── tools/
│   ├── app-shell/          # Main UI shell (Vite + React + Tailwind)
│   ├── decision-panel/     # Field visibility + rule curation UI
│   └── ui-preview/         # Live preview with mock data
├── artifacts/              # Per-window/process outputs (schemas, contracts, generated code)
├── core-maps/              # Shared metadata (system columns, AD reference map, menu cache)
├── scripts/                # Helper scripts (JWT tokens for testing)
├── docs/                   # All documentation
├── Makefile                # Build, test, deploy commands
└── .env.example            # Environment configuration template
```

## Documentation

See [`docs/index.md`](docs/index.md) for the full documentation index, including:

- [Architecture Overview](docs/architecture-overview.md) — system design, data flow
- [PRD](docs/PRD.md) — product requirements and scope
- [TDD](docs/TDD.md) — technical design and data models
- [NEO Headless Extensibility](docs/neo-headless-extensibility.md) — how to extend the runtime API
- [Etendo AD Reference](docs/etendo-ad/index.md) — how the Application Dictionary works
