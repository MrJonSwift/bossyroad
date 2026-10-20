import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { trainMesh } from "../src/render/models";
import { RailView } from "../src/render/rail-view";
import { createRailState, railHitsPlayer } from "../src/sim/rails";
import type { RailSpec, RailState } from "../src/sim/types";

function spec(overrides: Partial<RailSpec> = {}): RailSpec {
  return {
    dir: 1,
    speed: 10,
    length: 16,
    warnSeconds: 1.2,
    cooldownSeconds: 2,
    offset: 0,
    ...overrides,
  };
}

function crossingRail(z: number, x = 0): RailState {
  const rail = createRailState(z, spec());
  rail.timer = rail.warnSeconds + rail.crossSeconds / 2;
  rail.phase = "crossing";
  rail.x = x;
  rail.prevX = x;
  return rail;
}

/** The train geometry is cached and shared, so identity finds every train. */
function trainMeshes(scene: THREE.Scene, length: number): THREE.Mesh[] {
  const geometry = trainMesh(length).geometry;
  const found: THREE.Mesh[] = [];

  scene.traverse((object) => {
    if (object instanceof THREE.Mesh && object.geometry === geometry) {
      found.push(object);
    }
  });

  return found;
}

function worldZ(mesh: THREE.Mesh): number {
  return mesh.getWorldPosition(new THREE.Vector3()).z;
}

describe("train projection", () => {
  it("draws a crossing train on its own row, not the start line", () => {
    const scene = new THREE.Scene();
    const view = new RailView(scene);
    const rail = crossingRail(20);

    view.update([rail], 0, rail.z);
    scene.updateMatrixWorld(true);

    const [train] = trainMeshes(scene, rail.length);
    expect(train).toBeDefined();
    expect(train?.visible).toBe(true);
    expect(worldZ(train!)).toBeCloseTo(-rail.z, 5);
    expect(worldZ(train!)).not.toBeCloseTo(0, 5);
  });

  it("keeps nearby rail rows' trains on their own depths", () => {
    const scene = new THREE.Scene();
    const view = new RailView(scene);
    const front = crossingRail(20, -3);
    const back = crossingRail(27, 4);

    view.update([front, back], 0, front.z);
    scene.updateMatrixWorld(true);

    const trains = trainMeshes(scene, front.length)
      .map((mesh) => ({ x: mesh.position.x, z: worldZ(mesh) }))
      .sort((a, b) => a.x - b.x);

    expect(trains).toHaveLength(2);
    expect(trains[0]?.x).toBeCloseTo(-3);
    expect(trains[0]?.z).toBeCloseTo(-20);
    expect(trains[1]?.x).toBeCloseTo(4);
    expect(trains[1]?.z).toBeCloseTo(-27);
  });

  it("ties the drawn train's depth to the simulation's hit row", () => {
    const scene = new THREE.Scene();
    const view = new RailView(scene);
    const rail = crossingRail(20);

    view.update([rail], 0, rail.z);
    scene.updateMatrixWorld(true);

    const drawnRow = -worldZ(trainMeshes(scene, rail.length)[0]!);

    expect(drawnRow).toBe(20);
    expect(railHitsPlayer(rail, 0, drawnRow)).toBe(true);
    expect(railHitsPlayer(rail, 0, 0)).toBe(false);
  });
});
