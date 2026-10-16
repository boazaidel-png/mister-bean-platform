import assert from "node:assert/strict";
import test from "node:test";
import { contractMonthlyKg, syncContractOrders } from "./order-sync.ts";
import type { CommercialAgreement, Customer, Order } from "./platform-types.ts";

const customer = (id: string, extra: Partial<Customer> = {}) => ({
  id, name: id, status: "פעיל", rank: "רגיל", contactName: "", phone: "", email: "", city: "", address: "", owner: "",
  monthlyKg: 10, contractEnd: "", serviceLevel: "", contractBlends: ["DX"], deliveryDayOfMonth: 1,
  slaResponseHours: 4, slaResolutionHours: 24, notes: [], branches: [], createdAt: "", ...extra,
}) as Customer;
const order = (accountId: string, month: string, extra: Partial<Order> = {}): Order => ({
  id: `order-${accountId}-${month}`, accountId, month, defaultKg: 10, requestedKg: 10, approvedKg: 10,
  status: "לפי חוזה", blend: "DX", note: "", ...extra,
});
const agreement = (extra: Partial<CommercialAgreement>): CommercialAgreement => ({
  model: "beans_only", status: "active", monthlyBeanKg: 0, beanCostPerKg: 0, beanPricePerKg: 0, packageCount: 1,
  packageMonthlyFee: 0, packageIncludedKgPerUnit: 0, extraKgPrice: 0, monthlyRentalIncome: 0, monthlyServiceIncome: 0,
  oneTimeEquipmentIncome: 0, updatedAt: "", ...extra,
});

test("a monthly order is opened for every customer that is not paused", () => {
  const next = syncContractOrders([order("a", "2026-09", { blend: "HB+" })], [customer("a"), customer("b"), customer("c", { status: "בהשהיה" })], "2026-10");
  assert.deepEqual(next.filter((o) => o.month === "2026-10").map((o) => [o.accountId, o.defaultKg, o.blend]).sort(), [["a", 10, "HB+"], ["b", 10, "DX"]]);
});

test("nothing changes when every order matches the contract", () => {
  const orders = [order("a", "2026-10")];
  assert.equal(syncContractOrders(orders, [customer("a")], "2026-10"), orders);
});

test("the contract quantity follows the chosen contract even on approved orders", () => {
  const changed = customer("a", { commercialAgreement: agreement({ model: "monthly_package", packageCount: 2, packageIncludedKgPerUnit: 8 }) });
  assert.equal(contractMonthlyKg(changed, changed.commercialAgreement), 16);
  const [approved] = syncContractOrders([order("a", "2026-10", { status: "אושר" })], [changed], "2026-10");
  assert.deepEqual([approved.defaultKg, approved.requestedKg, approved.approvedKg, approved.status], [16, 16, 16, "אושר"]);
  // A quantity the customer asked for, or the team approved, is kept.
  const [asked] = syncContractOrders([order("a", "2026-10", { status: "ממתין לאישור", requestedKg: 12, approvedKg: 12 })], [changed], "2026-10");
  assert.deepEqual([asked.defaultKg, asked.requestedKg, asked.approvedKg], [16, 12, 12]);
});

test("delivered, cancelled and paid orders are history", () => {
  const changed = customer("a", { monthlyKg: 20 });
  for (const extra of [{ status: "סופק" }, { status: "בוטל" }, { paid: true }]) {
    const orders = [order("a", "2026-10", extra)];
    assert.equal(syncContractOrders(orders, [changed], "2026-10"), orders);
  }
});

test("the agreement built from the active quote is used when the card has none saved", () => {
  const [next] = syncContractOrders([order("a", "2026-10")], [customer("a", { monthlyKg: 10 })], "2026-10", () => agreement({ monthlyBeanKg: 14 }));
  assert.equal(next.defaultKg, 14);
});

test("customers without a contract quantity get no order", () => {
  const orders: Order[] = [];
  assert.equal(syncContractOrders(orders, [customer("a", { monthlyKg: 0 })], "2026-10"), orders);
});

test("a top-up order in the month does not stand in for the contract order", () => {
  const extra = order("a", "2026-10", { id: "extra-a-1", kind: "extra", defaultKg: 0, requestedKg: 4, approvedKg: 0, status: "ממתין לאישור" });
  const next = syncContractOrders([extra], [customer("a")], "2026-10");
  assert.equal(next.length, 2);
  assert.equal(next.find((o) => o.id === "extra-a-1"), extra);
  assert.equal(next.find((o) => o.kind !== "extra")?.defaultKg, 10);
});

test("next month's order keeps last month's split into blends while it adds up to the contract", () => {
  const lines = [{ blend: "DX", kg: 6 }, { blend: "HB+", kg: 4 }];
  const [made] = syncContractOrders([order("a", "2026-09", { blendLines: lines })], [customer("a")], "2026-10");
  assert.deepEqual(made.blendLines, lines);
  const [other] = syncContractOrders([order("a", "2026-09", { blendLines: [{ blend: "DX", kg: 3 }] })], [customer("a")], "2026-10");
  assert.equal(other.blendLines, undefined);
});
