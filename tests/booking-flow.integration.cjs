const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const root = process.cwd();
const session = new Map(), local = new Map();
const errors = [];
async function page(name, query = '') {
  const html = fs.readFileSync(path.join(root, 'pages', name + '.html'), 'utf8');
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!e.message.includes('navigation')) errors.push(e.message); });
  const dom = new JSDOM(html, { url: 'https://entree.test/' + name + '.html' + query, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  w.HTMLDialogElement.prototype.close = function() { this.open = false; };
  for (const [key, val] of session) w.sessionStorage.setItem(key, val);
  for (const [key, val] of local) w.localStorage.setItem(key, val);
  if (w.document.readyState === 'loading') await new Promise(resolve => w.document.addEventListener('DOMContentLoaded', resolve));
  for (const file of ['data.js', 'booking-state.js', 'app.js', 'booking-flow.js']) {
    try { w.eval(fs.readFileSync(path.join(root, 'assets/js', file), 'utf8')); }
    catch (e) { errors.push(name + ': ' + e.stack); }
  }
  assert.ok(w.document.querySelector('link[rel="icon"]'), name + ' favicon');
  return { w, doc: w.document, close() { session.clear(); local.clear(); for (let i=0;i<w.sessionStorage.length;i++) { const k=w.sessionStorage.key(i);session.set(k,w.sessionStorage.getItem(k)); } for (let i=0;i<w.localStorage.length;i++) { const k=w.localStorage.key(i);local.set(k,w.localStorage.getItem(k)); } w.close(); } };
}
(async () => {
  let p = await page('index');
  assert.equal(p.doc.querySelector('[data-counter-type="passengers"] .pax-count').textContent, '0');
  p.w.ENTREE_BOOKING.save({origin:'Dumaguete',destination:'Siquijor',tripType:'Round Trip',departureDate:'2026-11-01',returnDate:'2026-11-02',passengers:3,vehicles:2,pets:1,shippingLine:'OceanJet',cabin:'Business'});
  p.close();
  p = await page('index');
  assert.equal(p.doc.querySelector('#origin').value, 'Dumaguete');
  assert.equal(p.doc.querySelector('[data-counter-type="passengers"] .pax-count').textContent, '3');
  assert.equal(p.doc.querySelector('[data-dropdown="shipping-line"] .dropdown-value').textContent,'OceanJet');
  p.close();
  p = await page('trips');
  assert.equal(p.doc.querySelectorAll('[data-select-trip]').length,10);
  assert.equal(p.doc.querySelector('.bf-header-summary'),null);
  assert.ok(p.doc.querySelector('.bf-search-context'));
  assert.ok(p.doc.querySelector('.bf-summary').textContent.includes('0 of 2'));
  for (const name of ['Lite Shipping','Supercat','OceanJet','2Go Travel']) assert.ok(p.doc.querySelector('main').textContent.includes(name));
  p.doc.querySelector('[data-select-trip="outbound"][data-ferry-id*="supercat"]').click();
  p.doc.querySelector('[data-select-trip="return"][data-ferry-id*="lite"]').click();
  assert.equal(p.doc.querySelectorAll('.bf-booked-ribbon').length,2);
  assert.ok(p.doc.querySelector('.bf-summary').textContent.includes('2 of 2'));
  p.doc.querySelector('[data-clear-trip="return"]').click();
  assert.equal(p.doc.querySelectorAll('.bf-booked-ribbon').length,1);
  p.doc.querySelector('[data-select-trip="return"][data-ferry-id*="lite"]').click();
  assert.equal(p.w.ENTREE_BOOKING.selectionError(), '');
  const total=p.w.ENTREE_BOOKING.totals().total;
  assert.equal(total,5964.70);
  p.close();
  p=await page('passenger-details');
  assert.equal(p.doc.querySelectorAll('input[name^="passengerDetails"][name$=".name"]').length,3);
  assert.equal(p.doc.querySelectorAll('input[name^="vehicleDetails"][name$=".plate"]').length,2);
  assert.equal(p.doc.querySelectorAll('input[name^="petDetails"][name$=".name"]').length,1);
  const form=p.doc.querySelector('#booking-details');
  for (const input of form.elements) {
    if(!input.name) continue;
    input.value=input.tagName==='SELECT'?'Female':input.name.endsWith('.age')?'28':input.type==='email'?'test@example.com':input.type==='tel'?'09171234567':'Test value';
    input.dispatchEvent(new p.w.Event('input',{bubbles:true}));
  }
  assert.equal(p.w.ENTREE_BOOKING.detailsError(),'');
  p.close();
  p=await page('payment');
  assert.ok(p.doc.querySelector('[data-booking-total]').textContent.includes('5,964.70'));
  p.doc.querySelector('[data-action="payment:gcash"]').click();
  p.doc.querySelector('[data-action="complete-payment"]').click();
  assert.equal(p.w.ENTREE_BOOKING.records().length,1);
  const id=p.w.ENTREE_BOOKING.records()[0].id;
  p.close();
  p=await page('confirmation');
  assert.equal(p.doc.querySelector('h1').textContent,'Booking confirmed');
  assert.ok(p.doc.querySelector('main').textContent.includes('Dumaguete'));
  assert.ok(!p.doc.querySelector('main').textContent.includes('Cebu'));
  p.close();
  for(const name of ['bookings','rebook','refund','travel-instructions','login','signup','verify-booking','pasalubong','settings']) {
    p=await page(name, '?id='+id);
    if(name==='rebook') assert.equal(p.doc.querySelectorAll('main input[type="checkbox"]').length,3);
    p.close();
  }
  p=await page('index');
  p.w.ENTREE_BOOKING.save({tripType:'One Way',pets:0,vehicles:0,passengers:1});
  assert.equal(p.w.ENTREE_BOOKING.get().returnId,'');
  p.close();
  p=await page('trips');
  assert.equal(p.doc.querySelectorAll('[data-select-trip="return"]').length,0);
  p.doc.querySelector('[data-select-trip="outbound"][data-ferry-id*="supercat"]').click();
  assert.equal(p.w.ENTREE_BOOKING.totals().total,884.90);
  p.close();
  p=await page('passenger-details');
  assert.equal(p.doc.querySelectorAll('input[name^="petDetails"],input[name^="vehicleDetails"]').length,0);
  assert.equal(p.doc.querySelectorAll('input[name^="passengerDetails"][name$=".name"]').length,1);
  p.close();
  p=await page('index');
  p.doc.querySelector('#origin').value='Manila';
  p.doc.querySelector('#origin').dispatchEvent(new p.w.Event('input',{bubbles:true}));
  p.doc.querySelector('[data-dropdown="shipping-line"] [data-value="FastCat"]').click();
  p.doc.querySelector('[data-dropdown="cabin-type"] [data-value="Private"]').click();
  p.doc.querySelector('[data-action="counter:pets:1"]').click();
  await new Promise(resolve=>p.w.queueMicrotask(resolve));
  assert.equal(p.w.ENTREE_BOOKING.get().origin,'Manila');
  assert.equal(p.w.ENTREE_BOOKING.get().shippingLine,'FastCat');
  assert.equal(p.w.ENTREE_BOOKING.get().cabin,'Private');
  assert.equal(p.w.ENTREE_BOOKING.get().pets,1);
  assert.equal(p.doc.querySelectorAll('.dates-input-group [aria-disabled="true"]').length,1);
  p.close();
  // Direct page access cannot bypass the booking prerequisites.
  session.clear();
  p=await page('payment');
  assert.equal(p.doc.querySelector('[data-action="complete-payment"]'),null);
  assert.ok(p.doc.querySelector('main').textContent.includes('Complete your booking details'));
  p.close();
  p=await page('verify-booking');
  const verify=p.doc.querySelector('form');
  const inputs=verify.querySelectorAll('input');
  inputs[0].value='UNKNOWN'; inputs[1].value='Nobody';
  verify.dispatchEvent(new p.w.Event('submit',{bubbles:true,cancelable:true}));
  assert.ok(p.doc.querySelector('.form-error').textContent.includes('No booking matches'));
  p.close();
  p=await page('index');
  const trigger=p.doc.querySelector('[data-dropdown="shipping-line"] .custom-dropdown-trigger');
  trigger.dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  assert.equal(p.doc.activeElement.dataset.value,'Lite Shipping');
  p.doc.activeElement.dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  assert.equal(p.w.ENTREE_BOOKING.get().shippingLine,'Lite Shipping');
  assert.equal(p.doc.activeElement,trigger);
  p.close();
  assert.deepEqual(errors,[]);
  console.log('PASS: all pages load, round-trip draft restoration, matching schedules, 3 passengers / 2 vehicles / 1 pet, persistent details, consistent total, payment, confirmation, saved booking, rebook and one-way flow.');
})().catch(e=>{ console.error(e);process.exit(1); });


