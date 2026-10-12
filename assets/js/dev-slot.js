/* ==========================================================================
   Developer-panel slot
   The site's "motherboard slot" for the optional developer panel.

   The panel itself lives in assets/dev/ (the "RAM stick"). Nothing is
   downloaded until someone presses Insert + Delete together; only then does
   this slot load assets/dev/dev-panel.js. Delete the assets/dev/ folder and
   the site keeps working exactly the same: the key combo simply does nothing.

   Developer test switches (e.g. "skip the pasalubong cutoff") are read here
   and kept for the current browser tab only, so unplugging the module can never
   leave a test switch stuck on for later visits.
   ========================================================================== */
(() => {
  "use strict";
  const MODULE = "../assets/dev/dev-panel.js";
  const FLAG_PREFIX = "entree.dev.";

  const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
  // Older versions kept dev switches in localStorage; clear them so they can't linger.
  safe(() => localStorage.removeItem("entree.dev.skipCutoff"));

  let state = "idle"; // idle → loading → ready | missing

  function load(then) {
    if (state === "ready") return then();
    if (state === "loading" || state === "missing") return;
    state = "loading";
    const s = document.createElement("script");
    s.src = MODULE;
    s.async = true;
    s.dataset.devModule = "";
    s.onload = () => {
      state = window.ENTREE_DEV ? "ready" : "missing";
      if (state === "ready") then();
    };
    s.onerror = () => {
      state = "missing";
      s.remove();
      safe(() => console.info("[Entree] Developer panel is not installed (assets/dev/ is missing)."));
    };
    document.head.appendChild(s);
  }

  window.ENTREE_DEV_SLOT = {
    // True only when the dev module has been plugged in and switched this flag on.
    flag(name) {
      return safe(() => sessionStorage.getItem(FLAG_PREFIX + name) === "true", false);
    },
    setFlag(name, on) {
      safe(() => (on ? sessionStorage.setItem(FLAG_PREFIX + name, "true") : sessionStorage.removeItem(FLAG_PREFIX + name)));
    },
    open: () => load(() => window.ENTREE_DEV.open()),
  };

  // Insert + Delete toggles the panel.
  const held = new Set();
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Insert" && e.key !== "Delete") return;
    if (e.repeat) return;
    held.add(e.key);
    if (held.has("Insert") && held.has("Delete")) {
      e.preventDefault();
      e.stopPropagation();
      held.clear();
      load(() => window.ENTREE_DEV.toggle());
    }
  }, true);
  window.addEventListener("keyup", (e) => held.delete(e.key), true);
  window.addEventListener("blur", () => held.clear());
})();
