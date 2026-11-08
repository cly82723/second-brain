/* Core of the page: state, calls to the notebook web app (core/remote.js), routing, and small helpers
   shared by every view. views.js draws the pages, editors.js the side panels, settings.js setup and
   settings, connect.js the locked screen.
   Everything typed by a teacher is put on screen with textContent (via el), never as HTML. */
"use strict";

var App = { data: null, ctx: null, view: "today", param: "", todayPane: "lessons", classSearch: "", todoFilter: "", calMode: "", calDay: "", yearMine: false };

var ICONS = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  week: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>',
  classes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5M8 8h8M8 12h5"/></svg>',
  todos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/></svg>'
};

var NAV = [
  { id: "today", label: "Today" },
  { id: "week", label: "Calendar" },
  { id: "classes", label: "Classes" },
  { id: "todos", label: "Tasks" },
  { id: "settings", label: "Settings" }
];

var STATUS_TEXT = { done: "Done", planned: "Planned", "not-updated": "Not updated", empty: "Nothing yet", replaced: "Replaced" };

// ---------- DOM helper ----------
// el("div", {class: "x", onclick: fn}, [children or text]). Text always goes in as text.
function el(tag, attrs, children) {
  var node = document.createElement(tag);
  Object.keys(attrs || {}).forEach(function (key) {
    var value = attrs[key];
    if (value === null || value === undefined || value === false) return;
    if (key.indexOf("on") === 0) node.addEventListener(key.slice(2), value);
    else if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value; // only ever used with ICONS
    else if (key === "value") node.value = value;
    else if (key === "checked") node.checked = !!value;
    else node.setAttribute(key, value === true ? "" : value);
  });
  appendChildren(node, children);
  return node;
}

// Children can be nested arrays; null/false entries are skipped.
function appendChildren(node, children) {
  if (children === null || children === undefined || children === false) return;
  if (Array.isArray(children)) { children.forEach(function (c) { appendChildren(node, c); }); return; }
  node.appendChild(typeof children === "string" || typeof children === "number" ? document.createTextNode(String(children)) : children);
}

function icon(name, extraClass) {
  return el("span", { class: "icon " + (extraClass || ""), "aria-hidden": "true", html: ICONS[name] });
}

function classColour(cls) { return "c-" + ((cls && cls.colour) || "sage"); }

// ---------- time on this device ----------
function pad(n) { return (n < 10 ? "0" : "") + n; }
function todayStr() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function nowMinutes() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }

// ---------- notebook ----------
// Resolves with the data, or rejects with a readable message. If the web app says the secret code
// is wrong (for example a new personal link was made), the device shows the locked screen.
function api(name) {
  var args = Array.prototype.slice.call(arguments, 1);
  return Backend.call(name, args).catch(function (e) {
    if (e.locked) {
      closeLayer(true);
      App.data = null;
      showLocked(e.message);
    }
    throw e;
  });
}

// ---------- data (replaced, never edited in place) ----------
function setData(next) {
  App.data = next;
  App.ctx = L.prepare(next);
  render();
}

function withList(listName, item, keyOf, remove) {
  var list = App.data[listName].filter(function (x) { return keyOf(x) !== keyOf(item); });
  var next = remove || !item ? list : list.concat([item]);
  var patch = {};
  patch[listName] = next;
  return Object.assign({}, App.data, patch);
}

function logKey(e) { return e.date + "|" + e.classId; }
function idOf(x) { return x.id; }

function applyLog(saved, key) {
  var list = App.data.log.filter(function (e) { return logKey(e) !== key; });
  setData(Object.assign({}, App.data, { log: saved ? list.concat([saved]) : list }));
}

// ---------- toast ----------
var toastTimer = null;
function toast(message, isError) {
  var t = document.getElementById("toast");
  t.textContent = message;
  t.className = "toast show" + (isError ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.className = "toast" + (isError ? " error" : ""); }, isError ? 6000 : 2600);
}

function fail(err) { toast(err.message || String(err), true); }

// Disables a button while its call runs, so a double tap can't save twice.
function busy(button, promise) {
  if (button) { button.disabled = true; button.setAttribute("aria-busy", "true"); }
  return promise.then(function (v) {
    if (button) { button.disabled = false; button.removeAttribute("aria-busy"); }
    return v;
  }, function (e) {
    if (button) { button.disabled = false; button.removeAttribute("aria-busy"); }
    throw e;
  });
}

// ---------- routing: #today, #week/2026-11-02, #classes/<id>, #todos, #settings ----------
function go(view, param) {
  var hash = "#" + view + (param ? "/" + param : "");
  if (location.hash === hash) route(); else location.hash = hash;
}

function route() {
  var parts = (location.hash || "#today").slice(1).split("/");
  var view = NAV.some(function (n) { return n.id === parts[0]; }) ? parts[0] : "today";
  if (!App.data.settings.setupDone) view = "settings";
  var param = parts[1] ? decodeURIComponent(parts[1]) : "";
  var changed = view !== App.view;
  App.arriving = changed || param !== App.param; // a new page glides in; redraws in place don't
  // Paging to a later or earlier day/week arrives from that side (an empty param means today).
  var before = App.param && L.isDate(App.param) ? App.param : todayStr();
  var after = param && L.isDate(param) ? param : todayStr();
  App.navDir = !changed && (view === "today" || view === "week") && param !== "year" && App.param !== "year" && after !== before
    ? (after > before ? "next" : "prev") : "";
  App.view = view;
  App.param = param;
  render();
  if (changed) { window.scrollTo(0, 0); document.getElementById("main").focus({ preventScroll: true }); }
}

function render() {
  if (!App.data) return;
  renderNav();
  var main = document.getElementById("main");
  var views = { today: renderToday, week: renderWeek, classes: renderClasses, todos: renderTodos, settings: renderSettings };
  var page = views[App.view]();
  if (App.arriving) {
    page.classList.add("page-enter");
    if (App.navDir) page.setAttribute("data-dir", App.navDir);
    App.arriving = false;
  }
  main.replaceChildren(page);
  var setup = !App.data.settings.setupDone;
  document.getElementById("new-fab").hidden = setup;
  document.getElementById("new-side").hidden = setup;
}

// The Tasks badge: to-dos due or overdue, plus anything waiting for a date.
function attentionCount() {
  var groups = L.groupTodos(App.ctx, todayStr());
  return groups.overdue.length + groups.today.length + L.undatedCount(L.undated(App.ctx));
}

function renderNav() {
  var setup = !App.data.settings.setupDone;
  var count = setup ? 0 : attentionCount();
  ["nav-side", "nav-tabs"].forEach(function (id) {
    var nav = document.getElementById(id);
    nav.replaceChildren.apply(nav, NAV.filter(function (n) { return !setup || n.id === "settings"; }).map(function (n) {
      return el("a", { href: "#" + n.id, "aria-current": App.view === n.id ? "page" : null }, [
        icon(n.id === "week" ? "week" : n.id),
        el("span", {}, n.label),
        n.id === "todos" && count ? el("span", { class: "count", "aria-label": count + " need attention: due, overdue or without a date" }, String(count)) : null
      ]);
    }));
  });
  // During first-time setup there is nowhere else to go, so the phone tab bar stays out of the way.
  document.getElementById("nav-tabs").hidden = setup;
  document.getElementById("who").textContent = "Saved to your Google Sheet";
}

// ---------- motion ----------
// A spring that always starts from where the thing is now, at the speed it's moving now,
// so any motion can be grabbed and reversed halfway. Response is in seconds, as in Apple's springs.
var Spring = {
  run: function (state, target, response, damping, apply, done) {
    Spring.stop(state);
    if (Motion.reduced) { state.x = target; state.v = 0; apply(target); if (done) done(); return; }
    var w = 2 * Math.PI / response, k = w * w, c = 2 * damping * w, last = performance.now();
    function frame(now) {
      var dt = Math.min(0.064, (now - last) / 1000), steps = Math.max(1, Math.ceil(dt / 0.004)), h = dt / steps;
      last = now;
      for (var i = 0; i < steps; i++) { state.v += (-k * (state.x - target) - c * state.v) * h; state.x += state.v * h; }
      apply(state.x);
      if (Math.abs(state.x - target) < 0.4 && Math.abs(state.v) < 8) { state.x = target; state.v = 0; apply(target); state.raf = 0; if (done) done(); return; }
      state.raf = requestAnimationFrame(frame);
    }
    state.raf = requestAnimationFrame(frame);
  },
  stop: function (state) { if (state.raf) cancelAnimationFrame(state.raf); state.raf = 0; }
};

var Motion = {
  reduced: window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  phone: function () { return window.matchMedia && window.matchMedia("(max-width: 860px)").matches; },
  // Where a throw would come to rest (Apple's deceleration projection).
  project: function (velocity) { var d = 0.998; return (velocity / 1000) * d / (1 - d); },
  // Past an edge, follow less and less: soft resistance instead of a hard stop.
  rubberband: function (over, size) { var c = 0.55; return (over * size * c) / (size + c * Math.abs(over)); }
};

// ---------- sheet (side panel on a computer, bottom sheet on a phone) ----------
var layerReturnFocus = null;

function openDrawer(title, subtitle, body, footer, classes) {
  var guard = App.guardClose; // set by the editor just before opening; closing the old layer must not clear it
  closeLayer(true);
  App.guardClose = guard;
  layerReturnFocus = document.activeElement;
  var layer = document.getElementById("layer");
  var closeBtn = el("button", { type: "button", class: "btn btn-quiet icon-btn", "aria-label": "Close", onclick: function () { closeLayer(); } }, icon("close"));
  var head = el("div", { class: "drawer-head" }, [el("div", {}, [el("h2", { id: "drawer-title" }, title), subtitle ? el("div", { class: "sub" }, subtitle) : null]), closeBtn]);
  var grabber = el("div", { class: "grabber", "aria-hidden": "true" });
  var drawer = el("div", { class: "drawer " + (classes || ""), role: "dialog", "aria-modal": "true", "aria-labelledby": "drawer-title", tabindex: "-1" }, [
    grabber, head,
    el("div", { class: "drawer-body" }, body),
    footer ? el("div", { class: "drawer-foot" }, footer) : null
  ]);
  var scrim = el("div", { class: "scrim", onclick: function () { closeLayer(); } });
  layer.replaceChildren(scrim, drawer);

  var phone = Motion.phone();
  var sheet = {
    el: drawer, scrim: scrim, phone: phone, state: { x: 0, v: 0, raf: 0 },
    off: phone ? drawer.offsetHeight + 16 : drawer.offsetWidth + 24,
    place: function (x) {
      drawer.style.transform = phone ? "translateY(" + x + "px)" : "translateX(" + x + "px)";
      scrim.style.opacity = String(Math.max(0, Math.min(1, 1 - x / sheet.off)));
    }
  };
  sheet.state.x = sheet.off;
  sheet.place(sheet.off);
  App.sheet = sheet;
  Spring.run(sheet.state, 0, 0.36, 1, sheet.place);
  if (phone) enableSheetDrag(sheet, [grabber, head]);

  var first = drawer.querySelector("[data-autofocus]") || drawer.querySelector("input, textarea, select") || closeBtn;
  // On a phone, don't pop the keyboard over a sheet that's still sliding up.
  if (!phone) first.focus({ preventScroll: true }); else drawer.focus({ preventScroll: true });
  return drawer;
}

// Drag the sheet by its handle or header; it follows the finger 1:1 and is thrown closed by a flick.
function enableSheetDrag(sheet, handles) {
  var drag = null;
  function down(e) {
    if (e.button > 0 || e.target.closest("button, input, select, textarea, a")) return;
    Spring.stop(sheet.state);
    drag = { id: e.pointerId, startY: e.clientY, from: sheet.state.x, samples: [{ t: e.timeStamp, y: e.clientY }] };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* capture is a nicety; the drag still works */ }
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var x = drag.from + (e.clientY - drag.startY);
    if (x < 0) x = -Motion.rubberband(-x, sheet.off);
    sheet.state.x = x;
    sheet.place(x);
    drag.samples.push({ t: e.timeStamp, y: e.clientY });
    if (drag.samples.length > 6) drag.samples.shift();
  }
  function up(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var s = drag.samples, a = s[0], b = s[s.length - 1];
    var velocity = b.t > a.t ? (b.y - a.y) / ((b.t - a.t) / 1000) : 0;
    drag = null;
    sheet.state.v = velocity;
    var restsAt = sheet.state.x + Motion.project(velocity);
    if (restsAt > sheet.off * 0.45) closeLayer();
    else Spring.run(sheet.state, 0, 0.32, 0.82, sheet.place); // thrown back: a touch of bounce
  }
  handles.forEach(function (h) {
    h.addEventListener("pointerdown", down);
    h.addEventListener("pointermove", move);
    h.addEventListener("pointerup", up);
    h.addEventListener("pointercancel", up);
  });
}

// A panel with unsaved changes sets App.guardClose; it returns false to keep the panel open.
function closeLayer(instant) {
  var layer = document.getElementById("layer");
  if (!layer.firstChild) return;
  var sheet = App.sheet;
  if (!instant && App.guardClose && !App.guardClose()) {
    if (sheet) Spring.run(sheet.state, 0, 0.32, 0.82, sheet.place); // pulled down but kept: settle back
    return;
  }
  App.guardClose = null;
  App.sheet = null;
  if (sheet && !instant) {
    // Leaves the way it came, keeping any speed a throw gave it.
    Spring.run(sheet.state, sheet.off, 0.32, 1, sheet.place, function () {
      if (layer.contains(sheet.el)) layer.replaceChildren();
    });
  } else {
    if (sheet) Spring.stop(sheet.state);
    layer.replaceChildren();
  }
  if (layerReturnFocus && layerReturnFocus.focus && document.contains(layerReturnFocus)) layerReturnFocus.focus({ preventScroll: true });
  layerReturnFocus = null;
}

// The menu grows out of the button that opened it.
function openMenu(anchor, items) {
  closeLayer(true);
  layerReturnFocus = anchor;
  var rect = anchor.getBoundingClientRect();
  var menu = el("div", { class: "menu", role: "menu" }, items.map(function (it) {
    return el("button", { type: "button", role: "menuitem", onclick: function () { closeLayer(true); it.run(); } }, it.label);
  }));
  var layer = document.getElementById("layer");
  layer.replaceChildren(el("div", { class: "scrim", style: "background:transparent;opacity:1", onclick: function () { closeLayer(); } }), menu);
  var above = rect.bottom + 6 + 120 > window.innerHeight;
  var left = Math.max(8, Math.min(rect.left, window.innerWidth - 222));
  menu.style.left = left + "px";
  if (above) menu.style.bottom = (window.innerHeight - rect.top + 6) + "px";
  else menu.style.top = (rect.bottom + 6) + "px";
  menu.style.transformOrigin = (rect.left + rect.width / 2 - left) + "px " + (above ? "100%" : "0");
  menu.querySelector("button").focus();
}

function openNewMenu(anchor, date) {
  openMenu(anchor, [
    { label: "New item (meeting, duty, reminder…)", run: function () { openEventEditor(null, { date: date || todayStr() }); } },
    { label: "New to-do", run: function () { openTodoEditor(null, { due: date || "" }); } },
    { label: "New marking", run: function () { openMarkEditor(null, {}); } }
  ]);
}

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && document.getElementById("layer").firstChild) { e.preventDefault(); closeLayer(); }
  if (e.key === "Tab" && document.querySelector("#layer .drawer")) trapFocus(e);
});

function trapFocus(e) {
  var focusable = Array.prototype.filter.call(
    document.querySelectorAll("#layer .drawer button, #layer .drawer input, #layer .drawer select, #layer .drawer textarea, #layer .drawer a[href], #layer .drawer summary"),
    function (n) { return !n.disabled && n.offsetParent !== null; });
  if (!focusable.length) return;
  var first = focusable[0], last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

// ---------- start ----------
function showLoadError(message) {
  document.getElementById("main").replaceChildren(el("div", { class: "error-page" }, [
    el("h1", {}, "Your notebook didn't open"),
    el("p", {}, message),
    el("button", { type: "button", class: "btn btn-ink", onclick: start }, "Try again")
  ]));
}

function boot(result) {
  App.data = result;
  App.ctx = L.prepare(result);
  App.arriving = true;
  route();
  // An older Google web app doesn't know about marking, covered or follow-ups and would drop them.
  if (!("marks" in result)) {
    toast("The Google web app needs updating before Covered, Follow up and marking can be saved: paste the new Code.gs into Apps Script and deploy a new version.", true);
  }
  // Undated items are counted on the Tasks tab and listed on Today and Tasks; nothing pops up.
}

function loadNotebook() {
  document.getElementById("main").replaceChildren(el("div", { class: "loading" }, "Opening your notebook…"));
  api("getAll").then(boot, function (e) { if (!e.locked) showLoadError(e.message); });
}

// No sign-in: opening the personal link once is enough. Without the code, show the locked screen.
function start() {
  Backend.takeKeyFromLink();
  if (!Backend.hasKey()) { showLocked(); return; }
  loadNotebook();
}

window.addEventListener("hashchange", function () { if (App.data) route(); });
document.getElementById("new-side").addEventListener("click", function (e) { openNewMenu(e.currentTarget); });
document.getElementById("new-fab").addEventListener("click", function (e) { openNewMenu(e.currentTarget); });
// Re-draw every few minutes so "now", "next" and "not updated" keep up with the clock.
setInterval(function () { if (App.data && !document.getElementById("layer").firstChild) render(); }, 5 * 60 * 1000);
