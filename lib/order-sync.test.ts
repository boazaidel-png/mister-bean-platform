import assert from "node:assert/strict";
import test from "node:test";
import { contractMonthlyKg, syncContractOrders } from "./order-sync.ts";
import type { Customer, Order } from "./platform-types.ts";

const customer = (id: string, extra: Partial<Customer> = {}) => ({
  id, name: id, status: "פעיל", rank: "רגיל", contactName: "", phone: "", email: "", city: "", address: "", owner: "",
  monthlyKg: 10, contractEnd: "", serviceLevel: "", contractBlends: ["DX"], deliveryDayOfMonth: 1,
  slaResponseHours: 4, slaResolutionHours: 24, notes: [], branches: [], createdAt: "", ...extra,
}) as Customer;
const order = (accountId: string, month: string, extra: Partial<Order> = {}): Order => ({
  id: `order-${accountId}-${month}`, accountId, month, defaultKg: 10, requestedKg: 10, approvedKg: 10,
  status: "לפי חוזה", blend: "DX", note: "", ...extra,
});

test("a monthly order is opened for every customer that is not paused", () => {
  const next = syncContractOrders([order("a", "2026-09", { blend: "HB+" })], [customer("a"), customer("b"), customer("c", { status: "בהשהיה" })], "2026-10", "now");
  assert.deepEqual(next.filter((o) => o.month === "2026-10").map((o) => [o.accountId, o.defaultKg, o.blend]).sort(), [["a", 10, "HB+"], ["b", 10, "DX"]]);
});

test("nothing changes when every order is in place", () => {
  const orders = [order("a", "2026-10")];
  assert.equal(syncContractOrders(orders, [customer("a")], "2026-10"), orders);
});

test("an untouched order follows a changed contract, an edited one keeps its numbers", () => {
  const changed = customer("a", { commercialAgreement: { model: "monthly_package", status: "active", monthlyBeanKg: 0, beanCostPerKg: 0, beanPricePerKg: 0, packageCount: 2, packageMonthlyFee: 650, packageIncludedKgPerUnit: 8, extraKgPrice: 90, monthlyRentalIncome: 0, monthlyServiceIncome: 0, oneTimeEquipmentIncome: 0, updatedAt: "" } });
  assert.equal(contractMonthlyKg(changed), 16);
  assert.equal(syncContractOrders([order("a", "2026-10")], [changed], "2026-10")[0].approvedKg, 16);
  const edited = [order("a", "2026-10", { approvedKg: 14 })];
  assert.equal(syncContractOrders(edited, [changed], "2026-10"), edited);
});

test("customers without a contract quantity get no order", () => {
  const orders: Order[] = [];
  assert.equal(syncContractOrders(orders, [customer("a", { monthlyKg: 0 })], "2026-10"), orders);
});
