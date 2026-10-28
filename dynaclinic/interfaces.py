"""Protocols and in-memory STUBS for proposal components the MVP does not build for real.

- ``FHIRLiteIngestor`` + ``InMemoryGraphStore``: stub for L1 FHIR ingestion into Neo4j.
- ``HashingEmbeddingMemory``: stub for L5 BioBERT embeddings + Qdrant experience memory.
- ``InMemorySemanticCache``: stub for the L5 verified semantic cache.
- ``GreedyPlanner``: stub for the L2 MCTS control plane (fixed policy, no search).
"""

import re
import zlib
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, ClassVar, Literal, Protocol

import numpy as np

from dynaclinic.types import Case

SECTION_NAMES = ("Demographics", "History", "Meds", "Allergies", "Labs", "Imaging")


# --- L1: FHIR -> patient graph -------------------------------------------------------------------


class GraphStore(Protocol):
    """Patient knowledge graph (Neo4j in the proposal)."""

    def add_node(self, node_id: str, label: str, **props: Any) -> None:
        """Insert or replace a node."""
        ...

    def add_edge(self, source: str, relation: str, target: str) -> None:
        """Insert a directed edge between existing nodes."""
        ...

    def nodes(self, label: str | None = None) -> list[dict[str, Any]]:
        """Return nodes in insertion order, optionally filtered by label."""
        ...

    def neighbors(self, node_id: str, relation: str | None = None) -> list[str]:
        """Return target ids of outgoing edges, optionally filtered by relation."""
        ...


class InMemoryGraphStore:
    """Stub for the Neo4j patient graph: plain dicts, no persistence, no query language."""

    def __init__(self) -> None:
        self._nodes: dict[str, dict[str, Any]] = {}
        self.edges: list[tuple[str, str, str]] = []

    def add_node(self, node_id: str, label: str, **props: Any) -> None:
        """Insert or replace a node."""
        self._nodes[node_id] = {"id": node_id, "label": label, **props}

    def add_edge(self, source: str, relation: str, target: str) -> None:
        """Insert a directed edge (idempotent); both endpoints must exist."""
        for node_id in (source, target):
            if node_id not in self._nodes:
                raise KeyError(f"unknown node {node_id!r}")
        if (source, relation, target) not in self.edges:
            self.edges.append((source, relation, target))

    def nodes(self, label: str | None = None) -> list[dict[str, Any]]:
        """Return nodes in insertion order, optionally filtered by label."""
        return [dict(node) for node in self._nodes.values() if label is None or node["label"] == label]

    def neighbors(self, node_id: str, relation: str | None = None) -> list[str]:
        """Return target ids of outgoing edges, optionally filtered by relation."""
        return [t for s, r, t in self.edges if s == node_id and (relation is None or r == relation)]


def _time_key(lab: dict[str, Any]) -> tuple[bool, datetime]:
    """Sort key: timed labs chronologically (timezone-aware compared in UTC), untimed or unparseable last."""
    try:
        moment = datetime.fromisoformat(str(lab["time"]))
    except (KeyError, TypeError, ValueError):
        return True, datetime.min
    if moment.tzinfo is not None:
        moment = moment.astimezone(UTC).replace(tzinfo=None)
    return False, moment


def _lab_line(lab: dict[str, Any]) -> str:
    unit = f" {lab['unit']}" if lab.get("unit") else ""
    time = f"{lab['time']} " if lab.get("time") else ""
    return f"- {time}{lab['name']}: {lab['value']}{unit}"


def sections_from_structured(structured: dict[str, Any]) -> dict[str, str]:
    """Flatten FHIR-lite fields into prompt sections; labs are time-ordered, absent sections are ``""``."""
    demographics = structured.get("demographics") or ""
    if isinstance(demographics, dict):
        demographics = "; ".join(f"{key}: {value}" for key, value in demographics.items())

    def bullets(key: str) -> str:
        return "\n".join(f"- {item}" for item in structured.get(key) or [])

    return {
        "Demographics": demographics,
        "History": bullets("history"),
        "Meds": bullets("meds"),
        "Allergies": bullets("allergies"),
        "Labs": "\n".join(_lab_line(lab) for lab in sorted(structured.get("labs") or [], key=_time_key)),
        "Imaging": bullets("imaging"),
    }


def _concept_text(concept: dict[str, Any] | None) -> str:
    concept = concept or {}
    coding = (concept.get("coding") or [{}])[0]
    return concept.get("text") or coding.get("display") or coding.get("code") or "unknown"


def structured_from_bundle(bundle: dict[str, Any]) -> dict[str, Any]:
    """Map a FHIR R4 Bundle (Patient, Condition, MedicationStatement, AllergyIntolerance, Observation)
    to the FHIR-lite ``structured`` dict. Other resource types are ignored. Minimal stub, not a FHIR parser.
    """
    structured: dict[str, Any] = {"demographics": {}, "history": [], "meds": [], "allergies": [], "labs": []}
    for entry in bundle.get("entry", []):
        resource = entry.get("resource", {})
        kind = resource.get("resourceType")
        if kind == "Patient":
            structured["demographics"] = {
                key: value
                for key, value in (("sex", resource.get("gender")), ("birthDate", resource.get("birthDate")))
                if value
            }
        elif kind == "Condition":
            structured["history"].append(_concept_text(resource.get("code")))
        elif kind == "MedicationStatement":
            dose = " ".join(d["text"] for d in resource.get("dosage", []) if d.get("text"))
            structured["meds"].append(f"{_concept_text(resource.get('medicationCodeableConcept'))} {dose}".strip())
        elif kind == "AllergyIntolerance":
            reactions = [_concept_text(m) for r in resource.get("reaction", []) for m in r.get("manifestation", [])]
            suffix = f" ({', '.join(reactions)})" if reactions else ""
            structured["allergies"].append(f"{_concept_text(resource.get('code'))}{suffix}")
        elif kind == "Observation":
            quantity = resource.get("valueQuantity") or {}
            structured["labs"].append(
                {
                    "name": _concept_text(resource.get("code")),
                    "value": str(quantity.get("value", resource.get("valueString", ""))),
                    "unit": quantity.get("unit", ""),
                    "time": resource.get("effectiveDateTime"),
                }
            )
    return structured


class FHIRIngestor(Protocol):
    """Turns a case into prompt sections and a patient graph."""

    def ingest(self, case: Case) -> dict[str, str]:
        """Return flattened sections and populate the ingestor's graph."""
        ...


class FHIRLiteIngestor:
    """Stub for L1 FHIR -> Neo4j ingestion: ``Case.structured`` -> sections + in-memory graph.

    Graph: ``Patient`` -HAS_CONDITION/TAKES/ALLERGIC_TO/HAS_OBSERVATION/HAS_IMAGING-> fact nodes;
    timed observations -AT_TIME-> ``TimePoint`` nodes chained chronologically by NEXT.
    """

    def __init__(self, graph: GraphStore | None = None) -> None:
        self.graph = graph or InMemoryGraphStore()

    def ingest(self, case: Case) -> dict[str, str]:
        """Return flattened sections for ``case`` and add its patient subgraph."""
        structured = case.structured
        patient = f"patient:{case.id}"
        self.graph.add_node(patient, "Patient", **(structured.get("demographics") or {}))
        for key, label, relation in (
            ("history", "Condition", "HAS_CONDITION"),
            ("meds", "Medication", "TAKES"),
            ("allergies", "Allergy", "ALLERGIC_TO"),
            ("imaging", "Imaging", "HAS_IMAGING"),
        ):
            for index, text in enumerate(structured.get(key) or []):
                node_id = f"{label.lower()}:{case.id}:{index}"
                self.graph.add_node(node_id, label, text=text)
                self.graph.add_edge(patient, relation, node_id)
        previous_time = None
        for index, lab in enumerate(sorted(structured.get("labs") or [], key=_time_key)):
            node_id = f"observation:{case.id}:{index}"
            self.graph.add_node(node_id, "Observation", **lab)
            self.graph.add_edge(patient, "HAS_OBSERVATION", node_id)
            if not _time_key(lab)[0]:
                time_id = f"time:{case.id}:{lab['time']}"
                self.graph.add_node(time_id, "TimePoint", time=lab["time"])
                self.graph.add_edge(node_id, "AT_TIME", time_id)
                if previous_time and previous_time != time_id:
                    self.graph.add_edge(previous_time, "NEXT", time_id)
                previous_time = time_id
        return sections_from_structured(structured)


# --- L5: experience memory and verified semantic cache -------------------------------------------


class ExperienceMemory(Protocol):
    """Vector memory of past cases (BioBERT + Qdrant in the proposal)."""

    def add(self, text: str, payload: dict[str, Any]) -> None:
        """Store ``payload`` under the embedding of ``text``."""
        ...

    def search(self, text: str, top_k: int = 1) -> list[tuple[float, dict[str, Any]]]:
        """Return up to ``top_k`` ``(cosine, payload)`` pairs, best first."""
        ...


class HashingEmbeddingMemory:
    """Stub for BioBERT/Qdrant: hashing-trick bag-of-words vectors (crc32, deterministic) + exact cosine search."""

    def __init__(self, dim: int = 1024) -> None:
        self.dim = dim
        self._vectors: list[np.ndarray] = []
        self._payloads: list[dict[str, Any]] = []

    def embed(self, text: str) -> np.ndarray:
        """Return the L2-normalised token-count vector of ``text`` (all zeros for empty text)."""
        vector = np.zeros(self.dim)
        for token in re.findall(r"[a-z0-9]+", text.lower()):
            vector[zlib.crc32(token.encode()) % self.dim] += 1.0
        norm = np.linalg.norm(vector)
        return vector / norm if norm else vector

    def similarity(self, a: str, b: str) -> float:
        """Cosine similarity of two texts."""
        return float(self.embed(a) @ self.embed(b))

    def add(self, text: str, payload: dict[str, Any]) -> None:
        """Store ``payload`` under the embedding of ``text``."""
        self._vectors.append(self.embed(text))
        self._payloads.append(payload)

    def search(self, text: str, top_k: int = 1) -> list[tuple[float, dict[str, Any]]]:
        """Return up to ``top_k`` ``(cosine, payload)`` pairs, best first."""
        if not self._vectors:
            return []
        scores = np.vstack(self._vectors) @ self.embed(text)
        best = np.argsort(-scores, kind="stable")[:top_k]
        return [(float(scores[i]), self._payloads[i]) for i in best]


class SemanticCache(Protocol):
    """Cache of verified answers keyed by case similarity."""

    def lookup(self, text: str) -> dict[str, Any] | None:
        """Return a cached result for a near-identical case, else ``None``."""
        ...

    def store(self, text: str, result: dict[str, Any], verified: bool) -> bool:
        """Store ``result`` if ``verified``; return whether it was stored."""
        ...


class InMemorySemanticCache:
    """Stub for the verified semantic cache: only gate-verified results are stored; hit iff cosine >= threshold."""

    def __init__(self, threshold: float = 0.97, memory: HashingEmbeddingMemory | None = None) -> None:
        self.threshold = threshold
        self.memory = memory or HashingEmbeddingMemory()

    def lookup(self, text: str) -> dict[str, Any] | None:
        """Return a copy of the best cached result if its similarity reaches the threshold."""
        hits = self.memory.search(text, top_k=1)
        return dict(hits[0][1]) if hits and hits[0][0] >= self.threshold else None

    def store(self, text: str, result: dict[str, Any], verified: bool) -> bool:
        """Store a copy of ``result`` only when ``verified`` (all safety gates passed)."""
        if verified:
            self.memory.add(text, dict(result))
        return verified


# --- L2: control plane ---------------------------------------------------------------------------

Action = Literal["agent_call", "retrieval", "backtrack", "terminal"]


@dataclass(frozen=True)
class PlannerStep:
    """Next action and the stage it targets."""

    action: Action
    stage: str


class Planner(Protocol):
    """Chooses the next pipeline stage (MCTS in the proposal)."""

    def next_step(self, last_stage: str, **state: Any) -> PlannerStep:
        """Return the step after ``last_stage`` given the observed state."""
        ...


class GreedyPlanner:
    """Stub for the L2 MCTS control plane: the proposal's action space and reward, but a fixed greedy policy.

    Reward ``R = alpha * delta_missing + beta * delta_conf - gamma * stagnation`` is computed and
    logged per step; it does not steer the policy (no tree search, no rollouts, no PUCT).
    """

    ACTIONS: ClassVar[tuple[str, ...]] = ("agent_call", "retrieval", "backtrack", "terminal")

    def __init__(self, alpha: float = 1.0, beta: float = 1.0, gamma: float = 0.5, max_regenerations: int = 1) -> None:
        self.alpha, self.beta, self.gamma = alpha, beta, gamma
        self.max_regenerations = max_regenerations
        self.trace: list[tuple[str, float]] = []

    def reward(self, delta_missing: float, delta_conf: float, stagnation: float) -> float:
        """Proposal reward for one step."""
        return self.alpha * delta_missing + self.beta * delta_conf - self.gamma * stagnation

    def record(self, stage: str, delta_missing: float, delta_conf: float, stagnation: float) -> float:
        """Compute the reward for ``stage`` and append it to ``trace``."""
        value = self.reward(delta_missing, delta_conf, stagnation)
        self.trace.append((stage, value))
        return value

    def next_step(
        self,
        last_stage: str,
        *,
        mode: str | None = None,
        cache_hit: bool = False,
        gate_passed: bool | None = None,
        regenerations: int = 0,
    ) -> PlannerStep:
        """Fixed policy of design spec section 5 with the proposal's mode rule and topologies (cache -> triage ->
        uncertainty -> hierarchical: primary care | collaborative/adversarial: team -> divergence -> collaborative:
        mesh exchange | adversarial: proponent -> critic (Opponent) -> synthesizer -> gate)."""
        match last_stage:
            case "start":
                return PlannerStep("retrieval", "cache_lookup")
            case "cache_lookup":
                return PlannerStep("terminal", "done") if cache_hit else PlannerStep("agent_call", "triage")
            case "triage":
                return PlannerStep("agent_call", "uncertainty")
            case "uncertainty":
                if mode is None:
                    raise ValueError("the uncertainty stage needs a mode")
                return PlannerStep("agent_call", "primary_care" if mode == "hierarchical" else "care_team")
            case "care_team":
                return PlannerStep("agent_call", "divergence")
            case "divergence":
                return PlannerStep("agent_call", "proponent" if mode == "adversarial" else "mesh_exchange")
            case "proponent":
                return PlannerStep("agent_call", "critic")
            case "critic" | "mesh_exchange":
                return PlannerStep("agent_call", "synthesizer")
            case "primary_care" | "synthesizer":
                return PlannerStep("agent_call", "safety_gate")
            case "safety_gate":
                if gate_passed or regenerations >= self.max_regenerations:
                    return PlannerStep("terminal", "done")
                return PlannerStep("backtrack", "synthesizer")
        raise ValueError(f"unknown stage {last_stage!r}")
