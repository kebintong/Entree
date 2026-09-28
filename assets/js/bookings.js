/* Scripts for pages/bookings.html (My Bookings).
   Loaded before app.js; app.js runs this once the page is ready and passes in the
   shared helpers (see "Shared with the page scripts" in app.js). */
window.ENTREE_PAGES = window.ENTREE_PAGES || {};
window.ENTREE_PAGES["bookings"] = (E) => {
  const { $, data, escape, dialog, action, booking, getPhilippineDate, peso, PAY_METHODS } = E;
  let currentMonth = new Date(getPhilippineDate().getFullYear(), getPhilippineDate().getMonth(), 1);
  // Pasalubong orders attached to a booking (demo data plus orders placed on this device).
  function pasalubongSummary(b) {
    const orders = Array.isArray(b?.pasalubongOrders) ? b.pasalubongOrders.filter((o) => o && Array.isArray(o.lines)) : [];
    const lineTotal = (l) => (Number(l.qty) || 0) * (Number(l.price) || 0);
    const items = orders.reduce((n, o) => n + o.lines.reduce((s, l) => s + (Number(l.qty) || 0), 0), 0);
    const total = orders.reduce((n, o) => n + o.lines.reduce((s, l) => s + lineTotal(l), 0), 0);
    return { orders, items, total, lineTotal };
  }
  function showBooking(id, share = false) {
    const b = data.MOCK_BOOKINGS.find((item) => item.id === id);
    if (!b) return;
    const peso = (value) => `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
    const longDate = (value) =>
      value ? new Date(value + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "";
    // Accept "13:00" or "09:00 AM" and always show "1:00 PM" style times.
    const clock = (value) => {
      const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(String(value || "").trim());
      if (!match) return value || "";
      let hour = Number(match[1]);
      const suffix = match[3] ? match[3].toUpperCase() : hour >= 12 ? "PM" : "AM";
      if (!match[3]) hour = hour % 12 || 12;
      return `${hour}:${match[2]} ${suffix}`;
    };
    const today = new Date();
    const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const status = b.refund
      ? ["refunded", "Refunded"]
      : b.status === "completed" || (b.returnDate || b.departureDate) < todayValue
        ? ["completed", "Completed"]
        : b.departureDate <= todayValue
          ? ["today", "Today"]
          : ["upcoming", "Upcoming"];
    const company = data.SHIPPING_COMPANIES?.find((c) => c.name === b.ferry);
    const logo = company?.logo
      ? `<img src="../assets/images/${company.logo}" alt="" />`
      : `<span aria-hidden="true">${escape((b.ferry || "?").slice(0, 2).toUpperCase())}</span>`;
    const leg = (label, date, from, to, depart, arrive, nextDay, ferry) => `
      <div class="bm-leg">
        <div class="bm-leg-head"><span class="bm-leg-label">${label}</span><span class="bm-leg-date">${escape(longDate(date))}</span></div>
        <div class="bm-leg-route">
          <div><strong>${escape(clock(depart) || "Time TBA")}</strong><span>${escape(from)}</span></div>
          <div class="bm-leg-line" aria-hidden="true"><span></span>${ferry ? `<em>${escape(ferry)}</em>` : ""}<span></span></div>
          <div class="bm-leg-end"><strong>${escape(clock(arrive) || "Time TBA")}${nextDay ? "<small>+1</small>" : ""}</strong><span>${escape(to)}</span></div>
        </div>
      </div>`;
    const outbound = b.outboundTrip || {};
    const inbound = b.returnTrip || {};
    const legs =
      leg("Departure", b.departureDate, b.route.origin, b.route.destination, b.departureTime, b.arrivalTime, outbound.arrivalNextDay, b.ferry) +
      (b.returnDate
        ? leg("Return", b.returnDate, b.route.destination, b.route.origin, b.returnDepartureTime, b.returnArrivalTime, inbound.arrivalNextDay, b.returnFerry || b.ferry)
        : "");
    const people = (b.passengerDetails || [])
      .map((person) => {
        const meta = [person.age !== undefined && person.age !== "" ? `${person.age} yrs` : "", person.gender, person.seatNumber && person.seatNumber !== "—" ? `Seat ${person.seatNumber}` : ""]
          .filter(Boolean)
          .map(escape)
          .join(" · ");
        return `<li><span class="bm-avatar" aria-hidden="true">${escape((person.name || "?").trim().charAt(0).toUpperCase())}</span><div><strong>${escape(person.name || "Passenger")}</strong>${meta ? `<span>${meta}</span>` : ""}</div></li>`;
      })
      .join("");
    const extras = [
      ...(b.vehicleDetails || []).map((v) => `${escape(v.type || "Vehicle")}${v.plate ? ` · ${escape(v.plate)}` : ""}`),
      ...(b.petDetails || []).map((pet) => `${escape(pet.name || "Pet")}${pet.type ? ` · ${escape(pet.type)}` : ""}`),
    ];
    const lines = [];
    if (b.fareBreakdown) {
      lines.push(["Tickets", b.fareBreakdown.tickets]);
      if (b.fareBreakdown.vehicles) lines.push(["Vehicle fees", b.fareBreakdown.vehicles]);
      if (b.fareBreakdown.pets) lines.push(["Pet fees", b.fareBreakdown.pets]);
      if (b.fareBreakdown.fee) lines.push(["Booking fee", b.fareBreakdown.fee]);
    } else {
      const addOns = (b.addOns || []).map((item) => [`${item.name}${item.quantity > 1 ? ` × ${item.quantity}` : ""}`, item.price * item.quantity]);
      const tickets = b.totalPrice - addOns.reduce((sum, [, value]) => sum + value, 0);
      if (tickets > 0) lines.push([`Tickets (${plural(b.passengers, "passenger")})`, tickets]);
      lines.push(...addOns);
    }
    const payment = b.payment === "gcash" ? "GCash" : b.payment === "bank" ? "Online Banking" : "";
    const refund = b.refund
      ? `<div class="bm-refund" role="status"><strong>${escape(b.refund.status)}</strong><span>${peso(b.refund.amount)} (${b.refund.percent}%) requested ${escape(new Date(b.refund.requestedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }))} · paid back in 7–14 business days</span></div>`
      : "";
    const canChange = !share && !b.refund && status[0] !== "completed";
    const psl = pasalubongSummary(b);
    const placed = (value) => {
      const when = new Date(value);
      return isNaN(when) ? "" : when.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    };
    const addOnsSection = psl.orders.length
      ? `<section class="bm-section" id="bm-addons"><h3>Pasalubong add-ons <span>${plural(psl.items, "item")} · ${peso(psl.total)}</span></h3>
        ${psl.orders
          .map((o) => {
            const method = PAY_METHODS[o.method]?.label;
            const meta = [
              o.name ? `Ordered by <strong>${escape(o.name)}</strong>${o.onBooking === false ? ' <em class="bm-order-tag">Not a passenger</em>' : ""}` : "",
              placed(o.placedAt) ? `Placed ${escape(placed(o.placedAt))}` : "",
              method ? `Paid with ${escape(method)}` : "",
            ].filter(Boolean);
            const orderTotal = o.lines.reduce((sum, l) => sum + psl.lineTotal(l), 0);
            return `<article class="bm-order">
              <div class="bm-order-head"><strong>Order ${escape(o.ref || "")}</strong><span>${peso(orderTotal)}</span></div>
              ${meta.length ? `<p class="bm-order-meta">${meta.join(" · ")}</p>` : ""}
              <ul class="bm-order-lines">${o.lines
                .map((l) => `<li><span class="bm-order-qty">${Number(l.qty) || 0}×</span><span class="bm-order-name">${escape(l.name || "Item")}</span><span class="bm-order-price">${peso(psl.lineTotal(l))}</span></li>`)
                .join("")}</ul>
            </article>`;
          })
          .join("")}
        <p class="bm-order-note">Delivered to your seat on board on ${escape(longDate(b.departureDate))}.${canChange ? ` <a href="verify-booking.html?id=${encodeURIComponent(b.id)}">Add more</a>` : ""}</p>
      </section>`
      : canChange
        ? `<section class="bm-section" id="bm-addons"><h3>Pasalubong add-ons</h3><p class="bm-order-empty">No pasalubong on this trip yet. <a href="verify-booking.html?id=${encodeURIComponent(b.id)}">Shop pasalubong</a></p></section>`
        : "";
    const actions = share
      ? `<button class="dialog-action" data-action="copy-trip">Copy details</button><button class="dialog-action bm-secondary" data-action="print">Print</button>`
      : `${canChange ? `<a class="dialog-action" href="rebook.html?id=${encodeURIComponent(b.id)}">Rebook</a>` : ""}<a class="dialog-action bm-secondary" href="travel-instructions.html?id=${encodeURIComponent(b.id)}">Travel instructions</a><button class="dialog-action bm-secondary" data-action="print">Print</button>${canChange ? `<a class="dialog-action bm-danger" href="refund.html?id=${encodeURIComponent(b.id)}">Refund</a>` : ""}`;
    const d = dialog(
      share ? "Share Trip" : "Booking details",
      `<div class="bm-head">
        <div class="bm-logo">${logo}</div>
        <div class="bm-title"><span>Booking reference</span><strong>${escape(b.reference)}</strong><p>${[b.ferry, b.tripType || (b.returnDate ? "Round Trip" : "One Way"), b.cabin].filter(Boolean).map(escape).join(" · ")}</p></div>
        <span class="bm-status is-${status[0]}">${status[1]}</span>
      </div>
      ${refund}
      <section class="bm-section" aria-label="Journey">${legs}</section>
      <section class="bm-section"><h3>Travellers <span>${plural(b.passengers, "passenger")}${b.vehicles ? ` · ${plural(b.vehicles, "vehicle")}` : ""}${b.pets ? ` · ${plural(b.pets, "pet")}` : ""}</span></h3>
        <ul class="bm-people">${people}</ul>
        ${extras.length ? `<ul class="bm-chips">${extras.map((x) => `<li>${x}</li>`).join("")}</ul>` : ""}
      </section>
      <section class="bm-section"><h3>Payment${payment ? ` <span>${payment}</span>` : ""}</h3>
        <dl class="bm-costs">${lines.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${peso(value)}</dd></div>`).join("")}<div class="bm-total"><dt>Total paid</dt><dd>${peso(b.totalPrice)}</dd></div></dl>
      </section>
      ${share ? "" : addOnsSection}
      <div class="bm-actions">${actions}</div>
      <p class="bm-note">Preview mode — this booking is saved on this device only.</p>`,
    );
    d.classList.add("booking-modal");
    d.dataset.booking = id;
  }
  function showAddOns(id) {
    const b = data.MOCK_BOOKINGS.find((item) => item.id === id);
    if (!b) return;
    const today = new Date();
    const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const active = !b.refund && b.status !== "completed" && b.departureDate >= todayValue;
    const company = data.SHIPPING_COMPANIES?.find((c) => c.name === b.ferry);
    const logo = company?.logo
      ? `<img src="../assets/images/${company.logo}" alt="" />`
      : `<span aria-hidden="true">${escape((b.ferry || "?").slice(0, 2).toUpperCase())}</span>`;
    const tripDate = new Date(b.departureDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    const psl = pasalubongSummary(b);
    const gift = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>';
    const d = dialog(
      "Buy Add-ons",
      `<div class="bm-head ao-trip">
        <div class="bm-logo">${logo}</div>
        <div class="bm-title"><span>Adding to</span><strong>${escape(b.reference)}</strong><p>${escape(b.route.origin)} → ${escape(b.route.destination)} · ${escape(tripDate)}</p></div>
      </div>
      <ul class="ao-list">
        <li class="ao-option is-featured"><span class="ao-icon">${gift}</span><div class="ao-text"><strong>Pasalubong</strong><span>Local treats and souvenirs, pre-ordered now and delivered to your seat on board.</span></div><div class="ao-side">${
          active
            ? `<a class="dialog-action ao-cta" href="verify-booking.html?id=${encodeURIComponent(b.id)}">${psl.orders.length ? "Shop more" : "Shop now"}</a>`
            : '<span class="ao-tag is-muted">Not available</span>'
        }</div></li>
      </ul>
      ${
        psl.orders.length
          ? `<div class="ao-added"><div class="ao-added-text"><strong>Added to this trip</strong><span>${psl.items} item${psl.items === 1 ? "" : "s"} · ₱${psl.total.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${psl.orders.length} order${psl.orders.length === 1 ? "" : "s"}</span></div><button type="button" class="ao-view" data-action="booking-addons">View add-ons</button></div>`
          : ""
      }
      ${active ? "" : '<p class="ao-note">Pasalubong can only be ordered for upcoming trips.</p>'}`,
    );
    d.classList.add("addons-modal");
    d.dataset.booking = id;
  }
  function renderCalendar() {
    const previous = $('[data-action="month:-1"]');
    if (!previous) return;
    const heading = previous.parentElement;
    const monthTitle = $("h3", heading);
    if (monthTitle) {
      monthTitle.textContent = currentMonth.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
    }

    const phtNow = getPhilippineDate();
    const phtYear = phtNow.getFullYear();
    const phtMonth = phtNow.getMonth();
    const phtDay = phtNow.getDate();

    // Update date string (formatted in Philippine Time)
    const dateStrEl = $("#pht-date-str");
    if (dateStrEl) {
      try {
        const dayFormatter = new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Manila",
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        dateStrEl.textContent = dayFormatter.format(new Date());
      } catch {
        dateStrEl.textContent = phtNow.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      }
    }

    const grid = heading.nextElementSibling;
    if (!grid) return;
    grid.innerHTML = "";
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    for (const day of ["S", "M", "T", "W", "T", "F", "S"]) {
      grid.insertAdjacentHTML(
        "beforeend",
        `<div class="bookings-cal-weekday">${day}</div>`,
      );
    }

    const firstDayIndex = new Date(year, month, 1).getDay();
    for (let i = 0; i < firstDayIndex; i++) {
      grid.append(document.createElement("div"));
    }

    const totalDays = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(year, month, day);
      const isToday = year === phtYear && month === phtMonth && day === phtDay;
      const matchedBooking = data.MOCK_BOOKINGS.find(
        (b) =>
          b.status !== "refunded" &&
          date >= new Date(b.departureDate + "T00:00:00") &&
          date <= new Date((b.returnDate || b.departureDate) + "T23:59:59"),
      );
      const isTrip = Boolean(matchedBooking);

      let cellClass = "bookings-cal-day";
      let title = `${currentMonth.toLocaleDateString("en-US", { month: "short" })} ${day}, ${year}`;

      if (isTrip && isToday) {
        cellClass = "bookings-cal-day-trip-today";
        title += ` • Today & Trip: ${matchedBooking.reference} (${matchedBooking.route.origin} → ${matchedBooking.route.destination})`;
      } else if (isTrip) {
        cellClass = "bookings-cal-day-trip";
        title += ` • Trip: ${matchedBooking.reference} (${matchedBooking.route.origin} → ${matchedBooking.route.destination})`;
      } else if (isToday) {
        cellClass = "bookings-cal-day-today";
        title += " • Today";
      }

      grid.insertAdjacentHTML(
        "beforeend",
        `<div class="${cellClass}" title="${escape(title)}">${day}</div>`,
      );
    }
  }
  // Open a booking's details straight at its pasalubong add-ons.
  function showBookingAddOns(id) {
    if (!data.MOCK_BOOKINGS.some((b) => b.id === id)) return;
    showBooking(id);
    const section = $("dialog.booking-modal #bm-addons");
    if (!section) return;
    section.classList.add("is-highlighted");
    requestAnimationFrame(() => section.scrollIntoView({ block: "start", behavior: "smooth" }));
  }
  currentMonth = new Date(getPhilippineDate().getFullYear(), getPhilippineDate().getMonth(), 1);
  renderCalendar();
  const addOnsFor = new URLSearchParams(location.search).get("addons");
  if (addOnsFor) setTimeout(() => showBookingAddOns(addOnsFor), 0);
  return {
    actions: {
      booking: (el, arg, amount, id) => showBooking(id),
      share: (el, arg, amount, id) => showBooking(id, true),
      addons: (el, arg, amount, id) => showAddOns(id),
      "booking-addons": (el, arg, amount, id) => showBookingAddOns(id),
      month(el, arg) {
        if (arg === "today") {
          const pht = getPhilippineDate();
          currentMonth = new Date(pht.getFullYear(), pht.getMonth(), 1);
        } else {
          currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + Number(arg), 1);
        }
        renderCalendar();
      },
    },
  };
};
