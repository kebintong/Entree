/* Entree — accounts (demo)
   One sign-in for everyone. Every account has a role, and the role decides
   where the person goes after signing in:
     customer → the booking site · admin → admin.html
     shipping → shipping-panel.html · merchant → merchant-panel.html

   - Customers sign themselves up (signup.html). Booking never needs an account.
   - Shipping lines and merchants can only join through an invite link that an
     admin creates (signup.html?invite=…). There is no public partner sign-up.
   - Admins see customers with their contact details masked, can suspend or
     reactivate customer accounts, deactivate partners (which also hides
     their trips or products), and every admin action is kept in an
     activity log.
   - Admins come in two levels: the super admin (owner) can also invite and
     deactivate other admins; admin staff handle day-to-day work. New admins
     join through an invite link, like partners.

   Load order on every page: data.js → catalog-store.js → accounts.js → …

   DEMO ONLY: accounts, invites and the log live in this browser's
   localStorage, and the role checks run in the browser, so this is not real
   security. A server must own accounts, sessions, invites and permissions
   before launch. Demo passwords are stored here only as salted SHA-256
   hashes; the plain passwords are listed in the developer panel. */
(() => {
  "use strict";
  const data = window.ENTREE_DATA || {};
  const KEY = "entree.accounts.v1";
  const STAFF_KEY = "entree.staff.v1"; // staff session (shared with the customer site)
  const CUSTOMER_KEY = "entree.session"; // customer session (read by app.js)
  const INVITE_DAYS = 7;
  const PANEL_FOR = { admin: "admin.html", shipping: "shipping-panel.html", merchant: "merchant-panel.html" };
  const ROLE_LABEL = { customer: "Customer", admin: "Admin", shipping: "Shipping line", merchant: "Merchant" };
  const LEVEL_LABEL = { super: "Super admin", staff: "Admin staff" };

  const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
  const now = () => new Date().toISOString();
  const norm = (email) => String(email || "").trim().toLowerCase();
  const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const slug = (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  /* ---------------------------------------------------------- SHA-256 */
  // Small synchronous SHA-256 so passwords are never stored in plain text.
  const sha256 = (() => {
    const primes = [];
    for (let n = 2; primes.length < 64; n++) if (primes.every((p) => n % p)) primes.push(n);
    const frac = (x) => ((x - Math.floor(x)) * 0x100000000) >>> 0;
    const H0 = primes.slice(0, 8).map((p) => frac(Math.sqrt(p)));
    const K = primes.map((p) => frac(Math.cbrt(p)));
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    return (text) => {
      const utf8 = unescape(encodeURIComponent(String(text)));
      const bytes = [];
      for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));
      const bitLength = bytes.length * 8;
      bytes.push(0x80);
      while (bytes.length % 64 !== 56) bytes.push(0);
      for (let i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (bitLength >>> (i * 8)) & 0xff);
      const h = H0.slice();
      const w = new Array(64);
      for (let off = 0; off < bytes.length; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3];
        for (let i = 16; i < 64; i++) {
          const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
          const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
          w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i++) {
          const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
          const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
          hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        [a, b, c, d, e, f, g, hh].forEach((v, i) => { h[i] = (h[i] + v) | 0; });
      }
      return h.map((v) => (v >>> 0).toString(16).padStart(8, "0")).join("");
    };
  })();
  const hashPassword = (password, salt) => sha256(`${salt}:${password}`);
  function randomId(length = 24) {
    const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const values = safe(() => crypto.getRandomValues(new Uint32Array(length)), null);
    return Array.from({ length }, (_, i) => chars[(values ? values[i] : Math.floor(Math.random() * 2 ** 32)) % chars.length]).join("");
  }

  /* ---------------------------------------------------------- demo accounts */
  // Exactly one demo account per role. Guests never need one: booking and
  // pasalubong work without logging in.
  const SEED = [
    { email: "admin@entree.ph", role: "admin", level: "super", name: "Entree Admin", salt: "seed-admin", hash: "34d9c5694eaa9c5fb2a38fafc8edebb8e0dd40c79d39369b7aa4db1fba4529d0" },
    { email: "shipping@entree.ph", role: "shipping", companyId: "supercat", name: "Supercat Operations", salt: "seed-shipping", hash: "6f84c40a7d1618785c74729f1aec5ae1614a396c3fdc505cd6decf8743653fa4" },
    { email: "merchant@entree.ph", role: "merchant", merchant: "Cebu Best Sweets", name: "Cebu Best Sweets", salt: "seed-merchant", hash: "ca3f92bbd1291733ff79cac030e7922d106a794ee1a7276266e95d71dfa1d3b2" },
    { email: "client@entree.ph", role: "customer", name: "Juan Dela Cruz", phone: "+63 917 555 0134", salt: "seed-client", hash: "fff9817f566024424a555b58fe3f522b0375a1b66747e64b488d76e46e8a5ddf" },
  ].map((a) => ({ ...a, via: "demo", createdAt: "2026-09-01T09:00:00+08:00" }));

  /* ---------------------------------------------------------- storage */
  const blank = () => ({ users: [], invites: [], status: {}, log: [] });
  function read() {
    const value = safe(() => JSON.parse(localStorage.getItem(KEY)), null);
    if (!value || typeof value !== "object") return blank();
    const out = { ...blank(), ...value };
    ["users", "invites", "log"].forEach((k) => { if (!Array.isArray(out[k])) out[k] = []; });
    if (!out.status || typeof out.status !== "object") out.status = {};
    return out;
  }
  let state = read();
  function write() {
    safe(() => localStorage.setItem(KEY, JSON.stringify(state)));
  }

  /* ---------------------------------------------------------- partners */
  const companies = () => data.ALL_SHIPPING_COMPANIES || data.SHIPPING_COMPANIES || [];
  const merchantNames = () => [...new Set((data.ALL_PRODUCTS || data.PRODUCTS || []).map((p) => p.merchant))];
  // Businesses an invite can be for: the shipping lines and merchants in the catalog.
  function partners(role) {
    if (role === "shipping") return companies().map((c) => ({ role, id: c.id, name: c.name }));
    if (role === "merchant") return merchantNames().map((m) => ({ role, id: slug(m), name: m }));
    return [];
  }
  const partnerId = (a) => (a.role === "shipping" ? a.companyId : a.role === "merchant" ? slug(a.merchant) : null);
  function partnerName(a) {
    if (a.role === "shipping") return companies().find((c) => c.id === a.companyId)?.name || a.companyId;
    if (a.role === "merchant") return a.merchant;
    return a.role === "admin" ? "Entree" : "";
  }

  /* ---------------------------------------------------------- accounts */
  function allAccounts() {
    const stored = state.users.filter((u) => !SEED.some((s) => s.email === u.email));
    return [...SEED, ...stored].map((a) => ({ ...a, status: state.status[a.email]?.status || a.status || "active" }));
  }
  const findRaw = (email) => allAccounts().find((a) => a.email === norm(email)) || null;
  // Public view of an account: never includes the password hash or salt.
  function publicAccount(a) {
    if (!a) return null;
    const { hash: _h, salt: _s, ...rest } = a;
    const out = { ...rest, label: partnerName(a) || a.name, partnerId: partnerId(a), reason: state.status[a.email]?.reason || "" };
    if (a.role === "admin") out.level = a.level === "super" ? "super" : "staff";
    return out;
  }
  const find = (email) => publicAccount(findRaw(email));
  const accountFor = (role, id) => allAccounts().find((a) => a.role === role && partnerId(a) === id) || null;

  /* ---------------------------------------------------------- privacy */
  // Admin views never show a customer's full name, email or phone.
  const mask = {
    name: (v) => String(v || "").trim().split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + "•••").join(" ") || "—",
    email(v) {
      const [user, domain] = String(v || "").split("@");
      return domain ? `${user.slice(0, 1)}•••@${domain}` : v ? "•••" : "—";
    },
    phone(v) {
      const s = String(v || "");
      const total = (s.match(/\d/g) || []).length;
      if (!total) return "—";
      let seen = 0;
      const keepFront = s.trim().startsWith("+") ? 2 : 0;
      return s.replace(/\d/g, (d) => (++seen <= keepFront || seen > total - 2 ? d : "•"));
    },
  };

  /* ---------------------------------------------------------- activity log */
  const actorOf = (s) => (s ? { name: s.name, role: s.role, email: s.email } : { name: "System", role: "system", email: "" });
  function record(actor, action, text) {
    state.log.unshift({ id: randomId(10), at: now(), actor: actorOf(actor), action, text: String(text) });
    state.log = state.log.slice(0, 300);
    write();
  }

  /* ---------------------------------------------------------- sessions */
  // One log-in for the whole site: a partner or admin who opens the customer
  // site is still logged in there (and logging out anywhere logs out everywhere).
  // Staff sessions live in localStorage like customer sessions; they end as soon
  // as the account is deactivated or removed.
  safe(() => sessionStorage.removeItem(STAFF_KEY)); // older versions kept it per tab
  function staffSession() {
    const s = safe(() => JSON.parse(localStorage.getItem(STAFF_KEY)), null);
    if (!s || !s.email) return null;
    const a = findRaw(s.email);
    if (!a || a.role !== s.role || a.status === "suspended") {
      safe(() => localStorage.removeItem(STAFF_KEY));
      return null;
    }
    return s;
  }
  const customerSession = () => safe(() => JSON.parse(localStorage.getItem(CUSTOMER_KEY)), null);
  function startSession(a) {
    if (a.role === "customer") {
      safe(() => localStorage.removeItem(STAFF_KEY));
      safe(() => localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ email: a.email, name: a.name })));
    } else {
      safe(() => localStorage.removeItem(CUSTOMER_KEY));
      const p = publicAccount(a);
      safe(() => localStorage.setItem(STAFF_KEY, JSON.stringify({ email: p.email, role: p.role, level: p.level, name: p.name, label: p.label, companyId: p.companyId, merchant: p.merchant })));
    }
    return publicAccount(a);
  }
  function signOutStaff() {
    safe(() => localStorage.removeItem(STAFF_KEY));
  }
  function signOut() {
    safe(() => localStorage.removeItem(STAFF_KEY));
    safe(() => localStorage.setItem(CUSTOMER_KEY, "null"));
  }
  // Whoever is logged in on this browser, for the customer-site header.
  const PANEL_NAME = { admin: "Admin panel", shipping: "Shipping-line panel", merchant: "Merchant panel" };
  function currentUser() {
    const s = staffSession();
    if (s) return { role: s.role, name: s.name, email: s.email, roleLabel: s.role === "admin" ? LEVEL_LABEL[s.level === "super" ? "super" : "staff"] : `${ROLE_LABEL[s.role]} · ${s.label}`, panel: PANEL_FOR[s.role], panelName: PANEL_NAME[s.role] };
    const c = customerSession();
    return c && c.email ? { role: "customer", name: c.name || "", email: c.email, roleLabel: "Client" } : null;
  }
  // Where an account goes after signing in.
  const homeFor = (role) => PANEL_FOR[role] || "index.html";

  const WRONG = "That email and password don't match an account.";
  function signIn(email, password) {
    const a = findRaw(email);
    // Same message for an unknown email and a wrong password, so the form can't
    // be used to find out who has an account.
    if (!a || hashPassword(password, a.salt) !== a.hash) return { ok: false, error: WRONG };
    if (a.status === "suspended") return { ok: false, error: a.role === "customer"
      ? "This account is suspended. Contact support@entree.ph if you think this is a mistake."
      : "This account has been deactivated. Contact your Entree contact if you think this is a mistake." };
    const account = startSession(a);
    if (a.role !== "customer") record(account, "sign-in", `${account.name} signed in`);
    return { ok: true, account, home: homeFor(a.role) };
  }

  function signUp({ firstName = "", lastName = "", email = "", phone = "", password = "" } = {}) {
    const address = norm(email);
    if (!validEmail(address)) return { ok: false, error: "Enter a valid email address." };
    if (String(password).length < 8) return { ok: false, error: "Use at least 8 characters for your password." };
    if (findRaw(address)) return { ok: false, error: "An account already uses this email. Log in instead." };
    const salt = randomId(16);
    const a = { email: address, role: "customer", name: `${firstName} ${lastName}`.trim() || address.split("@")[0], phone: String(phone).trim(), salt, hash: hashPassword(password, salt), via: "signup", createdAt: now() };
    state.users.push(a);
    write();
    return { ok: true, account: startSession(a), home: homeFor("customer") };
  }

  /* ---------------------------------------------------------- invites */
  const isExpired = (i) => i.status === "pending" && Date.parse(i.expiresAt) < Date.now();
  const inviteStatus = (i) => (isExpired(i) ? "expired" : i.status);
  const publicInvite = (i) => ({ ...i, status: inviteStatus(i), url: inviteUrl(i.token) });
  function inviteUrl(token) {
    return safe(() => new URL(`signup.html?invite=${encodeURIComponent(token)}`, location.href).href, `signup.html?invite=${token}`);
  }
  const requireAdmin = () => {
    const s = staffSession();
    return s && s.role === "admin" ? s : null;
  };
  const isSuper = (s) => Boolean(s && s.role === "admin" && findRaw(s.email)?.level === "super");
  const requireSuper = () => { const s = requireAdmin(); return isSuper(s) ? s : null; };

  function createInvite({ role, partnerId: id, email } = {}) {
    const admin = requireAdmin();
    if (!admin) return { ok: false, error: "Only an admin can send invites." };
    if (role === "admin") return createAdminInvite(email);
    if (!["shipping", "merchant"].includes(role)) return { ok: false, error: "Choose a shipping line or merchant." };
    const partner = partners(role).find((p) => p.id === id);
    if (!partner) return { ok: false, error: "Choose which business to invite." };
    const address = norm(email);
    if (!validEmail(address)) return { ok: false, error: "Enter the partner's work email." };
    if (accountFor(role, id)) return { ok: false, error: `${partner.name} already has an account.` };
    if (findRaw(address)) return { ok: false, error: "An account already uses this email." };
    if (state.invites.some((i) => i.role === role && i.partnerId === id && inviteStatus(i) === "pending"))
      return { ok: false, error: `${partner.name} already has a pending invite. Resend or revoke it below.` };
    const invite = {
      token: randomId(24), role, partnerId: id, partnerName: partner.name, email: address,
      createdAt: now(), expiresAt: new Date(Date.now() + INVITE_DAYS * 864e5).toISOString(),
      status: "pending", createdBy: admin.email,
    };
    state.invites.unshift(invite);
    record(admin, "invite-created", `Invited ${partner.name} (${ROLE_LABEL[role].toLowerCase()}) at ${address}`);
    return { ok: true, invite: publicInvite(invite) };
  }
  // Only the super admin can invite more admins (they join as admin staff).
  function createAdminInvite(email) {
    const admin = requireSuper();
    if (!admin) return { ok: false, error: "Only the super admin can invite other admins." };
    const address = norm(email);
    if (!validEmail(address)) return { ok: false, error: "Enter their work email." };
    if (findRaw(address)) return { ok: false, error: "An account already uses this email." };
    if (state.invites.some((i) => i.role === "admin" && i.email === address && inviteStatus(i) === "pending"))
      return { ok: false, error: "This person already has a pending invite. Resend or revoke it below." };
    const invite = {
      token: randomId(24), role: "admin", partnerId: "", partnerName: "Entree admin team", email: address,
      createdAt: now(), expiresAt: new Date(Date.now() + INVITE_DAYS * 864e5).toISOString(),
      status: "pending", createdBy: admin.email,
    };
    state.invites.unshift(invite);
    record(admin, "invite-created", `Invited ${address} to join as admin staff`);
    return { ok: true, invite: publicInvite(invite) };
  }
  function changeInvite(token, change) {
    const admin = requireAdmin();
    const invite = state.invites.find((i) => i.token === token);
    if (!admin || !invite) return { ok: false, error: "That invite can't be changed." };
    if (invite.role === "admin" && !isSuper(admin)) return { ok: false, error: "Only the super admin can change admin invites." };
    if (change === "revoke") {
      if (inviteStatus(invite) !== "pending") return { ok: false, error: "Only pending invites can be revoked." };
      invite.status = "revoked";
      invite.revokedAt = now();
      record(admin, "invite-revoked", `Revoked the invite for ${invite.partnerName}`);
    } else if (change === "resend") {
      if (!["pending", "expired"].includes(inviteStatus(invite))) return { ok: false, error: "This invite has already been used or revoked." };
      if (invite.role !== "admin" && accountFor(invite.role, invite.partnerId)) return { ok: false, error: `${invite.partnerName} already has an account.` };
      if (findRaw(invite.email)) return { ok: false, error: "An account already uses this email." };
      // Resending issues a fresh link and lets the old one lapse.
      invite.token = randomId(24);
      invite.status = "pending";
      invite.expiresAt = new Date(Date.now() + INVITE_DAYS * 864e5).toISOString();
      invite.resentAt = now();
      record(admin, "invite-resent", `Resent the invite for ${invite.partnerName} to ${invite.email}`);
    }
    write();
    return { ok: true, invite: publicInvite(invite) };
  }
  // What signup.html needs to know about an invite link.
  function checkInvite(token) {
    const invite = state.invites.find((i) => i.token === token);
    if (!invite) return { ok: false, error: "This invite link isn't valid. Ask your Entree contact to send a new one." };
    const status = inviteStatus(invite);
    if (status === "expired") return { ok: false, error: "This invite link has expired. Ask your Entree contact to resend it." };
    if (status === "revoked") return { ok: false, error: "This invite link was cancelled. Ask your Entree contact for a new one." };
    if (status !== "pending") return { ok: false, error: "This invite link has already been used. Log in with the account it created." };
    return { ok: true, invite: { role: invite.role, roleLabel: invite.role === "admin" ? LEVEL_LABEL.staff : ROLE_LABEL[invite.role], partnerName: invite.partnerName, email: invite.email, expiresAt: invite.expiresAt } };
  }
  function acceptInvite(token, { firstName = "", lastName = "", phone = "", password = "" } = {}) {
    const check = checkInvite(token);
    if (!check.ok) return check;
    const invite = state.invites.find((i) => i.token === token);
    if (String(password).length < 8) return { ok: false, error: "Use at least 8 characters for your password." };
    if (findRaw(invite.email) || (invite.role !== "admin" && accountFor(invite.role, invite.partnerId))) return { ok: false, error: "This account already exists. Log in instead." };
    const salt = randomId(16);
    const a = {
      email: invite.email, role: invite.role, name: `${firstName} ${lastName}`.trim() || invite.partnerName,
      phone: String(phone).trim(), salt, hash: hashPassword(password, salt), via: "invite", createdAt: now(),
      ...(invite.role === "shipping" ? { companyId: invite.partnerId } : invite.role === "merchant" ? { merchant: invite.partnerName } : { level: "staff" }),
    };
    state.users.push(a);
    invite.status = "accepted";
    invite.acceptedAt = now();
    const account = startSession(a);
    record(account, invite.role === "admin" ? "admin-joined" : "partner-joined",
      invite.role === "admin" ? `${account.name} accepted their invite and joined as admin staff` : `${invite.partnerName} accepted their invite and created an account`);
    return { ok: true, account, home: homeFor(a.role) };
  }

  /* ---------------------------------------------------------- admin: customers */
  // Admin screens refer to customers by an opaque id, never by their email.
  const customerId = (email) => sha256(`customer:${email}`).slice(0, 16);
  function setCustomerStatus(id, status, reason = "") {
    const admin = requireAdmin();
    const a = allAccounts().find((x) => x.role === "customer" && customerId(x.email) === id);
    if (!admin || !a || a.role !== "customer" || !["active", "suspended"].includes(status)) return { ok: false, error: "That account can't be changed." };
    state.status[a.email] = { status, reason: String(reason).slice(0, 120), at: now(), by: admin.email };
    const who = mask.email(a.email);
    record(admin, status === "suspended" ? "customer-suspended" : "customer-reactivated",
      status === "suspended" ? `Suspended customer ${who}${reason ? ` — ${reason}` : ""}` : `Reactivated customer ${who}`);
    return { ok: true };
  }

  /* ---------------------------------------------------------- admin: partners & admins */
  // Deactivating a shipping line or merchant blocks their log-in and hides their
  // trips or products from customers; reactivating brings them back. Only the
  // super admin can deactivate other admins, and never themselves.
  function setStaffStatus(email, status, reason = "") {
    const admin = requireAdmin();
    const a = findRaw(email);
    if (!admin || !a || a.role === "customer" || !["active", "suspended"].includes(status)) return { ok: false, error: "That account can't be changed." };
    if (a.role === "admin") {
      if (!isSuper(admin)) return { ok: false, error: "Only the super admin can change admin accounts." };
      if (a.email === admin.email) return { ok: false, error: "You can't deactivate your own account." };
      if (a.level === "super") return { ok: false, error: "The super admin account can't be deactivated here." };
    }
    const catalog = window.ENTREE_CATALOG;
    if (a.role === "shipping" && status === "suspended" && catalog) {
      const others = (data.ALL_SHIPPING_COMPANIES || []).filter((c) => c.id !== a.companyId && c.active !== false && !c.suspended);
      if (!others.length) return { ok: false, error: "At least one shipping line must stay available to customers." };
    }
    state.status[a.email] = { status, reason: String(reason).slice(0, 120), at: now(), by: admin.email };
    write();
    if (a.role !== "admin") catalog?.setPartnerHidden?.(a.role, partnerId(a), status === "suspended");
    const who = a.role === "admin" ? `${a.name} (admin staff)` : partnerName(a);
    record(admin, status === "suspended" ? "account-deactivated" : "account-reactivated",
      status === "suspended" ? `Deactivated ${who}${reason ? ` — ${reason}` : ""}` : `Reactivated ${who}`);
    return { ok: true };
  }

  // A suspended (or deleted) customer who is still signed in is signed out on the next page.
  const current = customerSession();
  if (current && current.email) {
    const a = findRaw(current.email);
    if (!a || a.role !== "customer" || a.status === "suspended") safe(() => localStorage.removeItem(CUSTOMER_KEY));
  }

  window.ENTREE_ACCOUNTS = {
    PANEL_FOR, ROLE_LABEL, LEVEL_LABEL, INVITE_DAYS, slug, mask, homeFor,
    isSuper: () => isSuper(staffSession()),
    find, partners, staffSession, signOutStaff, signOut, currentUser, signIn, signUp,
    checkInvite, acceptInvite,
    // Admin views. Each re-checks that an admin is signed in.
    customers: () => (requireAdmin() ? allAccounts().filter((a) => a.role === "customer").map((a) => ({
      id: customerId(a.email), name: mask.name(a.name), emailMasked: mask.email(a.email), phone: mask.phone(a.phone),
      status: a.status, reason: state.status[a.email]?.reason || "", joined: a.createdAt, via: a.via,
    })) : []),
    staff: () => (requireAdmin() ? allAccounts().filter((a) => a.role !== "customer").map(publicAccount) : []),
    accountFor: (role, id) => publicAccount(accountFor(role, id)),
    invites: () => (requireAdmin() ? state.invites.map(publicInvite) : []),
    createInvite,
    revokeInvite: (token) => changeInvite(token, "revoke"),
    resendInvite: (token) => changeInvite(token, "resend"),
    setCustomerStatus,
    setStaffStatus,
    log: () => (requireAdmin() ? state.log.slice() : []),
    record: (action, text) => { const s = staffSession(); if (s) record(s, action, text); },
  };
})();
