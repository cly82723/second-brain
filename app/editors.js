/* Side panels for a lesson's logbook entry, an event, and a to-do. */

function field(label, control, hint) {
  var id = "f-" + Math.random().toString(36).slice(2, 9);
  control.id = id;
  return el("div", { class: "field" }, [el("label", { for: id }, [label, hint ? el("span", { class: "hint" }, " " + hint) : null]), control]);
}

function textArea(value, rows, max) {
  return el("textarea", { class: "textarea", rows: String(rows || 3), maxlength: String(max || 4000) }, value || "");
}

function textInput(value, attrs) {
  return el("input", Object.assign({ class: "input", type: "text", value: value || "" }, attrs || {}));
}

// Asks before throwing away typing when the panel is closed.
function guardDirty(isDirty) {
  App.guardClose = function () { return !isDirty() || window.confirm("Close without saving your changes?"); };
}

function saveShortcut(drawer, save) {
  drawer.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); save(); }
  });
}

// ---------- lesson ----------
function openLessonEditor(date, classId) {
  var cls = App.ctx.classById[classId];
  if (!cls) { toast("That class isn't in your list any more.", true); return; }
  var lesson = L.lessonsOn(App.ctx, date).filter(function (l) { return l.classId === classId; })[0] || null;
  var e = L.entryFor(App.ctx, date, classId) || {};
  var prev = L.previousLesson(App.ctx, classId, date);
  var next = L.nextLesson(App.ctx, classId, date);
  var info = L.dayInfo(App.ctx.school, date);
  var key = date + "|" + classId;

  var plan = textArea(e.plan, 4);
  plan.setAttribute("data-autofocus", "");
  var remind = textArea(e.remind, 2);
  var homework = textInput(e.homework, { maxlength: "4000", placeholder: "e.g. GB p. 48, 51" });
  var due = el("input", { class: "input", type: "date", value: e.homeworkDue || "", style: "max-width:180px" });
  var notes = textArea(e.notes, 2);
  var doneBox = el("input", { type: "checkbox", checked: !!e.done });
  var doneRow = el("label", { class: "done-toggle" + (e.done ? " is-on" : "") }, [doneBox, el("span", {}, [el("b", {}, "Lesson done"), el("div", { class: "hint" }, "Tick once you've taught it and noted what you covered.")])]);
  doneBox.addEventListener("change", function () { doneRow.classList.toggle("is-on", doneBox.checked); });

  function collect() {
    return { date: date, classId: classId, plan: plan.value, remind: remind.value, homework: homework.value, homeworkDue: due.value, notes: notes.value, done: doneBox.checked };
  }
  var initial = JSON.stringify(collect());
  guardDirty(function () { return JSON.stringify(collect()) !== initial; });

  var saveBtn = el("button", { type: "button", class: "btn btn-ink" }, "Save");
  function save() {
    busy(saveBtn, api("saveLog", collect())).then(function (res) {
      App.guardClose = null;
      closeLayer();
      applyLog(res.entry, key);
      toast(res.entry && res.entry.done ? "Saved and ticked off." : "Saved.");
    }, fail);
  }
  saveBtn.addEventListener("click", save);

  var carryBox = carryForwardBox(collect, next, key);
  var dueRow = el("div", { class: "row" }, [due, next ? el("button", { type: "button", class: "btn btn-sm", onclick: function () { due.value = next.date; } }, "Next lesson (" + L.shortDate(next.date) + ")") : null]);

  var body = [
    lesson && lesson.replacedBy ? el("div", { class: "notice notice-stripe" }, "This lesson is replaced by “" + lesson.replacedBy.title + "”. You can still keep notes here.") : null,
    !lesson ? el("div", { class: "notice notice-warn" }, cls.name + " isn't on your timetable that day. This entry is kept in the class's record.") : null,
    prev ? previousSummary(prev) : null,
    field("Plan / what we covered", plan),
    field("Remind students", remind, "· in this lesson"),
    field("Homework to give", homework),
    field("Homework due", dueRow),
    field("Notes", notes, "· absences, how it went"),
    doneRow,
    carryBox.node
  ];
  var footer = [
    saveBtn,
    el("button", { type: "button", class: "btn", onclick: function () { closeLayer(); } }, "Cancel"),
    el("span", { class: "spacer" }),
    next ? el("button", { type: "button", class: "btn btn-quiet", onclick: carryBox.toggle }, "Didn't finish…") : null
  ];
  var subtitle = [
    el("span", { class: "chip class-chip " + classColour(cls) }, L.shortDate(date)),
    info.cycleDay ? el("span", {}, L.cycleName(App.ctx.school, info.cycleDay)) : null,
    lesson ? el("span", {}, lesson.periodText + " · " + lesson.start + "–" + lesson.end + " · " + lesson.lengthText) : null
  ];
  var drawer = openDrawer(cls.name, subtitle, body, footer, classColour(cls));
  saveShortcut(drawer, save);
}

function previousSummary(prev) {
  var pe = prev.entry || {};
  var lines = [pe.plan, pe.homework ? "Homework: " + pe.homework : "", pe.remind ? "Reminded: " + pe.remind : ""].filter(Boolean).join("\n");
  return el("details", { class: "prev-lesson", open: lines ? true : null }, [
    el("summary", {}, "Last lesson · " + L.shortDate(prev.date)),
    el("p", {}, lines || "Nothing was written for that lesson.")
  ]);
}

// "Didn't finish": what's left moves to the top of the class's next lesson, and this one is ticked.
function carryForwardBox(collect, next, key) {
  var leftover = textArea("", 2);
  var moveBtn = el("button", { type: "button", class: "btn btn-ink btn-sm" }, next ? "Move to " + L.shortDate(next.date) : "Move");
  var node = el("div", { class: "carry", hidden: true }, [
    field("What's left to do?", leftover, "· goes to the top of the next lesson's plan"),
    moveBtn
  ]);
  moveBtn.addEventListener("click", function () {
    if (!leftover.value.trim()) { leftover.focus(); toast("Type what's left first.", true); return; }
    busy(moveBtn, api("carryForward", { entry: collect(), leftover: leftover.value })).then(function (res) {
      App.guardClose = null;
      closeLayer();
      var log = App.data.log.filter(function (x) {
        return logKey(x) !== key && (!res.next || logKey(x) !== logKey(res.next));
      }).concat([res.current, res.next].filter(Boolean));
      setData(Object.assign({}, App.data, { log: log }));
      toast("Moved to " + L.shortDate(res.next.date) + ".");
    }, fail);
  });
  return { node: node, toggle: function () { node.hidden = !node.hidden; if (!node.hidden) leftover.focus(); } };
}

// ---------- event ----------
function openEventEditor(ev, defaults) {
  var isNew = !ev || !ev.id;
  var base = isNew ? Object.assign({ title: "", date: todayStr(), start: "", end: "", repeat: "none", repeatOn: "", until: "", replaces: false, notes: "" }, defaults || {}) : ev;
  var title = textInput(base.title, { maxlength: "200", placeholder: "e.g. Choir rehearsal, Detention, Duty", "data-autofocus": "" });
  var date = el("input", { class: "input", type: "date", value: base.date, style: "max-width:200px" });
  var allDay = el("input", { type: "checkbox", checked: !base.start });
  var start = el("input", { class: "input", type: "time", value: base.start || "", style: "max-width:140px", "aria-label": "Start time" });
  var end = el("input", { class: "input", type: "time", value: base.end || "", style: "max-width:140px", "aria-label": "End time" });
  var replaces = el("input", { type: "checkbox", checked: !!base.replaces });
  var repeat = el("select", { class: "select", style: "max-width:320px" });
  var until = el("input", { class: "input", type: "date", value: base.until || "", style: "max-width:200px" });
  var notes = textArea(base.notes, 2);
  var picks = periodPicks(start, end);
  var timeRow = el("div", {}, [el("div", { class: "row" }, [start, el("span", {}, "to"), end]), el("div", { class: "hint", style: "margin:10px 0 6px" }, "Or tap the periods it covers:"), picks.node]);
  var untilField = field("Repeat until", until, "· leave empty to repeat all year");

  function fillRepeat() {
    var info = date.value && L.isDate(date.value) ? L.dayInfo(App.ctx.school, date.value) : null;
    var current = repeat.value || base.repeat;
    var options = [["none", "Doesn't repeat"]];
    if (info) options.push(["weekly", "Every week on " + L.longDate(date.value).split(" ")[0]]);
    if (info && info.cycleDay && App.ctx.school.kind === "cycle") options.push(["cycle", "Every " + L.cycleName(App.ctx.school, info.cycleDay) + " of the cycle"]);
    repeat.replaceChildren.apply(repeat, options.map(function (o) { return el("option", { value: o[0] }, o[1]); }));
    repeat.value = options.some(function (o) { return o[0] === current; }) ? current : "none";
    untilField.hidden = repeat.value === "none";
  }
  function syncTime() { timeRow.hidden = allDay.checked; }
  allDay.addEventListener("change", syncTime);
  date.addEventListener("change", fillRepeat);
  repeat.addEventListener("change", function () { untilField.hidden = repeat.value === "none"; });
  fillRepeat();
  syncTime();

  function collect() {
    var info = L.isDate(date.value) ? L.dayInfo(App.ctx.school, date.value) : {};
    return {
      id: isNew ? "" : base.id, title: title.value, date: date.value,
      start: allDay.checked ? "" : start.value, end: allDay.checked ? "" : end.value,
      repeat: repeat.value, repeatOn: repeat.value === "cycle" ? info.cycleDay : "", until: repeat.value === "none" ? "" : until.value,
      replaces: replaces.checked, notes: notes.value
    };
  }
  var initial = JSON.stringify(collect());
  guardDirty(function () { return JSON.stringify(collect()) !== initial; });

  var saveBtn = el("button", { type: "button", class: "btn btn-ink" }, isNew ? "Add event" : "Save");
  function save() {
    busy(saveBtn, api("saveEvent", collect())).then(function (res) {
      App.guardClose = null;
      closeLayer();
      setData(withList("events", res.event, idOf));
      toast(isNew ? "Event added." : "Event saved.");
    }, fail);
  }
  saveBtn.addEventListener("click", save);

  var body = [
    !isNew && base.repeat !== "none" ? el("div", { class: "notice notice-stripe" }, "This event repeats. Changes apply to every repeat.") : null,
    field("What", title),
    field("Date", date, base.on && base.on !== base.date ? "· first date of the series" : ""),
    el("label", { class: "check", style: "margin-bottom:12px" }, [allDay, "All day"]),
    el("div", { class: "field" }, [el("span", { class: "label" }, "Time"), timeRow]),
    el("label", { class: "check", style: "margin-bottom:4px" }, [replaces, "Replaces my lessons at this time"]),
    el("div", { class: "hint", style: "margin:0 0 16px 26px" }, "Those lessons show as replaced and won't count as not updated."),
    field("Repeat", repeat),
    untilField,
    field("Notes", notes)
  ];
  var footer = [
    saveBtn,
    el("button", { type: "button", class: "btn", onclick: function () { closeLayer(); } }, "Cancel"),
    el("span", { class: "spacer" }),
    isNew ? null : el("button", { type: "button", class: "btn btn-danger", onclick: function (e) {
      var question = base.repeat !== "none" ? "Delete this event and all its repeats?" : "Delete this event?";
      if (!window.confirm(question)) return;
      busy(e.currentTarget, api("deleteEvent", base.id)).then(function () {
        App.guardClose = null;
        closeLayer();
        setData(withList("events", base, idOf, true));
        toast("Event deleted.");
      }, fail);
    } }, "Delete")
  ];
  var drawer = openDrawer(isNew ? "New event" : "Edit event", isNew ? "Duty, detention, rehearsals, meetings…" : null, body, footer);
  saveShortcut(drawer, save);
}

// Tap one period to fill its times; tap another to stretch to it.
function periodPicks(start, end) {
  var teaching = App.ctx.periods.filter(function (p) { return p.teaching; });
  var anchor = null;
  var buttons = teaching.map(function (p, i) {
    return el("button", { type: "button", class: "btn btn-sm", "aria-pressed": "false", onclick: function () {
      if (anchor === null || anchor === i) { anchor = i; start.value = p.start; end.value = p.end; }
      else {
        var a = Math.min(anchor, i), b = Math.max(anchor, i);
        start.value = teaching[a].start; end.value = teaching[b].end; anchor = null;
      }
      mark();
    } }, p.label);
  });
  function mark() {
    teaching.forEach(function (p, i) {
      var on = start.value && end.value && p.start >= start.value && p.end <= end.value;
      buttons[i].setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  start.addEventListener("input", mark);
  end.addEventListener("input", mark);
  mark();
  return { node: el("div", { class: "period-picks" }, buttons) };
}

// ---------- to-do ----------
function openTodoEditor(todo, defaults) {
  var isNew = !todo || !todo.id;
  var base = isNew ? Object.assign({ title: "", due: "", time: "", classId: "", notes: "", done: false }, defaults || {}) : todo;
  var title = textInput(base.title, { maxlength: "200", placeholder: "e.g. Mark 3D essays", "data-autofocus": "" });
  var due = el("input", { class: "input", type: "date", value: base.due || "", style: "max-width:200px" });
  var time = el("input", { class: "input", type: "time", value: base.time || "", style: "max-width:140px", "aria-label": "Time (optional)" });
  var cls = el("select", { class: "select", style: "max-width:260px" }, [el("option", { value: "" }, "No class")].concat(App.ctx.classes.map(function (c) {
    return el("option", { value: c.id }, c.name);
  })));
  cls.value = base.classId || "";
  var notes = textArea(base.notes, 3);
  var done = el("input", { type: "checkbox", checked: !!base.done });

  function collect() {
    return { id: isNew ? "" : base.id, title: title.value, due: due.value, time: due.value ? time.value : "", classId: cls.value, notes: notes.value, done: done.checked, doneAt: base.doneAt || "" };
  }
  var initial = JSON.stringify(collect());
  guardDirty(function () { return JSON.stringify(collect()) !== initial; });

  var saveBtn = el("button", { type: "button", class: "btn btn-ink" }, isNew ? "Add to-do" : "Save");
  function save() {
    busy(saveBtn, api("saveTodo", collect())).then(function (res) {
      App.guardClose = null;
      closeLayer();
      setData(withList("todos", res.todo, idOf));
      toast(isNew ? "To-do added." : "To-do saved.");
    }, fail);
  }
  saveBtn.addEventListener("click", save);
  var today = todayStr();
  var quick = el("div", { class: "row", style: "margin-top:8px" }, [["Today", today], ["Tomorrow", L.addDays(today, 1)], ["In a week", L.addDays(today, 7)]].map(function (q) {
    return el("button", { type: "button", class: "btn btn-sm", onclick: function () { due.value = q[1]; } }, q[0]);
  }));

  var body = [
    field("To-do", title),
    el("div", { class: "field" }, [el("span", { class: "label" }, "Due"), el("div", { class: "row" }, [due, time]), quick]),
    field("Class", cls, "· optional"),
    field("Notes", notes),
    isNew ? null : el("label", { class: "check" }, [done, "Done"])
  ];
  var footer = [
    saveBtn,
    el("button", { type: "button", class: "btn", onclick: function () { closeLayer(); } }, "Cancel"),
    el("span", { class: "spacer" }),
    isNew ? null : el("button", { type: "button", class: "btn btn-danger", onclick: function (e) {
      if (!window.confirm("Delete this to-do?")) return;
      busy(e.currentTarget, api("deleteTodo", base.id)).then(function () {
        App.guardClose = null;
        closeLayer();
        setData(withList("todos", base, idOf, true));
        toast("To-do deleted.");
      }, fail);
    } }, "Delete")
  ];
  var drawer = openDrawer(isNew ? "New to-do" : "Edit to-do", null, body, footer);
  saveShortcut(drawer, save);
}
