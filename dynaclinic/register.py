"""Register the DynaClinic node types with DevAll (imported by ``runtime.bootstrap.schema``)."""

from dynaclinic.devall_nodes import (
    CareTeamExecutor,
    CriticExecutor,
    DCContextConfig,
    DCDivergenceGateConfig,
    DCNodeConfig,
    DCPrimaryCareConfig,
    DCSafetyGateConfig,
    DCTriageConfig,
    DCUncertaintyConfig,
    DivergenceGateExecutor,
    MeshExchangeExecutor,
    PrimaryCareExecutor,
    SafetyGateExecutor,
    SynthesizerExecutor,
    TriageExecutor,
    UncertaintyExecutor,
)
from dynaclinic.prompts import _PERSONAS, SPECIALISTS
from runtime.node.registry import NodeCapabilities, register_node_type

_LLM = NodeCapabilities(agent_like=True)
_DETERMINISTIC = NodeCapabilities()
# The generalist sweep calls the LLM but is no 3D character: the seven character slots are taken (Triage is the
# Meta-Controller character) and an eighth agent-like node would push the Synthesizer out of its slot.
_SWEEP = NodeCapabilities()
# The mesh exchange is the Care Team's specialists talking to each other: their characters belong to dc_care_team,
# and a second set (characters are keyed by node and sub-agent) would duplicate them.
_MESH = NodeCapabilities()
# One 3D character per Care Team specialist (Diagnostic Imaging, Pathology/Lab, Pharmacology).
_CARE_TEAM = NodeCapabilities(agent_like=True, sub_agents={role: _PERSONAS[role]["title"] for role in SPECIALISTS})

NODE_TYPES = {
    "dc_triage": (DCTriageConfig, TriageExecutor, _LLM,
                  "DynaClinic Meta-Controller triage; emits ROUTE: LOW|MODERATE|HIGH."),
    "dc_uncertainty": (DCUncertaintyConfig, UncertaintyExecutor, _SWEEP,
                       ("DynaClinic Meta-Controller mode rule: generalist sweep (Uncertainty U) with triage "
                        "complexity C; emits MODE: HIERARCHICAL|COLLABORATIVE|ADVERSARIAL.")),
    "dc_primary_care": (DCPrimaryCareConfig, PrimaryCareExecutor, _LLM,
                        ("DynaClinic Primary Care Agent (Informative model) as the hierarchical hub; may consult "
                         "specialist spokes.")),
    "dc_care_team": (DCContextConfig, CareTeamExecutor, _CARE_TEAM,
                     "DynaClinic Integrated Care Team: specialists write to the shared Blackboard."),
    "dc_divergence_gate": (DCDivergenceGateConfig, DivergenceGateExecutor, _DETERMINISTIC,
                           "DynaClinic conflict-aware switch; emits MODE: COLLABORATIVE|ADVERSARIAL."),
    "dc_mesh_exchange": (DCNodeConfig, MeshExchangeExecutor, _MESH,
                         ("DynaClinic collaborative mesh: each specialist reads every peer's round-1 entry and posts "
                          "a revised step-2 entry.")),
    "dc_critic": (DCNodeConfig, CriticExecutor, _LLM,
                  "DynaClinic Clinical Critic: atomic claims, hybrid rule/judge score."),
    "dc_synthesizer": (DCContextConfig, SynthesizerExecutor, _LLM,
                       "DynaClinic Synthesizer: final answer from the Blackboard."),
    "dc_safety_gate": (DCSafetyGateConfig, SafetyGateExecutor, _DETERMINISTIC,
                       "DynaClinic Layer-4 safety gates (A_SAD, T_SAD, S_NAP stub); emits GATE: PASS|BLOCKED."),
}

for _name, (_config_cls, _executor_cls, _capabilities, _summary) in NODE_TYPES.items():
    register_node_type(_name, config_cls=_config_cls, executor_cls=_executor_cls, capabilities=_capabilities,
                       summary=_summary)
