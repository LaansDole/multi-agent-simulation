import * as THREE from 'three/webgpu';
import { getActiveAgentSet } from '../integration/store/teamStore';
import { AgentBehavior, AnimationName, CharacterStateKey, ExpressionKey, ICharacterDriver } from '../types';

import { AREA_SPOT_RINGS, AREA_SPOT_SPACING } from './constants';
import { AgentStateBuffer } from './behavior/AgentStateBuffer';
import { CharacterStateMachine } from './behavior/CharacterStateMachine';
import { CharacterManager } from './entities/CharacterManager';
import { NavMeshManager } from './pathfinding/NavMeshManager';
import { PathAgent } from './pathfinding/PathAgent';
import { AREA_POI_PREFIX, PoiManager, SPAWN_POI_PREFIX } from './world/PoiManager';

/**
 * CharacterController — unified API for controlling any character (player or NPC).
 *
 * Composes:
 *  - CharacterManager     → GPU rendering, animation baking, expression buffers
 *  - CharacterStateMachine → declarative state→animation+expression mapping
 *  - PathAgent[]          → per-agent CPU path following
 *  - NavMeshManager       → path queries
 *  - PoiManager           → POI lookup and occupancy
 *
 * Implements ICharacterDriver so it can be passed to the state machine and
 * behavior drivers without circular dependencies.
 *
 * All behavior code (PlayerInputDriver, NpcAgentDriver) goes through this class.
 */
export class CharacterController implements ICharacterDriver {
  private stateMachine: CharacterStateMachine;
  private pathAgents: PathAgent[] = [];
  /** Per-agent callback fired when the agent reaches its path destination. */
  private arrivalCallbacks: ((index: number) => void)[] = [];
  /** Standing spot each agent holds at a shared area POI; released when the agent moves on. */
  private areaSpots = new Map<number, THREE.Vector3>();
  /** "agent->target" moves already reported as impossible, so per-frame retries warn once. */
  private warnedNoPath = new Set<string>();

  constructor(
    public readonly characterManager: CharacterManager,
    private readonly navMesh: NavMeshManager,
    public readonly poiManager: PoiManager,
  ) {
    const count = characterManager.getCount();
    this.stateMachine = new CharacterStateMachine(count);

    const stateBuffer = characterManager.getAgentStateBuffer()!;
    for (let i = 0; i < count; i++) {
      this.pathAgents.push(new PathAgent(i, stateBuffer));
    }
  }

  // ── High-level character API ─────────────────────────────────

  /**
   * Transition a character to the given state.
   * The state machine applies the correct animation + expression automatically.
   * Non-interruptible states (e.g. 'sit_down') will queue the new state until ready.
   */
  public play(index: number, state: CharacterStateKey): void {
    // If transitioning away from a seated state, release any POIs
    const currentState = this.stateMachine.getState(index);
    const isCurrentlySeated = currentState === 'sit_idle' || currentState === 'sit_work' || currentState === 'sit_down';
    const isNewStateSeated = state === 'sit_idle' || state === 'sit_work' || state === 'sit_down';

    if (isCurrentlySeated && !isNewStateSeated) {
      this.poiManager.releaseAll(index);
    }

    this.stateMachine.transition(index, state, this);
  }

  /**
   * Walk a character to a world-space position using the navmesh.
   * Automatically transitions to 'walk' and then to `arrivalState` on arrival.
   *
   * @param arrivalState State to enter upon reaching the destination (default: 'idle')
   * @param onArrival    Optional callback fired when the destination is reached
   * @param fromPosition Optional start position (defaults to current CPU position)
   * @param targetOrientation Optional orientation to snap to upon arrival
   */
  public moveTo(
    index: number,
    target: THREE.Vector3,
    arrivalState: CharacterStateKey = 'idle',
    onArrival?: (index: number) => void,
    fromPosition?: THREE.Vector3,
    targetOrientation?: THREE.Quaternion,
  ): boolean {
    let from: THREE.Vector3;

    if (fromPosition) {
      from = fromPosition.clone();
    } else {
      const positions = this.characterManager.getCPUPositions();
      if (!positions) return false;

      from = new THREE.Vector3(
        positions[index * 4],
        positions[index * 4 + 1],
        positions[index * 4 + 2],
      );
    }

    const path = this.navMesh.findPath(from, target);

    if (path.length === 0) {
      // Emergency Teleport: If the target is valid on the navmesh but we can't find a path
      // (likely because the character is stuck outside the navmesh bounds), teleport directly.
      if (index === getActiveAgentSet().user.index) {
        this._releaseReservations(index);
        this.characterManager.setPosition(index, target);
        if (targetOrientation) {
          this.characterManager.setOrientation(index, targetOrientation);
        }
        this.play(index, arrivalState);
        onArrival?.(index);
        return true;
      }

      const key = `${index}->${target.x.toFixed(2)},${target.z.toFixed(2)}`;
      if (!this.warnedNoPath.has(key)) {
        this.warnedNoPath.add(key);
        console.warn(`[CharacterController] agent ${index}: no navmesh path from (${from.x.toFixed(2)}, ${from.z.toFixed(2)}) to (${target.x.toFixed(2)}, ${target.z.toFixed(2)})`);
      }
      return false;
    }

    // Ensure the agent ends up at the exact target position,
    // not at the nearest navmesh polygon boundary.
    path[path.length - 1] = target.clone();

    this._releaseReservations(index);
    this.pathAgents[index].setPath(path, from);
    this.arrivalCallbacks[index] = (i) => {
      if (targetOrientation) {
        this.characterManager.setOrientation(i, targetOrientation);
      }
      this.play(i, arrivalState);
      onArrival?.(i);
    };

    this.setPhysicsMode(index, AgentBehavior.GOTO);
    this.play(index, 'walk');

    return true;
  }

  /** The agent is leaving: free its seat/POI reservations and its area standing spot. */
  private _releaseReservations(index: number): void {
    this.poiManager.releaseAll(index);
    this.areaSpots.delete(index);
  }

  /**
   * Walk a character to a POI by ID.
   * Seat-like POIs are exclusive: occupies the POI immediately and releases existing ones first.
   * Area POIs (prefix AREA_POI_PREFIX, e.g. the boardroom) are shared: the agent walks to its own
   * free standing spot around the area centre and faces the centre.
   */
  public walkToPoi(
    index: number,
    poiId: string,
    onArrival?: (index: number) => void,
    fromPosition?: THREE.Vector3,
  ): boolean {
    const poi = this.poiManager.getPoi(poiId);
    if (!poi) return false;
    const isArea = poi.id.startsWith(AREA_POI_PREFIX);
    if (!isArea && poi.occupiedBy !== null && poi.occupiedBy !== index) return false;

    const target = isArea ? this._freeAreaSpot(index, poi.position) : poi.position;
    if (!target) return false;
    const orientation = isArea
      ? new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        Math.atan2(poi.position.x - target.x, poi.position.z - target.z),
      )
      : poi.quaternion;

    const targetState = poi.arrivalState;
    const isSitVariant = targetState === 'sit_idle' || targetState === 'sit_work';

    if (isSitVariant) {
      // Pre-arm the sit sequence: sitTarget is stored NOW, before the async arrival fires.
      // When sit_down timer expires the state machine reads sitTarget directly — this is
      // immune to the async gap between syncFromGPU.then() and stateMachine.update().
      this.stateMachine.prepareSitDown(index, targetState as 'sit_idle' | 'sit_work');
    }

    // Check path before releasing old POIs
    const moved = this.moveTo(index, target, 'idle', (i) => {
      // 1. Teleport to the exact target (removes any sub-unit navmesh offset)
      this.characterManager.setPosition(i, target);

      // 2. Snap orientation: POI facing direction, or towards the centre of an area
      this.characterManager.setOrientation(i, orientation);

      // 3. Switch GPU to SEATED so the character won't be moved by any stray GOTO commands
      if (isSitVariant) {
        this.setPhysicsMode(i, AgentBehavior.SEATED);
        // play('sit_down') — sitTarget already set above, will auto-transition to finalState
        this.play(i, 'sit_down');
      } else {
        this.play(i, targetState);
      }

      onArrival?.(i);
    }, fromPosition);

    if (!moved) return false;

    if (isArea) this.areaSpots.set(index, target);
    else this.poiManager.occupy(poiId, index);

    return true;
  }

  /**
   * First walkable spot on rings around `centre` (radius and arc spacing AREA_SPOT_SPACING) that no
   * other agent holds, so agents sharing an area never stand on top of each other.
   */
  private _freeAreaSpot(index: number, centre: THREE.Vector3): THREE.Vector3 | null {
    for (let ring = 1; ring <= AREA_SPOT_RINGS; ring++) {
      const radius = ring * AREA_SPOT_SPACING;
      const slots = Math.floor((2 * Math.PI * radius) / AREA_SPOT_SPACING);
      for (let slot = 0; slot < slots; slot++) {
        const angle = (slot / slots) * 2 * Math.PI;
        const spot = new THREE.Vector3(centre.x + Math.cos(angle) * radius, centre.y, centre.z + Math.sin(angle) * radius);
        const taken = [...this.areaSpots].some(([i, held]) => i !== index && held.distanceTo(spot) < AREA_SPOT_SPACING / 2);
        if (!taken && this.navMesh.isWalkable(spot)) return spot;
      }
    }
    console.warn(`[CharacterController] agent ${index}: no free standing spot around (${centre.x.toFixed(2)}, ${centre.z.toFixed(2)})`);
    return null;
  }

  /** Speaking mouth animation overlay — independent of character state. */
  public setSpeaking(index: number, isSpeaking: boolean): void {
    this.characterManager.setSpeaking(index, isSpeaking);
  }

  public getState(index: number): CharacterStateKey {
    return this.stateMachine.getState(index);
  }

  // ── Per-frame update ─────────────────────────────────────────

  /**
   * Main update loop. Call once per frame.
   *  1. Updates GPU expression buffers (blink, mouth animation).
   *  2. Runs GPU compute shader (physics/movement).
   *  3. Ticks the state machine timers (non-looping state auto-transitions).
   *  4. Advances per-agent path following.
   */
  public update(delta: number, renderer: any): void {
    this.characterManager.update(delta, renderer);
    this.stateMachine.update(delta, this);
  }

  /**
   * GPU→CPU position readback (async, 1-frame lag).
   * Returns the positions buffer so drivers can use it for logic.
   */
  public async syncFromGPU(renderer: any): Promise<Float32Array | null> {
    return this.characterManager.syncFromGPU(renderer);
  }

  /**
   * Advance path agents. Call after syncFromGPU resolves so positions are fresh.
   * Fires arrival callbacks for agents that reach their destination.
   */
  public updatePaths(positions: Float32Array): void {
    for (let i = 0; i < this.pathAgents.length; i++) {
      if (!this.pathAgents[i].isMoving) continue;

      const currentPos = new THREE.Vector3(
        positions[i * 4],
        positions[i * 4 + 1],
        positions[i * 4 + 2],
      );

      const arrived = this.pathAgents[i].update(currentPos);
      if (arrived) {
        // Keep the last movement direction when transitioning to IDLE
        const lastDir = this.pathAgents[i].getLastDirection();
        this.characterManager.setFacing(i, lastDir.x, lastDir.z);

        this.setPhysicsMode(i, AgentBehavior.IDLE);
        this.arrivalCallbacks[i]?.(i);
      }
    }
  }

  /** Cancel movement for an agent and return to idle. */
  public cancelMovement(index: number): void {
    this.pathAgents[index].cancel();
    this.setPhysicsMode(index, AgentBehavior.IDLE);
  }

  /**
   * Instantly teleport every agent to their original spawn POI — no pathfinding,
   * no arrival callbacks. Spawn POIs are reassigned in sorted ID order, mirroring
   * the order used during initialisation.
   *
   * @param playerIndex  Index of the player character (teleported to world origin).
   * @param npcIndices   Indices of all NPC agents, in the desired spawn-assignment order.
   */
  public warpAllToSpawn(playerIndex: number, npcIndices: number[]): void {
    // 1. Release all POIs and area spots so spawn slots are free
    this.poiManager.releaseAll(playerIndex);
    npcIndices.forEach(i => this.poiManager.releaseAll(i));
    this.areaSpots.clear();

    // 2. Cancel in-flight paths and snap physics to IDLE
    this.cancelMovement(playerIndex);
    npcIndices.forEach(i => this.cancelMovement(i));

    // 3. Teleport player to world origin
    this.characterManager.setPosition(playerIndex, new THREE.Vector3(0, 0, 0));
    this.play(playerIndex, 'idle');

    // 4. Reassign spawn POIs in sorted order (same as initInstances)
    const spawnPois = this.poiManager.getPoisByPrefix(SPAWN_POI_PREFIX);
    npcIndices.forEach((agentIndex, order) => {
      const poi = spawnPois[order % spawnPois.length];
      if (poi) {
        this.characterManager.setPosition(agentIndex, poi.position);
        this.characterManager.setOrientation(agentIndex, poi.quaternion);
        this.poiManager.occupy(poi.id, agentIndex);
      }
      this.play(agentIndex, 'idle');
    });
  }

  // ── Forwarded accessors ──────────────────────────────────────

  public getCPUPositions(): Float32Array | null {
    return this.characterManager.getCPUPositions();
  }

  public getCPUPosition(index: number): THREE.Vector3 | null {
    return this.characterManager.getCPUPosition(index);
  }

  public getCount(): number {
    return this.characterManager.getCount();
  }

  public getAgentStateBuffer(): AgentStateBuffer | null {
    return this.characterManager.getAgentStateBuffer();
  }

  public setColors(): void {
    this.characterManager.setColors();
    // Re-sync components after recreation
    const newCount = this.characterManager.getCount();
    const stateBuffer = this.characterManager.getAgentStateBuffer()!;
    this.pathAgents = [];
    for (let i = 0; i < newCount; i++) {
      this.pathAgents.push(new PathAgent(i, stateBuffer));
    }
    this.stateMachine = new CharacterStateMachine(newCount);
    this.areaSpots.clear();
  }

  public setInstanceCount(count: number): void {
    this.characterManager.setInstanceCount(count);
    // Re-sync path agents and state machine after resize
    const newCount = this.characterManager.getCount();
    const stateBuffer = this.characterManager.getAgentStateBuffer()!;
    this.pathAgents = [];
    for (let i = 0; i < newCount; i++) {
      this.pathAgents.push(new PathAgent(i, stateBuffer));
    }
    this.stateMachine = new CharacterStateMachine(newCount);
    this.areaSpots.clear();
  }

  public get isLoaded(): boolean {
    return this.characterManager.isLoaded;
  }

  // ── ICharacterDriver implementation ──────────────────────────

  public setPhysicsMode(index: number, mode: AgentBehavior): void {
    this.characterManager.setPhysicsMode(index, mode);
  }

  public setAnimation(index: number, name: AnimationName, loop: boolean = true): void {
    this.characterManager.setAnimation(index, name, loop);
  }

  public setExpression(index: number, key: ExpressionKey): void {
    this.characterManager.setExpression(index, key);
  }

  public getAgentState(index: number): AgentBehavior {
    return this.characterManager.getAgentState(index);
  }

  public getAnimationDuration(name: AnimationName): number {
    return this.characterManager.getAnimationDuration(name);
  }
}
