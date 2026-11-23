// The World in One Day — Monday, 23 November 2026.
// A deterministic newspaper front page drawn pixel by pixel with the Node 22
// standard library only. No network, no randomness, no wall clock: two runs
// write byte-identical PNGs.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//   -> out/entry.png (1024 x 1024, well under the 1 MiB cap)

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 1024;
const H = 1024;

type RGB = [number, number, number];

// ---- palette -------------------------------------------------------------
const PAPER: RGB = [248, 244, 232];
const INK: RGB = [22, 22, 22];
const RED: RGB = [176, 32, 26];
const TEAL: RGB = [16, 66, 82];
const TEAL_DARK: RGB = [10, 40, 56];
const SKY: RGB = [214, 232, 238];
const BLUE: RGB = [38, 84, 160];
const SEA: RGB = [18, 52, 96];
const SEA_LIGHT: RGB = [44, 96, 148];
const GREY: RGB = [122, 122, 116];
const GREY_LIGHT: RGB = [178, 178, 170];
const DARK: RGB = [30, 34, 40];
const ORANGE: RGB = [232, 120, 24];
const ORANGE_DARK: RGB = [198, 74, 32];
const YELLOW: RGB = [240, 196, 48];
const GREEN: RGB = [52, 120, 64];
const WHITE: RGB = [255, 255, 255];
const BROWN: RGB = [122, 84, 52];

// ---- canvas --------------------------------------------------------------
const px = new Uint8Array(W * H * 3);
for (let i = 0; i < W * H; i++) {
  px[i * 3] = PAPER[0];
  px[i * 3 + 1] = PAPER[1];
  px[i * 3 + 2] = PAPER[2];
}

function set(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 3;
  px[o] = c[0];
  px[o + 1] = c[1];
  px[o + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) set(xx, yy, c);
  }
}

function rect(x: number, y: number, w: number, h: number, c: RGB, t: number): void {
  fillRect(x, y, w, t, c);
  fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c);
  fillRect(x + w - t, y, t, h, c);
}

function hline(x: number, y: number, w: number, c: RGB, t: number): void {
  fillRect(x, y, w, t, c);
}

function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) set(x, y, c);
    }
  }
}

// Disc clipped inside another circle (land masses on the globe).
function discIn(cx: number, cy: number, r: number, c: RGB, ox: number, oy: number, orad: number): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r * r) continue;
      const ex = x - ox;
      const ey = y - oy;
      if (ex * ex + ey * ey <= orad * orad) set(x, y, c);
    }
  }
}

function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    set(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function thickLine(x0: number, y0: number, x1: number, y1: number, r: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    disc(x, y, r, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  const minY = Math.min(y0, y1, y2);
  const maxY = Math.max(y0, y1, y2);
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    const edges: Array<[number, number, number, number]> = [
      [x0, y0, x1, y1],
      [x1, y1, x2, y2],
      [x2, y2, x0, y0],
    ];
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
    }
    if (xs.length >= 2) {
      const lo = Math.ceil(Math.min(xs[0], xs[1]));
      const hi = Math.floor(Math.max(xs[0], xs[1]));
      for (let x = lo; x <= hi; x++) set(x, y, c);
    }
  }
}

// ---- 5x7 bitmap font (rows are 5-bit values, MSB = leftmost pixel) -------
const FONT: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  "2": [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  "3": [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  "6": [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 0x0c, 0x0c],
  ",": [0, 0, 0, 0, 0x0c, 0x04, 0x08],
  ":": [0, 0x0c, 0x0c, 0, 0x0c, 0x0c, 0],
  ";": [0, 0x0c, 0x0c, 0, 0x0c, 0x04, 0x08],
  "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0, 0x04],
  "?": [0x0e, 0x11, 0x01, 0x02, 0x04, 0, 0x04],
  "-": [0, 0, 0, 0x1f, 0, 0, 0],
  "'": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  '"': [0x0a, 0x0a, 0x0a, 0, 0, 0, 0],
  "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  "/": [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  "&": [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  "%": [0x19, 0x19, 0x02, 0x04, 0x08, 0x13, 0x13],
  "+": [0, 0x04, 0x04, 0x1f, 0x04, 0x04, 0],
  "=": [0, 0, 0x1f, 0, 0x1f, 0, 0],
  $: [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
  "\u201c": [0x0a, 0x0a, 0x0a, 0, 0, 0, 0],
  "\u201d": [0x0a, 0x0a, 0x0a, 0, 0, 0, 0],
  "\u2018": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  "\u2019": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  "\u2022": [0, 0x0e, 0x1f, 0x1f, 0x1f, 0x0e, 0],
};

function textWidth(s: string, scale: number, gap = 1): number {
  if (s.length === 0) return 0;
  return s.length * (6 * scale + gap) - gap;
}

function drawText(x: number, y: number, s: string, scale: number, c: RGB, gap = 1): void {
  const up = s.toUpperCase();
  let cx = x;
  for (const ch of up) {
    const g = FONT[ch];
    if (g) {
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if ((g[row] >> (4 - col)) & 1) {
            fillRect(cx + col * scale, y + row * scale, scale, scale, c);
          }
        }
      }
    }
    cx += 6 * scale + gap;
  }
}

function centerText(x0: number, x1: number, y: number, s: string, scale: number, c: RGB, gap = 1): void {
  const w = textWidth(s, scale, gap);
  drawText(x0 + Math.floor((x1 - x0 - w) / 2), y, s, scale, c, gap);
}

function wrapText(s: string, maxW: number, scale: number, gap = 1): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, scale, gap) <= maxW) {
      cur = trial;
    } else {
      if (cur !== "") lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

function paragraph(x: number, y: number, s: string, scale: number, maxW: number, c: RGB, lineH: number): number {
  const lines = wrapText(s, maxW, scale);
  let yy = y;
  for (const ln of lines) {
    drawText(x, yy, ln, scale, c);
    yy += lineH;
  }
  return yy;
}

// ---- PNG encoder (deterministic: fixed filter 0, zlib level 9) -------------
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    raw.set(px.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- illustration panels --------------------------------------------------

// Lead: a cracked globe over a dark teal sky, smoke, and the rejected pact.
function leadPanel(x: number, y: number, w: number, h: number): void {
  // sky bands, dark teal at the bottom
  const bands = 6;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    const c: RGB = [
      Math.round(30 + (10 - 30) * t),
      Math.round(96 + (40 - 96) * t),
      Math.round(116 + (56 - 116) * t),
    ];
    fillRect(x, y + Math.floor((i * h) / bands), w, Math.ceil(h / bands) + 1, c);
  }
  // pale sun
  disc(x + w - 52, y + 48, 26, [238, 220, 150]);
  // the globe
  const gx = x + 150;
  const gy = y + 165;
  const gr = 102;
  disc(gx, gy, gr, BLUE);
  discIn(gx - 34, gy - 34, 30, GREEN, gx, gy, gr);
  discIn(gx + 38, gy + 26, 34, GREEN, gx, gy, gr);
  discIn(gx - 8, gy + 52, 22, GREEN, gx, gy, gr);
  discIn(gx + 52, gy - 42, 18, GREEN, gx, gy, gr);
  // the crack across the globe
  thickLine(gx - 78, gy - 62, gx - 40, gy - 28, 3, INK);
  thickLine(gx - 40, gy - 28, gx - 58, gy + 8, 3, INK);
  thickLine(gx - 58, gy + 8, gx - 12, gy + 34, 3, INK);
  thickLine(gx - 12, gy + 34, gx - 30, gy + 66, 3, INK);
  thickLine(gx - 30, gy + 66, gx + 16, gy + 92, 3, INK);
  // smoke rising from the bottom
  disc(x + 70, y + h - 46, 20, GREY);
  disc(x + 104, y + h - 74, 26, GREY_LIGHT);
  disc(x + w - 84, y + h - 52, 22, GREY);
  disc(x + w - 52, y + h - 82, 26, GREY_LIGHT);
  // the rejected pact strip
  fillRect(x, y + h - 34, w, 34, WHITE);
  centerText(x, x + w, y + h - 26, "ANTALYA PACT: NO DEAL", 2, RED);
  rect(x, y, w, h, INK, 3);
}

// Iran: a tanker on a dusk sea, flame and smoke above the hull.
function iranPanel(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, 70, ORANGE_DARK);
  fillRect(x, y + 70, w, h - 70, SEA);
  hline(x, y + 96, w, SEA_LIGHT, 2);
  hline(x, y + 132, w, SEA_LIGHT, 2);
  hline(x, y + 168, w, SEA_LIGHT, 2);
  centerText(x, x + w, y + 12, "STRAIT OF HORMUZ", 2, WHITE);
  // flame above the tanker
  fillTriangle(x + 132, y + 128, x + 168, y + 128, x + 150, y + 82, ORANGE);
  fillTriangle(x + 140, y + 128, x + 160, y + 128, x + 150, y + 98, YELLOW);
  // smoke
  disc(x + 150, y + 66, 14, GREY_LIGHT);
  disc(x + 168, y + 48, 18, GREY);
  disc(x + 132, y + 46, 12, GREY_LIGHT);
  // tanker hull
  fillRect(x + 30, y + 128, 240, 28, INK);
  fillTriangle(x + 270, y + 128, x + 270, y + 156, x + 296, y + 142, INK);
  // containers on deck
  fillRect(x + 52, y + 104, 52, 24, RED);
  fillRect(x + 110, y + 104, 52, 24, BLUE);
  fillRect(x + 168, y + 104, 52, 24, GREEN);
  // bridge tower
  fillRect(x + 226, y + 92, 40, 36, WHITE);
  fillRect(x + 232, y + 98, 28, 10, SKY);
  rect(x, y, w, h, INK, 3);
}

// ---- front page -----------------------------------------------------------
function compose(): void {
  // masthead
  hline(30, 24, 964, INK, 3);
  centerText(30, 994, 38, "THE WORLD IN ONE DAY", 6, INK);
  hline(30, 88, 964, INK, 1);
  centerText(30, 994, 98, "MONDAY, 23 NOVEMBER 2026", 3, INK);
  hline(30, 122, 964, INK, 3);

  // ---- lead story: COP31 collapses --------------------------------------
  drawText(30, 140, "CLIMATE \u2022 ANTALYA, TURKEY", 2, RED);
  drawText(30, 166, "CLIMATE TALKS", 7, INK);
  drawText(30, 222, "COLLAPSE", 7, INK);
  paragraph(
    30,
    284,
    "The longest climate summit in history ends with no deal as the fossil-fuel fight splits 194 nations.",
    2,
    570,
    INK,
    15,
  );
  paragraph(
    30,
    344,
    "The Antalya Pact fell apart in overtime. The EU and Britain rejected a final text that never mentioned fossil fuels. UN chief Antonio Guterres voiced deep disappointment as attention turns to COP32 in Addis Ababa.",
    2,
    570,
    INK,
    15,
  );
  drawText(30, 434, "IN ANTALYA:", 2, RED);
  paragraph(
    30,
    452,
    "\u201CI understand there is no agreement on this text.\u201D - COP31 president Murat Kurum",
    2,
    570,
    INK,
    15,
  );
  leadPanel(620, 140, 374, 330);

  hline(30, 490, 964, INK, 3);

  // ---- Iran war widens ----------------------------------------------------
  iranPanel(30, 510, 300, 210);
  drawText(350, 512, "MIDDLE EAST \u2022 STRAIT OF HORMUZ", 2, RED);
  drawText(350, 538, "TANKERS HIT AS", 4, INK);
  drawText(350, 572, "IRAN WAR WIDENS", 4, INK);
  paragraph(
    350,
    612,
    "Three oil tankers were attacked in the Strait of Hormuz as Iranian strikes hit an industrial site in Bahrain. Tehran says it will counter the US naval blockade \u2018by all available means\u2019.",
    2,
    644,
    INK,
    15,
  );
  paragraph(
    350,
    700,
    "Bahrain says its air defences intercepted Iranian drones; two people were hurt.",
    2,
    644,
    INK,
    15,
  );

  hline(30, 745, 964, INK, 3);

  // ---- bottom row: three more stories -------------------------------------
  // Ukraine
  drawText(30, 762, "UKRAINE \u2022 KYIV REGION", 2, RED);
  drawText(30, 784, "STRIKES KILL 15", 3, INK);
  drawText(30, 806, "NEAR KYIV", 3, INK);
  paragraph(
    30,
    832,
    "At least 15 dead as Russia intensifies attacks. Kyiv says its drones hit Russian ships off Libya.",
    2,
    308,
    INK,
    15,
  );
  // Ukraine icon: skyline under a dark sky, one building burning
  fillRect(30, 912, 308, 48, DARK);
  disc(120, 928, 16, ORANGE);
  fillRect(48, 922, 44, 38, INK);
  fillRect(108, 912, 52, 48, INK);
  fillRect(176, 926, 40, 34, INK);
  fillRect(232, 918, 52, 42, INK);
  fillRect(58, 930, 8, 8, YELLOW);
  fillRect(122, 926, 8, 8, YELLOW);
  fillRect(246, 928, 8, 8, YELLOW);

  // Belgium
  drawText(358, 762, "BELGIUM \u2022 BRUSSELS", 2, RED);
  drawText(358, 784, "STRIKE BRINGS", 3, INK);
  drawText(358, 806, "BELGIUM TO", 3, INK);
  drawText(358, 828, "A HALT", 3, INK);
  paragraph(
    358,
    854,
    "A national anti-austerity strike brings transport chaos across Belgium.",
    2,
    308,
    INK,
    15,
  );
  // Belgium icon: a stopped train and picket signs
  fillRect(358, 916, 308, 44, GREY_LIGHT);
  fillRect(380, 924, 150, 28, RED);
  fillRect(392, 930, 22, 12, WHITE);
  fillRect(424, 930, 22, 12, WHITE);
  fillRect(456, 930, 22, 12, WHITE);
  fillRect(548, 922, 4, 30, INK);
  fillRect(536, 918, 28, 16, WHITE);
  rect(536, 918, 28, 16, INK, 1);
  fillRect(596, 922, 4, 30, INK);
  fillRect(584, 918, 28, 16, WHITE);
  rect(584, 918, 28, 16, INK, 1);

  // South Korea
  drawText(686, 762, "SOUTH KOREA \u2022 SEOUL", 2, RED);
  drawText(686, 784, "MINISTER QUITS", 3, INK);
  drawText(686, 806, "OVER AI EXAM", 3, INK);
  drawText(686, 828, "CHEATING", 3, INK);
  paragraph(
    686,
    854,
    "The education minister resigns after AI-assisted cheating upends the exam.",
    2,
    308,
    INK,
    15,
  );
  // Korea icon: an exam desk, a paper marked AI, crossed out in red
  fillRect(686, 916, 308, 44, BROWN);
  fillRect(760, 922, 90, 32, WHITE);
  drawText(782, 930, "AI", 3, INK);
  thickLine(764, 924, 846, 952, 3, RED);
  thickLine(846, 924, 764, 952, 3, RED);
  fillRect(880, 926, 60, 26, INK);
  drawText(890, 932, "OUT", 2, WHITE);

  // ---- footer ticker ------------------------------------------------------
  hline(30, 975, 964, INK, 2);
  drawText(30, 986, "ALSO TODAY: Bangladesh vows to jail Hasina if she returns home", 2, INK);
  drawText(30, 1004, "Indonesia factory-fire search goes on \u2022 Paredes collapses in Colombia", 2, INK);
}

compose();

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "entry.png"), encodePng());
