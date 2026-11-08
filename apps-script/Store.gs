/* The notes live in a Google Sheet in the owner's Drive, created the first time the app is used.
   The web app runs as its owner, so this is always the owner's Sheet; its ID is kept in the script's
   properties. The owner may look at the Sheet, but should change things in the app. */

var DATA_FILE_NAME = "Teachers' Second Brain – my data (please edit in the app)";
var SHEET_ID_KEY = "dataSheetId";

var TABS = {
  Settings: { headers: ["Key", "Value"], fields: ["key", "value"] },
  Classes: { headers: ["Id", "Name", "Colour"], fields: ["id", "name", "colour"] },
  Timetable: { headers: ["Day", "Period", "Class Id"], fields: ["day", "period", "classId"] },
  // New columns go on the end, so Sheets made by older versions keep working (see syncHeaders_).
  Log: {
    headers: ["Date", "Class Id", "Plan", "Remind students", "Homework", "Homework due", "Notes", "Done", "Updated",
      "Covered", "Follow up next lesson", "Follow-up done"],
    fields: ["date", "classId", "plan", "remind", "homework", "homeworkDue", "notes", "done", "updated",
      "covered", "followUp", "followUpDone"]
  },
  Events: {
    headers: ["Id", "Title", "Date", "Start", "End", "Repeat", "Repeat on", "Until", "Replaces lessons", "Notes"],
    fields: ["id", "title", "date", "start", "end", "repeat", "repeatOn", "until", "replaces", "notes"]
  },
  Todos: {
    headers: ["Id", "Title", "Due", "Time", "Class Id", "Notes", "Done", "Done on", "Category"],
    fields: ["id", "title", "due", "time", "classId", "notes", "done", "doneAt", "category"]
  },
  Marks: {
    headers: ["Id", "What", "Class Id", "Collected", "Return by", "Scripts", "Marked", "Notes", "Done", "Done on",
      "From homework", "Students (app use)", "Scoresheet column"],
    fields: ["id", "title", "classId", "collected", "due", "scripts", "marked", "notes", "done", "doneAt",
      "homework", "students", "sheetCol"]
  },
  Students: { headers: ["Class Id", "No.", "Name"], fields: ["classId", "no", "name"] }
};
var NUMBER_FIELDS = { day: true, repeatOn: true, scripts: true, marked: true, no: true };
var BOOLEAN_FIELDS = { done: true, replaces: true, followUpDone: true };
// Kept in one cell as JSON: {classNo: {s: "S"|"L"|"A"|"M"|"", m: true|false}}.
var JSON_FIELDS = { students: true };

// The owner's Sheet keeps the original property name, so existing data is found unchanged.
function sheetIdKeyFor_(notebook) {
  return notebook.owner ? SHEET_ID_KEY : SHEET_ID_KEY + ":" + notebook.id;
}

// Notebooks that have been opened at least once (so checking them never creates a Sheet).
function notebooksWithData_() {
  var props = PropertiesService.getScriptProperties();
  return allNotebooks_().filter(function (nb) { return !!props.getProperty(sheetIdKeyFor_(nb)); });
}

function book_() {
  var props = PropertiesService.getScriptProperties();
  var idKey = sheetIdKeyFor_(currentNotebook_);
  var id = props.getProperty(idKey);
  if (id) {
    var opened = openDataSheet_(id);
    if (opened) return opened;
  }
  // Creating is done under the script lock, so two pages opened at once can't make two sheets.
  var lock = LockService.getScriptLock();
  var hadLock = lock.hasLock();
  if (!hadLock) lock.waitLock(20000);
  try {
    var again = props.getProperty(idKey);
    if (again && again !== id) return openDataSheet_(again) || createDataSheet_(props, idKey);
    return createDataSheet_(props, idKey);
  } finally {
    if (!hadLock) lock.releaseLock();
  }
}

// Null only when the sheet is definitely gone (deleted, or no longer shared with this account).
// Any other failure is usually a passing hiccup at Google, so the teacher is asked to retry
// instead of being moved to an empty sheet.
function openDataSheet_(id) {
  try {
    return SpreadsheetApp.openById(id);
  } catch (e) {
    var message = String(e && e.message || e);
    if (/not found|no item|does not exist|permission/i.test(message)) {
      console.warn("Data sheet " + id + " is gone, so a new one is being made: " + message);
      return null;
    }
    console.error("Data sheet " + id + " could not be opened: " + message);
    throw new UserError_("Google couldn't open your data just now. Please try again in a moment.");
  }
}

function createDataSheet_(props, idKey) {
  var name = currentNotebook_.owner ? DATA_FILE_NAME : DATA_FILE_NAME + " – " + currentNotebook_.name;
  var book = SpreadsheetApp.create(name);
  Object.keys(TABS).forEach(function (tabName, i) {
    var sheet = i === 0 ? book.getSheets()[0].setName(tabName) : book.insertSheet(tabName);
    addHeaders_(sheet, tabName);
  });
  props.setProperty(idKey, book.getId());
  return book;
}

function addHeaders_(sheet, name) {
  sheet.appendRow(TABS[name].headers);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, TABS[name].headers.length).setFontWeight("bold");
}

var syncedTabs_ = {};

function tab_(name) {
  var book = book_();
  var sheet = book.getSheetByName(name);
  if (!sheet) {
    sheet = book.insertSheet(name);
    addHeaders_(sheet, name);
  } else {
    syncHeaders_(book, sheet, name);
  }
  return sheet;
}

// A Sheet made before a column was added gets the new header names, once per run.
function syncHeaders_(book, sheet, name) {
  var key = book.getId() + "|" + name;
  if (syncedTabs_[key]) return;
  syncedTabs_[key] = true;
  var headers = TABS[name].headers;
  var current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (current.some(function (v, i) { return v !== headers[i]; })) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
  }
}

function fromCell_(field, value) {
  if (BOOLEAN_FIELDS[field]) return value === true || value === "yes" || value === "TRUE";
  if (JSON_FIELDS[field]) {
    if (!value) return {};
    try { var parsed = JSON.parse(String(value)); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; }
    catch (e) { return {}; }
  }
  if (value instanceof Date) {
    var format = field === "start" || field === "end" || field === "time" ? "HH:mm" : "yyyy-MM-dd";
    return Utilities.formatDate(value, Session.getScriptTimeZone(), format);
  }
  if (NUMBER_FIELDS[field]) return value === "" ? "" : Number(value);
  return value === null || value === undefined ? "" : String(value);
}

// A leading apostrophe keeps Sheets from turning "2026-11-05" into a date or "=..." into a formula.
function toCell_(field, value) {
  if (BOOLEAN_FIELDS[field]) return value ? "yes" : "";
  if (JSON_FIELDS[field]) return value && Object.keys(value).length ? "'" + JSON.stringify(value) : "";
  if (value === "" || value === null || value === undefined) return "";
  return "'" + String(value);
}

function isBlankRow_(row) { return !row.some(function (v) { return v !== ""; }); }

function rowObject_(fields, row) {
  var obj = {};
  fields.forEach(function (f, i) { obj[f] = fromCell_(f, row[i] === undefined ? "" : row[i]); });
  return obj;
}

function readTab_(name) {
  var fields = TABS[name].fields;
  return tab_(name).getDataRange().getValues().slice(1)
    .filter(function (row) { return !isBlankRow_(row); })
    .map(function (row) { return rowObject_(fields, row); });
}

function toRow_(name, obj) {
  return TABS[name].fields.map(function (f) { return toCell_(f, obj[f]); });
}

// Writes the new rows first and only then trims what's left over, so a failure part-way
// never leaves the tab empty.
function replaceTab_(name, objects) {
  var sheet = tab_(name);
  var width = TABS[name].fields.length;
  if (objects.length) {
    sheet.getRange(2, 1, objects.length, width).setValues(objects.map(function (o) { return toRow_(name, o); }));
  }
  var last = sheet.getLastRow();
  var keep = objects.length + 1;
  if (last > keep) sheet.deleteRows(keep + 1, last - keep);
}

// Real sheet row numbers, counting any blank rows someone left in the Sheet.
function findRow_(name, keyOf, key) {
  var fields = TABS[name].fields;
  var rows = tab_(name).getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (!isBlankRow_(rows[i]) && keyOf(rowObject_(fields, rows[i])) === key) return i + 1;
  }
  return 0;
}

function upsert_(name, keyOf, obj) {
  var sheet = tab_(name);
  var row = findRow_(name, keyOf, keyOf(obj));
  if (row) sheet.getRange(row, 1, 1, TABS[name].fields.length).setValues([toRow_(name, obj)]);
  else sheet.appendRow(toRow_(name, obj));
  return obj;
}

function remove_(name, keyOf, key) {
  var row = findRow_(name, keyOf, key);
  if (row) tab_(name).deleteRow(row);
  return !!row;
}

function readSettings_() {
  var settings = {};
  readTab_("Settings").forEach(function (r) {
    try {
      settings[r.key] = JSON.parse(r.value);
    } catch (e) {
      console.warn("Setting " + r.key + " is not valid JSON and was ignored.");
    }
  });
  return settings;
}

function writeSetting_(key, value) {
  upsert_("Settings", function (r) { return r.key; }, { key: key, value: JSON.stringify(value) });
}

function logKey_(e) { return e.date + "|" + e.classId; }
function idKey_(o) { return o.id; }

function dataSheetUrl_() {
  return book_().getUrl();
}
