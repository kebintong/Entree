/* ==========================================================================
   Entree — Motion (light)
   Loaded last on every page. Purely presentational: it never changes text,
   values or navigation. Nothing runs continuously — work only happens when
   something scrolls into view or the visitor does something.

   - Homepage sea parallax (two CSS variables, set only on mouse move)
   - Scroll reveals (float up, once)
   - Springy press + click ripple on primary buttons
   - Booked-trip pulse and total bumps
   - Pasalubong item flies into the cart
   - Short confetti burst on the booking confirmation
   ========================================================================== */
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  var body = doc.body;
  if (!body || typeof window.matchMedia !== "function") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var page = body.getAttribute("data-page") || "";
  var hasIO = "IntersectionObserver" in window;
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };

  /* ----------------------------------------------------------------------
     Scroll reveals
     ---------------------------------------------------------------------- */
  var REVEAL = [
    ".bf-heading", ".bf-search-context", ".bf-trip", ".bf-trip-sidebar > .bf-card",
    ".bf-page > .bf-card", ".bc-hero", ".bc-layout .bf-card",
    ".pz-card", ".bk-card",
    ".signup-card", ".settings-card", ".settings-card-2", ".refund-card", ".refund-card-2",
    ".rebook-card", ".rebook-card-2", ".guide-card", ".guide-card-2"
  ].join(",");

  var observer = null;
  var settled = false; // after load, re-rendered content just appears (no replay)
  setTimeout(function () { settled = true; }, 1200);

  function onScreen(el) {
    var r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  }

  function reveal(el) {
    el.classList.add("is-revealed");
    setTimeout(function () {
      el.removeAttribute("data-reveal");
      el.classList.remove("is-revealed");
      el.style.removeProperty("--reveal-delay");
    }, 1300);
  }

  function tagReveals(scope) {
    if (!observer || !scope.querySelectorAll) return;
    var count = new Map();
    each(scope.querySelectorAll(REVEAL), function (el) {
      if (el.hasAttribute("data-motion-seen")) return;
      el.setAttribute("data-motion-seen", "");
      if (settled && onScreen(el)) return;
      var n = count.get(el.parentElement) || 0;
      count.set(el.parentElement, n + 1);
      el.setAttribute("data-reveal", "");
      el.style.setProperty("--reveal-delay", Math.min(n, 5) * 80 + "ms");
      observer.observe(el);
    });
  }

  if (hasIO) {
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        reveal(entry.target);
      });
    }, { rootMargin: "0px 0px -5% 0px" });
    root.classList.add("motion-ready");
    tagReveals(doc);
  }

  /* ----------------------------------------------------------------------
     Springy press on primary buttons
     ---------------------------------------------------------------------- */
  var PRESS = ".hero-search-cta, .bf-primary, .bf-book-button, .pz-add, .pz-pay-btn, .pz-btn-primary, button[type='submit']";
  function tagPress(scope) {
    if (scope.querySelectorAll) each(scope.querySelectorAll(PRESS), function (b) { b.classList.add("motion-press"); });
  }
  tagPress(doc);


  /* ----------------------------------------------------------------------
     Homepage: gentle parallax on the sea + pause it when off-screen
     (CSS does the animating; this only sets two variables on mouse move)
     ---------------------------------------------------------------------- */
  var hero = doc.querySelector(".entree-hero-section");
  if (hero) {
    if (hasIO) {
      new IntersectionObserver(function (entries) {
        hero.classList.toggle("is-offscreen", !entries[0].isIntersecting);
      }).observe(hero);
    }
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      var pending = null;
      hero.addEventListener("pointermove", function (e) {
        if (pending) return;
        pending = requestAnimationFrame(function () {
          pending = null;
          var r = hero.getBoundingClientRect();
          hero.style.setProperty("--px", (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
          hero.style.setProperty("--py", (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
        });
      }, { passive: true });
      hero.addEventListener("pointerleave", function () {
        hero.style.setProperty("--px", 0);
        hero.style.setProperty("--py", 0);
      });
    }
  }

  /* ----------------------------------------------------------------------
     Click ripple inside primary buttons
     ---------------------------------------------------------------------- */
  doc.addEventListener("pointerdown", function (e) {
    var btn = e.target.closest && e.target.closest(PRESS + ", .entree-login-btn, .entree-pasalubong-btn, .travel-type-pill, .pz-chip");
    if (!btn || btn.disabled) return;
    var ink = btn.querySelector(":scope > .motion-ink");
    if (!ink) {
      if (getComputedStyle(btn).position === "static") btn.style.position = "relative";
      btn.classList.add("motion-has-ink");
      ink = doc.createElement("span");
      ink.className = "motion-ink";
      ink.setAttribute("aria-hidden", "true");
      var m = (getComputedStyle(btn).backgroundColor || "").match(/[\d.]+/g);
      var light = !m || (m.length > 3 && +m[3] < 0.2) || (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255 > 0.8;
      if (light) ink.classList.add("is-dark");
      btn.insertBefore(ink, btn.firstChild);
    }
    var r = btn.getBoundingClientRect();
    var dot = doc.createElement("i");
    dot.style.setProperty("--x", e.clientX - r.left + "px");
    dot.style.setProperty("--y", e.clientY - r.top + "px");
    dot.style.setProperty("--d", Math.max(r.width, r.height) * 2.2 + "px");
    ink.appendChild(dot);
    setTimeout(function () { dot.remove(); }, 700);
  }, { passive: true });

  /* ----------------------------------------------------------------------
     Feedback: booked trip pulse, total bumps
     ---------------------------------------------------------------------- */
  function selectedKeys() {
    var keys = {};
    each(doc.querySelectorAll(".bf-trip.is-selected .bf-book-button"), function (b) {
      keys[(b.getAttribute("data-clear-trip") || "") + ":" + (b.getAttribute("data-ferry-id") || "")] = b;
    });
    return keys;
  }
  var lastSelected = selectedKeys();

  var BUMP = ".bf-total dd, .pz-summary-total dd, #pz-cart-count, #pz-mobilebar-total";
  function bumpTexts() {
    return Array.prototype.map.call(doc.querySelectorAll(BUMP), function (el) { return { el: el, text: el.textContent }; });
  }
  var lastBump = bumpTexts();

  function flash(el, cls, ms) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(function () { el.classList.remove(cls); }, ms);
  }

  function afterChanges() {
    var now = selectedKeys();
    Object.keys(now).forEach(function (k) {
      var card = !lastSelected[k] && now[k].closest(".bf-trip");
      if (card) flash(card, "motion-pop", 650);
    });
    lastSelected = now;

    var next = bumpTexts();
    next.forEach(function (item, i) {
      var prev = lastBump[i];
      if (prev && prev.text !== item.text && item.el.offsetParent !== null) flash(item.el, "motion-bump", 500);
    });
    lastBump = next;
  }

  if ("MutationObserver" in window) {
    var queued = false;
    new MutationObserver(function (records) {
      records.forEach(function (rec) {
        each(rec.addedNodes, function (n) {
          if (n.nodeType !== 1) return;
          tagReveals(n);
          tagPress(n);
        });
      });
      if (!queued) {
        queued = true;
        requestAnimationFrame(function () { queued = false; afterChanges(); });
      }
    }).observe(body, { childList: true, subtree: true });
  }

  /* ----------------------------------------------------------------------
     Pasalubong: the item flies into your add-ons
     ---------------------------------------------------------------------- */
  if (page === "pasalubong" && typeof Element.prototype.animate === "function") {
    doc.addEventListener("click", function (e) {
      var add = e.target.closest && e.target.closest('[data-pz^="add:"]');
      var card = add && add.closest(".pz-card");
      if (!card) return;
      var img = card.querySelector(".pz-media img, img");
      var usable = img && img.complete && img.naturalWidth;
      var from = (usable ? img : card.querySelector(".pz-media")) || add;
      var fr = from.getBoundingClientRect();
      var src = usable ? img.currentSrc || img.src : null;

      requestAnimationFrame(function () {
        var bar = doc.getElementById("pz-mobilebar");
        var target = bar && !bar.hidden && bar.offsetParent !== null ? bar : doc.querySelector(".pz-cart-icon");
        if (!target) return;
        var tr = target.getBoundingClientRect();
        var size = Math.min(fr.width, fr.height, 120);
        var flyer = doc.createElement(src ? "img" : "div");
        if (src) { flyer.src = src; flyer.alt = ""; }
        else flyer.style.background = "linear-gradient(135deg, #C2F800, #007f70)";
        flyer.className = "motion-flyer";
        flyer.setAttribute("aria-hidden", "true");
        flyer.style.width = flyer.style.height = size + "px";
        flyer.style.left = fr.left + fr.width / 2 - size / 2 + "px";
        flyer.style.top = fr.top + fr.height / 2 - size / 2 + "px";
        body.appendChild(flyer);
        var dx = tr.left + tr.width / 2 - (fr.left + fr.width / 2);
        var dy = tr.top + tr.height / 2 - (fr.top + fr.height / 2);
        var anim = flyer.animate([
          { transform: "translate(0,0) scale(1)", opacity: 1 },
          { transform: "translate(" + dx + "px," + dy + "px) scale(0.15)", opacity: 0.3 }
        ], { duration: 600, easing: "cubic-bezier(.5,0,.25,1)" });
        anim.onfinish = function () {
          flyer.remove();
          flash(target, "motion-cart-hit", 500);
        };
      });
    }, true);
  }

  /* ----------------------------------------------------------------------
     Confirmation: one short confetti burst
     ---------------------------------------------------------------------- */
  if (page === "confirmation") {
    setTimeout(function () {
      if (!doc.querySelector(".bc-hero")) return; // only once a booking is confirmed
      var c = doc.createElement("canvas");
      c.className = "motion-confetti";
      c.setAttribute("aria-hidden", "true");
      var ctx = c.getContext && c.getContext("2d");
      if (!ctx) return;
      body.appendChild(c);
      var W = window.innerWidth, H = window.innerHeight;
      c.width = W; c.height = H;
      var colors = ["#C2F800", "#007f70", "#22d3ee", "#0b6f6a"];
      var parts = [];
      for (var i = 0; i < 70; i++) {
        var left = i % 2 === 0;
        parts.push({
          x: left ? 0 : W, y: H * 0.7,
          vx: (left ? 1 : -1) * (5 + Math.random() * 7), vy: -(9 + Math.random() * 9),
          s: 5 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
          color: colors[i % colors.length]
        });
      }
      var start = performance.now();
      (function tick(t) {
        var age = (t - start) / 1000;
        ctx.clearRect(0, 0, W, H);
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 1.6) / 0.6);
        parts.forEach(function (p) {
          p.vy += 0.4; p.x += p.vx; p.y += p.vy; p.r += p.vr;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.r);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 1.4);
          ctx.restore();
        });
        if (age < 2.2) requestAnimationFrame(tick);
        else c.remove();
      })(start);
    }, 300);
  }
})();
