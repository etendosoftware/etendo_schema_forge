# Developer Tools

CLI tools used by the team to streamline development workflows.

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
