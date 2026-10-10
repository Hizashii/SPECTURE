.DEFAULT_GOAL := help

# uv and Node are installed per-user; make them findable even if the shell PATH lacks it.
export PATH := $(HOME)/.local/bin:$(PATH)

API := apps/api
WEB := apps/web

.PHONY: openapi help setup dev dev-api dev-web test test-api test-web e2e lint typecheck build check format migrate docker-up

help:
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

setup: ## Install backend and frontend dependencies
	cd $(API) && uv sync
	cd $(WEB) && npm ci

dev: ## Run API (:8000) and web (:5173) with hot reload
	$(MAKE) -j2 dev-api dev-web

dev-api: ## Run only the API (:8000) with reload
	cd $(API) && uv run uvicorn spectre.main:app --reload --port 8000

dev-web: ## Run only the web app (:5173)
	cd $(WEB) && npm run dev

test: test-api test-web ## Run backend and frontend unit/integration tests

test-api: ## Backend tests
	cd $(API) && uv run pytest

test-web: ## Frontend tests
	cd $(WEB) && npm test

e2e: ## Run Playwright smoke tests (needs: cd apps/web && npx playwright install chromium)
	cd $(WEB) && npm run e2e

lint: ## Ruff, ESLint and format checks
	cd $(API) && uv run ruff check . && uv run ruff format --check .
	cd $(WEB) && npm run lint && npm run format:check

typecheck: ## mypy and tsc
	cd $(API) && uv run mypy
	cd $(WEB) && npm run typecheck

build: ## Production build of the web app
	cd $(WEB) && npm run build

check: lint typecheck test build ## Everything CI runs, except e2e

format: ## Auto-format both apps
	cd $(API) && uv run ruff format .
	cd $(WEB) && npm run format

openapi: ## Regenerate the OpenAPI spec and the web client's TypeScript types
	cd $(API) && uv run python -c "import json; from spectre.main import app; print(json.dumps(app.openapi(), indent=2, sort_keys=True))" > ../web/openapi.json
	cd $(WEB) && npm run types

migrate: ## Apply database migrations
	cd $(API) && uv run alembic upgrade head

docker-up: ## Build and run both containers (needs Docker Compose)
	docker compose up --build
