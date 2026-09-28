/* Doode the sea turtle: the mascot that pops up, chats, gives tips and runs the
   step-by-step page tour. Loaded on every page after app.js.
   The mascot's styles are in site.css; its artwork is in assets/images/doode/. */
(() => {
  "use strict";
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const page = document.body.dataset.page;
  // Shared with app.js: page navigation (with the unsaved-changes check),
  // text search and the home page's mobile trip planner.
  const app = window.ENTREE_APP || {};
  const text = (el) => el.textContent.trim().replace(/\s+/g, " ");
  const allText =
    app.allText ||
    ((value, root = document) =>
      $$("button,a,span,p,div,label,h1,h2,h3", root).filter(
        (el) => text(el) === value && ![...el.children].some((child) => text(child) === value),
      ));
  const go = app.go || ((name) => (location.href = `${name}.html`));
  const tripSheet = app.tripSheet || null;

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
          // Phones/tablets only: the planner is a bottom sheet that must be expanded first.
          // "gate" steps block the tour until the user does the thing themselves.
          { find: bySel(".m-sheet-toggle"), gate: true, done: () => Boolean(tripSheet?.isOpen()), say: "Tap More (or anywhere on Plan your trip) to open the planner. From, To, dates and passengers are all inside!" },
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
          { find: bySel("#order-name"), done: filled, say: "Now your name, so we know who's ordering." },
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
        if (step.inSheet && tripSheet?.isMobile() && !tripSheet.isOpen()) return needGate();
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
        "Nope! Tap More first. I can't show you From and To while the planner is folded up.",
        "Hold on, sailor! Open the planner with the green More button, then we keep going.",
        "I'll wait... the planner won't open itself. Tap More or anywhere on Plan your trip!",
        "Can't skip this one! Tap the planner to open it.",
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
        guide.override = message || "The planner is folded up! Tap More to open it so we can keep going.";
        showStep();
      }
      document.addEventListener("entree:trip-sheet", (event) => {
        if (!guide) return;
        const step = guide.steps[guide.i];
        if (event.detail?.open) {
          // Opened some other way than the pointed-at button (header tap, swipe, field focus): gate passed.
          if (step?.gate && guide.el) {
            unwatchTarget();
            guide.el = null;
            spotlight(null);
            clearFlow();
            setState("talking");
            setSprite("happy");
            say(pick(PRAISE), [], () => later(nextStep, 600));
          }
          return;
        }
        if (step?.inSheet && tripSheet?.isMobile()) {
          setSprite("questioning");
          needGate(pick(["Whoa, you folded the planner! Tap More again so we can keep going.", "Hey, we weren't done! Tap More to open the planner again."]));
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
