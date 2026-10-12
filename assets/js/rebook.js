/* Scripts for pages/rebook.html (the reschedule page).
   Step by step, like the booking flow:
     1 Trips & passengers  – departure, return or both; who is moving
     2 New dates           – the landing page's calendar; each shipping line
                              sails once a day, so picking a day picks the sailing
     3 Review & pay        – before → after, rebooking fee per ticket + fare
                              difference, then confirm
   A "Your booking" sidebar shows now → new and the running total. On phones a
   bar at the bottom holds Back / Next.
   The cost comes from ENTREE_BOOKING.rescheduleQuote; Confirm saves it with
   ENTREE_BOOKING.reschedule.
   Loaded before app.js; app.js runs this once the page is ready and passes in the
   shared helpers (see "Shared with the page scripts" in app.js). */
window.ENTREE_PAGES = window.ENTREE_PAGES || {};
window.ENTREE_PAGES["rebook"] = (E) => {
  const { $, $$, escape, markSaved, notice, booking } = E;
  const flow = window.ENTREE_BOOKING;
  const record = booking();
  const root = $("#rebook-root");
  if (!record || !root) return {};

  const FEE = flow.REBOOK_FEE || 200;
  const WIDE = window.matchMedia("(min-width: 851px)");
  const STEPS = ["Trips & passengers", "New dates", "Review & pay"];
  const money = (v) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(v);
  const longDate = (v) => (v ? new Date(v + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "");
  const shortDate = (v) => new Date(v + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const dayValue = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const origin = record.route?.origin || record.origin;
  const destination = record.route?.destination || record.destination;
  const ICON_CAL = '<svg class="rb-date-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>';
  const ICON_CHEVRON = '<svg class="rb-date-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const ICON_CHECK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

  // "05:40", "9:00 AM" → Date on that day
  function at(day, time) {
    const m = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(String(time || "").trim());
    if (!day || !m) return null;
    let h = Number(m[1]);
    if (m[3]) h = (h % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0);
    const d = new Date(day + "T00:00:00");
    d.setHours(h, Number(m[2]), 0, 0);
    return d;
  }
  const arrival = (day, trip) => {
    const d = at(day, trip?.arrivalTime);
    if (d && trip?.arrivalNextDay) d.setDate(d.getDate() + 1);
    return d;
  };

  // The legs of this booking as it is now.
  const legs = [{
    key: "outbound", label: "Departure", from: origin, to: destination, date: record.departureDate,
    trip: record.outboundTrip || { ferry: record.ferry, departureTime: record.departureTime, arrivalTime: record.arrivalTime },
  }];
  if (record.returnDate && (record.returnTrip || record.returnDepartureTime)) {
    legs.push({
      key: "return", label: "Return", from: destination, to: origin, date: record.returnDate,
      trip: record.returnTrip || { ferry: record.returnFerry || record.ferry, departureTime: record.returnDepartureTime, arrivalTime: record.returnArrivalTime },
    });
  }
  const legOf = (key) => legs.find((l) => l.key === key);
  const sailed = (l) => {
    const d = at(l.date, l.trip.departureTime);
    return Boolean(d && d <= Date.now());
  };
  const open = legs.filter((l) => !sailed(l));
  const people = record.passengerDetails || [];

  const state = {
    step: 1,
    which: open[0]?.key || "outbound", // "outbound" | "return" | "both"
    chosen: new Set(people.map((_, i) => i)),
    pick: { outbound: null, return: null },
    cal: null, // the leg whose calendar is open
    month: { outbound: null, return: null }, // first day of the month on show
    done: null,
  };
  const moving = () => (state.which === "both" ? ["outbound", "return"] : [state.which]);
  const refunded = () => Boolean(record.refund || flow.refundOf?.(record.id));

  // The departure as it will be after this change (new pick, or as booked).
  const outboundAfter = () => {
    const l = legOf("outbound");
    return state.pick.outbound && moving().includes("outbound") ? { date: state.pick.outbound.date, trip: state.pick.outbound } : { date: l.date, trip: l.trip };
  };
  // The earliest and latest new date for a leg.
  function range(key) {
    let min = flow.firstBookableDate();
    let max = "";
    if (key === "return") {
      const out = outboundAfter();
      if (out.date > min) min = out.date;
    } else if (legOf("return") && !moving().includes("return")) {
      max = legOf("return").date;
    }
    return { min, max };
  }

  // That shipping line's sailings for a leg on one day.
  function sailingsOn(key, day) {
    const l = legOf(key);
    const value = { ...record, tripType: legs.length > 1 ? "Round Trip" : "One Way", passengers: state.chosen.size || 1 };
    if (key === "outbound") value.departureDate = day;
    else value.returnDate = day;
    const arrives = key === "return" ? arrival(outboundAfter().date, outboundAfter().trip) : null;
    return flow.options(key, value)
      .filter((o) => o.ferry === l.trip.ferry)
      .map((o) => {
        const leaves = at(day, o.departureTime);
        return {
          ...o, date: day,
          current: day === l.date && o.departureTime === l.trip.departureTime,
          tooEarly: Boolean(arrives && leaves && leaves < arrives),
          diff: Math.round(((Number(o.pricePerPerson) || 0) - (Number(l.trip.pricePerPerson) || 0)) * 100) / 100,
        };
      });
  }
  // A day in the calendar: the usable sailings, or why it's greyed out.
  function dayInfo(key, day) {
    const { min, max } = range(key);
    if (day < min) return { usable: [], why: "Not available" };
    if (max && day > max) return { usable: [], why: "After your return trip" };
    const all = sailingsOn(key, day);
    if (!all.length) return { usable: [], why: "No sailing" };
    const usable = all.filter((o) => !o.current && !o.tooEarly);
    if (!usable.length) return { usable, why: all.some((o) => o.current) ? "Your current trip" : "Leaves before your departure arrives", current: all.some((o) => o.current) };
    return { usable, dearer: usable.some((o) => o.diff > 0) };
  }
  function firstUsable(key) {
    let day = range(key).min;
    for (let i = 0; i < 60; i += 1, day = flow.addDays(day, 1)) {
      if (dayInfo(key, day).usable.length) return day;
    }
    return "";
  }

  function quote() {
    const keys = moving();
    if (!keys.every((k) => state.pick[k])) return null;
    const trips = Object.fromEntries(keys.map((k) => [k, state.pick[k]]));
    return flow.rescheduleQuote(record.id, { trips, passengers: [...state.chosen] });
  }
  const datesReady = () => moving().every((k) => state.pick[k]);
  // Why "Next" can't go on yet (empty = it can).
  function blocker(step, q) {
    if (refunded()) return "This booking was refunded and can no longer be rescheduled.";
    if (step === 1) return state.chosen.size ? "" : "Select at least one passenger.";
    if (step === 2) return !datesReady() ? `Pick ${moving().length > 1 ? "both new days" : "a new day"} first.` : q?.error || "";
    return q?.error || "";
  }

  // ------------------------------------------------------------------ pieces
  function logo(name, cls = "rb-pick-logo") {
    const c = window.ENTREE_DATA.SHIPPING_COMPANIES.find((x) => x.name === name);
    return c?.logo ? `<img class="${cls}" src="../assets/images/${escape(c.logo)}" alt="${escape(name)} logo" />` : `<span class="${cls} bf-logo-text">${escape(name)}</span>`;
  }
  const legLine = (date, trip) => `${shortDate(date)} · ${trip.departureTime || ""} → ${trip.arrivalTime || ""}`;
  // finished: every step ticked and none of them clickable any more.
  function stepper(finished = false) {
    const at = finished ? STEPS.length + 1 : state.step;
    return `<ol class="rb-stepper" aria-label="Steps">${STEPS.map((label, i) => {
      const n = i + 1;
      const status = n < at ? "done" : n === at ? "now" : "next";
      const dot = status === "done" ? ICON_CHECK : n;
      const inner = `<span class="rb-stepper-dot">${dot}</span><span class="rb-stepper-label">${escape(label)}</span>`;
      return `${i ? `<li class="rb-stepper-line${n <= at ? " is-done" : ""}" aria-hidden="true"></li>` : ""}<li class="rb-stepper-item is-${status}"${status === "now" ? ' aria-current="step"' : ""}>${status === "done" && !finished ? `<button type="button" data-goto="${n}" aria-label="Back to step ${n}: ${escape(label)}">${inner}</button>` : inner}</li>`;
    }).join("")}</ol>
    <div class="rb-progress" aria-hidden="true"><p><strong>${finished ? "Done · Trip rescheduled" : `Step ${state.step} of 3 · ${escape(STEPS[state.step - 1])}`}</strong>${!finished && state.step < 3 ? `<span>Next: ${escape(STEPS[state.step])}</span>` : ""}</p><div>${STEPS.map((_, i) => `<span class="${i + 1 < at ? "is-done" : i + 1 === at ? "is-now" : ""}"></span>`).join("")}</div></div>`;
  }
  function whichCard(value, label, title, sub, disabled) {
    const on = state.which === value;
    return `<label class="rb-choice${on ? " is-on" : ""}${disabled ? " is-off" : ""}">
      <input type="radio" name="rb-which" value="${value}"${on ? " checked" : ""}${disabled ? " disabled" : ""} />
      <span class="rb-choice-body"><span class="rb-choice-label">${escape(label)}</span><strong>${title}</strong><span>${escape(sub)}</span></span>
    </label>`;
  }
  function passengerRow(p, i) {
    const on = state.chosen.has(i);
    const meta = [p.age ? `${p.age} years old` : "", p.gender || "", p.seatNumber && p.seatNumber !== "—" ? `Seat ${p.seatNumber}` : ""].filter(Boolean).join(" · ");
    return `<label class="rb-choice rb-person${on ? " is-on" : ""}">
      <input type="checkbox" value="${i}"${on ? " checked" : ""} aria-label="${escape(p.name || `Passenger ${i + 1}`)}" />
      <span class="rb-choice-body"><strong>${escape(p.name || `Passenger ${i + 1}`)}</strong>${meta ? `<span>${escape(meta)}</span>` : ""}</span>
    </label>`;
  }
  // The landing page's calendar, with days that have no usable sailing greyed out.
  function calendarHtml(key) {
    const month = state.month[key];
    const year = month.getFullYear();
    const m = month.getMonth();
    const firstDay = new Date(year, m, 1, 12).getDay();
    const daysInMonth = new Date(year, m + 1, 0, 12).getDate();
    const min = range(key).min;
    const today = dayValue(new Date());
    const picked = state.pick[key]?.date;
    const atFirst = dayValue(new Date(year, m, 1, 12)).slice(0, 7) <= min.slice(0, 7);
    let focusSet = false;
    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const value = dayValue(new Date(year, m, i + 1, 12));
      const info = dayInfo(key, value);
      const off = !info.usable.length;
      const label = new Date(value + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
      const note = off ? info.why : info.dearer ? "Higher fare" : "Same fare";
      let tab = -1;
      if (!off && !focusSet && (value === picked || !picked)) { tab = 0; focusSet = true; }
      return `<button type="button" class="calendar-day${value === picked ? " is-selected" : ""}${info.current ? " is-current" : ""}${info.dearer ? " is-dearer" : ""}" data-cal-date="${value}" aria-label="${escape(`${label}, ${note}`)}" title="${escape(note)}" aria-pressed="${value === picked}"${value === today ? ' aria-current="date"' : ""}${off ? " disabled" : ""} tabindex="${tab}">${i + 1}</button>`;
    }).join("");
    return `<div class="calendar-heading"><button type="button" class="calendar-nav" data-cal-step="-1" aria-label="Previous month"${atFirst ? " disabled" : ""}>&#8249;</button><span aria-live="polite">${escape(month.toLocaleDateString("en-US", { month: "long", year: "numeric" }))}</span><button type="button" class="calendar-nav" data-cal-step="1" aria-label="Next month">&#8250;</button></div>
      <div class="calendar-weekdays" aria-hidden="true">${["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => `<span>${d}</span>`).join("")}</div>
      <div class="calendar-days">${'<span aria-hidden="true"></span>'.repeat(firstDay)}${days}</div>
      <p class="rb-cal-key"><span class="rb-key-current"></span>Current trip<span class="rb-key-dearer"></span>Higher fare</p>
      <div class="calendar-footer"><button type="button" class="calendar-today" data-cal-earliest>Earliest</button><button type="button" class="calendar-close" data-cal-close>Close</button></div>`;
  }
  function pickCard(key) {
    const p = state.pick[key];
    if (!p) return "";
    const others = dayInfo(key, p.date).usable;
    const times = others.length > 1
      ? `<div class="rb-times" role="group" aria-label="Departure time">${others.map((o) => `<button type="button" class="rb-time${o.id === p.id ? " is-on" : ""}" data-action="time:${key}:${escape(o.id)}" aria-pressed="${o.id === p.id}">${escape(o.departureTime)}</button>`).join("")}</div>`
      : "";
    return `<div class="rb-pick">
      ${logo(p.ferry)}
      <div class="rb-pick-body">
        <strong>${escape(p.ferry)} · ${escape(p.departureTime)} <span aria-hidden="true">→</span> ${escape(p.arrivalTime)}${p.arrivalNextDay ? " (+1 day)" : ""}</strong>
        <span>${escape(money(p.pricePerPerson))} per pax · ${p.diff > 0 ? `<b class="rb-dearer">+${escape(money(p.diff))} fare</b>` : "same fare"}</span>
        ${times}
      </div>
    </div>`;
  }
  function dateField(key) {
    const l = legOf(key);
    const p = state.pick[key];
    const isOpen = state.cal === key;
    return `<div class="rb-leg" data-leg="${key}">
      <div class="rb-datefield">
        <button type="button" class="rb-date-trigger${isOpen ? " is-open" : ""}" data-cal-open="${key}" aria-haspopup="dialog" aria-expanded="${isOpen}" aria-controls="rb-cal-${key}">
          ${ICON_CAL}<span class="rb-date-text"><span class="rb-date-label">${escape(l.label)} · ${escape(l.from)} → ${escape(l.to)}</span><span class="rb-date-value${p ? "" : " is-empty"}">${p ? escape(shortDate(p.date)) : "Pick a day"}</span></span>${ICON_CHEVRON}
        </button>
        <div class="booking-calendar rb-cal" id="rb-cal-${key}" role="dialog" aria-label="Choose a new ${key === "return" ? "return" : "departure"} day"${isOpen ? "" : " hidden"}>${isOpen ? calendarHtml(key) : ""}</div>
      </div>
      ${pickCard(key)}
    </div>`;
  }
  // "with the vehicle and 2 pets": what stays on the original booking.
  function stays() {
    const bits = [record.vehicles ? (record.vehicles === 1 ? "the vehicle" : "the vehicles") : "", record.pets ? (record.pets === 1 ? "the pet" : "the pets") : ""].filter(Boolean);
    return bits.length ? ` with ${bits.join(" and ")}` : "";
  }
  function splitNote() {
    const n = state.chosen.size;
    if (!n || n >= people.length) return "";
    return `<p class="rb-split">${escape(plural(n, "passenger"))} will move to a new booking with its own reference. ${escape(plural(people.length - n, "passenger"))} stay${people.length - n === 1 ? "s" : ""} on ${escape(record.reference)}${stays()}.</p>`;
  }

  // ------------------------------------------------------------------ steps
  function stepTrips() {
    const legSub = (l) => `${longDate(l.date)} · ${l.trip.departureTime || ""} – ${l.trip.arrivalTime || ""} · ${l.trip.ferry || ""}${sailed(l) ? " · already sailed" : ""}`;
    const route = (l) => `${escape(l.from)} <span aria-hidden="true">→</span> ${escape(l.to)}`;
    return `<h2 tabindex="-1" class="rb-step-title">Which trip, and who's moving?</h2>
      <p class="rb-step-sub">Each trip is a ticket per passenger, so you can move one trip or both, for everyone or just some of you.</p>
      ${legs.length > 1 ? `<h3 class="rb-group-title">Trip</h3>
      <div class="rb-choices" role="radiogroup" aria-label="Trip to reschedule">${[
        ...legs.map((l) => whichCard(l.key, l.label, route(l), legSub(l), sailed(l))),
        whichCard("both", "Both trips", "Departure and return", "Pick a new day for each", open.length < 2),
      ].join("")}</div>` : ""}
      <div class="rb-group-head"><h3 class="rb-group-title">Passengers</h3>${people.length > 1 ? `<button type="button" class="bf-edit rb-link" data-action="all-passengers">${state.chosen.size === people.length ? "Deselect all" : "Select all"}</button>` : ""}</div>
      <div class="rb-choices">${people.map(passengerRow).join("")}</div>
      <p class="rb-hint" aria-live="polite">${state.chosen.size} of ${plural(people.length, "passenger")} selected</p>
      ${splitNote()}`;
  }
  function stepDates() {
    const names = [...state.chosen].map((i) => people[i]?.name).filter(Boolean);
    const out = legOf("return") && !moving().includes("return") && moving().includes("outbound") ? legOf("return").date : "";
    return `<h2 tabindex="-1" class="rb-step-title">Pick your new ${moving().length > 1 ? "days" : "day"}</h2>
      <p class="rb-step-sub">Moving ${escape(moving().length > 1 ? "both trips" : `the ${legOf(moving()[0]).label.toLowerCase()}`)} for ${escape(names.join(" and ") || plural(state.chosen.size, "passenger"))}. Greyed-out days have no sailing you can switch to.</p>
      <div class="rb-dates${moving().length > 1 ? " is-two" : ""}">${moving().map(dateField).join("")}</div>
      ${out ? `<p class="rb-hint">Your return sails ${escape(shortDate(out))}, so the new departure can't be later. To go later, go back and choose “Both trips”.</p>` : ""}`;
  }
  function stepReview(q) {
    const rows = legs.map((l) => {
      const moves = moving().includes(l.key);
      const p = state.pick[l.key];
      return `<div class="rb-review-row${moves ? "" : " is-same"}">
        <p class="rb-review-leg"><span>${escape(l.label)}</span>${escape(l.from)} → ${escape(l.to)}</p>
        ${moves && p
          ? `<p class="rb-review-change"><s>${escape(legLine(l.date, l.trip))}</s><span class="rb-review-arrow" aria-hidden="true">→</span><strong>${escape(legLine(p.date, p))}</strong>${logo(p.ferry, "rb-review-logo")}</p>`
          : `<p class="rb-review-change"><strong>${escape(legLine(l.date, l.trip))}</strong><span class="rb-same">No change</span></p>`}
      </div>`;
    }).join("");
    const names = [...state.chosen].map((i) => people[i]?.name).filter(Boolean).join(", ");
    const late = q && !q.error ? q.lines.filter((l) => l.late).length : 0;
    return `<h2 tabindex="-1" class="rb-step-title">Review and pay</h2>
      <p class="rb-step-sub">For ${escape(names || plural(state.chosen.size, "passenger"))}.</p>
      <div class="rb-review">${rows}</div>
      ${splitNote()}
      ${q && !q.error ? `<dl class="rb-bill">
        <div><dt>Rebooking fee <span>${escape(plural(q.tickets, "ticket"))}${late ? ` · ${money(FEE)} each within 24 hours` : " · free 24+ hours before"}</span></dt><dd>${q.fee ? money(q.fee) : "Free"}</dd></div>
        <div><dt>Fare difference</dt><dd>${money(q.fareDiff || 0)}</dd></div>
        <div class="rb-bill-total"><dt>To pay</dt><dd>${money(q.total)}</dd></div>
      </dl>` : ""}
      <p class="rb-policy-note">Changing a ticket is free 24 hours or more before that sailing and costs ${money(FEE)} per ticket within 24 hours. If the new sailing costs more you pay the difference; if it costs less, it isn't refunded. Tickets can't be changed once the ship has left.</p>`;
  }
  function nextLabel(q) {
    if (state.step === 1) return "Continue →";
    if (state.step === 2) return "Review & pay →";
    return q && !q.error && q.total ? `Pay ${money(q.total)} and reschedule` : "Confirm reschedule";
  }
  function actions(q, where) {
    const why = blocker(state.step, q);
    const back = state.step > 1
      ? `<button type="button" class="rb-back" data-goto="${state.step - 1}">← Back</button>`
      : '<a class="rb-back" href="bookings.html">Cancel</a>';
    return `<div class="rb-actions rb-actions-${where}">${back}<button type="button" class="bf-primary rb-next" data-next${why ? " disabled" : ""}>${nextLabel(q)}</button></div>`;
  }

  // ------------------------------------------------------------------ sidebar
  function sidebar(q) {
    const legsHtml = legs.map((l) => {
      const moves = moving().includes(l.key);
      const p = state.pick[l.key];
      return `<div class="rb-sum-leg">
        <p class="rb-sum-label">${escape(l.label)}</p>
        ${moves
          ? `<p class="rb-sum-old"><s>${escape(legLine(l.date, l.trip))}</s></p>${p ? `<p class="rb-sum-new">${escape(legLine(p.date, p))}</p>` : `<p class="rb-sum-todo">${state.step < 2 ? "Changing" : "Pick a new day"}</p>`}`
          : `<p class="rb-sum-new">${escape(legLine(l.date, l.trip))}</p><p class="rb-sum-same">No change</p>`}
      </div>`;
    }).join("");
    const tickets = moving().length * state.chosen.size;
    const ok = q && !q.error;
    return `<section class="bf-card rb-summary" aria-label="Your booking">
      <h2>Your booking <span>${escape(record.reference)}</span></h2>
      ${legsHtml}
      <dl class="rb-facts">
        <div><dt>Passengers</dt><dd>${state.chosen.size} of ${people.length}</dd></div>
        <div><dt>Tickets to change</dt><dd>${tickets}</dd></div>
        ${ok ? `<div><dt>Rebooking fee</dt><dd>${q.fee ? money(q.fee) : "Free"}</dd></div><div><dt>Fare difference</dt><dd>${money(q.fareDiff || 0)}</dd></div>` : ""}
        <div class="rb-total"><dt>${ok ? "To pay" : "So far"}</dt><dd>${money(ok ? q.total : 0)}</dd></div>
      </dl>
    </section>`;
  }
  function phoneBar(q) {
    const ok = q && !q.error;
    const text = ok ? `${plural(q.tickets, "ticket")} · to pay <strong>${money(q.total)}</strong>` : `${plural(moving().length * state.chosen.size, "ticket")} · free so far`;
    return `<div class="rb-paybar" role="region" aria-label="Step actions"><p>${text}</p>${actions(q, "bar")}</div>`;
  }

  // ------------------------------------------------------------------ draw
  function draw() {
    if (state.done) return drawDone();
    const q = quote();
    const why = blocker(state.step, q);
    const body = state.step === 1 ? stepTrips() : state.step === 2 ? stepDates() : stepReview(q);
    root.innerHTML = `
      <div class="bf-heading"><a class="bf-edit" href="bookings.html">← My Bookings</a><h1>Reschedule your trip</h1>
        <p class="rb-sub">Booking <strong>${escape(record.reference)}</strong> · ${escape(origin)} <span aria-hidden="true">→</span> ${escape(destination)}</p></div>
      ${!open.length
        ? '<section class="bf-card"><p class="bf-error">Every trip on this booking has already sailed, so it can no longer be rescheduled.</p><a class="bf-primary rb-inline-btn" href="bookings.html">My Bookings</a></section>'
        : `${stepper()}
      <div class="rb-layout">
        <section class="bf-card rb-step" aria-label="Step ${state.step} of 3: ${escape(STEPS[state.step - 1])}">
          ${body}
          ${why && (state.step === 3 || refunded()) ? `<p class="bf-error" role="alert">${escape(why)}</p>` : ""}
          ${actions(q, "card")}
        </section>
        <aside class="rb-side">
          <details class="rb-fold"${WIDE.matches ? " open" : ""}><summary>Your booking <span>${escape(q && !q.error ? money(q.total) : record.reference)}</span></summary>${sidebar(q)}</details>
        </aside>
      </div>
      ${phoneBar(q)}`}`;
    settle();
  }
  // After confirming: the same layout as the steps, every step ticked, the
  // change as before → after, and the booking as it is now on the right.
  function drawDone() {
    const { result } = state.done;
    const r = result.record;
    const q = result.quote;
    const moved = Object.fromEntries(q.lines.map((l) => [l.leg, l]));
    const names = q.passengers.map((i) => people[i]?.name).filter(Boolean);
    const rows = legs.map((l) => {
      const m = moved[l.key];
      return `<div class="rb-review-row${m ? "" : " is-same"}">
        <p class="rb-review-leg"><span>${escape(l.label)}</span>${escape(l.from)} → ${escape(l.to)}</p>
        ${m
          ? `<p class="rb-review-change"><s>${escape(legLine(m.from.date, m.from))}</s><span class="rb-review-arrow" aria-hidden="true">→</span><strong>${escape(legLine(m.to.date, m.to))}</strong>${logo(m.to.ferry, "rb-review-logo")}</p>`
          : `<p class="rb-review-change"><strong>${escape(legLine(l.date, l.trip))}</strong><span class="rb-same">No change</span></p>`}
      </div>`;
    }).join("");
    const after = (key) => (key === "return"
      ? { date: r.returnDate, trip: r.returnTrip || { departureTime: r.returnDepartureTime, arrivalTime: r.returnArrivalTime, ferry: r.returnFerry } }
      : { date: r.departureDate, trip: r.outboundTrip || { departureTime: r.departureTime, arrivalTime: r.arrivalTime, ferry: r.ferry } });
    const sideLegs = legs.map((l) => {
      const now = after(l.key);
      return `<div class="rb-sum-leg"><p class="rb-sum-label">${escape(l.label)}</p><p class="rb-sum-new">${escape(legLine(now.date, now.trip))}</p><p class="rb-sum-same">${moved[l.key] ? "Rescheduled" : "No change"}</p></div>`;
    }).join("");
    root.innerHTML = `
      <div class="bf-heading"><a class="bf-edit" href="bookings.html">← My Bookings</a><h1>Reschedule your trip</h1>
        <p class="rb-sub">Booking <strong>${escape(result.original.reference)}</strong> · ${escape(origin)} <span aria-hidden="true">→</span> ${escape(destination)}</p></div>
      ${stepper(true)}
      <div class="rb-layout">
        <section class="bf-card rb-step rb-done" role="status" aria-label="Trip rescheduled">
          <div class="rb-done-head">
            <span class="rb-done-icon" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
            <div><h2 tabindex="-1" class="rb-step-title">Trip rescheduled</h2>
              <p class="rb-step-sub">Your new schedule is saved for ${escape(names.join(" and ") || plural(q.passengers.length, "passenger"))}.</p></div>
          </div>
          <div class="rb-review">${rows}</div>
          <dl class="rb-bill">
            <div><dt>Booking reference</dt><dd>${escape(r.reference)}${result.split ? "" : ' <span class="rb-same">unchanged</span>'}</dd></div>
            <div><dt>Rebooking fee <span>${escape(plural(q.tickets, "ticket"))}</span></dt><dd>${q.fee ? money(q.fee) : "Free"}</dd></div>
            <div><dt>Fare difference</dt><dd>${money(q.fareDiff || 0)}</dd></div>
            <div class="rb-bill-total"><dt>Paid</dt><dd>${money(q.total)}</dd></div>
          </dl>
          ${result.split ? `<p class="rb-split">${escape(names.join(" and ") || "They")} now ${names.length === 1 ? "has" : "have"} a booking of their own, <strong>${escape(r.reference)}</strong>. The rest of the group stays on <strong>${escape(result.original.reference)}</strong>.</p>` : ""}
          <p class="rb-policy-note">This is a demo, so the new schedule is saved on this device only. My Bookings and the shipping line's passenger list already show the new times.</p>
          <div class="rb-actions rb-actions-done">
            <a class="rb-back" href="travel-instructions.html?id=${encodeURIComponent(r.id)}">Travel instructions</a>
            <a class="bf-primary rb-next" href="bookings.html">Go to My Bookings</a>
          </div>
        </section>
        <aside class="rb-side">
          <section class="bf-card rb-summary" aria-label="Your booking now">
            <h2>Your booking <span>${escape(r.reference)}</span></h2>
            ${sideLegs}
            <dl class="rb-facts">
              <div><dt>Passengers</dt><dd>${r.passengerDetails.length}</dd></div>
              <div class="rb-total"><dt>Booking total</dt><dd>${money(r.totalPrice)}</dd></div>
            </dl>
          </section>
        </aside>
      </div>`;
    $(".rb-step-title", root)?.focus({ preventScroll: true });
  }
  // Only the first draw plays the page's float-in; redraws just update.
  let drawn = false;
  function settle() {
    if (drawn) $$(".bf-heading, .bf-card", root).forEach((el) => el.setAttribute("data-motion-seen", ""));
    drawn = true;
  }
  WIDE.addEventListener?.("change", () => {
    const fold = $(".rb-fold", root);
    if (fold) fold.open = WIDE.matches;
  });

  // ------------------------------------------------------------------ navigation
  function goTo(step) {
    state.step = Math.max(1, Math.min(3, step));
    state.cal = null;
    draw();
    window.scrollTo({ top: 0, behavior: "smooth" });
    $(".rb-step-title", root)?.focus({ preventScroll: true });
  }
  function next() {
    const q = quote();
    const why = blocker(state.step, q);
    if (why) return notice(why);
    if (state.step < 3) return goTo(state.step + 1);
    const keys = moving();
    const trips = Object.fromEntries(keys.map((k) => [k, state.pick[k]]));
    const result = flow.reschedule(record.id, { trips, passengers: [...state.chosen] });
    if (result.error) return notice(result.error);
    markSaved();
    state.done = { result };
    draw();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ------------------------------------------------------------------ calendar
  function openCalendar(key) {
    const start = state.pick[key]?.date || firstUsable(key) || range(key).min;
    const d = new Date(start + "T12:00:00");
    state.month[key] = new Date(d.getFullYear(), d.getMonth(), 1, 12);
    state.cal = key;
    draw();
    ($(`#rb-cal-${key} .calendar-day[tabindex="0"]`, root) || $(`#rb-cal-${key} [data-cal-close]`, root))?.focus({ preventScroll: true });
    $(`#rb-cal-${key}`, root)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function closeCalendar(focusTrigger) {
    const key = state.cal;
    if (!key) return;
    state.cal = null;
    draw();
    if (focusTrigger) $(`.rb-date-trigger[data-cal-open="${key}"]`, root)?.focus();
  }
  function redrawCalendar() {
    const box = $(`#rb-cal-${state.cal}`, root);
    if (box) box.innerHTML = calendarHtml(state.cal);
  }
  function choose(key, day) {
    const usable = dayInfo(key, day).usable;
    if (!usable.length) return;
    state.pick[key] = usable[0];
    // A new departure can rule out the chosen return.
    if (key === "outbound" && state.pick.return && !dayInfo("return", state.pick.return.date).usable.some((o) => o.id === state.pick.return.id)) state.pick.return = null;
    state.cal = null;
    draw();
    const nextKey = moving().find((k) => !state.pick[k]);
    if (nextKey) openCalendar(nextKey);
    else $(".rb-actions-card .rb-next", root)?.focus();
  }

  // ------------------------------------------------------------------ events
  root.addEventListener("click", (e) => {
    const go = e.target.closest("[data-goto]");
    if (go) return goTo(Number(go.dataset.goto));
    if (e.target.closest("[data-next]")) return next();
    const openBtn = e.target.closest("[data-cal-open]");
    if (openBtn) {
      const key = openBtn.dataset.calOpen;
      if (state.cal === key) closeCalendar(true);
      else openCalendar(key);
      return;
    }
    const day = e.target.closest("[data-cal-date]");
    if (day && !day.disabled) return choose(state.cal, day.dataset.calDate);
    const stepBtn = e.target.closest("[data-cal-step]");
    if (stepBtn) {
      const m = state.month[state.cal];
      state.month[state.cal] = new Date(m.getFullYear(), m.getMonth() + Number(stepBtn.dataset.calStep), 1, 12);
      redrawCalendar();
      const again = $(`#rb-cal-${state.cal} [data-cal-step="${stepBtn.dataset.calStep}"]`, root);
      (again && !again.disabled ? again : $(`#rb-cal-${state.cal} [data-cal-step="1"]`, root))?.focus();
      return;
    }
    if (e.target.closest("[data-cal-earliest]")) {
      const first = firstUsable(state.cal);
      if (first) choose(state.cal, first);
      else notice("No sailings you can switch to in the next two months.");
      return;
    }
    if (e.target.closest("[data-cal-close]")) closeCalendar(true);
  });
  root.addEventListener("keydown", (e) => {
    const day = e.target.closest?.("[data-cal-date]");
    if (!day) return;
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(e.key in offsets)) return;
    e.preventDefault();
    const target = flow.addDays(day.dataset.calDate, offsets[e.key]);
    if (target < range(state.cal).min) return;
    const d = new Date(target + "T12:00:00");
    state.month[state.cal] = new Date(d.getFullYear(), d.getMonth(), 1, 12);
    redrawCalendar();
    const btn = $(`[data-cal-date="${target}"]`, root);
    if (btn) { btn.tabIndex = 0; btn.focus(); }
  });
  document.addEventListener("click", (e) => {
    if (!state.cal) return;
    if (!e.composedPath().some((el) => el.classList?.contains("rb-datefield"))) closeCalendar(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.cal) {
      e.preventDefault();
      closeCalendar(true);
    }
  });
  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "rb-which") {
      state.which = t.value;
      if (!moving().includes("outbound")) state.pick.outbound = null;
      if (!moving().includes("return")) state.pick.return = null;
      draw();
      $(`input[name="rb-which"][value="${t.value}"]`, root)?.focus();
    } else if (t.type === "checkbox") {
      const i = Number(t.value);
      if (t.checked) state.chosen.add(i);
      else state.chosen.delete(i);
      draw();
      $(`.rb-person input[value="${i}"]`, root)?.focus();
    }
  });

  draw();

  return {
    isDirty: () => !state.done && moving().some((k) => state.pick[k]),
    actions: {
      "all-passengers"() {
        state.chosen = state.chosen.size === people.length ? new Set() : new Set(people.map((_, i) => i));
        draw();
      },
      time(el, key, id) {
        const p = state.pick[key];
        const o = p && dayInfo(key, p.date).usable.find((x) => x.id === id);
        if (o) state.pick[key] = o;
        draw();
      },
    },
  };
};
