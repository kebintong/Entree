Run the booking state tests from the project root (no dependencies):

```powershell
node --test tests/booking-state.test.cjs
```

The integration check loads each page into jsdom and exercises draft restoration,
trip selection, passenger details, payment, confirmation, and one-way bookings.
It does not verify browser layout or contact payment services. Install its test-only
dependency outside the project:

```powershell
npm install --prefix "$env:TEMP/entree-dom-tests" jsdom --no-audit --no-fund
$env:NODE_PATH = "$env:TEMP/entree-dom-tests/node_modules"
node tests/booking-flow.integration.cjs
```
