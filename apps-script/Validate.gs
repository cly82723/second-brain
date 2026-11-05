/* Checks everything the page sends before it reaches the Sheet. Anything wrong throws a UserError_
   with a message a teacher can act on. */

var LIMITS = {
  text: 4000, title: 200, className: 40, classes: 40, periods: 20, events: 2000, todos: 3000, importRows: 5000
};
var CLASS_COLOURS = ["sage", "sky", "apricot", "lilac", "rose", "butter", "teal", "clay"];
var ID_PATTERN = /^[A-Za-z0-9_-]{2,48}$/;
var PERIOD_ID_PATTERN = /^[A-Za-z0-9]{1,8}$/;
var EMAIL_HOURS = [16, 17, 18, 19, 20, 21, 22, 23];

function UserError_(message) { this.message = message; }

function text_(value, max, what) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new UserError_(what + " must be text.");
  var trimmed = value.replace(/\r\n/g, "\n").trim();
  if (trimmed.length > max) throw new UserError_(what + " is too long (" + max + " characters at most).");
  return trimmed;
}

function requiredText_(value, max, what) {
  var t = text_(value, max, what);
  if (!t) throw new UserError_("Please fill in " + what.toLowerCase() + ".");
  return t;
}

function optionalDate_(value, what) {
  if (value === undefined || value === null || value === "") return "";
  if (!logic_().isDate(value)) throw new UserError_(what + " isn't a valid date.");
  return value;
}

function requiredDate_(value, what) {
  var d = optionalDate_(value, what);
  if (!d) throw new UserError_("Please choose " + what.toLowerCase() + ".");
  return d;
}

function optionalTime_(value, what) {
  if (value === undefined || value === null || value === "") return "";
  if (!logic_().isTime(value)) throw new UserError_(what + " isn't a valid time.");
  return value;
}

function cleanId_(value) {
  return typeof value === "string" && ID_PATTERN.test(value) ? value : "";
}

function newId_() {
  return Utilities.getUuid().replace(/-/g, "").slice(0, 16);
}

function cleanPeriods_(periods) {
  if (!Array.isArray(periods) || !periods.length) throw new UserError_("Please add at least one period.");
  if (periods.length > LIMITS.periods) throw new UserError_("That's more periods than the app allows (" + LIMITS.periods + ").");
  var seen = Object.create(null);
  var clean = periods.map(function (p) {
    var id = p && typeof p.id === "string" && PERIOD_ID_PATTERN.test(p.id) ? p.id : "";
    if (!id || seen[id]) throw new UserError_("Each period needs its own short code, like P1.");
    seen[id] = true;
    var label = requiredText_(p.label, 20, "Period name");
    var start = optionalTime_(p.start, label + " start");
    var end = optionalTime_(p.end, label + " end");
    if (!start || !end || start >= end) throw new UserError_(label + " needs a start time before its end time.");
    return { id: id, label: label, start: start, end: end, teaching: !!p.teaching };
  });
  return clean.sort(function (a, b) { return a.start < b.start ? -1 : 1; });
}

function cleanClasses_(classes) {
  if (!Array.isArray(classes)) throw new UserError_("The class list didn't arrive. Please try again.");
  if (classes.length > LIMITS.classes) throw new UserError_("That's more classes than the app allows (" + LIMITS.classes + ").");
  var names = Object.create(null);
  return classes.map(function (c) {
    var id = cleanId_(c && c.id);
    if (!id) throw new UserError_("A class is missing its id. Please reload the page and try again.");
    var name = requiredText_(c.name, LIMITS.className, "Class name");
    var key = name.toLowerCase();
    if (names[key]) throw new UserError_("There are two classes called " + name + ". Please give them different names.");
    names[key] = true;
    var colour = CLASS_COLOURS.indexOf(c.colour) >= 0 ? c.colour : CLASS_COLOURS[0];
    return { id: id, name: name, colour: colour };
  });
}

function cleanTimetable_(slots, periods, classes, cycleLength) {
  if (!Array.isArray(slots)) throw new UserError_("The timetable didn't arrive. Please try again.");
  var teaching = Object.create(null);
  periods.forEach(function (p) { if (p.teaching) teaching[p.id] = true; });
  var classIds = Object.create(null);
  classes.forEach(function (c) { classIds[c.id] = true; });
  var taken = Object.create(null);
  return slots
    .filter(function (s) { return s && s.classId; })
    .map(function (s) {
      var day = Number(s.day);
      if (!(day >= 1 && day <= cycleLength) || !teaching[s.period] || !classIds[s.classId]) {
        throw new UserError_("Part of the timetable doesn't match your periods or classes. Please check it and save again.");
      }
      var key = day + "|" + s.period;
      if (taken[key]) throw new UserError_("Two classes are in the same period. Please keep one per period.");
      taken[key] = true;
      return { day: day, period: s.period, classId: s.classId };
    });
}

function cleanLogEntry_(e, classIds) {
  if (!e || typeof e !== "object") throw new UserError_("That entry didn't arrive. Please try again.");
  var date = requiredDate_(e.date, "The lesson date");
  if (!classIds[e.classId]) throw new UserError_("That class isn't in your timetable any more. Please reload the page.");
  return {
    date: date,
    classId: e.classId,
    plan: text_(e.plan, LIMITS.text, "Plan"),
    remind: text_(e.remind, LIMITS.text, "Remind students"),
    homework: text_(e.homework, LIMITS.text, "Homework"),
    homeworkDue: optionalDate_(e.homeworkDue, "Homework due date"),
    notes: text_(e.notes, LIMITS.text, "Notes"),
    done: !!e.done
  };
}

function cleanEvent_(ev, cycleLength) {
  if (!ev || typeof ev !== "object") throw new UserError_("That event didn't arrive. Please try again.");
  var date = requiredDate_(ev.date, "The date");
  var start = optionalTime_(ev.start, "Start time");
  var end = optionalTime_(ev.end, "End time");
  if (end && !start) throw new UserError_("Please add a start time, or clear the end time for an all-day event.");
  if (start && end && end <= start) throw new UserError_("The end time must be after the start time.");
  var repeat = ["none", "weekly", "cycle"].indexOf(ev.repeat) >= 0 ? ev.repeat : "none";
  var repeatOn = "";
  if (repeat === "cycle") {
    repeatOn = Number(ev.repeatOn);
    if (!(repeatOn >= 1 && repeatOn <= cycleLength)) throw new UserError_("Please choose which cycle day it repeats on.");
  }
  var until = repeat === "none" ? "" : optionalDate_(ev.until, "The end date");
  if (until && until < date) throw new UserError_("The repeat must end on or after the first date.");
  return {
    id: cleanId_(ev.id) || newId_(),
    title: requiredText_(ev.title, LIMITS.title, "Title"),
    date: date, start: start, end: end, repeat: repeat, repeatOn: repeatOn, until: until,
    replaces: !!ev.replaces,
    notes: text_(ev.notes, LIMITS.text, "Notes")
  };
}

function cleanTodo_(t, classIds, today) {
  if (!t || typeof t !== "object") throw new UserError_("That to-do didn't arrive. Please try again.");
  var due = optionalDate_(t.due, "The due date");
  var classId = t.classId && classIds[t.classId] ? t.classId : "";
  var done = !!t.done;
  return {
    id: cleanId_(t.id) || newId_(),
    title: requiredText_(t.title, LIMITS.title, "The to-do"),
    due: due,
    time: due ? optionalTime_(t.time, "Time") : "",
    classId: classId,
    notes: text_(t.notes, LIMITS.text, "Notes"),
    done: done,
    doneAt: done ? (optionalDate_(t.doneAt, "Done date") || today) : ""
  };
}
