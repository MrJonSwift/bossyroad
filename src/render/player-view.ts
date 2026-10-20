import * as THREE from "three";
import {
  DEFAULT_CHARACTER_ID,
  type CharacterId,
} from "../characters/catalogue";
import type { DeathCause, Direction, PlayerPose, RowKind } from "../sim/types";
import { DustPool } from "./dust";
import { characterMesh } from "./models";
import { makeShadowMaterial } from "./shadow";

const YAW: Record<Direction, number> = {
  forward: 0,
  left: Math.PI / 2,
  back: Math.PI,
  right: -Math.PI / 2,
};

const GROUND_DUST: Record<RowKind | "log", number> = {
  grass: 0xeadfb8,
  road: 0xdfe3e6,
  rail: 0xe5d8c1,
  river: 0xeafcff,
  log: 0xc09260,
};

function shortestAngle(from: number, to: number): number {
  let delta = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return delta;
}

/**
 * A small ring of foam boxes for the drowning beat. It uses its own material
 * so opacity can fade without touching shared scene materials.
 */
function makeSplash(): { group: THREE.Group; material: THREE.MeshBasicMaterial } {
  const material = new THREE.MeshBasicMaterial({
    color: 0xeafcff,
    transparent: true,
    opacity: 0.9,
  });
  const group = new THREE.Group();
  const ring = new THREE.BoxGeometry(1, 0.025, 0.16);

  for (let i = 0; i < 6; i += 1) {
    const foam = new THREE.Mesh(ring, material);
    const angle = (i / 6) * Math.PI * 2;
    foam.position.set(Math.cos(angle) * 0.46, 0.035, Math.sin(angle) * 0.32);
    foam.rotation.y = -angle;
    group.add(foam);
  }

  group.visible = false;
  return { group, material };
}

export class PlayerView {
  private readonly group = new THREE.Group();
  private model = characterMesh(DEFAULT_CHARACTER_ID);
  private characterId: CharacterId = DEFAULT_CHARACTER_ID;
  private readonly shadowMaterial = makeShadowMaterial(0.62);
  private readonly shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    this.shadowMaterial,
  );
  private readonly splash = makeSplash();
  private readonly dust: DustPool;
  private yaw = 0;
  private reducedMotion = false;
  private wasHopping = false;
  private wasDying = false;
  private takeoff = 0;
  private landSquash = 0;

  constructor(scene: THREE.Scene) {
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.014;
    this.shadow.renderOrder = 2;

    this.group.add(this.model, this.shadow, this.splash.group);
    scene.add(this.group);
    this.dust = new DustPool(scene);
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  /**
   * Swap the cosmetic model without touching the group, shadow, splash or
   * dust. Geometries are cached by character id, so re-equipping is cheap.
   */
  setCharacter(id: CharacterId): void {
    if (id === this.characterId) {
      return;
    }

    this.characterId = id;
    this.group.remove(this.model);
    this.model = characterMesh(id);
    this.group.add(this.model);
  }

  update(
    pose: PlayerPose,
    time: number,
    dt: number,
    deathT = 0,
    deathCause: DeathCause | null = null,
    ground: RowKind | "log" = "grass",
  ): void {
    this.group.position.set(pose.x, 0, -pose.z);

    const drowning = deathCause === "drown" && deathT > 0;
    const caught = deathCause === "eagle" && deathT > 0;
    const dying = deathT > 0 && !drowning;
    const motion = this.reducedMotion ? 0.28 : 1;
    const startedHop = pose.hopping && !this.wasHopping;
    const landed = !pose.hopping && this.wasHopping;
    const startedDeath = dying && !this.wasDying;

    if (startedHop) {
      this.takeoff = 1;
      this.dust.burst(
        pose.x,
        pose.z,
        this.reducedMotion ? 1 : 3,
        GROUND_DUST[ground],
        0.55,
      );
    }

    if (landed) {
      this.landSquash = 1;
      if (ground !== "river") {
        this.dust.burst(
          pose.x,
          pose.z,
          this.reducedMotion ? 2 : 7,
          GROUND_DUST[ground],
          1,
        );
      }
    }

    if (startedDeath) {
      this.landSquash = 1;
      this.dust.burst(
        pose.x,
        pose.z,
        this.reducedMotion ? 2 : 9,
        GROUND_DUST[ground],
        1.25,
      );
    }

    this.takeoff = Math.max(0, this.takeoff - dt * 7.5);
    this.landSquash = Math.max(0, this.landSquash - dt * 6.5);
    this.dust.update(dt);

    const stretch = pose.hopping ? Math.sin(Math.PI * pose.hopT) : 0;
    const takeoffStretch = this.takeoff * 0.18;
    const squash = this.landSquash * 0.2;
    const bob =
      pose.hopping || this.reducedMotion ? 0 : Math.sin(time * 2.4) * 0.012;
    const lift = caught ? Math.max(0, deathT - 0.4) * 1.6 : 0;

    this.model.position.y =
      pose.y + bob - (drowning ? deathT * 0.5 : 0) + lift;

    if (drowning) {
      // Sink vertically instead of tipping over; the splash does the talking.
      this.model.scale.set(1 + deathT * 0.18, 1 - deathT * 0.55, 1 + deathT * 0.18);
      this.model.rotation.z = 0;
    } else if (dying) {
      this.model.scale.set(
        1 + deathT * 0.5 - squash * motion * 0.4,
        1 - deathT * 0.66 + squash * motion,
        1 + deathT * 0.5 - squash * motion * 0.4,
      );
      this.model.rotation.z = deathT * 0.92 * motion;
    } else {
      const y = 1 + (stretch * 0.16 + takeoffStretch - squash) * motion;
      const xz =
        1 - (stretch * 0.07 + takeoffStretch * 0.5) * motion + squash * 0.85 * motion;
      this.model.scale.set(xz, y, xz);
      this.model.rotation.z = 0;
    }

    const targetYaw = YAW[pose.facing];
    this.yaw += shortestAngle(this.yaw, targetYaw) * Math.min(1, dt * 18);
    this.model.rotation.y = this.yaw;

    const air = Math.min(1, pose.y / 0.55);
    this.shadow.scale.set(
      0.92 - air * 0.18 + this.landSquash * 0.12 * motion,
      0.72 - air * 0.15 + this.landSquash * 0.1 * motion,
      1,
    );
    this.shadowMaterial.opacity = drowning ? 0 : 0.62 - air * 0.28;

    this.splash.group.visible = drowning;
    if (drowning) {
      const scale = 0.6 + deathT * 2.4;
      this.splash.group.scale.set(scale, 1, scale);
      this.splash.group.rotation.y = time * 2.6;
      this.splash.material.opacity = Math.max(0, 0.9 - deathT * 0.7);
    }

    this.wasHopping = pose.hopping;
    this.wasDying = dying;
  }
}
