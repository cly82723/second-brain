// Loads the real browser code (web/core) into Node, against a fake GitHub that behaves like the
// contents API: files on a branch, a sha per version, 409 when a save is based on an old version.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { webcrypto } = require("crypto");

const WEB = path.join(__dirname, ".."); // the app files are at the repo root
const CORE = ["core/logic.js", "core/schools.js", "core/validate.js", "core/backend.js"];
const GOOD_TOKEN = "github_pat_" + "A".repeat(40);

function fakeGitHub() {
  const gh = { files: {}, version: 0, calls: [], messages: [], token: GOOD_TOKEN, repoVisible: true, down: false };
  const key = (p, branch) => branch + ":" + p;
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  gh.fetch = async (url, init = {}) => {
    gh.calls.push({ method: init.method || "GET", url });
    if (gh.down) throw new TypeError("Failed to fetch");
    if ((init.headers || {}).Authorization !== "Bearer " + gh.token) return json(401, { message: "Bad credentials" });
    if (!gh.repoVisible) return json(404, { message: "Not Found" });
    const u = new URL(url);
    const m = u.pathname.match(/^\/repos\/cly82723\/teachers-second-brain(\/contents\/(.+))?$/);
    if (!m) return json(404, {});
    if (!m[2]) return json(200, { full_name: "cly82723/teachers-second-brain", private: true });
    if ((init.method || "GET") === "GET") {
      const f = gh.files[key(m[2], u.searchParams.get("ref"))];
      return f ? json(200, { content: f.content, sha: f.sha, encoding: "base64" }) : json(404, {});
    }
    const body = JSON.parse(init.body);
    const k = key(m[2], body.branch);
    const current = gh.files[k];
    if (current && body.sha !== current.sha) return json(409, { message: "sha mismatch" });
    if (!current && body.sha) return json(409, { message: "sha mismatch" });
    const sha = "sha" + ++gh.version;
    gh.files[k] = { content: body.content, sha };
    gh.messages.push(body.message);
    return json(200, { content: { sha } });
  };
  gh.notebook = () => {
    const f = gh.files["notebook:notebook.json"];
    return f ? JSON.parse(Buffer.from(f.content, "base64").toString("utf8")) : null;
  };
  // Another device saves directly, as the app on a phone would.
  gh.saveAsOtherDevice = (mutate) => {
    const doc = gh.notebook();
    mutate(doc);
    gh.files["notebook:notebook.json"] = { content: Buffer.from(JSON.stringify(doc)).toString("base64"), sha: "sha" + ++gh.version };
  };
  return gh;
}

function loadWeb(options = {}) {
  const gh = options.github || fakeGitHub();
  const storage = {};
  const ctx = {
    console, JSON, Math, Object, String, Number, Array, RegExp, Error, TypeError, Promise, Date, URL, Uint8Array,
    TextEncoder, TextDecoder,
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    crypto: webcrypto,
    fetch: gh.fetch,
    localStorage: {
      getItem: (k) => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: (k) => { delete storage[k]; }
    },
    Blob: class { constructor(parts, opts) { this.parts = parts; this.type = opts && opts.type; } },
    XLSX: options.xlsx
  };
  ctx.URL.createObjectURL = () => "blob:fake";
  vm.createContext(ctx);
  CORE.forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(WEB, f), "utf8"), ctx, { filename: f });
    if (f === "core/logic.js") vm.runInContext("var L = logic_();", ctx);
  });
  // Crossing into the sandbox and back as plain JSON keeps assertions simple.
  const plain = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  return {
    ctx, gh, storage,
    L: ctx.L,
    call: (name, ...args) => ctx.Backend.call(name, args).then(plain),
    connect: (token = GOOD_TOKEN) => ctx.Backend.connect(token)
  };
}

module.exports = { loadWeb, fakeGitHub, GOOD_TOKEN };
