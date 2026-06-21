/**
 * EventBridge -- Maps DevAll backend WebSocket events to Zustand store mutations.
 *
 * This is the single point of translation between the backend event protocol
 * and the frontend state model. The 3D simulation (SceneManager) and React UI
 * both react to store changes via their existing subscriptions -- they never
 * need to know about the backend directly.
 *
 * Design:
 * - Subscribes to BackendClient events
 * - Translates each event type into one or more Zustand store mutations
 * - Maintains a mapping from backend node_id to frontend agent_index
 */

import type { BackendClient } from './BackendClient';
import type {
  BackendEvent,
  BackendConnectionStatus,
  ConnectionEventData,
  ErrorData,
  HumanInputRequiredData,
  LogEntryData,
  NodeCompletedData,
  NodeOutputData,
  NodeStartedData,
  WorkflowCompletedData,
  WorkflowStartedData,
} from './types';

import { useCoreStore } from '../store/coreStore';
import { useUiStore } from '../store/uiStore';

/**
 * Mapping from backend graph node_id to 3D agent index.
 * This is populated when a workflow starts, based on the team config.
 */
type NodeAgentMap = Map<string, number>;

export class EventBridge {
  private client: BackendClient;
  private unsubEvent: (() => void) | null = null;
  private unsubStatus: (() => void) | null = null;
  private nodeAgentMap: NodeAgentMap = new Map();

  constructor(client: BackendClient) {
    this.client = client;
  }

  /**
   * Start listening to backend events and mapping them to store mutations.
   * Call this after BackendClient.connect().
   */
  public start(): void {
    this.unsubEvent = this.client.onEvent((event) => this.handleEvent(event));
    this.unsubStatus = this.client.onStatusChange((status) => this.handleStatusChange(status));
  }

  /** Stop listening. */
  public stop(): void {
    this.unsubEvent?.();
    this.unsubStatus?.();
    this.unsubEvent = null;
    this.unsubStatus = null;
  }

  /**
   * Register a mapping from backend node IDs to frontend agent indices.
   * Must be called before a workflow starts so events can be routed to
   * the correct 3D characters.
   */
  public setNodeAgentMap(map: Record<string, number>): void {
    this.nodeAgentMap = new Map(Object.entries(map));
  }

  /** Resolve a backend node_id to a frontend agent index (defaults to 1 = lead). */
  private resolveAgentIndex(nodeId?: string, explicitIndex?: number): number {
    if (explicitIndex !== undefined) return explicitIndex;
    if (!nodeId) return 1;
    // Strip "review_" prefix if present to map review nodes to their corresponding agents
    const cleanNodeId = nodeId.startsWith('review_') ? nodeId.substring(7) : nodeId;
    if (this.nodeAgentMap.has(cleanNodeId)) return this.nodeAgentMap.get(cleanNodeId)!;
    return 1; // Default to lead agent
  }

  // ── Event Router ────────────────────────────────────────────────

  private handleEvent(event: BackendEvent): void {
    switch (event.type) {
      case 'connection':
        this.onConnection(event.data as ConnectionEventData);
        break;
      case 'workflow_started':
        this.onWorkflowStarted(event.data as WorkflowStartedData);
        break;
      case 'workflow_completed':
        this.onWorkflowCompleted(event.data as WorkflowCompletedData);
        break;
      case 'workflow_cancelled':
        this.onWorkflowCancelled();
        break;
      case 'node_started':
        this.onNodeStarted(event.data as NodeStartedData);
        break;
      case 'node_output':
        this.onNodeOutput(event.data as NodeOutputData);
        break;
      case 'node_completed':
        this.onNodeCompleted(event.data as NodeCompletedData);
        break;
      case 'human_input_required':
        this.onHumanInputRequired(event.data as HumanInputRequiredData);
        break;
      case 'log':
        this.onLog(event.data as LogEntryData);
        break;
      case 'error':
        this.onError(event.data as ErrorData);
        break;
      case 'session_resumed':
        this.onSessionResumed(event.data);
        break;
      // 'pong', 'input_received' -- no store mutation needed
      default:
        break;
    }
  }

  // ── Event Handlers ──────────────────────────────────────────────

  private onConnection(data: ConnectionEventData): void {
    console.log('[EventBridge] Connected to backend, session:', data.session_id);
    useCoreStore.getState().setWsSessionId(data.session_id);
  }

  private onWorkflowStarted(data: WorkflowStartedData): void {
    const core = useCoreStore.getState();
    core.setUserBrief(data.task_prompt);
    core.setPhase('working');
  }

  private onWorkflowCompleted(data: WorkflowCompletedData): void {
    const core = useCoreStore.getState();

    if (data.summary) {
      core.setFinalOutput(data.summary);
    }

    // Update token usage from backend
    if (data.token_usage) {
      // Token usage is tracked by the backend; we can display the totals
      // The store's addResponseLog already handles accumulation, but for
      // the final tally we set it directly if the backend provides it.
    }

    core.setPhase('done');
    core.setFinalOutputOpen(true);
  }

  private onWorkflowCancelled(): void {
    const core = useCoreStore.getState();
    core.setPhase('idle');
    core.addLogEntry({
      agentIndex: -1,
      action: 'Workflow cancelled by user.',
    });
  }

  private onNodeStarted(data: NodeStartedData): void {
    const core = useCoreStore.getState();
    const agentIndex = this.resolveAgentIndex(data.node_id, data.agent_index);

    // Create a task in the Kanban
    const task = core.addTask({
      title: data.node_name || data.node_id,
      description: `Executing node: ${data.node_id}`,
      assignedAgentId: agentIndex,
      status: 'in_progress',
      requiresUserApproval: false,
    });

    // Track mapping from node_id to task_id for later completion
    this._nodeTaskMap.set(data.node_id, task.id);

    // Update agent visual status
    useUiStore.getState().setAgentStatus(agentIndex, 'working');

    core.addLogEntry({
      agentIndex,
      action: `Started: ${data.node_name || data.node_id}`,
      taskId: task.id,
    });
  }

  private onNodeOutput(data: NodeOutputData): void {
    const core = useCoreStore.getState();
    const taskId = this._nodeTaskMap.get(data.node_id);

    if (taskId) {
      core.setTaskOutput(taskId, data.output);
    }

    const agentIndex = this.resolveAgentIndex(data.node_id, data.agent_index);
    core.addLogEntry({
      agentIndex,
      action: `Output received for ${data.node_id}`,
      taskId,
    });
  }

  private onNodeCompleted(data: NodeCompletedData): void {
    const core = useCoreStore.getState();
    const taskId = this._nodeTaskMap.get(data.node_id);
    const agentIndex = this.resolveAgentIndex(data.node_id, data.agent_index);

    if (taskId) {
      if (data.output) {
        core.setTaskOutput(taskId, data.output);
      }
      core.updateTaskStatus(taskId, 'done');
    }

    useUiStore.getState().setAgentStatus(agentIndex, 'idle');

    // Append output to the agent's chat history as an assistant response
    if (data.output) {
      core.setAgentHistory(agentIndex, [
        ...(core.agentHistories[agentIndex] ?? []),
        {
          role: 'assistant',
          content: data.output
        }
      ]);
    }

    core.addLogEntry({
      agentIndex,
      action: `Completed: ${data.node_id}`,
      taskId,
    });

    this._nodeTaskMap.delete(data.node_id);
  }

  private onHumanInputRequired(data: HumanInputRequiredData): void {
    const core = useCoreStore.getState();
    const agentIndex = this.resolveAgentIndex(data.node_id, data.agent_index);
    const taskId = this._nodeTaskMap.get(data.node_id);

    if (taskId) {
      core.submitTaskForReview(taskId, data.prompt);
      // Append the review prompt to the agent's chat history with reviewTaskId metadata
      core.setAgentHistory(agentIndex, [
        ...(core.agentHistories[agentIndex] ?? []),
        {
          role: 'assistant',
          content: data.prompt,
          metadata: { reviewTaskId: taskId }
        }
      ]);
    }

    useUiStore.getState().setAgentStatus(agentIndex, 'on_hold');

    core.addLogEntry({
      agentIndex,
      action: `Waiting for human input: ${data.prompt}`,
      taskId,
    });
  }

  private onLog(data: LogEntryData): void {
    const core = useCoreStore.getState();
    const agentIndex = data.agent_index ?? -1;

    core.addLogEntry({
      agentIndex,
      action: `[${data.level}] ${data.message}`,
    });
  }

  private onError(data: ErrorData): void {
    console.error('[EventBridge] Backend error:', data.message);

    useCoreStore.getState().addLogEntry({
      agentIndex: -1,
      action: `Error: ${data.message}`,
    });
  }

  private onSessionResumed(data: any): void {
    console.log('[EventBridge] Session resumed:', data);
    if (data && data.session_id) {
      useCoreStore.getState().setWsSessionId(data.session_id);
    }
  }

  // ── Connection Status -> Store ──────────────────────────────────

  private handleStatusChange(status: BackendConnectionStatus): void {
    console.log('[EventBridge] Backend connection status:', status);
    useCoreStore.getState().setBackendStatus(status);
  }

  // ── Internal State ──────────────────────────────────────────────

  /** Maps backend node_id -> frontend task_id (from coreStore). */
  private _nodeTaskMap: Map<string, string> = new Map();

  // ── Cleanup ─────────────────────────────────────────────────────

  public dispose(): void {
    this.stop();
    this.nodeAgentMap.clear();
    this._nodeTaskMap.clear();
  }
}
