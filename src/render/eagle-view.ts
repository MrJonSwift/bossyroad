import * as THREE from "three";
import { DEATH_SECONDS } from "../sim/game";
import type { GameState, PlayerPose } from "../sim/types";
import { eagleMesh } from "./models";

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * The eagle is a rule, so its animation is deterministic: it dives from above
 * and behind the player, grabs, then lifts. It is shown through the dying beat
 * and stays perched for the game-over snapshot.
 */
export class EagleView {
  private readonly group = new THREE.Group();
  private readonly model = eagleMesh();

  constructor(scene: THREE.Scene) {
    this.model.rotation.order = "YXZ";
    this.group.add(this.model);
    this.group.visible = false;
    scene.add(this.group);
  }

  update(state: GameState, pose: PlayerPose, time: number): void {
    const eagle = state.deathCause === "eagle";

    if (!eagle || (state.phase !== "dying" && state.phase !== "gameover")) {
      this.group.visible = false;
      return;
    }

    this.group.visible = true;

    const t =
      state.phase === "gameover"
        ? 1
        : Math.min(1, Math.max(0, state.phaseTime / DEATH_SECONDS));
    const dive = smoothstep(Math.min(1, t / 0.45));
    const lift = Math.max(0, (t - 0.45) / 0.55);

    // Start high and ahead of the player, where the camera sees the face and
    // feet during the dive, then drop straight onto the chicken.
    const startX = pose.x + 2.6;
    const startY = 7.2;
    const startZ = -pose.z - 5.5;
    const grabX = pose.x;
    const grabY = 1.15;
    const grabZ = -pose.z;

    const x = startX + (grabX - startX) * dive;
    const y = startY + (grabY - startY) * dive + lift * 0.9 + Math.sin(time * 3) * 0.04;
    const z = startZ + (grabZ - startZ) * dive;

    this.group.position.set(x, y, z);
    // The model faces -z; turn it toward the player/camera as it dives.
    this.group.rotation.y = Math.PI + Math.PI * 0.12 * (1 - dive);
    this.model.rotation.z = -0.5 * (1 - dive) + Math.sin(time * 2.2) * 0.04;
    this.model.rotation.x = -0.35 * (1 - dive);
  }
}
