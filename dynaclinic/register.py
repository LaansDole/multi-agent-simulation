"""Register the DynaClinic node types with DevAll (imported by ``runtime.bootstrap.schema``)."""

from dynaclinic.devall_nodes import (
    CareTeamExecutor,
    CriticExecutor,
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
from runtime.node.registry import register_node_type

NODE_TYPES = {
    "dc_triage": (DCTriageConfig, TriageExecutor, "DynaClinic Meta-Controller triage; emits ROUTE: LOW|MODERATE|HIGH."),
    "dc_primary_care": (DCPrimaryCareConfig, PrimaryCareExecutor,
                        "DynaClinic Primary Care Agent (Informative model) for LOW-complexity cases."),
    "dc_care_team": (DCNodeConfig, CareTeamExecutor,
                     "DynaClinic Integrated Care Team: specialists write to the shared Blackboard."),
    "dc_divergence_gate": (DCDivergenceGateConfig, DivergenceGateExecutor,
                           "DynaClinic conflict-aware switch; emits MODE: COLLABORATIVE|ADVERSARIAL."),
    "dc_critic": (DCNodeConfig, CriticExecutor, "DynaClinic Clinical Critic: atomic claims, hybrid rule/judge score."),
    "dc_synthesizer": (DCNodeConfig, SynthesizerExecutor, "DynaClinic Synthesizer: final answer from the Blackboard."),
    "dc_safety_gate": (DCSafetyGateConfig, SafetyGateExecutor,
                       "DynaClinic Layer-4 safety gates (A_SAD, T_SAD, S_NAP stub); emits GATE: PASS|BLOCKED."),
}

for _name, (_config_cls, _executor_cls, _summary) in NODE_TYPES.items():
    register_node_type(_name, config_cls=_config_cls, executor_cls=_executor_cls, summary=_summary)
