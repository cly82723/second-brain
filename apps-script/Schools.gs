/* School calendars built into the app. A teacher picks one in Settings.
   To add a school: copy the King's College block, change the dates, add it to SCHOOL_SPECS, redeploy.

   Cycle days are counted, not typed: every weekday from cycleFrom to cycleTo gets the next cycle
   number, except the dates in noCycle (holidays and whole-school days without lessons).
   tests/schools.test.js checks the count against dates printed on the paper calendar. */

var STANDARD_PERIODS = [
  { id: "ASM", label: "Assembly", start: "08:15", end: "08:30", teaching: false },
  { id: "P1", label: "P1", start: "08:30", end: "09:10", teaching: true },
  { id: "P2", label: "P2", start: "09:10", end: "09:50", teaching: true },
  { id: "P3", label: "P3", start: "09:50", end: "10:30", teaching: true },
  { id: "REC", label: "Recess", start: "10:30", end: "10:55", teaching: false },
  { id: "P4", label: "P4", start: "10:55", end: "11:35", teaching: true },
  { id: "P5", label: "P5", start: "11:35", end: "12:15", teaching: true },
  { id: "LUN", label: "Lunch", start: "12:15", end: "13:25", teaching: false },
  { id: "RC", label: "Roll call", start: "13:25", end: "13:30", teaching: false },
  { id: "P6", label: "P6", start: "13:30", end: "14:10", teaching: true },
  { id: "P7", label: "P7", start: "14:10", end: "14:50", teaching: true },
  { id: "P8", label: "P8", start: "14:50", end: "15:30", teaching: true }
];

// Label types: H holiday (no school), E exam, U uniform test, A activity day, S school event.
var KINGS_COLLEGE_2026 = {
  id: "kings-college-2026",
  name: "King's College",
  year: "2026–27",
  kind: "cycle",
  cycleLength: 7,
  periods: STANDARD_PERIODS,
  first: "2026-09-01",
  last: "2027-08-31",
  cycleFrom: "2026-09-03",
  cycleTo: "2027-06-07",
  noCycle: [
    "2026-10-01", "2026-10-08", "2026-10-09", "2026-10-19",
    "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20",
    "2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24", "2026-12-25",
    "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01",
    "2027-02-04", "2027-02-05", "2027-02-08", "2027-02-09", "2027-02-10", "2027-02-11", "2027-02-12",
    "2027-02-15", "2027-03-01", "2027-03-15",
    "2027-03-26", "2027-03-29", "2027-03-30", "2027-03-31", "2027-04-01", "2027-04-02", "2027-04-05",
    "2027-04-30", "2027-05-13"
  ],
  // [from, to, text, type, weekdays only?]
  labels: [
    ["2026-09-01", "2026-09-02", "First two days of school year", "S"],
    ["2026-09-08", "2026-09-08", "Taking school photos", "S"],
    ["2026-09-26", "2026-09-26", "Day following Mid-Autumn Festival", "H"],
    ["2026-09-30", "2026-09-30", "Staff Development Day (PM, tentative)", "S"],
    ["2026-10-01", "2026-10-01", "National Day", "H"],
    ["2026-10-08", "2026-10-08", "Annual Swimming Gala", "A"],
    ["2026-10-09", "2026-10-09", "Student Development Day", "A"],
    ["2026-10-16", "2026-10-16", "PTA AGM (tentative)", "S"],
    ["2026-10-16", "2026-10-16", "S.3 Social Service Day (tentative)", "S"],
    ["2026-10-19", "2026-10-19", "Day following Chung Yeung Festival", "H"],
    ["2026-10-21", "2026-10-29", "First Uniform Test", "U", true],
    ["2026-11-06", "2026-11-06", "Annual Cross Country Run", "A"],
    ["2026-11-06", "2026-11-06", "S1 Social Service Day (tentative)", "S"],
    ["2026-11-12", "2026-11-12", "S3 Parents' Day", "S"],
    ["2026-11-13", "2026-11-13", "S6 Parents' Day", "S"],
    ["2026-11-14", "2026-11-14", "Home-coming Day", "S"],
    ["2026-11-16", "2026-11-16", "Discretionary Holiday 1", "H"],
    ["2026-11-17", "2026-11-17", "Student Activity Day (School Picnic)", "A"],
    ["2026-11-18", "2026-11-18", "Annual Athletic Meet (Heats)", "A"],
    ["2026-11-19", "2026-11-19", "Annual Athletic Meet (Finals)", "A"],
    ["2026-11-20", "2026-11-20", "Discretionary Holiday 2", "H"],
    ["2026-11-26", "2026-11-26", "Taking school photos (Day 1)", "S"],
    ["2026-11-27", "2026-11-27", "Taking school photos (Day 2)", "S"],
    ["2026-12-04", "2026-12-04", "Annual Speech Day and opening of School History Museum", "S"],
    ["2026-12-18", "2026-12-18", "S2 Social Service Day (tentative)", "S"],
    ["2026-12-21", "2026-12-21", "Student Activity Day (Music Contest)", "A"],
    ["2026-12-22", "2027-01-02", "Christmas and New Year holidays", "H"],
    ["2027-01-05", "2027-01-18", "S1–S5 Half-yearly Exam", "E", true],
    ["2027-01-19", "2027-01-22", "S1–S5 review of half-yearly exam papers", "S"],
    ["2027-01-19", "2027-01-29", "S6 Mock Exam", "E", true],
    ["2027-01-25", "2027-01-25", "Beginning of second term", "S"],
    ["2027-02-01", "2027-02-03", "S6 Mock Exam (cont'd)", "E"],
    ["2027-02-03", "2027-02-03", "S3 Adventure-based Leadership Training Day", "A"],
    ["2027-02-04", "2027-02-13", "Lunar New Year holidays", "H"],
    ["2027-02-15", "2027-02-15", "Teacher Symposium", "S"],
    ["2027-02-16", "2027-02-16", "S6 Mock Exam (cont'd)", "E"],
    ["2027-02-17", "2027-02-22", "Review of S6 mock exam papers", "S", true],
    ["2027-02-23", "2027-02-23", "Last day of attendance for S6", "S"],
    ["2027-02-27", "2027-02-27", "S1 Admission Interview", "S"],
    ["2027-03-01", "2027-03-01", "S1–S5 Parents' Day", "S"],
    ["2027-03-05", "2027-03-05", "S4 Social Service Day (tentative)", "S"],
    ["2027-03-12", "2027-03-13", "Open Days", "S"],
    ["2027-03-15", "2027-03-15", "Discretionary Holiday 3", "H"],
    ["2027-03-17", "2027-03-25", "Second Term Uniform Test", "U", true],
    ["2027-03-26", "2027-04-05", "Ching Ming Festival and Easter holidays", "H"],
    ["2027-04-08", "2027-04-13", "HKDSE (core subjects)", "E", true],
    ["2027-04-20", "2027-04-20", "S5 Social Service Day (tentative)", "S"],
    ["2027-04-28", "2027-04-29", "S3 TSA (oral)", "E"],
    ["2027-04-30", "2027-04-30", "Staff Development Day", "S"],
    ["2027-05-01", "2027-05-01", "Labour Day", "H"],
    ["2027-05-13", "2027-05-13", "The Birthday of the Buddha", "H"],
    ["2027-05-28", "2027-05-28", "S6 Graduation Ceremony", "S"],
    ["2027-06-07", "2027-06-07", "Staff Development Day (PM)", "S"],
    ["2027-06-08", "2027-06-25", "S1–S5 Annual Exam", "E", true],
    ["2027-06-09", "2027-06-09", "Tuen Ng Festival", "H"],
    ["2027-06-17", "2027-06-18", "S3 TSA", "E"],
    ["2027-06-28", "2027-06-30", "S1–S5 review of annual exam", "S"],
    ["2027-07-01", "2027-07-01", "HKSAR Establishment Day", "H"],
    ["2027-07-02", "2027-07-02", "S1–S5 review of annual exam (cont'd)", "S"],
    ["2027-07-05", "2027-07-09", "Post-exam activity days", "A"],
    ["2027-07-08", "2027-07-09", "S1 Registration Days", "S"],
    ["2027-07-12", "2027-07-12", "End of School Year Assembly (last day)", "S"],
    ["2027-07-13", "2027-08-31", "Summer vacation", "H"],
    ["2027-07-13", "2027-07-13", "Pre-S1 Attainment Test", "S"],
    ["2027-07-14", "2027-07-14", "Release of HKDSE results", "S"],
    ["2027-08-23", "2027-08-23", "New Teacher Induction", "S"],
    ["2027-08-24", "2027-08-24", "S1 Parents' Day", "S"],
    ["2027-08-24", "2027-08-25", "S1 Orientation", "S"],
    ["2027-08-25", "2027-08-25", "First Staff Meeting", "S"],
    ["2027-08-26", "2027-08-26", "HOD Meeting and Staff Development Day", "S"],
    ["2027-08-27", "2027-08-27", "Functional Teams and Subject Panel Meetings", "S"],
    ["2027-08-30", "2027-08-30", "Functional Teams and Subject Panel Meetings", "S"]
  ]
};

// Kwun Tong Government Secondary School bell times (from a 2026–27 teacher timetable).
var KTGSS_PERIODS = [
  { id: "RC1", label: "Roll call / assembly", start: "08:05", end: "08:40", teaching: false },
  { id: "P1", label: "P1", start: "08:40", end: "09:20", teaching: true },
  { id: "P2", label: "P2", start: "09:20", end: "10:00", teaching: true },
  { id: "P3", label: "P3", start: "10:00", end: "10:40", teaching: true },
  { id: "REC", label: "Recess", start: "10:40", end: "11:00", teaching: false },
  { id: "P4", label: "P4", start: "11:00", end: "11:40", teaching: true },
  { id: "P5", label: "P5", start: "11:40", end: "12:20", teaching: true },
  { id: "P6", label: "P6", start: "12:20", end: "13:00", teaching: true },
  { id: "LUN", label: "Lunch", start: "13:00", end: "14:10", teaching: false },
  { id: "RC", label: "Roll call", start: "14:10", end: "14:20", teaching: false },
  { id: "P7", label: "P7", start: "14:20", end: "15:00", teaching: true },
  { id: "P8", label: "P8", start: "15:00", end: "15:40", teaching: true }
];

// From "26-27 Revised Calendar Table for SMC (as at 21.8.2026)".
var KTGSS_2026 = {
  id: "ktgss-2026",
  name: "Kwun Tong Government Secondary School",
  year: "2026–27",
  kind: "cycle",
  cycleLength: 7,
  periods: KTGSS_PERIODS,
  first: "2026-09-01",
  last: "2027-08-31",
  cycleFrom: "2026-09-02",
  cycleTo: "2027-06-25",
  noCycle: [
    "2026-09-25", "2026-10-01", "2026-10-13", "2026-10-19",
    "2026-12-11", "2026-12-14", "2026-12-18", "2026-12-21",
    "2026-12-22", "2026-12-23", "2026-12-24", "2026-12-25",
    "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01",
    "2027-01-07", "2027-01-08", "2027-01-11", "2027-01-12", "2027-01-13", "2027-01-14", "2027-01-15",
    "2027-01-18", "2027-01-19", "2027-01-25", "2027-01-26",
    "2027-02-03", "2027-02-04", "2027-02-05", "2027-02-08", "2027-02-09", "2027-02-10", "2027-02-11", "2027-02-12",
    "2027-02-15", "2027-02-22", "2027-02-26",
    "2027-03-24", "2027-03-25", "2027-03-26", "2027-03-29", "2027-03-30", "2027-03-31", "2027-04-01", "2027-04-05",
    "2027-05-13", "2027-05-14",
    "2027-06-01", "2027-06-07", "2027-06-08", "2027-06-09", "2027-06-10", "2027-06-11",
    "2027-06-14", "2027-06-15", "2027-06-16", "2027-06-17", "2027-06-18", "2027-06-21"
  ],
  labels: [
    ["2026-09-01", "2026-09-01", "First Day of School", "S"],
    ["2026-09-10", "2026-09-10", "Teachers' Day", "S"],
    ["2026-09-11", "2026-09-12", "S.1 Life Camp", "S"],
    ["2026-09-21", "2026-09-21", "House Meeting", "S"],
    ["2026-09-25", "2026-09-25", "Staff Development Day", "S"],
    ["2026-09-26", "2026-09-26", "The day following Mid-Autumn Festival", "H"],
    ["2026-10-01", "2026-10-01", "National Day", "H"],
    ["2026-10-09", "2026-10-09", "Student Union Election Day", "S"],
    ["2026-10-13", "2026-10-13", "Swimming Gala", "A"],
    ["2026-10-16", "2026-10-16", "PTA AGM", "S"],
    ["2026-10-19", "2026-10-19", "The day following Chung Yeung Festival", "H"],
    ["2026-10-21", "2026-10-29", "S.1–S.5 First Uniform Test", "U", true],
    ["2026-11-06", "2026-11-06", "Speech Day", "S"],
    ["2026-11-16", "2026-11-16", "School Photo Day", "S"],
    ["2026-11-18", "2026-11-26", "S.6 Uniform Test", "U", true],
    ["2026-11-27", "2026-11-27", "S.1 Parents' Talk", "S"],
    ["2026-11-30", "2026-12-04", "Smart Teen", "S", true],
    ["2026-12-09", "2026-12-09", "S.3 Talk for S.4 Streaming", "S"],
    ["2026-12-11", "2026-12-12", "45th Anniversary Open Day", "S"],
    ["2026-12-14", "2026-12-14", "Discretionary Holiday", "H"],
    ["2026-12-18", "2026-12-18", "Student Development Day", "A"],
    ["2026-12-21", "2026-12-21", "Student Activity Day", "A"],
    ["2026-12-22", "2027-01-02", "Christmas and New Year holidays", "H"],
    ["2027-01-04", "2027-01-19", "S.6 Mock Examination", "E", true],
    ["2027-01-04", "2027-01-19", "S.4–S.5 Half-yearly Exam", "E", true],
    ["2027-01-07", "2027-01-19", "S.1–S.3 Half-yearly Exam", "E", true],
    ["2027-01-20", "2027-01-20", "Commencement of Second Term", "S"],
    ["2027-01-20", "2027-01-22", "Going over exam papers", "S"],
    ["2027-01-25", "2027-01-25", "Sports Day (Heats)", "A"],
    ["2027-01-26", "2027-01-26", "Discretionary Holiday", "H"],
    ["2027-01-27", "2027-01-27", "Going over exam papers", "S"],
    ["2027-02-01", "2027-02-01", "Mark Checking", "S"],
    ["2027-02-03", "2027-02-13", "Lunar New Year holidays", "H"],
    ["2027-02-15", "2027-02-15", "Teachers' Symposium", "S"],
    ["2027-02-22", "2027-02-22", "Sports Day (Finals)", "A"],
    ["2027-02-25", "2027-02-25", "Last School Day for S.6", "S"],
    ["2027-02-26", "2027-02-26", "Parents' Day", "S"],
    ["2027-03-15", "2027-03-23", "S.1–S.5 Second Uniform Test", "U", true],
    ["2027-03-24", "2027-03-24", "Life-wide Learning Day", "A"],
    ["2027-03-25", "2027-04-01", "Easter holidays", "H"],
    ["2027-04-05", "2027-04-05", "Ching Ming Festival", "H"],
    ["2027-04-08", "2027-04-13", "HKDSE Exam (Core Subjects)", "E", true],
    ["2027-04-28", "2027-04-29", "S.3 TSA (Oral), 28 or 29 Apr", "E"],
    ["2027-05-01", "2027-05-01", "Labour Day", "H"],
    ["2027-05-03", "2027-05-03", "S.3 TSA (Oral) fallback date", "E"],
    ["2027-05-04", "2027-05-07", "English Week", "S"],
    ["2027-05-13", "2027-05-13", "Birthday of the Buddha", "H"],
    ["2027-05-14", "2027-05-14", "Discretionary Holiday", "H"],
    ["2027-06-01", "2027-06-01", "Staff Development Day", "S"],
    ["2027-06-02", "2027-06-21", "S.4–S.5 Yearly Exam", "E", true],
    ["2027-06-07", "2027-06-21", "S.1–S.3 Yearly Exam", "E", true],
    ["2027-06-09", "2027-06-09", "Tuen Ng Festival", "H"],
    ["2027-06-17", "2027-06-18", "S.3 TSA (Written)", "E"],
    ["2027-06-22", "2027-06-25", "S.1–S.5 going over exam papers", "S"],
    ["2027-06-23", "2027-06-23", "S.3 TSA (Written) fallback date", "E"],
    ["2027-06-28", "2027-07-09", "Post-examination activities", "A", true],
    ["2027-06-29", "2027-06-29", "Graduation Day", "S"],
    ["2027-06-30", "2027-06-30", "Graduation Day fallback date", "S"],
    ["2027-07-01", "2027-07-01", "HKSAR Establishment Day", "H"],
    ["2027-07-02", "2027-07-02", "Mark Checking", "S"],
    ["2027-07-06", "2027-07-06", "Promotion Meeting", "S"],
    ["2027-07-08", "2027-07-09", "S.1 Registration", "S"],
    ["2027-07-12", "2027-07-12", "Last Day of School", "S"],
    ["2027-07-13", "2027-08-31", "Summer vacation", "H"],
    ["2027-07-13", "2027-07-13", "Pre-S.1 Attainment Test", "S"],
    ["2027-07-14", "2027-07-14", "Release of HKDSE results", "S"]
  ]
};

// For a school whose calendar hasn't been added yet: Monday to Friday, no holidays.
var OTHER_SCHOOL = {
  id: "other",
  name: "My school isn't listed (Mon–Fri week)",
  year: "",
  kind: "weekday",
  cycleLength: 5,
  periods: STANDARD_PERIODS
};

var SCHOOL_SPECS = [KINGS_COLLEGE_2026, KTGSS_2026, OTHER_SCHOOL];
var DEFAULT_SCHOOL_ID = OTHER_SCHOOL.id;

function listSchools_() {
  return SCHOOL_SPECS.map(function (s) {
    return { id: s.id, name: s.name, year: s.year, kind: s.kind, cycleLength: s.cycleLength };
  });
}

function schoolSpec_(id) {
  for (var i = 0; i < SCHOOL_SPECS.length; i++) if (SCHOOL_SPECS[i].id === id) return SCHOOL_SPECS[i];
  return null;
}

var builtSchools_ = {};

// What the page and the email use: every cycle day and label worked out by date.
function buildSchool_(id) {
  var spec = schoolSpec_(id) || OTHER_SCHOOL;
  if (builtSchools_[spec.id]) return builtSchools_[spec.id];
  var school = {
    id: spec.id, name: spec.name, year: spec.year, kind: spec.kind,
    cycleLength: spec.cycleLength, first: spec.first || "", last: spec.last || "",
    cycleDays: spec.kind === "cycle" ? countCycleDays_(spec) : {},
    labels: spec.labels ? expandLabels_(spec.labels) : {}
  };
  builtSchools_[spec.id] = school;
  return school;
}

function countCycleDays_(spec) {
  var L = logic_();
  var skip = {};
  spec.noCycle.forEach(function (d) { skip[d] = true; });
  var days = {};
  var count = 0;
  for (var d = spec.cycleFrom; d <= spec.cycleTo; d = L.addDays(d, 1)) {
    var wd = L.weekday(d);
    if (wd === 0 || wd === 6 || skip[d]) continue;
    days[d] = (count % spec.cycleLength) + 1;
    count++;
  }
  return days;
}

function expandLabels_(ranges) {
  var L = logic_();
  var byDate = {};
  ranges.forEach(function (r) {
    for (var d = r[0]; d <= r[1]; d = L.addDays(d, 1)) {
      var wd = L.weekday(d);
      if (r[4] && (wd === 0 || wd === 6)) continue;
      (byDate[d] = byDate[d] || []).push({ text: r[2], type: r[3] });
    }
  });
  return byDate;
}
