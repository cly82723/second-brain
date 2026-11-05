// Serves web/ on this computer. Nothing is sent to GitHub. Usage:
//   node tools/preview.js [port] [--demo]
//   --demo   opens with Mr Yau's imported log in memory (no access key needed)
//   (none)   shows the real "connect to GitHub" screen
const http = require("http");
const fs = require("fs");
const path = require("path");
const { notebookFromImport } = require("./notebook");

const WEB = path.join(__dirname, ".."); // the app files are at the repo root
const port = Number(process.argv[2]) || 8330;
const demo = process.argv.includes("--demo");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json" };

function demoNotebook() {
  const file = process.env.TSB_DEMO_FILE || path.join(__dirname, "../../teachers-second-brain/data/yau-2026-27.json");
  const nb = notebookFromImport(JSON.parse(fs.readFileSync(file, "utf8")), "2026-11-05");
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const add = (days) => new Date(Date.parse(today) + days * 86400000).toISOString().slice(0, 10);
  nb.todos = [["Mark 3D essays", add(-1), "c-3d-eng"], ["Print ERS booklets", today, "c-1b-eng"], ["Book the hall", add(2), ""], ["Order dictionaries", "", ""]]
    .map(([title, due, classId], i) => ({ id: "demo" + i, title, due, time: "", classId, notes: "", done: false, doneAt: "" }));
  return nb;
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  const file = path.join(WEB, rel);
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(file);
  if (rel === "index.html" && demo) {
    const inject = "<script>window.TSB_PREVIEW = " + JSON.stringify(demoNotebook()).replace(/</g, "\\u003c") + ";</script>";
    body = body.toString("utf8").replace('<script src="core/logic.js">', inject + '\n  <script src="core/logic.js">');
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(body);
}).listen(port, "127.0.0.1", () => console.log("Preview at http://127.0.0.1:" + port + (demo ? " (demo notebook in memory)" : "")));
