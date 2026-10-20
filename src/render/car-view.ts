import * as THREE from "three";
import type { CarState } from "../sim/types";
import { carMesh } from "./models";
import { makeShadowMaterial } from "./shadow";

interface CarEntry {
  group: THREE.Group;
  mesh: THREE.Mesh;
  variant: number;
}

/**
 * Projects the simulation's cars onto the road. Meshes are keyed by car id so
 * a restart reuses them; only positions and facing change per frame.
 */
export class CarView {
  private readonly entries = new Map<number, CarEntry>();
  private readonly shadowGeometry = new THREE.PlaneGeometry(1, 1);
  private readonly shadowMaterial = makeShadowMaterial(0.58);

  constructor(private readonly scene: THREE.Scene) {}

  private createEntry(car: CarState): CarEntry {
    const group = new THREE.Group();
    const mesh = carMesh(car.variant);
    mesh.position.y = 0.02;

    const shadow = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    shadow.scale.set(1.9, 0.92, 1);
    shadow.renderOrder = 1;

    group.add(mesh, shadow);
    this.scene.add(group);

    return { group, mesh, variant: car.variant };
  }

  update(cars: readonly CarState[]): void {
    const live = new Set<number>();

    for (const car of cars) {
      live.add(car.id);
      let entry = this.entries.get(car.id);

      if (!entry || entry.variant !== car.variant) {
        if (entry) {
          this.scene.remove(entry.group);
        }
        entry = this.createEntry(car);
        this.entries.set(car.id, entry);
      }

      entry.group.position.set(car.x, 0, -car.z);
      // The model's nose points toward -x, so right-moving cars turn around.
      entry.mesh.rotation.y = car.dir === 1 ? Math.PI : 0;
    }

    for (const [id, entry] of this.entries) {
      if (!live.has(id)) {
        this.scene.remove(entry.group);
        this.entries.delete(id);
      }
    }
  }
}
