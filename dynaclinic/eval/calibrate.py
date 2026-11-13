"""Calibrate the Meta-Controller's tau_u for one model: the row of ``uncertainty.TAU_U_BY_MODEL``.

One generalist sweep per case per input form, the dynamic arm's own sweep (``pipeline.generalist_sweep``): ``mcq``
keeps the options (k = their count); ``open`` removes options and question (k = ``DEFAULT_K``). Writes
``calibration.json`` (per-case U, k, differential and error) and prints p50/p75/p90 of U per form over the measured
cases (failed or malformed sweeps are excluded) and, with both forms, the table row (p75 per form). Outcomes are
never read, so nothing is tuned on them.

    python -m dynaclinic.eval.calibrate --dataset synthetic --forms mcq,open --model-label qwen3.5-4b --out <dir>

The client is the harness's (``get_client``: ``DYNACLINIC_MODEL`` / ``OPENAI_BASE_URL`` from the environment or
``.env``); ``--model-label`` names the row and must be that model id (rows record the model that answered).
"""

import argparse
import json
import sys
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from dynaclinic.eval.cases import DATA_DIR, load_dataset
from dynaclinic.eval.harness import _env, _redact, _secrets
from dynaclinic.interfaces import FHIRLiteIngestor
from dynaclinic.llm import LLMError, get_client
from dynaclinic.pipeline import generalist_sweep
from dynaclinic.types import Case
from dynaclinic.uncertainty import DEFAULT_K

FORMS = ("mcq", "open")
QUANTILES = {"p50": 0.5, "p75": 0.75, "p90": 0.9}


def percentile(values: Sequence[float], q: float) -> float | None:
    """The sorted value at index ``min(n - 1, int(q * n))`` (the rule behind gpt-6-luna's row); None when empty."""
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(q * len(ordered)))] if ordered else None


def as_form(case: Case, form: str) -> Case:
    """``case`` as shown for ``form``: unchanged for mcq; open-ended without options, question or answer."""
    return case if form == "mcq" else replace(case, options=[], question="", answer="", unsafe_options=[])


def sweep(case: Case, form: str) -> dict[str, Any]:
    """One generalist sweep of ``case`` in ``form`` on a fresh client (one per call, as the harness's workers)."""
    client, shown = get_client(), as_form(case, form)
    k, differential, u, error = generalist_sweep(client, shown, FHIRLiteIngestor().ingest(shown), DEFAULT_K)
    return {"case_id": case.id, "form": form, "k": k, "u": u, "error": error, "differential": differential,
            "model": getattr(client, "active_model", None)}


def summarize(rows: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Measured count, error count and the percentiles of U over the measured rows."""
    measured = [row["u"] for row in rows if row["u"] is not None]
    return {"n": len(measured), "errors": len(rows) - len(measured),
            **{name: percentile(measured, q) for name, q in QUANTILES.items()}}


def _fmt(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.3f}"


def table_row(label: str, dataset: str, mcq: dict[str, Any], open_: dict[str, Any], day: str) -> str:
    """The ``TAU_U_BY_MODEL`` entry: p75 per form rounded to 2 places, the rest as provenance."""
    provenance = (f"p75 of U on {dataset} (multiple choice, n = {mcq['n']}, p50 {_fmt(mcq['p50'])}, p90 "
                  f"{_fmt(mcq['p90'])}) and the same vignettes without options or question (k = {DEFAULT_K}, "
                  f"n = {open_['n']}, p50 {_fmt(open_['p50'])}, p90 {_fmt(open_['p90'])}); dynaclinic.eval.calibrate {day}")
    return f'    "{label}": TauU({round(mcq["p75"], 2)}, {round(open_["p75"], 2)}, "{provenance}"),'


def main(argv: Sequence[str] | None = None, data_dir: Path = DATA_DIR) -> int:
    """CLI entry point; returns the process exit code (1 when a form has no measured case)."""
    parser = argparse.ArgumentParser(prog="python -m dynaclinic.eval.calibrate",
                                     description="Calibrate tau_u (p75 of U per input form) for one model.")
    parser.add_argument("--dataset", default="synthetic", help="comma list of synthetic,medqa")
    parser.add_argument("--forms", default=",".join(FORMS), help="comma list of mcq,open")
    parser.add_argument("--model-label", required=True, help="model id of the row (the client's DYNACLINIC_MODEL)")
    parser.add_argument("--concurrency", type=int, default=4, help="worker threads, one client per sweep")
    parser.add_argument("--out", type=Path, required=True, help="output dir for calibration.json")
    args = parser.parse_args(argv)

    forms = [form.strip() for form in args.forms.split(",") if form.strip()]
    if not forms or set(forms) - set(FORMS):
        parser.error(f"--forms must be a comma list of {', '.join(FORMS)}")
    if args.concurrency < 1:
        parser.error("--concurrency must be >= 1")
    try:
        cases = load_dataset(args.dataset, data_dir)
    except ValueError as err:
        parser.error(str(err))
    try:
        probe = get_client()  # fail fast on a missing key or model
    except LLMError as err:
        print(f"error: {err}", file=sys.stderr)
        return 1

    with ThreadPoolExecutor(args.concurrency) as pool:
        rows = list(pool.map(lambda pair: sweep(*pair), [(case, form) for form in forms for case in cases]))
    secrets = _secrets(_env())
    for row in rows:
        row["error"] = row["error"] and _redact(row["error"], secrets)
    stats = {form: summarize([row for row in rows if row["form"] == form]) for form in forms}
    now = datetime.now(UTC)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "calibration.json").write_text(json.dumps(
        {"model_label": args.model_label, "client_model": getattr(probe, "active_model", None),
         "dataset": args.dataset, "generated_at": now.isoformat(timespec="seconds"), "percentiles": stats,
         "rows": rows}, indent=1) + "\n")

    others = sorted({row["model"] for row in rows if row["model"] not in (None, args.model_label)})
    if others:
        print(f"warning: sweeps answered by {', '.join(others)}, not {args.model_label}", file=sys.stderr)
    for form, s in stats.items():
        errors = f" ({s['errors']} error{'' if s['errors'] == 1 else 's'})" if s["errors"] else ""
        print(f"{form}: measured {s['n']} of {s['n'] + s['errors']}{errors}, "
              + " ".join(f"{name} {_fmt(s[name])}" for name in QUANTILES))
    if any(s["n"] == 0 for s in stats.values()):
        print("error: a form has no measured case; no row", file=sys.stderr)
        return 1
    if set(forms) == set(FORMS):
        print("row for dynaclinic/uncertainty.py TAU_U_BY_MODEL:")
        print(table_row(args.model_label, args.dataset, stats["mcq"], stats["open"], f"{now:%Y-%m-%d}"))
    print(f"wrote {args.out / 'calibration.json'}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
