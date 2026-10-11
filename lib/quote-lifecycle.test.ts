import assert from "node:assert/strict";
import test from "node:test";

import type { CommercialAgreement, Customer, Lead, Quote } from "./platform-types.ts";
import {
  activeQuoteFor,
  customerUpdateForActiveQuote,
  existingAccountIdForQuote,
  isSupersededQuote,
  quotesShareClient,
} from "./quote-lifecycle.ts";

const quote = (fields: Partial<Quote>): Quote =>
  ({
    id: "q",
    clientName: "אקמה",
    status: "נשלחה",
    updatedAt: "2026-10-01T10:00:00.000Z",
    ...fields,
  }) as Quote;

test("versions of the same lead share a client", () => {
  assert.equal(
    quotesShareClient(
      quote({ id: "a", leadId: "lead-1", clientName: "אקמה" }),
      quote({ id: "b", leadId: "lead-1", clientName: "אקמה בע״מ" }),
    ),
    true,
  );
});

test("a client key matches the account of another version", () => {
  assert.equal(
    quotesShareClient(
      quote({ id: "a", clientName: "x", clientKey: "acct-1" }),
      quote({ id: "b", clientName: "y", accountId: "acct-1" }),
    ),
    true,
  );
});

test("different clients do not match", () => {
  assert.equal(
    quotesShareClient(
      quote({ id: "a", leadId: "lead-1", clientName: "אקמה" }),
      quote({ id: "b", leadId: "lead-2", clientName: "גלובל" }),
    ),
    false,
  );
});

test("open versions written before an approval are superseded", () => {
  const approved = quote({
    id: "approved",
    leadId: "lead-1",
    status: "אושרה",
    approvedAt: "2026-10-05T10:00:00.000Z",
  });
  const older = quote({ id: "older", leadId: "lead-1", updatedAt: "2026-10-03T10:00:00.000Z" });
  const draft = quote({ id: "draft", leadId: "lead-1", status: "טיוטה", updatedAt: "2026-10-04T10:00:00.000Z" });
  const all = [approved, older, draft];
  assert.equal(isSupersededQuote(older, all), true);
  assert.equal(isSupersededQuote(draft, all), true);
  assert.equal(isSupersededQuote(approved, all), false);
});

test("a new quote for an existing customer stays active", () => {
  const approved = quote({
    id: "approved",
    accountId: "acct-1",
    status: "אושרה",
    approvedAt: "2026-10-05T10:00:00.000Z",
  });
  const upsell = quote({
    id: "upsell",
    clientKey: "acct-1",
    accountId: "acct-1",
    updatedAt: "2026-10-08T10:00:00.000Z",
  });
  assert.equal(isSupersededQuote(upsell, [approved, upsell]), false);
});

test("rejected versions are left as rejected", () => {
  const approved = quote({ id: "approved", leadId: "lead-1", status: "אושרה", approvedAt: "2026-10-05T10:00:00.000Z" });
  const rejected = quote({ id: "rejected", leadId: "lead-1", status: "נדחתה" });
  assert.equal(isSupersededQuote(rejected, [approved, rejected]), false);
});

test("approving a second version reuses the existing customer account", () => {
  const first = quote({ id: "first", leadId: "lead-1", status: "אושרה", accountId: "acct-1" });
  const second = quote({ id: "second", leadId: "lead-1" });
  assert.equal(existingAccountIdForQuote(second, [first, second]), "acct-1");
});

test("the lead's account wins over sibling versions", () => {
  const first = quote({ id: "first", leadId: "lead-1", accountId: "acct-old" });
  const second = quote({ id: "second", leadId: "lead-1" });
  const lead = { id: "lead-1", convertedAccountId: "acct-lead" } as Lead;
  assert.equal(existingAccountIdForQuote(second, [first, second], lead), "acct-lead");
});

test("a new client gets no existing account", () => {
  const other = quote({ id: "other", leadId: "lead-2", clientName: "גלובל", accountId: "acct-2" });
  const fresh = quote({ id: "fresh", leadId: "lead-1" });
  assert.equal(existingAccountIdForQuote(fresh, [other, fresh]), undefined);
});


const fullQuote = (fields: Partial<Quote>): Quote =>
  quote({
    versionName: "v",
    clientRank: "רגיל",
    employees: 0,
    knownKg: 0,
    requestedMachines: 0,
    cupsPerEmployee: 1.5,
    gramsPerCup: 12,
    workDaysMonth: 21,
    blends: [{ name: "DX", quantityKg: 40, costPerKg: 60, pricePerKg: 100 }],
    equipment: [],
    equipmentCosts: {},
    allocation: [],
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
    applyVolumeDiscount: false,
    owner: "",
    createdAt: "2026-10-01T00:00:00.000Z",
    ...fields,
  });

test("the chosen quote wins over the latest approved one", () => {
  const approved = fullQuote({ id: "approved", status: "אושרה", approvedAt: "2026-10-05T00:00:00.000Z" });
  const draft = fullQuote({ id: "draft", status: "טיוטה" });
  assert.equal(activeQuoteFor({ activeQuoteId: "draft" }, [approved, draft])?.id, "draft");
  assert.equal(activeQuoteFor({}, [approved, draft])?.id, "approved");
  assert.equal(activeQuoteFor({ activeQuoteId: "gone" }, [approved, draft])?.id, "approved");
});

test("choosing a quote rebuilds the agreement and keeps the contract dates", () => {
  const customer = {
    id: "acct",
    contractStart: "2026-01-01",
    contractEnd: "2028-12-31",
    commercialAgreement: { effectiveFrom: "2026-02-01" },
  } as Customer;
  const chosen = fullQuote({
    id: "chosen",
    status: "נשלחה",
    blends: [{ name: "EMERALD", quantityKg: 25, costPerKg: 70, pricePerKg: 120 }],
  });
  const fromQuote = {
    model: "beans_only",
    status: "draft",
    sourceQuoteId: "chosen",
    monthlyBeanKg: 25,
    beanCostPerKg: 70,
    beanPricePerKg: 120,
    packageCount: 1,
    packageMonthlyFee: 0,
    packageIncludedKgPerUnit: 0,
    extraKgPrice: 0,
    monthlyRentalIncome: 0,
    monthlyServiceIncome: 0,
    oneTimeEquipmentIncome: 0,
    updatedAt: "2026-10-01T00:00:00.000Z",
  } satisfies CommercialAgreement;
  const update = customerUpdateForActiveQuote(customer, chosen, fromQuote, "2026-10-11T00:00:00.000Z");
  assert.equal(update.activeQuoteId, "chosen");
  assert.equal(update.commercialAgreement?.status, "active");
  assert.equal(update.commercialAgreement?.sourceQuoteId, "chosen");
  assert.equal(update.commercialAgreement?.beanPricePerKg, 120);
  assert.equal(update.commercialAgreement?.effectiveFrom, "2026-02-01");
  assert.equal(update.commercialAgreement?.effectiveTo, "2028-12-31");
  assert.equal(update.monthlyKg, 25);
  assert.deepEqual(update.contractBlends, ["EMERALD"]);
});
