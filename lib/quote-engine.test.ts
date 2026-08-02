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

test("financing does not hide importer installments from monthly cashflow", () => {
  const equipment = syncAutomaticAddons([machine(1)]);
  const quote = {
    ...baseQuote(equipment),
    financingMonths: 24,
    financedAmount: 5331,
  };
  const result = calculateQuote(quote);

  assert.equal(result.financing.unfinancedEquipment, 0);
  assert.equal(result.equipment.supplierPayment, 0);
  assert.equal(result.cashflow.rows[0].importer, 5331 / 8);
  assert.equal(result.cashflow.rows[7].importer, 5331 / 8);
  assert.equal(result.cashflow.rows[8].importer, 0);
  assert.equal(result.cashflow.rows[0].financing, 5331 - 5331 / 24);
});
