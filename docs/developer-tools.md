# Developer Tools

CLI tools used by the team to streamline development workflows.

## Optional Kubernetes Pre-push Runner

The normal pre-push hook runs locally. Set `PREPUSH_EXECUTION=cloud` in the
unversioned `.env` file (or export it) to execute the same canonical hook in a
persistent Kubernetes runner instead. Cloud mode is authoritative: if it fails,
the push is blocked; remove the setting or set `local` to use the local fallback.

The kubeconfig is deliberately not stored in the repository. Cloud mode requires
these local environment values:

```bash
PREPUSH_EXECUTION=cloud
PREPUSH_KUBECONFIG=/absolute/path/to/private-kubeconfig.yaml
```

By default, the runner namespace is derived from `git config user.email` as
`prepush-<normalized-email>`. Each developer therefore gets a distinct runner
pod and PVC across all repositories and worktrees. The first cloud pre-push
provisions that runner automatically; the provisioner can also be run manually:

```bash
scripts/provision-remote-prepush-runner.sh
```

The default PVC is 20Gi and persists npm, Sonar, tools, Vite, Git, and run-log
caches. The Deployment starts at zero replicas, scales to one for a cloud
pre-push, and is always scaled back to zero when it ends; only the PVC remains.
The runner uses a 30-second termination grace period, so completed runs release
their CPU and memory promptly.
While active, the default runner requests 4 CPU / 8Gi and can burst to 8 CPU /
16Gi. Its persistent Vite/Vitest cache, npm cache, and Sonar cache are reused
by later runs. `PREPUSH_NAMESPACE` overrides the derived namespace only when
needed; `PREPUSH_CPU_REQUEST`, `PREPUSH_CPU_LIMIT`,
`PREPUSH_MEMORY_REQUEST`, and `PREPUSH_MEMORY_LIMIT` tune resource values.

Other optional values are `PREPUSH_KUBE_CONTEXT`, `PREPUSH_NAMESPACE`,
`PREPUSH_DEPLOYMENT`, `PREPUSH_SONAR_ENV_FILE`, `PREPUSH_GO_REPO`, and
`PREPUSH_NPMRC`. When `PREPUSH_NPMRC` is absent, the runner uses
`npm config get userconfig`; it fails before contacting Kubernetes if neither
that global npmrc nor the explicit override is a valid file.
`PREPUSH_GO_REPO` accepts either the `com.etendoerp.go` module directory or the
Etendo root. When omitted, the runner first checks the current checkout and
then the primary Git worktree for `etendo_core/modules/com.etendoerp.go`. It
fails if that sourcedata is not available, so the canonical XML comparison is
never silently skipped. The
runner keeps only safe npm and Sonar caches on its persistent volume; the Git
bundle, npm credentials, and Sonar token are sent to the pod's ephemeral
`/tmp` directory and removed when the run ends.

The isolated remote checkout cannot prove local commit trailers for inherited
history, so cloud mode sets `HOOKS_VERIFY_SKIP=1` only for the remote execution.
The normal local hook retains its trailer validation. For a manual run, execute:

```bash
PREPUSH_EXECUTION=cloud scripts/run-remote-prepush.sh
```

Cloud mode accepts one branch update per push. Push multiple refs separately.

## RTK (Rust Token Killer)

Token-optimized CLI proxy that reduces LLM token consumption by 60-90% on common dev commands. Single Rust binary, zero dependencies. Works transparently via Claude Code hooks — shell commands are automatically rewritten through RTK filters.

**What it does:** Intercepts CLI output (git, npm, etc.) and strips noise before it reaches the LLM context window, saving tokens without losing useful information.

**Installation:**

```bash
# Install via cargo (use the git URL to avoid name collision with Rust Type Kit)
cargo install --git https://github.com/rtk-ai/rtk

# Initialize for Claude Code (installs hook + RTK.md)
rtk init -g

# Verify correct binary
rtk --version
rtk gain  # Should show token savings stats
```

**Links:**
- GitHub: https://github.com/rtk-ai/rtk
- Website: https://www.rtk-ai.app/
- npm: Not applicable (Rust binary)

**Usage notes:**
- Claude Code built-in tools (Read, Grep, Glob) bypass the hook — RTK only filters shell commands.
- `rtk gain` shows token savings analytics.
- `rtk discover` analyzes Claude Code history for missed optimization opportunities.

---

## GWS (Google Workspace CLI)

Command-line tool for interacting with Google Workspace APIs: Drive, Gmail, Calendar, Sheets, Docs, Chat, Admin, and more. Dynamically built from Google Discovery Service — when Google adds an API endpoint, gws picks it up automatically.

**What it does:** Provides a unified CLI to interact with all Google Workspace services. In this project we use it to send messages to Google Chat spaces (e.g., team announcements).

**Installation:**

```bash
# Via npm (recommended — bundles pre-built native binary)
npm install -g @googleworkspace/cli

# Via cargo
cargo install google-workspace-cli

# Via shell installer
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/googleworkspace/cli/releases/latest/download/gws-installer.sh | sh
```

**First-time setup:** After installation, authenticate with your Google Workspace account. Credentials are stored in the system keyring.

**Links:**
- GitHub: https://github.com/googleworkspace/cli
- npm: https://www.npmjs.com/package/@googleworkspace/cli
- Releases: https://github.com/googleworkspace/cli/releases

**Common usage in this project:**

```bash
# List Chat spaces
gws chat spaces list

# Send a message to a space
gws chat spaces messages create \
  --params '{"parent": "spaces/SPACE_ID"}' \
  --json '{"text": "Hello team"}'

# Search members in a space
gws chat spaces members list --params '{"parent": "spaces/SPACE_ID"}'
```

---

## GitHub CLI (gh)

Official GitHub CLI. Used extensively for PR creation, issue management, repo operations, and API queries.

**What it does:** Interact with GitHub repositories, pull requests, issues, actions, and the full GitHub API from the terminal.

**Installation:**

```bash
# Via Homebrew (recommended for macOS)
brew install gh

# First-time auth
gh auth login
```

**Links:**
- GitHub: https://github.com/cli/cli
- Docs: https://cli.github.com/manual/

**Common usage in this project:**

```bash
# Create a PR
gh pr create --title "Feature ETP-1234: Description" --body "Summary"

# List open PRs
gh pr list

# View PR checks
gh pr checks 123

# Create an issue
gh issue create --title "Bug: description" --label bug

# Query the GitHub API
gh api repos/etendosoftware/etendo_schema_forge/pulls/123/comments

# Merge a PR (always --merge, never --squash)
gh pr merge 123 --merge
```

---

## XML Regeneration Check

Node.js CLI that compares original module XML against `export.database` output without requiring a database connection.

**What it does:** Recursively compares XML files under `src-db/database/` subdirectories (`model/tables`, `model/modifiedTables`, `model/functions`, `sourcedata`) between two directory trees. Normalizes child-element order and attributes to avoid false positives from non-significant reordering. Reports changed, missing, and extra files.

**Installation:** Requires Node.js. No pip packages or virtualenv are needed.

**Usage:**

```bash
# Compare original module XML against export.database output
node cli/src/xml-regeneration-check.js <original_dir> <exported_dir>

# JSON output for CI integration
node cli/src/xml-regeneration-check.js <original_dir> <exported_dir> --format json

# Compare only specific subdirectories
node cli/src/xml-regeneration-check.js <original_dir> <exported_dir> --include-dir model/tables --include-dir sourcedata
```

**Exit codes:**
- `0` — All files match (OK)
- `1` — Inconsistencies found (changed, missing, extra, or unparseable files)
- `2` — Usage or input error (missing or invalid input paths)

**Typical invocation from Etendo root:**

```bash
# After export.database, compare the module's src-db against the exported output
node ../etendo_schema_forge/cli/src/xml-regeneration-check.js \
  modules/com.etendoerp.go/src-db/database \
  modules/com.etendoerp.go/src-db/database
```

**Links:**
- Source: `cli/src/xml-regeneration-check.js`
- Tests: `cli/test/xml-regeneration-check.test.js`

---

## Jira CLI

Feature-rich interactive Jira command line client. Used for creating issues, managing sprints, and integrating with the Etendo workflow manager.

**What it does:** Manage Jira issues, epics, sprints, and boards directly from the terminal. Supports interactive issue creation, listing, and transitions.

**Installation:**

```bash
# Via Homebrew (recommended for macOS)
brew install jira-cli

# Via Go
go install github.com/ankitpokhrel/jira-cli/cmd/jira@latest
```

**First-time setup:**

```bash
jira init
```

This creates a config at `~/.config/.jira/.config.yml`. You will need your Jira instance URL, email, and an API token.

**Links:**
- GitHub: https://github.com/ankitpokhrel/jira-cli
- Installation wiki: https://github.com/ankitpokhrel/jira-cli/wiki/Installation

**Common usage in this project:**

```bash
# View current user
jira me

# Create an issue
jira issue create

# List issues in current project
jira issue list

# View an issue
jira issue view ETP-3504

# Open issue in browser
jira open ETP-3504

# List sprints
jira sprint list --board <board-id>
```
