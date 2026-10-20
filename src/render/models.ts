import * as THREE from "three";
import {
  DEFAULT_CHARACTER_ID,
  type CharacterId,
} from "../characters/catalogue";
import { characterBoxes } from "../characters/models";
import { buildVoxelGeometry, type VoxelBox } from "./voxel";

const ORANGE = 0xf2a03d;
const INK = 0x26332d;
const TRUNK = 0x8a5a33;
const TRUNK_DARK = 0x6f4526;
const LEAF = [0x59b84a, 0x6dc957, 0x4aa33f] as const;
const LEAF_LIGHT = [0x7edb66, 0x91e77a, 0x6ccc58] as const;
const STONE = 0x8f989e;
const STONE_LIGHT = 0xaab2b7;
const CAR_COLORS = [0x4b8fe2, 0xf08a3c, 0x57b85f, 0xe45b5b, 0x9b6fd6] as const;
const FLOWERS = [0xffd84d, 0xff8fb1, 0xfff6e8] as const;

const material = new THREE.MeshLambertMaterial({ vertexColors: true });
const geometryCache = new Map<string, THREE.BufferGeometry>();

function geometryFor(
  key: string,
  build: () => VoxelBox[],
): THREE.BufferGeometry {
  let geometry = geometryCache.get(key);

  if (!geometry) {
    geometry = buildVoxelGeometry(build());
    geometryCache.set(key, geometry);
  }

  return geometry;
}

function meshFor(key: string, build: () => VoxelBox[]): THREE.Mesh {
  return new THREE.Mesh(geometryFor(key, build), material);
}

function tone(color: number, factor: number): number {
  return new THREE.Color(color).multiplyScalar(factor).getHex();
}

function treeBoxes(variant: number): VoxelBox[] {
  const index = ((variant % 5) + 5) % 5;
  const green = LEAF[index % LEAF.length] ?? LEAF[0];
  const light = LEAF_LIGHT[index % LEAF_LIGHT.length] ?? LEAF_LIGHT[0];

  if (index === 1) {
    return [
      { x: 0, y: 0.6, z: 0, w: 0.2, h: 1.2, d: 0.2, color: TRUNK },
      { x: 0, y: 1.48, z: 0, w: 1.0, h: 0.56, d: 1.0, color: green },
      { x: 0, y: 1.85, z: 0, w: 0.72, h: 0.44, d: 0.72, color: light },
      { x: 0, y: 2.13, z: 0, w: 0.42, h: 0.3, d: 0.42, color: green },
    ];
  }

  if (index === 2) {
    return [
      { x: 0, y: 0.45, z: 0, w: 0.22, h: 0.9, d: 0.22, color: TRUNK },
      { x: 0, y: 1.0, z: 0, w: 1.12, h: 0.54, d: 1.0, color: green },
      { x: 0.34, y: 1.18, z: 0.12, w: 0.56, h: 0.4, d: 0.56, color: light },
      { x: -0.22, y: 1.34, z: -0.05, w: 0.5, h: 0.38, d: 0.5, color: green },
    ];
  }

  if (index === 3) {
    // Pine: a tall, narrow stack that reads clearly against the horizon.
    return [
      { x: 0, y: 0.5, z: 0, w: 0.2, h: 1.0, d: 0.2, color: TRUNK_DARK },
      { x: 0, y: 1.08, z: 0, w: 1.02, h: 0.42, d: 1.02, color: green },
      { x: 0, y: 1.47, z: 0, w: 0.78, h: 0.4, d: 0.78, color: light },
      { x: 0, y: 1.83, z: 0, w: 0.54, h: 0.34, d: 0.54, color: green },
      { x: 0, y: 2.12, z: 0, w: 0.3, h: 0.26, d: 0.3, color: light },
    ];
  }

  if (index === 4) {
    // Broad shade tree with a flat, wide canopy.
    return [
      { x: 0, y: 0.62, z: 0, w: 0.24, h: 1.24, d: 0.24, color: TRUNK },
      { x: 0, y: 1.42, z: 0, w: 1.3, h: 0.4, d: 1.12, color: green },
      { x: -0.34, y: 1.58, z: 0.08, w: 0.62, h: 0.34, d: 0.62, color: light },
      { x: 0.34, y: 1.56, z: -0.1, w: 0.58, h: 0.3, d: 0.58, color: light },
      { x: 0, y: 1.7, z: 0, w: 0.72, h: 0.28, d: 0.66, color: green },
    ];
  }

  return [
    { x: 0, y: 0.48, z: 0, w: 0.18, h: 0.96, d: 0.18, color: TRUNK },
    { x: 0, y: 1.14, z: 0, w: 0.9, h: 0.5, d: 0.9, color: green },
    { x: 0.06, y: 1.47, z: 0.03, w: 0.66, h: 0.42, d: 0.66, color: light },
    { x: -0.04, y: 1.76, z: 0, w: 0.4, h: 0.28, d: 0.4, color: green },
  ];
}

function bushBoxes(): VoxelBox[] {
  return [
    { x: 0, y: 0.2, z: 0, w: 0.64, h: 0.34, d: 0.54, color: LEAF[0] },
    { x: -0.2, y: 0.34, z: 0.03, w: 0.34, h: 0.3, d: 0.34, color: LEAF_LIGHT[0] },
    { x: 0.2, y: 0.33, z: -0.02, w: 0.32, h: 0.28, d: 0.32, color: LEAF[2] },
  ];
}

function rockBoxes(): VoxelBox[] {
  return [
    { x: 0, y: 0.24, z: 0, w: 0.72, h: 0.46, d: 0.62, color: STONE },
    { x: 0.08, y: 0.5, z: 0.02, w: 0.48, h: 0.28, d: 0.42, color: STONE_LIGHT },
    { x: -0.24, y: 0.18, z: 0.14, w: 0.28, h: 0.22, d: 0.26, color: tone(STONE, 0.86) },
  ];
}

function carBoxes(variant: number): VoxelBox[] {
  const color = CAR_COLORS[variant % CAR_COLORS.length] ?? CAR_COLORS[0];
  const dark = tone(color, 0.72);
  const light = tone(color, 1.12);
  const glass = 0x2d4657;
  const glassLight = 0x4d7f96;

  return [
    // Main body, lower skirt and bumpers.
    { x: 0, y: 0.32, z: 0, w: 1.5, h: 0.32, d: 0.68, color },
    { x: 0, y: 0.17, z: 0, w: 1.56, h: 0.18, d: 0.7, color: dark },
    { x: -0.8, y: 0.25, z: 0, w: 0.08, h: 0.16, d: 0.68, color: 0x39434a },
    { x: 0.8, y: 0.25, z: 0, w: 0.08, h: 0.16, d: 0.68, color: 0x39434a },
    // Hood and trunk, slightly narrower than the body.
    { x: -0.47, y: 0.51, z: 0, w: 0.56, h: 0.08, d: 0.62, color: light },
    { x: 0.48, y: 0.51, z: 0, w: 0.54, h: 0.08, d: 0.62, color: light },
    // Cabin with a roof and dark pillars.
    { x: 0, y: 0.61, z: 0, w: 0.78, h: 0.3, d: 0.62, color },
    { x: 0, y: 0.78, z: 0, w: 0.72, h: 0.08, d: 0.58, color: light },
    { x: -0.22, y: 0.62, z: 0.315, w: 0.44, h: 0.22, d: 0.02, color: glass },
    { x: -0.22, y: 0.62, z: -0.315, w: 0.44, h: 0.22, d: 0.02, color: glass },
    { x: 0.24, y: 0.62, z: 0.315, w: 0.28, h: 0.22, d: 0.02, color: glass },
    { x: 0.24, y: 0.62, z: -0.315, w: 0.28, h: 0.22, d: 0.02, color: glass },
    { x: -0.4, y: 0.64, z: 0, w: 0.04, h: 0.24, d: 0.52, color: glassLight },
    { x: 0.4, y: 0.64, z: 0, w: 0.04, h: 0.24, d: 0.52, color: glass },
    // Mirrors, side stripe and door seam.
    { x: -0.38, y: 0.56, z: 0.39, w: 0.1, h: 0.06, d: 0.1, color: dark },
    { x: -0.38, y: 0.56, z: -0.39, w: 0.1, h: 0.06, d: 0.1, color: dark },
    { x: 0.08, y: 0.24, z: 0.35, w: 0.88, h: 0.05, d: 0.02, color: light },
    { x: 0.08, y: 0.24, z: -0.35, w: 0.88, h: 0.05, d: 0.02, color: light },
    { x: 0.02, y: 0.38, z: 0.345, w: 0.02, h: 0.2, d: 0.02, color: dark },
    { x: 0.02, y: 0.38, z: -0.345, w: 0.02, h: 0.2, d: 0.02, color: dark },
    // Wheels with pale hubs.
    { x: -0.5, y: 0.14, z: 0.36, w: 0.28, h: 0.28, d: 0.12, color: INK },
    { x: 0.5, y: 0.14, z: 0.36, w: 0.28, h: 0.28, d: 0.12, color: INK },
    { x: -0.5, y: 0.14, z: -0.36, w: 0.28, h: 0.28, d: 0.12, color: INK },
    { x: 0.5, y: 0.14, z: -0.36, w: 0.28, h: 0.28, d: 0.12, color: INK },
    { x: -0.5, y: 0.14, z: 0.425, w: 0.12, h: 0.12, d: 0.02, color: 0xb8c0c4 },
    { x: 0.5, y: 0.14, z: 0.425, w: 0.12, h: 0.12, d: 0.02, color: 0xb8c0c4 },
    { x: -0.5, y: 0.14, z: -0.425, w: 0.12, h: 0.12, d: 0.02, color: 0xb8c0c4 },
    { x: 0.5, y: 0.14, z: -0.425, w: 0.12, h: 0.12, d: 0.02, color: 0xb8c0c4 },
    // Headlights, taillights and a little plate.
    { x: -0.79, y: 0.37, z: 0.22, w: 0.04, h: 0.11, d: 0.14, color: 0xffe27a },
    { x: -0.79, y: 0.37, z: -0.22, w: 0.04, h: 0.11, d: 0.14, color: 0xffe27a },
    { x: 0.79, y: 0.37, z: 0.22, w: 0.04, h: 0.1, d: 0.14, color: 0xe84a3f },
    { x: 0.79, y: 0.37, z: -0.22, w: 0.04, h: 0.1, d: 0.14, color: 0xe84a3f },
    { x: 0.805, y: 0.28, z: 0, w: 0.02, h: 0.08, d: 0.2, color: 0xf4f0dc },
  ];
}

function logBoxes(length: number): VoxelBox[] {
  return [
    { x: 0, y: 0.19, z: 0, w: length, h: 0.24, d: 0.5, color: TRUNK },
    { x: -length / 2, y: 0.19, z: 0, w: 0.08, h: 0.27, d: 0.53, color: TRUNK_DARK },
    { x: length / 2, y: 0.19, z: 0, w: 0.08, h: 0.27, d: 0.53, color: TRUNK_DARK },
    { x: 0, y: 0.315, z: 0, w: length * 0.62, h: 0.02, d: 0.1, color: tone(TRUNK, 1.18) },
    { x: length * 0.18, y: 0.32, z: 0.12, w: length * 0.22, h: 0.02, d: 0.06, color: TRUNK_DARK },
  ];
}

function flowerBoxes(variant: number): VoxelBox[] {
  const petal = FLOWERS[variant % FLOWERS.length] ?? FLOWERS[0];

  return [
    { x: 0, y: 0.1, z: 0, w: 0.035, h: 0.2, d: 0.035, color: 0x4b9b3d },
    { x: 0, y: 0.23, z: 0, w: 0.14, h: 0.08, d: 0.14, color: petal },
    { x: 0, y: 0.24, z: 0, w: 0.05, h: 0.05, d: 0.15, color: tone(petal, 0.86) },
  ];
}

/**
 * A chunky toy train. The nose points toward -x so the renderer can use the
 * same direction convention as cars. Length is the collision footprint, so
 * the body fills it without surprising the player with a longer visual.
 */
function trainBoxes(length: number): VoxelBox[] {
  const body = 0x3f6d8f;
  const bodyDark = tone(body, 0.72);
  const roof = 0x2f526d;
  const window = 0xcdeeff;
  const stripe = 0xffe47a;
  const boxes: VoxelBox[] = [
    { x: 0, y: 0.46, z: 0, w: length, h: 0.5, d: 0.9, color: body },
    { x: 0, y: 0.2, z: 0, w: length, h: 0.18, d: 0.82, color: bodyDark },
    { x: 0, y: 0.78, z: 0, w: length * 0.97, h: 0.14, d: 0.82, color: roof },
    { x: 0, y: 0.5, z: 0.455, w: length * 0.94, h: 0.1, d: 0.03, color: stripe },
    { x: 0, y: 0.5, z: -0.455, w: length * 0.94, h: 0.1, d: 0.03, color: stripe },
  ];

  // Cab windows down both sides, spaced evenly so the length always reads.
  const panes = Math.max(3, Math.floor(length / 1.6));
  for (let i = 0; i < panes; i += 1) {
    const x = -length / 2 + 0.9 + (i + 0.5) * ((length - 1.8) / panes);
    boxes.push({ x, y: 0.62, z: 0.456, w: 0.5, h: 0.2, d: 0.03, color: window });
    boxes.push({ x, y: 0.62, z: -0.456, w: 0.5, h: 0.2, d: 0.03, color: window });
  }

  boxes.push(
    // Cowcatcher, headlight and tail light.
    { x: -length / 2 - 0.1, y: 0.14, z: 0, w: 0.26, h: 0.2, d: 0.9, color: 0x26332d },
    { x: -length / 2 - 0.02, y: 0.5, z: 0.28, w: 0.04, h: 0.14, d: 0.16, color: 0xfff0a8 },
    { x: -length / 2 - 0.02, y: 0.5, z: -0.28, w: 0.04, h: 0.14, d: 0.16, color: 0xfff0a8 },
    { x: length / 2 + 0.02, y: 0.45, z: 0.28, w: 0.04, h: 0.12, d: 0.14, color: 0xe84a3f },
    { x: length / 2 + 0.02, y: 0.45, z: -0.28, w: 0.04, h: 0.12, d: 0.14, color: 0xe84a3f },
  );

  // Wheels along the skirt.
  const axles = Math.max(2, Math.floor(length / 2.4));
  for (let i = 0; i < axles; i += 1) {
    const x = -length / 2 + 0.8 + (i * (length - 1.6)) / Math.max(1, axles - 1);
    boxes.push(
      { x, y: 0.12, z: 0.4, w: 0.34, h: 0.24, d: 0.12, color: INK },
      { x, y: 0.12, z: -0.4, w: 0.34, h: 0.24, d: 0.12, color: INK },
    );
  }

  return boxes;
}

/**
 * The eagle is deliberately goofy: a round brown body, a pale head, wide
 * wings and oversized orange feet. It must read as a comic rule, not a scare.
 */
function eagleBoxes(): VoxelBox[] {
  const brown = 0x7a4b2a;
  const brownLight = 0x9a6236;
  const cream = 0xfff4d6;

  return [
    { x: 0, y: 0.8, z: 0.05, w: 0.62, h: 0.62, d: 0.72, color: brown },
    { x: 0, y: 0.62, z: 0.32, w: 0.46, h: 0.34, d: 0.26, color: brownLight },
    { x: 0, y: 1.2, z: -0.12, w: 0.5, h: 0.46, d: 0.5, color: cream },
    { x: 0, y: 1.16, z: -0.38, w: 0.2, h: 0.16, d: 0.16, color: ORANGE },
    { x: -0.15, y: 1.28, z: -0.36, w: 0.07, h: 0.08, d: 0.04, color: INK },
    { x: 0.15, y: 1.28, z: -0.36, w: 0.07, h: 0.08, d: 0.04, color: INK },
    { x: -0.68, y: 0.92, z: 0.04, w: 0.74, h: 0.16, d: 0.54, color: brownLight },
    { x: 0.68, y: 0.92, z: 0.04, w: 0.74, h: 0.16, d: 0.54, color: brownLight },
    { x: -1.02, y: 0.92, z: 0.1, w: 0.34, h: 0.13, d: 0.4, color: brown },
    { x: 1.02, y: 0.92, z: 0.1, w: 0.34, h: 0.13, d: 0.4, color: brown },
    { x: -0.18, y: 0.42, z: 0.12, w: 0.12, h: 0.24, d: 0.12, color: ORANGE },
    { x: 0.18, y: 0.42, z: 0.12, w: 0.12, h: 0.24, d: 0.12, color: ORANGE },
    { x: -0.18, y: 0.34, z: -0.02, w: 0.2, h: 0.06, d: 0.18, color: 0xffd84d },
    { x: 0.18, y: 0.34, z: -0.02, w: 0.2, h: 0.06, d: 0.18, color: 0xffd84d },
    { x: 0, y: 0.58, z: 0.46, w: 0.34, h: 0.3, d: 0.12, color: 0xe3cfa4 },
  ];
}

/**
 * A chunky crossing post: base, pole and a small white/red crossbuck. The lamp
 * is a separate mesh so its material can switch between on and off.
 */
function warningPostBoxes(): VoxelBox[] {
  const post = 0x3b4147;
  const white = 0xfff4d6;

  return [
    { x: 0, y: 0.07, z: 0, w: 0.4, h: 0.14, d: 0.32, color: 0x2e3439 },
    { x: 0, y: 0.56, z: 0, w: 0.1, h: 1.02, d: 0.1, color: post },
    { x: 0, y: 0.83, z: 0.02, w: 0.5, h: 0.12, d: 0.07, color: white },
    { x: -0.22, y: 0.83, z: 0.02, w: 0.1, h: 0.12, d: 0.075, color: 0xe84a3f },
    { x: 0.22, y: 0.83, z: 0.02, w: 0.1, h: 0.12, d: 0.075, color: 0xe84a3f },
    { x: 0, y: 0.7, z: 0, w: 0.24, h: 0.06, d: 0.08, color: post },
  ];
}

/**
 * A chunky gold coin. Three stacked boxes give it an octagonal silhouette so
 * it still reads while spinning, with a pale face and a darker rim.
 */
function coinBoxes(): VoxelBox[] {
  const gold = 0xf6c33c;
  const goldLight = 0xffe9a3;
  const goldDark = 0xc9952a;

  return [
    { x: 0, y: 0, z: 0, w: 0.28, h: 0.44, d: 0.15, color: gold },
    { x: 0, y: 0, z: 0, w: 0.44, h: 0.28, d: 0.15, color: gold },
    { x: 0, y: 0, z: 0, w: 0.38, h: 0.38, d: 0.16, color: gold },
    { x: 0, y: 0, z: -0.085, w: 0.24, h: 0.24, d: 0.02, color: goldLight },
    { x: 0, y: 0, z: 0.085, w: 0.24, h: 0.24, d: 0.02, color: goldDark },
    { x: 0.16, y: 0, z: 0, w: 0.05, h: 0.3, d: 0.17, color: goldDark },
    { x: -0.16, y: 0, z: 0, w: 0.05, h: 0.3, d: 0.17, color: goldDark },
  ];
}

export function characterMesh(
  id: CharacterId = DEFAULT_CHARACTER_ID,
): THREE.Mesh {
  return meshFor(`character:${id}`, () => characterBoxes(id));
}

export function coinMesh(): THREE.Mesh {
  return meshFor("coin", coinBoxes);
}

export function treeGeometry(variant: number): THREE.BufferGeometry {
  return geometryFor(`tree:${variant}`, () => treeBoxes(variant));
}

export function bushGeometry(): THREE.BufferGeometry {
  return geometryFor("bush", bushBoxes);
}

export function rockGeometry(): THREE.BufferGeometry {
  return geometryFor("rock", rockBoxes);
}

export function flowerGeometry(variant: number): THREE.BufferGeometry {
  return geometryFor(`flower:${variant}`, () => flowerBoxes(variant));
}

export function treeMesh(variant: number): THREE.Mesh {
  return meshFor(`tree:${variant}`, () => treeBoxes(variant));
}

export function bushMesh(): THREE.Mesh {
  return meshFor("bush", bushBoxes);
}

export function rockMesh(): THREE.Mesh {
  return meshFor("rock", rockBoxes);
}

export function carMesh(variant: number): THREE.Mesh {
  return meshFor(`car:${variant}`, () => carBoxes(variant));
}

export function logMesh(length: number): THREE.Mesh {
  const rounded = Math.round(length * 10) / 10;
  return meshFor(`log:${rounded}`, () => logBoxes(rounded));
}

export function flowerMesh(variant: number): THREE.Mesh {
  return meshFor(`flower:${variant}`, () => flowerBoxes(variant));
}

export function trainMesh(length: number): THREE.Mesh {
  const rounded = Math.round(length * 10) / 10;
  return meshFor(`train:${rounded}`, () => trainBoxes(rounded));
}

export function warningPostMesh(): THREE.Mesh {
  return meshFor("rail-post", warningPostBoxes);
}

export function eagleMesh(): THREE.Mesh {
  return meshFor("eagle", eagleBoxes);
}
