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
  collection,
  collectionGroup,
  doc,
  getDoc,
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
  Task,
  Ticket,
  UserProfile,
} from "./platform-types";

const BOOTSTRAP_ADMIN_EMAILS = new Set([
  "boazaidel@gmail.com",
  "boaz@pacifictrade.co",
]);
const ACCESS_APPROVAL_EMAIL = "boaz@pacifictrade.co";
const ACCESS_APPROVAL_SUBJECT = "בקשת גישה חדשה למערכת מיסטר בין";
const entityKeys = ["tickets", "orders", "tasks", "machines"] as const;
type EntityKey = (typeof entityKeys)[number];
type Entity = Ticket | Order | Task | Machine;

let lastSyncedStore: PlatformStore | null = null;

function emptyStore(): PlatformStore {
  return { tickets: [], orders: [], tasks: [], machines: [] };
}

function normalizeEmail(email?: string | null) {
  return (email || "").trim().toLowerCase();
}

async function queueAccessApprovalEmail(profile: UserProfile) {
  if (profile.status !== "pending") return;

  const { db } = getFirebaseServices();
  const notificationRef = doc(db, "mail", profile.uid);
  const existingNotification = await getDoc(notificationRef);
  if (existingNotification.exists()) return;

  await setDoc(notificationRef, {
    to: [ACCESS_APPROVAL_EMAIL],
    replyTo: profile.email,
    message: {
      subject: ACCESS_APPROVAL_SUBJECT,
      text: [
        "בקשת גישה חדשה התקבלה במערכת מיסטר בין.",
        "",
        `שם: ${profile.displayName}`,
        `אימייל: ${profile.email}`,
        "",
        "הבקשה ממתינה לשיוך לקוח ולהגדרת הרשאה במסך ניהול והרשאות.",
        "https://boazaidel-png.github.io/mister-bean-platform/",
      ].join("\n"),
    },
    request: {
      uid: profile.uid,
      email: profile.email,
      displayName: profile.displayName,
    },
    createdAt: new Date().toISOString(),
  });
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
    await queueAccessApprovalEmail(profile);
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
  await queueAccessApprovalEmail(profile);
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
