import * as THREE from 'three/webgpu';
import type { AgentNode } from '../../data/agents';
import type { ClinicState } from '../../integration/api/clinicEnvironment';
import { PoiManager, spawnPoiId } from './PoiManager';
import { Room, RoomStatus, roomsFor, roomStatus, Spot, STAFF_AREA, Station } from './clinicLayout';

/** --color-darkDelegation: the nameplates' ink, here signs, posts and floor markings. */
const INK = '#313437';
const PAPER = '#ffffff';

/** Sign plates keep one size on screen at any camera distance, like the DOM nameplates. Sizes in CSS pixels. */
const SIGN = { labelPx: 13, notePx: 10, padX: 8, height: 24, noteHeight: 38, dot: 4.5, dotGap: 12 };
/** Canvas pixels per CSS pixel of a plate. */
const SIGN_RESOLUTION = 3;
/** Post length from its foot to the plate's lower edge, metres: plates clear the nameplates of the characters around them. */
const SIGN_POST = 2;
const SIGN_NOTE: Record<RoomStatus, string> = { open: '', short: 'Short shift', closed: 'Closed: out of stock' };

const ZONE_Y = 0.012;
const ZONE_LINE = 0.04;
const HATCH_METRES = 0.5;
/** Floor dimming of a room that is not fully open. */
const ZONE_DIM: Record<RoomStatus, number> = { open: 0, short: 0.12, closed: 0.2 };
/** Its props lose their light too. */
const PROP_COLOR: Record<RoomStatus, string> = { open: PAPER, short: '#c4c7ca', closed: '#a3a7ab' };

interface BuiltRoom {
  room: Room;
  status: RoomStatus;
  dim: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicNodeMaterial>;
  hatch: THREE.Mesh | null;
  props: THREE.MeshStandardNodeMaterial;
  drawSign: (status: RoomStatus) => void;
}

/** Characters look down +z at yaw 0. */
const pose = (spot: Spot) => ({
  position: new THREE.Vector3(spot.x, 0, spot.z),
  quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spot.yaw),
});

/**
 * The DynaClinic rooms of the office, built from primitives for the stations the active team staffs:
 * a floor outline and a sign per room, a few props, a stool per new station. Also registers the
 * station POIs (PoiDef.role) and moves each staffed character's spawn into its room; clear() undoes
 * all of it.
 */
export class ClinicRooms {
  private group: THREE.Group | null = null;
  private built: BuiltRoom[] = [];
  private state: ClinicState | null = null;
  private disposables: { dispose(): void }[] = [];
  private undoPois: (() => void)[] = [];
  /** World units per CSS pixel at distance 1 from the camera (setViewport); a 600 px high 45 degree view until then. */
  private unitsPerPixel = (2 * Math.tan(Math.PI / 8)) / 600;

  constructor(private scene: THREE.Scene, private poiManager: PoiManager) {}

  /** Rebuilds the rooms for `agents`; a team without station roles leaves the plain office. */
  public set(agents: AgentNode[]): void {
    this.clear();
    const staff = new Map(agents.flatMap((agent) => (agent.station ? [[agent.station, agent] as const] : [])));
    const rooms = roomsFor([...staff.keys()]);
    if (rooms.length === 0) return;

    const group = new THREE.Group();
    this.group = group;
    this.scene.add(group);
    const hatch = this.hatchTexture();
    const line = new THREE.MeshBasicNodeMaterial({ color: INK, transparent: true, opacity: 0.45, depthWrite: false });
    this.disposables.push(line);

    for (const room of [STAFF_AREA, ...rooms]) {
      const stations = room.stations.flatMap((station) => {
        const agent = staff.get(station.role);
        return agent ? [{ station, agent }] : [];
      });
      const props = this.material(PAPER);
      const accent = this.material(stations[0]?.agent.color ?? INK);
      for (const mesh of PROPS[room.id]?.(props, accent) ?? []) this.addMesh(mesh);
      for (const { station, agent } of stations) {
        this.claim(station, agent);
        if (station.seat) this.addStool(station.seat, props, this.material(agent.color));
      }
      this.addOutline(room.zone, line);
      const dim = this.addFloor(room.zone, new THREE.MeshBasicNodeMaterial({ color: INK, transparent: true, depthWrite: false }), ZONE_Y);
      dim.visible = false;
      const stripes = room.resource
        ? this.addFloor(room.zone, new THREE.MeshBasicNodeMaterial({ map: hatch, transparent: true, depthWrite: false }), ZONE_Y + 0.002)
        : null;
      if (stripes) stripes.visible = false;
      const drawSign = this.addSign(room.sign, room.label, stations.map(({ agent }) => agent.color));
      drawSign('open');
      this.built.push({ room, status: 'open', dim, hatch: stripes, props, drawSign });
    }
    // The first draw can run before Inter has loaded.
    void document.fonts.ready.then(() => {
      if (this.group === group) this.built.forEach((built) => built.drawSign(built.status));
    });
    this.setState(this.state);
  }

  /** Shows the environment on the rooms: a short shift dims the Care Team rooms, depleted stock closes one. */
  public setState(state: ClinicState | null): void {
    this.state = state;
    for (const built of this.built) {
      const status = roomStatus(built.room, state);
      if (status === built.status) continue;
      built.status = status;
      built.dim.visible = status !== 'open';
      built.dim.material.opacity = ZONE_DIM[status];
      built.props.color.set(PROP_COLOR[status]);
      if (built.hatch) built.hatch.visible = status === 'closed';
      built.drawSign(status);
    }
  }

  /** The 3D view's height in CSS pixels and the camera's vertical field of view: keeps the sign plates at their pixel size. */
  public setViewport(heightPx: number, fovDegrees: number): void {
    this.unitsPerPixel = (2 * Math.tan(THREE.MathUtils.degToRad(fovDegrees) / 2)) / heightPx;
    this.group?.traverse((child) => {
      if ((child as THREE.Sprite).isSprite) this.fitPlate(child as THREE.Sprite);
    });
  }

  private clear(): void {
    this.undoPois.reverse().forEach((undo) => undo());
    this.undoPois = [];
    this.disposables.forEach((item) => item.dispose());
    this.disposables = [];
    this.built = [];
    if (this.group) this.scene.remove(this.group);
    this.group = null;
  }

  /** Gates the station to its role and moves the character's spawn to the station's rest spot. */
  private claim(station: Station, agent: AgentNode): void {
    const pois = this.poiManager;
    if (station.desk) {
      const desk = pois.expectPoi(station.desk);
      if (desk) {
        desk.role = station.role;
        this.undoPois.push(() => { desk.role = undefined; });
      }
    } else if (station.seat) {
      const id = `sit_work-${station.role}`;
      pois.addPoi({ id, ...pose(station.seat), arrivalState: 'sit_work', occupiedBy: null, role: station.role });
      this.undoPois.push(() => pois.removePoi(id));
    }
    const spawnId = spawnPoiId(agent.index);
    const officeSpawn = pois.getPoi(spawnId);
    pois.addPoi({ id: spawnId, ...pose(station.rest), arrivalState: 'idle', occupiedBy: null });
    this.undoPois.push(() => (officeSpawn ? pois.addPoi(officeSpawn) : pois.removePoi(spawnId)));
  }

  // ── Meshes ───────────────────────────────────────────────────

  /** Same surface as the office meshes (WorldManager.load). */
  private material(color: string): THREE.MeshStandardNodeMaterial {
    const material = new THREE.MeshStandardNodeMaterial({ color, roughness: 1, metalness: 0.35 });
    this.disposables.push(material);
    return material;
  }

  private addMesh(mesh: THREE.Mesh): void {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.disposables.push(mesh.geometry);
    this.group?.add(mesh);
  }

  private addStool(spot: Spot, frame: THREE.Material, cushion: THREE.Material): void {
    this.addMesh(cylinder(cushion, 0.19, 0.07, spot.x, 0.42, spot.z));
    this.addMesh(cylinder(frame, 0.035, 0.38, spot.x, 0.19, spot.z));
    this.addMesh(cylinder(frame, 0.15, 0.03, spot.x, 0.015, spot.z));
  }

  /** A flat mesh over the zone, just above the floor. */
  private addFloor<M extends THREE.Material>([x0, z0, x1, z1]: Room['zone'], material: M, y: number): THREE.Mesh<THREE.BufferGeometry, M> {
    const geometry = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2);
    // UVs in hatch tiles, so every zone shares one texture at one stripe width.
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (x1 - x0)) / HATCH_METRES, (uv.getY(i) * (z1 - z0)) / HATCH_METRES);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    this.disposables.push(geometry, material);
    this.group?.add(mesh);
    return mesh;
  }

  /** The room's boundary: a ZONE_LINE wide marking along the zone's edge. */
  private addOutline([x0, z0, x1, z1]: Room['zone'], material: THREE.Material): void {
    const w = (x1 - x0) / 2, d = (z1 - z0) / 2;
    const rect = (path: THREE.Path, inset: number) =>
      path.moveTo(-w + inset, -d + inset).lineTo(w - inset, -d + inset).lineTo(w - inset, d - inset).lineTo(-w + inset, d - inset).closePath();
    const shape = new THREE.Shape();
    rect(shape, 0);
    shape.holes.push(rect(new THREE.Path(), ZONE_LINE));
    const geometry = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set((x0 + x1) / 2, ZONE_Y, (z0 + z1) / 2);
    this.disposables.push(geometry);
    this.group?.add(mesh);
  }

  /** Diagonal stripes: the closed-room floor marking. */
  private hatchTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = INK;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 14;
      for (const offset of [-64, 0, 64]) {
        ctx.beginPath();
        ctx.moveTo(offset, 64);
        ctx.lineTo(offset + 64, 0);
        ctx.stroke();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    this.disposables.push(texture);
    return texture;
  }

  private fitPlate(plate: THREE.Sprite): void {
    const map = plate.material.map;
    if (map) plate.scale.set((map.image.width / SIGN_RESOLUTION) * this.unitsPerPixel, (map.image.height / SIGN_RESOLUTION) * this.unitsPerPixel, 1);
  }

  /**
   * A post with a camera-facing plate: one dot per station in its character's colour, the room name
   * and, when the room is not fully open, a status line (a closed room's plate is also inverted).
   */
  private addSign(foot: Room['sign'], label: string, colors: string[]): (status: RoomStatus) => void {
    const canvas = document.createElement('canvas');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const plateMaterial = new THREE.SpriteNodeMaterial({ map: texture, transparent: true, sizeAttenuation: false });
    const plate = new THREE.Sprite(plateMaterial);
    plate.center.set(0.5, 0);
    plate.position.set(foot.x, foot.y + SIGN_POST, foot.z);
    this.group?.add(plate);
    this.addMesh(cylinder(this.material(INK), 0.02, SIGN_POST, foot.x, foot.y + SIGN_POST / 2, foot.z));
    this.disposables.push(texture, plateMaterial);

    const font = (weight: number, px: number) => `${weight} ${px}px Inter, system-ui, sans-serif`;
    return (status) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const closed = status === 'closed';
      const note = SIGN_NOTE[status];
      const dots = colors.length * SIGN.dotGap;
      ctx.font = font(600, SIGN.labelPx);
      let textWidth = ctx.measureText(label).width;
      ctx.font = font(400, SIGN.notePx);
      if (note) textWidth = Math.max(textWidth, ctx.measureText(note).width);
      const width = Math.ceil(SIGN.padX * 2 + dots + textWidth);
      const height = note ? SIGN.noteHeight : SIGN.height;

      // Resizing clears the canvas and resets the context.
      canvas.width = width * SIGN_RESOLUTION;
      canvas.height = height * SIGN_RESOLUTION;
      ctx.scale(SIGN_RESOLUTION, SIGN_RESOLUTION);
      ctx.beginPath();
      ctx.roundRect(1, 1, width - 2, height - 2, 6);
      ctx.fillStyle = closed ? INK : PAPER;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      colors.forEach((color, i) => {
        ctx.beginPath();
        ctx.arc(SIGN.padX + SIGN.dot + i * SIGN.dotGap, SIGN.height / 2, SIGN.dot, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = closed ? PAPER : INK;
        ctx.stroke();
      });
      ctx.fillStyle = closed ? PAPER : INK;
      ctx.textBaseline = 'middle';
      ctx.font = font(600, SIGN.labelPx);
      ctx.fillText(label, SIGN.padX + dots, SIGN.height / 2 + 1);
      if (note) {
        ctx.font = font(400, SIGN.notePx);
        ctx.fillText(note, SIGN.padX + dots, SIGN.height + 4);
      }
      texture.dispose(); // the canvas changed size: upload a new texture
      texture.needsUpdate = true;
      this.fitPlate(plate);
    };
  }
}

// ── Props ────────────────────────────────────────────────────

function box(material: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function cylinder(material: THREE.Material, radius: number, height: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 20), material);
  mesh.position.set(x, y, z);
  return mesh;
}

/**
 * Props per room id, in office floor metres. Each stands off the navmesh (floor margin, wall top,
 * the gap between two desks) or in a dead-end corner, so no walking path crosses one.
 */
const PROPS: Record<string, (white: THREE.Material, accent: THREE.Material) => THREE.Mesh[]> = {
  // Desk on the front margin, facing the stool.
  triage: (white, accent) => [
    box(white, 0.9, 0.5, 0.26, -1.15, 0.25, 4.87),
    box(white, 0.06, 0.08, 0.04, -1.15, 0.54, 4.9),
    box(white, 0.34, 0.24, 0.03, -1.15, 0.7, 4.9),
    box(accent, 0.16, 0.02, 0.22, -0.88, 0.51, 4.86),
  ],
  // Screen in the gap between the Primary Care and Pharmacy desks.
  primary_care: (white, accent) => [
    box(white, 0.04, 0.9, 0.8, 2.1, 0.45, -1.25),
    box(accent, 0.05, 0.08, 0.8, 2.1, 0.94, -1.25),
  ],
  // Scanner in the dead-end corner behind the desk; screen in the gap between the Imaging and Lab desks.
  imaging: (white, accent) => {
    const gantry = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.12, 10, 24), white);
    gantry.position.set(-0.15, 0.62, -4.45);
    return [
      gantry,
      box(white, 0.9, 0.14, 0.3, -0.15, 0.07, -4.45),
      box(white, 0.2, 0.4, 0.6, -0.15, 0.2, -4.05),
      box(white, 0.34, 0.08, 1.0, -0.15, 0.44, -4.2),
      box(accent, 0.3, 0.03, 0.55, -0.15, 0.495, -4.0),
      box(white, 0.04, 0.9, 0.76, 2.2, 0.45, -3.12),
    ];
  },
  // Bench on the back margin with a microscope and a rack of sample tubes.
  lab: (white, accent) => [
    box(white, 0.9, 0.55, 0.26, 4.2, 0.275, -4.87),
    box(white, 0.14, 0.03, 0.16, 3.98, 0.565, -4.87),
    box(white, 0.04, 0.2, 0.04, 3.98, 0.68, -4.92),
    box(white, 0.06, 0.06, 0.14, 3.98, 0.76, -4.87),
    box(white, 0.32, 0.04, 0.08, 4.38, 0.57, -4.87),
    ...[0, 1, 2, 3].map((i) => cylinder(accent, 0.018, 0.12, 4.275 + i * 0.07, 0.65, -4.87)),
  ],
  // Low cabinet on the right margin with medicine boxes.
  pharmacy: (white, accent) => [
    box(white, 0.26, 0.6, 1.3, 4.87, 0.3, -1.55),
    box(accent, 0.14, 0.1, 0.2, 4.87, 0.65, -2.0),
    box(white, 0.16, 0.14, 0.14, 4.87, 0.67, -1.7),
    box(accent, 0.12, 0.08, 0.12, 4.87, 0.64, -1.45),
    box(white, 0.14, 0.18, 0.1, 4.87, 0.69, -1.15),
  ],
  // Review table against the whiteboard, facing the three stools.
  case_review: (white) => [box(white, 2.1, 0.5, 0.28, 3.3, 0.25, 2.86)],
};
