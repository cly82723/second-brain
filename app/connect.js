/* The locked screen: what anyone sees without the secret code, or a device whose code stopped working.
   There's no sign-in. Opening the personal link (…/second-brain/#k=…) unlocks a device for good;
   pasting that link here does the same. */

function showLocked(message) {
  ["nav-side", "nav-tabs"].forEach(function (id) { document.getElementById(id).replaceChildren(); });
  document.getElementById("nav-tabs").hidden = true;
  document.getElementById("new-fab").hidden = true;
  document.getElementById("new-side").hidden = true;
  document.getElementById("who").textContent = "";

  var input = el("input", { class: "input", type: "password", id: "link", autocomplete: "off", spellcheck: "false",
    placeholder: "https://cly82723.github.io/second-brain/#k=…", "aria-describedby": "link-help" });
  var error = el("p", { class: "connect-error", role: "alert", hidden: !message }, message || "");
  var form = el("form", { class: "connect-form", onsubmit: function (e) {
    e.preventDefault();
    if (!Backend.useLinkOrCode(input.value)) {
      error.textContent = "That isn't a personal link. It ends with #k= and a long code.";
      error.hidden = false;
      input.focus();
      return;
    }
    input.value = "";
    loadNotebook();
  } }, [
    el("label", { for: "link", class: "label" }, "Have your personal link? Paste it here"),
    el("div", { class: "row" }, [el("div", { class: "grow" }, input), el("button", { type: "submit", class: "btn btn-ink" }, "Open")]),
    el("p", { class: "hint", id: "link-help" }, "Or just open the link itself on this device. It's remembered after that, with no sign-in.")
  ]);

  document.getElementById("main").replaceChildren(el("div", { class: "page connect page-enter" }, [
    el("header", { class: "setup-head" }, [
      
      el("h1", {}, "This notebook is private"),
      el("p", {}, "It opens from its owner's personal link.")
    ]),
    el("section", { class: "panel" }, [form, error])
  ]));
}
