import { type CharacterId } from "./catalogue";
import { characterBoxes } from "./models";
import type { VoxelBox } from "../render/voxel";

/**
 * Draws a character into a small 2D canvas as an isometric voxel portrait.
 *
 * This deliberately does not create a WebGL context per card: the shop shows
 * eight portraits, and eight contexts would be wasteful on a phone. The same
 * box lists that build the 3D models are projected here, so a portrait can
 * never drift away from the model the player actually controls.
 */

const YAW = 0.62;
const PITCH = 0.36;
const LIGHT = normalise(-0.38, 0.78, -0.5);

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Face {
  indices: readonly [number, number, number, number];
  normal: Vec3;
}

const FACES: readonly Face[] = [
  { indices: [1, 2, 6, 5], normal: { x: 1, y: 0, z: 0 } },
  { indices: [0, 4, 7, 3], normal: { x: -1, y: 0, z: 0 } },
  { indices: [3, 7, 6, 2], normal: { x: 0, y: 1, z: 0 } },
  { indices: [0, 1, 5, 4], normal: { x: 0, y: -1, z: 0 } },
  { indices: [4, 5, 6, 7], normal: { x: 0, y: 0, z: 1 } },
  { indices: [0, 3, 2, 1], normal: { x: 0, y: 0, z: -1 } },
];

function normalise(x: number, y: number, z: number): Vec3 {
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

function rotate(x: number, y: number, z: number): Vec3 {
  const cosYaw = Math.cos(YAW);
  const sinYaw = Math.sin(YAW);
  const x1 = x * cosYaw + z * sinYaw;
  const z1 = -x * sinYaw + z * cosYaw;
  const cosPitch = Math.cos(PITCH);
  const sinPitch = Math.sin(PITCH);

  return {
    x: x1,
    y: y * cosPitch + z1 * sinPitch,
    z: -y * sinPitch + z1 * cosPitch,
  };
}

function boxCorners(box: VoxelBox): Vec3[] {
  const hw = box.w / 2;
  const hh = box.h / 2;
  const hd = box.d / 2;
  const x = box.x;
  const y = box.y;
  const z = box.z;

  return [
    { x: x - hw, y: y - hh, z: z - hd },
    { x: x + hw, y: y - hh, z: z - hd },
    { x: x + hw, y: y + hh, z: z - hd },
    { x: x - hw, y: y + hh, z: z - hd },
    { x: x - hw, y: y - hh, z: z + hd },
    { x: x + hw, y: y - hh, z: z + hd },
    { x: x + hw, y: y + hh, z: z + hd },
    { x: x - hw, y: y + hh, z: z + hd },
  ];
}

function channels(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

/** Draws one character, scaled to fit `size` square CSS pixels. */
export function drawPortrait(
  canvas: HTMLCanvasElement,
  id: CharacterId,
  size = 144,
): void {
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  if (canvas.width !== size || canvas.height !== size) {
    canvas.width = size;
    canvas.height = size;
  }

  context.clearRect(0, 0, size, size);

  const boxes = characterBoxes(id);
  const projected = boxes.map((box) => {
    const corners = boxCorners(box).map((corner) => rotate(corner.x, corner.y, corner.z));
    return { box, corners };
  });

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const { corners } of projected) {
    for (const corner of corners) {
      minX = Math.min(minX, corner.x);
      maxX = Math.max(maxX, corner.x);
      minY = Math.min(minY, -corner.y);
      maxY = Math.max(maxY, -corner.y);
    }
  }

  const inset = 0.14;
  const scale = Math.min(
    (size * (1 - inset * 2)) / Math.max(0.001, maxX - minX),
    (size * (1 - inset * 2)) / Math.max(0.001, maxY - minY),
  );
  const offsetX = size / 2 - ((minX + maxX) / 2) * scale;
  const offsetY = size / 2 - ((minY + maxY) / 2) * scale;

  // Soft contact shadow so the model sits in the card instead of floating.
  const shadowY = offsetY + maxY * scale - 2;
  context.fillStyle = "rgba(18, 32, 24, 0.2)";
  context.beginPath();
  context.ellipse(
    offsetX + ((minX + maxX) / 2) * scale,
    shadowY,
    (maxX - minX) * scale * 0.34,
    Math.max(2, (maxX - minX) * scale * 0.08),
    0,
    0,
    Math.PI * 2,
  );
  context.fill();

  // Collect every visible face, then paint back to front. A character is only
  // a few dozen boxes, so a simple painter's sort is cheap and reliable.
  const faces: Array<{ points: Array<[number, number]>; depth: number; color: string }> = [];

  for (const { box, corners } of projected) {
    const [r, g, b] = channels(box.color);

    for (const face of FACES) {
      const normal = rotate(face.normal.x, face.normal.y, face.normal.z);

      // The portrait camera looks along -z after the rotation.
      if (normal.z >= 0) {
        continue;
      }

      const points = face.indices.map((index) => {
        const corner = corners[index] ?? { x: 0, y: 0, z: 0 };
        return [
          offsetX + corner.x * scale,
          offsetY + -corner.y * scale,
        ] as [number, number];
      });

      const depth =
        face.indices.reduce((sum, index) => sum + (corners[index]?.z ?? 0), 0) / 4;
      const light = Math.max(0, normal.x * LIGHT.x + normal.y * LIGHT.y + normal.z * LIGHT.z);
      const amount = 0.62 + light * 0.42;

      faces.push({
        points,
        depth,
        color: `rgb(${Math.round(r * amount)} ${Math.round(g * amount)} ${Math.round(b * amount)})`,
      });
    }
  }

  faces.sort((a, b) => b.depth - a.depth);

  for (const face of faces) {
    context.fillStyle = face.color;
    context.beginPath();
    const [first, ...rest] = face.points;

    if (!first) {
      continue;
    }

    context.moveTo(first[0], first[1]);

    for (const point of rest) {
      context.lineTo(point[0], point[1]);
    }

    context.closePath();
    context.fill();
  }
}
