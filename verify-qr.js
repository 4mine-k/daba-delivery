/* Verify a Daba QR PNG decodes back to the expected URL.
   Reads PNG → module matrix → undo mask 0 → read byte-mode payload.
   This validates the custom encoder end-to-end. */
const fs = require("fs");
const zlib = require("zlib");

function decodePNG(file) {
  const buf = fs.readFileSync(file);
  let pos = 8; // skip signature
  let width, height, idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const type = buf.toString("ascii", pos+4, pos+8);
    const data = buf.slice(pos+8, pos+8+len);
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); }
    if (type === "IDAT") idat.push(data);
    if (type === "IEND") break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4 + 1;
  // unfilter (we only used filter 0)
  const px = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const f = raw[y*stride];
    if (f !== 0) throw new Error("unexpected filter " + f);
    raw.copy(px, y*width*4, y*stride+1, y*stride+1 + width*4);
  }
  return { width, height, px };
}

function pngToMatrix(file) {
  const { width, px } = decodePNG(file);
  // detect scale & quiet zone: find first dark pixel scanning diagonally is complex;
  // we know generator: quiet=4 modules, scale=10 px. Derive from known format.
  // module count = width/scale - 2*quiet. Try scale=10 first.
  const scale = 10, quiet = 4;
  const size = width / scale - 2 * quiet;
  const m = Array.from({ length: size }, () => new Array(size).fill(0));
  for (let my = 0; my < size; my++) for (let mx = 0; mx < size; mx++) {
    const x = (mx + quiet) * scale + Math.floor(scale/2);
    const y = (my + quiet) * scale + Math.floor(scale/2);
    const i = (y * width + x) * 4;
    const dark = px[i] < 128; // dark navy -> R low
    m[my][mx] = dark ? 1 : 0;
  }
  return { m, size };
}

// rebuild reserved map identical to encoder, then read data modules in zigzag, undo mask 0
function readPayload(m, size) {
  const version = (size - 17) / 4;
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
  const mark = (r,c) => { if(r>=0&&r<size&&c>=0&&c<size) reserved[r][c]=true; };
  // finders + separators
  const fin = (R,C)=>{ for(let r=-1;r<=7;r++)for(let c=-1;c<=7;c++) mark(R+r,C+c); };
  fin(0,0); fin(0,size-7); fin(size-7,0);
  // timing
  for(let i=0;i<size;i++){ mark(6,i); mark(i,6); }
  // alignment
  const ALIGN={1:[],2:[6,18],3:[6,22],4:[6,26],5:[6,30],6:[6,34],7:[6,22,38],8:[6,24,42],9:[6,26,46],10:[6,28,50]}[version];
  for(const r of ALIGN)for(const c of ALIGN){ if((r<=8&&c<=8)||(r<=8&&c>=size-9)||(r>=size-9&&c<=8))continue; for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++) mark(r+dr,c+dc); }
  // dark module + format areas
  mark(size-8,8);
  for(let i=0;i<=8;i++){ mark(8,i); mark(i,8); }
  for(let i=0;i<8;i++){ mark(8,size-1-i); mark(size-1-i,8); }

  const bits = [];
  let up = true;
  for (let col = size-1; col > 0; col -= 2) {
    if (col === 6) col = 5;
    for (let i = 0; i < size; i++) {
      const row = up ? size-1-i : i;
      for (const c of [col, col-1]) {
        if (!reserved[row][c]) {
          let bit = m[row][c];
          if ((row + c) % 2 === 0) bit ^= 1; // undo mask 0
          bits.push(bit);
        }
      }
    }
    up = !up;
  }
  // read mode + length + bytes
  const read = (n, off) => { let v=0; for(let i=0;i<n;i++) v=(v<<1)|bits[off+i]; return v; };
  const mode = read(4, 0);
  if (mode !== 0b0100) throw new Error("not byte mode: " + mode.toString(2));
  const lenBits = version < 10 ? 8 : 16;
  const len = read(lenBits, 4);
  let off = 4 + lenBits;
  const out = [];
  for (let i = 0; i < len; i++) { out.push(read(8, off)); off += 8; }
  return Buffer.from(out).toString("utf8");
}

const file = process.argv[2];
const expected = process.argv[3];
const { m, size } = pngToMatrix(file);
const url = readPayload(m, size);
const ok = expected ? url === expected : true;
console.log(`decoded="${url}"  size=${size}  ${expected ? (ok ? "MATCH ✓" : "MISMATCH ✗ (expected " + expected + ")") : ""}`);
process.exit(ok ? 0 : 1);
