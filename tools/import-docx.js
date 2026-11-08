// Turns the old Word logbook (a table: one row per date, one column per class) into a file the app
// can import from Settings > Import. Usage:
//   node tools/import-docx.js "<path to .docx>" <output.json>
// The class columns, timetable and personal calendar notes below are for Mr Yau's 2026-27 log.
const fs = require("fs");
const zlib = require("zlib");

const SCHOOL_ID = "kings-college-2026";
const DONE_UP_TO = "2026-11-04"; // entries up to here are past lessons, ticked as done
const CLASSES = [
  { id: "c-1b-eng", name: "S1E2 English", colour: "sky" },
  { id: "c-3d-eng", name: "3D English", colour: "sage" },
  { id: "c-5d-eng", name: "5D English", colour: "apricot" },
  { id: "c-1d-hist", name: "1D History", colour: "lilac" },
  { id: "c-3d-forp", name: "3D ForP", colour: "butter" }
];
// Word table columns after the date column, in order.
const COLUMN_CLASSES = ["c-1b-eng", "c-3d-eng", "c-5d-eng", "c-1d-hist"];
// From 26-27 timetable.png: cycle day -> period -> class.
const TIMETABLE = {
  1: { P1: "c-3d-eng", P2: "c-3d-eng", P4: "c-1b-eng", P5: "c-1b-eng", P8: "c-1d-hist" },
  2: { P1: "c-1b-eng", P2: "c-1b-eng", P6: "c-3d-eng", P7: "c-3d-eng" },
  3: { P1: "c-1b-eng", P2: "c-1b-eng", P4: "c-5d-eng", P5: "c-5d-eng" },
  4: { P1: "c-5d-eng", P2: "c-5d-eng", P3: "c-3d-eng" },
  5: { P1: "c-1b-eng", P2: "c-1b-eng", P5: "c-1d-hist", P6: "c-3d-eng", P7: "c-3d-eng" },
  6: { P1: "c-3d-eng", P2: "c-3d-eng", P6: "c-5d-eng", P8: "c-3d-forp" },
  7: { P1: "c-5d-eng", P2: "c-5d-eng", P3: "c-5d-eng", P6: "c-3d-eng" }
};
// Handwritten on the paper calendar.
const DETENTION_NOTE = "On the paper calendar this looks like \"4G & 1F\". Please check.";
const PERSONAL_EVENTS = [
  ["2026-09-12", "Duty (Saturday)"], ["2026-09-24", "Detention", DETENTION_NOTE], ["2026-10-27", "Duty (2–3F)"],
  ["2026-11-27", "Detention"], ["2027-01-08", "Detention"], ["2027-02-18", "Duty (2–3F)"],
  ["2027-03-22", "Duty (2–3F)"], ["2027-04-29", "Detention"], ["2027-05-03", "Battle of the Books (S3)"],
  ["2027-06-01", "Detention"], ["2027-07-02", "Duty (2–3F)"]
];

function unzipEntry(buffer, wanted) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("Not a .docx (zip) file.");
  let p = buffer.readUInt32LE(eocd + 16);
  const count = buffer.readUInt16LE(eocd + 10);
  for (let i = 0; i < count; i++) {
    const method = buffer.readUInt16LE(p + 10);
    const size = buffer.readUInt32LE(p + 20);
    const nameLen = buffer.readUInt16LE(p + 28);
    const extraLen = buffer.readUInt16LE(p + 30);
    const commentLen = buffer.readUInt16LE(p + 32);
    const local = buffer.readUInt32LE(p + 42);
    const name = buffer.toString("utf8", p + 46, p + 46 + nameLen);
    if (name === wanted) {
      const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
      const data = buffer.subarray(start, start + size);
      return method === 0 ? data.toString("utf8") : zlib.inflateRawSync(data).toString("utf8");
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(wanted + " not found in the file.");
}

const decode = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const all = (xml, tag) => xml.match(new RegExp(`<w:${tag}[ >][\\s\\S]*?</w:${tag}>`, "g")) || [];
const paragraphText = p => decode((p.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, "")).join("")).trim();

function readRows(xml) {
  return all(xml, "tr").map(tr => all(tr, "tc").map(tc => all(tc, "p").map(paragraphText).filter(Boolean)));
}

function rowDate(cell) {
  const m = (cell[0] || "").match(/^\**\s*(\d{1,2})\s*\/\s*(\d{1,2})\b/);
  if (!m) return null;
  const day = +m[1], month = +m[2];
  const year = month >= 9 ? 2026 : 2027;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function rowCycleDay(cell) {
  const m = cell.join(" ").match(/\(D(\d)\)/);
  return m ? +m[1] : null;
}

const LENGTH_ONLY = /^\*?\s*(single|double|triple) lesson\.?$/i;
const REMIND = /^\**\s*(final\s+)?(remind|reminders|announce)/i;

// Sorts one cell's lines into the app's fields. "HW:" can also start partway through a line.
function splitCell(lines, date) {
  const out = { plan: [], remind: [], homework: [], notes: [] };
  lines.flatMap(l => l.split(/(?=\bHW\s*:)/i)).map(l => l.trim().replace(/;$/, "")).filter(Boolean).forEach(line => {
    if (/^HW\s*:/i.test(line)) out.homework.push(line.replace(/^HW\s*:\s*/i, ""));
    else if (REMIND.test(line)) out.remind.push(line.replace(/^\*+\s*/, ""));
    else if (LENGTH_ONLY.test(line)) return;
    else if (/^abs$/i.test(line)) out.notes.push("Absent");
    else if (/^\*/.test(line)) out.notes.push(line.replace(/^\*+\s*/, ""));
    else out.plan.push(line);
  });
  const homework = out.homework.join("\n");
  const due = homework.match(/\((\d{1,2})\/(\d{1,2})\)/);
  const dueDate = due ? `${+due[2] >= 9 ? 2026 : 2027}-${due[2].padStart(2, "0")}-${due[1].padStart(2, "0")}` : "";
  return {
    plan: out.plan.join("\n"), remind: out.remind.join("\n"), homework,
    homeworkDue: dueDate > date ? dueDate : "", notes: out.notes.join("\n")
  };
}

function buildLog(rows, warnings) {
  const seen = new Map();
  rows.forEach(cells => {
    const date = rowDate(cells[0] || []);
    if (!date) return;
    const cycleDay = rowCycleDay(cells[0]);
    COLUMN_CLASSES.forEach((classId, i) => {
      const lines = cells[i + 1] || [];
      if (!lines.length) return;
      const key = date + "|" + classId;
      if (seen.has(key)) return; // the end of the Word file repeats some rows
      const fields = splitCell(lines, date);
      const taught = cycleDay && Object.values(TIMETABLE[cycleDay] || {}).includes(classId);
      if (!taught) warnings.push(`${date} (D${cycleDay}): ${classId} isn't on the timetable that day, imported anyway.`);
      seen.set(key, Object.assign({ date, classId, done: date <= DONE_UP_TO }, fields));
    });
  });
  return [...seen.values()];
}

function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node tools/import-docx.js "<file.docx>" <output.json>');
  const xml = unzipEntry(fs.readFileSync(input), "word/document.xml");
  const warnings = [];
  const log = buildLog(readRows(xml), warnings);
  const timetable = Object.entries(TIMETABLE).flatMap(([day, slots]) =>
    Object.entries(slots).map(([period, classId]) => ({ day: +day, period, classId })));
  const events = PERSONAL_EVENTS.map(([date, title, notes]) => ({
    id: "imp-" + date.replace(/-/g, "") + "-" + title.split(" ")[0].toLowerCase(),
    title, date, start: "", end: "", repeat: "none", replaces: false, notes: notes || ""
  }));
  const file = { format: "teachers-second-brain", version: 1, schoolId: SCHOOL_ID, classes: CLASSES, timetable, log, events };
  fs.writeFileSync(output, JSON.stringify(file, null, 1));
  console.log(`Wrote ${output}: ${log.length} entries, ${events.length} events, ${timetable.length} timetable slots.`);
  warnings.forEach(w => console.log("  note: " + w));
}

if (require.main === module) main();
module.exports = { splitCell, rowDate, buildLog };
