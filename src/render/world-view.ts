import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Prop, WorldRow } from "../sim/types";
import {
  bushGeometry,
  flowerGeometry,
  rockGeometry,
  treeGeometry,
} from "./models";
import { makeShadowMaterial } from "./shadow";
import { buildVoxelGeometry } from "./voxel";

const GRASS_SIDE = 0x5f9c3d;
const GRASS_EDGE = 0x4e8a31;
const GRASS_TILES = [0x8ed35a, 0x83cc50, 0x95d963] as const;
const ROAD_SIDE = 0x343a40;
const ROAD_TILES = [0x4d5259, 0x494e55, 0x51565d] as const;
const ROAD_EDGE = 0xdad4bf;
const LANE_LINE = 0xf4f0dc;
const RIVER_SIDE = 0x2b80aa;
const RIVER_TILES = [0x49b9e6, 0x43b1df, 0x4fc0ec] as const;
const RIVER_FOAM = 0xdaf8ff;
const RAIL_SIDE = 0x383d43;
const RAIL_TILES = [0x4a4f56, 0x474c53] as const;
const RAIL_EDGE = 0xd8d2bd;
const RAIL_METAL = 0x8d8d86;
const SLEEPER = 0x6b4a2f;

interface FoamStrip {
  mesh: THREE.Mesh;
  baseX: number;
  baseZ: number;
  phase: number;
  speed: number;
  amplitude: number;
}

interface RowView {
  group: THREE.Group;
  /** Merged ground, track and prop geometry for one depth. */
  staticGeometry: THREE.BufferGeometry | null;
  /** Merged blob shadows, kept separate because their material blends. */
  shadowGeometry: THREE.BufferGeometry | null;
  /** River foam owns one geometry per strip because it moves per frame. */
  foam: FoamStrip[];
  foamGeometries: THREE.BufferGeometry[];
}

function tinted(geometry: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const count = geometry.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  const base = new THREE.Color(color);

  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = base.r;
    colors[i * 3 + 1] = base.g;
    colors[i * 3 + 2] = base.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function planePart(
  width: number,
  depth: number,
  color: number,
  x: number,
  y: number,
  z: number,
): THREE.BufferGeometry {
  const indexed = new THREE.PlaneGeometry(width, depth);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(x, y, z);
  return tinted(geometry, color);
}

function boxPart(
  width: number,
  height: number,
  depth: number,
  color: number,
  x: number,
  y: number,
  z: number,
): THREE.BufferGeometry {
  return buildVoxelGeometry([
    { x, y, z, w: width, h: height, d: depth, color },
  ]);
}

function shadowPart(
  x: number,
  z: number,
  sx: number,
  sz: number,
  y: number,
): THREE.BufferGeometry {
  const indexed = new THREE.PlaneGeometry(1, 1);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  geometry.rotateX(-Math.PI / 2);
  geometry.scale(sx, 1, sz);
  geometry.translate(x, y, z);
  return geometry;
}

function mergeParts(
  parts: THREE.BufferGeometry[],
): THREE.BufferGeometry | null {
  if (parts.length === 0) {
    return null;
  }

  const merged = mergeGeometries(parts, false);
  for (const part of parts) {
    part.dispose();
  }

  if (!merged) {
    throw new Error("Could not merge row geometry");
  }

  merged.computeBoundingSphere();
  return merged;
}

/**
 * Projects the simulation's live `WorldRow[]` window.
 *
 * Rows are keyed by depth. As the player advances the simulation recycles rows
 * far behind and appends new ones ahead; this view builds a group for each new
 * depth and disposes the group for each dropped depth. Nothing is rebuilt for
 * rows that stay in the window.
 *
 * Every static part of a row (ground tiles, shoulders, sleepers, tufts and
 * scenery) is merged into one vertex-coloured mesh. A full window used to cost
 * roughly a dozen draw calls per row; it now costs one, plus one for the blob
 * shadows and the few animated foam strips on a river.
 */
export class WorldView {
  private readonly materials = new Map<number, THREE.MeshLambertMaterial>();
  private readonly voxelMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
  });
  private readonly shadowMaterial: THREE.MeshBasicMaterial;
  private readonly rows = new Map<number, RowView>();
  private runId = -1;

  constructor(private readonly scene: THREE.Scene) {
    this.shadowMaterial = makeShadowMaterial(0.72);

    this.addBackdrop();
    this.addHorizonTrees();
  }

  /** Cosmetic only: foam drifts and breathes, never affecting the simulation. */
  update(time: number): void {
    for (const view of this.rows.values()) {
      for (const foam of view.foam) {
        foam.mesh.position.x =
          foam.baseX + Math.sin(time * foam.speed + foam.phase) * 0.07;
        foam.mesh.position.z =
          foam.baseZ +
          Math.cos(time * foam.speed * 0.7 + foam.phase) * foam.amplitude;
      }
    }
  }

  /**
   * Match the scene to the live rows. `runId` changes on retry, when the same
   * depths come back with freshly generated content.
   */
  sync(rows: readonly WorldRow[], runId: number): void {
    if (runId !== this.runId) {
      for (const z of [...this.rows.keys()]) {
        this.removeRow(z);
      }
      this.runId = runId;
    }

    const wanted = new Map<number, WorldRow>();
    for (const row of rows) {
      wanted.set(row.z, row);
    }

    for (const z of [...this.rows.keys()]) {
      if (!wanted.has(z)) {
        this.removeRow(z);
      }
    }

    for (const row of rows) {
      if (!this.rows.has(row.z)) {
        this.addRow(row, wanted);
      }
    }
  }

  private material(color: number): THREE.MeshLambertMaterial {
    let material = this.materials.get(color);

    if (!material) {
      material = new THREE.MeshLambertMaterial({ color });
      this.materials.set(color, material);
    }

    return material;
  }

  private addBackdrop(): void {
    const far = new THREE.PlaneGeometry(140, 140);
    const farMesh = new THREE.Mesh(far, this.material(0x5f9a3e));
    farMesh.rotation.x = -Math.PI / 2;
    farMesh.position.set(0, -0.4, -34);
    this.scene.add(farMesh);

    const near = new THREE.PlaneGeometry(60, 60);
    const nearMesh = new THREE.Mesh(near, this.material(0x5f9c3d));
    nearMesh.rotation.x = -Math.PI / 2;
    nearMesh.position.set(0, -0.1, 16);
    this.scene.add(nearMesh);
  }

  private addHorizonTrees(): void {
    const positions = [
      -20, -17, -14.5, -11, -8, -5.2, -2.2, 0.8, 3.8, 6.8, 9.8, 12.8, 15.6,
      18.5,
    ];
    const parts: THREE.BufferGeometry[] = [];

    for (let i = 0; i < positions.length; i += 1) {
      const geometry = treeGeometry(i % 5).clone();
      const x = positions[i] ?? 0;
      const z = -31 - (i % 3) * 1.4;
      const scale = 0.86 + ((i * 7) % 5) * 0.12;
      geometry.scale(scale, scale, scale);
      geometry.translate(x, 0, z);
      parts.push(geometry);
    }

    // A smaller, fog-dimmed back row closes the horizon.
    for (const [index, x] of [-16, -9, -2, 5, 12].entries()) {
      const geometry = treeGeometry((index + 2) % 5).clone();
      const scale = 0.6 + (index % 3) * 0.08;
      geometry.scale(scale, scale, scale);
      geometry.translate(x, 0, -38 - (index % 2) * 1.6);
      parts.push(geometry);
    }

    // All horizon trees share one material and never move, so one mesh is
    // enough instead of nineteen.
    const merged = mergeParts(parts);
    if (merged) {
      this.scene.add(new THREE.Mesh(merged, this.voxelMaterial));
    }
  }

  private addRow(row: WorldRow, rows: ReadonlyMap<number, WorldRow>): void {
    const view: RowView = {
      group: new THREE.Group(),
      staticGeometry: null,
      shadowGeometry: null,
      foam: [],
      foamGeometries: [],
    };
    const parts: THREE.BufferGeometry[] = [];
    const shadows: THREE.BufferGeometry[] = [];
    const sideColor =
      row.kind === "grass"
        ? GRASS_SIDE
        : row.kind === "road"
          ? ROAD_SIDE
          : row.kind === "river"
            ? RIVER_SIDE
            : RAIL_SIDE;

    parts.push(planePart(24, 1.02, sideColor, 0, -0.02, 0));

    for (let x = -4; x <= 4; x += 1) {
      parts.push(planePart(1, 1, this.tileColor(row, x), x, 0, 0));
    }

    if (row.kind === "grass") {
      parts.push(planePart(0.2, 1.02, GRASS_EDGE, -4.55, 0.008, 0));
      parts.push(planePart(0.2, 1.02, GRASS_EDGE, 4.55, 0.008, 0));

      const tufts = [-3.5, -0.7, 2.6];
      for (let i = 0; i < tufts.length; i += 1) {
        if ((row.z + i) % 3 !== 0) {
          continue;
        }
        const gx = tufts[i] ?? 0;
        parts.push(boxPart(0.07, 0.16, 0.07, 0x6fbb42, gx, 0.08, 0.18));
        parts.push(
          boxPart(0.05, 0.1, 0.05, 0x83cc50, gx + 0.08, 0.06, 0.23),
        );
      }
    }

    if (row.kind === "road") {
      parts.push(planePart(0.18, 1.02, ROAD_EDGE, -4.55, 0.01, 0));
      parts.push(planePart(0.18, 1.02, ROAD_EDGE, 4.55, 0.01, 0));

      const previous = rows.get(row.z - 1);
      if (previous?.kind !== "road") {
        this.addDashLine(parts, 0.5);
      }

      const next = rows.get(row.z + 1);
      if (next?.kind !== "road") {
        this.addDashLine(parts, -0.5);
      }
    }

    if (row.kind === "river") {
      parts.push(planePart(0.16, 1.02, RIVER_FOAM, -4.56, 0.018, 0));
      parts.push(planePart(0.16, 1.02, RIVER_FOAM, 4.56, 0.018, 0));
      parts.push(planePart(0.08, 1.02, 0xa9eaff, -4.46, 0.016, 0));
      parts.push(planePart(0.08, 1.02, 0xa9eaff, 4.46, 0.016, 0));

      const streaks = [
        { x: -3.3, w: 0.62, z: 0.16 },
        { x: -1.2, w: 0.46, z: -0.2 },
        { x: 0.5, w: 0.72, z: 0.24 },
        { x: 2.2, w: 0.5, z: -0.16 },
        { x: 3.6, w: 0.38, z: 0.12 },
      ];

      for (let i = 0; i < streaks.length; i += 1) {
        const streak = streaks[i];
        if (!streak) {
          continue;
        }

        const geometry = planePart(
          streak.w,
          0.045,
          i % 2 === 0 ? 0xb8efff : 0xdaf8ff,
          streak.x,
          0.013,
          streak.z,
        );
        view.foamGeometries.push(geometry);
        const mesh = new THREE.Mesh(
          geometry,
          this.material(i % 2 === 0 ? 0xb8efff : 0xdaf8ff),
        );
        view.group.add(mesh);
        view.foam.push({
          mesh,
          baseX: streak.x,
          baseZ: streak.z,
          phase: row.z * 1.3 + i * 1.7,
          speed: 0.5 + (i % 3) * 0.18,
          amplitude: 0.024 + (i % 2) * 0.014,
        });
      }

      parts.push(planePart(0.24, 0.05, RIVER_FOAM, 1.7, 0.014, -0.34));
    }

    if (row.kind === "rail") {
      parts.push(planePart(0.18, 1.02, RAIL_EDGE, -4.55, 0.01, 0));
      parts.push(planePart(0.18, 1.02, RAIL_EDGE, 4.55, 0.01, 0));
      parts.push(boxPart(10, 0.05, 0.1, RAIL_METAL, 0, 0.08, 0.22));
      parts.push(boxPart(10, 0.05, 0.1, RAIL_METAL, 0, 0.08, -0.22));

      for (let x = -4.6; x <= 4.6; x += 0.62) {
        parts.push(boxPart(0.14, 0.05, 0.9, SLEEPER, x, 0.045, 0));
      }
    }

    for (const prop of row.props) {
      this.addProp(parts, shadows, prop);
    }

    view.staticGeometry = mergeParts(parts);
    if (view.staticGeometry) {
      view.group.add(new THREE.Mesh(view.staticGeometry, this.voxelMaterial));
    }

    view.shadowGeometry = mergeParts(shadows);
    if (view.shadowGeometry) {
      const shadow = new THREE.Mesh(view.shadowGeometry, this.shadowMaterial);
      shadow.renderOrder = 1;
      view.group.add(shadow);
    }

    // One group per depth keeps the row recycle cheap; local z is row-centred,
    // so a row at simulation depth 20 sits at world z = -20.
    view.group.position.z = -row.z;
    this.scene.add(view.group);
    this.rows.set(row.z, view);
  }

  private removeRow(z: number): void {
    const view = this.rows.get(z);

    if (!view) {
      return;
    }

    this.scene.remove(view.group);

    view.staticGeometry?.dispose();
    view.shadowGeometry?.dispose();
    for (const geometry of view.foamGeometries) {
      geometry.dispose();
    }

    this.rows.delete(z);
  }

  private tileColor(row: WorldRow, x: number): number {
    const index = Math.abs(x + row.z + 7) % 3;

    if (row.kind === "grass") {
      return GRASS_TILES[index] ?? GRASS_TILES[0];
    }
    if (row.kind === "road") {
      return ROAD_TILES[index] ?? ROAD_TILES[0];
    }
    if (row.kind === "river") {
      return RIVER_TILES[index] ?? RIVER_TILES[0];
    }
    return RAIL_TILES[index % 2] ?? RAIL_TILES[0];
  }

  private addProp(
    parts: THREE.BufferGeometry[],
    shadows: THREE.BufferGeometry[],
    prop: Prop,
  ): void {
    if (prop.kind === "tree") {
      const variant = prop.variant ?? 0;
      const geometry = treeGeometry(variant).clone();
      geometry.translate(prop.x, 0, 0);
      parts.push(geometry);
      const wide = variant % 5 === 4 ? 1.55 : variant % 5 === 3 ? 1.05 : 1.25;
      shadows.push(shadowPart(prop.x, 0, wide, wide * 0.92, 0.012));
      return;
    }

    if (prop.kind === "bush") {
      const geometry = bushGeometry().clone();
      geometry.scale(0.95, 0.95, 0.95);
      geometry.translate(prop.x, 0, 0);
      parts.push(geometry);
      shadows.push(shadowPart(prop.x, 0, 0.72, 0.62, 0.012));
      return;
    }

    if (prop.kind === "rock") {
      const geometry = rockGeometry().clone();
      geometry.translate(prop.x, 0, 0);
      parts.push(geometry);
      shadows.push(shadowPart(prop.x, 0, 0.85, 0.75, 0.012));
      return;
    }

    if (prop.kind === "flower") {
      const geometry = flowerGeometry(prop.variant ?? 0).clone();
      geometry.translate(prop.x, 0.02, 0);
      parts.push(geometry);
    }
  }

  private addDashLine(parts: THREE.BufferGeometry[], rowZ: number): void {
    for (let x = -4.3; x <= 4.3; x += 0.88) {
      parts.push(planePart(0.52, 0.07, LANE_LINE, x, 0.02, rowZ));
    }
  }
}
