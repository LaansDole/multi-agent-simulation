"""Serialize a validated DesignConfig into a NormalizedGraph for the 3D frontend."""

from typing import Any, Dict, List, Optional

from entity.configs import AgentConfig, DesignConfig, EdgeConfig, Node
from schema_registry import iter_node_schemas
from utils.strs import titleize

MAX_AGENT_SLOTS = 5
_ROLE_TRUNCATE = 200


def _agent_config_summary(node: Node) -> Optional[Dict[str, Any]]:
    agent = node.as_config(AgentConfig)
    if agent is None:
        return None
    return {
        "provider": agent.provider,
        "model": agent.name,
        "role": (agent.role or "").strip()[:_ROLE_TRUNCATE],
        "has_tooling": bool(agent.tooling),
        "has_memory": bool(agent.memories),
        "has_thinking": agent.thinking is not None,
    }


def _node_label(node: Node) -> str:
    label = getattr(node, "label", None) or getattr(node, "name", None)
    if label:
        return str(label)
    return titleize(node.id)


def _serialize_edge(edge: EdgeConfig) -> Dict[str, Any]:
    condition_type: Optional[str] = None
    if edge.condition is not None:
        condition_type = getattr(edge.condition, "type", None)
    processor_type: Optional[str] = None
    if edge.process is not None:
        processor_type = getattr(edge.process, "type", None)
    return {
        "from": edge.source,
        "to": edge.target,
        "trigger": edge.trigger,
        "carry_data": edge.carry_data,
        "condition_type": condition_type,
        "processor_type": processor_type,
        "is_dynamic": edge.dynamic is not None,
    }


def serialize_design(design: DesignConfig, *, filename: str) -> Dict[str, Any]:
    """Serialize a validated DesignConfig into a NormalizedGraph dict."""
    graph = design.graph
    node_types: Dict[str, str] = {
        name: (spec.summary or "") for name, spec in iter_node_schemas().items()
    }

    nodes_out: List[Dict[str, Any]] = []
    agent_nodes: List[Dict[str, Any]] = []

    for node in graph.nodes:
        is_agent = node.type == "agent"
        label = _node_label(node)
        nodes_out.append({
            "id": node.id,
            "type": node.type,
            "label": label,
            "description": node.description,
            "is_agent": is_agent,
            "config_summary": _agent_config_summary(node) if is_agent else None,
        })
        if is_agent:
            assigned = len(agent_nodes)
            proposed_slot = assigned + 1 if assigned < MAX_AGENT_SLOTS else None
            agent_nodes.append({"node_id": node.id, "label": label, "proposed_slot": proposed_slot})

    return {
        "filename": filename,
        "version": design.version,
        "graph_id": graph.id,
        "description": graph.description,
        "is_majority_voting": graph.is_majority_voting,
        "vars": dict(design.vars or {}),
        "start": list(graph.start_nodes),
        "end": list(graph.end_nodes) if graph.end_nodes is not None else None,
        "node_types": node_types,
        "nodes": nodes_out,
        "edges": [_serialize_edge(edge) for edge in graph.edges],
        "agent_nodes": agent_nodes,
    }
