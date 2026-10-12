/* Scripts for pages/login.html (the log-in page).
   One log-in for every account. The account's role decides where it goes:
   customers return to the booking site; admins, shipping lines and merchants
   go to their panel (accounts.js). Booking itself never needs an account.
   Loaded before app.js; app.js runs this once the page is ready and passes in the
   shared helpers (see "Shared with the page scripts" in app.js). */
window.ENTREE_PAGES = window.ENTREE_PAGES || {};
window.ENTREE_PAGES["login"] = (E) => {
  const { $, markSaved, navigateTo, dialog, formError } = E;
  const A = window.ENTREE_ACCOUNTS;
  const form = $(".login-form");

  $('a[href="#"]')?.addEventListener("click", (e) => {
    e.preventDefault();
    dialog(
      "Password recovery",
      "<p>Password resets are not available in this preview. Email <strong>support@entree.ph</strong> and our team will get you back into your account.</p>",
    );
  });

  // A partner panel sent the visitor here (login.html?next=admin.html).
  const next = new URLSearchParams(location.search).get("next");
  const canOpen = (role, page) => A.PANEL_FOR[role] === page;
  const current = A.staffSession();
  if (next && current && canOpen(current.role, next)) {
    location.replace(next);
    return {};
  }
  if (next && form) formError(form, current ? `You're signed in as ${current.name}, which can't open that page. Log in with another account.` : "Log in to continue.");
  // Already logged in? Say so, with a shortcut, instead of looking logged out.
  const who = A.currentUser();
  if (!next && who && form) {
    const note = document.createElement("p");
    note.className = "login-note";
    note.setAttribute("role", "status");
    note.innerHTML = `You're logged in as <strong></strong>. <a href="${who.panel || "index.html"}">${who.panel ? `Open ${who.panelName}` : "Continue to the site"}</a> or log in with another account below.`;
    note.querySelector("strong").textContent = who.name || who.email;
    form.prepend(note);
  }

  return {
    submit(f) {
      const email = $('input[type="email"]', f);
      const password = $('input[type="password"]', f);
      const result = A.signIn(email.value, password.value);
      if (!result.ok) {
        formError(f, result.error);
        password.value = "";
        password.focus();
        return;
      }
      markSaved();
      const { role } = result.account;
      if (role === "customer") return navigateTo("index");
      location.href = next && canOpen(role, next) ? next : result.home;
    },
  };
};
