
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three/webgpu';
import { getAgentSet, MAX_AGENTS } from '../../data/agents';
import { useTeamStore } from '../../integration/store/teamStore';
import { DRACO_LIB_PATH } from '../constants';
import { NavMeshManager } from '../pathfinding/NavMeshManager';
import { PoiManager, spawnPoiId } from './PoiManager';

export class WorldManager {
  private office: THREE.Group | null = null;

  constructor(
    private scene: THREE.Scene,
    private navMesh: NavMeshManager,
    private poiManager: PoiManager
  ) {}

  public async load(): Promise<void> {
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(DRACO_LIB_PATH);
    loader.setDRACOLoader(dracoLoader);
    const officeGltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/office.glb`);
    this.office = officeGltf.scene;
    this.scene.add(this.office);

    // Get current AgentSet color
    const { selectedAgentSetId, customSystems } = useTeamStore.getState();
    const activeSet = getAgentSet(selectedAgentSetId, customSystems);
    const themeColor = new THREE.Color(activeSet.color);

    // Extract NavMesh and setup
    let floor: THREE.Box3 | null = null;
    this.office.traverse((child) => {
      if ((child as any).isMesh) {
        const mesh = child as THREE.Mesh;
        const name = mesh.name.toLowerCase();

        if (name.includes('navmesh')) {
          this.navMesh.loadFromGeometry(mesh.geometry);
          floor = new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position as THREE.BufferAttribute);
          mesh.visible = false;
        } else {
          mesh.receiveShadow = true;
          mesh.castShadow = true;

          // Apply specific material for WebGPU shadow compatibility as requested
          if (mesh.material) {
            const oldMat = mesh.material as THREE.MeshStandardMaterial;

            // Check if mesh name starts with "colored" to apply thematic color
            const isColoredMesh = name.startsWith('colored');

            mesh.material = new THREE.MeshStandardNodeMaterial({
              color: isColoredMesh ? themeColor : oldMat.color,
              map: oldMat.map,
              roughness: 1,
              metalness: 0.35,
            });
          }
        }
      }
    });

    // Extract Points of Interest
    this.poiManager.loadFromGlb(this.office);

    if (floor) this.addMissingSpawns(floor);
  }

  /**
   * office.glb ships spawn POIs for agents 1-5 only. Each missing spawn (up to MAX_AGENTS) goes on the
   * walkable floor spot farthest from every POI and the user's origin, facing the room centre.
   * ponytail: greedy farthest-point over a SPAWN_GRID_STEP grid; bake poi-idle-spawn-N into office.glb to drop it.
   */
  private addMissingSpawns(floor: THREE.Box3): void {
    const SPAWN_GRID_STEP = 0.25;
    const candidates: THREE.Vector3[] = [];
    for (let x = floor.min.x; x <= floor.max.x; x += SPAWN_GRID_STEP) {
      for (let z = floor.min.z; z <= floor.max.z; z += SPAWN_GRID_STEP) {
        const spot = new THREE.Vector3(x, 0, z);
        if (this.navMesh.isWalkable(spot)) candidates.push(spot);
      }
    }
    const taken = [new THREE.Vector3(), ...this.poiManager.getAllPois().map((poi) => poi.position)];
    for (let index = 1; index <= MAX_AGENTS; index++) {
      const id = spawnPoiId(index);
      if (this.poiManager.getPoi(id)) continue;
      let best: THREE.Vector3 | null = null;
      let bestGap = 0;
      for (const spot of candidates) {
        const gap = Math.min(...taken.map((t) => (t.x - spot.x) ** 2 + (t.z - spot.z) ** 2));
        if (gap > bestGap) [best, bestGap] = [spot, gap];
      }
      if (!best) return;
      taken.push(best);
      // Characters look down +Z at yaw 0.
      const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-best.x, -best.z));
      this.poiManager.addPoi({ id, position: best.clone(), quaternion, arrivalState: 'idle', occupiedBy: null });
    }
  }

  public updateThemeColor(color: string): void {
    if (!this.office) return;

    const themeColor = new THREE.Color(color);

    this.office.traverse((child) => {
      if ((child as any).isMesh) {
        const mesh = child as THREE.Mesh;
        const name = mesh.name.toLowerCase();

        if (name.startsWith('colored') && mesh.material) {
          // Update existing material color if it's a NodeMaterial
          // or replace it if needed. Since we already replaced them in load(),
          // we can just update the color property.
          if ((mesh.material as any).color) {
            (mesh.material as any).color.copy(themeColor);
          }
        }
      }
    });
  }

  public getOffice(): THREE.Group | null {
    return this.office;
  }
}
