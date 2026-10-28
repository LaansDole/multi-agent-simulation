"""DynaClinic evaluation harness CLI (design spec section 7).

    python -m dynaclinic.eval.harness --arms dynamic,single,static --dataset synthetic --limit N \\
        --out docs/dynaclinic/results/<run-id> [--cache] [--concurrency 4] [--dry-run] [--seed S]

Every (case, arm) pair runs on a worker thread that owns its own client and pipelines: ``run`` resets
the client's call ledger, so a client shared by concurrent cases would mix their call records. Each
graded pair is appended to ``results.jsonl`` as it completes. A rerun with the same ``--out`` skips
pairs already present, errored ones included (an error is a measured outcome, not a retry trigger).
``summary.json`` / ``summary.md`` cover exactly the selected pairs. Rows carry no prompts, and the API
key values (``OPENAI_API_KEY``, ``API_KEY``) are redacted from every file and progress line. Cost is
computed only when ``DYNACLINIC_PRICE_<MODEL>_IN`` and ``_OUT`` (USD per 1M tokens) are set for every
model an arm used; otherwise it is ``n/a``.
"""

import argparse
import json
import math
import os
import random
import re
import statistics
import sys
import threading
import zlib
from collections import Counter
from collections.abc import Callable, Iterable, Mapping, Sequence
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from dynaclinic.eval.cases import DATA_DIR, MEDQA_PATH, load_dataset
from dynaclinic.eval.grade import grade
from dynaclinic.interfaces import InMemorySemanticCache
from dynaclinic.llm import FakeLLM, LLMClient, LLMError, _read_env_file, get_client
from dynaclinic.pipeline import (
    DynaClinicPipeline,
    SingleAgentPipeline,
    StaticTeamPipeline,
)
from dynaclinic.prompts import (
    CONTEXT_POLICIES,
    CRITIC,
    CRITIC_JUDGE,
    DEFAULT_CONTEXT_POLICY,
    GENERALIST,
    IMAGING,
    MESH_ROLES,
    SPECIALISTS,
    TRIAGE,
)
from dynaclinic.types import TIERS, Case, RunResult

RESULTS_DIR = Path(__file__).resolve().parents[2] / "docs" / "dynaclinic" / "results"
ARMS = ("dynamic", "single", "static")
SECRET_KEYS = ("OPENAI_API_KEY", "API_KEY")
_OPTION_LINE = re.compile(r"^([A-Z])\. ", re.MULTILINE)

ClientFactory = Callable[[], LLMClient]
Row = dict[str, Any]


class _LockedCache:
    """Serialises a semantic cache shared by worker threads (``InMemorySemanticCache`` is not thread-safe)."""

    def __init__(self, cache: InMemorySemanticCache) -> None:
        self._cache = cache
        self._lock = threading.Lock()

    def lookup(self, text: str) -> dict[str, Any] | None:
        with self._lock:
            return self._cache.lookup(text)

    def store(self, text: str, result: dict[str, Any], verified: bool) -> bool:
        with self._lock:
            return self._cache.store(text, result, verified)


def dry_run_reply(role: str, system: str, user: str) -> str:
    """A valid reply in ``role``'s format; tier and letters are a deterministic hash of the prompt."""
    letters = list(dict.fromkeys(_OPTION_LINE.findall(user)))

    def pick(choices: Sequence[str]) -> str:
        return choices[zlib.crc32(f"{role}|{user}".encode()) % len(choices)] if choices else ""

    if role == TRIAGE:
        return json.dumps({"tier": pick(TIERS), "rationale": "dry run", "features": {}})
    if role in SPECIALISTS or role in MESH_ROLES.values():
        top = pick(letters)
        dist = {letter: 0.8 if letter == top else 0.05 for letter in letters}
        return json.dumps({"findings": ["dry-run finding"], "distribution": dist,
                           "claims": [f"The {role} data favour option {top}"]})
    if role == GENERALIST:  # one leading hypothesis at 0.98: U stays under both forms' tau_u
        top = pick(letters) or "dry-run diagnosis"
        rest = [letter for letter in letters if letter != top]
        return json.dumps({"differential": [{"hypothesis": top, "probability": 0.98}]
                           + [{"hypothesis": letter, "probability": 0.02 / len(rest)} for letter in rest]})
    if role == CRITIC:
        return json.dumps({"claims": [{"text": "The team's findings are consistent with the case", "agent": IMAGING}]})
    if role == CRITIC_JUDGE:
        logits = {"supported": 1.0, "unsupported": 0.0, "fabrication": 0.0, "contradiction": 0.0}
        return json.dumps({"claims": [{"id": 1, "logits": logits}]})
    return f"Dry-run answer.\nFINAL ANSWER: {pick(letters)}" if letters else "Dry-run answer."


def dry_run_client() -> FakeLLM:
    """Offline client for ``--dry-run``."""
    return FakeLLM(dry_run_reply)


def _env() -> dict[str, str]:
    """Process environment over ``./.env``, the precedence ``client_from_env`` uses."""
    path = Path.cwd() / ".env"
    return {**(_read_env_file(path) if path.is_file() else {}), **os.environ}


def _secrets(env: Mapping[str, str]) -> list[str]:
    # ponytail: values under 8 chars are not real keys and would mangle ordinary text.
    return [env[key] for key in SECRET_KEYS if len(env.get(key) or "") >= 8]


def _redact(text: str, secrets: Iterable[str]) -> str:
    for secret in secrets:
        text = text.replace(secret, "***")
    return text


def _load_rows(path: Path) -> dict[tuple[str, str], Row]:
    rows: dict[tuple[str, str], Row] = {}
    if path.is_file():
        for line in path.read_text().splitlines():
            if line.strip():
                row = json.loads(line)
                rows.setdefault((row["case_id"], row["arm"]), row)
    return rows


def _progress(index: int, total: int, row: Row) -> str:
    verdict = f"ERROR {row['error'][:200]}" if row["error"] else ("ok" if row["correct"] else "wrong")
    return (f"[{index}/{total}] {row['case_id']} {row['arm']}: answer={row['final_answer']} gold={row['gold']} "
            f"{verdict} calls={len(row['calls'])} {row['latency_s']:.1f}s")


def run_eval(
    cases: Sequence[Case],
    arms: Sequence[str],
    out_dir: Path,
    client_factory: ClientFactory,
    *,
    concurrency: int = 4,
    cache: bool = False,
    secrets: Sequence[str] = (),
    context_policy: str = DEFAULT_CONTEXT_POLICY,
) -> list[Row]:
    """Run and grade every (case, arm) pair not yet in ``out_dir/results.jsonl``; return all selected rows."""
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "results.jsonl"
    done = _load_rows(path)
    pairs = [(case, arm) for case in cases for arm in arms]
    todo = [(case, arm) for case, arm in pairs if (case.id, arm) not in done]
    if len(todo) < len(pairs):
        print(f"resuming: {len(pairs) - len(todo)} of {len(pairs)} pairs already in {path}", file=sys.stderr)
    shared_cache = _LockedCache(InMemorySemanticCache()) if cache else None
    local = threading.local()

    def run_pair(case: Case, arm: str) -> RunResult:
        if not hasattr(local, "pipelines"):
            client = client_factory()
            local.pipelines = {
                "dynamic": DynaClinicPipeline(client, cache=shared_cache, context_policy=context_policy),
                "single": SingleAgentPipeline(client),
                "static": StaticTeamPipeline(client, context_policy=context_policy),
            }
        try:
            return local.pipelines[arm].run(case)
        except Exception as err:  # noqa: BLE001 - any failure becomes this pair's error; the run goes on
            return RunResult(case.id, arm, error=f"{type(err).__name__}: {err}")

    with ThreadPoolExecutor(max_workers=concurrency) as pool, path.open("a") as sink:
        futures = {pool.submit(run_pair, case, arm): case for case, arm in todo}
        for index, future in enumerate(as_completed(futures), 1):
            case, result = futures[future], future.result()
            row = {**result.to_dict(), **grade(result, case).to_dict(), "gold": case.answer, "gold_tier": case.gold_tier,
                   "open_ended": case.open_ended, "context_policy": context_policy}
            line = _redact(json.dumps(row), secrets)
            sink.write(line + "\n")
            sink.flush()
            done[(case.id, result.arm)] = row = json.loads(line)
            print(_progress(index, len(todo), row), file=sys.stderr)
    return [done[(case.id, arm)] for case, arm in pairs]


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float] | None:
    """Wilson score interval for ``k`` successes out of ``n`` (95% for the default ``z``); ``None`` if ``n == 0``."""
    if n == 0:
        return None
    p = k / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return max(0.0, center - half), min(1.0, center + half)


def p50(values: Iterable[float]) -> float | None:
    """Median, ``None`` for no values."""
    values = list(values)
    return statistics.median(values) if values else None


def _mean(values: Iterable[float]) -> float | None:
    values = list(values)
    return sum(values) / len(values) if values else None


def _price(env: Mapping[str, str], model: str) -> tuple[float, float] | None:
    key = "DYNACLINIC_PRICE_" + re.sub(r"[^A-Z0-9]", "_", model.upper())
    try:
        return float(env[f"{key}_IN"]), float(env[f"{key}_OUT"])
    except (KeyError, ValueError):
        return None


def _arm_summary(rows: list[Row], env: Mapping[str, str]) -> dict[str, Any]:
    n = len(rows)
    calls = [call for row in rows for call in row["calls"]]
    correct = sum(row["correct"] for row in rows)
    triaged = [row["triage_correct"] for row in rows if row["triage_correct"] is not None]
    switches = [row["switch"] for row in rows if row["switch"] is not None]
    violations = sum(row["safety_violation"] for row in rows)
    blocked = sum(row["blocked"] for row in rows)
    # Meta-Controller scores exist only on dynamic rows that reached triage (rows from before f14 lack the keys)
    scored = [row for row in rows if row.get("complexity") is not None]
    tau_u: dict[str, set[float]] = {}
    for row in scored:  # rows from before f15 lack open_ended; their datasets were multiple choice
        if row.get("tau_u") is not None:
            tau_u.setdefault("open-ended" if row.get("open_ended") else "multiple choice", set()).add(row["tau_u"])
    adversarial = [row for row in scored if row["mode"] == "adversarial"]
    by_uncertainty = sum("mode:adversarial:uncertainty" in row["route"] for row in adversarial)
    models = Counter(call["model"] for call in calls)
    prices = {model: _price(env, model) for model in models}
    cost = None if None in prices.values() else sum(
        call["prompt_tokens"] * prices[call["model"]][0] + call["completion_tokens"] * prices[call["model"]][1]
        for call in calls
    ) / 1e6
    return {
        "n": n,
        "correct": correct,
        "accuracy": correct / n,
        "accuracy_ci": list(wilson(correct, n)),
        "triage": {"n": len(triaged), "correct": sum(triaged), "accuracy": sum(triaged) / len(triaged)} if triaged else None,
        "routes": dict(Counter("cache" if row["cache_hit"] else row["mode"] or "none" for row in rows)),
        "adversarial_switch_rate": sum(switches) / n if switches else None,
        "mean_divergence": _mean(row["divergence"] for row in rows if row["divergence"] is not None),
        "mean_margin_loss": _mean(row["margin_loss"] for row in rows if row["margin_loss"] is not None),
        "mean_complexity": _mean(row["complexity"] for row in scored),
        "mean_uncertainty": _mean(row["uncertainty"] for row in scored if row["uncertainty"] is not None),
        "uncertainty_not_measured": sum(row["uncertainty"] is None for row in scored) if scored else None,
        "tau_u": {form: sorted(values) for form, values in sorted(tau_u.items())} if scored else None,
        "adversarial_entry": ({"uncertainty": by_uncertainty, "conflict": len(adversarial) - by_uncertainty}
                              if scored else None),
        "safety_violations": violations,
        "safety_violation_rate": violations / n,
        "blocked": blocked,
        "blocked_rate": blocked / n,
        "errors": sum(row["error"] is not None for row in rows),
        "mean_calls": len(calls) / n,
        "mean_prompt_tokens": sum(call["prompt_tokens"] for call in calls) / n,
        "mean_completion_tokens": sum(call["completion_tokens"] for call in calls) / n,
        "mean_latency_s": _mean(row["latency_s"] for row in rows),
        "p50_latency_s": p50(row["latency_s"] for row in rows),
        "models": dict(models),
        "fallback_calls": sum(call["fallback_used"] for call in calls),
        "cost_usd": cost,
    }


def summarize(rows: Sequence[Row], arms: Sequence[str], env: Mapping[str, str]) -> dict[str, Any]:
    """Per-arm metrics, accuracy by gold tier, and the case x arm answer matrix (cases in row order)."""
    cases: dict[str, Row] = {}
    for row in rows:
        entry = cases.setdefault(row["case_id"], {"gold": row["gold"], "gold_tier": row["gold_tier"], "arms": {}})
        entry["arms"][row["arm"]] = {"answer": row["final_answer"], "correct": row["correct"],
                                     "error": row["error"] is not None}
    per_tier: dict[str, dict[str, dict[str, int]]] = {}
    for case in cases.values():
        by_arm = per_tier.setdefault(case["gold_tier"] or "none", {arm: {"n": 0, "correct": 0} for arm in arms})
        for arm, cell in case["arms"].items():
            if arm in by_arm:
                by_arm[arm]["n"] += 1
                by_arm[arm]["correct"] += cell["correct"]
    per_tier = {tier: per_tier[tier] for tier in (*TIERS, "none") if tier in per_tier}
    return {
        "arms_summary": {arm: _arm_summary([row for row in rows if row["arm"] == arm], env) for arm in arms},
        "per_tier": per_tier,
        "cases": cases,
    }


def _pct(value: float | None) -> str:
    return "n/a" if value is None else f"{100 * value:.1f}%"


def _num(value: float | None, spec: str = ".3f") -> str:
    return "n/a" if value is None else format(value, spec)


def _tau_u_cell(tau_u: dict[str, list[float]]) -> str:
    return "; ".join(f"{form} {', '.join(f'{value:g}' for value in values)}" for form, values in tau_u.items()) or "n/a"


def _meta_controller_lines(summary: dict[str, Any], arms: Sequence[str]) -> list[str]:
    """The dynamic arm's Complexity C and Uncertainty U; empty when no arm scored a case."""
    scored = [arm for arm in arms if summary["arms_summary"][arm].get("mean_complexity") is not None]
    if not scored:
        return []
    return [
        "## Meta-Controller",
        "",
        ("C: Complexity Score, max(LLM tier level, feature density), tau_c 0.5. U: Uncertainty Score, normalised "
         "entropy of the generalist differential; tau_u per input form (default 0.15 multiple choice, 0.59 "
         "open-ended: 75th percentile on held-out MedQA-50 + synthetic-24 and the same vignettes without options; "
         "calibrated, not validated against outcomes). Mode rule: U > tau_u adversarial, else C <= tau_c "
         "hierarchical, else collaborative; modes are counted under routes. Adversarial entry: by uncertainty "
         "(U > tau_u) or by conflict (the Conflict Detector switched a collaborative team)."),
        "",
        "| arm | mean C | mean U | U not measured | tau_u used | adversarial by U / by conflict |",
        "|---|---|---|---|---|---|",
        *(f"| {arm} | {_num(s['mean_complexity'])} | {_num(s['mean_uncertainty'])} | {s['uncertainty_not_measured']} "
          f"| {_tau_u_cell(s['tau_u'])} | {s['adversarial_entry']['uncertainty']} / "
          f"{s['adversarial_entry']['conflict']} |"
          for arm in scored for s in [summary["arms_summary"][arm]]),
        "",
    ]


def _arm_line(arm: str, s: dict[str, Any]) -> str:
    low, high = s["accuracy_ci"]
    triage = s["triage"]
    cells = [
        arm,
        str(s["n"]),
        f"{_pct(s['accuracy'])} [{_pct(low)}, {_pct(high)}]",
        "n/a" if triage is None else f"{triage['correct']}/{triage['n']} ({_pct(triage['accuracy'])})",
        ", ".join(f"{route} {count}" for route, count in sorted(s["routes"].items())),
        _pct(s["adversarial_switch_rate"]),
        _num(s["mean_divergence"]),
        _num(s["mean_margin_loss"]),
        f"{s['safety_violations']} ({_pct(s['safety_violation_rate'])})",
        f"{s['blocked']} ({_pct(s['blocked_rate'])})",
        str(s["errors"]),
        f"{s['mean_calls']:.2f}",
        f"{s['mean_prompt_tokens']:.0f} + {s['mean_completion_tokens']:.0f}",
        f"{_num(s['mean_latency_s'], '.1f')} / {_num(s['p50_latency_s'], '.1f')}",
        (", ".join(f"{model} x{count}" for model, count in s["models"].items()) or "none") + f" ({s['fallback_calls']})",
        "n/a" if s["cost_usd"] is None else f"{s['cost_usd']:.4f}",
    ]
    return f"| {' | '.join(cells)} |"


def render_markdown(summary: dict[str, Any]) -> str:
    """Human-readable ``summary.md``."""
    arms = summary["arms"]
    mode = ("dry-run (FakeLLM with scripted pseudo-random replies: a plumbing check, not a result)"
            if summary["dry_run"] else f"live, primary model {summary['primary_model']}")
    lines = [
        f"# DynaClinic evaluation: {summary['run_id']}",
        "",
        f"- Generated: {summary['generated_at']}; mode: {mode}",
        (f"- Dataset: {summary['dataset']} ({summary['n_cases']} cases, limit {summary['limit'] or 'all'}, "
         f"seed {'none' if summary['seed'] is None else summary['seed']}); arms: {', '.join(arms)}; "
         f"cache: {'on' if summary['cache'] else 'off'}; concurrency: {summary['concurrency']}; "
         f"context policy: {summary['context_policy']}"),
        "- Accuracy: errors count as wrong; 95% Wilson interval. Triage: Meta-Controller tier vs gold tier (dynamic only).",
        ("- Adv. switch: share of all cases where the divergence rule fired (static records what the rule would have"
         " done; it always runs the critic). Team margin loss: BCE + hinge on the specialists' mean distribution"
         " (calibration; lower is better)."),
        "- Safety viol.: final answer is one of the case's unsafe options, counted even when the gate blocked it.",
        "- Cost: only from DYNACLINIC_PRICE_<MODEL>_IN/_OUT (USD per 1M tokens) for every model used, else n/a.",
        "",
        "## Per arm",
        "",
        ("| arm | n | accuracy [95% CI] | triage acc. | routes | adv. switch | mean div. | team margin loss "
         "| safety viol. | blocked | errors | calls/case | tokens/case (prompt + completion) "
         "| latency mean / p50 (s) | models (fallback calls) | cost (USD) |"),
        "|" + "---|" * 16,
        *(_arm_line(arm, summary["arms_summary"][arm]) for arm in arms),
        "",
        *_meta_controller_lines(summary, arms),
        "## Accuracy by gold tier",
        "",
        f"| tier | {' | '.join(arms)} |",
        "|" + "---|" * (len(arms) + 1),
    ]
    for tier, by_arm in summary["per_tier"].items():
        cells = [f"{c['correct']}/{c['n']} ({_pct(c['correct'] / c['n'] if c['n'] else None)})" for c in by_arm.values()]
        lines.append(f"| {tier} | {' | '.join(cells)} |")
    lines += [
        "",
        "## Per case",
        "",
        "Cell: final answer (`-` = none), then `ok` / `x`; `err` marks a run error.",
        "",
        f"| case | gold tier | gold | {' | '.join(arms)} |",
        "|" + "---|" * (len(arms) + 3),
    ]
    for case_id, case in summary["cases"].items():
        cells = []
        for arm in arms:
            cell = case["arms"].get(arm)
            cells.append("" if cell is None else
                         f"{cell['answer'] or '-'} {'ok' if cell['correct'] else 'x'}{' err' if cell['error'] else ''}")
        lines.append(f"| {case_id} | {case['gold_tier'] or 'none'} | {case['gold']} | {' | '.join(cells)} |")
    return "\n".join(lines) + "\n"


def main(argv: Sequence[str] | None = None, data_dir: Path = DATA_DIR) -> int:
    """CLI entry point; returns the process exit code."""
    parser = argparse.ArgumentParser(prog="python -m dynaclinic.eval.harness",
                                     description="Run and grade DynaClinic arms on a dataset.")
    parser.add_argument("--arms", default=",".join(ARMS), help="comma list of dynamic,single,static")
    parser.add_argument("--dataset", default="synthetic", help="comma list of synthetic,medqa")
    parser.add_argument("--limit", type=int, help="first N cases (after --seed shuffling)")
    parser.add_argument("--out", type=Path, help=f"output dir (default {RESULTS_DIR}/<UTC timestamp>-<model>)")
    parser.add_argument("--cache", action="store_true", help="enable the verified semantic cache (off by default)")
    parser.add_argument("--concurrency", type=int, default=4, help="worker threads, one client each")
    parser.add_argument("--dry-run", action="store_true", help="offline FakeLLM with valid scripted replies")
    parser.add_argument("--seed", type=int, help="shuffle the cases with this seed before --limit")
    parser.add_argument("--context-policy", choices=CONTEXT_POLICIES, default=DEFAULT_CONTEXT_POLICY,
                        help="what the care team and Synthesizer see (dynamic and static arms)")
    args = parser.parse_args(argv)

    arms = [arm.strip() for arm in args.arms.split(",") if arm.strip()]
    if not arms or set(arms) - set(ARMS):
        parser.error(f"--arms must be a comma list of {', '.join(ARMS)}")
    if args.concurrency < 1:
        parser.error("--concurrency must be >= 1")
    medqa = data_dir / MEDQA_PATH.name
    if "medqa" in (name.strip() for name in args.dataset.split(",")) and not medqa.is_file():
        print(f"no MedQA sample at {medqa}; skipping", file=sys.stderr)
    try:
        cases = load_dataset(args.dataset, data_dir)
    except ValueError as err:
        parser.error(str(err))
    if args.seed is not None:
        random.Random(args.seed).shuffle(cases)
    cases = cases[: args.limit]
    if not cases:
        print("no cases selected; nothing to run", file=sys.stderr)
        return 1

    factory: ClientFactory = dry_run_client if args.dry_run else get_client
    try:
        probe = factory()  # fail fast on missing key or model before any row is written
    except LLMError as err:
        print(f"error: {err}", file=sys.stderr)
        return 1
    model = "dryrun" if args.dry_run else getattr(probe, "models", ["unknown"])[0]
    now = datetime.now(UTC)
    out = args.out or RESULTS_DIR / f"{now:%Y%m%dT%H%M%SZ}-{re.sub(r'[^A-Za-z0-9._-]+', '-', model)}"
    env = _env()
    secrets = _secrets(env)
    print(f"{out.name}: {len(cases)} cases x {','.join(arms)} -> {out}", file=sys.stderr)

    rows = run_eval(cases, arms, out, factory, concurrency=args.concurrency, cache=args.cache, secrets=secrets,
                    context_policy=args.context_policy)
    summary = {
        "run_id": out.name,
        "generated_at": now.isoformat(timespec="seconds"),
        "dataset": args.dataset,
        "arms": arms,
        "n_cases": len(cases),
        "limit": args.limit,
        "seed": args.seed,
        "cache": args.cache,
        "concurrency": args.concurrency,
        "context_policy": args.context_policy,
        "dry_run": args.dry_run,
        "primary_model": model,
        **summarize(rows, arms, env),
    }
    (out / "summary.json").write_text(_redact(json.dumps(summary, indent=2), secrets) + "\n")
    (out / "summary.md").write_text(_redact(render_markdown(summary), secrets))
    print(f"wrote {out / 'results.jsonl'}, summary.json, summary.md", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
