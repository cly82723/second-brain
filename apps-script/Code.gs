/* Teachers' Second Brain: the web app the page (https://cly82723.github.io/second-brain/) talks to.
   Works like CLY English: deployed to run as its owner, open to anyone, no sign-in. Every request is a
   POST of {action, key, args} sent as text/plain (so the browser skips the CORS preflight Apps Script
   can't answer). The key is the secret code from the owner's personal link; without it, nothing is
   read or written. Notes live in a Google Sheet in the owner's Drive (Store.gs). Setup: README.md. */

var APP_NAME = "Teachers' Second Brain";
var SITE_URL = "https://cly82723.github.io/second-brain/";
var ACCESS_KEY_PROP = "ACCESS_KEY";

// What the page may ask for. Each returns {ok, data} or {ok: false, error}.
function actionFor_(name) {
  var actions = {
    getAll: getAll, getDataSheetUrl: getDataSheetUrl, saveSetup: saveSetup, saveLog: saveLog,
    carryForward: carryForward, saveEvent: saveEvent, deleteEvent: deleteEvent, saveTodo: saveTodo,
    deleteTodo: deleteTodo, clearDoneTodos: clearDoneTodos, importData: importData,
    saveEmail: saveEmail, sendTestEmail: sendTestEmail
  };
  return Object.prototype.hasOwnProperty.call(actions, name) ? actions[name] : null;
}

function doGet() { return json_({ ok: true, service: APP_NAME }); }

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return json_({ ok: false, error: "That request didn't make sense. Please reload the page." });
  }
  if (!keyMatches_(body.key)) {
    return json_({ ok: false, locked: true, error: "This notebook is private. Open your personal link to use it on this device." });
  }
  var action = actionFor_(body.action);
  if (!action) return json_({ ok: false, error: "Unknown request. Please reload the page." });
  var args = Array.isArray(body.args) ? body.args : [];
  return json_(action.apply(null, args));
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// Compares in constant time, so the code can't be guessed a character at a time.
function keyMatches_(given) {
  var key = PropertiesService.getScriptProperties().getProperty(ACCESS_KEY_PROP);
  if (!key || typeof given !== "string" || given.length !== key.length) return false;
  var diff = 0;
  for (var i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

// Run once from the editor (select createAccessKey, press Run): makes the secret code and logs your
// personal link. Running it again just shows the same link. Delete ACCESS_KEY in Project Settings →
// Script properties and run it again to make a new link (every device then needs the new one).
function createAccessKey() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty(ACCESS_KEY_PROP);
  if (!key) {
    key = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
    props.setProperty(ACCESS_KEY_PROP, key);
  }
  var link = SITE_URL + "#k=" + key;
  console.log("Your personal link (keep it private): " + link);
  return link;
}

// Every action goes through here: {ok: true, data} or {ok: false, error} with a readable message.
function respond_(work) {
  try {
    return { ok: true, data: work() };
  } catch (e) {
    if (e instanceof UserError_) return { ok: false, error: e.message };
    console.error(e && e.stack ? e.stack : e);
    return { ok: false, error: "Something went wrong on Google's side. Please try again in a moment." };
  }
}

// One owner, many devices: a script-wide lock keeps two saves from interleaving.
function withLock_(work) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return work();
  } finally {
    lock.releaseLock();
  }
}

function today_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function allData_() {
  var settings = readSettings_();
  var schoolId = schoolSpec_(settings.schoolId) ? settings.schoolId : DEFAULT_SCHOOL_ID;
  var spec = schoolSpec_(schoolId);
  return {
    email: Session.getEffectiveUser().getEmail(),
    today: today_(),
    schools: listSchools_(),
    colours: CLASS_COLOURS,
    emailHours: EMAIL_HOURS,
    settings: {
      schoolId: schoolId,
      setupDone: !!settings.setupDone,
      startDate: settings.startDate || "",
      email: settings.email || { on: false, hour: 20 }
    },
    school: buildSchool_(schoolId),
    periods: settings.periods || spec.periods,
    classes: readTab_("Classes"),
    timetable: readTab_("Timetable"),
    log: readTab_("Log"),
    events: readTab_("Events"),
    todos: readTab_("Todos")
  };
}

function context_() {
  return logic_().prepare(allData_());
}

// Prototype-free, so a name like "constructor" can't pass as a class id.
function classIdSet_() {
  var ids = Object.create(null);
  readTab_("Classes").forEach(function (c) { ids[c.id] = true; });
  return ids;
}

function getAll() {
  return respond_(allData_);
}

function getDataSheetUrl() {
  return respond_(function () { return { url: dataSheetUrl_() }; });
}

// School, periods, classes and timetable, all saved together.
function saveSetup(setup) {
  return respond_(function () {
    return withLock_(function () {
      writeSetup_(checkedSetup_(setup || {}));
      return allData_();
    });
  });
}

// Checks a setup without writing anything.
function checkedSetup_(setup) {
  var spec = schoolSpec_(setup.schoolId);
  if (!spec) throw new UserError_("Please choose your school.");
  var periods = cleanPeriods_(setup.periods);
  var classes = cleanClasses_(setup.classes);
  var timetable = cleanTimetable_(setup.timetable, periods, classes, spec.cycleLength);
  refuseRemovingLoggedClasses_(classes);
  return { spec: spec, periods: periods, classes: classes, timetable: timetable };
}

function writeSetup_(checked) {
  replaceTab_("Classes", checked.classes);
  replaceTab_("Timetable", checked.timetable);
  writeSetting_("schoolId", checked.spec.id);
  writeSetting_("periods", checked.periods);
  var settings = readSettings_();
  if (!settings.startDate) writeSetting_("startDate", today_());
  writeSetting_("setupDone", true);
}

function refuseRemovingLoggedClasses_(keptClasses) {
  var kept = Object.create(null);
  keptClasses.forEach(function (c) { kept[c.id] = true; });
  var names = Object.create(null);
  readTab_("Classes").forEach(function (c) { names[c.id] = c.name; });
  var removedWithEntries = Object.create(null);
  readTab_("Log").forEach(function (e) { if (!kept[e.classId] && names[e.classId]) removedWithEntries[names[e.classId]] = true; });
  var list = Object.keys(removedWithEntries);
  if (list.length) {
    throw new UserError_(list.join(", ") + " already has logbook entries, so it can't be deleted. " +
      "To stop it appearing, take it off the timetable instead.");
  }
}

function saveLog(entry) {
  return respond_(function () {
    return withLock_(function () { return { entry: writeLog_(cleanLogEntry_(entry, classIdSet_())) }; });
  });
}

// An entry with nothing in it is removed rather than kept as an empty row.
function writeLog_(clean) {
  if (!clean.done && !logic_().hasWriting(clean) && !clean.homeworkDue) {
    remove_("Log", logKey_, logKey_(clean));
    return null;
  }
  return upsert_("Log", logKey_, Object.assign({}, clean, { updated: today_() }));
}

// "Didn't finish": ticks this lesson and adds what's left to the top of the class's next lesson.
function carryForward(request) {
  return respond_(function () {
    return withLock_(function () {
      var L = logic_();
      var ctx = context_();
      var current = cleanLogEntry_(request && request.entry, classIdSet_());
      var leftover = requiredText_(request && request.leftover, LIMITS.text, "What's left");
      var next = L.nextLesson(ctx, current.classId, current.date);
      if (!next) throw new UserError_("There's no later lesson with this class in the calendar to move it to.");
      var existing = next.entry || { date: next.date, classId: current.classId };
      var line = "From " + L.shortDate(current.date) + ": " + leftover;
      var nextEntry = cleanLogEntry_(Object.assign({}, existing, {
        plan: existing.plan ? line + "\n" + existing.plan : line
      }), classIdSet_());
      return {
        current: writeLog_(Object.assign({}, current, { done: true })),
        next: writeLog_(Object.assign({}, nextEntry, { done: !!existing.done }))
      };
    });
  });
}

function saveEvent(ev) {
  return respond_(function () {
    return withLock_(function () {
      var spec = schoolSpec_(readSettings_().schoolId) || schoolSpec_(DEFAULT_SCHOOL_ID);
      var clean = cleanEvent_(ev, spec.cycleLength);
      var isNew = !findRow_("Events", idKey_, clean.id);
      if (isNew && readTab_("Events").length >= LIMITS.events) throw new UserError_("You've reached the limit of " + LIMITS.events + " events.");
      return { event: upsert_("Events", idKey_, clean) };
    });
  });
}

function deleteEvent(id) {
  return respond_(function () {
    return withLock_(function () { return { removed: remove_("Events", idKey_, cleanId_(id)) }; });
  });
}

function saveTodo(todo) {
  return respond_(function () {
    return withLock_(function () {
      var clean = cleanTodo_(todo, classIdSet_(), today_());
      var isNew = !findRow_("Todos", idKey_, clean.id);
      if (isNew && readTab_("Todos").length >= LIMITS.todos) throw new UserError_("You've reached the limit of " + LIMITS.todos + " to-dos. Delete some finished ones first.");
      return { todo: upsert_("Todos", idKey_, clean) };
    });
  });
}

function deleteTodo(id) {
  return respond_(function () {
    return withLock_(function () { return { removed: remove_("Todos", idKey_, cleanId_(id)) }; });
  });
}

// Clears finished to-dos, so the list and the Sheet stay small.
function clearDoneTodos() {
  return respond_(function () {
    return withLock_(function () {
      var open = readTab_("Todos").filter(function (t) { return !t.done; });
      replaceTab_("Todos", open);
      return { todos: open };
    });
  });
}
