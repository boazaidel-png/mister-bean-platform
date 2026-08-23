import assert from "node:assert/strict";
import test from "node:test";

import type { Quote, QuoteEquipment } from "./platform-types.ts";
import {
  automaticAddonsEnabled,
  calculateQuote,
  normalizeAllocationForQuantity,
  recommendedConsumptionKg,
  syncAutomaticAddons,
} from "./quote-engine.ts";

const machine = (quantity: number): QuoteEquipment => ({
  key: "f15",
  model: "DR. COFFEE F-15",
  quantity,
  unitCost: 4090,
  importer: "tavor",
  capacityPerDay: 100,
  addonKeys: ["fridge", "filter", "install"],
  commercialModel: "ללא עלות",
  monthlyPrice: 0,
});

const baseQuote = (equipment: QuoteEquipment[]): Quote => ({
  id: "quote-test",
  clientName: "לקוח בדיקה",
  versionName: "גרסה 1",
  clientRank: "רגיל",
  status: "טיוטה",
  employees: 100,
  knownKg: 0,
  requestedMachines: 1,
  cupsPerEmployee: 1.5,
  gramsPerCup: 12,
  workDaysMonth: 21,
  blends: [{ name: "DX", quantityKg: 38, costPerKg: 60, pricePerKg: 100 }],
  equipment,
  equipmentCosts: {},
  allocation: [{ key: "f15", free: 1, lease: 0, sale: 0 }],
  supplierMonths: 8,
  leaseMonths: 24,
  manualLeasePerSet: 0,
  saleMargin: 15,
  clientCostMonths: 36,
  extraMonthlyCost: 0,
  clientPayTerm: 0,
  importerPayTerm: 0,
  coffeeSupplierPayTerm: 0,
  cashflowMonths: 36,
  financingMonths: 0,
  financedAmount: 0,
  annualInterest: 0,
  financingType: "supplier",
  combineFinancingAndSupplier: false,
  targetMonthlyProfit: 500,
  earlyExitMonth: 12,
  applyVolumeDiscount: true,
  owner: "בועז",
  notes: "",
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
});

test("consumption follows the legacy employee formula and known usage override", () => {
  assert.equal(
    recommendedConsumptionKg({
      employees: 100,
      knownKg: 0,
      cupsPerEmployee: 1.5,
      gramsPerCup: 12,
      workDaysMonth: 21,
    }),
    38,
  );
  assert.equal(
    recommendedConsumptionKg({
      employees: 100,
      knownKg: 55,
      cupsPerEmployee: 1.5,
      gramsPerCup: 12,
      workDaysMonth: 21,
    }),
    55,
  );
});

test("machine quantity automatically creates the correct accessory quantities", () => {
  const equipment = syncAutomaticAddons([machine(2)]);
  const quantities = Object.fromEntries(
    equipment.map((item) => [item.key, item.quantity]),
  );
  assert.equal(quantities.fridge, 2);
  assert.equal(quantities.filter, 2);
  assert.equal(quantities.install, 2);
});

test("saved equipment defaults to manual mode and keeps explicit overrides", () => {
  const equipment = syncAutomaticAddons([machine(9)]).map((item) =>
    item.key === "fridge" || item.key === "filter" || item.key === "install"
      ? { ...item, quantity: 8 }
      : item,
  );
  equipment.push({
    key: "frother",
    model: "מקציף חלב",
    quantity: 4,
    unitCost: 129,
    importer: "tavor",
    commercialModel: "ללא עלות",
    monthlyPrice: 0,
  });

  assert.equal(automaticAddonsEnabled({ equipment }), false);
  assert.equal(automaticAddonsEnabled({ equipment: [] }), true);
  assert.equal(
    automaticAddonsEnabled({ equipment, autoSyncAccessories: true }),
    true,
  );
  assert.equal(equipment.find((item) => item.key === "fridge")?.quantity, 8);
  assert.equal(equipment.find((item) => item.key === "frother")?.quantity, 4);
});

test("allocation remains consistent when machine quantity changes", () => {
  assert.deepEqual(
    normalizeAllocationForQuantity(
      { key: "f15", free: 1, lease: 1, sale: 0 },
      2,
      3,
    ),
    { key: "f15", free: 2, lease: 1, sale: 0 },
  );
  assert.deepEqual(
    normalizeAllocationForQuantity(
      { key: "f15", free: 1, lease: 1, sale: 1 },
      3,
      1,
    ),
    { key: "f15", free: 0, lease: 0, sale: 1 },
  );
});

test("quote totals include the machine and its synchronized package", () => {
  const quote = baseQuote(syncAutomaticAddons([machine(1)]));
  const result = calculateQuote(quote);
  assert.equal(result.consumption.recommendedKg, 38);
  assert.equal(result.equipment.total, 5331);
  assert.equal(result.equipment.uncoveredCost, 5331);
  assert.equal(result.equipment.supplierPayment, 5331 / 8);
  assert.ok(Math.abs(result.beans.costPerCup - 1.2) < 0.000001);
});

test("a loan is cashflow, not profit, and equipment is paid at purchase", () => {
  const equipment = syncAutomaticAddons([machine(1)]);
  const quote = {
    ...baseQuote(equipment),
    financingType: "loan" as const,
    financingMonths: 24,
    financedAmount: 5331,
  };
  const result = calculateQuote(quote);

  assert.equal(result.financing.unfinancedEquipment, 0);
  assert.equal(result.equipment.supplierPayment, 0);
  assert.equal(result.cashflow.rows[0].financingIn, 5331);
  assert.equal(result.cashflow.rows[0].equipmentPayment, 5331);
  assert.equal(result.cashflow.rows[1].equipmentPayment, 0);
  assert.equal(result.cashflow.rows[0].loanPayment, 5331 / 24);
  assert.equal(result.profitability.totalEquipmentEconomicCost, 5331);
  assert.ok(
    Math.abs(
      result.cashflow.finalBalanceAfterLiabilities -
        result.profitability.totalContractProfit,
    ) < 0.000001,
  );
});

test("supplier installments and loan repayments are not counted together by default", () => {
  const equipment = syncAutomaticAddons([machine(1)]);
  const result = calculateQuote({
    ...baseQuote(equipment),
    financingType: "loan",
    financingMonths: 24,
    financedAmount: 3000,
    supplierMonths: 8,
    combineFinancingAndSupplier: false,
  });

  assert.equal(result.cashflow.rows[0].equipmentPayment, 5331);
  assert.equal(result.cashflow.rows[1].equipmentPayment, 0);
  assert.ok(result.cashflow.rows[0].loanPayment > 0);
});

test("loan interest reduces true profit and final cash by the same amount", () => {
  const equipment = syncAutomaticAddons([machine(1)]);
  const withoutInterest = calculateQuote({
    ...baseQuote(equipment),
    financingType: "loan",
    financingMonths: 12,
    financedAmount: 5331,
    annualInterest: 0,
  });
  const withInterest = calculateQuote({
    ...baseQuote(equipment),
    financingType: "loan",
    financingMonths: 12,
    financedAmount: 5331,
    annualInterest: 12,
  });

  assert.ok(withInterest.financing.interest > 0);
  assert.ok(
    Math.abs(
      withoutInterest.profitability.totalContractProfit -
        withInterest.profitability.totalContractProfit -
        withInterest.financing.interest,
    ) < 0.000001,
  );
  assert.ok(
    Math.abs(
      withInterest.cashflow.finalBalanceAfterLiabilities -
        withInterest.profitability.totalContractProfit,
    ) < 0.000001,
  );
});

test("an explicit combined structure spreads only the unfinanced equipment", () => {
  const equipment = syncAutomaticAddons([machine(1)]);
  const result = calculateQuote({
    ...baseQuote(equipment),
    financingType: "loan",
    financingMonths: 24,
    financedAmount: 3000,
    supplierMonths: 8,
    combineFinancingAndSupplier: true,
  });

  assert.equal(result.cashflow.rows[0].equipmentPayment, 3000 + 2331 / 8);
  assert.equal(result.cashflow.rows[1].equipmentPayment, 2331 / 8);
  assert.equal(result.cashflow.rows[7].equipmentPayment, 2331 / 8);
  assert.equal(result.cashflow.rows[8].equipmentPayment, 0);
});

test("net 60 delays coffee cash payments and exposes the contract-end liability", () => {
  const equipment = syncAutomaticAddons([machine(1)]);
  const result = calculateQuote({
    ...baseQuote(equipment),
    clientCostMonths: 3,
    financingType: "none",
    coffeeSupplierPayTerm: 2,
  });

  const monthlyCoffeeCost = 38 * 60;
  assert.equal(result.cashflow.rows[0].coffeePayment, 0);
  assert.equal(result.cashflow.rows[1].coffeePayment, 0);
  assert.equal(result.cashflow.rows[2].coffeePayment, monthlyCoffeeCost);
  assert.equal(result.cashflow.rows[0].openCoffeeLiability, monthlyCoffeeCost);
  assert.equal(result.cashflow.rows[1].openCoffeeLiability, monthlyCoffeeCost * 2);
  assert.equal(result.cashflow.openCoffeeLiability, monthlyCoffeeCost * 2);
  assert.equal(result.cashflow.rows[4].openCoffeeLiability, 0);
  assert.ok(
    Math.abs(
      result.cashflow.finalBalanceAfterLiabilities -
        result.profitability.totalContractProfit,
    ) < 0.000001,
  );
});

test("every cashflow row exposes the running cumulative balance", () => {
  const result = calculateQuote({
    ...baseQuote(syncAutomaticAddons([machine(1)])),
    financingType: "loan",
    financingMonths: 12,
    financedAmount: 5331,
  });

  let runningBalance = 0;
  for (const row of result.cashflow.rows) {
    runningBalance += row.net;
    assert.ok(Math.abs(row.cumulative - runningBalance) < 0.000001);
  }
  assert.equal(
    result.cashflow.contractEndingBalance,
    result.cashflow.rows[35].cumulative,
  );
});
import assert from "node:assert/strict";
import test from "node:test";

import type { Quote, QuoteEquipment } from "./platform-types.ts";
import {
  calculateQuote,
  normalizeAllocationForQuantity,
  recommendedConsumptionKg,
  syncAutomaticAddons,
} from "./quote-engine.ts";

const machine = (quantity: number): QuoteEquipment => ({
  key: "f15",
  model: "DR. COFFEE F-15",
  quantity,
  unitCost: 4090,
  importer: "tavor",
  capacityPerDay: 100,
  addonKeys: ["fridge", "filter", "install"],
  commercialModel: "ללא עלות",
  monthlyPrice: 0,
});

const baseQuote = (equipment: QuoteEquipment[]): Quote => ({
  id: "quote-test",
  clientName: "לקוח בדיקה",
  versionName: "גרסה 1",
  clientRank: "רגיל",
  status: "טיוטה",
  employees: 100,
  knownKg: 0,
  requestedMachines: 1,
  cupsPerEmployee: 1.5,
  gramsPerCup: 12,
  workDaysMonth: 21,
  blends: [{ name: "DX", quantityKg: 38, costPerKg: 60, pricePerKg: 100 }],
  equipment,
  equipmentCosts: {},
  allocation: [{ key: "f15", free: 1, lease: 0, sale: 0 }],
  supplierMonths: 8,
  leaseMonths: 24,
  manualLeasePerSet: 0,
  saleMargin: 15,
  clientCostMonths: 36,
  extraMonthlyCost: 0,
  clientPayTerm: 0,
  importerPayTerm: 0,
  coffeeSupplierPayTerm: 0,
  cashflowMonths: 36,
  financingMonths: 0,
  financedAmount: 0,
  annualInterest: 0,
  financingType: "supplier",
  combineFinancingAndSupplier: false,
  targetMonthlyProfit: 500,
  earlyExitMonth: 12,
  applyVolumeDiscount: true,
  owner: "בועז",
  notes: "",
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
});

test("consumption follows the legacy employee formula and known usage override", () => {
  assert.equal(
    recommendedConsumptionKg({
      employees: 100,
      knownKg: 0,
      cupsPerEmployee: 1.5,
      gramsPerCup: 12,
      workDaysMonth: 21,
    }),
    38,
  );
  assert.equal(
    recommendedConsumptionKg({
      employees: 100,
      knownKg: 55,
      cupsPerEmployee: 1.5,
      gramsPerCup: 12,
      workDaysMonth: 21,
    }),
    55,
  );
});

test("machine quantity automatically creates the correct accessory quantities", () => {
  const equipment = syncAutomaticAddons([machine(2)]);
  const quantities = Object.fromEntries(
    equipment.map((item) => [item.key, item.quantity]),
  );
  assert.equal(quantities.fridge, 2);
  assert.equal(quantities.filter, 2);
  assert.equal(quantities.install, 2);
});

test("allocation remains consistent when machine quantity changes", () => {
  assert.deepEqual(
    normalizeAllocationForQuantity(
      { key: "f15", free: 1, lease: 1, sale: 0 },
      2,
      3,
    ),
    { key: "f15", free: 2, lease: 1, sale: 0 },
  );
  assert.deepEqual(
    normalizeAllocationForQuantity(
      { key: "f15", free: 1, lease: 1, sale: 1 },
      3,
      1,
    ),
    { key: "f15", free: 0, lease: 0, sale: 1 },
  );
});

test("quote totals include the machine and its synchronized package", () => {
  const quote = baseQuote(syncAutomaticAddons([machine(1)]));
  const result = calculateQuote(quote);
  assert.equal(result.consumption.recommendedKg, 38);
  assert.equal(result.equipment.total, 5331);
  assert.equal(result.equipment.uncoveredCost, 5331);
  assert.equal(result.equipment.supplierPayment, 5331 / 8);
  assert.ok(Math.abs(result.beans.costPerCup - 1.2) < 0.000001);
});

test("a loan is cashflow, not profit, and equipment is paid at purchase", () => {
  const equipment = syncAutomaticAddons([machine(1)]);
  const quote = {
    ...baseQuote(equipment),
    financingType: "loan" as const,
    financingMonths: 24,
    financedAmount: 5331,
  };
  const result = calculateQuote(quote);

  assert.equal(result.financing.unfinancedEquipment, 0);
  assert.equal(result.equipment.supplierPayment, 0);
  assert.equal(result.cashflow.rows[0].financingIn, 5331);
  assert.equal(result.cashflow.rows[0].equipmentPayment, 5331);
  assert.equal(result.cashflow.rows[1].equipmentPayment, 0);
  assert.equal(result.cashflow.rows[0].loanPayment, 5331 / 24);
  assert.equal(result.profitability.totalEquipmentEconomicCost, 5331);
  assert.ok(
    Math.abs(
      result.cashflow.finalBalanceAfterLiabilities -
        result.profitability.totalContractProfit,
    ) < 0.000001,
  );
});

test("supplier installments and loan repayments are not counted together by default", () => {
  const equipment = syncAutomaticAddons([machine(1)]);
  const result = calculateQuote({
    ...baseQuote(equipment),
    financingType: "loan",
    financingMonths: 24,
    financedAmount: 3000,
    supplierMonths: 8,
    combineFinancingAndSupplier: false,
  });

  assert.equal(result.cashflow.rows[0].equipmentPayment, 5331);
  assert.equal(result.cashflow.rows[1].equipmentPayment, 0);
  assert.ok(result.cashflow.rows[0].loanPayment > 0);
});

test("loan interest reduces true profit and final cash by the same amount", () => {
  const equipment = syncAutomaticAddons([machine(1)]);
  const withoutInterest = calculateQuote({
    ...baseQuote(equipment),
    financingType: "loan",
    financingMonths: 12,
    financedAmount: 5331,
    annualInterest: 0,
  });
  const withInterest = calculateQuote({
    ...baseQuote(equipment),
    financingType: "loan",
    financingMonths: 12,
    financedAmount: 5331,
    annualInterest: 12,
  });

  assert.ok(withInterest.financing.interest > 0);
  assert.ok(
    Math.abs(
      withoutInterest.profitability.totalContractProfit -
        withInterest.profitability.totalContractProfit -
        withInterest.financing.interest,
    ) < 0.000001,
  );
  assert.ok(
    Math.abs(
      withInterest.cashflow.finalBalanceAfterLiabilities -
        withInterest.profitability.totalContractProfit,
    ) < 0.000001,
  );
});

test("an explicit combined structure spreads only the unfinanced equipment", () => {
  const equipment = syncAutomaticAddons([machine(1)]);
  const result = calculateQuote({
    ...baseQuote(equipment),
    financingType: "loan",
    financingMonths: 24,
    financedAmount: 3000,
    supplierMonths: 8,
    combineFinancingAndSupplier: true,
  });

  assert.equal(result.cashflow.rows[0].equipmentPayment, 3000 + 2331 / 8);
  assert.equal(result.cashflow.rows[1].equipmentPayment, 2331 / 8);
  assert.equal(result.cashflow.rows[7].equipmentPayment, 2331 / 8);
  assert.equal(result.cashflow.rows[8].equipmentPayment, 0);
});

test("net 60 delays coffee cash payments and exposes the contract-end liability", () => {
  const equipment = syncAutomaticAddons([machine(1)]);
  const result = calculateQuote({
    ...baseQuote(equipment),
    clientCostMonths: 3,
    financingType: "none",
    coffeeSupplierPayTerm: 2,
  });

  const monthlyCoffeeCost = 38 * 60;
  assert.equal(result.cashflow.rows[0].coffeePayment, 0);
  assert.equal(result.cashflow.rows[1].coffeePayment, 0);
  assert.equal(result.cashflow.rows[2].coffeePayment, monthlyCoffeeCost);
  assert.equal(result.cashflow.rows[0].openCoffeeLiability, monthlyCoffeeCost);
  assert.equal(result.cashflow.rows[1].openCoffeeLiability, monthlyCoffeeCost * 2);
  assert.equal(result.cashflow.openCoffeeLiability, monthlyCoffeeCost * 2);
  assert.equal(result.cashflow.rows[4].openCoffeeLiability, 0);
  assert.ok(
    Math.abs(
      result.cashflow.finalBalanceAfterLiabilities -
        result.profitability.totalContractProfit,
    ) < 0.000001,
  );
});

test("every cashflow row exposes the running cumulative balance", () => {
  const result = calculateQuote({
    ...baseQuote(syncAutomaticAddons([machine(1)])),
    financingType: "loan",
    financingMonths: 12,
    financedAmount: 5331,
  });

  let runningBalance = 0;
  for (const row of result.cashflow.rows) {
    runningBalance += row.net;
    assert.ok(Math.abs(row.cumulative - runningBalance) < 0.000001);
  }
  assert.equal(
    result.cashflow.contractEndingBalance,
    result.cashflow.rows[35].cumulative,
  );
});
