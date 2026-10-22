import { APP_VERSION } from "../app/version";
import {
  DEFAULT_CHARACTER_ID,
  characterName,
  type CharacterId,
} from "../characters/catalogue";
import { drawPortrait } from "../characters/portrait";
import type { RenderInfo } from "../render/renderer";
import type { GameState, RunPhase } from "../sim/types";
import { ZONE_ROWS, zoneIndex, zoneLabel } from "../sim/zones";

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing HUD element: ${selector}`);
  }
  return element;
}

function compact(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return String(value);
}

export class Hud {
  private readonly root = requiredElement<HTMLDivElement>("#hud");
  private readonly score = requiredElement<HTMLSpanElement>("#score");
  private readonly best = requiredElement<HTMLSpanElement>("#best");
  private readonly hint = requiredElement<HTMLDivElement>("#hint");
  private readonly debug = requiredElement<HTMLDivElement>("#debug");
  private readonly titleScreen = requiredElement<HTMLDivElement>("#title-screen");
  private readonly gameoverScreen =
    requiredElement<HTMLDivElement>("#gameover-screen");
  private readonly titleBest = requiredElement<HTMLElement>("#title-best");
  private readonly titleCoins = requiredElement<HTMLElement>("#title-coins");
  private readonly titleCharacter =
    requiredElement<HTMLElement>("#title-character");
  private readonly titlePortrait =
    requiredElement<HTMLCanvasElement>("#title-portrait");
  private readonly hudCoins = requiredElement<HTMLSpanElement>("#hud-coins");
  private readonly coinPill = requiredElement<HTMLDivElement>(".coin-pill");
  private readonly runCoins = requiredElement<HTMLElement>("#run-coins");
  private readonly runCoinsTotal =
    requiredElement<HTMLElement>("#run-coins-total");
  private readonly runScore = requiredElement<HTMLElement>("#run-score");
  private readonly runBest = requiredElement<HTMLElement>("#run-best");
  private readonly scorePill = requiredElement<HTMLDivElement>("#score-pill");
  private readonly zoneLabel = requiredElement<HTMLElement>("#zone-label");
  private readonly zoneBanner = requiredElement<HTMLDivElement>("#zone-banner");
  private readonly checkpointScreen =
    requiredElement<HTMLDivElement>("#checkpoint-screen");
  private readonly checkpointZone =
    requiredElement<HTMLElement>("#checkpoint-zone");
  private readonly checkpointScore =
    requiredElement<HTMLElement>("#checkpoint-score");
  private readonly checkpointBest =
    requiredElement<HTMLElement>("#checkpoint-best");
  private readonly checkpointCoins =
    requiredElement<HTMLElement>("#checkpoint-coins");
  private readonly checkpointCoinsTotal =
    requiredElement<HTMLElement>("#checkpoint-coins-total");
  private readonly pauseButton =
    requiredElement<HTMLButtonElement>("#pause-button");
  private readonly versionChip =
    requiredElement<HTMLElement>("#version-chip");
  private readonly showDebug =
    new URLSearchParams(window.location.search).get("debug") === "1";
  private lastScore = -1;
  private lastBest = -1;
  private lastCoins = -1;
  private lastRunCoins = -1;
  private lastPhase: RunPhase | null = null;
  private hintDismissed = false;
  private paused = false;
  private debugTimer = 0;
  /**
   * The player's zone, baselined on entering `playing` so a respawn into the
   * zone it just recreated never fires its own banner.
   */
  private lastZone = -1;
  private zoneText = "";
  private showCheckpoint = false;
  /** Seconds left before the zone banner steps aside again. */
  private bannerTimer = 0;
  private reducedMotion = false;

  constructor() {
    this.debug.hidden = !this.showDebug;
    this.versionChip.textContent = `V${APP_VERSION}`;
    this.setCharacter(DEFAULT_CHARACTER_ID);
  }

  /** Title portrait and name; cosmetic only, driven by the save. */
  setCharacter(id: CharacterId): void {
    drawPortrait(this.titlePortrait, id, 144);
    this.titleCharacter.textContent = characterName(id);
  }

  /**
   * The balance is the saved total; the run count is what this run earned.
   * Both are cheap to write every frame, so the HUD diffs them instead.
   */
  setCoins(coins: number, runCoins: number): void {
    if (coins !== this.lastCoins) {
      if (this.lastCoins >= 0 && coins > this.lastCoins) {
        this.popCoins();
      }

      this.lastCoins = coins;
      const text = String(coins);
      this.hudCoins.textContent = text;
      this.titleCoins.textContent = text;
      this.runCoinsTotal.textContent = text;
    }

    if (runCoins !== this.lastRunCoins) {
      this.lastRunCoins = runCoins;
      this.runCoins.textContent = String(runCoins);
    }
  }

  noteInput(): void {
    this.hintDismissed = true;
    this.hint.classList.add("is-hidden");
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) {
      return;
    }

    this.paused = paused;
    this.applyButtons();
    this.applyHint();
  }

  /** Mirrors the motion decision so the banner can be skipped, not just still. */
  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (reduced) {
      this.zoneBanner.hidden = true;
      this.bannerTimer = 0;
    }
  }

  private applyPhase(state: GameState): void {
    const phase = state.phase;
    const isTitle = phase === "title";
    const isPlaying = phase === "playing";
    const previous = this.lastPhase;

    this.titleScreen.hidden = !isTitle;
    this.gameoverScreen.hidden = phase !== "gameover";
    this.root.classList.toggle("is-title", isTitle);
    this.root.classList.toggle("is-playing", isPlaying);

    if (isPlaying && previous !== "playing") {
      this.hintDismissed = false;
      // Any play entry rebaselines the zone. A checkpoint retry starts the
      // player standing in the zone again, so it must not banner itself.
      this.lastZone = Math.max(0, zoneIndex(state.player.z));
      this.setZone(this.lastZone);
      this.zoneBanner.hidden = true;
      this.bannerTimer = 0;
    }

    this.lastPhase = phase;
    this.applyButtons();
    this.applyHint();
  }

  private setZone(zone: number): void {
    // zoneLabel speaks rows; convert the child-facing zone index to its
    // first row. (zoneStart would call zoneIndex on this index and collapse
    // every zone below 10 back to row 0.)
    const text = zone > 0 ? zoneLabel(zone * ZONE_ROWS) : "";

    if (text !== this.zoneText) {
      this.zoneText = text;
      this.zoneLabel.textContent = text;
    }
    this.zoneLabel.hidden = text === "";
  }

  private applyButtons(): void {
    this.pauseButton.hidden = this.lastPhase !== "playing" || this.paused;
  }

  private applyHint(): void {
    const show =
      this.lastPhase === "playing" && !this.paused && !this.hintDismissed;
    this.hint.classList.toggle("is-hidden", !show);
  }

  update(state: GameState, fps: number, info: RenderInfo, dt: number): void {
    if (state.phase !== this.lastPhase) {
      this.applyPhase(state);
    }

    this.applyCheckpoint(state);
    this.applyZone(state, dt);

    if (state.score !== this.lastScore) {
      this.score.textContent = String(state.score);
      this.runScore.textContent = String(state.score);
      this.lastScore = state.score;
      this.popScore();
    }

    if (state.best !== this.lastBest) {
      this.best.textContent = String(state.best);
      this.titleBest.textContent = String(state.best);
      this.runBest.textContent = String(state.best);
      this.lastBest = state.best;
    }

    this.setCoins(state.coins, state.runCoins);

    if (!this.showDebug) {
      return;
    }

    this.debugTimer += dt;
    if (this.debugTimer < 0.2) {
      return;
    }
    this.debugTimer = 0;

    const player = state.player;
    const hop = player.hopping ? player.hopT.toFixed(2) : "idle";
    const warning = state.rails.filter((rail) => rail.phase === "warning").length;
    const crossing = state.rails.filter((rail) => rail.phase === "crossing").length;

    this.debug.textContent = [
      `seed   ${state.seed}`,
      `pos    ${player.x.toFixed(1)}, ${player.z.toFixed(0)}`,
      `score  ${state.score}  best ${state.best}`,
      `phase  ${state.phase} ${state.phaseTime.toFixed(2)}s`,
      `hop    ${hop}`,
      `cars   ${state.cars.length}`,
      `logs   ${state.logs.length}  ride ${player.logId ?? "-"}`,
      `rails  ${state.rails.length}  warn ${warning}  cross ${crossing}`,
      `idle   ${state.idleTime.toFixed(1)}s  cause ${state.deathCause ?? "-"}`,
      `rows   ${state.world.length} (${state.world[0]?.z ?? 0}..${state.world.at(-1)?.z ?? 0})`,
      `fps    ${fps.toFixed(0)}`,
      `fov    ${info.fov.toFixed(1)}`,
      `draws  ${info.calls}`,
      `tris   ${compact(info.triangles)}`,
    ].join("\n");
  }

  /**
   * The checkpoint card owns the game-over moment while a zone snapshot
   * exists; FINISH clears the snapshot in `main` and this hands the stage
   * straight back to the plain game-over card.
   */
  private applyCheckpoint(state: GameState): void {
    const show = state.phase === "gameover" && state.checkpoint !== null;

    if (show === this.showCheckpoint) {
      return;
    }

    this.showCheckpoint = show;
    this.checkpointScreen.hidden = !show;
    this.gameoverScreen.hidden = show || state.phase !== "gameover";

    const saved = state.checkpoint;

    if (!show || !saved) {
      return;
    }

    this.checkpointZone.textContent = String(saved.zone + 1);
    this.checkpointScore.textContent = String(saved.score);
    this.checkpointBest.textContent = String(state.best);
    this.checkpointCoins.textContent = String(saved.runCoins);
    this.checkpointCoinsTotal.textContent = String(saved.coins);
  }

  private applyZone(state: GameState, dt: number): void {
    if (state.phase !== "playing") {
      return;
    }

    const zone = Math.max(0, zoneIndex(state.player.z));

    if (zone > this.lastZone) {
      this.lastZone = zone;
      this.setZone(zone);

      if (!this.reducedMotion) {
        this.zoneBanner.textContent = zoneLabel(zone * ZONE_ROWS);
        this.zoneBanner.classList.remove("is-pop");
        // Reflow so a zone crossed in quick succession restarts the pop.
        void this.zoneBanner.offsetWidth;
        this.zoneBanner.classList.add("is-pop");
        this.zoneBanner.hidden = false;
        this.bannerTimer = 1.4;
      }
    }

    if (!this.paused && this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        this.bannerTimer = 0;
        this.zoneBanner.hidden = true;
      }
    }
  }

  private popScore(): void {
    this.scorePill.classList.remove("is-pop");
    // Force a reflow so a fast run restarts the pop on every score.
    void this.scorePill.offsetWidth;
    this.scorePill.classList.add("is-pop");
  }

  private popCoins(): void {
    this.coinPill.classList.remove("is-pop");
    void this.coinPill.offsetWidth;
    this.coinPill.classList.add("is-pop");
  }
}
