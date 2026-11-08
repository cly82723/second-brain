// Email reminders: several round-ups at any time of day, and reminders on single to-dos, items and
// marking, all sent by one 15-minute trigger.
const test = require("node:test");
const assert = require("node:assert");
const { loadServer, OWNER } = require("./fake-gas");

const at = (hm, day = "2026-11-05") => Date.parse(day + "T" + hm + ":00+08:00");

function setUp(s) {
  const res = s.call("saveSetup", {
    schoolId: "kings-college-2026", periods: s.ctx.STANDARD_PERIODS,
    classes: [{ id: "c-3d", name: "3D English", colour: "sage" }],
    timetable: [{ day: 1, period: "P1", classId: "c-3d" }, { day: 7, period: "P6", classId: "c-3d" }]
  });
  assert.strictEqual(res.ok, true, res.error);
}

test("several round-ups, each at its own time, covering today or tomorrow, each once a day", () => {
  const s = loadServer({ now: at("06:00") });
  setUp(s);
  s.call("saveLog", { date: "2026-11-05", classId: "c-3d", plan: "Thursday plan" });
  s.call("saveLog", { date: "2026-11-06", classId: "c-3d", plan: "Friday plan" });
  const saved = s.call("saveReminders", [{ time: "20:00", covers: "tomorrow" }, { time: "07:00", covers: "today" }]);
  assert.strictEqual(saved.ok, true, saved.error);
  assert.deepStrictEqual(saved.data.reminders.map(r => r.time + " " + r.covers), ["07:00 today", "20:00 tomorrow"]);
  assert.strictEqual(s.triggers.length, 1);
  assert.strictEqual(s.triggers[0].everyMinutes, 15);

  s.ctx.dailyDigest();
  assert.strictEqual(s.sent.length, 0, "nothing before 07:00");
  s.setNow(at("07:10"));
  s.ctx.dailyDigest();
  s.setNow(at("07:25"));
  s.ctx.dailyDigest();
  assert.strictEqual(s.sent.length, 1, "the 07:00 round-up once");
  assert.match(s.sent[0].subject, /^Today, Thu 5 Nov/);
  assert.ok(s.sent[0].body.includes("Thursday plan"));
  s.setNow(at("20:05"));
  s.ctx.dailyDigest();
  assert.strictEqual(s.sent.length, 2);
  assert.match(s.sent[1].subject, /^Tomorrow, Fri 6 Nov/);
  assert.ok(s.sent[1].body.includes("Friday plan"));
});

test("adding a round-up whose time has already passed today doesn't send it straight away", () => {
  const s = loadServer({ now: at("14:00") });
  setUp(s);
  s.call("saveLog", { date: "2026-11-05", classId: "c-3d", plan: "x" });
  s.call("saveReminders", [{ time: "07:00", covers: "today" }]);
  s.setNow(at("14:15"));
  s.ctx.dailyDigest();
  assert.strictEqual(s.sent.length, 0);
});

test("round-ups are checked: a time is needed, at most 6", () => {
  const s = loadServer({ now: at("12:00") });
  setUp(s);
  assert.strictEqual(s.call("saveReminders", [{ time: "", covers: "today" }]).ok, false);
  assert.strictEqual(s.call("saveReminders", Array.from({ length: 7 }, (_, i) => ({ time: "0" + i + ":00" }))).ok, false);
});

test("the older evening email still works as one round-up for tomorrow", () => {
  const s = loadServer({ now: at("12:00") });
  setUp(s);
  s.call("saveEmail", { on: true, hour: 20 });
  assert.deepStrictEqual(s.call("getAll").data.settings.reminders.map(r => r.time + " " + r.covers), ["20:00 tomorrow"]);
});

test("a to-do reminder goes out at its time, once; moving the time sends it again", () => {
  const s = loadServer({ now: at("12:00") });
  setUp(s);
  s.call("saveTodo", { title: "Print worksheets", due: "2026-11-05", remindAt: "2026-11-05T15:00" });
  assert.strictEqual(s.triggers.length, 1, "a reminder starts the schedule");
  s.setNow(at("14:50"));
  s.ctx.dailyDigest();
  assert.strictEqual(s.sent.length, 0);
  s.setNow(at("15:05"));
  s.ctx.dailyDigest();
  s.setNow(at("15:20"));
  s.ctx.dailyDigest();
  assert.strictEqual(s.sent.length, 1);
  assert.strictEqual(s.sent[0].subject, "Reminder: Print worksheets");
  assert.strictEqual(s.sent[0].to, OWNER);
  const after = s.call("getAll").data.todos[0];
  assert.strictEqual(after.remindSent, "2026-11-05T15:00");
  // Saving it unchanged keeps it sent; moving the time sends it again.
  s.call("saveTodo", after);
  s.ctx.dailyDigest();
  assert.strictEqual(s.sent.length, 1);
  s.call("saveTodo", Object.assign({}, after, { remindAt: "2026-11-05T15:30" }));
  s.setNow(at("15:35"));
  s.ctx.dailyDigest();
  assert.strictEqual(s.sent.length, 2);
  // A finished to-do's reminder is dropped.
  assert.strictEqual(s.call("saveTodo", { title: "Done already", remindAt: "2026-11-05T16:00", done: true }).data.todo.remindAt, "");
});

test("an item reminds some minutes before each repeat; several due together share one email", () => {
  const s = loadServer({ now: at("07:00") });
  setUp(s);
  s.call("saveEvent", { title: "Lunch duty", date: "2026-11-05", start: "12:30", end: "13:00", repeat: "weekly", remindBefore: 10 });
  s.call("saveMark", { title: "3D essays", remindAt: "2026-11-05T12:15" });
  s.setNow(at("12:25"));
  s.ctx.dailyDigest();
  assert.strictEqual(s.sent.length, 1);
  assert.strictEqual(s.sent[0].subject, "Reminders: 2 things");
  assert.ok(s.sent[0].body.includes("Lunch duty") && s.sent[0].body.includes("3D essays"));
  s.setNow(at("12:40"));
  s.ctx.dailyDigest();
  assert.strictEqual(s.sent.length, 1, "not again the same day");
  // Next week's repeat reminds again.
  s.setNow(at("12:21", "2026-11-12"));
  s.ctx.dailyDigest();
  assert.strictEqual(s.sent.length, 2);
  assert.strictEqual(s.sent[1].subject, "Reminder: Lunch duty");
  assert.strictEqual(s.call("saveEvent", { title: "x", date: "2026-11-05", remindBefore: 5 }).ok, false);
});

test("a reminder more than a day late (e.g. the app was off) is dropped, not sent", () => {
  const s = loadServer({ now: at("08:00") });
  setUp(s);
  s.call("saveTodo", { title: "Old", remindAt: "2026-11-03T09:00" });
  s.ctx.dailyDigest();
  assert.strictEqual(s.sent.length, 0);
});

test("removing every reminder stops the schedule", () => {
  const s = loadServer({ now: at("12:00") });
  setUp(s);
  s.call("saveReminders", [{ time: "07:00", covers: "today" }]);
  assert.strictEqual(s.triggers.length, 1);
  s.call("saveReminders", []);
  assert.strictEqual(s.triggers.length, 0);
});
