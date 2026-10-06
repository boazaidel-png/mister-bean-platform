import assert from "node:assert/strict";
import test from "node:test";
import { calculateActualProfitability } from "./profitability-engine.ts";
import type { MonthlyProfitability } from "./platform-types.ts";

const record: MonthlyProfitability = {
  id: "a:2026-10", accountId: "a", month: "2026-10", status: "draft",
  fixedRevenue: 650, rentalRevenue: 0, otherRevenue: 0,
  serviceCost: 100, deliveryCost: 50, equipmentCost: 120, otherCost: 0,
  createdAt: "now", updatedAt: "now",
  sales: [
    { id: "included", channel: "company", blendName: "חברה", quantityKg: 5, costPerKg: 50, pricePerKg: 0 },
    { id: "extra", channel: "company", blendName: "חברה", quantityKg: 2, costPerKg: 50, pricePerKg: 90 },
    { id: "employees", channel: "employees", blendName: "עובדים", quantityKg: 3, costPerKg: 55, pricePerKg: 110 },
  ],
};

test("employee blends use their own purchase and sale prices", () => {
  const result = calculateActualProfitability(record);
  assert.equal(result.employees.revenue, 330);
  assert.equal(result.employees.beanCost, 165);
  assert.equal(result.company.revenue, 180);
  assert.equal(result.company.beanCost, 350);
});

test("package revenue is counted once while every consumed kilogram has a cost", () => {
  const result = calculateActualProfitability(record);
  assert.equal(result.revenue, 1160);
  assert.equal(result.beanCost, 515);
  assert.equal(result.netProfit, 375);
  assert.equal(result.totalKg, 10);
});
