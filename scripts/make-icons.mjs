/**
 * Generates the Bossy Road app icons.
 *
 * The game avoids binary art from other sources, so the icons are drawn here
 * from the same palette as the voxel scene and encoded as PNG with only Node's
 * built-in zlib. Run `npm run icons` after changing the pixel art.
 *
 * The master drawing is 64x64. Standard icons use a rounded grass tile; the
 * maskable icon fills the square and shrinks the chicken so the comb and feet
 * stay inside the central 80% safe circle.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "icons");
const GRID = 64;

const COLOR = {
  grassTop: 0xa7e874,
  grassBottom: 0x74bb45,
  grassShade: 0x5f9c3d,
  cream: 0xfff4d6,
  creamShade: 0xeddfba,
  tan: 0xf0d9a8,
  ink: 0x26332d,
  red: 0xe84a3f,
  redDark: 0xb8332b,
  orange: 0xf2a03d,
  orangeDark: 0xd9822b,
  white: 0xfffdf4,
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function mix(a, b, t) {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;

  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}

class Canvas {
  constructor(size) {
    this.size = size;
    this.pixels = Buffer.alloc(size * size * 4);
  }

  set(x, y, color, alpha = 255) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) {
      return;
    }

    const i = (y * this.size + x) * 4;
    this.pixels[i] = (color >> 16) & 0xff;
    this.pixels[i + 1] = (color >> 8) & 0xff;
    this.pixels[i + 2] = color & 0xff;
    this.pixels[i + 3] = alpha;
  }

  rect(x0, y0, x1, y1, color) {
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        this.set(x, y, color);
      }
    }
  }
}

function roundedSquare(canvas, radius) {
  const max = canvas.size - 1;
  const radiusSq = radius * radius;

  for (let y = 0; y < canvas.size; y += 1) {
    for (let x = 0; x < canvas.size; x += 1) {
      const nx = x < radius ? radius - x : x > max - radius ? x - (max - radius) : 0;
      const ny = y < radius ? radius - y : y > max - radius ? y - (max - radius) : 0;

      if (nx * nx + ny * ny > radiusSq) {
        continue;
      }

      // A gentle vertical gradient plus a soft top-left highlight makes the
      // tile read as a lit object rather than a flat green square.
      let color = mix(COLOR.grassTop, COLOR.grassBottom, y / max);
      const dx = x - 20;
      const dy = y - 17;
      if (dx * dx + dy * dy < 20 * 20) {
        color = mix(color, 0xffffff, 0.09);
      }
      canvas.set(x, y, color);
    }
  }
}

function fillSquare(canvas) {
  for (let y = 0; y < canvas.size; y += 1) {
    for (let x = 0; x < canvas.size; x += 1) {
      let color = mix(COLOR.grassTop, COLOR.grassBottom, y / (canvas.size - 1));
      const dx = x - 20;
      const dy = y - 17;
      if (dx * dx + dy * dy < 20 * 20) {
        color = mix(color, 0xffffff, 0.09);
      }
      canvas.set(x, y, color);
    }
  }
}

/**
 * Bossy's silhouette: a tall cream body, a proud red comb and a tan tail. The
 * art is scaled about the centre so the maskable variant can shrink into the
 * safe circle without redrawing.
 */
function drawChicken(canvas, scale) {
  const center = (GRID - 1) / 2;

  const rect = (x0, y0, x1, y1, color) => {
    const sx = (value) => Math.round(center + (value - center) * scale);
    canvas.rect(
      Math.min(sx(x0), sx(x1)),
      Math.min(sx(y0), sx(y1)),
      Math.max(sx(x0), sx(x1)),
      Math.max(sx(y0), sx(y1)),
      color,
    );
  };

  // Ground shadow keeps the bird seated on the tile.
  rect(17, 55, 47, 58, COLOR.grassShade);

  // Tail feathers step out behind the body.
  rect(9, 29, 19, 44, COLOR.tan);
  rect(11, 32, 18, 38, COLOR.creamShade);
  rect(7, 36, 12, 43, COLOR.tan);

  // Body, belly shade and wing.
  rect(16, 29, 45, 51, COLOR.cream);
  rect(17, 46, 44, 51, COLOR.creamShade);
  rect(19, 33, 32, 45, COLOR.tan);
  rect(21, 35, 30, 42, COLOR.creamShade);

  // Head, comb and cheek.
  rect(24, 12, 41, 31, COLOR.cream);
  rect(27, 4, 32, 13, COLOR.red);
  rect(33, 2, 38, 13, COLOR.red);
  rect(39, 5, 44, 13, COLOR.redDark);

  // Beak and wattle.
  rect(41, 19, 50, 25, COLOR.orange);
  rect(42, 24, 48, 26, COLOR.orangeDark);
  rect(37, 26, 44, 32, COLOR.red);

  // Eye.
  rect(30, 17, 35, 22, COLOR.ink);
  rect(31, 18, 32, 19, COLOR.white);

  // Legs and three-toed feet.
  rect(22, 50, 26, 56, COLOR.orange);
  rect(35, 50, 39, 56, COLOR.orange);
  rect(18, 55, 28, 58, COLOR.orange);
  rect(33, 55, 43, 58, COLOR.orange);
  rect(20, 58, 23, 60, COLOR.orangeDark);
  rect(26, 58, 29, 60, COLOR.orangeDark);
  rect(35, 58, 38, 60, COLOR.orangeDark);
  rect(41, 58, 44, 60, COLOR.orangeDark);
}

function scalePixels(canvas, size) {
  const out = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sx = Math.floor((x * canvas.size) / size);
      const sy = Math.floor((y * canvas.size) / size);
      const from = (sy * canvas.size + sx) * 4;
      const to = (y * size + x) * 4;
      canvas.pixels.copy(out, to, from, from + 4);
    }
  }

  return out;
}

function buildIcon(size, maskable) {
  const canvas = new Canvas(GRID);

  if (maskable) {
    fillSquare(canvas);
  } else {
    roundedSquare(canvas, 14);
  }

  drawChicken(canvas, maskable ? 0.8 : 0.9);

  return encodePng(size, size, scalePixels(canvas, size));
}

mkdirSync(OUT_DIR, { recursive: true });

const icons = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-512-maskable.png", 512, true],
  ["apple-touch-icon.png", 180, false],
];

for (const [name, size, maskable] of icons) {
  const png = buildIcon(size, maskable);
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`${name.padEnd(26)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
