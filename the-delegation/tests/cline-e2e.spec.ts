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

    // -- Phase 3: Enter design mode and verify the read-only graph --

    // The import sets workflowGraph in the store but does not switch viewMode.
    // The design overlay (App.tsx lines 121-143) only renders ReadOnlyWorkflowGraph
    // when viewMode === 'design' AND workflowGraph is set. We enter design mode
    // via the Zustand store so the graph becomes visible for verification.
    // Dynamic import runs inside the browser page context via page.evaluate,
    // importing a Vite-served module by URL at runtime; a static import from the
    // Node test process cannot reach the page's module graph.
    await page.evaluate(async () => {
      const mod = await import('/the-delegation/src/integration/store/coreStore.ts');
      mod.useCoreStore.getState().setViewMode('design');
    });

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
    // CharacterSlotMapping renders buttons inside a container div. The h3
    // "Character Slots" and the slot buttons are in separate child divs of
    // the same parent, so we scope to the panel container first.
    const slotPanel = page.locator('div:has(h3:has-text("Character Slots"))');
    const slotButtons = slotPanel.locator('button');
    const slot1Text = await slotButtons.nth(0).innerText();
    const slot2Text = await slotButtons.nth(1).innerText();
    expect(slot1Text).not.toContain('(empty)');
    expect(slot2Text).not.toContain('(empty)');

    // -- Phase 4: Exit design mode via Zustand store evaluation --

    // The design overlay (App.tsx lines 121-143) has no backdrop onClick to
    // close it. The "Manage Teams" button calls setViewMode('design') which
    // is a no-op when already in design mode. We use page.evaluate with a
    // dynamic import to call setViewMode('simulation') directly.
    // The .ts extension is required: Vite dedupes modules by URL, so the
    // dynamic import path must match the static import URL exactly.
    await page.evaluate(async () => {
      const mod = await import('/the-delegation/src/integration/store/coreStore.ts');
      mod.useCoreStore.getState().setViewMode('simulation');
    });

    // Verify the Action Log panel is now visible (renders when viewMode !== 'design').
    // The panel has "Activity" and "Technical" tab buttons (ActionLogPanel.tsx lines 487-498).
    await expect(page.locator('button:has-text("Activity")')).toBeVisible({
      timeout: 5_000,
    });

    // -- Phase 5: Start the workflow via Zustand store evaluation --

    // The normal flow: user sends a chat message to a 3D character ->
    // BackendAgentSimulation.handleUserMessage() -> core.startProject(text) ->
    // store phase transitions idle -> working -> startWorkflow() triggered.
    // We call startProject directly to avoid fragile 3D canvas interaction.
    await page.evaluate(async () => {
      const mod = await import('/the-delegation/src/integration/store/coreStore.ts');
      mod.useCoreStore.getState().startProject('Begin the dry run.');
    });

    // Switch to the Activity tab to see action log entries.
    // The default tab is "technical" which shows debugLog, not actionLog.
    // EventBridge adds "Started: writer" / "Completed: reviewer" to actionLog,
    // which renders on the Activity tab (ActionLogPanel.tsx lines 506-537).
    await page.click('button:has-text("Activity")');

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
