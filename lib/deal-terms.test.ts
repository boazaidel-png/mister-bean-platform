import assert from "node:assert/strict";
import test from "node:test";
import { agreementFromVersion, blendCostIn, dealFromQuote, dealMonthMoney, loanPayment, termsAt, versionKg, versionMonthlyIncome, withVersion, type QuoteFigures } from "./deal-terms.ts";
import type { Quote } from "./platform-types.ts";

const quote = {
  id: "q1", versionName: "הצעה א", blends: [{ name: "DX+", quantityKg: 50, pricePerKg: 110, costPerKg: 70 }, { name: "HB+", quantityKg: 35, pricePerKg: 100, costPerKg: 65 }],
  packageCount: 1, packageMonthlyFee: 0, packageIncludedKg: 0, packageExtraKgPrice: 0, clientPayTerm: 1, coffeeSupplierPayTerm: 2,
  importerPayTerm: 1, supplierMonths: 8, annualInterest: 6, combineFinancingAndSupplier: true, clientCostMonths: 36,
} as unknown as Quote;
const figures = (extra: Partial<QuoteFigures> = {}): QuoteFigures => ({
  model: "equipment_rental", equipmentTotal: 20000, saleIncome: 0, leaseIncome: 600, operatingCost: 250,
  financing: { type: "loan", amount: 12000, months: 24 }, ...extra,
});

test("an approved quote becomes the first version, the equipment purchase and the loan", () => {
  const deal = dealFromQuote(quote, figures(), "2026-05", "boaz", "2026-05-01T00:00:00.000Z");
  assert.equal(deal.startMonth, "2026-05");
  assert.equal(deal.contractMonths, 36);
  const [version] = deal.versions;
  assert.equal(version.fromMonth, "2026-05");
  assert.equal(versionKg(version), 85);
  assert.equal(versionMonthlyIncome(version), 50 * 110 + 35 * 100 + 600);
  assert.equal(version.clientPayDelayMonths, 1);
  assert.equal(version.coffeeSupplierPayDelayMonths, 2);
  assert.equal(version.operatingCostEstimate, 250);
  // The loan pays the supplier at once for its part; the rest goes in supplier installments (combined).
  assert.deepEqual(deal.purchases.map((item) => [item.cost, item.supplierPayDelayMonths, item.supplierInstallments, item.loanId]), [[12000, 1, 1, "loan-2026-05"], [8000, 1, 8, undefined]]);
  // A loan for all of it: one payment to the supplier, nothing in installments.
  const full = dealFromQuote(quote, figures({ financing: { type: "loan", amount: 20000, months: 24 } }), "2026-05", "boaz");
  assert.deepEqual(full.purchases.map((item) => [item.cost, item.supplierInstallments]), [[20000, 1]]);
  assert.deepEqual(deal.loans.map((item) => [item.amount, item.months, item.annualInterest, item.firstPaymentMonth]), [[12000, 24, 6, "2026-05"]]);
  // Without a loan there is none; supplier financing spreads the supplier payments.
  const supplier = dealFromQuote(quote, figures({ financing: { type: "supplier", amount: 0, months: 0 } }), "2026-05", "boaz");
  assert.equal(supplier.loans.length, 0);
  assert.equal(supplier.purchases[0].supplierInstallments, 8);
});

test("each month uses the terms in force then; a change does not touch earlier months", () => {
  const deal = dealFromQuote(quote, figures(), "2026-05", "boaz");
  const changed = withVersion(deal, { ...deal.versions[0], id: "terms-2026-09", fromMonth: "2026-09", note: "נוספה מכונה", monthlyRentalIncome: 900 });
  assert.equal(termsAt(changed, "2026-04")?.fromMonth, "2026-05");
  assert.equal(termsAt(changed, "2026-08")?.monthlyRentalIncome, 600);
  assert.equal(termsAt(changed, "2026-09")?.monthlyRentalIncome, 900);
  assert.equal(termsAt(changed, "2027-03")?.monthlyRentalIncome, 900);
  // A second change in the same month replaces the first.
  const again = withVersion(changed, { ...changed.versions[1], monthlyRentalIncome: 950 });
  assert.equal(again.versions.length, 2);
  assert.equal(termsAt(again, "2026-10")?.monthlyRentalIncome, 950);
});

test("a loan repays principal and interest in equal monthly payments", () => {
  assert.equal(loanPayment({ amount: 12000, months: 12, annualInterest: 0 }), 1000);
  const payment = loanPayment({ amount: 12000, months: 24, annualInterest: 6 });
  assert.ok(payment > 500 && payment < 540);
});

test("each month's money follows each purchase and loan on its own dates", () => {
  const deal = dealFromQuote(quote, figures(), "2026-05", "boaz");
  // Loan part (12,000) paid through the loan; the rest (8,000) to the supplier in 8 payments from a month after purchase.
  assert.equal(dealMonthMoney(deal, "2026-05").equipment, 0);
  assert.equal(dealMonthMoney(deal, "2026-06").equipment, 1000);
  assert.equal(dealMonthMoney(deal, "2027-01").equipment, 1000);
  assert.equal(dealMonthMoney(deal, "2027-02").equipment, 0);
  assert.ok(dealMonthMoney(deal, "2026-05").financing > 500);
  assert.equal(dealMonthMoney(deal, "2028-05").financing, 0);
  assert.equal(dealMonthMoney(deal, "2026-05").operating, 250);
  assert.equal(dealMonthMoney(deal, "2029-05").operating, 0);
  // A machine sold in month 9, paid by the customer in 3 payments and to the supplier at once two months later.
  const more = { ...deal, purchases: [...deal.purchases, { id: "m2", month: "2026-09", description: "מכונה נוספת", cost: 6000, saleIncome: 9000, clientInstallments: 3, supplierPayDelayMonths: 2, supplierInstallments: 1, createdAt: "" }] };
  assert.deepEqual([dealMonthMoney(more, "2026-09").equipmentSale, dealMonthMoney(more, "2026-11").equipmentSale, dealMonthMoney(more, "2026-12").equipmentSale], [3000, 3000, 0]);
  assert.equal(dealMonthMoney(more, "2026-11").equipment, 1000 + 6000);
});

test("a version reads as the agreement: prices and costs weighted by kilograms", () => {
  const deal = dealFromQuote(quote, figures(), "2026-05", "boaz");
  const agreement = agreementFromVersion(deal.versions[0]);
  assert.equal(agreement.monthlyBeanKg, 85);
  assert.equal(Math.round(agreement.beanPricePerKg * 85), 50 * 110 + 35 * 100);
  assert.equal(blendCostIn(deal, "2026-07", "hb+"), 65);
});
