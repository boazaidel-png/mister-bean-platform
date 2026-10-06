import assert from "node:assert/strict";
import test from "node:test";
import { buildDefaultCompanySales, calculateActualProfitability } from "./profitability-engine.ts";
import type { MonthlyProfitability } from "./platform-types.ts";

const record: MonthlyProfitability = {
  id: "a:2026-10", accountId: "a", month: "2026-10", status: "draft",
  fixedRevenue: 650, rentalRevenue: 0, otherRevenue: 0,
  serviceCost: 100, deliveryCost: 50, equipmentCost: 120, otherCost: 0,
  createdAt: "now", updatedAt: "now",
  sales: [
    { id: "included", channel: "contract", blendName: "חברה", quantityKg: 5, costPerKg: 50, pricePerKg: 90, includedInFixedRevenue: true },
    { id: "extra", channel: "company_extra", blendName: "חברה", quantityKg: 2, costPerKg: 50, pricePerKg: 90 },
    { id: "employees", channel: "employees", blendName: "עובדים", quantityKg: 3, costPerKg: 55, pricePerKg: 110 },
  ],
};

test("employee blends use their own purchase and sale prices", () => {
  const result = calculateActualProfitability(record);
  assert.equal(result.employees.revenue, 330);
  assert.equal(result.employees.beanCost, 165);
  assert.equal(result.company.revenue, 180);
  assert.equal(result.company.beanCost, 350);
  assert.equal(result.contract.kg, 5);
  assert.equal(result.companyExtra.kg, 2);
});

test("package revenue is counted once while every consumed kilogram has a cost", () => {
  const result = calculateActualProfitability(record);
  assert.equal(result.revenue, 1160);
  assert.equal(result.beanCost, 515);
  assert.equal(result.netProfit, 375);
  assert.equal(result.totalKg, 10);
});

test("monthly contract order becomes the default company sale", () => {
  const quote = {
    id: "quote", clientName: "לקוח", versionName: "1", clientRank: "רגיל", status: "אושרה",
    employees: 0, knownKg: 12, requestedMachines: 1, cupsPerEmployee: 1.5, gramsPerCup: 12,
    workDaysMonth: 21, pricingModel: "standard", blends: [{ name: "DX", quantityKg: 12, costPerKg: 55, pricePerKg: 92 }],
    equipment: [], equipmentCosts: {}, allocation: [], supplierMonths: 8, leaseMonths: 24,
    manualLeasePerSet: 0, saleMargin: 15, clientCostMonths: 36, extraMonthlyCost: 0,
    clientPayTerm: 0, importerPayTerm: 0, coffeeSupplierPayTerm: 0, cashflowMonths: 36,
    financingMonths: 0, financedAmount: 0, annualInterest: 0, applyVolumeDiscount: false,
    owner: "בועז", notes: "", createdAt: "now", updatedAt: "now",
  } as const;
  const order = { id: "order", accountId: "a", month: "2026-10", defaultKg: 12, requestedKg: 14, approvedKg: 14, status: "אושר", blend: "DX", note: "" };

  assert.deepEqual(buildDefaultCompanySales(quote, order), [{
    id: "contract-order", channel: "contract", blendName: "DX", quantityKg: 14,
    costPerKg: 55, pricePerKg: 92,
  }]);
});

test("monthly package splits included and extra company kilograms without double revenue", () => {
  const quote = {
    id: "package", clientName: "לקוח", versionName: "1", clientRank: "רגיל", status: "אושרה",
    employees: 0, knownKg: 5, requestedMachines: 1, cupsPerEmployee: 1.5, gramsPerCup: 12,
    workDaysMonth: 21, pricingModel: "monthly_package", packageCount: 1, packageIncludedKg: 5,
    packageMonthlyFee: 650, packageExtraKgPrice: 90,
    blends: [{ name: "DX", quantityKg: 5, costPerKg: 50, pricePerKg: 90 }],
    equipment: [], equipmentCosts: {}, allocation: [], supplierMonths: 8, leaseMonths: 24,
    manualLeasePerSet: 0, saleMargin: 15, clientCostMonths: 36, extraMonthlyCost: 0,
    clientPayTerm: 0, importerPayTerm: 0, coffeeSupplierPayTerm: 0, cashflowMonths: 36,
    financingMonths: 0, financedAmount: 0, annualInterest: 0, applyVolumeDiscount: false,
    owner: "בועז", notes: "", createdAt: "now", updatedAt: "now",
  } as const;
  const order = { id: "package-order", accountId: "a", month: "2026-10", defaultKg: 5, requestedKg: 8, approvedKg: 8, status: "אושר", blend: "DX", note: "" };
  const sales = buildDefaultCompanySales(quote, order);
  assert.deepEqual(sales.map((line) => [line.channel, line.quantityKg, line.pricePerKg, line.includedInFixedRevenue]), [
    ["contract", 5, 90, true],
    ["company_extra", 3, 90, false],
  ]);
  const result = calculateActualProfitability({ ...record, fixedRevenue: 650, sales });
  assert.equal(result.revenue, 920);
  assert.equal(result.beanCost, 400);
});

test("legacy company rows remain part of the contract channel", () => {
  const result = calculateActualProfitability({
    ...record,
    sales: [{ id: "legacy", channel: "company", blendName: "ישן", quantityKg: 4, costPerKg: 50, pricePerKg: 90 }],
  });
  assert.equal(result.contract.kg, 4);
  assert.equal(result.company.kg, 4);
});
