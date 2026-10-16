import assert from "node:assert/strict";
import test from "node:test";
import { blendLinesChange, blendLinesOf, buildBoardRows, defaultPricePerKg, monthHistory, monthSummary, nextAction, orderStage, orderValue, sortRows } from "./orders-board.ts";
import type { CommercialAgreement, Order } from "./platform-types.ts";

const order = (id: string, extra: Partial<Order> = {}): Order => ({
  id, accountId: "a", month: "2026-10", defaultKg: 10, requestedKg: 10, approvedKg: 10,
  status: "ממתין לעדכון לקוח", blend: "DX", note: "", updatedAt: "2026-10-01", ...extra,
});
const agreement = (extra: Partial<CommercialAgreement> = {}) => ({
  model: "monthly_package", status: "active", monthlyBeanKg: 0, beanCostPerKg: 50, beanPricePerKg: 120,
  packageCount: 1, packageMonthlyFee: 1500, packageIncludedKgPerUnit: 10, extraKgPrice: 130,
  monthlyRentalIncome: 0, monthlyServiceIncome: 0, oneTimeEquipmentIncome: 0, updatedAt: "", ...extra,
}) as CommercialAgreement;
const rows = (orders: Order[]) => buildBoardRows({ orders, agreementFor: () => agreement() });

test("orders sit on one pipeline, payment last and cancellation outside it", () => {
  assert.equal(orderStage({ status: "ממתין לעדכון לקוח" }), "customer");
  assert.equal(orderStage({ status: "לפי חוזה" }), "customer");
  assert.equal(orderStage({ status: "ממתין לאישור" }), "approval");
  assert.equal(orderStage({ status: "אושר" }), "approved");
  assert.equal(orderStage({ status: "בהכנה" }), "preparing");
  assert.equal(orderStage({ status: "סופק" }), "delivered");
  assert.equal(orderStage({ status: "סופק", paid: true }), "paid");
  assert.equal(orderStage({ status: "בוטל", paid: true }), "cancelled");
});

test("an order's value: package plus extra kilos for the contract order, its own price for any other sale", () => {
  assert.equal(orderValue(order("o", { approvedKg: 12 }), agreement()), 1500 + 2 * 130);
  assert.equal(orderValue(order("o"), agreement({ model: "per_kg" as CommercialAgreement["model"] })), 10 * 120);
  assert.equal(orderValue(order("o", { kind: "extra", approvedKg: 3 }), agreement()), 3 * 130);
  assert.equal(orderValue(order("o", { kind: "company_extra", approvedKg: 4, pricePerKg: 95 }), agreement()), 380);
  assert.equal(orderValue(order("o", { kind: "employees", approvedKg: 2 }), agreement()), 0);
  assert.equal(defaultPricePerKg("company_extra", agreement()), 130);
  assert.equal(defaultPricePerKg("employees", agreement()), 0);
});

test("all kinds of sale share one list, with the month's totals", () => {
  const list = rows([
    order("o1", { status: "סופק" }),
    order("o2", { status: "ממתין לאישור", requestedKg: 6, approvedKg: 10 }),
    order("o3", { status: "בוטל" }),
    order("s1", { kind: "company_extra", approvedKg: 4, pricePerKg: 140, status: "סופק", paid: true }),
  ]);
  assert.deepEqual(list.map((row) => row.kind), ["contract", "contract", "contract", "company_extra"]);
  const summary = monthSummary(list);
  assert.equal(summary.orders, 3);
  assert.equal(summary.orderedKg, 24);
  assert.equal(summary.deliveredKg, 14);
  assert.equal(summary.unpaidCount, 1);
  assert.equal(summary.unpaidValue, 1500);
  assert.equal(summary.byStage.cancelled, 1);
  assert.equal(sortRows(list)[0].order.id, "o2", "orders waiting for the office come first");
});

test("each stage offers one next step", () => {
  assert.deepEqual(nextAction(rows([order("o", { status: "ממתין לאישור", requestedKg: 6, customerConfirmedAt: "x" })])[0]), { label: "אישור", order: { status: "אושר", approvedKg: 6 } });
  assert.deepEqual(nextAction(rows([order("o", { status: "בהכנה" })])[0], "2026-10-12"), { label: "סימון כסופק", order: { status: "סופק", deliveredAt: "2026-10-12" } });
  // An employee sale: nothing to approve while employees order; delivering it settles it, as they paid up front.
  const sale = { kind: "employees" as const, shopCampaignId: "shop-1" };
  assert.equal(nextAction(rows([order("e", { ...sale, status: "ממתין לעדכון לקוח" })])[0]), null);
  assert.deepEqual(nextAction(rows([order("e", { ...sale, status: "בהכנה" })])[0], "2026-10-12"), { label: "סימון כסופק", order: { status: "סופק", deliveredAt: "2026-10-12", paid: true } });
  assert.deepEqual(nextAction(rows([order("o", { status: "סופק" })])[0]), { label: "סימון כשולם", order: { paid: true } });
  assert.equal(nextAction(rows([order("o", { status: "סופק", paid: true })])[0]), null);
});

test("the history covers twelve months ending with the chosen one", () => {
  const history = monthHistory(rows([order("a", { month: "2026-10" }), order("b", { month: "2025-11", approvedKg: 7 })]), "2026-10");
  assert.equal(history.length, 12);
  assert.equal(history[0].month, "2025-11");
  assert.equal(history[0].kg, 7);
  assert.equal(history[11].kg, 10);
});

test("an order can be split into several blends; their sum is the approved quantity", () => {
  assert.deepEqual(blendLinesOf(order("o", { approvedKg: 85, blend: "DX+" })), [{ blend: "DX+", kg: 85 }]);
  const split = blendLinesChange([{ blend: " DX+ ", kg: 50 }, { blend: "HB+", kg: 35 }, { blend: "", kg: 5 }]);
  assert.deepEqual(split, { blend: "DX+ · HB+", blendLines: [{ blend: "DX+", kg: 50 }, { blend: "HB+", kg: 35 }], approvedKg: 85 });
  assert.deepEqual(blendLinesOf(order("o", split)), split.blendLines);
  // Back to one blend: saved as a plain blend.
  assert.deepEqual(blendLinesChange([{ blend: "Amber", kg: 85 }]), { blend: "Amber", blendLines: [], approvedKg: 85 });
});
