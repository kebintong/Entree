# System review

Reviewed the 14 application pages and the root redirect, including local links,
scripts, images, booking data, and the booking navigation flow.

## Improvements in this update

- The trip picker offers Lite Shipping, Supercat, OceanJet, and 2Go Travel,
  while retaining FastCat. Each leg has an independent company selection.
- Selected cards, ribbons, summary counts, per-leg fares, and removal controls
  derive from the saved draft. Refreshing keeps the selection.
- Completed bookings snapshot both legs and their fares, including the return
  company and overnight arrival indicator.
- The trip sidebar separates the ticket subtotal from pet/vehicle fees applied
  on the passenger-details page. Payment uses the full total.
- Same-day return departures cannot precede outbound arrival.
- Direct passenger-details/payment navigation checks prerequisites.
- Booking verification checks a stored reference and passenger surname.
- Shipping/cabin menus support arrow keys, Home/End, Enter/Space, Escape,
  and focus leaving the menu.
- All 15 HTML entry points have the Entree favicon; referenced local assets
  and navigation targets exist.

## Verification

Run the commands in README.md. The state tests and jsdom integration check cover
round trips with different companies, one-way bookings, counts, persistence,
selection removal, totals, payment, confirmation, all application page loads,
booking verification, direct-page guards, and keyboard dropdown selection.

Browser layout has not been visually verified; the available browser tool blocked
the local-file preview in this session.

## Existing demo boundaries

Company departure times and prices are illustrative fixtures, available for the
chosen dates in the demo. They are not live route inventory. Authentication,
payment, reschedule/refund requests, profile/password updates, and order fulfillment
still need server-side services for production. Local booking verification is a
demo lookup, not authentication or proof of ownership. These services were not
represented as completed by the frontend review.
