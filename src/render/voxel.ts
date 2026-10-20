import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export interface VoxelBox {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: number;
}

/**
 * BoxGeometry face order: +x, -x, +y, -y, +z, -z.
 * A little baked-in face shading keeps the voxel forms readable even when the
 * player is standing in a flat pool of light.
 */
const FACE_SHADE = [0.97, 0.84, 1.0, 0.66, 0.91, 0.8] as const;

export function buildVoxelGeometry(boxes: readonly VoxelBox[]): THREE.BufferGeometry {
  const parts = boxes.map((box) => {
    const geometry = new THREE.BoxGeometry(box.w, box.h, box.d).toNonIndexed();
    geometry.translate(box.x, box.y, box.z);

    const base = new THREE.Color(box.color);
    const colors = new Float32Array(geometry.attributes.position.count * 3);

    for (let i = 0; i < geometry.attributes.position.count; i += 1) {
      const face = Math.floor(i / 6);
      const shade = FACE_SHADE[face] ?? 1;
      colors[i * 3] = Math.min(1, base.r * shade);
      colors[i * 3 + 1] = Math.min(1, base.g * shade);
      colors[i * 3 + 2] = Math.min(1, base.b * shade);
    }

    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geometry;
  });

  const merged = mergeGeometries(parts, false);
  for (const part of parts) {
    part.dispose();
  }

  if (!merged) {
    throw new Error("Could not merge voxel geometry");
  }

  merged.computeBoundingSphere();
  return merged;
}
