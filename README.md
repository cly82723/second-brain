# Teachers' Second Brain

### ▶ https://cly82723.github.io/second-brain/

A private logbook, timetable and to-do list. This repo is the whole app: the website and its code.
It holds **no notes**. Notes are saved as `notebook.json` in the private repo
`cly82723/teachers-second-brain` (branch `notebook`), reached with a GitHub access key that each
device is given once. Anyone can open the website, but without the key they only see "Connect".

## Connecting a device

1. Open https://github.com/settings/personal-access-tokens/new (signed in as cly82723).
2. Name it (e.g. "Second Brain – phone") and choose an expiry.
3. Repository access: **Only select repositories → teachers-second-brain**.
4. Permissions → Repository permissions → **Contents: Read and write**. Nothing else.
5. Generate, copy, and paste it into the app.

## Files

```
index.html, styles.css   the page
core/                     calendar rules (logic.js), school calendars (schools.js),
                          input checks (validate.js), GitHub storage (backend.js)
app/                      screens: app.js, views.js, editors.js, settings.js, connect.js
tests/                    node --test tests/
tools/                    preview.js, notebook.js, import-docx.js
```

## Working on it

```
node --test tests/                    # calendar, storage, checks, import, export
node tools/preview.js 8330 --demo     # http://127.0.0.1:8330 with the imported log, in memory
```

The demo and one test use the converted Word log, which is personal and lives in the private repo
(`../teachers-second-brain/data/yau-2026-27.json`). Without it, that test is skipped.

Pushing to `main` publishes: GitHub Pages updates in about a minute.

## Adding a school's calendar

In `core/schools.js`, copy the `KINGS_COLLEGE_2026` block, set `cycleFrom`/`cycleTo`, list weekdays
without a cycle number in `noCycle`, add holidays and events to `labels`, and add it to
`SCHOOL_SPECS`. Add a few dates from the paper calendar to `tests/schools.test.js`.
