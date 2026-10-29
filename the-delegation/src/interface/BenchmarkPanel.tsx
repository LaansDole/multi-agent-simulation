import { Check, FastForward, Pause, Play, SkipForward, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { getAllAgents } from '../data/agents';
import { BACKEND_URL, BackendClient } from '../integration/api/BackendClient';
import {
  matchesFilter,
  QUESTION_MS,
  replayEvents,
  runningTotals,
  type BenchmarkRun,
  type Filter,
  type ReplayEvent,
  type RunInfo,
} from '../integration/api/benchmarkReplay';
import type { NormalizedGraph } from '../integration/api/types';
import { importWorkflow } from '../integration/api/YamlImporter';
import { DYNACLINIC_WORKFLOW } from '../integration/hooks/useMockScenarios';
import { getActiveAgentSet, useActiveTeam } from '../integration/store/teamStore';
import { useUiStore } from '../integration/store/uiStore';
import { useWorkflowStore } from '../integration/store/workflowStore';
import { useSceneManager } from '../simulation/SceneContext';
import { useEscapeToClose } from './components/useEscapeToClose';

/** Replay clock resolution; speed multiplies the virtual time each tick adds. */
const TICK_MS = 100;

const MODE_STYLE: Record<string, string> = {
  hierarchical: 'bg-green-50 text-green-700',
  collaborative: 'bg-teal-50 text-teal-700',
  adversarial: 'bg-red-50 text-red-700',
};

const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['disagree', 'Arms disagree'],
  ['adversarial', 'Adversarial'],
  ['dynamicWrong', 'Dynamic wrong'],
];

const pct = (value: number | undefined) => (value === undefined ? '-' : `${Math.round(value * 100)}%`);

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`);
  if (!response.ok) throw new Error(`${path} failed (${response.status})`);
  return response.json();
}

interface BenchmarkPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Replays a recorded MedQA benchmark run: a scoreboard of every arm's answer against the key and,
 * with dynaclinic_mvp loaded, the dynamic arm's recorded path acted out in the office through the
 * same EventBridge path as a live run. Reads recorded JSON only: no workflow run, no model call.
 */
const BenchmarkPanel: React.FC<BenchmarkPanelProps> = ({ isOpen, onClose }) => {
  const scene = useSceneManager();
  const team = useActiveTeam();
  const animates = team.sourceYamlFile === DYNACLINIC_WORKFLOW;
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [run, setRun] = useState<BenchmarkRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0); // questions replayed (scored)
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<number | null>(null);
  const [graph, setGraph] = useState<NormalizedGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const clock = useRef({ question: -1, elapsed: 0, fired: 0, events: [] as ReplayEvent[] });

  useEscapeToClose(onClose, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    getJson<{ runs: RunInfo[] }>('/api/benchmarks')
      .then((data) => setRuns(data.runs))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [isOpen]);

  const choose = async (id: string) => {
    setPlaying(false);
    setRun(null);
    setDone(0);
    setSelected(null);
    clock.current.question = -1;
    if (!id) return;
    try {
      setRun(await getJson<BenchmarkRun>(`/api/benchmarks/${encodeURIComponent(id)}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /** dynaclinic_mvp's graph, importing the workflow first (as Browse Workflows does) when another team is active. */
  const loadDynaclinic = async (): Promise<NormalizedGraph | null> => {
    setLoading(true);
    try {
      const stored = useWorkflowStore.getState().workflowGraph;
      if (animates && stored?.filename === DYNACLINIC_WORKFLOW) return stored;
      const fetched = await new BackendClient().fetchWorkflowGraph(DYNACLINIC_WORKFLOW);
      if (!animates) useWorkflowStore.getState().setImportedWorkflow(importWorkflow(fetched), fetched);
      return fetched;
    } catch (e) {
      setError(`Could not load ${DYNACLINIC_WORKFLOW}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const inject = (type: 'node_started' | 'node_completed', data: Record<string, unknown>) =>
    scene?.getSimulation()?.getClient().inject({ type, data: { agent_index: -1, ...data } });

  const fire = (event: ReplayEvent) => {
    if (event.kind === 'start') inject('node_started', { node_id: event.nodeId, node_name: event.nodeId });
    else if (event.kind === 'complete') inject('node_completed', { node_id: event.nodeId, output: event.output });
    else {
      for (const agent of getAllAgents(getActiveAgentSet())) {
        if (agent.nodeId === event.nodeId) useUiStore.getState().setSpeech(agent.index, event.text);
      }
    }
  };

  /** Completes the nodes the current question left started, so no task stays in progress. */
  const flush = () => {
    const c = clock.current;
    const started = new Set(c.events.slice(0, c.fired).filter((e) => e.kind === 'start').map((e) => e.nodeId));
    for (const event of c.events.slice(c.fired)) {
      if (event.kind === 'complete' && started.delete(event.nodeId)) fire(event);
    }
    c.fired = c.events.length;
  };

  // The replay clock: one question at a time, its recorded path fired as node events on schedule.
  useEffect(() => {
    if (!playing || !run) return;
    if (done >= run.questions.length) {
      setPlaying(false);
      return;
    }
    const c = clock.current;
    if (c.question !== done) {
      const animate = animates && graph !== null;
      // What a workflow_started does, minus the phase change that would POST a real run.
      useUiStore.setState({ liveRoles: {}, speech: {} });
      useUiStore.getState().setSceneCue({ kind: 'meeting_end' });
      if (animate) scene?.getSimulation()?.setReplayGraph(graph);
      Object.assign(c, { question: done, elapsed: 0, fired: 0, events: animate ? replayEvents(run.questions[done].arms.dynamic) : [] });
    }
    const id = window.setInterval(() => {
      c.elapsed += TICK_MS * speed;
      while (c.fired < c.events.length && c.events[c.fired].at <= c.elapsed) fire(c.events[c.fired++]);
      if (c.elapsed >= QUESTION_MS) {
        window.clearInterval(id);
        setDone((d) => d + 1);
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [playing, speed, run, done, graph, animates]);

  const play = async () => {
    if (!run) return;
    if (done >= run.questions.length) {
      setDone(0);
      clock.current.question = -1;
    }
    // Graph first: the question that starts on play must already know whether it animates.
    if (!graph || !animates) setGraph(await loadDynaclinic());
    setPlaying(true);
  };

  const step = () => {
    if (!run || done >= run.questions.length) return;
    setPlaying(false);
    flush();
    clock.current.question = -1;
    setDone(done + 1);
  };

  const skipToEnd = () => {
    if (!run) return;
    setPlaying(false);
    flush();
    clock.current.question = -1;
    setDone(run.questions.length);
  };

  if (!isOpen) return null;

  const arms = run?.arms ?? [];
  const totals = run ? runningTotals(run.questions, arms, done) : {};
  const rows = run ? run.questions.map((q, i) => [q, i] as const).filter(([q]) => matchesFilter(q, filter)) : [];
  const detail = run && selected !== null ? run.questions[selected] : null;
  const current = run && done < run.questions.length ? done : null;
  const button = 'flex items-center gap-1 px-3 h-8 rounded-lg text-[11px] font-bold transition-all active:scale-95 disabled:opacity-40';

  return (
    <div className="fixed top-16 right-4 bottom-4 z-[60] w-[600px] max-w-[calc(100vw-2rem)] flex flex-col bg-white rounded-4xl shadow-2xl border border-zinc-100 overflow-hidden">
      <div className="px-6 pt-6 pb-3 shrink-0">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-2xl font-black text-darkDelegation leading-tight">Benchmark Replay</h3>
            <p className="text-xs text-zinc-500 mt-1">Recorded results only: no workflow run, no model calls.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 hover:bg-zinc-100 rounded-full text-zinc-400 transition-colors">
            <X size={20} />
          </button>
        </div>

        <select
          aria-label="Benchmark run"
          value={run?.id ?? ''}
          onChange={(e) => choose(e.target.value)}
          className="w-full px-3 py-2 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm text-zinc-700 outline-none focus:border-zinc-300"
        >
          <option value="">Choose a recorded run...</option>
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label} - {r.arms.map((arm) => `${arm} ${pct(r.accuracy[arm])}`).join(' / ')}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

        {run && (
          <>
            <div className="grid grid-cols-3 gap-2 mt-3" data-testid="running-accuracy">
              {arms.map((arm) => (
                <div key={arm} className="px-3 py-2 bg-zinc-50 rounded-2xl">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{arm}</p>
                  <p className="text-xl font-black text-darkDelegation" data-arm={arm}>
                    {totals[arm].n ? pct(totals[arm].accuracy) : '-'}
                  </p>
                  <p className="text-[10px] text-zinc-400">{totals[arm].correct}/{totals[arm].n} of {run.totals[arm]?.n ?? 0}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              {playing
                ? <button onClick={() => setPlaying(false)} className={`${button} bg-darkDelegation text-white`}><Pause size={12} />Pause</button>
                : <button onClick={play} disabled={loading} className={`${button} bg-darkDelegation text-white`}><Play size={12} />Play</button>}
              <button onClick={step} disabled={current === null} className={`${button} bg-zinc-100 text-zinc-700`}><SkipForward size={12} />Step</button>
              {[1, 4].map((s) => (
                <button key={s} onClick={() => setSpeed(s)} className={`${button} ${speed === s ? 'bg-zinc-700 text-white' : 'bg-zinc-100 text-zinc-700'}`}>{s}x</button>
              ))}
              <button onClick={skipToEnd} disabled={current === null} className={`${button} bg-zinc-100 text-zinc-700`}><FastForward size={12} />Skip to end</button>
              <span className="text-[11px] text-zinc-400 ml-auto">{done}/{run.questions.length} replayed</span>
            </div>

            <div className="flex flex-wrap gap-1 mt-2">
              {FILTERS.map(([value, label]) => (
                <button key={value} onClick={() => setFilter(value)} className={`px-2 h-7 rounded-lg text-[11px] font-bold ${filter === value ? 'bg-zinc-700 text-white' : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100'}`}>{label}</button>
              ))}
            </div>

            {!animates && (
              <p className="text-[11px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2 mt-2">
                The office animation needs {DYNACLINIC_WORKFLOW}; Play loads it.{' '}
                <button onClick={async () => setGraph(await loadDynaclinic())} disabled={loading} className="underline font-bold">Load now</button>
              </p>
            )}
          </>
        )}
      </div>

      {run && (
        <div className="flex-1 min-h-0 overflow-y-auto px-6">
          <table className="w-full text-xs" data-testid="scoreboard">
            <thead className="sticky top-0 bg-white text-[10px] uppercase tracking-wider text-zinc-400">
              <tr>
                <th className="text-left py-2">#</th>
                <th className="text-left">Key</th>
                {(['single', 'dynamic', 'static'] as const).map((arm) => <th key={arm} className="text-left">{arm}</th>)}
                <th className="text-left">Mode</th>
                <th className="text-right">U</th>
                <th className="text-right">Calls</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([q, i]) => {
                const shown = i < done;
                const dynamic = q.arms.dynamic;
                return (
                  <tr
                    key={q.case_id}
                    onClick={() => setSelected(selected === i ? null : i)}
                    className={`border-t border-zinc-50 cursor-pointer hover:bg-zinc-50 ${i === current ? 'bg-amber-50' : ''} ${selected === i ? 'bg-zinc-100' : ''}`}
                  >
                    <td className="py-1.5 text-zinc-400">{i + 1}</td>
                    <td className="font-bold text-darkDelegation">{q.gold}</td>
                    {(['single', 'dynamic', 'static'] as const).map((arm) => {
                      const result = q.arms[arm];
                      return (
                        <td key={arm} className={result && shown ? (result.correct ? 'text-green-700' : 'text-red-600') : 'text-zinc-300'}>
                          {result && (shown
                            ? <span className="inline-flex items-center gap-0.5">{result.answer ?? '-'}{result.correct ? <Check size={12} /> : <X size={12} />}</span>
                            : '...')}
                        </td>
                      );
                    })}
                    <td>
                      {dynamic?.mode && shown && <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${MODE_STYLE[dynamic.mode] ?? 'bg-zinc-50 text-zinc-500'}`}>{dynamic.mode}</span>}
                    </td>
                    <td className="text-right text-zinc-500">{shown && dynamic?.U != null ? dynamic.U.toFixed(2) : ''}</td>
                    <td className="text-right text-zinc-500">{shown && dynamic ? dynamic.calls : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <p className="text-xs text-zinc-400 py-4">No questions match this filter.</p>}
        </div>
      )}

      {detail && (
        <div className="shrink-0 max-h-[40%] overflow-y-auto border-t border-zinc-100 px-6 py-4 text-xs text-zinc-600" data-testid="question-detail">
          <p className="font-bold text-darkDelegation mb-1">{detail.case_id}</p>
          <p className="mb-2 leading-relaxed">{detail.question || 'Question text not in the sample file.'}</p>
          <ul className="mb-2 space-y-0.5">
            {Object.entries(detail.options).map(([letter, text]) => (
              <li key={letter} className={letter === detail.gold ? 'font-bold text-green-700' : ''}>{letter}. {text}</li>
            ))}
          </ul>
          {detail.arms.dynamic && (
            <>
              <p className="mb-1"><span className="font-bold">Dynamic:</span> {detail.arms.dynamic.mode_reason ?? 'no mode reason recorded'}</p>
              <p className="text-zinc-500"><span className="font-bold text-zinc-600">Path:</span> {detail.arms.dynamic.steps.join(' -> ') || '-'}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default BenchmarkPanel;
