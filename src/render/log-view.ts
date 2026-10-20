import * as THREE from "three";
import type { LogState } from "../sim/types";
import { logMesh } from "./models";
import { makeShadowMaterial } from "./shadow";

interface LogEntry {
  group: THREE.Group;
  mesh: THREE.Mesh;
  length: number;
  phase: number;
}

/**
 * Projects the simulation's moving logs onto the river. Meshes are keyed by
 * log id so a chain can recycle rows without leaking GPU objects.
 */
export class LogView {
  private readonly entries = new Map<number, LogEntry>();
  private readonly shadowGeometry = new THREE.PlaneGeometry(1, 1);
  private readonly shadowMaterial = makeShadowMaterial(0.55);

  constructor(private readonly scene: THREE.Scene) {}

  private createEntry(log: LogState): LogEntry {
    const group = new THREE.Group();
    const mesh = logMesh(log.length);
    mesh.position.y = 0.02;

    const shadow = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.024;
    shadow.scale.set(log.length * 0.92, 0.62, 1);
    shadow.renderOrder = 1;

    group.add(mesh, shadow);
    this.scene.add(group);

    return {
      group,
      mesh,
      length: log.length,
      phase: (log.z * 1.7 + log.id) % (Math.PI * 2),
    };
  }

  update(logs: readonly LogState[], time: number): void {
    const live = new Set<number>();

    for (const log of logs) {
      live.add(log.id);
      let entry = this.entries.get(log.id);

      if (!entry || entry.length !== log.length) {
        if (entry) {
          this.scene.remove(entry.group);
        }
        entry = this.createEntry(log);
        this.entries.set(log.id, entry);
      }

      entry.group.position.set(log.x, 0, -log.z);
      entry.mesh.position.y = 0.02 + Math.sin(time * 1.4 + entry.phase) * 0.012;
    }

    for (const [id, entry] of this.entries) {
      if (!live.has(id)) {
        this.scene.remove(entry.group);
        this.entries.delete(id);
      }
    }
  }
}
