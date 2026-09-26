/* Shared booking data. Drafts stay in this tab; completed demo bookings stay on this device. */
(() => {
  "use strict";
  const KEY = "entree.bookingDraft.v1";
  const RECORDS_KEY = "entree.bookings.v1";
  const REFUNDS_KEY = "entree.refunds.v1";
  const dateValue = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && dateValue(new Date(value + "T12:00:00")) === value;
  function read(storage, key, fallback) {
    try { return JSON.parse(storage.getItem(key)) || fallback; } catch { return fallback; }
  }
  function write(storage, key, value) {
    try { storage.setItem(key, JSON.stringify(value)); } catch { /* In-memory state remains usable. */ }
  }
  // A date + "09:00 AM" style time as a local Date (midnight when no time is given).
  function timeOn(day, time) {
    if (!validDate(day)) return null;
    const date = new Date(day + "T00:00:00");
    const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(String(time || "").trim());
    if (match) {
      let hour = Number(match[1]);
      if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0);
      date.setHours(hour, Number(match[2]), 0, 0);
    }
    return date;
  }
  const count = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
  const string = value => typeof value === "string" ? value.slice(0, 200) : "";
  function normalize(value = {}) {
    if (!value || typeof value !== "object" || Array.isArray(value)) value = {};
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 12);
    const draft = {
      tripType: value.tripType === "One Way" ? "One Way" : "Round Trip",
      origin: typeof value.origin === "string" ? string(value.origin) : "Cebu",
      destination: typeof value.destination === "string" ? string(value.destination) : "Tagbilaran, Bohol",
      departureDate: validDate(value.departureDate) ? value.departureDate : dateValue(today),
      returnDate: validDate(value.returnDate) ? value.returnDate : dateValue(tomorrow),
      passengers: count(value.passengers), vehicles: count(value.vehicles), pets: count(value.pets),
      shippingLine: window.ENTREE_DATA.SHIPPING_COMPANIES.some(c => c.name === value.shippingLine) ? value.shippingLine : "Supercat",
      cabin: ["Economy", "Business", "Private"].includes(value.cabin) ? value.cabin : "Economy",
      outboundId: string(value.outboundId), returnId: string(value.returnId),
      passengerDetails: [], petDetails: [], vehicleDetails: [],
      contact: { name: string(value.contact?.name), email: string(value.contact?.email), phone: string(value.contact?.phone) },
      completedId: string(value.completedId),
    };
    for (const [key, total] of [["passengerDetails", draft.passengers], ["petDetails", draft.pets], ["vehicleDetails", draft.vehicles]]) {
      draft[key] = Array.from({ length: total }, (_, i) => {
        const item = Array.isArray(value[key]) ? value[key][i] : null;
        return Object.fromEntries(Object.entries(item && typeof item === "object" ? item : {}).filter(([key]) => ["name", "age", "gender", "type", "plate"].includes(key)).map(([key, val]) => [key, string(val)]));
      });
    }
    // A draft restored from an earlier visit may point to a day that has passed.
    const todayValue = dateValue(today);
    if (draft.departureDate < todayValue) {
      draft.departureDate = todayValue;
      if (draft.returnDate < todayValue) draft.returnDate = dateValue(tomorrow);
    }
    if (draft.tripType === "One Way") draft.returnId = "";
    return draft;
  }
  let draft = normalize(read(sessionStorage, KEY, {}));
  const recordsValue = read(localStorage, RECORDS_KEY, []);
  const records = Array.isArray(recordsValue) ? recordsValue.filter(b => b && typeof b.id === "string" && b.route && Array.isArray(b.passengerDetails) && Number.isFinite(b.totalPrice)) : [];
  window.ENTREE_DATA.MOCK_BOOKINGS.unshift(...records);
  // Refund requests are kept per booking id so both demo and locally made bookings can be refunded.
  const refundsValue = read(localStorage, REFUNDS_KEY, {});
  const refunds = refundsValue && typeof refundsValue === "object" && !Array.isArray(refundsValue) ? refundsValue : {};
  const applyRefund = b => { if (b && refunds[b.id]) { b.refund = refunds[b.id]; b.status = "refunded"; } };
  window.ENTREE_DATA.MOCK_BOOKINGS.forEach(applyRefund);
  const departureAt = b => b ? timeOn(b.departureDate, b.departureTime) : null;
  function refundQuote(b, now = new Date()) {
    const departs = departureAt(b);
    const hours = departs ? (departs - now) / 36e5 : -1;
    const percent = hours >= 48 ? 100 : hours >= 24 ? 50 : 0;
    const amount = Math.round((b?.totalPrice || 0) * percent) / 100;
    const reason = percent ? "" : hours < 0 ? "This trip has already departed, so it can no longer be refunded." : "This trip departs in less than 24 hours, so it is not eligible for a refund.";
    return { percent, amount, hours, reason };
  }
  function requestRefund(id, reason) {
    const b = window.ENTREE_DATA.MOCK_BOOKINGS.find(item => item.id === id);
    if (!b) return { error: "We couldn't find that booking." };
    if (refunds[id]) return { error: "A refund has already been requested for this booking.", refund: refunds[id] };
    const quote = refundQuote(b);
    if (!quote.percent) return { error: quote.reason };
    const refund = { status: "Refund requested", requestedAt: new Date().toISOString(), reason: string(reason), percent: quote.percent, amount: quote.amount };
    refunds[id] = refund;
    write(localStorage, REFUNDS_KEY, refunds);
    applyRefund(b);
    const record = records.find(item => item.id === id);
    if (record && record !== b) applyRefund(record);
    return { refund };
  }
  function options(leg, value = draft) {
    if (leg === "return" && value.tripType === "One Way") return [];
    const returning = leg === "return";
    const date = returning ? value.returnDate : value.departureDate;
    if (!validDate(date) || value.passengers > 80) return [];
    const choices = window.ENTREE_DATA.SHIPPING_COMPANIES.map(company => ({
      id: `demo-${company.id}-${leg}-${date}`, ferry: company.name, date,
      departureTime: returning ? company.returnDeparture : company.departure,
      arrivalTime: returning ? company.returnArrival : company.arrival,
      arrivalNextDay: returning && Boolean(company.overnightReturn), duration: company.duration,
      availableSeats: 80, pricePerPerson: returning ? company.returnPrice ?? company.price : company.price,
    }));
    const legacyId = returning ? value.returnId : value.outboundId;
    const legacy = window.ENTREE_DATA.AVAILABLE_FERRIES.find(f => f.id === legacyId && f.date === date && f.availableSeats >= value.passengers);
    if (legacy) choices.push({ ...legacy, duration: "Selected" });
    // Never offer a sailing that has already departed.
    const now = new Date();
    return choices.filter(choice => {
      const departs = timeOn(date, choice.departureTime);
      return !departs || departs > now;
    });
  }
  function selected(leg, value = draft) {
    if (leg === "return" && value.tripType === "One Way") return undefined;
    if (value.id && value[leg + "Trip"]) return value[leg + "Trip"];
    const id = leg === "return" ? value.returnId : value.outboundId;
    // Keep selections made before the company picker was introduced.
    return options(leg, value).find(f => f.id === id) || window.ENTREE_DATA.AVAILABLE_FERRIES.find(f => f.id === id && f.date === (leg === "return" ? value.returnDate : value.departureDate) && f.availableSeats >= value.passengers);
  }
  function save(changes) {
    const next = normalize({ ...draft, ...changes });
    const searchKeys = ["tripType", "origin", "destination", "departureDate", "returnDate", "passengers", "pets", "vehicles", "shippingLine", "cabin"];
    if (searchKeys.some(key => next[key] !== draft[key])) {
      next.outboundId = "";
      next.returnId = "";
      next.completedId = "";
    }
    if (["passengerDetails", "petDetails", "vehicleDetails", "contact"].some(key => JSON.stringify(next[key]) !== JSON.stringify(draft[key]))) next.completedId = "";
    if (!selected("outbound", next)) next.outboundId = "";
    if (!selected("return", next)) next.returnId = "";
    if (changes.outboundId && selected("outbound", next)) next.shippingLine = selected("outbound", next).ferry;
    if (next.outboundId !== draft.outboundId || next.returnId !== draft.returnId) next.completedId = "";
    draft = next;
    write(sessionStorage, KEY, draft);
    return draft;
  }
  function searchError(value = draft) {
    if (!value.origin.trim() || !value.destination.trim()) return "Enter both your origin and destination.";
    if (value.origin.trim().toLowerCase() === value.destination.trim().toLowerCase()) return "Choose different origin and destination ports.";
    if (!validDate(value.departureDate)) return "Choose a departure date.";
    if (value.departureDate < dateValue(new Date())) return "Departure date can't be in the past.";
    if (value.tripType === "Round Trip" && (!validDate(value.returnDate) || value.returnDate < value.departureDate)) return "Return date must be on or after departure.";
    if (value.passengers < 1) return "Add at least one passenger to search for trips.";
    return "";
  }
  function selectionError() {
    const message = searchError() || (!selected("outbound") ? "Choose your departure trip." : draft.tripType === "Round Trip" && !selected("return") ? "Choose your return trip." : "");
    if (message) return message;
    const outbound = selected("outbound"), inbound = selected("return");
    if (inbound) {
      const atTime = (day, time) => {
        const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(time);
        if (!match) return null;
        let hour = Number(match[1]);
        if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0);
        const date = new Date(day + "T00:00:00");
        date.setHours(hour, Number(match[2]), 0, 0);
        return date;
      };
      const arrival = atTime(draft.departureDate, outbound.arrivalTime);
      const departure = atTime(draft.returnDate, inbound.departureTime);
      if (!arrival || !departure) return "Select a trip with a valid departure and arrival time.";
      if (outbound.arrivalNextDay) arrival.setDate(arrival.getDate() + 1);
      if (departure < arrival) return "Choose a return trip that leaves after your departure trip arrives.";
    }
    return "";
  }
  function detailsError() {
    if (selectionError()) return selectionError();
    if (draft.passengerDetails.some(p => !p.name?.trim() || !/^\d{1,3}$/.test(p.age || "") || Number(p.age) > 120 || !p.gender)) return "Complete the details for every passenger.";
    if (draft.petDetails.some(p => !p.name?.trim() || !p.type?.trim())) return "Complete the details for every pet.";
    if (draft.vehicleDetails.some(v => !v.type?.trim() || !v.plate?.trim())) return "Complete the details for every vehicle.";
    if (!draft.contact.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contact.email) || !draft.contact.phone.trim()) return "Complete your contact name, email, and mobile number.";
    return "";
  }
  function totals(value = draft) {
    const legs = Number(Boolean(selected("outbound", value))) + Number(Boolean(selected("return", value)));
    const tickets = ((selected("outbound", value)?.pricePerPerson || 0) + (selected("return", value)?.pricePerPerson || 0)) * value.passengers;
    // Use the demo's existing add-on and booking fees consistently across the flow.
    const vehicles = value.vehicles * 500 * legs;
    const pets = value.pets * 150 * legs;
    const fee = legs ? 50 : 0;
    return { tickets: Math.round(tickets * 100) / 100, vehicles, pets, fee, total: Math.round((tickets + vehicles + pets + fee) * 100) / 100 };
  }
  function complete(payment) {
    if (!["gcash", "bank"].includes(payment) || detailsError()) return null;
    const existing = records.find(b => b.id === draft.completedId);
    if (existing) return existing;
    const id = `local-${crypto.randomUUID()}`;
    const outbound = selected("outbound"), inbound = selected("return");
    const record = {
      ...JSON.parse(JSON.stringify(draft)), id, reference: `ENT-${new Date().getFullYear()}-${id.slice(-8).toUpperCase()}`,
      status: "upcoming", route: { origin: draft.origin, destination: draft.destination }, ferry: outbound.ferry,
      outboundTrip: { ...outbound }, returnTrip: inbound ? { ...inbound } : null, returnFerry: inbound?.ferry,
      departureTime: outbound.departureTime, arrivalTime: outbound.arrivalTime,
      returnDate: inbound ? draft.returnDate : null,
      returnDepartureTime: inbound?.departureTime, returnArrivalTime: inbound?.arrivalTime,
      passengerDetails: draft.passengerDetails.map(p => ({ ...p, age: Number(p.age), seatNumber: "—" })),
      fareBreakdown: totals(), totalPrice: totals().total, payment, hasPasalubong: false, pasalubongItems: 0,
      addOns: [
        { name: "Vehicles", quantity: draft.vehicles, price: 500 },
        { name: "Pets", quantity: draft.pets, price: 150 },
      ].filter(item => item.quantity),
    };
    records.unshift(record);
    window.ENTREE_DATA.MOCK_BOOKINGS.unshift(record);
    write(localStorage, RECORDS_KEY, records);
    save({ completedId: id });
    return record;
  }
  window.ENTREE_BOOKING = { get: () => draft, save, options, selected, totals, searchError, selectionError, detailsError, complete, records: () => records, dateValue, refundQuote, requestRefund, refundOf: id => refunds[id] || null };
})();
