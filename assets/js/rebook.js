/* Scripts for pages/rebook.html (the reschedule page).
   Loaded before app.js; app.js runs this once the page is ready and passes in the
   shared helpers (see "Shared with the page scripts" in app.js). */
window.ENTREE_PAGES = window.ENTREE_PAGES || {};
window.ENTREE_PAGES["rebook"] = (E) => {
  const { $, $$, data, escape, markSaved, notice, dialog, action, booking, showCurrentBooking } = E;
  let selectedFerry = null;
  function schedules() {
    const input = $('input[type="date"]'),
      date = input.value;
    let container = $("#schedules");
    if (!container) {
      container = document.createElement("div");
      container.id = "schedules";
      input.parentElement.after(container);
    }
    selectedFerry = null;
    if (!date) {
      container.innerHTML = "";
      return;
    }
    const end = new Date(date + "T12:00:00");
    end.setDate(end.getDate() + 7);
    const ferries = data.AVAILABLE_FERRIES.filter(
      (f) => f.ferry === booking().ferry && f.date >= date && new Date(f.date + "T12:00:00") <= end,
    );
    container.innerHTML =
      `<h3>Available ${escape(booking().ferry)} Schedules (${ferries.length})</h3>` +
      ferries
        .map(
          (f) =>
            `<button class="schedule" data-action="schedule:${f.id}"><strong>${escape(f.ferry)} · ${escape(f.date)}</strong><br>${escape(f.departureTime)} – ${escape(f.arrivalTime)}<br>${f.availableSeats} seats · ₱${f.pricePerPerson.toFixed(2)} per person</button>`,
        )
        .join("") +
      (!ferries.length
        ? '<p class="rebook-empty-note">No departures in this date range. Try a date closer to your original trip.</p>'
        : "");
  }
  const list = $('main input[type="checkbox"]').closest("label").parentElement;
  const template = list.firstElementChild.cloneNode(true);
  list.replaceChildren();
  booking().passengerDetails.forEach((person, i) => {
    const row = template.cloneNode(true),
      labels = $$("p", row);
    labels[0].textContent = person.name;
    labels[1].textContent = `${person.age} years old • ${person.gender} • Seat ${person.seatNumber || "—"}`;
    const input = $("input", row);
    input.id = "passenger-" + i;
    input.setAttribute("aria-label", person.name);
    row.htmlFor = input.id;
    list.append(row);
  });
  function updatePassengers() {
    const boxes = $$('main input[type="checkbox"]');
    list.nextElementSibling.textContent = `${boxes.filter((b) => b.checked).length} of ${boxes.length} passengers selected`;
  }
  $('input[type="date"]').addEventListener("change", () => {
    schedules();
  });
  $$('input[type="checkbox"]').forEach((input) =>
    input.addEventListener("change", () => {
      input.closest("label").style.borderColor = input.checked ? "#ccff00" : "#e5e7eb";
      input.closest("label").style.backgroundColor = input.checked ? "#ccff001a" : "white";
      updatePassengers();
    }),
  );
  updatePassengers();
  showCurrentBooking();
  return {
    isDirty: () => selectedFerry !== null,
    actions: {
      "select-passengers"(el) {
        const boxes = $$('main input[type="checkbox"]'),
          checked = !boxes.every((b) => b.checked);
        boxes.forEach((b) => {
          b.checked = checked;
          b.dispatchEvent(new Event("change"));
        });
        el.textContent = checked ? "Deselect All" : "Select All";
      },
      schedule(el, arg) {
        selectedFerry = data.AVAILABLE_FERRIES.find((f) => String(f.id) === arg);
        $$(".schedule").forEach((b) => b.classList.toggle("selected-option", b === el));
      },
      reschedule() {
        if (booking().refund) {
          notice("This booking has been refunded and can no longer be rebooked.");
          return;
        }
        if (!selectedFerry) {
          notice("Please select a ferry schedule.");
          return;
        }
        if (!$$('main input[type="checkbox"]:checked').length) {
          notice("Please select at least one passenger.");
          return;
        }
        markSaved();
        dialog(
          "Reschedule confirmed",
          '<p>Your new schedule is saved to this device and your booking reference stays the same. Preview mode — no live reservation was changed.</p><a class="dialog-action" href="bookings.html">Back to my bookings</a>',
        );
      },
    },
  };
};
