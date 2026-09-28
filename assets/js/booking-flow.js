/* Render the booking screens from the shared draft so every step shows the same trip. */
(() => {
  "use strict";
  const booking = window.ENTREE_BOOKING;
  const page = document.body.dataset.page;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const money = value => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
  const date = value => value ? new Date(value + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "";
  const saved = () => document.dispatchEvent(new Event("entree:booking-saved"));
  function error(message) {
    let node = $("#booking-error");
    if (!node) {
      node = document.createElement("p");
      node.id = "booking-error";
      node.className = "bf-error";
      node.setAttribute("role", "alert");
      node.tabIndex = -1;
      ($(".hero-glass-card") || $(".bf-page") || $("main")).prepend(node);
    }
    node.textContent = message;
    node.focus();
  }
  function companyLogo(name, className = "bf-company-logo") {
    const company = window.ENTREE_DATA.SHIPPING_COMPANIES.find(c => c.name === name);
    return company?.logo ? `<img class="${className}" src="../assets/images/${company.logo}" alt="${escape(name)} logo" />` : `<span class="${className} bf-logo-text">${escape(name)}</span>`;
  }
  // The Shipping Line picked on the home page books that line's trip on each
  // leg when it sails that day (the traveller can still change or cancel it).
  function preselectPreferred(legs) {
    const value = booking.get();
    const all = value.tripType === "Round Trip" ? ["outbound", "return"] : ["outbound"];
    const changes = {};
    for (const leg of legs || all) {
      const key = leg === "outbound" ? "outboundId" : "returnId";
      if (value[key] && booking.selected(leg, value)) continue;
      const pick = booking.options(leg, value).find(o => o.ferry === value.shippingLine);
      if (pick) changes[key] = pick.id;
    }
    if (Object.keys(changes).length) booking.save(changes);
  }
  // "No trips left on this date" → move that leg one day later, keep the other leg's choice.
  function showNextDay(leg) {
    const value = booking.get();
    const keep = { outboundId: value.outboundId, returnId: value.returnId };
    let departureDate = value.departureDate, returnDate = value.returnDate;
    if (leg === "outbound") {
      departureDate = booking.addDays(departureDate, 1);
      if (returnDate < departureDate) returnDate = departureDate;
    } else returnDate = booking.addDays(returnDate, 1);
    booking.save({ departureDate, returnDate });
    const restore = {};
    if (leg === "outbound" && returnDate === value.returnDate && keep.returnId) restore.returnId = keep.returnId;
    if (leg === "return" && keep.outboundId) restore.outboundId = keep.outboundId;
    if (Object.keys(restore).length) booking.save(restore);
    preselectPreferred([leg]);
    renderTrips();
    const section = $(`#${leg}-trips`);
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
    ($(`#${leg}-trips .bf-book-button`) || section?.querySelector("h2"))?.focus({ preventScroll: true });
  }
  const shortDate = value => new Date(value + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  function summary(value = booking.get(), prices = true) {
    const totals = value.fareBreakdown || booking.totals(value);
    const legs = value.tripType === "Round Trip" ? ["outbound", "return"] : ["outbound"];
    const selectedCount = legs.filter(leg => booking.selected(leg, value)).length;
    const choosing = page === "trips";
    return `<section class="bf-card bf-summary" aria-label="Booking summary"><h2 aria-live="polite">${selectedCount} of ${legs.length} trips selected</h2>
      ${legs.map(leg => {
        const returning = leg === "return", trip = booking.selected(leg, value);
        return `<section class="bf-summary-leg"><div class="bf-leg-heading"><h3>${returning ? "Return" : "Departure"}</h3>
          ${choosing && trip ? `<button type="button" class="bf-icon-button" data-clear-trip="${leg}" aria-label="Remove ${returning ? "return" : "departure"} trip" title="Remove trip">×</button>` : choosing ? `<a class="bf-edit" href="#${leg}-trips" aria-label="Choose ${returning ? "return" : "departure"} trip">Choose</a>` : ""}</div>
          <p class="bf-leg-route">${escape(returning ? value.destination : value.origin)} <span aria-hidden="true">→</span> ${escape(returning ? value.origin : value.destination)}</p>
          <p class="bf-leg-date">${escape(date(returning ? value.returnDate : value.departureDate))}${trip ? ` | ${escape(trip.departureTime)} – ${escape(trip.arrivalTime)}${trip.arrivalNextDay ? " (+1 day)" : ""}` : ""}</p>
          ${trip ? `<div class="bf-leg-company">${companyLogo(trip.ferry)}<div><strong>${escape(trip.ferry)}</strong><span>${escape(value.cabin)}</span></div></div><div class="bf-price-row"><span>Ticket price (${value.passengers} pax)</span><strong>${money(trip.pricePerPerson * value.passengers)}</strong></div>` : choosing && !booking.options(leg, value).length && value.passengers <= 80 ? `<p class="bf-note bf-note-warn">No sailings left on this date.</p><button type="button" class="bf-next-day-btn" data-next-day="${leg}">See ${escape(shortDate(booking.addDays(returning ? value.returnDate : value.departureDate, 1)))} trips</button>` : '<p class="bf-note">Choose a shipping line for this leg.</p>'}</section>`;
      }).join("")}
      <p class="bf-party-counts">${value.passengers} passengers · ${value.vehicles} vehicles · ${value.pets} pets</p>
      ${prices ? `<dl class="bf-costs"><div><dt>Items total</dt><dd>${money(totals.tickets)}</dd></div>
      ${!choosing && value.vehicles ? `<div><dt>Vehicle fees</dt><dd>${money(totals.vehicles)}</dd></div>` : ""}
      ${!choosing && value.pets ? `<div><dt>Pet fees</dt><dd>${money(totals.pets)}</dd></div>` : ""}
      <div><dt>Booking fee</dt><dd>${money(totals.fee)}</dd></div><div class="bf-total"><dt>${choosing ? "Subtotal" : "Total"}</dt><dd>${money(choosing ? totals.tickets + totals.fee : totals.total)}</dd></div></dl>` : ""}
      ${choosing ? `<p class="bf-note">Vehicle and pet fees are added on the passenger details step.</p><button class="bf-primary bf-summary-continue" type="button" data-booking-next="passenger-details">Passenger details <span aria-hidden="true">»</span></button>` : '<p class="bf-note">Fares are per passenger. Vehicle and pet fees apply to each leg.</p>'}
      ${value.id ? "" : '<a class="bf-edit bf-summary-edit" href="index.html">Edit search</a>'}</section>`;
  }
  function heading(title, back, label) {
    return `<div class="bf-heading"><a class="bf-edit" href="${back}.html">← ${label}</a><h1>${title}</h1></div>`;
  }
  function shell(content) {
    $("main").innerHTML = `<div class="bf-page">${content}</div>`;
  }
  function renderTrips() {
    const value = booking.get();
    const legs = value.tripType === "Round Trip" ? ["outbound", "return"] : ["outbound"];
    shell(`${heading("Choose your trips", "index", "Edit search")}
      ${booking.movedFrom() && booking.movedFrom() < value.departureDate ? `<p class="bf-moved-note" role="status">All sailings on ${escape(shortDate(booking.movedFrom()))} have already left, so we're showing trips from <strong>${escape(shortDate(value.departureDate))}</strong>. <a href="index.html">Change dates</a></p>` : ""}
      <p class="bf-note">Compare departures from every shipping line below. “Booked” marks the trip you have chosen — your seats are held once you complete passenger details and payment.</p>
      <section class="bf-search-context" aria-label="Your search"><div><span class="bf-context-label">Your journey</span><strong>${escape(value.origin)} <span aria-hidden="true">→</span> ${escape(value.destination)}</strong><span>${escape(value.tripType)} · ${escape(date(value.departureDate))}${value.tripType === "Round Trip" ? ` — ${escape(date(value.returnDate))}` : ""}</span></div><div class="bf-context-chips"><span>${value.passengers} passengers</span><span>${value.vehicles} vehicles</span><span>${value.pets} pets</span><span>${escape(value.cabin)}</span></div><a href="index.html" class="bf-edit">Edit search</a></section>
      <div class="bf-layout bf-trips-layout"><div>${legs.map(leg => {
        const returning = leg === "return";
        const options = booking.options(leg);
        return `<section class="bf-trip-section" id="${leg}-trips"><h2>${returning ? "Return" : "Departure"} <span>${escape(date(returning ? value.returnDate : value.departureDate))}</span></h2>
        <div class="bf-options" role="group" aria-label="${returning ? "Return" : "Departure"} trips">${options.map(ferry => {
          const selected = booking.selected(leg)?.id === ferry.id;
          return `<article class="bf-trip${selected ? " is-selected" : ""}">
          ${selected ? '<span class="bf-booked-ribbon" aria-hidden="true">Booked</span>' : ""}
          <p class="bf-price-tag"><span>from </span><strong>${money(ferry.pricePerPerson)}</strong><span> per pax</span></p>
          <div class="bf-trip-logo">${companyLogo(ferry.ferry)}</div>
          <div class="bf-trip-route"><h3>${escape(ferry.ferry)}</h3><p><time>${escape(ferry.departureTime)}</time><span>${escape(returning ? value.destination : value.origin)}</span></p><p><time>${escape(ferry.arrivalTime)}</time><span>${escape(returning ? value.origin : value.destination)}</span>${ferry.arrivalNextDay ? '<span class="bf-next-day" title="Arrives the next day"><span aria-hidden="true">+1 day</span><span class="sr-only">, arrives the next day</span></span>' : ''}</p></div>
          <div class="bf-trip-duration"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 13V7h14v6M9 7V3h6v4M3 14l9-3 9 3-3 6H6l-3-6ZM2 21c2 2 4-2 6 0s4-2 6 0 4-2 8 0"/></svg>${escape(ferry.duration || "Scheduled")} trip</div>
          <div class="bf-trip-book"><button type="button" class="bf-book-button${selected ? " is-booked" : ""}" ${selected ? `data-clear-trip="${leg}"` : `data-select-trip="${leg}"`} data-ferry-id="${escape(ferry.id)}" aria-pressed="${selected}" aria-label="${selected ? "Cancel booking" : "Book now"}: ${escape(ferry.ferry)} ${returning ? "return" : "departure"}">${selected ? "Cancel" : "Book Now"}</button></div></article>`;
        }).join("") || (value.passengers > 80
          ? `<p class="bf-empty">No departures match this passenger count. <a href="index.html">Adjust your search</a> to see more options.</p>`
          : `<div class="bf-empty bf-empty-date"><p>${(returning ? value.returnDate : value.departureDate) === booking.dateValue(new Date()) ? "All of today's sailings have already left." : "There are no sailings left on this date."}</p><button type="button" class="bf-next-day-btn" data-next-day="${leg}">See ${escape(shortDate(booking.addDays(returning ? value.returnDate : value.departureDate, 1)))} trips <span aria-hidden="true">→</span></button><a href="index.html">or change your dates</a></div>`)}</div></section>`;
      }).join("")}</div><aside class="bf-trip-sidebar">${summary()}</aside></div>`);
  }

  function field(label, name, value = "", type = "text", extra = "") {
    return `<label class="bf-field">${label}<input type="${type}" name="${name}" value="${escape(value)}" required ${extra}></label>`;
  }
  function renderPassengers() {
    const value = booking.get();
    if (booking.selectionError()) {
      shell(`${heading("Passenger details", "trips", "Choose trips")}<section class="bf-card"><h2>Choose your trips first</h2><p>${escape(booking.selectionError())}</p><a class="bf-primary" href="trips.html">Choose trips →</a></section>`);
      return;
    }
    shell(`${heading("Passenger details", "trips", "Choose trips")}<div class="bf-layout"><form id="booking-details" class="bf-card">
      <h2>Passengers, pets &amp; vehicles</h2>
      ${value.passengerDetails.map((person, i) => `<fieldset><legend>Passenger ${i + 1}</legend><div class="bf-fields">
      ${field("Full name", `passengerDetails.${i}.name`, person.name, "text", 'autocomplete="name" maxlength="100"')}
      ${field("Age", `passengerDetails.${i}.age`, person.age, "number", 'min="0" max="120" step="1"')}
      <label class="bf-field">Gender<select name="passengerDetails.${i}.gender" required><option value="">Select gender</option>${["Female", "Male", "Other", "Prefer not to say"].map(g => `<option${person.gender === g ? " selected" : ""}>${g}</option>`).join("")}</select></label></div></fieldset>`).join("")}
      ${value.petDetails.map((pet, i) => `<fieldset><legend>Pet ${i + 1}</legend><div class="bf-fields">${field("Pet name", `petDetails.${i}.name`, pet.name)}${field("Pet type", `petDetails.${i}.type`, pet.type)}</div></fieldset>`).join("")}
      ${value.vehicleDetails.map((vehicle, i) => `<fieldset><legend>Vehicle ${i + 1}</legend><div class="bf-fields">${field("Vehicle type", `vehicleDetails.${i}.type`, vehicle.type)}${field("Plate number", `vehicleDetails.${i}.plate`, vehicle.plate)}</div></fieldset>`).join("")}
      <fieldset><legend>Contact information</legend><div class="bf-fields">${field("Contact name", "contact.name", value.contact.name, "text", 'autocomplete="name"')}${field("Email address", "contact.email", value.contact.email, "email", 'autocomplete="email"')}${field("Mobile number", "contact.phone", value.contact.phone, "tel", 'autocomplete="tel"')}</div></fieldset>
      <button type="submit" class="bf-primary">Proceed to payment →</button></form><aside>${summary()}</aside></div>`);
    $("#booking-details").addEventListener("submit", event => {
      event.preventDefault();
      saveDetails();
      const message = booking.detailsError();
      if (message) return error(message);
      saved();
      location.href = "payment.html";
    });
  }
  function saveDetails() {
    const form = $("#booking-details");
    if (!form) return;
    const value = JSON.parse(JSON.stringify(booking.get()));
    for (const input of form.elements) {
      if (!input.name) continue;
      const parts = input.name.split(".");
      if (parts.length === 3) value[parts[0]][Number(parts[1])][parts[2]] = input.value;
      else value.contact[parts[1]] = input.value;
    }
    booking.save(value);
  }
  function readHome() {
    const cards = $$(".dates-input-group [data-date]");
    booking.save({
      tripType: $('select[aria-label="Travel Type"]').value,
      origin: $("#origin").value, destination: $("#destination").value,
      departureDate: cards[0].dataset.date, returnDate: cards[1].dataset.date,
      passengers: Number($('[data-counter-type="passengers"] .pax-count').textContent),
      vehicles: Number($('[data-counter-type="vehicles"] .pax-count').textContent),
      pets: Number($('[data-counter-type="pets"] .pax-count').textContent),
      shippingLine: $('[data-dropdown="shipping-line"] select').value,
      cabin: $('[data-dropdown="cabin-type"] select').value,
    });
  }
  function restoreHome() {
    const value = booking.get();
    $("#origin").value = value.origin;
    $("#destination").value = value.destination;
    const select = $('select[aria-label="Travel Type"]');
    select.value = value.tripType;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    $$(".dates-input-group [data-date]").forEach((card, i) => {
      card.dataset.date = i ? value.returnDate : value.departureDate;
      $(".input-val-text", card).textContent = new Date(card.dataset.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    });
    for (const key of ["passengers", "vehicles", "pets"]) $(`[data-counter-type="${key}"] .pax-count`).textContent = value[key];
    for (const [key, val] of [["shipping-line", value.shippingLine], ["cabin-type", value.cabin]]) {
      const wrap = $(`[data-dropdown="${key}"]`);
      $("select", wrap).value = val;
      $(".dropdown-value", wrap).textContent = val;
      $$(".dropdown-option", wrap).forEach(option => {
        option.classList.toggle("is-active", option.dataset.value === val);
        option.setAttribute("aria-selected", String(option.dataset.value === val));
      });
    }
    document.dispatchEvent(new Event("entree:draft-restored"));
    document.addEventListener("input", readHome);
    document.addEventListener("change", readHome);
    const observer = new MutationObserver(readHome);
    $$(".dates-input-group [data-date]").forEach(card => observer.observe(card, { attributes: true, attributeFilter: ["data-date"] }));
    $$(".pax-count").forEach(counter => observer.observe(counter, { childList: true, characterData: true, subtree: true }));
  }
  function renderPayment() {
    if (booking.detailsError()) {
      shell(`${heading("Payment", "passenger-details", "Passenger details")}<section class="bf-card"><h2>Complete your booking details</h2><p>${escape(booking.detailsError())}</p><a class="bf-primary" href="passenger-details.html">Passenger details →</a></section>`);
      return;
    }
    const total = $("[data-booking-total]");
    if (total) {
      total.textContent = money(booking.totals().total);
      const box = total.parentElement.parentElement;
      box.insertAdjacentHTML("beforebegin", `<div class="bf-payment-summary">${summary()}</div>`);
    }
  }
  // "13:00" or "09:00 AM" -> "1:00 PM"
  function clock(value) {
    const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(String(value || "").trim());
    if (!match) return value || "";
    let hour = Number(match[1]);
    const suffix = match[3] ? match[3].toUpperCase() : hour >= 12 ? "PM" : "AM";
    if (!match[3]) hour = hour % 12 || 12;
    return `${hour}:${match[2]} ${suffix}`;
  }
  function renderConfirmation() {
    const record = booking.records().find(b => b.id === booking.get().completedId);
    if (!record) {
      shell(`${heading("Review your booking", "trips", "Choose trips")}${summary()}<a class="bf-primary" href="passenger-details.html">Continue booking →</a>`);
      return;
    }
    const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
    const firstName = (record.contact?.name || record.passengerDetails[0]?.name || "").trim().split(/\s+/)[0];
    const id = encodeURIComponent(record.id);
    const leg = (label, trip, day, from, to) => trip ? `<div class="bm-leg bc-leg">
        <div class="bm-leg-head"><span class="bm-leg-label">${label}</span><span class="bm-leg-date">${escape(date(day))}</span></div>
        <div class="bc-leg-body">${companyLogo(trip.ferry, "bf-company-logo bc-leg-logo")}
          <div class="bm-leg-route">
            <div><strong>${escape(clock(trip.departureTime))}</strong><span>${escape(from)}</span></div>
            <div class="bm-leg-line" aria-hidden="true"><span></span><em>${escape(trip.duration && trip.duration !== "Selected" ? trip.duration : trip.ferry)}</em><span></span></div>
            <div class="bm-leg-end"><strong>${escape(clock(trip.arrivalTime))}${trip.arrivalNextDay ? "<small>+1</small>" : ""}</strong><span>${escape(to)}</span></div>
          </div>
        </div>
        <p class="bc-leg-meta">${escape(trip.ferry)} · ${escape(record.cabin)}</p>
      </div>` : "";
    const people = record.passengerDetails.map(p => `<li><span class="bm-avatar" aria-hidden="true">${escape((p.name || "?").trim().charAt(0).toUpperCase())}</span><div><strong>${escape(p.name)}</strong><span>${[p.age !== undefined && p.age !== "" ? `${p.age} yrs` : "", p.gender].filter(Boolean).map(escape).join(" · ")}</span></div></li>`).join("");
    const chips = [
      ...(record.vehicleDetails || []).map(v => `<li><span class="bc-chip-kind">Vehicle</span>${escape(v.type)}${v.plate ? ` · ${escape(v.plate)}` : ""}</li>`),
      ...(record.petDetails || []).map(pet => `<li><span class="bc-chip-kind">Pet</span>${escape(pet.name)}${pet.type ? ` · ${escape(pet.type)}` : ""}</li>`),
    ].join("");
    const totals = record.fareBreakdown || booking.totals(record);
    const out = record.outboundTrip, back = record.returnTrip;
    const lines = [];
    if (out?.pricePerPerson !== undefined) lines.push([`Departure · ${out.ferry} × ${record.passengers}`, out.pricePerPerson * record.passengers]);
    if (back?.pricePerPerson !== undefined) lines.push([`Return · ${back.ferry} × ${record.passengers}`, back.pricePerPerson * record.passengers]);
    if (!lines.length) lines.push(["Tickets", totals.tickets]);
    if (totals.vehicles) lines.push([`Vehicle fees (${plural(record.vehicles, "vehicle")})`, totals.vehicles]);
    if (totals.pets) lines.push([`Pet fees (${plural(record.pets, "pet")})`, totals.pets]);
    if (totals.fee) lines.push(["Booking fee", totals.fee]);
    const check = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
    shell(`<a class="bf-edit bc-back" href="bookings.html">← My bookings</a>
      <section class="bc-hero" aria-labelledby="bc-title">
        <div class="bc-check">${check}</div>
        <div class="bc-hero-text">
          <p class="bc-eyebrow">Booking confirmed</p>
          <h1 id="bc-title">You're all set${firstName ? `, ${escape(firstName)}` : ""}!</h1>
          <p>Your e-ticket is saved to this device${record.contact?.email ? ` and linked to <strong>${escape(record.contact.email)}</strong>` : ""}. Preview mode — no payment was processed.</p>
        </div>
        <div class="bc-ref">
          <span>Booking reference</span>
          <strong>${escape(record.reference)}</strong>
          <button type="button" class="bc-copy" data-copy-ref="${escape(record.reference)}">Copy</button>
        </div>
      </section>
      <div class="bf-layout bc-layout">
        <div>
          <section class="bf-card">
            <div class="bc-card-head"><h2>Your trip</h2><span>${escape(record.tripType)} · ${plural(record.passengers, "passenger")}</span></div>
            <p class="bc-route">${escape(record.route.origin)} <span aria-hidden="true">→</span> ${escape(record.route.destination)}</p>
            ${leg("Departure", out, record.departureDate, record.route.origin, record.route.destination)}
            ${leg("Return", back, record.returnDate, record.route.destination, record.route.origin)}
          </section>
          <section class="bf-card">
            <div class="bc-card-head"><h2>Travellers</h2><span>${[plural(record.passengers, "passenger"), record.vehicles ? plural(record.vehicles, "vehicle") : "", record.pets ? plural(record.pets, "pet") : ""].filter(Boolean).join(" · ")}</span></div>
            <ul class="bm-people">${people}</ul>
            ${chips ? `<ul class="bm-chips bc-chips">${chips}</ul>` : ""}
            ${record.contact ? `<dl class="bc-contact"><div><dt>Contact</dt><dd>${escape(record.contact.name)}</dd></div><div><dt>Email</dt><dd>${escape(record.contact.email)}</dd></div><div><dt>Mobile</dt><dd>${escape(record.contact.phone)}</dd></div></dl>` : ""}
          </section>
          <section class="bf-card">
            <h2>Before you sail</h2>
            <ol class="bc-steps">
              <li><strong>Arrive 1 hour early</strong><span>Check-in closes 30 minutes before departure.</span></li>
              <li><strong>Bring a valid ID</strong><span>Every passenger needs one, plus this booking reference.</span></li>
              ${record.vehicles || record.pets ? `<li><strong>Vehicles and pets</strong><span>Go to the terminal counter first so staff can arrange boarding.</span></li>` : ""}
              <li><strong>Read the travel instructions</strong><span><a class="bf-edit" href="travel-instructions.html?id=${id}">Terminal, baggage and boarding details</a></span></li>
            </ol>
          </section>
        </div>
        <aside class="bf-trip-sidebar">
          <section class="bf-card bc-pay">
            <div class="bc-card-head"><h2>Payment</h2><span class="bc-paid">Paid · ${record.payment === "gcash" ? "GCash" : "Online Banking"}</span></div>
            <dl class="bm-costs">${lines.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${money(value)}</dd></div>`).join("")}<div class="bm-total"><dt>Total paid</dt><dd>${money(record.totalPrice)}</dd></div></dl>
            <div class="bc-actions">
              <a class="bf-primary" href="bookings.html">View my bookings</a>
              <button type="button" class="bc-secondary" data-action="print">Print e-ticket</button>
              <a class="bc-secondary" href="index.html">Book another trip</a>
            </div>
          </section>
        </aside>
      </div>`);
  }
  function renderTripLists() {
    const headings = $$("main h2");
    const upcomingList = headings.find(h => h.textContent.trim().startsWith("Upcoming Trips"))?.nextElementSibling;
    const pastList = headings.find(h => h.textContent.trim().startsWith("Past Trips"))?.nextElementSibling;
    if (!upcomingList || !pastList) return;
    const bookings = window.ENTREE_DATA.MOCK_BOOKINGS.filter(b => b && b.route && b.departureDate && Number.isFinite(b.totalPrice));
    const today = booking.dateValue(new Date());
    const ends = b => b.returnDate || b.departureDate;
    const peso = value => `₱${Number(value).toFixed(2)}`;
    const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
    const shortDate = value => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const icon = (cls, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}" aria-hidden="true">${body}</svg>`;
    const pin = icon("lucide lucide-map-pin bookings-icon-pin", '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"></path><circle cx="12" cy="10" r="3"></circle>');
    const cal = icon("lucide lucide-calendar bookings-icon-pin", '<path d="M8 2v4"></path><path d="M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="M3 10h18"></path>');
    const user = icon("lucide lucide-user bookings-icon-user", '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>');
    const pkg = icon("lucide lucide-package bookings-icon-package", '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"></path><path d="M12 22V12"></path><polyline points="3.29 7 12 12 20.71 7"></polyline><path d="m7.5 4.27 9 5.15"></path>');
    const share = icon("lucide lucide-share-2 bookings-icon-share", '<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"></line><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"></line>');
    const btn = "bookings-action-button";
    const extras = b => {
      const items = [];
      if (b.pasalubongItems) items.push(`<button type="button" class="bk-addons-link bookings-meta-item" data-action="booking-addons" aria-label="View ${plural(b.pasalubongItems, "pasalubong add-on")}">${pkg}<span class="bookings-meta-text">${plural(b.pasalubongItems, "add-on")}</span></button>`);
      const party = [b.vehicles ? plural(b.vehicles, "vehicle") : "", b.pets ? plural(b.pets, "pet") : ""].filter(Boolean).join(" · ");
      if (party) items.push(`<span class="bookings-meta-text">${party}</span>`);
      return items.join("");
    };
    const subtitle = b => [b.ferry + (b.returnFerry && b.returnFerry !== b.ferry ? ` / ${b.returnFerry}` : ""), b.tripType, b.cabin].filter(Boolean).map(escape).join(" · ");
    const upcomingCard = b => `<div class="bk-card bookings-card" data-booking="${escape(b.id)}" data-action="booking">
      <div class="bk-card-head bookings-card-head"><div class="bk-card-title">
        <div class="bk-card-ref bookings-card-ref"><span class="bk-ref bookings-ref">${escape(b.reference)}</span>${b.departureDate <= today ? `<span class="bookings-pill-today">TODAY</span>` : `<span class="bookings-pill-upcoming">UPCOMING</span>`}</div>
        <p class="bookings-card-subtitle">${subtitle(b)}</p>
      </div><button type="button" class="bk-share bookings-share-button" data-action="share" aria-label="Share trip">${share}<span>Share Trip</span></button></div>
      <div class="bk-card-grid bookings-card-grid">
        <div class="bookings-card-fact">${pin}<div><p class="bookings-fact-label">Route</p><p class="bookings-fact-value">${escape(b.route.origin)} → ${escape(b.route.destination)}</p></div></div>
        <div class="bookings-card-fact">${cal}<div><p class="bookings-fact-label">Departure</p><p class="bookings-fact-value">${escape(date(b.departureDate))}</p>${b.departureTime ? `<p class="bookings-fact-time">${escape(clock(b.departureTime))}${b.arrivalTime ? ` - ${escape(clock(b.arrivalTime))}` : ""}</p>` : ""}${b.returnDate ? `<p class="bookings-fact-return">Return: ${escape(date(b.returnDate))}${b.returnDepartureTime ? ` · ${escape(clock(b.returnDepartureTime))}` : ""}</p>` : ""}</div></div>
      </div>
      <div class="bookings-card-footer"><div class="bk-card-foot bookings-card-foot">
        <div class="bk-card-meta bookings-card-meta"><div class="bookings-meta-item">${user}<span class="bookings-meta-text">${plural(b.passengers, "passenger")}</span></div>${extras(b)}<p class="bookings-card-price">${peso(b.totalPrice)}</p></div>
        <div class="bk-card-actions bookings-card-actions"><button type="button" class="${btn}" data-action="go:rebook">Rebook</button><button type="button" class="${btn}" data-action="go:refund">Refund</button><button type="button" class="${btn}" data-action="addons">Buy Add-ons</button></div>
      </div></div></div>`;
    const pastCard = b => {
      const refunded = b.refund;
      const badge = refunded ? `<span class="bookings-pill-refunded">REFUNDED</span>` : `<span class="bookings-pill-completed">COMPLETED</span>`;
      const detail = refunded ? `<p class="bookings-refund-note">${escape(refunded.status)} ${escape(shortDate(refunded.requestedAt))} · ${peso(refunded.amount)} of ${peso(b.totalPrice)} (${refunded.percent}%) · 7–14 business days</p>` : "";
      return `<div class="bk-card ${refunded ? "bookings-card" : "bookings-card-muted"}" data-booking="${escape(b.id)}"${refunded ? ' data-action="booking"' : ""}>
        <div class="bk-card-ref bookings-card-ref"><span class="bk-ref bookings-ref-past">${escape(b.reference)}</span>${badge}</div>
        <p class="bookings-past-route">${escape(b.route.origin)} → ${escape(b.route.destination)} • ${escape(date(b.departureDate))}</p>${detail}</div>`;
    };
    const upcoming = bookings.filter(b => !b.refund && b.status !== "completed" && ends(b) >= today).sort((a, b) => a.departureDate.localeCompare(b.departureDate));
    const past = bookings.filter(b => !upcoming.includes(b)).sort((a, b) => (b.refund?.requestedAt || b.departureDate).localeCompare(a.refund?.requestedAt || a.departureDate));
    const empty = text => `<div class="bk-card bookings-card-empty">${text}</div>`;
    upcomingList.innerHTML = upcoming.length ? upcoming.map(upcomingCard).join("") : empty('No upcoming trips. <a class="bookings-empty-link" href="index.html">Book a trip</a>');
    pastList.innerHTML = past.length ? past.map(pastCard).join("") : empty("No past trips yet.");
  }
  // Capture navigation before the existing app's delegated handlers.
  document.addEventListener("click", event => {
    const target = event.target.closest("button,a");
    if (!target) return;
    if (page === "index" && (target.dataset.action?.startsWith("go:") || target.tagName === "A")) {
      readHome();
      if (target.dataset.action === "go:trips") {
        const message = booking.searchError();
        if (message) { event.preventDefault(); event.stopImmediatePropagation(); error(message); return; }
        preselectPreferred();
      }
      saved();
    }
    if (target.dataset.selectTrip) {
      event.preventDefault();
      booking.save({ [target.dataset.selectTrip === "outbound" ? "outboundId" : "returnId"]: target.dataset.ferryId, completedId: "" });
      renderTrips();
      $(`[data-select-trip="${target.dataset.selectTrip}"][data-ferry-id="${target.dataset.ferryId}"]`)?.focus();
    }
    if (target.dataset.nextDay) {
      event.preventDefault();
      showNextDay(target.dataset.nextDay);
      return;
    }
    if (target.dataset.clearTrip) {
      event.preventDefault();
      const leg = target.dataset.clearTrip;
      booking.save({ [leg === "outbound" ? "outboundId" : "returnId"]: "", completedId: "" });
      renderTrips();
      $(`[data-select-trip="${leg}"]`)?.focus();
    }
    if (target.dataset.bookingNext) {
      event.preventDefault();
      const message = booking.selectionError();
      if (message) return error(message);
      saved();
      location.href = `${target.dataset.bookingNext}.html`;
    }
    if (page === "payment" && target.dataset.action === "complete-payment") {
      const message = booking.detailsError();
      if (message) { event.preventDefault(); event.stopImmediatePropagation(); error(message); }
    }
    if (page === "passenger-details" && target.tagName === "A") { saveDetails(); saved(); }
    if (target.dataset.copyRef) {
      event.preventDefault();
      const done = text => { target.textContent = text; setTimeout(() => { target.textContent = "Copy"; }, 1800); };
      navigator.clipboard?.writeText(target.dataset.copyRef).then(() => done("Copied!"), () => done("Copy failed")) ?? done("Copy failed");
    }
  }, true);
  document.addEventListener("input", () => { if (page === "passenger-details") saveDetails(); });
  document.addEventListener("change", () => { if (page === "passenger-details") saveDetails(); });
  function init() {
    if (page === "index") restoreHome();
    if (page === "trips") {
      // The departure day was moved on load (its sailings had all left): book the
      // traveller's chosen shipping line on the new day, like a fresh search does.
      if (booking.movedFrom()) preselectPreferred();
      renderTrips();
    }
    if (page === "passenger-details") renderPassengers();
    if (page === "payment") renderPayment();
    if (page === "confirmation") renderConfirmation();
    if (page === "bookings") renderTripLists();
    if (["rebook", "refund", "travel-instructions"].includes(page)) {
      const id = new URLSearchParams(location.search).get("id");
      const record = booking.records().find(b => b.id === id);
      if (record) $("main").insertAdjacentHTML("afterbegin", `<div class="bf-record-summary">${summary(record, false)}</div>`);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
