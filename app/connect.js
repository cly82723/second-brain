/* The "connect" screen: shown the first time on each device, or when GitHub stops accepting the key.
   The key is a fine-grained GitHub token that can only read and write the one private repo that
   holds the notebook. It is kept in this browser's storage and sent only to api.github.com. */

var TOKEN_PAGE = "https://github.com/settings/personal-access-tokens/new";

function showConnect(message) {
  ["nav-side", "nav-tabs"].forEach(function (id) { document.getElementById(id).replaceChildren(); });
  document.getElementById("nav-tabs").hidden = true;
  document.getElementById("new-fab").hidden = true;
  document.getElementById("new-side").hidden = true;
  document.getElementById("who").textContent = "";

  var input = el("input", { class: "input", type: "password", id: "token", autocomplete: "off", spellcheck: "false",
    placeholder: "github_pat_…", "aria-describedby": "token-help" });
  var error = el("p", { class: "connect-error", role: "alert", hidden: !message }, message || "");
  var button = el("button", { type: "submit", class: "btn btn-ink" }, "Connect");
  var form = el("form", { class: "connect-form", onsubmit: function (e) {
    e.preventDefault();
    error.hidden = true;
    busy(button, Backend.connect(input.value)).then(function () {
      input.value = "";
      loadNotebook();
    }, function (err) {
      error.textContent = err.message;
      error.hidden = false;
      input.focus();
    });
  } }, [
    el("label", { for: "token", class: "label" }, "Your GitHub access key"),
    el("div", { class: "row" }, [el("div", { class: "grow" }, input), button]),
    el("p", { class: "hint", id: "token-help" }, "It's kept on this device only and sent only to GitHub. You'll do this once per device.")
  ]);

  var steps = [
    ["Open ", el("a", { href: TOKEN_PAGE, target: "_blank", rel: "noopener" }, "GitHub's new access key page"), " (sign in as cly82723)."],
    ["Name it, e.g. ", el("b", {}, "Second Brain – laptop"), ". Pick an expiry; a year is fine."],
    ["Repository access: ", el("b", {}, "Only select repositories"), " → ", el("b", {}, "teachers-second-brain"), "."],
    ["Permissions → Repository permissions → ", el("b", {}, "Contents"), ": ", el("b", {}, "Read and write"), "."],
    [el("b", {}, "Generate token"), ", copy it, and paste it below."]
  ];

  var page = el("div", { class: "page connect page-enter" }, [
    el("header", { class: "setup-head" }, [
      el("div", { class: "eyebrow" }, "Teachers' Second Brain"),
      el("h1", {}, "Connect your notebook"),
      el("p", {}, "Your notes are saved in your private GitHub repo. To open them on this device, give it a GitHub access key that can only reach that one repo.")
    ]),
    el("section", { class: "panel" }, [
      el("ol", { class: "connect-steps" }, steps.map(function (s) { return el("li", {}, s); })),
      form,
      error
    ])
  ]);
  document.getElementById("main").replaceChildren(page);
  if (!Motion.phone()) input.focus({ preventScroll: true });
}
