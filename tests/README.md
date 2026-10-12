# Tests

Automated checks for the booking logic. The website never loads these files; they only run on a developer's computer with [Node.js](https://nodejs.org) installed. Run them before and after changing the booking flow to make sure nothing broke.

| File | What it checks |
|---|---|
| `booking-state.test.cjs` | The booking rules in `assets/js/booking-state.js`: saved search, trip choices per shipping line, one-way vs round trip, return-time rules, totals, and the saved booking record. |
| `booking-flow.integration.cjs` | Loads each customer page in a simulated browser (jsdom) with the same scripts the page lists, then walks a full booking: search → trips → passenger details → payment → confirmation, plus My Bookings, rebook, one-way trips and page loads. The site ships with no sample bookings, so this check adds its own test booking where it needs one. It doesn't check visual layout or contact any payment service. |

## Run them

From the project folder (the one with `serve.py`):

```powershell
node --test tests/booking-state.test.cjs
```

The integration check needs one test-only package, installed outside the project so the site folder stays clean:

```powershell
npm install --prefix "$env:TEMP/entree-dom-tests" jsdom --no-audit --no-fund
$env:NODE_PATH = "$env:TEMP/entree-dom-tests/node_modules"
node tests/booking-flow.integration.cjs
```

A passing run ends with `PASS: all pages load, …`.
