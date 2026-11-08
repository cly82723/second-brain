// The counted cycle days must match the numbers printed on the paper calendar.
const test = require("node:test");
const assert = require("node:assert");
const { loadServer } = require("./fake-gas");

const s = loadServer();
const school = s.ctx.buildSchool_("kings-college-2026");
const L = s.ctx.logic_();

// Read off 26-27_calendar.pdf, spread across the year.
const PRINTED = {
  "2026-09-03": 1, "2026-09-07": 3, "2026-09-30": 6, "2026-10-02": 7, "2026-10-07": 3, "2026-10-12": 4,
  "2026-10-16": 1, "2026-10-20": 2, "2026-10-30": 3, "2026-11-05": 7, "2026-11-06": 1, "2026-11-13": 6,
  "2026-11-23": 7, "2026-11-30": 5, "2026-12-04": 2, "2026-12-18": 5, "2027-01-04": 6, "2027-01-15": 1,
  "2027-01-25": 7, "2027-01-29": 4, "2027-02-03": 7, "2027-02-16": 1, "2027-02-26": 2, "2027-03-02": 3,
  "2027-03-12": 4, "2027-03-16": 5, "2027-03-25": 5, "2027-04-06": 6, "2027-04-16": 7, "2027-04-29": 2,
  "2027-05-03": 3, "2027-05-12": 3, "2027-05-14": 4, "2027-05-28": 7, "2027-05-31": 1, "2027-06-04": 5,
  "2027-06-07": 6
};

test("King's College cycle days match the printed calendar", () => {
  for (const [date, day] of Object.entries(PRINTED)) {
    assert.strictEqual(school.cycleDays[date], day, date);
  }
});

test("holidays, the first two days and exam-period gaps have no cycle day", () => {
  ["2026-09-01", "2026-09-02", "2026-10-01", "2026-10-19", "2026-11-17", "2026-12-21", "2027-02-10", "2027-03-15", "2027-06-08"]
    .forEach(date => assert.strictEqual(L.dayInfo(school, date).cycleDay, null, date));
  assert.strictEqual(L.dayInfo(school, "2026-12-25").holiday, true);
  assert.strictEqual(L.dayInfo(school, "2026-11-14").holiday, false);
});

test("weekday-only label ranges skip weekends", () => {
  assert.ok(school.labels["2026-10-23"].some(l => l.type === "U"));
  assert.strictEqual(school.labels["2026-10-24"], undefined);
});

// Read off the KTGSS 2026/27 calendar (Chinese numerals 一 to 七 = Day 1 to 7).
const KTGSS_PRINTED = {
  "2026-09-02": 1, "2026-09-11": 1, "2026-09-24": 3, "2026-09-30": 6, "2026-10-02": 7, "2026-10-12": 6,
  "2026-10-14": 7, "2026-10-30": 4, "2026-11-06": 2, "2026-11-30": 4, "2026-12-04": 1, "2026-12-17": 1,
  "2027-01-04": 2, "2027-01-22": 7, "2027-01-29": 3, "2027-02-02": 5, "2027-02-16": 6, "2027-02-25": 5,
  "2027-03-01": 6, "2027-03-23": 1, "2027-04-02": 2, "2027-04-30": 7, "2027-05-03": 1, "2027-05-12": 1,
  "2027-05-31": 5, "2027-06-04": 1, "2027-06-22": 2, "2027-06-25": 5
};

test("Kwun Tong Government Secondary School cycle days match the printed calendar", () => {
  const ktgss = s.ctx.buildSchool_("ktgss-2026");
  for (const [date, day] of Object.entries(KTGSS_PRINTED)) {
    assert.strictEqual(ktgss.cycleDays[date], day, date);
  }
  ["2026-09-01", "2026-09-25", "2026-10-13", "2026-12-11", "2027-01-07", "2027-01-25", "2027-02-22", "2027-03-24", "2027-06-01", "2027-06-21", "2027-06-28"]
    .forEach(date => assert.strictEqual(L.dayInfo(ktgss, date).cycleDay, null, date));
  assert.strictEqual(L.dayInfo(ktgss, "2026-12-14").holiday, true);
  assert.strictEqual(L.dayInfo(ktgss, "2026-11-06").holiday, false);
  assert.strictEqual(s.ctx.schoolSpec_("ktgss-2026").periods.filter(p => p.teaching).length, 8);
});

test("a school that isn't listed gets a plain Monday-to-Friday week", () => {
  const other = s.ctx.buildSchool_("other");
  assert.strictEqual(L.dayInfo(other, "2026-11-05").cycleDay, 4);
  assert.strictEqual(L.dayInfo(other, "2026-11-07").cycleDay, null);
  assert.strictEqual(L.cycleName(other, 4), "Thu");
});
