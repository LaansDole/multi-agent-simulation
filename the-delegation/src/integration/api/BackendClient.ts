/**
 * BackendClient -- WebSocket + REST client for the DevAll backend.
 *
 * Manages a single WebSocket connection to `/ws` and provides REST methods
 * for workflow CRUD. Handles reconnection with exponential backoff.
 *
 * This is a pure transport layer -- it does not know about Zustand stores.
 * The EventBridge subscribes to events emitted here and maps them to store
 * mutations.
 */

import type {
  BackendConnectionStatus,
  BackendEvent,
  ClientMessage,
  ModelInfo,
  WorkflowExecuteRequest,
  WorkflowListItem,
} from './types';

type EventCallback = (event: BackendEvent) => void;

const DEFAULT_WS_URL = `ws://${window.location.hostname}:6400/ws`;
const DEFAULT_API_URL = `http://${window.location.hostname}:6400`;

// Reconnection tuning
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const RECONNECT_MULTIPLIER = 2;
const HEARTBEAT_INTERVAL_MS = 30000;

export class BackendClient {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private apiUrl: string;
  private sessionId: string | null = null;
  private listeners: Set<EventCallback> = new Set();
  private statusListeners: Set<(status: BackendConnectionStatus) => void> = new Set();

  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private intentionalClose = false;
  private _status: BackendConnectionStatus = 'disconnected';

  constructor(wsUrl?: string, apiUrl?: string) {
    this.wsUrl = wsUrl || DEFAULT_WS_URL;
    this.apiUrl = apiUrl || DEFAULT_API_URL;
  }

  // ── Connection Lifecycle ────────────────────────────────────────

  public get status(): BackendConnectionStatus {
    return this._status;
  }

  public get currentSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Open a WebSocket connection to the DevAll backend.
   * If a sessionId is provided, attempts to resume that session.
   */
  public connect(sessionId?: string): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.intentionalClose = false;
    this.setStatus('connecting');

    const url = sessionId
      ? `${this.wsUrl}?session_id=${encodeURIComponent(sessionId)}`
      : this.wsUrl;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setStatus('connected');
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      try {
        const parsed: BackendEvent = JSON.parse(event.data);

        // Capture session ID from connection events
        if (parsed.type === 'connection' && parsed.data?.session_id) {
          this.sessionId = parsed.data.session_id;
        }

        this.emit(parsed);
      } catch (err) {
        console.error('[BackendClient] Failed to parse WS message:', err);
      }
    };

    this.ws.onclose = (event) => {
      this.stopHeartbeat();
      if (!this.intentionalClose) {
        this.setStatus('reconnecting');
        this.scheduleReconnect();
      } else {
        this.setStatus('disconnected');
      }
    };

    this.ws.onerror = (error) => {
      console.error('[BackendClient] WebSocket error:', error);
      // onclose will fire after onerror, so reconnection is handled there
    };
  }

  /** Gracefully close the connection without triggering reconnection. */
  public disconnect(): void {
    this.intentionalClose = true;
    this.stopHeartbeat();
    this.clearReconnect();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.setStatus('disconnected');
  }

  // ── WebSocket Send ──────────────────────────────────────────────

  /** Send a typed message to the backend via WebSocket. */
  public send(message: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[BackendClient] Cannot send: WebSocket not open');
      return;
    }

    this.ws.send(JSON.stringify(message));
  }

  /** Send a human input response (for human-in-the-loop nodes). */
  public sendHumanInput(input: string, attachments?: string[]): void {
    this.send({
      type: 'human_input',
      data: { input, attachments: attachments || [] },
    });
  }

  /** Request cancellation of the current workflow. */
  public sendCancel(): void {
    this.send({ type: 'cancel' });
  }

  /** Request current session status. */
  public sendGetStatus(): void {
    this.send({ type: 'get_status' });
  }

  // ── REST API Methods ────────────────────────────────────────────

  /** Start a workflow execution (async, results arrive via WebSocket). */
  public async executeWorkflow(request: WorkflowExecuteRequest): Promise<{ status: string; session_id: string }> {
    const response = await fetch(`${this.apiUrl}/api/workflow/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || 'Failed to execute workflow');
    }

    return response.json();
  }

  /** List available YAML workflows. */
  public async listWorkflows(): Promise<WorkflowListItem[]> {
    const response = await fetch(`${this.apiUrl}/api/workflows`);

    if (!response.ok) {
      throw new Error('Failed to list workflows');
    }

    const data = await response.json();
    return data.workflows || [];
  }

  /** Upload or update a workflow YAML file on the backend. */
  public async uploadWorkflow(filename: string, content: string): Promise<any> {
    const list = await this.listWorkflows();
    const exists = list.some((item) => {
      if (typeof item === 'string') {
        return item === filename;
      }
      return (item as any).name === filename;
    });

    if (exists) {
      const response = await fetch(`${this.apiUrl}/api/workflows/${encodeURIComponent(filename)}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) {
        throw new Error(`Failed to update workflow: ${response.statusText}`);
      }
      return response.json();
    } else {
      const response = await fetch(`${this.apiUrl}/api/workflows/upload/content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content }),
      });
      if (!response.ok) {
        throw new Error(`Failed to upload workflow: ${response.statusText}`);
      }
      return response.json();
    }
  }

  /** Health check the backend. */
  public async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
      return response.ok;
    } catch {
      return false;
    }
  }

  /** Fetch available models from the backend. */
  public async fetchModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.apiUrl}/api/models`, {
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) return [];
      const data = await response.json();
      return data.models || [];
    } catch {
      return [];
    }
  }

  // ── Event System ────────────────────────────────────────────────

  /** Subscribe to all backend events. Returns unsubscribe function. */
  public onEvent(callback: EventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /** Subscribe to connection status changes. Returns unsubscribe function. */
  public onStatusChange(callback: (status: BackendConnectionStatus) => void): () => void {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  private emit(event: BackendEvent): void {
    this.listeners.forEach((cb) => {
      try {
        cb(event);
      } catch (err) {
        console.error('[BackendClient] Event listener error:', err);
      }
    });
  }

  private setStatus(status: BackendConnectionStatus): void {
    if (this._status === status) return;
    this._status = status;
    this.statusListeners.forEach((cb) => {
      try {
        cb(status);
      } catch (err) {
        console.error('[BackendClient] Status listener error:', err);
      }
    });
  }

  // ── Reconnection Logic ──────────────────────────────────────────

  private scheduleReconnect(): void {
    this.clearReconnect();

    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(RECONNECT_MULTIPLIER, this.reconnectAttempts),
      RECONNECT_MAX_MS,
    );

    console.log(`[BackendClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect(this.sessionId || undefined);
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ── Heartbeat ───────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────

  public dispose(): void {
    this.disconnect();
    this.listeners.clear();
    this.statusListeners.clear();
  }
}
