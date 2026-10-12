/* Scripts for pages/payment.html (the payment page).
   Loaded before app.js; app.js runs this once the page is ready and passes in the
   shared helpers (see "Shared with the page scripts" in app.js). */
window.ENTREE_PAGES = window.ENTREE_PAGES || {};
window.ENTREE_PAGES["payment"] = (E) => {
  const { $, $$, store, markSaved, navigateTo, notice, enable } = E;
  let selectedPayment = null;
  const info = $("main .payment-preview-note p");
  if (info)
    info.textContent =
      "Preview mode — no payment is processed and no card details are collected.";
  // Show the amount on the pay button (the total is filled in by booking-flow.js)
  const total = $("[data-booking-total]");
  const amount = $("[data-pay-amount]");
  const syncAmount = () => {
    if (total && amount) amount.textContent = "· " + total.textContent.trim();
  };
  syncAmount();
  if (total && "MutationObserver" in window) {
    new MutationObserver(syncAmount).observe(total, { childList: true, characterData: true, subtree: true });
  }
  // Fresh session: no payment preselected on reload
  return {
    isDirty: () => selectedPayment !== null,
    actions: {
      payment(el, arg) {
        selectedPayment = arg;
        $$('[data-action^="payment:"]').forEach((b) => {
          b.classList.toggle("selected-option", b === el);
          b.setAttribute("aria-pressed", String(b === el));
        });
        enable($('[data-action="complete-payment"]'));
        const hint = $("[data-pay-hint]");
        if (hint) hint.textContent = `Paying with ${el.querySelector("strong")?.textContent || "your selected method"}.`;
      },
      "complete-payment"() {
        if (selectedPayment) {
          if (window.ENTREE_BOOKING && !window.ENTREE_BOOKING.complete(selectedPayment)) {
            notice(window.ENTREE_BOOKING.detailsError());
            return;
          }
          markSaved();
          store.set("demoPayment", selectedPayment);
          navigateTo("confirmation");
        }
      },
    },
  };
};
