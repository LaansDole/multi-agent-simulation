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
	@echo "Stopping frontend server (port 5173)..."
	@if npx kill-port 5173 >/dev/null 2>&1; then echo "Process on port 5173 killed"; else echo "No process running on port 5173"; fi

# ==============================================================================
# Tools & Maintenance
# ==============================================================================

.PHONY: sync
sync: ## Sync Vue graphs to the server database
	@uv run python tools/sync_vuegraphs.py

.PHONY: validate-yamls
validate-yamls: ## Validate all YAML configuration files
	@uv run python tools/validate_all_yamls.py

# ==============================================================================
# Help
# ==============================================================================

.PHONY: help
help: ## Display this help message
	@python -c "import re; \
	p=r'$(firstword $(MAKEFILE_LIST))'.strip(); \
	[print(f'{m[0]:<20} {m[1]}') for m in re.findall(r'^([a-zA-Z_-]+):.*?## (.*)$$', open(p, encoding='utf-8').read(), re.M)]" | sort
