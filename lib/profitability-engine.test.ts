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

test("two approved packages count 1650 income against the cost of all 10 included kilograms", () => {
  const quote = {
    id: "package-two", clientName: "לקוח", versionName: "מאושרת", clientRank: "רגיל", status: "אושרה",
    employees: 0, knownKg: 10, requestedMachines: 2, cupsPerEmployee: 1.5, gramsPerCup: 12,
    workDaysMonth: 21, pricingModel: "monthly_package", packageCount: 2, packageIncludedKg: 5,
    packageMonthlyFee: 825, packageExtraKgPrice: 95,
    blends: [{ name: "+HB", quantityKg: 10, costPerKg: 70, pricePerKg: 95 }],
    equipment: [], equipmentCosts: {}, allocation: [], supplierMonths: 8, leaseMonths: 24,
    manualLeasePerSet: 0, saleMargin: 15, clientCostMonths: 36, extraMonthlyCost: 0,
    clientPayTerm: 0, importerPayTerm: 0, coffeeSupplierPayTerm: 0, cashflowMonths: 36,
    financingMonths: 0, financedAmount: 0, annualInterest: 0, applyVolumeDiscount: false,
    owner: "בועז", notes: "", createdAt: "now", updatedAt: "now",
  } as const;
  const agreement = {
    model: "monthly_package" as const, status: "active" as const, sourceQuoteId: quote.id,
    monthlyBeanKg: 10, beanCostPerKg: 70, beanPricePerKg: 95, packageCount: 2, packageMonthlyFee: 825,
    packageIncludedKgPerUnit: 5, extraKgPrice: 95, monthlyRentalIncome: 0,
    monthlyServiceIncome: 0, oneTimeEquipmentIncome: 0, updatedAt: "now",
  };
  const order = { id: "package-two-order", accountId: "a", month: "2026-10", defaultKg: 10, requestedKg: 10, approvedKg: 10, status: "אושר", blend: "+HB", note: "" };
  const sales = buildDefaultCompanySales(quote, order, agreement);
  const result = calculateActualProfitability({ ...record, fixedRevenue: 1650, serviceCost: 0, deliveryCost: 0, equipmentCost: 0, sales });
  assert.equal(result.revenue, 1650);
  assert.equal(result.beanCost, 700);
  assert.equal(result.grossProfit, 950);
});

test("a manually created package can build its contract coffee cost without a quote", () => {
  const agreement = {
    model: "monthly_package" as const, status: "active" as const,
    monthlyBeanKg: 10, beanCostPerKg: 70, beanPricePerKg: 0,
    packageCount: 2, packageMonthlyFee: 825, packageIncludedKgPerUnit: 5,
    extraKgPrice: 95, monthlyRentalIncome: 0, monthlyServiceIncome: 0,
    oneTimeEquipmentIncome: 0, updatedAt: "now",
  };
  const order = { id: "manual-order", accountId: "a", month: "2026-10", defaultKg: 10, requestedKg: 10, approvedKg: 10, status: "אושר", blend: "DX", note: "" };
  const sales = buildDefaultCompanySales(undefined, order, agreement);
  const result = calculateActualProfitability({ ...record, fixedRevenue: 1650, serviceCost: 0, deliveryCost: 0, equipmentCost: 0, sales });
  assert.equal(result.contract.kg, 10);
  assert.equal(result.beanCost, 700);
  assert.equal(result.grossProfit, 950);
});

test("contract coffee follows actual orders, never the planned quantity", () => {
  const agreement = {
    model: "beans_only" as const, status: "active" as const,
    monthlyBeanKg: 20, beanCostPerKg: 60, beanPricePerKg: 95,
    packageCount: 1, packageMonthlyFee: 0, packageIncludedKgPerUnit: 0,
    extraKgPrice: 0, monthlyRentalIncome: 0, monthlyServiceIncome: 0,
    oneTimeEquipmentIncome: 0, updatedAt: "now",
  };
  assert.deepEqual(buildDefaultCompanySales(undefined, undefined, agreement), []);
  const order = { id: "o", accountId: "a", month: "2026-10", defaultKg: 20, requestedKg: 20, approvedKg: 12, status: "אושר", blend: "DX", note: "" };
  assert.deepEqual(buildDefaultCompanySales(undefined, order, agreement).map((line) => [line.quantityKg, line.costPerKg, line.pricePerKg]), [[12, 60, 95]]);
});

test("legacy company rows remain part of the contract channel", () => {
  const result = calculateActualProfitability({
    ...record,
    sales: [{ id: "legacy", channel: "company", blendName: "ישן", quantityKg: 4, costPerKg: 50, pricePerKg: 90 }],
  });
  assert.equal(result.contract.kg, 4);
  assert.equal(result.company.kg, 4);
});
