import type { CharacterId } from "./catalogue";
import type { VoxelBox } from "../render/voxel";

/**
 * Original voxel character models. They share Bossy's box language and overall
 * size, but each one has its own silhouette: Pip's flippers, Moss's wide frog
 * stance, Dash's ears and tail, Bolt's straight robot lines, and so on.
 *
 * These are cosmetic only. The player hitbox and hop live in `src/sim` and do
 * not depend on which model is drawn.
 */

const CREAM = 0xfff4d6;
const CREAM_SHADE = 0xe3cfa4;
const TAN = 0xf0d9a8;
const RED = 0xe84a3f;
const ORANGE = 0xf2a03d;
const ORANGE_DARK = 0xd9862b;
const INK = 0x26332d;
const WHITE = 0xfffbee;

function shade(color: number, factor: number): number {
  const channel = (shift: number): number => {
    const value = Math.round(((color >> shift) & 0xff) * factor);
    return Math.min(255, Math.max(0, value));
  };

  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Bossy: the original cream chicken with a red comb and tan tail fan. */
function bossyBoxes(): VoxelBox[] {
  return [
    // Body, chest and a lighter belly.
    { x: 0, y: 0.43, z: 0.05, w: 0.52, h: 0.46, d: 0.54, color: CREAM },
    { x: 0, y: 0.35, z: -0.08, w: 0.36, h: 0.3, d: 0.32, color: WHITE },
    { x: 0, y: 0.55, z: 0.24, w: 0.34, h: 0.22, d: 0.12, color: 0xf2e2bb },
    // Head, cheeks and neck.
    { x: 0, y: 0.67, z: -0.04, w: 0.28, h: 0.2, d: 0.3, color: CREAM },
    { x: 0, y: 0.83, z: -0.1, w: 0.36, h: 0.36, d: 0.36, color: CREAM },
    { x: -0.1, y: 0.78, z: -0.27, w: 0.1, h: 0.1, d: 0.04, color: 0xffe9c4 },
    { x: 0.1, y: 0.78, z: -0.27, w: 0.1, h: 0.1, d: 0.04, color: 0xffe9c4 },
    // Beak and wattle.
    { x: 0, y: 0.8, z: -0.31, w: 0.18, h: 0.1, d: 0.12, color: ORANGE },
    { x: 0, y: 0.74, z: -0.29, w: 0.14, h: 0.05, d: 0.09, color: ORANGE_DARK },
    { x: 0, y: 0.68, z: -0.28, w: 0.1, h: 0.1, d: 0.06, color: RED },
    // Comb: three chunky bumps.
    { x: -0.1, y: 1.0, z: -0.04, w: 0.07, h: 0.14, d: 0.2, color: RED },
    { x: 0, y: 1.045, z: -0.04, w: 0.07, h: 0.18, d: 0.2, color: RED },
    { x: 0.1, y: 1.0, z: -0.04, w: 0.07, h: 0.14, d: 0.2, color: RED },
    // Eyes with a tiny highlight so they read at phone size.
    { x: -0.13, y: 0.86, z: -0.285, w: 0.06, h: 0.07, d: 0.02, color: INK },
    { x: 0.13, y: 0.86, z: -0.285, w: 0.06, h: 0.07, d: 0.02, color: INK },
    { x: -0.145, y: 0.88, z: -0.297, w: 0.02, h: 0.02, d: 0.01, color: WHITE },
    { x: 0.115, y: 0.88, z: -0.297, w: 0.02, h: 0.02, d: 0.01, color: WHITE },
    // Wings, slightly darker with a light tip.
    { x: -0.29, y: 0.44, z: 0.06, w: 0.07, h: 0.3, d: 0.34, color: CREAM_SHADE },
    { x: 0.29, y: 0.44, z: 0.06, w: 0.07, h: 0.3, d: 0.34, color: CREAM_SHADE },
    { x: -0.29, y: 0.34, z: 0.18, w: 0.08, h: 0.06, d: 0.26, color: 0xd5bb8d },
    { x: 0.29, y: 0.34, z: 0.18, w: 0.08, h: 0.06, d: 0.26, color: 0xd5bb8d },
    { x: -0.3, y: 0.56, z: -0.04, w: 0.05, h: 0.08, d: 0.1, color: 0xd5bb8d },
    { x: 0.3, y: 0.56, z: -0.04, w: 0.05, h: 0.08, d: 0.1, color: 0xd5bb8d },
    // Tail fan: three stepped feathers behind the body.
    { x: 0, y: 0.62, z: 0.36, w: 0.28, h: 0.3, d: 0.14, color: TAN },
    { x: -0.11, y: 0.68, z: 0.34, w: 0.08, h: 0.24, d: 0.12, color: 0xe3c894 },
    { x: 0.11, y: 0.68, z: 0.34, w: 0.08, h: 0.24, d: 0.12, color: 0xe3c894 },
    { x: 0, y: 0.76, z: 0.41, w: 0.18, h: 0.08, d: 0.08, color: 0xd9b878 },
    { x: 0, y: 0.52, z: 0.4, w: 0.2, h: 0.1, d: 0.08, color: 0xd9b878 },
    // Three-toed feet.
    { x: -0.14, y: 0.06, z: -0.02, w: 0.09, h: 0.06, d: 0.2, color: ORANGE },
    { x: 0.14, y: 0.06, z: -0.02, w: 0.09, h: 0.06, d: 0.2, color: ORANGE },
    { x: -0.14, y: 0.055, z: -0.17, w: 0.11, h: 0.05, d: 0.1, color: ORANGE },
    { x: 0.14, y: 0.055, z: -0.17, w: 0.11, h: 0.05, d: 0.1, color: ORANGE },
    { x: -0.14, y: 0.055, z: 0.1, w: 0.09, h: 0.05, d: 0.08, color: ORANGE_DARK },
    { x: 0.14, y: 0.055, z: 0.1, w: 0.09, h: 0.05, d: 0.08, color: ORANGE_DARK },
  ];
}

/** Pip: a blue penguin with cream face patches, flippers and a stubby beak. */
function pipBoxes(): VoxelBox[] {
  const blue = 0x3d7fbf;
  const blueDark = 0x2f63a0;
  const blueDeep = 0x26517f;
  const orange = 0xf2a03d;

  return [
    // Tall rounded body with a pale front.
    { x: 0, y: 0.44, z: 0.03, w: 0.56, h: 0.62, d: 0.5, color: blue },
    { x: 0, y: 0.38, z: -0.19, w: 0.36, h: 0.42, d: 0.14, color: CREAM },
    { x: 0, y: 0.52, z: 0.27, w: 0.42, h: 0.4, d: 0.08, color: blueDark },
    { x: 0, y: 0.2, z: 0.3, w: 0.24, h: 0.12, d: 0.14, color: blueDeep },
    // Head with a dark cap.
    { x: 0, y: 0.9, z: -0.01, w: 0.48, h: 0.42, d: 0.46, color: blueDeep },
    { x: 0, y: 0.84, z: -0.24, w: 0.4, h: 0.24, d: 0.04, color: CREAM },
    // White eye patches and pupils.
    { x: -0.12, y: 0.96, z: -0.26, w: 0.15, h: 0.18, d: 0.03, color: WHITE },
    { x: 0.12, y: 0.96, z: -0.26, w: 0.15, h: 0.18, d: 0.03, color: WHITE },
    { x: -0.11, y: 0.95, z: -0.28, w: 0.07, h: 0.08, d: 0.02, color: INK },
    { x: 0.11, y: 0.95, z: -0.28, w: 0.07, h: 0.08, d: 0.02, color: INK },
    // Stubby two-part beak.
    { x: 0, y: 0.85, z: -0.31, w: 0.18, h: 0.08, d: 0.14, color: orange },
    { x: 0, y: 0.79, z: -0.29, w: 0.12, h: 0.05, d: 0.1, color: ORANGE_DARK },
    // Flippers held out a little, and orange feet.
    { x: -0.32, y: 0.46, z: 0.04, w: 0.08, h: 0.38, d: 0.28, color: blueDark },
    { x: 0.32, y: 0.46, z: 0.04, w: 0.08, h: 0.38, d: 0.28, color: blueDark },
    { x: -0.32, y: 0.24, z: 0.04, w: 0.09, h: 0.08, d: 0.26, color: blueDeep },
    { x: 0.32, y: 0.24, z: 0.04, w: 0.09, h: 0.08, d: 0.26, color: blueDeep },
    { x: -0.14, y: 0.05, z: -0.06, w: 0.12, h: 0.06, d: 0.24, color: orange },
    { x: 0.14, y: 0.05, z: -0.06, w: 0.12, h: 0.06, d: 0.24, color: orange },
  ];
}

/** Moss: a low, wide green frog with eye bumps and a broad mouth. */
function mossBoxes(): VoxelBox[] {
  const green = 0x6db94a;
  const greenDark = 0x4f9634;
  const greenLight = 0x8ed35a;
  const belly = 0xdff2a3;

  return [
    // Wide body and pale throat.
    { x: 0, y: 0.32, z: 0.04, w: 0.68, h: 0.4, d: 0.6, color: green },
    { x: 0, y: 0.28, z: -0.24, w: 0.44, h: 0.26, d: 0.14, color: belly },
    { x: 0, y: 0.56, z: 0.02, w: 0.56, h: 0.26, d: 0.52, color: greenLight },
    // Eye bumps on top.
    { x: -0.18, y: 0.78, z: -0.05, w: 0.2, h: 0.2, d: 0.2, color: green },
    { x: 0.18, y: 0.78, z: -0.05, w: 0.2, h: 0.2, d: 0.2, color: green },
    { x: -0.18, y: 0.79, z: -0.16, w: 0.15, h: 0.15, d: 0.03, color: WHITE },
    { x: 0.18, y: 0.79, z: -0.16, w: 0.15, h: 0.15, d: 0.03, color: WHITE },
    { x: -0.18, y: 0.79, z: -0.18, w: 0.07, h: 0.09, d: 0.02, color: INK },
    { x: 0.18, y: 0.79, z: -0.18, w: 0.07, h: 0.09, d: 0.02, color: INK },
    // Mouth and nostrils.
    { x: 0, y: 0.49, z: -0.27, w: 0.34, h: 0.035, d: 0.02, color: greenDark },
    { x: -0.08, y: 0.56, z: -0.27, w: 0.03, h: 0.03, d: 0.02, color: greenDark },
    { x: 0.08, y: 0.56, z: -0.27, w: 0.03, h: 0.03, d: 0.02, color: greenDark },
    // Back spots.
    { x: -0.12, y: 0.7, z: 0.14, w: 0.12, h: 0.02, d: 0.12, color: greenDark },
    { x: 0.14, y: 0.7, z: 0.18, w: 0.09, h: 0.02, d: 0.09, color: greenDark },
    // Front legs, folded back legs and wide toes.
    { x: -0.28, y: 0.16, z: -0.16, w: 0.16, h: 0.16, d: 0.2, color: green },
    { x: 0.28, y: 0.16, z: -0.16, w: 0.16, h: 0.16, d: 0.2, color: green },
    { x: -0.3, y: 0.18, z: 0.2, w: 0.18, h: 0.22, d: 0.24, color: greenDark },
    { x: 0.3, y: 0.18, z: 0.2, w: 0.18, h: 0.22, d: 0.24, color: greenDark },
    { x: -0.28, y: 0.045, z: -0.18, w: 0.22, h: 0.05, d: 0.28, color: greenLight },
    { x: 0.28, y: 0.045, z: -0.18, w: 0.22, h: 0.05, d: 0.28, color: greenLight },
  ];
}

/** Dash: an orange fox with tall ears, a cream snout and a white tail tip. */
function dashBoxes(): VoxelBox[] {
  const orange = 0xe8842f;
  const orangeDark = 0xc96a1f;
  const cream = 0xfff4d6;

  return [
    { x: 0, y: 0.42, z: 0.06, w: 0.5, h: 0.42, d: 0.54, color: orange },
    { x: 0, y: 0.36, z: -0.2, w: 0.32, h: 0.3, d: 0.14, color: cream },
    { x: 0, y: 0.44, z: 0.3, w: 0.36, h: 0.28, d: 0.08, color: orangeDark },
    // Head and pointed snout.
    { x: 0, y: 0.76, z: -0.08, w: 0.42, h: 0.32, d: 0.4, color: orange },
    { x: 0, y: 0.68, z: -0.32, w: 0.22, h: 0.14, d: 0.2, color: cream },
    { x: 0, y: 0.71, z: -0.43, w: 0.08, h: 0.07, d: 0.05, color: INK },
    { x: -0.11, y: 0.82, z: -0.29, w: 0.06, h: 0.07, d: 0.02, color: INK },
    { x: 0.11, y: 0.82, z: -0.29, w: 0.06, h: 0.07, d: 0.02, color: INK },
    // Tall ears with a dark inner face.
    { x: -0.14, y: 1.0, z: -0.08, w: 0.12, h: 0.24, d: 0.09, color: orange },
    { x: 0.14, y: 1.0, z: -0.08, w: 0.12, h: 0.24, d: 0.09, color: orange },
    { x: -0.14, y: 0.98, z: -0.13, w: 0.06, h: 0.16, d: 0.02, color: orangeDark },
    { x: 0.14, y: 0.98, z: -0.13, w: 0.06, h: 0.16, d: 0.02, color: orangeDark },
    // Bushy tail curving up behind, with a white tip.
    { x: 0.1, y: 0.3, z: 0.36, w: 0.24, h: 0.26, d: 0.28, color: orange },
    { x: 0.18, y: 0.47, z: 0.42, w: 0.2, h: 0.22, d: 0.22, color: orangeDark },
    { x: 0.23, y: 0.62, z: 0.43, w: 0.15, h: 0.18, d: 0.16, color: cream },
    // Arms and dark legs.
    { x: -0.28, y: 0.42, z: -0.02, w: 0.06, h: 0.26, d: 0.3, color: orangeDark },
    { x: 0.28, y: 0.42, z: -0.02, w: 0.06, h: 0.26, d: 0.3, color: orangeDark },
    { x: -0.16, y: 0.08, z: -0.04, w: 0.12, h: 0.16, d: 0.22, color: orangeDark },
    { x: 0.16, y: 0.08, z: -0.04, w: 0.12, h: 0.16, d: 0.22, color: orangeDark },
  ];
}

/** Ruby: a red-brown hen with a small comb, gold beak and fan tail. */
function rubyBoxes(): VoxelBox[] {
  const brown = 0xb9553a;
  const brownDark = 0x94412c;
  const tan = 0xf0d9a8;
  const gold = 0xf6c33c;

  return [
    { x: 0, y: 0.43, z: 0.04, w: 0.54, h: 0.48, d: 0.56, color: brown },
    { x: 0, y: 0.36, z: -0.22, w: 0.34, h: 0.32, d: 0.14, color: tan },
    { x: 0, y: 0.66, z: -0.02, w: 0.3, h: 0.22, d: 0.32, color: brown },
    // Head and tidy comb.
    { x: 0, y: 0.84, z: -0.06, w: 0.38, h: 0.36, d: 0.38, color: brown },
    { x: -0.06, y: 1.02, z: -0.02, w: 0.07, h: 0.12, d: 0.18, color: RED },
    { x: 0.06, y: 1.025, z: -0.02, w: 0.07, h: 0.14, d: 0.18, color: RED },
    // Gold beak and red wattle.
    { x: 0, y: 0.81, z: -0.3, w: 0.17, h: 0.09, d: 0.13, color: gold },
    { x: 0, y: 0.75, z: -0.28, w: 0.13, h: 0.04, d: 0.09, color: shade(gold, 0.84) },
    { x: 0, y: 0.7, z: -0.26, w: 0.09, h: 0.09, d: 0.06, color: RED },
    // Eyes.
    { x: -0.13, y: 0.88, z: -0.25, w: 0.06, h: 0.07, d: 0.02, color: INK },
    { x: 0.13, y: 0.88, z: -0.25, w: 0.06, h: 0.07, d: 0.02, color: INK },
    // Wings with pale tips.
    { x: -0.3, y: 0.44, z: 0.06, w: 0.07, h: 0.3, d: 0.36, color: brownDark },
    { x: 0.3, y: 0.44, z: 0.06, w: 0.07, h: 0.3, d: 0.36, color: brownDark },
    { x: -0.3, y: 0.34, z: 0.2, w: 0.08, h: 0.06, d: 0.26, color: tan },
    { x: 0.3, y: 0.34, z: 0.2, w: 0.08, h: 0.06, d: 0.26, color: tan },
    // Fan tail: three upright feathers.
    { x: 0, y: 0.72, z: 0.36, w: 0.28, h: 0.4, d: 0.12, color: brownDark },
    { x: -0.15, y: 0.68, z: 0.38, w: 0.08, h: 0.3, d: 0.1, color: brown },
    { x: 0.15, y: 0.68, z: 0.38, w: 0.08, h: 0.3, d: 0.1, color: brown },
    { x: 0, y: 0.94, z: 0.38, w: 0.16, h: 0.1, d: 0.1, color: tan },
    // Gold legs and feet.
    { x: -0.14, y: 0.08, z: 0, w: 0.08, h: 0.14, d: 0.1, color: gold },
    { x: 0.14, y: 0.08, z: 0, w: 0.08, h: 0.14, d: 0.1, color: gold },
    { x: -0.14, y: 0.04, z: -0.06, w: 0.12, h: 0.05, d: 0.26, color: gold },
    { x: 0.14, y: 0.04, z: -0.06, w: 0.12, h: 0.05, d: 0.26, color: gold },
  ];
}

/** Bolt: a straight-lined teal robot with a visor and a red antenna. */
function boltBoxes(): VoxelBox[] {
  const teal = 0x3fb5a4;
  const tealLight = 0x63d6c4;
  const tealDark = 0x2a8a7d;
  const panel = 0x1f4a45;
  const glow = 0xfff0a8;

  return [
    // Boxy body with a dark chest panel and controls.
    { x: 0, y: 0.46, z: 0.02, w: 0.5, h: 0.5, d: 0.4, color: teal },
    { x: 0, y: 0.47, z: -0.215, w: 0.32, h: 0.28, d: 0.03, color: panel },
    { x: -0.07, y: 0.54, z: -0.235, w: 0.06, h: 0.06, d: 0.02, color: glow },
    { x: 0.07, y: 0.54, z: -0.235, w: 0.06, h: 0.06, d: 0.02, color: RED },
    { x: 0, y: 0.42, z: -0.235, w: 0.22, h: 0.04, d: 0.02, color: tealLight },
    // Head, visor and glowing eyes.
    { x: 0, y: 0.88, z: 0, w: 0.44, h: 0.34, d: 0.38, color: tealLight },
    { x: 0, y: 0.88, z: -0.205, w: 0.32, h: 0.14, d: 0.03, color: panel },
    { x: -0.07, y: 0.88, z: -0.225, w: 0.07, h: 0.07, d: 0.02, color: glow },
    { x: 0.07, y: 0.88, z: -0.225, w: 0.07, h: 0.07, d: 0.02, color: glow },
    // Antenna with a red tip.
    { x: 0, y: 1.1, z: 0, w: 0.04, h: 0.2, d: 0.04, color: tealDark },
    { x: 0, y: 1.24, z: 0, w: 0.11, h: 0.11, d: 0.11, color: RED },
    // Side bolts, arms and hands.
    { x: -0.24, y: 0.88, z: 0, w: 0.06, h: 0.08, d: 0.12, color: tealDark },
    { x: 0.24, y: 0.88, z: 0, w: 0.06, h: 0.08, d: 0.12, color: tealDark },
    { x: -0.3, y: 0.48, z: 0, w: 0.1, h: 0.32, d: 0.14, color: tealDark },
    { x: 0.3, y: 0.48, z: 0, w: 0.1, h: 0.32, d: 0.14, color: tealDark },
    { x: -0.3, y: 0.29, z: -0.02, w: 0.13, h: 0.12, d: 0.16, color: tealLight },
    { x: 0.3, y: 0.29, z: -0.02, w: 0.13, h: 0.12, d: 0.16, color: tealLight },
    // Blocky feet.
    { x: -0.15, y: 0.06, z: -0.02, w: 0.18, h: 0.12, d: 0.28, color: panel },
    { x: 0.15, y: 0.06, z: -0.02, w: 0.18, h: 0.12, d: 0.28, color: panel },
  ];
}

/** Nori: a slim black-and-cream cat with pink inner ears and an upright tail. */
function noriBoxes(): VoxelBox[] {
  const black = 0x2f3236;
  const blackLight = 0x44484e;
  const cream = 0xfff4d6;
  const pink = 0xf28fa8;
  const eye = 0xb6e07a;

  return [
    { x: 0, y: 0.42, z: 0.04, w: 0.44, h: 0.5, d: 0.52, color: black },
    { x: 0, y: 0.38, z: -0.2, w: 0.28, h: 0.36, d: 0.14, color: cream },
    { x: 0, y: 0.5, z: 0.28, w: 0.34, h: 0.34, d: 0.08, color: blackLight },
    // Head, cream muzzle, pink nose.
    { x: 0, y: 0.82, z: -0.06, w: 0.4, h: 0.34, d: 0.38, color: black },
    { x: 0, y: 0.74, z: -0.28, w: 0.22, h: 0.12, d: 0.08, color: cream },
    { x: 0, y: 0.78, z: -0.33, w: 0.06, h: 0.05, d: 0.03, color: pink },
    // Big cat eyes with narrow pupils.
    { x: -0.12, y: 0.86, z: -0.26, w: 0.1, h: 0.09, d: 0.03, color: eye },
    { x: 0.12, y: 0.86, z: -0.26, w: 0.1, h: 0.09, d: 0.03, color: eye },
    { x: -0.12, y: 0.86, z: -0.28, w: 0.035, h: 0.08, d: 0.02, color: INK },
    { x: 0.12, y: 0.86, z: -0.28, w: 0.035, h: 0.08, d: 0.02, color: INK },
    // Pointed ears with pink insides.
    { x: -0.13, y: 1.02, z: -0.04, w: 0.14, h: 0.18, d: 0.1, color: black },
    { x: 0.13, y: 1.02, z: -0.04, w: 0.14, h: 0.18, d: 0.1, color: black },
    { x: -0.13, y: 1.01, z: -0.095, w: 0.07, h: 0.11, d: 0.02, color: pink },
    { x: 0.13, y: 1.01, z: -0.095, w: 0.07, h: 0.11, d: 0.02, color: pink },
    // Whiskers.
    { x: -0.2, y: 0.76, z: -0.3, w: 0.18, h: 0.015, d: 0.015, color: cream },
    { x: 0.2, y: 0.76, z: -0.3, w: 0.18, h: 0.015, d: 0.015, color: cream },
    { x: -0.2, y: 0.72, z: -0.3, w: 0.16, h: 0.015, d: 0.015, color: cream },
    { x: 0.2, y: 0.72, z: -0.3, w: 0.16, h: 0.015, d: 0.015, color: cream },
    // Upright tail with a cream tip.
    { x: 0.16, y: 0.5, z: 0.34, w: 0.12, h: 0.48, d: 0.12, color: black },
    { x: 0.16, y: 0.76, z: 0.34, w: 0.12, h: 0.1, d: 0.12, color: blackLight },
    { x: 0.16, y: 0.88, z: 0.34, w: 0.12, h: 0.14, d: 0.12, color: cream },
    // Cream front paws.
    { x: -0.12, y: 0.08, z: -0.06, w: 0.12, h: 0.16, d: 0.2, color: cream },
    { x: 0.12, y: 0.08, z: -0.06, w: 0.12, h: 0.16, d: 0.2, color: cream },
    // Side strips so the black body still reads from the side.
    { x: -0.24, y: 0.42, z: 0.04, w: 0.05, h: 0.34, d: 0.4, color: blackLight },
    { x: 0.24, y: 0.42, z: 0.04, w: 0.05, h: 0.34, d: 0.4, color: blackLight },
  ];
}

/** King Cluck: Bossy in a gold crown and a purple cape, still a chicken. */
function kingCluckBoxes(): VoxelBox[] {
  const purple = 0x7b4bb5;
  const purpleDark = 0x5e368e;
  const gold = 0xf6c33c;
  const goldDark = 0xc9952a;

  return [
    // Cape behind the body.
    { x: 0, y: 0.5, z: 0.38, w: 0.56, h: 0.58, d: 0.08, color: purple },
    { x: 0, y: 0.34, z: 0.4, w: 0.44, h: 0.2, d: 0.06, color: purpleDark },
    { x: 0, y: 0.53, z: 0.42, w: 0.4, h: 0.44, d: 0.03, color: 0x9a6fd6 },
    // Body, chest and belly.
    { x: 0, y: 0.44, z: 0.02, w: 0.54, h: 0.48, d: 0.56, color: CREAM },
    { x: 0, y: 0.36, z: -0.22, w: 0.34, h: 0.32, d: 0.14, color: WHITE },
    { x: 0, y: 0.58, z: 0.22, w: 0.36, h: 0.24, d: 0.12, color: 0xf2e2bb },
    // Head, small comb under the crown and a beak.
    { x: 0, y: 0.68, z: -0.04, w: 0.28, h: 0.2, d: 0.3, color: CREAM },
    { x: 0, y: 0.85, z: -0.08, w: 0.38, h: 0.36, d: 0.38, color: CREAM },
    { x: 0, y: 1.03, z: 0.02, w: 0.2, h: 0.1, d: 0.2, color: RED },
    { x: 0, y: 0.83, z: -0.3, w: 0.18, h: 0.1, d: 0.12, color: ORANGE },
    { x: 0, y: 0.77, z: -0.28, w: 0.14, h: 0.05, d: 0.09, color: ORANGE_DARK },
    { x: 0, y: 0.71, z: -0.27, w: 0.09, h: 0.09, d: 0.06, color: RED },
    // Eyes.
    { x: -0.13, y: 0.88, z: -0.27, w: 0.06, h: 0.07, d: 0.02, color: INK },
    { x: 0.13, y: 0.88, z: -0.27, w: 0.06, h: 0.07, d: 0.02, color: INK },
    { x: -0.145, y: 0.9, z: -0.282, w: 0.02, h: 0.02, d: 0.01, color: WHITE },
    { x: 0.115, y: 0.9, z: -0.282, w: 0.02, h: 0.02, d: 0.01, color: WHITE },
    // Gold crown band, three spikes and a red jewel.
    { x: 0, y: 1.1, z: -0.06, w: 0.38, h: 0.1, d: 0.36, color: gold },
    { x: 0, y: 1.04, z: -0.06, w: 0.4, h: 0.04, d: 0.38, color: goldDark },
    { x: -0.13, y: 1.21, z: -0.06, w: 0.08, h: 0.16, d: 0.1, color: gold },
    { x: 0, y: 1.24, z: -0.06, w: 0.08, h: 0.2, d: 0.1, color: gold },
    { x: 0.13, y: 1.21, z: -0.06, w: 0.08, h: 0.16, d: 0.1, color: gold },
    { x: 0, y: 1.1, z: -0.245, w: 0.07, h: 0.07, d: 0.02, color: RED },
    // Gold cape clasp.
    { x: 0, y: 0.62, z: -0.3, w: 0.1, h: 0.1, d: 0.03, color: gold },
    // Wings and gold-tipped tail.
    { x: -0.3, y: 0.46, z: 0.04, w: 0.07, h: 0.3, d: 0.34, color: CREAM_SHADE },
    { x: 0.3, y: 0.46, z: 0.04, w: 0.07, h: 0.3, d: 0.34, color: CREAM_SHADE },
    { x: 0, y: 0.66, z: 0.3, w: 0.26, h: 0.28, d: 0.12, color: TAN },
    { x: 0, y: 0.82, z: 0.32, w: 0.16, h: 0.1, d: 0.1, color: gold },
    // Feet with a gold spur.
    { x: -0.14, y: 0.06, z: -0.02, w: 0.09, h: 0.06, d: 0.2, color: ORANGE },
    { x: 0.14, y: 0.06, z: -0.02, w: 0.09, h: 0.06, d: 0.2, color: ORANGE },
    { x: -0.14, y: 0.055, z: -0.17, w: 0.11, h: 0.05, d: 0.1, color: ORANGE },
    { x: 0.14, y: 0.055, z: -0.17, w: 0.11, h: 0.05, d: 0.1, color: ORANGE },
    { x: -0.14, y: 0.12, z: 0.12, w: 0.07, h: 0.05, d: 0.05, color: gold },
    { x: 0.14, y: 0.12, z: 0.12, w: 0.07, h: 0.05, d: 0.05, color: gold },
  ];
}

const BUILDERS: Record<CharacterId, () => VoxelBox[]> = {
  bossy: bossyBoxes,
  pip: pipBoxes,
  moss: mossBoxes,
  dash: dashBoxes,
  ruby: rubyBoxes,
  bolt: boltBoxes,
  nori: noriBoxes,
  "king-cluck": kingCluckBoxes,
};

/** The box list for a character. Cosmetic only. */
export function characterBoxes(id: CharacterId): VoxelBox[] {
  return BUILDERS[id]();
}
