/* Scripts for pages/verify-booking.html (Verify Booking).
   Loaded before app.js; app.js runs this once the page is ready and passes in the
   shared helpers (see "Shared with the page scripts" in app.js). */
window.ENTREE_PAGES = window.ENTREE_PAGES || {};
window.ENTREE_PAGES["verify-booking"] = (E) => {
  const { $, $$, data, escape, store, markSaved, navigateTo, dialog, booking, formError } = E;
  const v = store.get("verification");
  const list = $("#vb-bookings");
  const requested = new URLSearchParams(location.search).get("id");
  // Hours until departure; pasalubong orders close 14 hours before sailing.
  const hoursLeft = (b) => {
    const quote = window.ENTREE_BOOKING?.refundQuote?.(b);
    if (quote) return quote.hours;
    return (new Date(b.departureDate + "T00:00:00") - new Date()) / 36e5;
  };
  // The optional developer panel (Insert + Delete) can switch the 14-hour cutoff off for this tab.
  const cutoff = window.ENTREE_DEV_SLOT?.flag("skipCutoff") ? 0 : 14;
  const upcoming = data.MOCK_BOOKINGS.filter((b) => b && b.route && b.reference && !b.refund && b.status !== "completed" && hoursLeft(b) > 0).sort((a, b) =>
    a.departureDate.localeCompare(b.departureDate),
  );
  if (list) {
    if (!upcoming.length) {
      list.innerHTML = '<p class="vb-empty">No upcoming bookings on this device. <a href="index.html">Book a trip</a> to start shopping for pasalubong.</p>';
      $$('form button[type="submit"], #order-name').forEach((el) => (el.disabled = true));
    } else {
      const preferred = requested ? upcoming.find((b) => b.id === requested) : v?.reference ? upcoming.find((b) => b.reference === v.reference) : null;
      const firstEligible = upcoming.find((b) => hoursLeft(b) >= cutoff);
      const selected = preferred && hoursLeft(preferred) >= cutoff ? preferred : upcoming.length === 1 ? firstEligible : null;
      list.innerHTML = upcoming
        .map((b) => {
          const eligible = hoursLeft(b) >= cutoff;
          const company = data.SHIPPING_COMPANIES?.find((c) => c.name === b.ferry);
          const logo = company?.logo ? `<img src="../assets/images/${company.logo}" alt="" />` : `<span aria-hidden="true">${escape((b.ferry || "?").slice(0, 2).toUpperCase())}</span>`;
          const day = new Date(b.departureDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
          return `<label class="vb-option${eligible ? "" : " is-disabled"}">
            <input type="radio" name="vb-booking" value="${escape(b.reference)}"${b === selected ? " checked" : ""}${eligible ? "" : " disabled"} />
            <span class="vb-logo">${logo}</span>
            <span class="vb-info"><strong>${escape(b.route.origin)} → ${escape(b.route.destination)}</strong><span>${escape(b.reference)}</span><span>${escape(day)} · ${escape(b.ferry)} · ${b.passengers} pax</span>${eligible ? "" : '<em>Departs in under 14 hours — ordering closed</em>'}</span>
            <span class="vb-radio" aria-hidden="true"></span>
          </label>`;
        })
        .join("");
    }
  }
  const nameInput = $("#order-name");
  const savedName = v?.name || v?.surname;
  if (nameInput && savedName && !nameInput.value && v.reference === $('input[name="vb-booking"]:checked')?.value) nameInput.value = savedName;
  return {
    submit(form) {
      const chosen = $('input[name="vb-booking"]:checked', form);
      if (!chosen) {
        formError(form, "Choose the booking you want to shop for.");
        $('input[name="vb-booking"]:not(:disabled)', form)?.focus();
        return;
      }
      const reference = chosen.value.trim().toUpperCase();
      const nameInput = $("#order-name", form);
      const name = nameInput.value.trim().replace(/\s+/g, " ");
      if (!name) {
        formError(form, "Enter the name of the person placing this order.");
        nameInput.focus();
        return;
      }
      const selectedBooking = data.MOCK_BOOKINGS.find((b) => b.reference.toUpperCase() === reference);
      if (!selectedBooking) {
        formError(form, "We couldn't find that booking on this device. Choose another trip.");
        return;
      }
      $(".form-error", form)?.remove();
      const passengers = [...new Set((selectedBooking.passengerDetails || []).map((p) => String(p.name || "").trim().replace(/\s+/g, " ")).filter(Boolean))];
      // A name counts as "on the booking" if it's a passenger's full name or their surname.
      const typed = name.toLowerCase();
      const passenger = passengers.find((full) => {
        const f = full.toLowerCase();
        return f === typed || f.endsWith(" " + typed);
      });
      const proceed = (orderName, onBooking) => {
        markSaved();
        store.set("verification", { reference, name: orderName, onBooking });
        navigateTo("pasalubong");
      };
      if (passenger || !passengers.length) {
        proceed(passenger || name, Boolean(passenger));
        return;
      }
      const initials = (full) => escape(full.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase());
      const choice = (value, title, sub, checked, extra = "") => `<label class="vb-nm-option${extra}">
              <input type="radio" name="vb-order-name" value="${escape(value)}"${checked ? " checked" : ""} />
              <span class="vb-nm-avatar" aria-hidden="true">${initials(title)}</span>
              <span class="vb-nm-text"><strong>${escape(title)}</strong><span>${sub}</span></span>
              <span class="vb-radio" aria-hidden="true"></span>
            </label>`;
      const d = dialog(
        "This name isn't on the booking",
        `<p class="vb-nm-lead"><strong>${escape(name)}</strong> doesn't match any passenger on <strong>${escape(selectedBooking.reference)}</strong>. You can still order under this name, or pick a passenger's name instead.</p>
        <fieldset class="vb-nm-list">
          <legend class="vb-nm-label">Place this order under</legend>
          ${passengers.map((full, i) => choice(full, full, `Passenger ${i + 1} on this booking`, false)).join("")}
          ${choice("", name, "New name · not on this booking", true, " is-new")}
        </fieldset>
        <div class="vb-nm-actions">
          <button type="button" class="vb-nm-edit">Edit name</button>
          <button type="button" class="vb-nm-continue"></button>
        </div>`,
      );
      d.classList.add("vb-name-dialog");
      const closeDialog = () => $(".dialog-close", d)?.click();
      const picked = () => $('input[name="vb-order-name"]:checked', d)?.value || "";
      const continueBtn = $(".vb-nm-continue", d);
      const syncContinue = () => {
        continueBtn.textContent = `Continue as ${picked() || name}`;
      };
      syncContinue();
      d.addEventListener("change", syncContinue);
      continueBtn.onclick = () => {
        const chosenPassenger = picked();
        if (chosenPassenger) nameInput.value = chosenPassenger;
        closeDialog();
        proceed(chosenPassenger || name, Boolean(chosenPassenger));
      };
      $(".vb-nm-edit", d).onclick = () => {
        closeDialog();
        nameInput.focus();
        nameInput.select();
      };
    },
  };
};
