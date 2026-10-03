/* Generate Daba-Delivery PNG icons with pure Node (zlib, no deps).
   New logo: orange location PIN with a white PARCEL box inside. */
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

function hexToRgb(h){const n=parseInt(h.slice(1),16);return [(n>>16)&255,(n>>8)&255,n&255];}
const lerp=(a,b,t)=>a+(b-a)*t;
const mix=(c1,c2,t)=>[lerp(c1[0],c2[0],t),lerp(c1[1],c2[1],t),lerp(c1[2],c2[2],t)];

/* signed-distance helpers on a 512 design grid */
// teardrop pin: union of a circle (head) + triangle (tip)
function inPin(x, y) {
  // head circle
  const cx = 256, cy = 212, r = 156;
  const inHead = (x-cx)*(x-cx) + (y-cy)*(y-cy) <= r*r;
  // tip triangle (from circle sides down to the point)
  const tipX = 256, tipY = 452;
  const leftX = 140, leftY = 300;
  const rightX = 372, rightY = 300;
  const inTri = pointInTri(x, y, tipX, tipY, leftX, leftY, rightX, rightY);
  return inHead || inTri;
}
function sign(x1,y1,x2,y2,x3,y3){return (x1-x3)*(y2-y3)-(x2-x3)*(y1-y3);}
function pointInTri(px,py,ax,ay,bx,by,cx,cy){
  const d1=sign(px,py,ax,ay,bx,by), d2=sign(px,py,bx,by,cx,cy), d3=sign(px,py,cx,cy,ax,ay);
  const neg=(d1<0)||(d2<0)||(d3<0), pos=(d1>0)||(d2>0)||(d3>0);
  return !(neg&&pos);
}
function inRect(x,y,rx,ry,rw,rh){return x>=rx&&x<=rx+rw&&y>=ry&&y<=ry+rh;}

function makeIcon(size, { maskable=false } = {}) {
  const orangeTop=hexToRgb("#FF7A33"), orangeBot=hexToRgb("#F2600C");
  const white=[255,255,255], tape=hexToRgb("#FFE2D0"), flap=hexToRgb("#FFD4BC"), navy=hexToRgb("#1B2A5B");

  const scale = maskable ? 0.74 : 0.9; // fit pin nicely in the tile
  const S = size/512;
  const cx=size/2, cy=size/2;
  const map = (x,y)=>[cx+(x*S-cx)*scale, cy+(y*S-cy)*scale];
  // inverse: design coords from pixel
  const inv = (px,py)=>[ (px-cx)/scale/S + cx/S, (py-cy)/scale/S + cy/S ];

  const radius = maskable ? 0 : size*0.22;
  const data = Buffer.alloc(size*size*4);

  for (let y=0;y<size;y++){
    for (let x=0;x<size;x++){
      const i=(y*size+x)*4;
      // rounded tile mask (non-maskable)
      let alpha=255;
      if(!maskable){
        const ix=Math.min(x,size-1-x), iy=Math.min(y,size-1-y);
        if(ix<radius&&iy<radius){const dx=radius-ix,dy=radius-iy;if(Math.hypot(dx,dy)>radius)alpha=0;}
      }
      // background: soft tile
      let col = maskable ? hexToRgb("#FFF3EC") : hexToRgb("#FFF3EC");

      // design-space coords
      const [dx,dy] = inv(x,y);

      if (inPin(dx,dy)) {
        // vertical gradient inside pin
        const t=Math.max(0,Math.min(1,(dy-56)/(452-56)));
        col = mix(orangeTop,orangeBot,t);

        // parcel box centered at head (256,212)
        const bx=256-78, by=212-48, bw=156, bh=104;
        if (inRect(dx,dy,bx,by,bw,bh)) {
          col = white;
          // horizontal lid line
          if (dy>=212-18 && dy<=212-6) col = tape;
          // vertical tape
          if (dx>=256-10 && dx<=256+10) col = tape;
          // top flap triangle
          if (pointInTri(dx,dy, 256-30,212-48, 256,212-22, 256+30,212-48)) col = flap;
        }
      }

      data[i]=col[0]|0; data[i+1]=col[1]|0; data[i+2]=col[2]|0; data[i+3]=alpha;
    }
  }
  return encodePNG(size,size,data);
}

/* ---- minimal PNG encoder (RGBA) ---- */
function encodePNG(w,h,rgba){
  const raw=Buffer.alloc((w*4+1)*h);
  for(let y=0;y<h;y++){raw[y*(w*4+1)]=0;rgba.copy(raw,y*(w*4+1)+1,y*w*4,(y+1)*w*4);}
  const idat=zlib.deflateSync(raw,{level:9});
  const crcTable=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
  const crc32=(buf)=>{let c=0xffffffff;for(let i=0;i<buf.length;i++)c=crcTable[(c^buf[i])&0xff]^(c>>>8);return (c^0xffffffff)>>>0;};
  const chunk=(type,d)=>{const len=Buffer.alloc(4);len.writeUInt32BE(d.length,0);const t=Buffer.from(type,"ascii");const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([t,d])),0);return Buffer.concat([len,t,d,crc]);};
  const sig=Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([sig,chunk("IHDR",ihdr),chunk("IDAT",idat),chunk("IEND",Buffer.alloc(0))]);
}

const dir=__dirname;
fs.writeFileSync(path.join(dir,"icon-512.png"),makeIcon(512));
fs.writeFileSync(path.join(dir,"icon-192.png"),makeIcon(192));
fs.writeFileSync(path.join(dir,"icon-maskable-512.png"),makeIcon(512,{maskable:true}));
console.log("Icons regenerated:",fs.readdirSync(dir).filter(f=>f.endsWith(".png")).join(", "));
