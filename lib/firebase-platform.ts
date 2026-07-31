"use client";

import type { User } from "firebase/auth";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Query,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseServices } from "./firebase-client";
import type {
  Customer,
  Machine,
  Order,
  PlatformStore,
  Lead,
  Quote,
  SalesWorkspace,
  Task,
  Ticket,
  UserProfile,
} from "./platform-types";

const BOOTSTRAP_ADMIN_EMAILS = new Set([
  "boazaidel@gmail.com",
  "boaz@pacifictrade.co",
]);
const entityKeys = ["tickets", "orders", "tasks", "machines"] as const;
const legacyAddonKeys = new Set([
  "fridge",
  "filter",
  "install",
  "frother",
  "osmosis",
  "ypeper_fridge",
  "ypeper_filter",
  "ypeper_install",
]);
type EntityKey = (typeof entityKeys)[number];
type Entity = Ticket | Order | Task | Machine;

let lastSyncedStore: PlatformStore | null = null;

function emptyStore(): PlatformStore {
  return { tickets: [], orders: [], tasks: [], machines: [] };
}

function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => withoutUndefined(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, withoutUndefined(item)]),
    ) as T;
  }
  return value;
}

function normalizeLeadRecord(value: Lead): Lead {
  const timestamp = value.updatedAt || new Date().toISOString();
  return {
    ...value,
    currentStatus: value.currentStatus || "",
    nextAction: value.nextAction || "",
    meetingTime: value.meetingTime || "09:00",
    meetingGuest: value.meetingGuest || "",
    sheet: value.sheet || "ראשוני",
    deleted: value.deleted === true,
    statusChangedAt: value.statusChangedAt || timestamp,
    statusHistory: value.statusHistory || [],
    tasks: value.tasks || [],
    lastUpdated: value.lastUpdated || timestamp.slice(0, 10),
    quoteIds: value.quoteIds || [],
  };
}

function normalizeQuoteRecord(value: Quote): Quote {
  return {
    ...value,
    equipmentCosts: value.equipmentCosts || {},
    allocation: value.allocation || [],
    supplierMonths: value.supplierMonths || 8,
    leaseMonths: value.leaseMonths || 24,
    manualLeasePerSet: value.manualLeasePerSet || 0,
    saleMargin: value.saleMargin || 15,
    clientCostMonths: value.clientCostMonths || 36,
    clientPayTerm: value.clientPayTerm || 0,
    importerPayTerm: value.importerPayTerm || 0,
    coffeeSupplierPayTerm: value.coffeeSupplierPayTerm || 0,
    cashflowMonths: value.cashflowMonths || 36,
    financingMonths: value.financingMonths || 0,
    financedAmount: value.financedAmount || 0,
    annualInterest: value.annualInterest || 0,
    applyVolumeDiscount: value.applyVolumeDiscount !== false,
  };
}

function normalizeEmail(email?: string | null) {
  return (email || "").trim().toLowerCase();
}

export function observeAuth(callback: (user: User | null) => void) {
  const { auth } = getFirebaseServices();
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle() {
  const { auth } = getFirebaseServices();
  await setPersistence(auth, browserLocalPersistence);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, provider);
}

export async function signInWithEmail(email: string, password: string) {
  const { auth } = getFirebaseServices();
  await setPersistence(auth, browserLocalPersistence);
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function resetPassword(email: string) {
  const { auth } = getFirebaseServices();
  await sendPasswordResetEmail(auth, email.trim());
}

export async function signOutUser() {
  const { auth } = getFirebaseServices();
  await signOut(auth);
}

export async function getOrCreateUserProfile(user: User): Promise<UserProfile> {
  const { db } = getFirebaseServices();
  const profileRef = doc(db, "users", user.uid);
  const existing = await getDoc(profileRef);
  const email = normalizeEmail(user.email);
  const isBootstrapAdmin = BOOTSTRAP_ADMIN_EMAILS.has(email);

  if (existing.exists()) {
    const profile = existing.data() as UserProfile;
    if (
      isBootstrapAdmin &&
      (profile.role !== "admin" || profile.status !== "active")
    ) {
      const upgradedProfile: UserProfile = {
        ...profile,
        email,
        role: "admin",
        status: "active",
        accountIds: [],
      };
      await setDoc(profileRef, upgradedProfile);
      return upgradedProfile;
    }
    return profile;
  }

  const profile: UserProfile = {
    uid: user.uid,
    email,
    displayName: user.displayName || email.split("@")[0] || "משתמש",
    role: isBootstrapAdmin ? "admin" : "customer",
    accountIds: [],
    status: isBootstrapAdmin ? "active" : "pending",
    createdAt: new Date().toISOString(),
  };

  await setDoc(profileRef, profile);
  return profile;
}

export async function seedWorkspaceIfEmpty(
  profile: UserProfile,
  customers: Customer[],
  seed: PlatformStore,
) {
  if (profile.role !== "admin" || profile.status !== "active") return;

  const { db } = getFirebaseServices();
  const firstAccount = await getDoc(doc(db, "accounts", customers[0].id));
  if (firstAccount.exists()) return;

  const batch = writeBatch(db);
  for (const customer of customers) {
    batch.set(doc(db, "accounts", customer.id), {
      ...customer,
      seededAt: new Date().toISOString(),
    });
  }

  const subscribedKeys =
    profile.role === "admin" || profile.role === "service"
      ? entityKeys
      : entityKeys.filter((key) => key !== "tasks");

  for (const key of subscribedKeys) {
    for (const entity of seed[key]) {
      batch.set(
        doc(db, "accounts", entity.accountId, key, entity.id),
        entity,
      );
    }
  }

  await batch.commit();
}

function queryFor(
  key: EntityKey,
  profile: UserProfile,
  accountId?: string,
): Query<DocumentData> {
  const { db } = getFirebaseServices();
  if (profile.role === "admin" || profile.role === "service") {
    return query(collectionGroup(db, key));
  }
  if (!accountId) {
    throw new Error("למשתמש עדיין לא שויך חשבון לקוח.");
  }
  return query(collection(db, "accounts", accountId, key));
}

export function subscribeToPlatformStore(
  profile: UserProfile,
  onStore: (store: PlatformStore) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const buckets: Record<EntityKey, Map<string, Entity>> = {
    tickets: new Map(),
    orders: new Map(),
    tasks: new Map(),
    machines: new Map(),
  };
  const unsubscribers: Unsubscribe[] = [];
  const accountIds =
    profile.role === "admin" || profile.role === "service"
      ? [undefined]
      : profile.accountIds;

  if (!accountIds.length) {
    lastSyncedStore = emptyStore();
    onStore(lastSyncedStore);
    return () => undefined;
  }

  const emit = () => {
    const next: PlatformStore = {
      tickets: [...buckets.tickets.values()] as Ticket[],
      orders: [...buckets.orders.values()] as Order[],
      tasks: [...buckets.tasks.values()] as Task[],
      machines: [...buckets.machines.values()] as Machine[],
    };
    lastSyncedStore = next;
    onStore(next);
  };

  for (const key of entityKeys) {
    for (const accountId of accountIds) {
      const unsubscribe = onSnapshot(
        queryFor(key, profile, accountId),
        (snapshot) => {
          for (const change of snapshot.docChanges()) {
            const mapKey = `${change.doc.ref.parent.parent?.id || "all"}:${change.doc.id}`;
            if (change.type === "removed") {
              buckets[key].delete(mapKey);
            } else {
              buckets[key].set(mapKey, change.doc.data() as Entity);
            }
          }
          emit();
        },
        (error) => onError(error),
      );
      unsubscribers.push(unsubscribe);
    }
  }

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

export function subscribeToUserProfiles(
  onProfiles: (profiles: UserProfile[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const { db } = getFirebaseServices();
  return onSnapshot(
    query(collection(db, "users")),
    (snapshot) => {
      onProfiles(snapshot.docs.map((profile) => profile.data() as UserProfile));
    },
    (error) => onError(error),
  );
}

export function subscribeToCustomers(
  profile: UserProfile,
  onCustomers: (customers: Customer[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const { db } = getFirebaseServices();
  if (profile.role === "admin" || profile.role === "service") {
    return onSnapshot(
      query(collection(db, "accounts")),
      (snapshot) => {
        onCustomers(
          snapshot.docs
            .map((account) => account.data() as Customer)
            .sort((a, b) => a.name.localeCompare(b.name, "he")),
        );
      },
      (error) => onError(error),
    );
  }

  const accountMaps = new Map<string, Customer>();
  const unsubscribers = profile.accountIds.map((accountId) =>
    onSnapshot(
      doc(db, "accounts", accountId),
      (snapshot) => {
        if (snapshot.exists()) {
          accountMaps.set(accountId, snapshot.data() as Customer);
          onCustomers([...accountMaps.values()]);
        }
      },
      (error) => onError(error),
    ),
  );
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

export async function updateUserAccess(
  uid: string,
  role: UserProfile["role"],
  accountIds: string[],
  status: UserProfile["status"],
) {
  const { db } = getFirebaseServices();
  await updateDoc(doc(db, "users", uid), { role, accountIds, status });
}

function changedEntities(next: PlatformStore, previous: PlatformStore | null) {
  const changes: Array<{ key: EntityKey; entity: Entity }> = [];
  for (const key of entityKeys) {
    const before = new Map(
      (previous?.[key] || []).map((entity) => [entity.id, JSON.stringify(entity)]),
    );
    for (const entity of next[key]) {
      if (before.get(entity.id) !== JSON.stringify(entity)) {
        changes.push({ key, entity });
      }
    }
  }
  return changes;
}

export async function savePlatformStore(next: PlatformStore) {
  const changes = changedEntities(next, lastSyncedStore);
  if (!changes.length) return;

  const { db } = getFirebaseServices();
  const batch = writeBatch(db);
  for (const { key, entity } of changes) {
    batch.set(
      doc(db, "accounts", entity.accountId, key, entity.id),
      entity,
    );
  }
  await batch.commit();
  lastSyncedStore = next;
}

export function subscribeToSalesWorkspace(
  profile: UserProfile,
  onWorkspace: (workspace: SalesWorkspace) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (
    profile.status !== "active" ||
    (profile.role !== "admin" && profile.role !== "service")
  ) {
    onWorkspace({ leads: [], quotes: [] });
    return () => undefined;
  }

  const { db } = getFirebaseServices();
  let leads: Lead[] = [];
  let quotes: Quote[] = [];
  let leadsReady = false;
  let quotesReady = false;
  const emit = () => {
    if (leadsReady && quotesReady) onWorkspace({ leads, quotes });
  };

  const unsubscribeLeads = onSnapshot(
    query(collection(db, "leads")),
    (snapshot) => {
      leads = snapshot.docs
        .map((item) => normalizeLeadRecord(item.data() as Lead))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      leadsReady = true;
      emit();
    },
    (error) => onError(error),
  );
  const unsubscribeQuotes = onSnapshot(
    query(collection(db, "quotes")),
    (snapshot) => {
      quotes = snapshot.docs
        .map((item) => normalizeQuoteRecord(item.data() as Quote))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      quotesReady = true;
      emit();
    },
    (error) => onError(error),
  );

  return () => {
    unsubscribeLeads();
    unsubscribeQuotes();
  };
}

export async function saveLead(lead: Lead) {
  const { db } = getFirebaseServices();
  await setDoc(doc(db, "leads", lead.id), withoutUndefined(lead), {
    merge: true,
  });
}

export async function saveQuote(quote: Quote) {
  const { db } = getFirebaseServices();
  const batch = writeBatch(db);
  batch.set(doc(db, "quotes", quote.id), withoutUndefined(quote), {
    merge: true,
  });
  if (quote.leadId) {
    batch.set(
      doc(db, "leads", quote.leadId),
      {
        status:
          quote.status === "נשלחה" || quote.status === "אושרה"
            ? "נשלחה הצעת מחיר"
            : "בהמתנה להצעת מחיר",
        quoteIds: arrayUnion(quote.id),
        updatedAt: quote.updatedAt,
      },
      { merge: true },
    );
  }
  await batch.commit();
}

export async function deleteQuote(quoteId: string) {
  const { db } = getFirebaseServices();
  await deleteDoc(doc(db, "quotes", quoteId));
}

function accountIdForQuote(quote: Quote) {
  const readable = quote.clientName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 36);
  return `${readable || "customer"}-${quote.id.slice(-6).toLowerCase()}`;
}

export async function convertApprovedQuoteToCustomer(
  quote: Quote,
  lead?: Lead,
) {
  if (quote.status !== "אושרה") {
    throw new Error("אפשר להקים לקוח רק מהצעה שאושרה.");
  }

  const { db } = getFirebaseServices();
  const accountId = quote.accountId || accountIdForQuote(quote);
  const now = new Date().toISOString();
  const mainBlend = quote.blends.find((blend) => blend.quantityKg > 0);
  const batch = writeBatch(db);

  batch.set(
    doc(db, "accounts", accountId),
    {
      id: accountId,
      name: quote.clientName,
      status: "בהקמה",
      rank: quote.clientRank || "רגיל",
      contactName: lead?.contactName || "",
      phone: lead?.phone || "",
      email: lead?.email || "",
      city: lead?.location || "",
      address: lead?.meetingLocation || "",
      owner: lead?.owner || quote.owner,
      monthlyKg: quote.knownKg || mainBlend?.quantityKg || 0,
      contractEnd: "",
      serviceLevel: "רגיל",
      branches: [lead?.location || "סניף ראשי"],
      sourceLeadId: quote.leadId || "",
      sourceQuoteId: quote.id,
      createdAt: now,
    },
    { merge: true },
  );
  batch.set(
    doc(db, "quotes", quote.id),
    { accountId, approvedAt: quote.approvedAt || now, updatedAt: now },
    { merge: true },
  );
  if (lead) {
    batch.set(
      doc(db, "leads", lead.id),
      {
        status: "נסגר",
        convertedAccountId: accountId,
        updatedAt: now,
      },
      { merge: true },
    );
  }
  quote.equipment
    .filter(
      (item) =>
        item.quantity > 0 &&
        !legacyAddonKeys.has(item.key || item.model),
    )
    .forEach((item, itemIndex) => {
      for (let index = 0; index < item.quantity; index += 1) {
        const machineId = `machine-${quote.id}-${itemIndex + 1}-${index + 1}`;
        batch.set(doc(db, "accounts", accountId, "machines", machineId), {
          id: machineId,
          accountId,
          site: lead?.location || "סניף ראשי",
          model: item.model,
          serial: "טרם הוגדר",
          status: "בהקמה",
          commercial: item.commercialModel,
          location: "",
          lastService: "",
          nextService: "",
        });
      }
    });

  await batch.commit();
  return accountId;
}

export async function importSalesWorkspace(workspace: SalesWorkspace) {
  const { db } = getFirebaseServices();
  const entries = [
    ...workspace.leads.map((lead) => ["leads", lead.id, lead] as const),
    ...workspace.quotes.map((quote) => ["quotes", quote.id, quote] as const),
  ];
  for (let index = 0; index < entries.length; index += 400) {
    const batch = writeBatch(db);
    for (const [collectionName, id, entity] of entries.slice(index, index + 400)) {
      batch.set(doc(db, collectionName, id), withoutUndefined(entity), {
        merge: true,
      });
    }
    await batch.commit();
  }
  const [leadsSnapshot, quotesSnapshot] = await Promise.all([
    getDocs(query(collection(db, "leads"))),
    getDocs(query(collection(db, "quotes"))),
  ]);
  return {
    importedLeads: workspace.leads.length,
    importedQuotes: workspace.quotes.length,
    storedLeads: leadsSnapshot.size,
    storedQuotes: quotesSnapshot.size,
  };
}
