# Teachers' Second Brain

### ▶ https://cly82723.github.io/second-brain/

A private logbook, timetable and to-do list. It works like the CLY English pages: the website is on
GitHub Pages (a push to `main` is live in about a minute), and a Google Apps Script web app runs as
its owner behind it, saving to a Google Sheet in the owner's Drive. **No sign-in.**

**Privacy:** the owner opens the app from a **personal link** ending in `#k=` and a long secret
code. A device remembers the code after opening that link once. Without it the page shows "This
notebook is private" and the web app refuses every request. Keep the personal link to yourself:
anyone with it can open the notebook. This repo holds code only, never notes.

## Screens

Today · Calendar (Mon–Fri weeks with cycle days; weekends only when something's on) · Classes (one
timeline per class, with search) · To-dos · Settings (school, classes, timetable, period times,
evening email, Excel export, import, personal link).

## Setting up the web app (once)

1. Go to <https://script.google.com> and make a **New project** called `Teachers' Second Brain`.
2. **Project Settings** (gear icon) → tick **Show "appsscript.json" manifest file in editor**.
3. Replace everything in `Code.gs` with [`apps-script/dist/Code.gs`](apps-script/dist/Code.gs), and
   everything in `appsscript.json` with [`apps-script/dist/appsscript.json`](apps-script/dist/appsscript.json). Save.
4. Choose **createAccessKey** in the function menu at the top and press **Run**. Allow access when asked.
   The log at the bottom shows **your personal link**. Keep it.
5. **Deploy → New deployment →** Web app: **Execute as: Me**, **Who has access: Anyone**. Deploy.
6. Copy the **Web app URL** into `WEB_APP_URL` in [`core/remote.js`](core/remote.js), then push.
7. Open your personal link on each device (bookmark it or add it to the home screen).
8. In the app: **Settings → Import a file** (the converted Word log), then **Evening email → Send me a test**.

## Updating

- **The page** (`index.html`, `styles.css`, `core/`, `app/`): push to `main`. Live in about a minute.
- **The web app** (`apps-script/`, `core/logic.js`): run `node tools/build-apps-script.js`, paste
  `apps-script/dist/Code.gs` over Code.gs in Apps Script, then **Deploy → Manage deployments → ✏️ →
  New version → Deploy**. The web app URL stays the same.

## Files

```
index.html, styles.css    the page
core/logic.js             calendar rules, shared by the page and the web app
core/remote.js            talking to the web app (secret code, requests)
core/export.js            Excel export, made in the browser
app/                      screens: app.js, views.js, editors.js, settings.js, connect.js (locked screen)
apps-script/              the web app: Code.gs (requests, secret code), Store.gs (Sheet),
                          Validate.gs, Schools.gs (school calendars), Import.gs, Email.gs
apps-script/dist/         the same, joined into one file to paste (generated)
tests/                    node --test tests/
tools/                    build-apps-script.js, preview.js, import-docx.js
```

## Working on it

```
node --test tests/                    # web app, secret code, email, import, export, calendar
node tools/preview.js 8330 --demo     # http://127.0.0.1:8330, the real web app code with the Word log
node tools/preview.js 8331 --locked   # the locked screen
```

The demo uses the converted Word log from `../teachers-second-brain/data/yau-2026-27.json` on this
computer (personal, so not in this repo).

## Giving another teacher their own notebook

Everyone uses the same site and the same web app; each teacher has their own secret link and their
own Google Sheet (kept in the owner's Drive, so the owner can see it).

1. In Apps Script, near the top of the `Code.gs` part, fill in
   `var NEW_TEACHER = { name: "CCY", email: "their@email" };` (the email is for their evening email).
2. Choose **addTeacher** in the function menu and press **Run**. The log shows **their personal link**.
   Running it again with the same name shows the same link. **listTeachers** shows every link again.
3. Optional set-up for them: open their link in a **private/incognito window** (opening it in your
   normal browser would switch that browser to their notebook), then **Settings → Import a file**.
4. Send them the link privately. To remove a teacher, delete their entry from the `NOTEBOOKS` script
   property (Project Settings → Script properties); their Sheet stays in your Drive.

## Adding a school's calendar

In `apps-script/Schools.gs`, copy the `KINGS_COLLEGE_2026` block, set `cycleFrom`/`cycleTo`, list
weekdays without a cycle number in `noCycle`, add holidays and events to `labels`, and add it to
`SCHOOL_SPECS`. Add a few dates from the paper calendar to `tests/schools.test.js`, then rebuild and
update the web app.
