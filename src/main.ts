import "./style.css";
import { Sfx } from "./app/audio";
import { Feedback } from "./app/feedback";
import { setupFrameMode } from "./app/frame";
import {
  browserInstallHintEnv,
  markInstallHintDismissed,
  shouldShowInstallHint,
} from "./app/install-hint";
import { setupInput } from "./app/input";
import { startLoop } from "./app/loop";
import { registerServiceWorker } from "./app/pwa";
import {
  browserStorage,
  canWriteSave,
  loadSave,
  resetProgress,
  withBest,
  withCoins,
  withProgression,
  withSettings,
  writeSave,
  type SaveSettings,
  type SaveStatus,
  type SaveTrigger,
} from "./app/save";
import {
  browserPersistentStorage,
  requestPersistentStorage,
} from "./app/storage";
import {
  DEFAULT_CHARACTER_ID,
  characterName,
  isCharacterId,
  type CharacterId,
} from "./characters/catalogue";
import { GameRenderer } from "./render/renderer";
import { createGame, dispatch, retryCheckpoint, startRun } from "./sim/game";
import {
  selectCharacter,
  unlockCharacter,
  type Progression,
} from "./sim/progression";
import { CharactersPanel } from "./ui/characters";
import { Hud } from "./ui/hud";
import { PausePanel, SettingsPanel } from "./ui/settings";

/** A pickup is worth saving right away, but not once per collected coin. */
const COIN_SAVE_DELAY_MS = 300;

function showFatal(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const wrapper = document.createElement("div");
  wrapper.className = "fatal";

  const content = document.createElement("div");
  const title = document.createElement("h1");
  title.textContent = "Bossy Road could not start";
  const detail = document.createElement("p");
  detail.textContent = `${message}. Try a browser with WebGL enabled, or reload the page.`;

  content.append(title, detail);
  wrapper.append(content);
  document.body.replaceChildren(wrapper);
}

function boot(): void {
  const app = document.querySelector<HTMLElement>("#app");
  const canvas = document.querySelector<HTMLCanvasElement>("#game");

  if (!app || !canvas) {
    throw new Error("The game container is missing");
  }

  setupFrameMode(app);

  const storage = browserStorage();
  const loaded = loadSave(storage);
  let save = loaded.save;
  let saveStatus: SaveStatus = loaded.status;

  const state = createGame({ seed: 1, best: save.best, coins: save.coins });
  const hud = new Hud();
  const sfx = new Sfx();
  sfx.setMuted(!save.settings.sound);

  const renderer = new GameRenderer(app, canvas, state, () =>
    sfx.play("bell"),
  );

  const equipped = (): CharacterId =>
    isCharacterId(save.selected) ? save.selected : DEFAULT_CHARACTER_ID;
  const applyCharacter = (id: CharacterId): void => {
    renderer.setCharacter(id);
    hud.setCharacter(id);
  };

  applyCharacter(equipped());

  // Safari-only, once, and dismissible. The game is fully playable in a tab;
  // the hint is only there because installation is manual on iOS.
  const installHint = document.querySelector<HTMLButtonElement>("#install-hint");
  if (installHint && shouldShowInstallHint(browserInstallHintEnv(storage))) {
    installHint.hidden = false;
    installHint.addEventListener("click", () => {
      installHint.hidden = true;
      markInstallHintDismissed(storage);
      sfx.play("start");
    });
  }

  let paused = false;
  let persistenceAsked = false;
  let feedback = new Feedback();
  let coinSaveTimer: number | null = null;
  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  const applyMotionSetting = (): void => {
    const reduced =
      save.settings.reducedMotion || Boolean(motionQuery?.matches);
    renderer.setReducedMotion(reduced);
    hud.setReducedMotion(reduced);
    document.documentElement.classList.toggle("reduced-motion", reduced);
  };

  const persistSettings = (patch: Partial<SaveSettings>): void => {
    save = withSettings(save, patch);

    if (canWriteSave(saveStatus, "settings") && writeSave(save, storage)) {
      saveStatus = "ok";
    }
  };

  const currentProgress = (): Progression => ({
    coins: save.coins,
    unlocked: save.unlocked,
    selected: save.selected,
  });

  const cancelCoinSave = (): void => {
    if (coinSaveTimer !== null) {
      window.clearTimeout(coinSaveTimer);
      coinSaveTimer = null;
    }
  };

  const flush = (trigger: SaveTrigger): void => {
    cancelCoinSave();

    if (!canWriteSave(saveStatus, trigger)) {
      return;
    }

    const next = withCoins(withBest(save, state.best), state.coins);
    save = next;

    if (writeSave(next, storage)) {
      saveStatus = "ok";
    }
  };

  /**
   * Pickups are saved after a short quiet period. The balance lives in the
   * simulation during a run, so `flush` copies it into the save record; a run
   * end or a hidden tab flushes immediately.
   */
  const scheduleCoinSave = (): void => {
    if (coinSaveTimer !== null) {
      return;
    }

    coinSaveTimer = window.setTimeout(() => {
      coinSaveTimer = null;
      flush("coins");
    }, COIN_SAVE_DELAY_MS);
  };

  /**
   * Ask for persistent storage once, after the first completed run. A denial
   * costs nothing: the save is tiny and the game keeps working from
   * localStorage. There is no prompt or UI for this on purpose.
   */
  const askPersistence = (): void => {
    if (persistenceAsked) {
      return;
    }

    persistenceAsked = true;
    void requestPersistentStorage(browserPersistentStorage());
  };

  const pauseGame = (): void => {
    if (paused || state.phase !== "playing") {
      return;
    }

    paused = true;
    hud.setPaused(true);
    pausePanel.open();
  };

  const resumeGame = (): void => {
    if (!paused) {
      return;
    }

    paused = false;
    hud.setPaused(false);
    pausePanel.close();
    sfx.play("start");
  };

  const togglePause = (): void => {
    if (charactersPanel.isOpen) {
      charactersPanel.close();
      return;
    }

    if (settingsPanel.isOpen) {
      return;
    }

    if (paused) {
      resumeGame();
      return;
    }

    pauseGame();

    if (paused) {
      sfx.play("start");
    }
  };

  const openSettings = (): void => {
    if (settingsPanel.isOpen) {
      return;
    }

    if (state.phase === "playing" && !paused) {
      pauseGame();
    }

    settingsPanel.open(save.settings);
    sfx.play("start");
  };

  /**
   * Write a shop decision. Prices and affordability were already checked by
   * the pure progression helpers, so this only mirrors the result into the
   * save record, the live balance and the equipped model.
   */
  const commitProgress = (next: Progression): void => {
    const previous = equipped();

    save = withProgression(save, next);
    state.coins = save.coins;

    if (canWriteSave(saveStatus, "shop") && writeSave(save, storage)) {
      saveStatus = "ok";
    }

    const selected = equipped();

    if (selected !== previous) {
      applyCharacter(selected);
    }

    charactersPanel.setProgress(currentProgress());
  };

  const charactersPanel = new CharactersPanel({
    onEquip: (id) => {
      const next = selectCharacter(currentProgress(), id);

      if (!next) {
        return;
      }

      commitProgress(next);
      charactersPanel.notify(`WEARING ${characterName(id)}`, "good");
      sfx.play("start");
    },
    onUnlock: (id) => {
      const result = unlockCharacter(currentProgress(), id);

      if (!result.ok) {
        // The shop already explains the shortfall; keep the note honest if a
        // stale panel ever reaches this path.
        charactersPanel.notify(
          result.reason === "poor"
            ? `NEED ${result.shortfall} MORE COIN${result.shortfall === 1 ? "" : "S"}`
            : "ALREADY IN YOUR CREW",
          result.reason === "poor" ? "warn" : "plain",
        );
        return;
      }

      commitProgress(result.progression);
      charactersPanel.notify(
        `${characterName(id)} UNLOCKED · TAP TO WEAR`,
        "good",
      );
      sfx.play("unlock");
    },
    onInsufficient: () => {
      // The card shake and shortfall note are the feedback; no purchase sound.
    },
    onClose: () => {
      sfx.play("start");
    },
  });

  const openCharacters = (): void => {
    if (charactersPanel.isOpen || settingsPanel.isOpen) {
      return;
    }

    // A shop action can only happen between runs, but copying the live balance
    // first means a queued pickup can never be hidden behind the overlay.
    save = withCoins(save, state.coins);

    if (state.phase === "playing" && !paused) {
      pauseGame();
    }

    charactersPanel.open(currentProgress());
    sfx.play("start");
  };

  const settingsPanel = new SettingsPanel({
    onSound: (sound) => {
      persistSettings({ sound });
      sfx.setMuted(!sound);

      if (sound) {
        sfx.unlock();
      } else {
        sfx.play("start");
      }
    },
    onMotion: (reducedMotion) => {
      persistSettings({ reducedMotion });
      applyMotionSetting();
      sfx.play("start");
    },
    onReset: () => {
      cancelCoinSave();
      save = resetProgress(save);
      state.best = 0;
      state.coins = 0;
      state.runCoins = 0;
      feedback = new Feedback();
      applyCharacter(equipped());
      charactersPanel.setProgress(currentProgress());

      if (canWriteSave(saveStatus, "reset") && writeSave(save, storage)) {
        saveStatus = "ok";
      }
    },
    onClose: () => {
      sfx.play("start");
    },
  });

  const pausePanel = new PausePanel({
    onResume: () => resumeGame(),
    onSettings: () => openSettings(),
  });

  // The worker never reloads the page; a waiting update only lights a note.
  registerServiceWorker({
    onUpdateReady: () => settingsPanel.setUpdateReady(),
  });

  document
    .querySelector<HTMLButtonElement>("#pause-button")
    ?.addEventListener("click", () => togglePause());
  document
    .querySelector<HTMLButtonElement>("#settings-button")
    ?.addEventListener("click", () => openSettings());
  document
    .querySelector<HTMLButtonElement>("#characters-button")
    ?.addEventListener("click", () => openCharacters());
  document
    .querySelector<HTMLButtonElement>("#result-characters-button")
    ?.addEventListener("click", () => openCharacters());

  // The checkpoint card hands the stage back to the plain game-over card.
  // Clearing the snapshot does exactly that, with no extra HUD flag needed.
  document
    .querySelector<HTMLButtonElement>("#checkpoint-finish-button")
    ?.addEventListener("click", () => {
      if (state.phase !== "gameover" || state.checkpoint === null) {
        return;
      }

      state.checkpoint = null;
      sfx.play("start");
    });

  // TRY AGAIN resumes from the zone entry. The sim's own lock keeps the
  // button honest during the first beat of the death, same as a full retry.
  document
    .querySelector<HTMLButtonElement>("#checkpoint-retry-button")
    ?.addEventListener("click", () => {
      if (retryCheckpoint(state)) {
        sfx.play("start");
      }
    });

  setupInput(
    app,
    (direction) => {
      if (paused || settingsPanel.isOpen || charactersPanel.isOpen) {
        return;
      }

      if (state.phase === "title") {
        startRun(state);
        return;
      }

      if (state.phase === "gameover") {
        // With a checkpoint, any tap or key means TRY AGAIN; without one the
        // plain game-over card still restarts from row 0 on tap.
        if (state.checkpoint !== null) {
          retryCheckpoint(state);
          return;
        }

        startRun(state);
        return;
      }

      if (state.phase !== "playing") {
        return;
      }

      dispatch(state, direction);
      hud.noteInput();
    },
    () => sfx.unlock(),
    () => togglePause(),
  );

  const resize = (): void => renderer.resize();
  const observer = new ResizeObserver(resize);
  observer.observe(app);
  window.addEventListener("resize", resize);
  window.visualViewport?.addEventListener("resize", resize);

  const onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") {
      flush("visibility");
      pauseGame();
    }
  };
  const onPageHide = (): void => {
    flush("visibility");
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("pointerdown", () => sfx.unlock(), {
    passive: true,
  });
  motionQuery?.addEventListener?.("change", applyMotionSetting);

  applyMotionSetting();
  renderer.resize();
  startLoop(state, renderer, hud, {
    onPhaseChange: (phase) => {
      if (phase === "dying") {
        flush("run-end");
        askPersistence();
      }
    },
    onFrame: (game, dt) => {
      for (const cue of feedback.update(game, dt)) {
        sfx.play(cue);
      }

      // Coins are saved on a short debounce, so a trail is one write rather
      // than one per pickup. Run end and visibility flush immediately.
      if (game.coins !== save.coins) {
        scheduleCoinSave();
      }
    },
    isPaused: () => paused || settingsPanel.isOpen || charactersPanel.isOpen,
  });

  if (import.meta.env.DEV) {
    (window as Window & { __bossy?: unknown }).__bossy = {
      state,
      renderer,
      saveStatus,
      feedback,
      settings: () => save.settings,
      progress: currentProgress,
      isPaused: () => paused,
      updateReady: () => settingsPanel.hasUpdateReady,
      openSettings,
      openCharacters,
      togglePause,
    };
  }
}

try {
  boot();
} catch (error) {
  showFatal(error);
  console.error(error);
}
