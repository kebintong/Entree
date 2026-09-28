/* Scripts for pages/signup.html (the sign-up page).
   Loaded before app.js; app.js runs this once the page is ready and passes in the
   shared helpers (see "Shared with the page scripts" in app.js). */
window.ENTREE_PAGES = window.ENTREE_PAGES || {};
window.ENTREE_PAGES["signup"] = (E) => {
  const { $, $$, data, escape, store, markSaved, navigateTo, allText, dialog, booking, formError } = E;
  for (const title of ["Terms and Conditions", "Privacy Policy"])
    allText(title).forEach((el) => {
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.onclick = () =>
        dialog(
          title,
          "<p>This document is being finalised with our legal team and will be published before launch. Email <strong>support@entree.ph</strong> if you need a copy in the meantime.</p>",
        );
      el.onkeydown = (e) => {
        if (e.key === "Enter") el.click();
      };
    });

  // ==========================================================================
  // Date fields (sign-up birthdate): same look and calendar as the booking form
  // ==========================================================================
  function setupDateFields() {
    const inputs = $$('input[type="date"][data-date-field]');
    if (!inputs.length) return;
    const localValue = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const CHEVRON = '<svg class="edf-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    const CAL_ICON = '<svg class="edf-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>';

    inputs.forEach((input) => {
      const label = input.dataset.dateField || "Date";
      if (input.hasAttribute("max") && !input.getAttribute("max")) {
        const now = new Date();
        input.max = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      }
      const minYear = Number(input.dataset.minYear) || new Date().getFullYear() - 100;
      const maxDate = input.max ? new Date(input.max + "T12:00:00") : new Date();
      const wrap = document.createElement("div");
      wrap.className = "edf";
      input.parentElement.insertBefore(wrap, input);
      wrap.appendChild(input);
      input.classList.add("edf-native");
      input.tabIndex = -1;
      input.setAttribute("aria-hidden", "true");
      wrap.insertAdjacentHTML(
        "beforeend",
        `<button type="button" class="edf-trigger" aria-haspopup="dialog" aria-expanded="false">${CAL_ICON}<span class="edf-text"><span class="edf-label">${escape(label)}</span><span class="edf-value">Select a date</span></span>${CHEVRON}</button>
         <div class="edf-calendar booking-calendar" hidden role="dialog" aria-label="Choose ${escape(label.toLowerCase())}"></div>`,
      );
      const trigger = $(".edf-trigger", wrap);
      const valueEl = $(".edf-value", wrap);
      const calendar = $(".edf-calendar", wrap);
      let visible = input.value ? new Date(input.value + "T12:00:00") : new Date(maxDate.getFullYear() - 20, maxDate.getMonth(), 1, 12);

      function showValue() {
        if (!input.value) {
          valueEl.textContent = "Select a date";
          valueEl.classList.add("is-empty");
          return;
        }
        valueEl.classList.remove("is-empty");
        valueEl.textContent = new Date(input.value + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      }
      function render(focusValue) {
        const year = visible.getFullYear();
        const month = visible.getMonth();
        const first = new Date(year, month, 1, 12).getDay();
        const days = new Date(year, month + 1, 0, 12).getDate();
        const selected = input.value;
        const years = [];
        for (let y = maxDate.getFullYear(); y >= minYear; y -= 1) years.push(y);
        const cells = Array.from({ length: days }, (_, i) => {
          const d = new Date(year, month, i + 1, 12);
          const value = localValue(d);
          const disabled = d > maxDate;
          return `<button type="button" class="calendar-day${value === selected ? " is-selected" : ""}" data-edf-date="${value}"${disabled ? " disabled" : ""} aria-pressed="${value === selected}" aria-label="${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}" tabindex="${value === (focusValue || selected) ? 0 : -1}">${i + 1}</button>`;
        }).join("");
        calendar.innerHTML =
          `<div class="calendar-heading edf-heading">
             <button type="button" class="calendar-nav" data-edf-step="-1" aria-label="Previous month">&#8249;</button>
             <span class="edf-selects">
               <select class="edf-select" data-edf-month aria-label="Month">${MONTHS.map((m, i) => `<option value="${i}"${i === month ? " selected" : ""}>${m}</option>`).join("")}</select>
               <select class="edf-select" data-edf-year aria-label="Year">${years.map((y) => `<option value="${y}"${y === year ? " selected" : ""}>${y}</option>`).join("")}</select>
             </span>
             <button type="button" class="calendar-nav" data-edf-step="1" aria-label="Next month">&#8250;</button>
           </div>
           <div class="calendar-weekdays" aria-hidden="true">${["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => `<span>${d}</span>`).join("")}</div>
           <div class="calendar-days">${'<span aria-hidden="true"></span>'.repeat(first)}${cells}</div>
           <div class="calendar-footer"><button type="button" class="edf-clear">Clear</button><button type="button" class="edf-close">Close</button></div>`;
      }
      function open() {
        closeAll(wrap);
        visible = input.value ? new Date(input.value + "T12:00:00") : visible;
        render();
        calendar.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
        trigger.classList.add("is-open");
        $(".calendar-day[tabindex='0']", calendar)?.focus({ preventScroll: true });
      }
      function close(focusTrigger) {
        calendar.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        trigger.classList.remove("is-open");
        if (focusTrigger) trigger.focus();
      }
      wrap._closeDateField = () => close(false);
      trigger.onclick = () => (calendar.hidden ? open() : close(true));
      calendar.addEventListener("change", (e) => {
        const month = $("[data-edf-month]", calendar);
        const year = $("[data-edf-year]", calendar);
        if (e.target !== month && e.target !== year) return;
        visible = new Date(Number(year.value), Number(month.value), 1, 12);
        render();
        $("[data-edf-" + (e.target === month ? "month" : "year") + "]", calendar).focus();
      });
      calendar.addEventListener("click", (e) => {
        const day = e.target.closest("[data-edf-date]");
        const step = e.target.closest("[data-edf-step]");
        if (day) {
          input.value = day.dataset.edfDate;
          input.dispatchEvent(new Event("change", { bubbles: true }));
          showValue();
          close(true);
        } else if (step) {
          visible = new Date(visible.getFullYear(), visible.getMonth() + Number(step.dataset.edfStep), 1, 12);
          render();
          $(`[data-edf-step="${step.dataset.edfStep}"]`, calendar)?.focus();
        } else if (e.target.closest(".edf-clear")) {
          input.value = "";
          input.dispatchEvent(new Event("change", { bubbles: true }));
          showValue();
          render();
        } else if (e.target.closest(".edf-close")) close(true);
      });
      calendar.addEventListener("keydown", (e) => {
        const day = e.target.closest("[data-edf-date]");
        if (e.key === "Escape") return close(true);
        const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        if (!day || !(e.key in offsets)) return;
        e.preventDefault();
        const d = new Date(day.dataset.edfDate + "T12:00:00");
        d.setDate(d.getDate() + offsets[e.key]);
        if (d > maxDate) return;
        visible = new Date(d.getFullYear(), d.getMonth(), 1, 12);
        render(localValue(d));
        $(`[data-edf-date="${localValue(d)}"]`, calendar)?.focus();
      });
      showValue();
      input.addEventListener("invalid", () => {
        trigger.classList.add("is-invalid");
        trigger.focus();
      });
      input.addEventListener("change", () => trigger.classList.remove("is-invalid"));
    });

    function closeAll(except) {
      $$(".edf").forEach((wrap) => {
        if (wrap !== except) wrap._closeDateField?.();
      });
    }
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".edf")) closeAll(null);
    });
  }
  setupDateFields();
  return {
    submit(form) {
      const p = $('[name="password"]', form),
        confirm = $('[name="confirmPassword"]', form);
      if (p.value !== confirm.value) {
        formError(form, "Passwords do not match.");
        confirm.focus();
        return;
      }
      markSaved();
      store.set("session", {
        email: $('[name="email"]', form).value,
        name: [$('[name="firstName"]', form)?.value, $('[name="lastName"]', form)?.value].filter(Boolean).join(" "),
      });
      navigateTo("index");
    },
  };
};
