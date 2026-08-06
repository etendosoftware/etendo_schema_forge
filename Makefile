.PHONY: test test-all-coverage test-ci test-ci-coverage test-frontend test-e2e test-e2e-headless test-e2e-debug test-e2e-ui test-e2e-report test-e2e-record test-e2e-onboarding-integration email-stress-limits email-stress-limits-report email-stress-help ast-churn-ranking generate regen dev dev-local-core dev-mock build install bump-core-version _bump-core-version-run install-e2e deploy clean help report-serve report-serve-detach report-stop report-preview validate-pipeline method-budget window-leak-budget quality-gate domain-boundary-check sonar sonar-coverage flag-debt menu-cache uuid merge-block-check xml-regeneration-check dump-delta regen-check regen-check-help regen-check-clean regen-help data-fixes data-fixes-help data-fixes-remote db-tunnel db-tunnel-down db-tunnel-status db-psql db-tunnel-help switch-to-es ensure-locale project-status

export SF_ROOT := $(CURDIR)

# --- CLI source resolution -------------------------------------------------
# By default the pipeline runs the PUBLISHED CLI (@etendosoftware/schema-forge-cli)
# via `npx`. Set LOCAL_CORE=1 to run the CLI from the sibling schema_forge_core
# SOURCE instead (for developers who also work on the core tooling). Requires
# schema_forge_core cloned as a sibling AND its deps installed (`npm install`
# there). Unset LOCAL_CORE (servers, CI, functional-only devs) keeps the exact
# published behaviour. See docs/repo-topology.md.
ifeq ($(LOCAL_CORE),1)
SF := ./cli/sf-local
else
SF := npx
endif

# --- Testing ---

test: ## Run all unit tests (CLI data-fixes + app-shell + artifacts + vitest)
	node --test 'cli/test/*.test.js'
	node --test 'tools/app-shell/src/**/__tests__/*.test.js'
	node --test 'tools/app-shell/test/*.test.js'
	node --test 'artifacts/**/__tests__/*.test.js'
	cd tools/app-shell && npx vitest run

test-all-coverage: ## Run ALL unit tests (Node + Vitest) with coverage reports
	@mkdir -p coverage
	@echo "=== Node tests (4 groups in parallel) ==="
	@node --test --experimental-test-coverage \
		--test-reporter=spec --test-reporter-destination=stdout \
		--test-reporter=lcov --test-reporter-destination=coverage/cli-lcov.info \
		$(shell find cli/test -name '*.test.js') > coverage/cli.log 2>&1 & pid1=$$!; \
	node --test --experimental-test-coverage \
		--test-reporter=spec --test-reporter-destination=stdout \
		--test-reporter=lcov --test-reporter-destination=coverage/appshell-lcov.info \
		$(shell find tools/app-shell/src -path '*/__tests__/*.test.js' ! -name 'useEntity-helpers.test.js') > coverage/appshell.log 2>&1 & pid2=$$!; \
	node --test --experimental-test-coverage \
		--test-reporter=spec --test-reporter-destination=stdout \
		--test-reporter=lcov --test-reporter-destination=coverage/appshell-test-lcov.info \
		$(shell find tools/app-shell/test -name '*.test.js') > coverage/appshell-test.log 2>&1 & pid3=$$!; \
	node --test --experimental-test-coverage \
		--test-reporter=spec --test-reporter-destination=stdout \
		--test-reporter=lcov --test-reporter-destination=coverage/artifacts-lcov.info \
		$(shell find artifacts -path '*/__tests__/*.test.js') > coverage/artifacts.log 2>&1 & pid4=$$!; \
	wait $$pid1; e1=$$?; \
	wait $$pid2; e2=$$?; \
	wait $$pid3; e3=$$?; \
	wait $$pid4; e4=$$?; \
	[ $$e1 -eq 0 ] || { echo "CLI tests FAILED:"; tail -30 coverage/cli.log; exit 1; }; \
	[ $$e2 -eq 0 ] || { echo "App-shell Node tests FAILED:"; tail -30 coverage/appshell.log; exit 1; }; \
	[ $$e3 -eq 0 ] || { echo "App-shell extra tests FAILED:"; tail -30 coverage/appshell-test.log; exit 1; }; \
	[ $$e4 -eq 0 ] || { echo "Artifact tests FAILED:"; tail -30 coverage/artifacts.log; exit 1; }; \
	echo "=== Node tests: all passed ==="
	@echo "=== Vitest (React components) ==="
	cd tools/app-shell && npx vitest run --coverage --coverage.reporter=lcov && sed 's|^SF:src/|SF:tools/app-shell/src/|' coverage/vitest/lcov.info > ../../coverage/vitest-lcov.info
	@echo "=== Merging LCOV reports ==="
	node scripts/merge-lcov.js 'coverage/*-lcov.info' coverage/merged-lcov.info
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
	cd tools/app-shell && npx vitest run --coverage --coverage.reporter=lcov \
	  --reporter=junit \
	  --outputFile=../../test-results/vitest.xml \
	  && cp coverage/vitest/lcov.info ../../coverage/vitest-lcov.info
	@echo "=== Merging LCOV reports ==="
	node scripts/merge-lcov.js 'coverage/*-lcov.info' coverage/merged-lcov.info

validate-pipeline: ## Validate pipeline completeness across all artifacts
	$(SF) sf-validate-pipeline --format=text

method-budget: ## Ratchet guard: fail only if a tracked class grew past its method baseline
	$(SF) sf-method-budget

window-leak-budget: ## Ratchet guard: fail only if window-specific literals in contract-ui grew (use --list to enumerate)
	$(SF) sf-window-leak-budget

test-frontend: ## Run only frontend generator tests
	cd cli && node --test 'test/generate-frontend.test.js'

HOTSPOT_FILE ?= tools/app-shell/src/components/contract-ui/DetailView.jsx
HOTSPOT_DAYS ?= 15
HOTSPOT_LIMIT ?= 10
BASE_REF ?= origin/main
HOTSPOT_SINCE ?= $(shell date -v-$(HOTSPOT_DAYS)d +%Y-%m-%d 2>/dev/null || date -d '$(HOTSPOT_DAYS) days ago' +%Y-%m-%d)

ast-churn-ranking: ## Show AST churn hotspots from the last N days and current-branch delta
	@node cli/src/ast-churn-hotspot.js --file "$(HOTSPOT_FILE)" --since "$(HOTSPOT_SINCE)" --days "$(HOTSPOT_DAYS)" --base-ref "$(BASE_REF)" --limit "$(HOTSPOT_LIMIT)" --summary

SCENARIO ?= double-send
WINDOW_NAME ?= sales-order
BASE_URL ?= http://127.0.0.1:8080/etendo_sf2
WORKER_STEPS ?= 1,2,5,10,20,50
RESET_SAFETY ?= 1
DOC_ID ?=
DOC_IDS ?=
TOKEN ?=
DB_GRADLE_PROPERTIES ?=
EMAIL_STRESS_REPORT ?= docs/reports/email-stress-limit-report-$(shell date +%Y-%m-%d-%H%M%S).html

email-stress-limits: ## Probe email contract limits. Usage: make email-stress-limits TOKEN=... DOC_ID=... [WORKER_STEPS=1,2,5,10,20]
	@if [ -z "$(TOKEN)" ]; then \
	  echo "Usage: make email-stress-limits TOKEN=<jwt> DOC_ID=<id> [SCENARIO=double-send|concurrent-load] [WORKER_STEPS=1,2,5,10,20]"; \
	  exit 1; \
	fi; \
	if [ "$(SCENARIO)" = "double-send" ] && [ -z "$(DOC_ID)" ]; then \
	  echo "DOC_ID is required for SCENARIO=double-send"; \
	  exit 1; \
	fi; \
	if [ "$(SCENARIO)" = "concurrent-load" ] && [ -z "$(DOC_IDS)" ]; then \
	  echo "DOC_IDS is recommended for SCENARIO=concurrent-load; synthetic IDs will not work against a real backend."; \
	fi; \
	EXTRA_ARGS=""; \
	if [ -n "$(DB_GRADLE_PROPERTIES)" ]; then EXTRA_ARGS="$$EXTRA_ARGS --db-gradle-properties $(DB_GRADLE_PROPERTIES)"; fi; \
	STRESS_RESET_SAFETY="$(RESET_SAFETY)" \
	ETENDO_TOKEN="$(TOKEN)" \
	ETENDO_BASE_URL="$(BASE_URL)" \
	STRESS_WINDOW="$(WINDOW_NAME)" \
	STRESS_WORKER_STEPS="$(WORKER_STEPS)" \
	STRESS_DOC_ID="$(DOC_ID)" \
	STRESS_DOC_IDS="$(DOC_IDS)" \
	node cli/test/stress/limits.js --scenario "$(SCENARIO)" $$EXTRA_ARGS

email-stress-limits-report: ## Probe email limits and generate a Jest/JUnit-style HTML report
	@STRESS_HTML_REPORT="$(EMAIL_STRESS_REPORT)" \
	$(MAKE) email-stress-limits; \
	status=$$?; \
	echo "Email stress HTML report: $(EMAIL_STRESS_REPORT)"; \
	exit $$status

email-stress-help: ## Show email stress limit probe variables
	@echo "Usage:"
	@echo "  make email-stress-limits TOKEN=<jwt> DOC_ID=<id>"
	@echo "  make email-stress-limits SCENARIO=concurrent-load TOKEN=<jwt> DOC_IDS=id1,id2,id3 WORKER_STEPS=5,10,25"
	@echo ""
	@echo "Variables:"
	@echo "  SCENARIO=double-send|concurrent-load   Default: double-send"
	@echo "  WINDOW_NAME=<spec>                     Default: sales-order"
	@echo "  BASE_URL=<etendo-root>                 Default: http://127.0.0.1:8080/etendo_sf2"
	@echo "  WORKER_STEPS=1,2,5,10,20,50            Worker ramp to execute"
	@echo "  RESET_SAFETY=1                         Clear target record throttle + matching audits before each step"
	@echo "  DOC_ID=<id>                            Required for double-send"
	@echo "  DOC_IDS=id1,id2,...                    Recommended for concurrent-load"
	@echo "  DB_GRADLE_PROPERTIES=<path>            Optional DB config source for RESET_SAFETY"
	@echo "  EMAIL_STRESS_REPORT=<path>             HTML report path for email-stress-limits-report"

quality-gate: ## Run Schema Forge quality gate for PR-affected windows
	$(SF) sf-quality-gate --pr-affected --baseline-ref origin/main --format md

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
	$(SF) sf-domain-boundary-check $$ARGS
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

test-e2e-onboarding-integration: ## Run the live onboarding integration spec (requires a running backend at BASE_URL, default :3100)
	cd e2e && E2E_ONBOARDING_INTEGRATION=1 npx playwright test tests/flows/onboarding-register.integration.spec.js

install-e2e: ## Install E2E dependencies + browsers
	cd e2e && npm install && npx playwright install chromium

# --- Code Generation ---

generate: ## Generate frontend from Sales Order contract
	$(SF) sf-generate-frontend artifacts/sales-order/contract.json

PUSH_TO_NEO ?= 0
SKIP_EXTRACT ?= 0
CACHE_DB ?= 0
FROM_CACHE ?= 0
ONLY ?=
SF_CACHE_PATH ?= cli/cache/ad-snapshot

regen: ## Re-run full pipeline for all active windows (HELP=1 or `make regen-help` for options)
	@if [ "$(HELP)" = "1" ]; then $(MAKE) -s regen-help; exit 0; fi; \
	REGEN_ARGS=""; \
	CACHE_ENV="SF_CACHE_PATH=$(SF_CACHE_PATH)"; \
	if [ "$(PUSH_TO_NEO)" = "1" ]; then REGEN_ARGS="$$REGEN_ARGS --push-to-neo"; fi; \
	if [ "$(SKIP_EXTRACT)" = "1" ]; then REGEN_ARGS="$$REGEN_ARGS --skip-extract"; fi; \
	if [ "$(CACHE_DB)" = "1" ]; then REGEN_ARGS="$$REGEN_ARGS --write-cache"; \
		if [ -z "$(ONLY)" ]; then CACHE_ENV="$$CACHE_ENV SF_CACHE_SWEEP=1"; fi; \
	fi; \
	if [ "$(FROM_CACHE)" = "1" ]; then CACHE_ENV="$$CACHE_ENV SF_CACHE_MODE=read"; fi; \
	if [ -n "$(ONLY)" ]; then REGEN_ARGS="$$REGEN_ARGS --only $(ONLY)"; fi; \
	env $$CACHE_ENV $(SF) sf-regen-all $$REGEN_ARGS

regen-help: ## Show usage and examples for `make regen`
	@echo "Usage: make regen [VAR=value ...]"
	@echo ""
	@echo "Variables:"
	@echo "  ONLY=<spec>[,<spec>...]   Run only the given window spec(s) (kebab-case, matches artifacts/<spec>/)"
	@echo "  PUSH_TO_NEO=1             Push the resulting config to NEO Headless after regenerating"
	@echo "  SKIP_EXTRACT=1            Skip the DB extraction step (reuse existing schema-raw.json)"
	@echo "  CACHE_DB=1                Run against DB and refresh $(SF_CACHE_PATH) (commit the diff)"
	@echo "  FROM_CACHE=1              Run extractors offline using $(SF_CACHE_PATH) (no DB needed)"
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
	@echo "  - For a single window, you can also run: $(SF) sf-resolve-curated --window <spec> --write"
	@echo "  - CACHE_DB and FROM_CACHE are mutually exclusive."
	@echo "  - The AD cache is one file per query under $(SF_CACHE_PATH)/<key>.json."
	@echo "  - A full 'make regen CACHE_DB=1' (no ONLY=) also prunes orphan cache files (SF_CACHE_SWEEP=1);"
	@echo "    scoped 'CACHE_DB=1 ONLY=<spec>' never sweeps, so it only refreshes that window's queries."

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
	if [ "$(FROM_CACHE)" = "1" ]; then CACHE_ENV="SF_CACHE_MODE=read SF_CACHE_PATH=$(SF_CACHE_PATH)"; fi; \
	if [ "$(CACHE_DB)" = "1" ]; then CACHE_ENV="SF_CACHE_MODE=write SF_CACHE_PATH=$(SF_CACHE_PATH)"; fi; \
	env $$CACHE_ENV $(SF) sf-push-neo $(ONLY) --dump-delta artifacts/$(ONLY)/neo-delta.json $$DELTA_ARGS

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
	CACHE_ENV=""; \
	if [ "$(FROM_CACHE)" = "1" ]; then REGEN_ARGS="--only $$SPECS"; CACHE_ENV="SF_CACHE_MODE=read SF_CACHE_PATH=$(SF_CACHE_PATH)"; fi; \
	env $$CACHE_ENV $(SF) sf-regen-all $$REGEN_ARGS || exit $$?; \
	FAIL=0; TOTAL_OK=0; TOTAL_FAIL=0; \
	for spec in $$(echo "$$SPECS" | tr ',' ' '); do \
	  OUTDIR="$(REGEN_CHECK_OUT_ROOT)/$$spec"; \
	  mkdir -p "$$OUTDIR/predicted" "$$OUTDIR/prev/sourcedata"; \
	  echo ""; \
	  echo "=== regen-check: $$spec ==="; \
	  CACHE_ENV=""; \
	  if [ "$(FROM_CACHE)" = "1" ]; then CACHE_ENV="SF_CACHE_MODE=read SF_CACHE_PATH=$(SF_CACHE_PATH)"; fi; \
	  if [ "$(CACHE_DB)" = "1" ]; then CACHE_ENV="SF_CACHE_MODE=write SF_CACHE_PATH=$(SF_CACHE_PATH)"; fi; \
	  env $$CACHE_ENV $(SF) sf-push-neo $$spec \
	    --dump-delta "$$OUTDIR/neo-delta.json" \
	    --prev-xml-dir "$(REGEN_CHECK_PREV_XML_DIR)" || { FAIL=1; TOTAL_FAIL=$$((TOTAL_FAIL+1)); continue; }; \
	  $(SF) sf-xml-apply-delta \
	    --prev-xml-dir "$(REGEN_CHECK_PREV_XML_DIR)" \
	    --delta "$$OUTDIR/neo-delta.json" \
	    --out-dir "$$OUTDIR/predicted/sourcedata" || { FAIL=1; TOTAL_FAIL=$$((TOTAL_FAIL+1)); continue; }; \
	  cp "$(REGEN_CHECK_PREV_XML_DIR)/ETGO_SF_SPEC.xml"   "$$OUTDIR/prev/sourcedata/"; \
	  cp "$(REGEN_CHECK_PREV_XML_DIR)/ETGO_SF_ENTITY.xml" "$$OUTDIR/prev/sourcedata/"; \
	  cp "$(REGEN_CHECK_PREV_XML_DIR)/ETGO_SF_FIELD.xml"  "$$OUTDIR/prev/sourcedata/"; \
	  if $(SF) sf-xml-regeneration-check "$$OUTDIR/prev" "$$OUTDIR/predicted" --include-dir sourcedata; then \
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
	@echo "  FROM_CACHE=1                 Run the full check offline from $(SF_CACHE_PATH)"
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
	@echo "  - To refresh the AD cache when AD changes: make regen ONLY=<spec> CACHE_DB=1, then commit $(SF_CACHE_PATH)."

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

# --- Remote DB tunnel (SSH → RDS in a private VPC) ---
#
# Supply connection details inline (SSH_HOST, DB_HOST, DB_USER, DB_PASSWORD, ...)
# or save a profile at ~/.config/schema-forge/remote/<name>.env and pass PROFILE=.
# Flags always win over a profile. Run `make db-tunnel-help` for the full guide.

PROFILE     ?=
SSH_HOST    ?=
DB_HOST     ?=
DB_PORT     ?=
DB_NAME     ?=
DB_USER     ?=
DB_PASSWORD ?=
LOCAL_PORT  ?=

# Assemble scripts/db-tunnel.sh connection flags from whatever vars are set.
TUNNEL_FLAGS = $(if $(PROFILE),--profile $(PROFILE)) $(if $(SSH_HOST),--ssh-host $(SSH_HOST)) $(if $(DB_HOST),--db-host $(DB_HOST)) $(if $(DB_PORT),--db-port $(DB_PORT)) $(if $(DB_NAME),--db-name $(DB_NAME)) $(if $(DB_USER),--db-user $(DB_USER)) $(if $(DB_PASSWORD),--db-password '$(DB_PASSWORD)') $(if $(LOCAL_PORT),--local-port $(LOCAL_PORT))

db-tunnel: ## Open a persistent SSH tunnel to a remote DB (connection vars or PROFILE=)
	@scripts/db-tunnel.sh $(strip $(TUNNEL_FLAGS)) up

db-tunnel-down: ## Close the remote DB tunnel
	@scripts/db-tunnel.sh $(strip $(TUNNEL_FLAGS)) down

db-tunnel-status: ## Report whether the remote DB tunnel is up
	@scripts/db-tunnel.sh $(strip $(TUNNEL_FLAGS)) status

db-psql: ## Interactive psql to a remote DB through the tunnel (SQL='...' or ARGS='...' optional)
	@scripts/db-tunnel.sh $(strip $(TUNNEL_FLAGS)) psql $(if $(SQL),-- -c "$(SQL)") $(ARGS)

data-fixes-remote: ## Run the tenant data-fixes runner against a REMOTE DB via the tunnel (same vars as data-fixes; no flags = interactive TUI)
	@if [ "$(HELP)" = "1" ]; then $(MAKE) -s db-tunnel-help; exit 0; fi; \
	DF_ARGS=""; \
	if [ "$(LIST_CLIENTS)" = "1" ]; then DF_ARGS="$$DF_ARGS --list-clients"; fi; \
	if [ "$(MARK_FIXED)" = "1" ]; then DF_ARGS="$$DF_ARGS --mark-fixed"; fi; \
	if [ "$(DRY_RUN)" = "1" ]; then DF_ARGS="$$DF_ARGS --dry-run"; fi; \
	if [ -n "$(CLIENT)" ]; then DF_ARGS="$$DF_ARGS --client $(CLIENT)"; fi; \
	if [ -n "$(FIX)" ]; then DF_ARGS="$$DF_ARGS --fix $(FIX)"; fi; \
	if [ -n "$(REASON)" ]; then DF_ARGS="$$DF_ARGS --reason \"$(REASON)\""; fi; \
	scripts/db-tunnel.sh $(strip $(TUNNEL_FLAGS)) run -- \
		sh -c "node cli/src/data-fixes/run.js $$DF_ARGS"

db-tunnel-help: ## Show usage and examples for the remote DB tunnel targets
	@echo "Remote DB tunnel — reach an RDS in a private VPC through an SSH bastion."
	@echo ""
	@echo "Connection (inline flags win over a saved PROFILE):"
	@echo "  SSH_HOST=<alias|host>   Bastion to tunnel through (e.g. etendo-go-staging)"
	@echo "  DB_HOST=<rds-endpoint>  Remote DB host as seen FROM the bastion"
	@echo "  DB_PORT=<port>          Remote DB port                       (default 5432)"
	@echo "  DB_NAME=<db>            Database name                        (default etendo)"
	@echo "  DB_USER=<user>          DB user"
	@echo "  DB_PASSWORD=<pass>      DB password  (quote it; escape \$$ as \$$\$$ in make)"
	@echo "  LOCAL_PORT=<port>       Local forwarded port                 (default 15432)"
	@echo "  PROFILE=<name>          Load ~/.config/schema-forge/remote/<name>.env instead"
	@echo ""
	@echo "Targets:"
	@echo "  make db-tunnel          Open a persistent tunnel + print connection info"
	@echo "  make db-tunnel-status   Is the tunnel up?"
	@echo "  make db-tunnel-down     Close the tunnel"
	@echo "  make db-psql            Interactive psql through the tunnel"
	@echo "  make db-psql SQL='...'  Run one SQL statement and exit"
	@echo "  make data-fixes-remote  Run the data-fixes runner against the remote DB,"
	@echo "                          non-interactively (accepts every make data-fixes"
	@echo "                          var: DRY_RUN, CLIENT, FIX, LIST_CLIENTS, ...)"
	@echo ""
	@echo "Interactive: run 'make data-fixes' and choose 'Remote (through an SSH tunnel)'."
	@echo "The wizard lets you pick/create a profile, opens the tunnel, and TESTS the"
	@echo "connection before doing anything — then closes the tunnel on exit."
	@echo ""
	@echo "Examples:"
	@echo "  make db-psql SSH_HOST=etendo-go-staging DB_HOST=my.rds.amazonaws.com \\"
	@echo "       DB_USER=postgres DB_PASSWORD='secret' SQL='SELECT count(*) FROM c_invoice;'"
	@echo "  make data-fixes-remote PROFILE=staging DRY_RUN=1"
	@echo "  make data-fixes-remote PROFILE=staging CLIENT=<id>"
	@echo ""
	@echo "Save a profile once (kept OUTSIDE the repo, never committed):"
	@echo "  mkdir -p ~/.config/schema-forge/remote"
	@echo "  printf 'SSH_HOST=etendo-go-staging\\nDB_HOST=my.rds.amazonaws.com\\nDB_USER=postgres\\nDB_PASSWORD=secret\\nDB_NAME=etendo\\n' \\"
	@echo "       > ~/.config/schema-forge/remote/staging.env && chmod 600 ~/.config/schema-forge/remote/staging.env"

sync-regen-check-workflow: ## Regenerate the mirror Offline Regen Check workflow in com.etendoerp.go
	./scripts/sync-offline-regen-check.sh

# --- Dev Server ---

dev: ensure-locale ## Start app-shell dev server
	cd tools/app-shell && npm run dev

dev-local-core: ensure-locale ## Start dev server resolving @etendosoftware/app-shell-core from local ../schema_forge_core source (hot-reload; requires it cloned as sibling)
	@test -d ../schema_forge_core/packages/app-shell-core/src || { echo "ERROR: ../schema_forge_core/packages/app-shell-core/src not found."; echo "Clone schema_forge_core as a sibling of this repo, or use 'make dev' to run against the published package."; exit 1; }
	@echo ">> LOCAL_CORE dev mode: app-shell-core resolves to ../schema_forge_core (published package bypassed)"
	cd tools/app-shell && LOCAL_CORE=1 npm run dev

dev-mock: ensure-locale ## Start app-shell dev server with mock data — required for E2E tests
	cd tools/app-shell && npm run dev:mock

build: ## Build app-shell for production
	cd tools/app-shell && npm run build
	$(SF) sf-generate-reports-manifest

# --- Setup ---

menu-cache: ## Refresh the AD menu cache from the database
	$(SF) sf-menu-cache refresh

uuid: ## Generate a new Etendo-format UUID (32 uppercase hex chars, no hyphens)
	@uuidgen | tr -d '-' | tr '[:lower:]' '[:upper:]'

merge-block-check: ## Merge-block pre-flight: PR checks across the 3 repos + copy-paste merge cmds (TASK="ETP-XXXX [ETP-YYYY ...]")
	@if [ -z "$(TASK)" ]; then echo "Usage: make merge-block-check TASK=ETP-4442"; exit 1; fi
	@./scripts/merge-block-check.sh $(TASK)

install: ## Install all workspace dependencies and activate git hooks
	npm install
	git config core.hooksPath .githooks

bump-core-version: ## Bump the schema_forge_core lockstep pin in all package.json + refresh lockfiles (VERSION=x.y.z; prompts if omitted)
	@V="$(VERSION)"; \
	if [ -z "$$V" ]; then read -p "Core version to pin (x.y.z): " V; fi; \
	if [ -z "$$V" ]; then echo "No version provided, aborting"; exit 1; fi; \
	$(MAKE) _bump-core-version-run VERSION=$$V

_bump-core-version-run:
	node scripts/bump-core-version.mjs $(VERSION)
	@echo "=== npm install (root workspace — installs + hoists app-shell deps) ==="
	npm install
	@echo "=== refresh tools/app-shell standalone lockfile (lock only, no nested node_modules) ==="
	npm install --prefix tools/app-shell --legacy-peer-deps --package-lock-only
	@echo "Done. Review the package.json + package-lock.json diffs before committing."

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
	$(SF) sf-report-preview --artifact business-partner --report listing

# --- Static Analysis (SonarQube) ---

sonar: ## Run SonarQube analysis on Schema Forge JS/JSX code
	sonar-scanner -Dproject.settings=sonar-project.properties

sonar-coverage: ## Run all tests with coverage then SonarQube analysis
	@mkdir -p coverage
	node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage/appshell-lcov.info 'tools/app-shell/src/**/__tests__/*.test.js'
	node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage/appshell-test-lcov.info 'tools/app-shell/test/*.test.js'
	cd tools/app-shell && npx vitest run --coverage && sed 's|^SF:src/|SF:tools/app-shell/src/|' coverage/vitest/lcov.info > ../../coverage/vitest-lcov.info
	sonar-scanner -Dproject.settings=sonar-project.properties

# --- Feature Flag Debt ---

flag-debt: ## Score per-flag technical debt from flags-registry.json (FLAG=<key>, JSON=1, HTML=1)
	@$(SF) sf-flag-debt $(if $(FLAG),--flag $(FLAG)) $(if $(JSON),--json) $(if $(HTML),--html)

# --- XML Regeneration Check ---

ORIGINAL_DB_DIR ?=
EXPORTED_DB_DIR ?=

xml-regeneration-check: ## Compare original module XML vs export.database output (requires ORIGINAL_DB_DIR and EXPORTED_DB_DIR)
	@if [ -z "$(ORIGINAL_DB_DIR)" ] || [ -z "$(EXPORTED_DB_DIR)" ]; then \
		echo "Usage: make xml-regeneration-check ORIGINAL_DB_DIR=<path> EXPORTED_DB_DIR=<path>"; \
		exit 1; \
	fi
	$(SF) sf-xml-regeneration-check "$(ORIGINAL_DB_DIR)" "$(EXPORTED_DB_DIR)"

# --- Project Context Switching ---
# Active locale is tracked in .active-locale (gitignored). Default: es.
# Usage: make switch-to-es

switch-to-es: ## Switch active locale to Spain (ES)
	@cp tools/app-shell/.env.es tools/app-shell/.env.local
	@echo es > .active-locale
	@echo "Active locale: ES (Spain) — com.etendoerp.go"

ensure-locale: ## Bootstrap ES locale if .active-locale does not exist (called automatically)
	@if [ ! -f .active-locale ]; then \
		if [ -f tools/app-shell/.env.es ]; then \
			$(MAKE) switch-to-es --no-print-directory; \
		else \
			echo "default" > .active-locale; \
			echo "Active locale: default (tools/app-shell/.env) — .env.es not present, skipping switch-to-es"; \
		fi; \
	fi

project-status: ## Show active locale and module ID
	@echo "Active locale : es"; \
	echo "Module        : com.etendoerp.go (Spain)"; \
	grep -s SF_MODULE_ID tools/app-shell/.env.local || echo "  .env.local missing — run: make switch-to-es"

# --- Cleanup ---

clean: ## Remove generated artifacts and build output
	rm -rf tools/app-shell/dist

# --- Help ---

help: ## Show this help
	@echo ""; \
	echo "\033[1mSchema Forge — Available targets\033[0m"; \
	echo ""; \
	awk '/^# ---/{gsub(/^# --- | ---$$/,"");printf "\033[1;33m%s\033[0m\n",$$0;next} \
	     /^[a-zA-Z][a-zA-Z0-9_-]*:.*## /{c=index($$0,":");h=index($$0,"## ");if(c>0&&h>0){printf "  \033[36m%-22s\033[0m %s\n",substr($$0,1,c-1),substr($$0,h+3)}}' Makefile; \
	echo ""

.DEFAULT_GOAL := help
