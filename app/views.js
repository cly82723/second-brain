/* Pieces shared by every page (lesson cards, to-dos, marking rows), and the Classes page.
   today.js draws Today, calendar.js the Calendar, tasks.js the Tasks page and the undated prompt. */

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

// The lines that carry over into a lesson: follow-ups, homework to collect, students to chase.
function carryLines(lesson) {
  var lines = [];
  (lesson.followUps || []).forEach(function (f) {
    lines.push(el("div", { class: "tagline tag-follow" }, [el("b", {}, "Follow up"), el("span", {}, f.followUp)]));
  });
  (lesson.collect || []).forEach(function (h) {
    lines.push(el("div", { class: "tagline tag-collect" }, [el("b", {}, "Collect"), el("span", {}, h.homework)]));
  });
  (lesson.chase || []).forEach(function (c) {
    lines.push(el("div", { class: "tagline tag-chase" }, [el("b", {}, "Chase"), el("span", {}, c.mark.title + ": " + c.names.join(", "))]));
  });
  return lines;
}

function lessonCard(lesson, isNow) {
  var e = lesson.entry || {};
  var status = lessonStatusNow(lesson);
  var body = carryLines(lesson);
  if (lesson.replacedBy) body.unshift(el("div", { class: "replaced-by" }, "Replaced by " + lesson.replacedBy.title));
  if (e.plan) body.push(el("div", { class: "plan" }, e.plan));
  if (e.covered) body.push(el("div", { class: "tagline" }, [el("b", {}, "Covered"), el("span", {}, e.covered)]));
  if (e.remind) body.push(el("div", { class: "tagline" }, [el("b", {}, "Remind"), el("span", {}, e.remind)]));
  if (e.homework) body.push(el("div", { class: "tagline" }, [el("b", {}, "HW"), el("span", {}, e.homework + (e.homeworkDue ? " · due " + L.shortDate(e.homeworkDue) : ""))]));
  return el("button", {
    type: "button", class: "lesson " + classColour(lesson.cls) + (isNow ? " is-now" : "") + (lesson.replacedBy ? " is-replaced" : ""),
    onclick: function () { openLessonEditor(lesson.date, lesson.classId); },
    "aria-label": lesson.cls.name + ", " + lesson.periodText + ", " + STATUS_TEXT[status]
  }, [
    el("div", { class: "lesson-time" }, [el("b", {}, lesson.start), lesson.end]),
    el("div", { class: "lesson-name" }, [lesson.cls.name, el("span", { class: "lesson-len" }, lesson.periodText + " · " + lesson.lengthText)]),
    el("div", { class: "lesson-side" }, [isNow ? el("span", { class: "chip chip-cycle" }, "Now") : null, status === "empty" ? null : statusPill(status)]),
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

function dueText(due, today, time) {
  if (!due) return null;
  var text = due === today ? "Today" : due === L.addDays(today, 1) ? "Tomorrow" : L.shortDate(due);
  return el("span", { class: due < today ? "due-overdue" : "" }, (due < today ? "Overdue · " : "") + text + (time ? " " + time : ""));
}

function categoryChip(id) {
  var c = id && App.ctx.categoryById[id];
  return c ? el("span", { class: "chip class-chip c-" + c.colour }, c.name) : null;
}

function todoItem(t) {
  var today = todayStr();
  var cls = t.classId ? App.ctx.classById[t.classId] : null;
  return el("li", { class: "todo" + (t.done ? " is-done" : "") }, [
    el("input", { type: "checkbox", checked: t.done, "aria-label": "Done: " + t.title, onchange: function (e) { toggleTodo(t, e.target.checked, e.target.parentNode); } }),
    el("button", { type: "button", class: "todo-main", onclick: function () { openTodoEditor(t); } }, [
      el("div", { class: "todo-title" }, t.title),
      el("div", { class: "todo-meta" }, [dueText(t.due, today, t.time) || el("span", { class: "hint" }, "No date"), categoryChip(t.category),
        cls ? el("span", { class: "chip class-chip " + classColour(cls) }, cls.name) : null])
    ])
  ]);
}

// Ticking off keeps the row on screen, struck through, for a moment before the list redraws,
// so the result of the tap is seen rather than the row simply vanishing.
var TICK_LINGER_MS = 420;
function toggleTodo(t, done, row) {
  var next = Object.assign({}, t, { done: done, doneAt: done ? todayStr() : "" });
  var linger = row && done && !Motion.reduced;
  // Every redraw (ours and the save's reply) waits until the row has been seen leaving.
  var settled = new Promise(function (resolve) { setTimeout(resolve, linger ? TICK_LINGER_MS : 0); });
  if (linger) row.classList.add("is-done", "is-leaving");
  settled.then(function () { setData(withList("todos", next, idOf)); });
  Promise.all([api("saveTodo", next), settled]).then(function (out) {
    setData(withList("todos", out[0].todo, idOf));
    if (done) toast("Ticked off: " + t.title);
  }, function (e) { setData(withList("todos", t, idOf)); fail(e); });
}

function categorySelect(value, label, emptyText) {
  var select = el("select", { class: "select", "aria-label": label || "Category" },
    [el("option", { value: "" }, emptyText || "No category")].concat(App.ctx.categories.map(function (c) { return el("option", { value: c.id }, c.name); })));
  select.value = value || "";
  return select;
}

// Title, category and due date; the category and date can both be left empty.
function quickAddTodo(defaultDue) {
  var input = el("input", { class: "input", placeholder: "Add a to-do…", "aria-label": "New to-do", maxlength: "200" });
  var category = categorySelect("", "Category (optional)", "Category…");
  var due = el("input", { class: "input", type: "date", value: defaultDue || "", "aria-label": "Due date (optional)" });
  var button = el("button", { type: "submit", class: "btn btn-sm btn-ink" }, "Add");
  return el("form", { class: "quick-add", onsubmit: function (e) {
    e.preventDefault();
    var title = input.value.trim();
    if (!title) { input.focus(); return; }
    busy(button, api("saveTodo", { title: title, due: due.value, category: category.value })).then(function (res) {
      setData(withList("todos", res.todo, idOf));
      toast(res.todo.due ? "Added." : "Added with no date. You can give it one any time.");
      var again = document.querySelector(".quick-add .input");
      if (again) again.focus();
    }, fail);
  } }, [input, el("div", { class: "quick-add-row" }, [category, due, button])]);
}

function progressBar(p) {
  var pct = p.total ? Math.round(100 * p.marked / p.total) : 0;
  return el("span", { class: "progress-bar", role: "img", "aria-label": p.marked + " of " + p.total + " marked" }, el("span", { style: "--p:" + (pct / 100) }));
}

function markRow(m) {
  var today = todayStr();
  var cls = m.classId ? App.ctx.classById[m.classId] : null;
  var p = L.markProgress(m);
  return el("li", {}, el("button", { type: "button", class: "mark-row" + (m.done ? " is-done" : ""), onclick: function () { openMarkEditor(m); } }, [
    el("div", { class: "mark-main" }, [
      el("div", { class: "todo-title" }, m.title),
      el("div", { class: "todo-meta" }, [
        m.due ? dueText(m.due, today) : el("span", { class: "hint" }, "No return date"),
        cls ? el("span", { class: "chip class-chip " + classColour(cls) }, cls.name) : null,
        p.missing.length ? el("span", { class: "due-overdue" }, p.missing.length + " missing") : null,
        m.sheetCol ? el("span", { class: "hint" }, "In scoresheet col " + m.sheetCol) : null
      ])
    ]),
    el("div", { class: "mark-side" }, p.total ? [el("span", { class: "hint" }, p.marked + "/" + p.total), progressBar(p)] : null)
  ]));
}

function panel(title, hint, children) {
  return el("section", { class: "panel" }, [
    el("div", { class: "panel-head" }, [el("h2", {}, title), hint ? el("span", { class: "hint" }, hint) : null]),
    children
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
    return [e.plan, e.covered, e.followUp, e.remind, e.homework, e.notes].join("\n").toLowerCase().indexOf(query) >= 0;
  }) : entries;
  var upcoming = query ? [] : upcomingLessons(cls.id, today, 4);
  var past = matches.filter(function (e) { return query || e.date <= today; });
  var openFollowUps = App.ctx.followUpsByClass[cls.id] || [];

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
      el("div", {}, [el("h1", {}, cls.name),
        el("div", { class: "sub" }, [entries.length + (entries.length === 1 ? " entry" : " entries") + " in the logbook",
          openFollowUps.length ? el("span", { class: "chip chip-follow" }, openFollowUps.length + " to follow up") : null])]),
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

// Plan and Covered side by side, the follow-up in its own highlighted box, the rest as small rows.
function recordItem(e, lesson, query) {
  var info = L.dayInfo(App.ctx.school, e.date);
  var l = lesson || L.lessonsOn(App.ctx, e.date).filter(function (x) { return x.classId === e.classId; })[0];
  var status = l ? lessonStatusNow(l) : (e.done ? "done" : "planned");
  function block(label, text, extra) {
    return el("div", { class: "rec-block" + (text ? "" : " is-empty") + (extra ? " " + extra : "") }, [
      el("b", {}, label), el("span", {}, text ? highlight(text, query) : "—")
    ]);
  }
  var small = [["Remind", e.remind], ["Homework", e.homework ? e.homework + (e.homeworkDue ? " · due " + L.shortDate(e.homeworkDue) : " · no due date") : ""], ["Notes", e.notes]]
    .filter(function (f) { return f[1]; });
  var carried = l ? carryLines(l) : [];
  var empty = !L.hasWriting(e) && !carried.length;
  return el("button", { type: "button", class: "record-item", onclick: function () { openLessonEditor(e.date, e.classId); } }, [
    el("div", { class: "record-date" }, [
      el("b", {}, L.shortDate(e.date)),
      el("span", {}, [info.cycleDay ? L.cycleName(App.ctx.school, info.cycleDay) : "", l ? " · " + l.periodText : ""].join("")),
      el("span", { style: "margin-top:6px" }, statusPill(status))
    ]),
    empty ? el("div", { class: "record-fields" }, el("span", { class: "hint" }, "Nothing written yet. Open it to plan this lesson.")) :
      el("div", { class: "record-fields" }, [
        carried.length ? el("div", { class: "lesson-body" }, carried) : null,
        el("div", { class: "rec-pair" }, [block("Plan", e.plan), block("Covered", e.covered)]),
        e.followUp ? block(e.followUpDone ? "Followed up ✓" : "Follow up next lesson", e.followUp, "rec-follow" + (e.followUpDone ? " is-done" : "")) : null,
        small.map(function (f) { return el("div", { class: "f" }, [el("b", {}, f[0]), el("span", {}, highlight(f[1], query))]); })
      ])
  ]);
}
