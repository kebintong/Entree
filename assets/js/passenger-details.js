/* Scripts for pages/passenger-details.html (the passenger details page).
   Loaded before app.js; app.js runs this once the page is ready and passes in the
   shared helpers (see "Shared with the page scripts" in app.js). */
window.ENTREE_PAGES = window.ENTREE_PAGES || {};
window.ENTREE_PAGES["passenger-details"] = (E) => {
  const { allText, action } = E;
  allText("Proceed to payment").forEach((el) => action(el, "go:payment"));
};
