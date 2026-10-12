import assert from "node:assert/strict";
import test from "node:test";
import { buildBoardRows, monthHistory, monthSummary, nextAction, orderStage, orderValue, saleStage, sortRows } from "./orders-board.ts";
import type { CommercialAgreement, MonthlyProfitability, Order } from "./platform-types.ts";

const order = (id: string, extra: Partial<Order> = {}): Order => ({
  id, accountId: "a", month: "2026-10", defaultKg: 10, requestedKg: 10, approvedKg: 10,
  status: "ממתין לעדכון לקוח", blend: "DX", note: "", updatedAt: "2026-10-01", ...extra,
});
const agreement = (extra: Partial<CommercialAgreement> = {}) => ({
  model: "monthly_package", status: "active", monthlyBeanKg: 0, beanCostPerKg: 50, beanPricePerKg: 120,
  packageCount: 1, packageMonthlyFee: 1500, packageIncludedKgPerUnit: 10, extraKgPrice: 130,
  monthlyRentalIncome: 0, monthlyServiceIncome: 0, oneTimeEquipmentIncome: 0, updatedAt: "", ...extra,
}) as CommercialAgreement;
const record = (sales: MonthlyProfitability["sales"], status: "draft" | "closed" = "draft") => ({
  id: "r1", accountId: "a", month: "2026-10", status, sales, updatedAt: "2026-10-05",
}) as unknown as MonthlyProfitability;

test("orders sit on one pipeline, payment last and cancellation outside it", () => {
  assert.equal(orderStage({ status: "ממתין לעדכון לקוח" }), "customer");
  assert.equal(orderStage({ status: "לפי חוזה" }), "customer");
  assert.equal(orderStage({ status: "ממתין לאישור" }), "approval");
  assert.equal(orderStage({ status: "אושר" }), "approved");
  assert.equal(orderStage({ status: "בהכנה" }), "preparing");
  assert.equal(orderStage({ status: "סופק" }), "delivered");
  assert.equal(orderStage({ status: "סופק", paid: true }), "paid");
  assert.equal(orderStage({ status: "בוטל", paid: true }), "cancelled");
  assert.equal(saleStage({ deliveryStatus: "ממתין להכנה" }), "approved");
  assert.equal(saleStage({ deliveryStatus: "נשלח" }), "preparing");
});

test("an order's value follows the agreement: package plus extra kilos, or kilos at the price", () => {
  assert.equal(orderValue(order("o", { approvedKg: 12 }), agreement()), 1500 + 2 * 130);
  assert.equal(orderValue(order("o"), agreement({ model: "per_kg" as CommercialAgreement["model"] })), 10 * 120);
  assert.equal(orderValue(order("o", { kind: "extra", approvedKg: 3 }), agreement()), 3 * 130);
  assert.equal(orderValue(order("o"), undefined), 0);
});

test("orders and extra sale lines share one list, with the month's totals", () => {
  const rows = buildBoardRows({
    orders: [order("o1", { status: "סופק" }), order("o2", { status: "ממתין לאישור", requestedKg: 6, approvedKg: 10 }), order("o3", { status: "בוטל" })],
    profitability: [record([
      { id: "s1", channel: "company_extra", blendName: "HB+", quantityKg: 4, costPerKg: 60, pricePerKg: 140, deliveryStatus: "סופק", paid: true },
      { id: "contract-x", channel: "contract", blendName: "DX", quantityKg: 10, costPerKg: 60, pricePerKg: 0 },
    ])],
    agreementFor: () => agreement(),
  });
  assert.equal(rows.length, 4);
  const summary = monthSummary(rows);
  assert.equal(summary.orders, 3);
  assert.equal(summary.orderedKg, 10 + 10 + 4);
  assert.equal(summary.deliveredKg, 14);
  assert.equal(summary.unpaidCount, 1);
  assert.equal(summary.unpaidValue, 1500);
  assert.equal(summary.byStage.cancelled, 1);
  assert.equal(sortRows(rows)[0].order?.id, "o2", "orders waiting for the office come first");
});

test("each stage offers one next step, and a closed month's lines offer none", () => {
  const [pending] = buildBoardRows({ orders: [order("o", { status: "ממתין לאישור", requestedKg: 6, customerConfirmedAt: "x" })], profitability: [], agreementFor: () => undefined });
  assert.deepEqual(nextAction(pending), { label: "אישור", order: { status: "אושר", approvedKg: 6 } });
  const [preparing] = buildBoardRows({ orders: [order("o", { status: "בהכנה" })], profitability: [], agreementFor: () => undefined });
  assert.deepEqual(nextAction(preparing, "2026-10-12"), { label: "סימון כסופק", order: { status: "סופק", deliveredAt: "2026-10-12" } });
  const [delivered] = buildBoardRows({ orders: [order("o", { status: "סופק" })], profitability: [], agreementFor: () => undefined });
  assert.deepEqual(nextAction(delivered), { label: "סימון כשולם", order: { paid: true } });
  const [locked] = buildBoardRows({ orders: [], profitability: [record([{ id: "s", channel: "employees", blendName: "DX", quantityKg: 2, costPerKg: 1, pricePerKg: 2 }], "closed")], agreementFor: () => undefined });
  assert.equal(nextAction(locked), null);
});

test("the history covers twelve months ending with the chosen one", () => {
  const rows = buildBoardRows({ orders: [order("a", { month: "2026-10" }), order("b", { month: "2025-11", approvedKg: 7 })], profitability: [], agreementFor: () => undefined });
  const history = monthHistory(rows, "2026-10");
  assert.equal(history.length, 12);
  assert.equal(history[0].month, "2025-11");
  assert.equal(history[0].kg, 7);
  assert.equal(history[11].kg, 10);
});
