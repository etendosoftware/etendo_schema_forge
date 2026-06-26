.PHONY: test test-all-coverage test-ci test-ci-coverage test-frontend test-e2e test-e2e-headless test-e2e-debug test-e2e-ui test-e2e-report test-e2e-record generate regen dev dev-with-shell dev-mock build install install-e2e deploy clean help report-serve report-serve-detach report-stop report-preview validate-pipeline method-budget window-leak-budget quality-gate domain-boundary-check sonar sonar-coverage sonar-file-coverage menu-cache uuid test-xml-regeneration-check test-python xml-regeneration-check dump-delta regen-check regen-check-help regen-check-clean regen-help data-fixes data-fixes-help switch switch-to-es switch-to-ar ensure-locale project-status

# --- Testing ---

test: ## Run all unit tests (CLI + app-shell + artifacts + vitest)
	cd cli && node --test 'test/*.test.js'
	npm test --workspace=packages/schema-forge-core
	npm test --workspace=packages/app-shell-core
	node --test 'tools/app-shell/src/**/__tests__/*.test.js'
	node --test 'tools/app-shell/test/*.test.js'
	node --test 'artifacts/**/__tests__/*.test.js'
	cd tools/app-shell && npx vitest run

test-all-coverage: ## Run ALL unit tests (Node + Vitest) with coverage reports
	@mkdir -p coverage
	@echo "=== CLI tests ==="
	node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage/cli-lcov.info $(shell find cli/test -name '*.test.js')
	@echo "=== App-shell Node tests ==="
	node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage/appshell-lcov.info $(shell find tools/app-shell/src -path '*/__tests__/*.test.js' ! -name 'useEntity-helpers.test.js')
	@echo "=== App-shell extra tests ==="
	node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage/appshell-test-lcov.info $(shell find tools/app-shell/test -name '*.test.js')
	@echo "=== Artifact custom tests ==="
	node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage/artifacts-lcov.info $(shell find artifacts -path '*/__tests__/*.test.js')
	@echo "=== Vitest (React components) ==="
	cd tools/app-shell && npx vitest run --coverage && sed 's|^SF:src/|SF:tools/app-shell/src/|' coverage/vitest/lcov.info > ../../coverage/vitest-lcov.info
	@echo "=== Merging LCOV reports ==="
	npx lcov-result-merger 'coverage/*-lcov.info' coverage/merged-lcov.info
	@echo ""
	@echo "Coverage reports saved in coverage/"
	@echo "  Individual: cli-lcov.info, appshell-lcov.info, appshell-test-lcov.info, artifacts-lcov.info, vitest-lcov.info"
	@echo "  Merged:     merged-lcov.info (used by SonarQube)"

test-ci: ## Run all unit tests and write JUnit XML reports (CI mode)
	@mkdir -p test-results
	node --test \
	  --test-reporter=spec --test-reporter-destination=stdout \
	  --test-reporter=junit --test-reporter-destination=test-results/cli.xml \
	  'cli/test/*.test.js'
	node --test \
	  --test-reporter=spec --test-reporter-destination=stdout \
	  --test-reporter=junit --test-reporter-destination=test-results/schema-forge-core.xml \
	  'packages/schema-forge-core/test/*.test.js'
	npm test --workspace=packages/app-shell-core
	node --test \
	  --test-reporter=spec --test-reporter-destination=stdout \
	  --test-reporter=junit --test-reporter-destination=test-results/appshell-node.xml \
	  'tools/app-shell/src/**/__tests__/*.test.js' \
	  'tools/app-shell/test/*.test.js'
	node --test \
	  --test-reporter=spec --test-reporter-destination=stdout \
	  --test-reporter=junit --test-reporter-destination=test-results/artifacts.xml \
	  'artifacts/**/__tests__/*.test.js'
	cd tools/app-shell && npx vitest run \
	  --reporter=junit \
	  --outputFile=../../test-results/vitest.xml

test-ci-coverage: ## Run all unit tests with JUnit XML reports + LCOV coverage (CI mode, single pass)
	@mkdir -p test-results coverage
	node --test --experimental-test-coverage \
	  --test-reporter=spec --test-reporter-destination=stdout \
	  --test-reporter=junit --test-reporter-destination=test-results/cli.xml \
	  --test-reporter=lcov --test-reporter-destination=coverage/cli-lcov.info \
	  'cli/test/*.test.js'
	node --test --experimental-test-coverage \
	  --test-reporter=spec --test-reporter-destination=stdout \
	  --test-reporter=junit --test-reporter-destination=test-results/appshell-node.xml \
	  --test-reporter=lcov --test-reporter-destination=coverage/appshell-lcov.info \
	  'tools/app-shell/src/**/__tests__/*.test.js' \
	  'tools/app-shell/test/*.test.js'
	node --test --experimental-test-coverage \
	  --test-reporter=spec --test-reporter-destination=stdout \
	  --test-reporter=junit --test-reporter-destination=test-results/artifacts.xml \
	  --test-reporter=lcov --test-reporter-destination=coverage/artifacts-lcov.info \
	  'artifacts/**/__tests__/*.test.js'
	cd tools/app-shell && npx vitest run --coverage \
	  --reporter=junit \
	  --outputFile=../../test-results/vitest.xml \
	  && cp coverage/vitest/lcov.info ../../coverage/vitest-lcov.info
	@echo "=== Merging LCOV reports ==="
	npx lcov-result-merger 'coverage/*-lcov.info' coverage/merged-lcov.info

validate-pipeline: ## Validate pipeline completeness across all artifacts
	node cli/src/validate-pipeline.js --format=text

method-budget: ## Ratchet guard: fail only if a tracked class grew past its method baseline
	node cli/src/method-budget.js

window-leak-budget: ## Ratchet guard: fail only if window-specific literals in contract-ui grew (use --list to enumerate)
	node cli/src/window-leak-budget.js

test-frontend: ## Run only frontend generator tests
	cd cli && node --test 'test/generate-frontend.test.js'


quality-gate: ## Run Schema Forge quality gate for PR-affected windows
	node cli/src/quality-gate.js --pr-affected --baseline-ref origin/main --format md

domain-boundary-check: ## Check changed files against monorepo intent/domain boundaries (BASE=<ref>, HEAD=<ref>)
	@if [ -z "$(BASE)" ]; then \
	  echo "Usage: make domain-boundary-check BASE=<ref> [HEAD=<ref>] [LABELS=a,b] [PR_BODY_FILE=path]"; \
	  exit 1; \
	fi; \
	HEAD_REF="$(HEAD)"; \
	if [ -z "$$HEAD_REF" ]; then HEAD_REF="HEAD"; fi; \
	ARGS="--base $(BASE) --head $$HEAD_REF"; \
	if [ -n "$(LABELS)" ]; then ARGS="$$ARGS --labels $(LABELS)"; fi; \
	if [ -n "$(PR_BODY_FILE)" ]; then ARGS="$$ARGS --pr-body-file $(PR_BODY_FILE)"; fi; \
	npx sf-domain-boundary-check $$ARGS
# --- E2E Testing (Playwright) ---

# Parallel workers for E2E runs. Override to go faster: `make test-e2e-headless WORKERS=8`.
# Caveat: all workers share the single dev server on :3100 — too many may cause flaky timeouts.
WORKERS ?= 5

test-e2e: ## Run E2E tests with visible browser (override parallelism with WORKERS=N)
	cd e2e && npx playwright test --headed --workers=$(WORKERS)

test-e2e-headless: ## Run E2E tests headless (CI mode; override parallelism with WORKERS=N)
	cd e2e && CI=true npx playwright test --workers=$(WORKERS)

test-e2e-debug: ## Run E2E tests in debug mode (step by step)
	cd e2e && npx playwright test --debug

test-e2e-ui: ## Open Playwright UI for interactive test running
	cd e2e && npx playwright test --ui

test-e2e-report: ## Show last E2E test report in browser
	cd e2e && npx playwright show-report ../artifacts/e2e-report

test-e2e-record: ## Record a test flow (opens browser, generates code)
	cd e2e && npx playwright codegen --save-storage=auth.json http://localhost:3100 --output=recordings/recorded-flow.spec.js

install-e2e: ## Install E2E dependencies + browsers
	cd e2e && npm install && npx playwright install chromium

# --- Code Generation ---

generate: ## Generate frontend from Sales Order contract
	node cli/src/generate-frontend.js artifacts/sales-order/contract.json

PUSH_TO_NEO ?= 0
SKIP_EXTRACT ?= 0
CACHE_DB ?= 0
FROM_CACHE ?= 0
ONLY ?=

regen: ## Re-run full pipeline for all active windows (HELP=1 or `make regen-help` for options)
	@if [ "$(HELP)" = "1" ]; then $(MAKE) -s regen-help; exit 0; fi; \
	REGEN_ARGS=""; \
	if [ "$(PUSH_TO_NEO)" = "1" ]; then REGEN_ARGS="$$REGEN_ARGS --push-to-neo"; fi; \
	if [ "$(SKIP_EXTRACT)" = "1" ]; then REGEN_ARGS="$$REGEN_ARGS --skip-extract"; fi; \
	if [ "$(CACHE_DB)" = "1" ]; then REGEN_ARGS="$$REGEN_ARGS --write-cache"; fi; \
	if [ "$(FROM_CACHE)" = "1" ]; then REGEN_ARGS="$$REGEN_ARGS --from-cache"; fi; \
	if [ -n "$(ONLY)" ]; then REGEN_ARGS="$$REGEN_ARGS --only $(ONLY)"; fi; \
	node cli/src/regen-all.js $$REGEN_ARGS

regen-help: ## Show usage and examples for `make regen`
	@echo "Usage: make regen [VAR=value ...]"
	@echo ""
	@echo "Variables:"
	@echo "  ONLY=<spec>[,<spec>...]   Run only the given window spec(s) (kebab-case, matches artifacts/<spec>/)"
	@echo "  PUSH_TO_NEO=1             Push the resulting config to NEO Headless after regenerating"
	@echo "  SKIP_EXTRACT=1            Skip the DB extraction step (reuse existing schema-raw.json)"
	@echo "  CACHE_DB=1                Run against DB and refresh cli/cache/ad-snapshot.json (commit the diff)"
	@echo "  FROM_CACHE=1              Run extractors offline using cli/cache/ad-snapshot.json (no DB needed)"
	@echo ""
	@echo "Examples:"
	@echo "  make regen                                # all active windows"
	@echo "  make regen ONLY=tax                       # only the tax window"
	@echo "  make regen ONLY=tax,product               # tax + product"
	@echo "  make regen ONLY=tax SKIP_EXTRACT=1        # only tax, skip DB extraction"
	@echo "  make regen ONLY=tax PUSH_TO_NEO=1         # only tax + push to NEO"
	@echo "  make regen ONLY=tax CACHE_DB=1            # refresh cache for tax (hits DB, writes snapshot)"
	@echo "  make regen ONLY=tax FROM_CACHE=1          # regen tax offline from cached snapshot"
	@echo ""
	@echo "Notes:"
	@echo "  - Window specs are the directory names under artifacts/ (kebab-case)."
	@echo "  - For a single window, you can also run: node cli/src/resolve-curated.js --window <spec> --write"
	@echo "  - CACHE_DB and FROM_CACHE are mutually exclusive."

# --- Push-to-NEO Delta Dump ---

PREV_XML_DIR ?=

dump-delta: ## Dump the writes push-to-neo WOULD make for ONLY=<spec> (no DB writes)
	@if [ -z "$(ONLY)" ]; then \
	  echo "Usage: make dump-delta ONLY=<spec> [PREV_XML_DIR=<dir>] [FROM_CACHE=1]"; \
	  echo "Writes artifacts/<spec>/neo-delta.json with the upserts/deletes."; \
	  exit 1; \
	fi; \
	DELTA_ARGS=""; \
	if [ -n "$(PREV_XML_DIR)" ]; then DELTA_ARGS="$$DELTA_ARGS --prev-xml-dir $(PREV_XML_DIR)"; fi; \
	CACHE_ENV=""; \
	if [ "$(FROM_CACHE)" = "1" ]; then CACHE_ENV="SF_CACHE_MODE=read"; fi; \
	if [ "$(CACHE_DB)" = "1" ]; then CACHE_ENV="SF_CACHE_MODE=write"; fi; \
	env $$CACHE_ENV node cli/src/push-to-neo.js $(ONLY) --dump-delta artifacts/$(ONLY)/neo-delta.json $$DELTA_ARGS

# --- Offline Regeneration Check (Slice 3) ---
#
# End-to-end no-DB-no-export.database loop:
#   1) regen (extract → resolve → generate)        cache-aware via FROM_CACHE=1
#   2) push-to-neo --dump-delta → neo-delta.json   no DB writes
#   3) xml-apply-delta on top of committed XML     produces predicted XML
#   4) xml-regeneration-check predicted vs prev    exit 0 if no drift
#
# Default prev-XML dir: ../modules/com.etendoerp.go/src-db/database/sourcedata
# Output: tmp/regen-check/<spec>/{neo-delta.json,predicted/,prev/}

REGEN_CHECK_PREV_XML_DIR ?= ../modules/com.etendoerp.go/src-db/database/sourcedata
REGEN_CHECK_OUT_ROOT     ?= tmp/regen-check

regen-check: ## Predict and compare ETGO_SF_*.xml against committed XML (no DB, no gradle). Defaults to all AD-backed windows.
	@SPECS="$(ONLY)"; \
	if [ -z "$$SPECS" ]; then \
	  SPECS=$$(node -e "const r=require('./cli/config/regen-windows.json');\
process.stdout.write(r.windows.filter(w=>{\
  try{return require('fs').existsSync('artifacts/'+w.name+'/decisions.json')\
    && require('fs').existsSync('artifacts/'+w.name+'/contract.json')}catch(e){return false}\
}).map(w=>w.name).join(','))"); \
	  echo "No ONLY= given — running registry windows with decisions+contract ($$SPECS)"; \
	fi; \
	REGEN_ARGS="--only $$SPECS --skip-extract"; \
	if [ "$(CACHE_DB)" = "1" ]; then REGEN_ARGS="--only $$SPECS --write-cache"; fi; \
	if [ "$(FROM_CACHE)" = "1" ]; then REGEN_ARGS="--only $$SPECS --from-cache"; fi; \
	node cli/src/regen-all.js $$REGEN_ARGS || exit $$?; \
	FAIL=0; TOTAL_OK=0; TOTAL_FAIL=0; \
	for spec in $$(echo "$$SPECS" | tr ',' ' '); do \
	  OUTDIR="$(REGEN_CHECK_OUT_ROOT)/$$spec"; \
	  mkdir -p "$$OUTDIR/predicted" "$$OUTDIR/prev/sourcedata"; \
	  echo ""; \
	  echo "=== regen-check: $$spec ==="; \
	  CACHE_ENV=""; \
	  if [ "$(FROM_CACHE)" = "1" ]; then CACHE_ENV="SF_CACHE_MODE=read"; fi; \
	  if [ "$(CACHE_DB)" = "1" ]; then CACHE_ENV="SF_CACHE_MODE=write"; fi; \
	  env $$CACHE_ENV node cli/src/push-to-neo.js $$spec \
	    --dump-delta "$$OUTDIR/neo-delta.json" \
	    --prev-xml-dir "$(REGEN_CHECK_PREV_XML_DIR)" || { FAIL=1; TOTAL_FAIL=$$((TOTAL_FAIL+1)); continue; }; \
	  node cli/src/xml-apply-delta.js \
	    --prev-xml-dir "$(REGEN_CHECK_PREV_XML_DIR)" \
	    --delta "$$OUTDIR/neo-delta.json" \
	    --out-dir "$$OUTDIR/predicted/sourcedata" || { FAIL=1; TOTAL_FAIL=$$((TOTAL_FAIL+1)); continue; }; \
	  cp "$(REGEN_CHECK_PREV_XML_DIR)/ETGO_SF_SPEC.xml"   "$$OUTDIR/prev/sourcedata/"; \
	  cp "$(REGEN_CHECK_PREV_XML_DIR)/ETGO_SF_ENTITY.xml" "$$OUTDIR/prev/sourcedata/"; \
	  cp "$(REGEN_CHECK_PREV_XML_DIR)/ETGO_SF_FIELD.xml"  "$$OUTDIR/prev/sourcedata/"; \
	  if node cli/src/xml-regeneration-check.js "$$OUTDIR/prev" "$$OUTDIR/predicted" --include-dir sourcedata; then \
	    echo "  result: OK"; TOTAL_OK=$$((TOTAL_OK+1)); \
	  else \
	    echo "  result: DRIFT (see $$OUTDIR/)"; FAIL=1; TOTAL_FAIL=$$((TOTAL_FAIL+1)); \
	  fi; \
	done; \
	echo ""; \
	echo "=== regen-check summary ==="; \
	echo "  OK:   $$TOTAL_OK"; \
	echo "  FAIL: $$TOTAL_FAIL"; \
	exit $$FAIL

regen-check-help: ## Show usage and examples for `make regen-check`
	@echo "Usage: make regen-check ONLY=<spec>[,<spec>...] [VAR=value ...]"
	@echo ""
	@echo "Variables:"
	@echo "  ONLY=<spec>[,<spec>...]      Comma-separated window specs (kebab-case)"
	@echo "  FROM_CACHE=1                 Run the full check offline from cli/cache/ad-snapshot.json"
	@echo "  CACHE_DB=1                   Refresh cache from DB during the regen step (writes snapshot)"
	@echo "  REGEN_CHECK_PREV_XML_DIR     Path to committed ETGO_SF_*.xml directory"
	@echo "                               (default: ../modules/com.etendoerp.go/src-db/database/sourcedata)"
	@echo "  REGEN_CHECK_OUT_ROOT         Where predicted/prev XML go (default: tmp/regen-check)"
	@echo ""
	@echo "Examples:"
	@echo "  make regen-check ONLY=tax FROM_CACHE=1"
	@echo "  make regen-check ONLY=tax,product FROM_CACHE=1"
	@echo "  make regen-check ONLY=tax CACHE_DB=1     # refresh cache mid-check"
	@echo ""
	@echo "Notes:"
	@echo "  - Windows only (specType=W). Process/report specs are NOT supported yet."
	@echo "  - Exit code 0 = no drift, non-zero = drift or pipeline error."
	@echo "  - Outputs are under tmp/regen-check/<spec>/ (gitignored)."
	@echo "  - To refresh the AD cache when AD changes: make regen ONLY=<spec> CACHE_DB=1, then commit cli/cache/ad-snapshot.json."

regen-check-clean: ## Remove tmp/regen-check/ outputs
	rm -rf $(REGEN_CHECK_OUT_ROOT)

# --- Tenant data-fixes runner ---

DRY_RUN    ?= 0
MARK_FIXED ?= 0
CLIENT     ?=
FIX        ?=
REASON     ?=

data-fixes: ## Run the tenant data-fixes runner (HELP=1 or `make data-fixes-help` for options)
	@if [ "$(HELP)" = "1" ]; then $(MAKE) -s data-fixes-help; exit 0; fi; \
	DF_ARGS=""; \
	if [ "$(LIST_CLIENTS)" = "1" ]; then DF_ARGS="$$DF_ARGS --list-clients"; fi; \
	if [ "$(MARK_FIXED)" = "1" ]; then DF_ARGS="$$DF_ARGS --mark-fixed"; fi; \
	if [ "$(DRY_RUN)" = "1" ]; then DF_ARGS="$$DF_ARGS --dry-run"; fi; \
	if [ -n "$(CLIENT)" ]; then DF_ARGS="$$DF_ARGS --client $(CLIENT)"; fi; \
	if [ -n "$(FIX)" ]; then DF_ARGS="$$DF_ARGS --fix $(FIX)"; fi; \
	if [ -n "$(REASON)" ]; then DF_ARGS="$$DF_ARGS --reason \"$(REASON)\""; fi; \
	eval node cli/src/data-fixes/run.js $$DF_ARGS

data-fixes-help: ## Show usage and examples for `make data-fixes`
	@echo "Usage: make data-fixes [VAR=value ...]"
	@echo ""
	@echo "Applies corrective .sql data-fixes to existing tenants, recording state in the"
	@echo "System-owned ledger ETGO_DATA_FIX_HISTORY. DB credentials auto-resolve from"
	@echo "{etendo_root}/gradle.properties (see cli/src/db.js)."
	@echo ""
	@echo "Variables:"
	@echo "  LIST_CLIENTS=1     Read-only overview: each tenant (name+id), last applied fix, # pending/FAILED"
	@echo "  DRY_RUN=1          Report what WOULD run (executes @check, commits nothing)"
	@echo "  CLIENT=<clientId>  Restrict to a single tenant (ad_client_id)"
	@echo "  FIX=<fix_id>       Force exactly ONE fix (ignores chain order + baseline cutoff; does not advance)"
	@echo "  MARK_FIXED=1       Mark a fix as manually resolved (counts as success; runs nothing)"
	@echo "  REASON=\"...\"       Mandatory note for MARK_FIXED — what was done by hand"
	@echo ""
	@echo "Examples:"
	@echo "  make data-fixes LIST_CLIENTS=1                         # overview of every tenant's state"
	@echo "  make data-fixes DRY_RUN=1                              # preview across all tenants"
	@echo "  make data-fixes                                       # apply across all tenants"
	@echo "  make data-fixes CLIENT=<id>                           # apply for one tenant"
	@echo "  make data-fixes FIX=<fix_id>                          # force one fix for all tenants"
	@echo "  make data-fixes FIX=<fix_id> CLIENT=<id>              # force one fix for one tenant"
	@echo "  make data-fixes MARK_FIXED=1 CLIENT=<id> FIX=<fix_id> REASON=\"patched by hand\""
	@echo ""
	@echo "Notes:"
	@echo "  - fix_id = the .sql filename without .sql (e.g. 20260611T143000Z__R3-periodcontrol)."
	@echo "  - Authoring rules + skeleton: cli/src/data-fixes/sql/README.md."
	@echo "  - Exit code is non-zero if any tenant's chain halted on a FAILED fix."

sync-regen-check-workflow: ## Regenerate the mirror Offline Regen Check workflow in com.etendoerp.go
	./scripts/sync-offline-regen-check.sh

# --- Dev Server ---

dev: ensure-locale ## Start dev server for active locale (make switch LOCALE=ar to change)
	@if [ "$(LOCALE)" = "ar" ]; then \
		cd tools/etendo-go-ar/app-shell && npm run dev; \
	else \
		cd tools/app-shell && npm run dev; \
	fi

dev-with-shell: ## Start app-shell + spike-hello-app together (shell 3100, UI 5173, API 4100)
	cd tools/spike-hello-app && npm run dev:with-shell

dev-mock: ensure-locale ## Start dev server with mock data for active locale — required for E2E tests
	@if [ "$(LOCALE)" = "ar" ]; then \
		cd tools/etendo-go-ar/app-shell && npm run dev:mock; \
	else \
		cd tools/app-shell && npm run dev:mock; \
	fi

build: ## Build app-shell for production
	cd tools/app-shell && npm run build
	node cli/src/generate-reports-manifest.js

# --- Setup ---

menu-cache: ## Refresh the AD menu cache from the database
	node cli/src/menu-cache.js refresh

uuid: ## Generate a new Etendo-format UUID (32 uppercase hex chars, no hyphens)
	@uuidgen | tr -d '-' | tr '[:lower:]' '[:upper:]'

install: ## Install all workspace dependencies and activate git hooks
	npm install
	git config core.hooksPath .githooks

# --- Deploy ---

# Load local config from .env (not committed)
-include .env
export

# Etendo root: set in .env, override with make deploy ETENDO_ROOT=/path, or fallback to ..
ETENDO_ROOT ?= ..
MODULE_WEB := $(ETENDO_ROOT)/modules/com.etendoerp.go/web/com.etendoerp.go
LEGACY_DEPLOY ?= 0

deploy: ## Deprecated: use the dedicated UI container; set LEGACY_DEPLOY=1 to run the old copy flow
	@if [ "$(LEGACY_DEPLOY)" = "1" ] || [ "$(LEGACY_DEPLOY)" = "true" ] || [ "$(LEGACY_DEPLOY)" = "yes" ]; then \
		$(MAKE) build && \
		rm -rf "$(MODULE_WEB)/assets" && \
		mkdir -p "$(MODULE_WEB)" && \
		cp -r tools/app-shell/dist/* "$(MODULE_WEB)/" && \
		echo "Deployed to $(MODULE_WEB)"; \
	else \
		echo "Deprecated: make deploy is no longer needed because the UI is compiled during commits and deployed in a separate container from Etendo Classic."; \
		echo "Use 'make deploy LEGACY_DEPLOY=1' only if you need the old copy-to-Etendo flow."; \
	fi

# --- Report Server ---

JSREPORT_COMPOSE_DIR := ../modules/com.etendoerp.go/compose
SCHEMA_FORGE_ABS := $(shell realpath .)

report-build: ## Build jsreport Docker image (required before first resources.up)
	cd $(JSREPORT_COMPOSE_DIR) && docker build -t etendo-jsreport:latest .

report-serve: ## Start jsreport Docker container (run report-build first)
	cd $(JSREPORT_COMPOSE_DIR) && SCHEMA_FORGE_DIR=$(SCHEMA_FORGE_ABS) docker compose -f com.etendoerp.go.yml up

report-serve-detach: ## Start jsreport in background (run report-build first)
	cd $(JSREPORT_COMPOSE_DIR) && SCHEMA_FORGE_DIR=$(SCHEMA_FORGE_ABS) docker compose -f com.etendoerp.go.yml up -d

report-stop: ## Stop jsreport Docker container
	cd $(JSREPORT_COMPOSE_DIR) && docker compose -f com.etendoerp.go.yml down

report-preview: ## Preview Business Partner listing report
	node cli/src/report-preview.js --artifact business-partner --report listing

# --- Static Analysis (SonarQube) ---

sonar: ## Run SonarQube analysis on Schema Forge JS/JSX code
	sonar-scanner -Dproject.settings=sonar-project.properties

sonar-coverage: ## Run all tests with coverage then SonarQube analysis
	@mkdir -p coverage
	node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage/cli-lcov.info 'cli/test/*.test.js'
	node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage/appshell-lcov.info 'tools/app-shell/src/**/__tests__/*.test.js'
	node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage/appshell-test-lcov.info 'tools/app-shell/test/*.test.js'
	cd tools/app-shell && npx vitest run --coverage && sed 's|^SF:src/|SF:tools/app-shell/src/|' coverage/vitest/lcov.info > ../../coverage/vitest-lcov.info
	sonar-scanner -Dproject.settings=sonar-project.properties

sonar-file-coverage: ## Show uncovered lines for specific files (SF or com.etendoerp.go). Usage: make sonar-file-coverage FILES="a.js b.java" [NEW_ONLY=1] [BRANCH=x] [PR=123]
	@./cli/sonar-coverage.sh $(if $(NEW_ONLY),--new-only) $(if $(BRANCH),--branch $(BRANCH)) $(if $(PR),--pull-request $(PR)) $(FILES)

# --- XML Regeneration Check ---

test-xml-regeneration-check: ## Run XML regeneration check tests
	node --test cli/test/xml-regeneration-check.test.js

test-python: test-xml-regeneration-check ## Backward-compatible alias for the former Python tests

ORIGINAL_DB_DIR ?=
EXPORTED_DB_DIR ?=

xml-regeneration-check: ## Compare original module XML vs export.database output (requires ORIGINAL_DB_DIR and EXPORTED_DB_DIR)
	@if [ -z "$(ORIGINAL_DB_DIR)" ] || [ -z "$(EXPORTED_DB_DIR)" ]; then \
		echo "Usage: make xml-regeneration-check ORIGINAL_DB_DIR=<path> EXPORTED_DB_DIR=<path>"; \
		exit 1; \
	fi
	node cli/src/xml-regeneration-check.js "$(ORIGINAL_DB_DIR)" "$(EXPORTED_DB_DIR)"

# --- Project Context Switching ---
# Active locale is tracked in .active-locale (gitignored). Default: es.
# Usage: make switch-to-ar  |  make switch-to-es  |  make switch LOCALE=ar

LOCALE ?= $(shell cat .active-locale 2>/dev/null || echo es)

switch-to-es: ## Switch active locale to Spain (ES)
	@cp tools/app-shell/.env.es tools/app-shell/.env.local
	@echo es > .active-locale
	@echo "Active locale: ES (Spain) — com.etendoerp.go"

switch-to-ar: ## Switch active locale to Argentina (AR)
	@cp tools/etendo-go-ar/.env.ar tools/etendo-go-ar/.env.local
	@echo ar > .active-locale
	@echo "Active locale: AR (Argentina) — com.etendoerp.go.ar"

switch: ## Switch active locale — LOCALE=es (default) | LOCALE=ar
	@if [ "$(LOCALE)" = "es" ]; then \
		$(MAKE) switch-to-es --no-print-directory; \
	elif [ "$(LOCALE)" = "ar" ]; then \
		$(MAKE) switch-to-ar --no-print-directory; \
	else \
		echo "Unknown locale '$(LOCALE)'. Use LOCALE=es or LOCALE=ar."; \
		exit 1; \
	fi

ensure-locale: ## Bootstrap ES locale if .active-locale does not exist (called automatically)
	@if [ ! -f .active-locale ]; then \
		$(MAKE) switch-to-es --no-print-directory; \
	fi

project-status: ## Show active locale and module ID
	@LOCALE=$$(cat .active-locale 2>/dev/null || echo es); \
	echo "Active locale : $$LOCALE"; \
	if [ "$$LOCALE" = "es" ]; then \
		echo "Module        : com.etendoerp.go (Spain)"; \
		grep -s SF_MODULE_ID tools/app-shell/.env.local || echo "  .env.local missing — run: make switch-to-es"; \
	elif [ "$$LOCALE" = "ar" ]; then \
		echo "Module        : com.etendoerp.go.ar (Argentina)"; \
		grep -s SF_MODULE_ID tools/etendo-go-ar/.env.local || echo "  .env.local missing — run: make switch-to-ar"; \
	fi

# --- Cleanup ---

clean: ## Remove generated artifacts and build output
	rm -rf tools/app-shell/dist

# --- Help ---

help: ## Show this help
	@echo ""; \
	echo "\033[1mSchema Forge — Available targets\033[0m"; \
	echo ""; \
	awk '/^# ---/{gsub(/^# --- | ---$$/,"");printf "\033[1;33m%s\033[0m\n",$$0;next} \
	     /^[a-zA-Z][a-zA-Z0-9_-]*:.*## /{n=index($$0,": ## ");if(n>0){printf "  \033[36m%-22s\033[0m %s\n",substr($$0,1,n-1),substr($$0,n+5)}}' Makefile; \
	echo ""

.DEFAULT_GOAL := help
