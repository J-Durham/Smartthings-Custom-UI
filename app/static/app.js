"use strict";

// ---------- tiny helpers ----------
const $ = (s) => document.querySelector(s);
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
}
async function api(path, method = "GET", body) {
  const r = await fetch(path, { method, headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 4000);
}

// ---------- icons ----------
const ICONS = {
  door: "M6 2h12v20H6z M8 4v16h8V4z M13.5 11.5h1.5V13h-1.5z",
  window: "M5 3h14v18H5z M7 5v6h4V5z M13 5v6h4V5z M7 13v6h4v-6z M13 13v6h4v-6z",
  garage: "M3 8l9-5 9 5v13H3z M6 10v2h12v-2z M6 14v2h12v-2z M6 18v2h12v-2z",
  bulb: "M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z M9 19h6v2H9z",
  lamp: "M8 3h8l3 9H5z M11 12h2v7h-2z M8 20h8v2H8z",
  bell: "M12 2a1.5 1.5 0 0 1 1.5 1.5v.6A6 6 0 0 1 18 10v5l2 2v1H4v-1l2-2v-5a6 6 0 0 1 4.5-5.9v-.6A1.5 1.5 0 0 1 12 2z M10 20h4a2 2 0 0 1-4 0z",
  lock: "M7 10V7a5 5 0 0 1 10 0v3h2v12H5V10z M9 10h6V7a3 3 0 0 0-6 0z",
  motion: "M13 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4z M10 8l4 1 2 4h-2l-1-2-1 3 3 3v6h-2v-5l-2-2-1 5H6l2-10z",
  power: "M11 2h2v10h-2z M7 5.5A8 8 0 1 0 17 5.5l-1.2 1.6A6 6 0 1 1 8.2 7.1z",
  generic: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z",
};
const DEFAULT_ICON = { contact: "door", garage: "garage", switch: "bulb", motion: "motion",
  lock: "lock", generic: "generic" };
function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("class", "icon");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", ICONS[name] || ICONS.generic); p.setAttribute("fill-rule", "evenodd");
  svg.append(p); return svg;
}

// ---------- state ----------
let layout = { columns: 9, tiles: [] };
let states = {};
let errors = {};
let editing = false;
let connected = false;
let devices = null;

// ---------- tile logic ----------
function tileInfo(t) {
  const s = states[t.deviceId];
  if (!s) return { text: "…", active: false };
  switch (t.type) {
    case "contact": return { text: s.contact || "?", active: s.contact === "open" };
    case "motion": return { text: s.motion || "?", active: s.motion === "active" };
    case "lock": return { text: s.lock || "?", active: s.lock !== "locked" };
    case "garage": return { text: s.door || "?", active: s.door && s.door !== "closed" };
    case "switch": {
      const on = s.switch === "on";
      return { text: on ? (s.level != null ? `on ${s.level}%` : "on") : (s.switch || "?"), active: on };
    }
    case "thermostat": return { active: ["cooling", "heating"].includes(s.operating) };
    default: return { text: "", active: false };
  }
}
function degrees(v, s) { return v == null ? "–" : `${Math.round(v)}°`; }

function renderTile(t) {
  const s = states[t.deviceId] || {};
  const info = tileInfo(t);
  const el = h("div", { class: "tile" + (info.active ? " on" : "") +
    (errors[t.deviceId] ? " stale" : ""), "data-id": t.id });
  el.style.gridColumn = `${t.x} / span ${t.w}`;
  el.style.gridRow = `${t.y} / span ${t.h}`;
  const label = h("div", { class: "label" }, t.label);

  if (t.type === "temperature" || t.type === "humidity") {
    el.classList.add("big");
    el.append(label, h("div", { class: "value" },
      t.type === "temperature" ? degrees(s.temperature, s) : s.humidity == null ? "–" : `${Math.round(s.humidity)}%`));
  } else if (t.type === "thermostat") {
    el.classList.add("big");
    el.append(label,
      h("div", { class: "thermo-sub" }, `🌡 ${degrees(s.temperature, s)} ${s.operating || ""}`),
      h("div", { class: "thermo" },
        h("div", {}, `❄ ${degrees(s.cool, s)}`), h("div", {}, `🔥 ${degrees(s.heat, s)}`)),
      h("div", { class: "thermo-foot" }, `${s.mode || "?"} · fan ${s.fan || "?"}`));
  } else {
    el.append(label, icon(t.icon || DEFAULT_ICON[t.type]), h("div", { class: "state" }, info.text));
  }

  const hasMore = t.type === "thermostat" || (t.type === "switch" && s.level != null);
  if (hasMore && !editing) {
    el.append(h("button", { class: "more", title: "More",
      onclick: (e) => { e.stopPropagation(); openControls(t); } }, "⋮"));
  }
  if (!editing && ["switch", "lock", "garage"].includes(t.type)) {
    el.classList.add("clickable");
    el.addEventListener("click", () => toggle(t, el));
  }
  if (editing) {
    el.draggable = true;
    el.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", t.id));
    el.addEventListener("click", () => openTileEditor(t));
  }
  return el;
}

async function send(t, capability, command, args) {
  try {
    const r = await api(`/api/devices/${t.deviceId}/command`, "POST", { capability, command, args });
    if (r.state) states[t.deviceId] = r.state;
  } catch (e) { toast(e.message); }
  render();
}
function toggle(t, el) {
  const s = states[t.deviceId] || {};
  el.style.opacity = ".6";
  if (t.type === "switch") send(t, "switch", s.switch === "on" ? "off" : "on");
  else if (t.type === "lock") send(t, "lock", s.lock === "locked" ? "unlock" : "lock");
  else if (t.type === "garage") {
    const cap = t.caps.includes("garageDoorControl") ? "garageDoorControl" : "doorControl";
    send(t, cap, s.door === "closed" ? "open" : "close");
  }
}

// ---------- rendering ----------
function rowsNeeded() {
  const used = layout.tiles.reduce((m, t) => Math.max(m, t.y + t.h - 1), 0);
  return editing ? used + 2 : Math.max(used, 1);
}
function render() {
  const grid = $("#grid");
  grid.replaceChildren();
  grid.style.gridTemplateColumns = `repeat(${layout.columns}, 1fr)`;
  document.body.classList.toggle("editing", editing);
  $("#editBtn").textContent = editing ? "Done" : "Edit";
  $("#cols").value = layout.columns;
  $("#empty").hidden = layout.tiles.length > 0 || editing || !connected;
  if (!connected) return;

  if (editing) {
    for (let y = 1; y <= rowsNeeded(); y++) for (let x = 1; x <= layout.columns; x++) {
      const c = h("div", { class: "cell" });
      c.style.gridColumn = x; c.style.gridRow = y;
      c.addEventListener("dragover", (e) => { e.preventDefault(); c.classList.add("over"); });
      c.addEventListener("dragleave", () => c.classList.remove("over"));
      c.addEventListener("drop", (e) => {
        e.preventDefault(); c.classList.remove("over");
        moveTile(e.dataTransfer.getData("text/plain"), x, y);
      });
      grid.append(c);
    }
  }
  layout.tiles.forEach((t) => grid.append(renderTile(t)));
  // Fill the screen height nicely on wall displays
  const rows = rowsNeeded();
  grid.style.setProperty("--row", window.innerWidth > 700
    ? `${Math.max(90, Math.floor((window.innerHeight - 60) / rows) - 3)}px` : "88px");
}

// ---------- layout editing ----------
function fits(t, x, y, w, h_) {
  if (x < 1 || y < 1 || x + w - 1 > layout.columns) return false;
  return !layout.tiles.some((o) => o.id !== t.id &&
    x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h_ > o.y);
}
function freeSpot(w, h_) {
  for (let y = 1; y < 200; y++) for (let x = 1; x <= layout.columns - w + 1; x++)
    if (fits({ id: "" }, x, y, w, h_)) return { x, y };
}
async function saveLayout() {
  try { layout = await api("/api/layout", "PUT", layout); } catch (e) { toast(e.message); }
  render();
}
function moveTile(id, x, y) {
  const t = layout.tiles.find((t) => t.id === id);
  if (!t) return;
  if (!fits(t, x, y, t.w, t.h)) {
    const el = document.querySelector(`.tile[data-id="${id}"]`);
    el?.classList.add("shake"); setTimeout(() => el?.classList.remove("shake"), 350);
    return;
  }
  t.x = x; t.y = y; saveLayout();
}

// ---------- dialogs ----------
const dlg = $("#dlg");
function showDialog(...kids) { dlg.replaceChildren(...kids); if (!dlg.open) dlg.showModal(); }
const closeBtn = (text = "Close") => h("button", { onclick: () => dlg.close() }, text);

function openTileEditor(t) {
  const label = h("input", { type: "text", value: t.label });
  const iconSel = h("select", {}, ...["", ...Object.keys(ICONS)].map((k) =>
    h("option", { value: k, selected: k === (t.icon || "") }, k || "(default)")));
  const w = h("input", { type: "number", min: 1, max: layout.columns, value: t.w });
  const hh = h("input", { type: "number", min: 1, max: 10, value: t.h });
  showDialog(
    h("h2", {}, "Edit tile"),
    h("label", {}, "Name"), label,
    h("label", {}, "Icon"), iconSel,
    h("label", {}, "Width (columns)"), w,
    h("label", {}, "Height (rows)"), hh,
    h("div", { class: "row" },
      h("button", { class: "danger", onclick: () => {
        layout.tiles = layout.tiles.filter((o) => o.id !== t.id); dlg.close(); saveLayout(); } }, "Remove"),
      closeBtn("Cancel"),
      h("button", { class: "primary", onclick: () => {
        const nw = Math.max(1, +w.value || 1), nh = Math.max(1, +hh.value || 1);
        if (!fits(t, t.x, t.y, nw, nh)) { toast("That size would overlap another tile."); return; }
        Object.assign(t, { label: label.value.trim() || t.label, icon: iconSel.value, w: nw, h: nh });
        dlg.close(); saveLayout(); } }, "Save")));
}

async function openAddDialog(refresh = false) {
  showDialog(h("h2", {}, "Add tile"), h("p", {}, "Loading devices from SmartThings…"));
  try { devices = await api("/api/devices" + (refresh ? "?refresh=1" : "")); }
  catch (e) { showDialog(h("h2", {}, "Add tile"), h("p", {}, e.message), h("div", { class: "row" }, closeBtn())); return; }
  const search = h("input", { type: "text", placeholder: "Search devices or rooms…" });
  const list = h("div", { class: "devlist" });
  const draw = () => {
    const q = search.value.toLowerCase();
    list.replaceChildren(...devices.filter((d) => (d.name + " " + d.room).toLowerCase().includes(q)).map((d) =>
      h("div", { class: "dev" },
        h("div", { class: "name" }, d.name, h("div", { class: "room" }, d.room || "No room")),
        ...d.types.map((type) => h("button", { title: `Add as ${type}`, onclick: () => addTile(d, type) }, `+ ${type}`)))));
    if (!list.children.length) list.append(h("p", {}, "No devices match."));
  };
  search.addEventListener("input", draw); draw();
  showDialog(h("h2", {}, "Add tile"),
    h("p", {}, "Pick a device. Devices with several sensors (e.g. temperature and humidity) can be added once per type."),
    search, list,
    h("div", { class: "row" }, h("button", { onclick: () => openAddDialog(true) }, "Rescan devices"), closeBtn("Done")));
}
function addTile(d, type) {
  const big = type === "thermostat";
  const w = big ? 2 : 1, h_ = big ? 2 : 1;
  const spot = freeSpot(w, h_);
  layout.tiles.push({ id: Math.random().toString(36).slice(2, 10), deviceId: d.deviceId, label: d.name,
    type, icon: "", caps: d.caps, x: spot.x, y: spot.y, w, h: h_ });
  saveLayout(); setTimeout(pollStates, 3000); toast(`Added "${d.name}"`); $("#toast").style.background = "#2d6a4f";
  setTimeout(() => ($("#toast").style.background = ""), 4100);
}

function openControls(t) {
  const draw = () => {
    const s = states[t.deviceId] || {};
    const kids = [h("h2", {}, t.label)];
    if (t.type === "switch") {
      const slider = h("input", { type: "range", min: 1, max: 100, value: s.level ?? 100, style: "width:100%" });
      slider.addEventListener("change", () => send(t, "switchLevel", "setLevel", [+slider.value]).then(draw));
      kids.push(h("label", {}, `Brightness: ${s.level ?? "?"}%`), slider);
    } else {
      const mk = (cap, cmd, key) => h("div", { class: "stepper" },
        h("button", { onclick: async () => { await send(t, cap, cmd, [Math.round((states[t.deviceId][key] ?? 70) - 1)]); draw(); } }, "−"),
        h("span", {}, degrees(s[key], s)),
        h("button", { onclick: async () => { await send(t, cap, cmd, [Math.round((states[t.deviceId][key] ?? 70) + 1)]); draw(); } }, "+"));
      const seg = (vals, cur, cap, cmd) => h("div", { class: "seg" }, ...(vals || []).map((m) =>
        h("button", { class: m === cur ? "sel" : "", onclick: async () => { await send(t, cap, cmd, [m]); draw(); } }, m)));
      kids.push(
        h("p", {}, `Currently ${degrees(s.temperature, s)} · ${s.operating || "?"}`),
        h("label", {}, "Mode"), seg(s.modes, s.mode, "thermostatMode", "setThermostatMode"),
        h("label", {}, "Cool to"), mk("thermostatCoolingSetpoint", "setCoolingSetpoint", "cool"),
        h("label", {}, "Heat to"), mk("thermostatHeatingSetpoint", "setHeatingSetpoint", "heat"),
        h("label", {}, "Fan"), seg(s.fanModes, s.fan, "thermostatFanMode", "setThermostatFanMode"));
    }
    kids.push(h("div", { class: "row" }, closeBtn()));
    showDialog(...kids);
  };
  draw();
}

// ---------- connection setup / settings ----------
async function openSetup() {
  const st = await api("/api/status");
  const cid = h("input", { type: "text", value: st.client_id, placeholder: "Client ID" });
  const sec = h("input", { type: "password", placeholder: st.configured ? "(saved – leave blank to keep)" : "Client Secret" });
  const redir = h("input", { type: "text", value: st.redirect_uri || "https://example.com/callback" });
  const out = h("div");
  const paste = h("input", { type: "text", placeholder: "Paste the address from the browser here" });

  const saveBtn = h("button", { class: "primary", onclick: async () => {
    try {
      const body = { client_id: cid.value, client_secret: sec.value, redirect_uri: redir.value };
      const { url } = await api("/api/auth/settings", "POST", body);
      out.replaceChildren(
        h("div", { class: "step" }, h("b", {}, "Step 2. "), "Log in to SmartThings and press Allow: ",
          h("a", { href: url, target: "_blank", rel: "noopener" }, "Open SmartThings login")),
        h("div", { class: "step" }, h("b", {}, "Step 3. "),
          "After you press Allow, your browser goes to a page that says \"Example Domain\" or \"Not Found\". That's expected. " +
          "Copy the full address from the top of your browser (it contains code=...) and paste it here:", paste,
          h("div", { class: "row" }, h("button", { class: "primary", onclick: async () => {
            try { await api("/api/auth/exchange", "POST", { code: paste.value }); location.reload(); }
            catch (e) { toast(e.message); } } }, "Connect"))));
    } catch (e) { toast(e.message); }
  } }, "Save & continue");

  showDialog(h("h2", {}, st.connected ? "SmartThings connection" : "Connect to SmartThings"),
    st.connected ? h("p", {}, "✅ Connected.") : h("p", {}, "Enter the values you created in the README (Part 1)."),
    h("div", { class: "step" }, h("b", {}, "Step 1. "), "App details",
      h("label", {}, "Client ID"), cid, h("label", {}, "Client Secret"), sec,
      h("label", {}, "Redirect URI (must exactly match what you registered)"), redir,
      h("div", { class: "row" }, saveBtn)),
    out,
    h("div", { class: "row" },
      st.connected ? h("button", { class: "danger", onclick: async () => { await api("/api/auth/disconnect", "POST"); location.reload(); } }, "Disconnect") : null,
      closeBtn()));
}

// ---------- polling ----------
async function pollStates() {
  try {
    const r = await api("/api/states");
    states = r.states; errors = r.errors; connected = r.connected;
    const el = $("#status");
    el.className = "";
    el.textContent = r.updated ? `Updated ${new Date(r.updated * 1000).toLocaleTimeString()}` : "";
    if (!editing) render();
  } catch { $("#status").textContent = "Server unreachable"; $("#status").className = "bad"; }
}

// ---------- init ----------
$("#editBtn").onclick = () => { editing = !editing; render(); };
$("#addBtn").onclick = () => openAddDialog();
$("#settingsBtn").onclick = openSetup;
$("#cols").onchange = (e) => {
  const c = Math.max(3, Math.min(20, +e.target.value || 9));
  if (layout.tiles.some((t) => t.x + t.w - 1 > c)) { toast("Move tiles left first — some sit beyond that column."); render(); return; }
  layout.columns = c; saveLayout();
};
window.addEventListener("resize", render);

(async () => {
  layout = await api("/api/layout");
  const st = await api("/api/status");
  connected = st.connected;
  render();
  if (!st.connected) openSetup();
  await pollStates();
  render();
  setInterval(pollStates, 10000);
})();
