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
 * - Maintains a mapping from backend node_id to frontend agent indices
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
  NormalizedGraph,
  WorkflowCompletedData,
  WorkflowStartedData,
} from './types';
import { InteractionTracker, type StartPlan } from './interactionPlanner';

import { useCoreStore } from '../store/coreStore';
import { useUiStore } from '../store/uiStore';

/**
 * Mapping from backend graph node_id to 3D agent indices (several when one
 * node hosts several characters, e.g. the DynaClinic Care Team specialists).
 * This is populated when a workflow starts, based on the team config.
 */
type NodeAgentMap = Map<string, number[]>;

/** Node types whose output is a fixed marker, not content: a literal end node is shown via its feeder. */
const MARKER_NODE_TYPES: Record<string, true> = { literal: true, loop_counter: true, loop_timer: true };

/** One node's entry in workflow_completed `results` (workflow/graph.py _collect_all_outputs). */
interface NodeResult {
  results?: (
    | { type: 'text'; payload: string }
    | { type: 'message'; payload: { content?: string | { text?: string }[] | null } }
  )[];
}

/** Full text of a node's last output (node_completed carries only the first 500 characters). */
function resultText(entry: NodeResult | undefined): string | null {
  const last = entry?.results?.at(-1);
  if (!last) return null;
  if (last.type === 'text') return last.payload;
  const content = last.payload.content;
  if (typeof content === 'string') return content;
  return content?.map((block) => block.text ?? '').filter(Boolean).join('\n') || null;
}

export class EventBridge {
  private client: BackendClient;
  private unsubEvent: (() => void) | null = null;
  private unsubStatus: (() => void) | null = null;
  private nodeAgentMap: NodeAgentMap = new Map();
  private graph: NormalizedGraph | null = null;
  private tracker = new InteractionTracker();

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
  public setNodeAgentMap(map: Record<string, number[]>): void {
    this.nodeAgentMap = new Map(Object.entries(map));
  }

  /**
   * The running workflow's graph: its edges drive hand-offs (who meets whom) and its end node
   * the final output. Without one, characters work at their desks with no hand-offs.
   */
  public setGraph(graph: NormalizedGraph | null): void {
    this.graph = graph;
    this.resetTracker();
  }

  private resetTracker(): void {
    this.tracker = new InteractionTracker(
      this.graph?.edges ?? [],
      (nodeId) => (this.nodeAgentMap.get(nodeId) ?? []).some((index) => index >= 1),
    );
  }

  /**
   * Resolve a backend node_id to its frontend agent indices.
   * The frontend nodeAgentMap is authoritative when present; the backend's
   * explicitIndex is only a fallback. Unmapped/non-agent nodes resolve to [-1]
   * (log + Kanban only, no 3D character).
   */
  private resolveAgentIndices(nodeId?: string, explicitIndex?: number): number[] {
    if (!nodeId) return [explicitIndex ?? -1];
    const cleanNodeId = nodeId.startsWith('review_') ? nodeId.substring(7) : nodeId;
    return this.nodeAgentMap.get(cleanNodeId) ?? [-1];
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
    this.resetTracker();
  }

  private onWorkflowCompleted(data: WorkflowCompletedData): void {
    const core = useCoreStore.getState();

    const finalText = this.finalOutput(data);
    if (finalText) {
      core.setFinalOutput(finalText);
    }

    // Update token usage from backend
    if (data.token_usage) {
      // Token usage is tracked by the backend; we can display the totals
      // The store's addResponseLog already handles accumulation, but for
      // the final tally we set it directly if the backend provides it.
    }

    useUiStore.getState().setSceneCue({ kind: 'meeting_end' });
    core.setPhase('done');
    core.setFinalOutputOpen(true);
  }

  /**
   * The run's final text. A literal end node (e.g. "Hospital simulation ended.") is a marker, so
   * show the content node that fed it last instead (full text from `results`), skipping feeders
   * with blank output such as a save_file agent.
   */
  private finalOutput(data: WorkflowCompletedData): string | null {
    const nodeType = (nodeId: string) => this.graph?.nodes.find((n) => n.id === nodeId)?.type ?? '';
    const endId = this.graph?.end?.[0];
    const text = endId && nodeType(endId) === 'literal'
      ? this.tracker.feederText(
        endId,
        (nodeId) => !MARKER_NODE_TYPES[nodeType(nodeId)],
        (nodeId) => resultText(data.results?.[`node_${nodeId}`]) || this.tracker.outputOf(nodeId),
      )
      : null;
    return text || data.final_text || data.summary;
  }

  private onWorkflowCancelled(): void {
    const core = useCoreStore.getState();
    useUiStore.getState().setSceneCue({ kind: 'meeting_end' });
    core.setPhase('idle');
    core.addLogEntry({
      agentIndex: -1,
      action: 'Workflow cancelled by user.',
    });
  }

  /**
   * Publishes a node start as scene cues: a hand-off from the agent whose output it receives, and
   * conversation meetings forming or breaking up. Runs before the node's task is added, so the
   * scene takes over the listener before the task watcher would send it to its desk.
   */
  private cue(plan: StartPlan): void {
    const ui = useUiStore.getState();
    const characters = (nodeIds: string[]) =>
      nodeIds.flatMap((nodeId) => this.nodeAgentMap.get(nodeId) ?? []).filter((index) => index >= 1);
    if (plan.meetingEnd) ui.setSceneCue({ kind: 'meeting_end' });
    if (plan.meetingStart) ui.setSceneCue({ kind: 'meeting', members: characters(plan.meetingStart) });
    const { handOff } = plan;
    if (handOff) {
      ui.setSceneCue({
        kind: 'handoff',
        speakers: characters([handOff.from]),
        listeners: characters([handOff.to]),
        waves: characters(handOff.also),
        text: handOff.text,
      });
    }
  }

  private onNodeStarted(data: NodeStartedData): void {
    const core = useCoreStore.getState();
    const agentIndices = this.resolveAgentIndices(data.node_id, data.agent_index);
    this.cue(this.tracker.started(data.node_id));

    // One task per character: the 3D scene walks a character to its desk while it has an in_progress task.
    const taskIds = agentIndices.map((agentIndex) => core.addTask({
      title: data.node_name || data.node_id,
      description: `Executing node: ${data.node_id}`,
      assignedAgentId: agentIndex,
      status: 'in_progress',
      requiresUserApproval: false,
    }).id);

    this._nodeTaskMap.set(data.node_id, taskIds);

    // Only update 3D character status for mapped agent nodes (index >= 1).
    for (const agentIndex of agentIndices) {
      if (agentIndex >= 1) useUiStore.getState().setAgentStatus(agentIndex, 'working');
    }

    core.addLogEntry({
      agentIndex: agentIndices[0],
      action: `Started: ${data.node_name || data.node_id}`,
      taskId: taskIds[0],
    });
  }

  private onNodeOutput(data: NodeOutputData): void {
    const core = useCoreStore.getState();
    const taskIds = this._nodeTaskMap.get(data.node_id) ?? [];

    for (const taskId of taskIds) core.setTaskOutput(taskId, data.output);

    core.addLogEntry({
      agentIndex: this.resolveAgentIndices(data.node_id, data.agent_index)[0],
      action: `Output received for ${data.node_id}`,
      taskId: taskIds[0],
    });
  }

  private onNodeCompleted(data: NodeCompletedData): void {
    const core = useCoreStore.getState();
    const taskIds = this._nodeTaskMap.get(data.node_id) ?? [];
    const agentIndices = this.resolveAgentIndices(data.node_id, data.agent_index);
    this.tracker.completed(data.node_id, data.output ?? '');

    for (const taskId of taskIds) {
      if (data.output) {
        core.setTaskOutput(taskId, data.output);
      }
      core.updateTaskStatus(taskId, 'done');
    }

    for (const agentIndex of agentIndices) {
      if (agentIndex < 1) continue;
      useUiStore.getState().setAgentStatus(agentIndex, 'idle');
      if (data.output) {
        core.setAgentHistory(agentIndex, [
          ...(core.agentHistories[agentIndex] ?? []),
          { role: 'assistant', content: data.output },
        ]);
      }
    }

    core.addLogEntry({
      agentIndex: agentIndices[0],
      action: `Completed: ${data.node_id}`,
      taskId: taskIds[0],
    });

    this._nodeTaskMap.delete(data.node_id);
  }

  private onHumanInputRequired(data: HumanInputRequiredData): void {
    const core = useCoreStore.getState();
    // Review goes to the node's first character only: each approved task sends one human input.
    const agentIndex = this.resolveAgentIndices(data.node_id, data.agent_index)[0];
    const taskId = this._nodeTaskMap.get(data.node_id)?.[0];

    if (taskId) {
      core.submitTaskForReview(taskId, data.prompt);
      if (agentIndex >= 1) {
        core.setAgentHistory(agentIndex, [
          ...(core.agentHistories[agentIndex] ?? []),
          { role: 'assistant', content: data.prompt, metadata: { reviewTaskId: taskId } },
        ]);
      }
    }

    if (agentIndex >= 1) {
      useUiStore.getState().setAgentStatus(agentIndex, 'on_hold');
    }

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

  /** Maps backend node_id -> frontend task ids (from coreStore), one per character. */
  private _nodeTaskMap: Map<string, string[]> = new Map();

  // ── Cleanup ─────────────────────────────────────────────────────

  public dispose(): void {
    this.stop();
    this.nodeAgentMap.clear();
    this._nodeTaskMap.clear();
  }
}
