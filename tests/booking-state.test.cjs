const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const root = path.join(__dirname, '..');
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
};
function setup(sessionStorage = storage(), localStorage = storage()) {
  const context = vm.createContext({ window: {}, sessionStorage, localStorage, crypto: { randomUUID } });
  for (const file of ['data.js', 'booking-state.js']) vm.runInContext(fs.readFileSync(path.join(root, 'assets/js', file), 'utf8'), context);
  return { booking: context.window.ENTREE_BOOKING, sessionStorage, localStorage };
}
const search = { tripType: 'Round Trip', origin: 'Dumaguete', destination: 'Siquijor', departureDate: '2026-11-01', returnDate: '2026-11-02', passengers: 3, pets: 1, vehicles: 2, shippingLine: 'OceanJet', cabin: 'Business' };
function selectTrips(booking) {
  booking.save(search);
  booking.save({ outboundId: '2', returnId: '5' });
}
test('draft survives page loads and preserves every home field', () => {
  const first = setup();
  first.booking.save(search);
  const next = setup(first.sessionStorage, first.localStorage).booking.get();
  for (const [key, value] of Object.entries(search)) assert.equal(next[key], value);
});
test('schedule matching, capacity and totals use both legs and all counts', () => {
  const { booking } = setup();
  selectTrips(booking);
  assert.equal(booking.selectionError(), '');
  assert.ok(booking.options('outbound').length >= 5);
  assert.equal(booking.totals().total, 8950);
  booking.save({ passengers: 81 });
  assert.equal(booking.options('outbound').length, 0);
  assert.equal(booking.get().outboundId, '');
});
test('different companies can be selected and removed independently', () => {
  const { booking } = setup();
  booking.save({ ...search, passengers: 2, pets: 0, vehicles: 0 });
  const out = booking.options('outbound').find(f => f.ferry === 'Supercat');
  const ret = booking.options('return').find(f => f.ferry === 'Lite Shipping');
  booking.save({ outboundId: out.id });
  booking.save({ returnId: ret.id });
  assert.equal(booking.selected('outbound').ferry, 'Supercat');
  assert.equal(booking.selected('return').ferry, 'Lite Shipping');
  assert.equal(booking.selected('return').arrivalNextDay, true);
  assert.equal(booking.totals().total, 2459.80);
  booking.save({ returnId: '' });
  assert.equal(booking.selected('return'), undefined);
  assert.equal(booking.selected('outbound').id, out.id);
  assert.equal(booking.totals().total, 1719.80);
});
test('same-day return cannot leave before outbound arrival', () => {
  const { booking } = setup();
  booking.save({ ...search, returnDate: search.departureDate });
  booking.save({ outboundId: booking.options('outbound').find(f => f.ferry === 'Lite Shipping').id });
  booking.save({ returnId: booking.options('return').find(f => f.ferry === 'Supercat').id });
  assert.match(booking.selectionError(), /after/);
});
test('all requested companies are available on the chosen demo date', () => {
  const { booking } = setup();
  booking.save(search);
  const names = booking.options('outbound').map(f => f.ferry);
  for (const name of ['Lite Shipping', 'Supercat', 'OceanJet', '2Go Travel']) assert.ok(names.includes(name));
  assert.equal(booking.complete('unrecognized-payment'), null);
});
test('one-way clears return selection and excludes return fares', () => {
  const { booking } = setup();
  selectTrips(booking);
  booking.save({ tripType: 'One Way', passengers: 1, pets: 0, vehicles: 0 });
  booking.save({ outboundId: '2' });
  assert.equal(booking.get().returnId, '');
  assert.equal(booking.options('return').length, 0);
  assert.equal(booking.totals().total, 1150);
  assert.equal(booking.get().petDetails.length, 0);
  assert.equal(booking.get().vehicleDetails.length, 0);
});
test('rejects empty routes, zero passengers and an earlier return', () => {
  const { booking } = setup();
  assert.match(booking.searchError(), /passenger/);
  booking.save({ ...search, origin: '' });
  assert.match(booking.searchError(), /origin/);
  booking.save({ ...search, returnDate: '2026-10-30' });
  assert.match(booking.searchError(), /Return date/);
});
test('completion requires details and keeps an immutable booking snapshot', () => {
  const first = setup();
  const { booking } = first;
  selectTrips(booking);
  assert.equal(booking.complete('gcash'), null);
  booking.save({
    passengerDetails: Array.from({ length: 3 }, (_, i) => ({ name: `Passenger ${i}`, age: '25', gender: 'Female' })),
    vehicleDetails: [{ type: 'Car', plate: 'ABC123' }, { type: 'Motorcycle', plate: 'DEF456' }],
    petDetails: [{ name: 'Milo', type: 'Cat' }], contact: { name: 'Test', email: 'test@example.com', phone: '09171234567' },
  });
  assert.equal(booking.detailsError(), '');
  const record = booking.complete('gcash');
  assert.equal(record.totalPrice, 8950);
  assert.equal(booking.complete('gcash').id, record.id);
  assert.equal(booking.records().length, 1);
  booking.save({ origin: 'Manila', passengers: 1 });
  assert.equal(record.route.origin, 'Dumaguete');
  assert.equal(record.passengerDetails.length, 3);
  assert.equal(booking.get().completedId, '');
  const reload = setup(first.sessionStorage, first.localStorage);
  assert.equal(reload.booking.records()[0].id, record.id);
});
