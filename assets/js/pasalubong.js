/* Scripts for pages/pasalubong.html (the pasalubong shop).
   Loaded before app.js; app.js runs this once the page is ready and passes in the
   shared helpers (see "Shared with the page scripts" in app.js). */
window.ENTREE_PAGES = window.ENTREE_PAGES || {};
window.ENTREE_PAGES["pasalubong"] = (E) => {
  const { $, $$, data, escape, store, markSaved, markUnsaved, notice, booking, peso, PAY_METHODS } = E;
  let cart = [];
  setupShop();

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
    const tripDate = trip?.departureDate ? new Date(trip.departureDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "your travel day";
    const tripBox = $("#pz-trip");
    if (tripBox && trip?.route) {
      tripBox.innerHTML =
        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>` +
        `<span>Shopping for <strong>${escape(verification?.reference || trip.reference)}</strong> · ${escape(trip.route.origin)} → ${escape(trip.route.destination)} · ${escape(tripDate)}${verification?.name ? ` · Ordered by <strong>${escape(verification.name)}</strong>` : ""}</span>` +
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
        <div class="pz-media" data-media="${p.id}">
          <img class="pz-photo" src="${escape(p.images[photo])}" alt="${escape(p.name)}" loading="lazy" draggable="false" />
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
      [...slides.keys()].forEach(settleSlide);
      const list = visibleProducts();
      grid.innerHTML = list.map(cardHTML).join("");
      $("#pz-noresults").hidden = list.length > 0;
      if (focusKey) $(`[data-focus="${focusKey}"]`, grid)?.focus({ preventScroll: true });
    }
    // ---- Photo carousel: the next photo slides in from the side you pressed ----
    // Only the one card's photo is animated (no grid re-render), using the Web
    // Animations API on transform, so it's smooth on desktop, Android, iPhone
    // and iPad alike. Rapid taps finish the current slide and start the next.
    const photoMotionOff = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const SLIDE_MS = 420;
    const SLIDE_EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";
    const slides = new Map(); // productId -> { anims, out, token }
    // Warm the cache so a photo never slides in blank.
    const preloaded = new Set();
    function preload(src) {
      if (!src || preloaded.has(src)) return;
      preloaded.add(src);
      const img = new Image();
      img.decoding = "async";
      img.src = src;
    }
    const warmPhotos = () => products.forEach((p) => p.images.forEach(preload));
    if (document.readyState === "complete") setTimeout(warmPhotos, 300);
    else window.addEventListener("load", () => setTimeout(warmPhotos, 300), { once: true });

    function settleSlide(id) {
      const s = slides.get(id);
      if (!s) return;
      s.anims.forEach((a) => a.cancel());
      s.out?.remove();
      s.in && (s.in.style.transform = "");
      slides.delete(id);
    }
    function slidePhoto(id, dir) {
      const product = products.find((p) => p.id === id);
      if (!product || product.images.length < 2) return;
      const n = product.images.length;
      shop.photo[id] = (shop.photo[id] + dir + n) % n;
      const idx = shop.photo[id];
      const media = $(`[data-media="${id}"]`, grid);
      if (!media) return;
      $$(".pz-dots span", media).forEach((d, i) => d.classList.toggle("is-on", i === idx));
      settleSlide(id);
      const current = $(".pz-photo", media);
      const next = document.createElement("img");
      next.className = "pz-photo";
      next.alt = product.name;
      next.draggable = false;
      next.decoding = "async";
      next.src = product.images[idx];
      if (!current || photoMotionOff() || !next.animate) {
        current ? current.replaceWith(next) : media.prepend(next);
        return;
      }
      const token = {};
      next.style.transform = `translateX(${dir * 100}%)`;
      current.after(next);
      slides.set(id, { anims: [], out: current, in: next, token });
      // Wait (briefly) for the new photo to be ready so it never slides in empty.
      const ready = next.decode ? next.decode().catch(() => {}) : Promise.resolve();
      Promise.race([ready, new Promise((r) => setTimeout(r, 350))]).then(() => {
        const s = slides.get(id);
        if (!s || s.token !== token) return; // superseded by a newer tap
        const opts = { duration: SLIDE_MS, easing: SLIDE_EASE, fill: "forwards" };
        const outAnim = current.animate([{ transform: "translateX(0)" }, { transform: `translateX(${-dir * 100}%)` }], opts);
        const inAnim = next.animate([{ transform: `translateX(${dir * 100}%)` }, { transform: "translateX(0)" }], opts);
        s.anims = [outAnim, inAnim];
        inAnim.onfinish = () => {
          if (slides.get(id)?.token === token) settleSlide(id);
        };
      });
    }
    // Swipe left / right on a photo (phones, tablets, iPads).
    let swipe = null;
    grid.addEventListener("touchstart", (e) => {
      const media = e.target.closest(".pz-media");
      if (!media || e.touches.length !== 1 || e.target.closest("button")) return (swipe = null);
      swipe = { id: Number(media.dataset.media), x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });
    grid.addEventListener("touchend", (e) => {
      if (!swipe) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - swipe.x;
      const dy = t.clientY - swipe.y;
      const id = swipe.id;
      swipe = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) slidePhoto(id, dx < 0 ? 1 : -1);
    }, { passive: true });
    grid.addEventListener("touchcancel", () => (swipe = null), { passive: true });

    grid.addEventListener("click", (e) => {
      const b = e.target.closest("[data-pz]");
      if (!b) return;
      const [act, a, c] = b.dataset.pz.split(":");
      const product = products.find((p) => p.id === Number(a));
      let focus = b.dataset.focus;
      if (act === "photo") return slidePhoto(Number(a), Number(c));
      if (act === "variant") {
        shop.selected[a] = Number(c);
        // Options with their own photo show it straight away.
        const pick = product?.menu.find((m) => m.id === Number(c));
        if (pick && Number.isInteger(pick.photoIndex)) shop.photo[a] = pick.photoIndex;
      }
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
          image: variant.image || product.images[0],
          price: variant.price,
          quantity: 1,
        });
      markUnsaved();
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
              <a class="pz-btn-primary" href="bookings.html${trip?.id ? `?addons=${encodeURIComponent(trip.id)}` : ""}">View my add-ons</a>
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
            booking: verification?.reference || trip?.reference || "",
            name: verification?.name || "",
            onBooking: verification ? verification.onBooking !== false : true,
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
  return {
    isDirty: () => cart.length > 0,
  };
};
