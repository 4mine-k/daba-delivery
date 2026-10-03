# Daba-Delivery 🛵

Smart zone-based delivery app — a Progressive Web App (installable, works offline).

## Concept
- The city is split into **zones** by traffic & demand.
- **One driver per zone** — a driver's zone is **fixed** to their account and cannot be changed.
- **Tap-to-Talk**: client & driver communicate with quick buttons, no typing.
- **Dijkstra routing**: shortest path computed **inside the driver's zone only**.
- On login you choose your role: **Customer** or **Driver**.

## Run locally
```
node server.js
```
Then open http://localhost:5173 (or double-click `Start-Daba.bat` on Windows).

## Install as an app
Open the site in Chrome/Edge → use the install icon in the address bar, or the
"⬇️ Install app" button. On mobile: Android Chrome → "Install app"; iPhone Safari →
"Add to Home Screen".

## QR codes
`scan.html` shows QR codes to open/install the app.
Regenerate a public QR after deploying:
```
node set-public-url.js https://your-url.example.com
```

## Tech
Pure HTML / CSS / vanilla JS. No build step, no dependencies.
PWA via `manifest.webmanifest` + `sw.js`.
