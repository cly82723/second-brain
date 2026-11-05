/* The evening round-up email. Each teacher who turns it on gets a daily trigger that runs as them,
   so it reads only their own Sheet and sends only to their own address. */

var DIGEST_HANDLER = "dailyDigest";

function saveEmail(request) {
  return respond_(function () {
    return withLock_(function () {
      var on = !!(request && request.on);
      var hour = Number(request && request.hour);
      if (EMAIL_HOURS.indexOf(hour) < 0) throw new UserError_("Please pick a time between 4 pm and 11 pm.");
      removeDigestTriggers_();
      if (on) ScriptApp.newTrigger(DIGEST_HANDLER).timeBased().everyDays(1).atHour(hour).create();
      var email = { on: on, hour: hour };
      writeSetting_("email", email);
      return { email: email };
    });
  });
}

function removeDigestTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === DIGEST_HANDLER) ScriptApp.deleteTrigger(t);
  });
}

// Run by the daily trigger. Sends nothing when tomorrow has nothing on.
function dailyDigest() {
  var settings = readSettings_();
  if (!settings.email || !settings.email.on) return;
  var ctx = context_();
  var digest = logic_().digest(ctx, today_(), settings.startDate || "");
  if (digest) sendDigest_(ctx, digest);
}

function sendTestEmail() {
  return respond_(function () {
    var ctx = context_();
    var digest = logic_().digest(ctx, today_(), readSettings_().startDate || "");
    var to = ownerEmail_();
    if (!digest) {
      MailApp.sendEmail({ to: to, subject: APP_NAME + ": test email", name: APP_NAME,
        body: "Your evening email works. Tomorrow has nothing on, so on a real evening like this one no email would be sent." });
    } else {
      sendDigest_(ctx, digest);
    }
    return { to: to };
  });
}

function sendDigest_(ctx, digest) {
  var mail = digestEmail_(ctx, digest, appUrl_());
  MailApp.sendEmail({ to: ownerEmail_(), subject: mail.subject, htmlBody: mail.html, body: mail.text, name: APP_NAME });
}

// In a trigger, getActiveUser can come back empty; the trigger always runs as its owner, the effective user.
function ownerEmail_() {
  return Session.getEffectiveUser().getEmail();
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
  var subject = "Tomorrow, " + L.shortDate(d.date) + dayName + ": " +
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
    section_("To-dos due tomorrow", d.todosDue.map(function (t) { return { title: t.title, meta: t.time || "" }; })),
    section_("Overdue to-dos", d.overdue.map(function (t) { return { title: t.title, meta: "was due " + L.shortDate(t.due) }; }))
  ].filter(Boolean);
  var heading = L.longDate(d.date) + dayName;
  var labels = d.info.labels.map(function (l) { return l.text; }).join(" · ");
  return {
    subject: subject,
    html: emailHtml_(heading, labels, sections, url),
    text: [heading, labels].concat(sections.map(function (s) { return s.text; }))
      .concat(url ? ["Open the app: " + url] : []).filter(Boolean).join("\n\n")
  };
}

function lessonItem_(l) {
  var e = l.entry || {};
  var lines = [];
  if (l.replacedBy) lines.push(["Replaced by", l.replacedBy.title]);
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

function emailHtml_(heading, labels, sections, url) {
  return '<div style="background:#f6f1e7;padding:24px 12px"><div style="max-width:560px;margin:0 auto;background:#fffdf8;border:1px solid #e6dccb;border-radius:12px;padding:24px">' +
    '<div style="font:600 12px Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#7a6f5f">' + esc_(APP_NAME) + " · Tomorrow</div>" +
    '<h1 style="font:600 24px/1.25 Georgia,serif;color:#1f2a44;margin:6px 0 4px">' + esc_(heading) + "</h1>" +
    (labels ? '<div style="font:400 14px Arial,sans-serif;color:#7a6f5f">' + esc_(labels) + "</div>" : "") +
    sections.map(function (s) { return s.html; }).join("") +
    (url ? '<p style="margin:28px 0 0"><a href="' + esc_(url) + '" style="font:600 14px Arial,sans-serif;color:#fffdf8;background:#1f2a44;padding:10px 16px;border-radius:8px;text-decoration:none">Open the app</a></p>' : "") +
    '<p style="font:400 12px Arial,sans-serif;color:#9a8f7f;margin:24px 0 0">You turned this email on in Settings. Turn it off there at any time.</p>' +
    "</div></div>";
}
