"""Spatial event hooks for the 3D frontend integration.

Extends the WebSocketGraphExecutor to emit node_started / node_completed
events that the ThreeJS frontend's EventBridge translates into Kanban task
mutations and 3D character state changes.
"""

import logging
from typing import Any, Dict, List, Optional

from entity.configs import Node
from entity.messages import Message
from server.services.websocket_executor import WebSocketGraphExecutor


logger = logging.getLogger(__name__)


class SpatialWebSocketExecutor(WebSocketGraphExecutor):
    """Graph executor that emits spatial events for the 3D frontend.

    Inherits all WebSocket logging and artifact dispatching from
    WebSocketGraphExecutor, and adds:
      - ``node_started`` events before each node executes
      - ``node_completed`` events after each node finishes
    """

    def _execute_node(self, node: Node) -> None:
        """Override to emit spatial events around node execution."""
        agent_index = self._resolve_agent_index(node)
        node_name = self._resolve_node_name(node)

        # Emit node_started
        self._emit_spatial_event("node_started", {
            "node_id": node.id,
            "node_name": node_name,
            "agent_index": agent_index,
        })

        try:
            # Execute normally (delegates to parent's full pipeline)
            super()._execute_node(node)
        except Exception:
            # Re-raise after emitting error context
            raise
        finally:
            # Emit node_completed with output
            output_text = ""
            if node.output:
                try:
                    output_text = node.output[-1].text_content()
                except Exception:
                    output_text = ""

            self._emit_spatial_event("node_completed", {
                "node_id": node.id,
                "node_name": node_name,
                "agent_index": agent_index,
                "output": output_text[:500],  # Truncate for WS message size
            })

    def _emit_spatial_event(self, event_type: str, data: Dict[str, Any]) -> None:
        """Send a spatial event through the WebSocket manager."""
        try:
            self.websocket_manager.send_message_sync(
                self.session_id,
                {"type": event_type, "data": data},
            )
        except Exception as exc:
            logger.warning(
                "Failed to emit spatial event %s for session %s: %s",
                event_type,
                self.session_id,
                exc,
            )

    @staticmethod
    def _resolve_agent_index(node: Node) -> int:
        """Extract agent index from node config or ID.

        Convention: node IDs follow ``<role>_<index>`` pattern
        (e.g. ``lead_1``, ``researcher_2``), or the YAML node config
        may contain an explicit ``agent_index`` field.
        """
        # Check explicit config first
        if hasattr(node, "config") and isinstance(node.config, dict):
            if "agent_index" in node.config:
                return int(node.config["agent_index"])

        # Fallback: parse trailing digit from node ID
        parts = node.id.rsplit("_", 1)
        if len(parts) == 2 and parts[1].isdigit():
            return int(parts[1])

        return 1  # Default to lead agent

    @staticmethod
    def _resolve_node_name(node: Node) -> str:
        """Get a human-readable name for the node."""
        if hasattr(node, "label") and node.label:
            return node.label
        return node.id.replace("_", " ").title()
