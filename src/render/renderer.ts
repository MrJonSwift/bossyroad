import * as THREE from "three";
import type { CharacterId } from "../characters/catalogue";
import { playerPose } from "../sim/game";
import type { GameState, RowKind } from "../sim/types";
import { CarView } from "./car-view";
import { CoinView } from "./coin-view";
import { EagleView } from "./eagle-view";
import { LogView } from "./log-view";
import { PlayerView } from "./player-view";
import { RailView } from "./rail-view";
import { WorldView } from "./world-view";

const CAM_HEIGHT = 9.8;
const CAM_BACK = 13.2;
const LOOK_AHEAD = 2.2;
const LOOK_Y = 0.55;
const VIEW_WIDTH = 10.8;

function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

export interface RenderInfo {
  fov: number;
  calls: number;
  triangles: number;
}

export class GameRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 120);
  private readonly player: PlayerView;
  private readonly world: WorldView;
  private readonly cars: CarView;
  private readonly logs: LogView;
  private readonly rails: RailView;
  private readonly eagle: EagleView;
  private readonly coins: CoinView;
  private readonly lookTarget = new THREE.Vector3();
  private lookZ = 0;
  private size = { width: 1, height: 1 };
  private reducedMotion = false;

  constructor(
    private readonly container: HTMLElement,
    canvas: HTMLCanvasElement,
    state: GameState,
    onTrainWarning?: () => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene.fog = new THREE.Fog(0xe6f8ff, 26, 95);

    const hemisphere = new THREE.HemisphereLight(0xdff4ff, 0x6e9a4d, 0.85);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xfff1cf, 1.9);
    sun.position.set(6, 14, 9);
    sun.target.position.set(0, 0, -8);
    this.scene.add(sun, sun.target);

    this.world = new WorldView(this.scene);
    this.world.sync(state.world, state.runId);
    this.player = new PlayerView(this.scene);
    this.cars = new CarView(this.scene);
    this.logs = new LogView(this.scene);
    this.rails = new RailView(this.scene, onTrainWarning);
    this.eagle = new EagleView(this.scene);
    this.coins = new CoinView(this.scene);

    this.resize();
    this.snapCamera(state);
  }

  resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.size = { width, height };

    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.camera.aspect = width / height;
    this.updateFov();
  }

  private updateFov(): void {
    const distance = Math.hypot(CAM_BACK + LOOK_AHEAD, CAM_HEIGHT - LOOK_Y);
    const halfHorizontal = Math.atan(VIEW_WIDTH / 2 / distance);
    const vertical = 2 * Math.atan(Math.tan(halfHorizontal) / this.camera.aspect);
    this.camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(vertical), 24, 76);
    this.camera.updateProjectionMatrix();
  }

  private snapCamera(state: GameState): void {
    const pose = playerPose(state);
    const worldZ = -pose.z;
    this.camera.position.set(pose.x * 0.15, CAM_HEIGHT, worldZ + CAM_BACK);
    this.lookZ = worldZ - LOOK_AHEAD;
    this.lookTarget.set(pose.x * 0.28, LOOK_Y, this.lookZ);
    this.camera.lookAt(this.lookTarget);
  }

  render(state: GameState, time: number, dt: number): void {
    const pose = playerPose(state);
    const worldZ = -pose.z;
    const deathT =
      state.phase === "dying"
        ? Math.min(1, state.phaseTime / 0.55)
        : state.phase === "gameover"
          ? 1
          : 0;
    const row = state.world.find((candidate) => candidate.z === Math.round(pose.z));
    const ground: RowKind | "log" =
      state.player.logId !== null ? "log" : (row?.kind ?? "grass");

    this.cars.update(state.cars);
    this.logs.update(state.logs, time);
    this.rails.update(state.rails, time, state.player.z);
    this.coins.update(state.coinDrops, time, dt);
    this.player.update(
      pose,
      time,
      dt,
      deathT,
      state.deathCause,
      ground,
    );
    this.eagle.update(state, pose, time);
    this.world.sync(state.world, state.runId);
    this.world.update(time);

    this.camera.position.x = damp(this.camera.position.x, pose.x * 0.15, 6, dt);
    this.camera.position.y = damp(this.camera.position.y, CAM_HEIGHT, 6, dt);
    this.camera.position.z = damp(this.camera.position.z, worldZ + CAM_BACK, 7, dt);

    // A short deterministic shake gives car and train hits a physical beat.
    // Reduced motion keeps the cue (the model still reacts) but calms it.
    if (state.phase === "dying") {
      const shake = Math.max(0, 1 - state.phaseTime / 0.55) ** 2;
      const heavy = state.deathCause === "car" || state.deathCause === "train";
      const amount = shake * (heavy ? 0.24 : 0.09) * (this.reducedMotion ? 0.22 : 1);
      this.camera.position.x += Math.sin(state.phaseTime * 92) * amount;
      this.camera.position.y += Math.sin(state.phaseTime * 71 + 1.7) * amount * 0.7;
      this.camera.position.z += Math.sin(state.phaseTime * 53 + 0.4) * amount * 0.4;
    }

    this.lookZ = damp(this.lookZ, worldZ - LOOK_AHEAD, 8, dt);
    this.lookTarget.set(pose.x * 0.28, LOOK_Y, this.lookZ);
    this.camera.lookAt(this.lookTarget);

    this.renderer.render(this.scene, this.camera);
  }

  info(): RenderInfo {
    const render = this.renderer.info.render;
    return {
      fov: this.camera.fov,
      calls: render.calls,
      triangles: render.triangles,
    };
  }

  getSize(): { width: number; height: number } {
    return this.size;
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.player.setReducedMotion(reduced);
  }

  setCharacter(id: CharacterId): void {
    this.player.setCharacter(id);
  }
}
