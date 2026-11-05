// Runs the real Apps Script code in Node against a fake Google: a Sheet, script properties, triggers,
// mail and ContentService. Loads exactly what tools/build-apps-script.js pastes into Apps Script.
const vm = require("vm");
const { buildCode } = require("../tools/build-apps-script");

const HK_OFFSET_MS = 8 * 3600 * 1000;
const OWNER = "cly82723@example.com";

// Sheets keeps what's after a leading apostrophe, as text.
const stored = (v) => (typeof v === "string" && v.startsWith("'") ? v.slice(1) : v);

function fakeRange(sheet, row, col, numRows, numCols) {
  const range = {
    setValues(values) {
      values.forEach((r, i) => {
        const target = sheet.rows[row - 1 + i] || (sheet.rows[row - 1 + i] = []);
        r.forEach((v, j) => { target[col - 1 + j] = stored(v); });
      });
      return range;
    },
    getValues: () => Array.from({ length: numRows }, (_, i) =>
      Array.from({ length: numCols }, (_, j) => { const v = (sheet.rows[row - 1 + i] || [])[col - 1 + j]; return v === undefined ? "" : v; })),
    setFontWeight: () => range
  };
  return range;
}

function fakeSheet(name) {
  const sheet = {
    name, rows: [],
    setName(n) { sheet.name = n; return sheet; },
    appendRow(row) { sheet.rows.push(row.map(stored)); return sheet; },
    setFrozenRows() {},
    getLastRow: () => sheet.rows.length,
    getRange: (r, c, nr = 1, nc = 1) => fakeRange(sheet, r, c, nr, nc),
    getDataRange() { const width = Math.max(1, ...sheet.rows.map((r) => r.length)); return fakeRange(sheet, 1, 1, sheet.rows.length, width); },
    deleteRow(n) { sheet.rows.splice(n - 1, 1); },
    deleteRows(start, count) { sheet.rows.splice(start - 1, count); }
  };
  return sheet;
}

function fakeBook(id, name) {
  const sheets = [fakeSheet("Sheet1")];
  return {
    id, name, sheets,
    getId: () => id,
    getUrl: () => "https://docs.google.com/spreadsheets/d/" + id + "/edit",
    getSheets: () => sheets,
    getSheetByName: (n) => sheets.find((s) => s.name === n) || null,
    insertSheet(n) { const s = fakeSheet(n); sheets.push(s); return s; },
    tab: (n) => sheets.find((s) => s.name === n)
  };
}

function loadServer(options = {}) {
  let clock = options.now !== undefined ? options.now : Date.parse("2026-11-05T12:00:00+08:00");
  const currentMs = () => (options.now === null ? Date.now() : clock);
  const books = {};
  const props = Object.assign({}, options.props || {});
  const triggers = [];
  const sent = [];
  let nextId = 1;
  class ClockDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(currentMs()); }
    static now() { return currentMs(); }
  }
  const ctx = {
    Date: ClockDate, JSON, Math, Object, String, Number, Array, RegExp, Error, console,
    SpreadsheetApp: {
      create(name) { const id = "book" + nextId++; return (books[id] = fakeBook(id, name)); },
      openById(id) { if (!books[id]) throw new Error("No item with the given ID could be found."); return books[id]; }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = String(v); }
      })
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => OWNER }), getScriptTimeZone: () => "Asia/Hong_Kong" },
    Utilities: {
      getUuid: () => require("crypto").randomUUID(),
      formatDate(d, zone, format) {
        const iso = new Date(d.getTime() + HK_OFFSET_MS).toISOString();
        return format === "HH:mm" ? iso.slice(11, 16) : iso.slice(0, 10);
      }
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {}, hasLock: () => false }) },
    MailApp: { sendEmail: (m) => sent.push(m) },
    ScriptApp: {
      newTrigger(handler) {
        const spec = { handler };
        const builder = {
          timeBased: () => builder, everyDays: (n) => { spec.everyDays = n; return builder; },
          atHour: (h) => { spec.hour = h; return builder; },
          create: () => { const t = Object.assign({ getHandlerFunction: () => handler }, spec); triggers.push(t); return t; }
        };
        return builder;
      },
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1)
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (text) => ({ text, setMimeType() { return this; }, getContent() { return text; } })
    }
  };
  vm.createContext(ctx);
  vm.runInContext(buildCode(), ctx, { filename: "Code.gs" });

  const plain = (x) => JSON.parse(JSON.stringify(x));
  return {
    ctx, books, triggers, sent, props,
    setNow: (ms) => { clock = ms; },
    book: () => books[props.dataSheetId],
    // Calls an action directly, as doPost would after checking the key.
    call: (name, ...args) => plain(ctx[name](...plain(args))),
    // A request exactly as the page sends it.
    post: (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).getContent())
  };
}

module.exports = { loadServer, OWNER };
