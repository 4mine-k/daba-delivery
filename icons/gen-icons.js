/* Generate Daba-Delivery PNG icons with pure Node (zlib, no deps).
   Draws: gradient rounded-square bg + white hexagon + orange/white center dot. */
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

// point-in-polygon
function inPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    const hit = (yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function makeIcon(size, { maskable = false } = {}) {
  const brand = hexToRgb("#FF6B2C");
  const navy = hexToRgb("#1B2A5B");
  const white = [255, 255, 255];
  const warm = hexToRgb("#FFE6D8");

  // bg: full for maskable, rounded for normal
  const radius = maskable ? 0 : size * 0.22;
  // hexagon geometry (scaled)
  const scale = maskable ? 0.72 : 1;
  const cx = size / 2, cy = size / 2;
  const S = size / 512; // base coords were on 512 grid
  const toXY = (x, y) => {
    // apply maskable scale around center
    return [cx + (x * S - cx) * scale, cy + (y * S - cy) * scale];
  };
  const hex = [
    toXY(256, 96), toXY(408, 184), toXY(408, 360),
    toXY(256, 448), toXY(104, 360), toXY(104, 184),
  ];
  const centerX = toXY(256, 268)[0], centerY = toXY(256, 268)[1];
  const rOuter = 52 * S * scale, rInner = 22 * S * scale;

  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // rounded corner mask
      let alpha = 255;
      if (!maskable) {
        const insetX = Math.min(x, size - 1 - x);
        const insetY = Math.min(y, size - 1 - y);
        if (insetX < radius && insetY < radius) {
          const dx = radius - insetX, dy = radius - insetY;
          if (Math.hypot(dx, dy) > radius) alpha = 0;
        }
      }
      // diagonal gradient background
      const t = (x + y) / (2 * size);
      let col = mix(brand, navy, t);

      // hexagon fill (warm→white gradient)
      if (inPoly(x, y, hex)) {
        const ht = (y - hex[0][1]) / (hex[3][1] - hex[0][1] || 1);
        col = mix(white, warm, Math.max(0, Math.min(1, ht)));
      }
      // center dot
      const dc = Math.hypot(x - centerX, y - centerY);
      if (dc <= rOuter) col = brand;
      if (dc <= rInner) col = white;

      data[i] = col[0] | 0;
      data[i + 1] = col[1] | 0;
      data[i + 2] = col[2] | 0;
      data[i + 3] = alpha;
    }
  }
  return encodePNG(size, size, data);
}

// Minimal PNG encoder (truecolor + alpha, filter 0 per row)
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter type 0
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  const crcTable = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const dir = __dirname;
fs.writeFileSync(path.join(dir, "icon-512.png"), makeIcon(512));
fs.writeFileSync(path.join(dir, "icon-192.png"), makeIcon(192));
fs.writeFileSync(path.join(dir, "icon-maskable-512.png"), makeIcon(512, { maskable: true }));
console.log("Icons generated:", fs.readdirSync(dir).filter(f => f.endsWith(".png")).join(", "));
