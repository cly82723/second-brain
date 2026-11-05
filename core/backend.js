/* Teachers' Second Brain: what used to be the server, now running in the browser.

   The whole notebook is one JSON file, notebook.json, on the "notebook" branch of the private
   GitHub repo cly82723/teachers-second-brain. It is read and saved through GitHub's API with a
   personal access token kept on this device only. Every save is a commit, so the repo's history
   is also a complete backup.

   The calls the screens make (saveLog, carryForward, saveEvent…) keep their old names and their
   checks from validate.js. A save always applies its change to the newest copy of the notebook;
   if another device saved in between, it reloads and applies the change again. */

var NOTEBOOK = { owner: "cly82723", repo: "teachers-second-brain", branch: "notebook", path: "notebook.json" };
var NOTEBOOK_WEB_URL = "https://github.com/" + NOTEBOOK.owner + "/" + NOTEBOOK.repo + "/blob/" + NOTEBOOK.branch + "/" + NOTEBOOK.path;
var TOKEN_KEY = "tsb-github-token";
var SAVE_ATTEMPTS = 3;
var XLSX_SRC = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";

function pad2_(n) { return (n < 10 ? "0" : "") + n; }
function today_() { var d = new Date(); return d.getFullYear() + "-" + pad2_(d.getMonth() + 1) + "-" + pad2_(d.getDate()); }
function clone_(o) { return JSON.parse(JSON.stringify(o)); }

function emptyNotebook_() {
  return { format: "teachers-second-brain-notebook", version: 1, settings: {}, classes: [], timetable: [], log: [], events: [], todos: [] };
}

// Fills in anything an older or hand-edited file is missing, so the rest can rely on the shape.
function normaliseNotebook_(doc) {
  var d = Object.assign(emptyNotebook_(), doc || {});
  ["classes", "timetable", "log", "events", "todos"].forEach(function (k) { if (!Array.isArray(d[k])) d[k] = []; });
  if (!d.settings || typeof d.settings !== "object") d.settings = {};
  return d;
}

// ---------- text <-> base64 (GitHub sends file contents as base64 of UTF-8) ----------
function toBase64_(text) {
  var bytes = new TextEncoder().encode(text);
  var binary = "";
  for (var i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64_(b64) {
  var binary = atob(String(b64).replace(/\s/g, ""));
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ---------- GitHub ----------
function githubTransport_(token) {
  var base = "https://api.github.com/repos/" + NOTEBOOK.owner + "/" + NOTEBOOK.repo;
  function call(method, path, body) {
    var headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (body) headers["Content-Type"] = "application/json";
    return fetch(base + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, cache: "no-store" })
      .catch(function (e) {
        console.error("GitHub request failed", e);
        throw new UserError_("Couldn't reach GitHub. Check your internet connection and try again.");
      });
  }
  function refuse(res) {
    var e;
    if (res.status === 401) { e = new UserError_("GitHub didn't accept your access key. It may have expired. Please connect again."); e.auth = true; throw e; }
    if (res.status === 404) { e = new UserError_("Your access key can't see the private repo " + NOTEBOOK.owner + "/" + NOTEBOOK.repo + ". Check it was made for that repo."); e.auth = true; throw e; }
    if (res.status === 403) throw new UserError_("GitHub refused this: the access key may not be allowed to write, or there were too many saves at once. Wait a minute and try again.");
    throw new UserError_("GitHub had a problem (" + res.status + "). Please try again in a moment.");
  }
  return {
    // Checks the key can open the repo before it's kept on this device.
    check: function () {
      return call("GET", "").then(function (res) { if (!res.ok) refuse(res); return res.json(); });
    },
    read: function () {
      return call("GET", "/contents/" + NOTEBOOK.path + "?ref=" + NOTEBOOK.branch).then(function (res) {
        if (res.status === 404) return { doc: null, sha: null }; // first use: no notebook yet
        if (!res.ok) refuse(res);
        return res.json().then(function (meta) {
          if (meta.content) return { doc: JSON.parse(fromBase64_(meta.content)), sha: meta.sha };
          // Over 1 MB the contents API leaves the content out; fetch the file itself instead.
          return call("GET", "/git/blobs/" + meta.sha).then(function (r) {
            if (!r.ok) refuse(r);
            return r.json().then(function (blob) { return { doc: JSON.parse(fromBase64_(blob.content)), sha: meta.sha }; });
          });
        });
      });
    },
    write: function (doc, sha, message) {
      var body = { message: message, content: toBase64_(JSON.stringify(doc, null, 1)), branch: NOTEBOOK.branch };
      if (sha) body.sha = sha;
      return call("PUT", "/contents/" + NOTEBOOK.path, body).then(function (res) {
        if (res.status === 409 || res.status === 422) return { conflict: true }; // another device saved first
        if (!res.ok) refuse(res);
        return res.json().then(function (out) { return { sha: out.content.sha }; });
      });
    }
  };
}

// Same shape as GitHub, kept in memory: for the local preview and the tests.
function memoryTransport_(initial) {
  var store = { doc: initial ? clone_(initial) : null, version: initial ? 1 : 0, messages: [] };
  function currentSha() { return store.doc ? "v" + store.version : null; }
  return {
    store: store,
    check: function () { return Promise.resolve({ full_name: "preview" }); },
    read: function () { return Promise.resolve({ doc: store.doc ? clone_(store.doc) : null, sha: currentSha() }); },
    write: function (doc, sha, message) {
      if (currentSha() !== (sha || null)) return Promise.resolve({ conflict: true });
      store.doc = clone_(doc);
      store.version++;
      store.messages.push(message);
      return Promise.resolve({ sha: currentSha() });
    }
  };
}

// ---------- the notebook ----------
var Backend = (function () {
  var transport = null;
  var doc = null;
  var sha = null;
  var queue = Promise.resolve();

  function load() {
    return transport.read().then(function (r) { doc = normaliseNotebook_(r.doc); sha = r.sha; return doc; });
  }

  // Calls run one at a time, in order, so two quick saves can't trip over each other.
  function enqueue(run) {
    var p = queue.then(run, run);
    queue = p.catch(function () {});
    return p;
  }

  // Applies a change to the newest notebook and saves it; if another device saved in between,
  // reloads and applies the same change again.
  function change(message, mutate) {
    function attempt(n) {
      var draft = clone_(doc);
      var result = mutate(draft);
      return transport.write(draft, sha, message).then(function (saved) {
        if (!saved.conflict) { doc = draft; sha = saved.sha; return result; }
        if (n + 1 >= SAVE_ATTEMPTS) throw new UserError_("Another device kept saving at the same moment. Please try again.");
        return load().then(function () { return attempt(n + 1); });
      });
    }
    return enqueue(function () { return (doc ? Promise.resolve() : load()).then(function () { return attempt(0); }); });
  }

  function read(fn) {
    return enqueue(function () { return (doc ? Promise.resolve() : load()).then(function () { return fn(doc); }); });
  }

  var calls = {
    getAll: function () { return enqueue(function () { return load().then(allData_); }); }, // always fresh from GitHub
    saveSetup: function (setup) {
      return change("Save setup", function (d) { writeSetup_(d, checkedSetup_(d, setup || {})); return allData_(d); });
    },
    saveLog: function (entry) {
      return change(logMessage_(entry), function (d) { return { entry: writeLog_(d, cleanLogEntry_(entry, classIdSet_(d))) }; });
    },
    carryForward: function (request) { return change("Move unfinished work forward", function (d) { return carryForward_(d, request || {}); }); },
    saveEvent: function (ev) { return change("Save event: " + titleOf_(ev), function (d) { return { event: saveEvent_(d, ev) }; }); },
    deleteEvent: function (id) { return change("Delete event", function (d) { return { removed: removeBy_(d.events, idKey_, cleanId_(id)) }; }); },
    saveTodo: function (todo) { return change("Save to-do: " + titleOf_(todo), function (d) { return { todo: saveTodo_(d, todo) }; }); },
    deleteTodo: function (id) { return change("Delete to-do", function (d) { return { removed: removeBy_(d.todos, idKey_, cleanId_(id)) }; }); },
    clearDoneTodos: function () {
      return change("Clear finished to-dos", function (d) {
        d.todos = d.todos.filter(function (t) { return !t.done; });
        return { todos: clone_(d.todos) };
      });
    },
    importData: function (payload) {
      return change("Import a file", function (d) { var counts = importInto_(d, payload); return { counts: counts, data: allData_(d) }; });
    },
    exportExcel: function (request) { return read(function (d) { return exportExcel_(d, request || {}); }); }
  };

  return {
    hasToken: function () { return !!storedToken_(); },
    useStoredToken: function () { transport = githubTransport_(storedToken_()); doc = null; sha = null; },
    // In-memory notebook for the local preview and the tests.
    useMemory: function (initial) { transport = memoryTransport_(initial); doc = null; sha = null; return transport; },
    connect: function (token) {
      var clean = String(token || "").trim();
      if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(clean)) {
        return Promise.reject(new Error("That doesn't look like a GitHub access key. It starts with github_pat_."));
      }
      var t = githubTransport_(clean);
      return t.check().then(function () {
        try { localStorage.setItem(TOKEN_KEY, clean); } catch (e) { console.warn("Couldn't keep the key on this device; you'll be asked again next time.", e); }
        transport = t; doc = null; sha = null;
      }, rethrowReadable_);
    },
    disconnect: function () {
      try { localStorage.removeItem(TOKEN_KEY); } catch (e) { console.warn("Couldn't remove the key from this device.", e); }
      transport = null; doc = null; sha = null;
    },
    // Every screen call: resolves with the data, or rejects with a message a teacher can act on.
    call: function (name, args) {
      if (!calls[name]) return Promise.reject(new Error("Unknown action: " + name));
      if (!transport) return Promise.reject(new Error("Not connected to GitHub yet."));
      var p;
      try { p = calls[name].apply(null, args || []); } catch (e) { return Promise.reject(readable_(e)); }
      return p.catch(rethrowReadable_);
    }
  };
})();

function storedToken_() {
  try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
}

function readable_(e) {
  if (e instanceof UserError_) { var err = new Error(e.message); err.auth = !!e.auth; return err; }
  if (e instanceof Error && e.auth !== undefined) return e;
  console.error(e);
  return new Error("Something went wrong. Please try again.");
}
function rethrowReadable_(e) { throw readable_(e); }

// ---------- what the screens get (a copy, so screens can't change the notebook directly) ----------
function allData_(d) {
  var s = d.settings || {};
  var schoolId = schoolSpec_(s.schoolId) ? s.schoolId : DEFAULT_SCHOOL_ID;
  return clone_({
    email: "",
    today: today_(),
    notebookUrl: NOTEBOOK_WEB_URL,
    schools: listSchools_(),
    colours: CLASS_COLOURS,
    settings: { schoolId: schoolId, setupDone: !!s.setupDone, startDate: s.startDate || "" },
    school: buildSchool_(schoolId),
    periods: s.periods || schoolSpec_(schoolId).periods,
    classes: d.classes, timetable: d.timetable, log: d.log, events: d.events, todos: d.todos
  });
}

function logKey_(e) { return e.date + "|" + e.classId; }
function idKey_(o) { return o.id; }
function titleOf_(o) { return o && typeof o.title === "string" ? o.title.trim().slice(0, 60) : ""; }

function logMessage_(entry) {
  return "Save logbook entry" + (entry && L.isDate(entry.date) ? ", " + L.shortDate(entry.date) : "");
}

function classIdSet_(d) {
  var ids = Object.create(null);
  d.classes.forEach(function (c) { ids[c.id] = true; });
  return ids;
}

function cycleLengthOf_(d) {
  return (schoolSpec_(d.settings.schoolId) || schoolSpec_(DEFAULT_SCHOOL_ID)).cycleLength;
}

function upsertBy_(list, keyOf, item) {
  var key = keyOf(item);
  for (var i = 0; i < list.length; i++) if (keyOf(list[i]) === key) { list[i] = item; return clone_(item); }
  list.push(item);
  return clone_(item);
}

function removeBy_(list, keyOf, key) {
  for (var i = 0; i < list.length; i++) if (keyOf(list[i]) === key) { list.splice(i, 1); return true; }
  return false;
}

// ---------- setup ----------
function checkedSetup_(d, setup) {
  var spec = schoolSpec_(setup.schoolId);
  if (!spec) throw new UserError_("Please choose your school.");
  var periods = cleanPeriods_(setup.periods);
  var classes = cleanClasses_(setup.classes);
  var timetable = cleanTimetable_(setup.timetable, periods, classes, spec.cycleLength);
  refuseRemovingLoggedClasses_(d, classes);
  return { spec: spec, periods: periods, classes: classes, timetable: timetable };
}

function writeSetup_(d, checked) {
  d.classes = checked.classes;
  d.timetable = checked.timetable;
  d.settings.schoolId = checked.spec.id;
  d.settings.periods = checked.periods;
  if (!d.settings.startDate) d.settings.startDate = today_();
  d.settings.setupDone = true;
}

function refuseRemovingLoggedClasses_(d, keptClasses) {
  var kept = Object.create(null);
  keptClasses.forEach(function (c) { kept[c.id] = true; });
  var names = Object.create(null);
  d.classes.forEach(function (c) { names[c.id] = c.name; });
  var removed = Object.create(null);
  d.log.forEach(function (e) { if (!kept[e.classId] && names[e.classId]) removed[names[e.classId]] = true; });
  var list = Object.keys(removed);
  if (list.length) {
    throw new UserError_(list.join(", ") + " already has logbook entries, so it can't be deleted. " +
      "To stop it appearing, take it off the timetable instead.");
  }
}

// ---------- logbook ----------
// An entry with nothing in it is removed rather than kept empty.
function writeLog_(d, clean) {
  if (!clean.done && !L.hasWriting(clean) && !clean.homeworkDue) {
    removeBy_(d.log, logKey_, logKey_(clean));
    return null;
  }
  return upsertBy_(d.log, logKey_, Object.assign({}, clean, { updated: today_() }));
}

// "Didn't finish": ticks this lesson and adds what's left to the top of the class's next lesson.
function carryForward_(d, request) {
  var ctx = L.prepare(allData_(d));
  var ids = classIdSet_(d);
  var current = cleanLogEntry_(request.entry, ids);
  var leftover = requiredText_(request.leftover, LIMITS.text, "What's left");
  var next = L.nextLesson(ctx, current.classId, current.date);
  if (!next) throw new UserError_("There's no later lesson with this class in the calendar to move it to.");
  var existing = next.entry || { date: next.date, classId: current.classId };
  var line = "From " + L.shortDate(current.date) + ": " + leftover;
  var nextEntry = cleanLogEntry_(Object.assign({}, existing, { plan: existing.plan ? line + "\n" + existing.plan : line }), ids);
  return {
    current: writeLog_(d, Object.assign({}, current, { done: true })),
    next: writeLog_(d, Object.assign({}, nextEntry, { done: !!existing.done }))
  };
}

// ---------- events & to-dos ----------
function saveEvent_(d, ev) {
  var clean = cleanEvent_(ev, cycleLengthOf_(d));
  var isNew = !d.events.some(function (e) { return e.id === clean.id; });
  if (isNew && d.events.length >= LIMITS.events) throw new UserError_("You've reached the limit of " + LIMITS.events + " events.");
  return upsertBy_(d.events, idKey_, clean);
}

function saveTodo_(d, todo) {
  var clean = cleanTodo_(todo, classIdSet_(d), today_());
  var isNew = !d.todos.some(function (t) { return t.id === clean.id; });
  if (isNew && d.todos.length >= LIMITS.todos) throw new UserError_("You've reached the limit of " + LIMITS.todos + " to-dos. Clear some finished ones first.");
  return upsertBy_(d.todos, idKey_, clean);
}

// ---------- import ----------
// The whole file is checked first, so a bad file changes nothing. Existing entries are never overwritten.
function importInto_(d, payload) {
  if (!payload || typeof payload !== "object") throw new UserError_("That file doesn't look like a Teachers' Second Brain file.");
  var schoolId = payload.schoolId || d.settings.schoolId || DEFAULT_SCHOOL_ID;
  var setup = payload.classes || payload.timetable ? checkedSetup_(d, {
    schoolId: schoolId,
    periods: payload.periods || d.settings.periods || (schoolSpec_(schoolId) || schoolSpec_(DEFAULT_SCHOOL_ID)).periods,
    classes: payload.classes || d.classes,
    timetable: payload.timetable || d.timetable
  }) : null;
  var ids = Object.create(null);
  (setup ? setup.classes : d.classes).forEach(function (c) { ids[c.id] = true; });
  var cycleLength = setup ? setup.spec.cycleLength : cycleLengthOf_(d);
  var plans = {
    log: planMerge_(d.log, "log entries", logKey_, payload.log, function (e) { return Object.assign(cleanLogEntry_(e, ids), { updated: today_() }); }, LIMITS.importRows),
    events: planMerge_(d.events, "events", idKey_, payload.events, function (e) { return cleanEvent_(e, cycleLength); }, LIMITS.events),
    todos: planMerge_(d.todos, "to-dos", idKey_, payload.todos, function (t) { return cleanTodo_(t, ids, today_()); }, LIMITS.todos)
  };
  if (setup) writeSetup_(d, setup);
  d.log = d.log.concat(plans.log.added);
  d.events = d.events.concat(plans.events.added);
  d.todos = d.todos.concat(plans.todos.added);
  return {
    log: { added: plans.log.added.length, skipped: plans.log.skipped },
    events: { added: plans.events.added.length, skipped: plans.events.skipped },
    todos: { added: plans.todos.added.length, skipped: plans.todos.skipped }
  };
}

function planMerge_(existing, what, keyOf, incoming, clean, maxTotal) {
  if (incoming === undefined) return { added: [], skipped: 0 };
  if (!Array.isArray(incoming) || incoming.length > LIMITS.importRows) throw new UserError_("The " + what + " part of the file is too big or damaged.");
  var seen = Object.create(null);
  existing.forEach(function (r) { seen[keyOf(r)] = true; });
  var added = [];
  var skipped = 0;
  incoming.forEach(function (raw) {
    try {
      var row = clean(raw);
      if (seen[keyOf(row)]) { skipped++; return; }
      seen[keyOf(row)] = true;
      added.push(row);
    } catch (e) {
      if (!(e instanceof UserError_)) throw e;
      skipped++;
    }
  });
  if (existing.length + added.length > maxTotal) {
    throw new UserError_("Importing this would go over the limit of " + maxTotal + " " + what + ". Nothing was imported.");
  }
  return { added: added, skipped: skipped };
}

// ---------- Excel export ----------
var EXPORT_MAX_DAYS = 400;
var EXPORT_HEADERS = ["Date", "Day", "Periods", "Plan / covered", "Remind students", "Homework", "Homework due", "Notes", "Done"];
var EXPORT_WIDTHS = [16, 9, 9, 48, 30, 32, 14, 30, 7]; // in characters

function exportExcel_(d, request) {
  var from = requiredDate_(request.from, "The start date");
  var to = requiredDate_(request.to, "The end date");
  if (to < from) throw new UserError_("The end date must be on or after the start date.");
  if (L.daysBetween(from, to) > EXPORT_MAX_DAYS) throw new UserError_("Please export at most about a year at a time.");
  var ctx = L.prepare(allData_(d));
  var wanted = (Array.isArray(request.classIds) ? request.classIds : []).filter(function (id) { return ctx.classById[id]; });
  if (!wanted.length) throw new UserError_("Please choose at least one class.");
  var tables = exportTables_(ctx, from, to, wanted);
  return loadXlsx_().then(function (lib) {
    var book = lib.utils.book_new();
    var used = Object.create(null);
    tables.classes.map(function (t) { return { name: t.name, headers: EXPORT_HEADERS, rows: t.rows }; })
      .concat([tables.all]).forEach(function (t) {
        var sheet = lib.utils.aoa_to_sheet([t.headers].concat(t.rows));
        var widths = t.headers.length > EXPORT_WIDTHS.length ? [14].concat(EXPORT_WIDTHS) : EXPORT_WIDTHS;
        sheet["!cols"] = widths.map(function (w) { return { wch: w }; });
        lib.utils.book_append_sheet(book, sheet, uniqueTabName_(t.name, used));
      });
    var bytes = lib.write(book, { bookType: "xlsx", type: "array" });
    var blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    return { url: URL.createObjectURL(blob), filename: "Logbook " + from + " to " + to + ".xlsx", lessons: tables.all.rows.length };
  });
}

// Pure: the rows for each class tab and the combined tab. Every timetabled lesson is listed.
function exportTables_(ctx, from, to, classIds) {
  var wanted = Object.create(null);
  classIds.forEach(function (id) { wanted[id] = true; });
  var byClass = Object.create(null);
  classIds.forEach(function (id) { byClass[id] = []; });
  var all = [];
  for (var day = from; day <= to; day = L.addDays(day, 1)) {
    L.lessonsOn(ctx, day).forEach(function (lesson) {
      if (!wanted[lesson.classId]) return;
      var row = exportRow_(ctx, lesson);
      byClass[lesson.classId].push(row);
      all.push([lesson.cls.name].concat(row));
    });
  }
  return {
    classes: classIds.map(function (id) { return { name: ctx.classById[id].name, rows: byClass[id] }; }),
    all: { name: "All classes", headers: ["Class"].concat(EXPORT_HEADERS), rows: all }
  };
}

function exportRow_(ctx, lesson) {
  var e = lesson.entry || {};
  var notes = [lesson.replacedBy ? "Replaced by: " + lesson.replacedBy.title : "", e.notes || ""].filter(Boolean).join("\n");
  return [
    L.shortDate(lesson.date) + " " + lesson.date.slice(0, 4),
    L.cycleName(ctx.school, lesson.cycleDay),
    lesson.periodText,
    e.plan || "", e.remind || "", e.homework || "",
    e.homeworkDue ? L.shortDate(e.homeworkDue) : "",
    notes,
    e.done ? "Yes" : ""
  ];
}

// Excel tab names: at most 31 characters, none of []*?/\: and no apostrophe at either end.
function uniqueTabName_(name, used) {
  var base = name.replace(/[\[\]\*\?\/\\:]/g, " ").replace(/^'+|'+$/g, "").trim().slice(0, 28) || "Class";
  var candidate = base;
  for (var n = 2; used[candidate.toLowerCase()]; n++) candidate = base.slice(0, 24) + " (" + n + ")";
  used[candidate.toLowerCase()] = true;
  return candidate;
}

// The spreadsheet library is only fetched the first time someone exports.
var xlsxLoading_ = null;
function loadXlsx_() {
  if (typeof XLSX !== "undefined") return Promise.resolve(XLSX);
  if (!xlsxLoading_) {
    xlsxLoading_ = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = XLSX_SRC;
      s.onload = function () { resolve(XLSX); };
      s.onerror = function () { xlsxLoading_ = null; reject(new UserError_("Couldn't load the Excel maker. Check your connection and try again.")); };
      document.head.appendChild(s);
    });
  }
  return xlsxLoading_;
}
