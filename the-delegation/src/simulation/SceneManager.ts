import * as THREE from 'three/webgpu';
import { getAgentSet, getAllAgents, AgenticSystem } from '../data/agents';
import { CharacterController } from './CharacterController';
import { Engine } from './core/Engine';
import { Stage } from './core/Stage';
import { DriverManager } from './drivers/DriverManager';
import { CharacterManager } from './entities/CharacterManager';
import { InputManager } from './input/InputManager';
import { NavMeshManager } from './pathfinding/NavMeshManager';
import { AREA_POI_PREFIX, BOARDROOM_POI_ID, PoiManager, spawnPoiId } from './world/PoiManager';
import { WorldManager } from './world/WorldManager';

import { BackendAgentSimulation } from './core/BackendAgentSimulation';
import { nearestToCentroid } from '../integration/api/interactionPlanner';
import { useCoreStore, type Task } from '../integration/store/coreStore';
import { getActiveAgentSet, useTeamStore } from '../integration/store/teamStore';
import { useUiStore } from '../integration/store/uiStore';
import { AgentBehavior, ChatMessage, PoiDef, SceneCue } from '../types';
import {
  AREA_SPOT_RINGS, AREA_SPOT_SPACING, BUBBLE_Y_OFFSET, HANDOFF_TALK_SECONDS, HANDOFF_WALK_TIMEOUT_SECONDS,
  MEETING_IDLE_SECONDS,
} from './constants';

type HandOffCue = Extract<SceneCue, { kind: 'handoff' }>;

/**
 * SceneManager — Visual Integration Layer.
 * 
 * DESIGN PRINCIPLE: Visual Reflex of Logic.
 * 1. Subscribes to the Store to Decouple logic from 3D.
 * 2. Visual actions are fire-and-forget.
 * 3. Smart POI assignment ensures NPCs find desks even with diverse GLB names.
 */
export class SceneManager {
  private engine: Engine;
  private stage: Stage;
  private characterManager: CharacterManager;
  private controller: CharacterController | null = null;
  private navMesh: NavMeshManager;
  private poiManager: PoiManager;
  private worldManager: WorldManager;
  private driverManager: DriverManager | null = null;
  private simulation: BackendAgentSimulation | null = null;

  private lastAgentSetId: string | null = null;
  private selectedIndex: number | null = null;
  private coreHandler: ((npcIndex: number, text: string) => Promise<string | null>) | null = null;

  private unsubs: (() => void)[] = [];
  private isDisposed = false;

  // ── Workflow hand-offs (EventBridge scene cues) ──
  /** Characters taken over by a hand-off, value = hand-off id; the task watcher leaves them alone. */
  private handOffOf = new Map<number, number>();
  private handOffSeq = 0;
  /** Conversation loop members standing together at one area until the loop ends. */
  private meeting: { members: Set<number>; areaId: string; idleTimer: number | null } | null = null;
  /** Pending hand-off / meeting timeouts (window.setTimeout ids), cleared on reset and dispose. */
  private timers = new Set<number>();
  private container: HTMLElement;
  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement) {
    this.container = container;
    this.engine = new Engine(container);
    this.stage = new Stage(this.engine.renderer.domElement);
    this.characterManager = new CharacterManager(this.stage.scene);
    this.navMesh = new NavMeshManager();
    this.poiManager = new PoiManager();
    this.characterManager.setPoiManager(this.poiManager);
    this.worldManager = new WorldManager(this.stage.scene, this.navMesh, this.poiManager);

    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);

    const activeSet = getActiveAgentSet();
    this.simulation = new BackendAgentSimulation(activeSet);
    this.setCoreHandler((idx, text) => this.simulation!.handleUserMessage(idx, text));
    
    this.init();
    this.startWatchingCoreStore();
  }

  private startWatchingCoreStore() {
    this.unsubs.push(
      useCoreStore.subscribe((state, prevState) => {
        // Characters only: tasks of nodes without one (literal, loop, template, ...) carry index -1, and
        // sending -1 to setNpcWorking threw inside the store update, aborting EventBridge.onNodeStarted
        // before it recorded the task, so it stayed in progress forever.
        const agentIndices = Array.from(new Set(state.tasks.map(t => t.assignedAgentId).filter(id => id > 0)));

        agentIndices.forEach(id => {
          const myTasks = state.tasks.filter(t => t.assignedAgentId === id);
          const hasChange = myTasks.some(t => {
            const pt = prevState.tasks.find(old => old.id === t.id);
            return !pt || pt.status !== t.status;
          });
          
          // A hand-off or conversation meeting owns the character; it resumes its tasks when released.
          if (!hasChange || this.handOffOf.has(id) || this.meeting?.members.has(id)) return;

          const onHold = myTasks.find(t => t.status === 'on_hold');
          const inProgress = myTasks.find(t => t.status === 'in_progress');
          const justDone = myTasks.some(t => t.status === 'done' && !prevState.tasks.find(pt => pt.id === t.id && pt.status === 'done'));

          if (onHold) {
            this.moveNpcToBoardroom(id);
          } else if (inProgress) {
            this.setNpcWorking(id, true);
          } else if (justDone) {
            this.setNpcWorking(id, false);
            this.moveNpcToSpawn(id);
          }
        });
        if (state.tasks !== prevState.tasks) this.checkMeetingIdle(state.tasks);
      })
    );
  }

  private async init() {
    await this.engine.init();
    if (this.isDisposed) return;

    await this.worldManager.load();
    await this.characterManager.load();
    if (this.isDisposed) return;

    const state = useUiStore.getState();
    this.characterManager.setInstanceCount(state.instanceCount);
    this.controller = new CharacterController(this.characterManager, this.navMesh, this.poiManager);
    this.driverManager = new DriverManager(this.controller);
    
    const activeSet = getActiveAgentSet();
    const playerIndex = activeSet.user.index;
    this.driverManager.registerPlayer(playerIndex);

    getAllAgents(activeSet).forEach((agent) => {
      if (agent.index !== playerIndex) this.driverManager!.registerNpc(agent.index, agent);
    });

    new InputManager(
      this.engine.renderer.domElement, this.stage.camera,
      () => this.controller!.getCPUPositions(), () => this.controller!.getCount(),
      (idx) => { if (useUiStore.getState().isChatting) useUiStore.getState().setChatting(false); this.selectedIndex = idx !== activeSet.user.index ? idx : null; useUiStore.getState().setSelectedNpc(this.selectedIndex); },
      (x, z) => this.driverManager?.getPlayerDriver().onFloorClick(x, z),
      (idx, pos) => useUiStore.getState().setHoveredNpc(idx, pos),
      () => this.poiManager.getAllPois(),
      (id, label, pos) => useUiStore.getState().setHoveredPoi(id, label, pos),
      (id) => this.driverManager?.getPlayerDriver().onPoiClick(id),
      this.worldManager.getOffice() ?? undefined, (p) => this.navMesh.isPointOnNavMesh(p)
    );

    this.engine.renderer.setAnimationLoop(this.animate.bind(this));

    this.unsubs.push(useUiStore.subscribe((s, prev) => {
      if (s.instanceCount !== prev.instanceCount) this.controller?.setInstanceCount(s.instanceCount);
      if (s.sceneCue && s.sceneCue !== prev.sceneCue) this.onSceneCue(s.sceneCue);
      const team = useTeamStore.getState();
      if (team.selectedAgentSetId !== this.lastAgentSetId) {
        this.lastAgentSetId = team.selectedAgentSetId;
        const set = getAgentSet(team.selectedAgentSetId, team.customSystems);
        this.reinitializeSimulation(set);
        this.worldManager.updateThemeColor(set.color);
        if (this.controller) {
          this.controller.setColors();
          this.controller.warpAllToSpawn(set.user.index, getAllAgents(set).map(a => a.index));
        }
      }
      if ((s.isChatting !== prev.isChatting || s.isThinking !== prev.isThinking || s.isTyping !== prev.isTyping) && this.controller) {
        const set = getActiveAgentSet();
        if (s.isChatting && !prev.isChatting && s.selectedNpcIndex !== null) {
           this._startChatVisuals(s.selectedNpcIndex);
        }
        
        if (s.isChatting && s.selectedNpcIndex !== null) {
          const npc = s.selectedNpcIndex, user = set.user.index;
          if (this.controller.getState(npc) !== 'walk') this.controller.play(npc, s.isThinking ? 'talk' : 'listen');
          this.controller.setSpeaking(npc, s.isThinking);
          if (this.controller.getState(user) !== 'walk') this.controller.play(user, s.isTyping ? 'talk' : 'listen');
          this.controller.setSpeaking(user, s.isTyping);
        } else if (!s.isChatting && prev.isChatting) {
          // Cleanup Chat Visuals
          const npc = prev.selectedNpcIndex;
          const user = set.user.index;
          if (npc !== null) {
            this.driverManager?.getNpcDriver(npc)?.setChatting(false);
            this.controller.setSpeaking(npc, false);
            this.controller.play(npc, 'idle');
            this.controller.poiManager.releaseAll(npc);
          }
          this.controller.setSpeaking(user, false);
          this.controller.play(user, 'idle');
          this.selectedIndex = null;
        }
      }

      // Monitor individual agent status changes for autonomous animations
      if (s.agentStatuses !== prev.agentStatuses && this.controller) {
        Object.keys(s.agentStatuses).forEach(key => {
          const idx = parseInt(key);
          const status = s.agentStatuses[idx];
          const prevStatus = prev.agentStatuses[idx];
          if (status !== prevStatus) {
             if (status === 'talking') this.setNpcTalking(idx, true);
             else if (prevStatus === 'talking') this.setNpcTalking(idx, false);
          }
        });
      }
    }));
  }

  private _startChatVisuals(npcIndex: number): void {
    if (!this.controller) return;
    const pos = this.controller.getCPUPositions(); if (!pos) return;
    const set = getActiveAgentSet();
    const npc = new THREE.Vector3(pos[npcIndex * 4], 0, pos[npcIndex * 4 + 2]);
    const player = new THREE.Vector3(pos[set.user.index * 4], 0, pos[set.user.index * 4 + 2]);
    let dir = new THREE.Vector3().subVectors(player, npc).normalize();
    if (dir.length() < 0.01) dir.set(1, 0, 0);
    const target = npc.clone().addScaledVector(dir, 1.2);

    this.selectedIndex = npcIndex;
    this.driverManager?.getNpcDriver(npcIndex)?.setChatting(true);
    this.controller.cancelMovement(npcIndex);
    this.controller.play(npcIndex, 'listen');
    this.controller.getAgentStateBuffer()?.setWaypoint(npcIndex, dir.x, dir.z);
    this.driverManager?.getPlayerDriver()?.walkTo(target, 'listen', () => {
      const p = this.controller!.getCPUPositions()!;
      const fx = p[npcIndex * 4] - p[set.user.index * 4], fz = p[npcIndex * 4 + 2] - p[set.user.index * 4 + 2];
      this.controller!.getAgentStateBuffer()?.setWaypoint(set.user.index, fx, fz);
      this.controller!.getAgentStateBuffer()?.setWaypoint(npcIndex, -fx, -fz);
      this._triggerNpcGreeting(npcIndex);
    });
  }

  /** Selects npcIndex and opens the chat with it (the player walks over). */
  public startChat(npcIndex: number): void {
    useUiStore.getState().setSelectedNpc(npcIndex);
    useUiStore.getState().setChatting(true);
  }


  public async sendMessage(text: string): Promise<void> {
    const { selectedNpcIndex, isThinking } = useUiStore.getState();
    if (selectedNpcIndex === null || isThinking) return;
    useCoreStore.setState((s) => ({
      agentHistories: { ...s.agentHistories, [selectedNpcIndex!]: [...(s.agentHistories[selectedNpcIndex!] || []), { role: 'user', content: text }] }
    }));
    useUiStore.setState({ isThinking: true, isTyping: false });
    try {
      if (this.coreHandler) await this.coreHandler(selectedNpcIndex!, text);
      useUiStore.setState({ isThinking: false });
    } catch (err) {
      console.error('[SceneManager] sendMessage error:', err);
      useUiStore.setState({ isThinking: false });
    }
  }

  private reinitializeSimulation(activeSet: AgenticSystem) {
    this.clearInteractions();
    if (this.simulation) this.simulation.dispose();
    this.simulation = new BackendAgentSimulation(activeSet);
    this.setCoreHandler((idx, text) => this.simulation!.handleUserMessage(idx, text));
    if (this.driverManager) {
      const playerIndex = activeSet.user.index;
      this.driverManager.dispose();
      this.driverManager.registerPlayer(playerIndex);
      getAllAgents(activeSet).forEach((a) => {
        if (a.index !== playerIndex) this.driverManager!.registerNpc(a.index, a);
      });
    }
  }
  public setCoreHandler(handler: ((npcIndex: number, text: string) => Promise<string | null>) | null): void {
    this.coreHandler = handler;
  }

  public getLeadBrain() {
    // In backend mode, the brain runs on the server.
    // Return null -- callers should check for this.
    return null;
  }

  /**
   * DESK ASSIGNMENT
   * Agent N works at desk sit_work-N. The office has 5 desks but MAX_AGENTS is 13, so agents
   * without a desk take a free chair, and with no chair free stand in the workspace area,
   * instead of sharing (and blocking) another agent's desk.
   */
  public setNpcWorking(index: number, working: boolean): void {
    if (!this.controller) return;
    if (working) {
      const poi = this.poiManager.getPoi(`sit_work-${index}`)
        ?? this.poiManager.getFreePois('sit_idle', index)[0]
        ?? this.poiManager.getPoi(`${AREA_POI_PREFIX}workspace`);
      if (poi) this.controller.walkToPoi(index, poi.id);
    }
  }
  
  public setNpcTalking(index: number, talking: boolean): void {
    if (!this.controller) return;
    if (talking) {
      if (this.controller.getState(index) !== 'walk') this.controller.play(index, 'talk');
      this.controller.setSpeaking(index, true);
    } else {
      this.controller.setSpeaking(index, false);
      const task = useCoreStore.getState().tasks.find(t => t.status === 'on_hold' && t.assignedAgentId === index);
      this.controller.play(index, task ? 'listen' : 'idle');
    }
  }

  public moveNpcToBoardroom(index: number): void {
    if (!this.controller) return;
    const poi = this.poiManager.expectPoi(BOARDROOM_POI_ID);
    if (poi) this.controller.walkToPoi(index, poi.id);
  }

  // ── Workflow hand-offs and conversation meetings (EventBridge scene cues) ──

  private onSceneCue(cue: SceneCue): void {
    if (cue.kind === 'handoff') this.handOff(cue);
    else if (cue.kind === 'meeting') this.startMeeting(cue.members);
    else this.endMeeting();
  }

  /** window.setTimeout tracked in `timers`, so reset and dispose cancel it. */
  private later(seconds: number, fn: () => void): number {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, seconds * 1000);
    this.timers.add(id);
    return id;
  }

  private cancelTimer(id: number): void {
    window.clearTimeout(id);
    this.timers.delete(id);
  }

  /** Area POI (hub, boardroom, canteen, workspace) nearest to the characters' centre: where they meet. */
  private meetingArea(indices: number[]): PoiDef | undefined {
    const points = indices.map((i) => this.controller?.getCPUPosition(i)).filter((p): p is THREE.Vector3 => !!p);
    const areas = this.poiManager.getPoisByPrefix(AREA_POI_PREFIX).map((poi) => ({ x: poi.position.x, z: poi.position.z, poi }));
    return nearestToCentroid(areas, points)?.poi;
  }

  /** True when the character stands (not walks) on one of the spots around `area`. */
  private isAt(index: number, area: PoiDef): boolean {
    const p = this.controller?.getCPUPosition(index);
    return !!p && this.controller!.getState(index) !== 'walk'
      && Math.hypot(p.x - area.position.x, p.z - area.position.z) <= AREA_SPOT_RINGS * AREA_SPOT_SPACING + 0.2;
  }

  /** Walks `indices` to `area` (those already there stay); `onAll` once all arrived, or after HANDOFF_WALK_TIMEOUT_SECONDS. */
  private gather(indices: number[], area: PoiDef, onAll: () => void): void {
    let pending = indices.length;
    const timer = this.later(HANDOFF_WALK_TIMEOUT_SECONDS, () => {
      pending = -1; // late arrivals never reach 0 again
      onAll();
    });
    const arrive = () => {
      if (--pending !== 0) return;
      this.cancelTimer(timer);
      onAll();
    };
    for (const i of indices) {
      if (this.isAt(i, area) || !this.controller?.walkToPoi(i, area.id, arrive)) arrive();
    }
  }

  private face(index: number, target: number): void {
    const from = this.controller?.getCPUPosition(index), to = this.controller?.getCPUPosition(target);
    if (from && to && (to.x !== from.x || to.z !== from.z)) this.characterManager.setFacing(index, to.x - from.x, to.z - from.z);
  }

  /**
   * The speakers hand their node's output to the listeners: everyone walks to the area between them
   * (or stays in their meeting), they face each other, the first speaker talks with a speech bubble
   * for HANDOFF_TALK_SECONDS while the listeners listen, then each resumes its tasks (the listener
   * goes to its desk). Other agents that fed the listener wave from where they are.
   */
  private handOff(cue: HandOffCue): void {
    if (!this.controller) return;
    const speakers = [...new Set(cue.speakers)];
    const listeners = [...new Set(cue.listeners)].filter((i) => !speakers.includes(i));
    if (speakers.length === 0 || listeners.length === 0) return;

    const id = ++this.handOffSeq;
    const members = [...speakers, ...listeners];
    const ui = useUiStore.getState();
    for (const i of members) {
      this.handOffOf.set(i, id);
      this.driverManager?.getNpcDriver(i)?.setChatting(true); // no wandering off mid-conversation
      this.controller.setSpeaking(i, false); // a hand-off this one supersedes may have left it talking
      ui.setSpeech(i, null);
    }
    for (const i of cue.waves) {
      const state = this.controller.getState(i);
      if (members.includes(i) || (state !== 'idle' && state !== 'look_around')) continue; // never stand up a working agent
      this.face(i, listeners[0]);
      this.controller.play(i, 'wave');
    }

    const own = () => members.filter((i) => this.handOffOf.get(i) === id);
    const talk = () => {
      const present = own();
      const talkers = speakers.filter((i) => present.includes(i));
      for (const i of present) {
        this.face(i, talkers.includes(i) ? listeners[0] : speakers[0]);
        this.controller?.play(i, talkers.includes(i) ? 'talk' : 'listen');
      }
      talkers.forEach((i) => this.controller?.setSpeaking(i, true));
      if (talkers.length > 0 && cue.text) ui.setSpeech(talkers[0], cue.text);
      this.later(HANDOFF_TALK_SECONDS, () => {
        for (const i of own()) {
          this.controller?.setSpeaking(i, false);
          useUiStore.getState().setSpeech(i, null);
          this.handOffOf.delete(i);
          this.resume(i);
        }
      });
    };

    const inMeeting = this.meeting !== null && members.every((i) => this.meeting!.members.has(i));
    const area = inMeeting ? this.poiManager.getPoi(this.meeting!.areaId) : this.meetingArea(members);
    if (area) this.gather(members, area, talk);
    else talk();
  }

  /** Back to what the character's tasks ask for, which the task watcher skipped while it was engaged. */
  private resume(index: number): void {
    if (!this.controller || this.handOffOf.has(index)) return;
    if (this.meeting?.members.has(index)) {
      this.joinMeeting(index);
      return;
    }
    this.driverManager?.getNpcDriver(index)?.setChatting(false);
    const tasks = useCoreStore.getState().tasks.filter((t) => t.assignedAgentId === index);
    if (tasks.some((t) => t.status === 'on_hold')) this.moveNpcToBoardroom(index);
    else if (tasks.some((t) => t.status === 'in_progress')) this.setNpcWorking(index, true);
    else this.moveNpcToSpawn(index);
  }

  /** Conversation loop: the members meet at one area and stay there taking turns until the loop ends. */
  private startMeeting(members: number[]): void {
    this.endMeeting();
    const unique = [...new Set(members)];
    const area = unique.length >= 2 ? this.meetingArea(unique) : undefined;
    if (!this.controller || !area) return;
    this.meeting = { members: new Set(unique), areaId: area.id, idleTimer: null };
    unique.forEach((i) => this.resume(i));
  }

  /** Walks a meeting member to the meeting area (unless it is there) to listen until its turn. */
  private joinMeeting(index: number): void {
    const area = this.meeting && this.poiManager.getPoi(this.meeting.areaId);
    if (!this.controller || !area) return;
    this.driverManager?.getNpcDriver(index)?.setChatting(true);
    const listen = () => { if (!this.handOffOf.has(index)) this.controller?.play(index, 'listen'); };
    if (this.isAt(index, area) || !this.controller.walkToPoi(index, area.id, listen)) listen();
  }

  /** The loop ended: members not mid-hand-off go back to their tasks (desk) or spawn. */
  private endMeeting(): void {
    const meeting = this.meeting;
    if (!meeting) return;
    this.meeting = null;
    if (meeting.idleTimer !== null) this.cancelTimer(meeting.idleTimer);
    meeting.members.forEach((i) => this.resume(i));
  }

  /** A meeting in which no member works breaks up after MEETING_IDLE_SECONDS (the loop is over). */
  private checkMeetingIdle(tasks: Task[]): void {
    const meeting = this.meeting;
    if (!meeting) return;
    const working = tasks.some((t) => t.status === 'in_progress' && meeting.members.has(t.assignedAgentId));
    if (working && meeting.idleTimer !== null) {
      this.cancelTimer(meeting.idleTimer);
      meeting.idleTimer = null;
    } else if (!working && meeting.idleTimer === null) {
      meeting.idleTimer = this.later(MEETING_IDLE_SECONDS, () => {
        if (this.meeting === meeting) this.endMeeting();
      });
    }
  }

  /** Drops pending hand-offs, the meeting and their timers (new run, team switch, teardown). */
  private clearInteractions(): void {
    this.timers.forEach((id) => window.clearTimeout(id));
    this.timers.clear();
    for (const i of new Set([...this.handOffOf.keys(), ...(this.meeting?.members ?? [])])) {
      this.driverManager?.getNpcDriver(i)?.setChatting(false);
      this.controller?.setSpeaking(i, false);
    }
    this.handOffOf.clear();
    this.meeting = null;
    useUiStore.setState({ speech: {} });
  }

  public moveNpcToSpawn(index: number, onArrival?: () => void): void {
    if (!this.controller) return;
    const poi = this.poiManager.expectPoi(spawnPoiId(index));
    if (poi) this.controller.moveTo(index, poi.position, 'idle', onArrival, undefined, poi.quaternion);
    else if (onArrival) onArrival();
  }

  private async _triggerNpcGreeting(idx: number): Promise<void> {
    const set = getActiveAgentSet();
    const agent = getAllAgents(set).find(a => a.index === idx);
    if (!agent) return;
    useUiStore.setState({ isThinking: true });
    const msg: ChatMessage = { role: 'assistant', text: `Hello. I am ${agent.name}. How can I assist you?`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    useUiStore.setState({ chatMessages: [msg], isThinking: false });
  }

  private onResize() { 
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.stage.onResize(w, h);
    if (!useCoreStore.getState().isResizing) this.engine.onResize(w, h);
  }

  private animate() {
    this.engine.timer.update(); const delta = this.engine.timer.getDelta();
    this.stage.update(); this.controller?.update(delta, this.engine.renderer);
    this.controller?.syncFromGPU(this.engine.renderer).then((pos) => {
      if (!pos || !this.controller) return;
      this.controller.updatePaths(pos); this.driverManager?.update(pos, delta);
      this.updateTransparency(pos, delta);
    });
    const player = getActiveAgentSet().user.index;
    this.stage.setFollowTarget(this.controller?.getCPUPosition(this.selectedIndex ?? player) ?? null);
    const { selectedNpcIndex, setSelectedPosition, selectedPosition } = useUiStore.getState();
    const npcScreenPositions: Record<number, { x: number; y: number }> = {};
    const rect = this.container.getBoundingClientRect();
    if (this.controller) {
      for (let i = 0; i < this.controller.getCount(); i++) {
        const p = this.controller.getCPUPosition(i);
        if (p) {
          const s = p.clone(); s.y += BUBBLE_Y_OFFSET; s.project(this.stage.camera);
          npcScreenPositions[i] = { x: (s.x * 0.5 + 0.5) * rect.width, y: (s.y * -0.5 + 0.5) * rect.height };
        }
      }
      useUiStore.setState({ npcScreenPositions });
    }
    if (selectedNpcIndex !== null && npcScreenPositions[selectedNpcIndex]) {
      const p = npcScreenPositions[selectedNpcIndex];
      if (Math.abs(p.x - (selectedPosition?.x ?? 0)) > 0.5 || Math.abs(p.y - (selectedPosition?.y ?? 0)) > 0.5) setSelectedPosition(p);
    } else if (selectedPosition !== null) setSelectedPosition(null);
    this.stage.setChatMode(useUiStore.getState().isChatting, this.controller?.getAgentState(player) === AgentBehavior.GOTO);
    this.engine.render(this.stage.scene, this.stage.camera);
  }

  private updateTransparency(pos: Float32Array, delta: number) {
    if (!this.controller) return;
    const count = this.controller.getCount(), buffer = this.controller.getAgentStateBuffer();
    if (!buffer) return;
    for (let i = 0; i < count; i++) {
      let overlap = false;
      for (let j = 0; j < count; j++) {
        if (i === j) continue;
        if ((pos[i * 4] - pos[j * 4]) ** 2 + (pos[i * 4 + 2] - pos[j * 4 + 2]) ** 2 < 0.36) { overlap = true; break; }
      }
      const cur = buffer.getAlpha(i), tar = overlap ? 0.4 : 1.0;
      if (Math.abs(cur - tar) > 0.01) buffer.setAlpha(i, THREE.MathUtils.lerp(cur, tar, Math.min(delta * 2.0, 1.0)));
    }
  }

  public resetScene() {
    this.clearInteractions();
    if (!this.controller) return;
    useUiStore.getState().setChatting(false);
    const set = getActiveAgentSet();
    getAllAgents(set).forEach((a) => this.controller?.setSpeaking(a.index, false));
    this.controller.warpAllToSpawn(set.user.index, getAllAgents(set).map(a => a.index));
    this.stage.setFollowTarget(null);
    this.stage.setChatMode(false, false);
  }

  public dispose() { this.isDisposed = true; this.clearInteractions(); this.resizeObserver.disconnect(); this.unsubs.forEach(u => u()); this.driverManager?.dispose(); this.engine.dispose(); }
}
