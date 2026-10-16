import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";

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

test("only administrators read the activity log and nobody writes it from the app", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "auditLog", "entry-1"), { at: "2026-01-01", action: "password-set", targetEmail: "a@example.com" });
  });
  const owner = environment.authenticatedContext("owner-user", { email: "boaz@pacifictrade.co", email_verified: true }).firestore();
  const service = environment.authenticatedContext("service-user", { email: "service@example.com", email_verified: true }).firestore();
  await assertSucceeds(getDocs(collection(owner, "auditLog")));
  await assertFails(getDocs(collection(service, "auditLog")));
  await assertFails(setDoc(doc(owner, "auditLog", "forged"), { at: "2026-01-01", action: "password-set", targetEmail: "x@example.com" }));
});

test("customers confirm at least the contract quantity themselves; less waits for the office", async () => {
  const order = {
    id: "order-1", accountId: "customer-a", month: "2026-11", defaultKg: 10, requestedKg: 10, approvedKg: 10,
    status: "לפי חוזה", blend: "DX", note: "",
  };
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "accounts", "customer-a", "orders", "order-1"), order);
  });
  const db = environment.authenticatedContext("customer-user", { email: "a@example.com", email_verified: true }).firestore();
  const ref = doc(db, "accounts", "customer-a", "orders", "order-1");
  const at = "2026-10-11T10:00:00.000Z";
  await assertFails(updateDoc(ref, { requestedKg: 6, approvedKg: 6, status: "אושר", customerConfirmedAt: at }));
  await assertFails(updateDoc(ref, { requestedKg: 6, approvedKg: 6, status: "ממתין לאישור", customerConfirmedAt: at }));
  await assertFails(updateDoc(ref, { requestedKg: 12, approvedKg: 20, status: "אושר", customerConfirmedAt: at }));
  await assertFails(updateDoc(ref, { defaultKg: 5, requestedKg: 5, approvedKg: 5, status: "אושר" }));
  await assertFails(updateDoc(ref, { status: "סופק" }));
  await assertSucceeds(updateDoc(ref, { requestedKg: 6, status: "ממתין לאישור", customerConfirmedAt: at }));
  await assertSucceeds(updateDoc(ref, { requestedKg: 15, approvedKg: 15, status: "אושר", customerConfirmedAt: at }));
});

test("employee coffee sales: anyone with the link may place an unpaid order while the sale is open, only administrators see and settle orders", async () => {
  const campaign = {
    id: "shop-1", accountId: "customer-a", customerName: "לקוח א", title: "קפה לעובדים", status: "open",
    items: [{ id: "dx-plus", name: "DX+", group: "תערובות", unit: "1 ק״ג", description: "", price: 108, listPrice: 120 }],
    closesAtMs: 0, note: "", paymentUrl: "",
    createdAt: "2026-10-11T00:00:00.000Z", updatedAt: "2026-10-11T00:00:00.000Z", createdBy: "boaz@pacifictrade.co",
  };
  const order = (id) => ({
    id, campaignId: "shop-1", fullName: "דנה כהן", email: "dana@example.com", phone: "0501234567", department: "",
    quantities: { "dx-plus~moka": 2 }, total: 216, note: "", status: "pending", createdAt: "2026-10-11T00:00:00.000Z",
  });
  const adminDb = environment.authenticatedContext("owner-user", { email: "boaz@pacifictrade.co", email_verified: true }).firestore();
  const guestDb = environment.unauthenticatedContext().firestore();
  const customerDb = environment.authenticatedContext("customer-user", { email: "a@example.com", email_verified: true }).firestore();

  await assertFails(setDoc(doc(customerDb, "shopCampaigns", "shop-1"), campaign));
  await assertFails(setDoc(doc(adminDb, "shopCampaigns", "shop-1"), { ...campaign, paymentUrl: "javascript:alert(1)" }));
  await assertSucceeds(setDoc(doc(adminDb, "shopCampaigns", "shop-1"), campaign));
  await assertSucceeds(getDoc(doc(guestDb, "shopCampaigns", "shop-1")));
  await assertFails(getDocs(collection(guestDb, "shopCampaigns")));

  await assertSucceeds(setDoc(doc(guestDb, "shopCampaigns", "shop-1", "shopOrders", "o-1"), order("o-1")));
  await assertFails(setDoc(doc(guestDb, "shopCampaigns", "shop-1", "shopOrders", "o-2"), { ...order("o-2"), status: "paid" }));
  await assertFails(setDoc(doc(guestDb, "shopCampaigns", "shop-1", "shopOrders", "o-2"), { ...order("o-2"), paidAmount: 216 }));
  await assertFails(setDoc(doc(guestDb, "shopCampaigns", "shop-1", "shopOrders", "o-2"), { ...order("o-2"), email: "not-an-email" }));
  await assertFails(setDoc(doc(guestDb, "shopCampaigns", "shop-1", "shopOrders", "o-1"), { ...order("o-1"), note: "שינוי" }));
  await assertFails(getDoc(doc(guestDb, "shopCampaigns", "shop-1", "shopOrders", "o-1")));
  await assertFails(getDoc(doc(customerDb, "shopCampaigns", "shop-1", "shopOrders", "o-1")));

  await assertSucceeds(getDoc(doc(adminDb, "shopCampaigns", "shop-1", "shopOrders", "o-1")));
  await assertFails(updateDoc(doc(adminDb, "shopCampaigns", "shop-1", "shopOrders", "o-1"), { quantities: { "dx-plus~beans": 9 } }));
  await assertSucceeds(updateDoc(doc(adminDb, "shopCampaigns", "shop-1", "shopOrders", "o-1"), {
    status: "paid", paidAt: "2026-10-11T01:00:00.000Z", paidAmount: 216, invoiceNumber: "1001", updatedAt: "2026-10-11T01:00:00.000Z", updatedBy: "boaz@pacifictrade.co",
  }));
  await assertFails(updateDoc(doc(adminDb, "shopCampaigns", "shop-1", "shopOrders", "o-1"), { invoiceUrl: "javascript:alert(1)" }));
  await assertSucceeds(updateDoc(doc(adminDb, "shopCampaigns", "shop-1", "shopOrders", "o-1"), { invoiceUrl: "https://api.rivhit.co.il/pdf/FileService.svc/GetDocument/x" }));

  await assertSucceeds(updateDoc(doc(adminDb, "shopCampaigns", "shop-1"), { closesAtMs: Date.now() - 1000 }));
  await assertFails(setDoc(doc(guestDb, "shopCampaigns", "shop-1", "shopOrders", "o-3"), order("o-3")));
  await assertSucceeds(updateDoc(doc(adminDb, "shopCampaigns", "shop-1"), { closesAtMs: 0, status: "closed", closedAt: "2026-10-11T02:00:00.000Z" }));
  await assertFails(setDoc(doc(guestDb, "shopCampaigns", "shop-1", "shopOrders", "o-3"), order("o-3")));

  // The sale goes out with a delivery month.
  await assertSucceeds(updateDoc(doc(adminDb, "shopCampaigns", "shop-1"), { month: "2026-11" }));
  await assertFails(updateDoc(doc(adminDb, "shopCampaigns", "shop-1"), { month: "נובמבר" }));

  // Its paid orders become one coffee order of the customer: written by the office, read by the customer.
  const employeeOrder = {
    id: "emp-shop-1", accountId: "customer-a", month: "2026-11", defaultKg: 0, requestedKg: 2, approvedKg: 2,
    blend: "1 סוגי קפה · 1 עובדים", note: "", status: "אושר", kind: "employees", shopCampaignId: "shop-1", pricePerKg: 91.53,
    employeeLines: [{ coffee: "DX+", grind: "טחון למקינטה", bags: 2 }],
    recipients: [{ name: "דנה כהן", department: "", items: "DX+ · טחון למקינטה × 2" }],
  };
  const employeeRef = (db) => doc(db, "accounts", "customer-a", "orders", "emp-shop-1");
  await assertFails(setDoc(employeeRef(customerDb), employeeOrder));
  await assertFails(setDoc(employeeRef(adminDb), { ...employeeOrder, recipients: "דנה" }));
  await assertSucceeds(setDoc(employeeRef(adminDb), employeeOrder));
  await assertSucceeds(getDoc(employeeRef(customerDb)));
  await assertFails(updateDoc(employeeRef(customerDb), { recipients: [] }));
  await assertFails(getDoc(employeeRef(guestDb)));
});

test("the money of a deal (terms, equipment, loans): administrators only, never the customer", async () => {
  const adminDb = environment.authenticatedContext("owner-user", { email: "boaz@pacifictrade.co", email_verified: true }).firestore();
  const customerDb = environment.authenticatedContext("customer-user", { email: "a@example.com", email_verified: true }).firestore();
  const serviceDb = environment.authenticatedContext("service-user", { email: "service@example.com", email_verified: true }).firestore();
  const deal = {
    startMonth: "2026-05", contractMonths: 36, updatedAt: "2026-10-16T00:00:00.000Z",
    versions: [{ id: "terms-2026-05", fromMonth: "2026-05", note: "הסכם התחלתי", model: "beans_only", blends: [{ blend: "DX+", kg: 50, pricePerKg: 110, costPerKg: 70 }] }],
    purchases: [], loans: [{ id: "loan-1", amount: 12000, annualInterest: 6, months: 24 }],
  };
  const ref = (db, id = "deal") => doc(db, "accounts", "customer-a", "private", id);
  await assertFails(setDoc(ref(customerDb), deal));
  await assertFails(setDoc(ref(serviceDb), deal));
  await assertFails(setDoc(ref(adminDb, "other"), deal));
  await assertFails(setDoc(ref(adminDb), { ...deal, startMonth: "מאי" }));
  await assertFails(setDoc(ref(adminDb), { ...deal, versions: [] }));
  await assertFails(setDoc(ref(adminDb), { ...deal, secret: 1 }));
  await assertSucceeds(setDoc(ref(adminDb), deal));
  await assertSucceeds(getDoc(ref(adminDb)));
  await assertFails(getDoc(ref(customerDb)));
  await assertFails(getDoc(ref(serviceDb)));
  await assertFails(deleteDoc(ref(adminDb)));
});
