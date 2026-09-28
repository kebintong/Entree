/* Scripts for pages/login.html (the log-in page).
   Loaded before app.js; app.js runs this once the page is ready and passes in the
   shared helpers (see "Shared with the page scripts" in app.js). */
window.ENTREE_PAGES = window.ENTREE_PAGES || {};
window.ENTREE_PAGES["login"] = (E) => {
  const { $, store, markSaved, navigateTo, dialog } = E;
  $('a[href="#"]')?.addEventListener("click", (e) => {
    e.preventDefault();
    dialog(
      "Password recovery",
      "<p>Password resets are not available in this preview. Email <strong>support@entree.ph</strong> and our team will get you back into your account.</p>",
    );
  });
  return {
    submit(form) {
      markSaved();
      store.set("session", { email: $('input[type="email"]', form).value });
      navigateTo("index");
    },
  };
};
