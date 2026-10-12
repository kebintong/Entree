/* Entree admin panel — the operations command center.
   Overview · Bookings · Refunds · Shipping lines · Merchants · Accounts ·
   Invites · Activity.
   Customer names, emails and phone numbers are always masked here
   (see panel.js and accounts.js). Admins oversee partners from these screens
   but can't open a shipping line's or merchant's own panel. */
(() => {
  "use strict";
  const P = window.ENTREE_PANEL;
  if (!P) return;
  const s = P.require("admin");
  if (!s) return;
  const { esc, peso, pesoShort, fmtDate, clock, empty, toast, icon, chips, more, drawer, facts } = P;
  const A = P.accounts;
  const DAY = 864e5;
  const today = P.todayValue();
  const PAGE = 10;
  const tag = (text, tone) => `<span class="pn-badge pn-badge-${tone}">${esc(text)}</span>`;
  const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
  const timeOf = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const when = (iso) => `${fmtDate(iso)}<small>${timeOf(iso)}</small>`;
  const ago = (iso) => {
    const m = Math.round((Date.now() - Date.parse(iso)) / 6e4);
    if (!Number.isFinite(m)) return "";
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    if (m < 1440) return `${Math.round(m / 60)} hr ago`;
    return fmtDate(iso);
  };
  // Destructive buttons ask twice: the first click arms them for a few seconds.
  function armed(btn, label = "Click again to confirm") {
    if (btn.dataset.armed) return true;
    btn.dataset.armed = "1";
    const original = btn.textContent;
    btn.textContent = label;
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = original; } }, 3500);
    return false;
  }
  const logo = (c) => c?.logo
    ? `<span class="pn-logo"><img src="../assets/images/${esc(c.logo)}" alt="" /></span>`
    : `<span class="pn-logo">${esc((c?.name || "?").slice(0, 2).toUpperCase())}</span>`;
  const exportButton = (label = "Export") => `<button type="button" class="pn-btn" data-export>${icon("download", 16)}<span>${esc(label)}</span></button>`;

  // Hand-offs between sections (e.g. search result → open that booking).
  const pending = { booking: null, account: null, tab: null, invite: null, line: "" };
  // Remembered while the panel is open, so re-renders keep your place.
  const ui = { accountsTab: "customer" };
  let view = null;
  const goTo = (id, patch = {}) => { Object.assign(pending, patch); view.go(id); };

  /* ----------------------------------------------------------- data helpers */
  const REFUNDS_KEY = "entree.refunds.v1";
  const readRefunds = () => { try { return JSON.parse(localStorage.getItem(REFUNDS_KEY)) || {}; } catch { return {}; } };
  function setRefundStatus(id, status) {
    const all = readRefunds();
    if (!all[id]) return false;
    all[id].status = status;
    all[id].updatedAt = new Date().toISOString();
    try { localStorage.setItem(REFUNDS_KEY, JSON.stringify(all)); } catch { return false; }
    const b = (window.ENTREE_DATA.MOCK_BOOKINGS || []).find((x) => x.id === id);
    if (b && b.refund) b.refund.status = status;
    return true;
  }
  const refundState = (b) => {
    const st = String(b.refund?.status || "");
    return /^refunded$/i.test(st) ? "paid" : /approved/i.test(st) ? "approved" : "waiting";
  };
  function decideRefund(id, to) {
    if (!setRefundStatus(id, to)) { toast("This refund can't be changed."); return false; }
    const ref = P.bookings().find((b) => b.id === id)?.ref || id;
    A.record(to === "Refunded" ? "refund-paid" : "refund-approved", to === "Refunded" ? `Marked the refund for ${ref} as paid` : `Approved the refund for ${ref}`);
    toast(to === "Refunded" ? "Refund marked as paid." : "Refund approved — the customer will see it in My Bookings.");
    return true;
  }
  // Bookings with an admin-facing status: upcoming, today, completed or refund.
  const isToday = (b) => b.status !== "refunded" && b.legs.some((l) => l.date === today);
  const viewStatus = (b) => (b.refund ? "refund" : isToday(b) ? "today" : b.status);
  const STATUS_TAG = { upcoming: ["Upcoming", "info"], today: ["Sails today", "good"], completed: ["Completed", "muted"] };
  const REFUND_TAG = { waiting: ["Refund requested", "warn"], approved: ["Refund approved", "info"], paid: ["Refunded", "muted"] };
  const statusTag = (b) => (b.refund ? tag(...REFUND_TAG[refundState(b)]) : tag(...(STATUS_TAG[viewStatus(b)] || [b.status, "muted"])));
  const linesOf = (b) => [...new Set(b.legs.map((l) => l.company).filter(Boolean))];

  // Every sailing that has bookings, with seats booked against capacity.
  function sailings() {
    const map = new Map();
    P.bookings().filter((b) => b.status !== "refunded").forEach((b) => b.legs.forEach((l) => {
      if (!l.company || !l.date) return;
      const key = `${l.company}|${l.date}|${l.dir}`;
      if (!map.has(key)) map.set(key, { company: l.company, date: l.date, dir: l.dir, dep: l.dep, pax: 0, bookings: 0 });
      const x = map.get(key);
      x.pax += l.pax;
      x.bookings += 1;
    }));
    return [...map.values()].map((x) => {
      const c = P.companies().find((co) => co.name === x.company);
      const cap = c?.capacity || 80;
      return { ...x, cap, pct: Math.round((x.pax / cap) * 100) };
    });
  }
  const lineState = (c) => (c.suspended ? "hidden" : c.active === false ? "paused" : "live");
  const LINE_TAG = { live: ["Accepting bookings", "good"], paused: ["Paused", "muted"], hidden: ["Hidden — account deactivated", "danger"] };

  // Everything an admin should look at, newest problems first.
  function attention() {
    const items = [];
    P.bookings().filter((b) => b.refund && refundState(b) === "waiting").forEach((b) => items.push({
      type: "refunds", tone: "warn", title: `Refund request · ${b.ref}`, sub: `${peso(b.refund.amount)} · requested ${fmtDate(b.refund.requestedAt)}`, href: "#refunds", go: () => goTo("refunds"),
    }));
    sailings().filter((x) => x.date >= today && x.pct >= 85).sort((a, b) => b.pct - a.pct).forEach((x) => items.push({
      type: "sailings", tone: x.pct >= 100 ? "danger" : "warn", title: `${x.company} ${x.dir.toLowerCase()} ${fmtDate(x.date, { month: "short", day: "numeric" })} is ${x.pct >= 100 ? "full" : `${x.pct}% full`}`,
      sub: `${x.pax} of ${x.cap} seats booked`, href: "#shipping-lines", go: () => goTo("shipping-lines"),
    }));
    const upcoming = P.bookings().filter((b) => b.status === "upcoming");
    P.companies().filter((c) => lineState(c) !== "live").forEach((c) => {
      const n = upcoming.filter((b) => b.legs.some((l) => l.company === c.name && l.date >= today)).length;
      if (!n) return;
      items.push({
        type: "partners", tone: "danger", title: `${c.name} is ${lineState(c) === "hidden" ? "deactivated" : "paused"} with ${plural(n, "upcoming booking")}`,
        sub: "Contact these passengers about their trip", href: "#bookings", go: () => goTo("bookings", { line: c.name }),
      });
    });
    A.invites().forEach((i) => {
      const left = (Date.parse(i.expiresAt) - Date.now()) / DAY;
      if (i.status === "pending" && left < 2) items.push({ type: "invites", tone: "warn", title: `Invite for ${i.partnerName === "Entree admin team" ? i.email : i.partnerName} expires ${left < 1 ? "today" : "tomorrow"}`, sub: `Sent to ${i.email}`, href: "#invites", go: () => goTo("invites") });
      else if (i.status === "expired") items.push({ type: "invites", tone: "muted", title: `Invite for ${i.partnerName === "Entree admin team" ? i.email : i.partnerName} expired`, sub: "Resend it or revoke it", href: "#invites", go: () => goTo("invites") });
    });
    P.products().filter((p) => !p.hidden && !p.merchantHidden && p.menu.length && p.menu.every((m) => m.available === false)).forEach((p) => items.push({
      type: "products", tone: "muted", title: `${p.name} is sold out`, sub: `${p.merchant} · every option is out of stock`, href: "#merchants", go: () => goTo("merchants"),
    }));
    return items;
  }
  const alertList = () => attention().map((a) => ({ title: a.title, sub: a.sub, tone: a.tone, href: a.href }));

  /* ----------------------------------------------------------- overview */
  const ATTN_TYPES = [["all", "All issues"], ["refunds", "Refunds"], ["sailings", "Sailings"], ["partners", "Partners"], ["invites", "Invites"], ["products", "Products"]];
  function overview(el) {
    const bookings = P.bookings();
    const orders = P.orders();
    const live = bookings.filter((b) => b.status !== "refunded");
    const todays = sailings().filter((x) => x.date === today);
    const items = attention();
    const customers = A.customers();
    const companies = P.companies();
    const staff = A.staff();
    const products = P.products();
    const refunds = bookings.filter((b) => b.refund);
    const refundCount = (st) => refunds.filter((b) => refundState(b) === st).length;
    const kpiCard = (label, value, note, href, link = "View", alert = false) => `<div class="pn-kpi${alert ? " pn-kpi-alert" : ""}">
        <span class="pn-kpi-label">${esc(label)}</span><strong class="pn-kpi-value">${value}</strong><span class="pn-kpi-note">${note}</span>
        <a class="pn-kpi-link" href="${href}" aria-label="${esc(`${link} ${label.toLowerCase()}`)}"><span>${esc(link)}</span> →</a></div>`;
    const ops = (title, ico, rows, href, link, data = "") => `<section class="pn-card"><h3>${icon(ico, 18)}${esc(title)}</h3>
        <dl>${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>
        <a href="${href}"${data}>${esc(link)} →</a></section>`;
    let filter = "all";
    let shown = 8;

    el.innerHTML = `
      <div class="pn-kpis pn-kpis-5">
        ${kpiCard("Bookings", bookings.length, `${bookings.filter((b) => b.status === "upcoming").length} upcoming`, "#bookings")}
        ${kpiCard("Sailings today", todays.length, `${plural(todays.reduce((n, x) => n + x.pax, 0), "passenger")}`, "#shipping-lines")}
        ${kpiCard("Ticket sales", pesoShort(live.reduce((n, b) => n + b.total, 0)), plural(live.length, "paid booking"), "#bookings")}
        ${kpiCard("Pasalubong sales", pesoShort(orders.reduce((n, o) => n + o.total, 0)), plural(orders.length, "order"), "#merchants")}
        ${kpiCard("Needs attention", items.length, items.length ? "Open items below" : "All clear", "#overview", "Inspect", items.length > 0).replace('href="#overview"', 'href="#overview" data-inspect')}
      </div>
      <section class="pn-card" id="attention">
        <div class="pn-card-head"><div><h2>Needs attention<span class="pn-count">${items.length}</span></h2><p>Refunds to decide, sailings filling up, partners who are paused, invites running out and sold-out products</p></div></div>
        <div class="pn-card-body" data-chips></div>
        <div data-list></div>
      </section>
      <h2 class="pn-section-title">Operations overview</h2>
      <div class="pn-ops">
        ${ops("Customers", "users", [["Accounts", customers.length], ["New this week", customers.filter((c) => Date.now() - Date.parse(c.joined) < 7 * DAY).length], ["Suspended", customers.filter((c) => c.status === "suspended").length]], "#accounts", "View customers", ' data-tab="customer"')}
        ${ops("Shipping lines", "ship", [["Accepting bookings", companies.filter((c) => lineState(c) === "live").length], ["Paused or deactivated", companies.filter((c) => lineState(c) !== "live").length], ["Without an account", companies.filter((c) => !A.accountFor("shipping", c.id)).length]], "#shipping-lines", "View shipping lines")}
        ${ops("Merchants", "store", [["With an account", staff.filter((a) => a.role === "merchant").length], ["Products in the shop", products.filter((p) => !p.hidden && !p.merchantHidden).length], ["Sold out", items.filter((i) => i.type === "products").length]], "#merchants", "View merchants")}
        ${ops("Refunds", "refund", [["Waiting for approval", refundCount("waiting")], ["Approved, to pay", refundCount("approved")], ["Refunded", pesoShort(refunds.filter((b) => refundState(b) === "paid").reduce((n, b) => n + (Number(b.refund.amount) || 0), 0))]], "#refunds", "View refunds")}
      </div>
      <section class="pn-card">
        <div class="pn-card-head"><div><h2>Recent activity</h2><p>Latest sign-ins and changes</p></div><a class="pn-btn pn-btn-sm" href="#activity">View all</a></div>
        <div class="pn-table-wrap">${activityTable(A.log().slice(0, 6))}</div>
      </section>`;

    const draw = () => {
      el.querySelector("[data-chips]").innerHTML = chips(ATTN_TYPES.map(([id, label]) => ({ id, label, count: id === "all" ? items.length : items.filter((i) => i.type === id).length })), filter);
      const list = items.filter((i) => filter === "all" || i.type === filter);
      el.querySelector("[data-list]").innerHTML = list.length
        ? `<ul class="pn-attn">${list.slice(0, shown).map((i) => `<li><a href="${i.href}" data-attn="${items.indexOf(i)}"><span class="pn-dot pn-dot-${i.tone}"></span><span class="pn-attn-text"><strong>${esc(i.title)}</strong><small>${esc(i.sub)}</small></span>${icon("chevron", 14).replace("<svg", '<svg style="transform:rotate(-90deg)"')}</a></li>`).join("")}</ul>${more(shown, list.length)}`
        : `<div class="pn-card-body">${empty(items.length ? "Nothing in this group." : "Nothing needs attention right now.")}</div>`;
    };
    el.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-chip]");
      if (chip) { filter = chip.dataset.chip; shown = 8; draw(); return; }
      if (e.target.closest("[data-more]")) { shown += 8; draw(); return; }
      const a = e.target.closest("[data-attn]");
      if (a) { e.preventDefault(); items[Number(a.dataset.attn)].go(); return; }
      if (e.target.closest("[data-inspect]")) { e.preventDefault(); el.querySelector("#attention").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      const tab = e.target.closest("[data-tab]");
      if (tab) pending.tab = tab.dataset.tab;
    });
    draw();
  }

  /* ----------------------------------------------------------- bookings */
  const BOOKING_CHIPS = [["all", "All"], ["upcoming", "Upcoming"], ["today", "Sails today"], ["completed", "Completed"], ["refund", "Refunds"]];
  function bookingRow(b) {
    return `<tr>
      <td><span class="pn-ref">${esc(b.ref)}</span><small>${b.bookedAt ? `Booked ${fmtDate(b.bookedAt)}` : ""}</small></td>
      <td>${esc(b.origin)} → ${esc(b.destination)}<small>${fmtDate(b.departureDate)}${b.returnDate ? ` – ${fmtDate(b.returnDate)}` : ""} · ${b.tripType}</small></td>
      <td>${linesOf(b).map(esc).join("<br>") || "—"}</td>
      <td class="num">${b.passengers}</td>
      <td class="num">${peso(b.total)}</td>
      <td>${statusTag(b)}</td>
      <td class="num"><button type="button" class="pn-btn pn-btn-sm" data-booking="${esc(b.id)}">Details</button></td></tr>`;
  }
  function bookingDrawer(id) {
    const b = P.bookings().find((x) => x.id === id);
    if (!b) return;
    const orders = P.orders().filter((o) => String(o.bookingRef).toUpperCase() === String(b.ref).toUpperCase());
    const payWith = b.payment === "gcash" ? "GCash" : b.payment === "bank" ? "Online bank" : "—";
    const body = () => {
      const fresh = P.bookings().find((x) => x.id === id) || b;
      const r = fresh.refund;
      return `${facts([
        ["Status", statusTag(fresh)], ["Trip", esc(fresh.tripType)],
        ["Route", `${esc(fresh.origin)} → ${esc(fresh.destination)}`], ["Booked", fresh.bookedAt ? `${fmtDate(fresh.bookedAt)}<small> · ${timeOf(fresh.bookedAt)}</small>` : "—"],
        ["Party", esc([plural(fresh.passengers, "passenger"), fresh.vehicles ? plural(fresh.vehicles, "vehicle") : "", fresh.pets ? plural(fresh.pets, "pet") : ""].filter(Boolean).join(" · "))],
        ["Paid", `${peso(fresh.total)}<small> · ${esc(payWith)}</small>`],
      ])}
      <h3>Sailings</h3>
      <ul class="pn-mini-list">${fresh.legs.map((l) => `<li><span><strong>${esc(l.dir)} · ${esc(l.company || "—")}</strong><small>${fmtDate(l.date)} · ${clock(l.dep)}${l.arr ? ` – ${clock(l.arr)}` : ""} · ${esc(l.from || "")} → ${esc(l.to || "")}</small></span><span>${peso(l.fare)}</span></li>`).join("")}</ul>
      <h3>Passengers <span class="pn-masked-note">masked</span></h3>
      <ul class="pn-mini-list">${fresh.people.length ? fresh.people.map((p) => `<li><span>${esc(p.name)}</span></li>`).join("") : "<li><span>Not recorded</span></li>"}</ul>
      ${fresh.contact?.email ? `<h3>Contact <span class="pn-masked-note">masked</span></h3>${facts([["Name", esc(fresh.contact.name)], ["Email", esc(fresh.contact.email)], ["Mobile", esc(fresh.contact.phone)]])}` : ""}
      <h3>Pasalubong</h3>
      ${orders.length ? `<ul class="pn-mini-list">${orders.map((o) => `<li><span><strong>${esc(o.ref)}</strong><small>${o.lines.reduce((n, l) => n + l.qty, 0)} items · ${esc([...new Set(o.lines.map((l) => l.merchant))].join(", "))}</small></span><span>${peso(o.total)}</span></li>`).join("")}</ul>` : '<p class="pn-sub">No pasalubong on this booking.</p>'}
      ${r ? `<h3>Refund</h3>${facts([["Status", tag(...REFUND_TAG[refundState(fresh)])], ["Amount", `${peso(r.amount)}<small> · ${esc(r.percent)}% of ${peso(fresh.total)}</small>`], ["Requested", fmtDate(r.requestedAt)], ["Reason", esc(r.reason || "—")]])}` : ""}`;
    };
    const foot = () => {
      const fresh = P.bookings().find((x) => x.id === id) || b;
      if (!fresh.refund) return "";
      const st = refundState(fresh);
      return st === "waiting" ? `<button type="button" class="pn-btn pn-btn-primary" data-decide="Refund approved">Approve refund</button>`
        : st === "approved" ? `<button type="button" class="pn-btn" data-decide="Refunded">Mark refund as paid</button>` : "";
    };
    const d = drawer({ eyebrow: "Booking", title: b.ref, body: body(), foot: foot() });
    d.el.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-decide]");
      if (!btn) return;
      if (decideRefund(id, btn.dataset.decide)) { d.set(body(), foot()); view.badges(); }
    });
  }
  function bookingsSection(el, actions) {
    let filter = "all";
    let line = pending.line || "";
    let shown = PAGE;
    pending.line = "";
    actions.innerHTML = exportButton("Export CSV");
    el.innerHTML = `
      <div class="pn-filters"><div data-chips></div></div>
      <section class="pn-card">
        <div class="pn-card-head">
          <div><h2>All bookings</h2><p><span data-count></span> · contact details are masked</p></div>
          <div class="pn-toolbar">
            <input class="pn-input pn-search" type="search" placeholder="Search reference or port" aria-label="Search bookings" data-q />
            <select class="pn-select" aria-label="Filter by shipping line" data-line>
              <option value="">All shipping lines</option>${P.companies().map((c) => `<option${c.name === line ? " selected" : ""}>${esc(c.name)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div data-table></div>
      </section>`;
    const q = el.querySelector("[data-q]");
    const sel = el.querySelector("[data-line]");
    const matches = () => {
      const text = q.value.trim().toLowerCase();
      return P.bookings().filter((b) => (!line || b.legs.some((l) => l.company === line)) &&
        (!text || [b.ref, b.origin, b.destination].join(" ").toLowerCase().includes(text)));
    };
    const draw = () => {
      const base = matches();
      const list = base.filter((b) => filter === "all" || viewStatus(b) === filter);
      el.querySelector("[data-chips]").innerHTML = chips(BOOKING_CHIPS.map(([id, label]) => ({ id, label, count: id === "all" ? base.length : base.filter((b) => viewStatus(b) === id).length })), filter);
      el.querySelector("[data-count]").textContent = plural(list.length, "booking");
      el.querySelector("[data-table]").innerHTML = list.length ? `<div class="pn-table-wrap"><table class="pn-table">
        <thead><tr><th>Reference</th><th>Trip</th><th>Shipping line</th><th class="num">Pax</th><th class="num">Total</th><th>Status</th><th></th></tr></thead>
        <tbody>${list.slice(0, shown).map(bookingRow).join("")}</tbody></table></div>${more(shown, list.length)}`
        : `<div class="pn-card-body">${empty(P.bookings().length ? "No bookings match these filters." : "No bookings yet. Bookings made on the site show up here.")}</div>`;
    };
    el.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-chip]");
      if (chip) { filter = chip.dataset.chip; shown = PAGE; draw(); return; }
      if (e.target.closest("[data-more]")) { shown += PAGE; draw(); return; }
      const btn = e.target.closest("[data-booking]");
      if (btn) bookingDrawer(btn.dataset.booking);
    });
    q.addEventListener("input", () => { shown = PAGE; draw(); });
    sel.addEventListener("change", () => { line = sel.value; shown = PAGE; draw(); });
    actions.addEventListener("click", (e) => {
      if (!e.target.closest("[data-export]")) return;
      const list = matches().filter((b) => filter === "all" || viewStatus(b) === filter);
      P.download(`entree-bookings-${P.stamp()}.csv`, P.csv([
        ["Reference", "Status", "Booked", "Origin", "Destination", "Trip type", "Departure", "Return", "Shipping lines", "Passengers", "Vehicles", "Pets", "Total (PHP)", "Payment", "Contact (masked)", "Refund status"],
        ...list.map((b) => [b.ref, b.refund ? REFUND_TAG[refundState(b)][0] : (STATUS_TAG[viewStatus(b)] || [b.status])[0], b.bookedAt || "", b.origin, b.destination, b.tripType, b.departureDate, b.returnDate || "", linesOf(b).join(" / "), b.passengers, b.vehicles, b.pets, b.total.toFixed(2), b.payment, b.contact?.email || "", b.refund?.status || ""]),
      ]));
      A.record("export", `Exported ${plural(list.length, "booking")} to CSV`);
    });
    draw();
    if (pending.booking) { const id = pending.booking; pending.booking = null; bookingDrawer(id); }
  }

  /* ----------------------------------------------------------- refunds */
  const REFUND_CHIPS = [["all", "All"], ["waiting", "Waiting"], ["approved", "Approved"], ["paid", "Refunded"]];
  function refundsSection(el) {
    let filter = "all";
    const draw = () => {
      const all = P.bookings().filter((b) => b.refund);
      const list = all.filter((b) => filter === "all" || refundState(b) === filter);
      el.innerHTML = `${chips(REFUND_CHIPS.map(([id, label]) => ({ id, label, count: id === "all" ? all.length : all.filter((b) => refundState(b) === id).length })), filter)}
      <section class="pn-card">
        <div class="pn-card-head"><div><h2>Refund requests</h2><p>Customers request these from My Bookings. Approving updates what they see.</p></div></div>
        <div class="pn-table-wrap">${list.length ? `<table class="pn-table">
          <thead><tr><th>Booking</th><th>Requested</th><th>Reason</th><th class="num">Refund</th><th>Status</th><th></th></tr></thead>
          <tbody>${list.map((b) => {
            const st = refundState(b);
            return `<tr>
              <td><button type="button" class="pn-row-link" data-booking="${esc(b.id)}">${esc(b.ref)}</button><small>${esc(b.origin)} → ${esc(b.destination)}</small></td>
              <td>${fmtDate(b.refund.requestedAt)}</td>
              <td>${esc(b.refund.reason || "—")}</td>
              <td class="num">${peso(b.refund.amount)}<small>${esc(b.refund.percent)}% of ${peso(b.total)}</small></td>
              <td>${tag(...REFUND_TAG[st])}</td>
              <td class="num">${st === "paid" ? "" : st === "approved"
                ? `<button class="pn-btn pn-btn-sm" data-refund="${esc(b.id)}" data-to="Refunded">Mark as paid</button>`
                : `<button class="pn-btn pn-btn-sm pn-btn-primary" data-refund="${esc(b.id)}" data-to="Refund approved">Approve</button>`}</td>
            </tr>`;
          }).join("")}</tbody></table>` : `<div class="pn-card-body">${empty(all.length ? "No refunds in this group." : "No refund requests yet.")}</div>`}</div>
      </section>`;
    };
    el.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-chip]");
      if (chip) { filter = chip.dataset.chip; draw(); return; }
      const open = e.target.closest("[data-booking]");
      if (open) { bookingDrawer(open.dataset.booking); return; }
      const btn = e.target.closest("[data-refund]");
      if (btn && decideRefund(btn.dataset.refund, btn.dataset.to)) { draw(); view.badges(); }
    });
    draw();
  }

  /* ----------------------------------------------------------- shipping lines & merchants */
  function accountLine(role, id) {
    const a = A.accountFor(role, id);
    if (a) return `<p class="pn-account">${icon("user", 14)}<span>${esc(a.email)}</span>${a.status === "suspended" ? tag("Deactivated", "danger") : ""}<button type="button" class="pn-row-link" data-account="${esc(a.email)}">Account</button></p>`;
    const invited = A.invites().find((i) => i.role === role && i.partnerId === id && i.status === "pending");
    return `<p class="pn-account pn-account-none">${icon("user", 14)}<span>${invited ? "Invite sent, not accepted yet" : "No account yet"}</span>${invited ? "" : `<a href="#invites" data-invite="${esc(role)}:${esc(id)}">Invite</a>`}</p>`;
  }
  // Partner card pieces: logo + name on the left, status badge top-right,
  // then three numbers in a row.
  const CARD_TAG = { live: ["Accepting bookings", "good"], paused: ["Paused", "muted"], hidden: ["Deactivated", "danger"] };
  const partnerHead = (logoHtml, name, sub, status) => `<div class="pn-partner-head">${logoHtml}<div class="pn-partner-name"><h3>${esc(name)}</h3><span class="pn-sub">${esc(sub)}</span></div>${tag(...status)}</div>`;
  const partnerStats = (list) => `<dl class="pn-pstats">${list.map(([v, k]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
  function partnerLinks(el) {
    el.addEventListener("click", (e) => {
      const inv = e.target.closest("[data-invite]");
      if (inv) pending.invite = inv.dataset.invite;
      const acct = e.target.closest("[data-account]");
      if (acct) openAccount(acct.dataset.account);
    });
  }
  function shippingSection(el) {
    const draw = () => {
      const bookings = P.bookings().filter((b) => b.status !== "refunded");
      const sail = sailings().filter((x) => x.date >= today);
      el.innerHTML = `<div class="pn-partners">${P.companies().map((c) => {
        const legs = bookings.flatMap((b) => b.legs.filter((l) => l.company === c.name));
        const pax = legs.reduce((n, l) => n + l.pax, 0);
        const st = lineState(c);
        const busiest = sail.filter((x) => x.company === c.name).sort((a, b) => b.pct - a.pct)[0];
        return `<article class="pn-card pn-partner">
          ${partnerHead(logo(c), c.name, st === "hidden" ? "Hidden from customers" : busiest ? `Busiest sailing ${busiest.pct}% full` : "No upcoming sailings yet", CARD_TAG[st])}
          ${partnerStats([[pax, pax === 1 ? "Passenger" : "Passengers"], [pesoShort(legs.reduce((n, l) => n + l.fare, 0)), "Fares"], [sail.filter((x) => x.company === c.name).length, "Upcoming sailings"]])}
          <dl class="pn-times">
            <div><dt>Outbound</dt><dd>${clock(c.departure)}<span>${peso(c.price)}</span></dd></div>
            <div><dt>Return</dt><dd>${clock(c.returnDeparture)}<span>${peso(c.returnPrice ?? c.price)}</span></dd></div>
          </dl>
          ${accountLine("shipping", c.id)}
          <div class="pn-form-actions">
            <label class="pn-toggle"><input type="checkbox" data-active="${esc(c.id)}" ${c.active !== false ? "checked" : ""} ${st === "hidden" ? "disabled" : ""} /><span class="pn-toggle-track"></span>Open for bookings</label>
          </div>
        </article>`;
      }).join("")}</div>`;
    };
    partnerLinks(el);
    el.addEventListener("change", (e) => {
      const box = e.target.closest("[data-active]");
      if (!box) return;
      const liveCount = P.companies().filter((c) => lineState(c) === "live").length;
      if (!box.checked && liveCount <= 1) {
        box.checked = true;
        toast("At least one shipping line must stay open for bookings.");
        return;
      }
      const c = P.catalog.updateCompany(box.dataset.active, { active: box.checked });
      A.record(box.checked ? "line-resumed" : "line-paused", `${box.checked ? "Reopened" : "Paused"} bookings for ${c.name}`);
      toast(`${c.name} is ${box.checked ? "accepting bookings again" : "paused — customers won't see it in search"}.`);
      draw();
      view.badges();
    });
    draw();
  }
  function merchantsSection(el) {
    const orders = P.orders();
    el.innerHTML = `<div class="pn-partners">${P.merchants().map((m) => {
      const items = P.products().filter((p) => p.merchant === m);
      const lines = orders.flatMap((o) => o.lines.filter((l) => l.merchant === m));
      const orderCount = orders.filter((o) => o.lines.some((l) => l.merchant === m)).length;
      const variants = items.flatMap((p) => p.menu);
      const liveVariants = items.filter((p) => !p.hidden).flatMap((p) => p.menu).filter((v) => v.available !== false).length;
      const hidden = items.some((p) => p.merchantHidden);
      const status = hidden ? ["Deactivated", "danger"] : liveVariants ? ["In the shop", "good"] : ["Nothing for sale", "muted"];
      return `<article class="pn-card pn-partner">
        ${partnerHead(`<span class="pn-logo">${icon("store", 20)}</span>`, m, hidden ? "Hidden from customers" : `${plural(items.length, "product")} · ${liveVariants}/${variants.length} options live`, status)}
        ${partnerStats([[orderCount, orderCount === 1 ? "Order" : "Orders"], [lines.reduce((n, l) => n + l.qty, 0), "Items sold"], [pesoShort(lines.reduce((n, l) => n + l.qty * l.price, 0)), "Sales"]])}
        ${accountLine("merchant", P.slug(m))}
      </article>`;
    }).join("") || empty("No merchants yet.")}</div>`;
    partnerLinks(el);
  }

  /* ----------------------------------------------------------- accounts */
  const TABS = [["customer", "Customers"], ["shipping", "Shipping lines"], ["merchant", "Merchants"], ["admin", "Admins"]];
  const REASONS = {
    customer: ["Suspected fraud", "Abusive behaviour", "Requested by the customer", "Other"],
    partner: ["Partnership ended", "Repeated cancellations", "Unpaid fees", "Policy violation", "Other"],
    admin: ["Left the team", "Role changed", "Security concern", "Other"],
  };
  const statusLabel = (role, st) => (st === "suspended" ? tag(role === "customer" ? "Suspended" : "Deactivated", "danger") : tag("Active", "good"));
  function accountRows(tab) {
    if (tab === "customer") return A.customers().map((c) => ({ key: c.id, search: `${c.name} ${c.emailMasked}`, status: c.status, raw: c }));
    return A.staff().filter((a) => a.role === tab).map((a) => ({ key: a.email, search: `${a.label} ${a.name} ${a.email}`, status: a.status, raw: a }));
  }
  function accountDrawer(key, tab) {
    const isCustomer = tab === "customer";
    const find = () => (isCustomer ? A.customers().find((c) => c.id === key) : A.staff().find((a) => a.email === key));
    const a = find();
    if (!a) return;
    const role = isCustomer ? "customer" : a.role;
    const reasons = REASONS[role === "customer" ? "customer" : role === "admin" ? "admin" : "partner"];
    const meSuper = A.isSuper();
    const canChange = role !== "admin" || (meSuper && a.email !== s.email && a.level !== "super");
    const body = () => {
      const x = find();
      const company = role === "shipping" ? P.companies().find((c) => c.id === x.companyId) : null;
      const upcoming = company ? P.bookings().filter((b) => b.status === "upcoming" && b.legs.some((l) => l.company === company.name && l.date >= today)).length : 0;
      const prods = role === "merchant" ? P.products().filter((p) => p.merchant === x.merchant) : [];
      return facts([
        ["Status", `${statusLabel(role, x.status)}${x.reason ? `<small> · ${esc(x.reason)}</small>` : ""}`],
        ["Account type", esc(role === "admin" ? A.LEVEL_LABEL[x.level] : A.ROLE_LABEL[role])],
        isCustomer ? ["Name", `${esc(x.name)} <span class="pn-masked-note">masked</span>`] : ["Contact person", esc(x.name)],
        isCustomer ? ["Email", esc(x.emailMasked)] : ["Sign-in email", esc(x.email)],
        ["Phone", esc(isCustomer ? x.phone : x.phone || "—")],
        ["Joined", `${fmtDate(isCustomer ? x.joined : x.createdAt)}<small> · ${x.via === "invite" ? "through an invite" : x.via === "signup" ? "signed up" : "demo account"}</small>`],
        company && ["Shipping line", `${esc(company.name)}<small> · ${esc(LINE_TAG[lineState(company)][0])}</small>`],
        company && ["Upcoming bookings", upcoming],
        role === "merchant" && ["Shop", esc(x.merchant)],
        role === "merchant" && ["Products in the shop", prods.filter((p) => !p.hidden && !p.merchantHidden).length],
      ]) + `<p class="pn-sub" style="margin-top:18px">${
        role === "customer" ? "A suspended customer can't log in and is signed out on their next page. Their bookings stay valid."
        : role === "shipping" ? "Deactivating blocks this line's log-in and hides its trips from customers until you reactivate it. Existing bookings stay valid."
        : role === "merchant" ? "Deactivating blocks this merchant's log-in and hides their products from the shop until you reactivate it."
        : canChange ? "Deactivating ends this admin's access straight away." : a.email === s.email ? "This is your account." : "Only the super admin can change admin accounts."}</p>`;
    };
    const foot = (asking = false) => {
      const x = find();
      if (!canChange) return "";
      if (x.status === "suspended") return `<button type="button" class="pn-btn pn-btn-primary" data-reactivate>Reactivate</button>`;
      return asking
        ? `<select class="pn-select" data-reason aria-label="Reason">${reasons.map((r) => `<option>${esc(r)}</option>`).join("")}</select><button type="button" class="pn-btn pn-btn-danger" data-confirm>${role === "customer" ? "Suspend" : "Deactivate"}</button><button type="button" class="pn-btn" data-cancel>Cancel</button>`
        : `<button type="button" class="pn-btn pn-btn-danger" data-ask>${role === "customer" ? "Suspend account…" : "Deactivate account…"}</button>`;
    };
    const d = drawer({ eyebrow: A.ROLE_LABEL[role] || "Account", title: isCustomer ? a.name : role === "admin" ? a.name : a.label, body: body(), foot: foot() });
    const change = (status, reason) => {
      const r = isCustomer ? A.setCustomerStatus(key, status, reason) : A.setStaffStatus(key, status, reason);
      if (!r.ok) { toast(r.error); return; }
      toast(status === "suspended" ? `${role === "customer" ? "Account suspended" : "Account deactivated"}.` : "Account reactivated.");
      d.set(body(), foot());
      view.refresh();
    };
    d.el.addEventListener("click", (e) => {
      if (e.target.closest("[data-ask]")) { d.set(body(), foot(true)); d.el.querySelector("[data-reason]")?.focus(); }
      else if (e.target.closest("[data-cancel]")) d.set(body(), foot());
      else if (e.target.closest("[data-confirm]")) change("suspended", d.el.querySelector("[data-reason]")?.value || "");
      else if (e.target.closest("[data-reactivate]")) change("active");
    });
    return d;
  }
  // Shipping-line / merchant cards open an account by email; find its tab.
  const openAccount = (email) => {
    const a = A.staff().find((x) => x.email === email);
    if (a) accountDrawer(email, a.role);
  };
  function accountTable(tab, rows) {
    if (!rows.length) return "";
    const head = {
      customer: "<th>Customer</th><th>Phone</th><th>Joined</th><th>Status</th><th></th>",
      shipping: "<th>Shipping line</th><th>Contact</th><th>Listing</th><th>Joined</th><th>Status</th><th></th>",
      merchant: "<th>Merchant</th><th>Contact</th><th class=\"num\">Products live</th><th>Joined</th><th>Status</th><th></th>",
      admin: "<th>Admin</th><th>Level</th><th>Joined</th><th>Status</th><th></th>",
    }[tab];
    const row = ({ key, raw: x }) => {
      const btn = `<td class="num"><button type="button" class="pn-btn pn-btn-sm" data-open="${esc(key)}">View profile</button></td>`;
      if (tab === "customer") return `<tr><td>${esc(x.name)}<small>${esc(x.emailMasked)}</small></td><td>${esc(x.phone)}</td><td>${fmtDate(x.joined)}</td><td>${statusLabel("customer", x.status)}${x.reason ? `<small>${esc(x.reason)}</small>` : ""}</td>${btn}</tr>`;
      if (tab === "admin") return `<tr><td>${esc(x.name)}${x.email === s.email ? " <small>(you)</small>" : ""}<small>${esc(x.email)}</small></td><td>${esc(A.LEVEL_LABEL[x.level])}</td><td>${fmtDate(x.createdAt)}</td><td>${statusLabel("admin", x.status)}</td>${btn}</tr>`;
      if (tab === "shipping") {
        const c = P.companies().find((co) => co.id === x.companyId);
        return `<tr><td><span class="pn-inline-logo">${logo(c)}${esc(x.label)}</span></td><td>${esc(x.name)}<small>${esc(x.email)}</small></td><td>${c ? tag(...LINE_TAG[lineState(c)]) : "—"}</td><td>${fmtDate(x.createdAt)}</td><td>${statusLabel("shipping", x.status)}</td>${btn}</tr>`;
      }
      const live = P.products().filter((p) => p.merchant === x.merchant && !p.hidden && !p.merchantHidden).length;
      return `<tr><td>${esc(x.label)}</td><td>${esc(x.name)}<small>${esc(x.email)}</small></td><td class="num">${live}</td><td>${fmtDate(x.createdAt)}</td><td>${statusLabel("merchant", x.status)}</td>${btn}</tr>`;
    };
    return `<table class="pn-table"><thead><tr>${head}</tr></thead><tbody>${rows.map(row).join("")}</tbody></table>`;
  }
  function accountsSection(el, actions) {
    let tab = pending.tab || ui.accountsTab;
    ui.accountsTab = tab;
    pending.tab = null;
    let status = "";
    let shown = PAGE;
    actions.innerHTML = exportButton("Export CSV");
    el.innerHTML = `
      <div class="pn-tabs" role="tablist" data-tabs></div>
      <div class="pn-filters">
        <div class="pn-toolbar">
          <input class="pn-input pn-search" type="search" placeholder="Search accounts" aria-label="Search accounts" data-q />
          <select class="pn-select" data-status aria-label="Filter by status"></select>
        </div>
        <p class="pn-sub" data-note></p>
      </div>
      <section class="pn-card"><div data-table></div></section>`;
    const q = el.querySelector("[data-q]");
    const st = el.querySelector("[data-status]");
    const rows = () => {
      const text = q.value.trim().toLowerCase();
      return accountRows(tab).filter((r) => (!status || r.status === status) && (!text || r.search.toLowerCase().includes(text)));
    };
    const draw = () => {
      el.querySelector("[data-tabs]").innerHTML = TABS.map(([id, label]) => `<button type="button" role="tab" class="pn-tab${id === tab ? " is-active" : ""}" aria-selected="${id === tab}" data-tab="${id}">${esc(label)} (${accountRows(id).length})</button>`).join("");
      st.innerHTML = `<option value="">All statuses</option><option value="active"${status === "active" ? " selected" : ""}>Active</option><option value="suspended"${status === "suspended" ? " selected" : ""}>${tab === "customer" ? "Suspended" : "Deactivated"}</option>`;
      el.querySelector("[data-note]").textContent = tab === "customer"
        ? "Names, emails and phone numbers are masked. Guests who book without an account aren't listed."
        : tab === "admin" ? (A.isSuper() ? "You're the super admin: you can invite and deactivate admin staff." : "Only the super admin can invite or deactivate admins.")
        : "Partners join by invite. Deactivating one blocks their log-in and hides their listings.";
      const list = rows();
      el.querySelector("[data-table]").innerHTML = list.length
        ? `<div class="pn-table-wrap">${accountTable(tab, list.slice(0, shown))}</div>${more(shown, list.length)}`
        : `<div class="pn-card-body">${empty(accountRows(tab).length ? "No accounts match." : tab === "customer" ? "No customer accounts yet." : "No accounts yet. Send an invite to add one.")}</div>`;
    };
    el.addEventListener("click", (e) => {
      const t = e.target.closest("[data-tab]");
      if (t) { tab = ui.accountsTab = t.dataset.tab; status = ""; q.value = ""; shown = PAGE; draw(); return; }
      if (e.target.closest("[data-more]")) { shown += PAGE; draw(); return; }
      const open = e.target.closest("[data-open]");
      if (open) accountDrawer(open.dataset.open, tab);
    });
    q.addEventListener("input", () => { shown = PAGE; draw(); });
    st.addEventListener("change", () => { status = st.value; shown = PAGE; draw(); });
    actions.addEventListener("click", (e) => {
      if (!e.target.closest("[data-export]")) return;
      const list = rows().map((r) => r.raw);
      const label = TABS.find(([id]) => id === tab)[1];
      const data = tab === "customer"
        ? [["Customer (masked)", "Email (masked)", "Phone (masked)", "Joined", "Status", "Reason"], ...list.map((c) => [c.name, c.emailMasked, c.phone, c.joined, c.status === "suspended" ? "Suspended" : "Active", c.reason])]
        : [["Name", "Business", "Email", "Type", "Joined", "Status", "Reason"], ...list.map((a) => [a.name, a.role === "admin" ? "Entree" : a.label, a.email, a.role === "admin" ? A.LEVEL_LABEL[a.level] : A.ROLE_LABEL[a.role], a.createdAt, a.status === "suspended" ? "Deactivated" : "Active", a.reason])];
      P.download(`entree-${P.slug(label)}-${P.stamp()}.csv`, P.csv(data));
      A.record("export", `Exported ${plural(list.length, "account")} (${label.toLowerCase()}) to CSV`);
    });
    draw();
    if (pending.account) { const k = pending.account; pending.account = null; openAccount(k); }
  }

  /* ----------------------------------------------------------- invites */
  const INVITE_TONE = { pending: ["Pending", "info"], accepted: ["Joined", "good"], revoked: ["Revoked", "muted"], expired: ["Expired", "warn"] };
  const ROLE_CARDS = [["shipping", "Shipping line", "ship", "Runs ferry trips"], ["merchant", "Merchant", "store", "Sells pasalubong"], ["admin", "Admin staff", "shield", "Helps run Entree"]];
  function invitesSection(el) {
    const meSuper = A.isSuper();
    let role = pending.invite ? pending.invite.split(":")[0] : "shipping";
    let chosen = pending.invite ? pending.invite.split(":").slice(1).join(":") : "";
    pending.invite = null;
    let lastInvite = null;
    let shown = PAGE;
    const options = () => A.partners(role).map((p) => {
      const has = A.accountFor(role, p.id);
      const invited = A.invites().some((i) => i.role === role && i.partnerId === p.id && i.status === "pending");
      const note = has ? " — has an account" : invited ? " — invite pending" : "";
      return `<option value="${esc(p.id)}"${has || invited ? " disabled" : ""}${p.id === chosen ? " selected" : ""}>${esc(p.name + note)}</option>`;
    }).join("");
    const draw = () => {
      const invites = A.invites();
      el.innerHTML = `
        <section class="pn-card">
          <div class="pn-card-head"><div><h2>Send an invite</h2><p>Nobody can sign up as a partner or admin on their own. Each invite link works once and expires after ${A.INVITE_DAYS} days.</p></div></div>
          <div class="pn-card-body">
            <div class="pn-role-cards" role="radiogroup" aria-label="Account type">${ROLE_CARDS.map(([id, label, ico, sub]) => {
              const locked = id === "admin" && !meSuper;
              return `<button type="button" role="radio" class="pn-role-card${role === id ? " is-active" : ""}" data-role="${id}" aria-checked="${role === id}"${locked ? " disabled" : ""}>${icon(ico, 22)}<strong>${esc(label)}</strong><small>${locked ? "Super admin only" : esc(sub)}</small></button>`;
            }).join("")}</div>
            <form class="pn-form pn-invite-form" novalidate>
              <div class="pn-invite-grid">
                ${role === "admin"
                  ? `<label class="pn-field" style="grid-column:span 2"><span>Their work email</span><input class="pn-input" type="email" name="email" placeholder="name@entree.ph" autocomplete="off" required /></label>
                     <p class="pn-sub" style="align-self:end;margin:0 0 8px">They join as <strong>admin staff</strong>: bookings, refunds, invites and partner accounts, but not other admins.</p>`
                  : `<label class="pn-field"><span>Business</span><select class="pn-select" name="partner" required><option value="">Choose a ${role === "shipping" ? "shipping line" : "merchant"}</option>${options()}</select></label>
                     <label class="pn-field"><span>Work email</span><input class="pn-input" type="email" name="email" placeholder="name@business.ph" autocomplete="off" required /></label>`}
              </div>
              <p class="pn-field-error" data-error role="alert"></p>
              <div class="pn-form-actions"><button class="pn-btn pn-btn-primary" type="submit">Create invite link</button></div>
            </form>
            ${lastInvite ? `<div class="pn-invite-link">
              <p><strong>Invite link for ${esc(lastInvite.role === "admin" ? lastInvite.email : lastInvite.partnerName)}</strong><span>Send it to ${esc(lastInvite.email)}. It expires ${fmtDate(lastInvite.expiresAt)}.</span></p>
              <div class="pn-copy"><input class="pn-input" readonly value="${esc(lastInvite.url)}" aria-label="Invite link" /><button class="pn-btn pn-btn-sm" type="button" data-copy="${esc(lastInvite.url)}">Copy link</button></div>
            </div>` : ""}
          </div>
        </section>
        <section class="pn-card">
          <div class="pn-card-head"><div><h2>Invites</h2><p>${plural(invites.length, "invite")} · resending makes a fresh link and cancels the old one</p></div></div>
          ${invites.length ? `<div class="pn-table-wrap"><table class="pn-table">
            <thead><tr><th>For</th><th>Sent to</th><th>Sent</th><th>Expires</th><th>Status</th><th></th></tr></thead>
            <tbody>${invites.slice(0, shown).map((i) => {
              const [label, tone] = INVITE_TONE[i.status] || [i.status, "muted"];
              const mine = i.role !== "admin" || meSuper;
              return `<tr>
                <td>${esc(i.role === "admin" ? "Admin staff" : i.partnerName)}<small>${esc(i.role === "admin" ? "Entree team" : A.ROLE_LABEL[i.role])}</small></td>
                <td>${esc(i.email)}</td>
                <td>${fmtDate(i.resentAt || i.createdAt)}${i.resentAt ? "<small>Resent</small>" : ""}</td>
                <td>${i.status === "accepted" ? `<small>Joined ${fmtDate(i.acceptedAt)}</small>` : fmtDate(i.expiresAt)}</td>
                <td>${tag(label, tone)}</td>
                <td class="num"><div class="pn-row-btns">${mine ? `
                  ${i.status === "pending" ? `<button class="pn-btn pn-btn-sm" type="button" data-copy="${esc(i.url)}">Copy link</button>` : ""}
                  ${["pending", "expired"].includes(i.status) ? `<button class="pn-btn pn-btn-sm" type="button" data-resend="${esc(i.token)}">Resend</button>` : ""}
                  ${i.status === "pending" ? `<button class="pn-btn pn-btn-sm pn-btn-danger" type="button" data-revoke="${esc(i.token)}">Revoke</button>` : ""}` : ""}
                </div></td></tr>`;
            }).join("")}</tbody></table></div>${more(shown, invites.length)}` : `<div class="pn-card-body">${empty("No invites yet.")}</div>`}
        </section>`;
    };
    el.addEventListener("change", (e) => { if (e.target.name === "partner") chosen = e.target.value; });
    el.addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const result = A.createInvite({ role, partnerId: form.partner?.value, email: form.email.value });
      if (!result.ok) { form.querySelector("[data-error]").textContent = result.error; return; }
      lastInvite = result.invite;
      chosen = "";
      toast(`Invite link created for ${result.invite.role === "admin" ? result.invite.email : result.invite.partnerName}.`);
      draw();
      view.badges();
    });
    el.addEventListener("click", async (e) => {
      const card = e.target.closest("[data-role]");
      if (card && !card.disabled) { role = card.dataset.role; chosen = ""; draw(); return; }
      if (e.target.closest("[data-more]")) { shown += PAGE; draw(); return; }
      const copy = e.target.closest("[data-copy]");
      const resend = e.target.closest("[data-resend]");
      const revoke = e.target.closest("[data-revoke]");
      if (copy) {
        try { await navigator.clipboard.writeText(copy.dataset.copy); toast("Invite link copied."); }
        catch { toast("Copy isn't available here — select the link and copy it."); }
      } else if (resend) {
        const r = A.resendInvite(resend.dataset.resend);
        if (r.ok) { lastInvite = r.invite; toast("New link ready. Demo: no email is sent — copy the link."); }
        else toast(r.error);
        draw();
        view.badges();
      } else if (revoke) {
        if (!armed(revoke, "Confirm revoke")) return;
        const r = A.revokeInvite(revoke.dataset.revoke);
        if (r.ok && lastInvite?.token === r.invite.token) lastInvite = null;
        toast(r.ok ? "Invite revoked. The link no longer works." : r.error);
        draw();
        view.badges();
      }
    });
    draw();
  }

  /* ----------------------------------------------------------- activity log */
  const ROLE_FILTER = [["", "All roles"], ["admin", "Admins"], ["shipping", "Shipping lines"], ["merchant", "Merchants"]];
  const DATE_FILTER = [["", "Any time"], ["1", "Today"], ["7", "Last 7 days"], ["30", "Last 30 days"]];
  function activityTable(list) {
    if (!list.length) return `<div class="pn-card-body">${empty("No activity yet.")}</div>`;
    return `<table class="pn-table pn-table-feed">
      <thead><tr><th>When</th><th>Who</th><th>What happened</th></tr></thead>
      <tbody>${list.map((l) => `<tr><td>${when(l.at)}</td><td>${esc(l.actor.name)}<small>${esc(A.ROLE_LABEL[l.actor.role] || l.actor.role)}</small></td><td>${esc(l.text)}</td></tr>`).join("")}</tbody>
    </table>`;
  }
  function activitySection(el, actions) {
    const log = A.log();
    let shown = 15;
    actions.innerHTML = `${exportButton("Export CSV").replace("data-export", 'data-export="csv"')}${exportButton("Export JSON").replace("data-export", 'data-export="json"')}`;
    el.innerHTML = `<section class="pn-card">
      <div class="pn-card-head">
        <div><h2>Activity log</h2><p>Sign-ins and changes made in the partner panels, newest first. Customer details are masked here too.</p></div>
        <div class="pn-toolbar">
          <input class="pn-input pn-search" type="search" placeholder="Search activity" aria-label="Search activity" data-q />
          <select class="pn-select" data-role aria-label="Filter by role">${ROLE_FILTER.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select>
          <select class="pn-select" data-days aria-label="Filter by date">${DATE_FILTER.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select>
        </div>
      </div>
      <div data-table></div>
    </section>`;
    const q = el.querySelector("[data-q]");
    const role = el.querySelector("[data-role]");
    const days = el.querySelector("[data-days]");
    const list = () => {
      const text = q.value.trim().toLowerCase();
      const since = days.value === "1" ? new Date(new Date().setHours(0, 0, 0, 0)).getTime() : days.value ? Date.now() - Number(days.value) * DAY : 0;
      return log.filter((l) => (!role.value || l.actor.role === role.value) && Date.parse(l.at) >= since &&
        (!text || `${l.text} ${l.actor.name}`.toLowerCase().includes(text)));
    };
    const draw = () => {
      const all = list();
      el.querySelector("[data-table]").innerHTML = all.length
        ? `<div class="pn-table-wrap">${activityTable(all.slice(0, shown))}</div>${more(shown, all.length)}`
        : `<div class="pn-card-body">${empty(log.length ? "Nothing matches these filters." : "No activity yet.")}</div>`;
    };
    [q, role, days].forEach((c) => c.addEventListener("input", () => { shown = 15; draw(); }));
    el.addEventListener("click", (e) => { if (e.target.closest("[data-more]")) { shown += 15; draw(); } });
    actions.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-export]");
      if (!btn) return;
      const rows = list();
      if (btn.dataset.export === "json") P.download(`entree-activity-${P.stamp()}.json`, JSON.stringify(rows, null, 2), "application/json");
      else P.download(`entree-activity-${P.stamp()}.csv`, P.csv([["When", "Who", "Role", "Email", "Action", "What happened"], ...rows.map((l) => [l.at, l.actor.name, A.ROLE_LABEL[l.actor.role] || l.actor.role, l.actor.email, l.action, l.text])]));
      A.record("export", `Exported ${plural(rows.length, "activity entry", "activity entries")} to ${btn.dataset.export.toUpperCase()}`);
    });
    draw();
  }

  /* ----------------------------------------------------------- global search */
  // Bookings, partners, admins and invites. Customers aren't searchable, to protect their privacy.
  const search = {
    placeholder: "Search bookings, partners, invites…",
    hint: "Customers can't be searched, to protect their privacy.",
    find(q) {
      const has = (...parts) => parts.join(" ").toLowerCase().includes(q);
      const out = [];
      P.bookings().filter((b) => has(b.ref, b.origin, b.destination)).slice(0, 5).forEach((b) => out.push({
        group: "Bookings", label: b.ref, sub: `${b.origin} → ${b.destination} · ${fmtDate(b.departureDate)}`, go: () => goTo("bookings", { booking: b.id }),
      }));
      P.companies().filter((c) => has(c.name)).forEach((c) => out.push({ group: "Shipping lines", label: c.name, sub: LINE_TAG[lineState(c)][0], go: () => goTo("shipping-lines") }));
      P.merchants().filter((m) => has(m)).forEach((m) => out.push({ group: "Merchants", label: m, sub: plural(P.products().filter((p) => p.merchant === m).length, "product"), go: () => goTo("merchants") }));
      A.staff().filter((a) => has(a.name, a.email, a.label)).forEach((a) => out.push({
        group: "Accounts", label: a.role === "admin" ? a.name : a.label, sub: `${a.role === "admin" ? A.LEVEL_LABEL[a.level] : A.ROLE_LABEL[a.role]} · ${a.email}`, go: () => goTo("accounts", { tab: a.role, account: a.email }),
      }));
      A.invites().filter((i) => has(i.partnerName, i.email)).slice(0, 4).forEach((i) => out.push({ group: "Invites", label: i.role === "admin" ? i.email : i.partnerName, sub: `${INVITE_TONE[i.status]?.[0] || i.status} · ${i.email}`, go: () => goTo("invites") }));
      return out;
    },
  };

  view = P.mount({
    session: s,
    roleLabel: "Admin",
    subject: "Entree operations",
    search,
    alerts: alertList,
    badges: () => ({
      bookings: { count: P.bookings().filter((b) => b.status === "upcoming").length },
      refunds: { count: P.bookings().filter((b) => b.refund && refundState(b) === "waiting").length, tone: "warn" },
      invites: { count: A.invites().filter((i) => i.status === "pending").length },
    }),
    nav: [
      { id: "overview", label: "Overview", icon: "overview", group: "Overview", eyebrow: "Command center" },
      { id: "bookings", label: "Bookings", icon: "bookings", group: "Operations" },
      { id: "refunds", label: "Refunds", icon: "refund", group: "Operations" },
      { id: "shipping-lines", label: "Shipping lines", icon: "ship", group: "Operations" },
      { id: "merchants", label: "Merchants", icon: "store", group: "Operations" },
      { id: "accounts", label: "Accounts", icon: "users", group: "Management", eyebrow: "Management / Everyone who can log in" },
      { id: "invites", label: "Invites", icon: "mail", group: "Management", eyebrow: "Management / Partners and admin staff" },
      { id: "activity", label: "Activity", icon: "clock", group: "Management", title: "Activity log", eyebrow: "Management / Audit trail" },
    ],
    render(id, el, actions) {
      ({ overview, bookings: bookingsSection, refunds: refundsSection, "shipping-lines": shippingSection, merchants: merchantsSection, accounts: accountsSection, invites: invitesSection, activity: activitySection })[id](el, actions);
    },
  });
})();
