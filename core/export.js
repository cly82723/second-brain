/* Excel export for book inspection, made in the browser from the notes already loaded.
   One tab per class plus "All classes"; every timetabled lesson in the range is listed, including
   ones with nothing written, so the record is complete. The spreadsheet library (SheetJS) is only
   fetched the first time someone exports. */

var EXPORT_MAX_DAYS = 400;
var EXPORT_HEADERS = ["Date", "Day", "Periods", "Plan / covered", "Remind students", "Homework", "Homework due", "Notes", "Done"];
var EXPORT_WIDTHS = [16, 9, 9, 48, 30, 32, 14, 30, 7]; // in characters
var XLSX_SRC = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";

// Resolves to {url, filename, lessons}, or rejects with a message to show.
function exportExcel(data, request) {
  var from = request.from, to = request.to;
  if (!L.isDate(from) || !L.isDate(to)) return Promise.reject(new Error("Please choose both dates."));
  if (to < from) return Promise.reject(new Error("The end date must be on or after the start date."));
  if (L.daysBetween(from, to) > EXPORT_MAX_DAYS) return Promise.reject(new Error("Please export at most about a year at a time."));
  var ctx = L.prepare(data);
  var wanted = (request.classIds || []).filter(function (id) { return ctx.classById[id]; });
  if (!wanted.length) return Promise.reject(new Error("Please choose at least one class."));
  var tables = exportTables(ctx, from, to, wanted);
  return loadXlsx().then(function (lib) {
    var book = lib.utils.book_new();
    var used = Object.create(null);
    tables.classes.map(function (t) { return { name: t.name, headers: EXPORT_HEADERS, rows: t.rows }; })
      .concat([tables.all]).forEach(function (t) {
        var sheet = lib.utils.aoa_to_sheet([t.headers].concat(t.rows));
        var widths = t.headers.length > EXPORT_WIDTHS.length ? [14].concat(EXPORT_WIDTHS) : EXPORT_WIDTHS;
        sheet["!cols"] = widths.map(function (w) { return { wch: w }; });
        lib.utils.book_append_sheet(book, sheet, uniqueTabName(t.name, used));
      });
    var bytes = lib.write(book, { bookType: "xlsx", type: "array" });
    var blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    return { url: URL.createObjectURL(blob), filename: "Logbook " + from + " to " + to + ".xlsx", lessons: tables.all.rows.length };
  });
}

// Pure: the rows for each class tab and the combined tab.
function exportTables(ctx, from, to, classIds) {
  var wanted = Object.create(null);
  classIds.forEach(function (id) { wanted[id] = true; });
  var byClass = Object.create(null);
  classIds.forEach(function (id) { byClass[id] = []; });
  var all = [];
  for (var day = from; day <= to; day = L.addDays(day, 1)) {
    L.lessonsOn(ctx, day).forEach(function (lesson) {
      if (!wanted[lesson.classId]) return;
      var row = exportRow(ctx, lesson);
      byClass[lesson.classId].push(row);
      all.push([lesson.cls.name].concat(row));
    });
  }
  return {
    classes: classIds.map(function (id) { return { name: ctx.classById[id].name, rows: byClass[id] }; }),
    all: { name: "All classes", headers: ["Class"].concat(EXPORT_HEADERS), rows: all }
  };
}

function exportRow(ctx, lesson) {
  var e = lesson.entry || {};
  var notes = [lesson.replacedBy ? "Replaced by: " + lesson.replacedBy.title : "", e.notes || ""].filter(Boolean).join("\n");
  return [
    L.shortDate(lesson.date) + " " + lesson.date.slice(0, 4),
    L.cycleName(ctx.school, lesson.cycleDay),
    lesson.periodText,
    e.plan || "", e.remind || "", e.homework || "",
    e.homeworkDue ? L.shortDate(e.homeworkDue) : "",
    notes,
    e.done ? "Yes" : ""
  ];
}

// Excel tab names: at most 31 characters, none of []*?/\: and no apostrophe at either end.
function uniqueTabName(name, used) {
  var base = name.replace(/[\[\]\*\?\/\\:]/g, " ").replace(/^'+|'+$/g, "").trim().slice(0, 28) || "Class";
  var candidate = base;
  for (var n = 2; used[candidate.toLowerCase()]; n++) candidate = base.slice(0, 24) + " (" + n + ")";
  used[candidate.toLowerCase()] = true;
  return candidate;
}

var xlsxLoading = null;
function loadXlsx() {
  if (typeof XLSX !== "undefined") return Promise.resolve(XLSX);
  if (!xlsxLoading) {
    xlsxLoading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = XLSX_SRC;
      s.onload = function () { resolve(XLSX); };
      s.onerror = function () { xlsxLoading = null; reject(new Error("Couldn't load the Excel maker. Check your connection and try again.")); };
      document.head.appendChild(s);
    });
  }
  return xlsxLoading;
}
