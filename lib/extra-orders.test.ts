import assert from "node:assert/strict";
import test from "node:test";
import { deliveredThisMonthKg, extraAllowanceKg, highConsumption, deliveryPreferenceLabel, newExtraOrder, nextContractDelivery, openExtraOrders, validateExtraOrder } from "./extra-orders.ts";
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

test("two full months over the contract by more than 20% flag high consumption", () => {
  const month = (m: string, kg: number, extra = 0, status = "סופק"): Order[] => [
    order({ id: `c-${m}`, month: m, approvedKg: kg, status }),
    ...(extra ? [order({ id: `e-${m}`, month: m, kind: "extra", defaultKg: 0, requestedKg: extra, approvedKg: extra, status })] : []),
  ];
  const high = [...month("2026-08", 10, 3), ...month("2026-09", 10, 4), ...month("2026-10", 10)];
  assert.deepEqual(highConsumption(high, 10, "2026-10"), { months: ["2026-08", "2026-09"], totals: [13, 14], contractKg: 10, average: 13.5, overPercent: 35 });
  // Reaching the 20% top-up cap counts; just under it, or one high month, does not.
  assert.ok(highConsumption([...month("2026-08", 10, 2), ...month("2026-09", 10, 2)], 10, "2026-10"));
  assert.equal(highConsumption([...month("2026-08", 10, 1), ...month("2026-09", 10, 4)], 10, "2026-10"), null);
  // A cancelled top-up does not count.
  assert.equal(highConsumption([...month("2026-08", 10, 3), ...month("2026-09", 10), order({ id: "x", month: "2026-09", kind: "extra", requestedKg: 9, status: "בוטל" })], 10, "2026-10"), null);
  // January looks back across the year.
  assert.ok(highConsumption([...month("2025-11", 10, 5), ...month("2025-12", 10, 5)], 10, "2026-01"));
});

test("top-ups add up to at most 20% of the contract each month", () => {
  const orders = [
    order({ id: "e1", kind: "extra", defaultKg: 0, requestedKg: 3, approvedKg: 0, status: "ממתין לאישור" }),
    order({ id: "e2", kind: "extra", defaultKg: 0, requestedKg: 9, approvedKg: 0, status: "בוטל" }),
    order({ id: "e3", month: "2026-09", kind: "extra", defaultKg: 0, requestedKg: 4, approvedKg: 4, status: "סופק" }),
  ];
  assert.deepEqual(extraAllowanceKg(orders, 25, "2026-10"), { limit: 5, used: 3, left: 2 });
  assert.match(validateExtraOrder({ kg: 3, preference: "asap", allowanceKg: 2 }, today), /עד 2 ק״ג.*קשר ישירות/);
  assert.match(validateExtraOrder({ kg: 1, preference: "asap", allowanceKg: 0 }, today), /נוצלה.*קשר ישירות/);
  assert.equal(validateExtraOrder({ kg: 2, preference: "asap", allowanceKg: 2 }, today), "");
});
