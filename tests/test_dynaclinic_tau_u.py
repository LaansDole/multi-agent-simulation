"""Per-model tau_u: the client's model picks its calibrated row; an unknown model falls back with a warning;
explicit thresholds win over both."""

import pytest

from dynaclinic.llm import FakeLLM
from dynaclinic.pipeline import DynaClinicPipeline
from dynaclinic.types import RunResult
from dynaclinic.uncertainty import FALLBACK_MODEL, TAU_U_BY_MODEL, TauU, tau_u_row
from tests.dynaclinic_fixtures import no_network  # noqa: F401
from tests.test_dynaclinic_metacontroller import FINAL, SPREAD
from tests.test_dynaclinic_pipeline import CASE, OPEN_CASE, WRITE_UP, _client

FALLBACK_WARNING = "generalist: tau_u not calibrated for qwen-test; using gpt-6-luna's"


@pytest.fixture
def calibrated(monkeypatch: pytest.MonkeyPatch) -> TauU:
    row = TauU(0.4, 0.8, "test row")
    monkeypatch.setitem(TAU_U_BY_MODEL, "model-x", row)
    return row


def _run(model: str | None, case: object = CASE, **kwargs: float) -> RunResult:
    client: FakeLLM = _client(generalist=SPREAD, primary_care=WRITE_UP if case is OPEN_CASE else FINAL)
    if model is not None:
        client.active_model = model  # type: ignore[attr-defined]  # OpenAIChatClient's attribute; FakeLLM has none
    return DynaClinicPipeline(client, **kwargs).run(case)


def _tau_warnings(result: RunResult) -> list[str]:
    return [warning for warning in result.warnings if "tau_u" in warning]


def test_gpt_6_luna_row_is_the_fallback_and_the_module_defaults() -> None:
    assert FALLBACK_MODEL == "gpt-6-luna"
    assert TAU_U_BY_MODEL["gpt-6-luna"][:2] == (0.15, 0.59)
    assert "MedQA-50 + synthetic-24" in TAU_U_BY_MODEL["gpt-6-luna"].provenance


def test_tau_u_row_known_unknown_and_no_model(calibrated: TauU) -> None:
    luna = TAU_U_BY_MODEL["gpt-6-luna"]
    assert tau_u_row("model-x") == (calibrated, "calibrated for model-x", None)
    assert tau_u_row("gpt-6-luna") == (luna, "calibrated for gpt-6-luna", None)
    assert tau_u_row("qwen-test") == (luna, "uncalibrated: fallback to gpt-6-luna's",
                                      "tau_u not calibrated for qwen-test; using gpt-6-luna's")
    assert tau_u_row(None) == (luna, "gpt-6-luna's (no model id)", None)


@pytest.mark.parametrize(("case", "tau_u"), [(CASE, 0.4), (OPEN_CASE, 0.8)], ids=["mcq", "open"])
def test_known_model_uses_its_row(calibrated: TauU, case: object, tau_u: float) -> None:
    result = _run("model-x", case)
    assert (result.tau_u, result.tau_u_source, _tau_warnings(result)) == (tau_u, "calibrated for model-x", [])


def test_known_model_row_changes_the_mode(calibrated: TauU) -> None:
    # SPREAD's U (0.18 over three options) is above gpt-6-luna's 0.15 but below model-x's 0.4
    assert (_run("gpt-6-luna").mode, _run("model-x").mode) == ("adversarial", "hierarchical")


@pytest.mark.parametrize(("case", "tau_u"), [(CASE, 0.15), (OPEN_CASE, 0.59)], ids=["mcq", "open"])
def test_unknown_model_falls_back_to_gpt_6_luna_with_a_warning(case: object, tau_u: float) -> None:
    result = _run("qwen-test", case)
    assert (result.tau_u, result.tau_u_source) == (tau_u, "uncalibrated: fallback to gpt-6-luna's")
    assert _tau_warnings(result) == [FALLBACK_WARNING]


def test_client_without_a_model_id_uses_the_default_row_silently() -> None:
    result = _run(None)
    assert (result.tau_u, result.tau_u_source, _tau_warnings(result)) == (0.15, "gpt-6-luna's (no model id)", [])


@pytest.mark.parametrize(
    ("model", "kwargs", "tau_u", "source"),
    [
        ("qwen-test", {"tau_u": 0.3}, 0.3, "configured override"),
        ("qwen-test", {"tau_u_mcq": 0.3}, 0.3, "configured"),
        ("model-x", {"tau_u_mcq": 0.1}, 0.1, "configured"),
        ("model-x", {"tau_u": 0.2, "tau_u_mcq": 0.1}, 0.2, "configured override"),
    ],
    ids=["override-unknown", "form-unknown", "form-known", "override-beats-form"],
)
def test_explicit_thresholds_win_without_a_fallback_warning(
    calibrated: TauU, model: str, kwargs: dict, tau_u: float, source: str
) -> None:
    result = _run(model, **kwargs)
    assert (result.tau_u, result.tau_u_source, _tau_warnings(result)) == (tau_u, source, [])


def test_the_other_forms_threshold_does_not_count_as_configured() -> None:
    result = _run("qwen-test", tau_u_open=0.3)  # a multiple-choice case: tau_u_open does not apply
    assert (result.tau_u, _tau_warnings(result)) == (0.15, [FALLBACK_WARNING])
