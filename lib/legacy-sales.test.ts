import assert from "node:assert/strict";
import test from "node:test";

import type { MonthlyProfitability, Order } from "./platform-types.ts";
import { legacySaleOrders, withLegacySales } from "./legacy-sales.ts";

const record = (sales: MonthlyProfitability["sales"]): MonthlyProfitability => ({
  id: "profit-herzog-2026-09",
  accountId: "herzog",
  month: "2026-09",
  sales,
  fixedRevenue: 0,
  rentalRevenue: 0,
  otherRevenue: 0,
  serviceCost: 0,
  deliveryCost: 0,
  equipmentCost: 0,
  otherCost: 0,
  status: "draft",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
} as MonthlyProfitability);

test("typed sales become display orders with their own price and cost", () => {
  const [order] = legacySaleOrders([
    record([{ id: "s1", channel: "company_extra", blendName: "DX", quantityKg: 6, costPerKg: 62, pricePerKg: 110, deliveryStatus: "סופק", deliveredAt: "2026-09-18", paid: true }]),
  ]);
  assert.equal(order.kind, "company_extra");
  assert.equal(order.month, "2026-09");
  assert.equal(order.accountId, "herzog");
  assert.equal(order.approvedKg, 6);
  assert.equal(order.pricePerKg, 110);
  assert.equal(order.costPerKg, 62);
  assert.equal(order.status, "סופק");
  assert.equal(order.paid, true);
  assert.deepEqual(order.legacySale, { recordId: "profit-herzog-2026-09", lineId: "s1" });
});

test("older company lines count as company extras and keep their board status", () => {
  const orders = legacySaleOrders([
    record([
      { id: "s2", channel: "company", blendName: "HB", quantityKg: 3, costPerKg: 60, pricePerKg: 100 },
      { id: "s3", channel: "employees", blendName: "EMERALD", quantityKg: 2, costPerKg: 70, pricePerKg: 120, deliveryStatus: "נשלח" },
      { id: "s4", channel: "company_extra", blendName: "DX", quantityKg: 1, costPerKg: 60, pricePerKg: 100, deliveryStatus: "בוטל" },
    ]),
  ]);
  assert.deepEqual(orders.map((order) => [order.kind, order.status]), [
    ["company_extra", "אושר"],
    ["employees", "בהכנה"],
    ["company_extra", "בוטל"],
  ]);
});

test("contract lines derived from the month's order are not repeated", () => {
  const orders = legacySaleOrders([
    record([
      { id: "contract-1", channel: "company", blendName: "DX", quantityKg: 20, costPerKg: 60, pricePerKg: 100 },
      { id: "s5", channel: "contract", blendName: "DX", quantityKg: 20, costPerKg: 60, pricePerKg: 100 },
    ]),
  ]);
  assert.equal(orders.length, 0);
});

test("real orders stay as they are and come first", () => {
  const real = { id: "order-herzog-2026-09", accountId: "herzog", month: "2026-09" } as Order;
  const all = withLegacySales([real], [record([{ id: "s6", channel: "company_extra", blendName: "DX", quantityKg: 4, costPerKg: 60, pricePerKg: 100 }])]);
  assert.equal(all[0], real);
  assert.equal(all.length, 2);
});
