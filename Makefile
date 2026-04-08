.PHONY: test test-frontend test-e2e test-e2e-headless test-e2e-debug test-e2e-ui test-e2e-report test-e2e-record generate dev build install install-e2e deploy clean help report-serve report-serve-detach report-stop report-preview

# --- Testing ---

test: ## Run all CLI tests
	cd cli && node --test 'test/*.test.js'

test-frontend: ## Run only frontend generator tests
	cd cli && node --test 'test/generate-frontend.test.js'

# --- E2E Testing (Playwright) ---

test-e2e: ## Run E2E tests with visible browser
	cd e2e && npx playwright test --headed

test-e2e-headless: ## Run E2E tests headless (CI mode)
	cd e2e && npx playwright test --headed=false

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

# --- Dev Server ---

dev: ## Start app-shell dev server (http://localhost:3100)
	cd tools/app-shell && npm run dev

build: ## Build app-shell for production
	cd tools/app-shell && npm run build

# --- Setup ---

install: ## Install all workspace dependencies
	npm install

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

# --- Cleanup ---

clean: ## Remove generated artifacts and build output
	rm -rf tools/app-shell/dist

# --- Help ---

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-18s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
