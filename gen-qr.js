/* ============================================================
   Daba-Delivery — Zero-dependency QR code generator (Node)
   Encodes a URL into a QR PNG. Byte mode, EC level M, auto version.
   Usage: node gen-qr.js "https://your-url"
   ============================================================ */
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

/* ---------- Galois field (GF 256) for Reed-Solomon ---------- */
const EXP = new Array(512), LOG = new Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const gmul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

function rsGenPoly(deg) {
  let poly = [1];
  for (let i = 0; i < deg; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gmul(poly[j], EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}
function rsEncode(data, ecLen) {
  const gen = rsGenPoly(ecLen);
  const res = new Array(ecLen).fill(0);
  for (const d of data) {
    const factor = d ^ res[0];
    res.shift(); res.push(0);
    for (let i = 0; i < gen.length; i++) res[i] ^= gmul(gen[i], factor);
  }
  return res;
}

/* ---------- QR capacity tables (EC level M, byte mode) ---------- */
// [version]: { totalCW, ecPerBlock, blocks:[ [count, dataCW], ... ] }
const VERSIONS = {
  1:  { ec: 10, groups: [[1, 16]] },
  2:  { ec: 16, groups: [[1, 28]] },
  3:  { ec: 26, groups: [[1, 44]] },
  4:  { ec: 18, groups: [[2, 32]] },
  5:  { ec: 24, groups: [[2, 43]] },
  6:  { ec: 16, groups: [[4, 27]] },
  7:  { ec: 18, groups: [[4, 31]] },
  8:  { ec: 22, groups: [[2, 38], [2, 39]] },
  9:  { ec: 22, groups: [[3, 36], [2, 37]] },
  10: { ec: 26, groups: [[4, 43], [1, 44]] },
};
const byteCapacityM = { 1:14,2:26,3:42,4:62,5:84,6:106,7:122,8:152,9:180,10:213 };

function chooseVersion(len) {
  for (let v = 1; v <= 10; v++) if (byteCapacityM[v] >= len) return v;
  throw new Error("URL too long for this generator (max ~213 bytes). Use a shorter URL.");
}

/* alignment pattern centers per version */
const ALIGN = {
  1: [], 2: [6,18], 3: [6,22], 4: [6,26], 5: [6,30],
  6: [6,34], 7: [6,22,38], 8: [6,24,42], 9: [6,26,46], 10: [6,28,50],
};

/* ---------- bit buffer ---------- */
class Bits {
  constructor(){ this.arr=[]; }
  push(val, len){ for(let i=len-1;i>=0;i--) this.arr.push((val>>i)&1); }
  get length(){ return this.arr.length; }
}

/* ---------- build data codewords ---------- */
function buildData(text, version) {
  const bytes = Buffer.from(text, "utf8");
  const v = VERSIONS[version];
  const totalDataCW = v.groups.reduce((s, [c, d]) => s + c * d, 0);
  const bits = new Bits();
  bits.push(0b0100, 4);                       // byte mode
  bits.push(bytes.length, version < 10 ? 8 : 16); // char count (8 bits for v1-9)
  for (const b of bytes) bits.push(b, 8);
  // terminator
  const cap = totalDataCW * 8;
  for (let i = 0; i < 4 && bits.length < cap; i++) bits.arr.push(0);
  // pad to byte
  while (bits.length % 8 !== 0) bits.arr.push(0);
  // pad bytes
  const padBytes = [0xec, 0x11]; let pi = 0;
  while (bits.length < cap) { bits.push(padBytes[pi++ % 2], 8); }
  // to codewords
  const dcw = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits.arr[i + j];
    dcw.push(b);
  }
  // split into blocks, compute EC, interleave
  const blocks = [];
  let idx = 0;
  for (const [count, dataLen] of v.groups) {
    for (let c = 0; c < count; c++) {
      const data = dcw.slice(idx, idx + dataLen); idx += dataLen;
      const ec = rsEncode(data, v.ec);
      blocks.push({ data, ec });
    }
  }
  const maxData = Math.max(...blocks.map(b => b.data.length));
  const result = [];
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.data.length) result.push(b.data[i]);
  for (let i = 0; i < v.ec; i++) for (const b of blocks) result.push(b.ec[i]);
  return result;
}

/* ---------- matrix construction ---------- */
function buildMatrix(codewords, version) {
  const size = 17 + version * 4;
  const m = Array.from({ length: size }, () => new Array(size).fill(null));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

  const place = (r, c, val) => { if (r>=0&&r<size&&c>=0&&c<size){ m[r][c]=val; reserved[r][c]=true; } };

  // finder pattern
  const finder = (R, C) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const rr = R + r, cc = C + c;
      if (rr<0||rr>=size||cc<0||cc>=size) continue;
      const inRing = (r>=0&&r<=6&&(c===0||c===6)) || (c>=0&&c<=6&&(r===0||r===6));
      const inCore = (r>=2&&r<=4&&c>=2&&c<=4);
      place(rr, cc, (inRing||inCore) ? 1 : 0);
    }
  };
  finder(0,0); finder(0,size-7); finder(size-7,0);

  // separators handled by finder's -1 border zeros above where in-range

  // timing patterns
  for (let i = 8; i < size-8; i++){ place(6,i,i%2===0?1:0); place(i,6,i%2===0?1:0); }

  // alignment patterns
  const centers = ALIGN[version];
  for (const r of centers) for (const c of centers) {
    // skip if overlapping finders
    if ((r<=8&&c<=8)||(r<=8&&c>=size-9)||(r>=size-9&&c<=8)) continue;
    for (let dr=-2; dr<=2; dr++) for (let dc=-2; dc<=2; dc++){
      const ring = Math.max(Math.abs(dr),Math.abs(dc));
      place(r+dr, c+dc, (ring===2||ring===0)?1:0);
    }
  }

  // dark module
  place(size-8, 8, 1);

  // reserve format info areas
  for (let i=0;i<=8;i++){ if(i!==6){ reserved[8][i]=true; reserved[i][8]=true; } }
  for (let i=0;i<8;i++){ reserved[8][size-1-i]=true; reserved[size-1-i][8]=true; }
  reserved[8][7]=true; reserved[7][8]=true; reserved[8][8]=true;

  // place data with zigzag
  let bitIdx = 0;
  const allBits = [];
  for (const cw of codewords) for (let b=7;b>=0;b--) allBits.push((cw>>b)&1);

  let up = true;
  for (let col = size-1; col > 0; col -= 2) {
    if (col === 6) col = 5; // skip timing column
    for (let i = 0; i < size; i++) {
      const row = up ? size-1-i : i;
      for (const c of [col, col-1]) {
        if (!reserved[row][c]) {
          let bit = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
          // mask 0: (row+col)%2==0
          if ((row + c) % 2 === 0) bit ^= 1;
          m[row][c] = bit;
        }
      }
    }
    up = !up;
  }

  // format info for EC level M + mask 0
  // 15-bit format string (precomputed) for (M, mask0)
  const FORMAT_M_MASK0 = 0b101010000010010;
  const fmt = FORMAT_M_MASK0;
  const getBit = (n) => (fmt >> n) & 1;
  // around top-left
  const fmtPos1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
  for (let i=0;i<15;i++){ const [r,c]=fmtPos1[i]; m[r][c]=getBit(i); }
  // around top-right + bottom-left
  const fmtPos2 = [[size-1,8],[size-2,8],[size-3,8],[size-4,8],[size-5,8],[size-6,8],[size-7,8],
                   [8,size-8],[8,size-7],[8,size-6],[8,size-5],[8,size-4],[8,size-3],[8,size-2],[8,size-1]];
  for (let i=0;i<15;i++){ const [r,c]=fmtPos2[i]; m[r][c]=getBit(i); }

  return { m, size };
}

/* ---------- render PNG (black/white, scaled, with quiet zone) ---------- */
function matrixToPNG(m, size, scale = 10, quiet = 4) {
  const dim = (size + quiet * 2) * scale;
  const rgba = Buffer.alloc(dim * dim * 4, 255); // white
  for (let y = 0; y < dim; y++) {
    for (let x = 0; x < dim; x++) {
      const mx = Math.floor(x / scale) - quiet;
      const my = Math.floor(y / scale) - quiet;
      let dark = false;
      if (mx >= 0 && mx < size && my >= 0 && my < size) dark = m[my][mx] === 1;
      if (dark) {
        const i = (y * dim + x) * 4;
        rgba[i] = 0x16; rgba[i+1] = 0x23; rgba[i+2] = 0x3D; rgba[i+3] = 255; // dark navy
      }
    }
  }
  return encodePNG(dim, dim, rgba);
}

/* ---------- minimal PNG encoder (RGBA) ---------- */
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const crcTable = (() => { const t=[]; for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=c&1?0xedb88320^(c>>>1):c>>>1; t[n]=c>>>0;} return t; })();
  const crc32 = (buf) => { let c=0xffffffff; for(let i=0;i<buf.length;i++) c=crcTable[(c^buf[i])&0xff]^(c>>>8); return (c^0xffffffff)>>>0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length,0);
    const t = Buffer.from(type,"ascii");
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t,data])),0);
    return Buffer.concat([len,t,data,crc]);
  };
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4);
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  return Buffer.concat([sig, chunk("IHDR",ihdr), chunk("IDAT",idat), chunk("IEND",Buffer.alloc(0))]);
}

/* ---------- main ---------- */
function makeQR(text, outFile, scale = 10) {
  const version = chooseVersion(Buffer.from(text, "utf8").length);
  const codewords = buildData(text, version);
  const { m, size } = buildMatrix(codewords, version);
  const png = matrixToPNG(m, size, scale);
  fs.writeFileSync(outFile, png);
  return { version, size, bytes: png.length };
}

module.exports = { makeQR };

if (require.main === module) {
  const url = process.argv[2] || "http://localhost:5173";
  const out = process.argv[3] || path.join(__dirname, "qr.png");
  const info = makeQR(url, out);
  console.log(`QR generated → ${out}`);
  console.log(`  url=${url}  version=${info.version}  module=${info.size}  ${info.bytes}B`);
}
