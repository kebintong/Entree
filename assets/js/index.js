/* Scripts for pages/index.html (the home page).
   Loaded before app.js; app.js runs this once the page is ready and passes in the
   shared helpers (see "Shared with the page scripts" in app.js). */
window.ENTREE_PAGES = window.ENTREE_PAGES || {};
window.ENTREE_PAGES["index"] = (E) => {
  const { $, $$, page, data, markSaved, allText, notice, action, booking } = E;
  let hasManualDateChange = false;
  let hasManualCounterChange = false;
  setupHome();
  function setupHome() {
    for (const [label, options] of Object.entries({
      "Travel Type": ["Round Trip", "One Way"],
      "Shipping Line": ["Supercat", "OceanJet", "FastCat"],
      "Cabin Type": ["Private Room", "Business Class", "Economy"],
    })) {
      const heading = allText(label)[0],
        box = heading?.nextElementSibling;
      if (!box || box.querySelector("select") || heading.closest(".custom-dropdown-wrap")) continue;
      box.innerHTML = `<select class="plain-select" aria-label="${label}">${options.map((o) => `<option>${o}</option>`).join("")}</select>`;
    }

    // Wire up origin & destination
    const origin = $("#origin") || allText("From")[0];
    if (origin && origin.tagName !== "INPUT") {
      const input = document.createElement("input");
      input.placeholder = "From";
      input.setAttribute("aria-label", "From");
      input.className = origin.className + " plain-select";
      input.id = "origin";
      origin.replaceWith(input);
    }
    const destination = $("#destination") || $('input[placeholder="To"]');
    if (destination) {
      destination.setAttribute("aria-label", "To");
      destination.id = "destination";
      const clear = destination
        .closest(".hero-sub-glass, div")
        ?.parentElement
        ?.querySelector("button.clear-btn, button[aria-label='Clear destination']") ||
        destination.closest(".hero-sub-glass")?.querySelector("button.clear-btn") ||
        $("button.clear-btn");
      if (clear) {
        clear.setAttribute("aria-label", "Clear destination");
        clear.onclick = (e) => {
          e.preventDefault();
          destination.value = "";
          destination.focus();
        };
      }
    }

    // Wire up swap button
    const swap = $("[data-action='swap']") || $("div.absolute.right-0.top-1\\/2");
    if (swap) action(swap, "swap");

    // Wire up travel type pills
    const travelTypeSelect = $('select[aria-label="Travel Type"]');
    const pills = $$(".travel-type-pill");
    function updateTravelTypeUI(val) {
      closeDatePicker();
      const dates = $$(".dates-input-group [data-date], [data-date]");
      if (dates[1]) {
        dates[1].classList.toggle("date-field-disabled", val === "One Way");
        dates[1].setAttribute("aria-disabled", String(val === "One Way"));
        dates[1].tabIndex = val === "One Way" ? -1 : 0;
      }
      pills.forEach((p) => {
        const isActive = p.dataset.travelType === val;
        p.classList.toggle("is-active", isActive);
        p.setAttribute("aria-selected", String(isActive));
      });
      if (travelTypeSelect && travelTypeSelect.value !== val) {
        travelTypeSelect.value = val;
        travelTypeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    pills.forEach((pill) => {
      pill.onclick = () => {
        updateTravelTypeUI(pill.dataset.travelType);
      };
    });

    if (travelTypeSelect) {
      travelTypeSelect.onchange = (e) => {
        updateTravelTypeUI(e.target.value);
      };
    }

    // Setup Custom Dropdown Lists for Line and Cabin
    const dropdownWraps = $$(".custom-dropdown-wrap");
    dropdownWraps.forEach((wrap) => {
      const trigger = wrap.querySelector(".custom-dropdown-trigger");
      const menu = wrap.querySelector(".custom-dropdown-menu");
      const valEl = wrap.querySelector(".dropdown-value");
      const hiddenSelect = wrap.querySelector("select");
      const options = wrap.querySelectorAll(".dropdown-option");

      if (!trigger || !menu) return;

      function openMenu() {
        closeDatePicker();
        dropdownWraps.forEach((w) => {
          if (w !== wrap) {
            w.querySelector(".custom-dropdown-trigger")?.classList.remove("is-open");
            w.querySelector(".custom-dropdown-trigger")?.setAttribute("aria-expanded", "false");
            w.querySelector(".custom-dropdown-menu")?.classList.remove("is-open");
          }
        });
        trigger.classList.add("is-open");
        trigger.setAttribute("aria-expanded", "true");
        menu.classList.add("is-open");
      }

      function closeMenu() {
        trigger.classList.remove("is-open");
        trigger.setAttribute("aria-expanded", "false");
        menu.classList.remove("is-open");
      }

      trigger.onclick = (e) => {
        e.stopPropagation();
        const isOpen = menu.classList.contains("is-open");
        if (isOpen) closeMenu();
        else openMenu();
      };
      trigger.onkeydown = (event) => {
        if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
        event.preventDefault();
        openMenu();
        (event.key === "ArrowUp" ? options[options.length - 1] : options[0])?.focus();
      };
      wrap.addEventListener("focusout", event => {
        if (!wrap.contains(event.relatedTarget)) closeMenu();
      });
      menu.addEventListener("keydown", event => {
        const index = [...options].indexOf(document.activeElement);
        if (event.key === "Escape") { event.preventDefault(); closeMenu(); trigger.focus(); }
        else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
          options[next]?.focus();
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          options[index]?.click();
          trigger.focus();
        }
      });

      options.forEach((opt) => {
        opt.tabIndex = -1;
        opt.onclick = (e) => {
          e.stopPropagation();
          const val = opt.dataset.value;
          if (valEl) valEl.textContent = val;

          options.forEach((o) => {
            const isMatch = o === opt;
            o.classList.toggle("is-active", isMatch);
            o.setAttribute("aria-selected", String(isMatch));
          });

          if (hiddenSelect) {
            hiddenSelect.value = val;
            hiddenSelect.dispatchEvent(new Event("change", { bubbles: true }));
          }

          closeMenu();

          // Tactile feedback bounce on trigger
          trigger.classList.remove("is-selected-pop");
          void trigger.offsetWidth;
          trigger.classList.add("is-selected-pop");
        };
      });
    });

    // Close custom dropdowns on outside click or Escape key
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".custom-dropdown-wrap")) {
        dropdownWraps.forEach((w) => {
          w.querySelector(".custom-dropdown-trigger")?.classList.remove("is-open");
          w.querySelector(".custom-dropdown-trigger")?.setAttribute("aria-expanded", "false");
          w.querySelector(".custom-dropdown-menu")?.classList.remove("is-open");
        });
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        dropdownWraps.forEach((w) => {
          w.querySelector(".custom-dropdown-trigger")?.classList.remove("is-open");
          w.querySelector(".custom-dropdown-trigger")?.setAttribute("aria-expanded", "false");
          w.querySelector(".custom-dropdown-menu")?.classList.remove("is-open");
        });
      }
    });

    // Wire up date pickers
    const today = new Date();
    function setCardDate(card, value) {
      card.dataset.date = value;
      const textEl = card.querySelector(".input-val-text") || card;
      textEl.textContent = new Date(value + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    }
    const dateCards = $$(".dates-input-group [data-date]");
    const targetCards = dateCards.length ? dateCards : $$("[data-date]");
    const calendar = document.createElement("div");
    calendar.className = "booking-calendar";
    calendar.id = "booking-calendar";
    calendar.hidden = true;
    calendar.setAttribute("role", "dialog");
    calendar.setAttribute("aria-label", "Choose travel date");
    $(".dates-input-group").append(calendar);
    let activeDateCard = null;
    let visibleMonth;

    function localDateValue(date) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }

    function closeDatePicker(restoreFocus = false) {
      if (!activeDateCard) return;
      const trigger = activeDateCard;
      trigger.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
      calendar.hidden = true;
      activeDateCard = null;
      if (restoreFocus) trigger.focus();
    }

    // Earliest selectable day: today for departure, the departure day for return.
    function minDate(card = activeDateCard) {
      // Today, or tomorrow once every sailing for today has left.
      const todayValue = window.ENTREE_BOOKING?.firstBookableDate?.() || localDateValue(new Date());
      const departure = targetCards[0]?.dataset.date;
      return card !== targetCards[0] && departure > todayValue ? departure : todayValue;
    }

    function selectDate(value) {
      if (value < minDate()) return;
      const card = activeDateCard;
      setCardDate(card, value);
      // Keep the return date on or after a newly chosen departure date.
      if (card === targetCards[0] && targetCards[1] && targetCards[1].dataset.date < value) setCardDate(targetCards[1], value);
      hasManualDateChange = true;
      closeDatePicker(true);
    }

    function renderCalendar(focusValue) {
      const year = visibleMonth.getFullYear();
      const month = visibleMonth.getMonth();
      const firstDay = new Date(year, month, 1, 12).getDay();
      const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
      const monthLabel = visibleMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      const selected = activeDateCard.dataset.date;
      const min = minDate();
      const monthStart = localDateValue(new Date(year, month, 1, 12));
      let focusDay = focusValue || (selected.startsWith(monthStart.slice(0, 7)) ? selected : monthStart);
      if (focusDay < min) focusDay = min.slice(0, 7) === monthStart.slice(0, 7) ? min : monthStart;
      const atEarliestMonth = monthStart.slice(0, 7) <= min.slice(0, 7);
      const days = Array.from({ length: daysInMonth }, (_, i) => {
        const date = new Date(year, month, i + 1, 12);
        const value = localDateValue(date);
        const label = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
        const past = value < min;
        return `<button type="button" class="calendar-day${value === selected ? " is-selected" : ""}" data-calendar-date="${value}" aria-label="${label}" aria-pressed="${value === selected}"${value === localDateValue(new Date()) ? ' aria-current="date"' : ''}${past ? " disabled" : ""} tabindex="${value === focusDay && !past ? 0 : -1}">${i + 1}</button>`;
      }).join("");
      calendar.innerHTML = `<div class="calendar-heading"><button type="button" class="calendar-nav" data-month-step="-1" aria-label="Previous month"${atEarliestMonth ? " disabled" : ""}>&#8249;</button><span aria-live="polite">${monthLabel}</span><button type="button" class="calendar-nav" data-month-step="1" aria-label="Next month">&#8250;</button></div><div class="calendar-weekdays" aria-hidden="true">${["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(day => `<span>${day}</span>`).join("")}</div><div class="calendar-days">${'<span aria-hidden="true"></span>'.repeat(firstDay)}${days}</div><div class="calendar-footer"><button type="button" class="calendar-today">${min === localDateValue(new Date()) ? "Today" : "Earliest"}</button><button type="button" class="calendar-close">Close</button></div>`;
    }

    calendar.onclick = (event) => {
      const day = event.target.closest("[data-calendar-date]");
      const nav = event.target.closest("[data-month-step]");
      if (day) selectDate(day.dataset.calendarDate);
      else if (nav) {
        const step = Number(nav.dataset.monthStep);
        visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + step, 1, 12);
        renderCalendar();
        const navButton = calendar.querySelector(`[data-month-step="${step}"]`);
        (navButton.disabled ? calendar.querySelector('[data-month-step="1"]') : navButton).focus();
      } else if (event.target.closest(".calendar-today")) selectDate(minDate());
      else if (event.target.closest(".calendar-close")) closeDatePicker(true);
    };

    calendar.onkeydown = (event) => {
      const day = event.target.closest("[data-calendar-date]");
      if (!day) return;
      const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      if (!(event.key in offsets)) return;
      event.preventDefault();
      const date = new Date(day.dataset.calendarDate + "T12:00:00");
      date.setDate(date.getDate() + offsets[event.key]);
      if (localDateValue(date) < minDate()) return;
      const value = localDateValue(date);
      visibleMonth = new Date(date.getFullYear(), date.getMonth(), 1, 12);
      renderCalendar(value);
      calendar.querySelector(`[data-calendar-date="${value}"]`).focus();
    };

    document.addEventListener("click", (event) => {
      // Use the click's original path: re-rendering the month removes the clicked arrow from the DOM.
      const path = event.composedPath();
      if (activeDateCard && !path.includes(calendar) && !path.includes(activeDateCard)) closeDatePicker();
    });
    document.addEventListener("focusin", (event) => {
      if (activeDateCard && !calendar.contains(event.target) && !activeDateCard.contains(event.target)) closeDatePicker();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && activeDateCard) {
        event.preventDefault();
        closeDatePicker(true);
      }
    });
    targetCards.forEach((card, idx) => {
      const isDeparture = idx === 0 || (card.getAttribute("aria-label") && card.getAttribute("aria-label").toLowerCase().includes("departure"));
      const labelText = isDeparture ? "Departure date" : "Return date";
      // Use local calendar dates so defaults stay current in the visitor's timezone.
      const defaultDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (isDeparture ? 0 : 1), 12);
      const dateValue = localDateValue(defaultDate);
      setCardDate(card, dateValue);
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", labelText);
      card.setAttribute("aria-haspopup", "dialog");
      card.setAttribute("aria-expanded", "false");
      card.setAttribute("aria-controls", calendar.id);
      card.classList.add("date-picker-trigger");
      card.insertAdjacentHTML("beforeend", '<svg class="date-picker-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>');
      card.onclick = () => {
        if (card.classList.contains("date-field-disabled")) return;
        const wasOpen = activeDateCard === card;
        closeDatePicker();
        if (wasOpen) return;
        dropdownWraps.forEach((wrap) => {
          wrap.querySelector(".custom-dropdown-trigger")?.classList.remove("is-open");
          wrap.querySelector(".custom-dropdown-trigger")?.setAttribute("aria-expanded", "false");
          wrap.querySelector(".custom-dropdown-menu")?.classList.remove("is-open");
        });
        activeDateCard = card;
        const selected = new Date(card.dataset.date + "T12:00:00");
        visibleMonth = new Date(selected.getFullYear(), selected.getMonth(), 1, 12);
        calendar.classList.toggle("is-return", !isDeparture);
        calendar.setAttribute("aria-label", labelText);
        renderCalendar();
        calendar.hidden = false;
        card.classList.add("is-open");
        card.setAttribute("aria-expanded", "true");
        (calendar.querySelector('[tabindex="0"]') || calendar.querySelector(".calendar-day:not(:disabled)"))?.focus();
      };
      card.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          card.click();
        }
      };
    });
  }

  // ==========================================================================
  // Phones / tablets (anything that isn't the desktop view): the booking card is
  // a bottom sheet. Collapsed ("peek") it shows only the header and trip type;
  // "More", a tap anywhere on the sheet, or a swipe up expands the whole form.
  // Keep MOBILE_QUERY in sync with the media query in assets/css/index.css.
  // ==========================================================================
  const MOBILE_QUERY = "(max-width: 1024px), (hover: none) and (pointer: coarse)";
  const tripSheet = (() => {
    const card = $(".hero-glass-card");
    const head = $(".m-sheet-head");
    const toggle = $(".m-sheet-toggle");
    const backdrop = $(".m-sheet-backdrop");
    if (page !== "index" || !card || !head || !toggle || !backdrop) return null;
    const mq = window.matchMedia ? window.matchMedia(MOBILE_QUERY) : { matches: false };
    const isMobile = () => Boolean(mq.matches);
    const root = document.documentElement;
    let open = false;
    let returnFocus = null;
    const shortDate = (value) =>
      value ? new Date(value + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";
    // One-line summary under the sheet title (dates + passengers).
    function summarize() {
      const oneWay = $('select[aria-label="Travel Type"]')?.value === "One Way";
      const cards = $$(".dates-input-group [data-date]");
      const dep = cards[0]?.dataset.date;
      const ret = cards[1]?.dataset.date;
      const pax = Number($('[data-counter-type="passengers"] .pax-count')?.textContent || 0);
      const dates = dep ? (oneWay || !ret ? shortDate(dep) : `${shortDate(dep)} – ${shortDate(ret)}`) : "Choose dates";
      const sub = $(".m-sheet-sub", card);
      if (sub) sub.textContent = `${dates} · ${pax ? `${pax} passenger${pax === 1 ? "" : "s"}` : "Add passengers"}`;
    }
    // Collapsed height = header + the Round Trip / One Way switch.
    function measurePeek() {
      if (!isMobile()) return;
      const to = $(".travel-type-container", card);
      if (!to) return;
      const wasOpen = card.classList.contains("is-sheet-open");
      if (wasOpen) card.classList.remove("is-sheet-open");
      const prevTransition = card.style.transition;
      card.style.transition = "none";
      card.style.maxHeight = "none";
      const scroll = card.scrollTop;
      card.scrollTop = 0;
      const height = Math.ceil(to.getBoundingClientRect().bottom - card.getBoundingClientRect().top + 14);
      card.style.maxHeight = "";
      card.scrollTop = scroll;
      if (wasOpen) card.classList.add("is-sheet-open");
      void card.offsetHeight;
      card.style.transition = prevTransition;
      // Never let the collapsed sheet take more than ~55% of the screen.
      const cap = Math.round(window.innerHeight * 0.55);
      root.style.setProperty("--m-peek-h", `${Math.max(120, Math.min(height, cap))}px`);
    }
    // Some Android browsers, device frames and phone simulators report a
    // viewport taller than what's actually on screen, so a sheet docked at
    // bottom: 0 gets its lower part cut off. A full-height invisible probe +
    // IntersectionObserver (which honours clipping by parent frames) tells us
    // where the screen visibly ends; the sheet docks there instead.
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:fixed;top:0;bottom:0;left:50%;width:1px;pointer-events:none;visibility:hidden;z-index:-1;";
    document.body.appendChild(probe);
    let hiddenBottom = 0;
    function applyHiddenBottom(px) {
      const cap = Math.round(window.innerHeight * 0.25);
      const next = isMobile() ? Math.max(0, Math.min(Math.round(px), cap)) : 0;
      if (next === hiddenBottom) return;
      hiddenBottom = next;
      root.style.setProperty("--m-sheet-bottom", `${next}px`);
    }
    const thresholds = Array.from({ length: 201 }, (_, i) => i / 200);
    const probeIO = "IntersectionObserver" in window
      ? new IntersectionObserver((entries) => {
          const e = entries[entries.length - 1];
          if (!e) return;
          const box = e.boundingClientRect;
          const seen = e.intersectionRect;
          // Only a clip at the bottom counts (the probe's top stays on screen).
          if (!e.isIntersecting || seen.height <= 0) return applyHiddenBottom(0);
          applyHiddenBottom(box.bottom - seen.bottom);
        }, { threshold: thresholds })
      : null;
    function remeasureVisibleBottom() {
      if (!probeIO) return;
      probeIO.unobserve(probe);
      probeIO.observe(probe); // observe() always reports the current state once
    }
    remeasureVisibleBottom();
    function setOpen(next, { restoreFocus = true, focusSheet = true } = {}) {
      if (next === open) return;
      open = next;
      card.classList.toggle("is-sheet-open", open);
      backdrop.hidden = !open;
      backdrop.classList.toggle("is-open", open);
      document.body.classList.toggle("m-sheet-lock", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Collapse trip planner" : "Show all trip options");
      $(".m-sheet-toggle-label", toggle).textContent = open ? "Less" : "More";
      if (open) {
        card.setAttribute("role", "dialog");
        card.setAttribute("aria-modal", "true");
        card.setAttribute("aria-labelledby", "booking-sheet-title");
        returnFocus = document.activeElement;
        if (focusSheet) toggle.focus({ preventScroll: true });
      } else {
        card.removeAttribute("role");
        card.removeAttribute("aria-modal");
        card.removeAttribute("aria-labelledby");
        card.scrollTop = 0;
        summarize();
        if (restoreFocus && card.contains(document.activeElement)) document.activeElement.blur();
        if (restoreFocus && returnFocus?.isConnected && !card.contains(returnFocus) && returnFocus !== document.body) returnFocus.focus({ preventScroll: true });
      }
      document.dispatchEvent(new CustomEvent("entree:trip-sheet", { detail: { open } }));
    }
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      setOpen(!open);
    });
    // Tapping anywhere on the collapsed sheet (header, trip type, the white
    // space) opens the planner. A tap on Round Trip / One Way still picks it.
    card.addEventListener("click", (event) => {
      if (open || !isMobile() || toggle.contains(event.target)) return;
      setOpen(true);
    });
    // Swipe up on the collapsed sheet to expand; swipe down on the header to collapse.
    let startY = null;
    let startedOnHead = false;
    card.addEventListener("touchstart", (e) => {
      startY = e.touches[0].clientY;
      startedOnHead = head.contains(e.target);
    }, { passive: true });
    card.addEventListener("touchend", (e) => {
      if (startY === null) return;
      const dy = e.changedTouches[0].clientY - startY;
      startY = null;
      if (dy < -30 && !open) setOpen(true);
      else if (dy > 30 && open && startedOnHead) setOpen(false);
    }, { passive: true });
    // Typing into a field (e.g. From/To while collapsed) expands the sheet so the keyboard has room.
    card.addEventListener("focusin", (event) => {
      if (!open && isMobile() && event.target.matches("input, select, textarea")) setOpen(true, { focusSheet: false });
    });
    backdrop.addEventListener("click", () => setOpen(false));
    document.addEventListener("keydown", (event) => {
      // The date picker and dropdowns handle Escape first (they call preventDefault).
      if (event.key === "Escape" && open && !event.defaultPrevented && !$("dialog[open]")) setOpen(false);
    });
    card.addEventListener("input", summarize);
    card.addEventListener("change", summarize);
    card.addEventListener("click", () => requestAnimationFrame(summarize));
    const onViewportChange = () => {
      if (!isMobile()) setOpen(false, { restoreFocus: false });
      measurePeek();
    };
    if (mq.addEventListener) mq.addEventListener("change", onViewportChange);
    else mq.addListener?.(onViewportChange);
    window.addEventListener("resize", () => requestAnimationFrame(() => {
      measurePeek();
      remeasureVisibleBottom();
    }));
    window.visualViewport?.addEventListener("resize", remeasureVisibleBottom);
    window.addEventListener("load", measurePeek);
    document.fonts?.ready?.then(measurePeek);
    // The saved search is restored by booking-flow.js, which runs after this file.
    document.addEventListener("DOMContentLoaded", () => {
      summarize();
      measurePeek();
    });
    summarize();
    measurePeek();
    return { isMobile, isOpen: () => open, open: () => setOpen(true), close: () => setOpen(false) };
  })();
  return {
    tripSheet,
    // Edited trip dates or passenger counts count as unsaved changes.
    isDirty: () => hasManualDateChange || hasManualCounterChange,
    onDraftRestored() {
      hasManualDateChange = false;
      hasManualCounterChange = false;
    },
    onCounter() {
      hasManualCounterChange = true;
    },
    // "Search ferries": a round trip can't come back before it leaves.
    beforeGo(arg) {
      if (arg !== "trips") return;
      const dates = $$("[data-date]");
      if (
        $('select[aria-label="Travel Type"]').value === "Round Trip" &&
        dates[1].dataset.date < dates[0].dataset.date
      ) {
        notice("Return date must be on or after departure.");
        return;
      }
      markSaved();
    },
    actions: {
      swap() {
        const a = $("#origin"),
          b = $("#destination");
        if (a && b) {
          [a.value, b.value] = [b.value, a.value];
          a.dispatchEvent(new Event("input", { bubbles: true }));
          b.dispatchEvent(new Event("input", { bubbles: true }));
        }
      },
    },
  };
};
