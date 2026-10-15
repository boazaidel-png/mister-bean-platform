"use client";

import type { User, UserCredential } from "firebase/auth";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  browserLocalPersistence,
  getIdTokenResult,
  linkWithCredential,
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
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
  type DocumentData,
  type Query,
  type Unsubscribe,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { canonicalBlendName, withCanonicalBlends } from "./blend-catalog";
import { getFirebaseServices } from "./firebase-client";
import { changedEntities, entityKeysOf } from "./store-diff";
import { LEGACY_NEW_ORDER_STATUS, NEW_ORDER_STATUS } from "./order-sync";
import { machinesMissingForQuote } from "./quote-engine";
import {
  defaultProfileAccess,
  isBootstrapAdminEmail,
  isTrustedAdminProfile,
  isValidInviteEmail,
  normalizeInviteEmail,
  resolveInviteEmail,
} from "./access-invite";
import {
  MAX_VIDEO_BYTES,
  passwordSecurityError,
  safeStorageFileName,
  ticketFileSecurityError,
} from "./security";
import { commercialAgreementFromQuote } from "./commercial-agreement";
import type {
  AccessInvite,
  Activity,
  Customer,
  CustomerConversionResult,
  Machine,
  MonthlyProfitability,
  Order,
  PlatformStore,
  Lead,
  LeadStatus,
  Quote,
  SalesWorkspace,
  Task,
  Ticket,
  UserProfile,
} from "./platform-types";

const entityKeys = ["tickets", "orders", "tasks", "machines", "activities", "profitability"] as const;
type EntityKey = (typeof entityKeys)[number];
type Entity = Ticket | Order | Task | Machine | Activity | MonthlyProfitability;

let lastSyncedStore: PlatformStore | null = null;
let googleSignInAttempt: Promise<UserCredential> | null = null;

function emptyStore(): PlatformStore {
  return { tickets: [], orders: [], tasks: [], machines: [], activities: [], profitability: [] };
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

/** Older orders: the retired "לפי חוזה" status and renamed blends read as today's. */
function normalizeOrderRecord(order: Order): Order {
  return {
    ...order,
    status: order.status === LEGACY_NEW_ORDER_STATUS ? NEW_ORDER_STATUS : order.status,
    blend: canonicalBlendName(order.blend),
  };
}

function normalizeQuoteRecord(value: Quote): Quote {
  return {
    ...value,
    // Older or partial records may lack these lists; the quote editor maps over them.
    blends: (Array.isArray(value.blends) ? value.blends : []).map((blend) => ({
      name: canonicalBlendName(blend?.name || ""),
      quantityKg: Number(blend?.quantityKg) || 0,
      costPerKg: Number(blend?.costPerKg) || 0,
      pricePerKg: Number(blend?.pricePerKg) || 0,
    })),
    equipment: Array.isArray(value.equipment) ? value.equipment : [],
    autoSyncAccessories:
      value.autoSyncAccessories ?? (value.equipment || []).length === 0,
    equipmentCosts: value.equipmentCosts || {},
    allocation: value.allocation || [],
    pricingModel: value.pricingModel || "standard",
    consumptionCertainty:
      value.consumptionCertainty || (value.knownKg > 0 ? "exact" : "estimated"),
    clientPricingPreference: value.clientPricingPreference || "unknown",
    packageMonthlyFee: value.packageMonthlyFee || 0,
    packageCount: Math.max(1, value.packageCount || 1),
    packageIncludedKg: value.packageIncludedKg || 0,
    packageExtraKgPrice: value.packageExtraKgPrice || 0,
    packageServiceCost: value.packageServiceCost || 0,
    monthlyServiceCost:
      value.monthlyServiceCost ?? value.packageServiceCost ?? 0,
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
    financingType:
      value.financingType ||
      (value.financingMonths > 0 && value.financedAmount > 0
        ? "loan"
        : "supplier"),
    combineFinancingAndSupplier: value.combineFinancingAndSupplier === true,
    targetMonthlyProfit: value.targetMonthlyProfit ?? 500,
    earlyExitMonth: value.earlyExitMonth || 12,
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
  if (googleSignInAttempt) return googleSignInAttempt;

  const provider = new GoogleAuthProvider();
  auth.useDeviceLanguage();

  // The popup must be created in the same tick as the user's tap. Awaiting
  // persistence first causes iOS Safari and installed PWAs to block it. A
  // shared promise also prevents double taps from cancelling each other.
  const attempt = signInWithPopup(auth, provider).finally(() => {
    if (googleSignInAttempt === attempt) googleSignInAttempt = null;
  });
  googleSignInAttempt = attempt;
  return attempt;
}

export async function signInWithEmail(email: string, password: string) {
  const { auth } = getFirebaseServices();
  await setPersistence(auth, browserLocalPersistence);
  return signInWithEmailAndPassword(auth, normalizeEmail(email), password);
}

export async function linkPasswordToCurrentUser(password: string) {
  const { auth } = getFirebaseServices();
  const user = auth.currentUser;
  if (!user?.email) {
    throw new Error("auth/missing-email");
  }
  if (
    user.providerData.some(
      (provider) => provider.providerId === EmailAuthProvider.PROVIDER_ID,
    )
  ) {
    throw new Error("auth/provider-already-linked");
  }

  if (passwordSecurityError(password)) {
    throw new Error("auth/weak-password");
  }

  const credential = EmailAuthProvider.credential(user.email, password);
  return linkWithCredential(user, credential);
}

export async function resetPassword(email: string) {
  const { auth } = getFirebaseServices();
  await sendPasswordResetEmail(auth, email.trim());
}

export async function signOutUser() {
  const { auth } = getFirebaseServices();
  await signOut(auth);
}

async function requireRecentAdminLogin(maxAgeSeconds = 4 * 60 * 60) {
  const { auth } = getFirebaseServices();
  if (!auth.currentUser) throw new Error("auth/requires-recent-login");
  const token = await getIdTokenResult(auth.currentUser);
  const authenticatedAt = new Date(token.authTime).getTime();
  if (!Number.isFinite(authenticatedAt) || Date.now() - authenticatedAt > maxAgeSeconds * 1000) {
    throw new Error("auth/requires-recent-login");
  }
}

export async function getOrCreateUserProfile(user: User): Promise<UserProfile> {
  const { db } = getFirebaseServices();
  const profileRef = doc(db, "users", user.uid);
  const existing = await getDoc(profileRef);
  const email = normalizeEmail(user.email);
  const isBootstrapAdmin = isBootstrapAdminEmail(email);
  const existingProfile = existing.exists()
    ? (existing.data() as UserProfile)
    : null;

  if (existingProfile) {
    if (
      isBootstrapAdmin &&
      (existingProfile.role !== "admin" || existingProfile.status !== "active")
    ) {
      const upgradedProfile: UserProfile = {
        ...existingProfile,
        email,
        role: "admin",
        status: "active",
        accountIds: [],
      };
      await setDoc(profileRef, upgradedProfile);
      return upgradedProfile;
    }
    if (
      existingProfile.role === "admin" &&
      !isTrustedAdminProfile(existingProfile)
    ) {
      return {
        ...existingProfile,
        role: "customer",
        status: "pending",
        accountIds: [],
      };
    }
    if (
      existingProfile.status === "active" ||
      existingProfile.role !== "customer" ||
      existingProfile.accountIds.length > 0
    ) {
      return existingProfile;
    }
  }

  if (!isBootstrapAdmin && email) {
    const inviteRef = doc(db, "accessInvites", email);
    const inviteSnapshot = await getDoc(inviteRef);
    if (inviteSnapshot.exists()) {
      const invite = inviteSnapshot.data() as AccessInvite;
      const inviteCanBeAccepted =
        invite.status === "ready" ||
        (invite.status === "accepted" && invite.acceptedByUid === user.uid);
      if (inviteCanBeAccepted && invite.email === email) {
        const now = new Date().toISOString();
        const invitedProfile: UserProfile = {
          uid: user.uid,
          email,
          displayName:
            user.displayName ||
            existingProfile?.displayName ||
            email.split("@")[0] ||
            "משתמש",
          role: invite.role,
          accountIds: [invite.accountId],
          status: "active",
          createdAt: existingProfile?.createdAt || now,
        };
        const batch = writeBatch(db);
        batch.set(profileRef, invitedProfile);
        if (invite.status === "ready") {
          batch.update(inviteRef, {
            status: "accepted",
            acceptedAt: now,
            acceptedByUid: user.uid,
            updatedAt: now,
          });
        }
        await batch.commit();
        return invitedProfile;
      }
    }
  }

  if (existingProfile) {
    return existingProfile;
  }

  const defaultAccess = defaultProfileAccess(email);
  const profile: UserProfile = {
    uid: user.uid,
    email,
    displayName: user.displayName || email.split("@")[0] || "משתמש",
    role: defaultAccess.role,
    accountIds: [],
    status: defaultAccess.status,
    createdAt: new Date().toISOString(),
  };

  await setDoc(profileRef, profile);
  return profile;
}

/**
 * How many recent activity entries the app loads. The log only grows, and
 * loading all of it (tens of thousands of entries) held up every screen;
 * the screens show recent activity only.
 */
export const RECENT_ACTIVITY_LIMIT = 300;

function queryFor(
  key: EntityKey,
  profile: UserProfile,
  accountId?: string,
): Query<DocumentData> {
  const { db } = getFirebaseServices();
  const recentOnly = key === "activities" ? [orderBy("createdAt", "desc"), limit(RECENT_ACTIVITY_LIMIT)] : [];
  if (profile.role === "admin" || profile.role === "service") {
    return query(collectionGroup(db, key), ...recentOnly);
  }
  if (!accountId) {
    throw new Error("למשתמש עדיין לא שויך חשבון לקוח.");
  }
  return query(collection(db, "accounts", accountId, key), ...recentOnly);
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
    activities: new Map(),
    profitability: new Map(),
  };
  const unsubscribers: Unsubscribe[] = [];
  const accountIds =
    profile.role === "admin" || profile.role === "service"
      ? [undefined]
      : profile.accountIds;
  const subscriptionKeys = profile.role === "admin"
    ? entityKeys
    : entityKeys.filter((key) => key !== "profitability");
  const readySubscriptions = new Set<string>();
  const expectedSubscriptions = subscriptionKeys.length * accountIds.length;

  if (!accountIds.length) {
    lastSyncedStore = emptyStore();
    onStore(lastSyncedStore);
    return () => undefined;
  }

  const emit = () => {
    if (readySubscriptions.size < expectedSubscriptions) return;
    const next: PlatformStore = {
      tickets: [...buckets.tickets.values()] as Ticket[],
      orders: [...buckets.orders.values()] as Order[],
      tasks: [...buckets.tasks.values()] as Task[],
      machines: [...buckets.machines.values()] as Machine[],
      activities: [...buckets.activities.values()] as Activity[],
      profitability: [...buckets.profitability.values()] as MonthlyProfitability[],
    };
    lastSyncedStore = next;
    entityKeysOf(next).forEach((key) => seenEntityKeys.add(key));
    onStore(next);
  };

  for (const key of subscriptionKeys) {
    for (const accountId of accountIds) {
      const unsubscribe = onSnapshot(
        queryFor(key, profile, accountId),
        (snapshot) => {
          for (const change of snapshot.docChanges()) {
            const mapKey = `${change.doc.ref.parent.parent?.id || "all"}:${change.doc.id}`;
            if (change.type === "removed") {
              buckets[key].delete(mapKey);
            } else {
              const data = change.doc.data() as Entity;
              buckets[key].set(mapKey, key === "orders" ? normalizeOrderRecord(data as Order) : data);
            }
          }
          readySubscriptions.add(`${key}:${accountId || "all"}`);
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

export type AuditEntry = {
  id: string;
  at: string;
  action: "password-set" | "password-user-created" | "user-created" | "user-deleted" | "access-changed";
  actorEmail?: string;
  targetEmail: string;
  before?: { role: string; status: string; accountIds: string[] } | null;
  after?: { role: string; status: string; accountIds: string[] } | null;
};

export async function loadAuditLog(count = 50) {
  const { db } = getFirebaseServices();
  const snapshot = await getDocs(query(collection(db, "auditLog"), orderBy("at", "desc"), limit(count)));
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as AuditEntry);
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
            .map((account) => withCanonicalBlends(account.data() as Customer))
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
          accountMaps.set(accountId, withCanonicalBlends(snapshot.data() as Customer));
          onCustomers([...accountMaps.values()]);
        }
      },
      (error) => onError(error),
    ),
  );
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

function customerInvite(
  customer: Customer,
  email: string,
  createdBy: string,
  createdAt: string,
): AccessInvite {
  return {
    email,
    accountId: customer.id,
    customerName: customer.name,
    role: "customer",
    status: "ready",
    createdAt,
    updatedAt: createdAt,
    createdBy,
    ...(customer.sourceQuoteId ? { sourceQuoteId: customer.sourceQuoteId } : {}),
  };
}

export async function ensureCustomerAccessInvites(customers: Customer[]) {
  const { auth, db } = getFirebaseServices();
  const currentUser = auth.currentUser;
  if (!currentUser) return 0;
  const candidates = customers.filter((customer) =>
    isValidInviteEmail(customer.email),
  );
  if (!candidates.length) return 0;

  const now = new Date().toISOString();
  const batch = writeBatch(db);
  let created = 0;
  for (const customer of candidates) {
    const email = normalizeInviteEmail(customer.email);
    const inviteRef = doc(db, "accessInvites", email);
    const inviteSnapshot = await getDoc(inviteRef);
    if (!inviteSnapshot.exists()) {
      batch.set(
        inviteRef,
        customerInvite(customer, email, currentUser.uid, now),
      );
      created += 1;
      continue;
    }
    const invite = inviteSnapshot.data() as AccessInvite;
    if (invite.accountId !== customer.id) {
      throw new Error("access/email-assigned-to-another-customer");
    }
  }
  if (created) await batch.commit();
  return created;
}

export async function updateUserAccess(
  uid: string,
  role: UserProfile["role"],
  accountIds: string[],
  status: UserProfile["status"],
  serviceDetails?: Pick<UserProfile, "phone" | "serviceRegion" | "skills">,
) {
  const { auth, db } = getFirebaseServices();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("auth/requires-recent-login");
  if (uid === currentUser.uid && (role !== "admin" || status !== "active")) {
    throw new Error("access/cannot-revoke-self");
  }
  if (
    status === "active" &&
    (role === "customer" || role === "multi") &&
    accountIds.length === 0
  ) {
    throw new Error("access/customer-account-required");
  }
  if (role === "admin" && !isBootstrapAdminEmail(currentUser.email)) {
    throw new Error("access/admin-owner-approval-required");
  }
  if (role === "admin" || role === "service") {
    await requireRecentAdminLogin();
  }
  const approvedAt = new Date().toISOString();
  await updateDoc(doc(db, "users", uid), {
    role,
    accountIds: role === "customer" || role === "multi" ? accountIds : [],
    status,
    adminApprovedBy:
      role === "admin" ? normalizeEmail(currentUser.email) : deleteField(),
    adminApprovedAt: role === "admin" ? approvedAt : deleteField(),
    revokedAt: status === "revoked" ? approvedAt : deleteField(),
    revokedBy:
      status === "revoked" ? normalizeEmail(currentUser.email) : deleteField(),
    phone: role === "service" ? serviceDetails?.phone || "" : deleteField(),
    serviceRegion:
      role === "service" ? serviceDetails?.serviceRegion || "" : deleteField(),
    skills: role === "service" ? serviceDetails?.skills || [] : deleteField(),
  });
}

// Runs on the server (functions/index.js): only the Admin SDK can set a
// password on someone else's account.
export async function adminSetUserPassword(email: string, password: string) {
  await requireRecentAdminLogin();
  if (!isValidInviteEmail(email)) throw new Error("access/invalid-email");
  if (passwordSecurityError(password)) throw new Error("auth/weak-password");
  const { app } = getFirebaseServices();
  const setUserPassword = httpsCallable<
    { email: string; password: string },
    { uid: string; created: boolean }
  >(getFunctions(app, "europe-west1"), "setUserPassword");
  try {
    const result = await setUserPassword({ email: normalizeEmail(email), password });
    return result.data;
  } catch (error) {
    // Server errors carry our "auth/…" or "access/…" key as the message;
    // anything else (e.g. the function is not deployed) only has a code.
    const { code, message } = error as { code?: string; message?: string };
    if (message?.includes("/")) throw error;
    throw new Error(code || message || "functions/internal");
  }
}

export async function revokeUserAccess(user: UserProfile) {
  await requireRecentAdminLogin();
  const { auth, db } = getFirebaseServices();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("auth/requires-recent-login");
  if (currentUser.uid === user.uid) throw new Error("access/cannot-revoke-self");
  if (isBootstrapAdminEmail(user.email)) {
    throw new Error("access/cannot-revoke-owner");
  }

  const now = new Date().toISOString();
  const batch = writeBatch(db);
  batch.update(doc(db, "users", user.uid), {
    role: "customer",
    accountIds: [],
    status: "revoked",
    adminApprovedBy: deleteField(),
    adminApprovedAt: deleteField(),
    revokedAt: now,
    revokedBy: normalizeEmail(currentUser.email),
  });

  const email = normalizeInviteEmail(user.email);
  if (isValidInviteEmail(email)) {
    const inviteRef = doc(db, "accessInvites", email);
    const inviteSnapshot = await getDoc(inviteRef);
    if (inviteSnapshot.exists()) {
      batch.update(inviteRef, { status: "revoked", updatedAt: now });
    }
  }
  await batch.commit();
}


const activityEntityNames = {
  tickets: "קריאת שירות",
  orders: "הזמנה",
  tasks: "משימה",
  machines: "מכונה",
  profitability: "דוח רווחיות חודשי",
} as const;

let platformSaveQueue: Promise<void> = Promise.resolve();
// Everything the database has sent this session, so a save never re-creates what was removed elsewhere.
const seenEntityKeys = new Set<string>();

/** A save that some changes could not make; the rest were saved. */
export class PartialSaveError extends Error {
  constructor(readonly failed: string[], readonly cause?: unknown) {
    super(`platform/partial-save:${failed.join(", ")}`);
  }
}

async function persistPlatformStore(next: PlatformStore, actor?: UserProfile) {
  const changes = changedEntities(next, lastSyncedStore, seenEntityKeys);
  if (!changes.length) return;

  const { db } = getFirebaseServices();
  const writeChange = (batch: ReturnType<typeof writeBatch>, { key, entity, action }: (typeof changes)[number]) => {
    const entityRef = doc(db, "accounts", entity.accountId, key, entity.id);
    if (action === "deleted") batch.delete(entityRef);
    else batch.set(entityRef, withoutUndefined(entity));

    if (actor && (actor.role === "admin" || actor.role === "service")) {
      const activityRef = doc(collection(db, "accounts", entity.accountId, "activities"));
      const actionLabel = action === "created" ? "נוצרה" : action === "deleted" ? "נמחקה" : "עודכנה";
      batch.set(activityRef, {
        id: activityRef.id,
        accountId: entity.accountId,
        entityType: key === "profitability" ? "profitability" : key.slice(0, -1),
        entityId: entity.id,
        action,
        summary: `${activityEntityNames[key]} ${actionLabel}`,
        actorUid: actor.uid,
        actorName: actor.displayName || actor.email,
        createdAt: new Date().toISOString(),
      });
    }
  };

  try {
    const batch = writeBatch(db);
    changes.forEach((change) => writeChange(batch, change));
    await batch.commit();
    lastSyncedStore = next;
    return;
  } catch (error) {
    // One rejected change used to fail the whole batch, and since nothing was
    // marked as saved it was sent again with every later save, so nothing
    // could be saved until the page was reloaded. Save each change on its
    // own instead, and report only the ones that failed.
    const failed: string[] = [];
    let lastError: unknown = error;
    for (const change of changes) {
      try {
        const single = writeBatch(db);
        writeChange(single, change);
        await single.commit();
      } catch (changeError) {
        lastError = changeError;
        failed.push(`${activityEntityNames[change.key]} ${change.entity.id}`);
      }
    }
    // Failed changes are not retried on every later save; the live data
    // replaces them on the screen with what the database actually holds.
    lastSyncedStore = next;
    if (failed.length) throw new PartialSaveError(failed, lastError);
  }
}

export function savePlatformStore(next: PlatformStore, actor?: UserProfile) {
  const snapshot: PlatformStore = {
    tickets: next.tickets.map((item) => ({ ...item })),
    orders: next.orders.map((item) => ({ ...item })),
    tasks: next.tasks.map((item) => ({ ...item })),
    machines: next.machines.map((item) => ({ ...item })),
    activities: next.activities.map((item) => ({ ...item })),
    profitability: next.profitability.map((item) => ({ ...item, sales: item.sales.map((line) => ({ ...line })) })),
  };
  platformSaveQueue = platformSaveQueue
    .catch(() => undefined)
    .then(() => persistPlatformStore(snapshot, actor));
  return platformSaveQueue;
}

export function subscribeToSalesWorkspace(
  profile: UserProfile,
  onWorkspace: (workspace: SalesWorkspace) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (
    profile.status !== "active" ||
    profile.role !== "admin"
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

export async function saveCustomer(customer: Customer) {
  const { auth, db } = getFirebaseServices();
  const accountRef = doc(db, "accounts", customer.id);
  const accountSnapshot = await getDoc(accountRef);
  const previousCustomer = accountSnapshot.exists()
    ? (accountSnapshot.data() as Customer)
    : null;
  const previousEmail = normalizeInviteEmail(previousCustomer?.email);
  const nextEmail = normalizeInviteEmail(customer.email);
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  batch.set(accountRef, withoutUndefined({ ...customer, email: nextEmail }), {
    merge: true,
  });

  if (
    previousEmail &&
    previousEmail !== nextEmail &&
    isValidInviteEmail(previousEmail)
  ) {
    const previousInviteRef = doc(db, "accessInvites", previousEmail);
    const previousInviteSnapshot = await getDoc(previousInviteRef);
    if (
      previousInviteSnapshot.exists() &&
      (previousInviteSnapshot.data() as AccessInvite).accountId === customer.id
    ) {
      batch.update(previousInviteRef, { status: "revoked", updatedAt: now });
    }
  }

  if (isValidInviteEmail(nextEmail)) {
    const inviteRef = doc(db, "accessInvites", nextEmail);
    const inviteSnapshot = await getDoc(inviteRef);
    if (!inviteSnapshot.exists()) {
      batch.set(
        inviteRef,
        customerInvite(
          customer,
          nextEmail,
          auth.currentUser?.uid || "system",
          now,
        ),
      );
    } else if ((inviteSnapshot.data() as AccessInvite).accountId !== customer.id) {
      throw new Error("access/email-assigned-to-another-customer");
    }
  }
  await batch.commit();
}

export async function uploadTicketAttachment(
  accountId: string,
  ticketId: string,
  file: File,
) {
  const fileError = ticketFileSecurityError(file);
  if (fileError) throw new Error(fileError);
  const { app } = getFirebaseServices();
  const { getStorage, ref, uploadBytes } = await import(
    "firebase/storage"
  );
  const storage = getStorage(app);
  const uniqueId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const safeName = safeStorageFileName(file.name, uniqueId);
  const storagePath = `accounts/${accountId}/tickets/${ticketId}/${safeName}`;
  const attachmentRef = ref(
    storage,
    storagePath,
  );
  await uploadBytes(attachmentRef, file, { contentType: file.type });
  return {
    name: file.name,
    storagePath,
    type: file.type,
    uploadedAt: new Date().toISOString(),
  };
}

export async function loadTicketAttachment(storagePath: string) {
  const { app } = getFirebaseServices();
  const { getBlob, getStorage, ref } = await import("firebase/storage");
  const storage = getStorage(app);
  const blob = await getBlob(ref(storage, storagePath), MAX_VIDEO_BYTES);
  return URL.createObjectURL(blob);
}

export async function saveLead(lead: Lead) {
  const { db } = getFirebaseServices();
  await setDoc(doc(db, "leads", lead.id), withoutUndefined(lead), {
    merge: true,
  });
}

// Lead statuses past the quote stage; editing a quote must not move them back.
const LEAD_STATUSES_AFTER_QUOTE = new Set(["נסגר", "פיילוט", "לא רלוונטי"]);

export async function saveQuote(quote: Quote) {
  const { db } = getFirebaseServices();
  const leadSnapshot = quote.leadId
    ? await getDoc(doc(db, "leads", quote.leadId))
    : null;
  const leadStatus = leadSnapshot?.exists()
    ? String((leadSnapshot.data() as Lead).status || "")
    : "";
  const batch = writeBatch(db);
  batch.set(doc(db, "quotes", quote.id), withoutUndefined(quote), {
    merge: true,
  });
  if (quote.leadId && leadSnapshot?.exists() && LEAD_STATUSES_AFTER_QUOTE.has(leadStatus)) {
    batch.set(
      doc(db, "leads", quote.leadId),
      { quoteIds: arrayUnion(quote.id), updatedAt: quote.updatedAt },
      { merge: true },
    );
  } else if (quote.leadId && leadSnapshot?.exists()) {
    // A lead that no longer exists is skipped: writing a stub for it would be
    // rejected by the database rules and take the quote save down with it.
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

/**
 * Adds to a customer card the machines of the quote it works from that it
 * does not have yet. Returns how many were added.
 */
export async function addQuoteMachines(customer: Pick<Customer, "id">, quote: Quote) {
  const { db } = getFirebaseServices();
  const existing = (await getDocs(collection(db, "accounts", customer.id, "machines"))).docs.map((item) => item.data() as Machine);
  const missing = machinesMissingForQuote(quote, existing, customer.id, "סניף ראשי", new Date().toISOString());
  if (!missing.length) return 0;
  const batch = writeBatch(db);
  for (const machine of missing) batch.set(doc(db, "accounts", customer.id, "machines", machine.id), withoutUndefined(machine));
  await batch.commit();
  return missing.length;
}

export async function convertQuoteToCustomer(
  quote: Quote,
  lead?: Lead,
  options: { manual?: boolean; existingAccountId?: string } = {},
): Promise<CustomerConversionResult> {
  if (quote.status !== "אושרה" && !options.manual) {
    throw new Error("הקמה אוטומטית מתבצעת רק לאחר אישור הצעה.");
  }

  const { auth, db } = getFirebaseServices();
  // Another version of the same client may already have opened a card; reuse
  // it so a second approval updates that card instead of duplicating it.
  const accountId =
    options.existingAccountId || quote.accountId || accountIdForQuote(quote);
  const accountRef = doc(db, "accounts", accountId);
  const accountSnapshot = await getDoc(accountRef);
  const isNewAccount = !accountSnapshot.exists();
  const now = new Date().toISOString();
  const commercialAgreement = commercialAgreementFromQuote(quote);
  const mainBlend = quote.blends.find((blend) => blend.quantityKg > 0);
  const contractBlends = Array.from(
    new Set(
      quote.blends
        .filter((blend) => blend.quantityKg > 0)
        .map((blend) => blend.name.trim())
        .filter(Boolean),
    ),
  );
  const shouldCreateInvite = quote.status === "אושרה";
  const inviteEmail = shouldCreateInvite
    ? resolveInviteEmail(quote.email, lead?.email)
    : "";

  let existingInvite: AccessInvite | null = null;
  if (inviteEmail) {
    const inviteSnapshot = await getDoc(doc(db, "accessInvites", inviteEmail));
    existingInvite = inviteSnapshot.exists()
      ? (inviteSnapshot.data() as AccessInvite)
      : null;
    if (existingInvite && existingInvite.accountId !== accountId) {
      throw new Error(
        `כתובת המייל ${inviteEmail} כבר משויכת ללקוח אחר. יש לבדוק את כתובת איש הקשר לפני האישור.`,
      );
    }
  }

  const batch = writeBatch(db);

  // A quote that was never approved has no approval month, and Firestore
  // rejects undefined fields, so both writes drop them.
  if (isNewAccount) {
    batch.set(accountRef, withoutUndefined({
      id: accountId,
      name: quote.clientName,
      status: "בהקמה",
      rank: quote.clientRank || "רגיל",
      contactName: quote.contactName || lead?.contactName || "",
      phone: quote.phone || lead?.phone || "",
      email: inviteEmail || quote.email || lead?.email || "",
      city: quote.location || lead?.location || "",
      address: lead?.meetingLocation || "",
      owner: lead?.owner || quote.owner || "",
      monthlyKg: quote.knownKg || mainBlend?.quantityKg || 0,
      contractEnd: "",
      serviceLevel: "",
      contractBlends,
      deliveryDayOfMonth: 1,
      slaResponseHours: 4,
      slaResolutionHours: 24,
      onboardingStatus: "בהקמה",
      notes: [],
      branches: [lead?.location || "סניף ראשי"],
      sourceLeadId: quote.leadId || "",
      sourceQuoteId: quote.id,
      conversionType: options.manual ? "manual" : "approved-quote",
      commercialAgreement,
      createdAt: now,
    }));
  } else {
    batch.set(
      accountRef,
      withoutUndefined({
        name: quote.clientName,
        contactName: quote.contactName || lead?.contactName || "",
        phone: quote.phone || lead?.phone || "",
        email: inviteEmail || quote.email || lead?.email || "",
        sourceLeadId: quote.leadId || "",
        sourceQuoteId: quote.id,
        contractBlends,
        commercialAgreement,
      }),
      { merge: true },
    );
  }
  batch.set(
    doc(db, "quotes", quote.id),
    {
      accountId,
      status: quote.status,
      ...(inviteEmail ? { accessInviteEmail: inviteEmail } : {}),
      ...(quote.status === "אושרה" ? { approvedAt: quote.approvedAt || now } : {}),
      updatedAt: now,
    },
    { merge: true },
  );
  if (inviteEmail && existingInvite?.status !== "accepted") {
    const invite: AccessInvite = {
      email: inviteEmail,
      accountId,
      customerName: quote.clientName,
      role: "customer",
      status: "ready",
      createdAt: existingInvite?.createdAt || now,
      updatedAt: now,
      createdBy: auth.currentUser?.uid || "system",
      sourceQuoteId: quote.id,
    };
    batch.set(doc(db, "accessInvites", inviteEmail), invite);
  }
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
  const existingMachines = isNewAccount
    ? []
    : (await getDocs(collection(db, "accounts", accountId, "machines"))).docs.map((item) => item.data() as Machine);
  for (const machine of machinesMissingForQuote(quote, existingMachines, accountId, lead?.location || "סניף ראשי", now)) {
    batch.set(doc(db, "accounts", accountId, "machines", machine.id), withoutUndefined(machine));
  }
  if (isNewAccount) {
    const monthlyKg = quote.knownKg || mainBlend?.quantityKg || 0;
    const orderId = `order-${accountId}-${now.slice(0, 7)}`;
    batch.set(doc(db, "accounts", accountId, "orders", orderId), {
      id: orderId,
      accountId,
      month: now.slice(0, 7),
      defaultKg: monthlyKg,
      requestedKg: monthlyKg,
      approvedKg: monthlyKg,
      status: NEW_ORDER_STATUS,
      blend: mainBlend?.name || "טרם הוגדרה תערובת",
      note: "",
      createdAt: now,
      updatedAt: now,
    });

    const onboardingTaskId = `task-onboarding-${accountId}`;
    batch.set(doc(db, "accounts", accountId, "tasks", onboardingTaskId), {
      id: onboardingTaskId,
      accountId,
      title: "השלמת קליטת לקוח חדש",
      type: "הקמת לקוח",
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      priority: "גבוהה",
      status: "פתוחה",
      assignedTo: lead?.owner || quote.owner || "מנהל המערכת",
      createdAt: now,
      updatedAt: now,
    });
  }

  await batch.commit();
  return {
    accountId,
    inviteEmail: inviteEmail || undefined,
    inviteStatus: inviteEmail
      ? existingInvite?.status === "accepted"
        ? "already-accepted"
        : "created"
      : "not-created",
  };
}

export type CustomerDeletionResult = {
  deletedRecords: number;
  unlinkedQuotes: number;
  unlinkedLeads: number;
  updatedUsers: number;
};

const ACCOUNT_RECORD_KEYS = ["tickets", "orders", "tasks", "machines", "profitability"] as const;

/**
 * Deletes a customer card and everything stored under it: machines, service
 * calls, coffee orders, tasks, profitability records, tastings, employee
 * coffee sales and the customer's access invites. Quotes and leads are kept but unlinked, so the
 * sales history stays and a later approval opens a fresh card. Users who were
 * linked only to this customer lose access. The activity log is append-only by
 * design and stays in the database without a card to show it.
 */
export async function deleteCustomerAccount(
  accountId: string,
): Promise<CustomerDeletionResult> {
  if (!accountId) throw new Error("לא נבחר לקוח למחיקה.");
  await requireRecentAdminLogin();
  const { db } = getFirebaseServices();

  const [recordSnapshots, tastingSnapshot, shopSnapshot, quotesSnapshot, leadsSnapshot, invitesSnapshot, usersSnapshot] =
    await Promise.all([
      Promise.all(
        ACCOUNT_RECORD_KEYS.map((key) =>
          getDocs(collection(db, "accounts", accountId, key)),
        ),
      ),
      getDocs(query(collection(db, "tastingSessions"), where("accountId", "==", accountId))),
      getDocs(query(collection(db, "shopCampaigns"), where("accountId", "==", accountId))),
      getDocs(query(collection(db, "quotes"), where("accountId", "==", accountId))),
      getDocs(query(collection(db, "leads"), where("convertedAccountId", "==", accountId))),
      getDocs(query(collection(db, "accessInvites"), where("accountId", "==", accountId))),
      getDocs(query(collection(db, "users"), where("accountIds", "array-contains", accountId))),
    ]);
  const tastingResponses = await Promise.all(
    tastingSnapshot.docs.map((session) =>
      getDocs(collection(db, "tastingSessions", session.id, "tastingResponses")),
    ),
  );
  const shopOrders = await Promise.all(
    shopSnapshot.docs.map((campaign) =>
      getDocs(collection(db, "shopCampaigns", campaign.id, "shopOrders")),
    ),
  );

  const now = new Date().toISOString();
  type Write =
    | { kind: "delete"; ref: DocumentReference }
    | { kind: "update"; ref: DocumentReference; data: DocumentData };
  const writes: Write[] = [];
  const remove = (ref: DocumentReference) => writes.push({ kind: "delete", ref });

  recordSnapshots.forEach((snapshot) => snapshot.docs.forEach((item) => remove(item.ref)));
  tastingResponses.forEach((snapshot) => snapshot.docs.forEach((item) => remove(item.ref)));
  tastingSnapshot.docs.forEach((item) => remove(item.ref));
  shopOrders.forEach((snapshot) => snapshot.docs.forEach((item) => remove(item.ref)));
  shopSnapshot.docs.forEach((item) => remove(item.ref));
  invitesSnapshot.docs.forEach((item) => remove(item.ref));
  const deletedRecords = writes.length;

  quotesSnapshot.docs.forEach((item) => {
    const quote = item.data() as Quote;
    writes.push({
      kind: "update",
      ref: item.ref,
      data: {
        accountId: deleteField(),
        accessInviteEmail: deleteField(),
        ...(quote.clientKey === accountId ? { clientKey: deleteField() } : {}),
        updatedAt: now,
      },
    });
  });
  leadsSnapshot.docs.forEach((item) =>
    writes.push({
      kind: "update",
      ref: item.ref,
      data: { convertedAccountId: deleteField(), updatedAt: now },
    }),
  );
  usersSnapshot.docs.forEach((item) => {
    const user = item.data() as UserProfile;
    const remaining = (user.accountIds || []).filter((id) => id !== accountId);
    const loseAccess =
      remaining.length === 0 &&
      (user.role === "customer" || user.role === "multi") &&
      user.status === "active";
    writes.push({
      kind: "update",
      ref: item.ref,
      data: {
        accountIds: remaining,
        ...(loseAccess ? { status: "revoked", revokedAt: now } : {}),
      },
    });
  });

  // The card itself goes last, so a failure part-way leaves it visible and
  // the deletion can simply be run again.
  for (let index = 0; index < writes.length; index += 400) {
    const batch = writeBatch(db);
    writes.slice(index, index + 400).forEach((write) => {
      if (write.kind === "delete") batch.delete(write.ref);
      else batch.update(write.ref, write.data);
    });
    await batch.commit();
  }
  await deleteDoc(doc(db, "accounts", accountId));

  return {
    deletedRecords,
    unlinkedQuotes: quotesSnapshot.size,
    unlinkedLeads: leadsSnapshot.size,
    updatedUsers: usersSnapshot.size,
  };
}

function accountIdForLead(lead: Lead) {
  const readable = lead.company
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 36);
  return `${readable || "customer"}-${lead.id.slice(-6).toLowerCase()}`;
}

export type LeadCustomerStatus = Extract<LeadStatus, "נסגר" | "פיילוט">;

/**
 * A lead marked "נסגר" or "פיילוט" becomes a customer account. When the lead
 * already has a quote, the account is built from it like a quote approval;
 * otherwise from the lead's own details. Running it again only updates the
 * pilot marking, so moving a lead from pilot to closed keeps the same account.
 */
export async function convertLeadToCustomer(
  lead: Lead,
  status: LeadCustomerStatus,
  quote?: Quote,
): Promise<{ accountId: string; created: boolean }> {
  const { db } = getFirebaseServices();
  const now = new Date().toISOString();
  const pilot = status === "פיילוט";
  let accountId = lead.convertedAccountId || quote?.accountId || "";
  let existing = accountId
    ? await getDoc(doc(db, "accounts", accountId))
    : null;
  let created = false;

  if (!existing?.exists()) {
    if (quote) {
      const result = await convertQuoteToCustomer(quote, lead, {
        manual: quote.status !== "אושרה",
        existingAccountId: accountId || undefined,
      });
      accountId = result.accountId;
    } else {
      accountId = accountId || accountIdForLead(lead);
      const batch = writeBatch(db);
      const monthlyKg = Math.max(0, Math.round(lead.monthlyConsumption || 0));
      batch.set(doc(db, "accounts", accountId), withoutUndefined({
        id: accountId,
        name: lead.company.trim() || "לקוח חדש",
        status: "בהקמה",
        rank: "רגיל",
        contactName: lead.contactName || "",
        phone: lead.phone || "",
        email: normalizeInviteEmail(lead.email),
        city: lead.location || "",
        address: lead.meetingLocation || "",
        owner: lead.owner || "",
        monthlyKg,
        contractEnd: "",
        serviceLevel: "",
        contractBlends: [],
        deliveryDayOfMonth: 1,
        slaResponseHours: 4,
        slaResolutionHours: 24,
        onboardingStatus: "בהקמה",
        notes: [],
        branches: [lead.location || "סניף ראשי"],
        sourceLeadId: lead.id,
        conversionType: "manual",
        createdAt: now,
      } satisfies Customer));
      if (monthlyKg > 0) {
        const orderId = `order-${accountId}-${now.slice(0, 7)}`;
        batch.set(doc(db, "accounts", accountId, "orders", orderId), {
          id: orderId,
          accountId,
          month: now.slice(0, 7),
          defaultKg: monthlyKg,
          requestedKg: monthlyKg,
          approvedKg: monthlyKg,
          status: NEW_ORDER_STATUS,
          blend: "טרם הוגדרה תערובת",
          note: "",
          createdAt: now,
          updatedAt: now,
        });
      }
      const onboardingTaskId = `task-onboarding-${accountId}`;
      batch.set(doc(db, "accounts", accountId, "tasks", onboardingTaskId), {
        id: onboardingTaskId,
        accountId,
        title: pilot ? "הקמת לקוח בפיילוט" : "השלמת קליטת לקוח חדש",
        type: "הקמת לקוח",
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        priority: "גבוהה",
        status: "פתוחה",
        assignedTo: lead.owner || "מנהל המערכת",
        createdAt: now,
        updatedAt: now,
      });
      await batch.commit();
    }
    created = true;
    existing = await getDoc(doc(db, "accounts", accountId));
  }

  const account = existing?.data() as Customer | undefined;
  const batch = writeBatch(db);
  batch.set(
    doc(db, "accounts", accountId),
    pilot
      ? {
          pilot: true,
          pilotStartedAt: account?.pilotStartedAt || now,
          // A pilot is already operating: orders and service run as usual.
          ...(account?.status === "בהקמה" || !account?.status ? { status: "פעיל" } : {}),
        }
      : { pilot: false },
    { merge: true },
  );
  // convertQuoteToCustomer marks the lead closed; restore the chosen status.
  batch.set(
    doc(db, "leads", lead.id),
    { status, convertedAccountId: accountId, updatedAt: now },
    { merge: true },
  );
  await batch.commit();
  return { accountId, created };
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
