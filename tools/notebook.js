// Turns an import file (tools/import-docx.js output) into a complete notebook.json.
// Usage: node tools/notebook.js data/yau-2026-27.json <out.json> [startDate]
const fs = require("fs");

function notebookFromImport(file, startDate) {
  const updated = startDate;
  return {
    format: "teachers-second-brain-notebook",
    version: 1,
    settings: { schoolId: file.schoolId, startDate, setupDone: true },
    classes: file.classes,
    timetable: file.timetable,
    log: file.log.map((e) => Object.assign({ remind: "", homework: "", homeworkDue: "", notes: "" }, e, { updated })),
    events: file.events.map((e) => Object.assign({ repeatOn: "", until: "" }, e)),
    todos: []
  };
}

if (require.main === module) {
  const [input, output, start = "2026-11-05"] = process.argv.slice(2);
  if (!input || !output) throw new Error("Usage: node tools/notebook.js <import.json> <out.json> [startDate]");
  fs.writeFileSync(output, JSON.stringify(notebookFromImport(JSON.parse(fs.readFileSync(input, "utf8")), start), null, 1));
  console.log("Wrote " + output);
}

module.exports = { notebookFromImport };
