# ==============================================================================
# Development Commands
# ==============================================================================

.PHONY: dev
dev: ## Run both backend and frontend development servers
	@$(MAKE) server wait-backend client

.PHONY: server
server: stop ## Start the backend server in the background
	@echo "Starting server in background..."
	@uv run python server_main.py --port 6400 &

.PHONY: wait-backend
wait-backend: ## Wait until backend port is reachable
	@echo "Waiting for backend on port 6400..."
	@for i in $$(seq 1 60); do if curl -fsS "http://127.0.0.1:6400/api/workflows" >/dev/null 2>&1; then echo "Backend is reachable"; exit 0; fi; sleep 1; done; echo "Backend did not become reachable within 60 seconds"; exit 1

.PHONY: client
client: ## Start the frontend development server
	@cd frontend && npx cross-env VITE_API_BASE_URL=http://localhost:6400 npm run dev

.PHONY: stop
stop: ## Stop backend and frontend servers cross-platform
	@echo "Stopping backend server (port 6400)..."
	@PIDS=$$(lsof -ti :6400 2>/dev/null); if [ -n "$$PIDS" ]; then echo "$$PIDS" | xargs kill -9 2>/dev/null && echo "Process on port 6400 killed"; else echo "No process running on port 6400"; fi
	@echo "Stopping frontend server (port 5173)..."
	@PIDS=$$(lsof -ti :5173 2>/dev/null); if [ -n "$$PIDS" ]; then echo "$$PIDS" | xargs kill -9 2>/dev/null && echo "Process on port 5173 killed"; else echo "No process running on port 5173"; fi

# ==============================================================================
# Desktop Launcher
# ==============================================================================

.PHONY: install-launcher
install-launcher: ## Install clickable launcher apps to ~/Desktop
	@echo ""
	@echo "=== Installing Desktop Launchers ==="
	@echo ""
	@chmod +x scripts/launch-dev.command scripts/stop-dev.command
	@if [ "$$(uname)" = "Darwin" ]; then \
		echo "macOS detected - building .app bundles..."; \
		echo "  Generating icon..."; \
		bash scripts/build-icon.sh "$(CURDIR)/assets/icon.png" "$(CURDIR)/assets/icon.icns"; \
		echo "  Building DevAll Launch.app..."; \
		bash scripts/build-app-bundle.sh "DevAll Launch" "$(CURDIR)/scripts/launch-dev.command" "$(CURDIR)/assets/icon.icns" ~/Desktop; \
		echo "  Building DevAll Stop.app..."; \
		bash scripts/build-app-bundle.sh "DevAll Stop" "$(CURDIR)/scripts/stop-dev.command" "$(CURDIR)/assets/icon.icns" ~/Desktop; \
		echo "Verifying bundles..."; \
		ls -d ~/Desktop/DevAll\ Launch.app >/dev/null 2>&1 && echo "  DevAll Launch.app - OK" || echo "  DevAll Launch.app - MISSING"; \
		ls -d ~/Desktop/DevAll\ Stop.app >/dev/null 2>&1 && echo "  DevAll Stop.app - OK" || echo "  DevAll Stop.app - MISSING"; \
		echo ""; \
		echo "Done! App bundles installed to ~/Desktop:"; \
		echo "  DevAll Launch.app  - Double-click to start the platform"; \
		echo "  DevAll Stop.app    - Double-click to stop the platform"; \
		echo ""; \
		echo "NOTE: On first launch, macOS may block the app."; \
		echo "  Right-click the app > Open, or run:"; \
		echo "    xattr -cr ~/Desktop/DevAll\\ Launch.app"; \
		echo "    xattr -cr ~/Desktop/DevAll\\ Stop.app"; \
	else \
		echo "Non-macOS detected - creating .command symlinks..."; \
		ln -sf "$(CURDIR)/scripts/launch-dev.command" ~/Desktop/launch-dev.command; \
		ln -sf "$(CURDIR)/scripts/stop-dev.command" ~/Desktop/stop-dev.command; \
		echo "Done! Launcher scripts installed to ~/Desktop:"; \
		echo "  launch-dev.command  - Double-click to start the platform"; \
		echo "  stop-dev.command    - Double-click to stop the platform"; \
	fi
	@echo ""

.PHONY: uninstall-launcher
uninstall-launcher: ## Remove launcher apps from ~/Desktop
	@echo "Removing desktop launchers..."
	@rm -rf ~/Desktop/DevAll\ Launch.app ~/Desktop/DevAll\ Stop.app 2>/dev/null || true
	@rm -f ~/Desktop/launch-dev.command ~/Desktop/stop-dev.command 2>/dev/null || true
	@echo "Done."

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
	@$(MAKE) backend-tests
	@$(MAKE) backend-lint

.PHONY: backend-tests
backend-tests: ## Run backend tests
	@uv run pytest -v

.PHONY: backend-lint
backend-lint: ## Run backend linting
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
	p=r'$(firstword $(MAKEFILE_LIST))'.strip(); \
	[print(f'{m[0]:<20} {m[1]}') for m in re.findall(r'^([a-zA-Z_-]+):.*?## (.*)$$', open(p, encoding='utf-8').read(), re.M)]" | sort

