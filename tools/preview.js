// Runs the site on this computer with the REAL web app code (through tests/fake-gas.js) behind a local
// /exec address, so the page behaves as it will live. Nothing is sent to Google. Usage:
//   node tools/preview.js [port] [--demo] [--locked]
//   --demo    the notebook starts with Mr Yau's imported Word log (read from the private folder)
//   --locked  opens without the secret code, to see the locked screen
const http = require("http");
const fs = require("fs");
const path = require("path");
const { loadServer } = require("../tests/fake-gas");

const ROOT = path.join(__dirname, "..");
const port = Number(process.argv[2]) || 8330;
const demo = process.argv.includes("--demo");
const locked = process.argv.includes("--locked");
const DEMO_KEY = "preview".padEnd(64, "0");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
const server = loadServer({ now: null, props: { ACCESS_KEY: DEMO_KEY } });

if (demo) {
  const file = process.env.TSB_DEMO_FILE || path.join(ROOT, "../teachers-second-brain/data/yau-2026-27.json");
  if (fs.existsSync(file)) server.call("importData", JSON.parse(fs.readFileSync(file, "utf8")));
  else console.log("No Word log found at " + file + "; starting empty.");
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "POST" && url.pathname === "/exec") {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => setTimeout(() => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(server.ctx.doPost({ postData: { contents: body } }).getContent());
    }, 250)); // a little delay, like the real thing
    return;
  }
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(file);
  if (rel === "index.html") {
    const key = locked ? "" : "try { localStorage.setItem('tsb-access-key', '" + DEMO_KEY + "'); } catch (e) {}";
    body = body.toString("utf8").replace('<script src="core/logic.js">', "<script>window.TSB_WEB_APP = '/exec'; " + key + "</script>\n  <script src=\"core/logic.js\">");
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(body);
}).listen(port, "127.0.0.1", () => console.log("Preview at http://127.0.0.1:" + port + (locked ? " (locked)" : "")));
