/* The rules of the calendar and logbook, in one place: pure functions with no outside access.
   Used by the screens, by backend.js (carry-forward, export) and by the tests.
   Dates are "YYYY-MM-DD" strings, times "HH:MM". */
function logic_() {
  var DAY_MS = 86400000;
  var WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December"];
  var LENGTH_WORDS = ["", "Single", "Double", "Triple"];
  var LOOKAHEAD_DAYS = 200;
  var NOT_UPDATED_WINDOW_DAYS = 60;

  // ---- dates ----
  function toMs(date) { var p = date.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function fromMs(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function addDays(date, n) { return fromMs(toMs(date) + n * DAY_MS); }
  function weekday(date) { return new Date(toMs(date)).getUTCDay(); }
  function daysBetween(a, b) { return Math.round((toMs(b) - toMs(a)) / DAY_MS); }
  function isDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && fromMs(toMs(s)) === s; }
  function isTime(s) { return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }
  function minutes(time) { var p = time.split(":"); return +p[0] * 60 + +p[1]; }
  function mondayOf(date) { var w = weekday(date); return addDays(date, w === 0 ? -6 : 1 - w); }
  function parts(date) { var p = date.split("-"); return { y: +p[0], m: +p[1] - 1, d: +p[2] }; }
  function shortDate(date) { var p = parts(date); return WEEKDAY_SHORT[weekday(date)] + " " + p.d + " " + MONTHS[p.m]; }
  function longDate(date) { var p = parts(date); return WEEKDAY_LONG[weekday(date)] + " " + p.d + " " + MONTHS_LONG[p.m]; }
  function dayMonth(date) { var p = parts(date); return p.d + " " + MONTHS[p.m]; }
  function monthYear(date) { var p = parts(date); return MONTHS_LONG[p.m] + " " + p.y; }

  // ---- school days ----
  function dayInfo(school, date) {
    var wd = weekday(date);
    var labels = (school.labels && school.labels[date]) || [];
    var holiday = labels.some(function (l) { return l.type === "H"; });
    var cycleDay = school.kind === "weekday"
      ? (wd >= 1 && wd <= 5 && !holiday ? wd : null)
      : (school.cycleDays && school.cycleDays[date]) || null;
    return { date: date, weekday: wd, cycleDay: cycleDay, labels: labels, holiday: holiday, weekend: wd === 0 || wd === 6 };
  }

  function cycleName(school, n) {
    return school.kind === "weekday" ? WEEKDAY_SHORT[n] : "Day " + n;
  }

  function lengthWord(count) { return LENGTH_WORDS[count] || count + " periods"; }

  // Everything else works from this: lookups built once per change of data.
  function prepare(data) {
    var periods = data.periods || [];
    // Prototype-free lookups: ids like "constructor" must not match anything built in.
    var periodIndex = Object.create(null);
    periods.forEach(function (p, i) { periodIndex[p.id] = i; });
    var classById = Object.create(null);
    (data.classes || []).forEach(function (c) { classById[c.id] = c; });
    var timetableByDay = Object.create(null);
    (data.timetable || []).forEach(function (t) {
      if (!classById[t.classId] || periodIndex[t.period] === undefined) return;
      (timetableByDay[t.day] = timetableByDay[t.day] || []).push(t);
    });
    var logByKey = Object.create(null);
    // Follow-ups still open, per class, oldest first; homework by the day it's handed in.
    var followUpsByClass = Object.create(null);
    var collectByKey = Object.create(null);
    (data.log || []).forEach(function (e) {
      logByKey[e.date + "|" + e.classId] = e;
      if (e.followUp && !e.followUpDone && classById[e.classId]) (followUpsByClass[e.classId] = followUpsByClass[e.classId] || []).push(e);
      if (e.homework && e.homeworkDue && classById[e.classId]) (collectByKey[e.homeworkDue + "|" + e.classId] = collectByKey[e.homeworkDue + "|" + e.classId] || []).push(e);
    });
    Object.keys(followUpsByClass).forEach(function (k) { followUpsByClass[k].sort(function (a, b) { return a.date < b.date ? -1 : 1; }); });
    var categories = data.categories || [];
    var categoryById = Object.create(null);
    categories.forEach(function (c) { categoryById[c.id] = c; });
    return {
      school: data.school, periods: periods, periodIndex: periodIndex, classes: data.classes || [],
      classById: classById, timetableByDay: timetableByDay, logByKey: logByKey,
      followUpsByClass: followUpsByClass, collectByKey: collectByKey, followUpTargets: Object.create(null),
      today: data.today || "",
      categories: categories, categoryById: categoryById, rosters: data.rosters || {},
      log: data.log || [], events: data.events || [], todos: data.todos || [], marks: data.marks || []
    };
  }

  // Students still missing from marking collected before that day: chase them at the class's lesson.
  function chaseFor(ctx, classId, date) {
    var roster = ctx.rosters[classId] || [];
    var nameOf = Object.create(null);
    roster.forEach(function (s) { nameOf[s.no] = s.name; });
    return ctx.marks.filter(function (m) { return !m.done && m.classId === classId && m.collected && m.collected < date; })
      .map(function (m) {
        var missing = markProgress(m).missing;
        return { mark: m, names: missing.map(function (no) { return nameOf[no] || "No. " + no; }) };
      })
      .filter(function (c) { return c.names.length; });
  }

  function entryFor(ctx, date, classId) { return ctx.logByKey[date + "|" + classId] || null; }

  // Whether the class is really taught that day: on the timetable, and not replaced by an event.
  function classOn(ctx, classId, date) {
    var cycleDay = dayInfo(ctx.school, date).cycleDay;
    if (!cycleDay) return false;
    var periods = (ctx.timetableByDay[cycleDay] || []).filter(function (t) { return t.classId === classId; })
      .map(function (t) { return ctx.periods[ctx.periodIndex[t.period]]; });
    if (!periods.length) return false;
    return !eventsOn(ctx, date).some(function (ev) {
      return ev.replaces && periods.some(function (p) { return overlaps(ev, p.start, p.end); });
    });
  }

  // The lesson a follow-up belongs to: the class's next lesson after it was written, or, once that
  // has passed without a tick, the next one from today. So it sits on one lesson at a time.
  function followUpTarget(ctx, e) {
    var from = addDays(e.date, 1);
    if (ctx.today && ctx.today > from) from = ctx.today;
    for (var i = 0; i <= LOOKAHEAD_DAYS; i++) {
      var d = addDays(from, i);
      if (classOn(ctx, e.classId, d)) return d;
    }
    return null;
  }

  // What a lesson should pick up from earlier ones: follow-ups not yet ticked.
  function followUpsFor(ctx, classId, date) {
    return (ctx.followUpsByClass[classId] || []).filter(function (e) {
      if (!(e.date < date)) return false;
      var key = e.date + "|" + e.classId;
      if (!(key in ctx.followUpTargets)) ctx.followUpTargets[key] = followUpTarget(ctx, e);
      return ctx.followUpTargets[key] === date;
    });
  }

  // Homework that this class hands in on that day.
  function collectFor(ctx, date, classId) { return ctx.collectByKey[date + "|" + classId] || []; }

  // ---- events ----
  function occursOn(ctx, ev, date) {
    if (date < ev.date || (ev.until && date > ev.until)) return false;
    if (ev.repeat === "weekly") return weekday(date) === weekday(ev.date) && !dayInfo(ctx.school, date).holiday;
    if (ev.repeat === "cycle") return dayInfo(ctx.school, date).cycleDay === Number(ev.repeatOn);
    return date === ev.date;
  }

  function eventsOn(ctx, date) {
    return ctx.events
      .filter(function (ev) { return occursOn(ctx, ev, date); })
      .map(function (ev) { return Object.assign({}, ev, { on: date, allDay: !ev.start }); })
      .sort(function (a, b) {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
      });
  }

  function overlaps(ev, start, end) {
    if (!ev.start) return true;
    var evEnd = ev.end || ev.start;
    return minutes(ev.start) < minutes(end) && minutes(evEnd) > minutes(start);
  }

  // ---- lessons ----
  // One lesson per class per day, however many periods it has (a double is one lesson).
  function lessonsOn(ctx, date) {
    var info = dayInfo(ctx.school, date);
    if (!info.cycleDay) return [];
    var slots = (ctx.timetableByDay[info.cycleDay] || []).slice().sort(function (a, b) {
      return ctx.periodIndex[a.period] - ctx.periodIndex[b.period];
    });
    var byClass = Object.create(null);
    var order = [];
    slots.forEach(function (t) {
      if (!byClass[t.classId]) { byClass[t.classId] = []; order.push(t.classId); }
      byClass[t.classId].push(ctx.periods[ctx.periodIndex[t.period]]);
    });
    var replacing = eventsOn(ctx, date).filter(function (ev) { return ev.replaces; });
    return order.map(function (classId) {
      var periods = byClass[classId];
      var replacedBy = replacing.filter(function (ev) {
        return periods.some(function (p) { return overlaps(ev, p.start, p.end); });
      })[0] || null;
      return {
        date: date, cycleDay: info.cycleDay, classId: classId, cls: ctx.classById[classId],
        periods: periods, periodText: periodText(periods), lengthText: lengthWord(periods.length),
        start: periods[0].start, end: periods[periods.length - 1].end,
        entry: entryFor(ctx, date, classId), replacedBy: replacedBy,
        followUps: followUpsFor(ctx, classId, date), collect: collectFor(ctx, date, classId),
        chase: chaseFor(ctx, classId, date)
      };
    });
  }

  function periodText(periods) {
    if (periods.length === 1) return periods[0].label;
    return periods[0].label + "–" + periods[periods.length - 1].label;
  }

  function lessonStatus(lesson, today, nowMinutes) {
    if (lesson.replacedBy) return "replaced";
    if (lesson.entry && lesson.entry.done) return "done";
    var over = lesson.date < today || (lesson.date === today && nowMinutes >= minutes(lesson.end));
    if (over) return "not-updated";
    return lesson.entry && hasWriting(lesson.entry) ? "planned" : "empty";
  }

  function hasWriting(entry) {
    return !!(entry.plan || entry.covered || entry.followUp || entry.remind || entry.homework || entry.notes);
  }

  function teachesOn(ctx, date, classId) {
    return lessonsOn(ctx, date).filter(function (l) { return l.classId === classId && !l.replacedBy; })[0] || null;
  }

  function nextLesson(ctx, classId, afterDate) {
    for (var i = 1; i <= LOOKAHEAD_DAYS; i++) {
      var lesson = teachesOn(ctx, addDays(afterDate, i), classId);
      if (lesson) return lesson;
    }
    return null;
  }

  function previousLesson(ctx, classId, beforeDate) {
    for (var i = 1; i <= LOOKAHEAD_DAYS; i++) {
      var lesson = teachesOn(ctx, addDays(beforeDate, -i), classId);
      if (lesson) return lesson;
    }
    return null;
  }

  // Lessons that have ended but were never ticked, oldest first. Only since the teacher started.
  function notUpdated(ctx, since, today, nowMinutes) {
    var from = addDays(today, -NOT_UPDATED_WINDOW_DAYS);
    if (since && since > from) from = since;
    var found = [];
    for (var d = from; d <= today; d = addDays(d, 1)) {
      lessonsOn(ctx, d).forEach(function (l) {
        if (lessonStatus(l, today, nowMinutes) === "not-updated") found.push(l);
      });
    }
    return found;
  }

  function homeworkDueOn(ctx, date) {
    return ctx.log
      .filter(function (e) { return e.homework && e.homeworkDue === date && ctx.classById[e.classId]; })
      .map(function (e) { return { entry: e, cls: ctx.classById[e.classId] }; });
  }

  function openTodos(ctx) { return ctx.todos.filter(function (t) { return !t.done; }); }

  function openMarks(ctx) { return ctx.marks.filter(function (m) { return !m.done; }); }

  // Things with no date that probably need one: open to-dos, homework, and marking.
  function undated(ctx) {
    return {
      todos: openTodos(ctx).filter(function (t) { return !t.due; }),
      homework: ctx.log.filter(function (e) { return e.homework && !e.homeworkDue && ctx.classById[e.classId]; })
        .sort(function (a, b) { return a.date < b.date ? 1 : -1; }),
      marks: openMarks(ctx).filter(function (m) { return !m.due; })
    };
  }

  function undatedCount(u) { return u.todos.length + u.homework.length + u.marks.length; }

  // Marking still to do, soonest return date first (undated last).
  function marksByDue(ctx) {
    return openMarks(ctx).slice().sort(function (a, b) {
      if (!a.due !== !b.due) return a.due ? -1 : 1;
      return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
    });
  }

  function marksDueOn(ctx, date) { return openMarks(ctx).filter(function (m) { return m.due === date; }); }

  // How far through a marking pile: from the name list when there is one, otherwise the counts typed.
  function markProgress(mark) {
    var students = mark.students || {};
    var ids = Object.keys(students);
    if (ids.length) {
      var handedIn = ids.filter(function (k) { return students[k].s === "S" || students[k].s === "L"; });
      var marked = handedIn.filter(function (k) { return students[k].m; }).length;
      var missing = ids.filter(function (k) { return students[k].s === "M"; });
      return { total: handedIn.length, marked: marked, missing: missing, fromList: true };
    }
    var total = Number(mark.scripts) || 0;
    return { total: total, marked: Math.min(Number(mark.marked) || 0, total || Infinity), missing: [], fromList: false };
  }

  // To-dos sorted into the groups the To-dos page shows.
  function groupTodos(ctx, today) {
    var weekEnd = addDays(today, 7);
    var groups = { overdue: [], today: [], week: [], later: [], someday: [] };
    openTodos(ctx).forEach(function (t) {
      if (!t.due) groups.someday.push(t);
      else if (t.due < today) groups.overdue.push(t);
      else if (t.due === today) groups.today.push(t);
      else if (t.due <= weekEnd) groups.week.push(t);
      else groups.later.push(t);
    });
    Object.keys(groups).forEach(function (k) {
      groups[k].sort(function (a, b) { return (a.due + (a.time || "")) < (b.due + (b.time || "")) ? -1 : 1; });
    });
    return groups;
  }

  // ---- week view ----
  // Monday to Friday always; Saturday or Sunday only when something is on.
  function weekDays(ctx, monday) {
    var days = [];
    for (var i = 0; i < 7; i++) {
      var date = addDays(monday, i);
      var info = dayInfo(ctx.school, date);
      var events = eventsOn(ctx, date);
      var schoolThing = info.labels.some(function (l) { return l.type !== "H"; });
      if (info.weekend && !events.length && !schoolThing) continue;
      days.push({ info: info, lessons: lessonsOn(ctx, date), events: events, todoCount: todosDueOn(ctx, date).length });
    }
    return days;
  }

  function todosDueOn(ctx, date) {
    return openTodos(ctx).filter(function (t) { return t.due === date; });
  }

  // ---- day strip ----
  // The rows of a day from 7:40 to 18:00: one row before school, the school's own periods (lessons,
  // recess, lunch at their real times), then 40-minute rows after school.
  var STRIP_START = "07:40", STRIP_END = "18:00", AFTER_SCHOOL_MINUTES = 40;
  function clock(mins) { var h = Math.floor(mins / 60), m = mins % 60; return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m; }

  function stripRows(periods) {
    var sorted = (periods || []).slice().sort(function (a, b) { return a.start < b.start ? -1 : 1; });
    var rows = [];
    var t = STRIP_START;
    sorted.forEach(function (p) {
      if (p.end <= STRIP_START || p.start >= STRIP_END) return;
      if (p.start > t) rows.push({ start: t, end: p.start, label: rows.length ? "" : "Before school", kind: "open" });
      rows.push({ start: p.start, end: p.end, label: p.label, kind: p.teaching ? "period" : "break", period: p.id });
      if (p.end > t) t = p.end;
    });
    for (var m = minutes(t); m < minutes(STRIP_END); m += AFTER_SCHOOL_MINUTES) {
      var end = Math.min(m + AFTER_SCHOOL_MINUTES, minutes(STRIP_END));
      rows.push({ start: clock(m), end: clock(end), label: sorted.length ? "After school" : "", kind: "open" });
    }
    return rows.filter(function (r) { return r.start < r.end; });
  }

  // A day with lessons (a cycle day, or a weekday at a Mon–Fri school).
  function nextSchoolDay(ctx, date) {
    for (var i = 1; i <= 60; i++) {
      var d = addDays(date, i);
      if (dayInfo(ctx.school, d).cycleDay) return d;
    }
    return null;
  }

  function schoolDaysAfter(ctx, date, count) {
    var found = [];
    for (var d = nextSchoolDay(ctx, date); d && found.length < count; d = nextSchoolDay(ctx, d)) found.push(d);
    return found;
  }

  function findCycleDay(ctx, cycleDay, fromDate) {
    for (var i = 0; i <= 400; i++) {
      var date = addDays(fromDate, i);
      if (dayInfo(ctx.school, date).cycleDay === cycleDay) return date;
    }
    return null;
  }

  // ---- evening email ----
  // A round-up of one day (tomorrow unless told otherwise): its lessons, items, homework, marking and
  // to-dos, plus what's overdue; for tomorrow also anything left un-updated today. Null when nothing's on.
  function digest(ctx, today, since, forDate) {
    var day = forDate || addDays(today, 1);
    var isToday = day === today;
    var info = dayInfo(ctx.school, day);
    var lessons = lessonsOn(ctx, day);
    var events = eventsOn(ctx, day);
    var due = todosDueOn(ctx, day);
    var homework = homeworkDueOn(ctx, day);
    var marks = marksDueOn(ctx, day);
    if (!lessons.length && !events.length && !due.length && !homework.length && !marks.length) return null;
    var leftToday = isToday ? [] : notUpdated(ctx, since, today, 24 * 60).filter(function (l) { return l.date === today; });
    return {
      date: day, isToday: isToday, info: info, lessons: lessons, events: events, todosDue: due, homeworkDue: homework,
      marksDue: marks, overdueMarks: openMarks(ctx).filter(function (m) { return m.due && m.due < day; }),
      overdue: openTodos(ctx).filter(function (t) { return t.due && t.due < day; }),
      leftToday: leftToday
    };
  }

  return {
    addDays: addDays, weekday: weekday, daysBetween: daysBetween, isDate: isDate, isTime: isTime,
    minutes: minutes, mondayOf: mondayOf, shortDate: shortDate, longDate: longDate, dayMonth: dayMonth,
    monthYear: monthYear, dayInfo: dayInfo, cycleName: cycleName, lengthWord: lengthWord, prepare: prepare,
    entryFor: entryFor, eventsOn: eventsOn, occursOn: occursOn, lessonsOn: lessonsOn, lessonStatus: lessonStatus,
    hasWriting: hasWriting, nextLesson: nextLesson, previousLesson: previousLesson, notUpdated: notUpdated,
    homeworkDueOn: homeworkDueOn, groupTodos: groupTodos, todosDueOn: todosDueOn, weekDays: weekDays,
    findCycleDay: findCycleDay, digest: digest, followUpsFor: followUpsFor, collectFor: collectFor,
    undated: undated, undatedCount: undatedCount, openMarks: openMarks, marksByDue: marksByDue,
    marksDueOn: marksDueOn, markProgress: markProgress, chaseFor: chaseFor, stripRows: stripRows,
    nextSchoolDay: nextSchoolDay, schoolDaysAfter: schoolDaysAfter
  };
}
