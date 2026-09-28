/* Scripts for pages/refund.html (the refund page).
   Loaded before app.js; app.js runs this once the page is ready and passes in the
   shared helpers (see "Shared with the page scripts" in app.js). */
window.ENTREE_PAGES = window.ENTREE_PAGES || {};
window.ENTREE_PAGES["refund"] = (E) => {
  const { $, escape, markSaved, allText, notice, dialog, booking, showCurrentBooking } = E;
  const reasonTextarea = $("textarea");
  if (reasonTextarea) {
    reasonTextarea.value = "";
  }
  const b = showCurrentBooking();
  if (window.ENTREE_BOOKING) {
    const quote = window.ENTREE_BOOKING.refundQuote(b);
    const existing = window.ENTREE_BOOKING.refundOf(b.id);
    const label = allText("Refund Amount (100%)", $("main"))[0];
    const amountEl = label?.nextElementSibling;
    if (label) label.textContent = `Refund Amount (${existing ? existing.percent : quote.percent}%)`;
    if (amountEl) {
      amountEl.textContent = `₱${(existing ? existing.amount : quote.amount).toFixed(2)}`;
      if (!existing && !quote.percent) amountEl.classList.replace("refund-amount", "refund-amount-ineligible");
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
        ? "refund-note-done"
        : "refund-note-blocked";
      note.textContent = message;
      submit.parentElement.before(note);
    }
  }
  return {
    actions: {
      refund(el) {
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
      },
    },
  };
};
