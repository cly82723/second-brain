// The page's own code: the secret link, talking to the web app, the Excel export, and the one-file build.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { loadServer } = require("./fake-gas");
const { buildCode } = require("../tools/build-apps-script");

const ROOT = path.join(__dirname, "..");
const KEY = "k".repeat(64);

// A browser-like sandbox whose fetch reaches the real web app code through fake-gas.
function page({ hash = "", stored = null, server = loadServer({ props: { ACCESS_KEY: KEY } }), offline = false, xlsx } = {}) {
  const storage = stored ? { "tsb-access-key": stored } : {};
  const loc = { hash, pathname: "/second-brain/", search: "", origin: "https://cly82723.github.io" };
  const ctx = {
    console, JSON, Math, Object, String, Number, Array, RegExp, Error, Promise, Date, URL, Uint8Array,
    window: { TSB_WEB_APP: "https://script.google.com/macros/s/TEST/exec" },
    location: loc,
    history: { replaceState: (a, b, url) => { loc.hash = url.slice(url.indexOf("#")); } },
    localStorage: { getItem: (k) => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = v; }, removeItem: (k) => { delete storage[k]; } },
    fetch: async (url, init) => {
      if (offline) throw new TypeError("Failed to fetch");
      const out = server.ctx.doPost({ postData: { contents: init.body } }).getContent();
      return { json: async () => JSON.parse(out) };
    },
    Blob: class { constructor(p, o) { this.type = o.type; } },
    XLSX: xlsx
  };
  ctx.URL.createObjectURL = () => "blob:fake";
  vm.createContext(ctx);
  for (const f of ["core/logic.js", "core/remote.js", "core/export.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
    if (f === "core/logic.js") vm.runInContext("var L = logic_();", ctx);
  }
  return { ctx, storage, loc, server, B: ctx.Backend };
}

test("the personal link unlocks the device, is remembered, and leaves the address bar", async () => {
  const p = page({ hash: "#k=" + KEY });
  assert.strictEqual(p.B.hasKey(), false);
  assert.strictEqual(p.B.takeKeyFromLink(), true);
  assert.strictEqual(p.storage["tsb-access-key"], KEY);
  assert.strictEqual(p.loc.hash, "#today");
  assert.strictEqual(p.B.personalLink(), "https://cly82723.github.io/second-brain/#k=" + KEY);
  const data = await p.B.call("getAll");
  assert.strictEqual(data.settings.setupDone, false);
});

test("a pasted link or bare code works; anything else doesn't", () => {
  const p = page();
  assert.strictEqual(p.B.useLinkOrCode("hello"), false);
  assert.strictEqual(p.B.useLinkOrCode("https://cly82723.github.io/second-brain/#k=" + KEY), true);
  assert.strictEqual(p.B.hasKey(), true);
});

test("without the code, or with a wrong one, calls are refused and the wrong code is forgotten", async () => {
  await assert.rejects(page().B.call("getAll"), (e) => e.locked === true);
  const p = page({ stored: "z".repeat(64) });
  await assert.rejects(p.B.call("getAll"), (e) => e.locked === true && /private/.test(e.message));
  assert.strictEqual(p.storage["tsb-access-key"], undefined);
});

test("no internet gives a readable message", async () => {
  await assert.rejects(page({ stored: KEY, offline: true }).B.call("getAll"), /Can't reach your notebook/);
});

test("saves go through to the Sheet", async () => {
  const p = page({ stored: KEY });
  await p.B.call("saveTodo", [{ title: "Mark 3D essays" }]);
  assert.deepStrictEqual(p.server.call("getAll").data.todos.map((t) => t.title), ["Mark 3D essays"]);
});

test("export: one tab per class plus All classes, every lesson listed, text kept as typed", async () => {
  const sheets = [];
  const xlsx = {
    utils: {
      book_new: () => ({}), aoa_to_sheet: (rows) => ({ rows }),
      book_append_sheet: (b, s, name) => sheets.push({ name, rows: JSON.parse(JSON.stringify(s.rows)) })
    },
    write: () => new Uint8Array([1])
  };
  const p = page({ stored: KEY, xlsx });
  await p.B.call("saveSetup", [{
    schoolId: "kings-college-2026", periods: p.server.ctx.STANDARD_PERIODS,
    classes: [{ id: "c-3d", name: "'3D' English", colour: "sage" }, { id: "c-1b", name: "S1E2 English", colour: "sky" }],
    timetable: [{ day: 7, period: "P6", classId: "c-3d" }, { day: 1, period: "P1", classId: "c-3d" }, { day: 1, period: "P4", classId: "c-1b" }]
  }]);
  await p.B.call("saveLog", [{ date: "2026-11-06", classId: "c-3d", plan: "1/2", done: true }]);
  const data = await p.B.call("getAll");
  const res = await p.ctx.exportExcel(data, { from: "2026-11-02", to: "2026-11-06", classIds: ["c-3d", "c-1b"] });
  assert.strictEqual(res.filename, "Logbook 2026-11-02 to 2026-11-06.xlsx");
  assert.deepStrictEqual(sheets.map((s) => s.name), ["3D' English", "S1E2 English", "All classes"]);
  assert.deepStrictEqual(sheets[0].rows.slice(1).map((r) => r[0]), ["Thu 5 Nov 2026", "Fri 6 Nov 2026"]);
  assert.strictEqual(sheets[0].rows[2][3], "1/2");
  await assert.rejects(p.ctx.exportExcel(data, { from: "2026-11-06", to: "2026-11-02", classIds: ["c-3d"] }), /on or after/);
});

test("apps-script/dist/Code.gs is up to date with its sources (run tools/build-apps-script.js)", () => {
  const built = fs.readFileSync(path.join(ROOT, "apps-script/dist/Code.gs"), "utf8").replace(/\r\n/g, "\n");
  assert.strictEqual(built, buildCode());
});
