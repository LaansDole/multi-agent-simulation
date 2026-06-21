/**
 * BackendAgentSimulation -- Replaces the client-side AgentSimulation.
 *
 * Instead of running LLM calls in the browser, this class connects to
 * the DevAll Python backend via WebSocket and translates backend workflow
 * events into the same Zustand store mutations that the original
 * AgentSimulation + AgentBrain produced.
 *
 * The SceneManager consumes this class with the same public API so
 * the 3D visualization layer requires no changes.
 */

import { AgenticSystem, getAllAgents } from '../../data/agents';
import { useCoreStore } from '../../integration/store/coreStore';
import { useUiStore } from '../../integration/store/uiStore';
import { BackendClient } from '../../integration/api/BackendClient';
import { EventBridge } from '../../integration/api/EventBridge';

export class BackendAgentSimulation {
  private client: BackendClient;
  private bridge: EventBridge;
  private system: AgenticSystem;
  private unsubs: (() => void)[] = [];

  constructor(system: AgenticSystem) {
    this.system = system;

    // Initialize backend client with Vite proxy URLs (relative)
    this.client = new BackendClient(
      `ws://${window.location.hostname}:6400/ws`,
      `http://${window.location.hostname}:6400`,
    );
    this.bridge = new EventBridge(this.client);

    // Build node -> agent index mapping from the team config
    this.buildNodeAgentMap();

    // Connect and start listening
    this.client.connect();
    this.bridge.start();

    // Monitor store for workflow triggers
    this.startStateMonitoring();
  }

  /**
   * Build a mapping from DevAll graph node IDs to 3D agent indices.
   * When a YAML workflow is generated from an AgenticSystem, each agent's
   * `id` field becomes the node ID in the graph. This mapping lets the
   * EventBridge route backend events to the correct 3D character.
   */
  private buildNodeAgentMap(): void {
    const agents = getAllAgents(this.system);
    const map: Record<string, number> = {};
    for (const agent of agents) {
      map[agent.id] = agent.index;
    }
    this.bridge.setNodeAgentMap(map);
  }

  private startStateMonitoring(): void {
    // Watch for project phase transitions that should trigger backend calls
    this.unsubs.push(
      useCoreStore.subscribe((state, prevState) => {
        // When the user sets a brief and starts the project,
        // trigger the backend workflow execution
        if (state.phase === 'working' && prevState.phase === 'idle' && state.userBrief) {
          this.startWorkflow(state.userBrief);
        }
      })
    );

    // Watch for task approval/rejection that needs to be sent to backend
    this.unsubs.push(
      useCoreStore.subscribe((state, prevState) => {
        // Find tasks that transitioned from 'on_hold' to 'scheduled' (rejection)
        // or from 'on_hold' to 'done' (approval)
        for (const task of state.tasks) {
          const prevTask = prevState.tasks.find(t => t.id === task.id);
          if (!prevTask) continue;

          if (prevTask.status === 'on_hold' && task.status === 'done') {
            // User approved -- send approval to backend
            this.client.sendHumanInput(task.output || 'Approved');
          } else if (prevTask.status === 'on_hold' && task.status === 'scheduled') {
            // User rejected with comments -- send feedback to backend
            this.client.sendHumanInput(task.reviewComments || 'Rejected');
          }
        }
      })
    );
  }

  /**
   * Start a workflow on the DevAll backend.
   * The YAML file to use depends on the current team configuration.
   */
  private async startWorkflow(brief: string): Promise<void> {
    const sessionId = this.client.currentSessionId;
    if (!sessionId) {
      console.error('[BackendAgentSimulation] No session ID, cannot start workflow');
      return;
    }

    try {
      const yamlFile = `${this.system.id}.yaml`;

      // Export current visual team config to YAML and upload it to the backend
      const { exportSystemToYaml } = await import('../../integration/api/YamlExporter');
      const yamlContent = exportSystemToYaml(this.system);
      
      console.log(`[BackendAgentSimulation] Exporting and uploading YAML for ${yamlFile}...`);
      await this.client.uploadWorkflow(yamlFile, yamlContent);

      await this.client.executeWorkflow({
        session_id: sessionId,
        yaml_file: yamlFile,
        task_prompt: brief,
      });
    } catch (error) {
      console.error('[BackendAgentSimulation] Failed to start workflow:', error);
      useCoreStore.getState().addLogEntry({
        agentIndex: -1,
        action: `Failed to start workflow: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  /**
   * Handle a user chat message directed at a specific agent.
   * Routes through the backend instead of calling AgentBrain.think() directly.
   */
  public async handleUserMessage(agentIndex: number, text: string): Promise<string | null> {
    const core = useCoreStore.getState();
    if (core.phase === 'idle') {
      // If the project hasn't started yet, this message is the brief itself.
      // Transitioning the store phase will trigger startWorkflow via startStateMonitoring.
      core.startProject(text);
    } else {
      // For chat messages during active workflow, we send human_input through the WebSocket.
      // The backend routes this to the appropriate agent node.
      this.client.sendHumanInput(text);
    }

    // The response will arrive as a backend event and be handled by EventBridge.
    // We return null here -- the SceneManager's sendMessage() method
    // already handles the async response via store subscriptions.
    return null;
  }

  /** Cancel the current workflow. */
  public cancelWorkflow(): void {
    this.client.sendCancel();
  }

  /** Get the backend connection status. */
  public get connectionStatus() {
    return this.client.status;
  }

  /** Get the backend client for direct access (e.g., REST calls). */
  public getClient(): BackendClient {
    return this.client;
  }

  /** Alias maintained for SceneManager compatibility. */
  public getAgent(_index: number): any {
    // In the backend model, agents don't exist as local objects.
    // Return a minimal stub so SceneManager.getLeadBrain() doesn't crash.
    return null;
  }

  public processScheduledTasks(): void {
    // No-op: task scheduling is handled by the backend GraphExecutor
  }

  public dispose(): void {
    this.unsubs.forEach(unsub => unsub());
    this.unsubs = [];
    this.bridge.dispose();
    this.client.dispose();
  }
}
