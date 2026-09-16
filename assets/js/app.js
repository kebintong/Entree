/* Entree: native DOM events only. No framework or build step is needed. */
(() => {
  "use strict";
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const page = document.body.dataset.page;
  const data = window.ENTREE_DATA;
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const store = {
    get(key, fallback = null) {
      try {
        return JSON.parse(localStorage.getItem("entree." + key)) ?? fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem("entree." + key, JSON.stringify(value));
      } catch {
        /* File mode and private browsing can disable storage. */
      }
    },
  };
  const go = (name, id) => {
    location.href = `${name}.html${id ? "?id=" + encodeURIComponent(id) : ""}`;
  };
  const text = (el) => el.textContent.trim().replace(/\s+/g, " ");
  const allText = (value, root = document) =>
    $$("button,a,span,p,div,label,h1,h2,h3", root).filter(
      (el) => text(el) === value && ![...el.children].some((child) => text(child) === value),
    );
  function notice(message) {
    $(".notice")?.remove();
    const node = document.createElement("div");
    node.className = "notice";
    node.setAttribute("role", "status");
    node.textContent = message;
    document.body.append(node);
    setTimeout(() => node.remove(), 5000);
  }
  function dialog(title, content) {
    $("dialog")?.remove();
    const el = document.createElement("dialog");
    el.innerHTML = `<button class="dialog-close" aria-label="Close dialog">×</button><h2>${escape(title)}</h2>${content}`;
    document.body.append(el);
    $(".dialog-close", el).onclick = () => el.close();
    el.addEventListener("click", (event) => {
      if (event.target === el) {
        const r = el.getBoundingClientRect();
        if (
          event.clientX < r.left ||
          event.clientX > r.right ||
          event.clientY < r.top ||
          event.clientY > r.bottom
        )
          el.close();
      }
    });
    el.showModal();
    return el;
  }
  function enable(el) {
    if (el) {
      el.disabled = false;
      el.classList.add("primary-action");
    }
  }
  function action(el, name) {
    if (!el) return;
    el.dataset.action = name;
    if (!["BUTTON", "A", "INPUT"].includes(el.tagName)) {
      el.tabIndex = 0;
      el.setAttribute("role", "button");
    }
  }
  const selectedId = new URLSearchParams(location.search).get("id") || "1";
  const booking = () =>
    data.MOCK_BOOKINGS.find((b) => b.id === selectedId) || data.MOCK_BOOKINGS[0];
  let selectedPayment = null,
    selectedFerry = null;
  let cart = store
    .get("cart", [])
    .filter((row) => Number.isInteger(row.quantity) && row.quantity > 0);
  let currentMonth = new Date();

  // Label native form controls, retaining the original visual markup.
  $$("input,select,textarea").forEach((input, i) => {
    input.id ||= "field-" + i;
    const parent = input.closest("label") || input.parentElement.parentElement;
    const label = $("label", parent);
    if (label && !label.htmlFor) label.htmlFor = input.id;
    if (!input.getAttribute("aria-label") && !label)
      input.setAttribute("aria-label", input.placeholder || input.name || "Option");
  });
  $$("[data-action]").forEach((el) => action(el, el.dataset.action));
  $$("button").forEach((el) => {
    if (!text(el) && !el.getAttribute("aria-label"))
      el.setAttribute("aria-label", el.dataset.action === "back" ? "Go back" : "Select option");
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches('[role="button"][data-action]')) {
      e.preventDefault();
      e.target.click();
    }
  });

  // The source contains a mock session only. Never save passwords.
  if (store.get("session")) {
    const login = $('header [data-action="go:login"]');
    if (login) {
      login.innerHTML = "<span>My Account ▾</span>";
      action(login, "account");
    }
  }
  function accountMenu() {
    const existing = $(".user-menu");
    if (existing) {
      existing.remove();
      return;
    }
    const menu = document.createElement("nav");
    menu.className = "user-menu";
    menu.setAttribute("aria-label", "Account");
    menu.innerHTML =
      '<a href="index.html">Home</a><a href="bookings.html">My Bookings</a><a href="verify-booking.html">Buy Pasalubong</a><a href="travel-instructions.html">Travel Instructions</a><a href="settings.html">Settings</a><button data-action="logout">Log out</button>';
    $("header").append(menu);
  }
  function formError(form, message) {
    $(".form-error", form)?.remove();
    const el = document.createElement("p");
    el.className = "form-error";
    el.setAttribute("role", "alert");
    el.textContent = message;
    form.prepend(el);
  }
  $$("form").forEach((form) => {
    $$('input:not([type="checkbox"])', form).forEach((input) => {
      input.required = true;
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      if (page === "login") {
        store.set("session", { email: $('input[type="email"]', form).value });
        go("index");
      } else if (page === "signup") {
        const p = $('[name="password"]', form),
          confirm = $('[name="confirmPassword"]', form);
        if (p.value !== confirm.value) {
          formError(form, "Passwords do not match.");
          confirm.focus();
          return;
        }
        store.set("session", { email: $('[name="email"]', form).value });
        go("index");
      } else if (page === "verify-booking") {
        const fields = $$("input", form);
        store.set("verification", {
          reference: fields[0].value.toUpperCase(),
          surname: fields[1].value,
        });
        go("pasalubong");
      }
    });
  });
  if (page === "login")
    $('a[href="#"]')?.addEventListener("click", (e) => {
      e.preventDefault();
      dialog(
        "Password recovery",
        "<p>This is a frontend demo. Password recovery requires a connected account service.</p>",
      );
    });
  if (page === "signup") {
    for (const title of ["Terms and Conditions", "Privacy Policy"])
      allText(title).forEach((el) => {
        el.tabIndex = 0;
        el.setAttribute("role", "button");
        el.onclick = () =>
          dialog(
            title,
            "<p>The original project does not include this document. Add your published policy before accepting registrations.</p>",
          );
        el.onkeydown = (e) => {
          if (e.key === "Enter") el.click();
        };
      });
  }

  if (page === "index") setupHome();
  function setupHome() {
    for (const [label, options] of Object.entries({
      "Travel Type": ["Round Trip", "One Way"],
      "Shipping Line": ["Supercat", "OceanJet", "FastCat"],
      "Cabin Type": ["Private Room", "Business Class", "Economy"],
    })) {
      const heading = allText(label)[0],
        box = heading?.nextElementSibling;
      if (!box) continue;
      box.innerHTML = `<select class="plain-select" aria-label="${label}">${options.map((o) => `<option>${o}</option>`).join("")}</select>`;
    }
    const origin = allText("From")[0];
    if (origin) {
      const input = document.createElement("input");
      input.placeholder = "From";
      input.setAttribute("aria-label", "From");
      input.className = origin.className + " plain-select";
      input.id = "origin";
      origin.replaceWith(input);
    }
    const destination = $('input[placeholder="To"]');
    destination.setAttribute("aria-label", "To");
    destination.id = "destination";
    const clear = destination
      .closest("div.flex.items-center.justify-between")
      ?.querySelector("button");
    if (clear) {
      clear.setAttribute("aria-label", "Clear destination");
      clear.onclick = () => {
        destination.value = "";
        destination.focus();
      };
    }
    const swap = $("div.absolute.right-0.top-1\\/2");
    if (swap) action(swap, "swap");
    for (const [label, value] of [
      ["Wed, Oct 30", "2024-10-30"],
      ["Mon, Nov 4", "2024-11-04"],
    ]) {
      const el = allText(label)[0];
      if (!el) continue;
      el.dataset.date = value;
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", (label.startsWith("Wed") ? "Departure" : "Return") + " date");
      el.onclick = () => {
        const d = dialog(
          el.getAttribute("aria-label"),
          `<label>Choose date <input type="date" value="${el.dataset.date}" required></label><button class="dialog-action">Apply</button>`,
        );
        $(".dialog-action", d).onclick = () => {
          const input = $("input", d);
          if (!input.reportValidity()) return;
          el.dataset.date = input.value;
          el.textContent = new Date(input.value + "T12:00:00").toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          });
          d.close();
        };
      };
      el.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          el.click();
        }
      };
    }
    $('select[aria-label="Travel Type"]').onchange = (e) => {
      const dates = $$("[data-date]");
      dates[1].style.opacity = e.target.value === "One Way" ? "0.3" : "1";
      dates[1].style.pointerEvents = e.target.value === "One Way" ? "none" : "";
    };
  }

  // Figma-exported booking screens contain text-shaped controls.
  if (page === "trips") {
    for (const label of ["Passenger details", "Passenger Details"])
      allText(label).forEach((el) => action(el, "go:passenger-details"));
  }
  if (page === "passenger-details")
    allText("Proceed to payment").forEach((el) => action(el, "go:payment"));
  if (page === "confirmation") {
    for (const label of ["Explore options", "Book again", "Book another trip"])
      allText(label).forEach((el) => action(el, "go:index"));
  }
  if (page === "payment") {
    const info = $("main .bg-blue-50 p");
    if (info)
      info.textContent =
        "Demo payment only. No money is charged and no payment details are collected.";
  }

  function showBooking(id, share = false) {
    const b = data.MOCK_BOOKINGS.find((item) => item.id === id);
    if (!b) return;
    const d = dialog(
      share ? "Share Trip" : b.reference,
      `<p><strong>${escape(b.route.origin)} → ${escape(b.route.destination)}</strong></p><p>${escape(b.ferry)} · ${escape(b.departureDate)} · ${escape(b.departureTime)}</p><p>${b.passengers} passengers · ₱${b.totalPrice.toFixed(2)}</p><p>${b.passengerDetails.map((p) => escape(p.name)).join("<br>")}</p><p>Sample booking for demonstration.</p><button class="dialog-action" data-action="print">Print</button>${share ? '<button class="dialog-action" data-action="copy-trip">Copy details</button>' : `<a class="dialog-action" href="rebook.html?id=${b.id}">Rebook</a><a class="dialog-action" href="refund.html?id=${b.id}">Refund</a>`}`,
    );
    d.dataset.booking = id;
  }
  function renderCalendar() {
    const previous = $('[data-action="month:-1"]');
    if (!previous) return;
    const heading = previous.parentElement;
    $("h3", heading).textContent = currentMonth.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
    const grid = heading.nextElementSibling;
    grid.innerHTML = "";
    const year = currentMonth.getFullYear(),
      month = currentMonth.getMonth();
    for (const day of ["S", "M", "T", "W", "T", "F", "S"])
      grid.insertAdjacentHTML("beforeend", `<div class="text-center text-[11px]">${day}</div>`);
    for (let i = 0; i < new Date(year, month, 1).getDay(); i++)
      grid.append(document.createElement("div"));
    for (let day = 1; day <= new Date(year, month + 1, 0).getDate(); day++) {
      const date = new Date(year, month, day);
      const highlighted = data.MOCK_BOOKINGS.some(
        (b) =>
          date >= new Date(b.departureDate + "T00:00:00") &&
          date <= new Date((b.returnDate || b.departureDate) + "T23:59:59"),
      );
      grid.insertAdjacentHTML(
        "beforeend",
        `<div class="aspect-square flex items-center justify-center rounded text-[11px]" style="background:${highlighted ? "#ccff00" : "transparent"}">${day}</div>`,
      );
    }
  }
  if (page === "bookings") renderCalendar();

  function renderCart() {
    const heading = allText("Your Add-ons")[0];
    const container =
      $("#vanilla-cart") ||
      (() => {
        const el = document.createElement("div");
        el.id = "vanilla-cart";
        const sidebar = heading?.parentElement.parentElement;
        if (sidebar) {
          sidebar.append(el);
        } else {
          $("main").append(el);
        }
        return el;
      })();
    const empty = heading?.parentElement.nextElementSibling;
    if (empty && empty.id !== "vanilla-cart") empty.hidden = cart.length > 0;
    const total = cart.reduce((sum, row) => sum + row.price * row.quantity, 0);
    container.innerHTML =
      cart
        .map(
          (row) =>
            `<div class="cart-row"><div class="description"><strong>${escape(row.name)}</strong><br>$${row.price.toFixed(2)}</div><button aria-label="Decrease ${escape(row.name)}" data-action="cart:${row.id}:-1">−</button><span>${row.quantity}</span><button aria-label="Increase ${escape(row.name)}" data-action="cart:${row.id}:1">+</button></div>`,
        )
        .join("") +
      (cart.length
        ? `<p class="mt-4 font-bold">Total: $${total.toFixed(2)}</p><button class="dialog-action" data-action="checkout">Proceed to Checkout</button>`
        : "");
    store.set("cart", cart);
  }
  function productMenu(id) {
    const product = data.PRODUCTS.find((p) => p.id === Number(id));
    if (!product) return;
    const d = dialog(
      product.merchant,
      `<p>${escape(product.description)}</p>${product.menu.map((item) => `<div class="cart-row"><div class="description">${escape(item.name)}<br>$${item.price.toFixed(2)}</div><button aria-label="Add ${escape(item.name)}" data-action="add-item:${product.id}:${item.id}">+</button></div>`).join("")}<button class="dialog-action" data-action="close-dialog">Done</button>`,
    );
  }
  if (page === "pasalubong") renderCart();

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
        ? '<p class="py-4">No sample schedules available in this date range. Try October 30, 2026.</p>'
        : "");
  }
  if (page === "rebook") {
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
    $('input[type="date"]').addEventListener("change", schedules);
    $$('input[type="checkbox"]').forEach((input) =>
      input.addEventListener("change", () => {
        input.closest("label").style.borderColor = input.checked ? "#ccff00" : "#e5e7eb";
        input.closest("label").style.backgroundColor = input.checked ? "#ccff001a" : "white";
        updatePassengers();
      }),
    );
    updatePassengers();
  }
  if (page === "rebook" || page === "refund") {
    const b = booking();
    const fields = {
      "ENT-2026-001234": b.reference,
      "Cebu → Tagbilaran, Bohol": `${b.route.origin} → ${b.route.destination}`,
      Supercat: b.ferry,
      "Wed, Oct 30, 2026": new Date(b.departureDate + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      "09:00 AM - 11:30 AM": `${b.departureTime} - ${b.arrivalTime}`,
      "2 passengers": `${b.passengers} passengers`,
      "₱4359.80": `₱${b.totalPrice.toFixed(2)}`,
      "We'll show Supercat trips for 1 week starting from this date": `We'll show ${b.ferry} trips for 1 week starting from this date`,
    };
    for (const [old, value] of Object.entries(fields))
      allText(old, $("main")).forEach((el) => (el.textContent = value));
  }
  if (page === "settings") {
    const preferences = store.get("preferences", {});
    $$('main input[type="checkbox"],main select').forEach((input, i) => {
      if (i in preferences) {
        if (input.type === "checkbox") input.checked = preferences[i];
        else input.value = preferences[i];
      }
      input.addEventListener("change", () => {
        preferences[i] = input.type === "checkbox" ? input.checked : input.value;
        store.set("preferences", preferences);
        notice("Preferences saved on this device.");
      });
    });
    allText("Add Payment Method").forEach((el) => action(el, "payment-info"));
    allText("Update Profile").forEach((el) => action(el, "profile"));
    allText("Change").forEach((el) => action(el, "password-info"));
    const email = $('input[type="email"]');
    if (email) email.value = store.get("session")?.email || "";
  }

  document.addEventListener("click", async (event) => {
    const el = event.target.closest("[data-action]");
    if (!el) {
      if (!event.target.closest(".user-menu")) $(".user-menu")?.remove();
      return;
    }
    if (el.disabled) return;
    const [name, arg, amount] = el.dataset.action.split(":");
    const id = el.closest("[data-booking]")?.dataset.booking || selectedId;
    event.preventDefault();
    if (name === "go") {
      if (page === "index" && arg === "trips") {
        const dates = $$("[data-date]");
        if (
          $('select[aria-label="Travel Type"]').value === "Round Trip" &&
          dates[1].dataset.date < dates[0].dataset.date
        ) {
          notice("Return date must be on or after departure.");
          return;
        }
        store.set("search", {
          origin: $("#origin").value,
          destination: $("#destination").value,
          dates: dates.map((d) => d.dataset.date),
        });
      }
      go(arg, ["rebook", "refund"].includes(arg) ? id : null);
    } else if (name === "back") {
      const parents = {
        login: "index",
        signup: "index",
        trips: "index",
        "passenger-details": "trips",
        payment: "passenger-details",
        confirmation: "payment",
        pasalubong: "verify-booking",
        rebook: "bookings",
        refund: "bookings",
      };
      go(parents[page] || "index");
    } else if (name === "counter") {
      const value = $("span", el.parentElement),
        minimum = arg === "passengers" ? 1 : 0;
      value.textContent = Math.max(minimum, Number(value.textContent) + Number(amount));
    } else if (name === "swap") {
      const a = $("#origin"),
        b = $("#destination");
      [a.value, b.value] = [b.value, a.value];
    } else if (name === "account") accountMenu();
    else if (name === "logout") {
      store.set("session", null);
      go("index");
    } else if (name === "payment") {
      selectedPayment = arg;
      $$('[data-action^="payment:"]').forEach((b) => {
        b.classList.toggle("selected-option", b === el);
        b.setAttribute("aria-pressed", String(b === el));
      });
      enable($('[data-action="complete-payment"]'));
    } else if (name === "complete-payment") {
      if (selectedPayment) {
        store.set("demoPayment", selectedPayment);
        go("confirmation");
      }
    } else if (name === "booking" || name === "share") showBooking(id, name === "share");
    else if (name === "addons")
      dialog(
        "Buy Add-ons",
        `<a class="dialog-action" href="verify-booking.html">Buy Pasalubong</a><p>Pet and vehicle add-ons require the booking service, which is not connected in this demo.</p>`,
      );
    else if (name === "print") window.print();
    else if (name === "copy-trip") {
      try {
        await navigator.clipboard.writeText($("dialog").innerText);
        notice("Trip details copied.");
      } catch {
        notice("Copy is unavailable here. Use Print to save the trip.");
      }
    } else if (name === "month") {
      currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + Number(arg), 1);
      renderCalendar();
    } else if (name === "product") productMenu(el.dataset.product);
    else if (name === "product-image") {
      const card = el.parentElement.parentElement;
      const button = $("[data-product]", card);
      const product = data.PRODUCTS.find((p) => p.id === Number(button.dataset.product));
      const index = (Number(el.dataset.index || 0) + 1) % product.images.length;
      el.dataset.index = index;
      el.parentElement.style.backgroundImage = `url("${product.images[index]}")`;
    } else if (name === "add-item") {
      const item = data.PRODUCTS.find((p) => p.id === Number(arg)).menu.find(
        (i) => i.id === Number(amount),
      );
      const row = cart.find((r) => r.id === item.id);
      if (row) row.quantity++;
      else cart.push({ ...item, quantity: 1 });
      renderCart();
      notice(item.name + " added.");
    } else if (name === "cart") {
      const row = cart.find((r) => r.id === Number(arg));
      if (row) {
        row.quantity += Number(amount);
        cart = cart.filter((r) => r.quantity > 0);
        renderCart();
      }
    } else if (name === "checkout")
      dialog(
        "Checkout",
        `<p>Total: $${cart.reduce((s, r) => s + r.price * r.quantity, 0).toFixed(2)}</p><p>Demo checkout — no charge will be made.</p><label>Payment method <select><option>GCash</option><option>Online Banking</option></select></label><button class="dialog-action" data-action="demo-order">Confirm demo order</button>`,
      );
    else if (name === "demo-order") {
      cart = [];
      renderCart();
      dialog(
        "Demo order complete",
        '<p>Your sample order is complete. No payment was taken.</p><a class="dialog-action" href="bookings.html">My Bookings</a>',
      );
    } else if (name === "close-dialog") $("dialog").close();
    else if (name === "select-passengers") {
      const boxes = $$('main input[type="checkbox"]'),
        checked = !boxes.every((b) => b.checked);
      boxes.forEach((b) => {
        b.checked = checked;
        b.dispatchEvent(new Event("change"));
      });
      el.textContent = checked ? "Deselect All" : "Select All";
    } else if (name === "schedule") {
      selectedFerry = data.AVAILABLE_FERRIES.find((f) => String(f.id) === arg);
      $$(".schedule").forEach((b) => b.classList.toggle("selected-option", b === el));
    } else if (name === "reschedule") {
      if (!selectedFerry) {
        notice("Please select a ferry schedule.");
        return;
      }
      if (!$$('main input[type="checkbox"]:checked').length) {
        notice("Please select at least one passenger.");
        return;
      }
      dialog(
        "Demo reschedule complete",
        '<p>This sample booking has been rescheduled for this demonstration. No live reservation was changed.</p><a class="dialog-action" href="bookings.html">Back to bookings</a>',
      );
    } else if (name === "refund") {
      const reason = $("textarea");
      if (!reason.value.trim()) {
        reason.required = true;
        reason.reportValidity();
        return;
      }
      dialog(
        "Demo refund request",
        '<p>Your sample refund request is complete. No live reservation or payment was changed.</p><a class="dialog-action" href="bookings.html">Back to bookings</a>',
      );
    } else if (name === "payment-info")
      dialog(
        "Payment methods",
        "<p>Saving payment methods requires a connected payment provider. This demo does not collect card details.</p>",
      );
    else if (name === "profile") notice("Profile updates require a connected account service.");
    else if (name === "password-info")
      dialog(
        "Change password",
        "<p>Password changes require a connected account service. This demo does not save passwords.</p>",
      );
  });

  // Lightweight mascot animation; respect reduced-motion preferences.
  const mascot = $(".mascot");
  if (mascot && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const messages = [
      "Hi! I'm Doode! 🐢",
      "Your next island adventure awaits! ⛴️",
      "Doode says: Speed it up! 🚀",
    ];
    let index = 0;
    setInterval(() => {
      if (document.hidden) return;
      $(".mascot-bubble").textContent = messages[index++ % messages.length];
      if (innerWidth > 1000) {
        mascot.style.left =
          (index % 2 ? 4 : Math.max(4, ((innerWidth - 260) / innerWidth) * 100)) + "%";
        mascot.style.top = (index % 2 ? 50 : 75) + "%";
      }
    }, 12000);
  }
})();
