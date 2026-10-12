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
  let pageScript = {}; // the current page's script (assets/js/<page>.js)
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
    data.MOCK_BOOKINGS.find((b) => b.id === selectedId) || data.MOCK_BOOKINGS[0] || null;
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

  const initialFieldValues = new Map();

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

    // Page-specific changes: cart items, a chosen payment or ferry, edited trip dates...
    if (pageScript.isDirty?.()) return true;

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
    panel: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 13h8V3H3z"/><path d="M13 21h8V11h-8z"/><path d="M13 3v6h8V3z"/><path d="M3 21h8v-6H3z"/></svg>',
    bell: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg>',
    chevron: '<svg class="account-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>',
    calendar: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>',
    bag: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    user: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    gear: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    logout: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>',
  };
  const DEMO_NOTIFICATIONS = [
    { id: "n2", title: "Pasalubong deal", text: "Dried mangoes are 10% off when you add them to your trip.", href: "verify-booking.html" },
  ];
  const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  // Whoever is logged in: a client, or a partner/admin visiting the customer site.
  const currentUser = () => window.ENTREE_ACCOUNTS?.currentUser?.() || (store.get("session")?.email ? { role: "customer", ...store.get("session") } : null);
  function sessionInfo() {
    const s = currentUser() || {};
    const email = s.email || "";
    const local = email.split("@")[0] || "Guest";
    const name = (s.name || local.replace(/[._-]+/g, " ")).trim();
    const pretty = name.replace(/\b\w/g, (c) => c.toUpperCase());
    return { name: pretty, email, initial: (pretty[0] || "?").toUpperCase(), roleLabel: s.roleLabel || "", panel: s.panel || "", panelName: s.panelName || "" };
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

  if (currentUser()) {
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
    // The home page's "Have an account? Log in or Sign up" line.
    const helper = $(".booking-widget-bottom > div");
    if (helper) {
      const info = sessionInfo();
      helper.innerHTML = `<span class="home-have-account-text">Logged in as </span><strong>${escHtml(info.name)}</strong><span class="home-have-account-text"> · </span>` +
        (info.panel ? `<a class="home-login-link" href="${escHtml(info.panel)}">Open ${escHtml(info.panelName)}</a>` : `<a class="home-login-link" href="bookings.html">My Bookings</a>`);
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
      `<div class="user-menu-head"><p class="user-menu-name">${escHtml(info.name)}</p><p class="user-menu-email">${escHtml(info.email)}</p>${info.panel ? `<p class="user-menu-email">${escHtml(info.roleLabel)}</p>` : ""}</div>` +
        `<div class="user-menu-list">` +
        (info.panel ? `<a href="${escHtml(info.panel)}" class="user-menu-panel">${ICONS.panel}<span>Open ${escHtml(info.panelName)}</span></a>` : "") +
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
      pageScript.submit?.(form);
    });
  });

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

  // Fill the "Current Booking" card on the reschedule and refund pages.
  function showCurrentBooking() {
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
    return b;
  }

  // ==========================================================================
  // Shared with the page scripts (assets/js/<page>.js)
  // Each page script registers itself in window.ENTREE_PAGES and gets these
  // helpers. It can return: submit(form), actions, isDirty(), beforeGo(),
  // onCounter(), onDraftRestored() and tripSheet (home page).
  // ==========================================================================
  const E = {
    $, $$, page, data, escape, store, markSaved, markUnsaved: () => (isSaved = false), initialFieldValues,
    openModal, closeModal, attachModalAttention, confirmUnsavedChanges, navigateTo, go, text, allText,
    notice, dialog, enable, action, booking, selectedId, getPhilippineDate, formError, peso, PAY_METHODS,
    showCurrentBooking,
  };
  // Rescheduling and refunds need a booking; with none on this device, say so instead.
  const noBooking = ["rebook", "refund"].includes(page) && !booking();
  if (noBooking) {
    $("main").innerHTML = `<div class="bf-page"><section class="bf-card bf-no-booking"><h2>No booking to ${page === "rebook" ? "reschedule" : "refund"}</h2><p>Bookings you make on this device show up in My Bookings, where you can reschedule or ask for a refund.</p><div class="bf-no-booking-actions"><a class="bf-primary" href="bookings.html">My Bookings</a><a href="index.html">Book a trip</a></div></section></div>`;
  }
  pageScript = noBooking ? {} : window.ENTREE_PAGES?.[page]?.(E) || {};


  // Snapshot initial values for change detection
  snapshotInitialState();
  document.addEventListener("entree:draft-restored", () => {
    pageScript.onDraftRestored?.();
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
      if (pageScript.beforeGo?.(arg) === false) return;
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
      pageScript.onCounter?.();
    } else if (name === "account") accountMenu();
    else if (name === "notifications") notificationsMenu();
    else if (name === "logout") {
      markSaved();
      // One log-out for the whole site, whether a client or a partner is logged in.
      if (window.ENTREE_ACCOUNTS?.signOut) window.ENTREE_ACCOUNTS.signOut();
      else store.set("session", null);
      store.remove("verification");
      navigateTo("index");
    } else if (name === "print") window.print();
    else if (name === "copy-trip") {
      try {
        await navigator.clipboard.writeText($("dialog").innerText);
        notice("Trip details copied.");
      } catch {
        notice("Copy is unavailable here. Use Print to save the trip.");
      }
    } else if (name === "close-dialog") {
      const d = $("dialog");
      if (d) {
        store.remove("active_product_id");
        closeModal(d);
        d.remove();
      }
    } else await pageScript.actions?.[name]?.(el, arg, amount, id);
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

  // Helpers the Doode mascot (assets/js/turtle.js) needs from this file
  window.ENTREE_APP = { go, allText, tripSheet: pageScript.tripSheet || null };
})();
