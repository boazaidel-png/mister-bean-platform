import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const projectId = "mister-bean-rules-test";
const environment = await initializeTestEnvironment({
  projectId,
  firestore: { rules: readFileSync("firestore.rules", "utf8") },
});

test.after(async () => environment.cleanup());

await environment.withSecurityRulesDisabled(async (context) => {
  const db = context.firestore();
  await setDoc(doc(db, "accounts", "customer-a"), {
    id: "customer-a", name: "לקוח א", email: "a@example.com", branches: [], notes: [],
  });
  await setDoc(doc(db, "accounts", "customer-b"), {
    id: "customer-b", name: "לקוח ב", email: "b@example.com", branches: [], notes: [],
  });
  await setDoc(doc(db, "users", "customer-user"), {
    uid: "customer-user", email: "a@example.com", displayName: "לקוח",
    role: "customer", accountIds: ["customer-a"], status: "active", createdAt: "2026-01-01",
  });
  await setDoc(doc(db, "users", "service-user"), {
    uid: "service-user", email: "service@example.com", displayName: "טכנאי",
    role: "service", accountIds: [], status: "active", createdAt: "2026-01-01",
  });
  await setDoc(doc(db, "users", "owner-user"), {
    uid: "owner-user", email: "boaz@pacifictrade.co", displayName: "בועז",
    role: "admin", accountIds: [], status: "active", createdAt: "2026-01-01",
  });
  await setDoc(doc(db, "users", "fake-admin"), {
    uid: "fake-admin", email: "attacker@example.com", displayName: "תוקף",
    role: "admin", accountIds: [], status: "active", createdAt: "2026-01-01",
  });
  await setDoc(doc(db, "leads", "lead-1"), { id: "lead-1", company: "חברה", notes: "" });
});

test("anonymous users cannot read customer accounts", async () => {
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), "accounts", "customer-a")));
});

test("customers can read only their assigned account", async () => {
  const db = environment.authenticatedContext("customer-user", { email: "a@example.com", email_verified: true }).firestore();
  await assertSucceeds(getDoc(doc(db, "accounts", "customer-a")));
  await assertFails(getDoc(doc(db, "accounts", "customer-b")));
});

test("an unapproved administrator profile has no administrator access", async () => {
  const db = environment.authenticatedContext("fake-admin", { email: "attacker@example.com", email_verified: true }).firestore();
  await assertFails(getDoc(doc(db, "leads", "lead-1")));
});

test("the configured owner can access protected sales data", async () => {
  const db = environment.authenticatedContext("owner-user", { email: "boaz@pacifictrade.co", email_verified: true }).firestore();
  await assertSucceeds(getDoc(doc(db, "leads", "lead-1")));
});

test("customers cannot create machines but service staff can", async () => {
  const machine = { id: "m-1", accountId: "customer-a", model: "F15", serial: "123", status: "פעילה", monthlyRent: 0 };
  const customerDb = environment.authenticatedContext("customer-user", { email: "a@example.com" }).firestore();
  const serviceDb = environment.authenticatedContext("service-user", { email: "service@example.com" }).firestore();
  await assertFails(setDoc(doc(customerDb, "accounts", "customer-a", "machines", "m-1"), machine));
  await assertSucceeds(setDoc(doc(serviceDb, "accounts", "customer-a", "machines", "m-1"), machine));
});

test("customers cannot modify operational assignment fields on tickets", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "accounts", "customer-a", "tickets", "t-1"), {
      id: "t-1", accountId: "customer-a", site: "ראשי", machineId: "", type: "תקלה",
      urgency: "רגילה", status: "התקבלה", description: "בדיקה", contact: "איש קשר",
      phone: "0500000000", assignedUid: "", assignedTo: "טרם הוקצה", attachments: [], events: [],
    });
  });
  const db = environment.authenticatedContext("customer-user", { email: "a@example.com" }).firestore();
  await assertFails(updateDoc(doc(db, "accounts", "customer-a", "tickets", "t-1"), { assignedUid: "customer-user" }));
});

test("profitability is restricted to approved administrators", async () => {
  const record = {
    id: "2026-10", accountId: "customer-a", month: "2026-10", status: "draft",
    sales: [], fixedRevenue: 0, rentalRevenue: 0, otherRevenue: 0,
    serviceCost: 0, deliveryCost: 0, equipmentCost: 0, otherCost: 0,
    createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
  };
  const adminDb = environment.authenticatedContext("owner-user", { email: "boaz@pacifictrade.co", email_verified: true }).firestore();
  const serviceDb = environment.authenticatedContext("service-user", { email: "service@example.com", email_verified: true }).firestore();
  const customerDb = environment.authenticatedContext("customer-user", { email: "a@example.com", email_verified: true }).firestore();
  await assertSucceeds(setDoc(doc(adminDb, "accounts", "customer-a", "profitability", "2026-10"), record));
  await assertFails(getDoc(doc(serviceDb, "accounts", "customer-a", "profitability", "2026-10")));
  await assertFails(getDoc(doc(customerDb, "accounts", "customer-a", "profitability", "2026-10")));
});

assert.equal(projectId, "mister-bean-rules-test");
