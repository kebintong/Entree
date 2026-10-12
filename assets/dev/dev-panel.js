/* ==========================================================================
   Developer panel — optional, plug-in module (the "RAM stick").
   Loaded on demand by assets/js/dev-slot.js when Insert + Delete is pressed.
   Everything it needs lives in this folder (assets/dev/): delete the folder
   and the site works the same, the key combo just does nothing.
   It is hidden from normal visitors, but anyone who knows the keys can open it
   (there is no server, so it is not a security boundary).
   ========================================================================== */
(() => {
  "use strict";
  if (window.ENTREE_DEV) return;
  const slot = window.ENTREE_DEV_SLOT;

  // Bring in this module's own stylesheet from the same folder.
  const here = document.currentScript?.src || document.querySelector("script[data-dev-module]")?.src || "";
  let styled = Promise.resolve();
  if (here && !document.querySelector("link[data-dev-module]")) {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = new URL("dev-panel.css", here).href;
    css.dataset.devModule = "";
    styled = new Promise((resolve) => { css.onload = css.onerror = resolve; setTimeout(resolve, 800); });
    document.head.appendChild(css);
  }
  const PREFIX = "entree.";
  const PAGES = [
    ["index", "Home"],
    ["trips", "Trips"],
    ["passenger-details", "Passenger details"],
    ["payment", "Payment"],
    ["confirmation", "Confirmation"],
    ["bookings", "My Bookings"],
    ["verify-booking", "Verify booking"],
    ["pasalubong", "Pasalubong shop"],
    ["rebook", "Rebook"],
    ["refund", "Refund"],
    ["travel-instructions", "Travel instructions"],
    ["settings", "Settings"],
    ["login", "Log-in"],
    ["signup", "Sign-up"],
  ];
  const STAFF_PAGES = [
    ["admin", "Admin panel"],
    ["shipping-panel", "Shipping panel"],
    ["merchant-panel", "Merchant panel"],
  ];
  // Demo log-ins. The site itself only keeps salted hashes of these passwords
  // (assets/js/accounts.js); the plain passwords live in this module only.
  const DEMO_ACCOUNTS = [
    { role: "customer", label: "Client · Juan Dela Cruz", email: "client@entree.ph", password: "client123" },
    { role: "merchant", label: "Merchant · Cebu Best Sweets", email: "merchant@entree.ph", password: "merchant123" },
    { role: "shipping", label: "Shipping line · Supercat", email: "shipping@entree.ph", password: "shipping123" },
    { role: "admin", label: "Admin (super admin)", email: "admin@entree.ph", password: "admin123" },
  ];
  const LABELS = {
    "entree.bookingDraft.v1": "Booking in progress",
    "entree.bookings.v1": "Saved bookings",
    "entree.refunds.v1": "Refund requests",
    "entree.pasalubongOrders": "Pasalubong orders",
    "entree.verification": "Verify-booking choice",
    "entree.session": "Logged-in session",
    "entree.dev.skipCutoff": "Dev: skip 14-hour cutoff (this tab)",
    "entree.catalog.v1": "Partner changes (fares, products, order status)",
    "entree.staff.v1": "Staff session",
    "entree.accounts.v1": "Accounts, invites & activity log",
  };
  const page = document.body?.dataset.page || "";
  const esc = (value) =>
    String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const safe = (fn, fallback) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  const storages = () => [
    ["Local", safe(() => window.localStorage, null)],
    ["Session", safe(() => window.sessionStorage, null)],
  ].filter(([, s]) => s);
  const entries = () =>
    storages().flatMap(([where, s]) =>
      safe(() => Object.keys(s), [])
        .filter((k) => k.startsWith(PREFIX))
        .sort()
        .map((key) => ({ where, s, key, raw: safe(() => s.getItem(key), "") || "" })),
    );
  const describe = (raw) => {
    const value = safe(() => JSON.parse(raw), raw);
    if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
    if (value && typeof value === "object") return `${Object.keys(value).length} field${Object.keys(value).length === 1 ? "" : "s"}`;
    if (value === null) return "empty";
    return String(value).slice(0, 24);
  };
  const pretty = (raw) => safe(() => JSON.stringify(JSON.parse(raw), null, 2), raw);
  const skipOn = () => Boolean(slot?.flag("skipCutoff"));

  let panel = null;
  let lastFocus = null;

  function render() {
    const items = entries();
    const here = [...PAGES, ...STAFF_PAGES].find(([id]) => id === page)?.[1] || page || "this page";
    const A = window.ENTREE_ACCOUNTS;
    const staff = safe(() => A.staffSession(), null);
    const customer = safe(() => JSON.parse(localStorage.getItem("entree.session")), null);
    const signedIn = staff ? `signed in: ${staff.name}` : customer?.email ? `signed in: ${customer.name || customer.email}` : "not signed in";
    panel.innerHTML = `
      <div class="dev-head">
        <div><p class="dev-kicker">Developer panel</p><h2>${esc(here)}</h2></div>
        <button type="button" class="dev-x" data-dev="close" aria-label="Close developer panel">×</button>
      </div>
      <p class="dev-hint">Insert + Delete toggles this panel. Esc closes it.</p>

      <section class="dev-section">
        <h3>Go to page</h3>
        <div class="dev-pages">${PAGES.map(
          ([id, label]) => `<a href="${id}.html"${id === page ? ' aria-current="page"' : ""}>${esc(label)}</a>`,
        ).join("")}</div>
      </section>

      <section class="dev-section">
        <h3>Partner panels</h3>
        <div class="dev-pages">${STAFF_PAGES.map(
          ([id, label]) => `<a href="${id}.html"${id === page ? ' aria-current="page"' : ""}>${esc(label)}</a>`,
        ).join("")}</div>
      </section>

      ${A ? `<section class="dev-section">
        <h3>Demo accounts <span>${esc(signedIn)}</span></h3>
        <p class="dev-hint">${page === "login" ? "Fill puts the details into the log-in form." : "Open logs you in and goes where that role lands."}</p>
        <ul class="dev-accounts">${DEMO_ACCOUNTS.map((a) => `<li>
          <div class="dev-acct">
            <strong>${esc(a.label)}</strong>
            <code>${esc(a.email)}</code>
            <code>${esc(a.password)}</code>
          </div>
          <div class="dev-row-btns">
            ${page === "login" ? `<button type="button" data-dev="fill:${esc(a.email)}">Fill</button>` : ""}
            <button type="button" data-dev="as:${esc(a.email)}">Open</button>
          </div>
        </li>`).join("")}</ul>
        ${staff || customer ? '<button type="button" class="dev-secondary" data-dev="sign-out">Sign out</button>' : ""}
      </section>` : ""}

      <section class="dev-section">
        <h3>Test switches</h3>
        <label class="dev-switch">
          <input type="checkbox" data-dev="skip-cutoff"${skipOn() ? " checked" : ""} />
          <span class="dev-track" aria-hidden="true"></span>
          <span><strong>Skip the 14-hour pasalubong cutoff</strong><small>Trips leaving soon can still be picked on Verify Booking. This tab only.</small></span>
        </label>
      </section>

      <section class="dev-section">
        <h3>Doode</h3>
        <div class="dev-row-btns">
          <button type="button" data-dev="doode:appear">Show</button>
          <button type="button" data-dev="doode:tour">Start tour</button>
          <button type="button" data-dev="doode:close">Hide</button>
        </div>
      </section>

      <section class="dev-section">
        <h3>Saved on this device <span>${items.length} key${items.length === 1 ? "" : "s"}</span></h3>
        ${
          items.length
            ? `<ul class="dev-keys">${items
                .map(
                  (it, i) => `<li>
                <details>
                  <summary><span class="dev-key-name">${esc(LABELS[it.key] || it.key.slice(PREFIX.length))}</span><span class="dev-key-meta">${esc(it.where)} · ${esc(describe(it.raw))}</span></summary>
                  <pre>${esc(pretty(it.raw))}</pre>
                </details>
                <button type="button" class="dev-clear" data-dev="clear:${i}" aria-label="Clear ${esc(LABELS[it.key] || it.key)}">Clear</button>
              </li>`,
                )
                .join("")}</ul>`
            : '<p class="dev-empty">Nothing saved yet.</p>'
        }
        <button type="button" class="dev-danger" data-dev="reset"${items.length ? "" : " disabled"}>Reset all Entree data</button>
      </section>`;
    panel._items = items;
  }

  function open() {
    if (!panel) {
      panel = document.createElement("aside");
      panel.id = "dev-panel";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "Developer panel");
      panel.addEventListener("click", onClick);
      panel.addEventListener("change", onChange);
      document.body.append(panel);
    }
    lastFocus = document.activeElement;
    render();
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add("is-open"));
    panel.querySelector(".dev-x")?.focus();
  }
  function close() {
    if (!panel || panel.hidden) return;
    panel.classList.remove("is-open");
    panel.hidden = true;
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus?.();
  }
  const isOpen = () => panel && !panel.hidden;

  // A destructive button needs a second click within 3 seconds.
  function confirmed(btn) {
    if (btn.dataset.armed === "1") return true;
    btn.dataset.armed = "1";
    btn.dataset.label = btn.textContent;
    btn.textContent = "Click again to confirm";
    btn.classList.add("is-armed");
    setTimeout(() => {
      if (!btn.isConnected) return;
      btn.dataset.armed = "";
      btn.textContent = btn.dataset.label;
      btn.classList.remove("is-armed");
    }, 3000);
    return false;
  }

  function onClick(e) {
    const btn = e.target.closest("[data-dev]");
    if (!btn || btn.tagName === "INPUT") return;
    const [action, arg] = btn.dataset.dev.split(":");
    if (action === "close") close();
    else if (action === "doode") {
      const d = window.Doode;
      if (!d) return;
      if (arg === "tour") d.tour?.();
      else d[arg]?.();
      close();
    } else if (action === "fill" || action === "as") {
      const email = btn.dataset.dev.slice(action.length + 1);
      const acct = DEMO_ACCOUNTS.find((a) => a.email === email);
      if (!acct) return;
      const form = document.querySelector(".login-form");
      if (action === "fill" && form) {
        form.querySelector('input[type="email"]').value = acct.email;
        form.querySelector('input[type="password"]').value = acct.password;
        close();
        form.querySelector("button[type=submit]")?.focus();
        return;
      }
      const r = safe(() => window.ENTREE_ACCOUNTS.signIn(acct.email, acct.password), null);
      if (r?.ok) location.href = r.home;
      else if (r) {
        btn.closest("li")?.querySelector(".dev-error")?.remove();
        btn.closest("li")?.insertAdjacentHTML("beforeend", `<p class="dev-hint dev-error">${esc(r.error)}</p>`);
      }
    } else if (action === "sign-out") {
      safe(() => window.ENTREE_ACCOUNTS.signOutStaff());
      safe(() => localStorage.removeItem("entree.session"));
      if (["admin", "shipping-panel", "merchant-panel"].includes(page)) location.href = "login.html";
      else location.reload();
    } else if (action === "clear") {
      const it = panel._items?.[Number(arg)];
      if (!it || !confirmed(btn)) return;
      safe(() => it.s.removeItem(it.key));
      location.reload();
    } else if (action === "reset") {
      if (!confirmed(btn)) return;
      entries().forEach((it) => safe(() => it.s.removeItem(it.key)));
      location.reload();
    }
  }
  function onChange(e) {
    if (e.target.dataset.dev !== "skip-cutoff") return;
    slot?.setFlag("skipCutoff", e.target.checked);
    if (page === "verify-booking") location.reload();
    else render();
  }

  // Esc closes the panel (Insert + Delete is handled by the slot).
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && isOpen()) {
        e.stopPropagation();
        close();
      }
    },
    true,
  );

  window.ENTREE_DEV = {
    open: () => styled.then(open),
    close,
    toggle: () => (isOpen() ? close() : styled.then(open)),
  };
})();
