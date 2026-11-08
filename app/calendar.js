/* Calendar: "My week" as a time grid (same rows as Today's strip) with plans, homework to collect,
   marking and to-dos in each day; on a phone a Day | Week switch instead. "School year" shows the
   whole school calendar month by month: cycle days, holidays, exams and events, with a key. */

var LABEL_KEY = [["H", "Holiday"], ["E", "Exam"], ["U", "Uniform test"], ["A", "Activity day"], ["S", "School event"]];
var LABEL_PRIORITY = { H: 5, E: 4, U: 3, A: 2, S: 1 };

function renderWeek() {
  if (App.param === "year") return renderYear();
  var anchor = App.param && L.isDate(App.param) ? App.param : todayStr();
  var monday = L.mondayOf(anchor);
  var days = L.weekDays(App.ctx, monday);
  var today = todayStr();
  var friday = L.addDays(monday, 4);
  var phone = Motion.phone();

  var head = el("header", { class: "page-head" }, [
    el("div", {}, [
      el("div", { class: "eyebrow" }, "Calendar"),
      el("h1", {}, "Week of " + L.dayMonth(monday)),
      el("div", { class: "sub" }, L.dayMonth(monday) + " – " + L.dayMonth(friday) + " " + friday.slice(0, 4))
    ]),
    el("div", { class: "head-tools" }, [
      el("button", { type: "button", class: "btn icon-btn", "aria-label": "Previous week", onclick: function () { go("week", L.addDays(monday, -7)); } }, icon("left")),
      el("button", { type: "button", class: "btn", onclick: function () { go("week"); } }, "This week"),
      el("button", { type: "button", class: "btn icon-btn", "aria-label": "Next week", onclick: function () { go("week", L.addDays(monday, 7)); } }, icon("right"))
    ])
  ]);

  var body;
  if (phone) {
    var mode = App.calPhone || "day";
    var dayDate = App.calDay && App.calDay >= monday && App.calDay <= L.addDays(monday, 6) ? App.calDay : (today >= monday && today <= L.addDays(monday, 6) ? today : monday);
    body = [
      segmented([["day", "Day"], ["week", "Week"]], mode, function (v) { App.calPhone = v; render(); }),
      mode === "day" ? phoneDay(dayDate, days) : el("div", { class: "week-list" }, days.map(function (d) { return dayListCard(d, today); }))
    ];
  } else {
    body = [weekGrid(days, today)];
  }
  return el("div", { class: "page page-wide" }, [head, calendarSwitch("week"), labelKey()].concat(body).concat([cycleJump(today)]));
}

function segmented(options, value, onChange) {
  return el("div", { class: "segmented", role: "tablist" }, options.map(function (o) {
    return el("button", { type: "button", role: "tab", "aria-selected": o[0] === value ? "true" : "false", onclick: function () { onChange(o[0]); } }, o[1]);
  }));
}

function calendarSwitch(current) {
  return segmented([["week", "My week"], ["year", "School year"]], current, function (v) { go("week", v === "year" ? "year" : ""); });
}

function labelKey() {
  return el("div", { class: "label-key", "aria-label": "Colour key" }, LABEL_KEY.map(function (k) {
    return el("span", { class: "key-item" }, [el("span", { class: "key-swatch lab-" + k[0] }), k[1]]);
  }).concat([el("span", { class: "key-item" }, [el("span", { class: "key-swatch lab-mine" }), "Your items"])]));
}

function cycleJump(today) {
  if (App.ctx.school.kind !== "cycle") return null;
  var buttons = [];
  for (var n = 1; n <= App.ctx.school.cycleLength; n++) buttons.push(n);
  return el("div", { class: "cycle-jump", style: "margin-top:18px" }, [el("span", { class: "hint", style: "margin-right:6px" }, "Jump to the next")]
    .concat(buttons.map(function (n) {
      return el("button", { type: "button", class: "btn btn-sm", onclick: function () {
        var found = L.findCycleDay(App.ctx, n, today);
        if (found) { go("week", found); toast("The next Day " + n + " is " + L.longDate(found) + "."); }
        else toast("There are no more Day " + n + "s in this school year.", true);
      } }, "Day " + n);
    })));
}

// Days across, the school's rows down; an all-day row on top for labels, homework, marking, to-dos.
function weekGrid(days, today) {
  var rows = L.stripRows(App.ctx.periods);
  var cols = "68px repeat(" + days.length + ", minmax(0, 1fr))";
  var cells = [el("div", { class: "wg-corner" })];
  days.forEach(function (d) {
    var info = d.info;
    cells.push(el("button", { type: "button", class: "wg-head" + (info.date === today ? " is-today" : "") + (info.holiday ? " is-holiday" : ""), onclick: function () { go("today", info.date); } }, [
      el("div", { class: "day-date" }, [L.shortDate(info.date), info.cycleDay ? el("small", {}, L.cycleName(App.ctx.school, info.cycleDay)) : null]),
      info.labels.length ? el("div", { class: "day-labels" }, labelChips(info)) : null
    ]));
  });
  cells.push(el("div", { class: "wg-time" }, el("span", {}, "All day")));
  days.forEach(function (d) { cells.push(el("div", { class: "wg-cell wg-allday" }, dayExtras(d.info.date, d.lessons))); });
  rows.forEach(function (r) {
    cells.push(el("div", { class: "wg-time kind-" + r.kind }, [el("b", {}, r.start), el("span", {}, r.label)]));
    days.forEach(function (d) {
      var date = d.info.date;
      var starts = d.lessons.filter(function (l) { return l.periods[0].id === r.period; });
      var cont = d.lessons.filter(function (l) { return l.periods.slice(1).some(function (p) { return p.id === r.period; }); });
      var items = d.events.filter(function (ev) { return !ev.allDay && ev.start >= r.start && ev.start < r.end; });
      var content = starts.map(miniLesson)
        .concat(cont.map(function (l) { return el("span", { class: "mini-cont " + classColour(l.cls) }, "↳ " + l.cls.name); }))
        .concat(items.map(miniEvent));
      var cell = el("div", { class: "wg-cell kind-" + r.kind + (date === today ? " is-today" : "") }, content.length ? content :
        (r.kind !== "break" ? el("button", { type: "button", class: "wg-add", "aria-label": "Add an item " + L.shortDate(date) + " " + r.start,
          onclick: function () { openEventEditor(null, { date: date, start: r.start, end: r.end }); } }, "+") : null));
      cells.push(cell);
    });
  });
  return el("div", { class: "week-grid", style: "grid-template-columns:" + cols }, cells);
}

// What a day has besides timed things: all-day items, homework handed in, marking and to-dos due.
function dayExtras(date, lessons) {
  var taught = Object.create(null);
  lessons.forEach(function (l) { taught[l.classId] = true; });
  var rows = L.stripRows(App.ctx.periods);
  var first = rows.length ? rows[0].start : "07:40", last = rows.length ? rows[rows.length - 1].end : "18:00";
  // All-day items, plus timed ones outside the grid's hours (e.g. a 19:00 parents' evening).
  var out = L.eventsOn(App.ctx, date).filter(function (ev) { return ev.allDay || ev.start < first || ev.start >= last; }).map(miniEvent);
  L.homeworkDueOn(App.ctx, date).filter(function (h) { return !taught[h.entry.classId]; }).forEach(function (h) {
    out.push(el("button", { type: "button", class: "mini-tag " + classColour(h.cls), onclick: function () { openLessonEditor(h.entry.date, h.entry.classId); } }, "HW due · " + h.cls.name));
  });
  L.marksDueOn(App.ctx, date).forEach(function (m) {
    out.push(el("button", { type: "button", class: "mini-tag tag-mark", onclick: function () { openMarkEditor(m); } }, "Return · " + m.title));
  });
  var todos = L.todosDueOn(App.ctx, date);
  if (todos.length) out.push(el("button", { type: "button", class: "mini-tag", onclick: function () { go("todos"); } }, todos.length + (todos.length === 1 ? " to-do" : " to-dos")));
  return out;
}

function miniLesson(l) {
  var status = lessonStatusNow(l);
  var e = l.entry || {};
  var flags = [];
  if (l.collect.length) flags.push(el("span", { class: "mini-flag flag-collect" }, "Collect"));
  if (l.followUps.length) flags.push(el("span", { class: "mini-flag flag-follow" }, "Follow up"));
  if (l.chase.length) flags.push(el("span", { class: "mini-flag flag-chase" }, "Chase"));
  return el("button", { type: "button", class: "mini " + classColour(l.cls) + (l.replacedBy ? " is-replaced" : ""),
    onclick: function () { openLessonEditor(l.date, l.classId); }, "aria-label": l.cls.name + " " + l.periodText + ", " + STATUS_TEXT[status] }, [
    el("span", { class: "mini-top" }, [el("span", {}, l.start + " · " + l.periodText), el("span", { class: "state-dot state-" + status, title: STATUS_TEXT[status] })]),
    el("span", { class: "mini-name" }, l.cls.name),
    l.replacedBy ? el("span", { class: "mini-plan" }, l.replacedBy.title) : e.plan ? el("span", { class: "mini-plan" }, e.plan) : null,
    flags.length ? el("span", { class: "mini-flags" }, flags) : null
  ]);
}

function miniEvent(ev) {
  return el("button", { type: "button", class: "mini event" + (ev.replaces ? " replaces" : ""), onclick: function () { openEventEditor(ev); } }, [
    el("span", { class: "mini-top" }, ev.allDay ? "All day" : ev.start + (ev.end ? "–" + ev.end : "")),
    el("span", { class: "mini-name" }, ev.title)
  ]);
}

// Phone, Day: pick a day of the week, then the same strip as Today.
function phoneDay(date, days) {
  return [
    el("div", { class: "day-pills" }, days.map(function (d) {
      return el("button", { type: "button", class: "day-pill", "aria-pressed": d.info.date === date ? "true" : "false", onclick: function () { App.calDay = d.info.date; render(); } }, [
        el("b", {}, L.shortDate(d.info.date).split(" ")[0]), el("span", {}, d.info.date.slice(8).replace(/^0/, ""))
      ]);
    })),
    el("div", { class: "section-title" }, [L.longDate(date), " ", cycleChip(L.dayInfo(App.ctx.school, date))].concat(labelChips(L.dayInfo(App.ctx.school, date)))),
    dayView(date, date === todayStr())
  ];
}

// Phone, Week: one card per day, scrolling down.
function dayListCard(d, today) {
  var info = d.info;
  var items = d.lessons.map(function (l) { return { at: l.start, node: miniLesson(l) }; })
    .concat(d.events.map(function (ev) { return { at: ev.allDay ? "00:00" : ev.start, node: miniEvent(ev) }; }))
    .sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; })
    .map(function (x) { return x.node; });
  var extras = dayExtras(info.date, d.lessons).filter(function (n) { return !n.classList.contains("event"); });
  return el("section", { class: "day-col" + (info.date === today ? " is-today" : "") + (info.holiday ? " is-holiday" : "") }, [
    el("button", { type: "button", class: "day-head", onclick: function () { App.calPhone = "day"; App.calDay = info.date; render(); } }, [
      el("div", { class: "day-date" }, [L.shortDate(info.date), info.cycleDay ? el("small", {}, L.cycleName(App.ctx.school, info.cycleDay)) : null]),
      info.labels.length ? el("div", { class: "day-labels" }, labelChips(info)) : null
    ]),
    el("div", { class: "day-body" }, items.concat(extras).length ? items.concat(extras) : [el("p", { class: "empty", style: "font-size:13px" }, info.holiday ? "Holiday" : "Nothing on")])
  ]);
}

// ---------- School year ----------
function schoolYearRange() {
  var s = App.ctx.school;
  if (s.first && s.last) return [s.first, s.last];
  var t = todayStr();
  var y = Number(t.slice(0, 4)) - (Number(t.slice(5, 7)) < 9 ? 1 : 0);
  return [y + "-09-01", (y + 1) + "-08-31"];
}

function renderYear() {
  var range = schoolYearRange();
  var showMine = !!App.yearMine;
  var today = todayStr();
  var months = [];
  for (var m = range[0].slice(0, 7) + "-01"; m <= range[1]; m = nextMonth(m)) months.push(m);
  var school = App.ctx.school;
  return el("div", { class: "page page-wide" }, [
    el("header", { class: "page-head" }, [
      el("div", {}, [el("div", { class: "eyebrow" }, "Calendar"), el("h1", {}, "School year " + (school.year || range[0].slice(0, 4) + "–" + range[1].slice(2, 4))),
        el("div", { class: "sub" }, school.name || "")]),
      el("div", { class: "head-tools" }, el("label", { class: "check" }, [
        el("input", { type: "checkbox", checked: showMine, onchange: function (e) { App.yearMine = e.target.checked; render(); } }), "Show my items too"]))
    ]),
    calendarSwitch("year"),
    labelKey(),
    el("div", { class: "year-grid" }, months.map(function (first) { return monthCard(first, today, showMine); }))
  ]);
}

function nextMonth(first) {
  var y = Number(first.slice(0, 4)), mo = Number(first.slice(5, 7));
  return mo === 12 ? (y + 1) + "-01-01" : y + "-" + (mo < 9 ? "0" : "") + (mo + 1) + "-01";
}

function monthCard(first, today, showMine) {
  var cells = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(function (d) { return el("span", { class: "ym-dow" }, d.slice(0, 2)); });
  var lead = (L.weekday(first) + 6) % 7;
  for (var i = 0; i < lead; i++) cells.push(el("span", { class: "ym-blank" }));
  var month = first.slice(0, 7);
  var listed = [];
  var seen = Object.create(null);
  for (var d = first; d.slice(0, 7) === month; d = L.addDays(d, 1)) {
    var info = L.dayInfo(App.ctx.school, d);
    var top = info.labels.slice().sort(function (a, b) { return LABEL_PRIORITY[b.type] - LABEL_PRIORITY[a.type]; })[0];
    var mine = showMine && (L.eventsOn(App.ctx, d).length || L.todosDueOn(App.ctx, d).length || L.marksDueOn(App.ctx, d).length);
    info.labels.forEach(function (l) {
      var key = l.text + "|" + l.type;
      // Join only consecutive days (a weekend in between still counts as consecutive).
      if (seen[key] && L.daysBetween(seen[key].to, d) <= 3) { seen[key].to = d; return; }
      seen[key] = { from: d, to: d, text: l.text, type: l.type };
      listed.push(seen[key]);
    });
    cells.push(el("button", { type: "button", class: "ym-day" + (top ? " lab-" + top.type : "") + (info.weekend ? " is-weekend" : "") + (d === today ? " is-today" : ""),
      title: [L.longDate(d)].concat(info.labels.map(function (l) { return l.text; })).join("\n"),
      onclick: (function (date) { return function () { go("today", date); }; })(d) }, [
      el("span", { class: "ym-num" }, String(Number(d.slice(8)))),
      info.cycleDay && App.ctx.school.kind === "cycle" ? el("span", { class: "ym-cycle" }, String(info.cycleDay)) : null,
      mine ? el("span", { class: "ym-mine", "aria-label": "Has your items" }) : null
    ]));
  }
  return el("section", { class: "month-card" }, [
    el("h2", {}, L.monthYear(first)),
    el("div", { class: "ym-grid" }, cells),
    listed.length ? el("ul", { class: "ym-list" }, listed.map(function (x) {
      var when = x.from === x.to ? String(Number(x.from.slice(8))) : Number(x.from.slice(8)) + "–" + (x.to.slice(0, 7) === x.from.slice(0, 7) ? Number(x.to.slice(8)) : L.dayMonth(x.to));
      return el("li", {}, [el("span", { class: "key-swatch lab-" + x.type }), el("b", {}, when), " ", x.text]);
    })) : null
  ]);
}
