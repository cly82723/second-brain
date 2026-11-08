// Follow-ups, homework on its due date, categories, undated items, marking, name lists and the
// gradebook scoresheet link, against the real web app code running on a fake Google.
const test = require("node:test");
const assert = require("node:assert");
const { loadServer } = require("./fake-gas");

const THU_NOON = Date.parse("2026-11-05T12:00:00+08:00");
const plain = x => JSON.parse(JSON.stringify(x));
const SHEET_ID = "1oWKKKYJ92FF7QgNfhr-TESTSHEET01";

function setUp(s) {
  const res = s.call("saveSetup", {
    schoolId: "kings-college-2026", periods: s.ctx.STANDARD_PERIODS,
    classes: [{ id: "c-3d", name: "3D English", colour: "sage" }, { id: "c-1b", name: "S1E2 English", colour: "sky" }],
    timetable: [{ day: 1, period: "P1", classId: "c-3d" }, { day: 1, period: "P4", classId: "c-1b" }, { day: 2, period: "P6", classId: "c-3d" }]
  });
  assert.strictEqual(res.ok, true, res.error);
}

const ctxOf = s => s.ctx.logic_().prepare(s.call("getAll").data);

test("plan, covered and follow-up are kept apart", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  const res = s.call("saveLog", { date: "2026-11-05", classId: "c-3d", plan: "Read text 2", covered: "Read half", followUp: "Finish text 2" });
  assert.strictEqual(res.ok, true, res.error);
  const e = s.call("getAll").data.log[0];
  assert.deepStrictEqual([e.plan, e.covered, e.followUp, e.followUpDone], ["Read text 2", "Read half", "Finish text 2", false]);
  // A follow-up can't be "done" without any text.
  s.call("saveLog", { date: "2026-11-06", classId: "c-3d", plan: "x", followUpDone: true });
  assert.strictEqual(s.call("getAll").data.log.find(x => x.date === "2026-11-06").followUpDone, false);
});

test("a follow-up sits on one lesson at a time, and moves on if that lesson passes unticked", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  // Written Mon 2 Nov; its next lesson (Tue 3 Nov) has passed, so it shows on the next one from today.
  s.call("saveLog", { date: "2026-11-02", classId: "c-3d", followUp: "Return quizzes" });
  const L = s.ctx.logic_();
  const ctx = ctxOf(s);
  const shown = ["2026-11-06", "2026-11-09"].map(d => plain(L.lessonsOn(ctx, d)).find(x => x.classId === "c-3d").followUps.length);
  assert.deepStrictEqual(shown, [1, 0]);
});

test("a follow-up skips a lesson that an item replaces", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  s.call("saveLog", { date: "2026-11-05", classId: "c-3d", followUp: "Finish text 2" });
  s.call("saveEvent", { title: "Assembly talk", date: "2026-11-06", start: "08:30", end: "09:10", replaces: true });
  const L = s.ctx.logic_();
  const ctx = ctxOf(s);
  const on = d => plain(L.lessonsOn(ctx, d)).find(x => x.classId === "c-3d").followUps.length;
  assert.deepStrictEqual([on("2026-11-06"), on("2026-11-09")], [0, 1]);
});

test("an older Sheet gets the new column names and its rows still read", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  const log = s.book().tab("Log");
  log.rows[0] = ["Date", "Class Id", "Plan / covered", "Remind students", "Homework", "Homework due", "Notes", "Done", "Updated"];
  log.rows.push(["2026-11-05", "c-3d", "Old plan", "", "", "", "", "yes", "2026-11-05"]);
  s.ctx.syncedTabs_ = {}; // a new run of the web app
  const e = s.call("getAll").data.log[0];
  assert.strictEqual(e.plan, "Old plan");
  assert.strictEqual(e.covered, "");
  assert.strictEqual(log.rows[0][9], "Covered");
});

test("homework shows on the day it's handed in, with that class's lesson", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  s.call("saveLog", { date: "2026-11-05", classId: "c-1b", homework: "Vocab WS", homeworkDue: "2026-11-06" });
  const L = s.ctx.logic_();
  const ctx = ctxOf(s);
  const fri = plain(L.lessonsOn(ctx, "2026-11-06"));
  assert.deepStrictEqual(fri.find(l => l.classId === "c-1b").collect.map(e => e.homework), ["Vocab WS"]);
  assert.deepStrictEqual(fri.find(l => l.classId === "c-3d").collect, []);
  assert.deepStrictEqual(plain(L.homeworkDueOn(ctx, "2026-11-06")).map(h => h.cls.name), ["S1E2 English"]);
});

test("to-dos have categories from an editable list; a deleted category is dropped", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  assert.deepStrictEqual(s.call("getAll").data.categories.map(c => c.name), ["Admin", "Lesson prep", "Meetings", "Duties", "Personal"]);
  assert.strictEqual(s.call("saveTodo", { title: "Fill form", category: "admin", due: "" }).data.todo.category, "admin");
  assert.strictEqual(s.call("saveTodo", { title: "Odd", category: "nope" }).data.todo.category, "");
  const saved = s.call("saveCategories", [{ id: "admin", name: "Admin", colour: "sky" }, { id: "panel", name: "Panel work", colour: "teal" }]);
  assert.strictEqual(saved.ok, true, saved.error);
  assert.deepStrictEqual(s.call("getAll").data.categories.map(c => c.name), ["Admin", "Panel work"]);
  assert.strictEqual(s.call("saveTodo", { title: "Minutes", category: "meetings" }).data.todo.category, "");
  assert.strictEqual(s.call("saveCategories", [{ id: "a1", name: "Same" }, { id: "a2", name: "same" }]).ok, false);
});

test("undated to-dos, homework and marking are found", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  s.call("saveTodo", { title: "No date" });
  s.call("saveTodo", { title: "Dated", due: "2026-11-09" });
  s.call("saveLog", { date: "2026-11-05", classId: "c-3d", homework: "Essay" });
  s.call("saveMark", { title: "Dictation", classId: "c-1b" });
  s.call("saveMark", { title: "Quiz", due: "2026-11-10" });
  const L = s.ctx.logic_();
  const u = plain(L.undated(ctxOf(s)));
  assert.deepStrictEqual([u.todos.map(t => t.title), u.homework.map(e => e.homework), u.marks.map(m => m.title)], [["No date"], ["Essay"], ["Dictation"]]);
  assert.strictEqual(L.undatedCount(u), 3);
});

test("marking: counts, hand-ins and progress; the page can't claim a scoresheet column", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  const plainMark = s.call("saveMark", { title: "Unit 3 test", scripts: 30, marked: 12, due: "2026-11-12", sheetCol: "Z" });
  assert.strictEqual(plainMark.ok, true, plainMark.error);
  assert.strictEqual(plainMark.data.mark.sheetCol, "");
  assert.strictEqual(s.call("saveMark", { title: "Bad", scripts: 3, marked: 5 }).ok, false);
  const L = s.ctx.logic_();
  assert.deepStrictEqual(plain(L.markProgress(plainMark.data.mark)), { total: 30, marked: 12, missing: [], fromList: false });
  const listed = s.call("saveMark", { title: "Dictation", classId: "c-1b", students: { 1: { s: "S", m: true }, 2: { s: "L" }, 3: { s: "M" }, 4: { s: "A" } } }).data.mark;
  assert.deepStrictEqual(plain(L.markProgress(listed)), { total: 2, marked: 1, missing: ["3"], fromList: true });
  assert.strictEqual(s.call("saveMark", { title: "x", classId: "c-1b", students: { "1; DROP": { s: "S" } } }).ok, false);
  assert.strictEqual(s.call("deleteMark", listed.id).data.removed, true);
});

test("name lists: pasted lists are checked and kept per class", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  const res = s.call("saveRoster", "c-1b", [{ no: 2, name: "CHAN KAYDEN" }, { no: 1, name: "CHAN CHI HIM" }]);
  assert.strictEqual(res.ok, true, res.error);
  assert.deepStrictEqual(s.call("getAll").data.rosters["c-1b"], [{ no: 1, name: "CHAN CHI HIM" }, { no: 2, name: "CHAN KAYDEN" }]);
  assert.strictEqual(s.call("saveRoster", "c-1b", [{ no: 1, name: "A" }, { no: 1, name: "B" }]).ok, false);
  assert.strictEqual(s.call("saveRoster", "c-zz", [{ no: 1, name: "A" }]).ok, false);
});

// ---------- the gradebook scoresheet ----------
// The layout of the Google Sheets Gradebook template, with assignments already in D onwards.
function gradebook(s, { students = 4, used = 4 } = {}) {
  const book = s.addBook(SHEET_ID, "S.3 English gradebook");
  book.sheets[0].setName("Overview");
  const g = book.insertSheet("Grades");
  const row = (cells) => { const r = []; Object.entries(cells).forEach(([c, v]) => { r[Number(c)] = v; }); return r; };
  const cols = (fn) => Object.fromEntries(Array.from({ length: used }, (_, i) => [3 + i, fn(i)]));
  g.rows[1] = row(Object.assign({ 1: "CLASS NAME" }, cols(i => "Assignment " + (i + 1))));
  g.rows[2] = row(cols(() => 25));
  g.rows[3] = row({ 2: "=if(sumifs(D3:AA3,D5:AA5,\">=0\")=0,1,1)" });
  // Row 5: the class-average formulas run across every assignment column, used or not.
  g.rows[4] = row(Object.fromEntries(Array.from({ length: 24 }, (_, i) => [3 + i, "=iferror(average(" + i + "),\"\")"])));
  const names = ["CHAN CHI HIM", "CHAN KAYDEN", "CHAN LOK HIN", "CHENG CHEUK FUNG"];
  for (let i = 0; i < students; i++) {
    g.rows[5 + i] = row(Object.assign({ 0: i + 1, 1: names[i % names.length], 2: "=sum($D6:$AA6)/TotalPoints" }, cols(() => 20)));
  }
  return g;
}

function linkedMark(s, students) {
  assert.strictEqual(s.call("linkScoresheet", "c-1b", "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/edit?usp=sharing").ok, true);
  return s.call("saveMark", { title: "U2 writing", classId: "c-1b", collected: "2026-11-05", students }).data.mark;
}

test("linking a scoresheet takes the class's name list from the Grades tab", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  gradebook(s);
  const res = s.call("linkScoresheet", "c-1b", "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/edit?usp=sharing");
  assert.strictEqual(res.ok, true, res.error);
  assert.deepStrictEqual(res.data.roster.map(r => r.no + " " + r.name), ["1 CHAN CHI HIM", "2 CHAN KAYDEN", "3 CHAN LOK HIN", "4 CHENG CHEUK FUNG"]);
  const data = s.call("getAll").data;
  assert.strictEqual(data.scoresheets["c-1b"], true);
  assert.ok(!JSON.stringify(data).includes(SHEET_ID), "the file id stays on the server");
  assert.match(s.call("linkScoresheet", "c-1b", "not a link").error, /Google Sheets link/);
});

test("a scoresheet the app can't open says how to share it", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  const res = s.call("linkScoresheet", "c-1b", "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/edit");
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /Share and add .* as an Editor/);
  assert.match(res.error, /Copy column/);
});

test("preview, then write: next empty column, non-submitters only, averages and filled cells untouched", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  const g = gradebook(s);
  const mark = linkedMark(s, { 1: { s: "S" }, 2: { s: "L" }, 3: { s: "M" }, 4: { s: "A" } });
  const before = JSON.stringify(g.rows);
  const preview = s.call("previewScoresheet", mark.id, 20);
  assert.strictEqual(preview.ok, true, preview.error);
  assert.strictEqual(preview.data.column, "H");
  assert.strictEqual(preview.data.title, "U2 writing (Thu 5 Nov)");
  assert.deepStrictEqual(preview.data.cells.map(c => c.value), ["", "Late", "Missing", "Absent"]);
  assert.strictEqual(JSON.stringify(g.rows), before, "a preview writes nothing");

  const res = s.call("writeScoresheet", mark.id, "H", 20);
  assert.strictEqual(res.ok, true, res.error);
  assert.strictEqual(res.data.written, 3);
  assert.deepStrictEqual([g.rows[1][7], g.rows[2][7]], ["U2 writing (Thu 5 Nov)", 20]);
  assert.deepStrictEqual(g.rows.slice(5, 9).map(r => r[7]), [undefined, "Late", "Missing", "Absent"]);
  assert.strictEqual(g.rows[4][7], "=iferror(average(4),\"\")", "the average formula in row 5 is untouched");
  assert.strictEqual(g.rows[5][6], 20, "the existing scores are untouched");
  // Once written, it can't be written again.
  assert.match(s.call("previewScoresheet", mark.id).error, /already written to column H/);
  assert.strictEqual(s.call("getAll").data.marks[0].sheetCol, "H");
});

test("if the column was filled after the preview, nothing is written", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  const g = gradebook(s);
  const mark = linkedMark(s, { 2: { s: "M" } });
  assert.strictEqual(s.call("previewScoresheet", mark.id).data.column, "H");
  g.rows[1][7] = "Typed by hand"; // someone used column H meanwhile
  const res = s.call("writeScoresheet", mark.id, "H");
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /changed since the preview/);
  assert.strictEqual(g.rows[6][7], undefined);
  assert.strictEqual(g.rows[6][8], undefined);
});

test("a full gradebook stops instead of writing outside columns D–AA", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  const g = gradebook(s, { used: 24 });
  const mark = linkedMark(s, { 1: { s: "M" } });
  const res = s.call("previewScoresheet", mark.id);
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /D to AA\) are all used/);
  assert.strictEqual(g.rows[1][27], undefined);
});

test("the evening email carries follow-ups, homework to collect, and marking due", () => {
  const s = loadServer({ now: THU_NOON });
  setUp(s);
  s.call("saveLog", { date: "2026-11-05", classId: "c-3d", covered: "Half", followUp: "Finish text 2" });
  s.call("saveLog", { date: "2026-11-04", classId: "c-1b", homework: "Vocab WS", homeworkDue: "2026-11-06" });
  s.call("saveMark", { title: "Dictation", due: "2026-11-06" });
  s.call("saveEmail", { on: true, hour: 20 });
  s.setNow(Date.parse("2026-11-05T20:10:00+08:00"));
  s.ctx.dailyDigest();
  const body = s.sent[0].body;
  ["Follow up", "Finish text 2", "Collect", "Vocab WS", "MARKING DUE", "Dictation"].forEach(t => assert.ok(body.includes(t), t));
});
