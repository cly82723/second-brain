// The whole request flow against a fake Google, for one teacher and for two side by side.
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const { loadServer, OWNER } = require("./fake-gas");

const THU_NOON = Date.parse("2026-11-05T12:00:00+08:00");
const AT_8PM = Date.parse("2026-11-05T20:10:00+08:00");
// Values made inside the script sandbox have their own Array type; compare them as plain JSON.
const plain = x => JSON.parse(JSON.stringify(x));
// The converted Word log is personal, so it stays outside this public repo (next to it on this computer).
const MY_FILE = path.join(__dirname, "../../teachers-second-brain/data/yau-2026-27.json");

function setUp(s, extra = {}) {
  const periods = s.ctx.STANDARD_PERIODS;
  const res = s.call("saveSetup", Object.assign({
    schoolId: "kings-college-2026",
    periods,
    classes: [{ id: "c-3d", name: "3D English", colour: "sage" }, { id: "c-1b", name: "1B English", colour: "sky" }],
    timetable: [
      { day: 7, period: "P6", classId: "c-3d" }, { day: 1, period: "P1", classId: "c-3d" }, { day: 1, period: "P2", classId: "c-3d" },
      { day: 1, period: "P4", classId: "c-1b" }, { day: 2, period: "P6", classId: "c-3d" }
    ]
  }, extra));
  assert.strictEqual(res.ok, true, res.error);
  return res.data;
}

test("first use makes the data sheet and starts with setup not done", () => {
  const s = loadServer({ now: THU_NOON });
  const res = s.call("getAll");
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.data.settings.setupDone, false);
  assert.ok(s.book());
  assert.deepStrictEqual(s.book().sheets.map(x => x.name), ["Settings", "Classes", "Timetable", "Log", "Events", "Todos"]);
});

test("setup saves classes and timetable, and lessons follow the cycle", () => {
  const s = loadServer({ now: THU_NOON });
  const data = setUp(s);
  assert.strictEqual(data.settings.setupDone, true);
  assert.strictEqual(data.settings.startDate, "2026-11-05");
  const L = s.ctx.logic_();
  const ctx = L.prepare(data);
  const fri = L.lessonsOn(ctx, "2026-11-06"); // Day 1
  assert.deepStrictEqual(plain(fri).map(l => [l.cls.name, l.periodText, l.lengthText]), [["3D English", "P1–P2", "Double"], ["1B English", "P4", "Single"]]);
  assert.strictEqual(L.lessonsOn(ctx, "2026-11-16").length, 0); // holiday
});

test("text that looks like a formula or a date is kept exactly as typed", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  const res = s.call("saveLog", { date: "2026-11-06", classId: "c-3d", plan: "=IMPORTXML(1)", notes: "2026-11-05", done: true });
  assert.strictEqual(res.ok, true);
  const entry = s.call("getAll").data.log[0];
  assert.strictEqual(entry.plan, "=IMPORTXML(1)");
  assert.strictEqual(entry.notes, "2026-11-05");
  assert.strictEqual(entry.done, true);
});

test("saving an entry twice updates it, and clearing it removes the row", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  s.call("saveLog", { date: "2026-11-06", classId: "c-3d", plan: "v1" });
  s.call("saveLog", { date: "2026-11-06", classId: "c-3d", plan: "v2", homework: "GB p.3", homeworkDue: "2026-11-09" });
  let log = s.call("getAll").data.log;
  assert.strictEqual(log.length, 1);
  assert.strictEqual(log[0].plan, "v2");
  assert.strictEqual(log[0].homeworkDue, "2026-11-09");
  s.call("saveLog", { date: "2026-11-06", classId: "c-3d", plan: "" });
  log = s.call("getAll").data.log;
  assert.strictEqual(log.length, 0);
});

test("bad input is refused with a message a teacher can act on", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  assert.match(s.call("saveLog", { date: "2026-02-30", classId: "c-3d" }).error, /valid date/);
  assert.match(s.call("saveLog", { date: "2026-11-06", classId: "nope" }).error, /isn't in your timetable/);
  assert.match(s.call("saveEvent", { title: "", date: "2026-11-06" }).error, /title/i);
  assert.match(s.call("saveEvent", { title: "x", date: "2026-11-06", start: "10:00", end: "09:00" }).error, /after the start/);
  assert.match(s.call("saveLog", { date: "2026-11-06", classId: "c-3d", plan: "x".repeat(4001) }).error, /too long/);
  assert.match(s.call("saveSetup", { schoolId: "kings-college-2026", periods: s.ctx.STANDARD_PERIODS, classes: [{ id: "c-1", name: "3D" }, { id: "c-2", name: "3d" }], timetable: [] }).error, /two classes/);
});

test("a class with entries can't be deleted, only taken off the timetable", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  s.call("saveLog", { date: "2026-11-06", classId: "c-1b", plan: "x" });
  const res = s.call("saveSetup", {
    schoolId: "kings-college-2026", periods: s.ctx.STANDARD_PERIODS,
    classes: [{ id: "c-3d", name: "3D English", colour: "sage" }], timetable: []
  });
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /1B English already has logbook entries/);
});

test("didn't finish: ticks this lesson and puts the rest at the top of the class's next lesson", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  s.call("saveLog", { date: "2026-11-09", classId: "c-3d", plan: "Already planned" });
  // 3D: Thu 5 Nov is Day 7, next is Fri 6 Nov (Day 1).
  const res = s.call("carryForward", { entry: { date: "2026-11-05", classId: "c-3d", plan: "Unit 3 reading" }, leftover: "Finish text 2" });
  assert.strictEqual(res.ok, true, res.error);
  assert.strictEqual(res.data.current.done, true);
  assert.strictEqual(res.data.next.date, "2026-11-06");
  assert.strictEqual(res.data.next.plan, "From Thu 5 Nov: Finish text 2");
});

test("an event that replaces lessons takes over only the periods it overlaps", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  s.call("saveEvent", { title: "Rehearsal", date: "2026-11-06", start: "10:55", end: "11:35", replaces: true });
  const L = s.ctx.logic_();
  const ctx = L.prepare(s.call("getAll").data);
  const lessons = L.lessonsOn(ctx, "2026-11-06");
  assert.strictEqual(lessons.find(l => l.classId === "c-3d").replacedBy, null);
  assert.strictEqual(lessons.find(l => l.classId === "c-1b").replacedBy.title, "Rehearsal");
});

test("repeating events follow the week or the cycle and skip holidays", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  s.call("saveEvent", { title: "Choir", date: "2026-11-02", start: "16:00", end: "17:00", repeat: "weekly", until: "2026-11-30" });
  s.call("saveEvent", { title: "Lunch duty", date: "2026-11-05", repeat: "cycle", repeatOn: 3 });
  const L = s.ctx.logic_();
  const ctx = L.prepare(s.call("getAll").data);
  assert.deepStrictEqual(plain(L.eventsOn(ctx, "2026-11-09")).map(e => e.title), ["Choir"]);
  assert.deepStrictEqual(plain(L.eventsOn(ctx, "2026-11-16")).map(e => e.title), []); // Discretionary holiday
  // Mon 7 Dec: Choir has ended ("until" 30 Nov); it's also a Day 3, so lunch duty is on.
  assert.deepStrictEqual(plain(L.eventsOn(ctx, "2026-12-07")).map(e => e.title), ["Lunch duty"]);
  // Day 3 after 5 Nov: Tue 10 Nov.
  assert.deepStrictEqual(plain(L.eventsOn(ctx, "2026-11-10")).map(e => e.title), ["Lunch duty"]);
});

test("to-dos are grouped by when they're due", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  [["Marking", "2026-11-03"], ["Report", "2026-11-05"], ["Prep ERS", "2026-11-09"], ["Plan trip", "2026-12-20"], ["Someday", ""]]
    .forEach(([title, due]) => s.call("saveTodo", { title, due }));
  const L = s.ctx.logic_();
  const groups = L.groupTodos(L.prepare(s.call("getAll").data), "2026-11-05");
  assert.deepStrictEqual(Object.fromEntries(Object.entries(plain(groups)).map(([k, v]) => [k, v.map(t => t.title)])),
    { overdue: ["Marking"], today: ["Report"], week: ["Prep ERS"], later: ["Plan trip"], someday: ["Someday"] });
});

test("not updated lists ended lessons that weren't ticked, since the teacher started", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  s.call("saveLog", { date: "2026-11-06", classId: "c-3d", plan: "x" });
  const L = s.ctx.logic_();
  const ctx = L.prepare(s.call("getAll").data);
  // Friday 6 Nov at 10:00: 3D (P1-P2) has ended, 1B (P4) hasn't.
  const list = L.notUpdated(ctx, "2026-11-05", "2026-11-06", 10 * 60);
  assert.deepStrictEqual(plain(list).map(l => l.date + " " + l.cls.name), ["2026-11-05 3D English", "2026-11-06 3D English"]);
});

test("the evening email covers tomorrow and is only sent when something is on", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  s.call("saveLog", { date: "2026-11-06", classId: "c-3d", plan: "ERS final reminders", remind: "Bring booklet" });
  s.call("saveLog", { date: "2026-11-02", classId: "c-1b", homework: "Vocab WS", homeworkDue: "2026-11-06" });
  s.call("saveTodo", { title: "Print ERS booklets", due: "2026-11-06" });
  const on = s.call("saveEmail", { on: true, hour: 20 });
  assert.strictEqual(on.ok, true);
  assert.strictEqual(s.triggers.length, 1);
  assert.strictEqual(s.triggers[0].everyHours, 1);
  // The hourly trigger sends nothing before the chosen hour, then sends once it's 8 pm.
  s.ctx.dailyDigest();
  assert.strictEqual(s.sent.length, 0);
  s.setNow(AT_8PM);
  s.ctx.dailyDigest();
  assert.strictEqual(s.sent.length, 1);
  const mail = s.sent[0];
  assert.strictEqual(mail.to, OWNER);
  assert.match(mail.subject, /Tomorrow, Fri 6 Nov · Day 1: 2 lessons/);
  ["ERS final reminders", "Bring booklet", "Vocab WS", "Print ERS booklets", "Annual Cross Country Run"].forEach(t => assert.ok(mail.body.includes(t), t));
  // Friday evening: Saturday has nothing on, so nothing is sent.
  s.setNow(Date.parse("2026-11-06T20:00:00+08:00"));
  s.ctx.dailyDigest();
  assert.strictEqual(s.sent.length, 1);
  // Turning it off removes the trigger.
  s.call("saveEmail", { on: false, hour: 20 });
  assert.strictEqual(s.triggers.length, 0);
});

test("email HTML escapes what teachers typed", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  s.call("saveLog", { date: "2026-11-06", classId: "c-3d", plan: "<script>x</script>" });
  s.call("saveEmail", { on: true, hour: 20 });
  s.setNow(AT_8PM);
  s.ctx.dailyDigest();
  assert.ok(!s.sent[0].htmlBody.includes("<script>"));
  assert.ok(s.sent[0].htmlBody.includes("&lt;script&gt;"));
});

test("importing my Word log brings in setup, entries and events, and never overwrites", { skip: !fs.existsSync(MY_FILE) }, () => {
  const s = loadServer({ now: THU_NOON });
  const file = JSON.parse(fs.readFileSync(MY_FILE, "utf8"));
  const first = s.call("importData", file);
  assert.strictEqual(first.ok, true, first.error);
  assert.strictEqual(first.data.counts.log.added, file.log.length);
  assert.strictEqual(first.data.counts.log.skipped, 0);
  assert.strictEqual(first.data.counts.events.added, 11);
  assert.strictEqual(first.data.data.classes.length, 5);
  const again = s.call("importData", file);
  assert.strictEqual(again.data.counts.log.added, 0);
  assert.strictEqual(again.data.counts.log.skipped, file.log.length);
  // Every imported entry lands on a real lesson in the app's calendar.
  const L = s.ctx.logic_();
  const ctx = L.prepare(again.data.data);
  file.log.forEach(e => assert.ok(L.lessonsOn(ctx, e.date).some(l => l.classId === e.classId), e.date + " " + e.classId));
});

test("a blank row left in the Sheet doesn't make a save or delete hit the wrong row", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  const a = s.call("saveTodo", { title: "A" }).data.todo;
  const b = s.call("saveTodo", { title: "B" }).data.todo;
  const todos = s.book().tab("Todos");
  todos.rows.splice(1, 0, ["", "", "", "", "", "", "", ""]); // someone clears a row above A
  s.call("deleteTodo", b.id);
  s.call("saveTodo", Object.assign({}, a, { title: "A2" }));
  assert.deepStrictEqual(s.call("getAll").data.todos.map(t => t.title), ["A2"]);
});

test("a passing Google error doesn't swap in an empty data sheet; a deleted sheet is replaced", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  const original = s.ctx.SpreadsheetApp.openById;
  s.ctx.SpreadsheetApp.openById = () => { throw new Error("Service Spreadsheets failed while accessing document"); };
  const res = s.call("getAll");
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /try again/);
  s.ctx.SpreadsheetApp.openById = original;
  assert.strictEqual(s.call("getAll").data.settings.setupDone, true);
  s.ctx.SpreadsheetApp.openById = () => { throw new Error("No item with the given ID could be found."); };
  assert.strictEqual(s.call("getAll").data.settings.setupDone, false);
});

test("ids like constructor can't pass as classes or periods", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  assert.strictEqual(s.call("saveLog", { date: "2026-11-06", classId: "constructor", plan: "x" }).ok, false);
  const res = s.call("saveSetup", { schoolId: "kings-college-2026", periods: s.ctx.STANDARD_PERIODS,
    classes: [{ id: "c-3d", name: "3D English", colour: "sage" }], timetable: [{ day: 1, period: "constructor", classId: "c-3d" }] });
  assert.strictEqual(res.ok, false);
});

test("an import over the limits changes nothing", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  const events = Array.from({ length: 2001 }, (_, i) => ({ title: "E" + i, date: "2026-11-06" }));
  const res = s.call("importData", { format: "teachers-second-brain", classes: [{ id: "c-x", name: "New class", colour: "sky" }], timetable: [], events });
  assert.strictEqual(res.ok, false);
  assert.deepStrictEqual(s.call("getAll").data.classes.map(c => c.name), ["3D English", "1B English"]);
});

const KEY = "a".repeat(64);

test("without the secret code the web app refuses, and reads nothing", () => {
  const s = loadServer({ props: { ACCESS_KEY: KEY } });
  for (const key of [undefined, "", "b".repeat(64), KEY.slice(1), KEY + "x"]) {
    const res = s.post({ action: "getAll", key });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.locked, true);
  }
  assert.strictEqual(s.book(), undefined); // not even the data sheet was opened or made
});

test("with the code, the page's requests work, and unknown actions are refused", () => {
  const s = loadServer({ props: { ACCESS_KEY: KEY } });
  const res = s.post({ action: "getAll", key: KEY, args: [] });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.data.settings.setupDone, false);
  assert.strictEqual(res.data.email, OWNER);
  const saved = s.post({ action: "saveTodo", key: KEY, args: [{ title: "Mark essays" }] });
  assert.strictEqual(saved.data.todo.title, "Mark essays");
  assert.match(s.post({ action: "createAccessKey", key: KEY }).error, /Unknown request/);
  assert.match(s.post({ action: "constructor", key: KEY }).error, /Unknown request/);
  assert.match(s.ctx.doPost({ postData: { contents: "not json" } }).getContent(), /didn't make sense/);
});

test("no code set up yet means everything is refused", () => {
  const s = loadServer();
  assert.strictEqual(s.post({ action: "getAll", key: "" }).locked, true);
});

test("createAccessKey makes a long code once and gives the personal link", () => {
  const s = loadServer();
  const link = s.ctx.createAccessKey();
  assert.match(link, /^https:\/\/cly82723\.github\.io\/second-brain\/#k=[0-9a-f]{64}$/);
  assert.strictEqual(s.ctx.createAccessKey(), link);
  assert.strictEqual(s.post({ action: "getAll", key: link.split("#k=")[1] }).ok, true);
});

test("the evening email links to the site without the secret code", () => {
  const s = loadServer({ props: { ACCESS_KEY: KEY } });
  setUp(s);
  s.call("saveLog", { date: "2026-11-06", classId: "c-3d", plan: "ERS" });
  s.call("saveEmail", { on: true, hour: 20 });
  s.setNow(AT_8PM);
  s.ctx.dailyDigest();
  assert.ok(s.sent[0].htmlBody.includes("https://cly82723.github.io/second-brain/"));
  assert.ok(!s.sent[0].htmlBody.includes(KEY));
});

// ---------- other teachers' notebooks ----------
const GUEST_EMAIL = "colleague@example.com";

function addGuest(s, name = "CCY", email = GUEST_EMAIL) {
  s.ctx.NEW_TEACHER.name = name;
  s.ctx.NEW_TEACHER.email = email;
  const link = s.ctx.addTeacher();
  return link.split("#k=")[1];
}

function guestId(s) { return JSON.parse(s.props.NOTEBOOKS)[0].id; }

const KTGSS_SETUP = (s) => ({
  schoolId: "ktgss-2026",
  periods: s.ctx.KTGSS_PERIODS,
  classes: [{ id: "c-4a", name: "4A English", colour: "sage" }],
  timetable: [{ day: 1, period: "P1", classId: "c-4a" }, { day: 2, period: "P1", classId: "c-4a" }]
});

test("addTeacher gives another teacher their own link, once per name", () => {
  const s = loadServer({ props: { ACCESS_KEY: KEY } });
  const key = addGuest(s);
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.notStrictEqual(key, KEY);
  assert.strictEqual(addGuest(s, "ccy", "new@example.com"), key); // same name: same link, email updated
  assert.strictEqual(JSON.parse(s.props.NOTEBOOKS).length, 1);
  assert.strictEqual(JSON.parse(s.props.NOTEBOOKS)[0].email, "new@example.com");
  assert.throws(() => addGuest(s, "", ""), /Fill in NEW_TEACHER/);
  assert.throws(() => addGuest(s, "XYZ", "not-an-email"), /email/);
  assert.strictEqual(s.ctx.listTeachers()[0].link, "https://cly82723.github.io/second-brain/#k=" + key);
});

test("each teacher's link opens only their own notebook and Sheet", () => {
  const s = loadServer({ now: THU_NOON, props: { ACCESS_KEY: KEY } });
  const guestKey = addGuest(s);
  setUp(s); // the owner's King's College notebook
  const saved = s.post({ action: "saveSetup", key: guestKey, args: [KTGSS_SETUP(s)] });
  assert.strictEqual(saved.ok, true, saved.error);
  s.post({ action: "saveTodo", key: guestKey, args: [{ title: "Mark 4A essays" }] });

  const mine = s.post({ action: "getAll", key: KEY }).data;
  const theirs = s.post({ action: "getAll", key: guestKey }).data;
  assert.strictEqual(mine.settings.schoolId, "kings-college-2026");
  assert.strictEqual(theirs.settings.schoolId, "ktgss-2026");
  assert.deepStrictEqual(mine.todos, []);
  assert.deepStrictEqual(theirs.todos.map(t => t.title), ["Mark 4A essays"]);
  assert.strictEqual(mine.owner, true);
  assert.strictEqual(theirs.owner, false);
  assert.strictEqual(mine.email, OWNER);
  assert.strictEqual(theirs.email, GUEST_EMAIL);
  assert.notStrictEqual(s.book(guestId(s)), s.book());
  assert.match(s.book(guestId(s)).name, / – CCY$/);
  // Their bell times: P1 starts at 08:40, and Day 1 on Friday 6 Nov... is Day 2 at KTGSS.
  assert.strictEqual(theirs.periods.find(p => p.id === "P1").start, "08:40");
  const L = s.ctx.logic_();
  assert.deepStrictEqual(plain(L.lessonsOn(L.prepare(theirs), "2026-11-06")).map(l => l.cls.name + " " + l.start), ["4A English 08:40"]);
  // The owner's Sheet link isn't handed to other teachers.
  assert.strictEqual(s.post({ action: "getDataSheetUrl", key: guestKey }).ok, false);
  assert.strictEqual(s.post({ action: "getDataSheetUrl", key: KEY }).ok, true);
});

test("a damaged notebook list locks other teachers out but never the owner", () => {
  const s = loadServer({ props: { ACCESS_KEY: KEY } });
  const guestKey = addGuest(s);
  s.props.NOTEBOOKS = "{broken";
  assert.strictEqual(s.post({ action: "getAll", key: guestKey }).locked, true);
  assert.strictEqual(s.post({ action: "getAll", key: KEY }).ok, true);
});

test("evening emails go to each teacher at their own hour, from one hourly trigger", () => {
  const s = loadServer({ now: THU_NOON, props: { ACCESS_KEY: KEY } });
  const guestKey = addGuest(s);
  setUp(s);
  s.post({ action: "saveSetup", key: guestKey, args: [KTGSS_SETUP(s)] });
  // From here on, every request names its notebook by key, as the page's requests do.
  s.post({ action: "saveLog", key: KEY, args: [{ date: "2026-11-06", classId: "c-3d", plan: "Owner plan" }] });
  s.post({ action: "saveLog", key: guestKey, args: [{ date: "2026-11-06", classId: "c-4a", plan: "Guest plan" }] });
  s.post({ action: "saveEmail", key: KEY, args: [{ on: true, hour: 20 }] });
  assert.strictEqual(s.post({ action: "saveEmail", key: guestKey, args: [{ on: true, hour: 21 }] }).ok, true);
  assert.strictEqual(s.triggers.length, 1);

  s.setNow(AT_8PM);
  s.ctx.dailyDigest();
  assert.deepStrictEqual(s.sent.map(m => m.to), [OWNER]);
  assert.ok(s.sent[0].body.includes("Owner plan") && !s.sent[0].body.includes("Guest plan"));

  s.setNow(Date.parse("2026-11-05T21:10:00+08:00"));
  s.ctx.dailyDigest();
  assert.deepStrictEqual(s.sent.map(m => m.to), [OWNER, GUEST_EMAIL]);
  assert.ok(s.sent[1].body.includes("Guest plan") && !s.sent[1].body.includes("Owner plan"));

  // The trigger stays while either has it on, and goes when both turn it off.
  s.post({ action: "saveEmail", key: KEY, args: [{ on: false, hour: 20 }] });
  assert.strictEqual(s.triggers.length, 1);
  s.post({ action: "saveEmail", key: guestKey, args: [{ on: false, hour: 21 }] });
  assert.strictEqual(s.triggers.length, 0);
});

test("addTeacher refuses to save over a damaged teacher list", () => {
  const s = loadServer({ props: { ACCESS_KEY: KEY } });
  addGuest(s);
  s.props.NOTEBOOKS = s.props.NOTEBOOKS.slice(0, -1); // a hand-edit typo
  const before = s.props.NOTEBOOKS;
  assert.throws(() => addGuest(s, "Someone else"), /damaged/);
  assert.throws(() => s.ctx.listTeachers(), /damaged/);
  assert.strictEqual(s.props.NOTEBOOKS, before);
});

test("the evening email is sent once a day: never twice, and late rather than lost", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  s.call("saveLog", { date: "2026-11-06", classId: "c-3d", plan: "ERS" });
  s.call("saveEmail", { on: true, hour: 20 });
  // The 8 pm run was skipped by Google: the 9 pm run sends it.
  s.setNow(Date.parse("2026-11-05T21:05:00+08:00"));
  s.ctx.dailyDigest();
  assert.strictEqual(s.sent.length, 1);
  // Saving the setting again and another run the same evening send nothing more.
  s.call("saveEmail", { on: true, hour: 20 });
  s.setNow(Date.parse("2026-11-05T21:40:00+08:00"));
  s.ctx.dailyDigest();
  s.setNow(Date.parse("2026-11-05T22:05:00+08:00"));
  s.ctx.dailyDigest();
  assert.strictEqual(s.sent.length, 1);
});

test("a teacher added without an email can't turn the evening email on", () => {
  const s = loadServer({ props: { ACCESS_KEY: KEY } });
  const guestKey = addGuest(s, "No Mail", "");
  const res = s.post({ action: "saveEmail", key: guestKey, args: [{ on: true, hour: 20 }] });
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /no email address/);
  assert.strictEqual(s.post({ action: "sendTestEmail", key: guestKey }).ok, false);
  assert.strictEqual(s.sent.length, 0);
});
