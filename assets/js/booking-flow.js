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
          ${trip ? `<div class="bf-leg-company">${companyLogo(trip.ferry)}<div><strong>${escape(trip.ferry)}</strong><span>${escape(value.cabin)}</span></div></div><div class="bf-price-row"><span>Ticket price (${value.passengers} pax)</span><strong>${money(trip.pricePerPerson * value.passengers)}</strong></div>` : '<p class="bf-note">Choose a shipping line for this leg.</p>'}</section>`;
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
  function updateHeader() {
    const header = $("header");
    if (!header) return;
    const old = [...header.children].find(el => el.classList.contains("absolute") && el.classList.contains("left-1/2"));
    old?.remove();
  }
  function shell(content) {
    $("main").innerHTML = `<div class="bf-page">${content}</div>`;
    updateHeader();
  }
  function renderTrips() {
    const value = booking.get();
    const legs = value.tripType === "Round Trip" ? ["outbound", "return"] : ["outbound"];
    shell(`${heading("Choose your trips", "index", "Edit search")}
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
          <div class="bf-trip-route"><h3>${escape(ferry.ferry)}</h3><p><time>${escape(ferry.departureTime)}</time><span>${escape(returning ? value.destination : value.origin)}</span></p><p><time>${escape(ferry.arrivalTime)}${ferry.arrivalNextDay ? '<small>+1 day</small>' : ''}</time><span>${escape(returning ? value.origin : value.destination)}</span></p></div>
          <div class="bf-trip-duration"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 13V7h14v6M9 7V3h6v4M3 14l9-3 9 3-3 6H6l-3-6ZM2 21c2 2 4-2 6 0s4-2 6 0 4-2 8 0"/></svg>${escape(ferry.duration || "Scheduled")} trip</div>
          <div class="bf-trip-book"><button type="button" class="bf-book-button${selected ? " is-booked" : ""}" ${selected ? `data-clear-trip="${leg}"` : `data-select-trip="${leg}"`} data-ferry-id="${escape(ferry.id)}" aria-pressed="${selected}" aria-label="${selected ? "Cancel booking" : "Book now"}: ${escape(ferry.ferry)} ${returning ? "return" : "departure"}">${selected ? "Cancel" : "Book Now"}</button></div></article>`;
        }).join("") || `<p class="bf-empty">No departures match this passenger count. <a href="index.html">Adjust your search</a> to see more options.</p>`}</div></section>`;
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
    updateHeader();
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
  function renderConfirmation() {
    const record = booking.records().find(b => b.id === booking.get().completedId);
    if (!record) {
      shell(`${heading("Review your booking", "trips", "Choose trips")}${summary()}<a class="bf-primary" href="passenger-details.html">Continue booking →</a>`);
      return;
    }
    shell(`${heading("Booking confirmed", "bookings", "My bookings")}<p class="bf-note">Your booking is saved to this device. Preview mode — no payment was processed.</p><div class="bf-layout"><section class="bf-card"><h2>${escape(record.reference)}</h2><p>Payment method: ${record.payment === "gcash" ? "GCash" : "Online Banking"}</p><h3>Passengers</h3><ul>${record.passengerDetails.map(p => `<li>${escape(p.name)}</li>`).join("")}</ul><p>Contact: ${escape(record.contact.email)}</p><p><strong>Total: ${money(record.totalPrice)}</strong></p><div class="bf-actions"><a class="bf-primary" href="bookings.html">View my bookings</a><a class="bf-edit" href="travel-instructions.html?id=${encodeURIComponent(record.id)}">Travel instructions</a></div></section>${summary(record)}</div>`);
  }
  function addSavedBookings() {
    const records = booking.records();
    if (!records.length) return;
    const main = $("main");
    const section = document.createElement("section");
    section.className = "bf-saved-bookings bf-card";
    section.innerHTML = `<h2>Your saved bookings</h2>${records.map(record => `<article class="bf-saved-trip"><h3>${escape(record.route.origin)} → ${escape(record.route.destination)}</h3><p>${escape(record.reference)} · ${escape(record.tripType)} · ${escape(record.ferry)} · ${escape(record.cabin)}</p><p>${escape(date(record.departureDate))}${record.returnDate ? ` — ${escape(date(record.returnDate))}` : ""}</p><p>${record.passengers} passengers · ${record.vehicles} vehicles · ${record.pets} pets · ${money(record.totalPrice)}</p><div class="bf-actions"><button type="button" class="bf-edit" data-action="booking" data-booking="${escape(record.id)}">View details</button><a href="rebook.html?id=${encodeURIComponent(record.id)}">Rebook</a><a href="refund.html?id=${encodeURIComponent(record.id)}">Refund</a></div></article>`).join("")}`;
    main.prepend(section);
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
      }
      saved();
    }
    if (target.dataset.selectTrip) {
      event.preventDefault();
      booking.save({ [target.dataset.selectTrip === "outbound" ? "outboundId" : "returnId"]: target.dataset.ferryId, completedId: "" });
      renderTrips();
      $(`[data-select-trip="${target.dataset.selectTrip}"][data-ferry-id="${target.dataset.ferryId}"]`)?.focus();
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
  }, true);
  document.addEventListener("input", () => { if (page === "passenger-details") saveDetails(); });
  document.addEventListener("change", () => { if (page === "passenger-details") saveDetails(); });
  function init() {
    if (page === "index") restoreHome();
    if (page === "trips") renderTrips();
    if (page === "passenger-details") renderPassengers();
    if (page === "payment") renderPayment();
    if (page === "confirmation") renderConfirmation();
    if (page === "bookings") addSavedBookings();
    if (["rebook", "refund", "travel-instructions"].includes(page)) {
      const id = new URLSearchParams(location.search).get("id");
      const record = booking.records().find(b => b.id === id);
      if (record) $("main").insertAdjacentHTML("afterbegin", `<div class="bf-record-summary">${summary(record, false)}</div>`);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
