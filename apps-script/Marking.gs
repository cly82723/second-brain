/* Marking ("To mark"), class name lists, and the link to a teacher's own gradebook scoresheet.

   The scoresheet is the Google Sheets "Gradebook" template: on its Grades tab, class numbers are in
   column A and names in column B from row 6; each assignment is a column with its title in row 2 and
   full marks in row 3; the template's formulas only cover columns D–AA and rows 6–45. Writing is
   deliberately careful: the teacher sees a preview first, the app only ever fills a column that is
   completely empty, never touches rows 4–5 (the averages) or any cell with something in it, and stops
   when the gradebook is full instead of writing outside the formulas. */

var GRADEBOOK = { tab: "Grades", titleRow: 2, pointsRow: 3, firstRow: 6, lastRow: 45, firstCol: 4, lastCol: 27, noCol: 1, nameCol: 2 };
var HAND_IN_TEXT = { L: "Late", A: "Absent", M: "Missing" };
var SHEET_ID_PATTERN = /^[A-Za-z0-9_-]{20,100}$/;

// ---------- name lists ----------
function rostersByClass_() {
  var byClass = {};
  readTab_("Students").forEach(function (s) {
    (byClass[s.classId] = byClass[s.classId] || []).push({ no: Number(s.no), name: s.name });
  });
  Object.keys(byClass).forEach(function (k) { byClass[k].sort(function (a, b) { return a.no - b.no; }); });
  return byClass;
}

function requireClass_(classId) {
  if (!classIdSet_()[classId]) throw new UserError_("That class isn't in your list any more. Please reload the page.");
}

function writeRoster_(classId, roster) {
  var others = readTab_("Students").filter(function (s) { return s.classId !== classId; });
  replaceTab_("Students", others.concat(roster.map(function (s) { return { classId: classId, no: s.no, name: s.name }; })));
}

function saveRoster(classId, list) {
  return respond_(function () {
    return withLock_(function () {
      requireClass_(classId);
      var roster = cleanRoster_(list);
      writeRoster_(classId, roster);
      return { classId: classId, roster: roster };
    });
  });
}

// ---------- marking ----------
function saveMark(mark) {
  return respond_(function () {
    return withLock_(function () {
      var clean = cleanMark_(mark, classIdSet_(), today_());
      var existing = readTab_("Marks").filter(function (m) { return m.id === clean.id; })[0];
      if (!existing && readTab_("Marks").length >= LIMITS.marks) throw new UserError_("You've reached the limit of " + LIMITS.marks + " marking items. Delete some finished ones first.");
      // Which scoresheet column it was written to is the web app's own record, never the page's.
      if (existing) clean.sheetCol = existing.sheetCol || "";
      return { mark: saveWithReminder_("Marks", clean, existing) };
    });
  });
}

function deleteMark(id) {
  return respond_(function () {
    return withLock_(function () { return { removed: remove_("Marks", idKey_, cleanId_(id)) }; });
  });
}

// ---------- scoresheet ----------
function sheetIdFrom_(text) {
  var s = String(text || "").trim();
  var m = s.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,100})/);
  var id = m ? m[1] : s;
  if (!SHEET_ID_PATTERN.test(id)) throw new UserError_("That doesn't look like a Google Sheets link. Copy the address from the scoresheet's browser tab.");
  return id;
}

function openGradebook_(id) {
  var book;
  try {
    book = SpreadsheetApp.openById(id);
  } catch (e) {
    console.warn("Scoresheet " + id + " could not be opened: " + (e && e.message || e));
    throw new UserError_("The app can't open that scoresheet. In the scoresheet, press Share and add " +
      Session.getEffectiveUser().getEmail() + " as an Editor, then try again. If your school doesn't allow that, use Copy column instead.");
  }
  var sheet = book.getSheetByName(GRADEBOOK.tab);
  if (!sheet) throw new UserError_("That scoresheet has no tab called “" + GRADEBOOK.tab + "”. The app works with the Gradebook template.");
  return sheet;
}

function gradebookRows_() { return GRADEBOOK.lastRow - GRADEBOOK.firstRow + 1; }

// The students listed on the Grades tab: [{no, name, row}].
function gradebookRoster_(sheet) {
  var values = sheet.getRange(GRADEBOOK.firstRow, 1, gradebookRows_(), GRADEBOOK.nameCol).getValues();
  var list = [];
  values.forEach(function (r, i) {
    var no = Number(r[GRADEBOOK.noCol - 1]);
    var name = String(r[GRADEBOOK.nameCol - 1] || "").trim();
    if (no >= 1 && no <= 99 && Math.floor(no) === no && name) list.push({ no: no, name: name.slice(0, LIMITS.studentName), row: GRADEBOOK.firstRow + i });
  });
  return list;
}

function scoresheetIdFor_(classId) {
  var id = (readSettings_().scoresheets || {})[classId];
  if (!id) throw new UserError_("This class has no scoresheet linked yet. Add it in Settings → Name lists.");
  return id;
}

// Links a class to its scoresheet and takes the class's name list from it.
function linkScoresheet(classId, link) {
  return respond_(function () {
    return withLock_(function () {
      requireClass_(classId);
      var id = sheetIdFrom_(link);
      var roster = gradebookRoster_(openGradebook_(id)).map(function (s) { return { no: s.no, name: s.name }; });
      if (!roster.length) throw new UserError_("No students were found on the Grades tab (class numbers in column A and names in column B, from row 6).");
      var clean = cleanRoster_(roster);
      var sheets = Object.assign({}, readSettings_().scoresheets || {});
      sheets[classId] = id;
      writeSetting_("scoresheets", sheets);
      writeRoster_(classId, clean);
      return { classId: classId, roster: clean };
    });
  });
}

function unlinkScoresheet(classId) {
  return respond_(function () {
    return withLock_(function () {
      var sheets = Object.assign({}, readSettings_().scoresheets || {});
      delete sheets[classId];
      writeSetting_("scoresheets", sheets);
      return { classId: classId };
    });
  });
}

function columnLetter_(n) {
  var s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function cellIsBlank_(value, formula) { return (value === "" || value === null) && !formula; }

// The first assignment column whose title, full marks and every student cell are all empty.
function emptyGradebookColumn_(sheet) {
  var width = GRADEBOOK.lastCol - GRADEBOOK.firstCol + 1;
  var head = sheet.getRange(GRADEBOOK.titleRow, GRADEBOOK.firstCol, 2, width);
  var body = sheet.getRange(GRADEBOOK.firstRow, GRADEBOOK.firstCol, gradebookRows_(), width);
  var hv = head.getValues(), hf = head.getFormulas(), bv = body.getValues(), bf = body.getFormulas();
  for (var c = 0; c < width; c++) {
    var blank = [0, 1].every(function (r) { return cellIsBlank_(hv[r][c], hf[r][c]); }) &&
      bv.every(function (row, r) { return cellIsBlank_(row[c], bf[r][c]); });
    if (blank) return GRADEBOOK.firstCol + c;
  }
  return 0;
}

function cleanFullMarks_(value) {
  if (value === undefined || value === null || value === "") return "";
  var n = Number(value);
  if (!(n > 0 && n <= 1000)) throw new UserError_("Full marks must be a number from 1 to 1000.");
  return n;
}

// What a write would do, without doing it.
function scoresheetPlan_(markId, fullMarks) {
  var mark = readTab_("Marks").filter(function (m) { return m.id === markId; })[0];
  if (!mark) throw new UserError_("That marking item isn't there any more. Please reload the page.");
  if (!mark.classId) throw new UserError_("Choose the class for this marking first.");
  if (mark.sheetCol) throw new UserError_("This marking was already written to column " + mark.sheetCol + " of the scoresheet.");
  var sheet = openGradebook_(scoresheetIdFor_(mark.classId));
  var col = emptyGradebookColumn_(sheet);
  if (!col) throw new UserError_("The scoresheet's assignment columns (D to AA) are all used, so nothing was written. Make room there, or start a new gradebook.");
  var roster = gradebookRoster_(sheet);
  var students = mark.students || {};
  var inSheet = Object.create(null);
  var cells = roster.map(function (s) {
    inSheet[s.no] = true;
    var st = students[String(s.no)] || {};
    return { row: s.row, no: s.no, name: s.name, value: HAND_IN_TEXT[st.s] || "", unrecorded: !st.s };
  });
  return {
    mark: mark, sheet: sheet, col: col, column: columnLetter_(col),
    title: mark.title + (mark.collected ? " (" + logic_().shortDate(mark.collected) + ")" : ""),
    fullMarks: cleanFullMarks_(fullMarks),
    cells: cells,
    missingFromSheet: Object.keys(students).filter(function (no) { return !inSheet[no]; }).map(Number)
  };
}

function previewScoresheet(markId, fullMarks) {
  return respond_(function () {
    var plan = scoresheetPlan_(cleanId_(markId), fullMarks);
    return {
      column: plan.column, title: plan.title, fullMarks: plan.fullMarks,
      cells: plan.cells.map(function (c) { return { no: c.no, name: c.name, value: c.value, unrecorded: c.unrecorded }; }),
      missingFromSheet: plan.missingFromSheet
    };
  });
}

// Writes only after the teacher saw the preview for this exact column; if the sheet changed since
// (someone typed in that column), nothing is written and they're asked to look again.
function writeScoresheet(markId, column, fullMarks) {
  return respond_(function () {
    return withLock_(function () {
      var plan = scoresheetPlan_(cleanId_(markId), fullMarks);
      if (plan.column !== column) throw new UserError_("The scoresheet changed since the preview (column " + column + " isn't empty any more). Please preview again.");
      // As plain text, so a title like "1/2" or "=x" isn't turned into a date or formula.
      plan.sheet.getRange(GRADEBOOK.titleRow, plan.col).setNumberFormat("@").setValue(plan.title);
      if (plan.fullMarks !== "") plan.sheet.getRange(GRADEBOOK.pointsRow, plan.col).setValue(plan.fullMarks);
      var written = 0;
      plan.cells.forEach(function (c) {
        if (!c.value) return;
        plan.sheet.getRange(c.row, plan.col).setValue(c.value);
        written++;
      });
      var saved = upsert_("Marks", idKey_, Object.assign({}, plan.mark, { sheetCol: plan.column }));
      return { mark: saved, column: plan.column, written: written };
    });
  });
}
