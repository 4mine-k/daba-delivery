/* ============================================================
   DABA-DELIVERY — APP LOGIC (vanilla JS, no build needed)
   ============================================================ */

/* ---------- tiny helpers ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const toast = (msg) => {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("show"), 2200);
};

/* ---------- app state ---------- */
const STATE = {
  user: JSON.parse(localStorage.getItem("daba_user") || "null"),
  role: "customer",
};

/* ============================================================
   1. BACKGROUND PARTICLES
   ============================================================ */
(function particles() {
  const cv = $("#particles");
  const ctx = cv.getContext("2d");
  let w, h, pts;
  const resize = () => {
    w = cv.width = innerWidth;
    h = cv.height = innerHeight;
    pts = Array.from({ length: Math.min(70, Math.floor(w / 22)) }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35,
      r: Math.random() * 2 + 1,
    }));
  };
  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(27,42,91,.18)";
      ctx.fill();
    }
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 120) {
          ctx.strokeStyle = `rgba(255,107,44,${0.12 * (1 - d / 120)})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    requestAnimationFrame(draw);
  };
  addEventListener("resize", resize);
  resize(); draw();
})();

/* ============================================================
   2. AUTH SCREEN
   ============================================================ */
// tabs
$$(".tab").forEach(tab =>
  tab.addEventListener("click", () => {
    $$(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    $$(".auth-form").forEach(f => f.classList.remove("active"));
    $(`#${tab.dataset.tab}Form`).classList.add("active");
  })
);
// role pick (works in both forms)
$$(".role-pick").forEach(group =>
  group.addEventListener("click", e => {
    const opt = e.target.closest(".role-opt");
    if (!opt) return;
    $$(".role-opt", group).forEach(o => o.classList.remove("active"));
    opt.classList.add("active");
    STATE.role = opt.dataset.role;
  })
);
// submit
const doAuth = (name, email) => {
  STATE.user = { name: name || email.split("@")[0], email, role: STATE.role };
  // A driver is PERMANENTLY assigned to ONE fixed zone at account creation / login.
  // The zone is derived deterministically from the account email so it is stable
  // across logins and CANNOT be changed by the driver.
  if (STATE.role === "driver") {
    STATE.user.zone = zoneForAccount(STATE.user.email);
  }
  localStorage.setItem("daba_user", JSON.stringify(STATE.user));
  enterApp();
};
// deterministic fixed-zone assignment (stable hash of the email)
function zoneForAccount(email) {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return h % ZONES.length;
}
$("#loginForm").addEventListener("submit", e => {
  e.preventDefault();
  const f = e.target;
  // read active role inside this form
  const active = $(".role-opt.active", f);
  STATE.role = active ? active.dataset.role : "customer";
  doAuth(null, f.email.value);
});
$("#signupForm").addEventListener("submit", e => {
  e.preventDefault();
  const f = e.target;
  const active = $(".role-opt.active", f);
  STATE.role = active ? active.dataset.role : "customer";
  doAuth(f.name.value, f.email.value);
});

/* ============================================================
   3. APP SHELL / NAV
   ============================================================ */
function enterApp() {
  $("#auth").classList.remove("active");
  $("#app").classList.add("active");
  STATE.role = STATE.user.role;
  $("#userName").textContent = STATE.user.name;
  $("#userRoleBadge").textContent = STATE.role === "driver"
    ? "Driver · " + ZONES[STATE.user.zone ?? 0].name
    : "Customer";
  renderDashboard();
  renderRole();
  showView("dashboard");
  // map renders on demand (needs visible canvas)
  toast(`Welcome, ${STATE.user.name}! 🚀`);
}

$$(".nav-btn").forEach(b =>
  b.addEventListener("click", () => showView(b.dataset.view))
);
function showView(name) {
  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  $$(".view").forEach(v => v.classList.remove("active"));
  $(`#view-${name}`).classList.add("active");
  if (name === "map") { renderMapShell(); setTimeout(initMap, 60); }
  if (name === "dashboard") animateStats();
}
$("#logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("daba_user");
  STATE.user = null;
  $("#app").classList.remove("active");
  $("#auth").classList.add("active");
  toast("Logged out");
});

/* ============================================================
   4. DEMO DATA
   ============================================================ */
const ZONES = [
  { name: "Downtown",   color: "#FF6B2C", traffic: 92, deliveries: 48, driver: "Youssef" },
  { name: "Marina",     color: "#12B6A8", traffic: 61, deliveries: 27, driver: "Salma" },
  { name: "Old Town",   color: "#1B2A5B", traffic: 74, deliveries: 33, driver: "Karim" },
  { name: "Riverside",  color: "#9333EA", traffic: 48, deliveries: 19, driver: "Nadia" },
  { name: "Hillside",   color: "#F59E0B", traffic: 35, deliveries: 12, driver: "Omar"  },
];

/* ============================================================
   5. DASHBOARD
   ============================================================ */
function renderDashboard() {
  const totalDeliveries = ZONES.reduce((s, z) => s + z.deliveries, 0);
  const avgTraffic = Math.round(ZONES.reduce((s, z) => s + z.traffic, 0) / ZONES.length);

  $("#view-dashboard").innerHTML = `
    <h2 class="section-title">📊 Operations Dashboard</h2>
    <div class="grid cards-4">
      ${statCard("📦", "Active deliveries", totalDeliveries, "+12% today")}
      ${statCard("🗺️", "Live zones", ZONES.length, "auto-balanced")}
      ${statCard("🛵", "Drivers online", ZONES.length, "1 per zone")}
      ${statCard("⚡", "Avg. traffic", avgTraffic + "%", "optimized")}
    </div>

    <div class="grid cards-2" style="margin-top:18px">
      <div class="card">
        <div class="mini-title" style="font-family:var(--head);font-weight:700;margin-bottom:6px">Zones by load</div>
        <p style="color:var(--muted);font-size:.85rem;margin-bottom:12px">Each driver owns one zone. Load = traffic × delivery density.</p>
        ${ZONES.map(z => `
          <div class="zone-row">
            <span class="zone-chip" style="background:${z.color}"></span>
            <div>
              <div class="z-name">${z.name}</div>
              <div class="bar"><i data-w="${z.traffic}"></i></div>
            </div>
            <div class="z-meta">
              <div><b>${z.deliveries}</b> deliveries</div>
              <div>🛵 ${z.driver}</div>
            </div>
          </div>`).join("")}
      </div>

      <div class="card">
        <div class="mini-title" style="font-family:var(--head);font-weight:700;margin-bottom:6px">How Daba works</div>
        <ol style="margin:10px 0 0 18px;display:grid;gap:12px;color:var(--muted);font-size:.9rem;line-height:1.5">
          <li><b style="color:var(--ink)">Scan & split</b><br>The map is divided into zones by live traffic & demand.</li>
          <li><b style="color:var(--ink)">Assign</b><br>One driver per zone handles all its deliveries.</li>
          <li><b style="color:var(--ink)">Tap-to-Talk</b><br>Client & driver agree on time/place with buttons — no typing.</li>
          <li><b style="color:var(--ink)">Dijkstra routing</b><br>Shortest path computed live via GPS graph.</li>
        </ol>
      </div>
    </div>`;
  animateStats();
}
function statCard(ico, label, num, sub) {
  return `<div class="card stat">
    <div class="stat-top"><span>${label}</span><span class="stat-ico">${ico}</span></div>
    <div class="stat-num" data-count="${typeof num === "number" ? num : ""}">${num}</div>
    <div class="stat-sub">▲ ${sub}</div>
  </div>`;
}
function animateStats() {
  $$("#view-dashboard .stat-num").forEach(el => {
    const target = +el.dataset.count;
    if (!target) return;
    let n = 0; const step = Math.max(1, Math.round(target / 28));
    const iv = setInterval(() => {
      n += step;
      if (n >= target) { n = target; clearInterval(iv); }
      el.textContent = n;
    }, 28);
  });
  $$("#view-dashboard .bar > i").forEach(b => {
    requestAnimationFrame(() => (b.style.width = b.dataset.w + "%"));
  });
}

/* ============================================================
   6. ROLE SPACE (Customer / Driver) + TAP-TO-TALK
   ============================================================ */
const CUSTOMER_QUICK = [
  "I'm available now 👍", "Please come in 15 min", "Leave at the door",
  "Call me on arrival 📞", "I'm at work, be quick 🏢", "Where are you? 📍",
];
const DRIVER_QUICK = [
  "On my way 🛵", "Arriving in 5 min", "I'm downstairs 📍",
  "Running 10 min late ⏳", "Delivery completed ✅", "Can you confirm address? 🏠",
];

function renderRole() {
  if (STATE.role === "driver") renderDriver();
  else renderCustomer();
}

function renderCustomer() {
  $("#view-role").innerHTML = `
    <div class="role-head">
      <div class="big-ico">🧑</div>
      <div><h2>Customer Space</h2><p>Create a delivery and talk to your driver in one tap.</p></div>
    </div>
    <div class="grid cards-2">
      <div class="card">
        <div class="mini-title" style="font-family:var(--head);font-weight:700;margin-bottom:14px">New delivery</div>
        <label class="field">Pickup address<input id="cPickup" placeholder="12 Rue Hassan, Downtown"/></label>
        <label class="field">Drop-off address<input id="cDrop" placeholder="Marina Tower, Apt 7"/></label>
        <label class="field">Package type
          <select id="cType"><option>Documents</option><option>Food</option><option>Parcel</option><option>Fragile</option></select>
        </label>
        <label class="field">Preferred time<input id="cTime" placeholder="ASAP / 18:30"/></label>
        <button class="btn-outline" id="cCreate">Request delivery 🚀</button>
      </div>
      ${chatBox("Youssef", "Your driver · Downtown zone", CUSTOMER_QUICK, [
        { who: "them", text: "Hi! I'll be your driver today 🛵" },
        { who: "them", text: "When should I pick up your package?" },
      ])}
    </div>`;

  $("#cCreate").addEventListener("click", () => {
    if (!$("#cPickup").value || !$("#cDrop").value) return toast("Fill pickup & drop-off ✍️");
    toast("Delivery requested! Driver notified ✅");
    pushMsg("me", `New delivery: ${$("#cType").value} → ${$("#cDrop").value}`);
    setTimeout(() => pushMsg("them", "Got it! On my way 🛵"), 900);
  });
  wireChat();
}

function renderDriver() {
  const zone = ZONES[STATE.user.zone ?? 0];
  $("#view-role").innerHTML = `
    <div class="role-head">
      <div class="big-ico">🛵</div>
      <div><h2>Driver Space</h2><p>You own <b>${zone.name}</b> — ${zone.deliveries} deliveries today.</p></div>
    </div>
    <div class="grid cards-2">
      <div class="card">
        <div class="mini-title" style="font-family:var(--head);font-weight:700;margin-bottom:14px">Your deliveries · ${zone.name}</div>
        ${deliveryRow("📄", "Documents", "Rue Hassan → Marina Tower", "transit", "In transit")}
        ${deliveryRow("🍔", "Food order", "Resto Atlas → Apt 7", "pending", "Pending")}
        ${deliveryRow("📦", "Parcel", "Depot → Hillside 22", "pending", "Pending")}
        ${deliveryRow("🎁", "Gift box", "Mall → Old Town 5", "done", "Delivered")}
        <button class="btn-outline" style="margin-top:6px" id="dRoute">Optimize my route (Dijkstra) 🧭</button>
      </div>
      ${chatBox("Sara M.", "Customer · waiting", DRIVER_QUICK, [
        { who: "them", text: "Hi, are you close? 🙂" },
      ])}
    </div>`;

  $("#dRoute").addEventListener("click", () => { showView("map"); setTimeout(runDijkstra, 500); });
  wireChat();
}

function deliveryRow(ico, name, path, cls, label) {
  return `<div class="delivery">
    <div class="d-ico">${ico}</div>
    <div class="d-main"><b>${name}</b><small>${path}</small></div>
    <span class="pill ${cls}">${label}</span>
  </div>`;
}

/* ---- chat component ---- */
function chatBox(name, status, quick, seed) {
  return `<div class="card" style="padding:0;overflow:hidden">
    <div class="chat-box">
      <div class="chat-head">
        <span class="av">${name[0]}</span>
        <div><div>${name}</div><div style="font-size:.72rem;color:var(--muted);font-weight:500">${status}</div></div>
        <small>● online</small>
      </div>
      <div class="chat-msgs" id="chatMsgs">
        ${seed.map(m => `<div class="msg ${m.who}">${m.text}</div>`).join("")}
      </div>
      <div class="quick-wrap">
        <div class="ql">Tap to talk — no typing needed</div>
        <div class="quick-btns" id="quickBtns">
          ${quick.map(q => `<button class="quick">${q}</button>`).join("")}
        </div>
      </div>
    </div>
  </div>`;
}
function pushMsg(who, text) {
  const box = $("#chatMsgs");
  if (!box) return;
  const d = document.createElement("div");
  d.className = `msg ${who}`;
  d.textContent = text;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}
function wireChat() {
  const auto = {
    "I'm available now 👍": "Great, heading to you now 🛵",
    "Please come in 15 min": "No problem, see you in 15 ⏳",
    "Leave at the door": "Sure, I'll leave it safely at the door 📦",
    "On my way 🛵": "Perfect, I'll be ready 🙌",
    "I'm downstairs 📍": "Coming down now! 🏃",
    "Delivery completed ✅": "Thank you so much! ⭐⭐⭐⭐⭐",
  };
  $$("#quickBtns .quick").forEach(btn =>
    btn.addEventListener("click", () => {
      const text = btn.textContent;
      pushMsg("me", text);
      const reply = auto[text];
      if (reply) setTimeout(() => pushMsg("them", reply), 850);
    })
  );
}

/* ============================================================
   7. REALISTIC CITY MAP + ZONES + ZONE-SCOPED DIJKSTRA
   ------------------------------------------------------------
   The city is divided into rectangular DISTRICTS (zones).
   Each driver owns ONE zone. Dijkstra runs ONLY on the road
   network INSIDE the active zone — never across the whole map.
   ============================================================ */
let MAP = {
  built: false, W: 0, H: 0, ctx: null,
  nodes: [],        // {x,y,zone,r,c}
  adj: {},          // adjacency: id -> [{to,w}]
  zoneNodes: {},    // zoneIdx -> [nodeId,...]
  activeZone: 0,    // the driver's zone — Dijkstra is restricted here
  path: [], src: null, dst: null,
  decor: null,      // static decorations (river, park, blocks)
};

function renderMapShell() {
  $("#view-map").innerHTML = `
    <h2 class="section-title">🗺️ Live City Map — one zone per driver</h2>
    <div class="map-wrap">
      <div>
        <div class="map-stage"><canvas id="mapCanvas"></canvas></div>
        <div class="map-legend" id="mapLegend"></div>
      </div>
      <div class="card map-side">
        <div class="mini-title">Active delivery zone</div>
        <p style="color:var(--muted);font-size:.82rem;margin:6px 0 10px">
          A driver is responsible for <b>one zone only</b>. Dijkstra computes the shortest route
          <b>inside that zone</b> — not across the whole city.
        </p>
        <select id="zoneSelect" class="map-zone-select"></select>
        <div class="route-info" style="margin-top:14px">
          <div class="ri">Zone roads <b id="riEdges">0</b></div>
          <div class="ri">Zone stops <b id="riNodes">0</b></div>
          <div class="ri">Path length <b id="riLen">—</b></div>
          <div class="ri">Visited <b id="riVisited">—</b></div>
        </div>
        <button class="btn-outline" style="margin-top:16px" id="btnDijkstra">Run Dijkstra in this zone 🧭</button>
        <button class="btn-outline" style="margin-top:10px" id="btnShuffle">New pickup / drop-off 🔀</button>
      </div>
    </div>`;
}

/* zone rectangles (fractions of the canvas). 5 districts in a 3+2 layout. */
const ZONE_RECTS = [
  { x: .02, y: .04, w: .40, h: .52 }, // Downtown   (top-left, biggest)
  { x: .44, y: .04, w: .30, h: .40 }, // Marina     (top-mid)
  { x: .76, y: .04, w: .22, h: .56 }, // Old Town   (right)
  { x: .02, y: .60, w: .46, h: .36 }, // Riverside  (bottom-left)
  { x: .50, y: .48, w: .48, h: .48 }, // Hillside   (bottom-right)
];

function initMap() {
  if (!$("#mapCanvas")) renderMapShell();
  const cv = $("#mapCanvas");
  const stage = cv.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const W = stage.clientWidth, H = stage.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  cv.style.width = W + "px"; cv.style.height = H + "px";
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  MAP.ctx = ctx; MAP.W = W; MAP.H = H;

  buildCity(W, H); // rebuild on resize so it fits

  const isDriver = STATE.role === "driver";
  // DRIVER: zone is FIXED to their account and cannot be changed.
  // CUSTOMER / viewer: can browse zones via the selector.
  MAP.activeZone = isDriver ? (STATE.user.zone ?? 0) : (MAP.activeZone ?? 0);

  // legend
  $("#mapLegend").innerHTML = ZONES.map((z, i) =>
    `<span><i style="background:${z.color}"></i>${z.name}</span>`).join("");

  const sideTitle = $(".map-side .mini-title");
  const sel = $("#zoneSelect");

  if (isDriver) {
    // Replace the dropdown with a LOCKED, non-editable zone display.
    const z = ZONES[MAP.activeZone];
    if (sideTitle) sideTitle.textContent = "Your assigned zone (locked)";
    sel.outerHTML = `
      <div class="zone-locked" id="zoneLocked">
        <span class="zl-dot" style="background:${z.color}"></span>
        <div class="zl-text">
          <strong>${z.name}</strong>
          <small>🔒 Fixed to your account</small>
        </div>
        <span class="zl-lock">🔒</span>
      </div>`;
  } else {
    if (sideTitle) sideTitle.textContent = "Browse zones (viewer)";
    sel.innerHTML = ZONES.map((z, i) =>
      `<option value="${i}">${z.name} — 🛵 ${z.driver}</option>`).join("");
    sel.value = MAP.activeZone;
    sel.onchange = () => { setActiveZone(+sel.value); };
  }

  $("#btnDijkstra").onclick = runDijkstra;
  $("#btnShuffle").onclick = pickRandomEndpoints;

  setActiveZone(MAP.activeZone, true);
}

/* Build a realistic-looking city: street grid per district + decor */
function buildCity(W, H) {
  const nodes = [];
  const adj = {};
  const zoneNodes = {};
  const addEdge = (a, b) => {
    const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
    (adj[a] = adj[a] || []).push({ to: b, w: d });
    (adj[b] = adj[b] || []).push({ to: a, w: d });
  };

  ZONE_RECTS.forEach((rect, zi) => {
    const rx = rect.x * W, ry = rect.y * H, rw = rect.w * W, rh = rect.h * H;
    const pad = 18;
    // choose grid density proportional to zone size
    const cols = Math.max(3, Math.round(rw / 70));
    const rows = Math.max(3, Math.round(rh / 70));
    const ids = [];
    const start = nodes.length;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const x = rx + pad + (c * (rw - 2 * pad)) / (cols - 1) + (Math.random() - .5) * 10;
        const y = ry + pad + (r * (rh - 2 * pad)) / (rows - 1) + (Math.random() - .5) * 10;
        nodes.push({ x, y, zone: zi, r, c });
        ids.push(nodes.length - 1);
      }
    const id = (r, c) => start + r * cols + c;
    // connect streets (grid) — stays INSIDE the zone only
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        if (c < cols - 1) addEdge(id(r, c), id(r, c + 1));
        if (r < rows - 1) addEdge(id(r, c), id(r + 1, c));
        // a few diagonals for a less rigid, more real feel
        if (r < rows - 1 && c < cols - 1 && Math.random() < .22) addEdge(id(r, c), id(r + 1, c + 1));
      }
    zoneNodes[zi] = ids;
    rect._px = { rx, ry, rw, rh, cols, rows };
  });

  MAP.nodes = nodes; MAP.adj = adj; MAP.zoneNodes = zoneNodes; MAP.built = true;

  // ---- static decor (river + park + building blocks) ----
  MAP.decor = buildDecor(W, H);
}

function buildDecor(W, H) {
  // a river crossing between zones + a park + random building blocks per zone
  const river = [
    { x: .42 * W, y: 0 }, { x: .46 * W, y: .25 * H },
    { x: .40 * W, y: .5 * H }, { x: .50 * W, y: .75 * H }, { x: .46 * W, y: H },
  ];
  const park = { x: .80 * W, y: .70 * H, w: .16 * W, h: .22 * H };
  // building blocks: small rects filling gaps between streets
  const blocks = [];
  ZONE_RECTS.forEach(rect => {
    const p = rect._px; if (!p) return;
    for (let r = 0; r < p.rows - 1; r++)
      for (let c = 0; c < p.cols - 1; c++) {
        if (Math.random() < .55) {
          const cellW = (p.rw - 36) / (p.cols - 1);
          const cellH = (p.rh - 36) / (p.rows - 1);
          const bx = p.rx + 18 + c * cellW + cellW * .18;
          const by = p.ry + 18 + r * cellH + cellH * .18;
          blocks.push({ x: bx, y: by, w: cellW * .64, h: cellH * .64 });
        }
      }
  });
  return { river, park, blocks };
}

function setActiveZone(zi, silent) {
  MAP.activeZone = zi;
  MAP.path = []; MAP.visitedUpTo = []; MAP.pathUpTo = 0;
  // endpoints are chosen within the active zone
  pickRandomEndpoints(true);
  const ids = MAP.zoneNodes[zi];
  // count edges inside the zone
  let eCount = 0; const set = new Set(ids);
  ids.forEach(i => (MAP.adj[i] || []).forEach(e => { if (set.has(e.to) && e.to > i) eCount++; }));
  $("#riNodes").textContent = ids.length;
  $("#riEdges").textContent = eCount;
  $("#riLen").textContent = "—"; $("#riVisited").textContent = "—";
  drawMap();
  if (!silent) toast(`Zone: ${ZONES[zi].name} — ${ids.length} stops 📍`);
}

function pickRandomEndpoints(silent) {
  const ids = MAP.zoneNodes[MAP.activeZone];
  if (!ids || ids.length < 2) return;
  MAP.src = ids[Math.floor(Math.random() * ids.length)];
  do { MAP.dst = ids[Math.floor(Math.random() * ids.length)]; } while (MAP.dst === MAP.src);
  MAP.path = []; MAP.visitedUpTo = []; MAP.pathUpTo = 0;
  $("#riLen").textContent = "—"; $("#riVisited").textContent = "—";
  drawMap();
  if (!silent) toast("New pickup & drop-off in this zone 📍");
}

/* ---- Dijkstra RESTRICTED to the active zone ---- */
function dijkstra(src, dst, allowed /* Set of node ids */) {
  const dist = {}, prev = {}, visited = new Set(), order = [];
  allowed.forEach(id => { dist[id] = Infinity; prev[id] = -1; });
  dist[src] = 0;
  const pq = [[0, src]];
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]);
    const [, u] = pq.shift();
    if (visited.has(u)) continue;
    visited.add(u); order.push(u);
    if (u === dst) break;
    for (const { to, w } of MAP.adj[u] || []) {
      if (!allowed.has(to)) continue;        // ← never leave the zone
      if (dist[u] + w < dist[to]) {
        dist[to] = dist[u] + w; prev[to] = u;
        pq.push([dist[to], to]);
      }
    }
  }
  const path = [];
  for (let at = dst; at !== -1 && at !== undefined; at = prev[at]) path.unshift(at);
  return { path: path[0] === src ? path : [], order, dist: dist[dst] };
}

function runDijkstra() {
  if (!MAP.built || MAP.src == null) return;
  const allowed = new Set(MAP.zoneNodes[MAP.activeZone]);
  const { path, order, dist } = dijkstra(MAP.src, MAP.dst, allowed);
  MAP.path = []; MAP.visitedUpTo = [];
  let i = 0;
  const timer = setInterval(() => {
    MAP.visitedUpTo = order.slice(0, i + 1);
    $("#riVisited").textContent = (i + 1) + " stops";
    drawMap();
    i++;
    if (i >= order.length) {
      clearInterval(timer);
      MAP.path = path;
      $("#riLen").textContent = isFinite(dist) ? Math.round(dist) + " m" : "—";
      animatePath();
    }
  }, 55);
}

function animatePath() {
  let p = 0;
  const timer = setInterval(() => {
    MAP.pathUpTo = p; drawMap(); p++;
    if (p > MAP.path.length) { clearInterval(timer); toast(`Shortest route in ${ZONES[MAP.activeZone].name} 🧭`); }
  }, 85);
}

/* ============================================================
   DRAW — realistic city look
   ============================================================ */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawMap() {
  const { ctx, W, H, nodes } = MAP;
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);

  // land base
  ctx.fillStyle = "#EEF2F7";
  ctx.fillRect(0, 0, W, H);

  const dec = MAP.decor;
  // park (green)
  if (dec) {
    ctx.fillStyle = "#D6EFD6";
    roundRect(ctx, dec.park.x, dec.park.y, dec.park.w, dec.park.h, 14); ctx.fill();
    ctx.fillStyle = "#8CC08C"; ctx.font = "600 11px Inter";
    ctx.textAlign = "left"; ctx.fillText("🌳 City Park", dec.park.x + 10, dec.park.y + 20);
  }

  // zone districts: active = colored & bright, others = dimmed grey
  ZONE_RECTS.forEach((rect, zi) => {
    const p = rect._px; if (!p) return;
    const active = zi === MAP.activeZone;
    const z = ZONES[zi];
    ctx.save();
    ctx.globalAlpha = active ? 0.14 : 0.05;
    ctx.fillStyle = active ? z.color : "#8893A8";
    roundRect(ctx, p.rx, p.ry, p.rw, p.rh, 12); ctx.fill();
    ctx.restore();
    // zone border
    ctx.lineWidth = active ? 2.5 : 1;
    ctx.strokeStyle = active ? z.color : "rgba(136,147,168,.4)";
    roundRect(ctx, p.rx, p.ry, p.rw, p.rh, 12); ctx.stroke();
    // zone label
    ctx.fillStyle = active ? z.color : "rgba(100,116,139,.6)";
    ctx.font = active ? "700 13px Sora" : "600 11px Inter";
    ctx.textAlign = "left";
    ctx.fillText((active ? "● " : "") + z.name, p.rx + 10, p.ry + 18);
  });

  // building blocks (only solid in active zone for a clean look)
  if (dec) {
    dec.blocks.forEach(b => {
      // find block's zone by center
      const inActive = pointInRect(b.x + b.w / 2, b.y + b.h / 2, ZONE_RECTS[MAP.activeZone]._px);
      ctx.fillStyle = inActive ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.45)";
      ctx.strokeStyle = inActive ? "rgba(27,42,91,.12)" : "rgba(27,42,91,.05)";
      roundRect(ctx, b.x, b.y, b.w, b.h, 3); ctx.fill(); ctx.lineWidth = 1; ctx.stroke();
    });
  }

  // river (draw above land, below streets)
  if (dec) {
    ctx.strokeStyle = "#9ED0F0"; ctx.lineWidth = 16; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath();
    dec.river.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
    ctx.stroke();
    ctx.strokeStyle = "#C3E4F7"; ctx.lineWidth = 8;
    ctx.beginPath();
    dec.river.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
    ctx.stroke();
  }

  // STREETS — all zones faint, active zone bold
  const activeSet = new Set(MAP.zoneNodes[MAP.activeZone]);
  // draw non-active streets first (faint)
  drawStreets(ctx, nodes, id => !activeSet.has(id), "rgba(120,130,150,.18)", 2.5, "rgba(120,130,150,.1)", 1);
  // active zone streets (white roads with casing)
  drawStreets(ctx, nodes, id => activeSet.has(id), "#C9D2E0", 7, "#FFFFFF", 4);

  // search frontier (only inside active zone)
  (MAP.visitedUpTo || []).forEach(i => {
    const nd = nodes[i];
    ctx.fillStyle = "rgba(18,182,168,.55)";
    ctx.beginPath(); ctx.arc(nd.x, nd.y, 7, 0, Math.PI * 2); ctx.fill();
  });

  // final route (orange)
  if (MAP.path.length) {
    const up = MAP.pathUpTo ?? MAP.path.length;
    ctx.strokeStyle = "#FF6B2C"; ctx.lineWidth = 5; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < Math.min(up, MAP.path.length); i++) {
      const nd = nodes[MAP.path[i]];
      i === 0 ? ctx.moveTo(nd.x, nd.y) : ctx.lineTo(nd.x, nd.y);
    }
    ctx.stroke();
  }

  // intersection dots in active zone
  MAP.zoneNodes[MAP.activeZone].forEach(i => {
    const nd = nodes[i];
    ctx.fillStyle = ZONES[MAP.activeZone].color;
    ctx.beginPath(); ctx.arc(nd.x, nd.y, 3, 0, Math.PI * 2); ctx.fill();
  });

  // pickup (A) & drop-off (B) markers
  if (MAP.src != null) marker(ctx, nodes[MAP.src], "#16A34A", "A");
  if (MAP.dst != null) marker(ctx, nodes[MAP.dst], "#1B2A5B", "B");
}

function drawStreets(ctx, nodes, filterFn, casingColor, casingW, roadColor, roadW) {
  const drawn = new Set();
  const pass = (color, width) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round";
    for (const a in MAP.adj) {
      const ai = +a;
      if (!filterFn(ai)) continue;
      for (const { to } of MAP.adj[ai]) {
        if (!filterFn(to)) continue;
        const key = ai < to ? ai + "-" + to : to + "-" + ai;
        if (drawn.has(key)) continue; drawn.add(key);
        ctx.beginPath();
        ctx.moveTo(nodes[ai].x, nodes[ai].y);
        ctx.lineTo(nodes[to].x, nodes[to].y);
        ctx.stroke();
      }
    }
  };
  pass(casingColor, casingW);     // casing
  drawn.clear();
  pass(roadColor, roadW);         // road fill
}

function pointInRect(x, y, p) {
  return p && x >= p.rx && x <= p.rx + p.rw && y >= p.ry && y <= p.ry + p.rh;
}

function marker(ctx, nd, color, label) {
  if (!nd) return;
  // pin shadow
  ctx.fillStyle = "rgba(27,42,91,.25)";
  ctx.beginPath(); ctx.ellipse(nd.x, nd.y + 2, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
  // pin
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(nd.x, nd.y - 10, 11, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(nd.x - 7, nd.y - 5); ctx.lineTo(nd.x + 7, nd.y - 5); ctx.lineTo(nd.x, nd.y + 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = "bold 12px Sora, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(label, nd.x, nd.y - 10);
}

/* ============================================================
   8. BOOT
   ============================================================ */
if (STATE.user) {
  // auto-restore session
  enterApp();
}
renderMapShell(); // pre-build shell so map canvas exists
window.addEventListener("resize", () => { if ($("#view-map").classList.contains("active")) initMap(); });
