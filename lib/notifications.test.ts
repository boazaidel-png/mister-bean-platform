import assert from "node:assert/strict";
import test from "node:test";
import { buildNotifications, isUnread } from "./notifications.ts";
import type { Order, Ticket, UserProfile } from "./platform-types.ts";

const now = new Date("2026-10-11T12:00:00Z");
const order = (id: string, extra: Partial<Order>): Order => ({
  id, accountId: "a", month: "2026-10", defaultKg: 10, requestedKg: 10, approvedKg: 10, status: "לפי חוזה",
  blend: "DX", note: "", updatedAt: "2026-10-10T09:00:00Z", ...extra,
});
const ticket = (id: string, extra: Partial<Ticket>) => ({
  id, accountId: "a", site: "ראשי", machineId: "", type: "תקלה", urgency: "רגילה", status: "התקבלה", description: "",
  contact: "", phone: "", assignedTo: "טרם הוקצה", openedAt: "2026-10-10T10:00:00Z", updatedAt: "", ...extra,
}) as Ticket;
const user = (uid: string, status: UserProfile["status"]) => ({ uid, email: `${uid}@x.co`, displayName: uid, role: "customer", accountIds: [], status, createdAt: "2026-10-09T08:00:00Z" }) as UserProfile;
const input = {
  orders: [
    order("o1", { status: "ממתין לאישור", requestedKg: 12 }),
    order("o2", { status: "ממתין לאישור", requestedKg: 6 }),
    order("o3", {}),
    order("old", { status: "ממתין לאישור", updatedAt: "2026-08-01T00:00:00Z" }),
  ],
  tickets: [ticket("t1", {}), ticket("t2", { assignedTo: "דני" }), ticket("t3", { status: "נסגרה" })],
  users: [user("u1", "pending"), user("u2", "active")],
  customerName: () => "הרצוג",
  now,
};

test("administrators get customer orders, low orders, new service calls and access requests", () => {
  const list = buildNotifications({ ...input, role: "admin" });
  assert.deepEqual(list.map((item) => item.kind).sort(), ["access", "low-order", "order", "ticket"]);
  const low = list.find((item) => item.kind === "low-order")!;
  assert.equal(low.target.id, "o2");
  assert.match(low.detail, /6 ק״ג במקום 10/);
});

test("service staff only get service calls, customers get nothing", () => {
  assert.deepEqual(buildNotifications({ ...input, role: "service" }).map((item) => item.id), ["ticket:t1"]);
  assert.deepEqual(buildNotifications({ ...input, role: "customer" }), []);
});

test("a re-sent order is new again, and read state hides what was seen", () => {
  const first = buildNotifications({ ...input, role: "admin" }).find((item) => item.target.id === "o1")!;
  const resent = buildNotifications({ ...input, role: "admin", orders: [order("o1", { status: "ממתין לאישור", updatedAt: "2026-10-11T08:00:00Z" })] })[0];
  assert.notEqual(first.id, resent.id);
  assert.equal(isUnread(first, { since: "2026-10-01T00:00:00Z", read: [first.id] }), false);
  assert.equal(isUnread(resent, { since: "2026-10-01T00:00:00Z", read: [first.id] }), true);
  assert.equal(isUnread(resent, { since: "2026-10-11T09:00:00Z", read: [] }), false);
});

test("administrators see orders customers confirmed themselves", () => {
  const confirmed = { id: "o9", accountId: "a", month: "2026-10", defaultKg: 10, requestedKg: 14, approvedKg: 14, status: "אושר", blend: "DX", note: "", customerConfirmedAt: "2026-10-10T08:00:00.000Z" };
  const list = buildNotifications({ role: "admin", orders: [confirmed], tickets: [], users: [], customerName: () => "לקוח", now: new Date("2026-10-11T08:00:00.000Z") });
  assert.equal(list.length, 1);
  assert.match(list[0].title, /אישר/);
  assert.equal(list[0].at, confirmed.customerConfirmedAt);
});
