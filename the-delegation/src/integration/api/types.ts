/**
 * Types for DevAll backend integration.
 *
 * These types mirror the WebSocket message protocol used by the DevAll
 * FastAPI backend (server/services/websocket_manager.py).
 */

// ── WebSocket Event Protocol ─────────────────────────────────────

/** Inbound WS events from the DevAll backend. */
export type BackendEventType =
  | 'connection'
  | 'session_resumed'
  | 'workflow_started'
  | 'workflow_completed'
  | 'workflow_cancelled'
  | 'log'
  | 'error'
  | 'pong'
  | 'input_received'
  | 'status'
  | 'node_started'
  | 'node_output'
  | 'node_completed'
  | 'human_input_required'
  | 'workspace_artifacts';

export interface BackendEvent<T = any> {
  type: BackendEventType;
  data: T;
}

/** Outbound WS messages to the DevAll backend. */
export type ClientMessageType =
  | 'ping'
  | 'human_input'
  | 'get_status'
  | 'cancel';

export interface ClientMessage<T = any> {
  type: ClientMessageType;
  data?: T;
}

// ── Specific Event Payloads ───────────────────────────────────────

export interface ConnectionEventData {
  session_id: string;
  status: 'connected';
}

export interface WorkflowStartedData {
  yaml_file: string;
  task_prompt: string;
}

export interface WorkflowCompletedData {
  results: Record<string, any>;
  summary: string | null;
  token_usage: TokenUsage | null;
}

export interface WorkflowCancelledData {
  message: string;
}

export interface NodeStartedData {
  node_id: string;
  node_name: string;
  agent_index: number;
}

export interface NodeOutputData {
  node_id: string;
  agent_index: number;
  output: string;
  task_id?: string;
}

export interface NodeCompletedData {
  node_id: string;
  agent_index: number;
  output: string;
}

export interface HumanInputRequiredData {
  node_id: string;
  agent_index: number;
  prompt: string;
  task_id?: string;
}

export interface LogEntryData {
  level: string;
  message: string;
  node_id?: string;
  agent_index?: number;
  timestamp?: string;
}

export interface ErrorData {
  message: string;
}

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  [key: string]: any;
}

// ── REST API Types ────────────────────────────────────────────────

export interface WorkflowExecuteRequest {
  session_id: string;
  yaml_file: string;
  task_prompt: string;
  attachments?: string[];
  log_level?: string;
}

export interface WorkflowRunRequest {
  yaml_file: string;
  task_prompt: string;
  session_name?: string;
  attachments?: string[];
  variables?: Record<string, any>;
  log_level?: string;
}

export interface WorkflowListItem {
  name: string;
  display_name: string;
  description: string;
  category: string;
}

// ── Model Info ─────────────────────────────────────────────────────

export interface ModelInfo {
  id: string;
  provider: string;
  type: string;
}

// ── Backend Connection State ──────────────────────────────────────

export type BackendConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface BackendState {
  connectionStatus: BackendConnectionStatus;
  sessionId: string | null;
  lastError: string | null;
}
