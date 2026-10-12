# Entree accounts and partner panels

## One log-in for everyone

Everyone signs in on the normal log-in page, `pages/login.html`. Every account has a **role**, and the role decides where it goes:

| Role | After logging in | How the account is made |
|---|---|---|
| Customer | Back to the booking site | Signs up on `pages/signup.html` |
| Shipping line | `pages/shipping-panel.html` (their line only) | Only through an admin's invite link |
| Merchant | `pages/merchant-panel.html` (their shop only) | Only through an admin's invite link |
| Admin (super admin or admin staff) | `pages/admin.html` | The super admin is set up by Entree; admin staff join through the super admin's invite link |

Booking never needs an account: guests can search, book and pay without one.

Each panel opens only for its own role. An admin who opens a shipping-line or merchant panel is sent back to the admin panel (and the same for partners), so admins oversee partners from their own screens but never work inside a partner's panel.

There is no separate staff log-in page and no partner link on the customer site. If someone opens a panel without being signed in, they're sent to `login.html` and then back to the panel.

## Panels

| Panel | Who | What it does |
|---|---|---|
| Admin | Entree staff | The operations command center (see below). |
| Shipping line | One ferry company | Upcoming sailings, schedule & fares editor, printable passenger manifest. |
| Merchant | One pasalubong seller | Orders to prepare (New → Preparing → Ready for boarding → Delivered) and **their own products**: add, edit, mark options sold out, hide or remove. |

## Admin panel

A shared layout for every panel: a sidebar grouped into **Overview / Operations / Management** with count badges (upcoming bookings, refunds waiting, pending invites; new orders for merchants) and a button to collapse it to icons (remembered per browser), plus a top bar with **search** (press `/`), the **alerts bell** and a **profile menu** with sign out. Details open in a panel that slides in from the right.

On phones the dark bar stays pinned at the top with the logo, the **Customer site** globe and a **menu button** (☰). The page list floats just under the bar, however far the page is scrolled (dimmed behind, no scrolling), with the signed-in account and **Sign out** at the bottom. It closes on a page tap, a tap outside, Escape or the phone's Back button/gesture. In the admin panel, search, the alerts bell and the profile avatar share one row under the bar; the shipping-line and merchant panels have no such row (their account is in the menu). The collapsed-sidebar setting only applies on computers.

Other phone layouts: number cards have a small arrow link in the corner; page buttons such as **Export CSV** sit beside the title when they fit; filter chips are smaller; filters fill the card width (two dropdowns share a row); account tabs are a 2 × 2 set of buttons; invite types are compact rows. The admin Overview lists **Needs attention** right under the numbers on every screen size. Tables turn into one small card per row: the first column (reference, name, order…) is the card's title, the status badge sits in its top-right corner, the other values have their column name beside them and the buttons sit at the bottom, so nothing needs sideways swiping. The activity log becomes a feed (what happened, then who and when), and the boarding manifest keeps a label on every value. Every page opens at its title.

| Page | What's on it |
|---|---|
| **Overview** | Five numbers (bookings, sailings today, ticket sales, pasalubong sales, needs attention); one summary card each for customers, shipping lines, merchants and refunds; **Needs attention** with filter chips (refunds waiting, sailings 85%+ full, paused or deactivated lines that still have upcoming bookings, invites about to expire or expired, sold-out products); recent activity. The bell shows the same list. |
| **Bookings** | Chips (All, Upcoming, Sails today, Completed, Refunds), shipping-line filter, search by reference or port, "See more" paging, **Export CSV** (contact details masked). **Details** shows the sailings, masked passengers and contact, pasalubong orders and the refund, with Approve / Mark as paid. |
| **Refunds** | Chips (Waiting, Approved, Refunded) and the Approve → Mark as paid steps. |
| **Shipping lines / Merchants** | One card per partner: logo with the status badge in the top-right corner (*Accepting bookings*, *Paused*, *Deactivated*; *In the shop* or *Nothing for sale* for merchants), the name, three numbers (passengers, fares, upcoming sailings; or orders, items sold, sales), outbound/return times and fares for lines, and its account (or an **Invite** link). |
| **Accounts** | Tabs for **Customers** (masked), **Shipping lines**, **Merchants** and **Admins**, with search, status filter, Export CSV and **View profile**. From the profile the admin can suspend/reactivate a customer or **deactivate/reactivate** a partner, choosing a reason. |
| **Invites** | Cards for **Shipping line**, **Merchant** and **Admin staff** (super admin only), the invite link to copy, and every invite with Copy / Resend / Revoke. |
| **Activity** | The audit log with search, role and date filters, paging and **Export CSV / JSON**. |

Search covers bookings, shipping lines, merchants, partner and admin accounts, and invites. Customers can't be searched, to protect their privacy.

### Admin levels

- **Super admin** (`admin@entree.ph`): everything, including inviting admin staff and deactivating them.
- **Admin staff**: bookings, refunds, partner invites and partner/customer accounts. They can't invite or change admins. Nobody can deactivate the super admin or their own account.

### Deactivating a partner

Deactivating a shipping line or merchant ends their session, blocks their log-in, and hides their trips or products from the customer site until they're reactivated. Existing bookings stay valid; if a deactivated or paused line still has upcoming bookings, it shows in **Needs attention** so the admin can contact those passengers. At least one shipping line must stay available.

## Merchant products

**Merchant → Products** shows each product as a card, the way travellers see it: photo, category, name, description, starting price and its options (sold-out ones crossed out), with a status badge (*In the shop*, *Sold out* or *Hidden*), filter chips, search, **Edit** and a *Show in shop* switch. **View the shop** opens the Pasalubong shop. The merchant's Overview shows their first three products the same way. Cards have a fixed size (290px wide, 190px photo): collapsing the sidebar or widening the window fits more cards per row instead of stretching them; on phones a card fills the width.

**Add product** (or **Edit**) opens a side panel with:

- **Photos** — up to 5 per product (JPG, PNG or WebP, shrunk to fit). The first is the cover on the card; move photos left/right or remove them.
- Name, category and description.
- **Options & prices** (e.g. *Leche Flan ₱120*, *Ube Blanca ₱100*). Each option can have **its own photo** (the camera button beside it). In the shop, picking that option switches the picture to its photo, and the cart shows it too.

The shop's photo carousel shows the product photos followed by the option photos. The card in the merchant panel shows how many photos there are and a small thumbnail on each option that has one. A product appears in the shop straight away unless *Show in shop* is off.

Photos are stored in the browser for this demo (a few MB in total), so very large catalogues need a server; if storage runs out the merchant sees a message instead of losing the product.

On an existing product the merchant can change any of that, add or remove options, switch an option's *In stock* off, hide the product, or **Remove product** (asks twice). Removed products and options leave the shop for good but stay on record, so past orders still show which merchant sold them.

## Partner invites

Shipping lines and merchants can't sign themselves up. An admin invites them:

1. **Admin → Invites**: pick the partner type, the business and their work email, then **Create invite link**. (The "Invite" link on a shipping-line or merchant card that has no account does the same.)
2. Send the link to the partner. It opens `signup.html?invite=…`, which becomes **Set up your partner account**: the business is shown, the email is locked to the invite, and there's no birthdate or home address.
3. When they finish, the account is created with the right role and they land in their panel. From then on they use the normal log-in page.

Each link works **once** and **expires after 7 days**. An admin can **Resend** (makes a fresh link; the old one stops working) or **Revoke** a pending invite. Expired, used, revoked or unknown links show an "Invite link problem" message and never create a customer account by mistake.

## Customer privacy

The admin has an overview of everything but never sees customers' personal details:

- Names, emails and phone numbers are **always masked** (e.g. `J••• D••• C•••`, `c•••@entree.ph`, `+63 ••• ••• ••34`) on every admin screen. Ages and genders aren't shown to admins, and admins can't open the shipping-line manifest or merchant order lists.
- Admin booking search works on references and ports only.
- Shipping lines and merchants still see the passenger names they need for boarding manifests and deliveries.

**Accounts → Customers** lists customer accounts (masked) and lets the admin **suspend** an account (with a reason) or **reactivate** it. A suspended customer can't log in and is signed out on their next page; their existing bookings stay valid.

## Activity log

**Admin → Activity** records, newest first: staff sign-ins, invites created/resent/revoked, partners and admin staff joining, accounts suspended/deactivated/reactivated (with the reason), refunds approved/paid, shipping lines paused/reopened, and exports. Customer details are masked in the log too.

## Demo accounts

This is a demo, so nobody has to create an account: guests can book a ticket and then buy pasalubong for that trip without logging in. To see each role, use one of the four demo accounts (log in on `pages/login.html`):

| Role | Email | Password | Lands on |
|---|---|---|---|
| Client (Juan Dela Cruz) | `client@entree.ph` | `client123` | The booking site, logged in |
| Merchant (Cebu Best Sweets) | `merchant@entree.ph` | `merchant123` | Merchant panel |
| Shipping line (Supercat) | `shipping@entree.ph` | `shipping123` | Shipping-line panel |
| Admin (super admin) | `admin@entree.ph` | `admin123` | Admin panel |

They're also in the **developer panel** (press **Insert + Delete** together on any page): *Fill* puts the details into the log-in form, *Open* logs straight in.

Sign-up and invites still work, so new accounts can be created during a demo, but they're never required. The other shipping lines and merchants have no account until an admin invites them.

## How the data flows

- `assets/js/catalog-store.js` loads right after `data.js` on every page and layers saved partner changes over the starting catalog (`localStorage` key `entree.catalog.v1`): timetables, fares, seats, "accepting bookings", products merchants added or removed, product details, prices, stock and order statuses. Customer pages read the result straight away.
- The site ships with **no sample bookings or orders**. My Bookings, the panels and the reports start empty and fill up as people book on this device; Reschedule and Refund show "No booking to …" until there is one.
- `assets/js/accounts.js` loads next on every page (`window.ENTREE_ACCOUNTS`). It keeps accounts, invites, suspensions and the activity log in `localStorage` key `entree.accounts.v1`. Customer sessions use `entree.session`; partner and admin sessions use `entree.staff.v1`. Both are in `localStorage`, so there's **one log-in for the whole site**: a merchant, shipping line or admin who opens the customer site is still logged in there (the account menu has **Open … panel**), the log-in page says who's already logged in, and logging out anywhere logs out everywhere.
- Deactivating a partner is saved in both places: the account status in `entree.accounts.v1` (blocks log-in) and a "hidden" flag in `entree.catalog.v1` (hides their trips or products from customers).
- Passwords are stored only as salted SHA-256 hashes. The demo passwords in plain text live only in the developer panel module.
- Bookings and pasalubong orders come from the customer flow (`booking-state.js`), so a booking made on the site appears in the admin list, the shipping line's manifest and the merchant's orders. Rescheduling (`pages/rebook.html`) saves the new sailing on the booking, so the panels show the new times too. Each leg is a ticket per passenger: the departure, the return or both can move, for some or all passengers (₱200 per ticket within 24 hours of that sailing, free before, plus any fare difference). Moving only some passengers splits them into a new booking with its own reference ("Split from …"). Approving a refund updates `entree.refunds.v1`, which the customer sees in **My Bookings**.

## Planned next

- **Phase 2:** Sailings (every sailing with seats booked vs. capacity), Payments & Refunds, Settings (platform details and rule numbers such as the pasalubong cutoff, invite expiry and "almost full"), and Accounting with Entree's earnings: a per-passenger service fee plus a commission on pasalubong, both set in Settings, and what each partner is owed with "Mark as paid out".
- **Phase 3:** Support tickets ("Get help" in My Bookings and the partner panels) and Partner inquiries (a "Partner with Entree" page linked from the footer, with **Send invite** in the admin).

## Limits (demo only)

Everything lives in the browser that made it, so an invite link only works in the same browser that created it, and the role checks run in the browser. This is **not** real security. Before launch a server must own accounts, sessions, invites (sent by email), the activity log and every permission check, behind the same screens.

## Files

- `pages/login.html`, `pages/signup.html` (also partner set-up), `pages/admin.html`, `pages/shipping-panel.html`, `pages/merchant-panel.html`
- `assets/js/accounts.js` (accounts, roles, sessions, invites, masking, activity log)
- `assets/js/login.js`, `assets/js/signup.js`
- `assets/js/panel.js` (shared shell, session checks, data helpers), `panel-admin.js`, `panel-shipping.js`, `panel-merchant.js`
- `assets/css/panel.css`
- `assets/js/catalog-store.js` (catalog overrides)
- `assets/dev/` (optional developer panel; loaded on demand by `assets/js/dev-slot.js`)
