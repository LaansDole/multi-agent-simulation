"""tau_u calibration CLI: one sweep per case per form, U per case, percentiles over measured cases only."""

import json
import math
from dataclasses import replace
from pathlib import Path

import pytest

from dynaclinic.eval import calibrate
from dynaclinic.eval.cases import load_dataset
from dynaclinic.llm import FakeLLM, set_client_factory
from dynaclinic.prompts import GENERALIST, sweep_system
from dynaclinic.types import Case
from tests.dynaclinic_fixtures import no_network  # noqa: F401

N = 6  # the last case's open-ended sweep is malformed


def _sweep(*hypotheses: str) -> str:
    return json.dumps({"differential": [{"hypothesis": h, "probability": 1} for h in hypotheses]})


@pytest.fixture
def cases(tmp_path: Path) -> list[Case]:
    selected = load_dataset("synthetic")[:N]
    (tmp_path / "synthetic_cases.jsonl").write_text("".join(json.dumps(case.to_dict()) + "\n" for case in selected))
    return selected


@pytest.fixture
def calls(cases: list[Case]) -> list[tuple[int, str, str, str]]:
    """Install a FakeLLM whose sweep spreads case i's mass evenly over i + 1 hypotheses (U = ln(i + 1) / ln k)."""
    recorded: list[tuple[int, str, str, str]] = []
    open_system = sweep_system(replace(cases[0], options=[]), 5)

    def reply(role: str, system: str, user: str) -> str:
        index = next(i for i, case in enumerate(cases) if case.vignette in user)
        recorded.append((index, role, system, user))
        if system != open_system:
            return _sweep(*cases[index].letters()[: index + 1])
        return "no idea" if index == N - 1 else _sweep(*(f"dx{j}" for j in range(index + 1)))

    set_client_factory(lambda models: FakeLLM(reply))
    yield recorded
    set_client_factory(None)


def _run(tmp_path: Path, capsys: pytest.CaptureFixture[str], *args: str) -> tuple[int, dict, str]:
    out = tmp_path / "calib"
    code = calibrate.main(["--dataset", "synthetic", "--model-label", "model-q", "--out", str(out), *args],
                          data_dir=tmp_path)
    data = json.loads((out / "calibration.json").read_text()) if (out / "calibration.json").exists() else {}
    return code, data, capsys.readouterr().out


def test_open_form_strips_options_and_question_and_uses_default_k(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], cases: list[Case], calls: list
) -> None:
    code, data, _ = _run(tmp_path, capsys, "--forms", "open")
    assert code == 0 and {row["form"] for row in data["rows"]} == {"open"}
    assert [row["k"] for row in data["rows"]] == [5] * N
    assert len(calls) == N and all(role == GENERALIST for _, role, _, _ in calls)
    for index, _, _, user in calls:
        assert cases[index].question not in user
        assert not any(option.text in user for option in cases[index].options)


def test_percentiles_exclude_error_rows_and_print_a_table_row(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], cases: list[Case], calls: list
) -> None:
    code, data, out = _run(tmp_path, capsys, "--forms", "mcq,open", "--concurrency", "3")
    assert code == 0
    ids = [case.id for case in cases]
    mcq = sorted((row for row in data["rows"] if row["form"] == "mcq"), key=lambda row: ids.index(row["case_id"]))
    assert [row["k"] for row in mcq] == [len(case.options) for case in cases]
    assert [row["u"] for row in mcq] == pytest.approx(
        [math.log(min(i + 1, len(c.options))) / math.log(len(c.options)) for i, c in enumerate(cases)])
    open_rows = {row["case_id"]: row for row in data["rows"] if row["form"] == "open"}
    failed = open_rows[cases[-1].id]
    assert (failed["u"], failed["error"]) == (None, "reply has no differential list")
    # measured open-ended U: ln(m) / ln(5) for m = 1..5 -> 0, 0.431, 0.683, 0.861, 1.0
    assert data["percentiles"]["open"] == {"n": 5, "errors": 1, "p50": pytest.approx(math.log(3) / math.log(5)),
                                           "p75": pytest.approx(math.log(4) / math.log(5)), "p90": 1.0}
    assert data["model_label"] == "model-q" and data["dataset"] == "synthetic"
    assert "open: measured 5 of 6 (1 error), p50 0.683 p75 0.861 p90 1.000" in out
    p75_mcq = round(data["percentiles"]["mcq"]["p75"], 2)
    assert f'"model-q": TauU({p75_mcq}, 0.86, ' in out


def test_no_measured_case_fails(tmp_path: Path, capsys: pytest.CaptureFixture[str], cases: list[Case]) -> None:
    set_client_factory(lambda models: FakeLLM({GENERALIST: "no idea"}))
    try:
        code, data, out = _run(tmp_path, capsys, "--forms", "mcq")
    finally:
        set_client_factory(None)
    assert code == 1 and data["percentiles"]["mcq"] == {"n": 0, "errors": N, "p50": None, "p75": None, "p90": None}
    assert "TauU(" not in out


def test_rejects_unknown_forms(tmp_path: Path, capsys: pytest.CaptureFixture[str], cases: list[Case]) -> None:
    with pytest.raises(SystemExit):
        _run(tmp_path, capsys, "--forms", "mcq,essay")
