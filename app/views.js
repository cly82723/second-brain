/* The four main pages: Today, Calendar (week), Classes, To-dos.
   Lessons, events and to-dos are kept in separate areas on purpose. */

// ---------- shared pieces ----------
function cycleChip(info) {
  // A Mon–Fri school's "day" is just the weekday, already in the date.
  if (!info.cycleDay || App.ctx.school.kind === "weekday") return null;
  return el("span", { class: "chip chip-cycle" }, L.cycleName(App.ctx.school, info.cycleDay));
}

function labelChips(info) {
  return info.labels.map(function (l) { return el("span", { class: "chip chip-" + l.type }, l.text); });
}

function statusPill(status) {
  return el("span", { class: "status status-" + status }, STATUS_TEXT[status]);
}

function lessonStatusNow(lesson) { return L.lessonStatus(lesson, todayStr(), nowMinutes()); }

function lessonCard(lesson, isNow) {
  var e = lesson.entry || {};
  var status = lessonStatusNow(lesson);
  var body = [];
  if (lesson.replacedBy) body.push(el("div", { class: "replaced-by" }, "Replaced by " + lesson.replacedBy.title));
  if (e.plan) body.push(el("div", { class: "plan" }, e.plan));
  if (e.remind) body.push(el("div", { class: "tagline" }, [el("b", {}, "Remind"), el("span", {}, e.remind)]));
  if (e.homework) body.push(el("div", { class: "tagline" }, [el("b", {}, "HW"), el("span", {}, e.homework + (e.homeworkDue ? " · due " + L.shortDate(e.homeworkDue) : ""))]));
  return el("button", {
    type: "button", class: "lesson " + classColour(lesson.cls) + (isNow ? " is-now" : "") + (lesson.replacedBy ? " is-replaced" : ""),
    onclick: function () { openLessonEditor(lesson.date, lesson.classId); },
    "aria-label": lesson.cls.name + ", " + lesson.periodText + ", " + STATUS_TEXT[status]
  }, [
    el("div", { class: "lesson-time" }, [el("b", {}, lesson.start), lesson.end]),
    el("div", { class: "lesson-name" }, [lesson.cls.name, el("span", { class: "lesson-len" }, lesson.periodText + " · " + lesson.lengthText)]),
    el("div", { class: "lesson-side" }, [isNow ? el("span", { class: "chip chip-cycle" }, "Now") : null, statusPill(status)]),
    body.length ? el("div", { class: "lesson-body" }, body) : null
  ]);
}

function eventCard(ev) {
  var when = ev.allDay ? "All day" : ev.start;
  return el("button", { type: "button", class: "event-card" + (ev.replaces ? " replaces" : ""), onclick: function () { openEventEditor(ev); } }, [
    el("div", { class: "lesson-time" }, [el("b", {}, when), ev.allDay ? "" : (ev.end || "")]),
    el("div", {}, [
      el("div", { class: "lesson-name" }, ev.title),
      ev.notes ? el("div", { class: "hint" }, ev.notes) : null
    ]),
    el("div", { class: "lesson-side" }, ev.repeat !== "none" ? el("span", { class: "chip" }, "Repeats") : null)
  ]);
}

function dueText(t, today) {
  if (!t.due) return null;
  var text = t.due === today ? "Today" : t.due === L.addDays(today, 1) ? "Tomorrow" : L.shortDate(t.due);
  return el("span", { class: t.due < today ? "due-overdue" : "" }, (t.due < today ? "Overdue · " : "") + text + (t.time ? " " + t.time : ""));
}

function todoItem(t) {
  var today = todayStr();
  var cls = t.classId ? App.ctx.classById[t.classId] : null;
  return el("li", { class: "todo" + (t.done ? " is-done" : "") }, [
    el("input", { type: "checkbox", checked: t.done, "aria-label": "Done: " + t.title, onchange: function (e) { toggleTodo(t, e.target.checked); } }),
    el("button", { type: "button", class: "todo-main", onclick: function () { openTodoEditor(t); } }, [
      el("div", { class: "todo-title" }, t.title),
      el("div", { class: "todo-meta" }, [dueText(t, today), cls ? el("span", { class: "chip class-chip " + classColour(cls) }, cls.name) : null])
    ])
  ]);
}

function toggleTodo(t, done) {
  var next = Object.assign({}, t, { done: done, doneAt: done ? todayStr() : "" });
  setData(withList("todos", next, idOf));
  api("saveTodo", next).then(function (res) {
    setData(withList("todos", res.todo, idOf));
    if (done) toast("Ticked off: " + t.title);
  }, function (e) { setData(withList("todos", t, idOf)); fail(e); });
}

function quickAddTodo(due) {
  var input = el("input", { class: "input", placeholder: "Add a to-do…", "aria-label": "New to-do", maxlength: "200" });
  var button = el("button", { type: "submit", class: "btn btn-sm" }, "Add");
  return el("form", { class: "quick-add", onsubmit: function (e) {
    e.preventDefault();
    var title = input.value.trim();
    if (!title) return;
    busy(button, api("saveTodo", { title: title, due: due || "" })).then(function (res) {
      input.value = "";
      setData(withList("todos", res.todo, idOf));
      document.querySelector(".quick-add .input") && document.querySelector(".quick-add .input").focus();
    }, fail);
  } }, [input, button]);
}

function panel(title, hint, children) {
  return el("section", { class: "panel" }, [
    el("div", { class: "panel-head" }, [el("h2", {}, title), hint ? el("span", { class: "hint" }, hint) : null]),
    children
  ]);
}

// ---------- Today ----------
function renderToday() {
  var date = App.param && L.isDate(App.param) ? App.param : todayStr();
  var isToday = date === todayStr();
  var info = L.dayInfo(App.ctx.school, date);
  var lessons = L.lessonsOn(App.ctx, date);
  var events = L.eventsOn(App.ctx, date);
  var nowMin = nowMinutes();
  var current = isToday ? lessons.filter(function (l) { return !l.replacedBy && L.minutes(l.start) <= nowMin && nowMin < L.minutes(l.end); })[0] : null;
  var next = isToday ? lessons.filter(function (l) { return !l.replacedBy && L.minutes(l.start) > nowMin; })[0] : null;
  var groups = L.groupTodos(App.ctx, todayStr());
  var sideCount = groups.overdue.length + groups.today.length;

  var head = el("header", { class: "page-head" }, [
    el("div", {}, [
      el("div", { class: "eyebrow" }, isToday ? "Today" : (date < todayStr() ? "Looking back" : "Looking ahead")),
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
    ["lessons", "Timetable"], ["side", "To-dos" + (sideCount ? " (" + sideCount + ")" : "")]
  ].map(function (p) {
    return el("button", { type: "button", role: "tab", "aria-selected": App.todayPane === p[0] ? "true" : "false",
      onclick: function (e) {
        // Slide the thumb first, then swap the pane, so the motion is seen.
        e.currentTarget.parentNode.style.setProperty("--i", p[0] === "side" ? 1 : 0);
        App.todayPane = p[0];
        setTimeout(render, Motion.reduced ? 0 : 140);
      } }, p[1]);
  }));

  return el("div", { class: "page" }, [
    head, switcher,
    el("div", { class: "today-grid" }, [
      el("div", { "data-pane": "lessons", "data-hidden-mobile": App.todayPane !== "lessons" ? "true" : "false" }, dayColumn(date, info, lessons, events, current)),
      el("div", { "data-pane": "side", "data-hidden-mobile": App.todayPane !== "side" ? "true" : "false" }, todaySide(date, groups))
    ])
  ]);
}

// Lessons in time order with breaks between them; events that replace lessons sit in the timetable,
// other timed events go in their own strip underneath.
function dayColumn(date, info, lessons, events, current) {
  var allDay = events.filter(function (ev) { return ev.allDay; });
  var timed = events.filter(function (ev) { return !ev.allDay; });
  var inTimetable = timed.filter(function (ev) { return ev.replaces; });
  var others = timed.filter(function (ev) { return !ev.replaces; });
  var items = lessons.map(function (l) { return { at: l.start, node: lessonCard(l, current && current.classId === l.classId) }; })
    .concat(inTimetable.map(function (ev) { return { at: ev.start, node: eventCard(ev) }; }))
    .sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
  // Only breaks long enough to matter (recess, lunch) are drawn between lessons.
  var breaks = App.ctx.periods.filter(function (p) { return !p.teaching && L.minutes(p.end) - L.minutes(p.start) >= 15; });
  var timeline = [];
  items.forEach(function (it, i) {
    if (i > 0) {
      var gapBreak = breaks.filter(function (b) { return b.start >= items[i - 1].at && b.start < it.at; })[0];
      if (gapBreak) timeline.push(el("div", { class: "break-line" }, gapBreak.label));
    }
    timeline.push(it.node);
  });

  var out = [];
  if (allDay.length) {
    out.push(el("div", { class: "day-banner" }, allDay.map(function (ev) {
      return el("button", { type: "button", class: "allday", onclick: function () { openEventEditor(ev); } }, [
        el("span", { class: "chip" }, "All day"), el("b", {}, ev.title), ev.replaces ? el("span", { class: "hint" }, "· replaces lessons") : null
      ]);
    })));
  }
  if (!timeline.length) {
    out.push(el("div", { class: "panel" }, el("p", { class: "empty" },
      info.holiday ? "No school today. Enjoy the break." :
        !info.cycleDay ? "No lessons on this day." : "None of your classes are timetabled on this day.")));
  } else {
    out.push(el("div", { class: "timeline" }, timeline));
  }
  if (others.length) {
    out.push(el("div", { class: "section-title" }, "Other events"));
    out.push(el("div", { class: "timeline" }, others.map(eventCard)));
  }
  out.push(el("div", { class: "row", style: "margin-top:14px" }, [
    el("button", { type: "button", class: "btn btn-quiet btn-sm", onclick: function () { openEventEditor(null, { date: date }); } }, "+ Add an event on this day")
  ]));
  return out;
}

function todaySide(date, groups) {
  var today = todayStr();
  var due = groups.overdue.concat(groups.today);
  var homework = L.homeworkDueOn(App.ctx, date);
  var stale = L.notUpdated(App.ctx, App.data.settings.startDate, today, nowMinutes()).filter(function (l) { return l.date < today || date === today; });
  var out = [];
  out.push(panel("To-dos", due.length ? due.length + " due" : "", [
    due.length ? el("ul", { class: "list" }, due.map(todoItem)) : el("p", { class: "empty" }, "Nothing due today."),
    quickAddTodo(today),
    groups.week.length ? el("button", { type: "button", class: "btn btn-quiet btn-sm", style: "margin-top:8px", onclick: function () { go("todos"); } },
      groups.week.length + " more this week →") : null
  ]));
  out.push(panel("Homework due", date === today ? "today" : L.shortDate(date), homework.length ?
    el("ul", { class: "list" }, homework.map(function (h) {
      return el("li", {}, el("button", { type: "button", class: "link-row " + classColour(h.cls), onclick: function () { openLessonEditor(h.entry.date, h.entry.classId); } }, [
        el("span", { class: "dot" }), el("span", {}, [el("span", { class: "link-title" }, h.cls.name + ": " + h.entry.homework), el("div", { class: "hint" }, "Set " + L.shortDate(h.entry.date))])
      ]));
    })) : el("p", { class: "empty" }, "No homework to collect.")));
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
  return out;
}

// ---------- Calendar (week) ----------
function renderWeek() {
  var anchor = App.param && L.isDate(App.param) ? App.param : todayStr();
  var monday = L.mondayOf(anchor);
  var days = L.weekDays(App.ctx, monday);
  var today = todayStr();
  var friday = L.addDays(monday, 4);
  var cycleButtons = [];
  for (var n = 1; n <= App.ctx.school.cycleLength; n++) cycleButtons.push(n);

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

  var jump = App.ctx.school.kind === "cycle" ? el("div", { class: "cycle-jump", style: "margin:-8px 0 18px" }, [
    el("span", { class: "hint", style: "margin-right:6px" }, "Jump to the next")
  ].concat(cycleButtons.map(function (n) {
    return el("button", { type: "button", class: "btn btn-sm", onclick: function () {
      var found = L.findCycleDay(App.ctx, n, today);
      if (found) { go("week", found); toast("The next Day " + n + " is " + L.longDate(found) + "."); }
      else toast("There are no more Day " + n + "s in this school year.", true);
    } }, "Day " + n);
  }))) : null;

  var week = el("div", { class: "week", style: "--cols:" + days.length }, days.map(function (d) { return dayColumnMini(d, today); }));
  return el("div", { class: "page" }, [head, jump, week]);
}

function dayColumnMini(d, today) {
  var info = d.info;
  var items = d.lessons.map(function (l) { return { at: l.start, node: miniLesson(l) }; })
    .concat(d.events.map(function (ev) { return { at: ev.allDay ? "00:00" : ev.start, node: miniEvent(ev) }; }))
    .sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; })
    .map(function (x) { return x.node; });
  return el("section", { class: "day-col" + (info.date === today ? " is-today" : "") + (info.holiday ? " is-holiday" : ""), "aria-label": L.longDate(info.date) }, [
    el("button", { type: "button", class: "day-head", onclick: function () { go("today", info.date); } }, [
      el("div", { class: "day-date" }, [L.shortDate(info.date), info.cycleDay ? el("small", {}, L.cycleName(App.ctx.school, info.cycleDay)) : null]),
      info.labels.length ? el("div", { class: "day-labels" }, labelChips(info)) : null
    ]),
    el("div", { class: "day-body" }, items.length ? items : [el("p", { class: "empty", style: "font-size:13px" }, info.holiday ? "Holiday" : "Nothing on")]),
    d.todoCount ? el("button", { type: "button", class: "day-foot btn-quiet", style: "border:0;border-top:1px solid var(--line);text-align:left;cursor:pointer;background:none",
      onclick: function () { go("todos"); } }, d.todoCount + (d.todoCount === 1 ? " to-do due" : " to-dos due")) : null
  ]);
}

function miniLesson(l) {
  var status = lessonStatusNow(l);
  var e = l.entry || {};
  return el("button", { type: "button", class: "mini " + classColour(l.cls) + (l.replacedBy ? " is-replaced" : ""),
    onclick: function () { openLessonEditor(l.date, l.classId); }, "aria-label": l.cls.name + " " + l.periodText + ", " + STATUS_TEXT[status] }, [
    el("span", { class: "mini-top" }, [el("span", {}, l.start + " · " + l.periodText), el("span", { class: "state-dot state-" + status, title: STATUS_TEXT[status] })]),
    el("span", { class: "mini-name" }, l.cls.name),
    l.replacedBy ? el("span", { class: "mini-plan" }, l.replacedBy.title) : e.plan ? el("span", { class: "mini-plan" }, e.plan) : null
  ]);
}

function miniEvent(ev) {
  return el("button", { type: "button", class: "mini event" + (ev.replaces ? " replaces" : ""), onclick: function () { openEventEditor(ev); } }, [
    el("span", { class: "mini-top" }, ev.allDay ? "All day" : ev.start + (ev.end ? "–" + ev.end : "")),
    el("span", { class: "mini-name" }, ev.title)
  ]);
}

// ---------- Classes ----------
function renderClasses() {
  var classes = App.ctx.classes;
  if (!classes.length) return el("div", { class: "page" }, el("p", { class: "empty" }, "Add your classes in Settings first."));
  var cls = App.ctx.classById[App.param] || classes[0];
  var query = App.classSearch.trim().toLowerCase();
  var today = todayStr();
  var entries = App.data.log.filter(function (e) { return e.classId === cls.id; })
    .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  var matches = query ? entries.filter(function (e) {
    return [e.plan, e.remind, e.homework, e.notes].join("\n").toLowerCase().indexOf(query) >= 0;
  }) : entries;
  var upcoming = query ? [] : upcomingLessons(cls.id, today, 4);
  var past = matches.filter(function (e) { return query || e.date <= today; });

  var search = el("input", { class: "input", type: "search", placeholder: "Search " + cls.name + "…", value: App.classSearch,
    "aria-label": "Search this class's logbook", oninput: function (e) {
      App.classSearch = e.target.value;
      var pos = e.target.selectionStart;
      render();
      var again = document.querySelector(".search .input");
      if (again) { again.focus(); again.setSelectionRange(pos, pos); }
    } });

  return el("div", { class: "page" }, [
    el("header", { class: "page-head" }, [
      el("div", {}, [el("div", { class: "eyebrow" }, "Classes"), el("h1", {}, cls.name),
        el("div", { class: "sub" }, entries.length + (entries.length === 1 ? " entry" : " entries") + " in the logbook")]),
      el("div", { class: "head-tools search" }, [icon("search"), search])
    ]),
    el("div", { class: "class-tabs", role: "tablist", "aria-label": "Class" }, classes.map(function (c) {
      return el("button", { type: "button", role: "tab", class: "class-tab " + classColour(c), "aria-selected": c.id === cls.id ? "true" : "false",
        onclick: function () { App.classSearch = ""; go("classes", c.id); } }, [el("span", { class: "dot" }), c.name]);
    })),
    upcoming.length ? el("div", { class: "section-title" }, "Coming up") : null,
    upcoming.length ? el("div", { class: "record" }, upcoming.map(function (l) { return recordItem(l.entry || { date: l.date, classId: cls.id }, l); })) : null,
    el("div", { class: "section-title" }, query ? matches.length + (matches.length === 1 ? " match" : " matches") : "Record"),
    past.length ? el("div", { class: "record" }, past.map(function (e) { return recordItem(e, null, query); }))
      : el("p", { class: "empty" }, query ? "Nothing matches “" + App.classSearch + "”." : "No entries yet.")
  ]);
}

function upcomingLessons(classId, today, count) {
  var from = today;
  var found = L.lessonsOn(App.ctx, today).filter(function (l) { return l.classId === classId && !l.replacedBy && L.minutes(l.end) > nowMinutes(); });
  while (found.length < count) {
    var next = L.nextLesson(App.ctx, classId, from);
    if (!next) break;
    found.push(next);
    from = next.date;
  }
  return found.slice(0, count);
}

function highlight(text, query) {
  if (!query) return [text];
  var lower = text.toLowerCase();
  var parts = [];
  var i = 0, at;
  while ((at = lower.indexOf(query, i)) >= 0) {
    parts.push(text.slice(i, at), el("mark", {}, text.slice(at, at + query.length)));
    i = at + query.length;
  }
  parts.push(text.slice(i));
  return parts;
}

function recordItem(e, lesson, query) {
  var info = L.dayInfo(App.ctx.school, e.date);
  var l = lesson || L.lessonsOn(App.ctx, e.date).filter(function (x) { return x.classId === e.classId; })[0];
  var fields = [["Plan / covered", e.plan], ["Remind", e.remind], ["Homework", e.homework ? e.homework + (e.homeworkDue ? " · due " + L.shortDate(e.homeworkDue) : "") : ""], ["Notes", e.notes]]
    .filter(function (f) { return f[1]; });
  var status = l ? lessonStatusNow(l) : (e.done ? "done" : "planned");
  return el("button", { type: "button", class: "record-item", onclick: function () { openLessonEditor(e.date, e.classId); } }, [
    el("div", { class: "record-date" }, [
      el("b", {}, L.shortDate(e.date)),
      el("span", {}, [info.cycleDay ? L.cycleName(App.ctx.school, info.cycleDay) : "", l ? " · " + l.periodText : ""].join("")),
      el("span", { style: "margin-top:6px" }, statusPill(status))
    ]),
    el("div", { class: "record-fields" }, fields.length ? fields.map(function (f) {
      return el("div", { class: "f" }, [el("b", {}, f[0]), el("span", {}, highlight(f[1], query))]);
    }) : el("span", { class: "hint" }, "Nothing written yet. Tap to plan this lesson."))
  ]);
}

// ---------- To-dos ----------
function renderTodos() {
  var today = todayStr();
  var g = L.groupTodos(App.ctx, today);
  var done = App.data.todos.filter(function (t) { return t.done; }).sort(function (a, b) { return a.doneAt < b.doneAt ? 1 : -1; });
  var homework = [];
  for (var i = 0; i <= 14; i++) {
    var d = L.addDays(today, i);
    homework = homework.concat(L.homeworkDueOn(App.ctx, d));
  }
  function group(title, list) {
    return list.length ? [el("div", { class: "section-title" }, title + " · " + list.length), el("div", { class: "panel" }, el("ul", { class: "list" }, list.map(todoItem)))] : [];
  }
  var open = g.overdue.length + g.today.length + g.week.length + g.later.length + g.someday.length;
  return el("div", { class: "page", style: "max-width:760px" }, [
    el("header", { class: "page-head" }, [
      el("div", {}, [el("div", { class: "eyebrow" }, "To-dos"), el("h1", {}, open ? open + " to do" : "All clear")]),
      el("div", { class: "head-tools" }, el("button", { type: "button", class: "btn btn-ink", onclick: function () { openTodoEditor(null, {}); } }, "New to-do"))
    ]),
    el("div", { class: "panel" }, [el("div", { class: "label", style: "margin-bottom:-4px" }, "Quick add (no due date)"), quickAddTodo("")])
  ].concat(group("Overdue", g.overdue), group("Today", g.today), group("Next 7 days", g.week), group("Later", g.later), group("No due date", g.someday), [
    el("div", { class: "section-title" }, "Homework to collect · next 2 weeks"),
    el("div", { class: "panel" }, homework.length ? el("ul", { class: "list" }, homework.map(function (h) {
      return el("li", {}, el("button", { type: "button", class: "link-row " + classColour(h.cls), onclick: function () { openLessonEditor(h.entry.date, h.entry.classId); } }, [
        el("span", { class: "dot" }), el("span", { class: "link-title" }, h.cls.name + ": " + h.entry.homework),
        el("span", { class: "hint", style: "margin-left:auto;white-space:nowrap" }, "due " + L.shortDate(h.entry.homeworkDue))
      ]));
    })) : el("p", { class: "empty" }, "No homework due in the next two weeks.")),
    done.length ? el("details", { style: "margin-top:24px" }, [
      el("summary", { class: "section-title", style: "cursor:pointer;margin:0 0 10px" }, "Done · " + done.length),
      el("div", { class: "panel" }, [el("ul", { class: "list" }, done.slice(0, 50).map(todoItem)),
        el("button", { type: "button", class: "btn btn-sm", style: "margin-top:10px", onclick: function (e) {
          busy(e.currentTarget, api("clearDoneTodos")).then(function (res) {
            setData(Object.assign({}, App.data, { todos: res.todos }));
            toast("Finished to-dos cleared.");
          }, fail);
        } }, "Clear finished to-dos")])
    ]) : null
  ]));
}
