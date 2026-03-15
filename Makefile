# ==============================================================================
# Development Commands
# ==============================================================================

.PHONY: dev
dev: ## Run both backend and frontend development servers
	@$(MAKE) server wait-backend client

.PHONY: server
server: stop ## Start the backend server in the background
	@echo "Starting server in background..."
	@uv run python server_main.py --port 6400 --reload &

.PHONY: wait-backend
wait-backend: ## Wait until backend port is reachable
	@echo "Waiting for backend on port 6400..."
	@for i in $$(seq 1 30); do if curl -fsS "http://127.0.0.1:6400/api/workflows" >/dev/null 2>&1; then echo "Backend is reachable"; exit 0; fi; sleep 1; done; echo "Backend did not become reachable within 30 seconds"; exit 1

.PHONY: client
client: ## Start the frontend development server
	@cd frontend && npx cross-env VITE_API_BASE_URL=http://localhost:6400 npm run dev

.PHONY: stop
stop: ## Stop backend and frontend servers cross-platform
	@echo "Stopping backend server (port 6400)..."
	@if npx kill-port 6400 >/dev/null 2>&1; then echo "Process on port 6400 killed"; else echo "No process running on port 6400"; fi
	@if npx kill-port 6400 >/dev/null 2>&1; then echo "Process on port 6400 killed"; else echo "No process running on port 6400"; fi
	@echo "Stopping frontend server (port 5173)..."
	@if npx kill-port 5173 >/dev/null 2>&1; then echo "Process on port 5173 killed"; else echo "No process running on port 5173"; fi
	@if npx kill-port 5173 >/dev/null 2>&1; then echo "Process on port 5173 killed"; else echo "No process running on port 5173"; fi

# ==============================================================================
# Tools & Maintenance
# ==============================================================================

.PHONY: sync
sync: ## Sync Vue graphs to the server database
	@uv run python tools/sync_vuegraphs.py

.PHONY: thumbnails
thumbnails: ## Regenerate spatial config thumbnail images
	@cd frontend && npm run generate:thumbnails

.PHONY: validate-yamls
validate-yamls: ## Validate all YAML configuration files
	@uv run python tools/validate_all_yamls.py

# ==============================================================================
# Quality Checks
# ==============================================================================

.PHONY: check
check: check-backend check-frontend ## Run all quality checks (backend + frontend)

.PHONY: check-backend
check-backend: ## Run backend quality checks (tests + linting)
	@echo "Running backend tests..."
	@uv run pytest -v
	@echo "Running backend linting..."
	@uvx ruff check .

.PHONY: check-frontend
check-frontend: ## Run frontend quality checks (tests + linting)
	@echo "Running frontend tests..."
	@cd frontend && npx vitest run
	@echo "Running frontend linting..."
	@cd frontend && npm run lint

.PHONY: test-frontend
test-frontend: ## Run frontend unit tests
	@cd frontend && npx vitest run

# ==============================================================================
# Help
# ==============================================================================

.PHONY: help
help: ## Display this help message
	@uv run python -c "import re; \
	@uv run python -c "import re; \
	p=r'$(firstword $(MAKEFILE_LIST))'.strip(); \
	[print(f'{m[0]:<20} {m[1]}') for m in re.findall(r'^([a-zA-Z_-]+):.*?## (.*)$$', open(p, encoding='utf-8').read(), re.M)]" | sort
