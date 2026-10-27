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
    DivergenceGateExecutor,
    PrimaryCareExecutor,
    SafetyGateExecutor,
    SynthesizerExecutor,
    TriageExecutor,
)
from dynaclinic.prompts import _PERSONAS, SPECIALISTS
from runtime.node.registry import NodeCapabilities, register_node_type

_LLM = NodeCapabilities(agent_like=True)
_DETERMINISTIC = NodeCapabilities()
# One 3D character per Care Team specialist (Diagnostic Imaging, Pathology/Lab, Pharmacology).
_CARE_TEAM = NodeCapabilities(agent_like=True, sub_agents={role: _PERSONAS[role]["title"] for role in SPECIALISTS})

NODE_TYPES = {
    "dc_triage": (DCTriageConfig, TriageExecutor, _LLM,
                  "DynaClinic Meta-Controller triage; emits ROUTE: LOW|MODERATE|HIGH."),
    "dc_primary_care": (DCPrimaryCareConfig, PrimaryCareExecutor, _LLM,
                        "DynaClinic Primary Care Agent (Informative model) for LOW-complexity cases."),
    "dc_care_team": (DCContextConfig, CareTeamExecutor, _CARE_TEAM,
                     "DynaClinic Integrated Care Team: specialists write to the shared Blackboard."),
    "dc_divergence_gate": (DCDivergenceGateConfig, DivergenceGateExecutor, _DETERMINISTIC,
                           "DynaClinic conflict-aware switch; emits MODE: COLLABORATIVE|ADVERSARIAL."),
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
