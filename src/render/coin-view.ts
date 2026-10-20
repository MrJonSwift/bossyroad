import * as THREE from "three";
import { COIN_HEIGHT } from "../sim/coins";
import type { CoinState } from "../sim/types";
import { coinMesh } from "./models";

interface CoinEntry {
  mesh: THREE.Mesh;
  collected: boolean;
  /** Seconds since the pickup poof started. */
  pop: number;
  phase: number;
}

/** How long a collected coin pops before it disappears. */
const POP_SECONDS = 0.22;

/**
 * Projects coin pickups. Meshes are keyed by coin id and hover above their
 * row; a collected coin does a short scale-and-lift pop, then is removed.
 * The simulation owns `collected`; this view never collects anything itself.
 */
export class CoinView {
  private readonly entries = new Map<number, CoinEntry>();

  constructor(private readonly scene: THREE.Scene) {}

  update(coins: readonly CoinState[], time: number, dt: number): void {
    const live = new Set<number>();

    for (const coin of coins) {
      live.add(coin.id);
      let entry = this.entries.get(coin.id);

      if (!entry) {
        // A coin collected before the view existed needs no mesh at all.
        if (coin.collected) {
          continue;
        }

        const mesh = coinMesh();
        mesh.position.set(coin.x, COIN_HEIGHT, -coin.z);
        this.scene.add(mesh);
        entry = {
          mesh,
          collected: false,
          pop: 0,
          phase: (coin.id % 17) * 0.37,
        };
        this.entries.set(coin.id, entry);
      }

      if (coin.collected) {
        entry.collected = true;
      }

      if (entry.collected) {
        entry.pop += dt;
        const t = Math.min(1, entry.pop / POP_SECONDS);
        entry.mesh.scale.setScalar(1 + t * 0.85);
        entry.mesh.position.y = COIN_HEIGHT + t * 0.55;
        entry.mesh.visible = t < 1;
        continue;
      }

      entry.mesh.position.set(
        coin.x,
        COIN_HEIGHT + Math.sin(time * 2.6 + entry.phase) * 0.045,
        -coin.z,
      );
      entry.mesh.rotation.y = time * 2.4 + entry.phase;
    }

    for (const [id, entry] of this.entries) {
      if (!live.has(id)) {
        this.scene.remove(entry.mesh);
        this.entries.delete(id);
      }
    }
  }
}
