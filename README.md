# Entree

Ferry booking for the Philippines: search trips across shipping lines, book, pay, and pre-order pasalubong delivered to your seat. Front-end demo: data lives in the browser until a server is added.

## Run it

```powershell
py serve.py
```

Then open <http://localhost:1000/pages/index.html>. (`serve.py` turns off browser caching so edits show up on a normal refresh.)

## What's where

```
Entree/
├── index.html              Redirects to pages/index.html
├── serve.py                Local server (no caching)
├── README.md               This file
├── PANELS.md               Admin / shipping-line / merchant panels explained
├── pages/                  Every screen (one HTML file each)
│   ├── index, trips, passenger-details, payment, confirmation      Booking flow
│   ├── bookings, verify-booking, rebook, refund, travel-instructions  After booking
│   ├── pasalubong, login, signup, settings                          Shop & account
│   └── admin, shipping-panel, merchant-panel                        Partner panels
├── assets/
│   ├── css/                One stylesheet per page, plus shared ones
│   │                       (base, site, fonts, motion, booking-flow, turtle, panel)
│   ├── js/                 One script per page, plus shared ones:
│   │                       data.js (demo data) → catalog-store.js (partner changes)
│   │                       → accounts.js (log-in, roles, invites) → dev-slot.js → app.js …
│   ├── dev/                OPTIONAL developer panel — delete the folder to remove it
│   ├── fonts/              Poppins (self-hosted) + its licence
│   └── images/             Logos, ocean photos, Doode the turtle
└── tests/                  Automated checks for the booking flow (see tests/README.md)
```

## Developer panel

Press **Insert + Delete** together on any page. It's an optional plug-in that lives entirely in `assets/dev/`; delete that folder and the site keeps working. See `assets/dev/README.md`.

## Accounts and partner panels

Everyone logs in on `pages/login.html`; the account's role decides where it lands (customer → booking site, admin/shipping/merchant → their panel). Shipping lines and merchants join only through an admin's invite link. See `PANELS.md`.

## Tests

See `tests/README.md`.
