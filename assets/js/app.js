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
        const item = localStorage.getItem("entree." + key);
        return item !== null ? JSON.parse(item) : fallback;
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
    remove(key) {
      try {
        localStorage.removeItem("entree." + key);
      } catch { }
    },
  };
  let isSaved = false;
  function markSaved() {
    isSaved = true;
  }
  document.addEventListener("entree:booking-saved", markSaved);

  // Open/close <dialog> safely. Some browsers (older iOS Safari, some device
  // simulators) lack or block showModal(), so fall back to a fixed overlay.
  function openModal(el) {
    try {
      if (typeof el.showModal === "function") {
        el.showModal();
        if (el.open) return;
      }
    } catch (error) {
      console.warn("showModal unavailable, using fallback modal:", error);
    }
    el.setAttribute("open", "");
    el.classList.add("dialog-fallback");
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-fallback-backdrop";
    el.before(backdrop);
    el._fallbackBackdrop = backdrop;
    const onKey = (event) => {
      if (event.key === "Escape" && el.isConnected) el.dispatchEvent(new Event("cancel", { cancelable: true }));
    };
    document.addEventListener("keydown", onKey);
    el._fallbackKey = onKey;
    el.setAttribute("tabindex", "-1");
    el.focus?.();
  }
  function closeModal(el) {
    if (!el) return;
    try {
      if (typeof el.close === "function" && el.open) el.close();
    } catch {
      /* fall through */
    }
    el.removeAttribute("open");
    el._fallbackBackdrop?.remove();
    if (el._fallbackKey) document.removeEventListener("keydown", el._fallbackKey);
  }
  function attachModalAttention(el) {
    let currentShakeAnim = null;
    let outsideClickCount = 0;
    let resetClicksTimer = null;

    const cleanupEnterAnim = () => {
      el.classList.remove("unsaved-dialog-enter", "dialog-enter");
      el.style.animation = "none";
    };
    el.addEventListener("animationend", cleanupEnterAnim, { once: true });
    setTimeout(cleanupEnterAnim, 260);

    function shakeModal() {
      if (currentShakeAnim) {
        try {
          currentShakeAnim.cancel();
        } catch {}
      }
      cleanupEnterAnim();
      el.classList.add("is-shaking");
      try {
        currentShakeAnim = el.animate(
          [
            { transform: "translateX(0)" },
            { transform: "translateX(-14px)" },
            { transform: "translateX(13px)" },
            { transform: "translateX(-10px)" },
            { transform: "translateX(9px)" },
            { transform: "translateX(-6px)" },
            { transform: "translateX(5px)" },
            { transform: "translateX(-2px)" },
            { transform: "translateX(1px)" },
            { transform: "translateX(0)" },
          ],
          {
            duration: 480,
            easing: "cubic-bezier(0.25, 1, 0.5, 1)",
          },
        );
        currentShakeAnim.onfinish = () => {
          el.classList.remove("is-shaking");
          el.style.transform = "";
          currentShakeAnim = null;
        };
      } catch {
        setTimeout(() => {
          el.classList.remove("is-shaking");
          el.style.transform = "";
          currentShakeAnim = null;
        }, 480);
      }
    }

    function handleOutsideInteraction(event) {
      if (event.target === el) {
        const r = el.getBoundingClientRect();
        const isOutside =
          event.clientX < r.left ||
          event.clientX > r.right ||
          event.clientY < r.top ||
          event.clientY > r.bottom;
        if (isOutside) {
          event.preventDefault();

          clearTimeout(resetClicksTimer);
          outsideClickCount++;

          // Reset count if user stops clicking for 2.5 seconds
          resetClicksTimer = setTimeout(() => {
            outsideClickCount = 0;
          }, 2500);

          // Only triggers if the user clicks 3x outside the modal
          if (outsideClickCount >= 3) {
            outsideClickCount = 0;
            shakeModal();
          }
        }
      }
    }

    const outsideEventType = window.PointerEvent ? "pointerdown" : "click";
    el.addEventListener(outsideEventType, handleOutsideInteraction);

    return { shakeModal, cleanupEnterAnim };
  }

  function confirmUnsavedChanges(onConfirm) {
    const previousUnsaved = $("dialog.unsaved-dialog");
    closeModal(previousUnsaved);
    previousUnsaved?.remove();
    const el = document.createElement("dialog");
    el.className = "unsaved-dialog unsaved-dialog-enter";
    el.innerHTML = `
      <div class="unsaved-header">
        <h2>Unsaved Changes</h2>
      </div>
      <p>You have unsaved changes. If you leave or refresh this page, your changes will be lost.</p>
      <div class="unsaved-actions">
        <button class="btn-stay" type="button">Stay</button>
        <button class="btn-discard" type="button">Discard Changes</button>
      </div>
    `;
    document.body.append(el);

    attachModalAttention(el);

    const close = () => {
      closeModal(el);
      el.remove();
    };
    $(".btn-stay", el).onclick = () => {
      close();
    };
    $(".btn-discard", el).onclick = () => {
      markSaved();
      close();
      if (typeof onConfirm === "function") {
        onConfirm();
      }
    };

    el.addEventListener("cancel", (e) => {
      e.preventDefault();
      close();
    });
    openModal(el);
    return el;
  }

  const navigateTo = (name, id) => {
    location.href = `${name}.html${id ? "?id=" + encodeURIComponent(id) : ""}`;
  };
  const go = (name, id) => {
    if (!isSaved && isDirty()) {
      confirmUnsavedChanges(() => navigateTo(name, id));
      return;
    }
    navigateTo(name, id);
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
    const previous = $("dialog");
    closeModal(previous);
    previous?.remove();
    const el = document.createElement("dialog");
    el.className = "dialog-enter";
    el.innerHTML = `<button class="dialog-close" aria-label="Close dialog">×</button><h2>${escape(title)}</h2>${content}`;
    document.body.append(el);

    attachModalAttention(el);

    const close = () => {
      store.remove("active_product_id");
      closeModal(el);
      el.remove();
    };

    $(".dialog-close", el).onclick = () => {
      close();
    };

    el.addEventListener("cancel", (e) => {
      e.preventDefault();
      close();
    });

    openModal(el);
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
    selectedFerry = null,
    cart = [];
  function getPhilippineDate() {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: false,
      }).formatToParts(new Date());
      const p = {};
      for (const { type, value } of parts) {
        p[type] = value;
      }
      return new Date(
        Number(p.year),
        Number(p.month) - 1,
        Number(p.day),
        Number(p.hour || 0),
        Number(p.minute || 0),
        Number(p.second || 0),
      );
    } catch {
      const now = new Date();
      const utc = now.getTime() + now.getTimezoneOffset() * 60000;
      return new Date(utc + 8 * 3600000);
    }
  }

  let currentMonth = new Date(getPhilippineDate().getFullYear(), getPhilippineDate().getMonth(), 1);
  const initialFieldValues = new Map();
  let hasManualDateChange = false;
  let hasManualCounterChange = false;

  function snapshotInitialState() {
    initialFieldValues.clear();
    $$("input,select,textarea").forEach((el) => {
      if (el.type === "password" || el.type === "hidden" || el.type === "submit" || el.type === "button") return;
      if (el.type === "checkbox" || el.type === "radio") {
        initialFieldValues.set(el, el.checked);
      } else {
        initialFieldValues.set(el, el.value);
      }
    });
  }

  function isDirty() {
    if (isSaved) return false;

    // Cart items or add-ons
    if (cart && cart.length > 0) return true;

    // Selected payment on payment page
    if (selectedPayment !== null) return true;

    // Selected ferry schedule on rebook page
    if (selectedFerry !== null) return true;

    // Manual date or counter adjustments on index
    if (hasManualDateChange || hasManualCounterChange) return true;

    // Compare tracked form controls against snapshot
    const controls = $$("input,select,textarea");
    for (const el of controls) {
      if (el.type === "password" || el.type === "hidden" || el.type === "submit" || el.type === "button") {
        continue;
      }
      if (initialFieldValues.has(el)) {
        const init = initialFieldValues.get(el);
        if (el.type === "checkbox" || el.type === "radio") {
          if (el.checked !== init) return true;
        } else {
          if (el.value !== init) return true;
        }
      } else {
        if (el.type === "checkbox" || el.type === "radio") {
          if (el.checked) return true;
        } else if (el.value && el.value.trim() !== "") {
          return true;
        }
      }
    }

    return false;
  }

  document.addEventListener("input", (e) => {
    if (e.target.matches("input,select,textarea")) {
      isSaved = false;
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.matches("input,select,textarea")) {
      isSaved = false;
    }
  });

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
  // Logged-in header: [Buy Pasalubong] [Notifications bell] [Initial avatar ▾]
  const ICONS = {
    bell: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg>',
    chevron: '<svg class="account-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>',
    calendar: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>',
    bag: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    user: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    gear: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    logout: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>',
  };
  const DEMO_NOTIFICATIONS = [
    { id: "n1", title: "Trip reminder", text: "Cebu → Tagbilaran sails Oct 30, 9:00 AM. Arrive 1 hour early.", href: "bookings.html" },
    { id: "n2", title: "Pasalubong deal", text: "Dried mangoes are 10% off when you add them to your trip.", href: "verify-booking.html" },
  ];
  const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function sessionInfo() {
    const s = store.get("session") || {};
    const email = s.email || "";
    const local = email.split("@")[0] || "Guest";
    const name = (s.name || local.replace(/[._-]+/g, " ")).trim();
    const pretty = name.replace(/\b\w/g, (c) => c.toUpperCase());
    return { name: pretty, email, initial: (pretty[0] || "?").toUpperCase() };
  }
  const unreadNotifications = () => {
    const read = store.get("notificationsRead") || [];
    return DEMO_NOTIFICATIONS.filter((n) => !read.includes(n.id));
  };
  function updateBellBadge() {
    const badge = $(".account-bell .account-badge");
    if (!badge) return;
    const n = unreadNotifications().length;
    badge.textContent = n;
    badge.hidden = n === 0;
    $(".account-bell")?.setAttribute("aria-label", `Notifications${n ? `, ${n} unread` : ""}`);
  }

  if (store.get("session")) {
    const login = $('header [data-action="go:login"]');
    if (login) {
      const info = sessionInfo();
      const cluster = document.createElement("div");
      cluster.className = "account-cluster";
      cluster.innerHTML =
        `<button type="button" class="account-icon-btn account-bell" data-action="notifications" aria-haspopup="true" aria-expanded="false">${ICONS.bell}<span class="account-badge"></span></button>` +
        `<button type="button" class="account-trigger" data-action="account" aria-haspopup="true" aria-expanded="false" aria-label="Account menu for ${escHtml(info.name)}"><span class="account-avatar">${escHtml(info.initial)}</span>${ICONS.chevron}</button>`;
      login.replaceWith(cluster);
      updateBellBadge();
    }
  }

  function closeHeaderMenus() {
    $$(".user-menu").forEach((m) => m.remove());
    $$(".account-trigger, .account-bell").forEach((b) => {
      b.setAttribute("aria-expanded", "false");
      b.classList.remove("is-open");
    });
  }
  function openHeaderMenu(kind, trigger, html) {
    const alreadyOpen = $(`.user-menu[data-kind="${kind}"]`);
    closeHeaderMenus();
    if (alreadyOpen) return null;
    const header = trigger.closest("header") || $("header");
    const menu = document.createElement("nav");
    menu.className = "user-menu";
    menu.dataset.kind = kind;
    menu.setAttribute("aria-label", kind === "account" ? "Account" : "Notifications");
    menu.innerHTML = html;
    header.append(menu);
    const hr = header.getBoundingClientRect();
    const tr = trigger.getBoundingClientRect();
    menu.style.top = tr.bottom - hr.top + 12 + "px";
    menu.style.right = Math.max(12, hr.right - tr.right - 4) + "px";
    trigger.setAttribute("aria-expanded", "true");
    trigger.classList.add("is-open");
    return menu;
  }
  function accountMenu() {
    const trigger = $(".account-trigger");
    if (!trigger) return;
    const info = sessionInfo();
    openHeaderMenu(
      "account",
      trigger,
      `<div class="user-menu-head"><p class="user-menu-name">${escHtml(info.name)}</p><p class="user-menu-email">${escHtml(info.email)}</p></div>` +
        `<div class="user-menu-list">` +
        `<a href="bookings.html">${ICONS.calendar}<span>My Bookings</span></a>` +
        `<a href="verify-booking.html">${ICONS.bag}<span>Buy Pasalubong</span></a>` +
        `<a href="travel-instructions.html">${ICONS.user}<span>Travel Instructions</span></a>` +
        `<a href="settings.html">${ICONS.gear}<span>Settings</span></a>` +
        `</div>` +
        `<div class="user-menu-foot"><button type="button" class="user-menu-logout" data-action="logout">${ICONS.logout}<span>Log Out</span></button></div>`,
    );
  }
  function notificationsMenu() {
    const trigger = $(".account-bell");
    if (!trigger) return;
    const unread = unreadNotifications().map((n) => n.id);
    const items = DEMO_NOTIFICATIONS.map(
      (n) =>
        `<a href="${n.href}" class="user-menu-notif${unread.includes(n.id) ? " is-unread" : ""}"><span class="notif-dot" aria-hidden="true"></span><span><span class="notif-title">${escHtml(n.title)}</span><span class="notif-text">${escHtml(n.text)}</span></span></a>`,
    ).join("");
    const menu = openHeaderMenu("notifications", trigger, `<div class="user-menu-head"><p class="user-menu-name">Notifications</p></div><div class="user-menu-list">${items}</div>`);
    if (menu) {
      store.set("notificationsRead", DEMO_NOTIFICATIONS.map((n) => n.id));
      updateBellBadge();
    }
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $(".user-menu")) closeHeaderMenus();
  });
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
        markSaved();
        store.set("session", { email: $('input[type="email"]', form).value });
        navigateTo("index");
      } else if (page === "signup") {
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
      } else if (page === "verify-booking") {
        const chosen = $('input[name="vb-booking"]:checked', form);
        if (!chosen) {
          formError(form, "Choose the booking you want to shop for.");
          $('input[name="vb-booking"]:not(:disabled)', form)?.focus();
          return;
        }
        const reference = chosen.value.trim().toUpperCase();
        const surnameInput = $("#surname", form);
        const surname = surnameInput.value.trim();
        const surnameMatches = (name) => {
          const full = String(name || "").trim().toLowerCase(), last = surname.toLowerCase();
          return Boolean(last) && (full === last || full.endsWith(" " + last));
        };
        const match = data.MOCK_BOOKINGS.find(b => b.reference.toUpperCase() === reference &&
          b.passengerDetails.some(person => surnameMatches(person.name)));
        if (!match) {
          formError(form, surname ? "That surname doesn't match any passenger on the selected booking." : "Enter the surname of a passenger on this booking.");
          surnameInput.focus();
          return;
        }
        markSaved();
        store.set("verification", {
          reference,
          surname,
        });
        navigateTo("pasalubong");
      }
    });
  });
  if (page === "login")
    $('a[href="#"]')?.addEventListener("click", (e) => {
      e.preventDefault();
      dialog(
        "Password recovery",
        "<p>Password resets are not available in this preview. Email <strong>support@entree.ph</strong> and our team will get you back into your account.</p>",
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
            "<p>This document is being finalised with our legal team and will be published before launch. Email <strong>support@entree.ph</strong> if you need a copy in the meantime.</p>",
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
      const todayValue = localDateValue(new Date());
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
      calendar.innerHTML = `<div class="calendar-heading"><button type="button" class="calendar-nav" data-month-step="-1" aria-label="Previous month"${atEarliestMonth ? " disabled" : ""}>&#8249;</button><span aria-live="polite">${monthLabel}</span><button type="button" class="calendar-nav" data-month-step="1" aria-label="Next month">&#8250;</button></div><div class="calendar-weekdays" aria-hidden="true">${["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(day => `<span>${day}</span>`).join("")}</div><div class="calendar-days">${'<span aria-hidden="true"></span>'.repeat(firstDay)}${days}</div><div class="calendar-footer"><button type="button" class="calendar-today">Today</button><button type="button" class="calendar-close">Close</button></div>`;
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
  // Phones / tablets (anything that isn't the desktop view): the home page shows
  // a compact trip bar; tapping it opens the booking card as a bottom sheet.
  // Keep MOBILE_QUERY in sync with the media query in index.css.
  // ==========================================================================
  const MOBILE_QUERY = "(max-width: 1024px), (hover: none) and (pointer: coarse)";
  const tripSheet = (() => {
    const card = $(".hero-glass-card");
    const pill = $("#m-trip-pill");
    const backdrop = $(".m-sheet-backdrop");
    if (page !== "index" || !card || !pill || !backdrop) return null;
    const mq = window.matchMedia ? window.matchMedia(MOBILE_QUERY) : { matches: false };
    const isMobile = () => Boolean(mq.matches);
    let open = false;
    let returnFocus = null;
    const shortDate = (value) =>
      value ? new Date(value + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";
    function summarize() {
      const from = $("#origin")?.value.trim() || "From";
      const to = $("#destination")?.value.trim() || "To";
      const oneWay = $('select[aria-label="Travel Type"]')?.value === "One Way";
      const cards = $$(".dates-input-group [data-date]");
      const dep = cards[0]?.dataset.date;
      const ret = cards[1]?.dataset.date;
      const pax = Number($('[data-counter-type="passengers"] .pax-count')?.textContent || 0);
      const dates = dep ? (oneWay || !ret ? shortDate(dep) : `${shortDate(dep)} – ${shortDate(ret)}`) : "Choose dates";
      $(".m-trip-pill-route", pill).textContent = `${from} → ${to}`;
      $(".m-trip-pill-meta", pill).textContent = `${dates} · ${pax ? `${pax} passenger${pax === 1 ? "" : "s"}` : "Add passengers"}`;
    }
    function setOpen(next, restoreFocus = true) {
      if (next === open) return;
      open = next;
      card.classList.toggle("is-sheet-open", open);
      backdrop.hidden = !open;
      backdrop.classList.toggle("is-open", open);
      document.body.classList.toggle("m-sheet-lock", open);
      pill.setAttribute("aria-expanded", String(open));
      if (open) {
        card.setAttribute("role", "dialog");
        card.setAttribute("aria-modal", "true");
        card.setAttribute("aria-labelledby", "booking-sheet-title");
        returnFocus = document.activeElement;
        card.scrollTop = 0;
        $(".m-sheet-close", card)?.focus({ preventScroll: true });
      } else {
        card.removeAttribute("role");
        card.removeAttribute("aria-modal");
        card.removeAttribute("aria-labelledby");
        summarize();
        if (restoreFocus) (returnFocus?.isConnected && returnFocus !== document.body ? returnFocus : pill).focus({ preventScroll: true });
      }
      document.dispatchEvent(new CustomEvent("entree:trip-sheet", { detail: { open } }));
    }
    pill.addEventListener("click", () => setOpen(true));
    backdrop.addEventListener("click", () => setOpen(false));
    $(".m-sheet-close", card)?.addEventListener("click", () => setOpen(false));
    document.addEventListener("keydown", (event) => {
      // The date picker and dropdowns handle Escape first (they call preventDefault).
      if (event.key === "Escape" && open && !event.defaultPrevented && !$("dialog[open]")) setOpen(false);
    });
    card.addEventListener("input", summarize);
    card.addEventListener("change", summarize);
    card.addEventListener("click", () => requestAnimationFrame(summarize));
    const onViewportChange = () => {
      if (!isMobile()) setOpen(false, false);
    };
    if (mq.addEventListener) mq.addEventListener("change", onViewportChange);
    else mq.addListener?.(onViewportChange);
    // Keep the trip bar above anything covering the bottom of the layout viewport
    // (on-screen keyboard, overlaid browser toolbars).
    const vv = window.visualViewport;
    if (vv) {
      const syncInset = () => {
        const covered = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
        document.documentElement.style.setProperty("--m-vv-inset", `${Math.round(covered)}px`);
      };
      vv.addEventListener("resize", syncInset);
      vv.addEventListener("scroll", syncInset);
      syncInset();
    }
    // The saved search is restored by booking-flow.js, which runs after this file.
    document.addEventListener("DOMContentLoaded", summarize);
    summarize();
    return { isMobile, isOpen: () => open, open: () => setOpen(true), close: () => setOpen(false) };
  })();

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
        "Preview mode — no payment is processed and no card details are collected.";
    // Fresh session: no payment preselected on reload
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
            ? `<a class="dialog-action ao-cta" href="verify-booking.html?id=${encodeURIComponent(b.id)}">Shop now</a>`
            : '<span class="ao-tag is-muted">Not available</span>'
        }</div></li>
      </ul>
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
        `<div class="text-center text-[10px] font-['Poppins:SemiBold',sans-serif] text-[#999] py-1">${day}</div>`,
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

      let cellClass =
        "aspect-square flex items-center justify-center rounded text-[11px] font-['Poppins:Medium',sans-serif] transition-all cursor-default select-none ";
      let title = `${currentMonth.toLocaleDateString("en-US", { month: "short" })} ${day}, ${year}`;

      if (isTrip && isToday) {
        cellClass += "bg-[#CCFF00] text-black font-bold ring-2 ring-gray-600 shadow-sm ";
        title += ` • Today & Trip: ${matchedBooking.reference} (${matchedBooking.route.origin} → ${matchedBooking.route.destination})`;
      } else if (isTrip) {
        cellClass += "bg-[#CCFF00] text-black font-bold shadow-sm hover:scale-105 ";
        title += ` • Trip: ${matchedBooking.reference} (${matchedBooking.route.origin} → ${matchedBooking.route.destination})`;
      } else if (isToday) {
        cellClass += "bg-gray-200 text-[#1f2937] font-bold ring-1 ring-gray-400 ";
        title += " • Today";
      } else {
        cellClass += "text-[#666] hover:bg-gray-100 ";
      }

      grid.insertAdjacentHTML(
        "beforeend",
        `<div class="${cellClass}" title="${escape(title)}">${day}</div>`,
      );
    }
  }
  if (page === "bookings") {
    currentMonth = new Date(getPhilippineDate().getFullYear(), getPhilippineDate().getMonth(), 1);
    renderCalendar();
  }

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

  // ==========================================================================
  // Pasalubong shop
  // Product grid (pick an option right on the card) + sticky cart with
  // GCash / Online Bank checkout. Prices are in Philippine pesos.
  // ==========================================================================
  const peso = (n) =>
    "₱" +
    Number(n).toLocaleString("en-PH", {
      minimumFractionDigits: Number(n) % 1 ? 2 : 0,
      maximumFractionDigits: 2,
    });
  const PAY_METHODS = {
    gcash: {
      label: "GCash",
      sub: "Pay from your GCash wallet",
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>',
    },
    bank: {
      label: "Online Bank",
      sub: "BPI, BDO, UnionBank and more",
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>',
    },
  };

  if (page === "pasalubong") setupShop();

  function setupShop() {
    const grid = $("#pz-grid");
    const cartBody = $("#pz-cart-body");
    if (!grid || !cartBody) return;
    const products = data.PRODUCTS || [];
    const categories = data.PRODUCT_CATEGORIES || [{ id: "all", label: "All" }];
    const catLabel = (id) => categories.find((c) => c.id === id)?.label || "";
    const shop = { cat: "all", q: "", selected: {}, photo: {}, payment: null, processing: false, placed: null };
    products.forEach((p) => {
      shop.selected[p.id] = p.menu[0].id;
      shop.photo[p.id] = 0;
    });

    // Which trip the order is for (from the Verify Booking step)
    const verification = store.get("verification");
    const draftTrip = window.ENTREE_BOOKING?.get();
    const trip =
      (verification && data.MOCK_BOOKINGS.find((b) => b.reference.toUpperCase() === String(verification.reference).toUpperCase())) ||
      (draftTrip && { ...draftTrip, reference: "Your upcoming trip", route: { origin: draftTrip.origin, destination: draftTrip.destination } }) ||
      booking();
    const tripDate = new Date(trip.departureDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const tripBox = $("#pz-trip");
    if (tripBox) {
      tripBox.innerHTML =
        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>` +
        `<span>Shopping for <strong>${escape(verification?.reference || trip.reference)}</strong> · ${escape(trip.route.origin)} → ${escape(trip.route.destination)} · ${escape(tripDate)}</span>` +
        `<a href="verify-booking.html">Change</a>`;
      tripBox.hidden = false;
    }

    // ---- Category chips ------------------------------------------------------
    const chips = $("#pz-chips");
    chips.innerHTML = categories
      .map((c) => `<button type="button" role="tab" class="pz-chip" data-cat="${c.id}" aria-selected="${c.id === shop.cat}">${escape(c.label)}</button>`)
      .join("");
    chips.addEventListener("click", (e) => {
      const b = e.target.closest("[data-cat]");
      if (!b) return;
      shop.cat = b.dataset.cat;
      $$("[data-cat]", chips).forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      renderGrid();
    });
    $("#pz-search").addEventListener("input", (e) => {
      shop.q = e.target.value.trim().toLowerCase();
      renderGrid();
    });

    // ---- Product grid ----------------------------------------------------------
    const inCart = (variantId) => cart.find((r) => r.id === variantId);
    function visibleProducts() {
      return products.filter((p) => {
        if (shop.cat !== "all" && p.category !== shop.cat) return false;
        if (!shop.q) return true;
        const hay = [p.name, p.merchant, p.description, ...p.menu.map((m) => m.name)].join(" ").toLowerCase();
        return hay.includes(shop.q);
      });
    }
    function cardHTML(p) {
      const variant = p.menu.find((m) => m.id === shop.selected[p.id]) || p.menu[0];
      const line = inCart(variant.id);
      const photo = shop.photo[p.id] % p.images.length;
      const many = p.images.length > 1;
      const buy = line
        ? `<div class="pz-stepper" role="group" aria-label="${escape(variant.name)} quantity">
             <button type="button" data-pz="dec:${variant.id}" data-focus="dec-${variant.id}" aria-label="Remove one ${escape(variant.name)}">−</button>
             <span aria-live="polite">${line.quantity} in cart</span>
             <button type="button" data-pz="inc:${variant.id}" data-focus="inc-${variant.id}" aria-label="Add one more ${escape(variant.name)}">+</button>
           </div>`
        : `<button type="button" class="pz-add" data-pz="add:${p.id}" data-focus="add-${p.id}">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
             Add to trip
           </button>`;
      return `<article class="pz-card">
        <div class="pz-media">
          <img src="${escape(p.images[photo])}" alt="${escape(p.name)}" loading="lazy" />
          <span class="pz-tag">${escape(catLabel(p.category))}</span>
          ${
            many
              ? `<button type="button" class="pz-photo-btn pz-prev" data-pz="photo:${p.id}:-1" data-focus="prev-${p.id}" aria-label="Previous photo of ${escape(p.name)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
                 <button type="button" class="pz-photo-btn pz-next" data-pz="photo:${p.id}:1" data-focus="next-${p.id}" aria-label="Next photo of ${escape(p.name)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>
                 <div class="pz-dots" aria-hidden="true">${p.images.map((_, i) => `<span class="${i === photo ? "is-on" : ""}"></span>`).join("")}</div>`
              : ""
          }
        </div>
        <div class="pz-body">
          <p class="pz-merchant"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/></svg>${escape(p.merchant)}</p>
          <h3 class="pz-name">${escape(p.name)}</h3>
          <p class="pz-desc">${escape(p.description)}</p>
          <div class="pz-variants" role="radiogroup" aria-label="Choose an option for ${escape(p.name)}">
            ${p.menu
              .map(
                (m) =>
                  `<button type="button" role="radio" aria-checked="${m.id === variant.id}" class="pz-variant" data-pz="variant:${p.id}:${m.id}" data-focus="var-${m.id}">
                     <span class="pz-variant-name">${escape(m.name)}</span>
                     <span class="pz-variant-price">${peso(m.price)}</span>
                     ${inCart(m.id) ? `<span class="pz-variant-qty" aria-label="${inCart(m.id).quantity} in cart">×${inCart(m.id).quantity}</span>` : ""}
                   </button>`,
              )
              .join("")}
          </div>
          <div class="pz-buy">
            <div class="pz-price"><span>${escape(variant.name)}</span><strong>${peso(variant.price)}</strong></div>
            ${buy}
          </div>
        </div>
      </article>`;
    }
    function renderGrid(focusKey) {
      const list = visibleProducts();
      grid.innerHTML = list.map(cardHTML).join("");
      $("#pz-noresults").hidden = list.length > 0;
      if (focusKey) $(`[data-focus="${focusKey}"]`, grid)?.focus({ preventScroll: true });
    }
    grid.addEventListener("click", (e) => {
      const b = e.target.closest("[data-pz]");
      if (!b) return;
      const [act, a, c] = b.dataset.pz.split(":");
      const product = products.find((p) => p.id === Number(a));
      let focus = b.dataset.focus;
      if (act === "variant") shop.selected[a] = Number(c);
      else if (act === "photo") shop.photo[a] = (shop.photo[a] + Number(c) + product.images.length) % product.images.length;
      else if (act === "add") {
        const v = product.menu.find((m) => m.id === shop.selected[a]);
        addToCart(product, v);
        focus = `inc-${v.id}`;
      } else if (act === "inc" || act === "dec") {
        changeQty(Number(a), act === "inc" ? 1 : -1);
        if (!inCart(Number(a))) {
          const owner = products.find((p) => p.menu.some((m) => m.id === Number(a)));
          focus = `add-${owner.id}`;
        }
      }
      renderGrid(focus);
      renderCart();
    });
    // Arrow keys move between options inside a card
    grid.addEventListener("keydown", (e) => {
      const b = e.target.closest(".pz-variant");
      if (!b || !["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) return;
      e.preventDefault();
      const all = $$(".pz-variant", b.parentElement);
      const next = all[(all.indexOf(b) + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length];
      next.click();
    });

    // ---- Cart ----------------------------------------------------------------------
    function addToCart(product, variant) {
      const line = inCart(variant.id);
      if (line) line.quantity += 1;
      else
        cart.push({
          id: variant.id,
          productId: product.id,
          name: variant.name,
          productName: product.name,
          merchant: product.merchant,
          image: product.images[0],
          price: variant.price,
          quantity: 1,
        });
      isSaved = false;
      shop.placed = null;
      notice(`${variant.name} added to your trip.`);
    }
    function changeQty(variantId, delta) {
      const line = inCart(variantId);
      if (!line) return;
      line.quantity += delta;
      cart = cart.filter((r) => r.quantity > 0);
    }
    const count = () => cart.reduce((s, r) => s + r.quantity, 0);
    const total = () => cart.reduce((s, r) => s + r.price * r.quantity, 0);

    function renderCart() {
      const n = count();
      const badge = $("#pz-cart-count");
      badge.textContent = n;
      badge.hidden = n === 0;
      const bar = $("#pz-mobilebar");
      bar.hidden = n === 0 || !!shop.placed;
      $("#pz-mobilebar-count").textContent = `${n} item${n === 1 ? "" : "s"}`;
      $("#pz-mobilebar-total").textContent = peso(total());

      if (shop.placed) {
        const o = shop.placed;
        cartBody.innerHTML = `<div class="pz-done" role="status">
            <span class="pz-done-check" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
            <h3>Order placed!</h3>
            <p>${o.items} item${o.items === 1 ? "" : "s"} · <strong>${peso(o.total)}</strong> paid with ${escape(PAY_METHODS[o.method].label)}</p>
            <p class="pz-done-ref">Order ${escape(o.ref)}</p>
            <p class="pz-done-note">We'll bring everything to your seat on ${escape(tripDate)}, before the ferry leaves.</p>
            <div class="pz-done-actions">
              <a class="pz-btn-primary" href="bookings.html">View My Bookings</a>
              <button type="button" class="pz-btn-ghost" data-cart="shop-more">Shop more</button>
            </div>
          </div>`;
        return;
      }
      if (!cart.length) {
        const appSrc = document.querySelector('script[src*="app.js"]')?.src;
        const art = appSrc ? new URL("../images/doode/doode-happy.webp", appSrc).href : "";
        cartBody.innerHTML = `<div class="pz-empty">
            ${art ? `<img src="${art}" alt="" width="88" height="88" />` : ""}
            <p class="pz-empty-title">Your cart is empty</p>
            <p>Pick a treat and it'll be waiting at your seat on ${escape(tripDate)}.</p>
          </div>`;
        return;
      }
      const method = shop.payment;
      cartBody.innerHTML = `
        <ul class="pz-lines" aria-label="Items in your cart">
          ${cart
            .map(
              (r) => `<li class="pz-line">
                <img src="${escape(r.image)}" alt="" />
                <div class="pz-line-info">
                  <p class="pz-line-name">${escape(r.name)}</p>
                  <p class="pz-line-meta">${escape(r.merchant)} · ${peso(r.price)}</p>
                  <div class="pz-stepper pz-stepper-sm" role="group" aria-label="${escape(r.name)} quantity">
                    <button type="button" data-cart="dec:${r.id}" aria-label="Remove one ${escape(r.name)}">−</button>
                    <span>${r.quantity}</span>
                    <button type="button" data-cart="inc:${r.id}" aria-label="Add one more ${escape(r.name)}">+</button>
                  </div>
                </div>
                <div class="pz-line-end">
                  <strong>${peso(r.price * r.quantity)}</strong>
                  <button type="button" class="pz-remove" data-cart="remove:${r.id}" aria-label="Remove ${escape(r.name)} from cart">Remove</button>
                </div>
              </li>`,
            )
            .join("")}
        </ul>
        <dl class="pz-summary">
          <div><dt>Subtotal</dt><dd>${peso(total())}</dd></div>
          <div><dt>Delivery</dt><dd><span class="pz-free">Free with trip</span></dd></div>
          <div class="pz-summary-total"><dt>Total</dt><dd>${peso(total())}</dd></div>
        </dl>
        <fieldset class="pz-pay">
          <legend>Pay with</legend>
          <div class="pz-pay-options" role="radiogroup" aria-label="Payment method">
            ${Object.entries(PAY_METHODS)
              .map(
                ([key, m]) => `<button type="button" role="radio" aria-checked="${method === key}" class="pz-pay-option pz-pay-${key}" data-cart="pay:${key}">
                  <span class="pz-pay-icon">${m.icon}</span>
                  <span class="pz-pay-text"><span class="pz-pay-label">${m.label}</span><span class="pz-pay-sub">${m.sub}</span></span>
                  <span class="pz-radio" aria-hidden="true"></span>
                </button>`,
              )
              .join("")}
          </div>
        </fieldset>
        <button type="button" class="pz-pay-btn" data-cart="checkout" ${method && !shop.processing ? "" : "disabled"} aria-busy="${shop.processing}">
          ${shop.processing ? '<span class="pz-spinner" aria-hidden="true"></span>Processing payment…' : method ? `Pay ${peso(total())} with ${PAY_METHODS[method].label}` : "Choose a payment method"}
        </button>
        <p class="pz-secure"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Preview mode — no payment is processed.</p>`;
    }
    cartBody.addEventListener("click", (e) => {
      const b = e.target.closest("[data-cart]");
      if (!b || shop.processing) return;
      const [act, arg] = b.dataset.cart.split(":");
      if (act === "inc" || act === "dec") changeQty(Number(arg), act === "inc" ? 1 : -1);
      else if (act === "remove") cart = cart.filter((r) => r.id !== Number(arg));
      else if (act === "pay") shop.payment = arg;
      else if (act === "shop-more") {
        shop.placed = null;
        shop.payment = null;
        $("#pz-title").scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (act === "checkout") {
        if (!shop.payment || !cart.length) return;
        shop.processing = true;
        renderCart();
        setTimeout(() => {
          const order = {
            ref: "PSL-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
            total: total(),
            items: count(),
            method: shop.payment,
            booking: verification?.reference || trip.reference,
            lines: cart.map((r) => ({ id: r.id, name: r.name, qty: r.quantity, price: r.price })),
            placedAt: new Date().toISOString(),
          };
          const history = store.get("pasalubongOrders") || [];
          history.push(order);
          store.set("pasalubongOrders", history);
          cart = [];
          shop.processing = false;
          shop.placed = order;
          markSaved();
          renderGrid();
          renderCart();
          $("#pz-cart").scrollIntoView({ behavior: "smooth", block: "start" });
        }, 1400);
        return;
      }
      renderGrid();
      renderCart();
      const again = b.dataset.cart && $(`[data-cart="${b.dataset.cart}"]`, cartBody);
      again?.focus({ preventScroll: true });
    });
    $("#pz-mobilebar").addEventListener("click", () => $("#pz-cart").scrollIntoView({ behavior: "smooth", block: "start" }));

    renderGrid();
    renderCart();
  }

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
        ? '<p class="py-4">No departures in this date range. Try a date closer to your original trip.</p>'
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
  }
  if (page === "refund") {
    const reasonTextarea = $("textarea");
    if (reasonTextarea) {
      reasonTextarea.value = "";
    }
  }
  if (page === "verify-booking") {
    const v = store.get("verification");
    const list = $("#vb-bookings");
    const requested = new URLSearchParams(location.search).get("id");
    // Hours until departure; pasalubong orders close 14 hours before sailing.
    const hoursLeft = (b) => {
      const quote = window.ENTREE_BOOKING?.refundQuote?.(b);
      if (quote) return quote.hours;
      return (new Date(b.departureDate + "T00:00:00") - new Date()) / 36e5;
    };
    const upcoming = data.MOCK_BOOKINGS.filter((b) => b && b.route && b.reference && !b.refund && b.status !== "completed" && hoursLeft(b) > 0).sort((a, b) =>
      a.departureDate.localeCompare(b.departureDate),
    );
    if (list) {
      if (!upcoming.length) {
        list.innerHTML = '<p class="vb-empty">No upcoming bookings on this device. <a href="index.html">Book a trip</a> to start shopping for pasalubong.</p>';
        $$('form button[type="submit"], #surname').forEach((el) => (el.disabled = true));
      } else {
        const preferred = requested ? upcoming.find((b) => b.id === requested) : v?.reference ? upcoming.find((b) => b.reference === v.reference) : null;
        const firstEligible = upcoming.find((b) => hoursLeft(b) >= 14);
        const selected = preferred && hoursLeft(preferred) >= 14 ? preferred : upcoming.length === 1 ? firstEligible : null;
        list.innerHTML = upcoming
          .map((b) => {
            const eligible = hoursLeft(b) >= 14;
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
    const surnameInput = $("#surname");
    if (surnameInput && v?.surname && !surnameInput.value && v.reference === $('input[name="vb-booking"]:checked')?.value) surnameInput.value = v.surname;
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
    if (page === "refund" && window.ENTREE_BOOKING) {
      const quote = window.ENTREE_BOOKING.refundQuote(b);
      const existing = window.ENTREE_BOOKING.refundOf(b.id);
      const label = allText("Refund Amount (100%)", $("main"))[0];
      const amountEl = label?.nextElementSibling;
      if (label) label.textContent = `Refund Amount (${existing ? existing.percent : quote.percent}%)`;
      if (amountEl) {
        amountEl.textContent = `₱${(existing ? existing.amount : quote.amount).toFixed(2)}`;
        if (!existing && !quote.percent) amountEl.classList.replace("text-green-600", "text-red-600");
      }
      const submit = $('[data-action="refund"]');
      const textarea = $("textarea");
      const message = existing
        ? `Refund already requested on ${new Date(existing.requestedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} — ₱${existing.amount.toFixed(2)} is being processed (7–14 business days).`
        : quote.reason;
      if (message && submit) {
        submit.disabled = true;
        submit.textContent = existing ? "Refund requested" : "Not eligible for refund";
        if (textarea) {
          textarea.disabled = true;
          if (existing?.reason) textarea.value = existing.reason;
        }
        const note = document.createElement("p");
        note.setAttribute("role", "status");
        note.className = existing
          ? "mb-4 rounded-lg border border-green-200 bg-green-100 p-4 text-[14px] text-green-700"
          : "mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-[14px] text-red-700";
        note.textContent = message;
        submit.parentElement.before(note);
      }
    }
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
        notice("Your preferences have been updated.");
        if (input.type === "checkbox") {
          initialFieldValues.set(input, input.checked);
        } else {
          initialFieldValues.set(input, input.value);
        }
      });
    });
    allText("Add Payment Method").forEach((el) => action(el, "payment-info"));
    allText("Update Profile").forEach((el) => action(el, "profile"));
    allText("Change").forEach((el) => action(el, "password-info"));
    const email = $('input[type="email"]');
    if (email) email.value = store.get("session")?.email || "";
  }

  // Snapshot initial values for change detection
  snapshotInitialState();
  document.addEventListener("entree:draft-restored", () => {
    hasManualDateChange = false;
    hasManualCounterChange = false;
    snapshotInitialState();
  });

  // Intercept standard link navigation if unsaved changes exist
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-action]")) return;
    const link = e.target.closest("a[href]");
    if (!link) return;
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    if (!isSaved && isDirty()) {
      e.preventDefault();
      confirmUnsavedChanges(() => {
        location.href = href;
      });
    }
  });

  document.addEventListener("click", async (event) => {
    const el = event.target.closest("[data-action]");
    if (!el) {
      if (!event.target.closest(".user-menu")) closeHeaderMenus();
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
        markSaved();
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
        minimum = arg === "passengers" && page !== "index" ? 1 : 0;
      value.textContent = Math.max(minimum, Number(value.textContent) + Number(amount));
      if (page === "index") {
        hasManualCounterChange = true;
      }
    } else if (name === "swap") {
      const a = $("#origin"),
        b = $("#destination");
      if (a && b) {
        [a.value, b.value] = [b.value, a.value];
        a.dispatchEvent(new Event("input", { bubbles: true }));
        b.dispatchEvent(new Event("input", { bubbles: true }));
      }
    } else if (name === "account") accountMenu();
    else if (name === "notifications") notificationsMenu();
    else if (name === "logout") {
      markSaved();
      store.set("session", null);
      store.remove("verification");
      navigateTo("index");
    } else if (name === "payment") {
      selectedPayment = arg;
      $$('[data-action^="payment:"]').forEach((b) => {
        b.classList.toggle("selected-option", b === el);
        b.setAttribute("aria-pressed", String(b === el));
      });
      enable($('[data-action="complete-payment"]'));
    } else if (name === "complete-payment") {
      if (selectedPayment) {
        if (window.ENTREE_BOOKING && !window.ENTREE_BOOKING.complete(selectedPayment)) {
          notice(window.ENTREE_BOOKING.detailsError());
          return;
        }
        markSaved();
        store.set("demoPayment", selectedPayment);
        navigateTo("confirmation");
      }
    } else if (name === "booking" || name === "share") showBooking(id, name === "share");
    else if (name === "addons") showAddOns(id);
    else if (name === "print") window.print();
    else if (name === "copy-trip") {
      try {
        await navigator.clipboard.writeText($("dialog").innerText);
        notice("Trip details copied.");
      } catch {
        notice("Copy is unavailable here. Use Print to save the trip.");
      }
    } else if (name === "month") {
      if (arg === "today") {
        const pht = getPhilippineDate();
        currentMonth = new Date(pht.getFullYear(), pht.getMonth(), 1);
      } else {
        currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + Number(arg), 1);
      }
      renderCalendar();
    } else if (name === "close-dialog") {
      const d = $("dialog");
      if (d) {
        store.remove("active_product_id");
        closeModal(d);
        d.remove();
      }
    } else if (name === "select-passengers") {
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
    } else if (name === "refund") {
      const reason = $("textarea");
      if (!reason.value.trim()) {
        reason.required = true;
        reason.reportValidity();
        return;
      }
      const result = window.ENTREE_BOOKING?.requestRefund(booking().id, reason.value.trim());
      if (!result || result.error) {
        notice(result?.error || "Refunds are unavailable right now.");
        return;
      }
      markSaved();
      el.disabled = true;
      el.textContent = "Refund requested";
      reason.disabled = true;
      dialog(
        "Refund request received",
        `<p>We have logged your refund request for <strong>${escape(booking().reference)}</strong>. <strong>₱${result.refund.amount.toFixed(2)}</strong> (${result.refund.percent}%) will be reviewed within 7–14 business days and paid back to your original payment method. Preview mode — no payment was reversed.</p><a class="dialog-action" href="bookings.html">Back to my bookings</a>`,
      );
    } else if (name === "payment-info")
      dialog(
        "Payment methods",
        "<p>Saved payment methods are not available in this preview. You can still pay with GCash or online banking at checkout.</p>",
      );
    else if (name === "profile") notice("Profile changes are not saved in this preview.");
    else if (name === "password-info")
      dialog(
        "Change password",
        "<p>Password changes are not available in this preview. For help securing your account, email <strong>support@entree.ph</strong>.</p>",
      );
  });

  // Intercept refresh shortcuts (F5, Ctrl+R, Cmd+R)
  window.addEventListener("keydown", (e) => {
    const isReload =
      e.key === "F5" ||
      ((e.ctrlKey || e.metaKey) && (e.key === "r" || e.key === "R"));
    if (isReload && !isSaved && isDirty()) {
      e.preventDefault();
      confirmUnsavedChanges(() => {
        location.reload();
      });
    }
  });

  // Browser beforeunload fallback for reload button and tab closing
  window.addEventListener("beforeunload", (e) => {
    if (!isSaved && isDirty()) {
      e.preventDefault();
      e.returnValue = "";
      return "";
    }
  });

  // ==========================================================================
  // Mascot Controller (Doode the Sea Turtle)
  //
  // States:
  //   hidden      -> not on screen
  //   appearing   -> pops in (after the user has been inactive for a while)
  //   talking     -> Quote 1: a joke about where the user left off
  //   questioning -> Quote 2: teases the user to continue (with buttons)
  //   suggesting  -> Quote 3: random suggestion / fun line
  //   idle        -> floats around and wanders to random spots
  //   dragging    -> the user is dragging Doode around
  //   closing     -> waves goodbye and sinks (reappears after inactivity)
  //   guiding     -> swims to a step on the page ("Show me" / tour)
  //   pointing    -> points at the highlighted step and explains it
  //
  // User activity NEVER hides Doode anymore. Only the close button does.
  // ==========================================================================
  try {
    const mascot = $(".mascot");
    if (mascot) {
      const mascotArt = mascot.querySelector(".mascot-art");
      const bubble = mascot.querySelector(".mascot-bubble");
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

      // ---- Timing (ms) -----------------------------------------------------
      const FIRST_APPEAR_IDLE = 6000; // inactivity before Doode first shows up
      const CHAT_AGAIN_IDLE = 30000; // inactivity (while visible) before a new chat
      const REAPPEAR_IDLE = 25000; // inactivity (after closing) before he comes back
      const APPEAR_MS = 700;
      const CLOSE_MS = 650;
      const READ_AFTER_TYPING = 3200;
      const QUESTION_MS = 8000;
      const SUGGEST_MS = 6500;

      // ---- Small helpers ---------------------------------------------------
      const store2 = {
        get(k) {
          try {
            return localStorage.getItem("doode:" + k);
          } catch {
            return null;
          }
        },
        set(k, v) {
          try {
            localStorage.setItem("doode:" + k, v);
          } catch {
            /* storage unavailable */
          }
        },
      };
      const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
      const lastQuotes = new Set();
      function pickFresh(arr) {
        const fresh = arr.filter((q) => !lastQuotes.has(q));
        const q = pick(fresh.length ? fresh : arr);
        lastQuotes.add(q);
        if (lastQuotes.size > 12) lastQuotes.delete(lastQuotes.values().next().value);
        return q;
      }
      const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

      // ---- What the user "left off" at --------------------------------------
      const PAGE_NAMES = {
        index: "the home page",
        login: "the login page",
        signup: "the sign-up page",
        trips: "the trip list",
        "passenger-details": "passenger details",
        payment: "the payment page",
        confirmation: "your confirmation",
        bookings: "your bookings",
        pasalubong: "the pasalubong shop",
        rebook: "rebooking",
        refund: "the refund page",
        settings: "settings",
        "travel-instructions": "travel instructions",
        "verify-booking": "booking verification",
      };
      const prevPage = store2.get("lastPage");
      store2.set("lastPage", page || "");

      let lastField = "";
      document.addEventListener(
        "focusin",
        (e) => {
          const el = e.target;
          if (!el || mascot.contains(el) || !el.matches?.("input, select, textarea")) return;
          const label =
            el.getAttribute("aria-label") ||
            (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) ||
            el.placeholder ||
            "";
          lastField = label.trim().replace(/\s+/g, " ").slice(0, 30);
        },
        true,
      );

      function context() {
        const val = (sel) => ($(sel)?.value || "").trim();
        const typed = $$("input:not([type=hidden]):not([type=checkbox]):not([type=radio])").some(
          (i) => !mascot.contains(i) && i.offsetParent && i.value.trim() && !i.defaultValue,
        );
        return {
          from: val("#origin") || "somewhere",
          to: val("#destination") || "paradise",
          field: lastField,
          typed,
          prev: prevPage && prevPage !== page ? PAGE_NAMES[prevPage] : "",
        };
      }

      // Quote 1 — "where you left off" (per page). Functions receive context().
      const LEFT_OFF = {
        index: [
          (c) => `${c.from} to ${c.to}... the ferry's ready. Are you?`,
          () => "You've been staring at this form like it owes you money.",
          () => "Those Search Ferries buttons don't press themselves. Trust me, I've tried. No thumbs.",
          (c) => `${c.to} called. It asked why you're still here.`,
          () => "I've seen jellyfish make faster decisions. And they don't have brains.",
        ],
        login: [
          () => "So... when are you gonna log in? I'm not getting any younger. I'm 80.",
          () => "The password box is lonely. Go say hi.",
          (c) => (c.typed ? "You typed something, then ghosted me. Classic." : "Forgot your password? Happens. I forgot where I left my shell once."),
          () => "Logging in takes 5 seconds. You've been here for way longer.",
        ],
        signup: [
          () => "Signing up is free. Unlike my therapy after seeing this unfinished form.",
          (c) => (c.field ? `You were halfway through "${c.field}". It misses you.` : "A blank sign-up form. How mysterious."),
          () => "Join us! We have ferries. And me. Mostly ferries.",
        ],
        trips: [
          () => "Picking a trip is hard, I know. I just follow the currents.",
          () => "These ferries won't wait forever. Well, until departure. Then they really won't.",
          () => "Scrolling trips again? Pick one! Eeny, meeny, miny... boat.",
        ],
        "passenger-details": [
          (c) => (c.field ? `You stopped at "${c.field}". Commitment issues?` : "Passenger details: the paperwork before the paradise."),
          () => "Names, please. I'd fill it in for you but... flippers.",
          () => "Almost there! Just a few more boxes between you and the sea.",
        ],
        payment: [
          () => "Your wallet is shy. I get it. I hide in my shell too.",
          () => "One click away from sea breeze. Or one click away from me nagging you more.",
          () => "Payment page staring contest? The page always wins.",
        ],
        confirmation: [
          () => "You're booked! Now go pack. Not everything. Leave room for pasalubong.",
          () => "Confirmed! I'd high-five you but, again, flippers.",
        ],
        bookings: [
          () => "Admiring your bookings? Me too. Very organized. Very adult.",
          () => "Looking for a trip? It's in there somewhere. Like my car keys. I don't have a car.",
        ],
        pasalubong: [
          () => "Your cart looks hungry. Feed it some dried mangoes.",
          () => "Going home without pasalubong? Bold. Your titas will remember this.",
          () => "Window shopping? I'd do it too, but I don't have windows. Or money.",
        ],
        rebook: [
          () => "Changing plans? Relatable. I change direction every 12 seconds.",
          () => "Pick a new schedule! The sea isn't going anywhere. Literally.",
        ],
        refund: [
          () => "Refunds are like tides. They come back... eventually.",
          () => "Leaving us? My shell is cracking. Emotionally.",
        ],
        settings: [
          () => "Tweaking settings like it's a video game. Respect.",
          () => "Don't forget to save. I learned that the hard way.",
        ],
        "travel-instructions": [
          () => "Reading the instructions? A responsible traveler. Rare species. Like me.",
          () => "Pro tip: arrive early. The ferry doesn't do 'Filipino time'.",
        ],
        "verify-booking": [
          () => "Verifying your booking? Trust issues. I like it.",
          () => "Pick your trip. I'd do it myself but my flippers keep missing.",
        ],
      };
      const LEFT_OFF_GENERIC = [
        () => "You've gone quiet. Did the Wi-Fi drown?",
        () => "Hello? Anyone? I'm talking to a screen again, aren't I.",
      ];

      // Quote 2 — teasing to continue (asked as a question)
      const TEASE = {
        index: ["Shall we search for ferries before the sea evaporates?", "Want me to point you to the Search button? It's the big green one. Very subtle."],
        login: ["Ready to type that password? I promise I won't look.", "Log in now and I'll stop bothering you. Deal?"],
        signup: ["Finish signing up? I'll do a little dance. Probably.", "Shall we fill in the rest together?"],
        trips: ["Pick a trip and let's sail?", "Shall I choose for you? Warning: I always choose the slow one."],
        "passenger-details": ["Finish those details so we can go?", "Just a few boxes left. Continue?"],
        payment: ["Complete the payment and hear the waves call?", "Ready to make it official?"],
        pasalubong: ["Add something to the cart? The dried mangoes are begging.", "Shall we shop a little more?"],
        refund: ["Sure you want to leave? ...Continue anyway?", "Shall we finish this refund?"],
        rebook: ["Pick a new time and carry on?", "Continue rebooking?"],
        "verify-booking": ["Pick your trip and let's go shopping?", "Shall we verify it now?"],
      };
      const TEASE_GENERIC = ["Shall we continue where you left off?", "Pick up where you stopped? I'll wait. I'm very slow anyway."];

      // Quote 3 — randomized suggestions / fun facts
      const SUGGESTIONS = [
        { text: "Pro tip: book early and snag the window seat. Great views, fewer elbows.", go: null },
        { text: "Don't forget pasalubong! Your relatives are counting. Literally.", go: "pasalubong", label: "Shop pasalubong" },
        { text: "Plans changed? You can rebook from My Bookings.", go: "bookings", label: "My bookings" },
        { text: "Fun fact: sea turtles can hold their breath for hours. You can't. Please breathe.", go: null },
        { text: "Bring a jacket. Ferry aircon is set to 'Arctic'.", go: null },
        { text: "Lost? I know this page like the back of my flipper. Want a tour?", tour: true, label: "Show me around" },
        { text: "New here? I can swim you through every step on this page.", tour: true, label: "Take the tour" },
        { text: "Read the travel instructions so the terminal doesn't surprise you.", go: "travel-instructions", label: "Read tips" },
        { text: "Fun fact: I'm 80 years old and I've never missed a ferry. Just saying.", go: null },
        { text: "Keep your booking QR code handy at the gate. Screenshots count!", go: null },
      ];
      const DRAG_LINES = ["Wheee! Put me somewhere nice.", "I get seasick on land, you know.", "Nice throw. 10/10.", "Oh, a new spot. Very feng shui.", "Careful! My shell isn't dishwasher safe."];
      const CLICK_LINES = ["Hey! That tickles.", "Boop received.", "Yes? I'm listening. Slowly.", "Hi! Drag me anywhere, or hit × if I'm too much."];
      const HELLO_BACK_LINES = ["I'm baaack. Did you miss me?", "Surprise! Couldn't stay away.", "You closed me, but you can't close my heart."];

      function buildQuote1(c) {
        let pool = (LEFT_OFF[page] || LEFT_OFF_GENERIC).slice();
        if (c.prev) pool.push(() => `You came here from ${c.prev}. Brave. Let's finish this one.`);
        return pickFresh(pool.map((fn) => fn(c)));
      }

      // ---- Build the bubble & close button ---------------------------------
      mascot.removeAttribute("aria-hidden");
      mascot.setAttribute("role", "complementary");
      mascot.setAttribute("aria-label", "Doode the sea turtle helper");
      let textSpan, actionsBox;
      if (bubble) {
        bubble.setAttribute("role", "status");
        bubble.setAttribute("aria-live", "polite");
        bubble.innerHTML = "";
        const badge = document.createElement("div");
        badge.className = "mascot-bubble-badge";
        badge.textContent = "Doode";
        textSpan = document.createElement("span");
        textSpan.className = "bubble-text";
        actionsBox = document.createElement("div");
        actionsBox.className = "mascot-bubble-actions";
        bubble.append(badge, textSpan, actionsBox);
        bubble.addEventListener("click", (e) => e.stopPropagation());
      }

      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "mascot-close";
      closeBtn.setAttribute("aria-label", "Close Doode");
      closeBtn.title = "Close";
      closeBtn.innerHTML =
        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
      mascot.appendChild(closeBtn);

      // ---- State artwork (one drawing per state) ---------------------------
      const appScript = document.querySelector('script[src*="app.js"]');
      const spriteBase = new URL("../images/doode/", appScript ? appScript.src : location.href).href;
      const SPRITES = {
        appearing: "doode-appearing.webp",
        talking: "doode-talking.webp",
        questioning: "doode-questioning.webp",
        suggesting: "doode-suggesting.webp",
        dragging: "doode-dragging.webp",
        idle: "doode-idle.webp",
        closing: "doode-closing.webp",
        happy: "doode-happy.webp",
        swimming: "doode-swimming.webp",
      };
      const STATE_SPRITE = { hidden: "idle", guiding: "swimming", pointing: "suggesting" };
      Object.values(SPRITES).forEach((f) => {
        const pre = new Image();
        pre.src = spriteBase + f;
      });
      let spriteImg = null;
      if (mascotArt) {
        mascotArt.innerHTML = '<div class="mascot-sprite"><img alt="" draggable="false"></div>';
        spriteImg = mascotArt.querySelector("img");
      }
      let currentSprite = "";
      function setSprite(name) {
        if (!spriteImg || !SPRITES[name] || currentSprite === name) return;
        currentSprite = name;
        spriteImg.src = spriteBase + SPRITES[name];
        spriteImg.classList.remove("is-swapping");
        void spriteImg.offsetWidth;
        spriteImg.classList.add("is-swapping");
      }

      if (mascotArt) {
        mascotArt.setAttribute("role", "button");
        mascotArt.setAttribute("tabindex", "0");
        mascotArt.setAttribute("aria-label", "Doode. Drag to move, press Enter to talk.");
      }

      // ---- State ----------------------------------------------------------
      let state = "hidden";
      let timers = [];
      let typingTimer = null;
      const later = (fn, ms) => {
        const t = setTimeout(fn, ms);
        timers.push(t);
        return t;
      };
      const clearFlow = () => {
        timers.forEach(clearTimeout);
        timers = [];
        clearInterval(typingTimer);
      };

      function setState(next) {
        state = next;
        mascot.dataset.state = next;
        setSprite(STATE_SPRITE[next] || next);
      }
      setState("hidden");

      // ---- Position -------------------------------------------------------
      const SIZE = () => (window.innerWidth <= 768 ? 112 : 130);
      let pos = { x: 0, y: 0 };
      function bounds() {
        const s = SIZE();
        return { minX: 8, minY: 70, maxX: window.innerWidth - s - 8, maxY: window.innerHeight - s - 8 };
      }
      // Element Doode is pointing at; the speech bubble is placed so it doesn't cover it.
      let bubbleAvoid = null;
      function placeBubble() {
        const vw = window.innerWidth;
        mascot.classList.toggle("bubble-align-right", pos.x + SIZE() / 2 > vw / 2);
        let below = pos.y < 230;
        const r = bubbleAvoid?.isConnected ? bubbleAvoid.getBoundingClientRect() : null;
        if (r) {
          const s = SIZE();
          const room = 190; // roughly the bubble's height
          if (r.bottom <= pos.y + s / 2 && pos.y + s + room <= window.innerHeight) below = true; // target is above Doode
          else if (r.top >= pos.y + s / 2 && pos.y - room >= 0) below = false; // target is below Doode
        }
        mascot.classList.toggle("bubble-below", below);
      }
      function setPos(x, y, travelMs) {
        const b = bounds();
        const nx = clamp(x, b.minX, Math.max(b.minX, b.maxX));
        const ny = clamp(y, b.minY, Math.max(b.minY, b.maxY));
        if (nx !== pos.x) mascot.classList.toggle("is-inverted", nx > pos.x);
        mascot.style.setProperty("--travel", (travelMs || 0) + "ms");
        pos = { x: nx, y: ny };
        mascot.style.left = nx + "px";
        mascot.style.top = ny + "px";
        placeBubble();
      }
      const saved = (store2.get("pos") || "").split(",").map(Number);
      if (saved.length === 2 && saved.every((n) => Number.isFinite(n))) {
        setPos(saved[0] * window.innerWidth, saved[1] * window.innerHeight, 0);
      } else {
        setPos(window.innerWidth * 0.04, window.innerHeight * 0.58, 0);
      }
      const savePos = () => store2.set("pos", `${(pos.x / window.innerWidth).toFixed(3)},${(pos.y / window.innerHeight).toFixed(3)}`);

      // ---- Bubble ---------------------------------------------------------
      function say(text, actions = [], onTyped) {
        if (!bubble || !textSpan) return;
        clearInterval(typingTimer);
        actionsBox.innerHTML = "";
        actionsBox.hidden = true;
        bubble.classList.add("is-visible");
        placeBubble();
        const finish = () => {
          textSpan.textContent = text;
          mascot.classList.remove("is-typing");
          if (actions.length) {
            actions.forEach((a) => {
              const btn = document.createElement("button");
              btn.type = "button";
              btn.className = "mascot-bubble-btn" + (a.primary ? " is-primary" : "");
              btn.textContent = a.label;
              btn.addEventListener("click", (e) => {
                e.stopPropagation();
                a.run();
              });
              actionsBox.appendChild(btn);
            });
            actionsBox.hidden = false;
          }
          onTyped?.();
        };
        if (reduceMotion) return finish();
        let i = 0;
        textSpan.textContent = "";
        mascot.classList.add("is-typing");
        typingTimer = setInterval(() => {
          i += 1;
          textSpan.textContent = text.slice(0, i);
          if (i >= text.length) {
            clearInterval(typingTimer);
            finish();
          }
        }, 24);
      }
      function hideBubble() {
        clearInterval(typingTimer);
        mascot.classList.remove("is-typing");
        bubble?.classList.remove("is-visible");
      }

      // ---- Guide mode: Doode swims to each step on the page and points at it --
      const byText = (t) => () => allText(t).find((el) => !mascot.contains(el) && el.getClientRects().length);
      const bySel = (sel) => () => $$(sel).find((el) => !mascot.contains(el) && el.getClientRects().length);
      const filled = (el) => !!(el && typeof el.value === "string" && el.value.trim());
      const GUIDES = {
        index: [
          // Phones/tablets only: the planner lives in a bottom sheet behind the trip bar.
          // "gate" steps block the tour until the user does the thing themselves.
          { find: bySel("#m-trip-pill"), gate: true, done: () => Boolean(tripSheet?.isOpen()), say: "Tap this trip bar to open the trip planner. Everything's inside!" },
          { find: bySel("#origin"), inSheet: true, done: filled, say: "Start here! Where are you sailing from?" },
          { find: bySel("#destination"), inSheet: true, done: filled, say: "Now pick where you're going. Somewhere with good mangoes, ideally." },
          { find: bySel('[aria-label="Departure date"]'), inSheet: true, say: "Tap here to pick your travel date. Weekends go fast!" },
          { find: bySel(".pax-counters"), inSheet: true, say: "Tell me who's coming: passengers, vehicles, even pets. No judging." },
          { find: bySel(".booking-quick-filters"), inSheet: true, say: "Choose your ferry line and cabin here." },
          { find: bySel(".hero-search-cta"), inSheet: true, say: "Then hit Search Ferries. The big green button. You can't miss it. Please don't miss it." },
        ],
        login: [
          { find: bySel('input[type="email"]'), done: filled, say: "Pop your email in here first." },
          { find: bySel('input[type="password"]'), done: filled, say: "Then your password. I'm looking away, promise." },
          { find: byText("Log In"), say: "Now press Log In and we're in business." },
          { find: byText("Forgot password?"), say: "Forgot it? Happens to the best of us. Click here." },
        ],
        signup: [
          { find: bySel('input[placeholder="Juan"]'), done: filled, say: "Let's start with your first name." },
          { find: bySel('input[type="tel"]'), done: filled, say: "Your mobile number, so we can text you about your trip." },
          { find: bySel('input[type="email"]'), done: filled, say: "Your email goes here. Tickets land in your inbox." },
          { find: bySel('input[type="password"]'), done: filled, say: "Make a password. At least 8 characters. 'turtle123' is taken." },
          { find: byText("Create Account"), say: "All set? Hit Create Account!" },
        ],
        trips: [
          { find: bySel('[data-action="go:passenger-details"]'), say: "Found a trip you like? Tap Explore options to book it." },
        ],
        "passenger-details": [
          { find: bySel('[data-action="go:payment"]'), say: "Once your details are in, continue to payment here." },
          { find: bySel('[data-action="go:verify-booking"]'), say: "Want snacks for the trip? Grab pasalubong here." },
        ],
        payment: [
          { find: bySel('[data-action="payment:gcash"]'), say: "Pick how you want to pay. GCash is the quickest." },
          { find: bySel('[data-action="payment:bank"]'), say: "Or pay straight from your bank account." },
          { find: bySel('[data-action="complete-payment"]'), say: "Then tap Complete Payment. Almost at sea!" },
        ],
        confirmation: [
          { find: bySel('[data-action="go:index"]'), say: "All booked! Head back home from here whenever you're ready." },
        ],
        bookings: [
          { find: bySel('[data-action="booking"]'), say: "Here are your trips. Tap one to see the details." },
          { find: bySel('[data-action="go:rebook"]'), say: "Plans changed? Rebook from here." },
          { find: bySel('[data-action="go:refund"]'), say: "Need your money back? Request a refund here." },
          { find: bySel('[data-action="addons"]'), say: "Add extras like pasalubong to your trip here." },
          { find: bySel('[data-action="share"]'), say: "Share your trip so your barkada knows when you sail." },
        ],
        pasalubong: [
          { find: bySel("#pz-chips"), say: "Filter by what you're craving: snacks, pastries, crafts or souvenirs." },
          { find: bySel(".pz-variants"), say: "Every item has options. Pick the one you like. Prices update right away." },
          { find: bySel(".pz-add, .pz-card .pz-stepper"), say: "Then tap Add to trip. It'll be waiting at your seat." },
          { find: bySel(".pz-pay-options"), say: "Done shopping? Choose GCash or Online Bank." },
          { find: bySel(".pz-pay-btn"), say: "And pay here. That's it. Mangoes secured." },
        ],
        rebook: [
          { find: bySel('[data-action="select-passengers"]'), say: "First, choose which passengers are rebooking." },
          { find: bySel('input[type="date"]'), say: "Then pick your new travel date." },
          { find: bySel('[data-action="reschedule"]'), say: "Happy with it? Confirm the reschedule here." },
        ],
        refund: [
          { find: bySel("textarea"), done: filled, say: "Tell us why you need a refund. Short and sweet is fine." },
          { find: bySel('[data-action="refund"]'), say: "Then send your refund request here." },
        ],
        settings: [
          { find: bySel('input[type="email"]'), say: "Update your email here." },
          { find: bySel('[data-action="profile"]'), say: "Save profile changes with this button." },
          { find: bySel('[data-action="password-info"]'), say: "Change your password here. Make it a good one." },
          { find: bySel('[data-action="payment-info"]'), say: "Save a payment method for faster checkout." },
          { find: bySel("select"), say: "Set your language and currency here. English or Filipino, pesos or dollars." },
        ],
        "verify-booking": [
          { find: bySel("#vb-bookings"), done: () => Boolean(document.querySelector('input[name="vb-booking"]:checked')), say: "Pick the trip you're shopping for." },
          { find: bySel("#surname"), done: filled, say: "Now the surname on the booking." },
          { find: byText("Continue to Shop"), say: "Then tap Continue to Shop. Snacks await!" },
        ],
      };
      const PRAISE = ["Nice!", "That's it!", "Look at you go!", "Perfect!", "Smooth sailing!"];

      let guide = null; // { steps, i, tour, el, off }
      function spotlight(el) {
        $$(".doode-spotlight").forEach((n) => n.classList.remove("doode-spotlight"));
        if (el) el.classList.add("doode-spotlight");
      }
      function guideSteps() {
        const sheetClosed = Boolean(tripSheet?.isMobile() && !tripSheet.isOpen());
        // Steps inside a closed bottom sheet are hidden now but become reachable once it opens.
        return (GUIDES[page] || []).map((s) => ({ ...s, el: s.find() })).filter((s) => s.el || (s.inSheet && sheetClosed));
      }
      const hasGuide = () => guideSteps().length > 0;
      function unwatchTarget() {
        guide?.off?.();
        if (guide) guide.off = null;
      }
      function endGuide() {
        unwatchTarget();
        guide = null;
        bubbleAvoid = null;
        spotlight(null);
        mascot.classList.remove("is-guiding");
      }
      function besidePosition(el) {
        const r = el.getBoundingClientRect();
        const s = SIZE();
        const gap = 10;
        let x;
        let y = r.top + r.height / 2 - s / 2;
        let faceRight = false;
        if (r.left - s - gap >= 8) {
          x = r.left - s - gap;
          faceRight = true; // on the left of the target, looking right at it
        } else if (r.right + gap + s <= window.innerWidth - 8) {
          x = r.right + gap;
        } else {
          x = r.left + r.width / 2 - s / 2;
          y = r.bottom + gap + s <= window.innerHeight - 8 ? r.bottom + gap : r.top - s - gap;
        }
        return { x, y, faceRight };
      }
      function startGuide(tour) {
        const steps = guideSteps();
        endGuide();
        if (!steps.length) return goIdle();
        let i = 0;
        if (!tour) {
          i = steps.findIndex((s) => !(s.done && s.done(s.el)));
          if (i < 0) i = steps.length - 1;
        }
        guide = { steps, i, tour };
        mascot.classList.add("is-guiding");
        showStep();
      }
      function showStep() {
        if (!guide) return;
        clearFlow();
        stopWander();
        hideBubble();
        unwatchTarget();
        spotlight(null);
        const step = guide.steps[guide.i];
        // A gate the user already passed (e.g. the planner is open) is skipped.
        if (step.gate && step.done?.()) return nextStep();
        const visible = (node) => node && node.isConnected && node.getClientRects().length;
        const el = (visible(step.el) && step.el) || step.find();
        if (!el) {
          if (step.inSheet && tripSheet?.isMobile() && !tripSheet.isOpen()) return needGate();
          return nextStep();
        }
        step.el = el;
        guide.el = el;
        setState("guiding"); // swimming pose
        el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
        later(() => {
          const p = besidePosition(el);
          const ms = reduceMotion ? 0 : clamp(Math.hypot(p.x - pos.x, p.y - pos.y) * 3.5, 700, 2200);
          mascot.classList.add("is-traveling");
          setPos(p.x, p.y, ms);
          later(() => {
            mascot.classList.remove("is-traveling");
            mascot.classList.toggle("is-inverted", p.faceRight);
            spotlight(el);
            bubbleAvoid = el;
            setState("pointing"); // lightbulb / pointing pose
            const n = guide.steps.length;
            const last = guide.i >= n - 1;
            const counter = guide.tour && n > 1 ? `(${guide.i + 1}/${n}) ` : "";
            const actions = step.gate
              ? [{ label: "Next", primary: true, run: tryPassGate }, { label: "Stop", run: finishGuide }]
              : guide.tour
                ? [last ? { label: "Done", primary: true, run: finishGuide } : { label: "Next", primary: true, run: nextStep }, { label: "Stop", run: finishGuide }]
                : [{ label: "Got it", primary: true, run: finishGuide }];
            const text = guide.override || step.say;
            guide.override = null;
            say(counter + text, actions);
            watchTarget(el);
          }, ms + 60);
        }, reduceMotion ? 50 : 450);
      }
      // Advance when the user actually uses the highlighted thing
      function watchTarget(el) {
        const isField = el.matches("input, select, textarea");
        const evt = isField ? "change" : "click";
        const handler = () => {
          if (!guide || guide.el !== el) return;
          unwatchTarget();
          spotlight(null);
          clearFlow();
          setState("talking");
          setSprite("happy");
          const passedGate = Boolean(guide.steps[guide.i]?.gate);
          say(pick(PRAISE), [], () =>
            later(() => ((guide?.tour || passedGate) && guide.i < guide.steps.length - 1 ? nextStep() : finishGuide(true)), passedGate ? 600 : 900),
          );
        };
        el.addEventListener(evt, handler, true);
        guide.off = () => el.removeEventListener(evt, handler, true);
      }
      // The user pressed "Next" without doing the gated action: Doode won't move on.
      const GATE_NUDGES = [
        "Nope! Tap the trip bar first. I can't show you the planner while it's closed.",
        "Hold on, sailor! Open the trip bar, then we keep going.",
        "I'll wait... the trip bar won't tap itself. Go on!",
        "Can't skip this one! Tap the white trip bar to open the planner.",
      ];
      function tryPassGate() {
        if (!guide) return;
        const step = guide.steps[guide.i];
        if (!step?.gate || step.done?.()) return nextStep();
        clearFlow();
        setSprite("questioning");
        mascot.classList.remove("is-nudging");
        void mascot.offsetWidth;
        mascot.classList.add("is-nudging");
        later(() => mascot.classList.remove("is-nudging"), 700);
        spotlight(guide.el);
        say(pickFresh(GATE_NUDGES), [{ label: "Next", primary: true, run: tryPassGate }, { label: "Stop", run: finishGuide }]);
      }
      // Send the tour back to the gate (e.g. the planner was closed mid-tour).
      function needGate(message) {
        if (!guide) return;
        const gateIndex = guide.steps.findIndex((s) => s.gate);
        if (gateIndex < 0) return nextStep();
        guide.i = gateIndex;
        guide.override = message || "The planner is closed! Tap the trip bar to open it so we can keep going.";
        showStep();
      }
      document.addEventListener("entree:trip-sheet", (event) => {
        if (!guide || event.detail?.open) return;
        const step = guide.steps[guide.i];
        if (step?.inSheet && tripSheet?.isMobile()) {
          setSprite("questioning");
          needGate(pick(["Whoa, you closed the planner! Tap the trip bar again so we can keep going.", "Hey, we weren't done! Open the trip bar again."]));
        }
      });
      function nextStep() {
        if (!guide) return;
        guide.i += 1;
        if (guide.i >= guide.steps.length) return finishGuide();
        showStep();
      }
      function finishGuide(quiet) {
        endGuide();
        clearFlow();
        if (quiet) return goIdle();
        setState("talking");
        setSprite("happy");
        say(pick(["You're a natural!", "Easy, right? I'll be around.", "Tour over. Tips accepted in dried mangoes."]), [], () => later(goIdle, 2200));
      }
      // Keep Doode next to the highlighted element while the page scrolls
      let guideRaf = 0;
      function followTarget() {
        if (!guide || state !== "pointing" || !guide.el) return;
        cancelAnimationFrame(guideRaf);
        guideRaf = requestAnimationFrame(() => {
          const p = besidePosition(guide.el);
          setPos(p.x, p.y, 180);
          mascot.classList.toggle("is-inverted", p.faceRight);
        });
      }
      document.addEventListener("scroll", followTarget, { passive: true, capture: true });
      window.addEventListener("resize", followTarget);

      // ---- Conversation flow: Quote1 -> Quote2 -> Quote3 -> Idle ----------
      function startChat(opener) {
        clearFlow();
        stopWander();
        const c = context();
        setState("talking");
        say(opener || buildQuote1(c), [], () => later(askQuestion, READ_AFTER_TYPING));
      }
      function askQuestion() {
        setState("questioning");
        const q = pickFresh(TEASE[page] || TEASE_GENERIC);
        const acts = [];
        if (hasGuide()) {
          acts.push({ label: "Show me", primary: true, run: () => startGuide(false) });
          acts.push({ label: "Give me a tour", run: () => startGuide(true) });
        }
        acts.push({ label: "Not now", run: () => suggest() });
        say(q, acts);
        later(suggest, QUESTION_MS);
      }
      function suggest() {
        clearFlow();
        setState("suggesting");
        const canTour = hasGuide();
        const pool = SUGGESTIONS.filter((s) => s.go !== page && (!s.tour || canTour));
        const s = pickFresh(pool.map((p) => p.text));
        const item = pool.find((p) => p.text === s);
        const actions = item?.tour
          ? [{ label: item.label, primary: true, run: () => startGuide(true) }]
          : item?.go
            ? [{ label: item.label, primary: true, run: () => go(item.go) }]
            : [];
        say(s, actions, () => later(goIdle, SUGGEST_MS));
      }
      function goIdle() {
        clearFlow();
        hideBubble();
        setState("idle");
        startWander(2500);
        armInactivity();
      }

      // ---- Appear / Close -------------------------------------------------
      let appearedOnce = false;
      function appear() {
        if (state !== "hidden") return;
        clearFlow();
        setPos(pos.x, pos.y, 0);
        mascot.classList.add("is-visible");
        setState("appearing");
        const opener = appearedOnce && closedByUser ? pick(HELLO_BACK_LINES) + " " + buildQuote1(context()) : null;
        appearedOnce = true;
        closedByUser = false;
        later(() => startChat(opener), APPEAR_MS);
      }
      let closedByUser = false;
      function close() {
        if (state === "hidden" || state === "closing") return;
        clearFlow();
        stopWander();
        endGuide();
        setState("closing");
        say(pick(["Bye! I'll be around...", "Fine, I'll go. *dramatic sigh*", "See you later, sailor!"]));
        later(() => {
          hideBubble();
          mascot.classList.remove("is-visible");
          setState("hidden");
          closedByUser = true;
          armInactivity();
        }, CLOSE_MS + 900);
      }
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        close();
      });
      closeBtn.addEventListener("pointerdown", (e) => e.stopPropagation());

      // ---- Wandering (idle only) ------------------------------------------
      let wanderTimer = null;
      function stopWander() {
        clearTimeout(wanderTimer);
        mascot.classList.remove("is-traveling");
      }
      function startWander(delay) {
        stopWander();
        if (reduceMotion) return;
        wanderTimer = setTimeout(function wander() {
          if (state !== "idle" || document.hidden) {
            wanderTimer = setTimeout(wander, 5000);
            return;
          }
          const b = bounds();
          const x = b.minX + Math.random() * Math.max(0, b.maxX - b.minX);
          const y = b.minY + Math.random() * Math.max(0, b.maxY - b.minY);
          const dist = Math.hypot(x - pos.x, y - pos.y);
          const ms = clamp(dist * 9, 1800, 6000);
          mascot.classList.add("is-traveling");
          setSprite("swimming");
          setPos(x, y, ms);
          setTimeout(() => {
            mascot.classList.remove("is-traveling");
            if (state === "idle") setSprite("idle");
            savePos();
          }, ms);
          wanderTimer = setTimeout(wander, ms + 4000 + Math.random() * 6000);
        }, delay);
      }

      // ---- Dragging -------------------------------------------------------
      let drag = null;
      if (mascotArt) {
        mascotArt.addEventListener("pointerdown", (e) => {
          if (state === "hidden" || state === "closing" || e.button > 0) return;
          drag = { sx: e.clientX, sy: e.clientY, ox: e.clientX - pos.x, oy: e.clientY - pos.y, moved: false, prev: state };
          mascotArt.setPointerCapture?.(e.pointerId);
        });
        mascotArt.addEventListener("pointermove", (e) => {
          if (!drag) return;
          if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
          if (!drag.moved) {
            drag.moved = true;
            endGuide();
            clearFlow();
            stopWander();
            hideBubble();
            setState("dragging");
          }
          setPos(e.clientX - drag.ox, e.clientY - drag.oy, 0);
        });
        const endDrag = () => {
          if (!drag) return;
          const wasDrag = drag.moved;
          drag = null;
          if (wasDrag) {
            savePos();
            setState("talking");
            setSprite("happy");
            say(pick(DRAG_LINES), [], () => later(goIdle, 2200));
          } else {
            reactToClick();
          }
        };
        mascotArt.addEventListener("pointerup", endDrag);
        mascotArt.addEventListener("pointercancel", endDrag);
        mascotArt.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            reactToClick();
          } else if (e.key === "Escape") close();
        });
      }
      function reactToClick() {
        mascotArt.classList.remove("is-clicked");
        void mascotArt.offsetWidth;
        mascotArt.classList.add("is-clicked");
        setTimeout(() => mascotArt.classList.remove("is-clicked"), 650);
        if (state === "idle") {
          // Clicking an idle Doode starts a fresh chat
          startChat();
        } else if (state === "talking" || state === "suggesting") {
          clearFlow();
          setState("talking");
          setSprite("happy");
          say(pick(CLICK_LINES), [], () => later(goIdle, 2500));
        }
      }

      // ---- Inactivity detection ------------------------------------------
      let idleTimer = null;
      function armInactivity() {
        clearTimeout(idleTimer);
        const wait = state === "hidden" ? (closedByUser ? REAPPEAR_IDLE : FIRST_APPEAR_IDLE) : CHAT_AGAIN_IDLE;
        idleTimer = setTimeout(() => {
          if (document.hidden) return armInactivity();
          if (state === "hidden") appear();
          else if (state === "idle") startChat();
          else armInactivity();
        }, wait);
      }
      let lastPing = 0;
      function onActivity(e) {
        if (e && e.target instanceof Node && mascot.contains(e.target)) return;
        const now = Date.now();
        if (now - lastPing < 200) return;
        lastPing = now;
        armInactivity(); // activity only restarts the countdown — it never hides Doode
      }
      ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"].forEach((evt) =>
        window.addEventListener(evt, onActivity, { passive: true }),
      );
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) armInactivity();
      });
      window.addEventListener("resize", () => setPos(pos.x, pos.y, 0));

      armInactivity();

      // Handy for testing in the console: Doode.appear(), Doode.close(), Doode.state()
      window.Doode = { appear, close, chat: () => startChat(), tour: () => startGuide(true), show: () => startGuide(false), state: () => state };
    }
  } catch (e) {
    // Mascot is non-critical; log but don't break the page
    console.warn("Mascot controller error:", e);
  }
})();
