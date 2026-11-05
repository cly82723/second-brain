/* Brings in a setup file (made by tools/import-docx.js, or exported from another account).
   The whole file is checked before anything is written, so a bad file changes nothing.
   Entries already in the app are never overwritten: an imported entry for the same lesson is skipped. */

function importData(payload) {
  return respond_(function () {
    return withLock_(function () {
      if (!payload || typeof payload !== "object") throw new UserError_("That file doesn't look like a Teachers' Second Brain file.");
      var setup = payload.classes || payload.timetable ? importedSetup_(payload) : null;
      var classIds = Object.create(null);
      (setup ? setup.classes : readTab_("Classes")).forEach(function (c) { classIds[c.id] = true; });
      var spec = setup ? setup.spec : (schoolSpec_(readSettings_().schoolId) || schoolSpec_(DEFAULT_SCHOOL_ID));
      var plans = {
        Log: planMerge_("Log", logKey_, payload.log, function (e) { return cleanLogEntry_(e, classIds); }, LIMITS.importRows),
        Events: planMerge_("Events", idKey_, payload.events, function (e) { return cleanEvent_(e, spec.cycleLength); }, LIMITS.events),
        Todos: planMerge_("Todos", idKey_, payload.todos, function (t) { return cleanTodo_(t, classIds, today_()); }, LIMITS.todos)
      };
      // Everything checked: now write.
      if (setup) writeSetup_(setup);
      Object.keys(plans).forEach(function (tab) {
        if (plans[tab].added.length) replaceTab_(tab, plans[tab].existing.concat(plans[tab].added));
      });
      return {
        counts: {
          log: { added: plans.Log.added.length, skipped: plans.Log.skipped },
          events: { added: plans.Events.added.length, skipped: plans.Events.skipped },
          todos: { added: plans.Todos.added.length, skipped: plans.Todos.skipped }
        },
        data: allData_()
      };
    });
  });
}

function importedSetup_(payload) {
  var current = allData_();
  return checkedSetup_({
    schoolId: payload.schoolId || current.settings.schoolId,
    periods: payload.periods || current.periods,
    classes: payload.classes || current.classes,
    timetable: payload.timetable || current.timetable
  });
}

// Works out which rows would be added, without writing anything.
function planMerge_(tab, keyOf, incoming, clean, maxTotal) {
  var existing = readTab_(tab);
  if (incoming === undefined) return { existing: existing, added: [], skipped: 0 };
  if (!Array.isArray(incoming) || incoming.length > LIMITS.importRows) {
    throw new UserError_("The " + tab.toLowerCase() + " part of the file is too big or damaged.");
  }
  var seen = Object.create(null);
  existing.forEach(function (r) { seen[keyOf(r)] = true; });
  var added = [];
  var skipped = 0;
  incoming.forEach(function (raw) {
    try {
      var row = clean(raw);
      if (seen[keyOf(row)]) { skipped++; return; }
      seen[keyOf(row)] = true;
      added.push(tab === "Log" ? Object.assign({}, row, { updated: today_() }) : row);
    } catch (e) {
      if (!(e instanceof UserError_)) throw e;
      skipped++;
    }
  });
  if (existing.length + added.length > maxTotal) {
    throw new UserError_("Importing this would go over the limit of " + maxTotal + " " + tab.toLowerCase() + ". Nothing was imported.");
  }
  return { existing: existing, added: added, skipped: skipped };
}
