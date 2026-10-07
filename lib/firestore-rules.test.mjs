import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";

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

test("tasting sessions: anonymous tasters may read one session and add answers only while it is open", async () => {
  const session = {
    id: "tasting-1", accountId: "customer-a", customerName: "לקוח א", title: "טעימה", status: "open",
    blends: [{ id: "blend-1", name: "DX+", arabicaPercent: 70, profile: "מאוזן" }],
    createdAt: "2026-10-07T00:00:00.000Z", updatedAt: "2026-10-07T00:00:00.000Z", createdBy: "boaz@pacifictrade.co",
  };
  const answer = (id) => ({ id, sessionId: "tasting-1", ratings: { "blend-1": 5 }, favoriteBlendId: "blend-1", comment: "", createdAt: "2026-10-07T00:00:00.000Z" });
  const adminDb = environment.authenticatedContext("owner-user", { email: "boaz@pacifictrade.co", email_verified: true }).firestore();
  const guestDb = environment.unauthenticatedContext().firestore();
  const customerDb = environment.authenticatedContext("customer-user", { email: "a@example.com", email_verified: true }).firestore();

  await assertFails(setDoc(doc(customerDb, "tastingSessions", "tasting-1"), session));
  await assertSucceeds(setDoc(doc(adminDb, "tastingSessions", "tasting-1"), session));
  await assertSucceeds(getDoc(doc(guestDb, "tastingSessions", "tasting-1")));
  await assertFails(getDocs(collection(guestDb, "tastingSessions")));

  await assertSucceeds(setDoc(doc(guestDb, "tastingSessions", "tasting-1", "tastingResponses", "r-1"), answer("r-1")));
  await assertFails(setDoc(doc(guestDb, "tastingSessions", "tasting-1", "tastingResponses", "r-1"), { ...answer("r-1"), comment: "שינוי" }));
  await assertFails(getDoc(doc(guestDb, "tastingSessions", "tasting-1", "tastingResponses", "r-1")));
  await assertFails(setDoc(doc(guestDb, "tastingSessions", "tasting-1", "tastingResponses", "r-2"), { ...answer("r-2"), extra: true }));
  await assertFails(setDoc(doc(guestDb, "tastingSessions", "tasting-1"), { ...session, title: "שונה" }));
  await assertSucceeds(getDoc(doc(adminDb, "tastingSessions", "tasting-1", "tastingResponses", "r-1")));

  await assertSucceeds(updateDoc(doc(adminDb, "tastingSessions", "tasting-1"), { status: "closed", closedAt: "2026-10-07T01:00:00.000Z" }));
  await assertFails(setDoc(doc(guestDb, "tastingSessions", "tasting-1", "tastingResponses", "r-3"), answer("r-3")));
});

test("the tasting blend catalog is administrator only", async () => {
  const blend = { id: "blend-1", name: "DX+", arabicaPercent: 70, profile: "מאוזן", active: true, sortOrder: 1, createdAt: "2026-10-07", updatedAt: "2026-10-07" };
  const adminDb = environment.authenticatedContext("owner-user", { email: "boaz@pacifictrade.co", email_verified: true }).firestore();
  const serviceDb = environment.authenticatedContext("service-user", { email: "service@example.com", email_verified: true }).firestore();
  await assertFails(setDoc(doc(serviceDb, "tastingBlends", "blend-1"), blend));
  await assertSucceeds(setDoc(doc(adminDb, "tastingBlends", "blend-1"), blend));
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), "tastingBlends", "blend-1")));
});

assert.equal(projectId, "mister-bean-rules-test");
