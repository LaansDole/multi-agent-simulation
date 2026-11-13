# Cline API Dry-Run Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify the Cline API (clinepass) as an LLM provider for the DevAll + the-delegation integration: first a backend dry-run pytest that executes a real YAML workflow against the Cline API, then a Playwright E2E test that exercises the full browser-to-backend pipeline.

**Architecture:** The Cline API at `https://api.cline.bot/api/v1` is OpenAI-compatible, so the existing `OpenAIProvider` (`runtime/node/agent/providers/openai_provider.py`) works with zero backend changes — a YAML agent node with `provider: openai`, `base_url: https://api.cline.bot/api/v1`, `api_key: ${CLINE_API_KEY}`, and `name: cline-pass/qwen3.7-max` routes correctly through the standard `OpenAI` Python client. The backend dry-run test calls `runtime.sdk.run_workflow()` directly (synchronous, no server needed). The Playwright test launches both servers, drives the the-delegation UI, imports the Cline YAML via the Browse Workflows modal, verifies the read-only graph + slot panel, then starts the workflow via the backend REST API and verifies node events stream into the Action Log panel via WebSocket.

**Tech Stack:** Backend: Python 3.12, pytest, `runtime.sdk.run_workflow`, OpenAI provider. Frontend E2E: Playwright 1.61, TypeScript, Vite dev server + DevAll backend on port 6400. No new production dependencies — Playwright is a devDependency and test-only.

## Global Constraints

- Python 3.12 (not 3.13). Use `uv run` for all Python commands. Backend tests: `uv run pytest tests/<file>::<test> -v`.
- No emojis anywhere (code, docs, comments, commit messages).
- No "claude" as git commit author.
- Type hints required on all new Python function signatures.
- the-delegation frontend commands run from `the-delegation/`: `npm run lint`, `npm run build`, `npx playwright test`.
- The Cline API key is provided separately (not inlined here) and the model is `cline-pass/qwen3.7-max`. The key goes in `.env` as `CLINE_API_KEY`.
- The Cline API returns OpenAI-compatible JSON with a `data` wrapper: `{"data": {"choices": [{"message": {"content": "..."}}]}}`. The `OpenAI` Python client handles this transparently.
- The API key must NOT be committed to git in plaintext. It goes in `.env` (already gitignored) and YAML uses `${CLINE_API_KEY}` placeholder resolution.
- Playwright tests are network-dependent (they call the real Cline API). The E2E test is tagged `@cline` so it can be filtered.
- the-delegation dev server runs on port 3000 with base path `/the-delegation/`. Vite proxy forwards `/api` and `/ws` to `http://localhost:6400`.
- `MAX_AGENTS = 5` in the-delegation; agent nodes beyond 5 map to character slot `-1` (log/flow only).
- the-delegation has NO JS test runner prior to this plan; Playwright is added as a devDependency.
- The ActionLogPanel is visible by default (`isLogOpen` defaults to `true` in `coreStore.ts` line 195). It renders in simulation mode only (App.tsx line 90: `viewMode !== 'design'`). It renders log entries as `<p className="text-xs text-zinc-600...">` inside `<div className="pl-3.5 border-l...">` (ActionLogPanel.tsx lines 529-533). The log entry text is the `entry.action` string, which for node events is `"Started: writer"` or `"Completed: writer"` (EventBridge.tsx `onNodeStarted`/`onNodeCompleted`).
- The design view overlay (App.tsx lines 121-143) has NO onClick on the outer backdrop div. To exit design mode, the Playwright test uses `page.evaluate` with a dynamic `import('/src/integration/store/coreStore.ts')` to call `useCoreStore.getState().setViewMode('simulation')` directly. This works because Vite dev mode resolves module imports in the page context.

---

## File Structure

### Backend (DevAll) — creates/modifies
- **Create** `yaml_instance/cline_dry_run.yaml` — minimal 2-agent YAML workflow using the Cline API, with `${CLINE_API_KEY}` / `${CLINE_BASE_URL}` placeholders.
- **Create** `tests/test_cline_dry_run.py` — pytest integration test that runs the YAML via `run_workflow()` and asserts the Cline API returned a non-empty response.
- **Modify** `.env` — add `CLINE_API_KEY` and `CLINE_BASE_URL` entries.
- **Modify** `pyproject.toml` — register `cline` pytest marker in `tool.pytest.ini_options.markers`.

### Frontend (the-delegation) — creates/modifies
- **Create** `the-delegation/playwright.config.ts` — Playwright config targeting the Vite dev server.
- **Create** `the-delegation/tests/cline-e2e.spec.ts` — Playwright E2E test that imports the Cline YAML, verifies the graph, starts the workflow, and checks events stream.
- **Modify** `the-delegation/package.json` — add `@playwright/test` devDependency and `test:e2e` script.

---

## Task 1: Cline dry-run YAML workflow file

**Files:**
- Create: `yaml_instance/cline_dry_run.yaml`

**Interfaces:**
- Consumes: `check.check.load_config` (validates the YAML), `runtime.sdk.run_workflow` (executes it), `${CLINE_API_KEY}` / `${CLINE_BASE_URL}` env placeholders resolved by `utils.vars_resolver.PlaceholderResolver`.
- Produces: a valid DevAll workflow YAML with two agent nodes using `provider: openai`, `base_url: https://api.cline.bot/api/v1`, `api_key: ${CLINE_API_KEY}`, `name: cline-pass/qwen3.7-max`. Used by Tasks 2 and 4.

This is a minimal 2-node workflow: a "Writer" agent generates a short sentence, a "Reviewer" agent confirms it. Both use the Cline API. No tooling, no memory, no thinking — the simplest path that exercises a real LLM call.

- [ ] **Step 1: Write the YAML file**

Create `yaml_instance/cline_dry_run.yaml`:

```yaml
version: 0.0.0
vars:
  CLINE_API_KEY: ${CLINE_API_KEY}
  CLINE_BASE_URL: ${CLINE_BASE_URL}
graph:
  id: cline_dry_run
  description: Minimal 2-agent dry-run workflow using the Cline API (clinepass).
  is_majority_voting: false
  nodes:
    - id: writer
      type: agent
      config:
        provider: openai
        name: cline-pass/qwen3.7-max
        role: |
          You are a concise writer. Respond with a single original sentence
          about the ocean. Output ONLY the sentence, nothing else.
        base_url: ${CLINE_BASE_URL}
        api_key: ${CLINE_API_KEY}
        params: {}
        tooling: null
        thinking: null
        memories: []
      description: Generates a single sentence about the ocean
      context_window: 0
      log_output: true
    - id: reviewer
      type: agent
      config:
        provider: openai
        name: cline-pass/qwen3.7-max
        role: |
          You are a reviewer. The previous message contains a sentence about
          the ocean. Respond with EXACTLY: REVIEW_DONE followed by the sentence.
        base_url: ${CLINE_BASE_URL}
        api_key: ${CLINE_API_KEY}
        params: {}
        tooling: null
        thinking: null
        memories: []
      description: Reviews the writer's output
      context_window: 0
      log_output: true
  edges:
    - from: writer
      to: reviewer
      trigger: true
      carry_data: true
  start:
    - writer
  end:
    - reviewer
```

- [ ] **Step 2: Add Cline credentials to `.env`**

Add these lines to `.env` (the file already exists with `BASE_URL` and `API_KEY` entries; append after the existing `API_KEY=lm-studio` line, before the `SERPER_DEV_API_KEY` section):

```env

# ============================================================================
# Cline API (clinepass) - for dry-run integration tests
# ============================================================================
CLINE_API_KEY=<your-cline-api-key-here>
CLINE_BASE_URL=https://api.cline.bot/api/v1
```

- [ ] **Step 3: Validate the YAML loads and resolves placeholders**

Run:

```bash
uv run python -c "from check.check import load_config; from pathlib import Path; d = load_config(Path('yaml_instance/cline_dry_run.yaml')); print('OK:', d.graph.id, len(d.graph.nodes), 'nodes')"
```

Expected: prints `OK: cline_dry_run 2 nodes` with no `Unresolved placeholder` errors.

If it fails with `Unresolved placeholder '${CLINE_API_KEY}'`:
- Verify `.env` has `CLINE_API_KEY=...` and `CLINE_BASE_URL=...` (Step 2).
- Verify `utils/env_loader.load_dotenv_file()` is called during `ensure_schema_registry_populated()` (it is, via `entity/config_loader.prepare_design_mapping` -> `load_dotenv_file` -> `build_env_var_map`).

- [ ] **Step 4: Commit**

```bash
git add yaml_instance/cline_dry_run.yaml
git commit -m "test: add Cline API dry-run YAML workflow and env credentials"
```

---

## Task 2: Backend dry-run pytest integration test

**Files:**
- Modify: `pyproject.toml` (register `cline` marker)
- Create: `tests/test_cline_dry_run.py`

**Interfaces:**
- Consumes: `runtime.sdk.run_workflow(yaml_file: str | Path, *, task_prompt: str, session_name: str | None = None) -> WorkflowRunResult`; `yaml_instance/cline_dry_run.yaml` (Task 1); `CLINE_API_KEY` and `CLINE_BASE_URL` from environment (`.env`).
- Produces: a pytest test `test_cline_dry_run` (marked `@pytest.mark.cline`) that executes the real Cline API and asserts the final message is non-empty and contains `REVIEW_DONE`.

`run_workflow` returns a `WorkflowRunResult` with `.final_message` (a `Message` object) and `.meta_info` (with `.token_usage`). The final message's `text_content()` method returns the string output of the end node (reviewer). The `run_workflow` function signature is at `runtime/sdk.py:74-83`:

```python
def run_workflow(
    yaml_file: Union[str, Path],
    *,
    task_prompt: str,
    attachments: Optional[Sequence[Union[str, Path]]] = None,
    session_name: Optional[str] = None,
    fn_module: Optional[str] = None,
    variables: Optional[Dict[str, Any]] = None,
    log_level: Optional[Union[LogLevel, str]] = None,
) -> WorkflowRunResult:
```

- [ ] **Step 1: Register the `cline` pytest marker**

In `pyproject.toml`, under `[tool.pytest.ini_options]`, add a `markers` list after the existing `filterwarnings` list. The full `[tool.pytest.ini_options]` section should read:

```toml
[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
python_files = ["test_*.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
addopts = "-v --tb=short"
filterwarnings = [
    "ignore:builtin type Swig.*:DeprecationWarning",
    "ignore:builtin type swigvarlink.*:DeprecationWarning",
]
markers = [
    "cline: marks tests that call the real Cline API (requires CLINE_API_KEY in .env)",
]
```

- [ ] **Step 2: Write the test**

Create `tests/test_cline_dry_run.py`:

```python
"""Integration test: dry-run a YAML workflow against the real Cline API (clinepass).

This test calls the Cline API at https://api.cline.bot/api/v1 using the
cline-pass/qwen3.7-max model. It requires CLINE_API_KEY and CLINE_BASE_URL
in the environment (or .env). Mark it with @pytest.mark.cline so it can be
skipped in CI environments without API access.

Run: uv run pytest tests/test_cline_dry_run.py -v
Skip in CI: uv run pytest -m "not cline" -v
"""

import os

import pytest

from runtime.sdk import run_workflow


@pytest.mark.cline
def test_cline_dry_run():
    """Execute the cline_dry_run.yaml workflow and verify a non-empty LLM response.

    The workflow has two agent nodes (writer -> reviewer) both using the
    Cline API. The reviewer's role instructs it to respond with REVIEW_DONE
    followed by the writer's sentence. We assert the final output contains
    REVIEW_DONE and is non-empty.
    """
    # Skip gracefully if the API key is not in the environment.
    api_key = os.environ.get("CLINE_API_KEY")
    if not api_key:
        pytest.skip("CLINE_API_KEY not set in environment; skipping Cline dry-run test")

    result = run_workflow(
        "yaml_instance/cline_dry_run.yaml",
        task_prompt="Begin the dry run.",
        session_name="cline_dry_run_test",
    )

    assert result.final_message is not None, (
        "Final message from end node (reviewer) is None"
    )

    final_text = result.final_message.text_content()
    assert final_text is not None, "Final message text_content() returned None"
    assert len(final_text.strip()) > 0, "Final message text is empty"
    assert "REVIEW_DONE" in final_text, (
        f"Expected 'REVIEW_DONE' in output, got: {final_text[:200]}"
    )
```

- [ ] **Step 3: Run the test to verify it passes**

```bash
uv run pytest tests/test_cline_dry_run.py -v
```

Expected: PASS (the test executes the full graph: writer node calls Cline API, reviewer node calls Cline API, final message contains `REVIEW_DONE`). This takes 5-15 seconds due to two real LLM calls.

If the test fails with `Unresolved placeholder '${CLINE_API_KEY}'`:
- Verify `.env` has `CLINE_API_KEY=...` and `CLINE_BASE_URL=...` (Task 1 Step 2).
- The `load_dotenv_file()` function in `utils/env_loader.py` populates `os.environ` from `.env` on first call. It is called during `ensure_schema_registry_populated()` which `run_workflow` calls at line 85.

- [ ] **Step 4: Verify the marker skip works**

```bash
uv run pytest -m "not cline" tests/test_workflows.py tests/test_workflow_graph_route.py tests/test_workflow_graph_serializer.py -v
```

Expected: all tests pass, and `test_cline_dry_run` is NOT collected (deselected by the marker filter).

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml tests/test_cline_dry_run.py
git commit -m "test: add Cline API dry-run integration test with pytest marker"
```

---

## Task 3: Playwright config and devDependency setup

**Files:**
- Modify: `the-delegation/package.json` (add `@playwright/test` devDependency and `test:e2e` script)
- Create: `the-delegation/playwright.config.ts`

**Interfaces:**
- Consumes: the Vite dev server (port 3000) and the DevAll backend (port 6400), both started externally before the test runs.
- Produces: a Playwright config that launches Chromium against `http://localhost:3000/the-delegation/` with a 60-second timeout (LLM calls are slow), and a `test:e2e` npm script.

- [ ] **Step 1: Add Playwright devDependency and test script**

In `the-delegation/package.json`, add `@playwright/test` to `devDependencies` and `test:e2e` to `scripts`. The full `scripts` and `devDependencies` sections should read:

```json
  "scripts": {
    "dev": "vite --port=3000 --host=0.0.0.0",
    "build": "vite build",
    "preview": "vite preview",
    "clean": "rm -rf dist",
    "lint": "tsc --noEmit",
    "test:e2e": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.61.0",
    "@types/node": "^22.14.0",
    "autoprefixer": "^10.4.21",
    "tailwindcss": "^4.1.14",
    "typescript": "~5.8.2",
    "vite": "^6.2.0"
  }
```

- [ ] **Step 2: Install the devDependency and browser binary**

```bash
cd the-delegation && npm install && npx playwright install chromium
```

Expected: `@playwright/test` installed and Chromium downloaded to `~/Library/Caches/ms-playwright/`. Takes 10-30 seconds.

- [ ] **Step 3: Write the Playwright config**

Create `the-delegation/playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the-delegation E2E tests.
 *
 * Expects both servers running before test start:
 *   - DevAll backend on port 6400
 *   - Vite dev server on port 3000
 *
 * The test uses the @cline tag so it can be filtered:
 *   npx playwright test --grep @cline
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000/the-delegation/',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

- [ ] **Step 4: Verify the config loads**

```bash
cd the-delegation && npx playwright test --list 2>&1 | head -10
```

Expected: `No tests found` (the `tests/` directory does not exist yet) but no config parse errors.

- [ ] **Step 5: Commit**

```bash
cd the-delegation
git add package.json package-lock.json playwright.config.ts
git commit -m "test: add Playwright config and devDependency for E2E tests"
```

---

## Task 4: Playwright E2E test for Cline workflow import and execution

**Files:**
- Create: `the-delegation/tests/cline-e2e.spec.ts`
- Create: `the-delegation/tests/tsconfig.json` (Playwright-specific tsconfig to avoid polluting the production tsconfig)

**Interfaces:**
- Consumes: `http://localhost:3000/the-delegation/` (Vite dev server), `http://localhost:6400` (DevAll backend), `yaml_instance/cline_dry_run.yaml` (Task 1, served by the backend's `GET /api/workflows` and `GET /api/workflows/{filename}/graph` endpoints), the backend's WebSocket `/ws` endpoint for streaming node events.
- Produces: a Playwright test tagged `@cline` that: (1) opens the app, (2) clicks "Browse Workflows", (3) imports `cline_dry_run.yaml`, (4) verifies the read-only ReactFlow graph renders with 2 nodes, (5) verifies the Character Slot Mapping panel shows 2 agents in slots 1-2, (6) exits design mode via Zustand store evaluation, (7) starts the workflow via store evaluation, (8) waits for node events to appear in the Action Log panel.

**How the test triggers the workflow without 3D canvas interaction:**

The normal user flow is: click a 3D character -> ChatPanel opens -> type a message -> `scene.sendMessage(text)` -> `BackendAgentSimulation.handleUserMessage()` -> `core.startProject(text)` (sets `phase: 'working'`) -> `BackendAgentSimulation.startWorkflow()` (triggered by store subscription watching `idle -> working` phase transition).

Clicking a 3D character in Playwright requires canvas coordinate clicking, which is fragile. Instead, the test uses `page.evaluate` to call the Zustand store directly. In Vite dev mode, `import('/src/integration/store/coreStore.ts')` resolves the module within the page context, giving access to `useCoreStore.getState().setViewMode('simulation')` and `useCoreStore.getState().startProject('Begin the dry run.')`. The `startProject` call sets `phase: 'working'` + `userBrief`, which triggers the `BackendAgentSimulation` subscription just like a real user message would.

The test does NOT reload the page between phases. The `workflowStore` (which holds `workflowGraph`) does not use `persist`, so a reload would lose the imported graph. Instead, the test exits design mode by calling `setViewMode('simulation')` via store evaluation, which makes the Action Log panel visible (it renders when `viewMode !== 'design'`, per `App.tsx` line 90).

**UI selectors (verified by reading the actual component source):**
- "Browse Workflows" button: `button:has-text("Browse Workflows")` in `Header.tsx` lines 80-86.
- WorkflowBrowser modal heading: `h3:has-text("Import Workflow")` in `WorkflowBrowser.tsx` line 55.
- Workflow file buttons: `button:has(span:has-text("cline_dry_run.yaml"))` in `WorkflowBrowser.tsx` lines 72-81.
- ReactFlow nodes: `.react-flow__node` CSS class (standard ReactFlow).
- Character Slots heading: `h3:has-text("Character Slots")` in `CharacterSlotMapping.tsx` line 33.
- Slot buttons: `button` elements inside the `div` sibling of the "Character Slots" heading (slots 1-5 rendered in `CharacterSlotMapping.tsx` lines 37-56).
- Action Log empty state: `text=Awaiting actions...` in `ActionLogPanel.tsx` line 508.
- Action Log entries: `<p className="text-xs text-zinc-600...">` elements containing `entry.action` strings like `"Started: writer"` and `"Completed: writer"` (EventBridge.tsx `onNodeStarted`/`onNodeCompleted`, rendered by `ActionLogPanel.tsx` line 530-532).

- [ ] **Step 1: Create the Playwright tsconfig**

Create `the-delegation/tests/tsconfig.json`:

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "types": ["@playwright/test", "node"],
    "noEmit": true
  }
}
```

This ensures Playwright test files type-check against the Playtest types without affecting the production `tsc --noEmit` lint (which only covers `src/`).

- [ ] **Step 2: Write the Playwright test**

Create `the-delegation/tests/cline-e2e.spec.ts`:

```typescript
import { expect, test } from '@playwright/test';

/**
 * E2E test: Import the Cline dry-run YAML workflow and execute it.
 *
 * Tagged @cline so it can be filtered:
 *   npx playwright test --grep @cline
 *
 * Prerequisites:
 *   - DevAll backend running on port 6400 (uv run python server_main.py --port 6400)
 *   - Vite dev server running on port 3000 (cd the-delegation && npm run dev)
 *   - CLINE_API_KEY and CLINE_BASE_URL in .env (backend root)
 *   - yaml_instance/cline_dry_run.yaml exists (Task 1)
 *
 * This test calls the real Cline API. It takes 10-30 seconds.
 */
test.describe('@cline Cline API E2E', () => {
  test('import and run cline_dry_run.yaml through the UI', async ({ page }) => {
    // -- Phase 1: Open the app and verify backend connection --

    await page.goto('/');
    await expect(page.locator('header')).toBeVisible({ timeout: 10_000 });

    // Wait for the backend status indicator to show "Connected" (green dot).
    // The status text is in a span inside the header (Header.tsx lines 128-137).
    await expect(
      page.locator('header span:has-text("Connected")'),
    ).toBeVisible({ timeout: 15_000 });

    // -- Phase 2: Import the Cline dry-run workflow --

    // Click "Browse Workflows" button (Header.tsx line 80).
    await page.click('button:has-text("Browse Workflows")');

    // Wait for the WorkflowBrowser modal to appear (WorkflowBrowser.tsx line 55).
    await expect(
      page.locator('h3:has-text("Import Workflow")'),
    ).toBeVisible({ timeout: 5_000 });

    // Wait for the workflow file list to load and find the cline_dry_run.yaml entry.
    const fileButton = page.locator(
      'button:has(span:has-text("cline_dry_run.yaml"))',
    );
    await expect(fileButton).toBeVisible({ timeout: 10_000 });

    // Click the file to import it. This calls fetchWorkflowGraph + importWorkflow
    // and closes the modal (WorkflowBrowser.tsx lines 31-45).
    await fileButton.click();

    // -- Phase 3: Verify the read-only graph and slot mapping --

    // The design view overlay should now show the read-only ReactFlow graph.
    // Wait for ReactFlow nodes to render (standard .react-flow__node class).
    await expect(page.locator('.react-flow__node').first()).toBeVisible({
      timeout: 10_000,
    });

    // Verify exactly 2 nodes rendered (writer + reviewer).
    const nodeCount = await page.locator('.react-flow__node').count();
    expect(nodeCount).toBe(2);

    // Verify the Character Slot Mapping panel is visible
    // (CharacterSlotMapping.tsx line 33).
    await expect(
      page.locator('h3:has-text("Character Slots")'),
    ).toBeVisible();

    // Verify slots 1 and 2 are filled (not "(empty)").
    // Slot buttons are inside the div sibling of the "Character Slots" heading.
    const slotButtons = page
      .locator('h3:has-text("Character Slots")')
      .locator('~ div')
      .locator('button');
    const slot1Text = await slotButtons.nth(0).innerText();
    const slot2Text = await slotButtons.nth(1).innerText();
    expect(slot1Text).not.toContain('(empty)');
    expect(slot2Text).not.toContain('(empty)');

    // -- Phase 4: Exit design mode via Zustand store evaluation --

    // The design overlay (App.tsx lines 121-143) has no backdrop onClick to
    // close it. The "Manage Teams" button calls setViewMode('design') which
    // is a no-op when already in design mode. We use page.evaluate with a
    // dynamic import to call setViewMode('simulation') directly.
    // Vite dev mode resolves import('/src/integration/store/coreStore.ts').
    await page.evaluate(async () => {
      const mod = await import('/src/integration/store/coreStore.ts');
      mod.useCoreStore.getState().setViewMode('simulation');
    });

    // Verify the Action Log panel is now visible (renders when viewMode !== 'design').
    // It shows "Awaiting actions..." when empty (ActionLogPanel.tsx line 508).
    await expect(page.locator('text=Awaiting actions...')).toBeVisible({
      timeout: 5_000,
    });

    // -- Phase 5: Start the workflow via Zustand store evaluation --

    // The normal flow: user sends a chat message to a 3D character ->
    // BackendAgentSimulation.handleUserMessage() -> core.startProject(text) ->
    // store phase transitions idle -> working -> startWorkflow() triggered.
    // We call startProject directly to avoid fragile 3D canvas interaction.
    await page.evaluate(async () => {
      const mod = await import('/src/integration/store/coreStore.ts');
      mod.useCoreStore.getState().startProject('Begin the dry run.');
    });

    // -- Phase 6: Verify workflow events stream into the Action Log --

    // The EventBridge adds log entries like "Started: writer" and
    // "Completed: writer" to the coreStore's actionLog.
    // The ActionLogPanel renders these as <p> elements with
    // className "text-xs text-zinc-600" (ActionLogPanel.tsx line 530).
    // Wait for at least one entry matching "Started:".
    await expect(
      page.locator('p:has-text("Started:")'),
    ).toBeVisible({ timeout: 60_000 });

    // Verify the writer node started specifically.
    await expect(
      page.locator('p:has-text("Started: writer")'),
    ).toBeVisible({ timeout: 10_000 });

    // Verify the workflow completed (the reviewer node finished).
    await expect(
      page.locator('p:has-text("Completed: reviewer")'),
    ).toBeVisible({ timeout: 60_000 });
  });
});
```

- [ ] **Step 3: Start both servers and run the E2E test**

In terminal 1, start the backend:
```bash
uv run python server_main.py --port 6400 --reload
```

In terminal 2, start the frontend:
```bash
cd the-delegation && npm run dev
```

Wait for both servers to be ready (backend prints `Uvicorn running on http://0.0.0.0:6400`, frontend prints `Local: http://localhost:3000`).

In terminal 3, run the test:
```bash
cd the-delegation && npx playwright test tests/cline-e2e.spec.ts --grep @cline --headed
```

Expected: the test passes. The browser opens, connects to the backend, imports `cline_dry_run.yaml`, shows the graph with 2 nodes, shows 2 character slots filled, exits design mode via store evaluation, starts the workflow via store evaluation, and log entries appear within 60 seconds.

**Troubleshooting:**

If the test fails at Phase 2 ("Browse Workflows" / file not visible):
- Verify the backend is running: `curl http://localhost:6400/api/workflows` should return `cline_dry_run.yaml` in the list.
- Verify the Vite proxy is working: `curl http://localhost:3000/api/workflows` should also return the list (Vite proxies `/api` to `:6400` per `vite.config.ts` lines 23-27).

If the test fails at Phase 3 (ReactFlow nodes not visible):
- The graph import may have failed. Check browser console (F12) for errors.
- Verify `GET http://localhost:6400/api/workflows/cline_dry_run.yaml/graph` returns a valid `NormalizedGraph` JSON with 2 nodes.

If the test fails at Phase 4 (dynamic import fails):
- Check the browser console for import errors. Vite dev mode should resolve `/src/integration/store/coreStore.ts`.
- If the `.ts` extension causes issues, try `/src/integration/store/coreStore` (without extension). Update both `page.evaluate` calls in the test.

If the test fails at Phase 5/6 (no log entries within 60s):
- The workflow execution may have failed. Check the backend terminal for errors.
- The `CLINE_API_KEY` and `CLINE_BASE_URL` must be in `.env` (backend root, not `the-delegation/`).
- The `startProject` call triggers `BackendAgentSimulation.startWorkflow()` via the store subscription at `BackendAgentSimulation.ts` line 67: `if (state.phase === 'working' && prevState.phase === 'idle' && state.userBrief)`. Verify the phase transition occurred by checking the browser console for `[BackendAgentSimulation] Running imported workflow cline_dry_run.yaml`.

- [ ] **Step 4: Commit**

```bash
cd the-delegation
git add tests/
git commit -m "test: add Playwright E2E test for Cline workflow import and execution"
```

---

## Task 5: Full verification and documentation

**Files:** None (verification only)

- [ ] **Step 1: Run the backend dry-run test in isolation**

```bash
uv run pytest tests/test_cline_dry_run.py -v
```

Expected: PASS. The test calls the real Cline API, executes the 2-agent workflow, and asserts the final message contains `REVIEW_DONE`.

- [ ] **Step 2: Run the backend test suite excluding Cline tests**

```bash
uv run pytest -m "not cline" tests/test_workflows.py tests/test_workflow_graph_route.py tests/test_workflow_graph_serializer.py tests/test_spatial_configs.py -v
```

Expected: all tests pass (no regressions from the YAML file or marker addition).

- [ ] **Step 3: Run the frontend lint and build**

```bash
cd the-delegation && npm run lint && npm run build
```

Expected: both pass (tsc --noEmit exits 0, vite build succeeds). Playwright test files do not affect the production build because they are in `tests/` which is outside `src/`.

- [ ] **Step 4: Run the Playwright E2E test**

Prerequisites: both servers running (backend on 6400, frontend on 3000).

```bash
cd the-delegation && npx playwright test tests/cline-e2e.spec.ts --grep @cline
```

Expected: PASS. The full pipeline works: browser -> Vite -> DevAll backend -> Cline API -> WebSocket events -> Action Log panel.

- [ ] **Step 5: Final commit (if any fixes were needed)**

If the smoke test revealed issues requiring fixes, commit them. Otherwise, no commit is needed.
