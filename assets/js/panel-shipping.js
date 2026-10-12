/* Entree shipping line panel: overview, schedule & fares, passenger manifest. */
(() => {
  "use strict";
  const P = window.ENTREE_PANEL;
  if (!P) return;
  const s = P.require("shipping");
  if (!s) return;
  const { esc, peso, pesoShort, fmtDate, clock, badge, kpi, empty, toast, todayValue } = P;

  // Each shipping-line account sees only its own line.
  const companyId = s.companyId;
  const company = () => P.companies().find((c) => c.id === companyId);
  if (!company()) { P.signOut(); return; }

  // Every leg this shipping line carries, newest bookings included.
  function legs() {
    return P.bookings()
      .filter((b) => b.status !== "refunded")
      .flatMap((b) => b.legs.filter((l) => l.company === company().name).map((l) => ({ ...l, booking: b })));
  }
  // Group legs into sailings (same day + direction).
  function sailings(list) {
    const map = new Map();
    list.forEach((l) => {
      const key = `${l.date}|${l.dir}`;
      if (!map.has(key)) map.set(key, { date: l.date, dir: l.dir, dep: l.dep, arr: l.arr, legs: [] });
      map.get(key).legs.push(l);
    });
    return [...map.values()].sort((a, b) => (a.date + a.dir).localeCompare(b.date + b.dir));
  }

  /* ----------------------------------------------------------- overview */
  function overview(el) {
    const c = company();
    const today = todayValue();
    const upcoming = legs().filter((l) => l.date >= today);
    const list = sailings(upcoming);
    const cap = c.capacity || 80;
    const next = list[0];
    el.innerHTML = `
      <div class="pn-kpis">
        ${kpi("Passengers booked", upcoming.reduce((n, l) => n + l.pax, 0), "on upcoming sailings")}
        ${kpi("Fare revenue", pesoShort(legs().reduce((n, l) => n + l.fare, 0)), "all paid bookings")}
        ${kpi("Next sailing", next ? fmtDate(next.date, { month: "short", day: "numeric" }) : "—", next ? `${next.dir} · ${clock(next.dep)}` : "No bookings yet")}
        ${kpi("Status", c.active !== false ? "Open" : "Paused", c.active !== false ? "Customers can book you" : "Hidden from customer search")}
      </div>
      <section class="pn-card">
        <div class="pn-card-head"><div><h2>Upcoming sailings</h2><p>Seats per sailing: ${cap}. Change it under Schedule &amp; fares.</p></div><a class="pn-btn pn-btn-sm" href="#manifest">Open manifest</a></div>
        <div class="pn-table-wrap">${list.length ? `<table class="pn-table">
          <thead><tr><th>Date</th><th>Direction</th><th>Time</th><th class="num">Bookings</th><th class="num">Passengers</th><th class="num">Seats left</th></tr></thead>
          <tbody>${list.map((x) => {
            const pax = x.legs.reduce((n, l) => n + l.pax, 0);
            return `<tr><td>${fmtDate(x.date)}</td><td>${esc(x.dir)}<small>${esc(x.legs[0].from)} → ${esc(x.legs[0].to)}</small></td><td>${clock(x.dep)} – ${clock(x.arr)}</td>
              <td class="num">${x.legs.length}</td><td class="num">${pax}</td><td class="num">${Math.max(0, cap - pax)}</td></tr>`;
          }).join("")}</tbody></table>` : empty("No upcoming passengers yet. Bookings made on the customer site show up here.")}</div>
      </section>`;
  }

  /* ----------------------------------------------------------- schedule & fares */
  function schedule(el) {
    const c = company();
    const orig = P.catalog.original().companies.find((x) => x.id === companyId) || {};
    const field = (name, label, type, value, extra = "") =>
      `<label class="pn-field"><span>${label}</span><input class="pn-input" type="${type}" name="${name}" value="${esc(value ?? "")}" ${extra} /></label>`;
    const money = (name, label, value) =>
      `<label class="pn-field"><span>${label}</span><span class="pn-money"><input class="pn-input" type="number" name="${name}" min="1" step="0.01" value="${esc(value ?? "")}" required /></span></label>`;
    el.innerHTML = `
      <section class="pn-card">
        <div class="pn-card-head"><div><h2>Schedule &amp; fares</h2><p>What customers see on the Choose your trips page. In this demo one timetable applies to every route.</p></div></div>
        <form class="pn-card-body pn-form" data-form novalidate>
          <fieldset class="pn-fieldset">
            <legend>Departure (outbound)</legend>
            ${field("departure", "Leaves at", "time", c.departure, "required")}
            ${field("arrival", "Arrives at", "time", c.arrival, "required")}
            ${field("duration", "Trip length", "text", c.duration, 'placeholder="e.g. 2.5 hr"')}
            ${money("price", "Fare per passenger", c.price)}
          </fieldset>
          <fieldset class="pn-fieldset">
            <legend>Return</legend>
            ${field("returnDeparture", "Leaves at", "time", c.returnDeparture, "required")}
            ${field("returnArrival", "Arrives at", "time", c.returnArrival, "required")}
            ${money("returnPrice", "Fare per passenger", c.returnPrice ?? c.price)}
            <label class="pn-toggle" style="align-self:end;padding-bottom:8px"><input type="checkbox" name="overnightReturn" ${c.overnightReturn ? "checked" : ""} /><span class="pn-toggle-track"></span>Arrives the next day</label>
          </fieldset>
          <fieldset class="pn-fieldset">
            <legend>Bookings</legend>
            ${field("capacity", "Seats per sailing", "number", c.capacity || 80, 'min="1" max="2000" step="1" required')}
            <label class="pn-toggle" style="align-self:end;padding-bottom:8px"><input type="checkbox" name="active" ${c.active !== false ? "checked" : ""} /><span class="pn-toggle-track"></span>Accepting bookings</label>
          </fieldset>
          <p class="pn-field-error" data-error role="alert"></p>
          <div class="pn-form-actions">
            <button type="submit" class="pn-btn pn-btn-primary">Save changes</button>
            <button type="button" class="pn-btn" data-reset>Restore original timetable</button>
            <span class="pn-sub">Original: out ${clock(orig.departure)} · ${peso(orig.price)}, back ${clock(orig.returnDeparture)} · ${peso(orig.returnPrice ?? orig.price)}</span>
          </div>
        </form>
      </section>`;

    const form = el.querySelector("[data-form]");
    const error = el.querySelector("[data-error]");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = form.elements;
      const v = {
        departure: f.departure.value, arrival: f.arrival.value, duration: f.duration.value,
        price: f.price.value, returnDeparture: f.returnDeparture.value, returnArrival: f.returnArrival.value,
        returnPrice: f.returnPrice.value, overnightReturn: f.overnightReturn.checked,
        capacity: f.capacity.value, active: f.active.checked,
      };
      const problems = [];
      if (![v.departure, v.arrival, v.returnDeparture, v.returnArrival].every((t) => /^\d{2}:\d{2}$/.test(t))) problems.push("Fill in every departure and arrival time.");
      if (!(Number(v.price) > 0) || !(Number(v.returnPrice) > 0)) problems.push("Fares must be more than ₱0.");
      if (!(Number.isInteger(Number(v.capacity)) && Number(v.capacity) > 0)) problems.push("Seats per sailing must be a whole number above 0.");
      if (!v.overnightReturn && v.returnArrival <= v.returnDeparture) problems.push("The return arrives before it leaves — tick “Arrives the next day” if it's overnight.");
      if (v.arrival <= v.departure) problems.push("The departure trip arrives before it leaves.");
      if (!v.active && P.companies().filter((c) => c.active !== false && c.id !== companyId).length === 0) problems.push("At least one shipping line must stay open for bookings.");
      if (problems.length) {
        error.textContent = problems.join(" ");
        return;
      }
      error.textContent = "";
      P.catalog.updateCompany(companyId, v);
      toast("Saved — customers now see your new timetable and fares.");
    });
    el.querySelector("[data-reset]").addEventListener("click", () => {
      P.catalog.resetCompany(companyId);
      toast("Original timetable restored.");
      schedule(el);
    });
  }

  /* ----------------------------------------------------------- manifest */
  function manifest(el) {
    const today = todayValue();
    const list = sailings(legs());
    const dates = [...new Set(list.map((x) => x.date))];
    const firstUpcoming = dates.find((d) => d >= today) || "";
    el.innerHTML = `
      <section class="pn-card">
        <div class="pn-card-head">
          <div><h2>Passenger manifest</h2><p>${esc(company().name)} · for check-in and boarding</p></div>
          <div class="pn-toolbar">
            <select class="pn-select" aria-label="Sailing date" data-date>
              <option value="">All dates</option>${dates.map((d) => `<option value="${d}" ${d === firstUpcoming ? "selected" : ""}>${fmtDate(d, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</option>`).join("")}
            </select>
            <button type="button" class="pn-btn pn-btn-sm" data-print>Print</button>
          </div>
        </div>
        <div data-list></div>
      </section>`;
    const pick = el.querySelector("[data-date]");
    const draw = () => {
      const shown = list.filter((x) => !pick.value || x.date === pick.value);
      el.querySelector("[data-list]").innerHTML = shown.length ? shown.map((x) => {
        let n = 0;
        const rows = x.legs.flatMap((l) => (l.booking.people.length ? l.booking.people : [{ name: "Name not recorded" }]).map((p) => `<tr>
            <td class="num">${++n}</td><td>${esc(p.name)}</td><td>${esc(p.age ?? "—")}</td><td>${esc(p.gender || "—")}</td>
            <td><span class="pn-ref">${esc(l.booking.ref)}</span></td><td>${esc(l.booking.contact?.phone || "—")}</td></tr>`)).join("");
        const vehicles = x.legs.reduce((t, l) => t + l.booking.vehicles, 0);
        const pets = x.legs.reduce((t, l) => t + l.booking.pets, 0);
        return `<div class="pn-card-body" style="border-top:1px solid var(--pn-line)">
          <p style="margin:0 0 10px"><strong>${fmtDate(x.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · ${esc(x.dir)} ${clock(x.dep)}</strong>
          <span class="pn-sub">${esc(x.legs[0].from)} → ${esc(x.legs[0].to)} · ${n} passenger${n === 1 ? "" : "s"} · ${vehicles} vehicle${vehicles === 1 ? "" : "s"} · ${pets} pet${pets === 1 ? "" : "s"}</span></p>
          <div class="pn-table-wrap"><table class="pn-table pn-table-plain"><thead><tr><th class="num">#</th><th>Passenger</th><th>Age</th><th>Gender</th><th>Booking</th><th>Contact</th></tr></thead><tbody>${rows}</tbody></table></div>
        </div>`;
      }).join("") : empty(pick.value ? "No passengers on this date." : "No passengers booked yet. Bookings made on the customer site show up here.");
    };
    pick.addEventListener("change", draw);
    el.querySelector("[data-print]").addEventListener("click", () => window.print());
    draw();
  }

  const view = P.mount({
    session: s,
    roleLabel: "Shipping line",
    subject: company().name,
    nav: [
      { id: "overview", label: "Overview", icon: "overview" },
      { id: "schedule", label: "Schedule & fares", icon: "clock" },
      { id: "manifest", label: "Passenger manifest", icon: "users" },
    ],
    render(id, el) {
      ({ overview, schedule, manifest })[id](el);
    },
  });
  void view;
})();
