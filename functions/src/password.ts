import { getAuth, type UserRecord } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { UserProfile } from "../../lib/platform-types";
import { CALLABLE_REGION, isOwnerEmail, isTrustedAdmin, normalizeEmail, writeAudit } from "./shared";

const RECENT_LOGIN_SECONDS = 4 * 60 * 60;

// Same policy as passwordSecurityError in lib/security.ts.
function passwordIsStrong(password: unknown): password is string {
  return typeof password === "string"
    && password.length >= 12
    && password.length <= 128
    && /\p{L}/u.test(password)
    && /\d/.test(password);
}

/**
 * Lets an approved admin turn on email + password sign-in for a user: sets a
 * new password on an existing account (including Google-only accounts) or
 * creates the account. New accounts start as pending customers, so access is
 * still granted only through the regular permissions screen.
 */
export const setUserPassword = onCall({ region: CALLABLE_REGION }, async (request) => {
  const caller = request.auth;
  if (!caller?.token.email) throw new HttpsError("unauthenticated", "auth/requires-recent-login");
  if (Date.now() / 1000 - caller.token.auth_time > RECENT_LOGIN_SECONDS) {
    throw new HttpsError("unauthenticated", "auth/requires-recent-login");
  }

  const db = getFirestore();
  const callerProfile = (await db.doc(`users/${caller.uid}`).get()).data() as UserProfile | undefined;
  if (!isTrustedAdmin(callerProfile) || normalizeEmail(callerProfile?.email) !== normalizeEmail(caller.token.email)) {
    throw new HttpsError("permission-denied", "access/admin-required");
  }

  const email = normalizeEmail(request.data?.email);
  const password = request.data?.password;
  if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email) || email.length > 254) {
    throw new HttpsError("invalid-argument", "access/invalid-email");
  }
  if (!passwordIsStrong(password)) throw new HttpsError("invalid-argument", "auth/weak-password");

  const auth = getAuth();
  const existing: UserRecord | null = await auth.getUserByEmail(email).catch((error) => {
    if (error.code === "auth/user-not-found") return null;
    throw error;
  });
  const targetProfile = existing
    ? (await db.doc(`users/${existing.uid}`).get()).data() as UserProfile | undefined
    : undefined;

  // Only the owner may change the password of the owner or of another admin.
  if ((isOwnerEmail(email) || targetProfile?.role === "admin") && !isOwnerEmail(caller.token.email)) {
    throw new HttpsError("permission-denied", "access/admin-owner-approval-required");
  }

  const created = !existing;
  const user = existing
    ? await auth.updateUser(existing.uid, { password })
    : await auth.createUser({ email, password });

  if (!targetProfile) {
    await db.doc(`users/${user.uid}`).set({
      uid: user.uid,
      email,
      displayName: user.displayName || email.split("@")[0],
      role: "customer",
      accountIds: [],
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  }

  await writeAudit({
    action: created ? "password-user-created" : "password-set",
    actorUid: caller.uid,
    actorEmail: normalizeEmail(caller.token.email),
    targetUid: user.uid,
    targetEmail: email,
  });
  return { uid: user.uid, created };
});
