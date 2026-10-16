import assert from "node:assert/strict";
import test from "node:test";
import { dealFromQuote, loanPayment, termsAt, versionKg, versionMonthlyIncome, withVersion, type QuoteFigures } from "./deal-terms.ts";
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
  assert.deepEqual(deal.purchases.map((item) => [item.cost, item.supplierPayDelayMonths, item.supplierInstallments, item.loanId]), [[20000, 1, 8, "loan-2026-05"]]);
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
