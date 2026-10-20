import * as THREE from "three";
import { warningLightsOn } from "../sim/rails";
import type { RailState } from "../sim/types";
import { trainMesh, warningPostMesh } from "./models";

const LAMP_ON = 0xff4438;
const LAMP_OFF = 0x5a1b18;
const LAMP_GEOMETRY = new THREE.BoxGeometry(0.26, 0.24, 0.26);
const POST_X = 4.82;

interface RailEntry {
  group: THREE.Group;
  train: THREE.Mesh;
  trainLength: number;
  lamps: [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial];
  previousPhase: RailState["phase"];
}

/**
 * Rail warning lights and trains. The timetables live in the simulation; this
 * view only projects them and fires the bell when a nearby row starts warning.
 */
export class RailView {
  private readonly entries = new Map<number, RailEntry>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly onWarning?: (z: number) => void,
  ) {}

  private createEntry(rail: RailState): RailEntry {
    const group = new THREE.Group();
    const z = -rail.z;

    for (const x of [-POST_X, POST_X]) {
      const post = warningPostMesh();
      post.position.set(x, 0, z + 0.34);
      group.add(post);
    }

    const left = new THREE.MeshBasicMaterial({ color: LAMP_OFF });
    const right = new THREE.MeshBasicMaterial({ color: LAMP_OFF });
    const leftLamp = new THREE.Mesh(LAMP_GEOMETRY, left);
    const rightLamp = new THREE.Mesh(LAMP_GEOMETRY, right);
    leftLamp.position.set(-POST_X, 1.08, z + 0.34);
    rightLamp.position.set(POST_X, 1.08, z + 0.34);
    group.add(leftLamp, rightLamp);

    const train = trainMesh(rail.length);
    // Posts bake in the row depth above; the train does not, and without this z
    // every train in the world would cross the start row instead of its own.
    train.position.set(0, 0.02, z);
    train.visible = false;
    group.add(train);

    this.scene.add(group);

    return {
      group,
      train,
      trainLength: rail.length,
      lamps: [left, right],
      previousPhase: rail.phase,
    };
  }

  update(rails: readonly RailState[], time: number, playerZ: number): void {
    const live = new Set<number>();

    for (const rail of rails) {
      live.add(rail.z);
      let entry = this.entries.get(rail.z);

      if (!entry || entry.trainLength !== rail.length) {
        if (entry) {
          this.removeEntry(rail.z, entry);
        }
        entry = this.createEntry(rail);
        this.entries.set(rail.z, entry);
      }

      if (
        entry.previousPhase !== "warning" &&
        rail.phase === "warning" &&
        Math.abs(rail.z - playerZ) <= 14
      ) {
        this.onWarning?.(rail.z);
      }
      entry.previousPhase = rail.phase;

      entry.train.visible = rail.phase === "crossing";
      entry.train.position.x = rail.x;
      // The model's nose points toward -x, so right-hand trains turn around.
      entry.train.rotation.y = rail.dir === 1 ? Math.PI : 0;

      entry.lamps[0].color.setHex(warningLightsOn(rail, 0, time) ? LAMP_ON : LAMP_OFF);
      entry.lamps[1].color.setHex(warningLightsOn(rail, 1, time) ? LAMP_ON : LAMP_OFF);
    }

    for (const [z, entry] of this.entries) {
      if (!live.has(z)) {
        this.removeEntry(z, entry);
      }
    }
  }

  private removeEntry(z: number, entry: RailEntry): void {
    this.scene.remove(entry.group);
    entry.lamps[0].dispose();
    entry.lamps[1].dispose();
    this.entries.delete(z);
  }
}
