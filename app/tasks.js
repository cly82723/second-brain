/* Tasks: to-dos (with categories) and marking, plus "Needs a date": a card on Today and on Tasks
   (counted in the Tasks badge, never a pop-up), each row with a date picker. */

function renderTodos() {
  return App.param === "mark" ? renderMarks() : renderTodoList();
}

function tasksSwitch(current) {
  var marks = L.openMarks(App.ctx).length;
  return segmented([["todos", "To-dos"], ["mark", "To mark" + (marks ? " (" + marks + ")" : "")]], current, function (v) { go("todos", v === "mark" ? "mark" : ""); });
}

function renderTodoList() {
  var today = todayStr();
  var filter = App.todoFilter || "";
  var keep = function (t) { return !filter || (filter === "none" ? !t.category : t.category === filter); };
  var all = L.groupTodos(App.ctx, today);
  var g = {};
  Object.keys(all).forEach(function (k) { g[k] = all[k].filter(keep); });
  var done = App.data.todos.filter(function (t) { return t.done && keep(t); }).sort(function (a, b) { return a.doneAt < b.doneAt ? 1 : -1; });
  var homework = [];
  for (var i = 0; i <= 14; i++) homework = homework.concat(L.homeworkDueOn(App.ctx, L.addDays(today, i)));
  function group(title, list) {
    return list.length ? [el("div", { class: "section-title" }, title + " · " + list.length), el("div", { class: "panel" }, el("ul", { class: "list" }, list.map(todoItem)))] : [];
  }
  var open = g.overdue.length + g.today.length + g.week.length + g.later.length + g.someday.length;
  var chips = [["", "All"]].concat(App.ctx.categories.map(function (c) { return [c.id, c.name]; })).concat([["none", "No category"]]);
  return el("div", { class: "page", style: "max-width:760px" }, [
    el("header", { class: "page-head" }, [
      el("div", {}, [el("h1", {}, open ? open + " to do" : "All clear")]),
      el("div", { class: "head-tools" }, el("button", { type: "button", class: "btn btn-ink", onclick: function () { openTodoEditor(null, { category: filter && filter !== "none" ? filter : "" }); } }, "New to-do"))
    ]),
    tasksSwitch("todos"),
    needsDatePanel(),
    el("div", { class: "filter-chips", role: "group", "aria-label": "Category" }, chips.map(function (c) {
      var cat = App.ctx.categoryById[c[0]];
      return el("button", { type: "button", class: "filter-chip" + (cat ? " c-" + cat.colour : ""), "aria-pressed": filter === c[0] ? "true" : "false",
        onclick: function () { App.todoFilter = c[0]; render(); } }, c[1]);
    })),
    el("div", { class: "panel" }, [el("div", { class: "label", style: "margin-bottom:-4px" }, "Quick add"), quickAddTodo("")])
  ].concat(group("Overdue", g.overdue), group("Today", g.today), group("Next 7 days", g.week), group("Later", g.later), group("No due date", g.someday), [
    el("div", { class: "section-title" }, "Homework to collect · next 2 weeks"),
    el("div", { class: "panel" }, homework.length ? el("ul", { class: "list" }, homework.map(homeworkRow)) : el("p", { class: "empty" }, "No homework due in the next two weeks.")),
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

function renderMarks() {
  var open = L.marksByDue(App.ctx);
  var done = App.ctx.marks.filter(function (m) { return m.done; }).sort(function (a, b) { return a.doneAt < b.doneAt ? 1 : -1; });
  var today = todayStr();
  var overdue = open.filter(function (m) { return m.due && m.due < today; });
  var rest = open.filter(function (m) { return !(m.due && m.due < today); });
  return el("div", { class: "page", style: "max-width:760px" }, [
    el("header", { class: "page-head" }, [
      el("div", {}, [el("h1", {}, open.length ? open.length + " to mark" : "Nothing to mark")]),
      el("div", { class: "head-tools" }, el("button", { type: "button", class: "btn btn-ink", onclick: function () { openMarkEditor(null, {}); } }, "New marking"))
    ]),
    tasksSwitch("mark"),
    overdue.length ? el("div", { class: "section-title" }, "Overdue · " + overdue.length) : null,
    overdue.length ? el("div", { class: "panel" }, el("ul", { class: "list" }, overdue.map(markRow))) : null,
    el("div", { class: "section-title" }, "To mark · " + rest.length),
    el("div", { class: "panel" }, rest.length ? el("ul", { class: "list" }, rest.map(markRow)) :
      el("p", { class: "empty" }, "Nothing waiting. When homework is handed in, press “Add to marking” on it.")),
    done.length ? el("details", { style: "margin-top:24px" }, [
      el("summary", { class: "section-title", style: "cursor:pointer;margin:0 0 10px" }, "Finished · " + done.length),
      el("div", { class: "panel" }, el("ul", { class: "list" }, done.slice(0, 50).map(markRow)))
    ]) : null
  ]);
}

// ---------- undated items ----------
function undatedRows(after) {
  var u = L.undated(App.ctx);
  var today = todayStr();
  function picker(label, onPick) {
    var input = el("input", { class: "input input-sm", type: "date", "aria-label": "Date for " + label });
    input.addEventListener("change", function () { if (input.value) onPick(input.value, input); });
    return el("div", { class: "row", style: "gap:6px" }, [
      el("button", { type: "button", class: "btn btn-sm", onclick: function (e) { onPick(L.addDays(today, 1), e.currentTarget); } }, "Tomorrow"),
      input
    ]);
  }
  function settle(promise, apply, what, node) {
    busy(node && node.tagName === "BUTTON" ? node : null, promise).then(function (res) { apply(res); toast(what + " dated."); if (after) after(); }, fail);
  }
  var rows = [];
  u.todos.forEach(function (t) {
    rows.push(el("li", { class: "undated-row" }, [el("div", {}, [el("span", { class: "chip" }, "To-do"), " ", el("b", {}, t.title)]),
      picker(t.title, function (d, node) { settle(api("saveTodo", Object.assign({}, t, { due: d })), function (res) { setData(withList("todos", res.todo, idOf)); }, "To-do", node); })]));
  });
  u.homework.forEach(function (e) {
    var cls = App.ctx.classById[e.classId];
    rows.push(el("li", { class: "undated-row" }, [el("div", {}, [el("span", { class: "chip class-chip " + classColour(cls) }, "Homework due"), " ",
      el("b", {}, cls.name + ": " + e.homework), el("span", { class: "hint" }, " · set " + L.shortDate(e.date))]),
      picker(e.homework, function (d, node) { settle(api("saveLog", Object.assign({}, e, { homeworkDue: d })), function (res) { applyLog(res.entry, logKey(e)); }, "Homework", node); })]));
  });
  u.marks.forEach(function (m) {
    rows.push(el("li", { class: "undated-row" }, [el("div", {}, [el("span", { class: "chip chip-E" }, "Return marking"), " ", el("b", {}, m.title)]),
      picker(m.title, function (d, node) { settle(api("saveMark", Object.assign({}, m, { due: d })), function (res) { setData(withList("marks", res.mark, idOf)); }, "Marking", node); })]));
  });
  return rows;
}

function needsDatePanel() {
  var rows = undatedRows();
  if (!rows.length) return null;
  return el("section", { class: "panel panel-attn" }, [
    el("div", { class: "panel-head" }, [el("h2", {}, "Needs a date"), el("span", { class: "hint" }, rows.length + (rows.length === 1 ? " item" : " items"))]),
    el("ul", { class: "list" }, rows.slice(0, 6)),
    rows.length > 6 ? el("button", { type: "button", class: "btn btn-quiet btn-sm", onclick: function () { openUndatedPrompt(true); } }, "See all " + rows.length) : null
  ]);
}

// The full list, from the card's "See all".
function openUndatedPrompt() {
  var list = el("ul", { class: "list" });
  function refill() {
    var rows = undatedRows(refill);
    if (!rows.length) { closeLayer(); toast("Everything has a date now."); return; }
    list.replaceChildren.apply(list, rows);
  }
  refill();
  if (!list.firstChild) return;
  openDrawer("These need a date", "Give each one a date so it shows up on the right day. You can leave any of them empty.", [list], [
    el("button", { type: "button", class: "btn", onclick: function () { closeLayer(); } }, "Close")
  ]);
}
