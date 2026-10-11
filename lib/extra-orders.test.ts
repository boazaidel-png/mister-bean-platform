import assert from "node:assert/strict";
import test from "node:test";
import { deliveredThisMonthKg, deliveryPreferenceLabel, newExtraOrder, nextContractDelivery, openExtraOrders, validateExtraOrder } from "./extra-orders.ts";
import type { Order } from "./platform-types.ts";

const order = (extra: Partial<Order>): Order => ({
  id: "o", accountId: "a", month: "2026-10", defaultKg: 10, requestedKg: 10, approvedKg: 10, status: "לפי חוזה", blend: "DX", note: "", ...extra,
});
const today = new Date(2026, 9, 11, 10); // 11 Oct 2026

test("the next contract delivery is this month's day while it is ahead and not delivered", () => {
  assert.deepEqual(nextContractDelivery(15, [order({})], today), { date: "2026-10-15", days: 4 });
  assert.deepEqual(nextContractDelivery(15, [order({ status: "סופק", deliveredAt: "2026-10-09" })], today), { date: "2026-11-15", days: 35 });
  assert.deepEqual(nextContractDelivery(5, [order({})], today), { date: "2026-11-05", days: 25 });
  // A top-up delivered this month does not count as the contract delivery.
  assert.equal(nextContractDelivery(15, [order({ id: "x", kind: "extra", status: "סופק", deliveredAt: "2026-10-09" })], today).date, "2026-10-15");
});

test("coffee delivered this month counts contract and top-ups", () => {
  const orders = [
    order({ status: "סופק", deliveredAt: "2026-10-02", approvedKg: 10 }),
    order({ id: "e", kind: "extra", status: "סופק", deliveredAt: "2026-10-08", requestedKg: 4, approvedKg: 4 }),
    order({ id: "old", status: "סופק", deliveredAt: "2026-09-20" }),
    order({ id: "open", kind: "extra", status: "ממתין לאישור", requestedKg: 3, approvedKg: 0 }),
  ];
  assert.equal(deliveredThisMonthKg(orders, today), 14);
  assert.deepEqual(openExtraOrders(orders).map((item) => item.id), ["open"]);
});

test("a top-up order waits for the office with the delivery the customer asked for", () => {
  const created = newExtraOrder({ accountId: "a", kg: 5, blend: "HB+", note: " דחוף ", preference: "date", date: "2026-10-14", now: today });
  assert.equal(created.kind, "extra");
  assert.equal(created.status, "ממתין לאישור");
  assert.deepEqual([created.defaultKg, created.requestedKg, created.approvedKg, created.month, created.note], [0, 5, 0, "2026-10", "דחוף"]);
  assert.equal(deliveryPreferenceLabel(created), "ב-14/10/2026");
  assert.equal(newExtraOrder({ accountId: "a", kg: 5, blend: "", note: "", preference: "asap", date: "2026-10-14", now: today }).requestedDeliveryDate, undefined);
});

test("top-up input is checked", () => {
  assert.equal(validateExtraOrder({ kg: 5, preference: "asap" }, today), "");
  assert.match(validateExtraOrder({ kg: 0, preference: "asap" }, today), /כמות/);
  assert.match(validateExtraOrder({ kg: 900, preference: "asap" }, today), /עד 500/);
  assert.match(validateExtraOrder({ kg: 5, preference: "date" }, today), /תאריך/);
  assert.match(validateExtraOrder({ kg: 5, preference: "date", date: "2026-10-11" }, today), /ממחר/);
  assert.equal(validateExtraOrder({ kg: 5, preference: "date", date: "2026-10-12" }, today), "");
});
