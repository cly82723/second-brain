/* Today: a day strip from 7:40 to 18:00 laid out by the school's own periods, your own items in it,
   the week ahead underneath, and (on Saturday and Sunday) the weekend plus a preview of the next
   school day. The side column holds to-dos, marking, homework to collect and anything not updated. */

function renderToday() {
  var date = App.param && L.isDate(App.param) ? App.param : todayStr();
  var today = todayStr();
  var isToday = date === today;
  var info = L.dayInfo(App.ctx.school, date);
  var weekend = info.weekend;
  var shown = weekend ? (L.nextSchoolDay(App.ctx, date) || date) : date;
  var lessons = L.lessonsOn(App.ctx, date);
  var nowMin = nowMinutes();
  var current = isToday ? lessons.filter(function (l) { return !l.replacedBy && L.minutes(l.start) <= nowMin && nowMin < L.minutes(l.end); })[0] : null;
  var next = isToday ? lessons.filter(function (l) { return !l.replacedBy && L.minutes(l.start) > nowMin; })[0] : null;
  var groups = L.groupTodos(App.ctx, today);
  var sideCount = groups.overdue.length + groups.today.length;

  var head = el("header", { class: "page-head" }, [
    el("div", {}, [
      el("div", { class: "eyebrow" }, isToday ? "Today" : (date < today ? "Looking back" : "Looking ahead")),
      el("h1", {}, L.longDate(date)),
      el("div", { class: "sub" }, [cycleChip(info)].concat(labelChips(info)).concat([
        current ? el("span", {}, "Now: " + current.cls.name + " until " + current.end) :
          next ? el("span", {}, "Next: " + next.cls.name + " at " + next.start) : null
      ]))
    ]),
    el("div", { class: "head-tools" }, [
      el("button", { type: "button", class: "btn icon-btn", "aria-label": "Previous day", onclick: function () { go("today", L.addDays(date, -1)); } }, icon("left")),
      isToday ? null : el("button", { type: "button", class: "btn", onclick: function () { go("today"); } }, "Today"),
      el("button", { type: "button", class: "btn icon-btn", "aria-label": "Next day", onclick: function () { go("today", L.addDays(date, 1)); } }, icon("right"))
    ])
  ]);

  var switcher = el("div", { class: "mobile-switch", role: "tablist", "aria-label": "Show", style: "--i:" + (App.todayPane === "side" ? 1 : 0) }, [
    ["lessons", "Day"], ["side", "Lists" + (sideCount ? " (" + sideCount + ")" : "")]
  ].map(function (p) {
    return el("button", { type: "button", role: "tab", "aria-selected": App.todayPane === p[0] ? "true" : "false",
      onclick: function (e) {
        e.currentTarget.parentNode.style.setProperty("--i", p[0] === "side" ? 1 : 0);
        App.todayPane = p[0];
        setTimeout(render, Motion.reduced ? 0 : 140);
      } }, p[1]);
  }));

  var main = weekend
    ? [weekendPanel(date), el("div", { class: "section-title" }, shown !== date ? "Preview: " + L.longDate(shown) : "Next school day"), dayView(shown, false)]
    : [dayView(date, isToday)];

  return el("div", { class: "page" }, [
    head, switcher,
    el("div", { class: "today-grid" }, [
      el("div", { "data-pane": "lessons", "data-hidden-mobile": App.todayPane !== "lessons" ? "true" : "false" }, main),
      el("div", { "data-pane": "side", "data-hidden-mobile": App.todayPane !== "side" ? "true" : "false" }, todaySide(shown, groups))
    ]),
    weekAhead(weekend ? L.addDays(shown, -1) : date)
  ]);
}

// All-day things on top, then the strip.
function dayView(date, isToday) {
  var info = L.dayInfo(App.ctx.school, date);
  var events = L.eventsOn(App.ctx, date);
  var lessons = L.lessonsOn(App.ctx, date);
  var taught = Object.create(null);
  lessons.forEach(function (l) { taught[l.classId] = true; });
  // Homework handed in by a class not taught that day still gets a chip.
  var looseHomework = L.homeworkDueOn(App.ctx, date).filter(function (h) { return !taught[h.entry.classId]; });
  var banner = events.filter(function (ev) { return ev.allDay; }).map(function (ev) {
    return el("button", { type: "button", class: "allday", onclick: function () { openEventEditor(ev); } }, [
      el("span", { class: "chip" }, "All day"), el("b", {}, ev.title), ev.replaces ? el("span", { class: "hint" }, "· replaces lessons") : null
    ]);
  }).concat(looseHomework.map(function (h) {
    return el("button", { type: "button", class: "allday " + classColour(h.cls), onclick: function () { openLessonEditor(h.entry.date, h.entry.classId); } }, [
      el("span", { class: "chip class-chip " + classColour(h.cls) }, "Homework due"), el("b", {}, h.cls.name + ": " + h.entry.homework)
    ]);
  })).concat(L.marksDueOn(App.ctx, date).map(function (m) {
    return el("button", { type: "button", class: "allday", onclick: function () { openMarkEditor(m); } }, [el("span", { class: "chip chip-E" }, "Return marking"), el("b", {}, m.title)]);
  }));
  return [
    banner.length ? el("div", { class: "day-banner" }, banner) : null,
    !info.cycleDay && !events.length ? el("p", { class: "hint", style: "margin:0 0 10px" }, info.holiday ? "No school today. Enjoy the break." : "No lessons on this day.") : null,
    dayStrip(date, isToday)
  ];
}

// One row per period (and before/after school). A lesson sits in its first period and is shown as
// continuing in the next; your items sit in the row they start in; empty periods can be tapped.
function dayStrip(date, isToday) {
  var rows = L.stripRows(App.ctx.periods);
  var lessons = L.lessonsOn(App.ctx, date);
  var timed = L.eventsOn(App.ctx, date).filter(function (ev) { return !ev.allDay; });
  var todos = L.todosDueOn(App.ctx, date).filter(function (t) { return t.time; });
  var first = rows.length ? rows[0].start : "07:40";
  var last = rows.length ? rows[rows.length - 1].end : "18:00";
  var nowMin = nowMinutes();
  var current = isToday ? lessons.filter(function (l) { return !l.replacedBy && L.minutes(l.start) <= nowMin && nowMin < L.minutes(l.end); })[0] : null;
  function inRow(t, r) { return t >= r.start && t < r.end; }

  var earlier = timed.filter(function (ev) { return ev.start < first; });
  var later = timed.filter(function (ev) { return ev.start >= last; });
  var out = [];
  if (earlier.length) out.push(el("div", { class: "strip-edge" }, [el("span", { class: "hint" }, "Earlier")].concat(earlier.map(edgeChip))));
  rows.forEach(function (r) {
    var starts = lessons.filter(function (l) { return l.periods[0].id === r.period; });
    var continues = lessons.filter(function (l) { return l.periods.slice(1).some(function (p) { return p.id === r.period; }); });
    var items = timed.filter(function (ev) { return inRow(ev.start, r); });
    var dueTodos = todos.filter(function (t) { return inRow(t.time, r); });
    var content = starts.map(function (l) { return lessonCard(l, current && current.classId === l.classId); })
      .concat(continues.map(function (l) {
        return el("button", { type: "button", class: "strip-cont " + classColour(l.cls), onclick: function () { openLessonEditor(l.date, l.classId); } }, l.cls.name + " continues");
      }))
      .concat(items.map(stripItem))
      .concat(dueTodos.map(function (t) { return el("button", { type: "button", class: "strip-todo", onclick: function () { openTodoEditor(t); } }, [el("span", { class: "chip" }, "To-do " + t.time), " ", t.title]); }));
    var empty = !content.length;
    var row = el("div", { class: "strip-row kind-" + r.kind + (empty ? " is-empty" : "") }, [
      el("div", { class: "strip-time" }, [el("b", {}, r.start), el("span", {}, r.label)]),
      el("div", { class: "strip-body" }, empty ? el("button", { type: "button", class: "strip-free", "aria-label": "Add an item " + r.start + "–" + r.end,
        onclick: function () { openEventEditor(null, { date: date, start: r.start, end: r.end }); } },
        r.kind === "period" ? "Free" : r.kind === "break" ? r.label : "+") : content)
    ]);
    if (isToday && nowMin >= L.minutes(r.start) && nowMin < L.minutes(r.end)) {
      var pct = 100 * (nowMin - L.minutes(r.start)) / (L.minutes(r.end) - L.minutes(r.start));
      row.classList.add("has-now");
      row.appendChild(el("div", { class: "now-line", style: "top:" + pct.toFixed(1) + "%", "aria-hidden": "true" }));
    }
    out.push(row);
  });
  if (later.length) out.push(el("div", { class: "strip-edge" }, [el("span", { class: "hint" }, "Later")].concat(later.map(edgeChip))));
  return el("div", { class: "strip" }, out);
}

function stripItem(ev) {
  return el("button", { type: "button", class: "strip-item" + (ev.replaces ? " replaces" : ""), onclick: function () { openEventEditor(ev); } }, [
    el("span", { class: "strip-item-time" }, ev.start + (ev.end ? "–" + ev.end : "")),
    el("b", {}, ev.title),
    ev.repeat !== "none" ? el("span", { class: "chip" }, "Repeats") : null
  ]);
}

function edgeChip(ev) {
  return el("button", { type: "button", class: "chip edge-chip", onclick: function () { openEventEditor(ev); } }, ev.start + " " + ev.title);
}

// Saturday and Sunday together, so anything set for the weekend still shows.
function weekendPanel(date) {
  var sat = L.weekday(date) === 6 ? date : L.addDays(date, -1);
  var days = [sat, L.addDays(sat, 1)];
  var rows = [];
  days.forEach(function (d) {
    var things = L.eventsOn(App.ctx, d).map(function (ev) {
      return el("li", {}, el("button", { type: "button", class: "link-row", onclick: function () { openEventEditor(ev); } }, [
        el("span", { class: "chip" }, ev.allDay ? "All day" : ev.start), el("span", { class: "link-title" }, ev.title)]));
    }).concat(L.todosDueOn(App.ctx, d).map(todoItem))
      .concat(L.marksDueOn(App.ctx, d).map(markRow))
      .concat(L.homeworkDueOn(App.ctx, d).map(function (h) {
        return el("li", {}, el("button", { type: "button", class: "link-row " + classColour(h.cls), onclick: function () { openLessonEditor(h.entry.date, h.entry.classId); } }, [
          el("span", { class: "dot" }), el("span", { class: "link-title" }, "Homework due: " + h.cls.name + ", " + h.entry.homework)]));
      }));
    if (things.length) rows.push(el("div", { class: "weekend-day" }, [el("div", { class: "label" }, L.longDate(d)), el("ul", { class: "list" }, things)]));
  });
  return panel("This weekend", L.dayMonth(days[0]) + "–" + L.dayMonth(days[1]), [
    rows.length ? rows : el("p", { class: "empty" }, "Nothing set for this weekend."),
    el("div", { class: "row", style: "margin-top:10px" }, [
      el("button", { type: "button", class: "btn btn-sm", onclick: function () { openEventEditor(null, { date: date }); } }, "+ Item or reminder"),
      el("button", { type: "button", class: "btn btn-sm btn-quiet", onclick: function () { openTodoEditor(null, { due: date }); } }, "+ To-do")
    ])
  ]);
}

// The next five school days, one compact card each.
function weekAhead(fromDate) {
  var days = L.schoolDaysAfter(App.ctx, fromDate, 5);
  if (!days.length) return null;
  return el("section", { class: "week-ahead" }, [
    el("div", { class: "section-title" }, "The week ahead"),
    el("div", { class: "ahead-grid" }, days.map(function (d) {
      var info = L.dayInfo(App.ctx.school, d);
      var lessons = L.lessonsOn(App.ctx, d).filter(function (l) { return !l.replacedBy; });
      var items = L.eventsOn(App.ctx, d);
      var hw = L.homeworkDueOn(App.ctx, d);
      var marks = L.marksDueOn(App.ctx, d);
      var todos = L.todosDueOn(App.ctx, d);
      var follow = lessons.reduce(function (n, l) { return n + l.followUps.length; }, 0);
      function stat(n, word) { return n ? el("span", { class: "ahead-stat" }, n + " " + word) : null; }
      return el("button", { type: "button", class: "ahead-card", onclick: function () { go("today", d); } }, [
        el("div", { class: "ahead-date" }, [el("b", {}, L.shortDate(d)), cycleChip(info)]),
        info.labels.length ? el("div", { class: "ahead-label" }, info.labels[0].text + (info.labels.length > 1 ? " +" + (info.labels.length - 1) : "")) : null,
        el("div", { class: "ahead-classes" }, lessons.map(function (l) { return el("span", { class: "dot " + classColour(l.cls), title: l.cls.name }); })),
        el("div", { class: "ahead-stats" }, [
          stat(lessons.length, lessons.length === 1 ? "lesson" : "lessons"), stat(items.length, items.length === 1 ? "item" : "items"),
          stat(hw.length, "to collect"), stat(marks.length, "marking due"), stat(todos.length, todos.length === 1 ? "to-do" : "to-dos"),
          stat(follow, "follow-up" + (follow === 1 ? "" : "s"))
        ])
      ]);
    }))
  ]);
}

function todaySide(date, groups) {
  var today = todayStr();
  var due = groups.overdue.concat(groups.today);
  var homework = L.homeworkDueOn(App.ctx, date);
  var marks = L.marksByDue(App.ctx);
  var stale = L.notUpdated(App.ctx, App.data.settings.startDate, today, nowMinutes()).filter(function (l) { return l.date < today || date === today; });
  var out = [needsDatePanel()];
  out.push(panel("To-dos", due.length ? due.length + " due" : "", [
    due.length ? el("ul", { class: "list" }, due.map(todoItem)) : el("p", { class: "empty" }, "Nothing due today."),
    quickAddTodo(today),
    groups.week.length ? el("button", { type: "button", class: "btn btn-quiet btn-sm", style: "margin-top:8px", onclick: function () { go("todos"); } },
      groups.week.length + " more this week →") : null
  ]));
  out.push(panel("To mark", marks.length ? marks.length + " to do" : "", [
    marks.length ? el("ul", { class: "list" }, marks.slice(0, 5).map(markRow)) : el("p", { class: "empty" }, "Nothing to mark."),
    el("div", { class: "row", style: "margin-top:8px" }, [
      el("button", { type: "button", class: "btn btn-sm", onclick: function () { openMarkEditor(null, {}); } }, "+ Marking"),
      marks.length > 5 ? el("button", { type: "button", class: "btn btn-quiet btn-sm", onclick: function () { go("todos", "mark"); } }, "All " + marks.length + " →") : null
    ])
  ]));
  out.push(panel("Homework due", date === today ? "today" : L.shortDate(date), homework.length ?
    el("ul", { class: "list" }, homework.map(homeworkRow)) : el("p", { class: "empty" }, "No homework to collect.")));
  if (stale.length) {
    out.push(panel("Not updated", stale.length + (stale.length === 1 ? " lesson" : " lessons"), [
      el("p", { class: "hint", style: "margin:0 0 6px" }, "These lessons have ended. Tick them off or note what you covered."),
      el("ul", { class: "list" }, stale.slice(-8).reverse().map(function (l) {
        return el("li", {}, el("button", { type: "button", class: "link-row " + classColour(l.cls), onclick: function () { openLessonEditor(l.date, l.classId); } }, [
          el("span", { class: "dot" }), el("span", { class: "link-title" }, l.cls.name), el("span", { class: "hint", style: "margin-left:auto" }, L.shortDate(l.date))
        ]));
      }))
    ]));
  }
  return out.filter(Boolean);
}

// Homework handed in that day, with "Collected → To mark" (or the marking already made from it).
function homeworkRow(h) {
  var ref = h.entry.date + "|" + h.entry.classId;
  var existing = App.ctx.marks.filter(function (m) { return m.homework === ref; })[0];
  return el("li", { class: "hw-row" }, [
    el("button", { type: "button", class: "link-row " + classColour(h.cls), onclick: function () { openLessonEditor(h.entry.date, h.entry.classId); } }, [
      el("span", { class: "dot" }), el("span", {}, [el("span", { class: "link-title" }, h.cls.name + ": " + h.entry.homework), el("div", { class: "hint" }, "Set " + L.shortDate(h.entry.date))])
    ]),
    el("button", { type: "button", class: "btn btn-sm" + (existing ? " btn-quiet" : ""), onclick: function () {
      if (existing) openMarkEditor(existing);
      else openMarkEditor(null, { title: h.entry.homework, classId: h.entry.classId, collected: h.entry.homeworkDue, homework: ref });
    } }, existing ? "Open marking" : "Collected → To mark")
  ]);
}
