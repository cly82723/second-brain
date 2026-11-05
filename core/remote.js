/* Talking to the notebook's web app (apps-script/), the same way the CLY English pages do:
   a POST of {action, key, args} sent as text/plain, so the browser skips the CORS preflight that
   Apps Script can't answer. No sign-in. The key is the secret code at the end of the personal link
   (…/second-brain/#k=…): opened once on a device, it is remembered here and taken out of the
   address bar. Every call resolves to the data, or rejects with an Error whose message can be shown
   as it is; error.locked means the code is missing or wrong. */

// Set to the web app's address after deploying (Deploy → Manage deployments → Web app URL).
var WEB_APP_URL = "PASTE_THE_WEB_APP_URL_HERE";
var KEY_STORE = "tsb-access-key";
var KEY_IN_LINK = /(?:^#|&)k=([A-Za-z0-9_-]{32,128})/;

var Backend = (function () {
  var key = null;
  try { key = localStorage.getItem(KEY_STORE); } catch (e) { key = null; }

  function keep(k) {
    key = k;
    try { if (k) localStorage.setItem(KEY_STORE, k); else localStorage.removeItem(KEY_STORE); } catch (e) { /* private browsing: remembered until the tab closes */ }
  }

  function endpoint() { return window.TSB_WEB_APP || WEB_APP_URL; }

  return {
    // If the page was opened from the personal link, remember the code and tidy the address bar.
    takeKeyFromLink: function () {
      var m = location.hash.match(KEY_IN_LINK);
      if (!m) return false;
      keep(m[1]);
      history.replaceState(null, "", location.pathname + location.search + "#today");
      return true;
    },
    // Accepts a whole personal link or just the code, e.g. pasted on the locked screen.
    useLinkOrCode: function (text) {
      var s = String(text || "").trim();
      var m = s.match(/#k=([A-Za-z0-9_-]{32,128})/) || s.match(/^([A-Za-z0-9_-]{32,128})$/);
      if (!m) return false;
      keep(m[1]);
      return true;
    },
    hasKey: function () { return !!key; },
    forget: function () { keep(null); },
    personalLink: function () { return key ? location.origin + location.pathname + "#k=" + key : ""; },
    call: function (action, args) {
      if (!key) { var none = new Error("This notebook is private. Open your personal link on this device."); none.locked = true; return Promise.reject(none); }
      if (/^PASTE_/.test(endpoint())) return Promise.reject(new Error("The app isn't connected to its Google web app yet (WEB_APP_URL in core/remote.js)."));
      var body = JSON.stringify({ action: action, key: key, args: args || [] });
      return fetch(endpoint(), { method: "POST", body: body })
        .then(function (res) {
          return res.json().catch(function () { throw new Error("The notebook didn't answer properly. Please try again in a minute."); });
        }, function () {
          throw new Error("Can't reach your notebook. Check your internet connection and try again.");
        })
        .then(function (r) {
          if (!r || typeof r.ok !== "boolean") throw new Error("The notebook didn't answer properly. Please try again in a minute.");
          if (r.ok) return r.data;
          var err = new Error(r.error || "Something went wrong. Please try again.");
          if (r.locked) { err.locked = true; keep(null); }
          throw err;
        });
    }
  };
})();
