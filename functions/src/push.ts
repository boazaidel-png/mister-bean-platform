import { createHash } from "node:crypto";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { logger } from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { UserProfile } from "../../lib/platform-types";
import { APP_URL, CALLABLE_REGION, isTrustedAdmin } from "./shared";

export type PushMessage = {
  title: string;
  body: string;
  /** Screen to open: one of the app's views, such as "orders" or "tickets". */
  view?: string;
  /** Notifications with the same tag replace each other on the device. */
  tag?: string;
};

const sha = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 40);

const devicesOf = (uid: string) => getFirestore().collection(`users/${uid}/devices`);

/**
 * Saves this device's push address for the signed-in user. A device belongs
 * to one person at a time: when someone else signs in on it, the address is
 * moved to them, so the previous user's notifications stop arriving there.
 */
export const registerPushToken = onCall({ region: CALLABLE_REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "auth/requires-recent-login");
  const token = request.data?.token;
  if (typeof token !== "string" || token.length < 20 || token.length > 4096) {
    throw new HttpsError("invalid-argument", "push/invalid-token");
  }
  const db = getFirestore();
  const id = sha(token);
  const elsewhere = await db.collectionGroup("devices").where("token", "==", token).get();
  const batch = db.batch();
  for (const device of elsewhere.docs) {
    if (device.ref.parent.parent?.id !== uid) batch.delete(device.ref);
  }
  batch.set(devicesOf(uid).doc(id), {
    token,
    userAgent: String(request.rawRequest.headers["user-agent"] || "").slice(0, 300),
    updatedAt: new Date().toISOString(),
  });
  await batch.commit();
  return { ok: true };
});

/** Stops notifications to this device, used when signing out. */
export const unregisterPushToken = onCall({ region: CALLABLE_REGION }, async (request) => {
  const uid = request.auth?.uid;
  const token = request.data?.token;
  if (!uid || typeof token !== "string") return { ok: true };
  await devicesOf(uid).doc(sha(token)).delete();
  return { ok: true };
});

/** Active users, loaded once per event or job. */
export async function activeUsers() {
  const snapshot = await getFirestore().collection("users").where("status", "==", "active").get();
  return snapshot.docs.map((doc) => doc.data() as UserProfile);
}

export const adminsOf = (users: UserProfile[]) => users.filter(isTrustedAdmin).map((user) => user.uid);
export const serviceOf = (users: UserProfile[]) => users.filter((user) => user.role === "service").map((user) => user.uid);
export const customersOf = (users: UserProfile[], accountId: string) => users
  .filter((user) => (user.role === "customer" || user.role === "multi") && user.accountIds.includes(accountId))
  .map((user) => user.uid);

/**
 * Sends one notification to a group of users, once. `eventKey` names the
 * event (for example "ticket-status:<path>:<status>"); a second call with the
 * same key, such as a retried trigger, sends nothing. The person who caused
 * the event does not get a notification about it, and every device gets the
 * message once even when its user appears in several of the groups.
 * `fresh` is false when the event was already handled.
 */
export async function notifyOnce(eventKey: string, recipients: Iterable<string>, message: PushMessage, actorUid = "") {
  const uids = [...new Set(recipients)].filter((uid) => uid && uid !== actorUid);
  if (!uids.length) return { fresh: true, sent: 0 };

  const db = getFirestore();
  try {
    await db.doc(`pushEvents/${sha(eventKey)}`).create({
      key: eventKey.slice(0, 500),
      at: new Date().toISOString(),
      recipients: uids.length,
      // Lets a Firestore TTL policy clean old records.
      expireAt: new Date(Date.now() + 120 * 86400000),
    });
  } catch (error) {
    if ((error as { code?: number }).code === 6) return { fresh: false, sent: 0 }; // ALREADY_EXISTS: sent before.
    throw error;
  }

  const devices = (await Promise.all(uids.map((uid) => devicesOf(uid).get()))).flatMap((snapshot) => snapshot.docs);
  const byToken = new Map(devices.map((device) => [device.get("token") as string, device.ref]));
  const tokens = [...byToken.keys()];
  if (!tokens.length) return { fresh: true, sent: 0 };

  const link = `${APP_URL}${message.view ? `?view=${encodeURIComponent(message.view)}` : ""}`;
  let sent = 0;
  for (let start = 0; start < tokens.length; start += 500) {
    const chunk = tokens.slice(start, start + 500);
    // Data-only: the site's service worker (public/sw.js) shows it, so it
    // looks the same on every browser and is never shown twice.
    const response = await getMessaging().sendEachForMulticast({
      tokens: chunk,
      data: { title: message.title, body: message.body, link, tag: message.tag || eventKey.slice(0, 120) },
      webpush: { headers: { Urgency: "high", TTL: String(3 * 86400) } },
    });
    sent += response.successCount;
    const stale = response.responses.flatMap((result, index) => {
      const code = result.error?.code || "";
      return code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token"
        ? [byToken.get(chunk[index])!]
        : [];
    });
    if (stale.length) {
      const batch = db.batch();
      stale.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  }
  await db.doc(`pushEvents/${sha(eventKey)}`).update({ sent, devices: tokens.length, sentAt: FieldValue.serverTimestamp() });
  logger.info("push sent", { eventKey, users: uids.length, devices: tokens.length, sent });
  return { fresh: true, sent };
}
