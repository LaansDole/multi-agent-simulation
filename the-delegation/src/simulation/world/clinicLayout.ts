/**
 * clinicLayout -- Pure data and rules of the DynaClinic rooms in the 3D office. No runtime imports, no IO.
 * office.glb's four low walls already split the floor into quadrants; the clinic names them and the
 * desk bays and gates one station to each DynaClinic role. ClinicRooms builds the meshes and POIs.
 * Coordinates are office floor metres (x right, z toward the default camera); every seat and rest
 * spot lies on the navmesh, every sign post off it.
 */
import type { ClinicState } from '../../integration/api/clinicEnvironment';

/** A standing or seated spot; yaw in radians, 0 looks down +z. */
export interface Spot {
  x: number;
  z: number;
  yaw: number;
}

export interface Station {
  /** `<node type>` or `<node type>:<sub_agent>`: the only character that works here. */
  role: string;
  /** office.glb desk POI the station claims; without one the station is a new stool at `seat`. */
  desk?: string;
  seat?: Spot;
  /** Where the character stands between consults (its spawn while the clinic is up). */
  rest: Spot;
}

export interface Room {
  id: string;
  label: string;
  /** Care Team resource whose depletion closes the room (the role name in `Resource note:`). */
  resource?: string;
  /** Floor zone [x0, z0, x1, z1]. */
  zone: [number, number, number, number];
  /** Foot of the sign post: on a wall top, a desk or the floor margin, never on the navmesh. */
  sign: { x: number; y: number; z: number };
  stations: Station[];
}

export type RoomStatus = 'open' | 'short' | 'closed';

const FACE_FRONT = 0;
const FACE_BACK = Math.PI;
const FACE_RIGHT = Math.PI / 2;
const FACE_LEFT = -Math.PI / 2;

export const ROOMS: Room[] = [
  {
    id: 'triage',
    label: 'Triage',
    zone: [-4.75, 1.05, -0.7, 4.75],
    sign: { x: -2.72, y: 0.55, z: 3.94 },
    stations: [{ role: 'dc_triage', seat: { x: -1.15, z: 4.4, yaw: FACE_FRONT }, rest: { x: -1.5, z: 3.8, yaw: FACE_FRONT } }],
  },
  {
    id: 'primary_care',
    label: 'Primary Care',
    zone: [0.4, -2.35, 2.05, -0.15],
    sign: { x: 1.4, y: 0.5, z: -0.42 },
    stations: [{ role: 'dc_primary_care', desk: 'sit_work-5', rest: { x: 0.7, z: -0.6, yaw: FACE_RIGHT } }],
  },
  {
    id: 'imaging',
    label: 'Imaging',
    resource: 'imaging',
    zone: [-0.7, -4.75, 2.15, -2.45],
    sign: { x: 1.2, y: 0, z: -4.86 },
    stations: [{ role: 'dc_care_team:imaging', desk: 'sit_work-2', rest: { x: 0.9, z: -4.15, yaw: FACE_FRONT } }],
  },
  {
    id: 'lab',
    label: 'Pathology / Lab',
    resource: 'pathology',
    zone: [2.25, -4.75, 4.75, -2.45],
    sign: { x: 3.1, y: 0, z: -4.86 },
    stations: [{ role: 'dc_care_team:pathology', desk: 'sit_work-3', rest: { x: 2.7, z: -4.15, yaw: FACE_FRONT } }],
  },
  {
    id: 'pharmacy',
    label: 'Pharmacy',
    resource: 'pharmacology',
    zone: [2.15, -2.35, 4.75, -0.15],
    sign: { x: 4.86, y: 0, z: -0.5 },
    stations: [{ role: 'dc_care_team:pharmacology', desk: 'sit_work-4', rest: { x: 3.9, z: -1.9, yaw: FACE_LEFT } }],
  },
  {
    id: 'case_review',
    label: 'Case Review',
    zone: [0.2, 2.4, 4.75, 4.75],
    sign: { x: 3.0, y: 0.5, z: 2.02 },
    // ponytail: the debate trio shares the whiteboard room, one stool each; split it when a fourth room-sized zone exists.
    stations: [
      { role: 'dc_proponent', seat: { x: 2.6, z: 3.2, yaw: FACE_BACK }, rest: { x: 2.6, z: 3.9, yaw: FACE_BACK } },
      { role: 'dc_critic', seat: { x: 3.3, z: 3.2, yaw: FACE_BACK }, rest: { x: 3.3, z: 3.9, yaw: FACE_BACK } },
      { role: 'dc_synthesizer', seat: { x: 4.0, z: 3.2, yaw: FACE_BACK }, rest: { x: 4.0, z: 3.9, yaw: FACE_BACK } },
    ],
  },
];

/** The shared staff area is the office canteen (PoiManager.STAFF_AREA_POI_ID); it has no station. */
export const STAFF_AREA: Room = {
  id: 'staff_area',
  label: 'Staff Area',
  zone: [-4.75, -4.75, -1.6, 0.3],
  sign: { x: -4.57, y: 0.8, z: -3.0 },
  stations: [],
};

/** Station role of a workflow node's character; undefined when no room has a station for it. */
export function stationRole(nodeType: string, subAgent?: string): string | undefined {
  const role = subAgent ? `${nodeType}:${subAgent}` : nodeType;
  return ROOMS.some((room) => room.stations.some((station) => station.role === role)) ? role : undefined;
}

/** Rooms to build for a team: only those with a character for at least one station, each cut to its staffed stations. */
export function roomsFor(roles: readonly string[]): Room[] {
  return ROOMS.map((room) => ({ ...room, stations: room.stations.filter((station) => roles.includes(station.role)) })).filter(
    (room) => room.stations.length > 0,
  );
}

/** Depleted stock closes a Care Team room; a short shift leaves every other Care Team room on reduced staffing. */
export function roomStatus(room: Room, state: ClinicState | null): RoomStatus {
  if (!room.resource || !state) return 'open';
  if (state.depleted.includes(room.resource)) return 'closed';
  return state.staffing === 'short' ? 'short' : 'open';
}
