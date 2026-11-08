/* Periods (a teacher's logbook): the web app the page (https://cly82723.github.io/second-brain/) talks to.
   Works like CLY English: deployed to run as its owner, open to anyone, no sign-in. Every request is a
   POST of {action, key, args} sent as text/plain (so the browser skips the CORS preflight Apps Script
   can't answer). The key is the secret code from the owner's personal link; without it, nothing is
   read or written. Notes live in a Google Sheet in the owner's Drive (Store.gs). Setup: README.md.

   Other teachers can have their own notebook on the same deployment (addTeacher below): each gets
   their own secret link and their own Sheet, also in the owner's Drive. The key picks the notebook. */

var APP_NAME = "Periods";
var SITE_URL = "https://cly82723.github.io/second-brain/";
var ACCESS_KEY_PROP = "ACCESS_KEY";
var NOTEBOOKS_PROP = "NOTEBOOKS";
var OWNER_NOTEBOOK = { id: "owner", name: "", email: "", owner: true };
var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Whose notebook this request is for. Apps Script starts every request fresh, so this never leaks
// from one request into another. Functions run from the editor or a trigger start on the owner's.
var currentNotebook_ = OWNER_NOTEBOOK;

// To give another teacher their own notebook: fill in their name (and email, for the evening
// email), select addTeacher in the toolbar, press Run, and send them the link it logs.
// Running it again with the same name shows the same link (and updates the email).
var NEW_TEACHER = { name: "", email: "" };

// What the page may ask for. Each returns {ok, data} or {ok: false, error}.
function actionFor_(name) {
  var actions = {
    getAll: getAll, getDataSheetUrl: getDataSheetUrl, saveSetup: saveSetup, saveLog: saveLog,
    carryForward: carryForward, saveEvent: saveEvent, deleteEvent: deleteEvent, saveTodo: saveTodo,
    deleteTodo: deleteTodo, clearDoneTodos: clearDoneTodos, importData: importData,
    saveEmail: saveEmail, saveReminders: saveReminders, sendTestEmail: sendTestEmail, saveCategories: saveCategories,
    saveMark: saveMark, deleteMark: deleteMark, saveRoster: saveRoster,
    linkScoresheet: linkScoresheet, unlinkScoresheet: unlinkScoresheet,
    previewScoresheet: previewScoresheet, writeScoresheet: writeScoresheet
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
  var notebook = notebookForKey_(body.key);
  if (!notebook) {
    return json_({ ok: false, locked: true, error: "This notebook is private. Open your personal link to use it on this device." });
  }
  currentNotebook_ = notebook;
  var action = actionFor_(body.action);
  if (!action) return json_({ ok: false, error: "Unknown request. Please reload the page." });
  var args = Array.isArray(body.args) ? body.args : [];
  return json_(action.apply(null, args));
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// The owner's code, or one of the other teachers' codes. Every code is checked, so the time taken
// doesn't reveal which one (if any) came close.
function notebookForKey_(given) {
  var found = null;
  if (sameKey_(PropertiesService.getScriptProperties().getProperty(ACCESS_KEY_PROP), given)) found = OWNER_NOTEBOOK;
  readNotebooks_().forEach(function (nb) { if (sameKey_(nb.key, given)) found = guestNotebook_(nb); });
  return found;
}

// Compares in constant time, so a code can't be guessed a character at a time.
function sameKey_(key, given) {
  if (!key || typeof key !== "string" || typeof given !== "string" || given.length !== key.length) return false;
  var diff = 0;
  for (var i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

// The other teachers, kept in the script's properties as [{id, name, email, key}].
// Reading for a request, a damaged list just refuses the other teachers' links. Reading in order to
// change it (strict), it stops instead, so a typo can never be saved over everyone's links.
function readNotebooks_(strict) {
  var raw = PropertiesService.getScriptProperties().getProperty(NOTEBOOKS_PROP);
  if (!raw) return [];
  var list = null;
  try { list = JSON.parse(raw); } catch (e) { list = null; }
  if (!Array.isArray(list)) {
    if (strict) throw new Error("The NOTEBOOKS script property is damaged. Fix it in Project Settings → Script properties first; nothing was changed.");
    console.error("The NOTEBOOKS script property is damaged, so other teachers' links are refused until it's fixed.");
    return [];
  }
  return strict ? list : list.filter(function (nb) { return nb && typeof nb.id === "string" && typeof nb.key === "string"; });
}

// What a request knows about a notebook: never its key.
function guestNotebook_(nb) {
  return { id: nb.id, name: nb.name || "", email: nb.email || "", owner: false };
}

function allNotebooks_() {
  return [OWNER_NOTEBOOK].concat(readNotebooks_().map(guestNotebook_));
}

// Runs work as if the request had come from that notebook's link.
function withNotebook_(notebook, work) {
  var previous = currentNotebook_;
  currentNotebook_ = notebook;
  try {
    return work();
  } finally {
    currentNotebook_ = previous;
  }
}

// Where this notebook's evening email goes: the owner's own address, or the one given in addTeacher.
function recipient_() {
  return currentNotebook_.owner ? Session.getEffectiveUser().getEmail() : currentNotebook_.email;
}

// Run from the editor after filling in NEW_TEACHER above.
function addTeacher() {
  var link = addNotebook_(NEW_TEACHER.name, NEW_TEACHER.email);
  console.log("Personal link for " + String(NEW_TEACHER.name).trim() + " (send it only to them): " + link);
  return link;
}

function addNotebook_(name, email) {
  var cleanName = String(name || "").trim();
  var cleanEmail = String(email || "").trim();
  if (!cleanName) throw new Error("Fill in NEW_TEACHER's name first (near the top of the Code.gs part), then run addTeacher again.");
  if (cleanName.length > 60) throw new Error("NEW_TEACHER's name is too long (60 characters at most).");
  if (cleanEmail && !EMAIL_PATTERN.test(cleanEmail)) throw new Error("NEW_TEACHER's email doesn't look like an email address.");
  return withLock_(function () {
    var list = readNotebooks_(true);
    var existing = list.filter(function (nb) { return String(nb.name).toLowerCase() === cleanName.toLowerCase(); })[0];
    var updated;
    if (existing) {
      updated = list.map(function (nb) { return nb === existing && cleanEmail ? Object.assign({}, nb, { email: cleanEmail }) : nb; });
    } else {
      existing = { id: "t" + Utilities.getUuid().replace(/-/g, "").slice(0, 12), name: cleanName, email: cleanEmail, key: newAccessKey_() };
      updated = list.concat([existing]);
    }
    PropertiesService.getScriptProperties().setProperty(NOTEBOOKS_PROP, JSON.stringify(updated));
    return SITE_URL + "#k=" + existing.key;
  });
}

// Run from the editor to see every other teacher's personal link again.
function listTeachers() {
  var list = readNotebooks_(true);
  if (!list.length) console.log("No other teachers yet. Fill in NEW_TEACHER and run addTeacher.");
  list.forEach(function (nb) {
    console.log(nb.name + (nb.email ? " <" + nb.email + ">" : " (no email)") + ": " + SITE_URL + "#k=" + nb.key);
  });
  return list.map(function (nb) { return { name: nb.name, email: nb.email || "", link: SITE_URL + "#k=" + nb.key }; });
}

function newAccessKey_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
}

// Run once from the editor (select createAccessKey, press Run): makes the secret code and logs your
// personal link. Running it again just shows the same link. Delete ACCESS_KEY in Project Settings →
// Script properties and run it again to make a new link (every device then needs the new one).
function createAccessKey() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty(ACCESS_KEY_PROP);
  if (!key) {
    key = newAccessKey_();
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
    email: recipient_(),
    owner: currentNotebook_.owner,
    // The account the web app runs as: a scoresheet must be shared with it to be linked.
    ownerEmail: Session.getEffectiveUser().getEmail(),
    today: today_(),
    schools: listSchools_(),
    colours: CLASS_COLOURS,
    emailHours: EMAIL_HOURS,
    settings: {
      schoolId: schoolId,
      setupDone: !!settings.setupDone,
      startDate: settings.startDate || "",
      email: settings.email || { on: false, hour: 20 },
      reminders: roundupsFrom_(settings).map(function (r) { return { id: r.id, time: r.time, covers: r.covers, on: r.on }; })
    },
    school: buildSchool_(schoolId),
    periods: settings.periods || spec.periods,
    categories: settings.categories || DEFAULT_CATEGORIES,
    classes: readTab_("Classes"),
    timetable: readTab_("Timetable"),
    log: readTab_("Log"),
    events: readTab_("Events"),
    todos: readTab_("Todos"),
    marks: readTab_("Marks"),
    rosters: rostersByClass_(),
    // Which classes have a scoresheet linked (the file id stays on the server).
    scoresheets: Object.keys(settings.scoresheets || {}).reduce(function (o, k) { o[k] = true; return o; }, {})
  };
}

// Whether a to-do's or marking's reminder has gone out is the web app's own record: it carries over
// only while the reminder time is unchanged, so moving the time sends it again.
function saveWithReminder_(tab, clean, existing) {
  if (existing && existing.remindAt === clean.remindAt) clean.remindSent = existing.remindSent || "";
  if (pendingItemReminder_(clean)) requireAddress_();
  var saved = upsert_(tab, idKey_, clean);
  if (pendingItemReminder_(clean)) ensureDigestTrigger_();
  return saved;
}

function requireAddress_() {
  if (!recipient_()) throw new UserError_(NO_ADDRESS);
}

function categoryIdSet_() {
  var ids = Object.create(null);
  (readSettings_().categories || DEFAULT_CATEGORIES).forEach(function (c) { ids[c.id] = true; });
  return ids;
}

function saveCategories(list) {
  return respond_(function () {
    return withLock_(function () {
      var clean = cleanCategories_(list);
      writeSetting_("categories", clean);
      return { categories: clean };
    });
  });
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
  return respond_(function () {
    if (!currentNotebook_.owner) throw new UserError_("Your notes are kept in a Google Sheet looked after by the person who set up this app. Ask them if you need a copy.");
    return { url: dataSheetUrl_() };
  });
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

// "Didn't finish": ticks this lesson and adds what's left to its follow-up, which then shows at the
// top of the class's next lesson until it's ticked off there.
function carryForward(request) {
  return respond_(function () {
    return withLock_(function () {
      var L = logic_();
      var ctx = context_();
      var current = cleanLogEntry_(request && request.entry, classIdSet_());
      var leftover = requiredText_(request && request.leftover, LIMITS.text, "What's left");
      var next = L.nextLesson(ctx, current.classId, current.date);
      if (!next) throw new UserError_("There's no later lesson with this class in the calendar to move it to.");
      var followUp = cleanLogEntry_(Object.assign({}, current, {
        followUp: current.followUp ? current.followUp + "\n" + leftover : leftover, followUpDone: false, done: true
      }), classIdSet_());
      return { current: writeLog_(followUp), nextDate: next.date };
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
      if (clean.remindBefore !== "") requireAddress_();
      var saved = upsert_("Events", idKey_, clean);
      if (clean.remindBefore !== "") ensureDigestTrigger_();
      return { event: saved };
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
      var clean = cleanTodo_(todo, classIdSet_(), today_(), categoryIdSet_());
      var existing = readTab_("Todos").filter(function (t) { return t.id === clean.id; })[0];
      if (!existing && readTab_("Todos").length >= LIMITS.todos) throw new UserError_("You've reached the limit of " + LIMITS.todos + " to-dos. Delete some finished ones first.");
      return { todo: saveWithReminder_("Todos", clean, existing) };
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
