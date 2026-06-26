.PHONY: extract regen push validate uuid help local dev

# Load .env.local if it exists (DB credentials, ETENDO_GRADLE_PROPERTIES)
-include .env.local
export

# SF_ROOT tells the CLI that THIS directory is the project root,
# so artifacts/ writes go to tools/etendo-go-ar/artifacts/ not cli/artifacts/
export SF_ROOT := $(CURDIR)

ONLY ?=
PUSH_TO_NEO ?= 0

extract: ## Extract raw schema from Etendo AR DB. Usage: make extract MENU_NAME="Purchase Order"
	@[ -n "$(MENU_NAME)" ] || (echo "Error: MENU_NAME is required. Usage: make extract MENU_NAME=\"Purchase Order\""; exit 1)
	npx sf-extract-db --menu-name "$(MENU_NAME)"

regen: ## Regenerate contract + frontend. Usage: make regen ONLY=purchase-order
	@[ -n "$(ONLY)" ] || (echo "Error: ONLY is required. Usage: make regen ONLY=window-name"; exit 1)
	npx sf-pipeline --menu-name "$(ONLY)" --skip-interactive --skip-to resolve-curated
	@[ "$(PUSH_TO_NEO)" = "1" ] && npx sf-push-neo $(ONLY) || true

push: ## Push contract to NEO Headless. Usage: make push ONLY=purchase-order
	@[ -n "$(ONLY)" ] || (echo "Error: ONLY is required."; exit 1)
	npx sf-push-neo $(ONLY)

validate: ## Run pipeline validator across all AR artifacts
	npx sf-validate

local: ## Run pipeline locally using cache snapshot without DB. Usage: make local ONLY=purchase-order
	@[ -n "$(ONLY)" ] || (echo "Error: ONLY is required. Usage: make local ONLY=window-name"; exit 1)
	SF_CACHE_MODE=read npx sf-pipeline --menu-name "$(ONLY)" --skip-interactive --skip-to resolve-curated --dry-run

dev: ## Start Vite app shell development server
	cd app-shell && npm run dev

uuid: ## Generate a new Etendo UUID (32-char uppercase hex)
	node -e "import('node:crypto').then(c => console.log(c.randomUUID().replace(/-/g,'').toUpperCase()))"

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'
