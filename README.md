# Bossy Road

A kid-friendly, offline-first voxel hopper for iPhone and iPad. Built as an
installable progressive web app with original art, characters and sound.

**Play it:** <https://mrjonswift.github.io/bossyroad/>

**Source:** <https://github.com/MrJonSwift/bossyroad> - released as `v1.0.1`.

Bossy Road is a chicken who hops across grass, roads, rivers and railway
lines. Cars and trains end the run, logs carry you across the water, and an
eagle catches you if you stop or walk backwards. Collect coins, unlock eight
characters, and try to beat your best score.

Everything is generated in code, so the whole game is a few hundred kilobytes,
precaches into a service worker, and launches and plays with the network off.

## Install on iPhone or iPad

The game is a standard PWA. Installation is manual on iOS, and takes about ten
seconds.

1. Open **<https://mrjonswift.github.io/bossyroad/>** in **Safari** on the
   iPhone or iPad. Chrome on iOS will not install the app; use Safari.
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add** in the top right.
5. Launch **Bossy Road** from the home screen. It opens full screen, with no
   Safari toolbar, and it works with Wi-Fi and cellular off.

The first launch downloads the game (about 180 KB) and stores it on the
device. After that the game never needs the network again.

## Play offline

Bossy Road makes **no network requests while it runs**. There are no ads, no
analytics, no accounts, no remote fonts and no third-party services. Once the
app has been opened once, it launches and plays with the device in airplane
mode.

To see it for yourself:

1. Open the game and play for a few seconds, so it finishes installing.
2. Turn on **Airplane Mode** (or switch Wi-Fi off).
3. Close the app completely from the app switcher and launch it again from the
   home screen.

Your best score, coins and unlocked characters are stored on the device and
survive a relaunch. Progress is never uploaded anywhere, so it also never
leaves the device.

## How an update reaches the device

The game is deployed from `main` by GitHub Actions. When a new version is
published:

1. The new build is precached in the background by the service worker.
2. The worker **waits**. The game never reloads itself, so a deploy can never
   interrupt a run or lose a score.
3. The new version activates the next time the app is fully closed and
   relaunched from the home screen.

If an update is waiting, the settings card (the sliders icon on the title
screen) shows a quiet `UPDATE READY - REOPEN TO APPLY` line. Closing the app
and opening it again is all it takes.

## Controls

| Action | iPhone and iPad | Keyboard |
| --- | --- | --- |
| Hop forward | Tap the play area | Arrow up, `W`, `Space`, `Enter` |
| Turn left or right | Swipe left or right | Arrow left/right, `A`/`D` |
| Back up | Swipe down | Arrow down, `S` |
| Pause | Pause button | `Escape`, `P` |

## What is in the game

- An endless seeded world of grass, roads, rivers and railway lines that
  recycles behind the camera.
- A difficulty curve that ramps to a cap at score 100.
- Cars, telegraphed trains, floating logs, deep water and an eagle that
  punishes hesitation.
- Coins, eight original characters with fixed prices, and a shop with no
  gacha and no real money.
- Synthesized audio, squash-and-stretch, dust and camera shake, with a
  reduced-motion setting that scales the motion without changing the rules.
- A settings card with sound, reduced motion, reset progress and the version.

## Known limitations

- Progress lives only on the device. There are no accounts and no cloud save,
  so clearing the browser data or uninstalling the app clears the progress.
- iOS can evict the data of a home-screen app that has not been opened for a
  long time. The game asks the system for persistent storage once, after the
  first run, and quietly continues if the request is refused.
- The shop is an overlay on the title screen rather than a separate screen.
- There is no in-app updater: a new version lands on the next cold launch.
- The install hint only appears in iOS Safari, and it hides itself for good
  after one tap.
- Audio is synthesized and mixed by ear; there is a master mute but no
  per-cue volume slider.
- The camera and art are tuned on phone- and tablet-sized frames, not on
  physical devices.
- The JavaScript bundle trips Vite's 500 KB warning because it holds Three.js.
  The initial download is 157.70 KB gzip, well inside the budget.

## Run it locally

```bash
npm install
npm run dev
```

Then open <http://127.0.0.1:5173>.

Useful preview modes:

- `?frame=390x844` - show the game inside a phone-sized frame
- `?frame=820x1180` - show the game inside a tablet-sized frame
- `?safe=1` - simulate iOS safe-area insets (notch and home indicator)
- `?debug=1` - show seed, position, score, FPS and renderer diagnostics

To reproduce the deployed layout, build with the same base path and serve it:

```bash
BASE_PATH=/bossyroad/ npm run build
BASE_PATH=/bossyroad/ npm run preview
# open http://127.0.0.1:4173/bossyroad/
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 5173 |
| `npm run build` | Typecheck and production build |
| `npm run preview` | Serve the production build on port 4173 |
| `npm run typecheck` | TypeScript only |
| `npm test` | Vitest suite |
| `npm run icons` | Redraw the app icons into `public/icons/` |

## Design notes

- The simulation is pure TypeScript and has no Three.js imports.
- The renderer projects a snapshot of the simulation; it never owns game rules.
- Art and audio are generated in code, so the offline cache stays small.
- No ads, in-app purchases, accounts, analytics or runtime network calls.
- Progress is stored only on the device.

## License and assets

All models, UI, textures, icons and audio in this repository are original and
generated by the code in `src/` and `scripts/`. Bossy Road is an original game
and is not affiliated with, and uses no assets from, any other game.
