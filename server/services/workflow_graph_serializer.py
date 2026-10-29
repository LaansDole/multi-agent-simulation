"""Serialize a validated DesignConfig into a NormalizedGraph for the 3D frontend."""

import re
from typing import Any, Dict, List, Optional

from entity.configs import AgentConfig, DesignConfig, EdgeConfig, Node
from runtime.node.registry import iter_node_registrations
from schema_registry import iter_node_schemas
from utils.strs import titleize

# Max agent characters (the user is not counted). Keep in sync with MAX_AGENTS in
# the-delegation/src/data/agents.ts, which caps how many slots the 3D scene renders.
MAX_AGENT_SLOTS = 13
_ROLE_TRUNCATE = 200
_ROLE_LABEL_MAX = 32
# A description's first clause: up to the first . ; : , ! ? followed by whitespace or the end, keeping
# (one level of) parentheses whole, so "Meta-Controller (complexity), ..." gives "Meta-Controller (complexity)".
_FIRST_CLAUSE = re.compile(r"(?:\([^()]*\)|[^(.;:,!?]|[.;:,!?](?=\S))+")


def role_label(description: Optional[str]) -> str:
    """Short role for a character's 3D nameplate: the description's first clause, cut at a word past 32 chars."""
    match = _FIRST_CLAUSE.match(" ".join((description or "").split()))
    clause = match.group(0).strip() if match else ""
    if len(clause) <= _ROLE_LABEL_MAX:
        return clause
    cut = clause[: _ROLE_LABEL_MAX - 1]
    return (cut.rsplit(" ", 1)[0] if " " in cut else cut).rstrip(" -/&") + "…"


def _agent_config_summary(node: Node) -> Optional[Dict[str, Any]]:
    agent = node.as_config(AgentConfig)
    if agent is None:
        model_summary = getattr(node.config, "model_summary", None)
        if not callable(model_summary):
            return None
        return {"role": "", "has_tooling": False, "has_memory": False, "has_thinking": False, **model_summary()}
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

    registrations = iter_node_registrations()
    for node in graph.nodes:
        registration = registrations.get(node.type)
        capabilities = registration.capabilities if registration else None
        is_agent = node.type == "agent" or bool(capabilities and capabilities.agent_like)
        label = _node_label(node)
        nodes_out.append({
            "id": node.id,
            "type": node.type,
            "label": label,
            "description": node.description,
            "is_agent": is_agent,
            "config_summary": _agent_config_summary(node) if is_agent else None,
        })
        if not is_agent:
            continue
        sub_agents = capabilities.sub_agents if capabilities else {}
        # A sub-agent's label (e.g. "Diagnostic Imaging") is its role; a plain node's role leads its description.
        characters = [
            {"label": sub_label, "sub_agent": key, "role_label": sub_label} for key, sub_label in sub_agents.items()
        ]
        for character in characters or [{"label": label, "role_label": role_label(node.description)}]:
            assigned = len(agent_nodes)
            proposed_slot = assigned + 1 if assigned < MAX_AGENT_SLOTS else None
            agent_nodes.append({"node_id": node.id, **character, "proposed_slot": proposed_slot})

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
