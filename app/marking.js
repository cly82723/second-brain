/* Marking: the editor for one pile (who handed in, what's marked, writing to the scoresheet or copying
   the column), and the Settings panel for class name lists. */

var HAND_IN_LABELS = [["S", "Submitted"], ["L", "Late"], ["A", "Absent"], ["M", "Missing"]];

function openMarkEditor(mark, defaults) {
  var isNew = !mark || !mark.id;
  var base = isNew ? Object.assign({ title: "", classId: "", collected: todayStr(), due: "", scripts: "", marked: "", notes: "", done: false, homework: "", students: {} }, defaults || {}) : mark;
  var students = JSON.parse(JSON.stringify(base.students || {}));
  var title = textInput(base.title, { maxlength: "200", placeholder: "e.g. S1E2 dictation 3", "data-autofocus": "" });
  var cls = el("select", { class: "select", style: "max-width:260px" }, [el("option", { value: "" }, "No class")].concat(App.ctx.classes.map(function (c) {
    return el("option", { value: c.id }, c.name);
  })));
  cls.value = base.classId || "";
  var collected = el("input", { class: "input", type: "date", value: base.collected || "", style: "max-width:180px" });
  var due = el("input", { class: "input", type: "date", value: base.due || "", style: "max-width:180px" });
  var scripts = el("input", { class: "input", type: "number", min: "0", max: "500", value: base.scripts === "" ? "" : String(base.scripts), style: "max-width:110px", "aria-label": "Number of scripts" });
  var marked = el("input", { class: "input", type: "number", min: "0", max: "500", value: base.marked === "" ? "" : String(base.marked), style: "max-width:110px", "aria-label": "Number marked" });
  var notes = textArea(base.notes, 2);
  var done = el("input", { type: "checkbox", checked: !!base.done });
  var listHolder = el("div");
  var sheetHolder = el("div");

  function roster() { return App.data.rosters && App.data.rosters[cls.value] || []; }

  function drawList() {
    var list = roster();
    if (!cls.value || !list.length) {
      // el() skips a missing hint; the DOM's replaceChildren would print it as the word "null".
      listHolder.replaceChildren(el("div", { class: "field scripts-field" }, [
        el("span", { class: "label" }, "Scripts"),
        el("div", { class: "scripts-row" }, [
          el("label", { class: "scripts-count" }, [scripts, el("span", {}, "handed in")]),
          el("label", { class: "scripts-count" }, [marked, el("span", {}, "marked")])
        ]),
        cls.value ? el("p", { class: "hint", style: "margin:0" }, "Add a name list for this class in Settings → Name lists to tick students off one by one.") : null
      ]));
      return;
    }
    var counts = { S: 0, L: 0, A: 0, M: 0, "": 0, marked: 0 };
    list.forEach(function (s) { var st = students[s.no] || {}; counts[st.s || ""]++; if (st.m) counts.marked++; });
    var rows = list.map(function (s) {
      var st = students[s.no] || { s: "", m: false };
      return el("li", { class: "hand-in" }, [
        el("span", { class: "hi-no" }, String(s.no)),
        el("span", { class: "hi-name" }, s.name),
        el("div", { class: "hi-status", role: "group", "aria-label": s.name }, HAND_IN_LABELS.map(function (h) {
          return el("button", { type: "button", class: "hi-btn hi-" + h[0], "aria-pressed": st.s === h[0] ? "true" : "false", title: h[1],
            onclick: function () {
              var next = st.s === h[0] ? "" : h[0];
              students[s.no] = { s: next, m: !!st.m && (next === "S" || next === "L") };
              drawList();
            } }, h[1].charAt(0));
        })),
        el("label", { class: "check hi-marked" }, [el("input", { type: "checkbox", checked: !!st.m, disabled: st.s !== "S" && st.s !== "L",
          onchange: function (e) { students[s.no] = { s: st.s, m: e.target.checked }; drawList(); } }), "Marked"])
      ]);
    });
    // Redrawing must not jump: keep where the list was scrolled to and which button had focus.
    var oldList = listHolder.querySelector(".hand-in-list");
    var keepScroll = oldList ? oldList.scrollTop : 0;
    var focused = document.activeElement && listHolder.contains(document.activeElement) ? document.activeElement : null;
    var focusKey = focused ? [focused.closest(".hand-in") ? Array.prototype.indexOf.call(oldList.children, focused.closest(".hand-in")) : -1, focused.className] : null;
    listHolder.replaceChildren(el("div", { class: "field" }, [
      el("div", { class: "row", style: "justify-content:space-between" }, [
        el("span", { class: "label" }, "Hand-ins · " + (counts.S + counts.L) + " in, " + counts.M + " missing, " + counts.A + " absent" + (counts[""] ? ", " + counts[""] + " not recorded" : "")),
        el("div", { class: "row", style: "gap:6px" }, [
          el("button", { type: "button", class: "btn btn-sm", onclick: function () {
            list.forEach(function (s) { var st = students[s.no] || {}; if (!st.s) students[s.no] = { s: "S", m: !!st.m }; });
            drawList();
          } }, "Select all"),
          el("button", { type: "button", class: "btn btn-sm btn-quiet", onclick: function () {
            list.forEach(function (s) { var st = students[s.no] || {}; if (st.s === "S" || st.s === "L") students[s.no] = { s: st.s, m: true }; });
            drawList();
          } }, "All marked")
        ])
      ]),
      el("p", { class: "hint", style: "margin:0" }, "Select all marks everyone not yet recorded as Submitted; then change the few who didn't hand in. S = Submitted, L = Late, A = Absent, M = Missing."),
      el("ul", { class: "list hand-in-list" }, rows)
    ]));
    var newList = listHolder.querySelector(".hand-in-list");
    newList.scrollTop = keepScroll;
    if (focusKey && focusKey[0] >= 0 && newList.children[focusKey[0]]) {
      var classes = focusKey[1].split(" ").filter(Boolean);
      var again = newList.children[focusKey[0]].querySelector(classes.length ? "." + classes.join(".") : "input");
      if (again) again.focus({ preventScroll: true });
    }
  }

  function collect() {
    return {
      id: isNew ? "" : base.id, title: title.value, classId: cls.value, collected: collected.value, due: due.value,
      scripts: scripts.value, marked: marked.value, notes: notes.value, done: done.checked, doneAt: base.doneAt || "",
      homework: base.homework || "", students: students
    };
  }
  var initial = JSON.stringify(collect());
  guardDirty(function () { return JSON.stringify(collect()) !== initial; });

  var saveBtn = el("button", { type: "button", class: "btn btn-ink" }, isNew ? "Add marking" : "Save");
  function save(keepOpen) {
    return busy(saveBtn, api("saveMark", collect())).then(function (res) {
      setData(withList("marks", res.mark, idOf));
      // Saved once (e.g. by Preview): later saves update this item instead of adding another.
      if (isNew) { base = res.mark; isNew = false; }
      if (keepOpen) { initial = JSON.stringify(collect()); return res.mark; }
      App.guardClose = null;
      closeLayer();
      toast(isNew ? "Added to To mark." : (res.mark.done ? "Marking finished." : "Saved."));
      return res.mark;
    }, function (e) { fail(e); throw e; });
  }
  saveBtn.addEventListener("click", function () { save(false); });

  function drawSheet() {
    if (!cls.value) { sheetHolder.replaceChildren(); return; }
    sheetHolder.replaceChildren(scoresheetBox(function () { return save(true); }, collect, roster, !!(App.data.scoresheets || {})[cls.value], base.sheetCol));
  }
  // Hand-ins belong to one class's list; switching class starts the list afresh.
  cls.addEventListener("change", function () { students = {}; drawList(); drawSheet(); });
  drawList();
  drawSheet();

  var today = todayStr();
  var quick = el("div", { class: "row", style: "margin-top:8px" }, [["In 3 days", L.addDays(today, 3)], ["In a week", L.addDays(today, 7)], ["Next school day", L.nextSchoolDay(App.ctx, today)]].filter(function (q) { return q[1]; }).map(function (q) {
    return el("button", { type: "button", class: "btn btn-sm", onclick: function () { due.value = q[1]; } }, q[0]);
  }));
  var body = [
    field("What", title),
    field("Class", cls, "· optional"),
    el("div", { class: "row" }, [field("Collected", collected), field("Return by", due, "· optional")]),
    quick,
    listHolder,
    field("Notes", notes),
    el("label", { class: "check", style: "margin-bottom:16px" }, [done, "Finished and returned"]),
    sheetHolder
  ];
  var footer = [
    saveBtn,
    el("button", { type: "button", class: "btn", onclick: function () { closeLayer(); } }, "Cancel"),
    el("span", { class: "spacer" }),
    isNew ? null : el("button", { type: "button", class: "btn btn-danger", onclick: function (e) {
      if (!window.confirm("Delete this marking item?")) return;
      busy(e.currentTarget, api("deleteMark", base.id)).then(function () {
        App.guardClose = null;
        closeLayer();
        setData(withList("marks", base, idOf, true));
        toast("Marking deleted.");
      }, fail);
    } }, "Delete")
  ];
  var drawer = openDrawer(isNew ? "New marking" : "Marking", base.homework ? "From homework set " + L.shortDate(base.homework.split("|")[0]) : null, body, footer, "drawer-wide");
  saveShortcut(drawer, function () { save(false); });
}

// Scoresheet: preview then write (when linked), and Copy column (always), so a school account that
// can't share with the app's account still gets everything with one paste.
function scoresheetBox(saveFirst, collect, roster, linked, sheetCol) {
  var full = el("input", { class: "input", type: "number", min: "1", max: "1000", placeholder: "e.g. 20", style: "max-width:110px", "aria-label": "Full marks" });
  var out = el("div", { class: "sheet-preview" });
  var statusText = { L: "Late", A: "Absent", M: "Missing" };
  function columnTitle() { var m = collect(); return m.title + (m.collected ? " (" + L.shortDate(m.collected) + ")" : ""); }
  function copy(text, what) {
    var done = function () { toast(what + " copied. Paste it into the scoresheet."); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { window.prompt("Copy this:", text); });
    else window.prompt("Copy this:", text);
  }
  var copyHead = el("button", { type: "button", class: "btn btn-sm", onclick: function () { copy(columnTitle() + "\n" + (full.value || ""), "Title and full marks"); } }, "Copy title & full marks");
  var copyBody = el("button", { type: "button", class: "btn btn-sm", onclick: function () {
    var m = collect();
    var list = roster();
    if (!list.length) { toast("This class has no name list yet. Add one in Settings → Name lists.", true); return; }
    copy(list.map(function (s) { var st = m.students[s.no] || {}; return statusText[st.s] || ""; }).join("\n"), "Hand-in column");
  } }, "Copy hand-ins");
  var children = [
    el("div", { class: "label" }, "Scoresheet"),
    sheetCol ? el("p", { class: "hint" }, "Already written to column " + sheetCol + ".") : null,
    el("div", { class: "row" }, [el("span", { class: "hint" }, "Full marks"), full]),
    el("p", { class: "hint", style: "margin:6px 0" }, "Only students who didn't hand in on time get a word (Late, Absent, Missing); the rest stay empty for your scores."),
    el("div", { class: "row" }, [
      linked && !sheetCol ? el("button", { type: "button", class: "btn btn-sm btn-ink", onclick: function (e) {
        var btn = e.currentTarget;
        saveFirst().then(function (saved) { return busy(btn, api("previewScoresheet", saved.id, full.value)).then(function (p) { showPreview(saved.id, p); }); }).catch(function (err) { if (err && err.message) fail(err); });
      } }, "Preview") : null,
      copyHead, copyBody
    ]),
    el("p", { class: "hint", style: "margin:6px 0 0" }, linked ? "Copy: paste the title at row 2 of an empty column, and the hand-ins at row 6 of the same column." :
      "No scoresheet linked for this class (Settings → Name lists). Copy: paste the title at row 2 of an empty column, and the hand-ins at row 6, in name-list order."),
    out
  ];
  function showPreview(markId, p) {
    var cells = p.cells.filter(function (c) { return c.value; });
    var unrecorded = p.cells.filter(function (c) { return c.unrecorded; }).length;
    var write = el("button", { type: "button", class: "btn btn-ink btn-sm" }, "Write to column " + p.column);
    write.addEventListener("click", function () {
      // Save what's on screen first, so hand-ins changed after the preview are what gets written.
      saveFirst().then(function () { return busy(write, api("writeScoresheet", markId, p.column, full.value)); }).then(function (res) {
        setData(withList("marks", res.mark, idOf));
        App.guardClose = null;
        closeLayer();
        toast("Written to column " + res.column + " of the scoresheet (" + res.written + " hand-in notes).");
      }, fail);
    });
    out.replaceChildren(el("div", { class: "notice" }, [
      el("b", {}, "Column " + p.column + ": " + p.title + (p.fullMarks ? " · full marks " + p.fullMarks : "")),
      el("ul", { class: "preview-list" }, cells.length ? cells.map(function (c) { return el("li", {}, c.no + " " + c.name + ": " + c.value); }) : [el("li", {}, "Everyone handed in on time, so only the title is written.")]),
      unrecorded ? el("p", { class: "hint" }, unrecorded + " student(s) have no hand-in recorded; their cells stay empty.") : null,
      p.missingFromSheet.length ? el("p", { class: "hint" }, "Not on the scoresheet: class no. " + p.missingFromSheet.join(", ") + ".") : null,
      el("p", { class: "hint" }, "Nothing else in the scoresheet is touched. Filled cells are never overwritten."),
      el("div", { class: "row" }, [write, el("button", { type: "button", class: "btn btn-sm", onclick: function () { out.replaceChildren(); } }, "Cancel")])
    ]));
  }
  return el("div", { class: "sheet-box" }, children);
}

// ---------- Settings: name lists ----------
// Accepts lines like "1 CHAN CHI HIM", "1<tab>CHAN CHI HIM" (from Excel) or just names (numbered in order).
function parseRoster(text) {
  var lines = String(text || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  return lines.map(function (line, i) {
    var m = line.match(/^(\d{1,2})[\s\t.,)-]+(.+)$/);
    return m ? { no: Number(m[1]), name: m[2].trim() } : { no: i + 1, name: line };
  });
}

function namesPanel() {
  var rows = App.ctx.classes.map(function (c) {
    var list = (App.data.rosters || {})[c.id] || [];
    var linked = !!(App.data.scoresheets || {})[c.id];
    return el("div", { class: "names-row" }, [
      el("div", { class: "names-head" }, [
        el("span", { class: "dot " + classColour(c) }), el("b", {}, c.name),
        el("span", { class: "hint" }, list.length ? list.length + " students" : "no list yet"),
        linked ? el("span", { class: "chip chip-A" }, "Scoresheet linked") : null,
        el("span", { class: "spacer" }),
        el("button", { type: "button", class: "btn btn-sm", onclick: function () { openRosterEditor(c); } }, list.length ? "Edit list" : "Paste list"),
        el("button", { type: "button", class: "btn btn-sm", onclick: function () { openScoresheetLink(c, linked); } }, linked ? "Scoresheet…" : "Link scoresheet")
      ])
    ]);
  });
  return el("section", { class: "panel" }, [
    el("div", { class: "panel-head" }, [el("h2", {}, "Name lists"), el("span", { class: "hint" }, "for ticking off hand-ins")]),
    el("p", { class: "hint", style: "margin-top:0" }, "Paste each class's list, or link the class's gradebook scoresheet to take the list from its Grades tab."),
    rows.length ? rows : el("p", { class: "empty" }, "Add your classes first.")
  ]);
}

function openRosterEditor(c) {
  var list = (App.data.rosters || {})[c.id] || [];
  var box = textArea(list.map(function (s) { return s.no + "\t" + s.name; }).join("\n"), 14, 6000);
  box.setAttribute("data-autofocus", "");
  var save = el("button", { type: "button", class: "btn btn-ink" }, "Save list");
  save.addEventListener("click", function () {
    busy(save, api("saveRoster", c.id, parseRoster(box.value))).then(function (res) {
      var rosters = Object.assign({}, App.data.rosters || {});
      rosters[c.id] = res.roster;
      App.guardClose = null;
      closeLayer();
      setData(Object.assign({}, App.data, { rosters: rosters }));
      toast(res.roster.length + " students saved for " + c.name + ".");
    }, fail);
  });
  openDrawer("Name list · " + c.name, "One student per line: class number, then name. Pasting two columns from Excel works.", [field("Students", box)],
    [save, el("button", { type: "button", class: "btn", onclick: function () { closeLayer(); } }, "Cancel")]);
}

function openScoresheetLink(c, linked) {
  var link = textInput("", { placeholder: "https://docs.google.com/spreadsheets/d/…", "data-autofocus": "" });
  var go = el("button", { type: "button", class: "btn btn-ink" }, linked ? "Link a different one" : "Link and read names");
  go.addEventListener("click", function () {
    busy(go, api("linkScoresheet", c.id, link.value)).then(function (res) {
      var rosters = Object.assign({}, App.data.rosters || {});
      rosters[c.id] = res.roster;
      var sheets = Object.assign({}, App.data.scoresheets || {});
      sheets[c.id] = true;
      closeLayer();
      setData(Object.assign({}, App.data, { rosters: rosters, scoresheets: sheets }));
      toast("Linked. " + res.roster.length + " students read from the scoresheet.");
    }, fail);
  });
  var unlink = linked ? el("button", { type: "button", class: "btn btn-danger", onclick: function (e) {
    busy(e.currentTarget, api("unlinkScoresheet", c.id)).then(function () {
      var sheets = Object.assign({}, App.data.scoresheets || {});
      delete sheets[c.id];
      closeLayer();
      setData(Object.assign({}, App.data, { scoresheets: sheets }));
      toast("Scoresheet unlinked. The name list stays.");
    }, fail);
  } }, "Unlink") : null;
  openDrawer("Scoresheet · " + c.name, null, [
    field("Scoresheet link", link),
    linked ? el("p", { class: "notice notice-warn" }, "Hand-ins are matched by class number. Linking a different scoresheet replaces this class's name list, so check that the class numbers are the same.") : null,
    el("p", { class: "hint" }, "Use the class's gradebook (the Google Sheets Gradebook template). The app reads the names from its Grades tab, and later writes only into empty assignment columns after showing you a preview."),
    el("p", { class: "hint" }, "If the scoresheet belongs to your school account, share it with " + (App.data.ownerEmail || "the app's Google account") + " as an Editor first. If your school blocks that, use Copy column on each marking instead.")
  ], [go, el("button", { type: "button", class: "btn", onclick: function () { closeLayer(); } }, "Cancel"), el("span", { class: "spacer" }), unlink]);
}
