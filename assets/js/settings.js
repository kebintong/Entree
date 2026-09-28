/* Scripts for pages/settings.html (account settings).
   Loaded before app.js; app.js runs this once the page is ready and passes in the
   shared helpers (see "Shared with the page scripts" in app.js). */
window.ENTREE_PAGES = window.ENTREE_PAGES || {};
window.ENTREE_PAGES["settings"] = (E) => {
  const { $, $$, store, initialFieldValues, allText, notice, dialog, action } = E;
  const preferences = store.get("preferences", {});
  $$('main input[type="checkbox"],main select').forEach((input, i) => {
    if (i in preferences) {
      if (input.type === "checkbox") input.checked = preferences[i];
      else input.value = preferences[i];
    }
    input.addEventListener("change", () => {
      preferences[i] = input.type === "checkbox" ? input.checked : input.value;
      store.set("preferences", preferences);
      notice("Your preferences have been updated.");
      if (input.type === "checkbox") {
        initialFieldValues.set(input, input.checked);
      } else {
        initialFieldValues.set(input, input.value);
      }
    });
  });
  allText("Add Payment Method").forEach((el) => action(el, "payment-info"));
  allText("Update Profile").forEach((el) => action(el, "profile"));
  allText("Change").forEach((el) => action(el, "password-info"));
  const email = $('input[type="email"]');
  if (email) email.value = store.get("session")?.email || "";
  return {
    actions: {
      "payment-info": () =>
        dialog(
          "Payment methods",
          "<p>Saved payment methods are not available in this preview. You can still pay with GCash or online banking at checkout.</p>",
        ),
      profile: () => notice("Profile changes are not saved in this preview."),
      "password-info": () =>
        dialog(
          "Change password",
          "<p>Password changes are not available in this preview. For help securing your account, email <strong>support@entree.ph</strong>.</p>",
        ),
    },
  };
};
