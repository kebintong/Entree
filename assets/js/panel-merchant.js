/* Entree merchant panel: overview, pasalubong orders to deliver, and the
   merchant's own products (add, edit, remove). Each merchant account sees only
   its own shop. */
(() => {
  "use strict";
  const P = window.ENTREE_PANEL;
  if (!P) return;
  const s = P.require("merchant");
  if (!s) return;
  const { esc, peso, pesoShort, fmtDate, badge, kpi, empty, toast } = P;

  // The shop this account manages (it may have no products yet).
  const merchant = s.merchant;
  if (!merchant) { P.signOut(); return; }

  const STATUSES = [["new", "New"], ["preparing", "Preparing"], ["ready", "Ready for boarding"], ["delivered", "Delivered"]];
  const key = (o) => `${o.ref}|${merchant}`;
  // Orders that include at least one of this merchant's items (only their lines kept).
  function myOrders() {
    return P.orders()
      .map((o) => ({ ...o, lines: o.lines.filter((l) => l.merchant === merchant) }))
      .filter((o) => o.lines.length)
      .map((o) => ({ ...o, subtotal: o.lines.reduce((n, l) => n + l.qty * l.price, 0), status: P.catalog.orderStatus(key(o)) }));
  }
  const myProducts = () => P.products().filter((p) => p.merchant === merchant);

  function orderTable(list, editable = true) {
    if (!list.length) return empty("No orders yet. Orders placed in the Pasalubong shop show up here.");
    return `<table class="pn-table">
      <thead><tr><th>Order</th><th>Deliver to</th><th>Items</th><th class="num">Subtotal</th><th>Status</th></tr></thead>
      <tbody>${list.map((o) => `<tr>
        <td><span class="pn-ref">${esc(o.ref)}</span><small>Placed ${fmtDate(o.placedAt)}</small></td>
        <td>${esc(o.name)}<small>Booking ${esc(o.bookingRef)}${o.travelDate ? ` · sails ${fmtDate(o.travelDate)}` : ""}${o.ferry ? ` · ${esc(o.ferry)}` : ""}</small></td>
        <td>${o.lines.map((l) => `${l.qty} × ${esc(l.name)}`).join("<br>")}</td>
        <td class="num">${peso(o.subtotal)}</td>
        <td>${editable
          ? `<select class="pn-select" data-order="${esc(key(o))}" aria-label="Status of ${esc(o.ref)}">${STATUSES.map(([v, t]) => `<option value="${v}" ${o.status === v ? "selected" : ""}>${t}</option>`).join("")}</select>`
          : badge(o.status)}</td></tr>`).join("")}</tbody></table>`;
  }

  function overview(el) {
    const orders = myOrders();
    const prods = myProducts();
    const variants = prods.flatMap((p) => p.menu.map((m) => ({ ...m, hidden: p.hidden })));
    const open = orders.filter((o) => o.status === "new" || o.status === "preparing");
    el.innerHTML = `
      <div class="pn-kpis">
        ${kpi("Orders", orders.length, `${orders.filter((o) => o.status === "new").length} new`)}
        ${kpi("Items sold", orders.reduce((n, o) => n + o.lines.reduce((t, l) => t + l.qty, 0), 0))}
        ${kpi("Sales", pesoShort(orders.reduce((n, o) => n + o.subtotal, 0)))}
        ${kpi("Options in the shop", `${variants.filter((v) => v.available !== false && !v.hidden).length}/${variants.length}`, `${prods.length} product${prods.length === 1 ? "" : "s"}`)}
      </div>
      <section class="pn-card">
        <div class="pn-card-head"><div><h2>To prepare</h2><p>New and in-progress orders, handed to travellers at their seat</p></div><a class="pn-btn pn-btn-sm" href="#orders">All orders</a></div>
        <div class="pn-table-wrap">${open.length ? orderTable(open, false) : empty("You're all caught up.")}</div>
      </section>
      <section class="pn-card">
        <div class="pn-card-head"><div><h2>Your products</h2><p>How they look to travellers in the Pasalubong shop</p></div><a class="pn-btn pn-btn-sm" href="#products">Manage products</a></div>
        <div class="pn-card-body">${prods.length ? `<div class="pn-product-grid">${prods.slice(0, 3).map(productCard).join("")}</div>` : empty("No products yet. Add one under Products.")}</div>
      </section>`;
    el.addEventListener("click", (e) => { if (e.target.closest("[data-edit]")) location.hash = "products"; });
    el.addEventListener("change", (e) => {
      const vis = e.target.closest("[data-visible]");
      if (vis) { P.catalog.updateProduct(Number(vis.dataset.visible), { hidden: !vis.checked }); toast(vis.checked ? "Back in the shop." : "Hidden from the shop."); }
    });
  }

  function ordersSection(el) {
    el.innerHTML = `
      <section class="pn-card">
        <div class="pn-card-head">
          <div><h2>Orders</h2><p>Update the status as you prepare and hand over each order.</p></div>
          <div class="pn-toolbar"><select class="pn-select" data-filter aria-label="Filter by status"><option value="">All statuses</option>${STATUSES.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></div>
        </div>
        <div class="pn-table-wrap" data-table></div>
      </section>`;
    const filter = el.querySelector("[data-filter]");
    const draw = () => {
      el.querySelector("[data-table]").innerHTML = orderTable(myOrders().filter((o) => !filter.value || o.status === filter.value));
    };
    filter.addEventListener("change", draw);
    el.addEventListener("change", (e) => {
      const sel = e.target.closest("[data-order]");
      if (!sel) return;
      P.catalog.setOrderStatus(sel.dataset.order, sel.value);
      toast(`Order ${sel.dataset.order.split("|")[0]} marked “${sel.options[sel.selectedIndex].text}”.`);
      if (filter.value) draw();
    });
    draw();
  }

  /* ----------------------------------------------------------- products */
  const CATEGORIES = (window.ENTREE_DATA.PRODUCT_CATEGORIES || []).filter((c) => c.id !== "all");
  const categorySelect = (value) => `<select class="pn-select" name="category" required>${value ? "" : '<option value="">Choose a category</option>'}${CATEGORIES.map((c) => `<option value="${esc(c.id)}"${c.id === value ? " selected" : ""}>${esc(c.label)}</option>`).join("")}</select>`;
  const CAMERA = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>';
  // An option's own photo slot (shown in the shop when a traveller picks that option).
  const optionPhoto = (src) => `<span class="pn-opt-photo${src ? " has-photo" : ""}">
      <label title="${src ? "Change this option's photo" : "Add a photo for this option"}">${src ? `<img src="${esc(src)}" alt="" />` : CAMERA}<input type="file" accept="image/jpeg,image/png,image/webp" data-opt-photo class="pn-visually-hidden" aria-label="Photo for this option" /></label>
      ${src ? '<button type="button" data-clear-opt-photo aria-label="Remove this option\'s photo" title="Remove photo">×</button>' : ""}
      <input type="hidden" name="option-image" value="${esc(src || "")}" />
    </span>`;
  const optionRow = (m = {}) => `<div class="pn-variant pn-option${m.available === false ? " is-off" : ""}"${m.id ? ` data-option="${esc(m.id)}"` : " data-new"}>
      ${optionPhoto(m.image)}
      <input class="pn-input" name="option-name" value="${esc(m.name || "")}" maxlength="60" placeholder="Option, e.g. 250 g pack" aria-label="Option name" />
      <span class="pn-money"><input class="pn-input" type="number" min="1" step="1" name="option-price" value="${esc(m.price ?? "")}" placeholder="0" aria-label="Price" /></span>
      <label class="pn-toggle"><input type="checkbox" name="option-stock" ${m.available !== false ? "checked" : ""} /><span class="pn-toggle-track"></span>In stock</label>
      <button type="button" class="pn-icon-btn" data-drop-option aria-label="Remove this option" title="Remove option">×</button>
    </div>`;

  // Shrink an uploaded photo so it fits in the browser's storage.
  function readPhoto(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error("Use a JPG, PNG or WebP photo."));
      if (file.size > 15 * 1024 * 1024) return reject(new Error("That photo is too large (15 MB max)."));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 640 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file couldn't be read as a photo.")); };
      img.src = url;
    });
  }
  // Read the option rows of a product form.
  const readOptions = (form) => [...form.querySelectorAll(".pn-option")].map((row) => ({
    row,
    id: row.dataset.option ? Number(row.dataset.option) : null,
    removed: row.hidden,
    name: row.querySelector('[name="option-name"]').value.trim(),
    price: row.querySelector('[name="option-price"]').value,
    available: row.querySelector('[name="option-stock"]').checked,
    image: row.querySelector('[name="option-image"]').value,
  }));
  function checkOptions(options) {
    const live = options.filter((o) => !o.removed);
    if (!live.length) return "Keep at least one option.";
    const bad = live.find((o) => !o.name || !(Number(o.price) > 0));
    if (bad) return bad.name ? `Set a price above ₱0 for ${bad.name}.` : "Every option needs a name.";
    return "";
  }

  // Product list: what travellers see, as cards. Editing happens in a side panel.
  const STATE_TAG = { live: ["In the shop", "good"], soldout: ["Sold out", "warn"], hidden: ["Hidden", "muted"] };
  const stateOf = (p) => (p.hidden ? "hidden" : p.menu.length && p.menu.every((m) => m.available === false) ? "soldout" : "live");
  const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || "Other";
  const fromPrice = (p) => {
    const prices = p.menu.filter((m) => m.available !== false).map((m) => Number(m.price)).filter(Boolean);
    const all = prices.length ? prices : p.menu.map((m) => Number(m.price)).filter(Boolean);
    return all.length ? Math.min(...all) : 0;
  };

  function productCard(p) {
    const st = stateOf(p);
    const out = p.menu.filter((m) => m.available === false).length;
    return `<article class="pn-pcard${st === "hidden" ? " is-hidden" : ""}">
      <button type="button" class="pn-pcard-img" data-edit="${p.id}" aria-label="Edit ${esc(p.name)}">
        <img src="${esc(p.images?.[0] || "")}" alt="" loading="lazy" />
        <span class="pn-badge pn-badge-${STATE_TAG[st][1]}">${STATE_TAG[st][0]}</span>
        ${p.images.length > 1 ? `<span class="pn-photo-count">${P.icon("overview", 12)}${p.images.length} photos</span>` : ""}
      </button>
      <div class="pn-pcard-body">
        <p class="pn-pcard-cat">${esc(catLabel(p.category))}</p>
        <h3>${esc(p.name)}</h3>
        ${p.description ? `<p class="pn-pcard-desc">${esc(p.description)}</p>` : ""}
        <p class="pn-pcard-price">from <strong>${peso(fromPrice(p))}</strong><span> · ${p.menu.length} option${p.menu.length === 1 ? "" : "s"}${out ? ` · ${out} sold out` : ""}</span></p>
        <ul class="pn-pcard-opts">${p.menu.map((m) => `<li${m.available === false ? ' class="is-off"' : ""}>${m.image ? `<img src="${esc(m.image)}" alt="" />` : ""}${esc(m.name)} <span>${peso(m.price)}</span></li>`).join("")}</ul>
      </div>
      <footer class="pn-pcard-foot">
        <button type="button" class="pn-btn pn-btn-sm" data-edit="${p.id}">Edit</button>
        <label class="pn-toggle"><input type="checkbox" data-visible="${p.id}" ${p.hidden ? "" : "checked"} /><span class="pn-toggle-track"></span>Show in shop</label>
      </footer>
    </article>`;
  }

  function productsSection(el, actions) {
    let filter = "all";
    actions.innerHTML = `<a class="pn-btn" href="pasalubong.html">${P.icon("globe", 16)}<span>View the shop</span></a><button type="button" class="pn-btn pn-btn-primary" data-add>${P.icon("plus", 16)}<span>Add product</span></button>`;
    el.innerHTML = `
      <div class="pn-filters"><div data-chips></div><input class="pn-input pn-search" type="search" placeholder="Search your products" aria-label="Search your products" data-q /></div>
      <div data-grid></div>`;
    const q = el.querySelector("[data-q]");
    const draw = () => {
      const all = myProducts();
      const text = q.value.trim().toLowerCase();
      const base = all.filter((p) => !text || `${p.name} ${p.description || ""} ${p.menu.map((m) => m.name).join(" ")}`.toLowerCase().includes(text));
      const list = base.filter((p) => filter === "all" || stateOf(p) === filter);
      el.querySelector("[data-chips]").innerHTML = P.chips([["all", "All"], ["live", "In the shop"], ["soldout", "Sold out"], ["hidden", "Hidden"]].map(([id, label]) => ({ id, label, count: id === "all" ? base.length : base.filter((p) => stateOf(p) === id).length })), filter);
      el.querySelector("[data-grid]").innerHTML = list.length
        ? `<div class="pn-product-grid">${list.map(productCard).join("")}</div>`
        : all.length
          ? `<section class="pn-card"><div class="pn-card-body">${empty("No products match.")}</div></section>`
          : `<section class="pn-card pn-empty-cta"><h2>Add your first product</h2><p>Travellers order pasalubong before their trip and get it at their seat. Add a photo, a name and at least one option with a price.</p><button type="button" class="pn-btn pn-btn-primary" data-add>${P.icon("plus", 16)}<span>Add product</span></button></section>`;
    };
    const onClick = (e) => {
      if (e.target.closest("[data-chip]")) { filter = e.target.closest("[data-chip]").dataset.chip; draw(); return; }
      if (e.target.closest("[data-add]")) { editor(null, draw); return; }
      const edit = e.target.closest("[data-edit]");
      if (edit) editor(Number(edit.dataset.edit), draw);
    };
    el.addEventListener("click", onClick);
    actions.addEventListener("click", onClick);
    el.addEventListener("change", (e) => {
      const vis = e.target.closest("[data-visible]");
      if (!vis) return;
      const p = myProducts().find((x) => x.id === Number(vis.dataset.visible));
      P.catalog.updateProduct(p.id, { hidden: !vis.checked });
      toast(vis.checked ? `${p.name} is back in the shop.` : `${p.name} is hidden from the shop.`);
      draw();
    });
    q.addEventListener("input", draw);
    draw();
  }

  // Add / edit a product in the side panel.
  function editor(id, done) {
    const p = id == null ? null : myProducts().find((x) => x.id === id);
    const MAX = 5;
    let photos = p ? p.photos.slice(0, MAX) : [];
    const galleryHTML = () => `${photos.map((src, i) => `<figure class="pn-thumb${i === 0 ? " is-cover" : ""}">
          <img src="${esc(src)}" alt="Photo ${i + 1}" />
          ${i === 0 ? '<span class="pn-cover">Cover</span>' : ""}
          <span class="pn-thumb-btns">
            ${i > 0 ? `<button type="button" data-photo-move="${i}:-1" aria-label="Move photo ${i + 1} left" title="Move left">‹</button>` : ""}
            ${i < photos.length - 1 ? `<button type="button" data-photo-move="${i}:1" aria-label="Move photo ${i + 1} right" title="Move right">›</button>` : ""}
            <button type="button" data-photo-remove="${i}" aria-label="Remove photo ${i + 1}" title="Remove">×</button>
          </span>
        </figure>`).join("")}${photos.length < MAX ? `<label class="pn-thumb pn-thumb-add">${P.icon("plus", 18)}<span>${photos.length ? "Add more" : "Add photos"}</span><input type="file" multiple accept="image/jpeg,image/png,image/webp" data-photos class="pn-visually-hidden" /></label>` : ""}`;
    const form = `<form class="pn-product-editor" id="pn-product-form" novalidate>
        <div>
          <p class="pn-subhead">Photos <span class="pn-sub">· up to ${MAX}, the first is the cover</span></p>
          <div class="pn-gallery" data-gallery>${galleryHTML()}</div>
        </div>
        <label class="pn-field"><span>Product name</span><input class="pn-input" name="name" value="${esc(p?.name || "")}" maxlength="80" placeholder="e.g. Ube Polvoron" required /></label>
        <label class="pn-field"><span>Category</span>${categorySelect(p?.category || "")}</label>
        <label class="pn-field"><span>Description</span><textarea class="pn-input pn-textarea" name="description" maxlength="240" rows="3" placeholder="What makes it a great pasalubong?">${esc(p?.description || "")}</textarea></label>
        <div>
          <p class="pn-subhead">Options &amp; prices <span class="pn-sub">· tap ${CAMERA.replace('width="18" height="18"', 'width="13" height="13"')} to give an option its own photo</span></p>
          <div class="pn-variants" data-options>${(p ? p.menu : [{}]).map(optionRow).join("")}</div>
          <button type="button" class="pn-link-btn" data-more-option>+ Add option</button>
        </div>
        <label class="pn-toggle"><input type="checkbox" name="visible" ${p?.hidden ? "" : "checked"} /><span class="pn-toggle-track"></span>Show in shop</label>
        <p class="pn-field-error" data-error role="alert"></p>
      </form>`;
    const foot = `<button type="submit" form="pn-product-form" class="pn-btn pn-btn-primary">${p ? "Save changes" : "Add to shop"}</button>
      <button type="button" class="pn-btn" data-close>Cancel</button>
      ${p ? '<button type="button" class="pn-btn pn-btn-danger pn-push-right" data-remove-product>Remove product</button>' : ""}`;
    const d = P.drawer({ eyebrow: p ? "Edit product" : "New product", title: p ? p.name : "Add a product", body: form, foot });
    const root = d.el;
    const error = (msg) => { root.querySelector("[data-error]").textContent = msg; };

    const paintGallery = () => { root.querySelector("[data-gallery]").innerHTML = galleryHTML(); };
    root.addEventListener("change", async (e) => {
      const many = e.target.closest("[data-photos]");
      if (many) {
        const files = [...many.files].slice(0, MAX - photos.length);
        error([...many.files].length > files.length ? `Only ${MAX} photos per product — the extra ones were skipped.` : "");
        for (const file of files) {
          try { photos.push(await readPhoto(file)); } catch (err) { error(err.message); }
        }
        paintGallery();
        return;
      }
      const one = e.target.closest("[data-opt-photo]");
      if (one) {
        try {
          const src = await readPhoto(one.files[0]);
          const slot = one.closest(".pn-opt-photo");
          slot.outerHTML = optionPhoto(src);
          error("");
        } catch (err) { error(err.message); }
        return;
      }
      const stock = e.target.closest('[name="option-stock"]');
      if (stock) stock.closest(".pn-option").classList.toggle("is-off", !stock.checked);
    });
    root.addEventListener("click", (e) => {
      const move = e.target.closest("[data-photo-move]");
      if (move) {
        const [i, dir] = move.dataset.photoMove.split(":").map(Number);
        [photos[i], photos[i + dir]] = [photos[i + dir], photos[i]];
        paintGallery();
        return;
      }
      const drop = e.target.closest("[data-photo-remove]");
      if (drop) { photos.splice(Number(drop.dataset.photoRemove), 1); paintGallery(); return; }
      const clear = e.target.closest("[data-clear-opt-photo]");
      if (clear) { clear.closest(".pn-opt-photo").outerHTML = optionPhoto(""); return; }
      if (e.target.closest("[data-more-option]")) {
        const box = root.querySelector("[data-options]");
        box.insertAdjacentHTML("beforeend", optionRow());
        box.lastElementChild.querySelector("input").focus();
        return;
      }
      const dropOpt = e.target.closest("[data-drop-option]");
      if (dropOpt) {
        const row = dropOpt.closest(".pn-option");
        if (root.querySelectorAll(".pn-option:not([hidden])").length === 1) { error("A product needs at least one option."); return; }
        if (row.dataset.new !== undefined) row.remove(); else row.hidden = true; // saved options are removed on Save
        return;
      }
      const remove = e.target.closest("[data-remove-product]");
      if (remove) {
        if (!remove.dataset.armed) {
          remove.dataset.armed = "1";
          remove.textContent = "Click again to remove";
          setTimeout(() => { if (remove.isConnected) { delete remove.dataset.armed; remove.textContent = "Remove product"; } }, 3500);
          return;
        }
        P.catalog.removeProduct(p.id);
        toast(`${p.name} removed from the shop.`);
        d.close();
        done();
      }
    });
    root.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target.elements;
      const options = readOptions(e.target);
      const problem = !f.name.value.trim() ? "Give the product a name." : !f.category.value ? "Choose a category." : checkOptions(options);
      if (problem) { error(problem); return; }
      if (!p) {
        const live = options.filter((o) => !o.removed);
        const result = P.catalog.addProduct(merchant, { name: f.name.value, category: f.category.value, description: f.description.value, images: photos, options: live.map((o) => ({ name: o.name, price: o.price, image: o.image })) });
        if (!result.ok) { error(result.error); return; }
        live.forEach((o, i) => { if (!o.available) P.catalog.updateVariant(result.product.menu[i].id, { available: false }); });
        if (!f.visible.checked) P.catalog.updateProduct(result.product.id, { hidden: true });
        toast(`${result.product.name} added${f.visible.checked ? " to the shop" : " (hidden from the shop)"}.`);
      } else {
        const saved = P.catalog.updateProduct(p.id, { name: f.name.value, category: f.category.value, description: f.description.value, images: photos, hidden: !f.visible.checked });
        if (saved === false) { error("This browser's photo storage is full. Use fewer or smaller photos."); return; }
        let full = false;
        options.forEach((o) => {
          if (o.id && o.removed) P.catalog.removeOption(o.id);
          else if (o.id) full = P.catalog.updateVariant(o.id, { name: o.name, price: o.price, available: o.available, image: o.image }) === false || full;
          else if (!o.removed) {
            const r = P.catalog.addOption(p.id, { name: o.name, price: o.price, image: o.image });
            if (!r.ok) full = true;
            else if (!o.available) P.catalog.updateVariant(r.option.id, { available: false });
          }
        });
        if (full) { error("Some option photos couldn't be saved — this browser's photo storage is full."); done(); return; }
        toast(`${f.name.value.trim()} saved — the shop is updated.`);
      }
      d.close();
      done();
    });
    setTimeout(() => root.querySelector('[name="name"]')?.focus(), 50);
  }

  P.mount({
    session: s,
    roleLabel: "Merchant",
    subject: merchant,
    badges: () => ({ orders: { count: myOrders().filter((o) => o.status === "new").length, tone: "warn" } }),
    nav: [
      { id: "overview", label: "Overview", icon: "overview" },
      { id: "orders", label: "Orders", icon: "receipt" },
      { id: "products", label: "Products", icon: "box", title: "Your products" },
    ],
    render(id, el, actions) {
      ({ overview, orders: ordersSection, products: productsSection })[id](el, actions);
    },
  });
})();
