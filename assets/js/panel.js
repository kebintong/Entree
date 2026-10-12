/* Entree — partner panels: shared shell, session checks and data helpers.
   Used by admin.html, shipping-panel.html and merchant-panel.html.
   Everyone signs in on the normal log-in page (login.html); accounts and
   roles live in accounts.js. Demo passwords are listed only in the
   developer panel (Insert + Delete).

   DEMO ACCESS ONLY: accounts and sessions live in the browser, so this is not
   real security. Production needs server-side accounts, sessions and
   per-role permissions behind the same screens. */
(() => {
  "use strict";
  const data = window.ENTREE_DATA || {};
  const catalog = window.ENTREE_CATALOG;

  /* ------------------------------------------------------------------ helpers */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const peso = (n) => "₱" + (Number(n) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pesoShort = (n) => "₱" + Math.round(Number(n) || 0).toLocaleString("en-PH");
  const A = window.ENTREE_ACCOUNTS;
  const slug = (s) => A.slug(s);
  const todayValue = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const fmtDate = (v, opts = { month: "short", day: "numeric", year: "numeric" }) => {
    if (!v) return "—";
    const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + "T12:00:00") : new Date(v);
    return isNaN(d) ? String(v) : d.toLocaleDateString("en-US", opts);
  };
  // "13:00" / "01:00 PM" -> "1:00 PM"
  const clock = (value) => {
    const m = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(String(value || "").trim());
    if (!m) return value || "—";
    let h = Number(m[1]);
    const suffix = m[3] ? m[3].toUpperCase() : h >= 12 ? "PM" : "AM";
    if (!m[3]) h = h % 12 || 12;
    return `${h}:${m[2]} ${suffix}`;
  };

  /* ------------------------------------------------------------------ accounts */
  // Accounts and sessions live in accounts.js (window.ENTREE_ACCOUNTS).
  const companies = () => data.ALL_SHIPPING_COMPANIES || data.SHIPPING_COMPANIES || [];
  // Listed products (removed ones excluded) and every product ever listed (for past orders).
  const everyProduct = () => data.ALL_PRODUCTS || data.PRODUCTS || [];
  const products = () => everyProduct().filter((p) => !p.removed).map((p) => ({ ...p, menu: p.menu.filter((m) => !m.removed) }));
  const merchants = () => [...new Set(everyProduct().map((p) => p.merchant))];
  const PANEL_FOR = A.PANEL_FOR;
  const session = () => A.staffSession();
  // Logging out of a panel logs out of the customer site too.
  function signOut() {
    A.signOut();
    location.href = "login.html";
  }
  // Returns the session if it may open this panel, otherwise sends the visitor to log in.
  function require(role) {
    const s = session();
    if (s && A.find(s.email) && s.role === role) return s;
    // Each panel is for its own role only: a signed-in partner or admin goes back
    // to their own panel; anyone else logs in first.
    if (s && A.find(s.email) && PANEL_FOR[s.role]) location.replace(PANEL_FOR[s.role]);
    else location.replace(`login.html?next=${encodeURIComponent(PANEL_FOR[role])}`);
    return null;
  }
  // Admins never see customers' personal details; shipping lines and merchants
  // see the names they need for boarding manifests and deliveries.
  const masked = () => session()?.role === "admin";
  const person = (p) => (masked() ? { name: A.mask.name(p.name) } : p);
  const contactOf = (c) => (c && masked() ? { name: A.mask.name(c.name), email: A.mask.email(c.email), phone: A.mask.phone(c.phone) } : c);

  /* ------------------------------------------------------------------ data */
  function bookingStatus(b) {
    if (b.refund) return "refunded";
    if (b.status === "completed") return "completed";
    const last = b.returnDate || b.departureDate;
    return last && last < todayValue() ? "completed" : "upcoming";
  }
  function legsOf(b) {
    const pax = Number(b.passengers) || (b.passengerDetails || []).length || 0;
    const legs = [];
    if (b.outboundTrip) {
      legs.push({ dir: "Departure", company: b.outboundTrip.ferry, date: b.departureDate, dep: b.outboundTrip.departureTime, arr: b.outboundTrip.arrivalTime, from: b.route?.origin, to: b.route?.destination, fare: (b.outboundTrip.pricePerPerson || 0) * pax });
      if (b.returnTrip) legs.push({ dir: "Return", company: b.returnTrip.ferry, date: b.returnDate, dep: b.returnTrip.departureTime, arr: b.returnTrip.arrivalTime, from: b.route?.destination, to: b.route?.origin, fare: (b.returnTrip.pricePerPerson || 0) * pax });
    } else {
      // Older demo bookings only record the outbound ferry; attribute the fare to it.
      legs.push({ dir: "Departure", company: b.ferry, date: b.departureDate, dep: b.departureTime, arr: b.arrivalTime, from: b.route?.origin, to: b.route?.destination, fare: b.totalPrice || 0 });
      if (b.returnDate) legs.push({ dir: "Return", company: b.returnFerry || b.ferry, date: b.returnDate, dep: b.returnDepartureTime, arr: b.returnArrivalTime, from: b.route?.destination, to: b.route?.origin, fare: 0 });
    }
    return legs.map((l) => ({ ...l, pax }));
  }
  function bookings() {
    return (data.MOCK_BOOKINGS || []).map((b) => ({
      raw: b,
      id: b.id,
      ref: b.reference,
      status: bookingStatus(b),
      origin: b.route?.origin || "",
      destination: b.route?.destination || "",
      departureDate: b.departureDate,
      returnDate: b.returnDate,
      tripType: b.returnDate ? "Round Trip" : "One Way",
      passengers: Number(b.passengers) || (b.passengerDetails || []).length || 0,
      vehicles: Number(b.vehicles) || 0,
      pets: Number(b.pets) || 0,
      people: (b.passengerDetails || []).map(person),
      contact: contactOf(b.contact || null),
      total: Number(b.totalPrice) || 0,
      payment: b.payment || "",
      bookedAt: b.bookedAt || null,
      refund: b.refund || null,
      legs: legsOf(b),
      local: String(b.id).startsWith("local-"),
    }));
  }
  // Every pasalubong order, with each line tagged by merchant.
  function orders() {
    const variantInfo = {};
    everyProduct().forEach((p) => p.menu.forEach((m) => { variantInfo[m.id] = { merchant: p.merchant, product: p.name }; }));
    const byRef = new Map();
    const list = bookings();
    list.forEach((b) => (b.raw.pasalubongOrders || []).forEach((o) => byRef.set(o.ref, { o, b })));
    // Orders for references that don't match a saved booking still belong to someone.
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem("entree.pasalubongOrders")) || []; } catch { saved = []; }
    if (Array.isArray(saved)) saved.forEach((o) => { if (o && o.ref && !byRef.has(o.ref)) byRef.set(o.ref, { o, b: list.find((b) => String(b.ref).toUpperCase() === String(o.booking).toUpperCase()) || null }); });
    return [...byRef.values()].map(({ o, b }) => ({
      ref: o.ref,
      bookingRef: o.booking,
      name: o.name ? person(o).name : b?.people[0]?.name || "Guest",
      placedAt: o.placedAt,
      method: o.method,
      travelDate: b?.departureDate || null,
      ferry: b?.legs[0]?.company || "",
      route: b ? `${b.origin} → ${b.destination}` : "",
      lines: (o.lines || []).map((l) => ({ ...l, qty: Number(l.qty) || 0, price: Number(l.price) || 0, merchant: variantInfo[l.id]?.merchant || "Unknown merchant", product: variantInfo[l.id]?.product || "" })),
      total: Number(o.total) || 0,
    })).sort((a, b) => String(b.placedAt).localeCompare(String(a.placedAt)));
  }

  /* ------------------------------------------------------------------ UI bits */
  const ICONS = {
    overview: '<path d="M3 13h8V3H3z"/><path d="M13 21h8V11h-8z"/><path d="M13 3v6h8V3z"/><path d="M3 21h8v-6H3z"/>',
    bookings: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    ship: '<path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M12 10v4M12 2v3"/>',
    store: '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M2 7h20"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/>',
    refund: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8H8M16 12H8M13 16H8"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    bell: '<path d="M10.27 21a2 2 0 0 0 3.46 0"/><path d="M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    sidebar: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="m15 9-3 3 3 3"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  };
  const icon = (name, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;

  const STATUS_LABEL = {
    upcoming: ["Upcoming", "info"], completed: ["Completed", "muted"], refunded: ["Refunded", "warn"],
    new: ["New", "info"], preparing: ["Preparing", "warn"], ready: ["Ready for boarding", "good"], delivered: ["Delivered", "muted"],
    live: ["Accepting bookings", "good"], paused: ["Paused", "muted"],
  };
  const badge = (key, text) => {
    const [label, tone] = STATUS_LABEL[key] || [key, "muted"];
    return `<span class="pn-badge pn-badge-${tone}">${esc(text || label)}</span>`;
  };
  const kpi = (label, value, note = "") => `<div class="pn-kpi"><span class="pn-kpi-label">${esc(label)}</span><strong class="pn-kpi-value">${value}</strong>${note ? `<span class="pn-kpi-note">${note}</span>` : ""}</div>`;
  const empty = (text) => `<div class="pn-empty">${esc(text)}</div>`;

  // A single-series horizontal bar list (one hue; values labelled in text ink).
  function barList(rows, format = (v) => v) {
    const max = Math.max(1, ...rows.map((r) => r.value));
    return `<ul class="pn-bars">${rows.map((r) => `<li title="${esc(r.label)}: ${esc(format(r.value))}">
        <span class="pn-bar-label">${esc(r.label)}</span>
        <span class="pn-bar-track"><span class="pn-bar-fill" style="width:${Math.max(r.value ? 2 : 0, (r.value / max) * 100).toFixed(1)}%"></span></span>
        <span class="pn-bar-value">${esc(format(r.value))}</span></li>`).join("")}</ul>`;
  }

  let toastTimer = null;
  function toast(message) {
    let el = $(".pn-toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "pn-toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2600);
  }

  /* ------------------------------------------------------------------ small helpers */
  // CSV text (Excel-friendly) from rows of values, and a browser download.
  function csv(rows) {
    const cell = (v) => {
      const t = v == null ? "" : String(v);
      return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  }
  function download(filename, text, type = "text/csv;charset=utf-8") {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const stamp = () => todayValue();
  // Filter chips: [{ id, label, count }]
  const chips = (items, active) => `<div class="pn-chips" role="group" aria-label="Filter">${items.map((c) =>
    `<button type="button" class="pn-chip${c.id === active ? " is-active" : ""}" data-chip="${esc(c.id)}" aria-pressed="${c.id === active}">${esc(c.label)}${c.count != null ? ` <span>${c.count}</span>` : ""}</button>`).join("")}</div>`;
  // "See more" under long lists.
  const more = (shown, total) => (total > shown ? `<div class="pn-more"><button type="button" class="pn-btn pn-btn-sm" data-more>See more (${total - shown} more)</button></div>` : "");
  // Detail panel that slides in from the right.
  let openDrawer = null;
  function drawer({ eyebrow = "", title = "", body = "", foot = "" }) {
    openDrawer?.close(false);
    const last = document.activeElement;
    const wrap = document.createElement("div");
    wrap.className = "pn-drawer-wrap";
    wrap.innerHTML = `<div class="pn-drawer-backdrop" data-close></div>
      <aside class="pn-drawer" role="dialog" aria-modal="true" aria-labelledby="pn-drawer-title">
        <header class="pn-drawer-head">
          <div>${eyebrow ? `<p class="pn-eyebrow">${esc(eyebrow)}</p>` : ""}<h2 id="pn-drawer-title">${esc(title)}</h2></div>
          <button type="button" class="pn-icon-btn" data-close aria-label="Close">${icon("x", 16)}</button>
        </header>
        <div class="pn-drawer-body"></div>
        <footer class="pn-drawer-foot" hidden></footer>
      </aside>`;
    const panel = $(".pn-drawer", wrap);
    const set = (b, f = "") => {
      $(".pn-drawer-body", wrap).innerHTML = b;
      const footer = $(".pn-drawer-foot", wrap);
      footer.innerHTML = f;
      footer.hidden = !f;
    };
    set(body, foot);
    const onKey = (e) => { if (e.key === "Escape") api.close(); };
    const api = {
      el: panel,
      set,
      close(restore = true) {
        document.removeEventListener("keydown", onKey);
        wrap.classList.remove("is-open");
        setTimeout(() => wrap.remove(), 200);
        if (openDrawer === api) openDrawer = null;
        if (restore && last?.isConnected) last.focus();
      },
    };
    wrap.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) api.close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add("is-open"));
    $("[data-close].pn-icon-btn", wrap).focus();
    openDrawer = api;
    return api;
  }
  // A grid of label / value pairs for drawers.
  const facts = (pairs) => `<dl class="pn-facts">${pairs.filter(Boolean).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>`;

  /* ------------------------------------------------------------------ shell */
  // Sidebar (grouped, collapsible, with count badges) + top bar (search,
  // alerts, profile menu) + page header. Sections route with #hash.
  const SIDEBAR_KEY = "entree.panel.sidebar";
  function mount({ session: s, roleLabel, subject, nav, render, search, alerts, badges }) {
    const root = $("#panel-root");
    const groups = [];
    nav.forEach((n) => { if (!groups.includes(n.group || "")) groups.push(n.group || ""); });
    const level = s.role === "admin" ? A.LEVEL_LABEL[s.level === "super" ? "super" : "staff"] : roleLabel;
    const collapsed = (() => { try { return localStorage.getItem(SIDEBAR_KEY) === "collapsed"; } catch { return false; } })();
    root.innerHTML = `
      <div class="pn-shell${collapsed ? " is-collapsed" : ""}">
        <div class="pn-menu-backdrop" aria-hidden="true"></div>
        <aside class="pn-side" aria-label="Panel navigation">
          <div class="pn-side-head">
            <a class="pn-brand" href="${PANEL_FOR[s.role] || "admin.html"}" title="entree · ${esc(roleLabel)}">
              <img src="../assets/images/entree-logo.png" alt="" width="34" height="34" />
              <span><strong>entree</strong><small>${esc(level)}</small></span>
            </a>
            <button type="button" class="pn-collapse" data-collapse aria-label="${collapsed ? "Show" : "Hide"} sidebar" aria-pressed="${collapsed}" title="${collapsed ? "Show" : "Hide"} sidebar">${icon("sidebar")}</button>
            <button type="button" class="pn-menu-btn" data-menu aria-expanded="false" aria-controls="pn-nav" aria-label="Open menu"><span class="pn-menu-open">${icon("menu", 20)}</span><span class="pn-menu-close">${icon("x", 20)}</span></button>
          </div>
          <nav class="pn-nav" id="pn-nav">${groups.map((g) => `${g ? `<p class="pn-nav-group">${esc(g)}</p>` : ""}${nav.filter((n) => (n.group || "") === g).map((n) =>
            `<a href="#${n.id}" data-route="${n.id}" title="${esc(n.label)}">${icon(n.icon)}<span class="pn-nav-text">${esc(n.label)}</span><span class="pn-nav-badge" data-badge="${n.id}" hidden></span></a>`).join("")}`).join("")}
            <div class="pn-nav-account">
              <span class="pn-avatar" aria-hidden="true">${esc((s.name || "?").charAt(0))}</span>
              <span class="pn-nav-account-text"><strong>${esc(s.name)}</strong><small>${esc(s.role === "admin" ? level : `${roleLabel} · ${subject}`)}</small></span>
              <button type="button" class="pn-nav-signout" data-signout>${icon("out", 16)}<span>Sign out</span></button>
            </div></nav>
          <div class="pn-side-foot">
            <a href="index.html" title="Customer site">${icon("globe")}<span class="pn-nav-text">Customer site</span></a>
          </div>
        </aside>
        <div class="pn-main">
          <header class="pn-topbar${!search && !alerts ? " pn-topbar-bare" : ""}">
            ${search ? `<div class="pn-searchbox">
              ${icon("search", 16)}
              <input type="search" class="pn-search-input" placeholder="${esc(search.placeholder || "Search")}" aria-label="Search" autocomplete="off" />
              <kbd aria-hidden="true">/</kbd>
              <div class="pn-pop pn-search-results" role="listbox" hidden></div>
            </div>` : '<div class="pn-searchbox-spacer"></div>'}
            <div class="pn-topbar-actions">
              ${alerts ? `<div class="pn-pop-anchor">
                <button type="button" class="pn-bell" data-bell aria-haspopup="true" aria-expanded="false" aria-label="Alerts">${icon("bell")}<span class="pn-bell-count" hidden></span></button>
                <div class="pn-pop pn-alerts" hidden></div>
              </div>` : ""}
              <div class="pn-pop-anchor">
                <button type="button" class="pn-profile" data-profile aria-haspopup="true" aria-expanded="false">
                  <span class="pn-avatar" aria-hidden="true">${esc((s.name || "?").charAt(0))}</span>
                  <span class="pn-profile-text"><strong>${esc(s.name)}</strong><small>${esc(level)}</small></span>
                  ${icon("chevron", 14)}
                </button>
                <div class="pn-pop pn-profile-menu" hidden>
                  <div class="pn-profile-head"><strong>${esc(s.name)}</strong><span>${esc(s.email)}</span><span>${esc(s.role === "admin" ? level : `${roleLabel} · ${subject}`)}</span></div>
                  <a href="index.html">${icon("globe", 16)}<span>Customer site</span></a>
                  <button type="button" data-signout>${icon("out", 16)}<span>Sign out</span></button>
                </div>
              </div>
            </div>
          </header>
          <div class="pn-page">
            <header class="pn-top">
              <div>
                <p class="pn-eyebrow" id="pn-eyebrow"></p>
                <h1 class="pn-title" id="pn-title"></h1>
              </div>
              <div class="pn-page-actions" id="pn-actions"></div>
            </header>
            <section class="pn-content" id="pn-content" tabindex="-1"></section>
          </div>
        </div>
      </div>`;

    const shell = $(".pn-shell", root);
    const popups = () => $$(".pn-pop", root);
    const closePops = (except) => popups().forEach((p) => {
      if (p === except) return;
      p.hidden = true;
      p.parentElement.querySelector("[aria-expanded]")?.setAttribute("aria-expanded", "false");
    });
    const toggle = (btn, pop, fill) => {
      const open = pop.hidden;
      closePops(pop);
      if (open) fill?.();
      pop.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
    };
    document.addEventListener("click", (e) => { if (!e.target.closest(".pn-pop-anchor, .pn-searchbox")) closePops(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePops(); });

    // Phone menu: the burger drops the page list over the page. Opening it
    // adds a history step, so the phone's Back button/gesture closes it.
    const menuBtn = $("[data-menu]", root);
    const isOpen = () => shell.classList.contains("is-menu-open");
    let menuStep = false; // a history step was added for the open menu
    let goAfter = null; // section to open once that step is undone
    const paintMenu = (open) => {
      shell.classList.toggle("is-menu-open", open);
      document.documentElement.classList.toggle("pn-menu-lock", open);
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };
    const openMenu = () => {
      closePops();
      // Float the list just under the bar, wherever the page is scrolled.
      shell.style.setProperty("--pn-menu-top", `${Math.round($(".pn-side", root).getBoundingClientRect().bottom)}px`);
      paintMenu(true);
      try { history.pushState({ pnMenu: true }, "", location.href); menuStep = true; } catch { menuStep = false; }
    };
    const closeMenu = (hash) => {
      if (!isOpen()) return;
      if (menuStep) { goAfter = hash || null; history.back(); return; } // popstate finishes it
      paintMenu(false);
      if (hash) location.hash = hash;
    };
    window.addEventListener("popstate", () => {
      if (!menuStep) return;
      menuStep = false;
      paintMenu(false);
      if (goAfter) { const h = goAfter; goAfter = null; location.hash = h; }
    });
    menuBtn.addEventListener("click", () => (isOpen() ? closeMenu() : openMenu()));
    document.addEventListener("click", (e) => { if (isOpen() && !e.target.closest(".pn-side")) closeMenu(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen()) { closeMenu(); menuBtn.focus(); }
    });
    $(".pn-nav", root).addEventListener("click", (e) => {
      const a = e.target.closest("a[data-route]");
      if (!a || !isOpen()) return;
      e.preventDefault();
      closeMenu(a.dataset.route);
    });
    // Rotating to a wide screen hides the menu button, so close the menu too.
    window.matchMedia("(min-width: 861px)").addEventListener?.("change", (m) => { if (m.matches) closeMenu(); });

    // Phones show table rows as cards; each cell gets its column name as a label.
    const labelTables = () => $$(".pn-table", root).forEach((t) => {
      const rows = $$("tbody tr:not([data-labelled])", t);
      if (!rows.length) return;
      const heads = $$("thead th", t).map((th) => th.textContent.trim());
      rows.forEach((tr) => {
        tr.dataset.labelled = "";
        [...tr.children].forEach((td, i) => { td.dataset.label = heads[i] || ""; });
      });
    });
    let labelQueued = false;
    new MutationObserver(() => {
      if (labelQueued) return;
      labelQueued = true;
      requestAnimationFrame(() => { labelQueued = false; labelTables(); });
    }).observe(root, { childList: true, subtree: true });

    $("[data-collapse]", root).addEventListener("click", (e) => {
      const on = shell.classList.toggle("is-collapsed");
      const btn = e.currentTarget;
      btn.setAttribute("aria-pressed", String(on));
      btn.setAttribute("aria-label", `${on ? "Show" : "Hide"} sidebar`);
      btn.title = `${on ? "Show" : "Hide"} sidebar`;
      try { localStorage.setItem(SIDEBAR_KEY, on ? "collapsed" : "open"); } catch { /* ignore */ }
    });
    $$("[data-signout]", root).forEach((b) => b.addEventListener("click", signOut));
    const profile = $("[data-profile]", root);
    profile.addEventListener("click", () => toggle(profile, $(".pn-profile-menu", root)));

    // Alerts (the bell)
    const bell = $("[data-bell]", root);
    const fillAlerts = () => {
      const list = alerts();
      $(".pn-alerts", root).innerHTML = `<p class="pn-pop-title">Needs attention <span>${list.length}</span></p>${list.length
        ? list.slice(0, 6).map((a) => `<a class="pn-pop-item" href="${esc(a.href || "#")}"><span class="pn-dot pn-dot-${esc(a.tone || "info")}"></span><span><strong>${esc(a.title)}</strong><small>${esc(a.sub || "")}</small></span></a>`).join("") +
          (list.length > 6 ? `<a class="pn-pop-foot" href="#overview">See all ${list.length}</a>` : "")
        : '<p class="pn-pop-empty">Nothing needs attention right now.</p>'}`;
    };
    if (bell) {
      bell.addEventListener("click", () => toggle(bell, $(".pn-alerts", root), fillAlerts));
      $(".pn-alerts", root).addEventListener("click", (e) => { if (e.target.closest("a")) closePops(); });
    }

    // Global search
    const input = $(".pn-search-input", root);
    if (input) {
      // A short placeholder on phones, where the box sits beside the bell.
      const narrow = window.matchMedia("(max-width: 860px)");
      const fitPlaceholder = () => { input.placeholder = narrow.matches ? "Search" : search.placeholder || "Search"; };
      fitPlaceholder();
      narrow.addEventListener?.("change", fitPlaceholder);
      const box = $(".pn-search-results", root);
      let results = [];
      let active = -1;
      const paint = () => {
        const groupsSeen = [];
        box.innerHTML = results.length ? results.map((r, i) => {
          const head = groupsSeen.includes(r.group) ? "" : (groupsSeen.push(r.group), `<p class="pn-pop-title">${esc(r.group)}</p>`);
          return `${head}<button type="button" class="pn-pop-item${i === active ? " is-active" : ""}" data-result="${i}" role="option" aria-selected="${i === active}"><span><strong>${esc(r.label)}</strong><small>${esc(r.sub || "")}</small></span></button>`;
        }).join("") : `<p class="pn-pop-empty">No matches. ${esc(search.hint || "")}</p>`;
      };
      const run = () => {
        const q = input.value.trim().toLowerCase();
        if (!q) { box.hidden = true; return; }
        results = search.find(q).slice(0, 12);
        active = results.length ? 0 : -1;
        paint();
        closePops(box);
        box.hidden = false;
      };
      const choose = (i) => {
        const r = results[i];
        if (!r) return;
        box.hidden = true;
        input.value = "";
        input.blur();
        r.go();
      };
      input.addEventListener("input", run);
      input.addEventListener("focus", () => { if (input.value.trim()) run(); });
      input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          if (!results.length) return;
          e.preventDefault();
          active = (active + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
          paint();
        } else if (e.key === "Enter") {
          e.preventDefault();
          choose(active);
        }
      });
      box.addEventListener("click", (e) => { const b = e.target.closest("[data-result]"); if (b) choose(Number(b.dataset.result)); });
      document.addEventListener("keydown", (e) => {
        if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.target.closest("input, textarea, select, [contenteditable]")) return;
        e.preventDefault();
        input.focus();
      });
    }

    const paintBadges = () => {
      const counts = badges ? badges() : {};
      $$("[data-badge]", root).forEach((b) => {
        const c = counts[b.dataset.badge];
        b.hidden = !c || !c.count;
        b.textContent = c?.count || "";
        b.className = `pn-nav-badge${c?.tone ? ` pn-nav-badge-${c.tone}` : ""}`;
      });
      if (bell) {
        const n = alerts().length;
        const count = $(".pn-bell-count", root);
        count.hidden = !n;
        count.textContent = n > 9 ? "9+" : n;
        bell.setAttribute("aria-label", `Alerts${n ? `, ${n} need attention` : ""}`);
      }
    };

    // keep: re-render the current section without closing an open drawer.
    const show = (opts) => {
      const id = (location.hash || "").slice(1);
      const route = nav.find((n) => n.id === id) || nav[0];
      $$(".pn-nav a", root).forEach((a) => {
        const on = a.dataset.route === route.id;
        a.classList.toggle("is-active", on);
        if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      });
      $("#pn-eyebrow").textContent = route.eyebrow || (route.group ? `${route.group} / ${subject}` : subject);
      $("#pn-title").textContent = route.title || route.label;
      $("#pn-actions").innerHTML = "";
      document.title = `${route.title || route.label} · ${roleLabel} | Entree`;
      closePops();
      if (!opts?.keep) openDrawer?.close(false);
      // Fresh elements each time so section listeners never pile up.
      for (const sel of ["#pn-content", "#pn-actions"]) {
        const old = $(sel);
        const fresh = old.cloneNode(false);
        old.replaceWith(fresh);
      }
      render(route.id, $("#pn-content"), $("#pn-actions"));
      labelTables();
      paintBadges();
      // A new section starts at its title, not wherever the last one was scrolled to.
      if (!opts?.keep) window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", show);
    show();
    return {
      refresh: () => show({ keep: true }),
      badges: paintBadges,
      // Go to a section (re-rendering it if it's already open).
      go(id) { if ((location.hash || "").slice(1) === id) show(); else location.hash = id; },
    };
  }

  window.ENTREE_PANEL = {
    $, $$, esc, peso, pesoShort, fmtDate, clock, todayValue, slug, icon, badge, kpi, empty, barList, toast,
    session, signOut, require, mount, PANEL_FOR, masked, accounts: A,
    csv, download, stamp, chips, more, drawer, facts,
    companies, products, merchants, bookings, orders, catalog,
  };
})();
