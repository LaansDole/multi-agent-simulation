import { Pathfinding } from 'three-pathfinding';
import * as THREE from 'three/webgpu';
import { NAVMESH_ZONE } from '../constants';

// three-pathfinding does not export its zone types and types a group as {}; at runtime a group
// is its node (triangle) list. Only the fields this class reads are declared.
interface NavNode { vertexIds: number[]; centroid: THREE.Vector3 }
interface NavZone { groups: NavNode[][]; vertices: THREE.Vector3[] }

/**
 * Manages the navigation mesh used for path queries.
 *
 * Initially built procedurally from a flat plane (same dimensions as the
 * visible ground). In the future, call loadFromGeometry() with a navmesh
 * extracted from a GLB to replace it.
 */
export class NavMeshManager {
  private pf = new Pathfinding();
  private zone: NavZone | null = null;

  // ── Setup ────────────────────────────────────────────────────

  /**
   * Load a navmesh from any BufferGeometry (e.g. extracted from a GLB).
   * Replaces any previously loaded zone.
   */
  public loadFromGeometry(geometry: THREE.BufferGeometry): void {
    this.zone = Pathfinding.createZone(geometry) as unknown as NavZone;
    this.pf.setZoneData(NAVMESH_ZONE, this.zone);
  }

  // ── Queries ──────────────────────────────────────────────────

  /**
   * Find a path from `from` to `to`.
   * Returns an array of waypoints (excluding the start position), or [] when there is no path.
   */
  public findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    if (!this.zone) return [];
    const path = this.query(from, to);
    if (path) return path;
    // three-pathfinding only starts from a point inside a polygon. Chairs hang off ~10 cm wide
    // navmesh slivers, so an agent a few cm off its seat (or on the last leg into one) stands
    // outside every polygon: walk onto the nearest navmesh point first.
    const start = this.nearestPoint(from);
    const rest = start && this.query(start, to);
    return start && rest ? [start, ...rest] : [];
  }

  public isReady(): boolean {
    return this.zone !== null;
  }

  /** three-pathfinding query; null when `from` or `to` lies outside every navmesh polygon. */
  private query(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null {
    const groupID = this.pf.getGroup(NAVMESH_ZONE, from);
    if (groupID === null) return null;
    const path: THREE.Vector3[] | null = this.pf.findPath(from, to, NAVMESH_ZONE, groupID);
    return path?.length ? path : null;
  }

  /** Closest point inside the navmesh to `point`, or null without a navmesh. */
  private nearestPoint(point: THREE.Vector3): THREE.Vector3 | null {
    if (!this.zone) return null;
    const { vertices } = this.zone;
    const triangle = new THREE.Triangle();
    const candidate = new THREE.Vector3();
    const best = new THREE.Vector3();
    let bestNode: NavNode | null = null;
    let bestDist = Infinity;
    for (const group of this.zone.groups) {
      for (const node of group) {
        const [a, b, c] = node.vertexIds;
        triangle.set(vertices[a], vertices[b], vertices[c]).closestPointToPoint(point, candidate);
        const dist = candidate.distanceToSquared(point);
        if (dist < bestDist) {
          bestDist = dist;
          best.copy(candidate);
          bestNode = node;
        }
      }
    }
    // The closest point sits on a polygon edge, which the library's point-in-polygon test may
    // count as outside: nudge it 5% towards the polygon centroid so it is strictly inside.
    return bestNode ? best.lerp(bestNode.centroid, 0.05) : null;
  }

  /** Checks if a point is within the navmesh boundaries. */
  public isPointOnNavMesh(point: THREE.Vector3): boolean {
    if (!this.zone) return false;
    return this.pf.getGroup(NAVMESH_ZONE, point as any) !== null;
  }

  /** True when `point` lies inside a navmesh polygon, i.e. findPath can start or end there. */
  public isWalkable(point: THREE.Vector3): boolean {
    if (!this.zone) return false;
    const groupID = this.pf.getGroup(NAVMESH_ZONE, point);
    return groupID !== null && this.pf.getClosestNode(point, NAVMESH_ZONE, groupID, true) !== null;
  }
}
