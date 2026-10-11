import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { onDocumentWrittenWithAuthContext } from "firebase-functions/v2/firestore";
import { DATABASE_REGION, writeAudit } from "./shared.js";

const accessOf = (data) => data
  ? { role: data.role || "", status: data.status || "", accountIds: data.accountIds || [] }
  : null;

const sameAccess = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/**
 * Every change to who may see what lands in the activity log, and a user whose
 * access is revoked or removed is signed out of all devices right away
 * instead of keeping a valid session until it expires.
 */
export const onUserProfileWritten = onDocumentWrittenWithAuthContext(
  { document: "users/{uid}", region: DATABASE_REGION },
  async (event) => {
    const before = accessOf(event.data?.before.data());
    const after = accessOf(event.data?.after.data());
    if (sameAccess(before, after)) return;

    const uid = event.params.uid;
    const actorUid = event.authType === "system" ? "" : event.authId || "";
    const actor = actorUid && actorUid !== uid
      ? (await getFirestore().doc(`users/${actorUid}`).get()).data()
      : null;
    await writeAudit({
      action: !before ? "user-created" : !after ? "user-deleted" : "access-changed",
      actorUid,
      actorEmail: actor?.email || (actorUid === uid ? "המשתמש עצמו" : "מערכת"),
      targetUid: uid,
      targetEmail: event.data?.after.data()?.email || event.data?.before.data()?.email || "",
      before,
      after,
    });

    const lostAccess = !after || (after.status === "revoked" && before?.status !== "revoked");
    if (lostAccess) {
      await getAuth().revokeRefreshTokens(uid).catch((error) => {
        if (error.code !== "auth/user-not-found") throw error;
      });
    }
  },
);
