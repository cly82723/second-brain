/* Email reminders. Two kinds, both sent to the notebook's own address (recipient_):
   - Round-ups: as many as the teacher likes, each at its own time of day, covering today or tomorrow.
   - Item reminders: a to-do or a marking pile at a set date and time; an item some minutes before
     it starts (every repeat of a repeating item).
   One trigger (running as the owner) visits every notebook every 15 minutes; anything due since the
   last visit goes out, so a reminder arrives within about 15 minutes of its time, late rather than lost. */

var DIGEST_HANDLER = "dailyDigest";
var TRIGGER_MINUTES = 15;
var TRIGGER_KIND_PROP = "REMINDER_TRIGGER";
var TRIGGER_KIND = "every-15-minutes";
var MAX_ROUNDUPS = 6;
var REMIND_BEFORE = [0, 10, 30, 60, 1440];
var STALE_REMINDER_MINUTES = 1440; // a reminder more than a day overdue (e.g. after downtime) is dropped, not sent
var NO_ADDRESS = "There's no email address for this notebook yet. Ask the person who set up the app to add one.";

function nowTime_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm"); }

// ---------- round-ups ----------
// The round-ups in force. Notebooks from before multiple round-ups had one evening email.
function roundupsFrom_(settings) {
  if (Array.isArray(settings.reminders)) return settings.reminders;
  var e = settings.email;
  if (e && e.on) return [{ id: "evening", time: (e.hour < 10 ? "0" : "") + e.hour + ":00", covers: "tomorrow", on: true, lastSent: e.lastSent || "" }];
  return [];
}

function saveReminders(list) {
  return respond_(function () {
    return withLock_(function () { return { reminders: writeRoundups_(cleanRoundups_(list)) }; });
  });
}

// Keeps when each was last sent, and a round-up whose time has already passed today counts as sent
// today, so adding a 07:00 round-up at 14:00 doesn't fire one straight away.
function writeRoundups_(clean) {
  if (clean.some(function (r) { return r.on; }) && !recipient_()) throw new UserError_(NO_ADDRESS);
  var previous = Object.create(null);
  roundupsFrom_(readSettings_()).forEach(function (r) { previous[r.id] = r; });
  var today = today_(), now = nowTime_();
  var merged = clean.map(function (r) {
    var p = previous[r.id];
    var lastSent = p && p.time === r.time ? (p.lastSent || "") : (r.time <= now ? today : "");
    return Object.assign({}, r, { lastSent: lastSent });
  });
  writeSetting_("reminders", merged);
  syncDigestTrigger_();
  return merged;
}

// The older single evening email, still understood: one round-up at that hour, for tomorrow.
function saveEmail(request) {
  return respond_(function () {
    return withLock_(function () {
      var on = !!(request && request.on);
      var hour = Number(request && request.hour);
      if (!(hour >= 0 && hour <= 23 && Math.floor(hour) === hour)) throw new UserError_("Please pick an hour of the day.");
      var time = (hour < 10 ? "0" : "") + hour + ":00";
      var others = roundupsFrom_(readSettings_()).filter(function (r) { return r.id !== "evening"; });
      var list = writeRoundups_(cleanRoundups_(others.concat(on ? [{ id: "evening", time: time, covers: "tomorrow", on: true }] : [])));
      return { email: { on: on, hour: hour }, reminders: list };
    });
  });
}

// ---------- the trigger ----------
// One 15-minute trigger while anyone has a reminder; none otherwise.
function syncDigestTrigger_() {
  if (anyRemindersSet_()) ensureDigestTrigger_();
  else {
    removeDigestTriggers_();
    PropertiesService.getScriptProperties().setProperty(TRIGGER_KIND_PROP, "");
  }
}

// Cheap enough to call on every save that sets a reminder.
function ensureDigestTrigger_() {
  var props = PropertiesService.getScriptProperties();
  var mine = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === DIGEST_HANDLER; });
  if (mine.length === 1 && props.getProperty(TRIGGER_KIND_PROP) === TRIGGER_KIND) return;
  removeDigestTriggers_(); // e.g. the old hourly one
  ScriptApp.newTrigger(DIGEST_HANDLER).timeBased().everyMinutes(TRIGGER_MINUTES).create();
  props.setProperty(TRIGGER_KIND_PROP, TRIGGER_KIND);
}

function removeDigestTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === DIGEST_HANDLER) ScriptApp.deleteTrigger(t);
  });
}

function pendingItemReminder_(x) { return !x.done && x.remindAt && x.remindSent !== x.remindAt; }

// A notebook that can't be read just now counts as having reminders, so nobody's are switched off by a hiccup.
function anyRemindersSet_() {
  return notebooksWithData_().some(function (nb) {
    try {
      return withNotebook_(nb, function () {
        return roundupsFrom_(readSettings_()).some(function (r) { return r.on; }) ||
          readTab_("Todos").some(pendingItemReminder_) || readTab_("Marks").some(pendingItemReminder_) ||
          readTab_("Events").some(function (ev) { return ev.remindBefore !== "" && ev.remindBefore !== null; });
      });
    } catch (e) {
      console.warn("Couldn't check the reminders for " + (nb.name || "the owner") + ": " + (e && e.message || e));
      return true;
    }
  });
}

// ---------- every 15 minutes ----------
// (Named dailyDigest for the triggers made by earlier versions.) One notebook failing doesn't stop the others.
function dailyDigest() {
  var now = nowTime_();
  notebooksWithData_().forEach(function (nb) {
    try {
      withNotebook_(nb, function () { withLock_(function () { sendDueReminders_(now); }); });
    } catch (e) {
      console.error("Reminders for " + (nb.name || "the owner") + " failed: " + (e && e.stack ? e.stack : e));
    }
  });
}

function sendDueReminders_(now) {
  if (!recipient_()) return;
  var settings = readSettings_();
  var today = today_();
  var ctx = null;
  function context() { return ctx || (ctx = context_()); }
  var list = roundupsFrom_(settings);
  var changed = false;
  list.forEach(function (r) {
    if (!r.on || r.lastSent === today || now < r.time) return;
    var digest = logic_().digest(context(), today, settings.startDate || "", r.covers === "today" ? today : logic_().addDays(today, 1));
    if (digest) sendDigest_(context(), digest);
    r.lastSent = today;
    changed = true;
  });
  if (changed) writeSetting_("reminders", list);
  sendItemReminders_(today, now, settings, context);
}

// "YYYY-MM-DDTHH:MM" moved back by some minutes.
function stampMinus_(date, time, minutes) {
  var L = logic_();
  var total = L.minutes(time) - minutes;
  var shift = Math.floor(total / 1440);
  var m = total - shift * 1440;
  return L.addDays(date, shift) + "T" + (m < 600 ? "0" : "") + Math.floor(m / 60) + ":" + (m % 60 < 10 ? "0" : "") + (m % 60);
}

// Everything whose reminder time has come, in one email.
function sendItemReminders_(today, now, settings, context) {
  var L = logic_();
  var nowStamp = today + "T" + now;
  var oldest = stampMinus_(today, now, STALE_REMINDER_MINUTES);
  function due(x) { return pendingItemReminder_(x) && x.remindAt <= nowStamp && x.remindAt > oldest; }
  var todos = readTab_("Todos").filter(due);
  var marks = readTab_("Marks").filter(due);
  var withBefore = readTab_("Events").filter(function (ev) { return ev.remindBefore !== "" && ev.remindBefore !== null; });
  var sentLog = Object.assign({}, settings.eventReminders || {});
  var events = [];
  if (withBefore.length) {
    var ids = Object.create(null);
    withBefore.forEach(function (ev) { ids[ev.id] = true; });
    // Today's and tomorrow's occurrences (a day-before reminder for tomorrow fires today).
    [today, L.addDays(today, 1)].forEach(function (d) {
      L.eventsOn(context(), d).forEach(function (ev) {
        if (!ids[ev.id]) return;
        var at = stampMinus_(d, ev.start || "07:00", Number(ev.remindBefore) || 0);
        var key = ev.id + "|" + d;
        if (at <= nowStamp && at > oldest && !sentLog[key]) events.push({ ev: ev, on: d, key: key });
      });
    });
  }
  if (!todos.length && !marks.length && !events.length) return;
  sendItemsEmail_(context(), todos, marks, events);
  todos.forEach(function (t) { upsert_("Todos", idKey_, Object.assign({}, t, { remindSent: t.remindAt })); });
  marks.forEach(function (m) { upsert_("Marks", idKey_, Object.assign({}, m, { remindSent: m.remindAt })); });
  if (events.length) {
    events.forEach(function (x) { sentLog[x.key] = x.on; });
    var keep = L.addDays(today, -2);
    Object.keys(sentLog).forEach(function (k) { if (sentLog[k] < keep) delete sentLog[k]; });
    writeSetting_("eventReminders", sentLog);
  }
}

function sendItemsEmail_(ctx, todos, marks, events) {
  var L = logic_();
  var items = events.map(function (x) {
    var when = (x.ev.allDay ? "All day" : x.ev.start + (x.ev.end ? "–" + x.ev.end : "")) + ", " + L.shortDate(x.on);
    return { title: x.ev.title, meta: when, lines: x.ev.notes ? [["Notes", x.ev.notes]] : [] };
  }).concat(todos.map(function (t) {
    var cls = t.classId && ctx.classById[t.classId];
    return { title: t.title, meta: ["To-do", t.due ? "due " + L.shortDate(t.due) + (t.time ? " " + t.time : "") : "", cls ? cls.name : ""].filter(Boolean).join(" · "),
      lines: t.notes ? [["Notes", t.notes]] : [] };
  })).concat(marks.map(function (m) {
    var p = L.markProgress(m);
    var cls = m.classId && ctx.classById[m.classId];
    return { title: m.title, meta: ["Marking", cls ? cls.name : "", m.due ? "return by " + L.shortDate(m.due) : "", p.total ? p.marked + " of " + p.total + " marked" : ""].filter(Boolean).join(" · ") };
  }));
  var subject = items.length === 1 ? "Reminder: " + items[0].title : "Reminders: " + items.length + " things";
  var section = section_(items.length === 1 ? "Reminder" : "Reminders", items);
  var url = appUrl_();
  MailApp.sendEmail({
    to: recipient_(), subject: subject, name: APP_NAME,
    htmlBody: emailHtml_(subject, "", [section], url, "Reminder", "You asked for this reminder in the app."),
    body: [subject, section.text].concat(url ? ["Open the app: " + url] : []).join("\n\n")
  });
}

function sendTestEmail() {
  return respond_(function () {
    var to = recipient_();
    if (!to) throw new UserError_(NO_ADDRESS);
    var ctx = context_();
    var digest = logic_().digest(ctx, today_(), readSettings_().startDate || "");
    if (!digest) {
      MailApp.sendEmail({ to: to, subject: APP_NAME + ": test email", name: APP_NAME,
        body: "Your email reminders work. Tomorrow has nothing on, so a round-up for tomorrow wouldn't be sent today." });
    } else {
      sendDigest_(ctx, digest);
    }
    return { to: to };
  });
}

function sendDigest_(ctx, digest) {
  var mail = digestEmail_(ctx, digest, appUrl_());
  MailApp.sendEmail({ to: recipient_(), subject: mail.subject, htmlBody: mail.html, body: mail.text, name: APP_NAME });
}

// The plain site address, without the secret code: a forwarded email doesn't hand over access.
// Devices that have opened the personal link once remember the code.
function appUrl_() {
  return SITE_URL;
}

function esc_(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function multiline_(s) { return esc_(s).replace(/\n/g, "<br>"); }

// Builds the email as sections, each both HTML and plain text.
function digestEmail_(ctx, d, url) {
  var L = logic_();
  var dayName = d.info.cycleDay ? " · " + L.cycleName(ctx.school, d.info.cycleDay) : "";
  var count = d.lessons.filter(function (l) { return !l.replacedBy; }).length;
  var when = d.isToday ? "Today" : "Tomorrow";
  var subject = when + ", " + L.shortDate(d.date) + dayName + ": " +
    (count ? count + (count === 1 ? " lesson" : " lessons") : "no lessons");
  var sections = [
    section_("Still to update from today", d.leftToday.map(function (l) {
      return { title: l.cls.name + " (" + l.periodText + ")" };
    })),
    section_("Lessons", d.lessons.map(function (l) { return lessonItem_(l); })),
    section_("Homework to collect", d.homeworkDue.map(function (h) {
      return { title: h.cls.name, lines: [["Set " + L.shortDate(h.entry.date), h.entry.homework]] };
    })),
    section_("Events", d.events.map(function (ev) {
      var when = ev.allDay ? "All day" : ev.start + (ev.end ? "–" + ev.end : "");
      return { title: ev.title, meta: when + (ev.replaces ? " · replaces lessons" : ""), lines: ev.notes ? [["Notes", ev.notes]] : [] };
    })),
    section_("Marking due", d.marksDue.concat(d.overdueMarks).map(function (m) {
      var p = L.markProgress(m);
      var cls = m.classId && ctx.classById[m.classId];
      return { title: m.title, meta: [cls ? cls.name : "", m.due < d.date ? "overdue, was due " + L.shortDate(m.due) : "",
        p.total ? p.marked + " of " + p.total + " marked" : ""].filter(Boolean).join(" · ") };
    })),
    section_("To-dos due " + when.toLowerCase(), d.todosDue.map(function (t) { return { title: t.title, meta: t.time || "" }; })),
    section_("Overdue to-dos", d.overdue.map(function (t) { return { title: t.title, meta: "was due " + L.shortDate(t.due) }; }))
  ].filter(Boolean);
  var heading = L.longDate(d.date) + dayName;
  var labels = d.info.labels.map(function (l) { return l.text; }).join(" · ");
  return {
    subject: subject,
    html: emailHtml_(heading, labels, sections, url, when, "You set up this round-up in Settings → Email reminders. Change or remove it there at any time."),
    text: [heading, labels].concat(sections.map(function (s) { return s.text; }))
      .concat(url ? ["Open the app: " + url] : []).filter(Boolean).join("\n\n")
  };
}

function lessonItem_(l) {
  var e = l.entry || {};
  var lines = [];
  if (l.replacedBy) lines.push(["Replaced by", l.replacedBy.title]);
  (l.followUps || []).forEach(function (f) { lines.push(["Follow up (from " + logic_().shortDate(f.date) + ")", f.followUp]); });
  (l.collect || []).forEach(function (h) { lines.push(["Collect", h.homework + " (set " + logic_().shortDate(h.date) + ")"]); });
  if (e.plan) lines.push(["Plan", e.plan]);
  if (e.remind) lines.push(["Remind students", e.remind]);
  if (e.homework) lines.push(["Homework to give", e.homework + (e.homeworkDue ? " (due " + logic_().shortDate(e.homeworkDue) + ")" : "")]);
  if (!lines.length) lines.push(["Plan", "Nothing planned yet"]);
  return { title: l.cls.name, meta: l.periodText + " · " + l.start + "–" + l.end + " · " + l.lengthText, lines: lines };
}

function section_(title, items) {
  if (!items.length) return null;
  var html = '<h2 style="font:600 13px/1.4 Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#7a6f5f;margin:28px 0 8px">' + esc_(title) + "</h2>" +
    items.map(function (it) {
      return '<div style="border-left:3px solid #c9bda9;padding:6px 0 6px 12px;margin:0 0 12px">' +
        '<div style="font:600 16px/1.4 Georgia,serif;color:#1f2a44">' + esc_(it.title) +
        (it.meta ? ' <span style="font:400 13px Arial,sans-serif;color:#7a6f5f">' + esc_(it.meta) + "</span>" : "") + "</div>" +
        (it.lines || []).map(function (ln) {
          return '<div style="font:400 14px/1.5 Arial,sans-serif;color:#2b2b2b;margin-top:4px"><b style="color:#5b5245">' +
            esc_(ln[0]) + ":</b> " + multiline_(ln[1]) + "</div>";
        }).join("") + "</div>";
    }).join("");
  var text = title.toUpperCase() + "\n" + items.map(function (it) {
    return "- " + it.title + (it.meta ? " (" + it.meta + ")" : "") +
      (it.lines || []).map(function (ln) { return "\n    " + ln[0] + ": " + ln[1].replace(/\n/g, "\n    "); }).join("");
  }).join("\n");
  return { html: html, text: text };
}

function emailHtml_(heading, labels, sections, url, kind, footer) {
  return '<div style="background:#f6f1e7;padding:24px 12px"><div style="max-width:560px;margin:0 auto;background:#fffdf8;border:1px solid #e6dccb;border-radius:12px;padding:24px">' +
    '<div style="font:600 12px Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#6a604f">' + esc_(APP_NAME) + " · " + esc_(kind || "Reminder") + "</div>" +
    '<h1 style="font:600 24px/1.25 Georgia,serif;color:#1f2a44;margin:6px 0 4px">' + esc_(heading) + "</h1>" +
    (labels ? '<div style="font:400 14px Arial,sans-serif;color:#7a6f5f">' + esc_(labels) + "</div>" : "") +
    sections.map(function (s) { return s.html; }).join("") +
    (url ? '<p style="margin:28px 0 0"><a href="' + esc_(url) + '" style="font:600 14px Arial,sans-serif;color:#fffdf8;background:#1f2a44;padding:10px 16px;border-radius:8px;text-decoration:none">Open the app</a></p>' : "") +
    '<p style="font:400 12px Arial,sans-serif;color:#7a6f5f;margin:24px 0 0">' + esc_(footer || "You turned this email on in Settings. Turn it off there at any time.") + "</p>" +
    "</div></div>";
}
