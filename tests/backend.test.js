// The notebook saved in a (fake) private GitHub repo: setup, saving, checks, two devices, import, export.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { loadWeb, fakeGitHub, GOOD_TOKEN } = require("./load-web");

// The converted Word log is personal, so it stays in the private repo (cloned next to this one).
const MY_FILE = path.join(__dirname, "../../teachers-second-brain/data/yau-2026-27.json");

async function connected(options) {
  const w = loadWeb(options);
  await w.connect();
  return w;
}

async function setUp(w, extra = {}) {
  return w.call("saveSetup", Object.assign({
    schoolId: "kings-college-2026",
    periods: w.ctx.STANDARD_PERIODS,
    classes: [{ id: "c-3d", name: "3D English", colour: "sage" }, { id: "c-1b", name: "1B English", colour: "sky" }],
    timetable: [
      { day: 7, period: "P6", classId: "c-3d" }, { day: 1, period: "P1", classId: "c-3d" }, { day: 1, period: "P2", classId: "c-3d" },
      { day: 1, period: "P4", classId: "c-1b" }, { day: 2, period: "P6", classId: "c-3d" }
    ]
  }, extra));
}

test("connecting checks the key with GitHub and keeps it only on this device", async () => {
  const w = loadWeb();
  await assert.rejects(w.connect("not-a-key"), /doesn't look like a GitHub access key/);
  await assert.rejects(w.connect("github_pat_" + "B".repeat(40)), (e) => e.auth === true && /didn't accept/.test(e.message));
  assert.strictEqual(w.ctx.Backend.hasToken(), false);
  await w.connect();
  assert.strictEqual(w.storage["tsb-github-token"], GOOD_TOKEN);
  w.ctx.Backend.disconnect();
  assert.strictEqual(w.ctx.Backend.hasToken(), false);
});

test("a key that can't see the private repo is refused with a clear message", async () => {
  const gh = fakeGitHub();
  gh.repoVisible = false;
  const w = loadWeb({ github: gh });
  await assert.rejects(w.connect(), /can't see the private repo/);
});

test("first use: no notebook yet, then setup creates notebook.json on the notebook branch", async () => {
  const w = await connected();
  const first = await w.call("getAll");
  assert.strictEqual(first.settings.setupDone, false);
  assert.strictEqual(w.gh.notebook(), null);
  const data = await setUp(w);
  assert.strictEqual(data.settings.setupDone, true);
  const saved = w.gh.notebook();
  assert.strictEqual(saved.settings.schoolId, "kings-college-2026");
  assert.deepStrictEqual(saved.classes.map((c) => c.name), ["3D English", "1B English"]);
  assert.deepStrictEqual(w.gh.messages, ["Save setup"]);
});

test("lessons follow the King's College cycle", async () => {
  const w = await connected();
  const data = await setUp(w);
  const ctx = w.L.prepare(data);
  const fri = JSON.parse(JSON.stringify(w.L.lessonsOn(ctx, "2026-11-06"))); // Day 1
  assert.deepStrictEqual(fri.map((l) => [l.cls.name, l.periodText, l.lengthText]), [["3D English", "P1–P2", "Double"], ["1B English", "P4", "Single"]]);
  assert.strictEqual(w.L.lessonsOn(ctx, "2026-11-16").length, 0); // holiday
});

test("saving an entry twice updates it, clearing it removes it, and each save is a commit", async () => {
  const w = await connected();
  await setUp(w);
  await w.call("saveLog", { date: "2026-11-06", classId: "c-3d", plan: "v1" });
  await w.call("saveLog", { date: "2026-11-06", classId: "c-3d", plan: "v2", homework: "GB p.3", homeworkDue: "2026-11-09" });
  let log = w.gh.notebook().log;
  assert.strictEqual(log.length, 1);
  assert.strictEqual(log[0].plan, "v2");
  assert.strictEqual(log[0].homeworkDue, "2026-11-09");
  await w.call("saveLog", { date: "2026-11-06", classId: "c-3d", plan: "" });
  assert.strictEqual(w.gh.notebook().log.length, 0);
  assert.strictEqual(w.gh.messages.filter((m) => m.startsWith("Save logbook entry, Fri 6 Nov")).length, 3);
});

test("Chinese text and emoji survive the round trip through GitHub", async () => {
  const w = await connected();
  await setUp(w);
  await w.call("saveLog", { date: "2026-11-06", classId: "c-3d", plan: "邱智樂 — 默書 ✅" });
  const fresh = loadWeb({ github: w.gh });
  await fresh.connect();
  const data = await fresh.call("getAll");
  assert.strictEqual(data.log[0].plan, "邱智樂 — 默書 ✅");
});

test("bad input is refused with a message a teacher can act on, and nothing is saved", async () => {
  const w = await connected();
  await setUp(w);
  const commits = w.gh.messages.length;
  await assert.rejects(w.call("saveLog", { date: "2026-02-30", classId: "c-3d" }), /valid date/);
  await assert.rejects(w.call("saveLog", { date: "2026-11-06", classId: "nope" }), /isn't in your timetable/);
  await assert.rejects(w.call("saveLog", { date: "2026-11-06", classId: "constructor" }), /isn't in your timetable/);
  await assert.rejects(w.call("saveEvent", { title: "", date: "2026-11-06" }), /title/i);
  await assert.rejects(w.call("saveEvent", { title: "x", date: "2026-11-06", start: "10:00", end: "09:00" }), /after the start/);
  await assert.rejects(w.call("saveLog", { date: "2026-11-06", classId: "c-3d", plan: "x".repeat(4001) }), /too long/);
  await assert.rejects(setUp(w, { classes: [{ id: "c-1", name: "3D" }, { id: "c-2", name: "3d" }], timetable: [] }), /two classes/);
  assert.strictEqual(w.gh.messages.length, commits);
});

test("a class with entries can't be deleted, only taken off the timetable", async () => {
  const w = await connected();
  await setUp(w);
  await w.call("saveLog", { date: "2026-11-06", classId: "c-1b", plan: "x" });
  await assert.rejects(setUp(w, { classes: [{ id: "c-3d", name: "3D English", colour: "sage" }], timetable: [] }), /1B English already has logbook entries/);
});

test("didn't finish: ticks this lesson and puts the rest at the top of the class's next lesson", async () => {
  const w = await connected();
  await setUp(w);
  const res = await w.call("carryForward", { entry: { date: "2026-11-05", classId: "c-3d", plan: "Unit 3 reading" }, leftover: "Finish text 2" });
  assert.strictEqual(res.current.done, true);
  assert.strictEqual(res.next.date, "2026-11-06");
  assert.strictEqual(res.next.plan, "From Thu 5 Nov: Finish text 2");
  assert.strictEqual(w.gh.notebook().log.length, 2);
});

test("events can replace lessons, and repeat by week or cycle day while skipping holidays", async () => {
  const w = await connected();
  await setUp(w);
  await w.call("saveEvent", { title: "Rehearsal", date: "2026-11-06", start: "10:55", end: "11:35", replaces: true });
  await w.call("saveEvent", { title: "Choir", date: "2026-11-02", start: "16:00", end: "17:00", repeat: "weekly", until: "2026-11-30" });
  await w.call("saveEvent", { title: "Lunch duty", date: "2026-11-05", repeat: "cycle", repeatOn: 3 });
  const ctx = w.L.prepare(await w.call("getAll"));
  const names = (d) => JSON.parse(JSON.stringify(w.L.eventsOn(ctx, d))).map((e) => e.title);
  const lessons = w.L.lessonsOn(ctx, "2026-11-06");
  assert.strictEqual(lessons.find((l) => l.classId === "c-3d").replacedBy, null);
  assert.strictEqual(lessons.find((l) => l.classId === "c-1b").replacedBy.title, "Rehearsal");
  assert.deepStrictEqual(names("2026-11-09"), ["Choir"]);
  assert.deepStrictEqual(names("2026-11-16"), []); // discretionary holiday
  assert.deepStrictEqual(names("2026-11-10"), ["Lunch duty"]); // next Day 3
});

test("to-dos save, group by due date, and finished ones can be cleared", async () => {
  const w = await connected();
  await setUp(w);
  for (const [title, due] of [["Marking", "2026-11-03"], ["Report", "2026-11-05"], ["Someday", ""]]) await w.call("saveTodo", { title, due });
  const groups = JSON.parse(JSON.stringify(w.L.groupTodos(w.L.prepare(await w.call("getAll")), "2026-11-05")));
  assert.deepStrictEqual(groups.overdue.map((t) => t.title), ["Marking"]);
  assert.deepStrictEqual(groups.today.map((t) => t.title), ["Report"]);
  const marking = (await w.call("getAll")).todos.find((t) => t.title === "Marking");
  await w.call("saveTodo", Object.assign({}, marking, { done: true }));
  const res = await w.call("clearDoneTodos");
  assert.deepStrictEqual(res.todos.map((t) => t.title).sort(), ["Report", "Someday"]);
});

test("two devices: a save made elsewhere in between is kept, and this change is applied on top", async () => {
  const w = await connected();
  await setUp(w);
  await w.call("getAll");
  // The phone adds a to-do after the laptop last loaded.
  w.gh.saveAsOtherDevice((doc) => doc.todos.push({ id: "phone1", title: "From the phone", due: "", time: "", classId: "", notes: "", done: false, doneAt: "" }));
  await w.call("saveLog", { date: "2026-11-06", classId: "c-3d", plan: "From the laptop" });
  const doc = w.gh.notebook();
  assert.deepStrictEqual(doc.todos.map((t) => t.title), ["From the phone"]);
  assert.strictEqual(doc.log[0].plan, "From the laptop");
});

test("saves made quickly one after another all land, in order", async () => {
  const w = await connected();
  await setUp(w);
  await Promise.all([1, 2, 3, 4].map((n) => w.call("saveTodo", { title: "T" + n })));
  assert.deepStrictEqual(w.gh.notebook().todos.map((t) => t.title), ["T1", "T2", "T3", "T4"]);
});

test("losing the connection or the key gives a readable error, not a crash", async () => {
  const w = await connected();
  await setUp(w);
  w.gh.down = true;
  await assert.rejects(w.call("saveTodo", { title: "x" }), /Couldn't reach GitHub/);
  w.gh.down = false;
  w.gh.token = "revoked";
  await assert.rejects(w.call("getAll"), (e) => e.auth === true && /didn't accept your access key/.test(e.message));
});

test("importing the Word log brings in setup, entries and events, and never overwrites", { skip: !fs.existsSync(MY_FILE) }, async () => {
  const w = await connected();
  const file = JSON.parse(fs.readFileSync(MY_FILE, "utf8"));
  const first = await w.call("importData", file);
  assert.strictEqual(first.counts.log.added, file.log.length);
  assert.strictEqual(first.counts.events.added, 11);
  assert.strictEqual(first.data.classes.length, 5);
  const again = await w.call("importData", file);
  assert.strictEqual(again.counts.log.added, 0);
  assert.strictEqual(again.counts.log.skipped, file.log.length);
  const ctx = w.L.prepare(again.data);
  file.log.forEach((e) => assert.ok(w.L.lessonsOn(ctx, e.date).some((l) => l.classId === e.classId), e.date + " " + e.classId));
});

test("an import over the limits changes nothing", async () => {
  const w = await connected();
  await setUp(w);
  const before = w.gh.messages.length;
  const events = Array.from({ length: 2001 }, (_, i) => ({ title: "E" + i, date: "2026-11-06" }));
  await assert.rejects(w.call("importData", { format: "teachers-second-brain", classes: [{ id: "c-x", name: "New", colour: "sky" }], timetable: [], events }), /limit/);
  assert.strictEqual(w.gh.messages.length, before);
  assert.deepStrictEqual(w.gh.notebook().classes.map((c) => c.name), ["3D English", "1B English"]);
});

test("export makes one tab per class plus All classes, listing every lesson", async () => {
  const sheets = [];
  const xlsx = {
    utils: {
      book_new: () => ({ tabs: [] }),
      aoa_to_sheet: (rows) => ({ rows }),
      book_append_sheet: (book, sheet, name) => { book.tabs.push(name); sheets.push({ name, rows: JSON.parse(JSON.stringify(sheet.rows)) }); }
    },
    write: (book) => new Uint8Array([1, 2, 3])
  };
  const w = await connected({ xlsx });
  await setUp(w, { classes: [{ id: "c-3d", name: "'3D' English", colour: "sage" }, { id: "c-1b", name: "1B English", colour: "sky" }] });
  await w.call("saveLog", { date: "2026-11-06", classId: "c-3d", plan: "1/2", done: true });
  const res = await w.call("exportExcel", { from: "2026-11-02", to: "2026-11-06", classIds: ["c-3d", "c-1b"] });
  assert.strictEqual(res.filename, "Logbook 2026-11-02 to 2026-11-06.xlsx");
  assert.deepStrictEqual(sheets.map((s) => s.name), ["3D' English", "1B English", "All classes"]);
  // 3D is on Days 1, 2 and 7: Thu 5 Nov is Day 7 and Fri 6 Nov is Day 1.
  assert.deepStrictEqual(sheets[0].rows.slice(1).map((r) => r[0]), ["Thu 5 Nov 2026", "Fri 6 Nov 2026"]);
  assert.strictEqual(sheets[0].rows[2][3], "1/2");
  assert.strictEqual(sheets[0].rows[2][8], "Yes");
  await assert.rejects(w.call("exportExcel", { from: "2026-11-06", to: "2026-11-02", classIds: ["c-3d"] }), /on or after/);
});
