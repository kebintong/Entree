/* Entree — partner catalog store (demo)
   Changes made in the staff panels (shipping-line schedules and fares,
   merchant products, order statuses, refund decisions) are saved on this
   device and layered over assets/js/data.js before any page script runs.
   Load order on every page: data.js → catalog-store.js → everything else.

   This is a front-end demo store: it lives in the browser's localStorage,
   so changes only show on the device where they were made. A real
   deployment would read and write the same shapes through a server API. */
(() => {
  "use strict";
  const KEY = "entree.catalog.v1";
  const data = window.ENTREE_DATA;
  if (!data) return;

  // added: products merchants created · options: options merchants added to a product
  // hidden: partners whose account an admin deactivated ({ shipping: { id: true }, merchant: { slug: true } })
  const blank = () => ({ companies: {}, variants: {}, products: {}, added: [], options: {}, hidden: { shipping: {}, merchant: {} }, orderStatus: {}, updatedAt: null });
  function read() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY));
      if (!value || typeof value !== "object") return blank();
      const out = { ...blank(), ...value };
      if (!Array.isArray(out.added)) out.added = [];
      if (!out.options || typeof out.options !== "object") out.options = {};
      if (!out.hidden || typeof out.hidden !== "object") out.hidden = { shipping: {}, merchant: {} };
      out.hidden = { shipping: { ...(out.hidden.shipping || {}) }, merchant: { ...(out.hidden.merchant || {}) } };
      return out;
    } catch {
      return blank();
    }
  }
  // Returns false when the browser refuses to save (storage full or blocked).
  function write(state) {
    state.updatedAt = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
  }

  // Keep the untouched catalog so the panels can show "original" values and reset.
  const original = {
    companies: JSON.parse(JSON.stringify(data.SHIPPING_COMPANIES || [])),
    products: JSON.parse(JSON.stringify(data.PRODUCTS || [])),
  };

  // Simple branded tile for products without a photo.
  function placeholder(name) {
    const letter = String(name || "?").trim().charAt(0).toUpperCase().replace(/[^A-Z0-9]/, "?");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="600" height="600" fill="#f7ffd6"/><circle cx="300" cy="300" r="120" fill="#c2f800"/><text x="300" y="300" dy=".35em" text-anchor="middle" font-family="Poppins, Arial, sans-serif" font-size="140" font-weight="600" fill="#051821">${letter}</text></svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  const slugOf = (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const CATEGORIES = (data.PRODUCT_CATEGORIES || []).map((c) => c.id).filter((id) => id !== "all");
  const cleanText = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const cleanImage = (v) => (typeof v === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(v) && v.length < 900000 ? v : null);
  const MAX_PHOTOS = 5;
  // A product's gallery: new uploads, or photos it already had (in any order).
  const cleanGallery = (list, current = []) => (Array.isArray(list) ? list : [])
    .filter((src, i, all) => all.indexOf(src) === i && (cleanImage(src) || current.includes(src)))
    .slice(0, MAX_PHOTOS);
  const nextId = (ids, floor) => Math.max(floor, ...ids.map(Number).filter(Number.isFinite)) + 1;
  const allProductIds = () => [...original.products, ...state.added].map((p) => p.id);
  const allOptionIds = () => [...original.products, ...state.added].flatMap((p) => [...p.menu, ...(state.options[p.id] || [])].map((m) => m.id));

  const COMPANY_FIELDS = ["departure", "arrival", "duration", "price", "returnDeparture", "returnArrival", "returnPrice", "overnightReturn", "active", "capacity"];
  const time = (v) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  const money = (v) => Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) < 1e6;

  function cleanCompanyPatch(patch) {
    const out = {};
    for (const key of COMPANY_FIELDS) {
      if (!(key in patch)) continue;
      const v = patch[key];
      if (["departure", "arrival", "returnDeparture", "returnArrival"].includes(key) && time(v)) out[key] = v;
      else if (["price", "returnPrice"].includes(key) && money(v)) out[key] = Math.round(Number(v) * 100) / 100;
      else if (key === "capacity" && Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) <= 2000) out[key] = Number(v);
      else if (key === "duration" && typeof v === "string") out[key] = v.trim().slice(0, 20);
      else if (["overnightReturn", "active"].includes(key)) out[key] = Boolean(v);
    }
    return out;
  }

  // Apply saved overrides onto window.ENTREE_DATA (customer pages see the result).
  function apply(state) {
    const companies = original.companies.map((c) => ({ capacity: 80, active: true, ...c, ...(state.companies[c.id] || {}), suspended: Boolean(state.hidden.shipping[c.id]) }));
    data.ALL_SHIPPING_COMPANIES = companies;
    // Customers only see shipping lines that are accepting bookings and whose
    // account is active (always keep at least one).
    const live = companies.filter((c) => c.active !== false && !c.suspended);
    data.SHIPPING_COMPANIES = live.length ? live : companies.slice(0, 1);

    // Every product ever listed, removed ones included (flagged), so past orders
    // still know which merchant sold what.
    data.ALL_PRODUCTS = [...original.products, ...state.added].map((p) => {
      const info = state.products[p.id] || {};
      const menu = [...p.menu, ...(state.options[p.id] || [])].map((m) => ({ available: true, ...m, ...(state.variants[m.id] || {}) }));
      const live = menu.filter((m) => !m.removed);
      const first = live.find((m) => m.available !== false) || live[0];
      const out = { ...p, ...info, menu, price: first ? first.price : p.price, merchantHidden: Boolean(state.hidden.merchant[slugOf(p.merchant)]) };
      // photos: the product's own gallery (up to 5). images: what the shop's
      // carousel shows — the gallery, then each option's own photo, so picking
      // an option can jump to its picture (option.photoIndex).
      out.photos = (out.images || []).filter((src) => src && !String(src).startsWith("data:image/svg+xml"));
      const shown = out.photos.slice();
      out.menu = out.menu.map((m) => {
        if (!m.image || m.removed) return m;
        let i = shown.indexOf(m.image);
        if (i < 0) i = shown.push(m.image) - 1;
        return { ...m, photoIndex: i };
      });
      out.images = shown.length ? shown : [placeholder(out.name)];
      return out;
    });
    // The shop shows only products and options that are listed and in stock.
    data.PRODUCTS = data.ALL_PRODUCTS
      .filter((p) => p.hidden !== true && p.removed !== true && !p.merchantHidden)
      .map((p) => ({ ...p, menu: p.menu.filter((m) => m.available !== false && m.removed !== true) }))
      .filter((p) => p.menu.length);
  }

  let state = read();
  apply(state);

  window.ENTREE_CATALOG = {
    original: () => JSON.parse(JSON.stringify(original)),
    state: () => JSON.parse(JSON.stringify(state)),
    updateCompany(id, patch) {
      if (!original.companies.some((c) => c.id === id)) return null;
      state.companies[id] = { ...(state.companies[id] || {}), ...cleanCompanyPatch(patch || {}) };
      write(state);
      apply(state);
      return data.ALL_SHIPPING_COMPANIES.find((c) => c.id === id);
    },
    resetCompany(id) {
      delete state.companies[id];
      write(state);
      apply(state);
    },
    updateVariant(id, patch = {}) {
      const out = {};
      if (typeof patch.name === "string" && patch.name.trim()) out.name = cleanText(patch.name, 60);
      // An option's own photo: a new upload, the same photo again, or "" to remove it.
      if ("image" in patch) out.image = cleanImage(patch.image) || null;
      if ("price" in patch && money(patch.price)) out.price = Math.round(Number(patch.price) * 100) / 100;
      if ("available" in patch) out.available = Boolean(patch.available);
      state.variants[id] = { ...(state.variants[id] || {}), ...out };
      const saved = write(state);
      apply(state);
      return saved;
    },
    updateProduct(id, patch = {}) {
      const out = {};
      if (typeof patch.name === "string" && patch.name.trim()) out.name = cleanText(patch.name, 80);
      if (typeof patch.description === "string") out.description = cleanText(patch.description, 240);
      if (CATEGORIES.includes(patch.category)) out.category = patch.category;
      if (Array.isArray(patch.images)) {
        const current = data.ALL_PRODUCTS.find((p) => p.id === id)?.photos || [];
        out.images = cleanGallery(patch.images, current);
      } else if (cleanImage(patch.image)) out.images = [cleanImage(patch.image)];
      if ("hidden" in patch) out.hidden = Boolean(patch.hidden);
      state.products[id] = { ...(state.products[id] || {}), ...out };
      const saved = write(state);
      apply(state);
      return saved;
    },
    // A merchant adds a product: { name, description, category, image, options: [{ name, price }] }.
    addProduct(merchant, input = {}) {
      const name = cleanText(input.name, 80);
      const options = (input.options || []).map((o) => ({ name: cleanText(o.name, 60), price: Number(o.price), image: cleanImage(o.image) })).filter((o) => o.name || o.price);
      if (!merchant) return { ok: false, error: "Sign in as a merchant to add products." };
      if (!name) return { ok: false, error: "Give the product a name." };
      if (!CATEGORIES.includes(input.category)) return { ok: false, error: "Choose a category." };
      if (!options.length) return { ok: false, error: "Add at least one option with a price." };
      const bad = options.find((o) => !o.name || !money(o.price));
      if (bad) return { ok: false, error: bad.name ? `Set a price above ₱0 for ${bad.name}.` : "Every option needs a name." };
      let optionId = nextId(allOptionIds(), 9000);
      const product = {
        id: nextId(allProductIds(), 900), name, merchant, category: input.category, currency: "PHP",
        description: cleanText(input.description, 240), images: cleanGallery(input.images || [input.image]),
        menu: options.map((o) => ({ id: optionId++, name: o.name, price: Math.round(o.price * 100) / 100, ...(o.image ? { image: o.image } : {}) })),
        createdAt: new Date().toISOString(),
      };
      product.price = product.menu[0].price;
      state.added.push(product);
      if (!write(state)) {
        state.added.pop();
        return { ok: false, error: "This browser couldn't save the product — its photo storage is full. Use fewer photos." };
      }
      apply(state);
      return { ok: true, product: data.ALL_PRODUCTS.find((p) => p.id === product.id) };
    },
    // Add an option (size, flavour…) to an existing product.
    addOption(productId, input = {}) {
      const product = data.ALL_PRODUCTS.find((p) => p.id === productId);
      const name = cleanText(input.name, 60);
      if (!product || !name || !money(input.price)) return { ok: false, error: "Give the new option a name and a price above ₱0." };
      const option = { id: nextId(allOptionIds(), 9000), name, price: Math.round(Number(input.price) * 100) / 100, ...(cleanImage(input.image) ? { image: cleanImage(input.image) } : {}) };
      state.options[productId] = [...(state.options[productId] || []), option];
      if (!write(state)) {
        state.options[productId].pop();
        return { ok: false, error: "This browser's photo storage is full. Use fewer photos." };
      }
      apply(state);
      return { ok: true, option };
    },
    // Removed products and options leave the shop for good but stay on record for past orders.
    removeOption(id) {
      state.variants[id] = { ...(state.variants[id] || {}), removed: true };
      write(state);
      apply(state);
    },
    removeProduct(id) {
      state.products[id] = { ...(state.products[id] || {}), removed: true, removedAt: new Date().toISOString() };
      write(state);
      apply(state);
    },
    // Called by accounts.js when an admin deactivates or reactivates a partner.
    setPartnerHidden(role, id, hidden) {
      if (!["shipping", "merchant"].includes(role) || !id) return;
      if (hidden) state.hidden[role][id] = true;
      else delete state.hidden[role][id];
      write(state);
      apply(state);
    },
    orderStatus: (key) => state.orderStatus[key] || "new",
    setOrderStatus(key, status) {
      if (!["new", "preparing", "ready", "delivered"].includes(status)) return;
      state.orderStatus[key] = status;
      write(state);
    },
  };
})();
