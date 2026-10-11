import assert from "node:assert/strict";
import test from "node:test";
import type { Customer, Machine, Order, Task } from "../../lib/platform-types";
import { planDailyRun, upcomingDelivery } from "./daily-plan";

const customer = (id: string, extra: Partial<Customer> = {}) => ({
  id, name: id, status: "פעיל", rank: "רגיל", contactName: "", phone: "", email: "", city: "", address: "", owner: "",
  monthlyKg: 10, contractEnd: "", serviceLevel: "", contractBlends: ["DX"], deliveryDayOfMonth: 20,
  slaResponseHours: 4, slaResolutionHours: 24, notes: [], branches: [], createdAt: "", ...extra,
}) as Customer;
const order = (accountId: string, month: string, extra: Partial<Order> = {}): Order => ({
  id: `order-${accountId}-${month}`, accountId, month, defaultKg: 10, requestedKg: 10, approvedKg: 10,
  status: "לפי חוזה", blend: "DX", note: "", ...extra,
});
const machine = (extra: Partial<Machine> = {}) => ({
  id: "m1", accountId: "a", site: "סניף", model: "Jura", serial: "1", status: "פעילה", commercial: "השכרה",
  location: "", lastService: "", nextService: "", ...extra,
}) as Machine;
const run = (today: string, input: { customers?: Customer[]; orders?: Order[]; tasks?: Task[]; machines?: Machine[] } = {}) =>
  planDailyRun({ customers: [], orders: [], tasks: [], machines: [], ...input, today, now: `${today}T05:00:00.000Z` });

test("the next delivery is this month's until it passes or is delivered", () => {
  const a = customer("a");
  assert.equal(upcomingDelivery(a, [], "2026-10-11").date, "2026-10-20");
  assert.equal(upcomingDelivery(a, [], "2026-10-21").date, "2026-11-20");
  assert.equal(upcomingDelivery(a, [order("a", "2026-10", { status: "סופק" })], "2026-10-11").date, "2026-11-20");
  assert.equal(upcomingDelivery(customer("b", { deliveryDayOfMonth: 31 }), [], "2026-12-29").date, "2027-01-28");
});

test("the order opens 14 days before delivery, not earlier, and only once", () => {
  assert.equal(run("2026-10-05", { customers: [customer("a")] }).newOrders.length, 0);
  const opened = run("2026-10-06", { customers: [customer("a")] }).newOrders;
  assert.deepEqual(opened.map((item) => [item.id, item.defaultKg, item.status]), [["order-a-2026-10", 10, "לפי חוזה"]]);
  assert.equal(run("2026-10-07", { customers: [customer("a")], orders: opened }).newOrders.length, 0);
  assert.equal(run("2026-10-06", { customers: [customer("a", { status: "בהשהיה" })] }).newOrders.length, 0);
});

test("customers are reminded from 10 days before delivery, with a final reminder at 3 days", () => {
  const customers = [customer("a")];
  const orders = [order("a", "2026-10")];
  assert.equal(run("2026-10-09", { customers, orders }).reminders.length, 0);
  assert.deepEqual(run("2026-10-10", { customers, orders }).reminders.map((item) => item.stage), ["first"]);
  assert.deepEqual(run("2026-10-17", { customers, orders }).reminders.map((item) => item.stage), ["final"]);
});

test("a confirmed order or one waiting for the office gets no reminder", () => {
  const customers = [customer("a")];
  assert.equal(run("2026-10-12", { customers, orders: [order("a", "2026-10", { customerConfirmedAt: "2026-10-11", status: "אושר" })] }).reminders.length, 0);
  assert.equal(run("2026-10-12", { customers, orders: [order("a", "2026-10", { status: "ממתין לאישור" })] }).reminders.length, 0);
});

test("the office gets one prepare-order task 4 days before delivery", () => {
  const customers = [customer("a")];
  const orders = [order("a", "2026-10", { approvedKg: 12, requestedKg: 12, status: "אושר" })];
  assert.equal(run("2026-10-15", { customers, orders }).newTasks.length, 0);
  const [task] = run("2026-10-16", { customers, orders }).newTasks;
  assert.equal(task.automationKey, "order-prep:order-a-2026-10");
  assert.equal(task.dueDate, "2026-10-19");
  assert.match(task.title, /12 ק״ג/);
  assert.equal(run("2026-10-17", { customers, orders, tasks: [task] }).newTasks.length, 0);
});

test("filter and periodic service tasks are created ahead of their dates, once", () => {
  const machines = [machine({ filterReplacementDue: "2026-10-20", nextService: "2026-10-24" })];
  const first = run("2026-10-11", { machines }).newTasks;
  assert.deepEqual(first.map((task) => task.type).sort(), ["טיפול תקופתי", "תחזוקת פילטר"]);
  assert.equal(run("2026-10-12", { machines, tasks: first }).newTasks.length, 0);
  assert.equal(run("2026-10-11", { machines: [machine({ status: "הוחזרה", nextService: "2026-10-12" })] }).newTasks.length, 0);
});

test("a delivered top-up is not this month's contract delivery", () => {
  const a = customer("a", { deliveryDayOfMonth: 20 });
  const topUp = order("a", "2026-10", { id: "extra-a-1", kind: "extra", defaultKg: 0, requestedKg: 3, approvedKg: 3, status: "סופק" });
  assert.equal(upcomingDelivery(a, [topUp], "2026-10-11").date, "2026-10-20");
  const plan = planDailyRun({ customers: [a], orders: [topUp], tasks: [], machines: [], today: "2026-10-11", now: "now" });
  assert.equal(plan.newOrders.length, 1);
  assert.notEqual(plan.newOrders[0].kind, "extra");
});
