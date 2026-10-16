import assert from "node:assert/strict";
import test from "node:test";
import { dealMonth, dealPeriod, type DealInput } from "./deal-economics.ts";
import type { CommercialAgreement, Order } from "./platform-types.ts";

const agreement = (extra: Partial<CommercialAgreement> = {}) => ({
  model: "monthly_package", status: "active", monthlyBeanKg: 0, beanCostPerKg: 60, beanPricePerKg: 0,
  packageCount: 1, packageMonthlyFee: 1500, packageIncludedKgPerUnit: 10, extraKgPrice: 130,
  monthlyRentalIncome: 0, monthlyServiceIncome: 100, oneTimeEquipmentIncome: 0, updatedAt: "", ...extra,
}) as CommercialAgreement;
const order = (id: string, extra: Partial<Order> = {}): Order => ({
  id, accountId: "a", month: "2026-10", defaultKg: 10, requestedKg: 10, approvedKg: 10, status: "אושר", blend: "DX", note: "", ...extra,
});
const input = (extra: Partial<DealInput> = {}): DealInput => ({
  agreement: agreement(),
  plan: { contractMonths: 3, averageMonthlyProfit: 400, totalContractProfit: 1200, rows: [
    { equipmentPayment: 500, financingIn: 0, loanPayment: 0, operatingCost: 200 },
    { equipmentPayment: 500, financingIn: 0, loanPayment: 0, operatingCost: 200 },
    { equipmentPayment: 0, financingIn: 0, loanPayment: 0, operatingCost: 200 },
  ] },
  startMonth: "2026-09", contractMonths: 3, contractKg: 10, orders: [],
  extraCosts: () => [], blendCost: () => 70, today: "2026-10", ...extra,
});

test("a package month: fee plus extra kilos, beans by delivery, costs from the quote", () => {
  const month = dealMonth(input({ orders: [order("c", { approvedKg: 12, status: "סופק" })] }), "2026-10");
  assert.equal(month.index, 2);
  assert.deepEqual(month.revenue.contract, { actual: 1500, expected: 1500 });
  assert.deepEqual(month.revenue.extraKg, { actual: 260, expected: 260 });
  assert.deepEqual(month.revenue.service, { actual: 100, expected: 100 });
  assert.deepEqual(month.costs.beans, { actual: 12 * 70, expected: 12 * 70 });
  assert.deepEqual(month.costs.equipment, { actual: 500, expected: 500 });
  assert.deepEqual(month.costs.operating, { actual: 200, expected: 200 });
  assert.equal(month.profit.actual, 1500 + 260 + 100 - 840 - 500 - 200);
});

test("orders not yet delivered are expected, not actual", () => {
  const month = dealMonth(input({ orders: [order("c"), order("x", { kind: "company_extra", approvedKg: 5, pricePerKg: 95, costPerKg: 60 })] }), "2026-10");
  assert.deepEqual(month.revenue.contract, { actual: 0, expected: 1500 });
  assert.deepEqual(month.revenue.companyExtra, { actual: 0, expected: 475 });
  assert.deepEqual(month.costs.beans, { actual: 0, expected: 10 * 70 + 5 * 60 });
});

test("extras, employees and top-ups are priced from the order, else from the agreement", () => {
  const month = dealMonth(input({ orders: [
    order("t", { kind: "extra", approvedKg: 3, status: "סופק" }),
    order("e", { kind: "employees", approvedKg: 2, pricePerKg: 120, status: "סופק" }),
    order("cancelled", { kind: "company_extra", approvedKg: 50, pricePerKg: 95, status: "בוטל" }),
  ] }), "2026-10");
  assert.equal(month.revenue.topUps.actual, 3 * 130);
  assert.equal(month.revenue.employees.actual, 2 * 120);
  assert.equal(month.revenue.companyExtra.expected, 0);
});

test("one-off costs and per-kilo agreements", () => {
  const month = dealMonth(input({
    agreement: agreement({ model: "per_kg" as CommercialAgreement["model"], beanPricePerKg: 110 }),
    orders: [order("c", { status: "סופק" })],
    extraCosts: (value) => value === "2026-10" ? [{ id: "1", label: "תיקון", amount: 300, createdAt: "" }] : [],
  }), "2026-10");
  assert.equal(month.revenue.contract.actual, 10 * 110);
  assert.equal(month.costs.extra.actual, 300);
});

test("future months have no actual values; the period adds them as forecast", () => {
  const ahead = dealMonth(input(), "2026-11");
  assert.equal(ahead.costs.operating.actual, 0);
  assert.equal(ahead.costs.operating.expected, 200);
  const period = dealPeriod(input({ orders: [order("s", { month: "2026-09", status: "סופק" }), order("o", { status: "סופק" })] }));
  assert.equal(period.months.length, 3);
  assert.equal(period.elapsed, 2);
  assert.equal(period.target, 1200);
  assert.equal(period.endMonth, "2026-11");
  assert.equal(period.forecast, period.toDate + ahead.profit.expected);
});

test("an order of several blends costs each blend's cost by its kilograms", () => {
  const month = dealMonth(input({
    orders: [order("o", { month: "2026-10", approvedKg: 10, blendLines: [{ blend: "DX", kg: 6 }, { blend: "HB+", kg: 4 }] })],
    blendCost: (blend) => blend === "DX" ? 50 : 100,
  }), "2026-10");
  assert.equal(month.costs.beans.expected, 6 * 50 + 4 * 100);
});
