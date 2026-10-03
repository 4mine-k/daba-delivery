/* Regenerate the public QR + update scan.html for a hosted URL.
   Usage:  node set-public-url.js https://your-app.netlify.app
   Produces qr-public.png and switches scan.html's default tab to it. */
const fs = require("fs");
const path = require("path");
const { makeQR } = require("./gen-qr.js");

const url = process.argv[2];
if (!url || !/^https?:\/\//.test(url)) {
  console.error('Usage: node set-public-url.js https://your-app.example.com');
  process.exit(1);
}

const out = path.join(__dirname, "qr-public.png");
const info = makeQR(url, out, 10);
console.log(`Public QR generated → ${out}`);
console.log(`  url=${url}  version=${info.version}  module=${info.size}`);

// Patch scan.html: add/replace a "Public" pane and make it the default.
const scanPath = path.join(__dirname, "scan.html");
let html = fs.readFileSync(scanPath, "utf8");

const publicTab = `<button class="tab active" data-pane="pub">🌍 Anyone (public)</button>\n      `;
const publicPane = `<div class="pane active" id="pane-pub">
      <div class="qr-box"><img src="qr-public.png" alt="QR code — public URL" /></div>
      <div class="url">${url}</div>
      <div class="hint">🌍 <b>Works everywhere</b> — any phone, any network (4G/5G or any Wi-Fi). Scan to open & install the app.</div>
      <div class="steps">
        <b>After scanning:</b><br>
        • <b>Android (Chrome):</b> menu ⋮ → “Install app”.<br>
        • <b>iPhone (Safari):</b> Share → “Add to Home Screen”.
      </div>
    </div>
    `;

if (html.includes('id="pane-pub"')) {
  // replace existing public pane
  html = html.replace(/<div class="pane[^"]*" id="pane-pub">[\s\S]*?<\/div>\s*<\/div>\s*/,
    publicPane);
  html = html.replace(/<img src="qr-public\.png"[\s\S]*?class="url">[^<]*<\/div>/,
    `<img src="qr-public.png" alt="QR code — public URL" /></div>\n      <div class="url">${url}</div>`);
} else {
  // make others inactive, insert public tab first + public pane first
  html = html.replace(/class="tab active"/, 'class="tab"');
  html = html.replace(/class="pane active"/, 'class="pane"');
  html = html.replace(/(<div class="tabs">\s*)/, `$1${publicTab}`);
  html = html.replace(/(<\/div>\s*<div class="pane")/, `</div>\n    ${publicPane}<div class="pane"`);
}
fs.writeFileSync(scanPath, html);
console.log("scan.html updated — the public QR is now the default tab.");
