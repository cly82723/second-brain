/* Settings, which is also the first-time setup: school, classes, timetable, period times,
   then (once set up) the evening email, Excel export, import, and a link to the data sheet. */

function setupFromData() {
  var slots = {};
  App.data.timetable.forEach(function (t) { slots[t.day + "|" + t.period] = t.classId; });
  return {
    schoolId: App.data.settings.schoolId,
    periods: App.data.periods.map(function (p) { return Object.assign({}, p); }),
    classes: App.data.classes.length ? App.data.classes.map(function (c) { return Object.assign({}, c); }) : [newClass(0)],
    slots: slots
  };
}

function newClass(index) {
  var colours = App.data.colours;
  return { id: "c-" + Math.random().toString(36).slice(2, 10), name: "", colour: colours[index % colours.length] };
}

function draft() {
  if (!App.setupDraft) App.setupDraft = setupFromData();
  return App.setupDraft;
}

function updateDraft(patch, rerender) {
  App.setupDraft = Object.assign({}, draft(), patch);
  if (rerender) render(); else refreshSaveBar();
}

function draftPayload(d) {
  var spec = App.data.schools.filter(function (s) { return s.id === d.schoolId; })[0];
  var cycleLength = spec ? spec.cycleLength : 5;
  var classIds = {};
  var classes = d.classes.filter(function (c) { return c.name.trim(); });
  classes.forEach(function (c) { classIds[c.id] = true; });
  var periodIds = {};
  d.periods.forEach(function (p) { if (p.teaching) periodIds[p.id] = true; });
  var timetable = Object.keys(d.slots).filter(function (k) {
    var parts = k.split("|");
    return d.slots[k] && classIds[d.slots[k]] && Number(parts[0]) <= cycleLength && periodIds[parts[1]];
  }).map(function (k) { var parts = k.split("|"); return { day: Number(parts[0]), period: parts[1], classId: d.slots[k] }; });
  return { schoolId: d.schoolId, periods: d.periods, classes: classes, timetable: timetable };
}

function draftIsDirty() {
  if (!App.setupDraft) return false;
  return JSON.stringify(draftPayload(App.setupDraft)) !== JSON.stringify(draftPayload(setupFromData()));
}

function refreshSaveBar() {
  var bar = document.getElementById("save-bar");
  if (bar) bar.hidden = App.data.settings.setupDone && !draftIsDirty();
}

function saveSetupDraft(button) {
  var payload = draftPayload(draft());
  if (!payload.classes.length) { toast("Add at least one class first.", true); return; }
  var first = !App.data.settings.setupDone;
  busy(button, api("saveSetup", payload)).then(function (data) {
    App.setupDraft = null;
    setData(data);
    if (first) { toast("All set. Here's your day."); go("today"); }
    else toast("Timetable saved.");
  }, fail);
}

// ---------- page ----------
function renderSettings() {
  var setup = !App.data.settings.setupDone;
  var d = draft();
  var parts = [];
  var progress = setupProgress(d);
  if (setup) parts.push(setupHead(progress));
  else parts.push(el("header", { class: "page-head" }, el("div", {}, [el("h1", {}, "Your setup")])));
  parts.push(el("div", { class: "settings" }, [
    schoolPanel(d, progress), classesPanel(d, progress), timetablePanel(d, progress), periodsPanel(d),
    el("div", { class: "save-bar", id: "save-bar", hidden: !setup && !draftIsDirty() }, [
      el("span", {}, setup ? (progress.timetable ? "All three steps done. You can change any of this later." : "You can change any of this later.") : "You have unsaved changes."),
      el("span", { class: "spacer" }),
      setup ? null : el("button", { type: "button", class: "btn btn-quiet",
        onclick: function () { App.setupDraft = null; render(); } }, "Undo"),
      el("button", { type: "button", class: "btn", onclick: function (e) { saveSetupDraft(e.currentTarget); } }, setup ? "Start using the app" : "Save")
    ])
  ].concat(setup ? [importPanel()] : [categoriesPanel(), namesPanel(), emailPanel(), exportPanel(), importPanel(), dataPanel()])));
  return el("div", { class: "page" }, parts);
}

// Which of the three setup steps are complete, judged from the unsaved draft.
function setupProgress(d) {
  var payload = draftPayload(d);
  return { school: !!d.schoolId, classes: payload.classes.length > 0, timetable: payload.timetable.length > 0 };
}

var CHECK_SVG = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m3.5 8.5 3 3 6-7"/></svg>';

function stepBadge(n, done) {
  return done ? el("span", { class: "step-num is-done", "aria-label": "Step " + n + " done", html: CHECK_SVG })
    : el("span", { class: "step-num", "aria-label": "Step " + n }, String(n));
}

function setupHead(progress) {
  var steps = [["School", progress.school], ["Classes", progress.classes], ["Timetable", progress.timetable]];
  var track = [];
  steps.forEach(function (s, i) {
    if (i > 0) track.push(el("span", { class: "p-line" + (steps[i - 1][1] ? " is-done" : ""), "aria-hidden": "true" }));
    track.push(el("span", { class: "p-step" + (s[1] ? " is-done" : "") }, [stepBadge(i + 1, s[1]), el("span", { class: "p-label" }, s[0])]));
  });
  return el("header", { class: "setup-head" }, [
    
    el("h1", {}, "Set up your notebook"),
    el("p", {}, "Three short steps. Everything you add is saved in a Google Sheet in your Drive, and only you can see it."),
    el("div", { class: "progress", "aria-label": "Setup progress" }, track)
  ]);
}

function stepPanel(n, title, hint, done, children) {
  return el("section", { class: "panel" }, [
    el("div", { class: "step-head" }, [stepBadge(n, done), el("h2", {}, title), hint ? el("span", { class: "hint" }, hint) : null]),
    children
  ]);
}

function schoolPanel(d, progress) {
  var select = el("select", { class: "select", style: "max-width:420px", onchange: function (e) { updateDraft({ schoolId: e.target.value }, true); } },
    App.data.schools.map(function (s) { return el("option", { value: s.id }, s.name + (s.year ? " (" + s.year + ")" : "")); }));
  select.value = d.schoolId;
  return stepPanel(1, "School", null, progress.school, [
    field("Your school's calendar", select),
    el("p", { class: "hint", style: "margin:-6px 0 0" }, "Not listed? Pick the last option for a plain Monday-to-Friday week, and send your school calendar to whoever shared this app with you so they can add it.")
  ]);
}

function classesPanel(d, progress) {
  var rows = d.classes.map(function (c, i) {
    var name = textInput(c.name, { maxlength: "40", placeholder: "e.g. 3D English", "aria-label": "Class name",
      oninput: function (e) { updateDraft({ classes: replaceAt(draft().classes, i, Object.assign({}, c, { name: e.target.value })) }, false); },
      onchange: function () { render(); } });
    return el("div", { class: "class-row" + (c.id === App.newClassId ? " is-new" : "") }, [
      el("div", { class: "swatches", role: "group", "aria-label": "Colour" }, App.data.colours.map(function (col) {
        return el("button", { type: "button", class: "swatch c-" + col, "aria-label": col, "aria-pressed": c.colour === col ? "true" : "false",
          onclick: function () { updateDraft({ classes: replaceAt(draft().classes, i, Object.assign({}, c, { colour: col })) }, true); } });
      })),
      name,
      el("button", { type: "button", class: "btn btn-quiet icon-btn", "aria-label": "Remove " + (c.name || "class"), onclick: function () {
        updateDraft({ classes: draft().classes.filter(function (x) { return x.id !== c.id; }) }, true);
      } }, icon("close"))
    ]);
  });
  return stepPanel(2, "Classes", "one per class and subject you teach", progress.classes, [
    el("div", {}, rows),
    el("button", { type: "button", class: "btn btn-sm", style: "margin-top:8px", onclick: function () {
      var added = newClass(draft().classes.length);
      App.newClassId = added.id; // only the new row slides in
      updateDraft({ classes: draft().classes.concat([added]) }, true);
      App.newClassId = null;
      var inputs = document.querySelectorAll(".class-row .input");
      if (inputs.length) inputs[inputs.length - 1].focus();
    } }, "+ Add a class")
  ]);
}

function replaceAt(list, index, item) {
  return list.map(function (x, i) { return i === index ? item : x; });
}

function timetablePanel(d, progress) {
  var spec = App.data.schools.filter(function (s) { return s.id === d.schoolId; })[0] || { cycleLength: 5, kind: "weekday" };
  var days = [];
  for (var n = 1; n <= spec.cycleLength; n++) days.push(n);
  var named = d.classes.filter(function (c) { return c.name.trim(); });
  var byId = {};
  named.forEach(function (c) { byId[c.id] = c; });
  function dayName(n) { return spec.kind === "weekday" ? ["", "Mon", "Tue", "Wed", "Thu", "Fri"][n] : "Day " + n; }
  var head = el("tr", {}, [el("th", {}, "Period")].concat(days.map(function (n) {
    return el("th", { scope: "col" }, dayName(n));
  })));
  var rows = d.periods.map(function (p) {
    var label = el("th", { scope: "row" }, [p.label, el("small", {}, p.start + "–" + p.end)]);
    if (!p.teaching) return el("tr", {}, [label, el("td", { class: "break", colspan: String(days.length) }, p.label)]);
    return el("tr", {}, [label].concat(days.map(function (day) {
      var key = day + "|" + p.id;
      var current = byId[d.slots[key]] ? d.slots[key] : "";
      var select = el("select", { "aria-label": dayName(day) + " " + p.label, onchange: function (e) {
        var slots = Object.assign({}, draft().slots);
        slots[key] = e.target.value;
        updateDraft({ slots: slots }, true);
      } }, [el("option", { value: "" }, "—")].concat(named.map(function (c) { return el("option", { value: c.id }, c.name); })));
      select.value = current;
      return el("td", { class: current ? "filled " + classColour(byId[current]) : "" }, select);
    })));
  });
  return stepPanel(3, "Timetable", named.length ? "pick a class for each period you teach" : "add a class above first", progress.timetable, [
    el("div", { class: "tt-wrap" }, el("table", { class: "tt" }, [el("thead", {}, head), el("tbody", {}, rows)]))
  ]);
}

function periodsPanel(d) {
  var rows = d.periods.map(function (p, i) {
    function set(patch) { updateDraft({ periods: replaceAt(draft().periods, i, Object.assign({}, p, patch)) }, false); }
    return el("div", { class: "period-row" }, [
      textInput(p.label, { maxlength: "20", "aria-label": "Period name", oninput: function (e) { set({ label: e.target.value }); }, onchange: function () { render(); } }),
      el("input", { class: "input", type: "time", value: p.start, "aria-label": p.label + " start", oninput: function (e) { set({ start: e.target.value }); }, onchange: function () { render(); } }),
      el("input", { class: "input", type: "time", value: p.end, "aria-label": p.label + " end", oninput: function (e) { set({ end: e.target.value }); }, onchange: function () { render(); } }),
      el("label", { class: "check" }, [el("input", { type: "checkbox", checked: p.teaching, onchange: function (e) { set({ teaching: e.target.checked }); render(); } }), "Lesson"]),
      el("button", { type: "button", class: "btn btn-quiet icon-btn", "aria-label": "Remove " + p.label, onclick: function () {
        updateDraft({ periods: draft().periods.filter(function (x) { return x.id !== p.id; }) }, true);
      } }, icon("close"))
    ]);
  });
  return el("details", { class: "panel" }, [
    el("summary", {}, "Period times"),
    el("p", { class: "hint" }, "Change these if your school's bell times are different. Untick “Lesson” for breaks like recess and lunch."),
    el("div", {}, rows),
    el("button", { type: "button", class: "btn btn-sm", style: "margin-top:8px", onclick: function () {
      var last = draft().periods[draft().periods.length - 1];
      var id = "X" + Math.random().toString(36).slice(2, 6).toUpperCase();
      var start = last ? last.end : "08:00";
      updateDraft({ periods: draft().periods.concat([{ id: id, label: "New period", start: start, end: addMinutes(start, 40), teaching: true }]) }, true);
    } }, "+ Add a period")
  ]);
}

function addMinutes(time, mins) {
  var total = Math.min(23 * 60 + 59, L.minutes(time) + mins);
  return pad(Math.floor(total / 60)) + ":" + pad(total % 60);
}

// ---------- to-do categories ----------
function categoriesPanel() {
  var list = App.ctx.categories.map(function (c) { return Object.assign({}, c); });
  var holder = el("div");
  var save = el("button", { type: "button", class: "btn btn-ink btn-sm" }, "Save categories");
  function draw() {
    holder.replaceChildren.apply(holder, list.map(function (c, i) {
      return el("div", { class: "class-row" }, [
        el("div", { class: "swatches", role: "group", "aria-label": "Colour" }, App.data.colours.map(function (col) {
          return el("button", { type: "button", class: "swatch c-" + col, "aria-label": col, "aria-pressed": c.colour === col ? "true" : "false",
            onclick: function () { list[i] = Object.assign({}, c, { colour: col }); draw(); } });
        })),
        textInput(c.name, { maxlength: "30", "aria-label": "Category name", oninput: function (e) { list[i] = Object.assign({}, list[i], { name: e.target.value }); } }),
        el("button", { type: "button", class: "btn btn-quiet icon-btn", "aria-label": "Remove " + c.name, onclick: function () { list.splice(i, 1); draw(); } }, icon("close"))
      ]);
    }));
  }
  draw();
  save.addEventListener("click", function () {
    var clean = list.filter(function (c) { return c.name.trim(); });
    busy(save, api("saveCategories", clean)).then(function (res) {
      setData(Object.assign({}, App.data, { categories: res.categories }));
      toast("Categories saved.");
    }, fail);
  });
  return el("section", { class: "panel" }, [
    el("div", { class: "panel-head" }, [el("h2", {}, "To-do categories"), el("span", { class: "hint" }, "optional on every to-do")]),
    holder,
    el("div", { class: "row", style: "margin-top:8px" }, [
      el("button", { type: "button", class: "btn btn-sm", onclick: function () {
        list.push({ id: "k" + Math.random().toString(36).slice(2, 9), name: "", colour: App.data.colours[list.length % App.data.colours.length] });
        draw();
        var inputs = holder.querySelectorAll(".input");
        if (inputs.length) inputs[inputs.length - 1].focus();
      } }, "+ Add a category"),
      save
    ])
  ]);
}

// ---------- email reminders ----------
var MAX_ROUNDUPS = 6;

// Round-up emails at any times of day, each covering today or tomorrow.
function emailPanel() {
  var list = (App.data.settings.reminders || []).map(function (r) { return Object.assign({}, r); });
  var holder = el("div", { class: "roundups" });
  var save = el("button", { type: "button", class: "btn btn-ink btn-sm" }, "Save reminders");
  var add = el("button", { type: "button", class: "btn btn-sm" }, "+ Add a round-up");
  function draw() {
    holder.replaceChildren.apply(holder, list.length ? list.map(function (r, i) {
      var time = el("input", { class: "input", type: "time", value: r.time, "aria-label": "Send at", oninput: function (e) { list[i] = Object.assign({}, list[i], { time: e.target.value }); } });
      var covers = el("select", { class: "select", "aria-label": "Covers", onchange: function (e) { list[i] = Object.assign({}, list[i], { covers: e.target.value }); } },
        [el("option", { value: "today" }, "Today's round-up"), el("option", { value: "tomorrow" }, "Tomorrow's round-up")]);
      covers.value = r.covers;
      return el("div", { class: "roundup-row" }, [
        time, covers,
        el("button", { type: "button", class: "btn btn-quiet icon-btn", "aria-label": "Remove the " + r.time + " round-up", onclick: function () { list.splice(i, 1); draw(); } }, icon("close"))
      ]);
    }) : [el("p", { class: "empty" }, "No round-ups yet.")]);
    add.disabled = list.length >= MAX_ROUNDUPS;
  }
  add.addEventListener("click", function () {
    // A sensible next slot: the morning first, then the evening.
    var has = list.map(function (r) { return r.time; });
    var time = has.indexOf("07:00") < 0 ? "07:00" : has.indexOf("20:00") < 0 ? "20:00" : "12:30";
    list.push({ id: "", time: time, covers: time < "12:00" ? "today" : "tomorrow", on: true });
    draw();
  });
  save.addEventListener("click", function () {
    busy(save, api("saveReminders", list)).then(function (res) {
      setData(Object.assign({}, App.data, { settings: Object.assign({}, App.data.settings, { reminders: res.reminders }) }));
      toast(res.reminders.length ? "Reminders saved." : "Round-ups switched off.");
    }, fail);
  });
  var test = el("button", { type: "button", class: "btn btn-sm btn-quiet" }, "Send me a test");
  test.addEventListener("click", function () {
    busy(test, api("sendTestEmail")).then(function (res) { toast("Sent to " + res.to + "."); }, fail);
  });
  draw();
  return panel("Email reminders", "to " + (App.data.email || "your email"), [
    el("p", { class: "hint", style: "margin-top:0" }, "Round-ups list that day's lessons and plans, what to remind students, homework to collect, items, marking and to-dos. Add as many as you like, at any time (for example 07:00 for today and 20:00 for tomorrow). Nothing is sent on a day with nothing on."),
    holder,
    el("div", { class: "row", style: "margin-top:10px" }, [add, save, test]),
    el("p", { class: "hint", style: "margin-bottom:0" }, "You can also set a reminder on any to-do, item or marking when you open it. Emails arrive within about 15 minutes of the time.")
  ]);
}

// "Email me a reminder" for a to-do or marking: a date and time, or none.
function reminderField(value, suggest) {
  var on = el("input", { type: "checkbox", checked: !!value });
  var date = el("input", { class: "input", type: "date", value: value ? value.slice(0, 10) : "", "aria-label": "Reminder date" });
  var time = el("input", { class: "input", type: "time", value: value ? value.slice(11, 16) : "", "aria-label": "Reminder time" });
  var row = el("div", { class: "row reminder-when", hidden: !value }, [date, time]);
  on.addEventListener("change", function () {
    row.hidden = !on.checked;
    if (on.checked && !date.value) { var s = suggest(); date.value = s.slice(0, 10); time.value = s.slice(11, 16); }
  });
  return {
    node: el("div", { class: "field" }, [el("label", { class: "check" }, [on, "Email me a reminder"]), row]),
    value: function () { return on.checked && date.value && time.value ? date.value + "T" + time.value : ""; }
  };
}

// ---------- export ----------
function exportPanel() {
  var today = todayStr();
  var first = App.ctx.school.first || App.data.log.reduce(function (min, e) { return !min || e.date < min ? e.date : min; }, "") || today;
  var from = el("input", { class: "input", type: "date", value: first, "aria-label": "From", style: "max-width:180px" });
  var to = el("input", { class: "input", type: "date", value: today, "aria-label": "To", style: "max-width:180px" });
  var boxes = App.ctx.classes.map(function (c) { return { id: c.id, box: el("input", { type: "checkbox", checked: true }), name: c.name }; });
  var result = el("div", { class: "row", style: "margin-top:12px" });
  var make = el("button", { type: "button", class: "btn btn-ink" }, "Make Excel file");
  make.addEventListener("click", function () {
    var ids = boxes.filter(function (b) { return b.box.checked; }).map(function (b) { return b.id; });
    result.replaceChildren(el("span", { class: "hint" }, "Making your file… this can take a few seconds."));
    busy(make, exportExcel(App.data, { from: from.value, to: to.value, classIds: ids })).then(function (res) {
      var link = el("a", { class: "btn btn-ink", href: res.url, download: res.filename }, "Download .xlsx");
      result.replaceChildren(link, el("span", { class: "hint" }, res.lessons + " lessons in the file."));
      link.click(); // start the download straight away; the button stays in case it was blocked
    }, function (e) { result.replaceChildren(); fail(e); });
  });
  return panel("Export for book inspection", "Excel", [
    el("p", { class: "hint", style: "margin-top:0" }, "One tab per class plus an “All classes” tab. Every timetabled lesson in the dates is listed, including ones with nothing written."),
    el("div", { class: "row", style: "margin-bottom:12px" }, [from, el("span", {}, "to"), to]),
    el("div", { class: "row", style: "margin-bottom:14px" }, boxes.map(function (b) { return el("label", { class: "check" }, [b.box, b.name]); })),
    make, result
  ]);
}

// ---------- import ----------
function importPanel() {
  var input = el("input", { type: "file", accept: ".json,application/json", class: "sr-only", id: "import-file" });
  input.addEventListener("change", function () {
    var file = input.files && input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { toast("That file couldn't be read.", true); };
    reader.onload = function () { importText(String(reader.result)); input.value = ""; };
    reader.readAsText(file);
  });
  return panel("Import a file", null, [
    el("p", { class: "hint", style: "margin-top:0" }, "If you were given a setup file (for example your old Word logbook, converted), bring it in here. Lessons you've already written about are never overwritten."),
    input,
    el("label", { for: "import-file", class: "btn" }, "Choose file…")
  ]);
}

function importText(text) {
  var parsed;
  try { parsed = JSON.parse(text); } catch (e) { toast("That isn't a Periods file.", true); return; }
  if (!parsed || parsed.format !== "teachers-second-brain") { toast("That isn't a Periods file.", true); return; }
  var summary = [
    parsed.classes ? parsed.classes.length + " classes and a timetable (replacing yours)" : "",
    parsed.log ? parsed.log.length + " logbook entries" : "",
    parsed.events ? parsed.events.length + " events" : "",
    parsed.todos ? parsed.todos.length + " to-dos" : ""
  ].filter(Boolean).join(", ");
  if (!window.confirm("Import " + summary + "?")) return;
  toast("Importing…");
  api("importData", parsed).then(function (res) {
    App.setupDraft = null;
    setData(res.data);
    var c = res.counts;
    toast("Imported " + c.log.added + " entries and " + c.events.added + " events" + (c.log.skipped ? " (" + c.log.skipped + " already there)" : "") + ".");
    if (res.data.settings.setupDone) go("today");
  }, fail);
}

// ---------- data & this device ----------
function dataPanel() {
  var holder = el("div", { class: "row" });
  var open = el("button", { type: "button", class: "btn btn-sm" }, "Find my Google Sheet");
  open.addEventListener("click", function () {
    busy(open, api("getDataSheetUrl")).then(function (res) {
      open.replaceWith(el("a", { class: "btn btn-sm", href: res.url, target: "_blank", rel: "noopener" }, "Open my Google Sheet ↗"));
    }, fail);
  });
  var copy = el("button", { type: "button", class: "btn btn-sm", onclick: function () {
    var link = Backend.personalLink();
    var done = function () { toast("Personal link copied. Open it once on your other device."); };
    if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, function () { window.prompt("Copy your personal link:", link); });
    else window.prompt("Copy your personal link:", link);
  } }, "Copy my personal link");
  var forget = el("button", { type: "button", class: "btn btn-sm btn-danger", onclick: function () {
    if (!window.confirm("Forget this device? Your notes stay safe in your Google Sheet; open your personal link again to come back.")) return;
    Backend.forget();
    App.data = null;
    showLocked("This device was forgotten. Your notes are still safe.");
  } }, "Forget this device");
  // Older web app versions don't send `owner`; treat that as the owner's notebook.
  var isOwner = App.data.owner !== false;
  if (isOwner) holder.append(open);
  holder.append(copy, forget);
  var where = isOwner
    ? "Your notes are saved in a Google Sheet in your Drive" + (App.data.email ? " (" + App.data.email + ")" : "")
    : "Your notes are saved in a Google Sheet kept by the person who set up this app";
  return panel("Your data", null, [
    el("p", { class: "hint", style: "margin-top:0" }, where +
      ". Use your personal link to open the app on another device: keep it private, as anyone with it can open your notebook."),
    holder
  ]);
}

start();
